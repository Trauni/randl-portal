// #552: Artikelstamm (gas_artikel) lesen und aus dem SER-Export abgleichen.
// Vorschau und Übernahme rechnen beide auf frisch gelesenen Daten (wie das Preis-Tool),
// nichts wird zwischen den Schritten im Server gemerkt.

const { getPool } = require('../db');
const { leseArtikelExport, planeAbgleich, FELDER } = require('../utils/artikelstammImport');

const SPALTEN = ['artikel_nr', 'aktiv', 'feld_stand', ...FELDER];
const parseJson = v => (typeof v === 'string' ? JSON.parse(v) : v) || {};

// Paletten und Kappen zählen in der Gas-Auswertung (#460) nicht als Flasche
const zaehltAlsFlasche = w => (w.typ === 'F' && !/palette|kappe/i.test(w.bezeichnung || '') ? 1 : 0);

async function ladeBestand(db = getPool()) {
  const [rows] = await db.query(`SELECT ${SPALTEN.join(', ')} FROM gas_artikel`);
  return rows.map(r => ({ ...r, feld_stand: parseJson(r.feld_stand) }));
}

/** Artikelübersicht für die Seite (inkl. inaktive). */
async function liste() {
  const [rows] = await getPool().query(
    `SELECT artikel_nr, bezeichnung, typ, aktiv, un_nr, gefahrklasse, befoerderungskategorie, fuellgewicht_kg, inhalt_l,
            preis_netto_cent, mwst_satz, pfand_artikel_nr, geaendert_am
       FROM gas_artikel ORDER BY artikel_nr`);
  return rows;
}

function zusammenfassung(parsed, plan) {
  return {
    stats: parsed.stats, warnings: parsed.warnings,
    summary: { neu: plan.neu.length, ergaenzt: plan.ergaenzt.length, abweichend: plan.abweichend.length,
      unveraendert: plan.unveraendert, nurImPortal: plan.nurImPortal.length },
    neu: plan.neu.map(n => ({ artikel_nr: n.artikel_nr, bezeichnung: n.werte.bezeichnung, typ: n.werte.typ, aktiv: n.aktiv })),
    ergaenzt: plan.ergaenzt.map(e => ({ artikel_nr: e.artikel_nr, felder: Object.keys(e.werte) })),
    abweichend: plan.abweichend,
    nurImPortal: plan.nurImPortal,
  };
}

async function vorschau(buffer) {
  const parsed = leseArtikelExport(buffer);
  const plan = planeAbgleich(await ladeBestand(), parsed.artikel);
  return zusammenfassung(parsed, plan);
}

/** Übernimmt neue Artikel und leere Felder; schreibt ein Protokoll. */
async function anwenden(buffer, quelleDatei, user = {}) {
  const parsed = leseArtikelExport(buffer);
  const conn = await getPool().getConnection();
  try {
    await conn.beginTransaction();
    const bestand = await ladeBestand(conn);
    const plan = planeAbgleich(bestand, parsed.artikel);
    const stand = new Map(bestand.map(b => [b.artikel_nr, b.feld_stand]));

    for (const n of plan.neu) {
      const felder = ['artikel_nr', 'aktiv', 'zaehlt_als_flasche', 'feld_stand', ...Object.keys(n.werte)];
      const werte = [n.artikel_nr, n.aktiv ? 1 : 0, zaehltAlsFlasche(n.werte), JSON.stringify(n.feld_stand), ...Object.values(n.werte)];
      await conn.query(`INSERT INTO gas_artikel (${felder.join(', ')}) VALUES (${felder.map(() => '?').join(', ')})`, werte);
    }
    for (const e of plan.ergaenzt) {
      const keys = Object.keys(e.werte);
      const merged = { ...stand.get(e.artikel_nr), ...e.feld_stand };
      await conn.query(
        `UPDATE gas_artikel SET ${keys.map(k => `${k} = ?`).join(', ')}, feld_stand = ? WHERE artikel_nr = ?`,
        [...keys.map(k => e.werte[k]), JSON.stringify(merged), e.artikel_nr]);
    }

    const [ins] = await conn.execute(
      `INSERT INTO gas_artikel_imports (quelle, source_file, neu, ergaenzt, abweichend, details, imported_by, imported_by_name)
       VALUES ('ser', ?, ?, ?, ?, ?, ?, ?)`,
      [String(quelleDatei || 'unbekannt').slice(0, 255), plan.neu.length, plan.ergaenzt.length, plan.abweichend.length,
        JSON.stringify({ warnings: parsed.warnings, abweichend: plan.abweichend, nurImPortal: plan.nurImPortal }),
        user.id || null, user.fullName || user.username || null]);
    await conn.commit();
    console.log('[Artikelstamm]', quelleDatei, plan.neu.length, 'neu,', plan.ergaenzt.length, 'ergänzt, von', user.username);
    return { importId: ins.insertId, ...zusammenfassung(parsed, plan) };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

module.exports = { liste, vorschau, anwenden, zaehltAlsFlasche };
