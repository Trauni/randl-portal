/** Bestellungen im Portal: 0 Vollgut erlaubt (reine Leergut-Abholung, Tausch gegen ein anderes Gas). */
const { test } = require('node:test');
const assert = require('node:assert/strict');

const laden = () => import('../client/src/utils/bestellPositionen.js');

test('bereinigePositionen: 0 Vollgut mit Leergut geht durch', async () => {
  const { bereinigePositionen } = await laden();
  const r = bereinigePositionen([
    { articleNumber: '7801100', quantity: '2', emptyReturn: '' },
    { articleNumber: '7801300', quantity: '0', emptyReturn: '2' },
  ]);
  assert.equal(r.fehler, undefined);
  assert.deepEqual(r.items.map((i) => [i.articleNumber, i.quantity, i.emptyReturn]), [['7801100', 2, 0], ['7801300', 0, 2]]);
});

test('bereinigePositionen: leere Zeilen fallen weg, 0/0 mit Artikel und gar kein Artikel sind Fehler', async () => {
  const { bereinigePositionen } = await laden();
  assert.equal(bereinigePositionen([{ articleNumber: 'A', quantity: 1 }, { articleNumber: '', quantity: '' }]).items.length, 1);
  assert.match(bereinigePositionen([{ articleNumber: 'A', quantity: '0', emptyReturn: '0' }]).fehler, /Vollgut oder Leergut/);
  assert.match(bereinigePositionen([{ articleNumber: '', quantity: '' }]).fehler, /mindestens einen Artikel/);
  assert.match(bereinigePositionen([{ articleNumber: 'A', quantity: '-3', emptyReturn: '' }]).fehler, /Vollgut oder Leergut/);
});

test('positionMengeText', async () => {
  const { positionMengeText } = await laden();
  assert.equal(positionMengeText({ quantity: 2, emptyReturn: 2 }), '2x · 2 Leergut');
  assert.equal(positionMengeText({ quantity: 1, emptyReturn: 0 }), '1x');
  assert.equal(positionMengeText({ quantity: 0, emptyReturn: 3 }), 'nur 3 Leergut');
});
