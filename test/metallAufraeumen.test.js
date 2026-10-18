const { test } = require('node:test');
const assert = require('node:assert/strict');
const a = require('../src/services/metallAufraeumen');

// ── Argumente ──

test('leseArgumente: KdNr, --loeschen, --jetzt, --zaehler-zuruecksetzen', () => {
  const r = a.leseArgumente(['126007', '--loeschen', ' 126008 ', '--jetzt', '--zaehler-zuruecksetzen']);
  assert.deepEqual(r, { behalten: ['126007'], loeschen: ['126008'], jetzt: true, zaehler: true });
});

test('leseArgumente: --loeschen gewinnt, Fehler bei fehlender KdNr/unbekannter Option', () => {
  assert.deepEqual(a.leseArgumente(['126008', '--loeschen', '126008']).behalten, []);
  assert.throws(() => a.leseArgumente(['--loeschen']), /braucht eine KdNr/);
  assert.throws(() => a.leseArgumente(['--loeschen', '--jetzt']), /braucht eine KdNr/);
  assert.throws(() => a.leseArgumente(['--alles']), /Unbekannte Option/);
});

// ── Mit nachgebautem Pool ──

const KUNDEN = [
  { id: 1, kdnr: '126007', name: 'Testfirma', lexware_kontakt_id: 'k-a' },
  { id: 2, kdnr: '126008', name: 'Testfirma 2', lexware_kontakt_id: 'k-b' },
  { id: 3, kdnr: '10042', name: 'Muster Metallbau GmbH', lexware_kontakt_id: 'k-c' },
];

function fakeDb({ vorgaenge = [], rest = 0, fehlerBei = null } = {}) {
  const calls = [];
  const conn = {
    async beginTransaction() { calls.push('BEGIN'); },
    async commit() { calls.push('COMMIT'); },
    async rollback() { calls.push('ROLLBACK'); },
    release() { calls.push('RELEASE'); },
    async query(sql, params) {
      calls.push({ sql, params });
      if (fehlerBei && fehlerBei.test(sql)) throw new Error('DB kaputt');
      if (/SELECT COUNT\(\*\) AS n FROM metall_vorgang$/.test(sql)) return [[{ n: rest }]];
      return [{ affectedRows: 1 }];
    },
  };
  return {
    calls,
    async getConnection() { return conn; },
    async query(sql, params) {
      calls.push({ sql, params });
      if (/FROM metall_kunde WHERE TRIM\(kdnr\) IN/.test(sql)) return [KUNDEN.filter(k => params[0].includes(k.kdnr))];
      if (/FROM metall_vorgang WHERE kunde_id IN/.test(sql)) return [vorgaenge.filter(v => params[0].includes(v.kunde_id))];
      if (/COUNT\(\*\)/.test(sql)) return [[{ n: 2 }]];
      throw new Error('unerwartet: ' + sql);
    },
  };
}

test('ladeKunden: unbekannte KdNr und echter Kunde brechen ab', async () => {
  await assert.rejects(a.ladeKunden(fakeDb(), ['999']), /kein Metallkunde/);
  await assert.rejects(a.ladeKunden(fakeDb(), ['10042']), /kein Testkunde/);
  assert.equal((await a.ladeKunden(fakeDb(), ['126007'])).length, 1);
});

test('plane: Vorgaenge beider Testkunden, Belege getrennt nach ignorieren/loeschen', async () => {
  const db = fakeDb({ vorgaenge: [{ id: 5, vorgangsnummer: 'V-26-0001', kunde_id: 1 }, { id: 6, vorgangsnummer: 'V-26-0002', kunde_id: 2 }] });
  const plan = await a.plane(db, { behalten: ['126007'], loeschen: ['126008'] });
  assert.deepEqual(plan.vorgaenge.map(v => v.id), [5, 6]);
  assert.equal(plan.zaehl.belege_ignorieren, 2);
  assert.equal(plan.zaehl.belege_loeschen, 2);
  const eingang = db.calls.find(c => /FROM metall_eingang/.test(c.sql));
  assert.deepEqual(eingang.params, [[5, 6], ['126007', '126008'], ['k-a', 'k-b']]);
  assert.ok(!db.calls.some(c => /UPDATE|DELETE/.test(c.sql)), 'Probe schreibt nichts');
});

test('fuehreAus: Reihenfolge in einer Transaktion, Belege ignoriert, Testfirma 2 ganz weg, Ordner danach', async () => {
  const db = fakeDb();
  const rm = [];
  const plan = {
    behalten: [KUNDEN[0]], loeschen: [KUNDEN[1]],
    vorgaenge: [{ id: 5, vorgangsnummer: 'V-26-0001' }, { id: 6, vorgangsnummer: '../etc' }],
  };
  const erg = await a.fuehreAus({ pool: db, uploadDir: '/ablage', rm: async (p, o) => rm.push([p, o]) }, plan, { zaehler: true });
  const sqls = db.calls.map(c => (typeof c === 'string' ? c : c.sql.replace(/\s+/g, ' ').slice(0, 40)));
  const idx = s => sqls.findIndex(x => x.startsWith(s));
  assert.equal(sqls[0], 'BEGIN');
  // Kinder vor dem Vorgang, Belege vor dem Merker
  for (const kind of ['DELETE FROM metall_benachrichtigung', 'DELETE FROM metall_eingang', 'DELETE FROM metall_annahme', 'DELETE FROM metall_datei']) {
    assert.ok(idx(kind) >= 0 && idx(kind) < idx('DELETE FROM metall_vorgang WHERE'), kind);
  }
  assert.ok(idx('DELETE FROM metall_beleg') < idx('DELETE FROM metall_kunde'));
  const ignor = db.calls.find(c => c.sql && /zuordnung = 'ignoriert'/.test(c.sql));
  assert.deepEqual(ignor.params, [['k-a']]);
  assert.deepEqual(db.calls.find(c => c.sql && /DELETE FROM metall_beleg/.test(c.sql)).params, [['k-b']]);
  assert.deepEqual(db.calls.find(c => c.sql && /DELETE FROM metall_kunde/.test(c.sql)).params, [[2]]);
  assert.ok(sqls.indexOf('COMMIT') > idx('DELETE FROM metall_vorgang_zaehler'));
  assert.equal(erg.zaehler_zurueckgesetzt, true);
  // nur gueltige Vorgangsnummer als Ordner
  assert.deepEqual(rm, [['/ablage/V-26-0001', { recursive: true, force: true }]]);
});

test('fuehreAus: Zaehler bleibt, wenn noch Vorgaenge da sind; ohne Vorgaenge kein leeres IN ()', async () => {
  const db = fakeDb({ rest: 3 });
  const erg = await a.fuehreAus({ pool: db, uploadDir: null, rm: async () => {} },
    { behalten: [KUNDEN[0]], loeschen: [], vorgaenge: [] }, { zaehler: true });
  assert.equal(erg.zaehler_zurueckgesetzt, false);
  assert.ok(!db.calls.some(c => c.sql && /metall_vorgang_zaehler/.test(c.sql)));
  assert.ok(!db.calls.some(c => c.sql && /DELETE FROM metall_kunde/.test(c.sql)));
  assert.deepEqual(db.calls.find(c => c.sql && /DELETE FROM metall_datei/.test(c.sql)).params, [[0]]);
});

test('fuehreAus: Fehler → Rollback, keine Ordner geloescht', async () => {
  const db = fakeDb({ fehlerBei: /DELETE FROM metall_vorgang WHERE/ });
  const rm = [];
  await assert.rejects(a.fuehreAus({ pool: db, uploadDir: '/ablage', rm: async p => rm.push(p) },
    { behalten: [KUNDEN[0]], loeschen: [], vorgaenge: [{ id: 5, vorgangsnummer: 'V-26-0001' }] }), /DB kaputt/);
  assert.ok(db.calls.includes('ROLLBACK') && !db.calls.includes('COMMIT') && db.calls.includes('RELEASE'));
  assert.deepEqual(rm, []);
});
