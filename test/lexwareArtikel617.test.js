/** #617 Schritt A2: Lexware-Artikel lesen (alle Seiten) und auswerten. Ohne echte Anfragen. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createClient } = require('../src/services/lexware');
const { analysiere, praefixVon, ohnePraefix } = require('../src/utils/lexwareArtikelAnalyse');

function clientMit(antworten) {
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(url);
    const a = antworten.shift();
    if (!a) throw new Error('keine Antwort mehr vorgesehen');
    return { status: 200, ok: true, headers: { get: () => undefined }, text: async () => JSON.stringify(a) };
  };
  return { c: createClient({ apiKey: 'k', fetchImpl, abstandMs: 0, warte: async () => {} }), calls };
}

const art = (nr, extra = {}) => ({ id: `id-${nr}`, title: `Artikel ${nr}`, type: 'PRODUCT', articleNumber: nr, unitName: 'Stück', archived: false, ...extra });

test('listArticles: liest alle Seiten, nur GET auf /articles', async () => {
  const { c, calls } = clientMit([
    { content: [art('A'), art('B')], last: false, totalPages: 2 },
    { content: [art('C')], last: true, totalPages: 2 },
  ]);
  const alle = await c.listArticles({ size: 2 });
  assert.deepEqual(alle.map((a) => a.articleNumber), ['A', 'B', 'C']);
  assert.equal(calls.length, 2);
  assert.match(calls[0], /\/articles\?page=0&size=2$/);
  assert.match(calls[1], /\/articles\?page=1&size=2$/);
});

test('listArticles: hört auf, wenn eine Seite nicht voll ist', async () => {
  const { c, calls } = clientMit([{ content: [art('A')] }]);
  assert.equal((await c.listArticles({ size: 250 })).length, 1);
  assert.equal(calls.length, 1);
});

test('Präfix und Nummer ohne Präfix', () => {
  assert.equal(praefixVon('RG-7801100'), 'RG');
  assert.equal(praefixVon('nrg-1'), 'NRG');
  assert.equal(praefixVon('PFAND-7801200'), 'PFAND');
  assert.equal(praefixVon('T002'), '(ohne Präfix)');
  assert.equal(praefixVon(''), '(ohne Nummer)');
  assert.equal(ohnePraefix('PFAND-7801200'), '7801200');
  assert.equal(ohnePraefix('T002'), 'T002');
});

test('Auswertung: Zähler nach Typ, Präfix und Einheit, archivierte getrennt', () => {
  const lex = [
    art('RG-1', { unitName: 'Füllung' }), art('NRG-2', { unitName: 'Füllung' }), art('PFAND-3', { unitName: 'Pfand' }),
    art('Z-9', { type: 'SERVICE', unitName: 'Stunde' }), art('RG-5', { archived: true }), art('', { articleNumber: undefined, unitName: '' }),
  ];
  const r = analysiere(lex, []);
  assert.equal(r.gesamt, 6);
  assert.equal(r.aktiv, 5);
  assert.equal(r.archiviert, 1);
  assert.deepEqual(r.nachTyp, { PRODUCT: 4, SERVICE: 1 });
  assert.deepEqual(r.nachPraefix, { RG: 1, NRG: 1, PFAND: 1, Z: 1, '(ohne Nummer)': 1 });
  assert.equal(r.nachEinheit['Füllung'], 2);
  assert.equal(r.nachEinheit['(leer)'], 1);
  assert.equal(r.ohneNummer, 1);
  assert.equal(r.einheitJePraefix['PFAND | Pfand'], 1);
});

test('Auswertung: RG-/NRG-Paare zur selben Nummer und doppelte Nummern', () => {
  const r = analysiere([art('RG-7'), art('NRG-7'), art('RG-8'), art('RG-8')], []);
  assert.deepEqual(r.mehrfachOhnePraefix, [
    { stammNr: '7', lexware: ['NRG-7', 'RG-7'] },
    { stammNr: '8', lexware: ['RG-8', 'RG-8'] },
  ]);
  assert.deepEqual(r.gleicheNummer, [{ nummer: 'RG-8', anzahl: 2 }]);
});

test('Auswertung: Abgleich mit dem Stamm, auch über andere Präfixe wie PFAND-', () => {
  const r = analysiere(
    [art('RG-7801100'), art('PFAND-7801200'), art('RG-9999999')],
    [{ artikel_nr: '7801100' }, { artikel_nr: '7801200' }, { artikel_nr: 'T002' }],
  );
  assert.equal(r.stamm.artikel, 3);
  assert.equal(r.stamm.mitLexwareArtikel, 2);
  assert.deepEqual(r.stamm.nurImStamm, ['T002']);
  assert.equal(r.stamm.lexwareOhneStamm, 1);
});

test('Auswertung: Beispiele je Präfix sind begrenzt', () => {
  const lex = Array.from({ length: 12 }, (_, i) => art(`X-${i}`));
  assert.equal(analysiere(lex, []).beispielJePraefix.X.length, 5);
});

test('Auswertung ändert die Eingaben nicht', () => {
  const lex = [art('RG-1'), art('NRG-1')];
  const kopie = JSON.parse(JSON.stringify(lex));
  analysiere(lex, [{ artikel_nr: '1' }]);
  assert.deepEqual(lex, kopie);
});

// ── Listen zum Durchgehen (Detailausgabe) ──────────────────────────────────────────────────────────
const { listen, alsCsv, sparteVon } = require('../src/utils/lexwareArtikelAnalyse');

test('Sparte nach Präfix: RM heißt Maschinenbau', () => {
  assert.equal(sparteVon('RG'), 'Gashandel');
  assert.equal(sparteVon('NRG'), 'Gashandel');
  assert.equal(sparteVon('PFAND'), 'Gashandel');
  assert.equal(sparteVon('RZ'), 'Zeltverleih');
  assert.equal(sparteVon('RT'), 'Technik und Event');
  assert.equal(sparteVon('RM'), 'Maschinenbau');
  assert.equal(sparteVon('(ohne Nummer)'), '');
});

test('Listen: Stammartikel ohne Lexware, Lexware ohne Stamm, ohne Nummer, Typ je Einheit', () => {
  const lex = [
    art('RG-1', { unitName: 'Füllung' }), art('PFAND-2', { unitName: 'Stück' }), art('RZ-13003', { unitName: 'Stück', title: 'Bank normal' }),
    { id: 'x', title: 'Palette groß', type: 'PRODUCT', unitName: 'Stück' },
  ];
  const stamm = [
    { artikel_nr: '1', bezeichnung: 'Propan 11', typ: 'F', aktiv: 1, preis_netto_cent: 2926, verwendet: [] },
    { artikel_nr: '2', bezeichnung: 'Pfand 11', typ: 'P', aktiv: 1, preis_netto_cent: null, verwendet: ['Tourposition (3)', 'importierter Beleg (10)'] },
    { artikel_nr: '17801000', bezeichnung: 'Altlast', typ: 'S', aktiv: 0, preis_netto_cent: 100, verwendet: ['importierter Beleg (2)'] },
  ];
  const l = listen(lex, stamm);
  assert.deepEqual(l.stammOhneLexware, [{ artikel_nr: '17801000', bezeichnung: 'Altlast', typ: 'S', aktiv: 'nein', preisNetto: '1.00', verwendet: 'importierter Beleg (2)' }]);
  assert.deepEqual(l.lexwareOhneStamm.map((z) => [z.nummer, z.sparte, z.bezeichnung]), [['RZ-13003', 'Zeltverleih', 'Bank normal']]);
  assert.deepEqual(l.lexwareOhneNummer.map((z) => z.bezeichnung), ['Palette groß']);
  assert.deepEqual(l.typJeEinheit, { 'F | Füllung': 1, 'P | Stück': 1 });
  assert.deepEqual(l.pfand.map((z) => [z.nummer, z.einheit, z.stammTyp]), [['PFAND-2', 'Stück', 'P']]);
});

test('Listen: Pfand-Artikel ohne Stammartikel sind erkennbar', () => {
  const l = listen([art('PFAND-9', { unitName: 'Pfand' })], []);
  assert.equal(l.pfand[0].stammTyp, '(nicht im Stamm)');
  assert.equal(l.lexwareOhneStamm[0].nummer, 'PFAND-9');
});

test('CSV: Semikolon, Anführungszeichen bei Bedarf, BOM und Windows-Zeilenende', () => {
  const csv = alsCsv([{ a: 'x;y', b: 'sagt "hallo"', c: 5 }, { a: 'Zeile', b: null, c: '' }], ['a', 'b', 'c']);
  assert.equal(csv, '﻿a;b;c\r\n"x;y";"sagt ""hallo""";5\r\nZeile;;\r\n');
});
