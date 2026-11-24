/**
 * Belege und Vorgänge der Fahrer-App für das Büro (#516, #519): Lesen aus fahrer_beleg, fahrer_beleg_position und
 * fahrer_ereignis. Tour-Belege, Lieferscheine und Barverkäufe vom Lager-Tablet, Stornos.
 * Zeiträume kommen als Date-Grenzen [von, bis) aus dem Aufrufer (deutsche Tagesgrenzen, siehe berlinTag).
 */
const { getPool } = require('../db');

/** Beginn eines Kalendertags in Seeon (YYYY-MM-DD) als Date, unabhängig von der Zeitzone des Servers. */
function berlinTagesbeginn(tag) {
  const [y, m, d] = String(tag).split('-').map(Number);
  const utc = Date.UTC(y, m - 1, d);
  // Versatz Berlin zu UTC an diesem Tag (Winter +1, Sommer +2). Um 12 Uhr UTC gemessen, also nie mitten im Wechsel.
  const teil = new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Berlin', timeZoneName: 'shortOffset' })
    .formatToParts(new Date(utc + 12 * 3600e3)).find((p) => p.type === 'timeZoneName').value; // „GMT+1“
  const m2 = /GMT([+-]\d+)(?::(\d+))?/.exec(teil);
  const versatzMin = m2 ? Number(m2[1]) * 60 + Math.sign(Number(m2[1])) * Number(m2[2] || 0) : 0;
  return new Date(utc - versatzMin * 60000);
}
/** Kalendertag in Seeon (YYYY-MM-DD) zu einem Zeitpunkt. */
const berlinTag = (zeit) => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Berlin' }).format(new Date(zeit));
/** Folgetag als YYYY-MM-DD. */
function naechsterTag(tag) {
  const [y, m, d] = String(tag).split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
}

const BELEG_FELDER = `b.ls_nummer, b.belegart, b.geraet_id, g.kennung AS geraet_kennung, g.rolle AS geraet_rolle, b.employee_id,
  e.full_name AS fahrer_name, b.tour_id, t.bezeichnung AS tour_name, b.stopp_id, b.kunde_nr, s.kunde_name, s.kunde_adresse,
  b.erstellt_am, b.eingegangen_am, b.unterzeichner, b.verkaeufer, b.zahlart, b.summe_netto_cent, b.summe_brutto_cent,
  b.markierung, b.storniert_am, b.storno_grund, b.storno_verkaeufer`;
const BELEG_JOIN = `fahrer_beleg b
  LEFT JOIN fahrer_geraet g ON g.id = b.geraet_id
  LEFT JOIN employees e ON e.id = b.employee_id
  LEFT JOIN fahrer_tour t ON t.id = b.tour_id
  LEFT JOIN fahrer_stopp s ON s.id = b.stopp_id`;

/**
 * Belege eines Zeitraums, neueste zuerst. filter: { von, bis (Date), geraetId?, belegart?, nurLager?, storniert? ('ja'|'nein'), suche? }
 * Mit Zahl der Positionen und den gelieferten Flaschen (ohne Zubehör kann das Portal hier nicht trennen: Summe aller Mengen).
 */
async function liste({ von, bis, geraetId, belegart, nurLager, storniert, suche, limit = 500 }) {
  const wo = ['b.erstellt_am >= ?', 'b.erstellt_am < ?'];
  const werte = [von, bis];
  if (geraetId) { wo.push('b.geraet_id = ?'); werte.push(Number(geraetId)); }
  if (belegart === 'LS' || belegart === 'BV') { wo.push('b.belegart = ?'); werte.push(belegart); }
  if (nurLager) wo.push("g.rolle = 'lager'");
  if (storniert === 'ja') wo.push('b.storniert_am IS NOT NULL');
  if (storniert === 'nein') wo.push('b.storniert_am IS NULL');
  if (suche) {
    wo.push('(b.ls_nummer LIKE ? OR b.kunde_nr LIKE ? OR s.kunde_name LIKE ? OR b.unterzeichner LIKE ? OR b.verkaeufer LIKE ?)');
    const q = `%${String(suche).trim()}%`;
    werte.push(q, q, q, q, q);
  }
  const [rows] = await getPool().query(
    `SELECT ${BELEG_FELDER},
       (SELECT COUNT(*) FROM fahrer_beleg_position p WHERE p.ls_nummer = b.ls_nummer) AS positionen,
       (SELECT COALESCE(SUM(p.geliefert), 0) FROM fahrer_beleg_position p WHERE p.ls_nummer = b.ls_nummer) AS menge,
       (SELECT COALESCE(SUM(p.leergut), 0) FROM fahrer_beleg_position p WHERE p.ls_nummer = b.ls_nummer) AS leergut
     FROM ${BELEG_JOIN} WHERE ${wo.join(' AND ')} ORDER BY b.erstellt_am DESC, b.ls_nummer DESC LIMIT ${Math.min(Number(limit) || 500, 2000)}`,
    werte);
  return rows;
}

/** Ein Beleg mit Positionen, Unterschrift und allen Ereignissen, die ihn betreffen (auch abgelehnte). */
async function detail(nummer) {
  const pool = getPool();
  const [rows] = await pool.execute(`SELECT ${BELEG_FELDER}, b.unterschrift_png FROM ${BELEG_JOIN} WHERE b.ls_nummer = ?`, [nummer]);
  if (!rows[0]) return null;
  const [positionen] = await pool.execute(
    'SELECT artikel_nr, bezeichnung, soll, geliefert, leergut, preis_netto_cent, mwst_satz FROM fahrer_beleg_position WHERE ls_nummer = ? ORDER BY id', [nummer]);
  const [ereignisse] = await pool.execute(
    `SELECT ev.id, ev.uuid, ev.typ, ev.lfd, ev.geraet_zeit, ev.eingegangen_am, ev.status, ev.fehler_code, ev.fehler_text, ev.markierung, g.kennung AS geraet_kennung
       FROM fahrer_ereignis ev LEFT JOIN fahrer_geraet g ON g.id = ev.geraet_id
      WHERE ev.typ IN ('beleg.erstellt', 'beleg.storniert') AND JSON_UNQUOTE(JSON_EXTRACT(ev.payload, '$.ls_nummer')) = ?
      ORDER BY ev.id`, [nummer]);
  return { ...rows[0], positionen, ereignisse };
}

/** Positionen mehrerer Belege auf einmal (Sammelmail, PDF). */
async function positionenZu(nummern) {
  if (!nummern.length) return [];
  const [rows] = await getPool().query(
    'SELECT ls_nummer, artikel_nr, bezeichnung, soll, geliefert, leergut, preis_netto_cent, mwst_satz FROM fahrer_beleg_position WHERE ls_nummer IN (?) ORDER BY ls_nummer, id', [nummern]);
  return rows;
}

/**
 * Alle Ereignisse aus der Outbox der Geräte, neueste zuerst: das Protokoll der Vorgänge.
 * filter: { von, bis (Date), geraetId?, typ?, status? ('ok'|'fehler') }
 */
async function vorgaenge({ von, bis, geraetId, typ, status, limit = 1000 }) {
  const wo = ['ev.eingegangen_am >= ?', 'ev.eingegangen_am < ?'];
  const werte = [von, bis];
  if (geraetId) { wo.push('ev.geraet_id = ?'); werte.push(Number(geraetId)); }
  if (typ) { wo.push('ev.typ = ?'); werte.push(String(typ)); }
  if (status === 'ok' || status === 'fehler') { wo.push('ev.status = ?'); werte.push(status); }
  const [rows] = await getPool().query(
    `SELECT ev.id, ev.typ, ev.lfd, ev.geraet_zeit, ev.eingegangen_am, ev.status, ev.fehler_code, ev.fehler_text, ev.markierung,
            ev.tour_id, ev.stopp_id, g.kennung AS geraet_kennung, e.full_name AS fahrer_name,
            JSON_UNQUOTE(JSON_EXTRACT(ev.payload, '$.ls_nummer')) AS ls_nummer,
            JSON_UNQUOTE(JSON_EXTRACT(ev.payload, '$.verkaeufer')) AS verkaeufer
       FROM fahrer_ereignis ev LEFT JOIN fahrer_geraet g ON g.id = ev.geraet_id LEFT JOIN employees e ON e.id = ev.employee_id
      WHERE ${wo.join(' AND ')} ORDER BY ev.id DESC LIMIT ${Math.min(Number(limit) || 1000, 5000)}`,
    werte);
  return rows;
}

/**
 * Belege der Lager-Tablets für die Sammelmail eines Tages: am Tag erstellt, dazu Barverkäufe aus früheren Tagen, die
 * erst nach dem letzten Versand storniert wurden (ein Storno nach 18 Uhr wäre sonst in keiner Mail).
 */
async function lagerTag({ von, bis, stornoSeit }) {
  const [rows] = await getPool().query(
    `SELECT ${BELEG_FELDER}, b.unterschrift_png FROM ${BELEG_JOIN}
      WHERE g.rolle = 'lager' AND ((b.erstellt_am >= ? AND b.erstellt_am < ?)
         OR (b.erstellt_am < ? AND b.storniert_am IS NOT NULL AND b.storniert_am >= ?))
      ORDER BY b.erstellt_am, b.ls_nummer`,
    [von, bis, von, stornoSeit || bis]);
  return rows;
}

/** Geräte für Filter: Kennung und Rolle. */
async function geraete() {
  const [rows] = await getPool().execute('SELECT id, kennung, rolle FROM fahrer_geraet ORDER BY rolle, kennung');
  return rows;
}

module.exports = { berlinTagesbeginn, berlinTag, naechsterTag, liste, detail, positionenZu, vorgaenge, lagerTag, geraete };
