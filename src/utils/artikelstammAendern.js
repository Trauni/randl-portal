/**
 * Artikelstamm bearbeiten: erlaubte Felder prüfen und normalisieren.
 * Ein Feld, das in `eingabe` fehlt, bleibt unberührt; `null` oder '' leert es.
 */

const { GRUPPEN: EK_GRUPPEN } = require('../services/gasEkPreise');
const { GASART_REIHENFOLGE } = require('../services/gasStamm');

const TYPEN = ['F', 'P', 'S', 'V'];
const TYP_NAME = { F: 'Füllung', P: 'Pfand/Leergut', S: 'Steuer/Nutzung (Kaufflasche)', V: 'Provision' };

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
  typ: { parse: v => { const t = String(v).trim().toUpperCase(); if (!TYPEN.includes(t)) throw new Error(`Typ: ${TYPEN.join(', ')}`); return t; }, nullable: false },
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

/** Nur Füllungen haben Gasart, Pfand-/Kaufflasche und Einkaufs-Preisgruppe. */
const NUR_FUELLUNG = ['gasart', 'kategorie', 'kg_fuellung', 'pfand_artikel_nr', 'kaufflasche_artikel_nr', 'ek_gruppe'];

/**
 * Was automatisch mitgeändert wird, wenn ein Artikel zu etwas anderem als einer Füllung wird (Kappe, Palette, Pfand ...):
 * die Felder, die nur eine Füllung haben kann, werden geleert; ohne Shop-Kennzeichen wird er ausgeblendet.
 */
function folgenAusTypwechsel(neuerTyp, zeile) {
  if (neuerTyp === 'F') return {};
  const extra = {};
  for (const f of NUR_FUELLUNG) if (!leer(zeile[f])) extra[f] = null;
  if (zeile.shop_sichtbar == null) extra.shop_sichtbar = 0;
  return extra;
}

/** Regeln für den Endzustand eines Artikels: Fehlertexte (leer = in Ordnung). */
function pruefeZustand(nr, z) {
  const fehler = [];
  const keineFuellung = z.typ && z.typ !== 'F';
  if (keineFuellung && !leer(z.gasart)) fehler.push(`${nr}: ${TYP_NAME[z.typ] || z.typ} hat keine Gasart (nur Füllungen)`);
  if (keineFuellung && !leer(z.pfand_artikel_nr)) fehler.push(`${nr}: ${TYP_NAME[z.typ] || z.typ} hat keine Pfandflasche (nur Füllungen)`);
  if (keineFuellung && !leer(z.kaufflasche_artikel_nr)) fehler.push(`${nr}: ${TYP_NAME[z.typ] || z.typ} hat keine Kaufflasche (nur Füllungen)`);
  if (!leer(z.pfand_artikel_nr) && !leer(z.kaufflasche_artikel_nr)) fehler.push(`${nr}: Pfandflasche und Kaufflasche schließen sich aus, eine Füllung hat entweder oder`);
  return fehler;
}

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
  if (TYPEN.includes(typ) && !weitere.length) fehler.push(...pruefeZustand(nummer, { typ, ...werte }));
  if (fehler.length) return { werte: {}, fehler };
  return { artikel_nr: nummer, werte: { bezeichnung: String(bezeichnung).trim(), typ, ...werte }, fehler };
}

module.exports = { pruefeAenderung, pruefeNeuanlage, pruefeZustand, folgenAusTypwechsel, FELDER, TYPEN, TYP_NAME, NUR_FUELLUNG };
