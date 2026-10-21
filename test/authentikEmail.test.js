const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

process.env.AUTHENTIK_API_URL = 'https://auth.test/api/v3';
process.env.AUTHENTIK_API_TOKEN = 'x';
const { updateUserEmail } = require('../src/services/authentik');

let calls;
let users;
beforeEach(() => {
  calls = [];
  users = [{ pk: 7, username: 'mmuster', email: 'alt@randl.de' }];
  global.fetch = async (url, opts = {}) => {
    calls.push({ url, method: opts.method || 'GET', body: opts.body });
    const q = new URL(url).searchParams;
    let results = [];
    if (q.has('username')) results = users.filter(u => u.username === q.get('username'));
    else if (q.has('email')) results = users.filter(u => u.email === q.get('email'));
    return { ok: true, text: async () => JSON.stringify(opts.method ? {} : { results }) };
  };
});

test('updateUserEmail: sucht per Benutzername und patcht die neue Adresse', async () => {
  const r = await updateUserEmail({ username: 'mmuster', oldEmail: 'alt@randl.de', email: 'neu@randl.de' });
  assert.deepEqual(r, { username: 'mmuster', geaendert: true });
  const patch = calls.find(c => c.method === 'PATCH');
  assert.equal(patch.url, 'https://auth.test/api/v3/core/users/7/');
  assert.deepEqual(JSON.parse(patch.body), { email: 'neu@randl.de' });
});

test('updateUserEmail: Fallback auf alte E-Mail, wenn der Benutzername nicht passt', async () => {
  const r = await updateUserEmail({ username: 'anders', oldEmail: 'alt@randl.de', email: 'neu@randl.de' });
  assert.equal(r.geaendert, true);
});

test('updateUserEmail: kein PATCH, wenn Authentik die Adresse schon hat', async () => {
  const r = await updateUserEmail({ username: 'mmuster', email: 'alt@randl.de' });
  assert.equal(r.geaendert, false);
  assert.equal(calls.some(c => c.method === 'PATCH'), false);
});

test('updateUserEmail: Fehler ohne Authentik-Konto', async () => {
  await assert.rejects(updateUserEmail({ username: 'niemand', email: 'neu@randl.de' }), /Kein Authentik-Konto/);
});
