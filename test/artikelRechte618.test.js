const test = require('node:test');
const assert = require('node:assert');
const { hasArea } = require('../src/utils/permissions');

test('#618: alle Mitarbeiter und Freelancer lesen den Artikelstamm', () => {
  assert.ok(hasArea('mitarbeiter', [], 'artikel.lesen'));
  assert.ok(hasArea('freelancer', [], 'artikel.lesen'));
  assert.ok(!hasArea('extern', [], 'artikel.lesen'));
});

test('#618: Bearbeiten nur Gashandel, Backoffice, Geschaeftsfuehrung', () => {
  assert.ok(!hasArea('mitarbeiter', [], 'artikel.bearbeiten'));
  assert.ok(!hasArea('mitarbeiter', ['zeltverleih'], 'artikel.bearbeiten'));
  for (const tag of ['gashandel', 'backoffice', 'geschaeftsfuehrung']) {
    assert.ok(hasArea('mitarbeiter', [tag], 'artikel.bearbeiten'), tag);
  }
});

test('#618: Einkauf/Rohertrag bleiben intern (gashandel.auswertung)', () => {
  assert.ok(!hasArea('mitarbeiter', [], 'gashandel.auswertung'));
});
