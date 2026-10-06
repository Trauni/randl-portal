/**
 * #253 (06.10.2026): Preisregel für das Preis-Tool (#249) – reine Rechnung, ohne DB/Netz.
 * Wird von der Vorschau und später vom Push (#254) identisch verwendet.
 *
 * Entscheidungen 06.10.2026: Regel wirkt auf den NETTOpreis, Ergebnis auf ganze Cent
 * kaufmännisch gerundet. Bei Liter-Gasen ist L die Flaschengröße (+2 ct/L → 50 L = +1 €).
 *
 * rule = { mode: 'per_unit', unit: 'kg' | 'L', cents: <±Zahl> }   z. B. +14 ct/kg
 *      | { mode: 'flat', cents: <±Zahl> }                        z. B. +50 ct je Artikel
 */

const MAX_ABS_CENTS = 100000; // Tippfehlerschutz: höchstens ±1000 € je Einheit/Artikel

function validateRule(rule) {
  if (!rule || typeof rule !== 'object') return 'Keine Regel angegeben';
  const cents = Number(rule.cents);
  if (!Number.isFinite(cents) || cents === 0) return 'Betrag in Cent fehlt oder ist 0';
  if (Math.abs(cents) > MAX_ABS_CENTS) return 'Betrag unplausibel hoch';
  if (rule.mode === 'per_unit') {
    if (rule.unit !== 'kg' && rule.unit !== 'L') return 'Einheit muss kg oder L sein';
    return null;
  }
  if (rule.mode === 'flat') return null;
  return 'Unbekannte Regel';
}

// Kaufmännisch auf ganze Cent, robust gegen Gleitkomma-Reste (z. B. 1.005 → 1.01)
function roundCents(x) {
  return Math.sign(x) * Math.round(Math.abs(x) + 1e-9);
}

/**
 * Wendet die Regel auf eine Artikelliste an.
 * Liefert pro Artikel { ..., status: 'ok' | 'skip', reason?, oldNet, newNet, diff, newGross }.
 */
function applyRule(articles, rule) {
  const error = validateRule(rule);
  if (error) throw Object.assign(new Error(error), { status: 400 });
  const cents = Number(rule.cents);

  return articles.map(a => {
    const base = {
      id: a.id, articleNumber: a.articleNumber, name: a.name,
      content: a.content, taxRate: a.taxRate, leadingPrice: a.leadingPrice,
      oldNet: a.netPrice,
    };
    if (a.netPrice == null) return { ...base, status: 'skip', reason: 'Kein Nettopreis in Lexware' };

    let deltaCents;
    if (rule.mode === 'per_unit') {
      if (!a.content) return { ...base, status: 'skip', reason: 'Kein Inhalt gepflegt' };
      if (a.content.unit !== rule.unit) return { ...base, status: 'skip', reason: `Einheit ${a.content.unit}, Regel gilt für ${rule.unit}` };
      deltaCents = cents * a.content.value;
    } else {
      deltaCents = cents;
    }

    const newNetCents = roundCents(Math.round(a.netPrice * 100) + deltaCents);
    if (newNetCents <= 0) return { ...base, status: 'skip', reason: 'Neuer Preis wäre 0 oder negativ' };

    const newNet = newNetCents / 100;
    const newGross = a.taxRate != null ? roundCents(newNetCents * (1 + a.taxRate / 100)) / 100 : null;
    return { ...base, status: 'ok', newNet, newGross, diff: Math.round((newNet - a.netPrice) * 100) / 100 };
  });
}

module.exports = { applyRule, validateRule, roundCents };
