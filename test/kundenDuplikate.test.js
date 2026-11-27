/** Prüfung Kunden-Duplikate Shop ↔ Lexware (doppelt angelegter Kunde). */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { nummernOhneKonflikt, nameSchluessel, strassenSchluessel, lexwareKontakt, shopKunde, lexwareDuplikate, shopDuplikate, abgleich } = require('../src/utils/kundenDuplikate');

const lex = (id, nr, name, street, zip) => lexwareKontakt({ id, roles: { customer: { number: nr } }, company: { name }, addresses: { billing: [{ street, zip, city: 'Ort' }] } });
const shop = (o) => shopKunde({ id: 's', name: 'X', billing_street: '', billing_zip: '', in_lexware: false, ...o });

test('Schlüssel: Reihenfolge, Rechtsform, Umlaute, Straße', () => {
  assert.equal(nameSchluessel('Mustermann Max GmbH'), nameSchluessel('Max Mustermann'));
  assert.equal(nameSchluessel('Müller'), 'mueller');
  assert.equal(strassenSchluessel('Hauptstraße 5'), strassenSchluessel('Hauptstr. 5'));
  assert.equal(strassenSchluessel('Haupt Straße 5'), strassenSchluessel('Hauptstr 5'));
});

test('Lexware-Duplikate nach Name+PLZ, gleiche Gruppe nur einmal', () => {
  const k = [lex('a', 10001, 'Mustermann', 'Dorfstr. 1', '84000'), lex('b', 10002, 'Mustermann', 'Dorfstraße 1', '84000'), lex('c', 1, 'Anders', 'Weg 2', '84000')];
  const g = lexwareDuplikate(k);
  assert.equal(g.length, 1);
  assert.deepEqual(g[0].eintraege.map((e) => e.nummer), ['10001', '10002']);
});

test('Lexware-Duplikate auch bei anderem Namen an gleicher Adresse', () => {
  const g = lexwareDuplikate([lex('a', 1, 'Mustermann Hof', 'Dorfstr. 1', '84000'), lex('b', 2, 'Max Mustermann', 'Dorfstraße 1', '84000')]);
  assert.equal(g.length, 1);
  assert.equal(g[0].art, 'Straße+PLZ');
});

test('Shop-Duplikate nach Name+PLZ', () => {
  const g = shopDuplikate([shop({ id: 1, name: 'Mustermann', billing_zip: '84000' }), shop({ id: 2, company_name: 'Mustermann', billing_zip: '84000' }), shop({ id: 3, name: 'Mustermann', billing_zip: '85000' })]);
  assert.equal(g.length, 1);
  assert.deepEqual(g[0].eintraege.map((e) => e.id), [1, 2]);
});

test('Abgleich: Fallback-Folgen erkennen', () => {
  const kontakte = [lex('A', 10001, 'Mustermann', '', '84000')];
  const kunden = [
    // neuer Kunde per Fallback auf 10001 umgehängt, Nummer blieb 10002
    shop({ id: 2, lexware_id: 'A', lexware_customer_number: '10002', in_lexware: true }),
    // bisheriger Kunde hat Verknüpfung verloren
    shop({ id: 1, lexware_id: null, lexware_customer_number: '10001' }),
    // Kontakt in Lexware gelöscht
    shop({ id: 3, lexware_id: 'GELOESCHT', lexware_customer_number: '10002', in_lexware: true }),
  ];
  const ab = abgleich(kunden, kontakte);
  assert.deepEqual(ab.nummerFalsch.map((k) => [k.id, k.nummer_lexware]), [[2, '10001']]);
  assert.deepEqual(ab.verwaist.map((k) => k.id), [1]);
  assert.deepEqual(ab.kontaktFehlt.map((k) => k.id), [3]);
  assert.deepEqual(ab.doppeltVerknuepft.map((g) => g.nummer), ['10002']);
});

test('Nummern-Korrektur: Konflikt mit Lexware- oder SER-Nummer eines anderen Kunden', () => {
  const falsch = [
    { id: 1, lexware_nr: '10458', nummer_lexware: '11095' },
    { id: 2, lexware_nr: '11210', nummer_lexware: '10018' },
    { id: 3, lexware_nr: '10739', nummer_lexware: '10099' },
  ];
  const kunden = [
    ...falsch.map((k) => shop(k)),
    shop({ id: 4, customer_number: '10018' }),           // SER-Nummer = neue Nummer
    shop({ id: 5, lexware_customer_number: '10099' }),   // Lexware-Nummer = neue Nummer
  ];
  const { ok, konflikt } = nummernOhneKonflikt(falsch, kunden);
  assert.deepEqual(ok.map((k) => k.id), [1]);
  assert.deepEqual(konflikt.map((k) => [k.id, k.mit.map((a) => a.id)]), [[2, [4]], [3, [5]]]);
});
