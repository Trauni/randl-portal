/**
 * Vorgangsdetail Metallarbeiten (#368): laden, Fertigung setzen, Beleg loesen, abbrechen;
 * „Jetzt abgleichen“ (#386).
 *
 * Fertigung ist der einzige Schritt, den das Portal pflegt (Werkstatt), drei Stufen:
 *   geplant (beide NULL) → in_arbeit (fertigung_begonnen_am) → fertig (fertigung_am).
 * Alles andere ergibt sich aus den Lexware-Belegen (metallAuftraege.statusleiste).
 *
 * Beleg loesen: Der Beleg geht zurueck nach „Belege zuordnen“ (zuordnung 'offen') und merkt
 * sich den Vorgang in gesperrt_vorgang_id – der Sync haengt ihn dort nicht wieder an.
 */

const { baueKette, berechneStatus, statusleiste, fertigungsStufe, zaehlt } = require('./metallAuftraege');

const STUFEN = ['geplant', 'in_arbeit', 'fertig'];
const GRUND_MAX = 255; // metall_vorgang.abbruch_grund

function fehler(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

const idOder404 = (wert, was) => {
  const n = Number(wert);
  if (!Number.isInteger(n) || n <= 0) throw fehler(404, `${was} nicht gefunden`);
  return n;
};

async function ladeVorgang(pool, id) {
  const [[v]] = await pool.execute(
    `SELECT v.*, k.name AS kunde_name, k.kdnr, k.lexware_kontakt_id,
            vl.vorgangsnummer AS vorlage_nr, ev.full_name AS erstellt_von_name, fv.full_name AS fertigung_von_name
     FROM metall_vorgang v
     JOIN metall_kunde k ON k.id = v.kunde_id
     LEFT JOIN metall_vorgang vl ON vl.id = v.vorlage_vorgang_id
     LEFT JOIN employees ev ON ev.id = v.erstellt_von
     LEFT JOIN employees fv ON fv.id = v.fertigung_von
     WHERE v.id = ?`,
    [idOder404(id, 'Vorgang')]
  );
  if (!v) throw fehler(404, 'Vorgang nicht gefunden');
  return v;
}

/**
 * Alles fuer die Detailseite. Belege: auch stornierte/archivierte (Feld zaehlt = false),
 * damit das Buero sieht, was in Lexware passiert ist; Kette und Status nur aus zaehlenden.
 */
async function ladeDetail(pool, id) {
  const v = await ladeVorgang(pool, id);
  const [belege] = await pool.execute(
    `SELECT id, lexware_id, belegart, belegnummer, belegstatus, archiviert, belegdatum, betrag_netto, betrag_brutto,
            zuordnung, vom_portal_angelegt, lexware_geaendert_am
     FROM metall_beleg WHERE vorgang_id = ? OR id = ?
     ORDER BY FIELD(belegart, 'quotation', 'orderconfirmation', 'deliverynote', 'invoice'), belegdatum, id`,
    [v.id, v.angebot_beleg_id || 0]
  );
  const angebot = belege.find(b => b.id === v.angebot_beleg_id);
  const eigene = belege.filter(b => b.id !== v.angebot_beleg_id && b.belegart !== 'quotation');
  const kette = baueKette(angebot, eigene);

  // Angebot mehrfach bestellt: alle Vorgaenge mit demselben Angebot (inkl. diesem)
  let angebotVorgaenge = [];
  if (v.angebot_beleg_id) {
    [angebotVorgaenge] = await pool.execute(
      'SELECT id, vorgangsnummer, abgebrochen_am FROM metall_vorgang WHERE angebot_beleg_id = ? ORDER BY id',
      [v.angebot_beleg_id]
    );
  }
  const [nachbestellungen] = await pool.execute(
    'SELECT id, vorgangsnummer, erstellt_am FROM metall_vorgang WHERE vorlage_vorgang_id = ? ORDER BY id', [v.id]
  );
  const [[{ vorschlaege }]] = await pool.execute(
    "SELECT COUNT(*) AS vorschlaege FROM metall_beleg WHERE zuordnung = 'offen' AND vorschlag_vorgang_id = ?", [v.id]
  );

  // Online-Annahmen aus dem Kundenportal (#376), neueste zuerst
  const [annahmen] = await pool.execute(
    `SELECT id, angebot_belegnummer, angebot_betrag_brutto, angebot_pdf_sha256 IS NOT NULL AS mit_pruefsumme,
            kunden_bestellnr, angenommen_am
     FROM metall_annahme WHERE vorgang_id = ? ORDER BY angenommen_am DESC`,
    [v.id]
  );

  const ab = kette.AB[kette.AB.length - 1];
  return {
    ...v,
    fertigung: fertigungsStufe(v),
    kette,
    status: berechneStatus(v, kette),
    statusleiste: statusleiste(v, kette),
    belege: belege.map(b => ({ ...b, zaehlt: zaehlt(b), ist_angebot: b.id === v.angebot_beleg_id })),
    angebot_nr: angebot ? angebot.belegnummer : null,
    angebot_status: angebot ? angebot.belegstatus : null,
    ab_nr: ab ? (ab.nr || 'Entwurf') : null,
    angebot_vorgaenge: angebotVorgaenge,
    nachbestellungen,
    vorschlaege: Number(vorschlaege),
    annahmen: annahmen.map(a => ({ ...a, mit_pruefsumme: !!a.mit_pruefsumme })),
  };
}

/**
 * Fertigung setzen. Nur fuer laufende Vorgaenge mit Auftragsbestaetigung (Entwurf genuegt).
 * Zurueckstufen ist erlaubt (Fehlklick); beim Hochstufen bleibt ein schon gesetzter Beginn stehen.
 */
async function setzeFertigung(pool, id, stufe, { employeeId = null } = {}) {
  if (!STUFEN.includes(stufe)) throw fehler(400, `Unbekannte Fertigungsstufe: ${stufe}`);
  const v = await ladeVorgang(pool, id);
  if (v.abgebrochen_am) throw fehler(409, 'Der Vorgang ist abgebrochen');
  const [[{ ab }]] = await pool.execute(
    `SELECT COUNT(*) AS ab FROM metall_beleg
     WHERE vorgang_id = ? AND belegart = 'orderconfirmation' AND archiviert = 0 AND belegstatus <> 'voided'`,
    [v.id]
  );
  if (!Number(ab) && stufe !== 'geplant') throw fehler(409, 'Fertigung erst nach der Auftragsbestätigung');

  const set = {
    geplant: 'fertigung_begonnen_am = NULL, fertigung_am = NULL',
    in_arbeit: 'fertigung_begonnen_am = COALESCE(fertigung_begonnen_am, NOW()), fertigung_am = NULL',
    fertig: 'fertigung_begonnen_am = COALESCE(fertigung_begonnen_am, NOW()), fertigung_am = COALESCE(fertigung_am, NOW())',
  }[stufe];
  await pool.execute(`UPDATE metall_vorgang SET ${set}, fertigung_von = ? WHERE id = ?`, [employeeId, v.id]);
  return ladeDetail(pool, v.id);
}

/**
 * Beleg vom Vorgang loesen (Fehlzuordnung). AB/LS/RE: vorgang_id weg. Angebot: vom Vorgang
 * abhaengen; der Beleg geht nur dann nach „Belege zuordnen“, wenn kein anderer Vorgang ihn nutzt.
 */
async function loeseBeleg(pool, vorgangId, belegId, { employeeId = null } = {}) {
  const v = await ladeVorgang(pool, vorgangId);
  const [[b]] = await pool.execute('SELECT id, belegart, belegnummer, vorgang_id FROM metall_beleg WHERE id = ?',
    [idOder404(belegId, 'Beleg')]);
  if (!b) throw fehler(404, 'Beleg nicht gefunden');

  const zurueck = `UPDATE metall_beleg SET zuordnung = 'offen', vorgang_id = NULL, vorschlag_vorgang_id = NULL,
       gesperrt_vorgang_id = ?, zugeordnet_von = ?, zugeordnet_am = NOW() WHERE id = ?`;

  if (b.id === v.angebot_beleg_id) {
    await pool.execute('UPDATE metall_vorgang SET angebot_beleg_id = NULL WHERE id = ? AND angebot_beleg_id = ?', [v.id, b.id]);
    const [[{ andere }]] = await pool.execute(
      'SELECT COUNT(*) AS andere FROM metall_vorgang WHERE angebot_beleg_id = ? AND id <> ?', [b.id, v.id]
    );
    if (!Number(andere)) await pool.execute(zurueck, [v.id, employeeId, b.id]);
    return { geloest: b.belegnummer, angebot: true, zurueck_in_eingang: !Number(andere) };
  }
  if (b.vorgang_id !== v.id) throw fehler(409, 'Der Beleg gehört nicht (mehr) zu diesem Vorgang');
  const [res] = await pool.execute(`${zurueck} AND vorgang_id = ?`, [v.id, employeeId, b.id, v.id]);
  if (!res.affectedRows) throw fehler(409, 'Der Beleg wurde inzwischen geändert');
  return { geloest: b.belegnummer, angebot: false, zurueck_in_eingang: true };
}

/** Vorgang abbrechen (mit Grund) oder fortsetzen. Belege bleiben zugeordnet. */
async function brecheAb(pool, id, grund) {
  const g = String(grund ?? '').replace(/\s+/g, ' ').trim();
  if (!g) throw fehler(400, 'Bitte einen Grund angeben');
  if (g.length > GRUND_MAX) throw fehler(400, `Grund ist zu lang (max. ${GRUND_MAX} Zeichen)`);
  const v = await ladeVorgang(pool, id);
  if (v.abgebrochen_am) throw fehler(409, 'Der Vorgang ist schon abgebrochen');
  await pool.execute('UPDATE metall_vorgang SET abgebrochen_am = NOW(), abbruch_grund = ? WHERE id = ?', [g, v.id]);
  return ladeDetail(pool, v.id);
}

async function setzeFort(pool, id) {
  const v = await ladeVorgang(pool, id);
  if (!v.abgebrochen_am) throw fehler(409, 'Der Vorgang läuft schon');
  await pool.execute('UPDATE metall_vorgang SET abgebrochen_am = NULL, abbruch_grund = NULL WHERE id = ?', [v.id]);
  return ladeDetail(pool, v.id);
}

/**
 * „Jetzt abgleichen“ (#386): Belege des Kunden sofort aus Lexware holen, dann das Detail neu laden.
 * sync: (kundeId) => Zaehler von syncKunde oder { uebersprungen: true } (metallSync.syncEinKunde).
 * Ergebnis: { abgleich, detail }; laeuft gerade ein Abgleich → 409.
 */
async function gleicheAb(pool, id, sync) {
  const v = await ladeVorgang(pool, id);
  const abgleich = await sync(v.kunde_id);
  if (abgleich.uebersprungen) throw fehler(409, 'Es läuft gerade ein Abgleich – bitte in einer Minute noch einmal versuchen');
  return { abgleich, detail: await ladeDetail(pool, v.id) };
}

module.exports = { ladeDetail, setzeFertigung, loeseBeleg, brecheAb, setzeFort, gleicheAb, STUFEN };
