const { test } = require('node:test');
const assert = require('node:assert/strict');
const { planeTage } = require('../src/utils/pauschalZeit');

test('planeTage: eine Woche Mo–Fr, 8 h netto + 30 min Pause', () => {
  const { geplant, uebersprungen } = planeTage({ von: '2026-11-09', bis: '2026-11-15', start: '08:00', nettoMinuten: 480, pauseMinuten: 30 });
  assert.equal(geplant.length, 5);
  assert.deepEqual(geplant[0], { tag: '2026-11-09', start: '2026-11-09 08:00:00', ende: '2026-11-09 16:30:00', pauseSekunden: 1800 });
  assert.equal(uebersprungen.length, 0);
});

test('planeTage: Feiertag, vorhandene Einträge und Urlaub werden übersprungen', () => {
  const r = planeTage({
    von: '2026-12-21', bis: '2026-12-28', start: '08:00', nettoMinuten: 480, pauseMinuten: 30,
    belegt: new Set(['2026-12-22']), abwesend: new Set(['2026-12-23']),
  });
  // 25.12. ist Feiertag, 26./27.12. Wochenende
  assert.deepEqual(r.geplant.map((g) => g.tag), ['2026-12-21', '2026-12-24', '2026-12-28']);
  assert.deepEqual(r.uebersprungen.map((u) => u.tag), ['2026-12-22', '2026-12-23']);
});

test('planeTage: ungültiger Tag wird abgelehnt', () => {
  assert.throws(() => planeTage({ von: '2026-11-09', bis: '2026-11-09', start: '23:00', nettoMinuten: 480, pauseMinuten: 30 }));
});
