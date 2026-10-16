const { test } = require('node:test');
const assert = require('node:assert/strict');
const a = require('../src/services/metallAnlegen');

const JETZT = new Date(2026, 9, 16, 12, 0);
const V = { id: 5, vorgangsnummer: 'V-26-0012', kunden_bestellnr: '4711', bezeichnung: 'Geländer Terrasse' };

// Gelesenes Angebot wie AG0083 (Test 16.10.2026), Demodaten
const ANGEBOT = {
  introduction: 'Ihre Bestellnr. 4711 · Vorgang V-26-0003\nVielen Dank für Ihre Anfrage.',
  taxConditions: { taxType: 'net' },
  totalPrice: { currency: 'EUR', totalNetAmount: 1200, totalGrossAmount: 1428, totalTaxAmount: 228 },
  paymentConditions: { paymentTermLabel: '14 Tage netto', paymentTermLabelTemplate: '14 Tage netto', paymentTermDuration: 14 },
  lineItems: [
    { type: 'custom', name: 'Geländer', quantity: 2, unitName: 'Stück',
      unitPrice: { currency: 'EUR', netAmount: 600, grossAmount: 714, taxRatePercentage: 19 },
      discountPercentage: 0, lineItemAmount: 1200, optional: false, alternative: false },
    { type: 'text', name: 'Hinweis', description: 'Montage nach Absprache', optional: false, alternative: false },
  ],
};

// Erwartung mit der Zeitzone der Testumgebung rechnen (Server: Europe/Berlin)
function erwartet(jahr, monat, tag) {
  const d = new Date(jahr, monat - 1, tag);
  const v = -d.getTimezoneOffset();
  const z = n => String(n).padStart(2, '0');
  return `${jahr}-${z(monat)}-${z(tag)}T00:00:00.000${v >= 0 ? '+' : '-'}${z(Math.floor(Math.abs(v) / 60))}:${z(Math.abs(v) % 60)}`;
}

test('belegDatum: Tagesbeginn mit Zeitzone, nie nur YYYY-MM-DD', () => {
  assert.equal(a.belegDatum(JETZT), erwartet(2026, 10, 16));
  assert.match(a.belegDatum(JETZT), /^\d{4}-\d{2}-\d{2}T00:00:00\.000[+-]\d{2}:\d{2}$/);
});

test('betreff: Belegart · Vorgangsnummer, höchstens 25 Zeichen', () => {
  assert.equal(a.betreff('quotation', V), 'Angebot · V-26-0012');
  assert.equal(a.betreff('orderconfirmation', V), 'Auftrag · V-26-0012');
  const lang = { vorgangsnummer: 'V-26-123456789012345' };
  assert.equal(a.betreff('orderconfirmation', lang), 'V-26-123456789012345');
  assert.ok(a.betreff('quotation', { vorgangsnummer: 'V-26-' + '9'.repeat(30) }).length <= 25);
});

test('angebotEntwurf: Platzhalter-Position, Ablauf in 30 Tagen, Vorgangszeile', () => {
  const p = a.angebotEntwurf({ vorgang: V, kontaktId: 'k1', jetzt: JETZT });
  assert.deepEqual(p, {
    voucherDate: erwartet(2026, 10, 16),
    expirationDate: erwartet(2026, 11, 15),
    address: { contactId: 'k1' },
    lineItems: [{ type: 'custom', name: 'Geländer Terrasse', quantity: 1, unitName: 'Stück',
      unitPrice: { currency: 'EUR', netAmount: 0, taxRatePercentage: 19 } }],
    totalPrice: { currency: 'EUR' },
    taxConditions: { taxType: 'net' },
    title: 'Angebot · V-26-0012',
    introduction: 'Ihre Bestellnr. 4711 · Vorgang V-26-0012',
  });
});

test('angebotEntwurf: ohne Bestellnr. nur die Vorgangsnummer', () => {
  const p = a.angebotEntwurf({ vorgang: { ...V, kunden_bestellnr: null }, kontaktId: 'k1', jetzt: JETZT });
  assert.equal(p.introduction, 'Vorgang V-26-0012');
});

test('uebernimmPositionen: nur schreibbare Felder, Preis passend zum taxType', () => {
  assert.deepEqual(a.uebernimmPositionen(ANGEBOT, 'net'), [
    { type: 'custom', name: 'Geländer', quantity: 2, unitName: 'Stück', discountPercentage: 0,
      unitPrice: { currency: 'EUR', netAmount: 600, taxRatePercentage: 19 } },
    { type: 'text', name: 'Hinweis', description: 'Montage nach Absprache' },
  ]);
  assert.deepEqual(a.uebernimmPositionen(ANGEBOT, 'gross')[0].unitPrice, { currency: 'EUR', grossAmount: 714, taxRatePercentage: 19 });
  assert.deepEqual(a.uebernimmPositionen(null, 'net'), []);
});

test('abEntwurf aus Angebot: geerbte Vorgangszeile ersetzt, Rest der Einleitung bleibt', () => {
  const p = a.abEntwurf({ vorgang: V, kontaktId: 'k1', quelle: ANGEBOT, jetzt: JETZT });
  assert.equal(p.introduction, 'Ihre Bestellnr. 4711 · Vorgang V-26-0012\nVielen Dank für Ihre Anfrage.');
  assert.equal(p.title, 'Auftrag · V-26-0012');
  assert.equal(p.lineItems.length, 2);
  assert.deepEqual(p.taxConditions, { taxType: 'net' });
  assert.deepEqual(p.totalPrice, { currency: 'EUR' });
  assert.equal(p.paymentConditions.paymentTermDuration, 14);
  assert.equal(p.expirationDate, undefined);
  assert.deepEqual(p.shippingConditions, { shippingType: 'none' });
});

test('abEntwurf: Versandbedingungen der Vorlage-AB werden übernommen', () => {
  const vorlage = { ...ANGEBOT, shippingConditions: { shippingType: 'delivery', shippingDate: '2026-10-20T00:00:00.000+02:00' } };
  const p = a.abEntwurf({ vorgang: V, kontaktId: 'k1', quelle: vorlage, jetzt: JETZT });
  assert.deepEqual(p.shippingConditions, vorlage.shippingConditions);
});

test('abEntwurf: Einleitung ohne Vorgangszeile → Zeile vorangestellt', () => {
  const p = a.abEntwurf({ vorgang: V, kontaktId: 'k1', quelle: { ...ANGEBOT, introduction: 'TEST TEXT' }, jetzt: JETZT });
  assert.equal(p.introduction, 'Ihre Bestellnr. 4711 · Vorgang V-26-0012\nTEST TEXT');
});

test('abEntwurf ohne Quelle: Platzhalter, net, nur Vorgangszeile', () => {
  const p = a.abEntwurf({ vorgang: V, kontaktId: 'k1', jetzt: JETZT });
  assert.equal(p.lineItems[0].name, 'Geländer Terrasse');
  assert.equal(p.introduction, 'Ihre Bestellnr. 4711 · Vorgang V-26-0012');
  assert.equal(p.paymentConditions, undefined);
});

// ── inLexwareAnlegen mit nachgebautem Pool und Lexware ──

function fakeDeps({ vorgang, angebot = null, abVorhanden = null, angebotStatus = 'accepted' }) {
  const calls = [];
  const pool = {
    async execute(sql, params) {
      calls.push({ sql, params });
      if (/FROM metall_vorgang v\s+JOIN metall_kunde/.test(sql)) return [[vorgang ? { ...vorgang, lexware_kontakt_id: 'k1' } : undefined]];
      if (/SELECT a\.belegnummer FROM metall_beleg a/.test(sql)) return [[abVorhanden || undefined]];
      if (/SELECT lexware_id, belegnummer FROM metall_beleg/.test(sql)) return [[angebot || undefined]];
      if (/^INSERT INTO metall_beleg /.test(sql.trim())) return [{ affectedRows: 1 }];
      if (/SELECT id FROM metall_beleg WHERE lexware_id/.test(sql)) return [[{ id: 77 }]];
      return [{ affectedRows: 1 }];
    },
    async query(sql, params) { calls.push({ sql, params }); return [{ affectedRows: 1 }]; },
  };
  const lex = {
    gesendet: [],
    async getVoucher(typ, id) {
      if (id === 'an-1') return { ...ANGEBOT, voucherStatus: angebotStatus };
      return { id, voucherStatus: 'draft', title: 'neu', introduction: 'x', address: { contactId: 'k1' }, relatedVouchers: id === 'neu-ab' ? [{ id: 'an-1', voucherType: 'quotation' }] : [] };
    },
    async createVoucher(typ, payload, opts) {
      this.gesendet.push({ typ, payload, opts });
      return { id: typ === 'quotation' ? 'neu-an' : 'neu-ab' };
    },
  };
  return { deps: { pool, lexware: lex }, calls, lex };
}

test('inLexwareAnlegen ab: aus dem Angebot mit precedingSalesVoucherId, zuordnung api', async () => {
  const { deps, calls, lex } = fakeDeps({ vorgang: { ...V, angebot_beleg_id: 9 }, angebot: { lexware_id: 'an-1', belegnummer: 'AG0083', belegstatus: 'accepted' } });
  const r = await a.inLexwareAnlegen(deps, 5, { art: 'ab', employeeId: 3, jetzt: JETZT });
  assert.equal(lex.gesendet.length, 1);
  assert.equal(lex.gesendet[0].typ, 'orderconfirmation');
  assert.deepEqual(lex.gesendet[0].opts, { vorgaenger: 'an-1' });
  assert.equal(r.beleg_id, 77);
  assert.equal(r.verknuepft_mit, 'an-1');
  const upd = calls.find(c => /SET zuordnung = 'api'/.test(c.sql));
  assert.deepEqual(upd.params, [5, 3, 77]);
  // Verknuepfung zum Angebot gespeichert
  assert.ok(calls.some(c => /INSERT INTO metall_beleg_bezug/.test(c.sql) && JSON.stringify(c.params).includes('an-1')));
});

test('inLexwareAnlegen angebot: Vorgang bekommt angebot_beleg_id, Beleg ohne vorgang_id', async () => {
  const { deps, calls, lex } = fakeDeps({ vorgang: { ...V, angebot_beleg_id: null } });
  await a.inLexwareAnlegen(deps, 5, { art: 'angebot', jetzt: JETZT });
  assert.equal(lex.gesendet[0].typ, 'quotation');
  assert.deepEqual(lex.gesendet[0].opts, { vorgaenger: null });
  assert.deepEqual(calls.find(c => /SET zuordnung = 'api'/.test(c.sql)).params, [null, null, 77]);
  assert.deepEqual(calls.find(c => /SET angebot_beleg_id/.test(c.sql)).params, [77, 5]);
});

test('inLexwareAnlegen: Angebot in Lexware schon fertig, DB noch Entwurf → AB geht', async () => {
  const { deps, lex } = fakeDeps({ vorgang: { ...V, angebot_beleg_id: 9 }, angebot: { lexware_id: 'an-1', belegnummer: 'AG0084', belegstatus: 'draft' }, angebotStatus: 'open' });
  await a.inLexwareAnlegen(deps, 5, { art: 'ab', jetzt: JETZT });
  assert.equal(lex.gesendet.length, 1);
});

test('inLexwareAnlegen: Sperren vor jedem Lexware-Anlegen', async () => {
  const faelle = [
    [{ vorgang: null }, 'ab', 404],
    [{ vorgang: { ...V, abgebrochen_am: new Date() } }, 'ab', 400],
    [{ vorgang: V }, 'rechnung', 400],
    [{ vorgang: { ...V, angebot_beleg_id: 9 } }, 'angebot', 409],
    [{ vorgang: V, abVorhanden: { belegnummer: 'AB0100' } }, 'ab', 409],
    [{ vorgang: { ...V, angebot_beleg_id: 9 }, angebot: { lexware_id: 'an-1', belegnummer: 'AG0084' }, angebotStatus: 'draft' }, 'ab', 409],
    // neuer Vorgang ohne Angebot und ohne Vorlage: immer erst ein Angebot
    [{ vorgang: { ...V, angebot_beleg_id: null, vorlage_vorgang_id: null } }, 'ab', 409],
  ];
  for (const [opt, art, status] of faelle) {
    const { deps, lex } = fakeDeps(opt);
    await assert.rejects(a.inLexwareAnlegen(deps, 5, { art }), e => e.status === status);
    assert.equal(lex.gesendet.length, 0);
  }
});

test('inLexwareAnlegen: zweiter Aufruf für denselben Vorgang während des ersten → 409', async () => {
  const { deps } = fakeDeps({ vorgang: { ...V, angebot_beleg_id: null } });
  const erster = a.inLexwareAnlegen(deps, 5, { art: 'angebot', jetzt: JETZT });
  await assert.rejects(a.inLexwareAnlegen(deps, 5, { art: 'angebot' }), e => e.status === 409);
  await erster;
});
