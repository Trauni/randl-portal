/**
 * #617: Artikeldatei (Excel-Export der Lexware-Artikel, von Hand überarbeitet) gegen Portal-Stamm und Lexware legen.
 * Reine Auswertung, schreibt nichts. Schlüssel ist die Artikelnummer; im Stamm steht sie ohne Präfix (RG-, PFAND-, GZ- …).
 */
const { ohnePraefix } = require('./lexwareArtikelAnalyse');

/** CSV mit Semikolon, Anführungszeichen und Zeilenumbrüchen in Feldern → Zeilen als Objekte (Kopfzeile = Schlüssel). */
function leseCsv(text) {
  const t = String(text).replace(/^﻿/, '');
  const zeilen = [];
  let feld = '', zeile = [], imText = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (imText) {
      if (c === '"' && t[i + 1] === '"') { feld += '"'; i++; } else if (c === '"') imText = false; else feld += c;
    } else if (c === '"') imText = true;
    else if (c === ';') { zeile.push(feld); feld = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && t[i + 1] === '\n') i++;
      zeile.push(feld); feld = '';
      if (zeile.some((x) => x !== '')) zeilen.push(zeile);
      zeile = [];
    } else feld += c;
  }
  if (feld !== '' || zeile.length) { zeile.push(feld); if (zeile.some((x) => x !== '')) zeilen.push(zeile); }
  const [kopf = [], ...rest] = zeilen;
  return rest.map((z) => Object.fromEntries(kopf.map((k, i) => [k.trim(), (z[i] ?? '').trim()])));
}

/** Excel speichert CSV meist als Windows-Latin-1, andere Programme als UTF-8: erst streng UTF-8 versuchen, sonst Latin-1. */
function dekodiere(buffer) {
  try { return new TextDecoder('utf-8', { fatal: true }).decode(buffer); } catch { return buffer.toString('latin1'); }
}

const zahl = (v) => {
  if (v == null || v === '') return null;
  const n = Number(String(v).replace(/\./g, (m, o, s) => (s.includes(',') ? '' : m)).replace(',', '.'));
  return Number.isFinite(n) ? n : null;
};
const cent = (euro) => (euro == null ? null : Math.round(euro * 100));
const norm = (s) => String(s || '').replace(/\s+/g, ' ').trim();

/**
 * datei:   { Artikelnummer, Bezeichnung, Einheit, 'VK (Netto)' } je Zeile
 * stamm:   gas_artikel { artikel_nr, bezeichnung, einheit, preis_netto_cent, aktiv }
 * lexware: Artikel von GET /articles
 */
function gleicheAb(datei, stamm, lexware) {
  const lexNachNr = new Map();
  for (const a of (lexware || []).filter((x) => !x.archived)) if (a.articleNumber) lexNachNr.set(String(a.articleNumber).trim(), a);
  const stammNachNr = new Map((stamm || []).map((s) => [String(s.artikel_nr), s]));
  const dateiNr = new Set();

  const zeilen = [];
  for (const d of datei) {
    const nr = norm(d.Artikelnummer);
    if (!nr) continue;
    dateiNr.add(nr);
    const s = stammNachNr.get(ohnePraefix(nr));
    const l = lexNachNr.get(nr);
    const name = norm(d.Bezeichnung);
    const preisDatei = cent(zahl(d['VK (Netto)']));
    const preisLex = l?.price?.netPrice == null ? null : cent(Number(l.price.netPrice));
    const unterschiede = [];
    if (s && norm(s.bezeichnung) !== name) unterschiede.push('Name Portal');
    if (l && norm(l.title) !== name) unterschiede.push('Name Lexware');
    if (l && norm(l.unitName) !== norm(d.Einheit)) unterschiede.push('Einheit Lexware');
    if (s && s.preis_netto_cent != null && preisDatei != null && Number(s.preis_netto_cent) !== preisDatei) unterschiede.push('Preis Portal');
    if (l && preisLex != null && preisDatei != null && preisLex !== preisDatei) unterschiede.push('Preis Lexware');
    zeilen.push({
      nummer: nr, nameDatei: name, namePortal: s ? norm(s.bezeichnung) : '', nameLexware: l ? norm(l.title) : '',
      einheitDatei: norm(d.Einheit), einheitPortal: s?.einheit || '', einheitLexware: l ? norm(l.unitName) : '',
      preisDatei: preisDatei == null ? '' : (preisDatei / 100).toFixed(2),
      preisPortal: s?.preis_netto_cent == null ? '' : (Number(s.preis_netto_cent) / 100).toFixed(2),
      preisLexware: preisLex == null ? '' : (preisLex / 100).toFixed(2),
      imPortal: s ? 'ja' : 'nein', inLexware: l ? 'ja' : 'nein',
      unterschiede: unterschiede.join('; '),
    });
  }

  const dateiOhnePraefix = new Set([...dateiNr].map(ohnePraefix));
  const nurPortal = (stamm || []).filter((s) => !dateiOhnePraefix.has(String(s.artikel_nr)))
    .map((s) => ({ artikel_nr: String(s.artikel_nr), bezeichnung: s.bezeichnung || '', aktiv: Number(s.aktiv) ? 'ja' : 'nein' }))
    .sort((a, b) => a.artikel_nr.localeCompare(b.artikel_nr));
  const praefixeDatei = new Set([...dateiNr].map((n) => (n.match(/^([A-Za-z]+)-/)?.[1] || '').toUpperCase()));
  const nurLexware = [...lexNachNr.values()]
    .filter((a) => !dateiNr.has(String(a.articleNumber).trim()) && praefixeDatei.has((String(a.articleNumber).match(/^([A-Za-z]+)-/)?.[1] || '').toUpperCase()))
    .map((a) => ({ nummer: a.articleNumber, bezeichnung: a.title || '', einheit: a.unitName || '' }))
    .sort((a, b) => a.nummer.localeCompare(b.nummer));

  return { zeilen, nurPortal, nurLexware, nurDatei: zeilen.filter((z) => z.imPortal === 'nein') };
}

/**
 * Was müsste in Lexware geändert werden, damit es der Datei entspricht? (Nummer, Bezeichnung, Einheit; Preise nie)
 * Zuordnung: erst gleiche Nummer; sonst dieselbe Nummer ohne Präfix, wenn sie in Lexware genau einmal vorkommt
 * (PFAND-5900000 in Lexware ↔ GZ-5900000 in der Datei: das Präfix wird mitgeändert).
 * Ergebnis: { aenderungen: [{ id, nummerAlt, alt: {articleNumber,title,unitName}, neu: {…nur geänderte Felder}, felder: [...] }],
 *             unveraendert, fehlenInLexware: [Nummer], mehrdeutig: [Nummer] }
 */
function planeLexwareAenderung(datei, lexware) {
  const aktiv = (lexware || []).filter((a) => !a.archived && a.articleNumber);
  const nachNr = new Map(aktiv.map((a) => [String(a.articleNumber).trim(), a]));
  const nachKern = new Map();
  for (const a of aktiv) {
    const k = ohnePraefix(String(a.articleNumber).trim());
    nachKern.set(k, [...(nachKern.get(k) || []), a]);
  }
  const dateiNrn = new Set(datei.map((d) => norm(d.Artikelnummer)));
  const aenderungen = [], fehlenInLexware = [], mehrdeutig = [];
  let unveraendert = 0;
  for (const d of datei) {
    const nr = norm(d.Artikelnummer);
    if (!nr) continue;
    let a = nachNr.get(nr);
    if (!a) {
      const kandidaten = (nachKern.get(ohnePraefix(nr)) || []).filter((x) => !dateiNrn.has(String(x.articleNumber).trim()));
      if (kandidaten.length > 1) { mehrdeutig.push(nr); continue; }
      a = kandidaten[0];
    }
    if (!a) { fehlenInLexware.push(nr); continue; }
    const neu = {};
    if (String(a.articleNumber).trim() !== nr) neu.articleNumber = nr;
    if (norm(d.Bezeichnung) && norm(a.title) !== norm(d.Bezeichnung)) neu.title = norm(d.Bezeichnung);
    if (norm(d.Einheit) && norm(a.unitName) !== norm(d.Einheit)) neu.unitName = norm(d.Einheit);
    if (!Object.keys(neu).length) { unveraendert++; continue; }
    aenderungen.push({ id: a.id, nummerAlt: String(a.articleNumber).trim(), alt: { articleNumber: a.articleNumber, title: a.title, unitName: a.unitName }, neu, felder: Object.keys(neu) });
  }
  aenderungen.sort((x, y) => x.nummerAlt.localeCompare(y.nummerAlt));
  return { aenderungen, unveraendert, fehlenInLexware, mehrdeutig };
}

module.exports = { leseCsv, gleicheAb, zahl, dekodiere, planeLexwareAenderung };
