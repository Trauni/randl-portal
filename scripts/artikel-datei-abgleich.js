/**
 * #617: Überarbeitete Artikeldatei (CSV je Tab, Semikolon) gegen Portal-Stamm und Lexware legen. Nur lesend.
 *
 *   node scripts/artikel-datei-abgleich.js <Ordner mit CSV-Dateien> [Ausgabeordner]
 *
 * Mit --inaktiv-setzen werden danach alle Portal-Artikel, die NICHT in der Datei stehen, auf inaktiv gesetzt (nur diese Option
 * schreibt; ohne sie wird nur gelesen). Ohne --ja zeigt der Lauf nur, wie viele es wären.
 *   node scripts/artikel-datei-abgleich.js <Ordner> [Ausgabeordner] --inaktiv-setzen [--ja]
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
const { setzeInaktiv } = require('../src/services/artikelInaktiv');
const { leseCsv, gleicheAb, dekodiere } = require('../src/utils/artikelDateiAbgleich');

(async () => {
  const args = process.argv.slice(2);
  const [ordner, aus = path.join(ordner || '.', 'ergebnis')] = args.filter((a) => !a.startsWith('--'));
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

  if (args.includes('--inaktiv-setzen')) {
    const offen = r.nurPortal.filter((x) => x.aktiv === 'ja');
    console.log(`\nNicht in der Datei und noch aktiv: ${offen.length} (schon inaktiv: ${r.nurPortal.length - offen.length})`);
    for (const x of offen) console.log(`    ${x.artikel_nr}  ${x.bezeichnung}`);
    if (!args.includes('--ja')) console.log('\nNichts geändert. Zum Setzen den Befehl mit --ja wiederholen.');
    else console.log('\nGesetzt:', await setzeInaktiv(getPool(), offen.map((x) => x.artikel_nr)));
  }
  process.exit(0);
})().catch((e) => { console.error('Fehler:', e.message); process.exit(1); });
