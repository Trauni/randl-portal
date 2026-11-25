/** Zuladungen fürs Büro (#639): Aufbereitung der Ereignisse tour.zugeladen. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { zuladungenAnsicht } = require('../src/services/fahrerZuladungen');

const zeile = (uuid, nutzdaten, rest = {}) => ({ uuid, geraet_zeit: new Date('2026-11-25T08:00:00Z'), geraet_kennung: 'T1', markierung: null, payload: JSON.stringify(nutzdaten), ...rest });

test('ohne Ereignisse: leere Ansicht', () => {
  assert.deepEqual(zuladungenAnsicht([]), { zuladungen: [], summe: [], zugeladenGesamt: 0, leergutAbGesamt: 0 });
});

test('mehrere Zuladungen: je Ereignis die Positionen, Summe je Artikel', () => {
  const a = zuladungenAnsicht([
    zeile('u1', { zugeladen_am: '2026-11-25T09:15:00.000Z', adr_punkte: 198, positionen: [
      { artikelId: '7801200', bezeichnung: 'Propan 11 kg', zugeladen: 6, leergutAb: 4 },
      { artikelId: 'T022', bezeichnung: 'Sauerstoff 50 L', zugeladen: 0, leergutAb: 2 },
    ] }),
    zeile('u2', { zugeladen_am: '2026-11-25T13:00:00.000Z', adr_punkte: null, positionen: [{ artikelId: 7801200, bezeichnung: 'Propan 11 kg', zugeladen: 2, leergutAb: 0 }] }, { markierung: 'nach_buero_ende' }),
  ]);
  assert.equal(a.zuladungen.length, 2);
  assert.equal(a.zuladungen[0].zeit, '2026-11-25T09:15:00.000Z');
  assert.equal(a.zuladungen[0].adrPunkte, 198);
  assert.equal(a.zuladungen[1].adrPunkte, null);
  assert.equal(a.zuladungen[1].markierung, 'nach_buero_ende');
  assert.deepEqual(a.summe, [
    { artikelNr: '7801200', bezeichnung: 'Propan 11 kg', zugeladen: 8, leergutAb: 4 },
    { artikelNr: 'T022', bezeichnung: 'Sauerstoff 50 L', zugeladen: 0, leergutAb: 2 },
  ]);
  assert.equal(a.zugeladenGesamt, 8);
  assert.equal(a.leergutAbGesamt, 6);
});

test('lückenhafte Nutzdaten: Gerätezeit als Ersatz, fehlende Mengen sind 0, kaputtes JSON bricht nichts', () => {
  const a = zuladungenAnsicht([
    zeile('u1', { positionen: [{ artikelId: 'T001', bezeichnung: ' Argon 20 L ', zugeladen: 3 }, { bezeichnung: 'Sonstiges', zugeladen: '5', leergutAb: -1 }] }),
    { uuid: 'u2', geraet_zeit: null, payload: '{kaputt' },
    { uuid: 'u3', geraet_zeit: null, payload: { zugeladen_am: 'gestern', positionen: 'nix' } },
  ]);
  assert.equal(a.zuladungen[0].zeit, '2026-11-25T08:00:00.000Z');
  assert.deepEqual(a.zuladungen[0].positionen, [
    { artikelNr: 'T001', bezeichnung: 'Argon 20 L', zugeladen: 3, leergutAb: 0 },
    { artikelNr: null, bezeichnung: 'Sonstiges', zugeladen: 0, leergutAb: 0 },
  ]);
  assert.deepEqual(a.zuladungen[1], { id: 'u2', zeit: null, geraet: null, markierung: null, adrPunkte: null, positionen: [] });
  assert.deepEqual(a.zuladungen[2].positionen, []);
  assert.equal(a.zugeladenGesamt, 3);
});
