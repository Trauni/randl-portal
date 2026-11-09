const test = require('node:test');
const assert = require('node:assert');
const { findeMitarbeiter, namenAusClaims } = require('../src/services/mitarbeiterMatch');

const fakeDb = (rows) => ({
  execute: async (sql, [v]) => {
    if (sql.includes('authentik_uid = ?')) return [rows.filter(r => r.authentik_uid === v)];
    if (sql.includes('rentman_id = ?')) return [rows.filter(r => r.rentman_id === v)];
    return [rows.filter(r => (r.email || '').trim().toLowerCase() === v)];
  },
});

test('ID-Treffer vor E-Mail', async () => {
  const db = fakeDb([{ id: 1, authentik_uid: 'u1', email: 'a@x.de' }, { id: 2, authentik_uid: 'u2', email: 'b@x.de' }]);
  const r = await findeMitarbeiter(db, { authentikUid: 'u2', email: 'a@x.de' });
  assert.strictEqual(r.row.id, 2);
});

test('E-Mail-Fallback ohne Groß-/Kleinschreibung (Rentman-Zeile ohne uid)', async () => {
  const db = fakeDb([{ id: 5, authentik_uid: null, rentman_id: 7, email: 'Test.User@Randl.de' }]);
  const r = await findeMitarbeiter(db, { authentikUid: 'neu', email: 'test.user@randl.de' });
  assert.strictEqual(r.row.id, 5);
  assert.strictEqual(r.via, 'email');
});

test('Mehrdeutige E-Mail ist Konflikt', async () => {
  const db = fakeDb([{ id: 1, email: 'a@x.de' }, { id: 2, email: 'A@x.de' }]);
  const r = await findeMitarbeiter(db, { email: 'a@x.de' });
  assert.strictEqual(r.row, null);
  assert.ok(r.konflikt);
});

test('E-Mail gehört anderer Authentik-ID: Konflikt', async () => {
  const db = fakeDb([{ id: 1, authentik_uid: 'u1', email: 'a@x.de' }]);
  const r = await findeMitarbeiter(db, { authentikUid: 'u9', email: 'a@x.de' });
  assert.ok(r.konflikt);
});

test('Nulltreffer', async () => {
  const r = await findeMitarbeiter(fakeDb([]), { authentikUid: 'u', email: 'n@x.de' });
  assert.deepStrictEqual(r, { row: null });
});

test('Name aus Claims: Benutzername zählt nicht als Name', () => {
  assert.strictEqual(namenAusClaims({ name: 'testuser', preferred_username: 'testuser' }), '');
  assert.strictEqual(namenAusClaims({ given_name: 'Test', family_name: 'User' }), 'Test User');
  assert.strictEqual(namenAusClaims({}), '');
});
