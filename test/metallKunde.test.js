const { test } = require('node:test');
const assert = require('node:assert/strict');
const { hatMerkmal, ergaenzeNotiz, NOTIZ_MAX } = require('../src/services/metallKunde');

test('hatMerkmal: ganzes Wort in Großbuchstaben', () => {
  assert.equal(hatMerkmal('METALL'), true);
  assert.equal(hatMerkmal('Lieferung vormittags\nMETALL'), true);
  assert.equal(hatMerkmal('GAS, METALL'), true);
  assert.equal(hatMerkmal('METALLBAU Huber'), false);
  assert.equal(hatMerkmal('Metall'), false);
  assert.equal(hatMerkmal(''), false);
  assert.equal(hatMerkmal(null), false);
});

test('ergaenzeNotiz: leer → nur METALL', () => {
  assert.equal(ergaenzeNotiz(''), 'METALL');
  assert.equal(ergaenzeNotiz(null), 'METALL');
  assert.equal(ergaenzeNotiz('   '), 'METALL');
});

test('ergaenzeNotiz: vorhandener Text bleibt, METALL als eigene Zeile', () => {
  assert.equal(ergaenzeNotiz('Lieferung vormittags'), 'Lieferung vormittags\nMETALL');
  assert.equal(ergaenzeNotiz('Zeile 1\nZeile 2\n\n'), 'Zeile 1\nZeile 2\nMETALL');
});

test('ergaenzeNotiz: schon vorhanden → unverändert', () => {
  const n = 'Lieferung vormittags\nMETALL\nRampe hinten';
  assert.equal(ergaenzeNotiz(n), n);
});

test('ergaenzeNotiz: zu lang → Fehler statt abschneiden', () => {
  assert.equal(ergaenzeNotiz('x'.repeat(NOTIZ_MAX - 7)).length, NOTIZ_MAX);
  assert.throws(() => ergaenzeNotiz('x'.repeat(NOTIZ_MAX - 6)), /zu lang/);
});
