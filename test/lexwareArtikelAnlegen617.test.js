/** #617: Artikel aus dem Portal in Lexware anlegen: Planung und API-Aufruf. Ohne echte Anfragen. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createClient } = require('../src/services/lexware');
const { planeLexwareAnlage } = require('../src/utils/lexwareArtikelAnlegen');

const s = (nr, extra = {}) => ({ artikel_nr: nr, bezeichnung: `Ballongas Leergut ${nr}`, typ: 'P', einheit: 'Stück', preis_netto_cent: 8000, mwst_satz: 19, ...extra });

test('Plan: Präfix nach Typ, Preis in Euro, Pflichtfelder für Lexware', () => {
  const p = planeLexwareAnlage([s('5920051'), s('8996500', { typ: 'D' }), s('T040', { typ: 'F' })], [], ['5920051', '8996500', 'T040']);
  assert.deepEqual(p.fehler, []);
  assert.deepEqual(p.zeilen[0].payload, { title: 'Ballongas Leergut 5920051', type: 'PRODUCT', articleNumber: 'PFAND-5920051', unitName: 'Stück', price: { netPrice: 80, leadingPrice: 'NET', taxRate: 19 } });
  assert.equal(p.zeilen[1].lexware_nummer, 'GZ-8996500');
  assert.equal(p.zeilen[1].payload.type, 'SERVICE');
  assert.equal(p.zeilen[2].lexware_nummer, 'RG-T040');
});

test('Plan: Probleme werden gemeldet statt angelegt (gibt es schon, kein Preis, unbekannt, kein Präfix)', () => {
  const p = planeLexwareAnlage(
    [s('1'), s('2', { preis_netto_cent: null }), s('3', { typ: 'S' }), s('4', { bezeichnung: ' ' })],
    [{ articleNumber: 'PFAND-1' }], ['1', '2', '3', '4', '9']);
  assert.equal(p.zeilen.length, 0);
  assert.equal(p.fehler.length, 5);
  assert.match(p.fehler[0], /gibt es in Lexware schon \(PFAND-1\)/);
  assert.match(p.fehler[1], /kein Nettopreis/);
  assert.match(p.fehler[2], /--praefix/);
  assert.match(p.fehler[4], /nicht im Portal-Stamm/);
});

test('Plan: ausdrückliches Präfix gilt auch für andere Typen', () => {
  const p = planeLexwareAnlage([s('2805400', { typ: 'S' })], [], ['2805400'], { praefix: 'gz' });
  assert.equal(p.zeilen[0].lexware_nummer, 'GZ-2805400');
});

test('createArticle: ein POST auf /articles mit dem Payload', async () => {
  const calls = [];
  const fetchImpl = async (url, opt) => { calls.push({ url, method: opt.method, body: JSON.parse(opt.body) }); return { status: 201, ok: true, headers: { get: () => undefined }, text: async () => JSON.stringify({ id: 'neu-1', version: 0 }) }; };
  const c = createClient({ apiKey: 'k', fetchImpl, abstandMs: 0, warte: async () => {} });
  const r = await c.createArticle({ title: 'X', type: 'PRODUCT', unitName: 'Stück' });
  assert.equal(r.id, 'neu-1');
  assert.equal(calls[0].method, 'POST');
  assert.match(calls[0].url, /\/articles$/);
  assert.equal(calls[0].body.title, 'X');
});
