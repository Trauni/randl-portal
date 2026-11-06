const { test } = require('node:test');
const assert = require('node:assert/strict');
const { ostersonntag, feiertageBayern, feiertag, arbeitstage } = require('../src/utils/feiertage');

test('ostersonntag: bekannte Jahre', () => {
  assert.equal(ostersonntag(2024), '2024-03-31');
  assert.equal(ostersonntag(2025), '2025-04-20');
  assert.equal(ostersonntag(2026), '2026-04-05');
  assert.equal(ostersonntag(2027), '2027-03-28');
  assert.equal(ostersonntag(2038), '2038-04-25'); // spätestmöglicher Termin
});

test('feiertageBayern 2026: 13 Feiertage, bewegliche korrekt', () => {
  const f = feiertageBayern(2026);
  assert.equal(f.size, 13);
  assert.equal(f.get('2026-04-03'), 'Karfreitag');
  assert.equal(f.get('2026-04-06'), 'Ostermontag');
  assert.equal(f.get('2026-05-14'), 'Christi Himmelfahrt');
  assert.equal(f.get('2026-05-25'), 'Pfingstmontag');
  assert.equal(f.get('2026-06-04'), 'Fronleichnam');
  assert.equal(f.get('2026-08-15'), 'Mariä Himmelfahrt');
});

test('feiertag: kein Buß- und Bettag, kein Friedensfest', () => {
  assert.equal(feiertag('2026-11-18'), null); // Buß- und Bettag 2026
  assert.equal(feiertag('2026-08-08'), null);
  assert.equal(feiertag('2026-11-01'), 'Allerheiligen');
});

test('arbeitstage: Feiertage und Wochenende fallen raus', () => {
  // Karwoche 2026: Mo 30.03. – Mo 06.04. → Mo–Do = 4 Tage (Karfreitag, Ostermontag frei)
  assert.deepEqual(arbeitstage('2026-03-30', '2026-04-06'),
    ['2026-03-30', '2026-03-31', '2026-04-01', '2026-04-02']);
  // Weihnachten bis Neujahr 2026/27
  assert.deepEqual(arbeitstage('2026-12-24', '2027-01-01'),
    ['2026-12-24', '2026-12-28', '2026-12-29', '2026-12-30', '2026-12-31']);
});

test('arbeitstage: Teilzeit Mo–Do', () => {
  // KW 46/2026: Mo 09.11. – So 15.11.
  assert.deepEqual(arbeitstage('2026-11-09', '2026-11-15', [1, 2, 3, 4]),
    ['2026-11-09', '2026-11-10', '2026-11-11', '2026-11-12']);
});

test('arbeitstage: leerer und eintägiger Zeitraum', () => {
  assert.deepEqual(arbeitstage('2026-11-10', '2026-11-09'), []);
  assert.deepEqual(arbeitstage('2026-11-10', '2026-11-10'), ['2026-11-10']);
  assert.deepEqual(arbeitstage('2026-11-14', '2026-11-14'), []); // Samstag
});
