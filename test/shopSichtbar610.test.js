/** #610: Schalter "im Shop sichtbar" am Artikel. */
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { planeShopAusLexware, uebernehmeShopAusLexware } = require('../src/services/shopSichtbar');
const { erstelleArtikelRouter } = require('../src/routes/internal/artikel');
const { verbinde, zusammenfassung } = require('../src/utils/artikelListe');
const { pruefeAenderung } = require('../src/utils/artikelstammAendern');

const lex = (nr, extra = {}) => ({ id: `L-${nr}`, articleNumber: nr, name: 'x', netPrice: 1, tags: [], content: null, ...extra });

test('Plan: RG- wird sichtbar, NRG- ausgeblendet, nur Artikel ohne Wert und mit Lexware-Gegenstück', () => {
  const stamm = [
    { artikel_nr: '7801100', shop_sichtbar: null }, { artikel_nr: '7802500', shop_sichtbar: null },
    { artikel_nr: '7801200', shop_sichtbar: 0 }, { artikel_nr: 'T039', shop_sichtbar: null }, { artikel_nr: '5555555', shop_sichtbar: null },
  ];
  const plan = planeShopAusLexware(stamm, [lex('RG-7801100'), lex('NRG-7802500'), lex('RG-7801200'), lex('RG-T039')]);
  assert.deepEqual(plan, [{ artikel_nr: '7801100', wert: 1 }, { artikel_nr: '7802500', wert: 0 }, { artikel_nr: 'T039', wert: 1 }]);
});

test('Gibt es RG- und NRG- zur selben Nummer, gilt RG- (sichtbar)', () => {
  const plan = planeShopAusLexware([{ artikel_nr: '1', shop_sichtbar: null }], [lex('NRG-1'), lex('RG-1')]);
  assert.deepEqual(plan, [{ artikel_nr: '1', wert: 1 }]);
});

test('Übernahme schreibt Wert und Änderungsverlauf, überschreibt nichts', async () => {
  const calls = [];
  const db = { async query(sql, p) { calls.push([sql, p]); return /^SELECT/.test(sql) ? [[{ artikel_nr: '7801100', shop_sichtbar: null }, { artikel_nr: '7801200', shop_sichtbar: 1 }, { artikel_nr: 'X', shop_sichtbar: null }]] : [{}]; } };
  const r = await uebernehmeShopAusLexware(db, [lex('RG-7801100'), lex('NRG-7801200')], { id: 5, name: 'Klaus' });
  assert.deepEqual(r, { geaendert: 1, sichtbar: 1, ausgeblendet: 0, ohneLexware: 1 });
  const upd = calls.filter(([s]) => s.startsWith('UPDATE'));
  assert.equal(upd.length, 1);
  assert.match(upd[0][0], /shop_sichtbar IS NULL/);
  assert.deepEqual(calls.find(([s]) => s.startsWith('INSERT'))[1], ['7801100', 'shop_sichtbar', '1', 5, 'Klaus']);
});

test('Änderung: shop_sichtbar akzeptiert Ja/Nein, leer = nicht gesetzt', () => {
  assert.equal(pruefeAenderung({ shop_sichtbar: '1' }).werte.shop_sichtbar, 1);
  assert.equal(pruefeAenderung({ shop_sichtbar: false }).werte.shop_sichtbar, 0);
  assert.equal(pruefeAenderung({ shop_sichtbar: '' }).werte.shop_sichtbar, null);
  assert.match(pruefeAenderung({ shop_sichtbar: 'vielleicht' }).fehler[0], /Ja\/Nein/);
});

test('Liste: Portal-Wert führt, Abweichung zum Lexware-Präfix wird gemeldet, ohne Wert "nicht gesetzt"', () => {
  const f = (nr, sichtbar, extra = {}) => ({ artikel_nr: nr, bezeichnung: nr, typ: 'F', aktiv: 1, shop_sichtbar: sichtbar, ...extra });
  const zeilen = verbinde({
    stamm: [f('1', 1), f('2', 0), f('3', null), f('4', 1), f('5', 0, { typ: 'P' })],
    lexware: [lex('RG-1'), lex('RG-2'), lex('RG-3'), lex('NRG-4')], ser: [],
  });
  const nach = Object.fromEntries(zeilen.map((z) => [z.artikel_nr, z]));
  assert.deepEqual([nach[1].shop_status, nach[1].shop_abweichend], ['sichtbar', false]);
  assert.deepEqual([nach[2].shop_status, nach[2].shop_abweichend], ['ausgeblendet', true]);
  assert.deepEqual([nach[3].shop_status, nach[3].shop_abweichend], ['nicht gesetzt', false]);
  assert.deepEqual([nach[4].shop_status, nach[4].shop_abweichend], ['sichtbar', true]);
  assert.equal(nach[5].shop_abweichend, false);
  const z = zusammenfassung(zeilen);
  assert.deepEqual(z.shop_abweichungen, ['2', '4']);
  assert.deepEqual(z.shop_ungesetzt, ['3']);
});

let server; let basis;
before(async () => {
  const app = express();
  app.use('/internal/artikel', erstelleArtikelRouter({ holeZeilen: async () => [{ artikel_nr: '7801100', shop_sichtbar: 1 }, { artikel_nr: '7801200', shop_sichtbar: 0 }] }));
  await new Promise((r) => { server = app.listen(0, '127.0.0.1', r); });
  basis = `http://127.0.0.1:${server.address().port}/internal/artikel`;
});
after(() => server.close());

test('Interne Artikel-API: ohne Secret 503, falsches 401, richtiges liefert nur gesetzte Werte', async () => {
  delete process.env.INTERNAL_ARTIKEL_SECRET;
  assert.equal((await fetch(`${basis}/shop-sichtbar`)).status, 503);
  process.env.INTERNAL_ARTIKEL_SECRET = 'x'.repeat(40);
  assert.equal((await fetch(`${basis}/shop-sichtbar`)).status, 401);
  assert.equal((await fetch(`${basis}/shop-sichtbar`, { headers: { 'x-internal-artikel-secret': 'y'.repeat(40) } })).status, 401);
  const r = await fetch(`${basis}/shop-sichtbar`, { headers: { 'x-internal-artikel-secret': 'x'.repeat(40) } });
  assert.equal(r.status, 200);
  const d = await r.json();
  assert.deepEqual(d.artikel, { 7801100: true, 7801200: false });
  assert.ok(d.stand);
  assert.equal((await fetch(`${basis}/anderes`, { headers: { 'x-internal-artikel-secret': 'x'.repeat(40) } })).status, 404);
});

test('Neue Artikel: Pfand, Kaufflaschen und Provision starten ausgeblendet, Füllungen ohne Wert', () => {
  const { shopStandard } = require('../src/services/artikelstamm');
  assert.deepEqual(shopStandard({ typ: 'P' }), { shop_sichtbar: 0 });
  assert.deepEqual(shopStandard({ typ: 'S' }), { shop_sichtbar: 0 });
  assert.deepEqual(shopStandard({ typ: 'V' }), { shop_sichtbar: 0 });
  assert.deepEqual(shopStandard({ typ: 'F' }), {});
  assert.deepEqual(shopStandard({}), {});
});

test('Filter "Abweichungen" zählt auch ein abweichendes Shop-Kennzeichen', async () => {
  const { filtereArtikel } = await import('../client/src/utils/artikelFilter.js');
  const z = (nr, extra) => ({ artikel_nr: nr, bezeichnung: nr, typ: 'F', aktiv: true, luecken: [], lexware: null, lexware_status: 'ok', ser_status: 'ok', shop_abweichend: false, ...extra });
  const r = filtereArtikel([z('1'), z('2', { shop_abweichend: true })], { kurz: 'abw' });
  assert.deepEqual(r.map((a) => a.artikel_nr), ['2']);
});
