const { test } = require('node:test');
const assert = require('node:assert/strict');
const { naechsteUebertragung, istAutoPushKandidat } = require('../src/utils/serAutoPush');

test('naechsteUebertragung: naechster Termin in Berliner Zeit', () => {
  // Winterzeit (UTC+1)
  assert.deepEqual(naechsteUebertragung(new Date('2026-01-15T06:30:00Z')), { stunde: 9,  morgen: false }); // 07:30
  assert.deepEqual(naechsteUebertragung(new Date('2026-01-15T08:59:00Z')), { stunde: 12, morgen: false }); // 09:59
  assert.deepEqual(naechsteUebertragung(new Date('2026-01-15T14:00:10Z')), { stunde: 18, morgen: false }); // 15:00:10
  assert.deepEqual(naechsteUebertragung(new Date('2026-01-15T17:00:00Z')), { stunde: 9,  morgen: true  }); // 18:00
  assert.deepEqual(naechsteUebertragung(new Date('2026-01-15T22:30:00Z')), { stunde: 9,  morgen: true  }); // 23:30
  assert.deepEqual(naechsteUebertragung(new Date('2026-01-15T23:30:00Z')), { stunde: 9,  morgen: false }); // 00:30 Folgetag
  // Sommerzeit (UTC+2)
  assert.deepEqual(naechsteUebertragung(new Date('2026-07-15T10:30:00Z')), { stunde: 15, morgen: false }); // 12:30
});

test('istAutoPushKandidat: nur SER-Kunden mit Nummer, nicht erledigt', () => {
  assert.equal(istAutoPushKandidat({ done: false, in_ser_fvk: true, customer_number: '10001' }), true);
  assert.equal(istAutoPushKandidat({ done: null,  in_ser_fvk: true, customer_number: '10001' }), true);
  assert.equal(istAutoPushKandidat({ done: true,  in_ser_fvk: true, customer_number: '10001' }), false);
  assert.equal(istAutoPushKandidat({ done: false, in_ser_fvk: false, customer_number: '10001' }), false);
  assert.equal(istAutoPushKandidat({ done: false, in_ser_fvk: true, customer_number: null }), false);
});
