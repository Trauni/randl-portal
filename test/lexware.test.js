const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createClient, LexwareError, BASE_URL } = require('../src/services/lexware');

// Nachgebautes fetch: antwortet der Reihe nach mit den vorgegebenen Antworten
function fakeFetch(antworten) {
  const calls = [];
  const fn = async (url, opts) => {
    calls.push({ url, method: opts.method, body: opts.body ? JSON.parse(opts.body) : undefined, headers: opts.headers });
    const a = antworten.shift();
    if (!a) throw new Error('keine Antwort mehr vorgesehen');
    return {
      status: a.status,
      ok: a.status >= 200 && a.status < 300,
      headers: { get: k => (a.headers || {})[k.toLowerCase()] },
      text: async () => (a.body === undefined ? '' : JSON.stringify(a.body)),
    };
  };
  fn.calls = calls;
  return fn;
}

function client(antworten, extra = {}) {
  const fetchImpl = fakeFetch(antworten);
  const pausen = [];
  const c = createClient({ apiKey: 'test-key', fetchImpl, abstandMs: 0, warte: async ms => { pausen.push(ms); }, ...extra });
  return { c, calls: fetchImpl.calls, pausen };
}

test('apiCall: Bearer-Header, URL, JSON-Antwort', async () => {
  const { c, calls } = client([{ status: 200, body: { id: 'k1' } }]);
  assert.deepEqual(await c.apiCall('GET', '/contacts/k1'), { id: 'k1' });
  assert.equal(calls[0].url, `${BASE_URL}/contacts/k1`);
  assert.equal(calls[0].headers.Authorization, 'Bearer test-key');
});

test('apiCall: ohne Schlüssel kein Aufruf', async () => {
  const { c, calls } = client([], { apiKey: () => undefined });
  await assert.rejects(() => c.apiCall('GET', '/contacts/k1'), /LEXWARE_API_KEY fehlt/);
  assert.equal(calls.length, 0);
});

test('apiCall: 429 → warten und wiederholen, Retry-After hat Vorrang', async () => {
  const { c, calls, pausen } = client([
    { status: 429 },
    { status: 429, headers: { 'retry-after': '2' } },
    { status: 200, body: { ok: 1 } },
  ]);
  assert.deepEqual(await c.apiCall('GET', '/x'), { ok: 1 });
  assert.equal(calls.length, 3);
  assert.deepEqual(pausen, [1500, 2000]);
});

test('apiCall: nach 4 Versuchen mit 429 → Fehler mit Status', async () => {
  const { c, calls } = client([{ status: 429 }, { status: 429 }, { status: 429 }, { status: 429 }]);
  await assert.rejects(() => c.apiCall('GET', '/x'), err => err instanceof LexwareError && err.status === 429);
  assert.equal(calls.length, 4);
});

test('apiCall: Fehlertext enthält IssueList', async () => {
  const { c } = client([{ status: 406, body: { message: 'Not Acceptable', IssueList: [{ i18nKey: 'invalid_value', source: 'note', type: 'validation_failure' }] } }]);
  await assert.rejects(() => c.apiCall('PUT', '/contacts/k1', {}), /406.*Not Acceptable – invalid_value \/ note \/ validation_failure/);
});

test('Drosselung: zwischen zwei Anfragen liegt der Abstand', async () => {
  const { c, pausen } = client([{ status: 200, body: {} }, { status: 200, body: {} }], { abstandMs: 1000 });
  await Promise.all([c.apiCall('GET', '/a'), c.apiCall('GET', '/b')]);
  assert.equal(pausen.length, 1);
  assert.ok(pausen[0] > 900 && pausen[0] <= 1000, `Pause war ${pausen[0]} ms`);
});

test('Drosselung: ein Fehler hält die Warteschlange nicht an', async () => {
  const { c } = client([{ status: 500, body: { message: 'kaputt' } }, { status: 200, body: { ok: 1 } }]);
  const [a, b] = await Promise.allSettled([c.apiCall('GET', '/a'), c.apiCall('GET', '/b')]);
  assert.equal(a.status, 'rejected');
  assert.deepEqual(b.value, { ok: 1 });
});

test('searchContacts: unter 3 Zeichen keine Anfrage, sonst content', async () => {
  const { c, calls } = client([{ status: 200, body: { content: [{ id: 'k1' }] } }]);
  assert.deepEqual(await c.searchContacts('ab'), []);
  assert.deepEqual(await c.searchContacts(' Muster '), [{ id: 'k1' }]);
  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /\/contacts\?customer=true&size=25&name=Muster$/);
});

const KONTAKT = {
  id: 'k1', organizationId: 'org', version: 3, archived: false,
  roles: { customer: { number: 10001 } },
  company: { name: 'Testfirma GmbH' },
  emailAddresses: { business: ['test@example.com'], private: ['p@example.com'] },
  note: 'Lieferung nur vormittags',
};

test('updateContactNote: schickt den ganzen Kontakt zurück, nur note geändert, ohne Nur-Lesen-Felder', async () => {
  const { c, calls } = client([{ status: 200, body: KONTAKT }, { status: 200, body: { id: 'k1', version: 4 } }]);
  const r = await c.updateContactNote('k1', n => `${n}\nMETALL`);
  assert.deepEqual(r, { geaendert: true, note: 'Lieferung nur vormittags\nMETALL', version: 4 });
  const put = calls[1];
  assert.equal(put.method, 'PUT');
  const erwartet = { ...KONTAKT, note: 'Lieferung nur vormittags\nMETALL' };
  delete erwartet.organizationId;
  delete erwartet.archived;
  assert.deepEqual(put.body, erwartet);
});

test('updateContactNote: unveränderte Notiz → kein PUT', async () => {
  const { c, calls } = client([{ status: 200, body: KONTAKT }]);
  const r = await c.updateContactNote('k1', n => n);
  assert.equal(r.geaendert, false);
  assert.equal(calls.length, 1);
});

test('updateContactNote: 409 → neu lesen und einmal wiederholen', async () => {
  const { c, calls } = client([
    { status: 200, body: KONTAKT },
    { status: 409, body: { message: 'Conflict' } },
    { status: 200, body: { ...KONTAKT, version: 4, note: 'Lieferung nur vormittags, neu' } },
    { status: 200, body: { id: 'k1', version: 5 } },
  ]);
  const r = await c.updateContactNote('k1', n => `${n}\nMETALL`);
  assert.equal(r.note, 'Lieferung nur vormittags, neu\nMETALL');
  assert.equal(calls[3].body.version, 4);
});

test('updateContactNote: zweimal 409 → Fehler', async () => {
  const { c } = client([
    { status: 200, body: KONTAKT }, { status: 409, body: {} },
    { status: 200, body: KONTAKT }, { status: 409, body: {} },
  ]);
  await assert.rejects(() => c.updateContactNote('k1', n => `${n}\nMETALL`), err => err.status === 409);
});
