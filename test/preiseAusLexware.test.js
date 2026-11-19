/** Preise aus Lexware in den Artikelstamm übernehmen: Plan, Bestätigung, Schreibweg. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { planePreiseAusLexware, pruefeErwartung, uebernehmePreiseAusLexware } = require('../src/services/preiseAusLexware');
const { baueStamm } = require('../src/services/gasStamm');

const lex = (nr, netPrice, extra = {}) => ({ id: `L-${nr}`, articleNumber: nr, name: `Name ${nr}`, netPrice, ...extra });
const stamm = [
  { artikel_nr: '7801100', bezeichnung: 'Propan 11 kg', preis_netto_cent: 2926 },
  { artikel_nr: '7801300', bezeichnung: 'Propan 33 kg', preis_netto_cent: 9830 },
  { artikel_nr: 'T039', bezeichnung: 'Neu', preis_netto_cent: null },
  { artikel_nr: 'T022', bezeichnung: 'Sauerstoff', preis_netto_cent: 6955 },
  { artikel_nr: 'T001', bezeichnung: 'Biergas', preis_netto_cent: 6420 },
  { artikel_nr: '7801200', bezeichnung: 'Pfand', preis_netto_cent: 2000 },
];
const lexware = [lex('RG-7801100', 30.8), lex('RG-7801300', 98.3), lex('RG-T039', 45), lex('RG-T022', 69.55), lex('RG-T001', null), lex('RG-9999999', 5)];

test('Plan: nur Artikel mit abweichendem Preis, Cent genau, mit Differenz', () => {
  const p = planePreiseAusLexware(stamm, lexware);
  assert.deepEqual(p.zeilen.map((z) => [z.artikel_nr, z.alt_cent, z.neu_cent, z.diff_cent]), [['7801100', 2926, 3080, 154], ['T039', null, 4500, null]]);
  assert.equal(p.gleich, 2);               // 7801300 und T022
  assert.deepEqual(p.ohnePreis, ['T001']);  // Lexware ohne Nettopreis
  assert.equal(p.nurInLexware, 1);          // 9999999 steht nicht im Stamm
  assert.equal(p.summeDiffCent, 154);
});

test('Plan: RG- hat Vorrang vor NRG-, Artikel ohne Lexware-Gegenstück werden nicht angefasst', () => {
  const p = planePreiseAusLexware([{ artikel_nr: '1', bezeichnung: 'x', preis_netto_cent: 100 }, { artikel_nr: '2', bezeichnung: 'y', preis_netto_cent: 100 }],
    [lex('NRG-1', 9), lex('RG-1', 2)]);
  assert.deepEqual(p.zeilen.map((z) => [z.artikel_nr, z.neu_cent]), [['1', 200]]);
});

test('Bestätigung: nur mit unveränderter Anzahl und Summe', () => {
  const p = planePreiseAusLexware(stamm, lexware);
  assert.equal(pruefeErwartung(p, { anzahl: 2, summeDiffCent: 154 }), true);
  assert.equal(pruefeErwartung(p, { anzahl: 3, summeDiffCent: 154 }), false);
  assert.equal(pruefeErwartung(p, { anzahl: 2, summeDiffCent: 0 }), false);
  assert.equal(pruefeErwartung(p, undefined), false);
});

const fakeDb = (rows) => {
  const log = []; let commit = 0; let rollback = 0;
  const conn = { async beginTransaction() {}, async commit() { commit += 1; }, async rollback() { rollback += 1; }, release() {}, async query(sql, p) { log.push([sql, p]); return [{}]; } };
  return { log, conn, get commit() { return commit; }, get rollback() { return rollback; },
    async query() { return [rows]; }, async getConnection() { return conn; } };
};

test('Übernahme: Stammpreis, Änderungsverlauf und Preisprotokoll in einer Transaktion', async () => {
  const db = fakeDb(stamm.map((a) => ({ ...a, feld_stand: null })));
  const r = await uebernehmePreiseAusLexware(db, lexware, { id: 5, name: 'Klaus' }, { anzahl: 2, summeDiffCent: 154 });
  assert.deepEqual([r.geaendert, r.unveraendert, r.ohnePreis], [2, 2, 1]);
  assert.equal(db.commit, 1);
  const upd = db.log.filter(([s]) => s.startsWith('UPDATE gas_artikel'));
  assert.deepEqual(upd.map(([, p]) => [p[0], p[2]]), [[3080, '7801100'], [4500, 'T039']]);
  assert.equal(JSON.parse(upd[0][1][1]).preis_netto_cent.quelle, 'lexware');
  const verlauf = db.log.filter(([s]) => s.includes('gas_artikel_aenderungen'));
  assert.deepEqual(verlauf[0][1], ['7801100', 'preis_netto_cent', '2926', '3080', 5, 'Klaus']);
  assert.equal(verlauf[1][1][2], null); // T039 hatte keinen Preis
  const protokoll = db.log.filter(([s]) => s.includes('price_change_log'));
  assert.equal(protokoll.length, 2);
  assert.deepEqual([protokoll[0][1][5], protokoll[0][1][6]], [29.26, 30.8]);
  assert.match(protokoll[0][0], /'lexware'/);
});

test('Übernahme: veraltete Vorschau wird abgelehnt (409), nichts wird geschrieben', async () => {
  const db = fakeDb(stamm.map((a) => ({ ...a })));
  await assert.rejects(() => uebernehmePreiseAusLexware(db, lexware, {}, { anzahl: 5, summeDiffCent: 1 }), (e) => e.status === 409);
  assert.equal(db.log.length, 0);
  assert.equal(db.commit, 0);
});

test('Preis am Belegtag: Stammpreis neu, Protokoll hält den alten Preis bis zum Übernahmetag', () => {
  // So liest die Gas-Auswertung die Daten nach der Übernahme: alter Preis davor, neuer ab dem Übernahmetag
  const s = baueStamm({
    artikel: [{ artikel_nr: '7801100', bezeichnung: 'Propan 11 kg', gasart: 'Propan', kg_fuellung: 11, typ: 'F', preis_netto_cent: 3080 }],
    aenderungen: [{ id: 1, article_number: 'RG-7801100', datum: '2026-11-20', old_net: 29.26, new_net: 30.8 }],
  });
  assert.equal(s.listenpreis('7801100', '2026-11-03'), 29.26);
  assert.equal(s.listenpreis('7801100', '2026-11-20'), 30.8);
});
