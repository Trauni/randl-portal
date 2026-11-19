'use strict';
const test   = require('node:test');
const assert = require('node:assert');
const fs     = require('fs');
const os     = require('os');
const path   = require('path');
const sharp  = require('sharp');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'galerie-'));
process.env.GALERIE_DIR = path.join(tmp, 'web');
process.env.GALERIE_BACKUP_DIR = path.join(tmp, 'backup');
const galerie = require('../src/services/galerie');
const DIR = process.env.GALERIE_DIR;

const bild = (album, sha, caption = '') => ({ file: `${album}-${caption ? galerie.slugify(caption) + '-' : ''}${sha}.webp`, album, caption,
  alt: `${album === 'galazelt' ? 'Galazelt' : 'Weinzelt'}${caption ? ' – ' + caption : ''} | Zeltverleih Dominik Randl`, w: 2048, h: 1365, tw: 640, th: 427 });
const bilder = [bild('galazelt', 'aaaaaaa1', 'Frasdorfer Hütte'), bild('galazelt', 'aaaaaaa2'), bild('weinzelt', 'bbbbbbb1')];
const alben = [{ id: 'galazelt', titel: 'Galazelt', anzahl: 2 }, { id: 'weinzelt', titel: 'Weinzelt', anzahl: 1 }];
const state = { alben: [{ id: 'galazelt', titel: 'Galazelt', ordner: ['Galazelt'] }, { id: 'weinzelt', titel: 'Weinzelt', ordner: ['Weinzelt'] }] };

function setup() {
  fs.rmSync(tmp, { recursive: true, force: true });
  for (const s of ['full', 'thumb']) {
    fs.mkdirSync(path.join(DIR, 'img', s), { recursive: true });
    for (const b of bilder) fs.writeFileSync(path.join(DIR, 'img', s, b.file), 'x');
  }
  fs.writeFileSync(path.join(DIR, 'galerie.json'), JSON.stringify({ erstellt: '2026-11-19T09:00:00+00:00', alben, bilder }));
  fs.writeFileSync(path.join(DIR, '.verwaltung.json'), JSON.stringify(state));
  fs.writeFileSync(path.join(DIR, 'index.html'), `<p><span id="g-total">3</span></p>\n${galerie.renderBlock(alben, bilder)}\n<footer></footer>`);
}
const html = () => fs.readFileSync(path.join(DIR, 'index.html'), 'utf8');
const block = () => html().match(/<!-- GALERIE:START[\s\S]*?<!-- GALERIE:END -->/)[0];
const st = () => JSON.parse(fs.readFileSync(path.join(DIR, '.verwaltung.json'), 'utf8'));
const exists = (size, f) => fs.existsSync(path.join(DIR, 'img', size, f));

test('löschen: raus aus JSON und HTML, Dateien in den Papierkorb', () => {
  setup();
  const r = galerie.hide(['weinzelt-bbbbbbb1.webp'], 'test@randl');
  assert.strictEqual(r.ausgeblendet, 1); assert.strictEqual(r.sichtbar, 2);
  const l = galerie.list();
  assert.strictEqual(l.ausgeblendet[0].file, 'weinzelt-bbbbbbb1.webp');
  assert.ok(!html().includes('weinzelt-bbbbbbb1'));
  assert.ok(!html().includes('data-filter="weinzelt"'), 'leere Kategorie verschwindet aus dem Filter');
  assert.ok(html().includes('<span id="g-total">2</span>') && html().includes('<footer></footer>'));
  assert.ok(galerie.papierkorbThumb('weinzelt-bbbbbbb1.webp'));
});

test('wiederherstellen setzt Bild an alte Stelle zurück', () => {
  setup();
  galerie.hide(['galazelt-frasdorfer-huette-aaaaaaa1.webp'], null);
  assert.strictEqual(galerie.restore(['galazelt-frasdorfer-huette-aaaaaaa1.webp']).wiederhergestellt, 1);
  const l = galerie.list();
  assert.deepStrictEqual(l.bilder.map(b => b.file), bilder.map(b => b.file));
  assert.strictEqual(block(), galerie.renderBlock(l.alben, l.bilder.map(({ hochgeladen, ...b }) => b)));
});

test('endgültig löschen: Dateien weg, Bild bleibt für das Skript gesperrt', () => {
  setup();
  galerie.hide(['galazelt-aaaaaaa2.webp']);
  assert.strictEqual(galerie.purge(['galazelt-aaaaaaa2.webp']).geloescht, 1);
  assert.strictEqual(galerie.papierkorbThumb('galazelt-aaaaaaa2.webp'), null);
  assert.strictEqual(galerie.list().ausgeblendet.length, 0);
  assert.ok(st().ausgeblendet[0].endgueltig);
});

test('verschieben: neue Kategorie, Datei umbenannt, Zuordnung gemerkt, alt-Text neu', () => {
  setup();
  galerie.move(['galazelt-frasdorfer-huette-aaaaaaa1.webp'], 'weinzelt');
  const b = galerie.list().bilder.find(x => x.file.endsWith('aaaaaaa1.webp'));
  assert.strictEqual(b.file, 'weinzelt-frasdorfer-huette-aaaaaaa1.webp');
  assert.strictEqual(b.alt, 'Weinzelt – Frasdorfer Hütte | Zeltverleih Dominik Randl');
  assert.ok(exists('full', b.file) && !exists('full', 'galazelt-frasdorfer-huette-aaaaaaa1.webp'));
  assert.strictEqual(st().zuordnung.aaaaaaa1, 'weinzelt');
  assert.throws(() => galerie.move([b.file], 'gibtsnicht'), e => e.status === 400);
});

test('hochladen: WebP in zwei Größen, ohne Metadaten, Duplikat erkannt', async () => {
  setup();
  const jpg = await sharp({ create: { width: 3000, height: 2000, channels: 3, background: '#a83020' } })
    .withMetadata({ exif: { IFD0: { Artist: 'Test' } } }).jpeg().toBuffer();
  const r = await galerie.upload([jpg, jpg], { album: 'weinzelt', caption: 'Hochzeit <b>Seeon</b>' }, 'test@randl');
  assert.strictEqual(r.hinzugefuegt, 1); assert.strictEqual(r.doppelt, 1);
  const b = galerie.list().bilder.find(x => x.hochgeladen);
  assert.match(b.file, /^weinzelt-hochzeit-bseeon-b-[0-9a-f]{8}\.webp$/);
  assert.strictEqual(b.caption, 'Hochzeit bSeeon/b');
  assert.deepStrictEqual([b.w, b.h, b.tw, b.th], [2048, 1365, 640, 427]);
  const meta = await sharp(path.join(DIR, 'img', 'full', b.file)).metadata();
  assert.strictEqual(meta.format, 'webp'); assert.ok(!meta.exif, 'keine EXIF-Daten');
  assert.strictEqual(galerie.list().bilder.at(-1).file, b.file, 'ans Ende der Kategorie');
  assert.strictEqual(st().hinzugefuegt.length, 1);
  await assert.rejects(galerie.upload([jpg], { album: 'x' }), e => e.status === 400);
});

test('Kategorien: umbenennen, sortieren, neu anlegen, nur leere ohne Nextcloud-Ordner löschen', () => {
  setup();
  galerie.saveAlben([{ id: 'weinzelt', titel: 'Wein-Zelte' }, { id: 'galazelt', titel: 'Galazelt' }, { titel: 'Hochzeiten 2026' }]);
  let l = galerie.list();
  assert.deepStrictEqual(l.alben.map(a => a.id), ['weinzelt', 'galazelt', 'hochzeiten-2026']);
  assert.strictEqual(l.bilder[0].album, 'weinzelt', 'Bilder folgen der neuen Reihenfolge');
  assert.strictEqual(l.bilder[0].alt, 'Wein-Zelte | Zeltverleih Dominik Randl');
  assert.ok(html().includes('>Wein-Zelte <span>1</span>'));
  assert.throws(() => galerie.saveAlben([{ id: 'galazelt', titel: 'Galazelt' }, { id: 'hochzeiten-2026', titel: 'H' }]), e => e.status === 409);
  galerie.saveAlben([{ id: 'weinzelt', titel: 'Weinzelt' }, { id: 'galazelt', titel: 'Galazelt' }]);
  assert.strictEqual(galerie.list().alben.length, 2);
  galerie.hide(['weinzelt-bbbbbbb1.webp']);
  assert.throws(() => galerie.saveAlben([{ id: 'galazelt', titel: 'Galazelt' }]), e => e.status === 409, 'Papierkorb zählt mit / Nextcloud-Ordner');
  assert.throws(() => galerie.saveAlben([{ titel: '' }]), e => e.status === 400);
});

test('ungültige Eingaben werden abgelehnt (kein Pfad-Ausbruch)', () => {
  setup();
  for (const bad of [['../index.html'], ['x.webp'], [], 'galazelt-aaaaaaa2.webp']) assert.throws(() => galerie.hide(bad), e => e.status === 400);
  assert.strictEqual(galerie.papierkorbThumb('../../etc/passwd'), null);
  assert.throws(() => galerie.saveAlben([{ id: '../x', titel: 'X' }]), e => e.status === 400);
});

test('alter Stand .ausgeblendet.json (v1.9.0) wird übernommen', () => {
  setup();
  fs.writeFileSync(path.join(DIR, '.ausgeblendet.json'), JSON.stringify({ bilder: [{ ...bilder[1], pos: 1, ausgeblendet: 'x' }] }));
  galerie.saveAlben(state.alben);
  assert.ok(!fs.existsSync(path.join(DIR, '.ausgeblendet.json')));
  assert.strictEqual(st().ausgeblendet[0].file, 'galazelt-aaaaaaa2.webp');
});
