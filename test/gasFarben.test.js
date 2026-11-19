/** Schulterfarben der Flaschen (DIN EN 1089-3, vereinfacht) – #605 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { GASART_REIHENFOLGE } = require('../src/services/gasStamm');

test('jede Gasart der Auswertung hat eine Schulterfarbe, unbekannte nicht', async () => {
  const { gasFarbe } = await import('../client/src/utils/gasFarben.js');
  for (const g of GASART_REIHENFOLGE) assert.match(gasFarbe(g), /^#[0-9a-f]{6}$/i, g);
  assert.equal(gasFarbe('Sonstige'), null);
  assert.equal(gasFarbe(undefined), null);
});

test('Kennfarben: Propan rot, Sauerstoff weiß, Acetylen braun, CO2 grau, Stickstoff schwarz', async () => {
  const { gasFarbe } = await import('../client/src/utils/gasFarben.js');
  assert.equal(gasFarbe('Propan'), '#b3261e');
  assert.equal(gasFarbe('Sauerstoff'), '#ffffff');
  assert.equal(gasFarbe('Acetylen'), '#6b2e1f');
  assert.equal(gasFarbe('CO2'), '#8a8d8f');
  assert.equal(gasFarbe('Stickstoff'), '#1f1d1b');
});
