/**
 * #617: Artikel aus dem Portal-Stamm in Lexware anlegen (nur wenn es die Nummer dort noch nicht gibt). Reine Planung, schreibt nichts.
 * Präfix nach Typ: P = PFAND-, Z und D = GZ-, F = RG-; für andere Typen mit ausdrücklichem praefix.
 */
const { ohnePraefix, praefixVon } = require('./lexwareArtikelAnalyse');

const PRAEFIX_NACH_TYP = { P: 'PFAND', Z: 'GZ', D: 'GZ', F: 'RG' };
const norm = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();

/**
 * stamm: Zeilen aus gas_artikel { artikel_nr, bezeichnung, typ, einheit, preis_netto_cent, mwst_satz }
 * lexware: Artikel von GET /articles
 * Ergebnis: { zeilen: [{ artikel_nr, lexware_nummer, payload }], fehler: ['…'] }
 */
function planeLexwareAnlage(stamm, lexware, nummern, { praefix } = {}) {
  const stammNachNr = new Map((stamm || []).map((s) => [String(s.artikel_nr), s]));
  const lexNachKern = new Map();
  for (const a of (lexware || []).filter((x) => x.articleNumber)) {
    const nr = String(a.articleNumber).trim();
    lexNachKern.set(ohnePraefix(nr), [...(lexNachKern.get(ohnePraefix(nr)) || []), nr]);
  }
  const zeilen = [], fehler = [];
  for (const nr of [...new Set((nummern || []).map(String))]) {
    const s = stammNachNr.get(nr);
    if (!s) { fehler.push(`${nr}: nicht im Portal-Stamm`); continue; }
    const p = (praefix || PRAEFIX_NACH_TYP[s.typ] || '').toUpperCase();
    if (!p) { fehler.push(`${nr}: für den Typ ${s.typ || '–'} gibt es kein Standard-Präfix, bitte --praefix angeben`); continue; }
    const vorhanden = lexNachKern.get(nr);
    if (vorhanden) { fehler.push(`${nr}: gibt es in Lexware schon (${vorhanden.join(', ')})`); continue; }
    const titel = norm(s.bezeichnung);
    if (!titel) { fehler.push(`${nr}: keine Bezeichnung`); continue; }
    if (s.preis_netto_cent == null) { fehler.push(`${nr}: kein Nettopreis im Portal (bitte erst eintragen)`); continue; }
    const mwst = s.mwst_satz == null ? 19 : Number(s.mwst_satz);
    zeilen.push({
      artikel_nr: nr, lexware_nummer: `${p}-${nr}`,
      payload: {
        title: titel, type: s.typ === 'D' ? 'SERVICE' : 'PRODUCT', articleNumber: `${p}-${nr}`, unitName: norm(s.einheit) || 'Stück',
        price: { netPrice: Math.round(Number(s.preis_netto_cent)) / 100, leadingPrice: 'NET', taxRate: mwst },
      },
    });
  }
  return { zeilen, fehler };
}

module.exports = { planeLexwareAnlage, PRAEFIX_NACH_TYP, praefixVon };
