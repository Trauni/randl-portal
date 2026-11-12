const test = require('node:test');
const assert = require('node:assert');
const { elternzeitMonate, gekuerzterAnspruch } = require('../src/utils/urlaubsanspruch');

test('30 Tage, 1 Monat Elternzeit → 27,5 Tage', () => {
  const m = elternzeitMonate([{ von: '2026-03-01', bis: '2026-03-31' }], 2026);
  assert.strictEqual(m, 1);
  assert.strictEqual(gekuerzterAnspruch(30, m), 27.5);
});

test('Teilmonate kürzen nicht', () => {
  assert.strictEqual(elternzeitMonate([{ von: '2026-03-05', bis: '2026-04-20' }], 2026), 0);
});

test('Zeiträume über Jahres- und Teilgrenzen werden pro Jahr gezählt', () => {
  const z = [{ von: '2025-11-01', bis: '2026-02-28' }];
  assert.strictEqual(elternzeitMonate(z, 2026), 2);
  assert.strictEqual(elternzeitMonate(z, 2025), 2);
});

test('Nahtlos aneinander liegende Zeiträume decken einen Monat gemeinsam ab', () => {
  const z = [{ von: '2026-05-01', bis: '2026-05-15' }, { von: '2026-05-16', bis: '2026-05-31' }];
  assert.strictEqual(elternzeitMonate(z, 2026), 1);
});

test('ganzes Jahr Elternzeit → 0 Tage', () => {
  assert.strictEqual(gekuerzterAnspruch(30, 12), 0);
});
