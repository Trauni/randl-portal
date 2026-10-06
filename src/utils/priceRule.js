/**
 * #253 (06.10.2026): Preisregel für das Preis-Tool (#249) – reine Rechnung, ohne DB/Netz.
 * Wird von der Vorschau und später vom Push (#254) identisch verwendet.
 *
 * Entscheidungen 06.10.2026: Regel wirkt auf den NETTOpreis, Ergebnis auf ganze Cent
 * kaufmännisch gerundet. Bei Liter-Gasen ist L die Flaschengröße (+2 ct/L → 50 L = +1 €).
 *
 * Ändern um (relativ zum heutigen Preis):
 *   { mode: 'per_unit', unit: 'kg' | 'L', cents: <±Zahl> }   z. B. +14 ct/kg
 *   { mode: 'flat', cents: <±Zahl> }                        z. B. +50 ct je Artikel
 * Festsetzen auf (unabhängig vom heutigen Preis – korrigiert auch falsche Preise):
 *   { mode: 'target_per_unit', unit: 'kg' | 'L', cents: >0 } z. B. 210 ct/kg → 11 kg = 23,10 €
 *   { mode: 'set', cents: >0 }                              z. B. 4500 ct → 45,00 € je Artikel
 */

const MAX_ABS_CENTS = 100000; // Tippfehlerschutz: höchstens ±1000 € je Einheit/Artikel
const UNIT_MODES = ['per_unit', 'target_per_unit'];
const TARGET_MODES = ['target_per_unit', 'set'];

function validateRule(rule) {
  if (!rule || typeof rule !== 'object') return 'Keine Regel angegeben';
  if (![...UNIT_MODES, 'flat', 'set'].includes(rule.mode)) return 'Unbekannte Regel';
  const cents = Number(rule.cents);
  if (!Number.isFinite(cents) || cents === 0) return 'Betrag fehlt oder ist 0';
  if (TARGET_MODES.includes(rule.mode) && cents < 0) return 'Zielpreis muss positiv sein';
  if (Math.abs(cents) > MAX_ABS_CENTS) return 'Betrag unplausibel hoch';
  if (UNIT_MODES.includes(rule.mode) && rule.unit !== 'kg' && rule.unit !== 'L') return 'Einheit muss kg oder L sein';
  return null;
}

// Kaufmännisch auf ganze Cent, robust gegen Gleitkomma-Reste (z. B. 1.005 → 1.01)
function roundCents(x) {
  return Math.sign(x) * Math.round(Math.abs(x) + 1e-9);
}

/**
 * Wendet die Regel auf eine Artikelliste an.
 * Liefert pro Artikel { ..., status: 'ok' | 'same' | 'skip', reason?, oldNet, newNet, diff, newGross }.
 * 'same' = Preis stimmt bereits, keine Änderung nötig.
 */
function applyRule(articles, rule) {
  const error = validateRule(rule);
  if (error) throw Object.assign(new Error(error), { status: 400 });
  const cents = Number(rule.cents);
  const isTarget = TARGET_MODES.includes(rule.mode);

  return articles.map(a => {
    const base = {
      id: a.id, articleNumber: a.articleNumber, name: a.name,
      content: a.content, taxRate: a.taxRate, leadingPrice: a.leadingPrice,
      oldNet: a.netPrice,
    };
    if (a.netPrice == null && !isTarget) return { ...base, status: 'skip', reason: 'Kein Nettopreis in Lexware' };

    if (UNIT_MODES.includes(rule.mode)) {
      if (!a.content) return { ...base, status: 'skip', reason: 'Kein Inhalt gepflegt' };
      if (a.content.unit !== rule.unit) return { ...base, status: 'skip', reason: `Einheit ${a.content.unit}, Regel gilt für ${rule.unit}` };
    }

    const oldCents = a.netPrice == null ? null : Math.round(a.netPrice * 100);
    let newNetCents;
    switch (rule.mode) {
      case 'per_unit':        newNetCents = roundCents(oldCents + cents * a.content.value); break;
      case 'flat':            newNetCents = roundCents(oldCents + cents); break;
      case 'target_per_unit': newNetCents = roundCents(cents * a.content.value); break;
      case 'set':             newNetCents = roundCents(cents); break;
    }
    if (newNetCents <= 0) return { ...base, status: 'skip', reason: 'Neuer Preis wäre 0 oder negativ' };

    const newNet = newNetCents / 100;
    const newGross = a.taxRate != null ? roundCents(newNetCents * (1 + a.taxRate / 100)) / 100 : null;
    const diff = oldCents == null ? null : (newNetCents - oldCents) / 100;
    if (diff === 0) return { ...base, status: 'same', newNet, newGross, diff, reason: 'Preis stimmt bereits' };
    return { ...base, status: 'ok', newNet, newGross, diff };
  });
}

// Kurztext fürs Protokoll, z. B. „+14 ct pro kg netto“ oder „festsetzen auf 2,10 € pro kg netto“
function describeRule(rule) {
  const per = rule.unit ? 'pro ' + rule.unit : 'je Artikel';
  const eur = c => (c / 100).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 3 }) + ' €';
  if (TARGET_MODES.includes(rule.mode)) return `festsetzen auf ${eur(Number(rule.cents))} ${per} netto`;
  const c = Number(rule.cents);
  return `${c > 0 ? '+' : '−'}${Math.abs(c).toLocaleString('de-DE')} ct ${per} netto`;
}

module.exports = { applyRule, validateRule, roundCents, describeRule };
