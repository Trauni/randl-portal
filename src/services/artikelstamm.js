// #552: Artikelstamm (gas_artikel) lesen und aus dem SER-Export abgleichen.
// Vorschau und Übernahme rechnen beide auf frisch gelesenen Daten (wie das Preis-Tool),
// nichts wird zwischen den Schritten im Server gemerkt.

const { getPool } = require('../db');
const { leseArtikelExport, planeAbgleich, FELDER } = require('../utils/artikelstammImport');
const { pruefeAenderung } = require('../utils/artikelstammAendern');

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
            ggvs_faktor, preis_netto_cent, mwst_satz, pfand_artikel_nr, kaufflasche_artikel_nr, geaendert_am
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

const fehler400 = msg => Object.assign(new Error(msg), { status: 400 });
const MAX_MASSE = 500;
const alsText = v => (v == null ? null : String(v));
// DECIMAL kommt als Text ('11.000'), eingegeben wird 11 – numerisch vergleichen, aber null bleibt ≠ 0
const gleichWert = (a, b) => (a == null || b == null ? a == null && b == null : alsText(a) === alsText(b) || Number(a) === Number(b));

/**
 * Einen oder mehrere Artikel ändern (Massenbearbeitung = mehrere Nummern, gleiche Werte).
 * Alles oder nichts; jede tatsächliche Änderung kommt ins Protokoll, Herkunft des Felds wird „portal“.
 * @returns {{ geaendert: number, unveraendert: number, felder: string[] }}
 */
async function aendere(nummern, eingabe, user = {}) {
  if (!Array.isArray(nummern) || !nummern.length) throw fehler400('Keine Artikel ausgewählt');
  if (nummern.length > MAX_MASSE) throw fehler400(`Höchstens ${MAX_MASSE} Artikel auf einmal`);
  const { werte, fehler } = pruefeAenderung(eingabe);
  if (fehler.length) throw fehler400(fehler.join('; '));
  if ('bezeichnung' in werte && nummern.length > 1) throw fehler400('Die Bezeichnung lässt sich nur einzeln ändern');

  const conn = await getPool().getConnection();
  try {
    await conn.beginTransaction();
    if (werte.pfand_artikel_nr) {
      const [p] = await conn.query('SELECT typ FROM gas_artikel WHERE artikel_nr = ?', [werte.pfand_artikel_nr]);
      if (!p.length) throw fehler400(`Pfandartikel ${werte.pfand_artikel_nr} gibt es nicht`);
      if (p[0].typ !== 'P') throw fehler400(`${werte.pfand_artikel_nr} ist kein Pfandartikel (Typ P)`);
    }
    if (werte.kaufflasche_artikel_nr) {
      const [k] = await conn.query('SELECT 1 FROM gas_artikel WHERE artikel_nr = ?', [werte.kaufflasche_artikel_nr]);
      if (!k.length) throw fehler400(`Kaufflasche ${werte.kaufflasche_artikel_nr} gibt es nicht`);
    }
    const spalten = Object.keys(werte);
    const [rows] = await conn.query(
      `SELECT artikel_nr, feld_stand, ${spalten.join(', ')} FROM gas_artikel WHERE artikel_nr IN (?) FOR UPDATE`, [nummern]);
    const gefunden = new Set(rows.map(r => r.artikel_nr));
    const fehlen = nummern.filter(n => !gefunden.has(n));
    if (fehlen.length) throw fehler400(`Artikel nicht gefunden: ${fehlen.slice(0, 5).join(', ')}`);

    const jetzt = new Date().toISOString();
    let geaendert = 0;
    for (const r of rows) {
      const diff = spalten.filter(k => !gleichWert(r[k], werte[k]));
      if (!diff.length) continue;
      const stand = { ...parseJson(r.feld_stand), ...Object.fromEntries(diff.map(k => [k, { quelle: 'portal', am: jetzt }])) };
      await conn.query(`UPDATE gas_artikel SET ${diff.map(k => `${k} = ?`).join(', ')}, feld_stand = ? WHERE artikel_nr = ?`,
        [...diff.map(k => werte[k]), JSON.stringify(stand), r.artikel_nr]);
      await conn.query('INSERT INTO gas_artikel_aenderungen (artikel_nr, feld, alt, neu, von_id, von_name) VALUES ?',
        [diff.map(k => [r.artikel_nr, k, alsText(r[k]), alsText(werte[k]), user.id || null, user.fullName || user.username || null])]);
      geaendert++;
    }
    await conn.commit();
    console.log('[Artikelstamm] geändert:', geaendert, 'von', nummern.length, spalten.join(','), 'von', user.username);
    return { geaendert, unveraendert: nummern.length - geaendert, felder: spalten };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

/** Letzte Änderungen eines Artikels. */
async function protokoll(artikelNr, limit = 50) {
  const [rows] = await getPool().query(
    `SELECT feld, alt, neu, von_name, geaendert_am FROM gas_artikel_aenderungen
      WHERE artikel_nr = ? ORDER BY id DESC LIMIT ?`, [artikelNr, limit]);
  return rows;
}

module.exports = { liste, vorschau, anwenden, aendere, protokoll, zaehltAlsFlasche };
