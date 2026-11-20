/**
 * #617: Vergleicht den Inhalt je Gasartikel: Füllmenge im Stamm gegen den alten Eintrag (gas_article_content). Nur lesend.
 *   node scripts/inhalt-vergleich.js
 * Zeigt, was sich mit der Umstellung auf den Stamm ändert: abweichende Werte und Artikel ohne jeden Inhalt.
 */
require('dotenv').config({ override: true });
const { getPool } = require('../src/db');

(async () => {
  const db = getPool();
  const [zeilen] = await db.query(
    `SELECT a.artikel_nr, a.bezeichnung, a.fuellmenge, a.fuellmenge_einheit, c.content_value, c.content_unit, c.source
       FROM gas_artikel a LEFT JOIN gas_article_content c ON c.article_number IN (CONCAT('RG-', a.artikel_nr), CONCAT('NRG-', a.artikel_nr))
      WHERE a.typ = 'F' AND a.aktiv = 1 ORDER BY a.artikel_nr`);
  const als = (w, e) => (w == null ? '–' : `${Number(w)} ${String(e || '?').toLowerCase() === 'l' ? 'L' : e}`);
  const abweichend = zeilen.filter((z) => z.fuellmenge != null && z.content_value != null && (Number(z.fuellmenge) !== Number(z.content_value) || String(z.fuellmenge_einheit).toLowerCase() !== String(z.content_unit).toLowerCase()));
  const keiner = zeilen.filter((z) => z.fuellmenge == null && z.content_value == null);
  const nurAlt = zeilen.filter((z) => z.fuellmenge == null && z.content_value != null);
  console.log(`Aktive Füllungen: ${zeilen.length}. Stamm = alter Eintrag oder nur im Stamm: ${zeilen.length - abweichend.length - keiner.length - nurAlt.length}`);
  console.log(`\nWerte weichen ab (künftig gilt der Stamm): ${abweichend.length}`);
  for (const z of abweichend) console.log(`    ${z.artikel_nr}  Stamm ${als(z.fuellmenge, z.fuellmenge_einheit)}  alt ${als(z.content_value, z.content_unit)}  ${z.bezeichnung}`);
  console.log(`\nNur im alten Eintrag, Stamm leer (bleibt als Rückfall): ${nurAlt.length}`);
  for (const z of nurAlt) console.log(`    ${z.artikel_nr}  alt ${als(z.content_value, z.content_unit)}  ${z.bezeichnung}`);
  console.log(`\nOhne Inhalt (Stamm und alter Eintrag leer): ${keiner.length}`);
  for (const z of keiner) console.log(`    ${z.artikel_nr}  ${z.bezeichnung}`);
  process.exit(0);
})().catch((e) => { console.error('Fehler:', e.message); process.exit(1); });
