/** #617 Schritt A4: fehlende Lexware-Artikel im Stamm anlegen. Ohne echte Datenbank. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { planeNeuAusLexware, legeNeuAusLexwareAn, typVon } = require('../src/services/stammNeuAusLexware');

const l = (nr, extra = {}) => ({ id: `id-${nr}`, articleNumber: nr, title: `Name ${nr}`, unitName: 'Stück', archived: false, price: { netPrice: 16.5, taxRatePercentage: 19 }, ...extra });

test('Plan: nur GZ- und nur, was im Stamm fehlt; Typ Zubehör, Versand/Fracht Dienstleistung; Preis in Cent', () => {
  const p = planeNeuAusLexware([{ artikel_nr: '5900003' }],
    [l('GZ-5901600'), l('GZ-5900003'), l('GZ-8996500', { title: 'Versandporto Flasche' }), l('RG-7801100'), l('PFAND-2801000'), l('GZ-1', { archived: true })], []);
  assert.deepEqual(p.zeilen.map((z) => [z.artikel_nr, z.typ]), [['5901600', 'Z'], ['8996500', 'D']]);
  assert.equal(p.zeilen[0].preis_netto_cent, 1650);
  assert.equal(p.zeilen[0].mwst_satz, 19);
  assert.equal(p.zeilen[0].sparte, 'Gashandel');
});

test('Plan: bewusst Gelöschtes, zu lange oder unpassende Nummern werden übersprungen und gemeldet', () => {
  const p = planeNeuAusLexware([], [l('GZ-100'), l('GZ-200'), l('GZ-NR MIT LEERZEICHEN'), l('GZ-300', { title: 'x'.repeat(121) })], ['100']);
  assert.deepEqual(p.zeilen.map((z) => z.artikel_nr), ['200']);
  assert.equal(p.uebersprungen.length, 3);
});

test('Plan: andere Präfixe nur auf Wunsch (PFAND = Pfand, RG = Füllung)', () => {
  const p = planeNeuAusLexware([], [l('RG-1'), l('PFAND-2')], [], { praefixe: ['PFAND', 'RG'] });
  assert.deepEqual(p.zeilen.map((z) => [z.artikel_nr, z.typ]), [['1', 'F'], ['2', 'P']]);
  assert.equal(typVon('RZ', 'x'), null);
});

function fakeDb(stamm, geloescht = []) {
  const log = [];
  const conn = {
    beginTransaction: async () => log.push(['begin']), commit: async () => log.push(['commit']), rollback: async () => log.push(['rollback']), release: () => {},
    query: async (sql, p) => { log.push([sql.split(' ').slice(0, 3).join(' '), p]); return sql.startsWith('SELECT id') ? [[{ id: 5, name: 'Gashandel' }]] : [{}]; },
  };
  return { log, db: { getConnection: async () => conn, query: async (sql) => [sql.includes('geloescht') ? geloescht : stamm] } };
}

test('Anlegen: Zeile mit Lexware-ID, Einheit, Sparte, Preis, kein Shop-Kennzeichen, Verlauf; nichts bei geänderter Vorschau', async () => {
  const { db, log } = fakeDb([]);
  const r = await legeNeuAusLexwareAn(db, [l('GZ-5901600')], { id: 1, username: 'k' }, { anzahl: 1 });
  assert.deepEqual(r, { angelegt: 1, uebersprungen: 0 });
  const ins = log.find((x) => x[0] === 'INSERT INTO gas_artikel');
  assert.ok(ins[1].includes('5901600') && ins[1].includes('Z') && ins[1].includes(1650) && ins[1].includes(5) && ins[1].includes('id-GZ-5901600'));
  assert.ok(log.some((x) => x[0] === 'INSERT INTO gas_artikel_aenderungen'));
  assert.ok(log.some((x) => x[0] === 'commit'));

  const { db: db2, log: log2 } = fakeDb([]);
  await assert.rejects(legeNeuAusLexwareAn(db2, [l('GZ-5901600')], {}, { anzahl: 0 }), (e) => e.status === 409);
  assert.equal(log2.length, 0);
});

test('Gelöschte: nur mit auchGeloeschte angelegt, Löschvermerk fällt weg; inaktiv legt inaktiv an', async () => {
  const p = planeNeuAusLexware([], [l('GZ-100'), l('GZ-200')], ['100'], { auchGeloeschte: true });
  assert.deepEqual(p.zeilen.map((z) => [z.artikel_nr, z.warGeloescht]), [['100', true], ['200', false]]);

  const { db, log } = fakeDb([], [{ artikel_nr: '100' }]);
  const r = await legeNeuAusLexwareAn(db, [l('GZ-100'), l('GZ-200')], { username: 'k' }, { anzahl: 2 }, { auchGeloeschte: true, inaktiv: true });
  assert.equal(r.angelegt, 2);
  const inserts = log.filter((x) => x[0] === 'INSERT INTO gas_artikel');
  assert.equal(inserts[0][1][1], 0, 'aktiv = 0');
  const dels = log.filter((x) => x[0] === 'DELETE FROM gas_artikel_geloescht');
  assert.deepEqual(dels.map((d) => d[1]), [['100']]);
});
