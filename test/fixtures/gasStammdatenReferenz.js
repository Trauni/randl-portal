/**
 * Referenzdaten der Gas-Auswertung (#460), bis #604 fest im Code (src/services/gasStammdaten.js).
 * Seit #604 liest die Auswertung gas_artikel und price_change_log. Diese Datei bleibt als Testreferenz
 * (Abnahmewerte HANDOFF-460) und als Vorlage für migration_gas_vk_stamm_604.sql erhalten.
 * Quelle: docs/gas-auswertung/referenz/python (flaschen.py, preise.py, historie.py).
 */

// artikel_nr -> [Bezeichnung, kg bzw. Liter je Flasche]
const NAME = {
  5909040: ['R904 Füllung 1,8 kg Campingaz', 1.8], 5909070: ['R907 Füllung 2,75 kg Campingaz', 2.75],
  5920100: ['Ballongas Typ 10, 1,8 m³', 10], 5920200: ['Helium Ballongas Füllung 20 L', 20],
  7801000: ['5-kg Brenngas Camping', 5], 7801050: ['8-kg Brenngas BBQ-Fla.', 8], 7801100: ['11-kg Brenngas Camping', 11],
  7801200: ['11-kg Brenngas Pfand', 11], 7801250: ['11-kg Brenngas ALUGAS', 11], 7801300: ['33-kg Brenngas Pfand', 33],
  7801800: ['5-kg Brenngas Pfand', 5], 7802000: ['11-kg MOTOGAS Pfand', 11], 7802010: ['11-kg BLUETEC Pfand', 11],
  T001: ['Biergas 70/30 20 L', 20], T002: ['10 kg CO2 Theke Lebensmittel', 10], T003: ['20 kg CO2 Lebensmittel', 20],
  T004: ['6 kg CO2 Theke Lebensmittel', 6], T005: ['10 kg CO2 Theke Lebensmittel Steigrohr', 10], T006: ['2 kg CO2 Theke Lebensmittel', 2],
  T007: ['Biergas 70/30 50 L', 50], T010: ['Argon 4.6 10 L', 10], T011: ['Argon 4.6 20 L', 20], T012: ['Argon 4.6 50 L', 50],
  T015: ['Arcox18 20 L', 2], T016: ['Arcox18 10 L', 2], T017: ['Arcox18 50 L', 2], T020: ['Sauerstoff 20 L', 20],
  T021: ['Sauerstoff 10 L', 10], T022: ['Sauerstoff 50 L', 50], T030: ['Stickstoff 5.0 50 L', 50], T031: ['Stickstoff 5.0 10 L', 10],
  T033: ['Stickstoff 5.0 20 L', 20], T035: ['Acetylen 10 L', 5], T036: ['Acetylen 20 L', 10], T037: ['Acetylen 50 L', 25],
  T038: ['Formiergas 90/10 10 L', 10],
};

const gasartVon = (a) => {
  if (a.startsWith('7801')) return 'Propan';
  if (a.startsWith('7802')) return 'Propan Treibgas';
  if (a.startsWith('5909')) return 'Campingaz';
  if (a.startsWith('5920')) return 'Ballongas/Helium';
  const n = parseInt(a.slice(1), 10);
  if (n === 1 || n === 7) return 'Biergas';
  if (n >= 2 && n <= 6) return 'CO2';
  if (n >= 10 && n <= 12) return 'Argon';
  if (n >= 15 && n <= 17) return 'Arcox (Mischgas)';
  if (n >= 20 && n <= 22) return 'Sauerstoff';
  if (n >= 30 && n <= 33) return 'Stickstoff';
  if (n >= 35 && n <= 37) return 'Acetylen';
  return 'Formiergas';
};

const KG_ARTEN = new Set(['Propan', 'Propan Treibgas', 'CO2', 'Campingaz']); // nur hier ist die Füllmenge in kg

const ARTIKEL = Object.fromEntries(Object.entries(NAME).map(([nr, [bez, menge]]) => {
  const gasart = gasartVon(nr);
  return [nr, { artikel_nr: nr, bezeichnung: bez, gasart, kg_fuellung: KG_ARTEN.has(gasart) ? menge : null }];
}));

const GASART_REIHENFOLGE = ['Propan', 'Propan Treibgas', 'CO2', 'Biergas', 'Campingaz', 'Argon', 'Arcox (Mischgas)', 'Sauerstoff', 'Stickstoff', 'Acetylen', 'Formiergas', 'Ballongas/Helium'];

// Listenpreis netto je Füllung (aktuell) und Preisänderungen: [gültig ab, Preis davor]
const VK_AKTUELL = {
  5909040: 26.89, 5909070: 28.89, 5920050: 515, 5920100: 150, 5920200: 255, 7801000: 14.97, 7801050: 18.48, 7801100: 30.80,
  7801200: 30.80, 7801250: 30.80, 7801300: 98.30, 7801800: 14.97, 7802000: 35.13, 7802010: 37.22,
  T001: 64.20, T002: 48.15, T003: 64.20, T004: 42.80, T005: 48.15, T006: 26.07, T007: 64.20, T010: 58.85, T011: 74.90, T012: 96.30,
  T015: 64.20, T016: 48.15, T017: 90.95, T020: 48.15, T021: 42.80, T022: 69.55, T030: 90.95, T031: 69.55, T032: 481.50, T033: 80.25,
  T035: 75.00, T036: 75.00, T037: 95.00,
};
const VK_AENDERUNGEN = {
  7801000: [['2026-10-13', 14.27]], 7801050: [['2026-10-13', 17.36]], 7801100: [['2026-10-13', 29.26]], 7801200: [['2026-10-13', 29.26]],
  7801250: [['2026-10-06', 27.17], ['2026-10-13', 29.26]], 7801300: [['2026-10-13', 93.68]], 7801800: [['2026-10-13', 14.27]],
  7802000: [['2026-10-06', 31.50], ['2026-10-13', 33.59]], 7802010: [['2026-10-06', 31.50], ['2026-10-13', 35.68]],
  T002: [['2026-10-07', 45.00]], T003: [['2026-10-07', 70.00]], T004: [['2026-10-07', 40.00]], T005: [['2026-10-07', 45.00]],
  T006: [['2026-10-07', 24.36]], T012: [['2026-10-07', 94.30]], T022: [['2026-10-07', 48.15]], T030: [['2026-10-07', 85.00]],
  T031: [['2026-10-07', 65.00]], T032: [['2026-10-07', 450.00]], T033: [['2026-10-07', 75.00]],
};

/** Listenpreis netto am Belegtag (ISO), null wenn unbekannt. */
function listenpreis(artikel, iso) {
  for (const [ab, davor] of VK_AENDERUNGEN[artikel] || []) if (iso < ab) return davor;
  return VK_AKTUELL[artikel] ?? null;
}

/** Referenz in der Form der Tabellen: gas_artikel-Zeilen und price_change_log-Änderungen (für gasStamm.baueStamm). */
function stammZeilen() {
  const nummern = [...new Set([...Object.keys(ARTIKEL), ...Object.keys(VK_AKTUELL)])];
  const artikel = nummern.map((nr) => {
    const a = ARTIKEL[nr];
    return {
      artikel_nr: nr, bezeichnung: a ? a.bezeichnung : `Artikel ${nr} (Bezeichnung fehlt)`, gasart: a ? a.gasart : null,
      kg_fuellung: a ? a.kg_fuellung : null, typ: 'F', zaehlt_als_flasche: a ? 1 : 0,
      preis_netto_cent: VK_AKTUELL[nr] == null ? null : Math.round(VK_AKTUELL[nr] * 100),
    };
  });
  const aenderungen = [];
  for (const [nr, liste] of Object.entries(VK_AENDERUNGEN)) {
    liste.forEach(([ab, davor], i) => {
      const danach = i + 1 < liste.length ? liste[i + 1][1] : VK_AKTUELL[nr];
      aenderungen.push({ article_number: `RG-${nr}`, datum: ab, old_net: davor, new_net: danach });
    });
  }
  return { artikel, aenderungen };
}

module.exports = { ARTIKEL, GASART_REIHENFOLGE, KG_ARTEN, listenpreis, VK_AKTUELL, VK_AENDERUNGEN, NAME, stammZeilen };
