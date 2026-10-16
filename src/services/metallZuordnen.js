/**
 * „Belege zuordnen“ (#370) — Eingang fuer Belege, die der Sync nicht sicher zuordnen
 * konnte (zuordnung = 'offen', siehe metallSync.bestimmeZuordnung).
 *
 * Aktionen (nur fuer offene Belege; parallele Klicks scheitern sauber mit 409):
 *   zuordnen      AB/LS/RE → vorgang_id; Angebot → metall_vorgang.angebot_beleg_id
 *                 (nur, wenn der Vorgang noch keins hat). zuordnung = 'manuell'.
 *   neuer Vorgang aus dem Beleg, ueber metallVorgang.legeVorgangAn; ein Angebot wird
 *                 Grundlage des Vorgangs, sonst wird der Beleg danach zugeordnet.
 *   ignorieren    „Kein Metallauftrag“ → 'ignoriert'; zurueckholen macht das rueckgaengig.
 *
 * Folgebelege (LS/RE an einer eben zugeordneten AB) ordnet der naechste Sync ueber die
 * Verknuepfung zu.
 *
 * Den Grund eines Vorschlags speichert der Sync nicht; vorschlagGrund() leitet ihn aus
 * denselben Daten ab, die der Sync benutzt.
 */

const { leseEinleitung, legeVorgangAn } = require('./metallVorgang');
const { AB_ZAEHLT } = require('./metallSync');

const LISTE_MAX = 200;
const IGNORIERT_TAGE = 30;
const ART = { quotation: 'Angebot', orderconfirmation: 'AB', deliverynote: 'Lieferschein', invoice: 'Rechnung' };

// ── Reine Funktionen ──────────────────────────────────────────────────────────

/**
 * Grund fuer (keinen) Vorschlag. b: Zeile aus ladeOffene() mit
 * { belegart, einleitung_zeile, vorschlag_nr, aus_angebot_nr, vorschlag_angebot_nr }
 * mehrfach: weitere offene ABs aus demselben Angebot in der Liste.
 */
function vorschlagGrund(b, { mehrfach = false } = {}) {
  const gelesen = leseEinleitung(b.einleitung_zeile);
  const nrInEinleitung = gelesen?.vorgangsnummer || null;

  if (b.vorschlag_nr) {
    if (mehrfach && b.aus_angebot_nr) return `${b.aus_angebot_nr} wurde mehrfach in eine AB umgewandelt – welche gehört zu ${b.vorschlag_nr}?`;
    if (nrInEinleitung === b.vorschlag_nr) {
      if (b.aus_angebot_nr) return `Vorgangsnummer aus ${b.aus_angebot_nr} übernommen – gilt bei mehreren Bestellungen nur für die erste`;
      return gelesen.exakt ? 'Vorgangsnummer in der Einleitung' : 'Vorgangsnummer im Einleitungstext (nicht in der ersten Zeile)';
    }
    if (b.aus_angebot_nr && b.vorschlag_angebot_nr === b.aus_angebot_nr) return `ältester offener Vorgang zu ${b.aus_angebot_nr}`;
    return 'einziger offener Vorgang des Kunden ohne AB';
  }

  if (b.belegart === 'quotation') {
    return nrInEinleitung ? `${nrInEinleitung} hat schon ein Angebot oder gehört zu einem anderen Kunden` : 'Angebot ohne Vorgangsnummer – neuer Vorgang?';
  }
  if (b.aus_angebot_nr) return `aus ${b.aus_angebot_nr}, aber kein offener Vorgang dazu ohne AB`;
  if (nrInEinleitung) return `${nrInEinleitung} unbekannt, abgebrochen oder anderer Kunde`;
  return 'weder Verknüpfung noch Vorgangsnummer';
}

/** Liste aufbereiten: Grund, Anzeige-Art, mehrfach umgewandelte Angebote erkennen */
function bereiteAuf(zeilen) {
  const abProAngebot = new Map();
  for (const z of zeilen) {
    if (z.belegart === 'orderconfirmation' && z.aus_angebot_nr) {
      abProAngebot.set(z.aus_angebot_nr, (abProAngebot.get(z.aus_angebot_nr) || 0) + 1);
    }
  }
  return zeilen.map(z => ({
    ...z,
    art: ART[z.belegart] || z.belegart,
    grund: vorschlagGrund(z, { mehrfach: z.belegart === 'orderconfirmation' && abProAngebot.get(z.aus_angebot_nr) > 1 }),
  }));
}

// ── Datenbank ─────────────────────────────────────────────────────────────────

function fehler(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

// Angebot, mit dem ein Beleg laut relatedVouchers verknuepft ist (beide Richtungen)
const AUS_ANGEBOT = `(SELECT q.belegnummer FROM metall_beleg q
   WHERE q.belegart = 'quotation' AND q.id <> b.id AND (
     q.lexware_id IN (SELECT z.bezug_lexware_id FROM metall_beleg_bezug z WHERE z.beleg_id = b.id)
     OR q.id IN (SELECT z.beleg_id FROM metall_beleg_bezug z WHERE z.bezug_lexware_id = b.lexware_id))
   ORDER BY q.id LIMIT 1)`;

const BELEG_SPALTEN = `b.id, b.belegart, b.belegnummer, b.belegstatus, b.archiviert, b.belegdatum,
  b.betrag_netto, b.einleitung_zeile, b.zuordnung, b.zugeordnet_am,
  k.id AS kunde_id, k.name AS kunde_name, k.kdnr`;

async function ladeOffene(pool) {
  const [rows] = await pool.query(
    `SELECT ${BELEG_SPALTEN},
            vs.id AS vorschlag_id, vs.vorgangsnummer AS vorschlag_nr, vs.bezeichnung AS vorschlag_bez,
            vsa.belegnummer AS vorschlag_angebot_nr, ${AUS_ANGEBOT} AS aus_angebot_nr
     FROM metall_beleg b
     LEFT JOIN metall_kunde k ON k.lexware_kontakt_id = b.lexware_kontakt_id
     LEFT JOIN metall_vorgang vs ON vs.id = b.vorschlag_vorgang_id
     LEFT JOIN metall_beleg vsa ON vsa.id = vs.angebot_beleg_id
     WHERE b.zuordnung = 'offen'
     ORDER BY b.belegdatum DESC, b.id DESC LIMIT ${LISTE_MAX}`
  );
  return bereiteAuf(rows);
}

async function zaehleOffene(pool) {
  const [[{ n }]] = await pool.query("SELECT COUNT(*) AS n FROM metall_beleg WHERE zuordnung = 'offen'");
  return Number(n);
}

/** Zuletzt als „Kein Metallauftrag“ markiert (zum Zurueckholen) */
async function ladeIgnorierte(pool) {
  const [rows] = await pool.query(
    `SELECT ${BELEG_SPALTEN} FROM metall_beleg b
     LEFT JOIN metall_kunde k ON k.lexware_kontakt_id = b.lexware_kontakt_id
     WHERE b.zuordnung = 'ignoriert' AND b.zugeordnet_am >= NOW() - INTERVAL ${IGNORIERT_TAGE} DAY
     ORDER BY b.zugeordnet_am DESC LIMIT 50`
  );
  return rows.map(z => ({ ...z, art: ART[z.belegart] || z.belegart }));
}

/** Vorgaenge aller Kunden mit mehr als einer zaehlenden AB (Hinweis „doppelte AB pruefen“) */
async function ladeDoppelteAbAlle(pool) {
  const [rows] = await pool.query(
    `SELECT v.id, v.vorgangsnummer, v.bezeichnung, k.name AS kunde_name, COUNT(*) AS anzahl,
            GROUP_CONCAT(COALESCE(a.belegnummer, 'Entwurf') ORDER BY a.belegdatum, a.id SEPARATOR ', ') AS abs
     FROM metall_vorgang v
     JOIN metall_kunde k ON k.id = v.kunde_id
     JOIN metall_beleg a ON a.vorgang_id = v.id AND ${AB_ZAEHLT}
     WHERE v.abgebrochen_am IS NULL
     GROUP BY v.id, v.vorgangsnummer, v.bezeichnung, k.name HAVING COUNT(*) > 1
     ORDER BY v.id DESC`
  );
  return rows;
}

async function ladeOffenenBeleg(pool, belegId) {
  const [[b]] = await pool.execute(
    `SELECT b.id, b.belegart, b.belegnummer, b.zuordnung, b.lexware_kontakt_id, k.id AS kunde_id, k.aktiv AS kunde_aktiv
     FROM metall_beleg b LEFT JOIN metall_kunde k ON k.lexware_kontakt_id = b.lexware_kontakt_id
     WHERE b.id = ?`,
    [belegId]
  );
  if (!b) throw fehler(404, 'Beleg nicht gefunden');
  if (b.zuordnung !== 'offen') throw fehler(409, `${b.belegnummer || 'Beleg'} ist schon zugeordnet – Liste neu laden`);
  return b;
}

// Bedingtes UPDATE: wer zuerst klickt, gewinnt; der zweite bekommt 409
async function setzeZuordnung(pool, belegId, { zuordnung, vorgangId = null, employeeId = null }) {
  const [res] = await pool.execute(
    `UPDATE metall_beleg SET zuordnung = ?, vorgang_id = ?, vorschlag_vorgang_id = NULL,
       zugeordnet_von = ?, zugeordnet_am = NOW()
     WHERE id = ? AND zuordnung = 'offen'`,
    [zuordnung, vorgangId, employeeId, belegId]
  );
  if (!res.affectedRows) throw fehler(409, 'Beleg wurde inzwischen zugeordnet – Liste neu laden');
}

async function ordneZu(pool, belegId, vorgangId, { employeeId = null } = {}) {
  const b = await ladeOffenenBeleg(pool, belegId);
  const [[v]] = await pool.execute(
    `SELECT v.id, v.vorgangsnummer, v.abgebrochen_am, v.angebot_beleg_id, k.lexware_kontakt_id, an.belegnummer AS angebot_nr
     FROM metall_vorgang v JOIN metall_kunde k ON k.id = v.kunde_id
     LEFT JOIN metall_beleg an ON an.id = v.angebot_beleg_id
     WHERE v.id = ?`,
    [vorgangId || 0]
  );
  if (!v) throw fehler(404, 'Vorgang nicht gefunden');
  if (v.abgebrochen_am) throw fehler(400, `${v.vorgangsnummer} ist abgebrochen`);
  if (v.lexware_kontakt_id !== b.lexware_kontakt_id) throw fehler(400, `${v.vorgangsnummer} gehört zu einem anderen Kunden`);

  if (b.belegart === 'quotation') {
    if (v.angebot_beleg_id) throw fehler(409, `${v.vorgangsnummer} hat schon ein Angebot (${v.angebot_nr || 'Entwurf'})`);
    await setzeZuordnung(pool, b.id, { zuordnung: 'manuell', employeeId });
    await pool.execute('UPDATE metall_vorgang SET angebot_beleg_id = ? WHERE id = ? AND angebot_beleg_id IS NULL', [b.id, v.id]);
  } else {
    await setzeZuordnung(pool, b.id, { zuordnung: 'manuell', vorgangId: v.id, employeeId });
  }
  return { beleg_id: b.id, belegnummer: b.belegnummer, vorgang_id: v.id, vorgangsnummer: v.vorgangsnummer };
}

async function neuerVorgangAusBeleg(pool, belegId, { bezeichnung, kundenBestellnr } = {}, { employeeId = null } = {}) {
  const b = await ladeOffenenBeleg(pool, belegId);
  if (!b.kunde_id || !b.kunde_aktiv) throw fehler(400, 'Der Beleg gehört zu keinem aktiven Metallkunden');
  const istAngebot = b.belegart === 'quotation';
  const vorgang = await legeVorgangAn(pool, {
    kundeId: b.kunde_id, bezeichnung, kundenBestellnr, angebotBelegId: istAngebot ? b.id : null,
  }, { employeeId });
  // Angebot: legeVorgangAn hat es schon als 'manuell' markiert. Sonst jetzt zuordnen –
  // scheitert das (Beleg inzwischen anders zugeordnet), bleibt der Vorgang ohne Beleg stehen.
  if (!istAngebot) await setzeZuordnung(pool, b.id, { zuordnung: 'manuell', vorgangId: vorgang.id, employeeId });
  return { beleg_id: b.id, belegnummer: b.belegnummer, vorgang_id: vorgang.id, vorgangsnummer: vorgang.vorgangsnummer };
}

async function ignoriere(pool, belegId, { employeeId = null } = {}) {
  const b = await ladeOffenenBeleg(pool, belegId);
  await setzeZuordnung(pool, b.id, { zuordnung: 'ignoriert', employeeId });
  return { beleg_id: b.id, belegnummer: b.belegnummer };
}

async function holeZurueck(pool, belegId) {
  const [res] = await pool.execute(
    `UPDATE metall_beleg SET zuordnung = 'offen', vorgang_id = NULL, zugeordnet_von = NULL, zugeordnet_am = NULL
     WHERE id = ? AND zuordnung = 'ignoriert'`,
    [belegId]
  );
  if (!res.affectedRows) throw fehler(409, 'Beleg ist nicht (mehr) als „Kein Metallauftrag“ markiert');
  return { beleg_id: Number(belegId) };
}

module.exports = {
  vorschlagGrund, bereiteAuf,
  ladeOffene, zaehleOffene, ladeIgnorierte, ladeDoppelteAbAlle,
  ordneZu, neuerVorgangAusBeleg, ignoriere, holeZurueck,
};
