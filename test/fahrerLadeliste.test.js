/** Ladeliste mit ADR-Punkten (#607), Zahlen wie im Mockup "Disposition". */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { rechneLadeliste, adrLuecken, adrAngaben } = require('../src/services/fahrerLadeliste');

const artikel = {
  T036: { artikel_nr: 'T036', bezeichnung: 'Acetylen 40 L', gasart: 'Acetylen', ggvs_faktor: 3, fuellmenge: 40, fuellmenge_einheit: 'l', pfand_artikel_nr: 'T036P' },
  T022: { artikel_nr: 'T022', bezeichnung: 'Sauerstoff 50 L', gasart: 'Sauerstoff', ggvs_faktor: 1, fuellmenge: 50, fuellmenge_einheit: 'l', pfand_artikel_nr: 'T022P' },
  7801100: { artikel_nr: '7801100', bezeichnung: 'Propan 11 kg', gasart: 'Propan', ggvs_faktor: 3, fuellmenge: 11, fuellmenge_einheit: 'kg', pfand_artikel_nr: '7801200' },
  7801300: { artikel_nr: '7801300', bezeichnung: 'Propan 33 kg', gasart: 'Propan', ggvs_faktor: 3, fuellmenge: 33, fuellmenge_einheit: 'kg', pfand_artikel_nr: '7801301' },
  T036P: { artikel_nr: 'T036P', bezeichnung: 'Pfand Acetylen' }, T022P: { artikel_nr: 'T022P', bezeichnung: 'Pfand Sauerstoff' },
  7801200: { artikel_nr: '7801200', bezeichnung: 'Pfand Propan 11 kg' }, 7801301: { artikel_nr: '7801301', bezeichnung: 'Pfand Propan 33 kg' },
};
const pos = (artikelNr, soll) => ({ artikelNr, soll });
// Tour aus dem Mockup: 2 Acetylen + 2 Sauerstoff, 8 Propan 11 kg, 4 Propan 33 kg, 1 Sauerstoff
const tour = [
  { id: 1, kundeName: 'Schlosserei Huber', positionen: [pos('T036', 2), pos('T022', 2)] },
  { id: 2, kundeName: 'Kfz-Technik Maier', positionen: [pos('7801100', 8)] },
  { id: 3, kundeName: 'Getränke Schmid', positionen: [pos('7801300', 4)] },
  { id: 4, kundeName: 'Hotel Inntal', positionen: [pos('T022', 1)] },
];

test('Mockup: 1050 von 1000 Punkten, Zeilen nach Punkten sortiert', () => {
  const l = rechneLadeliste(tour, artikel);
  assert.equal(l.punkte, 1050);
  assert.equal(l.ueber, true);
  assert.deepEqual(l.zeilen.map((z) => [z.artikelNr, z.flaschen, z.menge, z.punkte]), [
    ['7801300', 4, 132, 396], ['7801100', 8, 88, 264], ['T036', 2, 80, 240], ['T022', 3, 150, 150],
  ]);
  assert.equal(l.flaschenGesamt, 17);
});

test('Welcher Stopp die Grenze reißt und was ohne einen Stopp übrig bleibt', () => {
  const l = rechneLadeliste(tour, artikel);
  assert.deepEqual(l.stopps.map((s) => s.kumuliert), [340, 604, 1000, 1050]);
  assert.equal(l.reisstBei.nr, 4);
  const ohne1 = l.ohneStopp.find((s) => s.nr === 1);
  assert.equal(ohne1.punkte, 710);
  assert.equal(ohne1.reicht, true);
  assert.equal(l.ohneStopp.find((s) => s.nr === 4).punkte, 1000);
});

test('genau 1000 Punkte ist noch erlaubt, ohne Hinweise', () => {
  const l = rechneLadeliste(tour.slice(0, 3), artikel);
  assert.equal(l.punkte, 1000);
  assert.equal(l.ueber, false);
  assert.equal(l.reisstBei, null);
  assert.deepEqual(l.ohneStopp, []);
});

test('erwartetes Leergut: 17 Flaschen aus dem Pfandbezug, Kaufflaschen kommen nicht zurück', () => {
  const l = rechneLadeliste(tour, artikel);
  assert.equal(l.leergutGesamt, 17);
  assert.deepEqual(l.leergut.map((x) => [x.artikelNr, x.anzahl]), [['7801200', 8], ['7801301', 4], ['T022P', 3], ['T036P', 2]]);
  const kauf = rechneLadeliste([{ id: 1, positionen: [pos('K', 5)] }], { K: { artikel_nr: 'K', ggvs_faktor: 1, fuellmenge: 10, pfand_artikel_nr: 'P', kaufflasche_artikel_nr: 'X' } });
  assert.equal(kauf.leergutGesamt, 0);
});

test('Artikel ohne ADR-Angaben oder nicht im Stamm: 0 Punkte, als unvollständig gemeldet', () => {
  const l = rechneLadeliste([{ id: 1, positionen: [pos('T039', 2), pos('T022', 1), pos('9999999', 1)] }], { ...artikel, T039: { artikel_nr: 'T039', bezeichnung: 'Neu' } });
  assert.equal(l.punkte, 50);
  assert.deepEqual(l.unvollstaendig, ['9999999', 'T039']);
  assert.equal(l.zeilen.find((z) => z.artikelNr === 'T039').vollstaendig, false);
});

test('Angaben: Faktor kommt aus ggvs_faktor oder der Kategorie, Menge muss > 0 sein', () => {
  assert.equal(adrAngaben({ befoerderungskategorie: 2, fuellmenge: 11 }).faktor, 3);
  assert.equal(adrAngaben({ ggvs_faktor: 50, fuellmenge: '2.5', fuellmenge_einheit: 'l' }).menge, 2.5);
  assert.equal(adrAngaben({ ggvs_faktor: 3, fuellmenge: 0 }), null);
  assert.equal(adrAngaben({ ggvs_faktor: 3 }), null);
  assert.equal(adrAngaben(undefined), null);
  assert.deepEqual(adrLuecken(['T039', 'T022', 'T022', 'X'], { ...artikel, T039: {} }), ['T039', 'X']);
});

test('leere Tour', () => {
  const l = rechneLadeliste([], artikel);
  assert.deepEqual([l.punkte, l.ueber, l.zeilen.length, l.leergutGesamt], [0, false, 0, 0]);
});

test('Leergut (#614): bestellte Menge statt 1:1, reine Leergut-Position zählt mit, ohne Punkte', () => {
  const l = rechneLadeliste([
    { id: 1, kundeName: 'A', positionen: [{ artikelNr: '7801100', soll: 2, leergut: 1 }] },
    { id: 2, kundeName: 'B', positionen: [{ artikelNr: '7801300', soll: 0, leergut: 3 }] },
    { id: 3, kundeName: 'C', positionen: [{ artikelNr: '7801100', soll: 1, leergut: null }] },
  ], artikel);
  assert.deepEqual(l.leergut.map((x) => [x.artikelNr, x.anzahl]), [['7801200', 2], ['7801301', 3]]);
  assert.equal(l.leergutGesamt, 5);
  assert.equal(l.flaschenGesamt, 3);
  assert.equal(l.stopps[1].punkte, 0);
  assert.deepEqual(l.zeilen.map((z) => z.artikelNr), ['7801100']);
});
