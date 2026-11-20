const { test } = require('node:test');
const assert = require('node:assert/strict');
const { setzeInaktiv } = require('../src/services/artikelInaktiv');

function fakeDb(rows) {
  const log = [];
  const conn = {
    beginTransaction: async () => log.push('begin'), commit: async () => log.push('commit'), rollback: async () => log.push('rollback'), release: () => {},
    query: async (sql, p) => { log.push([sql.split(' ').slice(0, 3).join(' '), p]); return sql.startsWith('SELECT') ? [rows] : [{}]; },
  };
  return { db: { getConnection: async () => conn }, log };
}

test('setzt nur aktive Artikel auf inaktiv, schreibt Verlauf und feld_stand', async () => {
  const { db, log } = fakeDb([{ artikel_nr: '1', aktiv: 1, feld_stand: '{}' }, { artikel_nr: '2', aktiv: 0, feld_stand: null }]);
  const r = await setzeInaktiv(db, ['1', '2', '3'], { username: 'k' });
  assert.deepEqual(r, { geaendert: 1, schonInaktiv: 1, unbekannt: 1 });
  const updates = log.filter((l) => Array.isArray(l) && l[0].startsWith('UPDATE'));
  assert.equal(updates.length, 1);
  assert.equal(updates[0][1][1], '1');
  assert.match(updates[0][1][0], /"aktiv":\{"quelle":"portal"/);
  const verlauf = log.filter((l) => Array.isArray(l) && l[0].startsWith('INSERT'));
  assert.deepEqual(verlauf[0][1].slice(0, 4), ['1', 'aktiv', '1', '0']);
  assert.ok(log.includes('commit'));
});

test('ohne Nummern passiert nichts', async () => {
  const { db, log } = fakeDb([]);
  assert.deepEqual(await setzeInaktiv(db, []), { geaendert: 0, schonInaktiv: 0 });
  assert.equal(log.length, 0);
});
