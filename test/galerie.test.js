'use strict';
const test   = require('node:test');
const assert = require('node:assert');
const fs     = require('fs');
const os     = require('os');
const path   = require('path');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'galerie-'));
process.env.GALERIE_DIR = path.join(tmp, 'web');
process.env.GALERIE_BACKUP_DIR = path.join(tmp, 'backup');
const galerie = require('../src/services/galerie');

const bild = (album, sha, caption = '') => ({ file: `${album}-${sha}.webp`, album, caption, alt: `${album} | Test`, w: 2048, h: 1365, tw: 640, th: 427 });
const bilder = [bild('galazelt', 'aaaaaaa1', 'Party'), bild('galazelt', 'aaaaaaa2'), bild('weinzelt', 'bbbbbbb1')];
const alben = [{ id: 'galazelt', titel: 'Galazelt', anzahl: 2 }, { id: 'weinzelt', titel: 'Weinzelt', anzahl: 1 }];

function setup() {
  fs.rmSync(tmp, { recursive: true, force: true });
  const dir = process.env.GALERIE_DIR;
  for (const s of ['full', 'thumb']) {
    fs.mkdirSync(path.join(dir, 'img', s), { recursive: true });
    for (const b of bilder) fs.writeFileSync(path.join(dir, 'img', s, b.file), 'x');
  }
  fs.writeFileSync(path.join(dir, 'galerie.json'), JSON.stringify({ erstellt: '2026-11-19T09:00:00+00:00', alben, bilder }));
  fs.writeFileSync(path.join(dir, 'index.html'), `<p><span id="g-total">3</span></p>\n${galerie.renderBlock(alben, bilder)}\n<footer></footer>`);
}
const html = () => fs.readFileSync(path.join(process.env.GALERIE_DIR, 'index.html'), 'utf8');

test('ausblenden nimmt Bild aus JSON und HTML, Dateien landen im Papierkorb', () => {
  setup();
  const r = galerie.hide(['weinzelt-bbbbbbb1.webp'], 'test@randl');
  assert.deepStrictEqual(r, { ok: true, ausgeblendet: 1, sichtbar: 2 });
  const l = galerie.list();
  assert.strictEqual(l.bilder.length, 2);
  assert.strictEqual(l.ausgeblendet[0].file, 'weinzelt-bbbbbbb1.webp');
  assert.strictEqual(l.alben.find(a => a.id === 'weinzelt').anzahl, 0);
  assert.ok(!html().includes('weinzelt-bbbbbbb1'));
  assert.ok(!html().includes('data-filter="weinzelt"'), 'leeres Album verschwindet aus dem Filter');
  assert.ok(html().includes('<span id="g-total">2</span>'));
  assert.ok(html().includes('<footer></footer>'), 'Rest der Seite bleibt');
  assert.ok(fs.existsSync(path.join(process.env.GALERIE_BACKUP_DIR, 'thumb', 'weinzelt-bbbbbbb1.webp')));
  assert.ok(galerie.papierkorbThumb('weinzelt-bbbbbbb1.webp'));
});

test('wiederherstellen setzt Bild an alte Stelle zurück', () => {
  setup();
  galerie.hide(['galazelt-aaaaaaa1.webp'], null);
  const r = galerie.restore(['galazelt-aaaaaaa1.webp']);
  assert.strictEqual(r.wiederhergestellt, 1);
  const l = galerie.list();
  assert.deepStrictEqual(l.bilder.map(b => b.file), bilder.map(b => b.file));
  assert.strictEqual(l.ausgeblendet.length, 0);
  assert.strictEqual(html().match(/<!-- GALERIE:START[\s\S]*?<!-- GALERIE:END -->/)[0], galerie.renderBlock(l.alben, l.bilder));
});

test('ungültige Dateinamen werden abgelehnt (kein Pfad-Ausbruch)', () => {
  setup();
  for (const bad of [['../index.html'], ['x.webp'], [], 'galazelt-aaaaaaa1.webp']) {
    assert.throws(() => galerie.hide(bad), e => e.status === 400);
  }
  assert.strictEqual(galerie.papierkorbThumb('../../etc/passwd'), null);
});
