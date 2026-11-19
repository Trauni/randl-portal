/** Widmann #603: Rechnung nachliefern = max(0, Mindestbestand - (gezählt - reserviert)). */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { nachliefern, ergebnis, zaehlwert } = require('../src/utils/widmannNachliefern');

test('ohne Reservierung fehlt Mindestbestand minus gezählt', () => {
  assert.equal(nachliefern(10, 6, 0), 4);
  assert.equal(nachliefern(10, 6, undefined), 4);
});

test('Reservierte Flaschen verringern den freien Bestand', () => {
  assert.equal(nachliefern(10, 8, 3), 5);
});

test('nie negativ, wenn genug da ist', () => {
  assert.equal(nachliefern(10, 15, 0), 0);
  assert.equal(nachliefern(10, 10, 0), 0);
});

test('Eingaben: leer, Text und negativ werden 0', () => {
  assert.equal(zaehlwert(''), 0);
  assert.equal(zaehlwert('abc'), 0);
  assert.equal(zaehlwert(-4), 0);
  assert.equal(zaehlwert('7'), 7);
  assert.equal(nachliefern('10', '', ''), 10);
});

test('Ergebnis: Summe und nur Positionen mit Bedarf', () => {
  const r = ergebnis([
    { item_name: 'Propan 11 kg', mindestbestand: 10, gezaehlt: 6, reserviert: 0 },
    { item_name: 'Propan 33 kg', mindestbestand: 5, gezaehlt: 9, reserviert: 2 },
    { item_name: 'Alt', mindestbestand: 4, gezaehlt: 1 },
  ]);
  assert.equal(r.summe, 4 + 0 + 3);
  assert.equal(r.positionen, 2);
  assert.deepEqual(r.zeilen.map((z) => z.nachliefern), [4, 0, 3]);
});
