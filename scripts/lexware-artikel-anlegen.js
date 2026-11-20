/**
 * #617: Artikel aus dem Portal-Stamm in Lexware anlegen (z. B. neue Pfandflaschen). Es wird nur angelegt, was es in Lexware noch nicht gibt;
 * bestehende Artikel werden nie verändert. Nummer, Bezeichnung, Einheit, Nettopreis und MwSt. kommen aus dem Portal.
 *
 *   node scripts/lexware-artikel-anlegen.js 5920051 5920101 5920201               Vorschau, schreibt nichts
 *   node scripts/lexware-artikel-anlegen.js 5920051 5920101 5920201 --ja          legt in Lexware an
 *   node scripts/lexware-artikel-anlegen.js 2805400 --praefix GZ [--ja]           Präfix vorgeben (sonst nach Typ: P PFAND-, Z/D GZ-, F RG-)
 *
 * Danach `node scripts/stamm-aus-lexware.js --ja`: holt Lexware-ID, Einheit und Sparte ins Portal.
 */
require('dotenv').config({ override: true });
const lexware = require('../src/services/lexware');
const { getPool } = require('../src/db');
const { planeLexwareAnlage } = require('../src/utils/lexwareArtikelAnlegen');

(async () => {
  const args = process.argv.slice(2);
  const pi = args.indexOf('--praefix');
  const praefix = pi >= 0 ? args[pi + 1] : undefined;
  if (pi >= 0 && (!praefix || praefix.startsWith('--'))) throw new Error('--praefix braucht einen Wert, z. B. GZ');
  const nummern = args.filter((a, i) => !a.startsWith('--') && i !== pi + 1);
  if (!nummern.length) throw new Error('Aufruf: node scripts/lexware-artikel-anlegen.js <Artikelnummer…> [--praefix X] [--ja]');

  const [stamm] = await getPool().query('SELECT artikel_nr, bezeichnung, typ, einheit, preis_netto_cent, mwst_satz FROM gas_artikel WHERE artikel_nr IN (?)', [nummern]);
  const plan = planeLexwareAnlage(stamm, await lexware.listArticles(), nummern, { praefix });

  console.log(`Anzulegen in Lexware: ${plan.zeilen.length}. Probleme: ${plan.fehler.length}\n`);
  for (const z of plan.zeilen) console.log(`    ${z.lexware_nummer}  ${z.payload.type}  ${z.payload.unitName}  ${z.payload.price.netPrice.toFixed(2)} € netto, ${z.payload.price.taxRate} %  ${z.payload.title}`);
  for (const f of plan.fehler) console.log(`    PROBLEM ${f}`);
  if (plan.fehler.length) { console.log('\nBitte erst die Probleme beheben, es wird nichts angelegt.'); process.exit(1); }
  if (!args.includes('--ja')) { console.log('\nNichts geändert. Zum Anlegen mit --ja wiederholen.'); process.exit(0); }

  let ok = 0;
  for (const z of plan.zeilen) {
    try { const r = await lexware.createArticle(z.payload); ok++; console.log(`angelegt  ${z.lexware_nummer}  (${r.id})`); }
    catch (err) { console.log(`FEHLER    ${z.lexware_nummer}: ${err.message}`); break; }
  }
  console.log(`\nAngelegt: ${ok} von ${plan.zeilen.length}. Jetzt: node scripts/stamm-aus-lexware.js --ja`);
  process.exit(ok === plan.zeilen.length ? 0 : 1);
})().catch((e) => { console.error('Fehler:', e.message); process.exit(1); });
