/**
 * Liest die Versorger-PDFs (Komplettstatistik, Transportleistung, Abrechnung Flaschen)
 * ohne externe Programme: Text-Elemente mit Position -> Zeilen -> Spalten.
 * Gas-Auswertung (#460)
 */
const fs = require('fs');

let pdfjsPromise;
const loadPdfjs = () => {
  if (!pdfjsPromise) pdfjsPromise = import('pdfjs-dist/legacy/build/pdf.mjs');
  return pdfjsPromise;
};

/** Liefert je Seite Zeilen; jede Zeile ist eine nach X sortierte Liste von Textstücken. */
async function leseZeilen(buffer) {
  const pdfjs = await loadPdfjs();
  const doc = await pdfjs.getDocument({ data: new Uint8Array(buffer), useSystemFonts: true, verbosity: 0 }).promise;
  const zeilen = [];
  for (let n = 1; n <= doc.numPages; n++) {
    const page = await (await doc.getPage(n)).getTextContent();
    const items = page.items
      .filter((i) => i.str && i.str.trim() !== '')
      .map((i) => ({ s: i.str.trim(), x: i.transform[4], y: i.transform[5] }));
    items.sort((a, b) => b.y - a.y || a.x - b.x);
    let cur = null;
    for (const it of items) {
      if (cur && Math.abs(cur.y - it.y) < 2.5) cur.teile.push(it);
      else { cur = { y: it.y, teile: [it] }; zeilen.push(cur); }
    }
  }
  return zeilen.map((z) => z.teile.sort((a, b) => a.x - b.x).map((t) => t.s));
}

const zahl = (s) => parseFloat(String(s).replace(/\./g, '').replace(',', '.'));
const datum = (s) => { const [d, m, y] = s.split('.'); return `${y}-${m}-${d}`; };

module.exports = { leseZeilen, zahl, datum, fs };
