const { test } = require('node:test');
const assert = require('node:assert/strict');
const k = require('../src/services/metallKonto');

// Nachgebautes shopFetch: Antworten pro Pfad
function fakeFetch(antworten) {
  const calls = [];
  const f = async (pfad, opt) => {
    calls.push({ pfad, opt });
    const a = typeof antworten === 'function' ? antworten(pfad, opt) : antworten[pfad];
    if (a instanceof Error) throw a;
    const { status = 200, body = {} } = a || { status: 404, body: { error: 'nicht gefunden' } };
    return { ok: status < 300, status, json: async () => body };
  };
  f.calls = calls;
  return f;
}

test('ladeKonten: eine Abfrage mit eindeutigen IDs, Map nach lexware_id', async () => {
  const f = fakeFetch(() => ({ body: [{ lexware_id: 'a', status: 'aktiv' }] }));
  const m = await k.ladeKonten(f, ['a', 'a', null, 'b/c']);
  assert.equal(f.calls.length, 1);
  assert.equal(f.calls[0].pfad, '/admin/metall/konten?ids=a,b%2Fc');
  assert.equal(m.get('a').status, 'aktiv');
  const leer = fakeFetch({});
  assert.equal((await k.ladeKonten(leer, [])).size, 0);
  assert.equal(leer.calls.length, 0);
});

test('Aktionen: Pfade, Methode, Body', async () => {
  const f = fakeFetch(() => ({ body: { ok: true } }));
  await k.legeAn(f, 'L1');
  await k.sperre(f, 'L1');
  await k.entsperre(f, 'L1');
  await k.sendeReset(f, 'L1');
  await k.briefDaten(f, 'L1');
  assert.deepEqual(f.calls.map(c => `${c.opt.method} ${c.pfad}`), [
    'POST /admin/metall/konten',
    'POST /admin/metall/konten/L1/sperren',
    'POST /admin/metall/konten/L1/entsperren',
    'POST /admin/metall/konten/L1/reset-mail',
    'GET /admin/metall/konten/L1/brief',
  ]);
  assert.deepEqual(JSON.parse(f.calls[0].opt.body), { lexware_id: 'L1' });
  assert.equal(f.calls[4].opt.body, undefined);
});

test('Fehler: Sachfehler durchreichen, sonst 502/503', async () => {
  await assert.rejects(k.legeAn(fakeFetch(() => ({ status: 400, body: { error: 'PLZ fehlt' } })), 'L1'),
    e => e.name === 'ShopError' && e.status === 400 && e.message === 'PLZ fehlt');
  await assert.rejects(k.sperre(fakeFetch(() => ({ status: 500, body: {} })), 'L1'), e => e.status === 502);
  await assert.rejects(k.sperre(fakeFetch(() => new Error('ECONNREFUSED')), 'L1'), e => e.status === 503 && /nicht erreichbar/.test(e.message));
});

function fakePool(kunden) {
  return {
    async query(sql) {
      if (/FROM metall_kunde k WHERE k.aktiv = 1/.test(sql)) return [kunden];
      if (/FROM metall_vorgang v/.test(sql)) return [[]]; // sucheVorgaenge: keine Vorgaenge
      throw new Error(`unerwartet: ${sql}`);
    },
  };
}

test('ladeUebersicht: Konto pro Kunde, ohne Konto „keiner“, Gas-Shop weg → konto null mit Hinweis', async () => {
  const kunden = [{ id: 1, lexware_kontakt_id: 'a', belege_offen: '2' }, { id: 2, lexware_kontakt_id: 'b', belege_offen: 0 }];
  const r = await k.ladeUebersicht({ pool: fakePool(kunden), fetcher: fakeFetch(() => ({ body: [{ lexware_id: 'a', status: 'erstlogin', gas: true }] })) });
  assert.equal(r.konto_fehler, null);
  assert.equal(r.kunden[0].konto.status, 'erstlogin');
  assert.equal(r.kunden[0].belege_offen, 2);
  assert.equal(r.kunden[0].vorgaenge_laufend, 0);
  assert.equal(r.kunden[1].konto.status, 'keiner');

  const weg = await k.ladeUebersicht({ pool: fakePool(kunden), fetcher: fakeFetch(() => new Error('timeout')) });
  assert.match(weg.konto_fehler, /nicht erreichbar/);
  assert.equal(weg.kunden[0].konto, null);
  assert.equal(weg.kunden.length, 2);
});
