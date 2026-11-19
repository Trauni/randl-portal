/**
 * #610: Kennzeichen "im Shop sichtbar" am Artikel. Bisher sagt nur das Lexware-Präfix (RG- sichtbar, NRG- ausgeblendet),
 * ob ein Artikel im Shop erscheint. Hier wird der Wert einmal aus dem Präfix in den Artikelstamm übernommen,
 * danach führt das Portal. Es wird nichts nach Lexware oder in den Shop geschrieben.
 */
const { stammNr } = require('../utils/artikelListe');

/** Welche Stammartikel ohne Wert bekommen welchen Wert? RG- hat Vorrang, falls es beide Schreibweisen gibt. */
function planeShopAusLexware(stamm, lexware) {
  const wert = new Map();
  for (const l of lexware) {
    const nr = stammNr(l.articleNumber);
    const sichtbar = !String(l.articleNumber).toUpperCase().startsWith('NRG-');
    if (!wert.has(nr) || sichtbar) wert.set(nr, sichtbar);
  }
  return stamm
    .filter((a) => a.shop_sichtbar == null && wert.has(String(a.artikel_nr)))
    .map((a) => ({ artikel_nr: String(a.artikel_nr), wert: wert.get(String(a.artikel_nr)) ? 1 : 0 }));
}

async function uebernehmeShopAusLexware(db, lexware, user = {}) {
  const [stamm] = await db.query('SELECT artikel_nr, shop_sichtbar FROM gas_artikel');
  const plan = planeShopAusLexware(stamm, lexware);
  for (const p of plan) {
    await db.query('UPDATE gas_artikel SET shop_sichtbar = ? WHERE artikel_nr = ? AND shop_sichtbar IS NULL', [p.wert, p.artikel_nr]);
    await db.query('INSERT INTO gas_artikel_aenderungen (artikel_nr, feld, alt, neu, von_id, von_name) VALUES (?, ?, NULL, ?, ?, ?)',
      [p.artikel_nr, 'shop_sichtbar', String(p.wert), user.id || null, user.name || null]);
  }
  return { geaendert: plan.length, sichtbar: plan.filter((p) => p.wert === 1).length, ausgeblendet: plan.filter((p) => p.wert === 0).length, ohneLexware: stamm.filter((a) => a.shop_sichtbar == null).length - plan.length };
}

module.exports = { planeShopAusLexware, uebernehmeShopAusLexware };
