const { test } = require('node:test');
const assert = require('node:assert/strict');
const s = require('../src/services/metallSync');

const AB = {
  id: 'ab-1', voucherNumber: 'AB0100', voucherStatus: 'open', archived: false,
  voucherDate: '2026-10-16T00:00:00.000+02:00', updatedDate: '2026-10-16T10:22:33.456+02:00', version: 4,
  totalPrice: { totalNetAmount: 1000, totalGrossAmount: 1190 },
  address: { contactId: 'k1', name: 'Testfirma GmbH' },
  introduction: '\n  Ihre Bestellnr. 4711 · Vorgang V-26-0012  \nSehr geehrte Damen und Herren,',
  relatedVouchers: [
    { id: 'an-1', voucherNumber: 'AG0076', voucherType: 'quotation' },
    { id: 'ls-1', voucherNumber: 'LS0032', voucherType: 'deliverynote' },
    { id: 'ls-1', voucherNumber: 'LS0032', voucherType: 'deliverynote' },
  ],
};

test('ersteZeile: erste nicht leere Zeile, getrimmt, auf 255 gekürzt', () => {
  assert.equal(s.ersteZeile(AB.introduction), 'Ihre Bestellnr. 4711 · Vorgang V-26-0012');
  assert.equal(s.ersteZeile(''), null);
  assert.equal(s.ersteZeile(null), null);
  assert.equal(s.ersteZeile('x'.repeat(300)).length, 255);
});

test('belegZeile: Felder aus dem Einzelabruf', () => {
  const z = s.belegZeile(AB, 'orderconfirmation');
  assert.deepEqual({ ...z, lexware_geaendert_am: undefined }, {
    lexware_id: 'ab-1', belegart: 'orderconfirmation', belegnummer: 'AB0100', belegstatus: 'open',
    archiviert: 0, belegdatum: '2026-10-16', betrag_netto: 1000, betrag_brutto: 1190,
    lexware_kontakt_id: 'k1', lexware_version: 4, lexware_geaendert_am: undefined,
    einleitung_zeile: 'Ihre Bestellnr. 4711 · Vorgang V-26-0012',
  });
  assert.equal(z.lexware_geaendert_am.toISOString(), '2026-10-16T08:22:33.456Z');
});

test('belegZeile: Entwurf ohne Nummer, ohne Beträge, archiviert', () => {
  const z = s.belegZeile({ id: 'e1', voucherStatus: 'draft', archived: true }, 'quotation');
  assert.equal(z.belegnummer, null);
  assert.equal(z.archiviert, 1);
  assert.equal(z.betrag_brutto, null);
  assert.equal(z.belegdatum, null);
  assert.equal(z.lexware_geaendert_am, null);
  assert.equal(z.einleitung_zeile, null);
});

test('bezugZeilen: doppelte Verweise nur einmal', () => {
  assert.deepEqual(s.bezugZeilen(AB), [
    { bezug_lexware_id: 'an-1', bezug_belegart: 'quotation' },
    { bezug_lexware_id: 'ls-1', bezug_belegart: 'deliverynote' },
  ]);
  assert.deepEqual(s.bezugZeilen({}), []);
});

test('istGeaendert: neu, gleich bis 1 s (auch gerundet), geändert', () => {
  const eintrag = { updatedDate: '2026-10-16T10:22:33.456+02:00' };
  assert.equal(s.istGeaendert(eintrag, undefined), true);
  assert.equal(s.istGeaendert(eintrag, { lexware_geaendert_am: new Date('2026-10-16T08:22:33Z') }), false);
  assert.equal(s.istGeaendert(eintrag, { lexware_geaendert_am: new Date('2026-10-16T08:22:34Z') }), false);
  assert.equal(s.istGeaendert(eintrag, { lexware_geaendert_am: new Date('2026-10-16T08:22:30Z') }), true);
  assert.equal(s.istGeaendert({}, { lexware_geaendert_am: new Date() }), true);
});

test('abfrageAb: Erstabgleich ab 2025, sonst Änderungsdatum minus 1 Tag', () => {
  assert.deepEqual(s.abfrageAb(null), { voucherDateFrom: '2025-01-01' });
  const r = s.abfrageAb(new Date(2026, 9, 16, 12, 0));
  assert.equal(r.updatedDateFrom.getDate(), 15);
  assert.equal(r.voucherDateFrom, undefined);
});

// ── Zuordnung ──
const V12 = { vorgang_id: 12, exakt: true, kunde_passt: true, angebot_beleg_id: null };

test('bestimmeZuordnung: feste Zuordnung bleibt', () => {
  for (const z of ['api', 'verknuepfung', 'einleitung', 'auto', 'manuell', 'ignoriert']) {
    assert.equal(s.bestimmeZuordnung({ beleg: { belegart: 'invoice', zuordnung: z }, einleitung: V12 }), null);
  }
});

test('bestimmeZuordnung: LS/RE über verknüpfte AB', () => {
  const r = s.bestimmeZuordnung({ beleg: { belegart: 'deliverynote', zuordnung: 'offen' }, nachbarn: [{ belegart: 'orderconfirmation', vorgang_id: 7 }] });
  assert.deepEqual(r, { zuordnung: 'verknuepfung', vorgang_id: 7, vorschlag_vorgang_id: null, angebot_fuer_vorgang_id: null });
});

test('bestimmeZuordnung: Verknüpfung schlägt Einleitung', () => {
  const r = s.bestimmeZuordnung({ beleg: { belegart: 'invoice', zuordnung: 'offen' }, nachbarn: [{ belegart: 'orderconfirmation', vorgang_id: 7 }], einleitung: V12 });
  assert.equal(r.vorgang_id, 7);
});

test('bestimmeZuordnung: Angebot als Nachbar zählt nicht als Vorgang', () => {
  const r = s.bestimmeZuordnung({ beleg: { belegart: 'invoice', zuordnung: 'offen' }, nachbarn: [{ belegart: 'quotation', vorgang_id: 3 }] });
  assert.equal(r.zuordnung, 'offen');
});

test('bestimmeZuordnung: zwei verschiedene Vorgänge → offen ohne Vorschlag', () => {
  const r = s.bestimmeZuordnung({
    beleg: { belegart: 'invoice', zuordnung: 'offen' },
    nachbarn: [{ belegart: 'orderconfirmation', vorgang_id: 7 }, { belegart: 'deliverynote', vorgang_id: 8 }],
    einleitung: V12,
  });
  assert.deepEqual(r, { zuordnung: 'offen', vorgang_id: null, vorschlag_vorgang_id: null, angebot_fuer_vorgang_id: null });
});

const AB_OFFEN = { belegart: 'orderconfirmation', zuordnung: 'offen' };
const AUS_ANGEBOT = [{ id: 50, belegart: 'quotation', vorgang_id: null }];

test('bestimmeZuordnung: AB aus Angebot ohne Kandidat → offen, Vorschlag aus Einleitung (#364)', () => {
  const r = s.bestimmeZuordnung({ beleg: AB_OFFEN, nachbarn: AUS_ANGEBOT, einleitung: V12 });
  assert.deepEqual(r, { zuordnung: 'offen', vorgang_id: null, vorschlag_vorgang_id: 12, angebot_fuer_vorgang_id: null });
});

test('bestimmeZuordnung: AB aus Angebot, genau ein offener Vorgang ohne AB → auto (#364)', () => {
  const r = s.bestimmeZuordnung({ beleg: AB_OFFEN, nachbarn: AUS_ANGEBOT, einleitung: V12, kandidaten: [13] });
  assert.deepEqual(r, { zuordnung: 'auto', vorgang_id: 13, vorschlag_vorgang_id: null, angebot_fuer_vorgang_id: null });
});

test('bestimmeZuordnung: Angebot mehrfach umgewandelt → keine auto, Vorschlag für alle ABs', () => {
  const r = s.bestimmeZuordnung({ beleg: AB_OFFEN, nachbarn: AUS_ANGEBOT, kandidaten: [13], konkurrenz: 1 });
  assert.deepEqual(r, { zuordnung: 'offen', vorgang_id: null, vorschlag_vorgang_id: 13, angebot_fuer_vorgang_id: null });
});

test('bestimmeZuordnung: AB aus Angebot, genaue Einleitungszeile allein reicht nicht', () => {
  const r = s.bestimmeZuordnung({ beleg: AB_OFFEN, nachbarn: AUS_ANGEBOT, einleitung: V12, kandidaten: [12, 13] });
  assert.equal(r.zuordnung, 'offen');
  assert.equal(r.vorgang_id, null);
});

test('bestimmeZuordnung: AB aus Angebot, mehrere Kandidaten → Vorschlag Einleitung, sonst ältester', () => {
  const mitEinleitung = s.bestimmeZuordnung({ beleg: AB_OFFEN, nachbarn: AUS_ANGEBOT, einleitung: V12, kandidaten: [11, 12] });
  assert.equal(mitEinleitung.vorschlag_vorgang_id, 12);
  // Einleitung zeigt auf einen Vorgang, der schon eine AB hat → ältester Kandidat
  const einleitungBelegt = s.bestimmeZuordnung({ beleg: AB_OFFEN, nachbarn: AUS_ANGEBOT, einleitung: V12, kandidaten: [13, 14] });
  assert.equal(einleitungBelegt.vorschlag_vorgang_id, 13);
  const ohne = s.bestimmeZuordnung({ beleg: AB_OFFEN, nachbarn: AUS_ANGEBOT, kandidaten: [13, 14] });
  assert.equal(ohne.vorschlag_vorgang_id, 13);
});

test('bestimmeZuordnung: Verknüpfung zu AB/LS schlägt die Angebotsregel', () => {
  const r = s.bestimmeZuordnung({ beleg: AB_OFFEN, nachbarn: [...AUS_ANGEBOT, { belegart: 'deliverynote', vorgang_id: 7 }], kandidaten: [13] });
  assert.equal(r.zuordnung, 'verknuepfung');
  assert.equal(r.vorgang_id, 7);
});

test('bestimmeZuordnung: freie AB ohne Nummer, ein Kandidat → nur Vorschlag, nie auto', () => {
  assert.deepEqual(s.bestimmeZuordnung({ beleg: AB_OFFEN, kandidaten: [13] }),
    { zuordnung: 'offen', vorgang_id: null, vorschlag_vorgang_id: 13, angebot_fuer_vorgang_id: null });
  assert.equal(s.bestimmeZuordnung({ beleg: AB_OFFEN, kandidaten: [13, 14] }).vorschlag_vorgang_id, null);
  // Vorschlag aus der Einleitung geht vor
  assert.equal(s.bestimmeZuordnung({ beleg: AB_OFFEN, einleitung: { ...V12, exakt: false }, kandidaten: [13] }).vorschlag_vorgang_id, 12);
});

test('bestimmeZuordnung: Kandidaten wirken nur bei AB', () => {
  const r = s.bestimmeZuordnung({ beleg: { belegart: 'invoice', zuordnung: 'offen' }, nachbarn: AUS_ANGEBOT, kandidaten: [13] });
  assert.deepEqual(r, { zuordnung: 'offen', vorgang_id: null, vorschlag_vorgang_id: null, angebot_fuer_vorgang_id: null });
});

test('bestimmeZuordnung: freie AB/LS/RE mit genauer Einleitungszeile → einleitung', () => {
  for (const art of ['orderconfirmation', 'deliverynote', 'invoice']) {
    const r = s.bestimmeZuordnung({ beleg: { belegart: art, zuordnung: 'offen' }, einleitung: V12 });
    assert.deepEqual(r, { zuordnung: 'einleitung', vorgang_id: 12, vorschlag_vorgang_id: null, angebot_fuer_vorgang_id: null });
  }
});

test('bestimmeZuordnung: V-Nummer nur irgendwo im Text → nur Vorschlag', () => {
  const r = s.bestimmeZuordnung({ beleg: { belegart: 'invoice', zuordnung: 'offen' }, einleitung: { ...V12, exakt: false } });
  assert.equal(r.zuordnung, 'offen');
  assert.equal(r.vorschlag_vorgang_id, 12);
});

test('bestimmeZuordnung: Vorgang eines anderen Kunden → offen ohne Vorschlag', () => {
  const r = s.bestimmeZuordnung({ beleg: { belegart: 'invoice', zuordnung: 'offen' }, einleitung: { ...V12, kunde_passt: false } });
  assert.deepEqual(r, { zuordnung: 'offen', vorgang_id: null, vorschlag_vorgang_id: null, angebot_fuer_vorgang_id: null });
});

test('bestimmeZuordnung: Angebot hängt sich an den Vorgang, wenn dort noch keins steht', () => {
  const r = s.bestimmeZuordnung({ beleg: { belegart: 'quotation', zuordnung: 'offen' }, einleitung: V12 });
  assert.deepEqual(r, { zuordnung: 'einleitung', vorgang_id: null, vorschlag_vorgang_id: null, angebot_fuer_vorgang_id: 12 });
});

test('bestimmeZuordnung: Angebot, Vorgang hat schon ein Angebot → offen mit Vorschlag', () => {
  const r = s.bestimmeZuordnung({ beleg: { belegart: 'quotation', zuordnung: 'offen' }, einleitung: { ...V12, angebot_beleg_id: 99 } });
  assert.equal(r.zuordnung, 'offen');
  assert.equal(r.vorschlag_vorgang_id, 12);
  assert.equal(r.vorgang_id, null);
});

test('bestimmeZuordnung: ohne jeden Hinweis → offen', () => {
  const r = s.bestimmeZuordnung({ beleg: { belegart: 'invoice', zuordnung: 'offen' } });
  assert.deepEqual(r, { zuordnung: 'offen', vorgang_id: null, vorschlag_vorgang_id: null, angebot_fuer_vorgang_id: null });
});
