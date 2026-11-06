/**
 * Gesetzliche Feiertage in Bayern (#490).
 *
 * Fest im Code berechnet statt gepflegt: die Liste ändert sich praktisch nie,
 * und so gibt es keine Tabelle, die jemand vergessen kann.
 *
 * Mariä Himmelfahrt (15.08.) ist in Bayern nur in Gemeinden mit überwiegend
 * katholischer Bevölkerung Feiertag — das ist die große Mehrheit, daher
 * standardmäßig enthalten. Das Augsburger Friedensfest (08.08.) gilt nur im
 * Stadtgebiet Augsburg und ist nicht enthalten. Buß- und Bettag ist in Bayern
 * nur schulfrei, kein gesetzlicher Feiertag.
 *
 * Alle Daten sind 'YYYY-MM-DD'-Strings, gerechnet wird in UTC um 12:00, damit
 * keine Zeitumstellung einen Tag verschiebt (gleiches Muster wie urlaub.js).
 */

const TAG_MS = 86400000;
const cache = new Map();

/** Ostersonntag nach der Gaußschen Osterformel (anonymer gregorianischer Algorithmus). */
function ostersonntag(jahr) {
  const a = jahr % 19;
  const b = Math.floor(jahr / 100);
  const c = jahr % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const monat = Math.floor((h + l - 7 * m + 114) / 31);
  const tag = ((h + l - 7 * m + 114) % 31) + 1;
  return isoTag(Date.UTC(jahr, monat - 1, tag, 12));
}

const isoTag = (ms) => new Date(ms).toISOString().slice(0, 10);
const plusTage = (tag, n) => isoTag(+new Date(tag + 'T12:00:00Z') + n * TAG_MS);

/** Map 'YYYY-MM-DD' -> Name aller bayerischen Feiertage des Jahres. */
function feiertageBayern(jahr) {
  if (cache.has(jahr)) return cache.get(jahr);
  const ostern = ostersonntag(jahr);
  const fest = (mm, tt) => `${jahr}-${mm}-${tt}`;
  const liste = new Map([
    [fest('01', '01'), 'Neujahr'],
    [fest('01', '06'), 'Heilige Drei Könige'],
    [plusTage(ostern, -2), 'Karfreitag'],
    [plusTage(ostern, 1), 'Ostermontag'],
    [fest('05', '01'), 'Tag der Arbeit'],
    [plusTage(ostern, 39), 'Christi Himmelfahrt'],
    [plusTage(ostern, 50), 'Pfingstmontag'],
    [plusTage(ostern, 60), 'Fronleichnam'],
    [fest('08', '15'), 'Mariä Himmelfahrt'],
    [fest('10', '03'), 'Tag der Deutschen Einheit'],
    [fest('11', '01'), 'Allerheiligen'],
    [fest('12', '25'), '1. Weihnachtstag'],
    [fest('12', '26'), '2. Weihnachtstag'],
  ]);
  cache.set(jahr, liste);
  return liste;
}

/** Name des Feiertags oder null. */
function feiertag(tag) {
  return feiertageBayern(Number(tag.slice(0, 4))).get(tag) || null;
}

/**
 * Arbeitstage im Zeitraum (inklusive), ohne Feiertage.
 * arbeitstage: Wochentage nach getUTCDay (0 = So … 6 = Sa), Standard Mo–Fr.
 */
function arbeitstage(von, bis, arbeitstageProWoche = [1, 2, 3, 4, 5]) {
  const erlaubt = new Set(arbeitstageProWoche);
  const liste = [];
  const ende = new Date(bis + 'T12:00:00Z');
  for (let d = new Date(von + 'T12:00:00Z'); d <= ende; d = new Date(+d + TAG_MS)) {
    const tag = isoTag(+d);
    if (erlaubt.has(d.getUTCDay()) && !feiertag(tag)) liste.push(tag);
  }
  return liste;
}

module.exports = { ostersonntag, feiertageBayern, feiertag, arbeitstage };
