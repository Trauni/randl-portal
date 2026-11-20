/**
 * #617 Schritt A2: Liest alle Artikel direkt aus Lexware und zählt, was drinsteht (Typen, Präfixe, Einheiten,
 * RG-/NRG-Paare, Abgleich mit dem Portal-Stamm). Nur lesend: es wird weder in Lexware noch in der Datenbank etwas geschrieben.
 *
 * Aufruf (im Portal-Ordner, braucht LEXWARE_API_KEY und die DB-Angaben aus der .env):
 *   node scripts/lexware-artikel-analyse.js                  Übersicht als Text
 *   node scripts/lexware-artikel-analyse.js --json           dasselbe als JSON
 *   node scripts/lexware-artikel-analyse.js --details        zusätzlich die Listen zum Durchgehen (Text)
 *   node scripts/lexware-artikel-analyse.js --csv <Ordner>   die Listen als CSV-Dateien (für Excel), Ordner wird angelegt
 * Lexware erlaubt 2 Anfragen/s für den ganzen Schlüssel; der Client schickt höchstens 1/s, bei 250 Artikeln je Seite genügen wenige Anfragen.
 * Die CSV-Dateien enthalten Artikelnummern und Bezeichnungen, aber keine Kundendaten; trotzdem nicht ins Repo legen.
 */
require('dotenv').config({ override: true });
const fs = require('fs');
const path = require('path');
const lexware = require('../src/services/lexware');
const { getPool } = require('../src/db');
const { analysiere, listen, alsCsv } = require('../src/utils/lexwareArtikelAnalyse');

const tabelle = (obj) => Object.entries(obj).map(([k, n]) => `    ${String(n).padStart(5)}  ${k}`).join('\n') || '    (keine)';
const zeilenText = (zeilen, spalten) => zeilen.map((z) => '    ' + spalten.map((s) => String(z[s] ?? '')).join(' | ')).join('\n') || '    (keine)';

// Wo ein Stammartikel noch vorkommt (gleiche Tabellen wie die Löschprüfung im Artikelstamm)
const VERWENDUNG = [
  ['fahrer_stopp_position', 'Tourposition'],
  ['fahrer_beleg_position', 'Lieferschein Fahrer'],
  ['gas_beleg_position', 'importierter Beleg'],
];

async function ladeStamm(db) {
  const [rows] = await db.query('SELECT artikel_nr, bezeichnung, typ, aktiv, preis_netto_cent FROM gas_artikel');
  const verwendet = new Map(rows.map((r) => [String(r.artikel_nr), []]));
  for (const [tab, text] of VERWENDUNG) {
    const [z] = await db.query(`SELECT artikel_nr, COUNT(*) AS n FROM ${tab} GROUP BY artikel_nr`);
    for (const r of z) verwendet.get(String(r.artikel_nr))?.push(`${text} (${r.n})`);
  }
  return rows.map((r) => ({ ...r, verwendet: verwendet.get(String(r.artikel_nr)) || [] }));
}

const DATEIEN = [
  ['stamm-ohne-lexware.csv', 'stammOhneLexware', ['artikel_nr', 'bezeichnung', 'typ', 'aktiv', 'preisNetto', 'verwendet']],
  ['lexware-ohne-stamm.csv', 'lexwareOhneStamm', ['nummer', 'sparte', 'bezeichnung', 'einheit', 'lexwareTyp']],
  ['lexware-ohne-nummer.csv', 'lexwareOhneNummer', ['sparte', 'bezeichnung', 'einheit', 'lexwareTyp']],
  ['pfand-artikel.csv', 'pfand', ['nummer', 'bezeichnung', 'einheit', 'stammTyp']],
];

(async () => {
  const args = process.argv.slice(2);
  const alsJson = args.includes('--json');
  const details = args.includes('--details');
  const csvIdx = args.indexOf('--csv');
  const csvOrdner = csvIdx >= 0 ? args[csvIdx + 1] : null;
  if (csvIdx >= 0 && (!csvOrdner || csvOrdner.startsWith('--'))) throw new Error('--csv braucht einen Ordner, z. B. --csv /root/artikellisten');

  const artikel = await lexware.listArticles();
  const stamm = await ladeStamm(getPool());
  const r = analysiere(artikel, stamm);
  const l = listen(artikel, stamm);

  if (alsJson) { console.log(JSON.stringify({ ...r, listen: l }, null, 2)); process.exit(0); }

  if (csvOrdner) {
    fs.mkdirSync(csvOrdner, { recursive: true });
    for (const [datei, key, spalten] of DATEIEN) {
      fs.writeFileSync(path.join(csvOrdner, datei), alsCsv(l[key], spalten));
      console.log(`geschrieben: ${path.join(csvOrdner, datei)} (${l[key].length} Zeilen)`);
    }
    process.exit(0);
  }

  console.log(`Lexware-Artikel: ${r.gesamt} (aktiv ${r.aktiv}, archiviert ${r.archiviert}), ohne Nummer: ${r.ohneNummer}`);
  console.log('\nNach Typ:\n' + tabelle(r.nachTyp));
  console.log('\nNach Präfix der Artikelnummer:\n' + tabelle(r.nachPraefix));
  console.log('\nNach Einheit:\n' + tabelle(r.nachEinheit));
  console.log('\nPräfix | Einheit:\n' + tabelle(r.einheitJePraefix));
  console.log('\nBeispiele je Präfix:');
  for (const [p, liste] of Object.entries(r.beispielJePraefix)) console.log(`  ${p}\n` + liste.map((x) => `      ${x}`).join('\n'));
  console.log(`\nGleiche Nummer mehrfach in Lexware: ${r.gleicheNummer.length}`);
  for (const g of r.gleicheNummer) console.log(`    ${g.nummer} (${g.anzahl}x)`);
  console.log(`\nSelbe Nummer ohne Präfix mehrfach (z. B. RG-/NRG-): ${r.mehrfachOhnePraefix.length}`);
  for (const g of r.mehrfachOhnePraefix.slice(0, 50)) console.log(`    ${g.stammNr}: ${g.lexware.join(', ')}`);
  if (r.mehrfachOhnePraefix.length > 50) console.log(`    … und ${r.mehrfachOhnePraefix.length - 50} weitere (mit --json vollständig)`);
  console.log(`\nPortal-Stamm: ${r.stamm.artikel} Artikel, davon mit Lexware-Artikel ${r.stamm.mitLexwareArtikel}, nur im Stamm ${r.stamm.nurImStamm.length}`);
  console.log(`Lexware-Artikel ohne Stammartikel: ${r.stamm.lexwareOhneStamm}`);

  if (details) {
    console.log('\nStamm-Typ | Lexware-Einheit (bei den gefundenen Artikeln):\n' + tabelle(l.typJeEinheit));
    console.log(`\nStammartikel, die es in Lexware nicht gibt (${l.stammOhneLexware.length}), "verwendet" = wo sie noch vorkommen:`);
    console.log(zeilenText(l.stammOhneLexware, ['artikel_nr', 'typ', 'aktiv', 'preisNetto', 'bezeichnung', 'verwendet']));
    console.log(`\nLexware-Artikel ohne Stammartikel (${l.lexwareOhneStamm.length}):`);
    console.log(zeilenText(l.lexwareOhneStamm, ['nummer', 'sparte', 'einheit', 'bezeichnung']));
    console.log(`\nLexware-Artikel ohne Nummer (${l.lexwareOhneNummer.length}):`);
    console.log(zeilenText(l.lexwareOhneNummer, ['sparte', 'einheit', 'bezeichnung']));
    console.log(`\nAlle PFAND-Artikel (${l.pfand.length}):`);
    console.log(zeilenText(l.pfand, ['nummer', 'einheit', 'stammTyp', 'bezeichnung']));
  }
  process.exit(0);
})().catch((err) => { console.error('Fehler:', err.message); process.exit(1); });
