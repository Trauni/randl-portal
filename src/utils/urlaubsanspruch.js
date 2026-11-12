/**
 * Urlaubsanspruch bei Elternzeit (§ 17 BEEG): Der Jahresanspruch wird für jeden
 * vollen Kalendermonat Elternzeit um 1/12 gekürzt. Teilmonate kürzen nicht.
 * Beispiel: 30 Tage, 1 Monat Elternzeit → 30 / 12 × 11 = 27,5 Tage.
 * Alle Daten sind 'YYYY-MM-DD'-Strings.
 */

const pad = (n) => String(n).padStart(2, '0');
const letzterTag = (jahr, monat) => new Date(Date.UTC(jahr, monat, 0)).getUTCDate(); // monat 1–12

/** Volle Kalendermonate des Jahres, die komplett in einer Elternzeit liegen. */
function elternzeitMonate(zeitraeume, jahr) {
  let n = 0;
  for (let m = 1; m <= 12; m++) {
    const erster = `${jahr}-${pad(m)}-01`;
    const letzter = `${jahr}-${pad(m)}-${pad(letzterTag(jahr, m))}`;
    // Ein Monat zählt auch, wenn mehrere Zeiträume ihn nahtlos zusammen abdecken.
    if (deckt(zeitraeume, erster, letzter)) n++;
  }
  return n;
}

function deckt(zeitraeume, von, bis) {
  const sortiert = [...zeitraeume].sort((a, b) => (a.von < b.von ? -1 : 1));
  let offen = von; // erster noch nicht abgedeckter Tag
  for (const z of sortiert) {
    if (z.bis < offen) continue;
    if (z.von > offen) return false;
    offen = nachTag(z.bis);
    if (offen > bis) return true;
  }
  return false;
}

const nachTag = (tag) => new Date(+new Date(tag + 'T12:00:00Z') + 86400000).toISOString().slice(0, 10);

/** Gekürzter Anspruch in Tagen, auf zwei Nachkommastellen. */
function gekuerzterAnspruch(jahresanspruch, monate) {
  const m = Math.min(12, Math.max(0, monate));
  return Math.round((Number(jahresanspruch) / 12) * (12 - m) * 100) / 100;
}

/** Lädt die Elternzeiten des Jahres und liefert { basis, monate, anspruch }. */
async function anspruchFuerJahr(db, employeeId, basis, jahr) {
  const [rows] = await db.query(
    `SELECT DATE_FORMAT(von,'%Y-%m-%d') AS von, DATE_FORMAT(bis,'%Y-%m-%d') AS bis
       FROM gleitzeit_freistellung
      WHERE employee_id = ? AND art = 'elternzeit' AND von <= ? AND bis >= ?`,
    [employeeId, `${jahr}-12-31`, `${jahr}-01-01`]);
  const monate = elternzeitMonate(rows, jahr);
  return { basis: Number(basis), monate, anspruch: gekuerzterAnspruch(basis, monate) };
}

module.exports = { elternzeitMonate, gekuerzterAnspruch, anspruchFuerJahr };
