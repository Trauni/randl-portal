// Felder des Artikelstamms für die Bearbeitung: [Spalte, Beschriftung, Eingabe-Typ, Hinweis]
// Typ: text | select:a,b | pfand | kauf | gasart | ekgruppe. Geprüft wird im Backend (utils/artikelstammAendern.js).
import { GAS_FARBEN } from '../../../../utils/gasFarben';

export const GASARTEN = [...Object.keys(GAS_FARBEN), 'Sonstige'];
export const EK_GRUPPEN = { propan: 'Propan, je kg', motogas: 'Motogas / Bluetec, je Füllung' };

export const FELD = {
  bezeichnung: ['bezeichnung', 'Bezeichnung', 'text', 'Name wie in SER'],
  gasart: ['gasart', 'Gasart', 'gasart', 'für Auswertung und Flaschenfarbe'],
  mwst_satz: ['mwst_satz', 'MwSt. %', 'select:19,7', 'wie in Lexware'],
  aktiv: ['aktiv', 'Status', 'select:1,0', '1 = aktiv, 0 = inaktiv (nur aktive gehen an die Fahrer-App)'],
  shop_sichtbar: ['shop_sichtbar', 'Im Shop sichtbar', 'select:1,0', 'ersetzt das RG-/NRG-Kennzeichen in Lexware; leer = noch nicht gesetzt (dann gilt das Präfix)'],
  un_nr: ['un_nr', 'UN-Nr.', 'text', '4 Ziffern, z. B. 1965'],
  gefahrklasse: ['gefahrklasse', 'Gefahrzettel', 'text', 'z. B. 2.1'],
  bezadr: ['bezadr', 'ADR-Benennung', 'text', 'für das Beförderungspapier, z. B. ARGON, VERDICHTET, 2.2, ( E ), Bef.kat.3'],
  ggvs_faktor: ['ggvs_faktor', 'Beförderungskategorie', 'select:50,3,1', 'ADR 1.1.3.6: Faktor 50 = Kat. 1, 3 = Kat. 2, 1 = Kat. 3 (daraus die Punkte der Ladeliste)'],
  fuellgewicht_kg: ['fuellgewicht_kg', 'Gewicht (kg)', 'text', 'kg je Gebinde'],
  fuellmenge: ['fuellmenge', 'Füllmenge', 'text', 'Zahl, Einheit im nächsten Feld'],
  fuellmenge_einheit: ['fuellmenge_einheit', 'Einheit', 'select:kg,l', 'kg bei Brenngas/CO², Liter bei Technikgasen'],
  preis_netto_cent: ['preis_netto_cent', 'Netto-Preis (Cent)', 'text', 'z. B. 2926 für 29,26 €'],
  pfand_artikel_nr: ['pfand_artikel_nr', 'Pfandflasche', 'pfand', 'nötig für die Leergut-Rücknahme'],
  kaufflasche_artikel_nr: ['kaufflasche_artikel_nr', 'Kaufflasche', 'kauf', 'nur wenn die Flasche mitverkauft wird'],
  ek_gruppe: ['ek_gruppe', 'Preisgruppe Einkauf', 'ekgruppe', 'für den Rohertrag'],
};

// Felder der Mehrfachbearbeitung (wie auf der Artikelstamm-Seite, dazu Gasart und Preisgruppe)
export const EDIT_FELDER = [
  FELD.un_nr, FELD.gefahrklasse, FELD.ggvs_faktor, FELD.preis_netto_cent, FELD.mwst_satz, FELD.fuellgewicht_kg,
  FELD.fuellmenge, FELD.fuellmenge_einheit, FELD.bezadr, FELD.pfand_artikel_nr, FELD.kaufflasche_artikel_nr,
  FELD.gasart, FELD.ek_gruppe, FELD.shop_sichtbar, FELD.aktiv,
];

// Beschriftung der Auswahlwerte 1/0 je Feld
export const JA_NEIN = { aktiv: { 1: 'aktiv', 0: 'inaktiv' }, shop_sichtbar: { 1: 'ja', 0: 'nein' } };
