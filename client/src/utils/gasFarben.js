// Schulterfarben von Gasflaschen nach DIN EN 1089-3 (vereinfacht, eine Farbe je Gasart).
// Mischgase (Arcox, Biergas, Formiergas) zeigen die Farbe des Hauptbestandteils bzw. die übliche Kennfarbe.
// Gasart wie in gas_artikel.gasart (Gas-Auswertung).
const FARBEN = {
  'Propan': '#b3261e',            // brennbar: rot
  'Propan Treibgas': '#b3261e',
  'Campingaz': '#b3261e',
  'Formiergas': '#b3261e',        // enthält Wasserstoff
  'CO2': '#8a8d8f',               // grau
  'Biergas': '#8a8d8f',           // CO2/Stickstoff: grau
  'Sauerstoff': '#ffffff',        // weiß
  'Acetylen': '#6b2e1f',          // kastanienbraun
  'Argon': '#2f6b3a',             // dunkelgrün
  'Arcox (Mischgas)': '#3e9a45',  // Mischgas: hellgrün
  'Stickstoff': '#1f1d1b',        // schwarz
  'Ballongas/Helium': '#8a5a2b',  // Helium: braun
};

/** Farbe für die Schulter, null wenn die Gasart unbekannt ist (Symbol zeigt dann eine leere Flasche). */
export const gasFarbe = (gasart) => FARBEN[gasart] ?? null;

export const GAS_FARBEN = FARBEN;

/** Pfand- und Leergutflaschen: neutrales Grau, weil sie keine eigene Gasart haben. */
export const PFAND_FARBE = '#8a8d8f';
