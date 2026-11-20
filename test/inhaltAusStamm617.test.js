/** #617: Der Inhalt eines Gasartikels kommt aus der Füllmenge des Stamms, der alte Eintrag nur als Rückfall. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { inhaltFuer } = require('../src/utils/gasContent');

const stamm = new Map([['7801100', { fuellmenge: '11.000', fuellmenge_einheit: 'kg' }], ['T022', { fuellmenge: '50', fuellmenge_einheit: 'l' }], ['T039', { fuellmenge: null, fuellmenge_einheit: null }]]);
const alt = { content_value: '10.000', content_unit: 'kg', source: 'auto', updated_at: 'x' };

test('Stamm gewinnt, l wird zu L, auch bei NRG-', () => {
  assert.deepEqual(inhaltFuer({ articleNumber: 'RG-7801100' }, alt, stamm), { value: 11, unit: 'kg', source: 'stamm', updatedAt: null });
  assert.equal(inhaltFuer({ articleNumber: 'RG-T022' }, null, stamm).unit, 'L');
  assert.equal(inhaltFuer({ articleNumber: 'NRG-7801100' }, null, stamm).value, 11);
});

test('Ohne Menge im Stamm gilt der alte Eintrag, ohne beides null', () => {
  assert.deepEqual(inhaltFuer({ articleNumber: 'RG-T039' }, alt, stamm), { value: 10, unit: 'kg', source: 'auto', updatedAt: 'x' });
  assert.equal(inhaltFuer({ articleNumber: 'RG-T039' }, null, stamm), null);
  assert.equal(inhaltFuer({ articleNumber: 'RG-9999999' }, undefined, stamm), null);
});
