/**
 * #617 Schritt A3: Lexware-ID, Einheit und Bezeichnung aus Lexware in den Artikelstamm übernehmen und die Sparten zuordnen.
 *
 *   node scripts/stamm-aus-lexware.js                       Vorschau, schreibt nichts
 *   node scripts/stamm-aus-lexware.js --ja                  übernimmt in die Portal-Datenbank (nichts geht nach Lexware)
 *   node scripts/stamm-aus-lexware.js --ja --auch-portal-geaenderte   überschreibt auch Bezeichnungen, die im Portal von Hand geändert wurden
 *
 *   node scripts/stamm-aus-lexware.js --typ-gz [--ja]      Typ-Vorschlag: GZ-Artikel werden Zubehör (Z), Versand/Fracht Dienstleistung (D)
 *
 * Bezeichnungen, die im Portal von Hand geändert wurden, werden standardmäßig nur gemeldet, nicht überschrieben. Der Typ bleibt unberührt.
 */
require('dotenv').config({ override: true });
const lexware = require('../src/services/lexware');
const { getPool } = require('../src/db');
const { planeStammAusLexware, uebernehmeStammAusLexware, planeTypAusPraefix, setzeTypen } = require('../src/services/stammAusLexware');

(async () => {
  const args = process.argv.slice(2);
  const opt = { auchPortalGeaenderte: args.includes('--auch-portal-geaenderte') };
  const db = getPool();
  const artikel = await lexware.listArticles();
  const [stamm] = await db.query('SELECT artikel_nr, bezeichnung, einheit, lexware_id, gruppe_id, feld_stand FROM gas_artikel');
  if (args.includes('--typ-gz')) {
    const [mitTyp] = await db.query('SELECT artikel_nr, bezeichnung, typ FROM gas_artikel');
    const typen = planeTypAusPraefix(mitTyp, artikel);
    console.log(`Typ-Vorschlag für ${typen.length} Artikel (GZ- = Zubehör, Versand/Fracht = Dienstleistung):`);
    for (const z of typen) console.log(`    ${z.artikel_nr}  ${z.typAlt || '–'} → ${z.typNeu}  ${z.bezeichnung}`);
    if (!args.includes('--ja')) console.log('\nNichts geändert. Zum Setzen mit --ja wiederholen.');
    else console.log('\nGesetzt:', await setzeTypen(typen, { username: 'Typ aus GZ-Präfix (#617)' }));
    process.exit(0);
  }
  const plan = planeStammAusLexware(stamm, artikel, opt);

  console.log(`Stamm: ${stamm.length} Artikel. Zu ändern: ${plan.zeilen.length}. Schon gleich: ${plan.gleich}. Ohne Lexware-Treffer: ${plan.keinLexware.length}. Mehrdeutig: ${plan.mehrdeutig.length}. Im Portal von Hand geänderter Name: ${plan.portalGeaendert.length}\n`);
  const zaehl = {};
  for (const z of plan.zeilen) for (const f of z.felder) zaehl[f] = (zaehl[f] || 0) + 1;
  console.log('Felder:', JSON.stringify(zaehl));
  for (const z of plan.zeilen.filter((x) => x.neu.bezeichnung || x.neu.einheit).slice(0, 80)) {
    console.log(`${z.artikel_nr} (${z.lexware_nummer})`);
    if (z.neu.bezeichnung) console.log(`      Name:    ${JSON.stringify(z.alt.bezeichnung ?? '')}  →  ${JSON.stringify(z.neu.bezeichnung)}`);
    if (z.neu.einheit) console.log(`      Einheit: ${JSON.stringify(z.alt.einheit ?? '')}  →  ${JSON.stringify(z.neu.einheit)}`);
  }
  if (plan.portalGeaendert.length) {
    console.log('\nIm Portal von Hand geändert, bleiben unverändert (Portal ≠ Lexware):');
    for (const x of plan.portalGeaendert) console.log(`    ${x.artikel_nr}\n        Portal:  ${x.portal}\n        Lexware: ${x.lexware}`);
  }
  if (plan.mehrdeutig.length) console.log('\nMehrdeutig (übersprungen): ' + plan.mehrdeutig.join(', '));
  if (plan.keinLexware.length) console.log('\nStammartikel ohne Lexware-Artikel: ' + plan.keinLexware.join(', '));
  if (!args.includes('--ja')) { console.log('\nNichts geändert. Zum Übernehmen mit --ja wiederholen.'); process.exit(0); }

  console.log('\nÜbernommen:', await uebernehmeStammAusLexware(db, artikel, { username: 'Abgleich aus Lexware (#617)' }, { anzahl: plan.zeilen.length }, opt));
  process.exit(0);
})().catch((e) => { console.error('Fehler:', e.message); process.exit(1); });
