/** Druckluft (RG-T039) braucht eine eigene Gasart, damit der Artikel nicht unter "Sonstige" auftaucht. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { pruefeAenderung } = require('../src/utils/artikelstammAendern');
const { GASART_REIHENFOLGE } = require('../src/services/gasStamm');

test('Gasart Druckluft ist wählbar und steht in der Reihenfolge der Auswertung', () => {
  const r = pruefeAenderung({ gasart: 'Druckluft' });
  assert.deepEqual(r.fehler, []);
  assert.equal(r.werte.gasart, 'Druckluft');
  assert.ok(GASART_REIHENFOLGE.includes('Druckluft'));
});

test('Typen Zubehör (Z) und Dienstleistung (D) sind gültig, ohne Gasart und Pfand', () => {
  assert.deepEqual(pruefeAenderung({ typ: 'Z' }).fehler, []);
  assert.equal(pruefeAenderung({ typ: 'D' }).werte.typ, 'D');
});
