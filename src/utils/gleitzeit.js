/**
 * Gleitzeitkonto — reine Rechenlogik ohne Datenbank (#490).
 *
 * Alle Beträge in Minuten. Tage als 'YYYY-MM-DD'.
 *
 * Regeln (Entscheidungen in OpenProject #490):
 *   - Soll pro Arbeitstag = Wochenstunden / Anzahl vereinbarter Arbeitstage,
 *     gültig ist die Arbeitszeit mit dem jüngsten gueltig_ab <= Tag.
 *   - Kein Soll an Nicht-Arbeitstagen, bayerischen Feiertagen, Urlaub,
 *     Krankheit und Gleitzeitabbau.
 *   - Ist = Summe der abgeschlossenen Einträge, je Eintrag (Dauer - Pause)
 *     auf 5 Minuten gerundet — genau so, wie zeit.js nach Rentman spiegelt.
 *     Krankentage zählen nicht als Ist (sonst würden sie Plusstunden).
 *   - Gleitzeitabbau bucht das Tages-Soll ab, das ohne Abwesenheit gegolten hätte.
 *     Wird an einem Abbau-/Urlaubstag trotzdem gearbeitet, zählt das als Plus.
 *   - Stundenweiser Abbau (ein Tag mit Uhrzeit von–bis): abgebucht wird die
 *     Dauer, höchstens das Tages-Soll. Um genau diese Minuten sinkt das Soll
 *     des Tages, der Rest muss gearbeitet werden.
 */
const { feiertag } = require('./feiertage');

const ABWESENHEIT = ['urlaub', 'krankheit', 'gleitzeitabbau', 'freistellung'];

/** '1,2,3,4,5' -> [1,2,3,4,5]; ungültige Werte fallen raus. */
function parseArbeitstage(text) {
  return [...new Set(String(text || '').split(',').filter((s) => s.trim() !== '').map((s) => Number(s.trim())))]
    .filter((n) => Number.isInteger(n) && n >= 0 && n <= 6)
    .sort();
}

/** Gültige Arbeitszeit am Tag aus der Historie, oder null. */
function arbeitszeitAm(historie, tag) {
  let treffer = null;
  for (const h of historie) {
    if (h.gueltig_ab <= tag && (!treffer || h.gueltig_ab > treffer.gueltig_ab)) treffer = h;
  }
  if (!treffer) return null;
  const arbeitstage = parseArbeitstage(treffer.arbeitstage);
  if (!arbeitstage.length) return null;
  return { wochenstunden: Number(treffer.wochenstunden), arbeitstage };
}

/** Regulär geschuldete Minuten am Tag, ohne Abwesenheiten zu berücksichtigen. */
function regelSoll(arbeitszeit, tag) {
  if (!arbeitszeit) return 0;
  const wochentag = new Date(tag + 'T12:00:00Z').getUTCDay();
  if (!arbeitszeit.arbeitstage.includes(wochentag)) return 0;
  if (feiertag(tag)) return 0;
  return Math.round((arbeitszeit.wochenstunden * 60) / arbeitszeit.arbeitstage.length);
}

/** 'HH:MM' -> Minuten seit Mitternacht, sonst null. */
function uhrzeitMinuten(text) {
  const m = /^([01]\d|2[0-3]):([0-5]\d)(:00)?$/.exec(String(text || ''));
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

/** Dauer eines stundenweisen Abbaus in Minuten, oder null bei ungültigen Zeiten. */
function abbauDauer(von, bis) {
  const a = uhrzeitMinuten(von);
  const b = uhrzeitMinuten(bis);
  return a !== null && b !== null && b > a ? b - a : null;
}

/** Netto-Minuten eines Eintrags, auf 5 Minuten gerundet (wie zeit.rundeAufFuenf). */
function eintragMinuten(spanneSekunden, pauseSekunden) {
  const netto = Math.max(0, spanneSekunden - (pauseSekunden || 0));
  return Math.round(netto / 300) * 5;
}

/**
 * Automatische Buchungen eines Tages.
 * abwesenheit: null | 'urlaub' | 'krankheit' | 'gleitzeitabbau' | 'freistellung'
 *   (freistellung = Elternzeit/Sonderurlaub: Soll 0, keine Buchung; Arbeit an dem Tag zählt als Plus)
 * referenzId: vacation_requests.id beim Abbau
 * abbauMinuten: beim stundenweisen Abbau die beantragte Dauer, sonst null (ganzer Tag)
 * Liefert 0–2 Buchungen { art, minuten, soll_minuten?, ist_minuten?, referenz_id? }.
 */
function tagesbuchungen({ tag, arbeitszeit, istMinuten = 0, abwesenheit = null, referenzId = null, abbauMinuten = null }) {
  if (abwesenheit && !ABWESENHEIT.includes(abwesenheit)) {
    throw new Error(`Unbekannte Abwesenheit '${abwesenheit}'`);
  }
  const regel = regelSoll(arbeitszeit, tag);
  const abbau = abwesenheit === 'gleitzeitabbau' ? abbauAmTag(regel, abbauMinuten) : 0;
  const soll = abwesenheit === 'gleitzeitabbau' ? regel - abbau : abwesenheit ? 0 : regel;
  const buchungen = [];

  if (soll > 0 || istMinuten > 0) {
    buchungen.push({ art: 'tagessaldo', minuten: istMinuten - soll, soll_minuten: soll, ist_minuten: istMinuten });
  }
  if (abbau > 0) {
    buchungen.push({ art: 'abbau', minuten: -abbau, referenz_id: referenzId });
  }
  return buchungen;
}

/** Abgebuchte Minuten: ganzer Tag = Regel-Soll, stundenweise = Dauer, höchstens Regel-Soll. */
function abbauAmTag(regel, abbauMinuten = null) {
  if (regel <= 0) return 0;
  return abbauMinuten === null || abbauMinuten === undefined ? regel : Math.min(Math.max(0, abbauMinuten), regel);
}

/**
 * Alle automatischen Buchungen für einen Zeitraum.
 * historie:      [{ gueltig_ab, wochenstunden, arbeitstage }]
 * istProTag:     Map tag -> Minuten (ohne Krankheit)
 * abwesenheiten: Map tag -> { art, referenzId, abbauMinuten? }   (Krankheit, genehmigter Urlaub/Abbau)
 */
function zeitraumBuchungen({ von, bis, historie, istProTag, abwesenheiten }) {
  const ergebnis = [];
  const ende = new Date(bis + 'T12:00:00Z');
  for (let d = new Date(von + 'T12:00:00Z'); d <= ende; d = new Date(+d + 86400000)) {
    const tag = d.toISOString().slice(0, 10);
    const abw = abwesenheiten.get(tag);
    for (const b of tagesbuchungen({
      tag,
      arbeitszeit: arbeitszeitAm(historie, tag),
      istMinuten: istProTag.get(tag) || 0,
      abwesenheit: abw ? abw.art : null,
      referenzId: abw ? abw.referenzId || null : null,
      abbauMinuten: abw ? abw.abbauMinuten ?? null : null,
    })) {
      ergebnis.push({ datum: tag, ...b });
    }
  }
  return ergebnis;
}

/** Minuten als '+12:30' / '-3:05' / '0:00'. */
function formatMinuten(min) {
  const vz = min > 0 ? '+' : min < 0 ? '-' : '';
  const abs = Math.abs(Math.round(min));
  return `${vz}${Math.floor(abs / 60)}:${String(abs % 60).padStart(2, '0')}`;
}

module.exports = {
  parseArbeitstage, arbeitszeitAm, regelSoll, eintragMinuten,
  uhrzeitMinuten, abbauDauer, abbauAmTag,
  tagesbuchungen, zeitraumBuchungen, formatMinuten,
};
