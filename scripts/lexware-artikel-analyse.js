/**
 * #617 Schritt A2: Liest alle Artikel direkt aus Lexware und zählt, was drinsteht (Typen, Präfixe, Einheiten,
 * RG-/NRG-Paare, Abgleich mit dem Portal-Stamm). Nur lesend: es wird weder in Lexware noch in der Datenbank etwas geschrieben.
 *
 * Aufruf (im Portal-Ordner, braucht LEXWARE_API_KEY und die DB-Angaben aus der .env):
 *   node scripts/lexware-artikel-analyse.js            Übersicht als Text
 *   node scripts/lexware-artikel-analyse.js --json     dasselbe als JSON
 * Lexware erlaubt 2 Anfragen/s für den ganzen Schlüssel; der Client schickt höchstens 1/s, bei 250 Artikeln je Seite genügen wenige Anfragen.
 */
require('dotenv').config({ override: true });
const lexware = require('../src/services/lexware');
const { getPool } = require('../src/db');
const { analysiere } = require('../src/utils/lexwareArtikelAnalyse');

const tabelle = (obj) => Object.entries(obj).map(([k, n]) => `    ${String(n).padStart(5)}  ${k}`).join('\n') || '    (keine)';

(async () => {
  const alsJson = process.argv.includes('--json');
  const artikel = await lexware.listArticles();
  const [stamm] = await getPool().query('SELECT artikel_nr FROM gas_artikel');
  const r = analysiere(artikel, stamm);

  if (alsJson) { console.log(JSON.stringify(r, null, 2)); process.exit(0); }

  console.log(`Lexware-Artikel: ${r.gesamt} (aktiv ${r.aktiv}, archiviert ${r.archiviert}), ohne Nummer: ${r.ohneNummer}`);
  console.log('\nNach Typ:\n' + tabelle(r.nachTyp));
  console.log('\nNach Präfix der Artikelnummer:\n' + tabelle(r.nachPraefix));
  console.log('\nNach Einheit:\n' + tabelle(r.nachEinheit));
  console.log('\nPräfix | Einheit:\n' + tabelle(r.einheitJePraefix));
  console.log('\nBeispiele je Präfix:');
  for (const [p, l] of Object.entries(r.beispielJePraefix)) console.log(`  ${p}\n` + l.map((x) => `      ${x}`).join('\n'));
  console.log(`\nGleiche Nummer mehrfach in Lexware: ${r.gleicheNummer.length}`);
  for (const g of r.gleicheNummer) console.log(`    ${g.nummer} (${g.anzahl}x)`);
  console.log(`\nSelbe Nummer ohne Präfix mehrfach (z. B. RG-/NRG-): ${r.mehrfachOhnePraefix.length}`);
  for (const g of r.mehrfachOhnePraefix.slice(0, 50)) console.log(`    ${g.stammNr}: ${g.lexware.join(', ')}`);
  if (r.mehrfachOhnePraefix.length > 50) console.log(`    … und ${r.mehrfachOhnePraefix.length - 50} weitere (mit --json vollständig)`);
  console.log(`\nPortal-Stamm: ${r.stamm.artikel} Artikel, davon mit Lexware-Artikel ${r.stamm.mitLexwareArtikel}, nur im Stamm ${r.stamm.nurImStamm.length}`);
  if (r.stamm.nurImStamm.length) console.log('    ' + r.stamm.nurImStamm.slice(0, 40).join(', ') + (r.stamm.nurImStamm.length > 40 ? ' …' : ''));
  console.log(`Lexware-Artikel ohne Stammartikel: ${r.stamm.lexwareOhneStamm}`);
  process.exit(0);
})().catch((err) => { console.error('Fehler:', err.message); process.exit(1); });
