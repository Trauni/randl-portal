// Zeitplan des automatischen SER-Uploads -- MUSS deckungsgleich sein mit
// gas-webshop admin-backend/src/services/serAutoPush.js (ZEITPLAN '0 9,12,15,18 * * *').
// Das Portal sieht nicht, ob dort SER_AUTO_PUSH=off gesetzt ist.
const STUNDEN = [9, 12, 15, 18];

// Stunde in Europe/Berlin (0-23) fuer einen Zeitpunkt
function berlinStunde(now) {
  const h = new Intl.DateTimeFormat('de-DE', { timeZone: 'Europe/Berlin', hour: '2-digit', hour12: false }).format(now);
  return parseInt(h, 10) % 24;
}

// Naechster Termin: { stunde, morgen }. Laeuft der Push gerade (z. B. 15:00:20), gilt schon der folgende.
function naechsteUebertragung(now = new Date()) {
  const h = berlinStunde(now);
  const stunde = STUNDEN.find(s => s > h);
  return stunde !== undefined ? { stunde, morgen: false } : { stunde: STUNDEN[0], morgen: true };
}

// Bestellungen, die der Auto-Push beim naechsten Lauf mitnimmt (gleiche Bedingungen wie dort,
// Eingang ist bereits derived_status=bestellt: nicht storniert, noch nicht an SER)
function istAutoPushKandidat(o) {
  return o.done !== true && o.in_ser_fvk === true && !!o.customer_number;
}

module.exports = { STUNDEN, berlinStunde, naechsteUebertragung, istAutoPushKandidat };
