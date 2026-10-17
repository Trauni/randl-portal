const { test } = require('node:test');
const assert = require('node:assert/strict');
const e = require('../src/services/metallEingang');

// ── Meldung pruefen ──

test('pruefeMeldung: Freischaltung ohne Vorgang', () => {
  const m = e.pruefeMeldung({ art: 'freischaltung', kdnr: ' 10042 ', name: 'Muster  GmbH', email: 'x@example.org', nachricht: '  Hallo\r\nWelt  ' });
  assert.equal(m.vorgangsnummer, null);
  assert.equal(m.kdnr, '10042');
  assert.equal(m.name, 'Muster GmbH');
  assert.equal(m.nachricht, 'Hallo\nWelt');
});

test('pruefeMeldung: Anfrage braucht Vorgangsnummer und Lexware-ID', () => {
  assert.throws(() => e.pruefeMeldung({ art: 'anfrage', lexware_id: 'k1' }), /Vorgangsnummer fehlt/);
  assert.throws(() => e.pruefeMeldung({ art: 'anfrage', vorgangsnummer: 'V-26-0012' }), /Lexware-ID fehlt/);
  assert.equal(e.pruefeMeldung({ art: 'nachbestellung', vorgangsnummer: 'V-26-0012', lexware_id: 'k1' }).vorgangsnummer, 'V-26-0012');
});

test('pruefeMeldung: Annahme braucht annahme_id', () => {
  assert.throws(() => e.pruefeMeldung({ art: 'annahme', vorgangsnummer: 'V-26-0012', lexware_id: 'k1' }), /Annahme fehlt/);
  assert.equal(e.pruefeMeldung({ art: 'annahme', vorgangsnummer: 'V-26-0012', lexware_id: 'k1', annahme_id: '7' }).annahmeId, 7);
});

test('pruefeMeldung: unbekannte Art, fehlender Kunde, zu lange Nachricht', () => {
  assert.throws(() => e.pruefeMeldung({ art: 'spam' }), /Unbekannte Art/);
  assert.throws(() => e.pruefeMeldung({ art: 'freischaltung' }), /Kunde fehlt/);
  assert.throws(() => e.pruefeMeldung({ art: 'freischaltung', kdnr: '1', nachricht: 'x'.repeat(2001) }), /zu lang/);
});

// ── Mit nachgebautem Pool ──

function fakePool({ vorgang, annahme, affected = 1, status } = {}) {
  const calls = [];
  return {
    calls,
    async execute(sql, params) {
      calls.push({ sql, params });
      if (/FROM metall_vorgang v JOIN metall_kunde/.test(sql)) return [[vorgang]];
      if (/FROM metall_annahme/.test(sql)) return [[annahme]];
      if (/^INSERT INTO metall_eingang/.test(sql.trim())) return [{ insertId: 42 }];
      if (/^UPDATE metall_eingang/.test(sql.trim())) return [{ affectedRows: affected }];
      if (/SELECT status FROM metall_eingang/.test(sql)) return [[status ? { status } : undefined]];
      return [{ affectedRows: 1 }];
    },
  };
}

test('melde: Anfrage → Vorgang des Kunden, Name aus dem Merker', async () => {
  const pool = fakePool({ vorgang: { id: 5, name: 'Muster GmbH' } });
  assert.deepEqual(await e.melde(pool, { art: 'anfrage', vorgangsnummer: 'V-26-0012', lexware_id: 'k1', nachricht: 'Geländer' }), { id: 42 });
  const ins = pool.calls.find(c => /INSERT/.test(c.sql));
  assert.deepEqual(ins.params, ['anfrage', 5, null, 'k1', null, null, 'Muster GmbH', null, 'Geländer']);
  assert.deepEqual(pool.calls[0].params, ['V-26-0012', 'k1']);
});

test('melde: fremder Vorgang → 404, nichts eingetragen', async () => {
  const pool = fakePool({ vorgang: undefined });
  await assert.rejects(e.melde(pool, { art: 'anfrage', vorgangsnummer: 'V-26-0012', lexware_id: 'k2' }), err => err.status === 404);
  assert.ok(!pool.calls.some(c => /INSERT/.test(c.sql)));
});

test('melde: Annahme muss zum Vorgang gehoeren', async () => {
  const body = { art: 'annahme', vorgangsnummer: 'V-26-0012', lexware_id: 'k1', annahme_id: 7 };
  await assert.rejects(e.melde(fakePool({ vorgang: { id: 5 }, annahme: { vorgang_id: 6 } }), body), err => err.status === 404);
  const pool = fakePool({ vorgang: { id: 5 }, annahme: { vorgang_id: 5 } });
  await e.melde(pool, body);
  assert.equal(pool.calls.find(c => /INSERT/.test(c.sql)).params[2], 7);
});

test('melde: Freischaltung ohne Vorgangsabfrage', async () => {
  const pool = fakePool();
  await e.melde(pool, { art: 'freischaltung', kdnr: '10042', lexware_id: 'k9', name: 'Neu GmbH' });
  assert.equal(pool.calls.length, 1);
  assert.deepEqual(pool.calls[0].params.slice(0, 4), ['freischaltung', null, null, 'k9']);
});

test('vermerkeMail: ok setzt Zeitpunkt, Fehler wird gekuerzt gespeichert', async () => {
  let pool = fakePool();
  await e.vermerkeMail(pool, '42', { ok: true });
  assert.match(pool.calls[0].sql, /mail_gesendet_am = NOW\(\)/);
  assert.deepEqual(pool.calls[0].params, [null, 42]);

  pool = fakePool();
  await e.vermerkeMail(pool, 42, { fehler: 'x'.repeat(600) });
  assert.match(pool.calls[0].sql, /mail_gesendet_am = NULL/);
  assert.equal(pool.calls[0].params[0].length, 500);

  await assert.rejects(e.vermerkeMail(fakePool({ affected: 0 }), 42, { ok: true }), err => err.status === 404);
  await assert.rejects(e.vermerkeMail(fakePool(), 'abc', { ok: true }), err => err.status === 404);
});

test('setzeStatus: erledigt nur aus neu, sonst 409 bzw. 404', async () => {
  const pool = fakePool();
  await e.setzeStatus(pool, 42, 'erledigt', { employeeId: 3 });
  assert.match(pool.calls[0].sql, /AND status = 'neu'/);
  assert.deepEqual(pool.calls[0].params, ['erledigt', 3, 42]);

  await assert.rejects(e.setzeStatus(fakePool({ affected: 0, status: 'erledigt' }), 42, 'abgelehnt'), err => err.status === 409);
  await assert.rejects(e.setzeStatus(fakePool({ affected: 0 }), 42, 'erledigt'), err => err.status === 404);
  await assert.rejects(e.setzeStatus(fakePool(), 42, 'geloescht'), err => err.status === 400);
});

test('setzeStatus: zurueckholen setzt Bearbeiter zurueck', async () => {
  const pool = fakePool();
  await e.setzeStatus(pool, 42, 'neu');
  assert.match(pool.calls[0].sql, /erledigt_von = NULL, erledigt_am = NULL WHERE id = \? AND status <> 'neu'/);
});
