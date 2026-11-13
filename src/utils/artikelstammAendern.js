/**
 * Artikelstamm bearbeiten: erlaubte Felder prüfen und normalisieren.
 * Ein Feld, das in `eingabe` fehlt, bleibt unberührt; `null` oder '' leert es.
 */

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
  inhalt_l: { parse: zahl(0, 99999), nullable: true },
  preis_netto_cent: { parse: zahl(0, 100000000, true), nullable: true },
  mwst_satz: { parse: zahl(0, 30), nullable: true },
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

module.exports = { pruefeAenderung, FELDER };
