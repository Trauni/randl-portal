/** Die Typ-Auswahl in "Felder bearbeiten" muss alle Typen kennen, die das Backend akzeptiert (sonst bleiben sie nur per Skript erreichbar). */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { TYPEN } = require('../src/utils/artikelstammAendern');

test('FELD.typ bietet alle Typen des Backends an', () => {
  const quelle = fs.readFileSync(path.join(__dirname, '..', 'client/src/components/pages/finance/artikel/artikelFelder.js'), 'utf8');
  const auswahl = quelle.match(/typ: \['typ', 'Typ', 'select:([A-Z,]+)'/)[1].split(',');
  assert.deepEqual([...auswahl].sort(), [...TYPEN].sort());
  for (const t of TYPEN) assert.match(quelle, new RegExp(`typ: \\{[^}]*\\b${t}: '`), `Beschriftung für ${t}`);
});
