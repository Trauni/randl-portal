const { test } = require('node:test');
const assert = require('node:assert/strict');
const { preisAm, pruefe } = require('../src/services/gasEkPreise');

const Z = [
  { ek_gruppe: 'motogas', preisbasis: 'fuellung', gueltig_ab: '2026-10-15', preis_netto: 20.79 },
  { ek_gruppe: 'motogas', preisbasis: 'fuellung', gueltig_ab: '2026-11-15', preis_netto: 22.55 },
  { ek_gruppe: 'propan', preisbasis: 'kg', gueltig_ab: '2026-11-11', preis_netto: 1.52 },
];

test('preisAm: größtes gueltig_ab <= Tag', () => {
  assert.equal(preisAm(Z, 'motogas', '2026-11-14').preis_netto, 20.79);
  assert.equal(preisAm(Z, 'motogas', '2026-11-15').preis_netto, 22.55);
  assert.equal(preisAm(Z, 'propan', '2026-11-10'), null);
});

test('pruefe: Eingaben werden validiert, Preisbasis kommt aus der Gruppe', () => {
  assert.equal(pruefe({ ek_gruppe: 'propan', preis_netto: '1.52', gueltig_ab: '2026-11-11' }).preisbasis, 'kg');
  assert.ok(pruefe({ ek_gruppe: 'co2', preis_netto: 1, gueltig_ab: '2026-11-11' }).fehler.length);
  assert.ok(pruefe({ ek_gruppe: 'propan', preis_netto: -1, gueltig_ab: '2026-11-11' }).fehler.length);
  assert.ok(pruefe({ ek_gruppe: 'propan', preis_netto: 1, gueltig_ab: '11.11.2026' }).fehler.length);
});
