/** #518: Tourplanung im Büro – Fachregeln und Router ohne Datenbank (Speicher im RAM). */
const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { FahrerFehler } = require('../src/services/fahrerKrypto');
const plan = require('../src/services/fahrerPlanung');
const { erstellePlanungRouter } = require('../src/routes/api/fahrer/planung');

const B1 = '11111111-aaaa-bbbb-cccc-000000000001';
const B2 = '22222222-aaaa-bbbb-cccc-000000000002';
const bestellung = (id, extra = {}) => ({
  id, status: 'active', done: false, ser_status: null, lexware_customer_number: '10001', customer_name: 'Gasthof Rosenheim',
  delivery_strasse: 'Hauptstr. 1', delivery_plz: '83022', delivery_ort: 'Rosenheim', delivery_time_to: '11:00:00', delivery_note: 'Hintereingang',
  items: [{ product_id: '7801200', quantity: 2 }, { product_id: 'a0b1c2d3-1111-2222-3333-444455556666', articleNumber: '7801100', quantity: 1 }], ...extra,
});

test('Statuswechsel: freigeben nur aus Entwurf, Storno auch unterwegs, Beenden nur unterwegs', () => {
  assert.equal(plan.wechsel('freigeben', { status: 'entwurf' }), 'freigegeben');
  assert.equal(plan.wechsel('stornieren', { status: 'unterwegs' }), 'storniert');
  assert.equal(plan.wechsel('beenden', { status: 'unterwegs' }), 'beendet');
  assert.throws(() => plan.wechsel('freigeben', { status: 'freigegeben' }), (e) => e.code === 'status_unpassend');
  assert.throws(() => plan.wechsel('beenden', { status: 'freigegeben' }), (e) => e.code === 'status_unpassend');
  assert.throws(() => plan.wechsel('stornieren', { status: 'beendet' }), (e) => e.code === 'status_unpassend');
});

test('offen: nicht storniert, nicht erledigt, nicht belegt; SER-abgelehnt bleibt offen', () => {
  const belegt = new Set([B2]);
  assert.equal(plan.istOffen(bestellung(B1), belegt), true);
  assert.equal(plan.istOffen(bestellung(B1, { status: 'cancelled' }), belegt), false);
  assert.equal(plan.istOffen(bestellung(B1, { done: true }), belegt), false);
  assert.equal(plan.istOffen(bestellung(B2), belegt), false);
  assert.equal(plan.istOffen(bestellung(B1, { ser_status: 'err' }), belegt), true);
  assert.equal(plan.bestellAnsicht(bestellung(B1, { ser_status: 'err' })).serAbgelehnt, true);
});

test('Stopp aus Bestellung: Kopie, UUID-Position über articleNumber, Lieferzeit', () => {
  const s = plan.stoppAusBestellung(bestellung(B1, { delivery_note: '[Mobile] Klingeln' }));
  assert.equal(s.kundeNr, '10001');
  assert.equal(s.kundeAdresse, 'Hauptstr. 1, 83022 Rosenheim');
  assert.equal(s.lieferzeit, 'bis 11:00 Uhr');
  assert.equal(s.hinweise, 'Klingeln');
  assert.deepEqual(s.positionen, [{ artikelNr: '7801200', soll: 2 }, { artikelNr: '7801100', soll: 1 }]);
});

test('Stopp aus Bestellung: ohne Kundennummer, ohne Positionen, Position ohne Artikel werden abgelehnt', () => {
  assert.throws(() => plan.stoppAusBestellung(bestellung(B1, { lexware_customer_number: null, customer_number: null })), (e) => e.code === 'kunde_ohne_nummer');
  assert.throws(() => plan.stoppAusBestellung(bestellung(B1, { items: [] })), (e) => e.code === 'bestellung_leer');
  assert.throws(() => plan.stoppAusBestellung(bestellung(B1, { items: [{ quantity: 1 }] })), (e) => e.code === 'position_ohne_artikel');
});

test('Löschen nur bei leerer oder stornierter Tour', () => {
  plan.pruefeLoeschbar({ status: 'entwurf' }, 0);
  plan.pruefeLoeschbar({ status: 'storniert' }, 3);
  assert.throws(() => plan.pruefeLoeschbar({ status: 'entwurf' }, 1), (e) => e.code === 'tour_nicht_loeschbar');
});

// ── Router mit RAM-Store ──
let kundenTreffer = [{ name: 'Gasthof Rosenheim', lexware_customer_number: '10001', billing_zip: '83022', billing_city: 'Rosenheim' }, { name: 'Gasthof ohne Nummer' }, { company_name: 'x', customer_number: 'K5' }];
let touren; let stopps; let bestellungen; let naechsteId; let vorlagen;
const aktive = () => new Set(stopps.filter((s) => s.sperre).map((s) => s.sperre));
const ramStore = {
  async touren() { return touren.map((t) => ({ ...t, stopps: stopps.filter((s) => s.tour_id === t.id).length })); },
  async tourNachId(id) { const t = touren.find((x) => x.id === id); return t ? { ...t, stopps: stopps.filter((s) => s.tour_id === id).length } : null; },
  async stopps(id) { return stopps.filter((s) => s.tour_id === id).sort((a, b) => a.reihenfolge - b.reihenfolge); },
  async legeAn(k) { const t = { id: naechsteId++, datum: k.datum, bezeichnung: k.bezeichnung, employee_id: k.employeeId, fahrzeug: k.fahrzeug, ladebasis_id: k.ladebasisId, status: 'entwurf', version: 1 }; touren.push(t); return t; },
  async aendereKopf(id, k) { const t = touren.find((x) => x.id === id); if (t.status !== 'entwurf') return false; Object.assign(t, { datum: k.datum, bezeichnung: k.bezeichnung, employee_id: k.employeeId, fahrzeug: k.fahrzeug, ladebasis_id: k.ladebasisId, version: t.version + 1 }); return true; },
  async belegteBestellungen() { return aktive(); },
  async unbekannteArtikel(nr) { return nr.filter((n) => n === 'XXX'); },
  async fuegeStoppHinzu(tourId, s) {
    if (aktive().has(s.bestellId)) throw new FahrerFehler(409, 'bestellung_belegt', 'belegt');
    const id = naechsteId++;
    stopps.push({ id, tour_id: tourId, reihenfolge: stopps.filter((x) => x.tour_id === tourId).length + 1, auftrag_ref: s.auftragRef, bestell_id: s.bestellId, sperre: s.bestellId, kunde_nr: s.kundeNr, kunde_name: s.kundeName, positionen: s.positionen });
    touren.find((t) => t.id === tourId).version += 1;
    return id;
  },
  async entferneStopp(tourId, stoppId) { stopps = stopps.filter((s) => s.id !== stoppId); },
  async aendereStopp() {},
  async sortiere(tourId, ids) { ids.forEach((id, i) => { stopps.find((s) => s.id === id).reihenfolge = i + 1; }); },
  async setzeStatus(id, aktion, von, nach) {
    const t = touren.find((x) => x.id === id);
    if (!von.includes(t.status)) return false;
    t.status = nach; t.version += 1;
    if (nach === 'storniert') stopps.filter((s) => s.tour_id === id).forEach((s) => { s.sperre = null; });
    return true;
  },
  async loesche(id) { touren = touren.filter((t) => t.id !== id); },
  async vorlagen() { return vorlagen; },
  async vorlageNachId(id) { return vorlagen.find((v) => v.id === id) || null; },
  async speichereVorlage(id, v) {
    if (vorlagen.some((x) => x.name === v.name && x.id !== id)) throw new FahrerFehler(409, 'name_vergeben', 'doppelt');
    const neu = { id: id ?? naechsteId++, name: v.name, employee_id: v.employeeId, fahrzeug: v.fahrzeug, ladebasis_id: v.ladebasisId, kunden: v.kunden.map((k) => ({ kunde_nr: k.kundeNr, kunde_name: k.kundeName, lieferzeit: k.lieferzeit, hinweise: k.hinweise })) };
    vorlagen = id == null ? [...vorlagen, neu] : vorlagen.map((x) => (x.id === id ? neu : x));
    return neu.id;
  },
  async loescheVorlage(id) { const n = vorlagen.length; vorlagen = vorlagen.filter((v) => v.id !== id); return vorlagen.length < n; },
};

let server; let basis;
beforeEach(() => {
  naechsteId = 100; touren = []; stopps = []; vorlagen = [];
  bestellungen = [bestellung(B1), bestellung(B2, { customer_name: 'Zweiter' })];
});
before(async () => {
  const app = express();
  app.use(express.json());
  app.use('/api/fahrer-touren', erstellePlanungRouter({ store: ramStore, holeBestellungen: async () => bestellungen, sucheKunden: async (q) => kundenTreffer.filter((c) => (c.name || '').toLowerCase().includes(q.toLowerCase())), uhr: () => Date.parse('2026-11-18T10:00:00Z') }));
  await new Promise((r) => { server = app.listen(0, '127.0.0.1', r); });
  basis = `http://127.0.0.1:${server.address().port}/api/fahrer-touren`;
});
after(() => server.close());
const rufe = async (m, p, body) => {
  const r = await fetch(basis + p, { method: m, headers: { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: r.status, daten: await r.json() };
};
const neueTour = async () => (await rufe('POST', '', { datum: '2026-11-18', bezeichnung: 'Montag Rosenheim', employeeId: 7 })).daten;

test('Anlegen prüft Pflichtfelder', async () => {
  assert.equal((await rufe('POST', '', { datum: '18.11.2026', bezeichnung: 'x', employeeId: 7 })).status, 400);
  assert.equal((await rufe('POST', '', { datum: '2026-11-18', bezeichnung: '', employeeId: 7 })).status, 400);
  assert.equal((await rufe('POST', '', { datum: '2026-11-18', bezeichnung: 'x' })).status, 400);
  assert.equal((await neueTour()).status, 'entwurf');
});

test('Ablauf: Bestellungen zuordnen, belegte verschwinden aus „offen“, Doppelbelegung abgelehnt, Storno gibt frei', async () => {
  const t = await neueTour();
  assert.equal((await rufe('GET', '/offene-bestellungen')).daten.length, 2);
  assert.equal((await rufe('POST', `/${t.id}/bestellungen`, { bestellIds: [B1] })).status, 201);
  assert.deepEqual((await rufe('GET', '/offene-bestellungen')).daten.map((b) => b.id), [B2]);
  assert.equal((await rufe('POST', `/${t.id}/bestellungen`, { bestellIds: [B1] })).daten.code, 'bestellung_nicht_offen');
  assert.equal((await rufe('POST', `/${t.id}/freigeben`)).daten.status, 'freigegeben');
  assert.equal((await rufe('POST', `/${t.id}/stornieren`)).daten.status, 'storniert');
  assert.equal((await rufe('GET', '/offene-bestellungen')).daten.length, 2);
});

test('Auswahl ist alles oder nichts: eine nicht offene Bestellung lässt keinen Stopp entstehen', async () => {
  const t = await neueTour();
  const r = await rufe('POST', `/${t.id}/bestellungen`, { bestellIds: [B1, 'gibt-es-nicht'] });
  assert.equal(r.status, 409);
  assert.equal(stopps.length, 0);
});

test('Freigeben: leere Tour geht nicht; freigegebene Tour ist gesperrt, zurück in den Entwurf geht', async () => {
  const t = await neueTour();
  assert.equal((await rufe('POST', `/${t.id}/freigeben`)).daten.code, 'tour_leer');
  await rufe('POST', `/${t.id}/bestellungen`, { bestellIds: [B1] });
  await rufe('POST', `/${t.id}/freigeben`);
  assert.equal((await rufe('POST', `/${t.id}/bestellungen`, { bestellIds: [B2] })).daten.code, 'tour_gesperrt');
  assert.equal((await rufe('PATCH', `/${t.id}`, { bezeichnung: 'neu' })).status, 409);
  assert.equal((await rufe('POST', `/${t.id}/zurueck`)).daten.status, 'entwurf');
});

test('Reihenfolge, Entfernen und Löschen', async () => {
  const t = await neueTour();
  await rufe('POST', `/${t.id}/bestellungen`, { bestellIds: [B1, B2] });
  const [a, b] = (await rufe('GET', `/${t.id}`)).daten.stoppListe.map((s) => s.id);
  assert.equal((await rufe('PUT', `/${t.id}/reihenfolge`, { stoppIds: [b, a] })).status, 200);
  assert.deepEqual((await rufe('GET', `/${t.id}`)).daten.stoppListe.map((s) => s.id), [b, a]);
  assert.equal((await rufe('PUT', `/${t.id}/reihenfolge`, { stoppIds: [a, a] })).status, 400);
  assert.equal((await rufe('DELETE', `/${t.id}`)).daten.code, 'tour_nicht_loeschbar');
  await rufe('DELETE', `/${t.id}/stopps/${a}`);
  await rufe('DELETE', `/${t.id}/stopps/${b}`);
  assert.equal((await rufe('DELETE', `/${t.id}`)).status, 200);
});

test('Tour im Büro beenden nur, wenn sie unterwegs ist', async () => {
  const t = await neueTour();
  assert.equal((await rufe('POST', `/${t.id}/beenden`)).status, 409);
  touren[0].status = 'unterwegs';
  assert.equal((await rufe('POST', `/${t.id}/beenden`)).daten.status, 'beendet');
});

// ── Vorlagen (#518) ──
const B3 = '33333333-aaaa-bbbb-cccc-000000000003';

test('Vorlagen-Logik: Kunden in Vorlagenreihenfolge, mehrere Bestellungen nach Alter, Lücken und Fehler werden gemeldet', () => {
  const kunden = [
    { kunde_nr: '20002', kunde_name: 'Zweiter', lieferzeit: 'vormittags', hinweise: 'Tor B' },
    { kunde_nr: '10001', kunde_name: 'Gasthof Rosenheim', lieferzeit: null, hinweise: null },
    { kunde_nr: '30003', kunde_name: 'Ohne Bestellung', lieferzeit: null, hinweise: null },
  ];
  const offen = [
    bestellung(B1, { created_at: '2026-11-10T08:00:00Z' }),
    bestellung(B2, { lexware_customer_number: '20002', delivery_time_to: null, delivery_note: null, created_at: '2026-11-11T08:00:00Z' }),
    bestellung(B3, { created_at: '2026-11-09T08:00:00Z', items: [] }),
  ];
  const r = plan.stoppsAusVorlage(kunden, offen);
  assert.deepEqual(r.stopps.map((s) => s.bestellId), [B2, B1]);
  assert.equal(r.stopps[0].lieferzeit, 'vormittags');
  assert.equal(r.stopps[0].hinweise, 'Tor B');
  assert.equal(r.stopps[1].lieferzeit, 'bis 11:00 Uhr');
  assert.deepEqual(r.ohneBestellung.map((k) => k.kundeNr), ['30003']);
  assert.deepEqual(r.fehler.map((f) => [f.bestellId, f.grund.includes('keine Positionen')]), [[B3, true]]);
});

test('Vorlage aus Stopps: ein Eintrag je Kunde, erste Reihenfolge zählt', () => {
  const k = plan.vorlageKundenAusStopps([
    { kunde_nr: '2', kunde_name: 'B', lieferzeit: '8 Uhr' }, { kunde_nr: '1', kunde_name: 'A' }, { kunde_nr: '2', kunde_name: 'B' },
  ]);
  assert.deepEqual(k.map((x) => x.kundeNr), ['2', '1']);
  assert.equal(k[0].lieferzeit, '8 Uhr');
});

test('Vorlage anlegen, ändern, doppelter Name, doppelter Kunde, löschen', async () => {
  const kopf = { name: 'Montag Rosenheim', employeeId: 7, kunden: [{ kundeNr: '10001', kundeName: 'Gasthof' }] };
  const neu = await rufe('POST', '/vorlagen', kopf);
  assert.equal(neu.status, 201);
  assert.equal(neu.daten.kunden[0].kundeNr, '10001');
  assert.equal((await rufe('POST', '/vorlagen', kopf)).status, 409);
  assert.equal((await rufe('POST', '/vorlagen', { ...kopf, name: 'x', kunden: [{ kundeNr: '1', kundeName: 'a' }, { kundeNr: '1', kundeName: 'a' }] })).status, 400);
  assert.equal((await rufe('POST', '/vorlagen', { ...kopf, name: '' })).status, 400);
  assert.equal((await rufe('PUT', `/vorlagen/${neu.daten.id}`, { ...kopf, kunden: [] })).daten.kunden.length, 0);
  assert.equal((await rufe('PUT', '/vorlagen/9999', kopf)).status, 404);
  assert.equal((await rufe('DELETE', `/vorlagen/${neu.daten.id}`)).status, 200);
  assert.equal((await rufe('DELETE', `/vorlagen/${neu.daten.id}`)).status, 404);
});

test('Tour aus Vorlage: übernimmt offene Bestellungen der Stammkunden, meldet Kunden ohne Bestellung', async () => {
  const v = (await rufe('POST', '/vorlagen', {
    name: 'Standard', employeeId: 7, fahrzeug: 'RO-DR 101',
    kunden: [{ kundeNr: '10001', kundeName: 'Gasthof' }, { kundeNr: '99999', kundeName: 'Nichts offen' }],
  })).daten;
  const r = await rufe('POST', '/aus-vorlage', { vorlageId: v.id, datum: '2026-11-23' });
  assert.equal(r.status, 201);
  assert.equal(r.daten.tour.bezeichnung, 'Standard');
  assert.equal(r.daten.tour.fahrzeug, 'RO-DR 101');
  assert.equal(r.daten.uebernommen, 2);
  assert.deepEqual(r.daten.ohneBestellung.map((k) => k.kundeNr), ['99999']);
  // Zweiter Lauf: die Bestellungen stecken schon in der ersten Tour
  const r2 = await rufe('POST', '/aus-vorlage', { vorlageId: v.id, datum: '2026-11-30' });
  assert.equal(r2.daten.uebernommen, 0);
  assert.equal(r2.daten.ohneBestellung.length, 2);
  assert.equal((await rufe('POST', '/aus-vorlage', { vorlageId: v.id, datum: 'morgen' })).status, 400);
  assert.equal((await rufe('POST', '/aus-vorlage', { vorlageId: 9999, datum: '2026-11-23' })).status, 404);
});

test('Vorlage aus Tour speichern: braucht Stopps', async () => {
  const t = await neueTour();
  assert.equal((await rufe('POST', `/${t.id}/als-vorlage`, { name: 'Neu' })).daten.code, 'tour_leer');
  await rufe('POST', `/${t.id}/bestellungen`, { bestellIds: [B2, B1] });
  const v = await rufe('POST', `/${t.id}/als-vorlage`, { name: 'Neu' });
  assert.equal(v.status, 201);
  assert.deepEqual(v.daten.kunden.map((k) => k.kundeNr), ['10001']);
  assert.equal(v.daten.employeeId, 7);
});

test('Kundensuche: ab 2 Zeichen, Kunden ohne Nummer fallen raus, Ort kommt mit', async () => {
  assert.deepEqual((await rufe('GET', '/kunden?q=g')).daten, []);
  const r = await rufe('GET', '/kunden?q=gasthof');
  assert.deepEqual(r.daten, [{ kundeNr: '10001', kundeName: 'Gasthof Rosenheim', ort: '83022 Rosenheim' }]);
  assert.equal(plan.kundeAnsicht({ company_name: 'x', customer_number: 'K5' }).kundeName, 'x');
  assert.equal(plan.kundeAnsicht({ name: 'ohne' }), null);
});
