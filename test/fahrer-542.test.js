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
    geraete: [{ id: 1, kennung: 'T1', ls_stand: 3, bv_stand: 0 }, { id: 2, kennung: 'HSEPP', ls_stand: 0, bv_stand: 0 },
      { id: 3, kennung: 'L1', ls_stand: 0, bv_stand: 0 }, { id: 4, kennung: 'L2', ls_stand: 0, bv_stand: 0 }],
    einstellungen: {},
    artikelListe: [
      { artikel_nr: '7801200', bezeichnung: 'Propan 11 kg', typ: 'F', aktiv: 1, gasart: 'Propan', kategorie: 'propan', kg_fuellung: '11.00',
        un_nr: '1965', gefahrklasse: '2.1', ggvs_faktor: 3, befoerderungskategorie: 2, preis_netto_cent: 2926, mwst_satz: '19.0', pfand_artikel_nr: '2801200' },
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
    async staende(geraetId) { const g = s.geraete.find((x) => x.id === geraetId); return { lsStand: g.ls_stand, bvStand: g.bv_stand }; },
    async belegNachNummer(nr) {
      const b = s.belege.find((x) => x.lsNummer === nr);
      return b ? { ls_nummer: b.lsNummer, belegart: b.belegart, geraet_id: b.geraetId, erstellt_am: b.erstelltAm, storniert_am: b.storniertAm || null } : null;
    },
    async einstellung(k) { return s.einstellungen[k] ?? null; },
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
        } else if (a.art === 'bvStand') {
          const g = s.geraete.find((y) => y.id === a.geraetId);
          g.bv_stand = Math.max(g.bv_stand, a.stand);
        } else if (a.art === 'storno') {
          const b = s.belege.find((y) => y.lsNummer === a.lsNummer && y.belegart === 'BV' && !y.storniertAm);
          if (b) Object.assign(b, { storniertAm: a.storniertAm, stornoGrund: a.grund, stornoVerkaeufer: a.verkaeufer, stornoEreignisId: id });
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
// Lager-Geräte (#516): kein Mitarbeiter, Rolle lager
const LAGER = { geraetId: 3, geraetUid: 'u3', kennung: 'L1', rolle: 'lager', mitarbeiterId: null, tagestokenId: 3 };
const LAGER2 = { ...LAGER, geraetId: 4, geraetUid: 'u4', kennung: 'L2', tagestokenId: 4 };
const KUNDENSTAMM = [{ id: '10511', name: 'Landgasthof Seeblick', adresse: 'Seestr. 2, 83370 Seeon' }, { id: '10234', name: 'Metallbau Obermaier', adresse: null }];

function befuelle(s) {
  s.touren.push(
    { id: 1, datum: '2026-11-13', bezeichnung: 'Freitag Obing', employee_id: 7, fahrer_name: 'Sepp Huber', fahrzeug: 'RO-DR 101', status: 'freigegeben', version: 2, geraet_id: null, beendet_durch: null, ladebasis_name: 'Seeon', ladebasis_adresse: 'Grünweg 1, 83370 Seeon' },
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
    { id: 103, stopp_id: 13, artikel_nr: '7801300', soll_menge: '0.00', soll_leergut: '2.00' },
  );
}

// ── Server ───────────────────────────────────────────────────────────────────
let uhrMs;
let store;
let server;
let basis;
const angemeldet = new Map([['sepp', SEPP], ['sepp-handy', SEPP_HANDY], ['anna', ANNA], ['lager', LAGER], ['lager2', LAGER2]]);

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
  app.use('/api/fahrer', erstelleTourRouter({ store: proxyStore, requireFahrer, holeKundenstamm: async () => KUNDENSTAMM, uhr: () => uhrMs }));
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
  assert.deepEqual(t.stopps[0].positionen, [{ id: '101', artikelId: '7801200', sollMenge: 2, sollLeergut: null }]);
  // #614: reine Leergut-Position kommt mit sollMenge 0 und der bestellten Leermenge
  assert.deepEqual(t.stopps.find((x) => x.id === '13').positionen, [{ id: '103', artikelId: '7801300', sollMenge: 0, sollLeergut: 2 }]);
  assert.equal(t.stopps[1].kundeId, '10002');
  assert.deepEqual(daten.kunden.map((k) => k.id), ['10001', '10002'], 'Kunde nur einmal, auch bei zwei Stopps');
  assert.equal(daten.kunden[1].hinweise, 'Hintereingang');
  assert.deepEqual(daten.artikel[0], {
    id: '7801200', bezeichnung: 'Propan 11 kg', typ: 'F', aktiv: true, gasart: 'Propan', kategorie: 'propan', faktor: 11,
    druckText: 'UN 1965 · Klasse 2.1', unNr: '1965', gefahrklasse: '2.1', ggvsFaktor: 3, befoerderungskategorie: 2,
    adrBezeichnung: null, fuellgewichtKg: null, fuellmenge: null, fuellmengeEinheit: null, inhaltL: null, preisNettoCent: 2926, mwstSatz: 19, pfandArtikelId: '2801200', kaufflascheArtikelId: null,
  });
  assert.equal(daten.artikel[1].faktor, null);
  assert.equal(daten.artikel[1].druckText, ''); // kein Gefahrgut-Eintrag → kein Druckzeilen-Text
  assert.equal(daten.artikel[1].preisNettoCent, null);
  assert.deepEqual(daten.andereGeraete, [{ tourId: '5', name: 'Läuft auf Handy', kennung: 'HSEPP' }]);
});

test('heute (#514): Ladebasis je Tour, null ohne Zuordnung, Adresse null solange sie fehlt', async () => {
  const mit = (await rufe('/heute')).daten.touren[0];
  assert.deepEqual(mit.ladebasis, { name: 'Seeon', adresse: 'Grünweg 1, 83370 Seeon' });

  const ohne = (await rufe('/heute', { fahrer: 'sepp-handy' })).daten.touren.find((t) => t.id === '5');
  assert.equal(ohne.ladebasis, null);

  Object.assign(store.touren[0], { ladebasis_name: 'Rimsting Tyczka', ladebasis_adresse: null });
  assert.deepEqual((await rufe('/heute')).daten.touren[0].ladebasis, { name: 'Rimsting Tyczka', adresse: null });
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
  assert.deepEqual(store.belegPositionen[0], { artikelNr: '7801200', bezeichnung: 'Propan 11 kg', soll: 2, geliefert: 2, leergut: 2, preisNettoCent: null, mwstSatz: null, lsNummer: 'LS-T1-0004' });
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

const zuladung = (nutzdaten = {}, opt) => ev('tour.zugeladen', {
  tour_id: '1', zugeladen_am: new Date(uhrMs).toISOString(), adr_punkte: 66,
  positionen: [{ artikelId: '7801200', bezeichnung: 'Propan 11 kg', zugeladen: 6, leergutAb: 4 }], ...nutzdaten,
}, opt);

test('zugeladen (#616): bei laufender Tour gebucht, Original bleibt, Tour und Stopps unverändert', async () => {
  await senden([ev('tour.gestartet', { tour_id: '1' })]);
  const vorher = JSON.stringify([store.touren, store.stopps]);
  const z = zuladung();
  const { daten } = await senden([z]);
  assert.deepEqual(daten.ergebnisse, [{ id: z.id, status: 'ok' }]);
  assert.equal(JSON.stringify([store.touren, store.stopps]), vorher);
  const gespeichert = store.ereignisse.find((e) => e.uuid === z.id);
  assert.equal(gespeichert.typ, 'tour.zugeladen');
  assert.equal(gespeichert.tourId, 1);
  assert.deepEqual(JSON.parse(gespeichert.payload), z, 'Ereignis bleibt im Original erhalten');
  assert.equal(store.belege.length, 0);
});

test('zugeladen (#616): gleiche UUID noch einmal ist doppelt', async () => {
  const z = zuladung();
  await senden([z]);
  const { daten } = await senden([z]);
  assert.deepEqual(daten.ergebnisse, [{ id: z.id, status: 'doppelt' }]);
  assert.equal(store.ereignisse.length, 1);
});

test('zugeladen (#616): fremde Tour und formale Fehler werden abgelehnt', async () => {
  const fremd = zuladung({ tour_id: '4' });
  const leer = zuladung({ positionen: [] });
  const ohne = zuladung({ positionen: undefined });
  const text = zuladung({ positionen: [{ artikelId: '7801200', bezeichnung: 'Propan 11 kg', zugeladen: 'viel', leergutAb: 0 }] });
  const negativ = zuladung({ positionen: [{ artikelId: '7801200', bezeichnung: 'Propan 11 kg', zugeladen: 0, leergutAb: -1 }] });
  const { daten } = await senden([fremd, leer, ohne, text, negativ]);
  assert.deepEqual(daten.ergebnisse.map((r) => r.code), ['fremde_tour', 'ungueltig', 'ungueltig', 'ungueltig', 'ungueltig']);
  assert.ok(daten.ergebnisse.every((r) => r.status === 'fehler'));
});

test('zugeladen (#616): nach Tour-Ende, Büro-Ende oder Übergabe angenommen und markiert', async () => {
  await senden([ev('tour.gestartet', { tour_id: '1' }), ev('tour.beendet', { tour_id: '1' })]);
  const nachEnde = zuladung();
  assert.deepEqual((await senden([nachEnde])).daten.ergebnisse, [{ id: nachEnde.id, status: 'ok' }]);

  store.touren.find((x) => x.id === 1).beendet_durch = 'buero';
  const nachBuero = zuladung();
  assert.deepEqual((await senden([nachBuero])).daten.ergebnisse, [{ id: nachBuero.id, status: 'ok', markierung: 'nach_buero_ende' }]);

  store.touren.find((x) => x.id === 1).geraet_id = 2;
  const nachUebergabe = zuladung();
  assert.deepEqual((await senden([nachUebergabe])).daten.ergebnisse, [{ id: nachUebergabe.id, status: 'ok', markierung: 'nach_uebergabe' }]);
  assert.equal(store.touren.find((x) => x.id === 1).status, 'beendet');
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

// ── Lagerverkauf (#516) ──────────────────────────────────────────────────────
const barverkauf = (nr, nutzdaten = {}) => ev('beleg.erstellt', {
  ls_nummer: nr, tour_id: null, stopp_id: null, erstellt_am: new Date(uhrMs).toISOString(), unterzeichner: null, belegart: 'BV',
  kunde_nr: null, verkaeufer: 'M. Huber', zahlart: 'bar',
  summen: { nettoCent: 6030, saetze: [{ satz: 19, nettoCent: 6030, mwstCent: 1146 }], mwstCent: 1146, bruttoCent: 7176 },
  positionen: [
    { artikelId: '7801200', bezeichnung: 'Propan 11 kg', soll: null, geliefert: 2, leergut: 2, preisNettoCent: 2390, mwstSatz: 19 },
    { artikelId: 'SCHL15', bezeichnung: 'Gasschlauch 1,5 m', soll: null, geliefert: 1, leergut: 0, preisNettoCent: 1250, mwstSatz: 19 },
  ],
  ...nutzdaten,
}, { geraet: 'L1' });
const storno = (nr, nutzdaten = {}, optionen = {}) => ev('beleg.storniert', {
  ls_nummer: nr, storniert_am: new Date(uhrMs).toISOString(), grund: 'Falscher Artikel erfasst', verkaeufer: 'M. Huber', ...nutzdaten,
}, { geraet: 'L1', ...optionen });

test('lager (#516): heute ohne Touren, mit ganzem Kundenstamm, Artikeln, BV-Stand und Sonder-PIN nur als Hash', async () => {
  store.einstellungen.storno_pin = JSON.stringify({ verfahren: 'pbkdf2-sha256', runden: 100000, salz: 'ab', hash: 'cd', gesetztAm: 'x', gesetztVon: 'Klaus' });
  const { status, daten } = await rufe('/heute', { fahrer: 'lager' });
  assert.equal(status, 200, JSON.stringify(daten));
  assert.deepEqual(daten.touren, []);
  assert.deepEqual(daten.geraet, { kennung: 'L1', lsStand: 0, bvStand: 0 });
  assert.deepEqual(daten.kunden.map((k) => k.id), ['10511', '10234']);
  assert.ok(daten.artikel.length > 0);
  assert.deepEqual(daten.stornoPin, { verfahren: 'pbkdf2-sha256', runden: 100000, salz: 'ab', hash: 'cd' }, 'nur Hash, nicht wer und wann');

  store.einstellungen = {};
  assert.equal((await rufe('/heute', { fahrer: 'lager' })).daten.stornoPin, null);
  assert.equal((await rufe('/heute')).daten.stornoPin, undefined, 'Tablet bekommt keine PIN');
});

test('lager (#516): Barverkauf mit Preisen, Verkäufer und Summen, BV-Stand steigt, LS-Stand bleibt', async () => {
  const { daten } = await senden([barverkauf('BV-L1-0001')], 'lager');
  assert.equal(daten.ergebnisse[0].status, 'ok', JSON.stringify(daten.ergebnisse[0]));
  assert.equal(daten.ergebnisse[0].markierung, 'ohne_tour');
  assert.equal(daten.bvStand, 1);
  assert.equal(daten.lsStand, 0);
  const b = store.belege[0];
  assert.equal(b.belegart, 'BV');
  assert.equal(b.employeeId, null);
  assert.equal(b.verkaeufer, 'M. Huber');
  assert.equal(b.zahlart, 'bar');
  assert.equal(b.summeNettoCent, 6030);
  assert.equal(b.summeBruttoCent, 7176);
  assert.equal(b.kundeNr, null);
  assert.deepEqual(store.belegPositionen.map((p) => [p.artikelNr, p.preisNettoCent, p.mwstSatz]), [['7801200', 2390, 19], ['SCHL15', 1250, 19]]);
  assert.equal(store.ereignisse[0].employeeId, null);
});

test('lager (#516): Lieferschein am Lager übernimmt die Kundennummer aus dem Ereignis', async () => {
  const ls = ev('beleg.erstellt', {
    ls_nummer: 'LS-L1-0001', tour_id: null, stopp_id: null, erstellt_am: new Date(uhrMs).toISOString(), unterzeichner: 'A. Seeblick',
    belegart: 'LS', kunde_nr: '10511', verkaeufer: 'M. Huber', zahlart: null, summen: null, unterschrift_png: 'iVBORw0KGgo=',
    positionen: [{ artikelId: '7801200', bezeichnung: 'Propan 11 kg', soll: null, geliefert: 1, leergut: 1 }],
  }, { geraet: 'L1' });
  const { daten } = await senden([ls], 'lager');
  assert.equal(daten.ergebnisse[0].status, 'ok', JSON.stringify(daten.ergebnisse[0]));
  assert.equal(daten.lsStand, 1);
  const b = store.belege[0];
  assert.deepEqual([b.belegart, b.kundeNr, b.verkaeufer, b.zahlart, b.summeBruttoCent], ['LS', '10511', 'M. Huber', null, null]);
});

test('lager (#516): Barverkauf nur vom Lager-Gerät; Tablet übernimmt keine kunde_nr aus dem Ereignis', async () => {
  const vomTablet = { ...barverkauf('BV-T1-0001'), geraet: 'T1' };
  const { daten } = await senden([vomTablet]);
  assert.equal(daten.ergebnisse[0].code, 'bv_nur_lager');

  const ohneTour = beleg('LS-T1-0004', { tour_id: null, stopp_id: null, kunde_nr: '99999', verkaeufer: 'X' });
  assert.equal((await senden([ohneTour])).daten.ergebnisse[0].status, 'ok');
  const b = store.belege.find((x) => x.lsNummer === 'LS-T1-0004');
  assert.deepEqual([b.kundeNr, b.verkaeufer], [null, null]);
});

test('lager (#516): Storno am selben Tag, nur einmal, Beleg bleibt bestehen', async () => {
  await senden([barverkauf('BV-L1-0001')], 'lager');
  uhrMs += 2 * 60 * 60 * 1000;
  const { daten } = await senden([storno('BV-L1-0001')], 'lager');
  assert.equal(daten.ergebnisse[0].status, 'ok', JSON.stringify(daten.ergebnisse[0]));
  const b = store.belege[0];
  assert.equal(b.stornoGrund, 'Falscher Artikel erfasst');
  assert.equal(b.stornoVerkaeufer, 'M. Huber');
  assert.ok(b.storniertAm instanceof Date);
  assert.equal(store.belege.length, 1, 'Barverkauf bleibt gespeichert');

  const nochmal = await senden([storno('BV-L1-0001')], 'lager');
  assert.equal(nochmal.daten.ergebnisse[0].code, 'schon_storniert');
});

test('lager (#516): Verkauf und Storno im selben Stapel werden der Reihe nach gebucht', async () => {
  const v = barverkauf('BV-L1-0002');
  const s = storno('BV-L1-0002');
  const { daten } = await senden([s, v], 'lager');
  assert.deepEqual(daten.ergebnisse.map((r) => r.status), ['ok', 'ok']);
  assert.ok(store.belege[0].storniertAm);
});

test('lager (#516): Storno abgelehnt – am nächsten Tag, fremdes Gerät, Lieferschein, unbekannt, ohne Grund, vom Tablet', async () => {
  await senden([barverkauf('BV-L1-0001')], 'lager');
  const morgen = storno('BV-L1-0001', { storniert_am: new Date(uhrMs + 24 * 60 * 60 * 1000).toISOString() });
  const fremd = storno('BV-L1-0001', {}, { geraet: 'L2' });
  const ls = storno('LS-L1-0001');
  const unbekannt = storno('BV-L1-0099');
  const ohneGrund = storno('BV-L1-0001', { grund: '  ' });
  const r1 = await senden([morgen, ls, unbekannt, ohneGrund], 'lager');
  assert.deepEqual(r1.daten.ergebnisse.map((r) => r.code), ['storno_zu_spaet', 'ls_ungueltig', 'beleg_unbekannt', 'ungueltig']);
  const r2 = await senden([fremd], 'lager2');
  assert.equal(r2.daten.ergebnisse[0].code, 'ls_fremde_kennung');
  const r3 = await senden([{ ...storno('BV-L1-0001'), geraet: 'T1' }]);
  assert.equal(r3.daten.ergebnisse[0].code, 'bv_nur_lager');
  assert.equal(store.belege[0].storniertAm, undefined);
});

test('lager (#516): Tagesgrenze in deutscher Zeit – 23:30 und 00:30 sind verschiedene Tage', async () => {
  uhrMs = Date.UTC(2026, 10, 13, 22, 30, 0); // 23:30 in Bayern
  await senden([barverkauf('BV-L1-0001')], 'lager');
  const nachMitternacht = storno('BV-L1-0001', { storniert_am: new Date(Date.UTC(2026, 10, 13, 23, 30, 0)).toISOString() });
  assert.equal((await senden([nachMitternacht], 'lager')).daten.ergebnisse[0].code, 'storno_zu_spaet');
});
