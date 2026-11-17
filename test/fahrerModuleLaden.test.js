/** Die Tests der Fahrer-Routen nutzen einen RAM-Speicher. Dieser Test lädt die echten DB-Module, damit Syntaxfehler dort auffallen (#514). */
const { test } = require('node:test');
const assert = require('node:assert/strict');

for (const modul of ['../src/services/fahrerTouren', '../src/services/fahrerLadebasen', '../src/services/fahrerGeraete']) {
  test(`${modul} lässt sich laden`, () => {
    assert.equal(typeof require(modul), 'object');
  });
}
