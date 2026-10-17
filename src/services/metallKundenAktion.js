/**
 * Aktionen des Kunden im Kundenportal (#376): neue Anfrage, Nachbestellung, Online-Annahme.
 * Aufruf nur ueber den internen Listener (routes/internal/metall.js); das Kundenportal hat
 * vorher Anmeldung und Metall-Freigabe geprueft, der Kunde kommt ueber seine Lexware-ID.
 *
 * Entscheidungen (#361, #376, 16./17.10.2026):
 *   - Anfrage = Vorgang: jede Anfrage/Nachbestellung wird sofort ein Vorgang mit Nummer
 *     (herkunft 'anfrage' bzw. 'nachbestellung'), Luecken in der Nummernfolge sind in Ordnung.
 *   - Hoechstens 5 Anfragen/Nachbestellungen pro Tag und Konto, danach „Bitte kontaktieren Sie uns“.
 *   - Menge, Wunschtermin und Lieferart landen als Text in der Nachricht im Eingang.
 *   - Dateien des Kunden: metallDatei.speichere mit quelle 'kunde' (fuer den Kunden sichtbar).
 *   - Annahme: gehoert zum Vorgang des Angebots, solange er keine AB hat; hat er schon eine AB
 *     (Angebot wird erneut bestellt), entsteht ein neuer Vorgang mit herkunft 'annahme'.
 *     Ein zweites Annehmen ohne AB → 409. Keine Ruecknahme online.
 *   - Protokoll (metall_annahme, nur INSERT): Zeit, Konto, KdNr, Belegnummer, Lexware-Version,
 *     Bruttobetrag, SHA-256 des Angebots-PDFs (aus Lexware), IP, Browser.
 * Jede Aktion schreibt eine Zeile in den Eingang (#371); die Mail ans Sammelpostfach
 * verschickt das Kundenportal und meldet das Ergebnis ueber /eingang/:id/mail.
 */

const crypto = require('crypto');
const { legeVorgangAn, normalisiereBestellnr } = require('./metallVorgang');
const dateien = require('./metallDatei');
const eingang = require('./metallEingang');

const MAX_PRO_TAG = 5;
const NUMMER_RE = /^V-\d{2}-\d{4,}$/;
const LIEFERART = { lieferung: 'Lieferung an Rechnungsadresse', abholung: 'Abholung in Obing', andere: 'Andere Lieferadresse (siehe Beschreibung)' };
const ANNEHMBAR = ['open', 'accepted'];

function fehler(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

const text = (wert, max, feld, { einzeilig = true } = {}) => {
  if (wert == null) return null;
  let s = String(wert);
  s = einzeilig ? s.replace(/\s+/g, ' ').trim() : s.replace(/\r\n?/g, '\n').trim();
  if (!s) return null;
  if (s.length > max) throw fehler(400, `${feld} ist zu lang (max. ${max} Zeichen)`);
  return s;
};

function bestellnr(wert) {
  try { return normalisiereBestellnr(wert); } catch (e) { throw fehler(400, e.message); }
}

/** Konto-Angaben aus dem Kundenportal (fuer Eingang und Protokoll) */
function pruefeKonto(k) {
  const konto = k || {};
  const kontoId = text(konto.konto_id, 64, 'Konto');
  if (!kontoId) throw fehler(400, 'Konto fehlt');
  return {
    kontoId,
    kdnr: text(konto.kdnr, 50, 'Kundennummer'),
    name: text(konto.name, 255, 'Name'),
    email: text(konto.email, 255, 'E-Mail'),
  };
}

/**
 * Formular „Neue Anfrage“ / „Nachbestellen“ pruefen.
 * body: { art: 'anfrage'|'nachbestellung', bezeichnung, kunden_bestellnr?, vorlage_nr? (Pflicht bei
 *         Nachbestellung), menge?, wunschtermin? (JJJJ-MM-TT), lieferart?, beschreibung? }
 */
function pruefeAnfrage(body) {
  const b = body || {};
  const art = String(b.art || '');
  if (!['anfrage', 'nachbestellung'].includes(art)) throw fehler(400, 'Unbekannte Art');
  const bezeichnung = text(b.bezeichnung, 255, 'Bezeichnung');
  if (!bezeichnung) throw fehler(400, 'Bitte eine Bezeichnung angeben');
  let vorlageNr = null;
  if (art === 'nachbestellung') {
    vorlageNr = String(b.vorlage_nr || '').trim();
    if (!NUMMER_RE.test(vorlageNr)) throw fehler(400, 'Bitte den früheren Auftrag wählen');
  }
  let wunschtermin = null;
  if (b.wunschtermin) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(b.wunschtermin));
    if (!m) throw fehler(400, 'Wunschtermin ist ungültig');
    wunschtermin = `${m[3]}.${m[2]}.${m[1]}`;
  }
  const lieferart = b.lieferart ? LIEFERART[String(b.lieferart)] : null;
  if (b.lieferart && !lieferart) throw fehler(400, 'Unbekannte Lieferart');
  return {
    art,
    bezeichnung,
    kundenBestellnr: bestellnr(b.kunden_bestellnr),
    vorlageNr,
    menge: text(b.menge, 100, 'Menge'),
    wunschtermin,
    lieferart,
    beschreibung: text(b.beschreibung, 4000, 'Beschreibung', { einzeilig: false }),
  };
}

/** Text fuer den Eingang (das Buero uebernimmt ihn in Lexware) */
function anfrageText(a, { vorlageBez, dateienAnzahl = 0 } = {}) {
  const zeilen = [];
  if (a.art === 'nachbestellung') zeilen.push(`Nachbestellung von ${a.vorlageNr}${vorlageBez ? ` (${vorlageBez})` : ''}`);
  if (a.menge) zeilen.push(`Menge: ${a.menge}`);
  if (a.wunschtermin) zeilen.push(`Wunschtermin: ${a.wunschtermin}`);
  if (a.lieferart) zeilen.push(`Lieferung: ${a.lieferart}`);
  if (dateienAnzahl) zeilen.push(`Dateien: ${dateienAnzahl}`);
  if (a.beschreibung) zeilen.push('', a.beschreibung);
  return zeilen.join('\n').trim() || null;
}

async function ladeKunde(pool, lexwareId) {
  if (!lexwareId || typeof lexwareId !== 'string' || lexwareId.length > 64) throw fehler(404, 'Kunde nicht gefunden');
  const [[kunde]] = await pool.execute('SELECT id, name, kdnr FROM metall_kunde WHERE lexware_kontakt_id = ? AND aktiv = 1', [lexwareId]);
  if (!kunde) throw fehler(404, 'Kunde nicht gefunden');
  return kunde;
}

/** Hoechstens 5 Anfragen/Nachbestellungen pro Tag und Konto */
async function pruefeTageslimit(pool, kontoId) {
  const [[{ n }]] = await pool.execute(
    `SELECT COUNT(*) AS n FROM metall_eingang
     WHERE kunden_konto_id = ? AND art IN ('anfrage', 'nachbestellung') AND erstellt_am > NOW() - INTERVAL 1 DAY`,
    [kontoId]
  );
  if (Number(n) >= MAX_PRO_TAG) {
    throw fehler(429, `Sie haben heute bereits ${MAX_PRO_TAG} Anfragen gestellt. Bitte kontaktieren Sie uns telefonisch oder per E-Mail.`);
  }
}

/**
 * Neue Anfrage oder Nachbestellung: Vorgang anlegen, Dateien speichern, Eingang melden.
 * files: von multer (in METALL_UPLOAD_DIR/.tmp), werden immer aufgeraeumt.
 * Ergebnis: { vorgangsnummer, eingang_id, art, bezeichnung, nachricht, dateien: { gespeichert, abgelehnt } }
 */
async function anfrage(pool, lexwareId, body, files = [], konto) {
  try {
    const k = pruefeKonto(konto);
    const a = pruefeAnfrage(body);
    const kunde = await ladeKunde(pool, lexwareId);
    await pruefeTageslimit(pool, k.kontoId);

    let vorlage = null;
    if (a.vorlageNr) {
      [[vorlage]] = await pool.execute('SELECT id, bezeichnung FROM metall_vorgang WHERE vorgangsnummer = ? AND kunde_id = ?', [a.vorlageNr, kunde.id]);
      if (!vorlage) throw fehler(404, 'Früherer Auftrag nicht gefunden');
    }

    const v = await legeVorgangAn(pool, {
      kundeId: kunde.id,
      bezeichnung: a.bezeichnung,
      kundenBestellnr: a.kundenBestellnr,
      vorlageVorgangId: vorlage ? vorlage.id : null,
      herkunft: a.art,
    });

    const ergebnisDateien = files.length
      ? await dateien.speichere(pool, v.id, files, { quelle: 'kunde' })
      : { gespeichert: [], abgelehnt: [] };

    const nachricht = anfrageText(a, { vorlageBez: vorlage?.bezeichnung, dateienAnzahl: ergebnisDateien.gespeichert.length });
    const { id } = await eingang.melde(pool, {
      art: a.art,
      vorgangsnummer: v.vorgangsnummer,
      lexware_id: lexwareId,
      kdnr: k.kdnr || kunde.kdnr,
      kunden_konto_id: k.kontoId,
      name: k.name || kunde.name,
      email: k.email,
      nachricht,
    });
    // art/bezeichnung/nachricht fuer die Mail ans Sammelpostfach (verschickt das Kundenportal)
    return { vorgangsnummer: v.vorgangsnummer, eingang_id: id, art: a.art, bezeichnung: a.bezeichnung, nachricht, dateien: ergebnisDateien };
  } finally {
    // speichere raeumt selbst auf; hier nur, falls es gar nicht dazu kam
    await Promise.all(files.map(f => f.path && require('fs/promises').rm(f.path, { force: true }).catch(() => {})));
  }
}

/** Zaehlende AB eines Vorgangs (nicht storniert, nicht archiviert) */
async function hatAb(pool, vorgangId) {
  const [[{ n }]] = await pool.execute(
    `SELECT COUNT(*) AS n FROM metall_beleg
     WHERE vorgang_id = ? AND belegart = 'orderconfirmation' AND belegstatus <> 'voided' AND archiviert = 0`,
    [vorgangId]
  );
  return Number(n) > 0;
}

/**
 * Online-Annahme eines Angebots aus dem Vorgangsdetail.
 * body: { angebot_id, kunden_bestellnr?, nachricht?, ip?, user_agent? }
 * Ergebnis: { vorgangsnummer, neuer_vorgang, annahme_id, eingang_id, angebot_nr, betrag_brutto }
 */
async function annahme({ pool, lexware }, lexwareId, vorgangsnummer, body, konto) {
  const k = pruefeKonto(konto);
  if (!NUMMER_RE.test(String(vorgangsnummer || ''))) throw fehler(404, 'Vorgang nicht gefunden');
  const b = body || {};
  const angebotId = Number(b.angebot_id);
  if (!Number.isInteger(angebotId) || angebotId <= 0) throw fehler(400, 'Angebot fehlt');
  const nr = bestellnr(b.kunden_bestellnr);
  const bemerkung = text(b.nachricht, 1000, 'Nachricht', { einzeilig: false });

  const kunde = await ladeKunde(pool, lexwareId);
  const [[v]] = await pool.execute(
    'SELECT id, vorgangsnummer, bezeichnung, kunden_bestellnr, angebot_beleg_id, abgebrochen_am FROM metall_vorgang WHERE vorgangsnummer = ? AND kunde_id = ?',
    [vorgangsnummer, kunde.id]
  );
  if (!v) throw fehler(404, 'Vorgang nicht gefunden');
  if (v.angebot_beleg_id !== angebotId) throw fehler(404, 'Angebot nicht gefunden');
  if (v.abgebrochen_am) throw fehler(409, 'Dieser Auftrag ist storniert. Bitte kontaktieren Sie uns.');

  const [[an]] = await pool.execute(
    'SELECT id, lexware_id, belegnummer, belegstatus, archiviert, lexware_version, betrag_brutto FROM metall_beleg WHERE id = ? AND belegart = \'quotation\'',
    [angebotId]
  );
  if (!an || an.archiviert || !an.belegnummer || !ANNEHMBAR.includes(an.belegstatus)) {
    throw fehler(409, 'Dieses Angebot kann nicht mehr online angenommen werden. Bitte kontaktieren Sie uns.');
  }

  // Ziel: dieser Vorgang (ohne AB) oder ein neuer (Angebot wird erneut bestellt)
  let ziel = v, neu = false;
  if (await hatAb(pool, v.id)) {
    ziel = await legeVorgangAn(pool, {
      kundeId: kunde.id, bezeichnung: v.bezeichnung, kundenBestellnr: nr, angebotBelegId: an.id, herkunft: 'annahme',
    });
    neu = true;
  } else {
    const [[schon]] = await pool.execute('SELECT id FROM metall_annahme WHERE vorgang_id = ? LIMIT 1', [v.id]);
    if (schon) throw fehler(409, 'Dieses Angebot haben Sie bereits angenommen. Die Auftragsbestätigung folgt.');
    if (nr && !v.kunden_bestellnr) await pool.execute('UPDATE metall_vorgang SET kunden_bestellnr = ? WHERE id = ? AND kunden_bestellnr IS NULL', [nr, v.id]);
  }

  // Pruefsumme des PDFs, das der Kunde gesehen hat; faellt Lexware aus, wird trotzdem protokolliert
  let sha = null;
  try {
    const pdf = await lexware.getVoucherFile('quotation', an.lexware_id);
    sha = crypto.createHash('sha256').update(Buffer.from(pdf)).digest('hex');
  } catch (err) {
    console.error('[Metall-Annahme] PDF fuer Pruefsumme nicht abrufbar:', an.belegnummer, err.message);
  }

  const [res] = await pool.execute(
    `INSERT INTO metall_annahme
       (vorgang_id, angebot_beleg_id, angebot_belegnummer, angebot_lexware_version, angebot_betrag_brutto, angebot_pdf_sha256,
        kunden_konto_id, kdnr, kunden_bestellnr, ip, user_agent)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [ziel.id, an.id, an.belegnummer, an.lexware_version ?? 0, an.betrag_brutto ?? 0, sha,
      k.kontoId, k.kdnr || kunde.kdnr || '', nr || ziel.kunden_bestellnr || null,
      text(b.ip, 45, 'IP'), String(b.user_agent || '').slice(0, 500) || null]
  );

  const betrag = an.betrag_brutto == null ? null : Number(an.betrag_brutto);
  const zeilen = [
    `Angebot ${an.belegnummer}${betrag != null ? ` über ${betrag.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })} brutto` : ''} online angenommen.`,
    neu ? `Erneute Bestellung des Angebots – neuer Vorgang ${ziel.vorgangsnummer} (bisher ${v.vorgangsnummer}).` : null,
    nr ? `Bestellnr. des Kunden: ${nr}` : null,
    sha ? null : 'Hinweis: Prüfsumme des PDFs fehlt (Lexware nicht erreichbar).',
    bemerkung ? `\n${bemerkung}` : null,
  ].filter(Boolean);
  const { id: eingangId } = await eingang.melde(pool, {
    art: 'annahme', vorgangsnummer: ziel.vorgangsnummer, annahme_id: res.insertId, lexware_id: lexwareId,
    kdnr: k.kdnr || kunde.kdnr, kunden_konto_id: k.kontoId, name: k.name || kunde.name, email: k.email,
    nachricht: zeilen.join('\n'),
  });

  return {
    vorgangsnummer: ziel.vorgangsnummer, neuer_vorgang: neu, annahme_id: res.insertId, eingang_id: eingangId,
    angebot_nr: an.belegnummer, betrag_brutto: betrag,
  };
}

module.exports = { MAX_PRO_TAG, LIEFERART, pruefeAnfrage, anfrageText, anfrage, annahme };
