/**
 * #617 Schritt C (erster Teil): Lexware-Artikel an die überarbeitete Artikeldatei anpassen: Artikelnummer (z. B. PFAND- → GZ-),
 * Bezeichnung und Einheit. Preise, Notizen, Beschreibungen und alles andere bleiben unverändert (der Artikel wird gelesen,
 * nur diese drei Felder werden überlagert, dann zurückgeschrieben).
 *
 *   node scripts/lexware-artikel-nachziehen.js <Ordner mit CSV> <Sicherungsordner>                 Vorschau, schreibt nichts
 *   node scripts/lexware-artikel-nachziehen.js <Ordner mit CSV> <Sicherungsordner> --ja --limit 1  schreibt nur den ersten Artikel
 *   node scripts/lexware-artikel-nachziehen.js <Ordner mit CSV> <Sicherungsordner> --ja            schreibt alle
 *
 * Vor jedem Schreiben wird der alte Stand des Artikels in <Sicherungsordner>/lexware-vorher.jsonl gesichert (zum Zurücksetzen).
 * Lexware erlaubt 2 Anfragen/s für den ganzen Schlüssel; der Client schickt höchstens 1/s (je Artikel 2 Anfragen).
 */
require('dotenv').config({ override: true });
const fs = require('fs');
const path = require('path');
const lexware = require('../src/services/lexware');
const { leseCsv, dekodiere, planeLexwareAenderung } = require('../src/utils/artikelDateiAbgleich');

(async () => {
  const args = process.argv.slice(2);
  const [ordner, sicherung] = args.filter((a) => !a.startsWith('--') && !/^\d+$/.test(a));
  if (!ordner || !sicherung) throw new Error('Aufruf: node scripts/lexware-artikel-nachziehen.js <Ordner mit CSV> <Sicherungsordner> [--ja] [--limit n]');
  const echt = args.includes('--ja');
  const li = args.indexOf('--limit');
  const limit = li >= 0 ? Number(args[li + 1]) : Infinity;
  if (li >= 0 && !(limit > 0)) throw new Error('--limit braucht eine Zahl');

  const datei = fs.readdirSync(ordner).filter((f) => f.toLowerCase().endsWith('.csv'))
    .flatMap((f) => leseCsv(dekodiere(fs.readFileSync(path.join(ordner, f)))));
  const plan = planeLexwareAenderung(datei, await lexware.listArticles());

  console.log(`Datei: ${datei.length} Artikel. Schon gleich: ${plan.unveraendert}. Zu ändern: ${plan.aenderungen.length}. Nicht in Lexware: ${plan.fehlenInLexware.length}. Mehrdeutig: ${plan.mehrdeutig.length}\n`);
  for (const a of plan.aenderungen) {
    console.log(a.nummerAlt + '  [' + a.felder.join(', ') + ']');
    for (const f of a.felder) console.log(`      ${f}: ${JSON.stringify(a.alt[f] ?? '')}  →  ${JSON.stringify(a.neu[f])}`);
  }
  if (plan.fehlenInLexware.length) console.log('\nNicht in Lexware (werden hier NICHT angelegt): ' + plan.fehlenInLexware.join(', '));
  if (plan.mehrdeutig.length) console.log('\nMehrdeutig (übersprungen): ' + plan.mehrdeutig.join(', '));
  if (!echt) { console.log('\nNichts geändert. Zum Schreiben mit --ja wiederholen (zuerst mit --limit 1 testen).'); process.exit(0); }

  fs.mkdirSync(sicherung, { recursive: true });
  const sicherungsDatei = path.join(sicherung, 'lexware-vorher.jsonl');
  let n = 0, fehler = 0;
  for (const a of plan.aenderungen.slice(0, limit)) {
    try {
      // Vorher sichern, dann schreiben (updateArticle liest den Artikel frisch und liefert den Stand davor zurück)
      const alt = await lexware.getArticle(a.id);
      fs.appendFileSync(sicherungsDatei, JSON.stringify({ am: new Date().toISOString(), id: a.id, vorher: alt }) + '\n');
      const r = await lexware.updateArticle(a.id, a.neu, { aktuell: alt });
      n += r.geaendert ? 1 : 0;
      console.log(`ok     ${a.nummerAlt} → ${a.neu.articleNumber || a.nummerAlt}`);
    } catch (err) {
      fehler++;
      console.log(`FEHLER ${a.nummerAlt}: ${err.message}`);
      if (n === 0) { console.log('Abbruch beim ersten Artikel, nichts weiter geschrieben.'); break; }
    }
  }
  console.log(`\nGeschrieben: ${n}, Fehler: ${fehler}. Alter Stand in ${sicherungsDatei}`);
  process.exit(fehler ? 1 : 0);
})().catch((e) => { console.error('Fehler:', e.message); process.exit(1); });
