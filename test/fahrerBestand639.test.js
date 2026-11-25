/** Fahrzeugbestand fürs Büro (#639): gerechnet wie bestand() der Fahrer-App. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { rechneBestand } = require('../src/services/fahrerBestand');

const artikel = {
  7801200: { artikel_nr: '7801200', bezeichnung: 'Propan 11 kg', typ: 'F', gasart: 'Propan', ggvs_faktor: 3, fuellmenge: 11, fuellmenge_einheit: 'kg' },
  7801300: { artikel_nr: '7801300', bezeichnung: 'Propan 33 kg', typ: 'F', gasart: 'Propan', ggvs_faktor: 3, fuellmenge: 33, fuellmenge_einheit: 'kg' },
  T022: { artikel_nr: 'T022', bezeichnung: 'Sauerstoff 50 L', typ: 'F', gasart: 'Sauerstoff', ggvs_faktor: 1, fuellmenge: 50, fuellmenge_einheit: 'l' },
  X1: { artikel_nr: 'X1', bezeichnung: 'ohne ADR', typ: 'F' },
  GZ1: { artikel_nr: 'GZ1', bezeichnung: 'Schlauch', typ: 'Z' },
};
const stopp = (positionen, status = 'offen') => ({ status, positionen });
const z = (b, nr) => b.zeilen.find((x) => x.artikelNr === nr);

test('vor dem Start: Bestand gleicht der Ladeliste, stornierte Stopps und Soll 0 laden nichts', () => {
  const b = rechneBestand({ artikel, stopps: [
    stopp([{ artikelNr: '7801200', soll: 4 }, { artikelNr: 'T022', soll: 0 }]),
    stopp([{ artikelNr: '7801200', soll: 2 }]),
    stopp([{ artikelNr: '7801300', soll: 5 }], 'storniert'),
  ] });
  assert.deepEqual(b.zeilen.map((x) => [x.artikelNr, x.geladen, x.voll]), [['7801200', 6, 6]]);
  assert.equal(b.punkte, 198);
  assert.equal(b.vollGesamt, 6);
  assert.equal(b.leergutGesamt, 0);
  assert.deepEqual(b.mehrGeliefert, []);
});

test('unterwegs: Zuladung kommt dazu, Belege gehen ab, abgeladenes Leergut auch', () => {
  const b = rechneBestand({ artikel,
    stopps: [stopp([{ artikelNr: '7801200', soll: 6 }, { artikelNr: 'T022', soll: 2 }], 'beliefert')],
    zugeladen: [{ artikelNr: '7801200', bezeichnung: 'Propan 11 kg', zugeladen: 4, leergutAb: 3 }, { artikelNr: '7801300', bezeichnung: 'Propan 33 kg', zugeladen: 2, leergutAb: 0 }],
    geliefert: [{ artikelNr: '7801200', bezeichnung: 'Propan 11 kg', geliefert: 5, leergut: 5 }, { artikelNr: 'T022', bezeichnung: 'Sauerstoff 50 L', geliefert: 2, leergut: 1 }],
  });
  assert.deepEqual({ ...z(b, '7801200'), bezeichnung: undefined, gasart: undefined },
    { artikelNr: '7801200', bezeichnung: undefined, gasart: undefined, soll: 6, zugeladen: 4, geladen: 10, geliefert: 5, voll: 5, leergutAuf: 5, abgeladen: 3, leergut: 2, punkte: 165 });
  assert.equal(z(b, '7801300').voll, 2);
  assert.equal(z(b, 'T022').voll, 0);
  assert.equal(z(b, 'T022').leergut, 1);
  assert.equal(b.punkte, 165 + 198);
  assert.equal(b.geladenGesamt, 14);
  assert.equal(b.zugeladenGesamt, 6);
  assert.equal(b.geliefertGesamt, 7);
  assert.equal(b.vollGesamt, 7);
  assert.equal(b.leergutGesamt, 3);
  assert.equal(b.abgeladenGesamt, 3);
});

test('Grenze: über 1000 Punkte an Bord', () => {
  const b = rechneBestand({ artikel, stopps: [stopp([{ artikelNr: '7801300', soll: 11 }])] });
  assert.equal(b.punkte, 1089);
  assert.equal(b.ueber, true);
});

test('Sonderfälle: mehr geliefert als geladen, Artikel ohne ADR-Angaben, Zubehör zählt nicht, Zeile ohne Artikelnummer', () => {
  const b = rechneBestand({ artikel,
    stopps: [stopp([{ artikelNr: '7801200', soll: 1 }, { artikelNr: 'X1', soll: 2 }, { artikelNr: 'GZ1', soll: 3 }])],
    geliefert: [{ artikelNr: '7801200', bezeichnung: 'Propan 11 kg', geliefert: 3, leergut: 0 }, { artikelNr: null, bezeichnung: 'Sonstiges', geliefert: 1, leergut: 0 }],
    zugeladen: [{ artikelNr: '7801200', bezeichnung: 'Propan 11 kg', zugeladen: 0, leergutAb: 2 }],
  });
  assert.equal(z(b, '7801200').voll, 0);
  assert.equal(z(b, '7801200').leergut, 0, 'mehr abgeladen als eingesammelt wird nicht negativ');
  assert.deepEqual(b.mehrGeliefert, [{ artikelNr: '7801200', bezeichnung: 'Propan 11 kg', anzahl: 2 }, { artikelNr: null, bezeichnung: 'Sonstiges', anzahl: 1 }]);
  assert.deepEqual(b.unvollstaendig, ['X1']);
  assert.equal(z(b, 'X1').punkte, null);
  assert.equal(z(b, 'GZ1'), undefined);
  assert.equal(b.punkte, 0);
});
