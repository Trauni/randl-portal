/** Artikelstamm bearbeiten: Prüfung der Eingaben für Einzel- und Massenänderung. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { pruefeAenderung } = require('../src/utils/artikelstammAendern');

test('UN-Nummer: "UN 1965" und "1965" werden zu 1965, Unsinn wird abgelehnt', () => {
  assert.equal(pruefeAenderung({ un_nr: 'UN 1965' }).werte.un_nr, '1965');
  assert.equal(pruefeAenderung({ un_nr: ' 1965 ' }).werte.un_nr, '1965');
  assert.match(pruefeAenderung({ un_nr: '19' }).fehler[0], /4 Ziffern/);
});

test('ADR-Faktor setzt die Beförderungskategorie mit', () => {
  assert.equal(pruefeAenderung({ ggvs_faktor: 3 }).werte.befoerderungskategorie, 2);
  assert.equal(pruefeAenderung({ ggvs_faktor: '50' }).werte.befoerderungskategorie, 1);
  assert.equal(pruefeAenderung({ ggvs_faktor: 10 }).werte.befoerderungskategorie, null);
});

test('leer leert nullbare Felder, aber nicht die Bezeichnung', () => {
  assert.deepEqual(pruefeAenderung({ un_nr: '', pfand_artikel_nr: null }).werte, { un_nr: null, pfand_artikel_nr: null });
  assert.match(pruefeAenderung({ bezeichnung: ' ' }).fehler[0], /nicht leer/);
});

test('Gefahrklasse, Preis und Komma-Zahlen', () => {
  assert.equal(pruefeAenderung({ gefahrklasse: '2.1' }).werte.gefahrklasse, '2.1');
  assert.match(pruefeAenderung({ gefahrklasse: '02. Jan' }).fehler[0], /Gefahrklasse/);
  assert.equal(pruefeAenderung({ preis_netto_cent: '2926' }).werte.preis_netto_cent, 2926);
  assert.match(pruefeAenderung({ preis_netto_cent: 29.26 }).fehler[0], /ganze Zahl/);
  assert.equal(pruefeAenderung({ fuellgewicht_kg: '11,5' }).werte.fuellgewicht_kg, 11.5);
  assert.equal(pruefeAenderung({ aktiv: false }).werte.aktiv, 0);
});

test('unbekannte Felder und leere Eingabe werden abgelehnt', () => {
  assert.match(pruefeAenderung({ artikel_nr: 'X' }).fehler[0], /nicht änderbar/);
  assert.match(pruefeAenderung({}).fehler[0], /Keine Änderung/);
});

const { pruefeNeuanlage } = require('../src/utils/artikelstammAendern');

test('Neuanlage: Pflichtfelder und Nummer', () => {
  const ok = pruefeNeuanlage({ artikel_nr: ' T040 ', bezeichnung: 'Helium 10 L', typ: 'F', un_nr: 'UN 1046', preis_netto_cent: '15000' });
  assert.deepEqual(ok.fehler, []);
  assert.equal(ok.artikel_nr, 'T040');
  assert.deepEqual(ok.werte, { bezeichnung: 'Helium 10 L', typ: 'F', un_nr: '1046', preis_netto_cent: 15000 });
  assert.ok(pruefeNeuanlage({ bezeichnung: 'x', typ: 'F' }).fehler.some(f => /artikel_nr/.test(f)));
  assert.ok(pruefeNeuanlage({ artikel_nr: 'A B', bezeichnung: 'x', typ: 'F' }).fehler.some(f => /artikel_nr/.test(f)));
  assert.ok(pruefeNeuanlage({ artikel_nr: 'A1', bezeichnung: '', typ: 'F' }).fehler.some(f => /bezeichnung/.test(f)));
  assert.ok(pruefeNeuanlage({ artikel_nr: 'A1', bezeichnung: 'x', typ: 'Z' }).fehler.some(f => /typ/.test(f)));
});

test('Neuanlage: Fehler in optionalen Feldern werden gemeldet', () => {
  const r = pruefeNeuanlage({ artikel_nr: 'A1', bezeichnung: 'x', typ: 'P', un_nr: '12' });
  assert.match(r.fehler.join(), /4 Ziffern/);
  assert.deepEqual(r.werte, {});
});

test('Füllmenge mit Einheit und ADR-Benennung sind änderbar', () => {
  const ok = pruefeAenderung({ fuellmenge: '10,5', fuellmenge_einheit: 'KG', bezadr: ' ARGON, VERDICHTET ' });
  assert.deepEqual(ok.werte, { fuellmenge: 10.5, fuellmenge_einheit: 'kg', bezadr: 'ARGON, VERDICHTET' });
  assert.match(pruefeAenderung({ fuellmenge_einheit: 'm3' }).fehler[0], /kg oder l/);
  assert.deepEqual(pruefeAenderung({ fuellmenge_einheit: '' }).werte, { fuellmenge_einheit: null });
});
