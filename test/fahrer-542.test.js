/**
 * #542 Fahrer-App: GET /heute und POST /ereignisse – ohne Datenbank (Speicher im RAM, gleiche Schnittstelle
 * wie services/fahrerTouren.js). Die Anmeldung (#541) ersetzt hier eine Middleware, die req.fahrer aus einem Header setzt.
 */
const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const express = require('express');
const { FahrerFehler } = require('../src/services/fahrerKrypto');
const { erstelleTourRouter, tagInBerlin } = require('../src/routes/api/fahrer/touren');

// ── Speicher im RAM ──────────────────────────────────────────────────────────
function ramSpeicher() {
  const s = {
    touren: [], stopps: [], positionen: [], ereignisse: [], belege: [], belegPositionen: [],
    geraete: [{ id: 1, kennung: 'T1', ls_stand: 3 }, { id: 2, kennung: 'HSEPP', ls_stand: 0 }],
    artikelListe: [
      { artikel_nr: '7801200', bezeichnung: 'Propan 11 kg', typ: 'F', aktiv: 1, gasart: 'Propan', kategorie: 'propan', kg_fuellung: '11.00',
        un_nr: '1965', gefahrklasse: '2.1', befoerderungskategorie: 2, preis_netto_cent: 2926, mwst_satz: '19.0', pfand_artikel_nr: '2801200' },
      { artikel_nr: 'T002', bezeichnung: 'Sauerstoff 10 l', gasart: 'Sauerstoff', kategorie: 'technisch', kg_fuellung: null },
    ],
  };
  const mitKennung = (t) => t && { ...t, geraet_kennung: s.geraete.find((g) => g.id === t.geraet_id)?.kennung || null };
  return Object.assign(s, {
    async ladbareTouren(employeeId, datum) {
      return s.touren.filter((t) => t.employee_id === employeeId && t.datum === datum && ['freigegeben', 'unterwegs'].includes(t.status)).map(mitKennung);
    },
    async stoppsZuTouren(ids) { return s.stopps.filter((x) => ids.includes(x.tour_id)); },
    async positionenZuStopps(ids) { return s.positionen.filter((p) => ids.includes(p.stopp_id)); },
    async artikel(auch = []) { return s.artikelListe.filter((a) => a.aktiv !== 0 || auch.includes(a.artikel_nr)); },
    async tourNachId(id) { return mitKennung(s.touren.find((t) => t.id === id)) || null; },
    async stoppNachId(id) { return s.stopps.find((x) => x.id === id) || null; },
    async ereignisStatus(uuid) { return s.ereignisse.find((e) => e.uuid === uuid)?.status || null; },
    async lsStand(geraetId) { return s.geraete.find((g) => g.id === geraetId).ls_stand; },
    async bucheEreignis({ ereignis, aenderungen = [] }) {
      const alt = s.ereignisse.find((e) => e.uuid === ereignis.uuid);
      if (alt?.status === 'ok') return 'doppelt';
      const beleg = aenderungen.find((a) => a.art === 'beleg');
      if (beleg && s.belege.some((b) => b.lsNummer === beleg.beleg.lsNummer)) {
        throw new FahrerFehler(409, 'ls_doppelt', 'LS-Nummer ist schon zu einem anderen Ereignis gebucht');
      }
      const id = alt ? alt.id : s.ereignisse.length + 1;
      if (alt) Object.assign(alt, ereignis); else s.ereignisse.push({ id, ...ereignis });
      for (const a of aenderungen) {
        if (a.art === 'tourStart') {
          const t = s.touren.find((x) => x.id === a.tourId);
          if (t.status === 'freigegeben') Object.assign(t, { status: 'unterwegs', geraet_id: a.geraetId, gestartet_am: a.zeit });
        } else if (a.art === 'tourEnde') {
          const t = s.touren.find((x) => x.id === a.tourId);
          if (t.status === 'unterwegs') Object.assign(t, { status: 'beendet', beendet_durch: 'fahrer' });
        } else if (a.art === 'stoppStatus') {
          const x = s.stopps.find((y) => y.id === a.stoppId);
          if (a.nurAus.includes(x.status)) x.status = a.status;
        } else if (a.art === 'beleg') {
          s.belege.push({ ...a.beleg, ereignisId: id });
          s.belegPositionen.push(...a.positionen.map((p) => ({ ...p, lsNummer: a.beleg.lsNummer })));
        } else if (a.art === 'lsStand') {
          const g = s.geraete.find((y) => y.id === a.geraetId);
          g.ls_stand = Math.max(g.ls_stand, a.stand);
        }
      }
      return 'neu';
    },
  });
}

// ── Testdaten ────────────────────────────────────────────────────────────────
const SEPP = { geraetId: 1, geraetUid: 'u1', kennung: 'T1', rolle: 'tablet', mitarbeiterId: 7, tagestokenId: 1 };
const SEPP_HANDY = { ...SEPP, geraetId: 2, kennung: 'HSEPP', rolle: 'notfall' };
const ANNA = { ...SEPP, mitarbeiterId: 8 };

function befuelle(s) {
  s.touren.push(
    { id: 1, datum: '2026-11-13', bezeichnung: 'Freitag Obing', employee_id: 7, fahrer_name: 'Sepp Huber', fahrzeug: 'RO-DR 101', status: 'freigegeben', version: 2, geraet_id: null, beendet_durch: null },
    { id: 2, datum: '2026-11-13', bezeichnung: 'Entwurf', employee_id: 7, status: 'entwurf', version: 1, geraet_id: null },
    { id: 3, datum: '2026-11-12', bezeichnung: 'Gestern', employee_id: 7, status: 'freigegeben', version: 1, geraet_id: null },
    { id: 4, datum: '2026-11-13', bezeichnung: 'Annas Tour', employee_id: 8, status: 'freigegeben', version: 1, geraet_id: null },
    { id: 5, datum: '2026-11-13', bezeichnung: 'Läuft auf Handy', employee_id: 7, status: 'unterwegs', version: 1, geraet_id: 2 },
  );
  s.stopps.push(
    { id: 11, tour_id: 1, reihenfolge: 1, auftrag_ref: 'B-1', kunde_nr: '10001', kunde_name: 'Schlosserei Huber', kunde_adresse: 'Gewerbestr. 4, Obing', hinweise: null, lieferzeit: 'vormittags', status: 'offen' },
    { id: 12, tour_id: 1, reihenfolge: 2, auftrag_ref: 'B-2', kunde_nr: '10002', kunde_name: 'Gasthof zur Post', kunde_adresse: 'Dorfplatz 1', hinweise: 'Hintereingang', lieferzeit: 'bis 11 Uhr', status: 'offen' },
    { id: 13, tour_id: 1, reihenfolge: 3, auftrag_ref: 'B-3', kunde_nr: '10001', kunde_name: 'Schlosserei Huber', kunde_adresse: 'Gewerbestr. 4, Obing', hinweise: null, lieferzeit: null, status: 'offen' },
    { id: 51, tour_id: 5, reihenfolge: 1, kunde_nr: '10003', kunde_name: 'Hof Gruber', status: 'offen' },
  );
  s.positionen.push(
    { id: 101, stopp_id: 11, artikel_nr: '7801200', soll_menge: '2.00' },
    { id: 102, stopp_id: 12, artikel_nr: 'T002', soll_menge: '1.00' },
  );
}

// ── Server ───────────────────────────────────────────────────────────────────
let uhrMs;
let store;
let server;
let basis;
const angemeldet = new Map([['sepp', SEPP], ['sepp-handy', SEPP_HANDY], ['anna', ANNA]]);

// Frische Daten je Test; der Router sieht über den Proxy immer den aktuellen Speicher.
beforeEach(() => {
  uhrMs = Date.UTC(2026, 10, 13, 5, 0, 0); // 13.11.2026, 06:00 in Bayern
  store = ramSpeicher();
  befuelle(store);
});

before(async () => {
  const app = express();
  app.use(express.json({ limit: '10mb' }));
  const requireFahrer = (req, res, next) => {
    const f = angemeldet.get(req.headers['x-test-fahrer']);
    if (!f) return res.status(401).json({ code: 'token_ungueltig' });
    req.fahrer = f;
    next();
  };
  const proxyStore = new Proxy({}, { get: (_, k) => (...a) => store[k](...a) });
  app.use('/api/fahrer', erstelleTourRouter({ store: proxyStore, requireFahrer, uhr: () => uhrMs }));
  await new Promise((r) => { server = app.listen(0, '127.0.0.1', r); });
  basis = `http://127.0.0.1:${server.address().port}/api/fahrer`;
});
after(() => server.close());

async function rufe(pfad, { fahrer = 'sepp', body } = {}) {
  const r = await fetch(basis + pfad, {
    method: body ? 'POST' : 'GET',
    headers: { 'content-type': 'application/json', 'x-test-fahrer': fahrer },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: r.status, daten: r.status === 204 ? null : await r.json() };
}

let lfd = 0;
const ev = (typ, nutzdaten = {}, { geraet = 'T1', id = crypto.randomUUID(), zeit = new Date(uhrMs).toISOString() } = {}) =>
  ({ id, lfd: ++lfd, typ, geraet, zeit, ...nutzdaten });

const beleg = (ls, nutzdaten = {}) => ev('beleg.erstellt', {
  ls_nummer: ls, tour_id: '1', stopp_id: '11', erstellt_am: new Date(uhrMs).toISOString(), unterzeichner: 'Huber',
  positionen: [{ artikelId: '7801200', bezeichnung: 'Propan 11 kg', soll: 2, geliefert: 2, leergut: 2 }],
  unterschrift_png: 'iVBORw0KGgo=', ...nutzdaten,
});

const senden = (ereignisse, fahrer) => rufe('/ereignisse', { fahrer, body: { ereignisse } });

// ── GET /heute ───────────────────────────────────────────────────────────────
test('heute: nur freigegebene/laufende Touren des Fahrers von heute, mit Stopps, Kunden und Artikeln', async () => {
  const { status, daten } = await rufe('/heute');
  assert.equal(status, 200);
  assert.equal(daten.datum, '2026-11-13');
  assert.deepEqual(daten.geraet, { kennung: 'T1', lsStand: 3 });
  assert.deepEqual(daten.touren.map((t) => t.id), ['1']);
  const t = daten.touren[0];
  assert.equal(t.version, '2');
  assert.equal(t.fahrzeug, 'RO-DR 101');
  assert.deepEqual(t.stopps.map((s) => s.id), ['11', '12', '13']);
  assert.deepEqual(t.stopps[0].positionen, [{ id: '101', artikelId: '7801200', sollMenge: 2 }]);
  assert.equal(t.stopps[1].kundeId, '10002');
  assert.deepEqual(daten.kunden.map((k) => k.id), ['10001', '10002'], 'Kunde nur einmal, auch bei zwei Stopps');
  assert.equal(daten.kunden[1].hinweise, 'Hintereingang');
  assert.deepEqual(daten.artikel[0], {
    id: '7801200', bezeichnung: 'Propan 11 kg', typ: 'F', aktiv: true, gasart: 'Propan', kategorie: 'propan', faktor: 11,
    druckText: 'UN 1965 · Klasse 2.1', unNr: '1965', gefahrklasse: '2.1', befoerderungskategorie: 2,
    fuellgewichtKg: null, inhaltL: null, preisNettoCent: 2926, mwstSatz: 19, pfandArtikelId: '2801200', kaufflascheArtikelId: null,
  });
  assert.equal(daten.artikel[1].faktor, null);
  assert.equal(daten.artikel[1].druckText, ''); // kein Gefahrgut-Eintrag → kein Druckzeilen-Text
  assert.equal(daten.artikel[1].preisNettoCent, null);
  assert.deepEqual(daten.andereGeraete, [{ tourId: '5', name: 'Läuft auf Handy', kennung: 'HSEPP' }]);
});

test('heute: Tour auf dem Notfall-Handy lädt nur das Handy', async () => {
  const { daten } = await rufe('/heute', { fahrer: 'sepp-handy' });
  assert.deepEqual(daten.touren.map((t) => t.id), ['1', '5']);
  assert.deepEqual(daten.andereGeraete, []);
});

test('heute: Tag wird in Bayern gerechnet (23:30 UTC = schon morgen)', async () => {
  assert.equal(tagInBerlin(Date.UTC(2026, 10, 12, 23, 30)), '2026-11-13');
  assert.equal(tagInBerlin(Date.UTC(2026, 6, 12, 22, 30)), '2026-07-13', 'Sommerzeit');
  uhrMs = Date.UTC(2026, 10, 12, 22, 30);
  const { daten } = await rufe('/heute');
  assert.equal(daten.datum, '2026-11-12');
  assert.deepEqual(daten.touren.map((t) => t.id), ['3']);
});

test('heute: ohne Anmeldung 401', async () => {
  const { status } = await rufe('/heute', { fahrer: 'niemand' });
  assert.equal(status, 401);
});

// ── POST /ereignisse ─────────────────────────────────────────────────────────
test('ereignisse: ganzer Tag – Start, nicht angetroffen, Beleg, Ende', async () => {
  const stapel = [
    ev('tour.gestartet', { tour_id: '1' }),
    ev('stopp.nicht_angetroffen', { tour_id: '1', stopp_id: '12' }),
    beleg('LS-T1-0004'),
    ev('tour.beendet', { tour_id: '1' }),
  ];
  const { status, daten } = await senden(stapel);
  assert.equal(status, 200);
  assert.deepEqual(daten.ergebnisse, stapel.map((e) => ({ id: e.id, status: 'ok' })));
  assert.equal(daten.lsStand, 4);

  const t = store.touren.find((x) => x.id === 1);
  assert.equal(t.status, 'beendet');
  assert.equal(t.geraet_id, 1);
  assert.equal(store.stopps.find((s) => s.id === 11).status, 'beliefert');
  assert.equal(store.stopps.find((s) => s.id === 12).status, 'nicht_angetroffen');
  assert.equal(store.belege.length, 1);
  assert.equal(store.belege[0].kundeNr, '10001');
  assert.equal(store.belege[0].unterschriftPng, 'iVBORw0KGgo=');
  assert.deepEqual(store.belegPositionen[0], { artikelNr: '7801200', bezeichnung: 'Propan 11 kg', soll: 2, geliefert: 2, leergut: 2, lsNummer: 'LS-T1-0004' });
  assert.equal(store.ereignisse.length, 4);
  assert.equal(JSON.parse(store.ereignisse[2].payload).ls_nummer, 'LS-T1-0004', 'Ereignis bleibt im Original erhalten');
});

test('ereignisse: Wiederholung desselben Stapels bucht nichts doppelt', async () => {
  const stapel = [ev('tour.gestartet', { tour_id: '1' }), beleg('LS-T1-0004')];
  await senden(stapel);
  const { daten } = await senden(stapel);
  assert.deepEqual(daten.ergebnisse.map((r) => r.status), ['doppelt', 'doppelt']);
  assert.equal(store.belege.length, 1);
  assert.equal(store.ereignisse.length, 2);
});

test('ereignisse: werden nach laufender Nummer verarbeitet, Antwort in Sende-Reihenfolge', async () => {
  const start = ev('tour.gestartet', { tour_id: '1' });
  const ende = ev('tour.beendet', { tour_id: '1' });
  const { daten } = await senden([ende, start]);
  assert.deepEqual(daten.ergebnisse, [{ id: ende.id, status: 'ok' }, { id: start.id, status: 'ok' }]);
  assert.equal(store.touren.find((x) => x.id === 1).status, 'beendet');
});

test('ereignisse: Beleg nach „Tour im Büro beenden“ wird angenommen und markiert', async () => {
  await senden([ev('tour.gestartet', { tour_id: '1' })]);
  Object.assign(store.touren.find((x) => x.id === 1), { status: 'beendet', beendet_durch: 'buero' });
  const b = beleg('LS-T1-0005');
  const e = ev('tour.beendet', { tour_id: '1' });
  const { daten } = await senden([b, e]);
  assert.deepEqual(daten.ergebnisse, [
    { id: b.id, status: 'ok', markierung: 'nach_buero_ende' },
    { id: e.id, status: 'ok', markierung: 'nach_buero_ende' },
  ]);
  assert.equal(store.belege[0].markierung, 'nach_buero_ende');
  assert.equal(store.stopps.find((s) => s.id === 11).status, 'beliefert');
});

test('ereignisse: altes Tablet nach Übergabe – Beleg markiert, neue Tour-Ereignisse abgelehnt', async () => {
  await senden([ev('tour.gestartet', { tour_id: '1' })]);
  store.touren.find((x) => x.id === 1).geraet_id = 2; // #544: Tour aufs Handy umgesetzt
  const b = beleg('LS-T1-0006');
  const n = ev('stopp.nicht_angetroffen', { tour_id: '1', stopp_id: '12' });
  const e = ev('tour.beendet', { tour_id: '1' });
  const { daten } = await senden([b, n, e]);
  assert.deepEqual(daten.ergebnisse[0], { id: b.id, status: 'ok', markierung: 'nach_uebergabe' });
  assert.equal(daten.ergebnisse[1].code, 'tour_auf_anderem_geraet');
  assert.equal(daten.ergebnisse[2].code, 'tour_auf_anderem_geraet');
  assert.equal(store.stopps.find((s) => s.id === 12).status, 'offen');
  assert.equal(store.touren.find((x) => x.id === 1).status, 'unterwegs');
});

test('ereignisse: Beleg bei stornierter Tour bleibt gültig, Stopp wird beliefert', async () => {
  Object.assign(store.touren.find((x) => x.id === 1), { status: 'storniert' });
  store.stopps.find((s) => s.id === 11).status = 'storniert';
  const b = beleg('LS-T1-0007');
  const { daten } = await senden([b]);
  assert.deepEqual(daten.ergebnisse, [{ id: b.id, status: 'ok', markierung: 'tour_storniert' }]);
  assert.equal(store.stopps.find((s) => s.id === 11).status, 'beliefert');
});

test('ereignisse: Beleg ohne Tour oder mit unbekannter Tour wird angenommen', async () => {
  const ohne = beleg('LS-T1-0008', { tour_id: null, stopp_id: null });
  const unbekannt = beleg('LS-T1-0009', { tour_id: '999' });
  const { daten } = await senden([ohne, unbekannt]);
  assert.deepEqual(daten.ergebnisse.map((r) => r.markierung), ['ohne_tour', 'tour_unbekannt']);
  assert.equal(store.belege.length, 2);
  assert.equal(daten.lsStand, 9);
});

test('ereignisse: nicht angetroffen ändert einen belieferten Stopp nicht', async () => {
  await senden([ev('tour.gestartet', { tour_id: '1' }), beleg('LS-T1-0004')]);
  const { daten } = await senden([ev('stopp.nicht_angetroffen', { tour_id: '1', stopp_id: '11' })]);
  assert.equal(daten.ergebnisse[0].status, 'ok');
  assert.equal(store.stopps.find((s) => s.id === 11).status, 'beliefert');
});

test('ereignisse: fachliche Ablehnungen werden gespeichert und blockieren den Rest nicht', async () => {
  const fremd = ev('tour.gestartet', { tour_id: '4' });
  const entwurf = ev('tour.gestartet', { tour_id: '2' });
  const typ = ev('tour.pausiert', { tour_id: '1' });
  const geraet = ev('tour.gestartet', { tour_id: '1' }, { geraet: 'T9' });
  const stopp = ev('stopp.nicht_angetroffen', { tour_id: '1', stopp_id: '51' });
  const ok = ev('tour.gestartet', { tour_id: '1' });
  const { daten } = await senden([fremd, entwurf, typ, geraet, stopp, ok]);
  assert.deepEqual(daten.ergebnisse.map((r) => r.code || r.status), ['fremde_tour', 'nicht_freigegeben', 'typ_unbekannt', 'falsches_geraet', 'stopp_unbekannt', 'ok']);
  assert.ok(daten.ergebnisse.slice(0, 5).every((r) => r.status === 'fehler' && r.meldung));
  assert.equal(store.ereignisse.filter((e) => e.status === 'fehler').length, 5, 'fürs Büro sichtbar');
  assert.equal(store.touren.find((x) => x.id === 1).status, 'unterwegs');
});

test('ereignisse: abgelehntes Ereignis wird bei erneutem Senden neu bewertet', async () => {
  const start = ev('tour.gestartet', { tour_id: '2' });
  let { daten } = await senden([start]);
  assert.equal(daten.ergebnisse[0].code, 'nicht_freigegeben');
  store.touren.find((x) => x.id === 2).status = 'freigegeben';
  ({ daten } = await senden([start]));
  assert.deepEqual(daten.ergebnisse, [{ id: start.id, status: 'ok' }]);
  assert.equal(store.ereignisse.length, 1);
  assert.equal(store.ereignisse[0].status, 'ok');
});

test('ereignisse: Tour auf anderem Gerät kann nicht gestartet werden', async () => {
  const { daten } = await senden([ev('tour.gestartet', { tour_id: '5' })]);
  assert.equal(daten.ergebnisse[0].code, 'tour_auf_anderem_geraet');
});

test('ereignisse: LS-Nummer schon vergeben (andere UUID) → Fehler, Original bleibt gespeichert', async () => {
  await senden([beleg('LS-T1-0004')]);
  const zweiter = beleg('LS-T1-0004', { stopp_id: '13' });
  const { daten } = await senden([zweiter]);
  assert.equal(daten.ergebnisse[0].code, 'ls_doppelt');
  assert.equal(store.belege.length, 1);
  const gespeichert = store.ereignisse.find((e) => e.uuid === zweiter.id);
  assert.equal(gespeichert.status, 'fehler');
  assert.equal(JSON.parse(gespeichert.payload).unterschrift_png, 'iVBORw0KGgo=', 'Unterschrift geht nicht verloren');
});

test('ereignisse: Beleg mit fremder Kennung oder ohne Positionen wird abgelehnt', async () => {
  const fremd = beleg('LS-T2-0001');
  const leer = beleg('LS-T1-0010', { positionen: [] });
  const format = beleg('LS-T1-12');
  const { daten } = await senden([fremd, leer, format]);
  assert.deepEqual(daten.ergebnisse.map((r) => r.code), ['ls_fremde_kennung', 'ungueltig', 'ls_ungueltig']);
  assert.equal(store.belege.length, 0);
});

test('ereignisse: ohne UUID nur gemeldet, nicht gespeichert; falsches Format 400; ohne Anmeldung 401', async () => {
  const { daten } = await senden([{ typ: 'tour.gestartet', tour_id: '1' }, { id: 'abc' }]);
  assert.deepEqual(daten.ergebnisse.map((r) => r.code), ['ungueltig', 'ungueltig']);
  assert.equal(store.ereignisse.length, 0);
  assert.equal((await rufe('/ereignisse', { body: { foo: 1 } })).status, 400);
  assert.equal((await rufe('/ereignisse', { fahrer: 'niemand', body: { ereignisse: [] } })).status, 401);
});

test('heute: inaktive Artikel kommen nur mit, wenn eine Tourposition sie noch braucht (#552)', async () => {
  const s = store;
  s.artikelListe.push(
    { artikel_nr: 'ALT1', bezeichnung: 'Ausgelaufen, in Tour', aktiv: 0 },
    { artikel_nr: 'ALT2', bezeichnung: 'Ausgelaufen, nirgends', aktiv: 0 },
  );
  s.positionen.push({ id: 199, stopp_id: 11, artikel_nr: 'ALT1', soll_menge: '1.00' });
  const { daten } = await rufe('/heute');
  const ids = daten.artikel.map((a) => a.id);
  assert.ok(ids.includes('ALT1'));
  assert.ok(!ids.includes('ALT2'));
  assert.equal(daten.artikel.find((a) => a.id === 'ALT1').aktiv, false);
});
