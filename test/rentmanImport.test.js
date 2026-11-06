const { test } = require('node:test');
const assert = require('node:assert/strict');
const { mapRentmanEintrag, berlinLokal } = require('../src/utils/rentmanImport');

test('berlinLokal: Sommer- und Winterzeit, UTC-Eingabe', () => {
  assert.equal(berlinLokal('2026-10-01T07:45:00+02:00'), '2026-10-01T07:45:00');
  assert.equal(berlinLokal('2026-11-02T08:00:00+01:00'), '2026-11-02T08:00:00');
  assert.equal(berlinLokal('2026-10-01T05:45:00Z'), '2026-10-01T07:45:00');
  assert.throws(() => berlinLokal('kaputt'));
});

test('Gearbeitet: Pause aus duration abgeleitet', () => {
  // 07:30–16:15 = 8:45 Spanne, 8:15 netto -> 30 min Pause
  const r = mapRentmanEintrag({
    id: 900, leavetype: '/leavetypes/1', status: 'approved',
    start: '2026-10-07T07:30:00+02:00', end: '2026-10-07T16:15:00+02:00',
    duration: 8 * 3600 + 15 * 60, break_duration: 1800,
  });
  assert.equal(r.uebernehmen, true);
  assert.deepEqual(r.zeile, {
    tag: '2026-10-07', start: '2026-10-07T07:30:00', ende: '2026-10-07T16:15:00',
    pauseSekunden: 1800, eintragTyp: 'arbeitszeit', rentmanTimeregistrationId: 900,
    rentmanLeaverequestId: null, nettoSekunden: 8 * 3600 + 15 * 60,
  });
});

test('Gearbeitet: von Hand geänderte duration hat Vorrang vor break_duration', () => {
  // 07:45–17:30 = 9:45, Rentman sagt netto 8:45, break_duration 0 -> Pause 1:00
  const r = mapRentmanEintrag({
    id: 901, leavetype: '/leavetypes/1', start: '2026-10-01T07:45:00+02:00',
    end: '2026-10-01T17:30:00+02:00', duration: 8 * 3600 + 45 * 60, break_duration: 0,
  });
  assert.equal(r.zeile.pauseSekunden, 3600);
  assert.equal(r.zeile.nettoSekunden, 8 * 3600 + 45 * 60);
});

test('Krankheit: mit Abwesenheitsantrag', () => {
  const r = mapRentmanEintrag({
    id: 902, leavetype: '/leavetypes/4', leaverequest: '/leaverequest/77', status: 'approved',
    start: '2026-10-20T00:00:00+02:00', end: '2026-10-20T08:00:00+02:00', duration: 28800,
  });
  assert.equal(r.zeile.eintragTyp, 'krankheit');
  assert.equal(r.zeile.rentmanLeaverequestId, 77);
});

test('nicht übernommen: Urlaub, Korrektur, abgelehnt, kaputt', () => {
  const basis = { id: 1, start: '2026-10-12T08:00:00+02:00', end: '2026-10-12T16:00:00+02:00', duration: 25080 };
  assert.match(mapRentmanEintrag({ ...basis, leavetype: '/leavetypes/2' }).grund, /Urlaub/);
  assert.match(mapRentmanEintrag({ ...basis, leavetype: '/leavetypes/3' }).grund, /Korrektur/);
  assert.match(mapRentmanEintrag({ ...basis, leavetype: '/leavetypes/1', status: 'rejected' }).grund, /abgelehnt/);
  assert.match(mapRentmanEintrag({ ...basis, leavetype: '/leavetypes/1', end: basis.start }).grund, /Ende/);
  assert.match(mapRentmanEintrag({ ...basis, leavetype: '/leavetypes/1', end: null }).grund, /fehlt/);
});
