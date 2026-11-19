/** #604: Preise und Artikel der Gas-Auswertung kommen aus gas_artikel + price_change_log. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { baueStamm, stammNr, gasartVon } = require('../src/services/gasStamm');
const { uebernehmePreis } = require('../src/services/gasArtikelPreis');
const ref = require('./fixtures/gasStammdatenReferenz');

test('Stamm aus Tabellenzeilen liefert dieselben Listenpreise wie die frühere Festtabelle', () => {
  const stamm = baueStamm(ref.stammZeilen());
  const tage = ['2026-01-05', '2026-06-01', '2026-10-05', '2026-10-06', '2026-10-07', '2026-10-12', '2026-10-13', '2026-11-03'];
  const nummern = Object.keys(ref.VK_AKTUELL);
  for (const nr of nummern) for (const t of tage) assert.equal(stamm.listenpreis(nr, t), ref.listenpreis(nr, t), `${nr} ${t}`);
  assert.equal(stamm.listenpreis('9999999', '2026-10-13'), null);
});

test('ARTIKEL: gleiche Artikel, Gasarten und kg wie die Festtabelle; Preis-only-Artikel zählen nicht als Flasche', () => {
  const stamm = baueStamm(ref.stammZeilen());
  assert.deepEqual(Object.keys(stamm.ARTIKEL).sort(), Object.keys(ref.ARTIKEL).sort());
  for (const [nr, a] of Object.entries(ref.ARTIKEL)) assert.deepEqual(stamm.ARTIKEL[nr], a, nr);
  assert.equal(stamm.ARTIKEL['5920050'], undefined);
  assert.equal(stamm.listenpreis('5920050', '2026-11-01'), 515);
});

test('Preis-Tool-Änderung im Protokoll wirkt ab ihrem Tag, davor gilt der alte Preis', () => {
  const stamm = baueStamm({
    artikel: [{ artikel_nr: '7801100', bezeichnung: '11-kg', gasart: 'Propan', kg_fuellung: 11, typ: 'F', preis_netto_cent: 3200 }],
    aenderungen: [{ id: 1, article_number: 'RG-7801100', datum: '2026-11-20', old_net: 30.8, new_net: 32 }],
  });
  assert.equal(stamm.listenpreis('7801100', '2026-11-19'), 30.8);
  assert.equal(stamm.listenpreis('7801100', '2026-11-20'), 32);
  assert.equal(stamm.aktuellerPreis('7801100'), 32);
});

test('Stamm: Pfand-/Steuerartikel zählen nicht, fehlende Gasart wird aus der Nummer abgeleitet', () => {
  const stamm = baueStamm({ artikel: [
    { artikel_nr: '7801201', bezeichnung: 'Pfand', gasart: null, typ: 'P', preis_netto_cent: 2000 },
    { artikel_nr: 'T039', bezeichnung: 'Neu', gasart: null, typ: 'F', preis_netto_cent: 1000 },
    { artikel_nr: '7801400', bezeichnung: 'Neu Propan', gasart: null, kg_fuellung: null, fuellgewicht_kg: 19, typ: 'F', preis_netto_cent: 5000 },
  ] });
  assert.equal(stamm.ARTIKEL['7801201'], undefined);
  assert.equal(stamm.ARTIKEL.T039.gasart, 'Sonstige');
  assert.ok(stamm.GASART_REIHENFOLGE.includes('Sonstige'));
  assert.equal(stamm.ARTIKEL['7801400'].gasart, 'Propan');
  assert.equal(stamm.ARTIKEL['7801400'].kg_fuellung, 19);
  assert.equal(stamm.listenpreis('T039', '2026-11-01'), 10);
});

test('Nummern ohne Präfix, gasartVon', () => {
  assert.equal(stammNr('RG-7801200'), '7801200');
  assert.equal(stammNr('NRG-7802500'), '7802500');
  assert.equal(stammNr('7801200'), '7801200');
  assert.equal(gasartVon('T038'), 'Formiergas');
  assert.equal(gasartVon('T099'), 'Sonstige');
});

const fakeDb = (zeile) => {
  const calls = [];
  return { calls, query: async (sql, p) => { calls.push([sql, p]); return /^SELECT/.test(sql) ? [zeile ? [zeile] : []] : [{}]; } };
};

test('Preis-Tool: neuer Preis landet in gas_artikel und im Änderungsverlauf', async () => {
  const db = fakeDb({ preis_netto_cent: 3080, feld_stand: null });
  const r = await uebernehmePreis(db, { artikelNummer: 'RG-7801100', neuNetto: 32.0, user: { id: 5, name: 'Klaus' } });
  assert.deepEqual([r.status, r.alt, r.neu], ['geschrieben', 3080, 3200]);
  const upd = db.calls.find(([s]) => s.startsWith('UPDATE gas_artikel'));
  assert.equal(upd[1][0], 3200); assert.equal(upd[1][2], '7801100');
  assert.equal(JSON.parse(upd[1][1]).preis_netto_cent.quelle, 'preis-tool');
  const ins = db.calls.find(([s]) => s.startsWith('INSERT INTO gas_artikel_aenderungen'));
  assert.deepEqual(ins[1], ['7801100', 'preis_netto_cent', '3080', '3200', 5, 'Klaus']);
});

test('Preis-Tool: gleicher Preis, unbekannter Artikel, ungültiger Preis schreiben nichts', async () => {
  const gleich = fakeDb({ preis_netto_cent: 3200 });
  assert.equal((await uebernehmePreis(gleich, { artikelNummer: 'RG-1', neuNetto: 32 })).status, 'gleich');
  assert.equal(gleich.calls.length, 1);
  const kein = fakeDb(null);
  assert.equal((await uebernehmePreis(kein, { artikelNummer: 'RG-1', neuNetto: 32 })).status, 'kein_stammartikel');
  assert.equal((await uebernehmePreis(kein, { artikelNummer: 'RG-1', neuNetto: 0 })).status, 'ungueltig');
  assert.equal((await uebernehmePreis(kein, { artikelNummer: 'RG-1', neuNetto: 'x' })).status, 'ungueltig');
});

test('Preismodell liefert die heutigen Listenpreise aus dem Stamm mit (Preistabelle, #608)', () => {
  const P = require('../src/services/gasPreismodell');
  const stamm = baueStamm(ref.stammZeilen());
  const r = P.rechneVariante([], [], { stamm, senkung: 0.04 });
  assert.equal(r.preise_heute['7801100'], 30.8);
  assert.equal(r.preise_heute['7802010'], 37.22);
  assert.equal(r.preise['7801100'], 29.6); // 30,80 −4 % auf 10 ct gerundet
  assert.deepEqual(Object.keys(r.preise_heute).sort(), [...P.PM_ARTIKEL].sort());
});
