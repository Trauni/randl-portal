/**
 * „In Lexware anlegen“ (#365) — das Portal legt den ersten Beleg eines Vorgangs als
 * Entwurf in Lexware an und speichert ihn mit zuordnung = 'api'. Das Buero arbeitet
 * in Lexware daran weiter (Positionen, Preise, Fertigstellen).
 *
 *   art 'angebot': Angebots-Entwurf mit Platzhalter-Position (Bezeichnung des Vorgangs),
 *                  danach metall_vorgang.angebot_beleg_id.
 *   art 'ab':      AB-Entwurf. Hat der Vorgang ein Angebot → AB aus dem Angebot
 *                  (precedingSalesVoucherId, Positionen uebernommen). Bei einer
 *                  Wiederholung (vorlage_vorgang_id) die Positionen der letzten AB der
 *                  Vorlage, ohne Verknuepfung (Platzhalter, falls die Vorlage keine hat).
 *                  Ein neuer Vorgang ohne beides beginnt immer mit einem Angebot
 *                  (Konzept Entscheidung 2) → AB wird abgelehnt.
 *
 * Einleitung: erste Zeile ist immer die Zeile des Vorgangs. Eine geerbte Vorgangszeile
 * (Mehrfachbestellung eines Angebots) wird ersetzt, der restliche Text bleibt.
 * Lexware liefert introduction als reinen Text (Test 16.10.2026, AG0083/AB0104).
 * Betreff: „Angebot · V-26-0012“ bzw. „Auftrag · V-26-0012“ (Lexware: max. 25 Zeichen).
 *
 * Lexware uebernimmt bei precedingSalesVoucherId nichts von selbst, die Anfrage
 * enthaelt deshalb den ganzen Beleg.
 */

const { einleitungZeile, setzeEinleitung } = require('./metallVorgang');
const { belegZeile, bezugZeilen, speichereBeleg, AB_ZAEHLT } = require('./metallSync');

const ABLAUF_TAGE = 30;
const STEUERSATZ = 19;
const EINHEIT = 'Stück';
const BETREFF_MAX = 25; // Lexware title (406 SIZE, Probelauf 16.10.2026)
// Schreibbare Felder einer Position; lineItemAmount rechnet Lexware, optional/alternative
// gibt es nur im Angebot
const POSITION_FELDER = ['type', 'id', 'name', 'description', 'quantity', 'unitName', 'discountPercentage'];

// ── Reine Funktionen ──────────────────────────────────────────────────────────

/**
 * Datum fuer Lexware-Belege: lokaler Tagesbeginn mit Zeitzone, wie Lexware es selbst
 * liefert (2026-10-16T00:00:00.000+02:00). Nur 'YYYY-MM-DD' lehnt Lexware mit 400 ab
 * (Probelauf 16.10.2026).
 */
function belegDatum(d) {
  const zwei = n => String(n).padStart(2, '0');
  const versatz = -d.getTimezoneOffset();
  const vz = versatz >= 0 ? '+' : '-';
  const abs = Math.abs(versatz);
  return `${d.getFullYear()}-${zwei(d.getMonth() + 1)}-${zwei(d.getDate())}T00:00:00.000${vz}${zwei(Math.floor(abs / 60))}:${zwei(abs % 60)}`;
}

// Zu lang (z. B. sehr lange Vorgangsnummer) → nur die Vorgangsnummer
function betreff(typ, vorgang) {
  const t = `${typ === 'quotation' ? 'Angebot' : 'Auftrag'} · ${vorgang.vorgangsnummer}`;
  return t.length <= BETREFF_MAX ? t : vorgang.vorgangsnummer.slice(0, BETREFF_MAX);
}

function vorgangsZeile(vorgang) {
  return einleitungZeile({ vorgangsnummer: vorgang.vorgangsnummer, kundenBestellnr: vorgang.kunden_bestellnr });
}

function platzhalterPosition(vorgang) {
  return {
    type: 'custom', name: vorgang.bezeichnung, quantity: 1, unitName: EINHEIT,
    unitPrice: { currency: 'EUR', netAmount: 0, taxRatePercentage: STEUERSATZ },
  };
}

// Lexware liest je nach taxType nur netAmount oder grossAmount
function preis(unitPrice, taxType) {
  if (!unitPrice) return undefined;
  const betrag = taxType === 'gross' ? { grossAmount: unitPrice.grossAmount } : { netAmount: unitPrice.netAmount };
  return { currency: unitPrice.currency, ...betrag, taxRatePercentage: unitPrice.taxRatePercentage };
}

/** Positionen eines gelesenen Belegs → Positionen fuer einen neuen Beleg */
function uebernimmPositionen(voucher, taxType) {
  return (voucher?.lineItems || []).map(p => {
    const neu = {};
    for (const f of POSITION_FELDER) if (p[f] !== undefined && p[f] !== null) neu[f] = p[f];
    if (p.type !== 'text' && p.unitPrice) neu.unitPrice = preis(p.unitPrice, taxType);
    return neu;
  });
}

function angebotEntwurf({ vorgang, kontaktId, jetzt = new Date() }) {
  const ablauf = new Date(jetzt);
  ablauf.setDate(ablauf.getDate() + ABLAUF_TAGE);
  return {
    voucherDate: belegDatum(jetzt),
    expirationDate: belegDatum(ablauf),
    address: { contactId: kontaktId },
    lineItems: [platzhalterPosition(vorgang)],
    totalPrice: { currency: 'EUR' },
    taxConditions: { taxType: 'net' },
    title: betreff('quotation', vorgang),
    introduction: vorgangsZeile(vorgang),
  };
}

/** quelle: gelesenes Angebot bzw. AB der Vorlage, oder null */
function abEntwurf({ vorgang, kontaktId, quelle = null, jetzt = new Date() }) {
  const taxConditions = quelle?.taxConditions ? { ...quelle.taxConditions } : { taxType: 'net' };
  const positionen = uebernimmPositionen(quelle, taxConditions.taxType);
  const p = {
    voucherDate: belegDatum(jetzt),
    address: { contactId: kontaktId },
    lineItems: positionen.length ? positionen : [platzhalterPosition(vorgang)],
    totalPrice: { currency: quelle?.totalPrice?.currency || 'EUR' },
    taxConditions,
    title: betreff('orderconfirmation', vorgang),
    introduction: setzeEinleitung(quelle?.introduction, vorgangsZeile(vorgang)),
  };
  if (quelle?.paymentConditions) p.paymentConditions = { ...quelle.paymentConditions };
  // Pflicht bei der AB (406 ohne, Probelauf 16.10.2026). Das Angebot hat keine; das
  // Lieferdatum traegt das Buero in Lexware ein.
  p.shippingConditions = quelle?.shippingConditions ? { ...quelle.shippingConditions } : { shippingType: 'none' };
  return p;
}

// ── Datenbank ─────────────────────────────────────────────────────────────────

function fehler(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

async function ladeVorgang(pool, vorgangId) {
  const [[v]] = await pool.execute(
    `SELECT v.*, k.lexware_kontakt_id FROM metall_vorgang v
     JOIN metall_kunde k ON k.id = v.kunde_id WHERE v.id = ?`,
    [vorgangId]
  );
  if (!v) throw fehler(404, 'Vorgang nicht gefunden');
  if (v.abgebrochen_am) throw fehler(400, 'Vorgang ist abgebrochen');
  return v;
}

/** Vorlage fuer die AB: { voucher, vorgaenger } oder null */
async function ladeQuelle({ pool, lexware }, v) {
  if (v.angebot_beleg_id) {
    const [[an]] = await pool.execute('SELECT lexware_id, belegnummer FROM metall_beleg WHERE id = ?', [v.angebot_beleg_id]);
    if (!an) throw fehler(409, 'Angebot des Vorgangs nicht gefunden');
    // Status direkt aus Lexware, nicht aus der DB: die kennt ein eben fertiggestelltes
    // Angebot erst nach dem naechsten Sync. Entwuerfe lassen sich nicht weiterfuehren.
    const voucher = await lexware.getVoucher('quotation', an.lexware_id);
    if (voucher.voucherStatus === 'draft') {
      throw fehler(409, `Angebot${an.belegnummer ? ` ${an.belegnummer}` : ''} ist noch ein Entwurf – erst in Lexware fertigstellen`);
    }
    return { voucher, vorgaenger: an.lexware_id };
  }
  if (v.vorlage_vorgang_id) {
    const [[ab]] = await pool.execute(
      `SELECT a.lexware_id FROM metall_beleg a WHERE a.vorgang_id = ? AND ${AB_ZAEHLT}
       ORDER BY a.belegdatum DESC, a.id DESC LIMIT 1`,
      [v.vorlage_vorgang_id]
    );
    if (ab) return { voucher: await lexware.getVoucher('orderconfirmation', ab.lexware_id), vorgaenger: null };
  }
  return null;
}

/**
 * Was angelegt wuerde, ohne zu schreiben: { typ, payload, vorgaenger }.
 * Liest nur (Vorgang, ggf. Angebot/Vorlage aus Lexware).
 */
async function planeEntwurf(deps, vorgangId, { art, jetzt = new Date() }) {
  if (!['angebot', 'ab'].includes(art)) throw fehler(400, "art muss 'angebot' oder 'ab' sein");
  const { pool } = deps;
  const v = await ladeVorgang(pool, vorgangId);

  if (art === 'angebot') {
    if (v.angebot_beleg_id) throw fehler(409, 'Vorgang hat schon ein Angebot');
    return { vorgang: v, typ: 'quotation', payload: angebotEntwurf({ vorgang: v, kontaktId: v.lexware_kontakt_id, jetzt }), vorgaenger: null };
  }

  const [[ab]] = await pool.execute(`SELECT a.belegnummer FROM metall_beleg a WHERE a.vorgang_id = ? AND ${AB_ZAEHLT} LIMIT 1`, [v.id]);
  if (ab) throw fehler(409, `Vorgang hat schon eine AB (${ab.belegnummer || 'Entwurf'})`);
  if (!v.angebot_beleg_id && !v.vorlage_vorgang_id) {
    throw fehler(409, 'Neuer Vorgang: zuerst ein Angebot anlegen, die AB entsteht daraus');
  }
  const quelle = await ladeQuelle(deps, v);
  return {
    vorgang: v,
    typ: 'orderconfirmation',
    payload: abEntwurf({ vorgang: v, kontaktId: v.lexware_kontakt_id, quelle: quelle?.voucher, jetzt }),
    vorgaenger: quelle?.vorgaenger || null,
  };
}

// Doppelklick im Buero: pro Vorgang nur ein Anlegen gleichzeitig (eine PM2-Instanz)
const inArbeit = new Set();

/**
 * Entwurf in Lexware anlegen und als Beleg des Vorgangs speichern.
 * deps: { pool, lexware }. Ergebnis: Kurzinfo zum neuen Beleg.
 */
async function inLexwareAnlegen(deps, vorgangId, { art, employeeId = null, jetzt = new Date() }) {
  const schluessel = String(vorgangId);
  if (inArbeit.has(schluessel)) throw fehler(409, 'Für diesen Vorgang wird gerade ein Beleg angelegt');
  inArbeit.add(schluessel);
  try {
    const { pool, lexware } = deps;
    const { vorgang, typ, payload, vorgaenger } = await planeEntwurf(deps, vorgangId, { art, jetzt });

    const neu = await lexware.createVoucher(typ, payload, { vorgaenger });
    // Ganz lesen: Nummer/Status/relatedVouchers wie beim Sync. Das Aenderungsdatum stammt
    // hier aus dem Einzelabruf; der naechste Sync liest den Beleg deshalb einmal neu.
    const voucher = await lexware.getVoucher(typ, neu.id);
    const zeile = belegZeile(voucher, typ);
    zeile.lexware_kontakt_id = zeile.lexware_kontakt_id || vorgang.lexware_kontakt_id;
    const { id } = await speichereBeleg(pool, zeile, bezugZeilen(voucher));

    await pool.execute(
      `UPDATE metall_beleg SET zuordnung = 'api', vom_portal_angelegt = 1, vorgang_id = ?,
         vorschlag_vorgang_id = NULL, zugeordnet_von = ?, zugeordnet_am = NOW()
       WHERE id = ?`,
      [typ === 'quotation' ? null : vorgang.id, employeeId, id]
    );
    if (typ === 'quotation') {
      await pool.execute('UPDATE metall_vorgang SET angebot_beleg_id = ? WHERE id = ?', [id, vorgang.id]);
    }
    return {
      beleg_id: id, lexware_id: neu.id, belegart: typ, belegnummer: zeile.belegnummer,
      belegstatus: zeile.belegstatus, verknuepft_mit: vorgaenger, title: voucher.title, introduction: voucher.introduction,
    };
  } finally {
    inArbeit.delete(schluessel);
  }
}

module.exports = {
  belegDatum, betreff, platzhalterPosition, uebernimmPositionen, angebotEntwurf, abEntwurf,
  planeEntwurf, inLexwareAnlegen,
};

/*
 * CLI (im Portal-Ordner, liest die .env):
 *   node src/services/metallAnlegen.js <vorgangsnummer> angebot|ab          nur zeigen, was angelegt wuerde
 *   node src/services/metallAnlegen.js <vorgangsnummer> angebot|ab --jetzt  Entwurf in Lexware anlegen
 */
if (require.main === module) {
  require('dotenv').config();
  const [, , nummer, art, flag] = process.argv;
  (async () => {
    const deps = { pool: require('../db').getPool(), lexware: require('./lexware') };
    try {
      if (!nummer || !['angebot', 'ab'].includes(art)) {
        console.log('Aufruf: <vorgangsnummer> angebot|ab [--jetzt]');
        process.exit(1);
      }
      const [[v]] = await deps.pool.execute('SELECT id FROM metall_vorgang WHERE vorgangsnummer = ?', [nummer]);
      if (!v) throw new Error(`Vorgang ${nummer} nicht gefunden`);
      if (flag === '--jetzt') {
        console.log(JSON.stringify(await inLexwareAnlegen(deps, v.id, { art }), null, 2));
      } else {
        const plan = await planeEntwurf(deps, v.id, { art });
        console.log(`Probe – nichts angelegt. ${plan.typ}${plan.vorgaenger ? ` aus ${plan.vorgaenger}` : ''}:`);
        console.log(JSON.stringify({
          ...plan.payload,
          lineItems: plan.payload.lineItems.map(p => ({ type: p.type, name: p.name, felder: Object.keys(p).join('|') })),
        }, null, 2));
      }
      process.exit(0);
    } catch (err) {
      console.error(err.message);
      process.exit(1);
    }
  })();
}
