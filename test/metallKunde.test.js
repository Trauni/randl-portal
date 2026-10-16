const { test } = require('node:test');
const assert = require('node:assert/strict');
const { hatMerkmal, ergaenzeNotiz, NOTIZ_MAX } = require('../src/services/metallKunde');

test('hatMerkmal: ganzes Wort in Großbuchstaben', () => {
  assert.equal(hatMerkmal('METALL'), true);
  assert.equal(hatMerkmal('Lieferung vormittags\nMETALL'), true);
  assert.equal(hatMerkmal('GAS, METALL'), true);
  assert.equal(hatMerkmal('METALLBAU Huber'), false);
  assert.equal(hatMerkmal('Metall'), false);
  assert.equal(hatMerkmal(''), false);
  assert.equal(hatMerkmal(null), false);
});

test('ergaenzeNotiz: leer → nur METALL', () => {
  assert.equal(ergaenzeNotiz(''), 'METALL');
  assert.equal(ergaenzeNotiz(null), 'METALL');
  assert.equal(ergaenzeNotiz('   '), 'METALL');
});

test('ergaenzeNotiz: vorhandener Text bleibt, METALL als eigene Zeile', () => {
  assert.equal(ergaenzeNotiz('Lieferung vormittags'), 'Lieferung vormittags\nMETALL');
  assert.equal(ergaenzeNotiz('Zeile 1\nZeile 2\n\n'), 'Zeile 1\nZeile 2\nMETALL');
});

test('ergaenzeNotiz: schon vorhanden → unverändert', () => {
  const n = 'Lieferung vormittags\nMETALL\nRampe hinten';
  assert.equal(ergaenzeNotiz(n), n);
});

test('ergaenzeNotiz: zu lang → Fehler statt abschneiden', () => {
  assert.equal(ergaenzeNotiz('x'.repeat(NOTIZ_MAX - 7)).length, NOTIZ_MAX);
  assert.throws(() => ergaenzeNotiz('x'.repeat(NOTIZ_MAX - 6)), /zu lang/);
});

const { kontaktName, kontaktKdnr, setzeMerker, schreibeNotiz, entferneMerker } = require('../src/services/metallKunde');

// Nachgebauter Pool: merkt sich die Statements, SELECT liefert die Zeile,
// UPDATEs des Notiz-Status werden in die Zeile uebernommen
function fakePool(vorgabe) {
  const calls = [];
  const zeile = vorgabe && { ...vorgabe };
  return {
    calls,
    execute: async (sql, params) => {
      calls.push({ sql: sql.replace(/\s+/g, ' ').trim(), params });
      if (/^SELECT/i.test(sql.trim())) return [[zeile && { ...zeile }]];
      if (zeile && /notiz_status = 'ok'/.test(sql)) Object.assign(zeile, { notiz_status: 'ok', notiz_fehler: null, notiz_geschrieben_am: new Date() });
      if (zeile && /notiz_status = 'fehler'/.test(sql)) Object.assign(zeile, { notiz_status: 'fehler', notiz_fehler: params[0] });
      return [{ affectedRows: zeile ? 1 : 0 }];
    },
  };
}

function fakeLexware({ contact, fehler } = {}) {
  const calls = [];
  return {
    calls,
    getContact: async id => { calls.push(['get', id]); return contact; },
    updateContactNote: async (id, aendern, opts) => {
      calls.push(['note', id, opts?.aktuell === contact]);
      if (fehler) throw fehler;
      return { geaendert: true, note: aendern(contact?.note) };
    },
  };
}

const FIRMA = { id: 'k1', roles: { customer: { number: 10001 } }, company: { name: 'Testfirma GmbH' }, note: 'alt' };
const ZEILE = { id: 5, lexware_kontakt_id: 'k1', name: 'Testfirma GmbH', kdnr: '10001', aktiv: 1 };

test('kontaktName/kontaktKdnr: Firma, Person, ohne Daten', () => {
  assert.equal(kontaktName(FIRMA), 'Testfirma GmbH');
  assert.equal(kontaktName({ person: { firstName: 'Erika', lastName: 'Muster' } }), 'Erika Muster');
  assert.equal(kontaktName({}), '(ohne Namen)');
  assert.equal(kontaktKdnr(FIRMA), '10001');
  assert.equal(kontaktKdnr({ roles: { vendor: {} } }), null);
});

test('setzeMerker: anlegen/aktivieren, Notiz mit schon gelesenem Kontakt, Status ok', async () => {
  const pool = fakePool(ZEILE);
  const lex = fakeLexware({ contact: FIRMA });
  const r = await setzeMerker({ pool, lexware: lex }, { lexwareKontaktId: 'k1', employeeId: 3 });
  assert.equal(r.notiz_status, 'ok');
  assert.ok(r.notiz_geschrieben_am instanceof Date, 'Antwort zeigt den gespeicherten Zeitpunkt');
  assert.match(pool.calls[0].sql, /^INSERT INTO metall_kunde .* ON DUPLICATE KEY UPDATE .*aktiv = 1/);
  assert.deepEqual(pool.calls[0].params, ['k1', '10001', 'Testfirma GmbH', 3]);
  assert.deepEqual(lex.calls, [['get', 'k1'], ['note', 'k1', true]]);
  assert.match(pool.calls.at(-1).sql, /notiz_status = 'ok'/);
});

test('setzeMerker: kein Kunde → 400, nichts gespeichert', async () => {
  const pool = fakePool(ZEILE);
  const lex = fakeLexware({ contact: { id: 'k2', roles: { vendor: {} } } });
  await assert.rejects(() => setzeMerker({ pool, lexware: lex }, { lexwareKontaktId: 'k2' }), err => err.status === 400);
  assert.equal(pool.calls.length, 0);
});

test('setzeMerker: Notiz scheitert → Merker bleibt, Status fehler mit Grund', async () => {
  const pool = fakePool(ZEILE);
  const lex = fakeLexware({ contact: FIRMA, fehler: new Error('Lexware PUT /contacts/k1 (406): kaputt') });
  const r = await setzeMerker({ pool, lexware: lex }, { lexwareKontaktId: 'k1' });
  assert.equal(r.notiz_status, 'fehler');
  assert.match(r.notiz_fehler, /406/);
  assert.match(pool.calls[0].sql, /^INSERT/);
  assert.match(pool.calls.at(-1).sql, /notiz_status = 'fehler'/);
});

test('schreibeNotiz: zu lange Notiz → Status fehler, kein Absturz', async () => {
  const pool = fakePool(ZEILE);
  const lex = fakeLexware({ contact: { ...FIRMA, note: 'x'.repeat(1000) } });
  const r = await schreibeNotiz({ pool, lexware: lex }, ZEILE, { ...FIRMA, note: 'x'.repeat(1000) });
  assert.equal(r.notiz_status, 'fehler');
  assert.match(r.notiz_fehler, /zu lang/);
});

test('entferneMerker: nur aktiv = 0, kein Lexware-Aufruf', async () => {
  const pool = fakePool(ZEILE);
  assert.equal(await entferneMerker({ pool }, 5), true);
  assert.equal(pool.calls.length, 1);
  assert.match(pool.calls[0].sql, /^UPDATE metall_kunde SET aktiv = 0 WHERE id = \?$/);
  assert.equal(await entferneMerker({ pool: fakePool(undefined) }, 99), false);
});
