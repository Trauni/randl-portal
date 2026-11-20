/** #617: Knopf "In Lexware anlegen": Vorschau und Anlegen mit Verknüpfung. Ohne echte Datenbank und ohne Lexware-Anfragen. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { vorschau, anlegen } = require('../src/services/lexwareAnlage');

const stamm = [
  { artikel_nr: '2805400', bezeichnung: 'Kleinflaschenpalette', typ: 'S', einheit: null, preis_netto_cent: 1500, mwst_satz: 19 },
  { artikel_nr: '5920101', bezeichnung: 'Ballongas Leergut 10 L Flasche', typ: 'P', einheit: null, preis_netto_cent: 9000, mwst_satz: null },
];
function fakeDb() {
  const log = [];
  return { log, db: { query: async (sql, p) => {
    log.push([sql.split(' ').slice(0, 3).join(' '), p]);
    if (sql.startsWith('SELECT artikel_nr, bezeichnung')) return [stamm.filter((s) => p[0].includes(s.artikel_nr))];
    if (sql.startsWith('SELECT id, name')) return [[{ id: 5, name: 'Gashandel' }]];
    if (sql.startsWith('SELECT feld_stand')) return [[{ feld_stand: null, gruppe_id: null }]];
    return [{}];
  } } };
}

test('Vorschau: Typ Pfand bekommt PFAND-, Typ Kaufflasche braucht ein Präfix; mit Präfix geht es', async () => {
  const { db } = fakeDb();
  const v = await vorschau(db, ['2805400', '5920101'], undefined, { listArticles: async () => [] });
  assert.deepEqual(v.zeilen.map((z) => z.lexware_nummer), ['PFAND-5920101']);
  assert.equal(v.zeilen[0].netto, 90);
  assert.equal(v.brauchtPraefix, true);
  const m = await vorschau(db, ['2805400'], 'GZ', { listArticles: async () => [] });
  assert.deepEqual(m.zeilen.map((z) => z.lexware_nummer), ['GZ-2805400']);
  assert.equal(m.brauchtPraefix, false);
});

test('Anlegen: POST je Artikel, danach Lexware-ID, Einheit und Sparte im Stamm, Verlauf; bei geänderter Vorschau 409', async () => {
  const { db, log } = fakeDb();
  const gesendet = [];
  const createArticle = async (p) => { gesendet.push(p); return { id: 'neu-1' }; };
  const r = await anlegen(db, ['5920101'], undefined, { username: 'k' }, { anzahl: 1 }, { listArticles: async () => [], createArticle });
  assert.deepEqual(r, { angelegt: [{ artikel_nr: '5920101', lexware_nummer: 'PFAND-5920101' }], fehler: null });
  assert.equal(gesendet[0].articleNumber, 'PFAND-5920101');
  const upd = log.find((l) => l[0] === 'UPDATE gas_artikel SET');
  assert.ok(upd[1].includes('neu-1') && upd[1].includes('Stück') && upd[1].includes(5) && upd[1].includes('5920101'));
  assert.ok(log.some((l) => l[0] === 'INSERT INTO gas_artikel_aenderungen'));

  await assert.rejects(anlegen(db, ['5920101'], undefined, {}, { anzahl: 0 }, { listArticles: async () => [], createArticle }), (e) => e.status === 409);
});

test('Anlegen: Fehler in Lexware bricht ab, bereits Angelegtes bleibt gemeldet; Probleme in der Vorschau verhindern alles', async () => {
  const { db } = fakeDb();
  let n = 0;
  const createArticle = async () => { if (++n === 2) throw new Error('Lexware 400: kaputt'); return { id: `id${n}` }; };
  const zwei = [...stamm, { artikel_nr: '9', bezeichnung: 'X', typ: 'P', einheit: 'Stück', preis_netto_cent: 100, mwst_satz: 19 }];
  const db2 = { query: async (sql, p) => (sql.startsWith('SELECT artikel_nr, bezeichnung') ? [zwei.filter((s) => p[0].includes(s.artikel_nr))] : db.query(sql, p)) };
  const r = await anlegen(db2, ['5920101', '9'], undefined, {}, { anzahl: 2 }, { listArticles: async () => [], createArticle });
  assert.equal(r.angelegt.length, 1);
  assert.match(r.fehler, /PFAND-9: Lexware 400/);

  await assert.rejects(anlegen(db, ['2805400'], undefined, {}, { anzahl: 0 }, { listArticles: async () => [], createArticle }), (e) => e.status === 400 && /Präfix/.test(e.message));
  await assert.rejects(vorschau(db, [], undefined, { listArticles: async () => [] }), (e) => e.status === 400);
});
