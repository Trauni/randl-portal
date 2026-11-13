/** #552: Artikelstamm-Import aus dem SER-Export (Excel-tolerant) und Abgleich „nur leere Felder füllen“. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { leseArtikelExport, planeAbgleich } = require('../src/utils/artikelstammImport');

const KOPF = 'id;versorger_id;typ;nr;name;preis;pfand_produkt_id;active;history_discriminator;fuellgewicht;unnr;ggvs_faktor;gefahrzettel_nr;geloescht;inhalt;mwst_ermaessigt';
const csv = (...zeilen) => Buffer.from([KOPF, ...zeilen].join('\r\n') + '\r\n', 'utf-8');

const PROPAN = '1;318;F;7801200;11-kg Brenngas Pfand;2926;2;True;C;11000;1965;3;02. Jan;False;11000;False';
const PFAND = '2;318;P;2801200;11-kg Wertpfand;2512;;True;C;0;;0;;False;0;False';

test('liest Semikolon-CSV aus Excel, rechnet Cent/Gramm um und repariert die Gefahrklasse', () => {
  const { artikel, warnings } = leseArtikelExport(csv(PROPAN, PFAND));
  const p = artikel.find(a => a.artikel_nr === '7801200').werte;
  assert.equal(p.un_nr, '1965');
  assert.equal(p.gefahrklasse, '2.1');
  assert.equal(p.befoerderungskategorie, 2);
  assert.equal(p.fuellgewicht_kg, 11);
  assert.equal(p.preis_netto_cent, 2926);
  assert.equal(p.mwst_satz, 19);
  assert.equal(p.pfand_artikel_nr, '2801200');
  assert.equal(p.kategorie, 'propan');
  assert.ok(warnings.some(w => /Datum verwandelt/.test(w)));
});

test('Zeilen ohne Historie-Kennung zählen als aktuell, gelöschte und Historie nicht', () => {
  const ohne = '3;318;S;5900050;Acetylen2.0;;;;;;;;;;;';
  const historie = '4;318;F;1111111;Alt;100;;True;H;0;;0;;False;0;False';
  const geloescht = '5;318;F;2222222;Weg;100;;True;C;0;;0;;True;0;False';
  const { artikel } = leseArtikelExport(csv(PROPAN, ohne, historie, geloescht));
  assert.deepEqual(artikel.map(a => a.artikel_nr).sort(), ['5900050', '7801200']);
  assert.equal(artikel.find(a => a.artikel_nr === '5900050').aktiv, true); // leer = aktiv
});

test('fehlender Pfandartikel wird gemeldet, Zuordnung bleibt leer', () => {
  const { artikel, warnings } = leseArtikelExport(csv(PROPAN));
  assert.equal(artikel[0].werte.pfand_artikel_nr, null);
  assert.ok(warnings.some(w => /Pfandartikel/.test(w)));
});

test('doppelte Artikelnummer bricht ab; Datei ohne SER-Spalten wird abgelehnt', () => {
  assert.throws(() => leseArtikelExport(csv(PROPAN, PROPAN.replace(/^1;/, '9;'))), /mehrfach/);
  assert.throws(() => leseArtikelExport(Buffer.from('a;b\r\n1;2\r\n')), /Spalten fehlen/);
});

test('Abgleich: neu anlegen', () => {
  const { artikel } = leseArtikelExport(csv(PROPAN, PFAND));
  const plan = planeAbgleich([], artikel, { jetzt: 'T' });
  assert.equal(plan.neu.length, 2);
  assert.deepEqual(plan.neu[0].feld_stand.un_nr, { quelle: 'ser', am: 'T' });
});

test('Abgleich: füllt nur leere Felder und überschreibt neuere Preise nicht', () => {
  const { artikel } = leseArtikelExport(csv(PROPAN));
  const bestand = [{ artikel_nr: '7801200', bezeichnung: '11-kg Brenngas Pfand', typ: 'F', un_nr: null,
    preis_netto_cent: 3080, mwst_satz: '19.0', fuellgewicht_kg: '11.000', ggvs_faktor: 3 }];
  const plan = planeAbgleich(bestand, artikel);
  assert.equal(plan.neu.length, 0);
  assert.equal(plan.ergaenzt[0].werte.un_nr, '1965');
  assert.equal('preis_netto_cent' in plan.ergaenzt[0].werte, false);
  assert.deepEqual(plan.abweichend[0].felder.map(f => f.feld), ['preis_netto_cent']);
  assert.equal(plan.abweichend[0].felder[0].portal, 3080);
});

test('Abgleich: unveränderte Artikel und Artikel nur im Portal', () => {
  const { artikel } = leseArtikelExport(csv(PFAND));
  const bestand = [
    { artikel_nr: '2801200', bezeichnung: '11-kg Wertpfand', typ: 'P', preis_netto_cent: 2512, mwst_satz: 19, ggvs_faktor: null },
    { artikel_nr: 'XYZ', bezeichnung: 'Nur im Portal' },
  ];
  const plan = planeAbgleich(bestand, artikel);
  assert.equal(plan.unveraendert, 1);
  assert.deepEqual(plan.nurImPortal, ['XYZ']);
});
