const { test } = require('node:test');
const assert = require('node:assert/strict');
const { leseCsv, gleicheAb, zahl, dekodiere } = require('../src/utils/artikelDateiAbgleich');

test('CSV: Semikolon, Anführungszeichen, Zeilenumbruch im Feld, BOM', () => {
  const r = leseCsv('﻿Artikelnummer;Bezeichnung;Beschreibung\r\nRG-1;"Propan; 11 kg";"Zeile1\nZeile2"\r\nRG-2;B;\r\n');
  assert.deepEqual(r, [{ Artikelnummer: 'RG-1', Bezeichnung: 'Propan; 11 kg', Beschreibung: 'Zeile1\nZeile2' }, { Artikelnummer: 'RG-2', Bezeichnung: 'B', Beschreibung: '' }]);
});

test('Zahl: Komma und Punkt', () => {
  assert.equal(zahl('294,12'), 294.12);
  assert.equal(zahl('16.5'), 16.5);
  assert.equal(zahl('1.234,5'), 1234.5);
  assert.equal(zahl(''), null);
});

test('Abgleich: Unterschiede in Name, Einheit und Preis, nur-Listen', () => {
  const datei = [
    { Artikelnummer: 'RG-1', Bezeichnung: 'Propan neu', Einheit: 'Füllung', 'VK (Netto)': '30,8' },
    { Artikelnummer: 'GZ-5', Bezeichnung: 'Ventil', Einheit: 'Stück', 'VK (Netto)': '35' },
  ];
  const stamm = [{ artikel_nr: '1', bezeichnung: 'Propan alt', einheit: null, preis_netto_cent: 3080, aktiv: 1 }, { artikel_nr: '9', bezeichnung: 'Weg', aktiv: 1 }];
  const lex = [
    { articleNumber: 'RG-1', title: 'Propan alt', unitName: 'Stück', price: { netPrice: 30.8 } },
    { articleNumber: 'GZ-7', title: 'Nur Lexware', unitName: 'Stück' },
    { articleNumber: 'RZ-1', title: 'andere Sparte', unitName: 'Stück' },
  ];
  const r = gleicheAb(datei, stamm, lex);
  assert.equal(r.zeilen[0].unterschiede, 'Name Portal; Name Lexware; Einheit Lexware');
  assert.equal(r.zeilen[1].imPortal, 'nein');
  assert.deepEqual(r.nurPortal.map((x) => x.artikel_nr), ['9']);
  assert.deepEqual(r.nurLexware.map((x) => x.nummer), ['GZ-7']);
});

test('Kodierung: UTF-8 und Windows-Latin-1 (Excel) ergeben denselben Text', () => {
  assert.equal(dekodiere(Buffer.from('Füllung Stück', 'utf8')), 'Füllung Stück');
  assert.equal(dekodiere(Buffer.from('Füllung Stück', 'latin1')), 'Füllung Stück');
});
