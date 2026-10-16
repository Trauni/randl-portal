// Einmal-Test #366: METALL an die Notiz eines Lexware-TESTkontakts haengen und pruefen,
// dass sich ausser note/version/updatedDate nichts am Kontakt aendert.
// Wird vor dem PR wieder entfernt. Gibt keine Kontaktdaten aus, nur Feldnamen und Laengen.
// Aufruf (als root, liest den Schluessel aus der Gas-Shop-.env): node scripts/metall-kontakt-test.js
const fs = require('fs');
const path = require('path');
const readline = require('readline');

const ENVS = [process.env.LEX_ENV, '/srv/docker/gas-webshop/.env', '/srv/docker/gas-webshop/admin-backend/.env'];
for (const p of ENVS) {
if (!p || !fs.existsSync(p)) continue;
const zeile = fs.readFileSync(p, 'utf8').split(/\r?\n/).find(z => z.trim().startsWith('LEXWARE_API_KEY='));
if (zeile) {
process.env.LEXWARE_API_KEY = zeile.split('=').slice(1).join('=').trim().replace(/^["']|["']$/g, '');
console.log('Schluessel gefunden in', p);
break;
}
}
if (!process.env.LEXWARE_API_KEY) { console.error('LEXWARE_API_KEY nicht gefunden. LEX_ENV=/pfad/.env setzen.'); process.exit(1); }

const lexware = require(path.join(__dirname, '..', 'src/services/lexware'));
const { ergaenzeNotiz, hatMerkmal, kontaktName } = require(path.join(__dirname, '..', 'src/services/metallKunde'));

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const frage = q => new Promise(r => rl.question(q, a => r(a.trim())));
const UNWICHTIG = new Set(['note', 'version', 'updatedDate']);

(async () => {
const id = await frage('Kontakt-ID des TESTkontakts (UUID): ');
if (!/^[0-9a-f-]{36}$/i.test(id)) throw new Error('Das ist keine UUID');

const vorher = await lexware.getContact(id);
console.log(`Kontakt: ${kontaktName(vorher)} · Kunde: ${vorher.roles?.customer ? 'ja' : 'nein'} · Notiz: ${(vorher.note || '').length} Zeichen · METALL schon drin: ${hatMerkmal(vorher.note) ? 'ja' : 'nein'}`);
if ((await frage('Ist das der Testkontakt und soll METALL angehaengt werden? (j/N) ')).toLowerCase() !== 'j') { console.log('Abgebrochen, nichts geschrieben.'); return; }

const r = await lexware.updateContactNote(id, ergaenzeNotiz, { aktuell: vorher });
console.log(r.geaendert ? `Geschrieben, neue Version ${r.version}` : 'Keine Aenderung noetig (METALL war schon drin)');

const nachher = await lexware.getContact(id);
const felder = new Set([...Object.keys(vorher), ...Object.keys(nachher)]);
const anders = [...felder].filter(k => !UNWICHTIG.has(k) && JSON.stringify(vorher[k]) !== JSON.stringify(nachher[k]));
console.log(`Notiz jetzt: ${(nachher.note || '').length} Zeichen · endet mit METALL: ${/\nMETALL$|^METALL$/.test(nachher.note || '') ? 'ja' : 'nein'} · alter Text erhalten: ${(nachher.note || '').startsWith((vorher.note || '').replace(/\s+$/, '')) ? 'ja' : 'NEIN'}`);
console.log(anders.length ? `ACHTUNG, weitere Felder geaendert: ${anders.join(', ')}` : 'OK: sonst keine Felder geaendert');
})().catch(err => { console.error('Fehler:', err.message); process.exitCode = 1; }).finally(() => rl.close());
