/**
 * #251 (06.10.2026): Inhalt (Wert + Einheit) aus einem Lexware-Artikeltitel erkennen.
 * Nur für die einmalige Vorbefüllung von gas_article_content; danach gilt das Feld.
 *
 * Erkannt werden z. B. „11 kg“, „33kg“, „6-kg“, „1,8 kg“, „50L“, „10 Liter“.
 * Zahlen ohne direkt folgende Einheit (Reinheit „Argon 4,6“, „Stickstoff 5,0“,
 * „Biergas 70/30“, „Arcox18“, „300 bar“) werden bewusst ignoriert.
 * Mehrere verschiedene Treffer oder keiner → null (Liste zum Nachpflegen).
 */

// Preis-Tool-Umfang (Entscheidung 06.10.2026): alle Gasfüllungen RG- und NRG-.
// PFAND, Zubehör, Zelt (RT-) und Metall (RM-) bewusst nicht.
const PRICE_TOOL_PREFIX_RE = /^(RG|NRG)-/;

function isPriceToolArticle(articleNumber) {
  return PRICE_TOOL_PREFIX_RE.test(articleNumber || '');
}

const CONTENT_RE =/(?<![\d.,])(\d+(?:[.,]\d+)?)\s*-?\s*(kg|liter|l)(?![a-zäöüß0-9])/gi;

function parseContentFromTitle(title) {
  if (!title) return null;
  const found = new Map();
  for (const m of String(title).matchAll(CONTENT_RE)) {
    const value = parseFloat(m[1].replace(',', '.'));
    const unit = m[2].toLowerCase() === 'kg' ? 'kg' : 'L';
    if (value > 0) found.set(value + unit, { value, unit });
  }
  return found.size === 1 ? [...found.values()][0] : null;
}

module.exports = { parseContentFromTitle, isPriceToolArticle };
