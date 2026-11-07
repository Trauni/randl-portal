const { test } = require('node:test');
const assert = require('node:assert/strict');
const g = require('../src/utils/gleitzeit');

const VOLLZEIT = [{ gueltig_ab: '2026-01-01', wochenstunden: '40.00', arbeitstage: '1,2,3,4,5' }];

test('parseArbeitstage: sortiert, ohne Duplikate und Müll', () => {
  assert.deepEqual(g.parseArbeitstage('5,1,3,3,x,9'), [1, 3, 5]);
  assert.deepEqual(g.parseArbeitstage(''), []);
});

test('arbeitszeitAm: jüngster Eintrag mit gueltig_ab <= Tag', () => {
  const h = [
    { gueltig_ab: '2026-01-01', wochenstunden: '40', arbeitstage: '1,2,3,4,5' },
    { gueltig_ab: '2026-07-01', wochenstunden: '32', arbeitstage: '1,2,3,4' },
  ];
  assert.equal(g.arbeitszeitAm(h, '2025-12-31'), null);
  assert.deepEqual(g.arbeitszeitAm(h, '2026-06-30'), { wochenstunden: 40, arbeitstage: [1, 2, 3, 4, 5] });
  assert.deepEqual(g.arbeitszeitAm(h, '2026-07-01'), { wochenstunden: 32, arbeitstage: [1, 2, 3, 4] });
});

test('regelSoll: Vollzeit, Teilzeit, Wochenende, Feiertag', () => {
  const voll = { wochenstunden: 40, arbeitstage: [1, 2, 3, 4, 5] };
  const teil = { wochenstunden: 32.5, arbeitstage: [1, 2, 3, 4] };
  assert.equal(g.regelSoll(voll, '2026-11-10'), 480);  // Di
  assert.equal(g.regelSoll(voll, '2026-11-14'), 0);    // Sa
  assert.equal(g.regelSoll(voll, '2026-11-01'), 0);    // Allerheiligen (So)
  assert.equal(g.regelSoll(voll, '2026-04-03'), 0);    // Karfreitag
  assert.equal(g.regelSoll(teil, '2026-11-12'), 488);  // Do: 1950 / 4 = 487,5 -> 488
  assert.equal(g.regelSoll(teil, '2026-11-13'), 0);    // Fr frei
  assert.equal(g.regelSoll(null, '2026-11-10'), 0);
});

test('eintragMinuten: netto, auf 5 Minuten gerundet', () => {
  assert.equal(g.eintragMinuten(8 * 3600 + 2 * 60, 30 * 60), 450);   // 8:02 - 0:30 = 7:32 -> 7:30
  assert.equal(g.eintragMinuten(8 * 3600 + 3 * 60, 30 * 60), 455);   // 7:33 -> 7:35
  assert.equal(g.eintragMinuten(600, 1200), 0);                       // Pause > Spanne
});

test('tagesbuchungen: normaler Arbeitstag mit Mehr- und Minderstunden', () => {
  const az = { wochenstunden: 40, arbeitstage: [1, 2, 3, 4, 5] };
  assert.deepEqual(g.tagesbuchungen({ tag: '2026-11-10', arbeitszeit: az, istMinuten: 540 }),
    [{ art: 'tagessaldo', minuten: 60, soll_minuten: 480, ist_minuten: 540 }]);
  assert.deepEqual(g.tagesbuchungen({ tag: '2026-11-10', arbeitszeit: az, istMinuten: 0 }),
    [{ art: 'tagessaldo', minuten: -480, soll_minuten: 480, ist_minuten: 0 }]);
});

test('tagesbuchungen: Wochenendarbeit ist Plus, freies Wochenende bucht nichts', () => {
  const az = { wochenstunden: 40, arbeitstage: [1, 2, 3, 4, 5] };
  assert.deepEqual(g.tagesbuchungen({ tag: '2026-11-14', arbeitszeit: az, istMinuten: 120 }),
    [{ art: 'tagessaldo', minuten: 120, soll_minuten: 0, ist_minuten: 120 }]);
  assert.deepEqual(g.tagesbuchungen({ tag: '2026-11-14', arbeitszeit: az, istMinuten: 0 }), []);
});

test('tagesbuchungen: Urlaub und Krankheit ohne Soll', () => {
  const az = { wochenstunden: 40, arbeitstage: [1, 2, 3, 4, 5] };
  assert.deepEqual(g.tagesbuchungen({ tag: '2026-11-10', arbeitszeit: az, abwesenheit: 'urlaub' }), []);
  assert.deepEqual(g.tagesbuchungen({ tag: '2026-11-10', arbeitszeit: az, abwesenheit: 'krankheit' }), []);
});

test('tagesbuchungen: Gleitzeitabbau bucht das Regel-Soll ab', () => {
  const az = { wochenstunden: 40, arbeitstage: [1, 2, 3, 4, 5] };
  assert.deepEqual(
    g.tagesbuchungen({ tag: '2026-11-10', arbeitszeit: az, abwesenheit: 'gleitzeitabbau', referenzId: 7 }),
    [{ art: 'abbau', minuten: -480, referenz_id: 7 }]);
  // Abbau über ein Wochenende/Feiertag bucht dort nichts ab
  assert.deepEqual(
    g.tagesbuchungen({ tag: '2026-11-14', arbeitszeit: az, abwesenheit: 'gleitzeitabbau', referenzId: 7 }), []);
  assert.throws(() => g.tagesbuchungen({ tag: '2026-11-10', arbeitszeit: az, abwesenheit: 'kur' }));
});

test('zeitraumBuchungen: eine Woche mit Feiertag, Abbau und Krankheit', () => {
  // KW 44/2026: Mo 26.10. – So 01.11. (So = Allerheiligen, ohnehin frei)
  const ist = new Map([['2026-10-26', 540], ['2026-10-27', 480], ['2026-10-31', 60]]);
  const abw = new Map([
    ['2026-10-28', { art: 'gleitzeitabbau', referenzId: 3 }],
    ['2026-10-29', { art: 'krankheit' }],
  ]);
  const b = g.zeitraumBuchungen({ von: '2026-10-26', bis: '2026-11-01', historie: VOLLZEIT, istProTag: ist, abwesenheiten: abw });
  assert.deepEqual(b.map((x) => [x.datum, x.art, x.minuten]), [
    ['2026-10-26', 'tagessaldo', 60],
    ['2026-10-27', 'tagessaldo', 0],
    ['2026-10-28', 'abbau', -480],
    ['2026-10-30', 'tagessaldo', -480],
    ['2026-10-31', 'tagessaldo', 60],
  ]);
  assert.equal(b.reduce((s, x) => s + x.minuten, 0), -840);
});

test('zeitraumBuchungen: vor der ersten Arbeitszeit kein Soll', () => {
  const b = g.zeitraumBuchungen({
    von: '2025-12-30', bis: '2026-01-02', historie: VOLLZEIT, istProTag: new Map(), abwesenheiten: new Map(),
  });
  // 30./31.12.2025 ohne Arbeitszeit, 01.01. Neujahr, 02.01. Fr = -8h
  assert.deepEqual(b.map((x) => [x.datum, x.minuten]), [['2026-01-02', -480]]);
});

test('formatMinuten', () => {
  assert.equal(g.formatMinuten(750), '+12:30');
  assert.equal(g.formatMinuten(-185), '-3:05');
  assert.equal(g.formatMinuten(0), '0:00');
});

test('abbauDauer: Uhrzeiten von–bis in Minuten', () => {
  assert.equal(g.abbauDauer('12:00', '16:00'), 240);
  assert.equal(g.abbauDauer('07:30:00', '11:45:00'), 255);
  assert.equal(g.abbauDauer('12:00', '12:00'), null);
  assert.equal(g.abbauDauer('16:00', '12:00'), null);
  assert.equal(g.abbauDauer('25:00', '26:00'), null);
  assert.equal(g.abbauDauer(null, '12:00'), null);
});

test('tagesbuchungen: stundenweiser Abbau senkt das Soll um die Dauer', () => {
  const az = { wochenstunden: 40, arbeitstage: [1, 2, 3, 4, 5] }; // 8:00 pro Tag
  // Vormittag gearbeitet (4:00), Nachmittag 4:00 Abbau -> Tag ausgeglichen
  assert.deepEqual(
    g.tagesbuchungen({ tag: '2026-11-10', arbeitszeit: az, istMinuten: 240, abwesenheit: 'gleitzeitabbau', referenzId: 9, abbauMinuten: 240 }),
    [
      { art: 'tagessaldo', minuten: 0, soll_minuten: 240, ist_minuten: 240 },
      { art: 'abbau', minuten: -240, referenz_id: 9 },
    ]);
  // Mehr als das Tages-Soll beantragt -> höchstens das Soll, kein Rest-Soll
  assert.deepEqual(
    g.tagesbuchungen({ tag: '2026-11-10', arbeitszeit: az, abwesenheit: 'gleitzeitabbau', referenzId: 9, abbauMinuten: 600 }),
    [{ art: 'abbau', minuten: -480, referenz_id: 9 }]);
  // Nicht gearbeitet trotz Rest-Soll -> Minus
  assert.deepEqual(
    g.tagesbuchungen({ tag: '2026-11-10', arbeitszeit: az, abwesenheit: 'gleitzeitabbau', referenzId: 9, abbauMinuten: 120 }),
    [
      { art: 'tagessaldo', minuten: -360, soll_minuten: 360, ist_minuten: 0 },
      { art: 'abbau', minuten: -120, referenz_id: 9 },
    ]);
  // Feiertag: nichts abzubauen
  assert.deepEqual(
    g.tagesbuchungen({ tag: '2026-12-25', arbeitszeit: az, abwesenheit: 'gleitzeitabbau', referenzId: 9, abbauMinuten: 240 }), []);
});

test('zeitraumBuchungen: stundenweiser Abbau aus der Abwesenheitsliste', () => {
  const b = g.zeitraumBuchungen({
    von: '2026-11-10', bis: '2026-11-10', historie: VOLLZEIT,
    istProTag: new Map([['2026-11-10', 300]]),
    abwesenheiten: new Map([['2026-11-10', { art: 'gleitzeitabbau', referenzId: 4, abbauMinuten: 180 }]]),
  });
  assert.deepEqual(b, [
    { datum: '2026-11-10', art: 'tagessaldo', minuten: 0, soll_minuten: 300, ist_minuten: 300 },
    { datum: '2026-11-10', art: 'abbau', minuten: -180, referenz_id: 4 },
  ]);
});
