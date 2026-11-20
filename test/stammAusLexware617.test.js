/** #617 Schritt A3: Lexware-ID, Einheit, Bezeichnung und Sparte aus Lexware in den Stamm. Ohne echte Datenbank. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { planeStammAusLexware, uebernehmeStammAusLexware } = require('../src/services/stammAusLexware');

const lex = (nr, extra = {}) => ({ id: `id-${nr}`, articleNumber: nr, title: `Name ${nr}`, unitName: 'Stück', archived: false, ...extra });
const st = (nr, extra = {}) => ({ artikel_nr: nr, bezeichnung: `alt ${nr}`, einheit: null, lexware_id: null, gruppe_id: null, feld_stand: null, ...extra });

test('Plan: ID, Einheit, Name und Sparte; Zuordnung über Nummer ohne Präfix, auch GZ- statt PFAND-', () => {
  const p = planeStammAusLexware([st('5900000'), st('7801100')], [lex('GZ-5900000'), lex('RG-7801100', { unitName: 'Füllung' })]);
  assert.equal(p.zeilen.length, 2);
  assert.deepEqual(p.zeilen[0].neu, { lexware_id: 'id-GZ-5900000', einheit: 'Stück', bezeichnung: 'Name GZ-5900000', sparte: 'Gashandel' });
  assert.equal(p.zeilen[1].neu.einheit, 'Füllung');
});

test('Plan: Zelt-, Technik- und Maschinenbau-Nummern treffen keinen Gas-Stammartikel', () => {
  const p = planeStammAusLexware([st('11001')], [lex('RZ-11001')]);
  assert.deepEqual(p.keinLexware, ['11001']);
  assert.equal(p.zeilen.length, 0);
});

test('Plan: im Portal von Hand geänderter Name bleibt, wird gemeldet; mit Option überschrieben', () => {
  const stamm = [st('1', { feld_stand: '{"bezeichnung":{"quelle":"portal","am":"x"}}', einheit: 'Stück', lexware_id: 'id-RG-1', gruppe_id: 1 })];
  const p = planeStammAusLexware(stamm, [lex('RG-1')]);
  assert.equal(p.zeilen.length, 0);
  assert.deepEqual(p.portalGeaendert, [{ artikel_nr: '1', portal: 'alt 1', lexware: 'Name RG-1' }]);
  const q = planeStammAusLexware(stamm, [lex('RG-1')], { auchPortalGeaenderte: true });
  assert.equal(q.zeilen[0].neu.bezeichnung, 'Name RG-1');
});

test('Plan: mehrdeutig (RG- und NRG- zur selben Nummer) wird übersprungen; archivierte zählen nicht; vorhandene Sparte bleibt', () => {
  const p = planeStammAusLexware([st('2'), st('3', { gruppe_id: 7, einheit: 'Stück', lexware_id: 'id-RG-3', bezeichnung: 'Name RG-3' })],
    [lex('RG-2'), lex('NRG-2'), lex('RG-3'), lex('PFAND-3', { archived: true })]);
  assert.deepEqual(p.mehrdeutig, ['2']);
  assert.equal(p.gleich, 1);
});

function fakeDb(stamm) {
  const log = [];
  const conn = {
    beginTransaction: async () => log.push(['begin']), commit: async () => log.push(['commit']), rollback: async () => log.push(['rollback']), release: () => {},
    query: async (sql, p) => { log.push([sql.split(' ').slice(0, 3).join(' '), p]); return sql.startsWith('SELECT id') ? [[{ id: 5, name: 'Gashandel' }, { id: 6, name: 'Zeltverleih' }]] : [{}]; },
  };
  return { log, db: { query: async () => [stamm], getConnection: async () => conn } };
}

test('Übernahme: Sparten ohne Dubletten, Update mit feld_stand lexware, Verlauf je Feld, Typ unangetastet', async () => {
  const { db, log } = fakeDb([st('5900000')]);
  const r = await uebernehmeStammAusLexware(db, [lex('GZ-5900000')], { id: 1, username: 'k' }, { anzahl: 1 });
  assert.equal(r.geaendert, 1);
  const sql = log.map((l) => l[0]);
  assert.equal(sql.filter((x) => x.startsWith('INSERT INTO artikel_gruppe')).length, 4);
  const upd = log.find((l) => l[0].startsWith('UPDATE'));
  assert.doesNotMatch(upd[0], /typ/);
  assert.match(upd[1].at(-2), /"lexware_id":\{"quelle":"lexware"/);
  assert.ok(upd[1].includes(5), 'gruppe_id der Sparte Gashandel');
  const verlauf = log.find((l) => l[0].startsWith('INSERT INTO gas_artikel_aenderungen'));
  assert.deepEqual(verlauf[1][0].map((v) => v[1]), ['lexware_id', 'einheit', 'bezeichnung', 'gruppe']);
  assert.ok(sql.includes('commit'));
});

test('Übernahme: stimmt die Vorschau nicht mehr, 409 und nichts geschrieben', async () => {
  const { db, log } = fakeDb([st('5900000')]);
  await assert.rejects(uebernehmeStammAusLexware(db, [lex('GZ-5900000')], {}, { anzahl: 0 }), (e) => e.status === 409);
  assert.equal(log.length, 0);
});
