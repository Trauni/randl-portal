/**
 * #617 Schritt A4: Lexware-Artikel, die im Portal-Stamm fehlen, im Stamm anlegen.
 *
 *   node scripts/stamm-neu-aus-lexware.js                       Vorschau (nur GZ-), schreibt nichts
 *   node scripts/stamm-neu-aus-lexware.js --ja                  legt die gezeigten Artikel an
 *   node scripts/stamm-neu-aus-lexware.js --praefix GZ,PFAND    auch andere Präfixe (RG = Füllung braucht danach ADR-Angaben)
 *   node scripts/stamm-neu-aus-lexware.js --auch-geloeschte     auch bewusst gelöschte Artikel anlegen (Löschvermerk wird aufgehoben)
 *   node scripts/stamm-neu-aus-lexware.js --inaktiv             neue Artikel inaktiv anlegen (für die Fahrer-App unsichtbar)
 *
 * Es wird nur in die Portal-Datenbank geschrieben. Bewusst gelöschte Artikel werden nicht wieder angelegt.
 */
require('dotenv').config({ override: true });
const lexware = require('../src/services/lexware');
const { getPool } = require('../src/db');
const { planeNeuAusLexware, legeNeuAusLexwareAn } = require('../src/services/stammNeuAusLexware');

(async () => {
  const args = process.argv.slice(2);
  const pi = args.indexOf('--praefix');
  const praefixe = pi >= 0 ? String(args[pi + 1] || '').split(',').map((s) => s.trim()).filter(Boolean) : ['GZ'];
  if (pi >= 0 && !praefixe.length) throw new Error('--praefix braucht eine Liste, z. B. GZ,PFAND');
  const opt = { praefixe, auchGeloeschte: args.includes('--auch-geloeschte'), inaktiv: args.includes('--inaktiv') };
  const db = getPool();
  const artikel = await lexware.listArticles();
  const [stamm] = await db.query('SELECT artikel_nr FROM gas_artikel');
  const [geloescht] = await db.query('SELECT artikel_nr FROM gas_artikel_geloescht');
  const plan = planeNeuAusLexware(stamm, artikel, geloescht.map((g) => g.artikel_nr), opt);

  console.log(`Fehlen im Portal-Stamm (Präfix ${praefixe.join(', ')}): ${plan.zeilen.length}${opt.inaktiv ? ', werden inaktiv angelegt' : ''}. Übersprungen: ${plan.uebersprungen.length}\n`);
  for (const z of plan.zeilen) {
    const preis = z.preis_netto_cent == null ? '–' : (z.preis_netto_cent / 100).toFixed(2) + ' €';
    console.log(`    ${z.artikel_nr}${z.warGeloescht ? ' (war gelöscht)' : ''}  (${z.lexware_nummer})  Typ ${z.typ}  ${z.einheit || '–'}  ${preis}  ${z.bezeichnung}`);
  }
  for (const u of plan.uebersprungen) console.log(`    übersprungen: ${u.nummer} (${u.grund})`);
  if (!args.includes('--ja')) { console.log('\nNichts geändert. Zum Anlegen mit --ja wiederholen.'); process.exit(0); }
  console.log('\nAngelegt:', await legeNeuAusLexwareAn(db, artikel, { username: 'Lexware-Übernahme (#617)' }, { anzahl: plan.zeilen.length }, opt));
  process.exit(0);
})().catch((e) => { console.error('Fehler:', e.message); process.exit(1); });
