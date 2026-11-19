/** #606: Filter der Artikel-Liste (Parität zu den alten Seiten Produkte und Artikelstamm). */
const { test } = require('node:test');
const assert = require('node:assert/strict');

const z = (o) => ({ artikel_nr: '1', bezeichnung: 'x', typ: 'F', aktiv: true, un_nr: null, luecken: [], lexware: null, lexware_status: 'ok', ser_status: 'ok', ...o });
const lex = (tags, inhalt) => ({ id: 'L', tags, inhalt });
const daten = [
  z({ artikel_nr: '7801100', bezeichnung: 'Propan 11 kg', un_nr: '1965', lexware: lex(['Gas', 'Propan'], { value: 11, unit: 'kg' }) }),
  z({ artikel_nr: 'T022', bezeichnung: 'Sauerstoff 50 L', lexware: lex(['Gas'], { value: 50, unit: 'L' }), luecken: ['UN-Nr.'] }),
  z({ artikel_nr: 'T039', bezeichnung: 'Neu', lexware: lex([], null), ser_status: 'abweichend' }),
  z({ artikel_nr: '7801200', bezeichnung: 'Pfand 11 kg', typ: 'P', aktiv: false }),
  z({ artikel_nr: '7801300', bezeichnung: 'Kauf', typ: 'S' }),
  z({ artikel_nr: '9999999', bezeichnung: 'Nur Lexware', typ: null, aktiv: null, lexware: lex(['Gas'], { value: 5, unit: 'kg' }) }),
];
const nrn = (l) => l.map((a) => a.artikel_nr);

test('Filter: Kurzfilter, Typ, nur aktive', async () => {
  const { filtereArtikel } = await import('../client/src/utils/artikelFilter.js');
  assert.equal(filtereArtikel(daten).length, 6);
  assert.deepEqual(nrn(filtereArtikel(daten, { kurz: 'fuell' })), ['7801100', 'T022', 'T039']);
  assert.deepEqual(nrn(filtereArtikel(daten, { kurz: 'flasche' })), ['7801200', '7801300']);
  assert.deepEqual(nrn(filtereArtikel(daten, { kurz: 'abw' })), ['T039']);
  assert.deepEqual(nrn(filtereArtikel(daten, { kurz: 'luecke' })), ['T022']);
  assert.deepEqual(nrn(filtereArtikel(daten, { typ: 'S' })), ['7801300']);
  const aktiv = nrn(filtereArtikel(daten, { nurAktiv: true }));
  assert.ok(!aktiv.includes('7801200'));
  assert.ok(aktiv.includes('9999999'), 'Artikel nur in Lexware bleiben bei "nur aktive" sichtbar');
});

test('Filter: Einheit kg, L, fehlt und Tags', async () => {
  const { filtereArtikel } = await import('../client/src/utils/artikelFilter.js');
  assert.deepEqual(nrn(filtereArtikel(daten, { einheit: 'kg' })), ['7801100', '9999999']);
  assert.deepEqual(nrn(filtereArtikel(daten, { einheit: 'L' })), ['T022']);
  assert.deepEqual(nrn(filtereArtikel(daten, { einheit: 'fehlt' })), ['T039']);
  assert.deepEqual(nrn(filtereArtikel(daten, { tags: ['Propan'] })), ['7801100']);
  assert.deepEqual(nrn(filtereArtikel(daten, { tags: ['Propan', 'Gas'] })), ['7801100', 'T022', '9999999']);
});

test('Filter: Suche mit mehreren Wörtern in Nummer, Name und UN-Nummer', async () => {
  const { filtereArtikel } = await import('../client/src/utils/artikelFilter.js');
  assert.deepEqual(nrn(filtereArtikel(daten, { suche: '1965' })), ['7801100']);
  assert.deepEqual(nrn(filtereArtikel(daten, { suche: 'propan 11' })), ['7801100']);
  assert.deepEqual(nrn(filtereArtikel(daten, { suche: ' t022 ' })), ['T022']);
  assert.deepEqual(filtereArtikel(daten, { suche: 'gibtsnicht' }), []);
});

test('Prüffilter: Füllung ohne UN-Nr. bzw. ohne Pfandflasche', async () => {
  const { filtereArtikel, LUECKEN } = await import('../client/src/utils/artikelFilter.js');
  assert.deepEqual(nrn(filtereArtikel(daten, { fehlt: 'UN-Nr.' })), ['T022']);
  assert.deepEqual(filtereArtikel(daten, { fehlt: 'Pfandflasche' }), []);
  assert.ok(LUECKEN.includes('Pfandflasche') && LUECKEN.includes('UN-Nr.'));
});
