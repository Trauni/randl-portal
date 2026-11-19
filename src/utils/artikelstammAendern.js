/**
 * Artikelstamm bearbeiten: erlaubte Felder prüfen und normalisieren.
 * Ein Feld, das in `eingabe` fehlt, bleibt unberührt; `null` oder '' leert es.
 */

const { GRUPPEN: EK_GRUPPEN } = require('../services/gasEkPreise');
const { GASART_REIHENFOLGE } = require('../services/gasStamm');

const KATEGORIE_ZU_FAKTOR = { 50: 1, 3: 2, 1: 3 };
const leer = v => v === null || v === undefined || (typeof v === 'string' && v.trim() === '');
const txt = (max) => v => {
  const t = String(v).trim();
  if (t.length > max) throw new Error(`höchstens ${max} Zeichen`);
  return t;
};
const zahl = (min, max, ganz = false) => v => {
  const n = Number(String(v).replace(',', '.'));
  if (!Number.isFinite(n) || n < min || n > max) throw new Error(`Zahl zwischen ${min} und ${max} erwartet`);
  if (ganz && !Number.isInteger(n)) throw new Error('ganze Zahl erwartet');
  return n;
};

// feld → { parse, nullable }
const FELDER = {
  bezeichnung: { parse: txt(120), nullable: false },
  aktiv: { parse: v => (v === true || v === 1 || v === '1' || v === 'true' ? 1 : v === false || v === 0 || v === '0' || v === 'false' ? 0 : (() => { throw new Error('Ja/Nein erwartet'); })()), nullable: false },
  un_nr: { parse: v => { const t = String(v).trim().replace(/^UN\s*/i, ''); if (!/^\d{4}$/.test(t)) throw new Error('UN-Nummer hat 4 Ziffern'); return t; }, nullable: true },
  gefahrklasse: { parse: v => { const t = String(v).trim(); if (!/^\d(\.\d)?$/.test(t)) throw new Error('Gefahrklasse wie 2.1'); return t; }, nullable: true },
  ggvs_faktor: { parse: zahl(1, 50, true), nullable: true },
  fuellgewicht_kg: { parse: zahl(0, 9999), nullable: true },
  bezadr: { parse: txt(120), nullable: true },
  fuellmenge: { parse: zahl(0, 99999), nullable: true },
  fuellmenge_einheit: { parse: v => { const t = String(v).trim().toLowerCase(); if (t !== 'kg' && t !== 'l') throw new Error('kg oder l erwartet'); return t; }, nullable: true },
  preis_netto_cent: { parse: zahl(0, 100000000, true), nullable: true },
  mwst_satz: { parse: zahl(0, 30), nullable: true },
  shop_sichtbar: { parse: v => (v === true || v === 1 || v === '1' || v === 'true' ? 1 : v === false || v === 0 || v === '0' || v === 'false' ? 0 : (() => { throw new Error('Ja/Nein erwartet'); })()), nullable: true },
  gasart: { parse: v => { const t = String(v).trim(); if (!GASART_REIHENFOLGE.includes(t)) throw new Error('Gasart unbekannt'); return t; }, nullable: true },
  ek_gruppe: { parse: v => { const t = String(v).trim(); if (!EK_GRUPPEN[t]) throw new Error(`Preisgruppe: ${Object.keys(EK_GRUPPEN).join(' oder ')}`); return t; }, nullable: true },
  pfand_artikel_nr: { parse: txt(16), nullable: true },
  kaufflasche_artikel_nr: { parse: txt(16), nullable: true },
};

/**
 * @returns {{ werte: object, fehler: string[] }} werte = Spalte → Wert (inkl. abgeleiteter Beförderungskategorie)
 */
function pruefeAenderung(eingabe) {
  const werte = {};
  const fehler = [];
  for (const [feld, wert] of Object.entries(eingabe || {})) {
    const def = FELDER[feld];
    if (!def) { fehler.push(`${feld}: Feld nicht änderbar`); continue; }
    if (leer(wert)) {
      if (!def.nullable) fehler.push(`${feld}: darf nicht leer sein`);
      else werte[feld] = null;
      continue;
    }
    try { werte[feld] = def.parse(wert); } catch (e) { fehler.push(`${feld}: ${e.message}`); }
  }
  if ('ggvs_faktor' in werte) werte.befoerderungskategorie = KATEGORIE_ZU_FAKTOR[werte.ggvs_faktor] ?? null;
  if (!Object.keys(werte).length && !fehler.length) fehler.push('Keine Änderung angegeben');
  return { werte, fehler };
}

const TYPEN = ['F', 'P', 'S', 'V'];

/** Neuen Artikel von Hand anlegen: Nummer, Bezeichnung und Typ sind Pflicht, der Rest wie bei der Bearbeitung. */
function pruefeNeuanlage(eingabe) {
  const { artikel_nr: nr, bezeichnung, typ, ...rest } = eingabe || {};
  const fehler = [];
  const nummer = String(nr ?? '').trim();
  if (!/^[A-Za-z0-9_-]{1,16}$/.test(nummer)) fehler.push('artikel_nr: 1 bis 16 Zeichen (Buchstaben, Ziffern, - und _)');
  if (leer(bezeichnung)) fehler.push('bezeichnung: darf nicht leer sein');
  else if (String(bezeichnung).trim().length > 120) fehler.push('bezeichnung: höchstens 120 Zeichen');
  if (!TYPEN.includes(typ)) fehler.push(`typ: eines von ${TYPEN.join(', ')}`);

  const { werte, fehler: weitere } = Object.keys(rest).length ? pruefeAenderung(rest) : { werte: {}, fehler: [] };
  fehler.push(...weitere);
  if (fehler.length) return { werte: {}, fehler };
  return { artikel_nr: nummer, werte: { bezeichnung: String(bezeichnung).trim(), typ, ...werte }, fehler };
}

module.exports = { pruefeAenderung, pruefeNeuanlage, FELDER, TYPEN };
