/** Typ ändern, Gasart nur bei Füllungen, Pfandflasche ODER Kaufflasche (Regeln im Artikelstamm). */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { pruefeAenderung, pruefeNeuanlage, pruefeZustand, folgenAusTypwechsel } = require('../src/utils/artikelstammAendern');

test('Typ ist änderbar: F, P, S, V, sonst Fehler, nie leer', () => {
  assert.equal(pruefeAenderung({ typ: 'p' }).werte.typ, 'P');
  assert.equal(pruefeAenderung({ typ: 'S' }).werte.typ, 'S');
  assert.match(pruefeAenderung({ typ: 'X' }).fehler[0], /Typ/);
  assert.match(pruefeAenderung({ typ: '' }).fehler[0], /nicht leer/);
});

test('Zustand: Nicht-Füllung hat keine Gasart, keine Pfand- und keine Kaufflasche', () => {
  assert.deepEqual(pruefeZustand('K1', { typ: 'S', gasart: null }), []);
  assert.match(pruefeZustand('K1', { typ: 'S', gasart: 'Propan' })[0], /keine Gasart/);
  assert.match(pruefeZustand('K1', { typ: 'P', pfand_artikel_nr: '7801200' })[0], /keine Pfandflasche/);
  assert.match(pruefeZustand('K1', { typ: 'V', kaufflasche_artikel_nr: 'X' })[0], /keine Kaufflasche/);
  assert.deepEqual(pruefeZustand('7801100', { typ: 'F', gasart: 'Propan', pfand_artikel_nr: '7801200' }), []);
});

test('Zustand: Pfandflasche und Kaufflasche schließen sich aus', () => {
  const f = pruefeZustand('7801100', { typ: 'F', pfand_artikel_nr: '7801200', kaufflasche_artikel_nr: '7801300' });
  assert.equal(f.length, 1);
  assert.match(f[0], /schließen sich aus/);
  assert.deepEqual(pruefeZustand('7801100', { typ: 'F', pfand_artikel_nr: '7801200', kaufflasche_artikel_nr: '' }), []);
});

test('Wechsel zur Nicht-Füllung leert Gasart, Pfand/Kaufflasche, Preisgruppe und blendet im Shop aus', () => {
  const alt = { typ: 'F', gasart: 'Propan', kategorie: 'propan', kg_fuellung: 11, pfand_artikel_nr: '7801200', kaufflasche_artikel_nr: null, ek_gruppe: 'propan', shop_sichtbar: null };
  assert.deepEqual(folgenAusTypwechsel('S', alt), { gasart: null, kategorie: null, kg_fuellung: null, pfand_artikel_nr: null, ek_gruppe: null, shop_sichtbar: 0 });
  // schon gesetztes Shop-Kennzeichen bleibt, leere Felder werden nicht angefasst
  assert.deepEqual(folgenAusTypwechsel('P', { gasart: null, shop_sichtbar: 1 }), {});
  // zurück zur Füllung ändert nichts automatisch
  assert.deepEqual(folgenAusTypwechsel('F', { gasart: null, shop_sichtbar: null }), {});
});

test('Neuanlage prüft dieselben Regeln', () => {
  assert.match(pruefeNeuanlage({ artikel_nr: 'K1', bezeichnung: 'Kappe', typ: 'S', gasart: 'Propan' }).fehler.join(), /keine Gasart/);
  assert.match(pruefeNeuanlage({ artikel_nr: 'F1', bezeichnung: 'X', typ: 'F', pfand_artikel_nr: 'P1', kaufflasche_artikel_nr: 'K1' }).fehler.join(), /schließen sich aus/);
  assert.deepEqual(pruefeNeuanlage({ artikel_nr: 'K1', bezeichnung: 'Kappe', typ: 'S' }).fehler, []);
});

// ── Schreibweg mit Attrappe der Datenbank ──
const db = require('../src/db');
let tabelle; let verlauf;
const fakeConn = {
  async beginTransaction() {}, async commit() {}, async rollback() {}, release() {},
  async query(sql, p) {
    if (/^SELECT artikel_nr, feld_stand/.test(sql)) return [tabelle.filter((r) => p[0].includes(r.artikel_nr)).map((r) => ({ ...r }))];
    if (/WHERE pfand_artikel_nr = \?/.test(sql)) return [tabelle.filter((r) => r.pfand_artikel_nr === p[0]).map((r) => ({ artikel_nr: r.artikel_nr }))];
    if (/^SELECT typ FROM/.test(sql)) return [tabelle.filter((r) => r.artikel_nr === p[0]).map((r) => ({ typ: r.typ }))];
    if (/^SELECT 1 FROM/.test(sql)) return [tabelle.filter((r) => r.artikel_nr === p[0]).map(() => ({ 1: 1 }))];
    if (/^UPDATE gas_artikel SET/.test(sql)) {
      const nr = p[p.length - 1]; const spalten = sql.match(/SET (.*), feld_stand/)[1].split(', ').map((x) => x.replace(' = ?', ''));
      const r = tabelle.find((x) => x.artikel_nr === nr); spalten.forEach((s, i) => { r[s] = p[i]; }); return [{}];
    }
    if (/^INSERT INTO gas_artikel_aenderungen/.test(sql)) { verlauf.push(...p[0]); return [{}]; }
    throw new Error('unerwartete Abfrage: ' + sql);
  },
};
db.getPool = () => ({ getConnection: async () => fakeConn });
const service = require('../src/services/artikelstamm');
const neu = () => {
  tabelle = [
    { artikel_nr: '7801100', typ: 'F', bezeichnung: 'Propan 11 kg', gasart: 'Propan', kategorie: 'propan', kg_fuellung: 11, pfand_artikel_nr: '7801200', kaufflasche_artikel_nr: null, ek_gruppe: 'propan', shop_sichtbar: 1, zaehlt_als_flasche: 1, feld_stand: null },
    { artikel_nr: '7801200', typ: 'P', bezeichnung: 'Pfand 11 kg', gasart: null, kategorie: null, kg_fuellung: null, pfand_artikel_nr: null, kaufflasche_artikel_nr: null, ek_gruppe: null, shop_sichtbar: 0, zaehlt_als_flasche: 0, feld_stand: null },
    { artikel_nr: 'K1', typ: 'F', bezeichnung: 'Flaschenkappe', gasart: 'Sonstige', kategorie: null, kg_fuellung: null, pfand_artikel_nr: null, kaufflasche_artikel_nr: null, ek_gruppe: null, shop_sichtbar: null, zaehlt_als_flasche: 1, feld_stand: null },
  ];
  verlauf = [];
};

test('Kappe von Füllung zu Steuer/Nutzung: Gasart wird geleert, nicht mehr als Flasche gezählt, im Shop aus, Verlauf vollständig', async () => {
  neu();
  const r = await service.aendere(['K1'], { typ: 'S' }, { id: 1, fullName: 'Klaus' });
  assert.equal(r.geaendert, 1);
  const k = tabelle.find((x) => x.artikel_nr === 'K1');
  assert.deepEqual([k.typ, k.gasart, k.zaehlt_als_flasche, k.shop_sichtbar], ['S', null, 0, 0]);
  const felder = verlauf.map((v) => v[1]).sort();
  assert.deepEqual(felder, ['gasart', 'shop_sichtbar', 'typ', 'zaehlt_als_flasche']);
});

test('Füllung mit Pfandflasche zu Provision: Pfandbezug wird mitgeleert', async () => {
  neu();
  await service.aendere(['7801100'], { typ: 'V' }, {});
  const f = tabelle.find((x) => x.artikel_nr === '7801100');
  assert.deepEqual([f.typ, f.gasart, f.pfand_artikel_nr, f.ek_gruppe], ['V', null, null, null]);
});

test('Pfandartikel, an dem noch eine Füllung hängt, bleibt Typ P', async () => {
  neu();
  await assert.rejects(() => service.aendere(['7801200'], { typ: 'S' }, {}), (e) => e.status === 400 && /noch Pfandflasche von 7801100/.test(e.message));
  assert.equal(tabelle.find((x) => x.artikel_nr === '7801200').typ, 'P');
});

test('Gasart auf eine Nicht-Füllung setzen wird abgelehnt, Pfand und Kaufflasche zugleich ebenfalls', async () => {
  neu();
  await assert.rejects(() => service.aendere(['7801200'], { gasart: 'Propan' }, {}), (e) => /keine Gasart/.test(e.message));
  // beides ausdrücklich zugleich: abgelehnt
  await assert.rejects(() => service.aendere(['7801100'], { pfand_artikel_nr: '7801200', kaufflasche_artikel_nr: 'K1' }, {}), (e) => /schließen sich aus/.test(e.message));
  assert.equal(tabelle.find((x) => x.artikel_nr === '7801100').kaufflasche_artikel_nr, null);
});

test('Kaufflasche setzen löst die vorhandene Pfandflasche automatisch (und umgekehrt), statt abzulehnen', async () => {
  neu();
  const a = tabelle.find((x) => x.artikel_nr === '7801100');
  assert.ok(a.pfand_artikel_nr, 'Ausgangslage: Pfandflasche vorhanden');
  const r = await service.aendere(['7801100'], { kaufflasche_artikel_nr: 'K1' }, {});
  assert.equal(r.geaendert, 1);
  assert.equal(a.kaufflasche_artikel_nr, 'K1');
  assert.equal(a.pfand_artikel_nr, null);
});

test('Altlasten blockieren keine anderen Änderungen (Regeln greifen nur bei betroffenen Feldern)', async () => {
  neu();
  tabelle.find((x) => x.artikel_nr === '7801200').gasart = 'Propan'; // Altlast: Pfand mit Gasart
  const r = await service.aendere(['7801200'], { bezeichnung: 'Pfand Propan 11 kg' }, {});
  assert.equal(r.geaendert, 1);
});
