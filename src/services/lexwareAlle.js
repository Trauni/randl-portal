/**
 * #617: Alle Lexware-Artikel für die Artikelliste, direkt aus Lexware (eine Anfrage je 250 Artikel) mit kurzem Zwischenspeicher.
 * Damit sieht die Liste auch PFAND- und GZ-Artikel, die der Shop-Cache (nur RG-/NRG-) nicht kennt.
 */
const lexware = require('./lexware');

const GUELTIG_MS = 5 * 60 * 1000;
let speicher = { zeit: 0, artikel: null, lauf: null };

async function ladeAlleLexware({ jetzt = Date.now(), laden = () => lexware.listArticles() } = {}) {
  if (speicher.artikel && jetzt - speicher.zeit < GUELTIG_MS) return speicher.artikel;
  if (speicher.lauf) return speicher.lauf;   // gleichzeitige Aufrufe teilen sich eine Anfrage
  speicher.lauf = laden().then((a) => { speicher = { zeit: jetzt, artikel: a, lauf: null }; return a; })
    .catch((err) => { speicher.lauf = null; throw err; });
  return speicher.lauf;
}

/** Für Tests und nach Änderungen in Lexware. */
const vergesse = () => { speicher = { zeit: 0, artikel: null, lauf: null }; };

/** PFAND- und GZ-Artikel in der Form, die die Artikelliste von loadGasArticles kennt (ohne Preis-Tool). */
function alsListenArtikel(artikel) {
  return (artikel || [])
    .filter((a) => !a.archived && /^(PFAND|GZ)-/i.test(String(a.articleNumber || '').trim()))
    .map((a) => ({
      id: a.id, articleNumber: String(a.articleNumber).trim(), name: a.title || '', netPrice: a.price?.netPrice ?? null,
      tags: String(a.note || '').split('\n').map((s) => s.trim()).filter(Boolean), content: null, einheit: a.unitName || null, preisTool: false,
    }));
}

module.exports = { ladeAlleLexware, alsListenArtikel, vergesse };
