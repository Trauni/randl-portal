/**
 * #617: Überarbeitete Artikeldatei (CSV je Tab, Semikolon) gegen Portal-Stamm und Lexware legen. Nur lesend.
 *
 *   node scripts/artikel-datei-abgleich.js <Ordner mit CSV-Dateien> [Ausgabeordner]
 *
 * Schreibt abgleich.csv (eine Zeile je Datei-Artikel mit Namen, Einheit, Preis aus Datei, Portal und Lexware,
 * Spalte "unterschiede"), nur-portal.csv und nur-lexware.csv. Die Dateien bleiben außerhalb des Repos.
 */
require('dotenv').config({ override: true });
const fs = require('fs');
const path = require('path');
const lexware = require('../src/services/lexware');
const { getPool } = require('../src/db');
const { alsCsv } = require('../src/utils/lexwareArtikelAnalyse');
const { leseCsv, gleicheAb, dekodiere } = require('../src/utils/artikelDateiAbgleich');

(async () => {
  const [ordner, aus = path.join(ordner || '.', 'ergebnis')] = process.argv.slice(2);
  if (!ordner) throw new Error('Aufruf: node scripts/artikel-datei-abgleich.js <Ordner mit CSV> [Ausgabeordner]');
  const dateien = fs.readdirSync(ordner).filter((f) => f.toLowerCase().endsWith('.csv'));
  const datei = dateien.flatMap((f) => leseCsv(dekodiere(fs.readFileSync(path.join(ordner, f)))));
  console.log(`Datei: ${datei.length} Artikel aus ${dateien.join(', ')}`);

  const [stamm] = await getPool().query('SELECT artikel_nr, bezeichnung, einheit, preis_netto_cent, aktiv FROM gas_artikel');
  const r = gleicheAb(datei, stamm, await lexware.listArticles());

  fs.mkdirSync(aus, { recursive: true });
  const schreibe = (name, zeilen, spalten) => { fs.writeFileSync(path.join(aus, name), alsCsv(zeilen, spalten)); console.log(`${name}: ${zeilen.length}`); };
  schreibe('abgleich.csv', r.zeilen, ['nummer', 'nameDatei', 'namePortal', 'nameLexware', 'einheitDatei', 'einheitPortal', 'einheitLexware', 'preisDatei', 'preisPortal', 'preisLexware', 'imPortal', 'inLexware', 'unterschiede']);
  schreibe('nur-portal.csv', r.nurPortal, ['artikel_nr', 'bezeichnung', 'aktiv']);
  schreibe('nur-lexware.csv', r.nurLexware, ['nummer', 'bezeichnung', 'einheit']);
  const mit = r.zeilen.filter((z) => z.unterschiede).length;
  console.log(`Mit Unterschieden: ${mit} von ${r.zeilen.length}; nicht im Portal: ${r.nurDatei.length}; nicht in Lexware: ${r.zeilen.filter((z) => z.inLexware === 'nein').length}`);
  process.exit(0);
})().catch((e) => { console.error('Fehler:', e.message); process.exit(1); });
