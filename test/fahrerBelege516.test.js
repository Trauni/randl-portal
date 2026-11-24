/**
 * #516 Belege im Büro und Sammelmail Lagerverkauf – ohne Datenbank, ohne Shop, ohne Graph.
 */
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { PDFDocument } = require('pdf-lib');
const { berlinTagesbeginn, berlinTag, naechsterTag } = require('../src/services/fahrerBelege');
const { belegePdf, summen, pngGueltig } = require('../src/services/fahrerBelegPdf');
const { erstelleSammelmail, mailHtml } = require('../src/services/fahrerSammelmail');
const { erstelleBelegeRouter } = require('../src/routes/api/fahrer/belege');
const { erstelleLagerRouter } = require('../src/routes/api/fahrer/lager');

const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
const pos = (nr, p) => ({ ls_nummer: nr, artikel_nr: '7801200', bezeichnung: 'Propan 11 kg', soll: null, geliefert: 2, leergut: 2, preis_netto_cent: 2390, mwst_satz: '19.0', ...p });
const bv = (nr, zeit, x = {}) => ({ ls_nummer: nr, belegart: 'BV', geraet_kennung: 'L1', geraet_rolle: 'lager', verkaeufer: 'M. Huber', zahlart: 'bar', erstellt_am: new Date(zeit), storniert_am: null, kunde_nr: null, kunde_name: null, ...x });

test('Tagesgrenzen in deutscher Zeit, Winter und Sommer', () => {
  assert.equal(berlinTagesbeginn('2026-11-24').toISOString(), '2026-11-23T23:00:00.000Z');
  assert.equal(berlinTagesbeginn('2026-07-01').toISOString(), '2026-06-30T22:00:00.000Z');
  assert.equal(berlinTag(Date.UTC(2026, 10, 23, 23, 30)), '2026-11-24');
  assert.equal(naechsterTag('2026-12-31'), '2027-01-01');
});

test('PNG-Prüfung: gültiges Bild ja; beschädigte, abgeschnittene und fremde Daten nein (pdf-lib hinge sonst)', async () => {
  const gut = Buffer.from(PNG, 'base64');
  assert.equal(pngGueltig(gut), true);
  const kaputt = Buffer.from(gut); kaputt[40] ^= 0xff; // Bilddaten geändert, Prüfsumme passt nicht mehr
  assert.equal(pngGueltig(kaputt), false);
  assert.equal(pngGueltig(gut.subarray(0, gut.length - 10)), false);
  assert.equal(pngGueltig(Buffer.from('keinbild')), false);
  assert.equal(pngGueltig(null), false);
  // Ein PNG mit stimmigen Prüfsummen, aber zu wenig Bilddaten für die angegebene Größe (wie das, an dem pdf-lib hing)
  const falsch = 'iVBORw0KGgoAAAANSUhEUgAAAMgAAAAoCAYAAAC7HLUcAAAAg0lEQVR42u3TMQEAAAQAMBp/+DSI4WsKZBbBjSoBANgPQRAEQRAEQRAEQRAEQRAEQRAEQRAEQRAEQRAEQRAEQRAEQRAEQRAEQRAEQRAEQRAEQRAEQRAEQRAEQRAEQRAEQRAEQRAEQRAEQRAEQRAEQRAEQRAEQRAEQRAEQRAEQRB+agE6pABPJ7vHmAAAAABJRU5ErkJggg==';
  assert.equal(pngGueltig(Buffer.from(falsch, 'base64')), false);
  const pdf = await belegePdf({ titel: 'T', belege: [{ ...bv('LS-L1-0001', Date.UTC(2026, 10, 24, 9)), belegart: 'LS', unterzeichner: 'X', unterschrift_png: falsch, positionen: [pos('x')] }] });
  assert.ok(pdf.length > 500, 'PDF entsteht trotz kaputter Unterschrift, ohne zu hängen');
});

test('Summen wie in der App: MwSt. je Satz auf die Satzsumme gerundet', () => {
  const s = summen([pos('x'), pos('x', { artikel_nr: 'SCHL', geliefert: 1, leergut: 0, preis_netto_cent: 1250 }), pos('x', { geliefert: 0 })]);
  assert.deepEqual(s, { nettoCent: 6030, saetze: [{ satz: 19, nettoCent: 6030, mwstCent: 1146 }], mwstCent: 1146, bruttoCent: 7176 });
});

test('PDF: Umlaute, €, Unterschrift, fremde Zeichen und viele Belege über mehrere Seiten', async () => {
  const belege = Array.from({ length: 30 }, (_, i) => ({
    ...bv(`BV-L1-${String(i + 1).padStart(4, '0')}`, Date.UTC(2026, 10, 24, 9, i)),
    kundeName: i === 0 ? 'Gasthof „Zur Post“ ✓ Müller' : null,
    storniert_am: i === 1 ? new Date(Date.UTC(2026, 10, 24, 10)) : null, storno_grund: i === 1 ? 'falscher Artikel' : null,
    positionen: [pos('x'), pos('x', { artikel_nr: 'SCHL', bezeichnung: 'Gasschlauch 1,5 m – Überlänge', geliefert: 1, leergut: 0, preis_netto_cent: 1250 })],
  }));
  belege.push({ ...bv('LS-L1-0001', Date.UTC(2026, 10, 24, 11)), belegart: 'LS', zahlart: null, kunde_nr: '10511', kundeName: 'Landgasthof Seeblick', unterzeichner: 'A. Seeblick', unterschrift_png: PNG, positionen: [pos('x', { preis_netto_cent: null, mwst_satz: null })] });
  const pdf = await belegePdf({ titel: 'Lagerbelege 24.11.2026', belege });
  const doc = await PDFDocument.load(pdf);
  assert.ok(doc.getPageCount() >= 3, `mehrere Seiten, waren ${doc.getPageCount()}`);
  assert.ok(pdf.length > 3000);
  const leer = await belegePdf({ titel: 'Leer', belege: [] });
  assert.equal((await PDFDocument.load(leer)).getPageCount(), 1);
});

// ── Sammelmail ───────────────────────────────────────────────────────────────
function fakeEinstellungen(start = {}) {
  const w = { ...start };
  return { w, async lesen(k) { return w[k] ?? null; }, async setzen(k, v) { if (v == null) delete w[k]; else w[k] = v; } };
}
function fakeBelege(liste) {
  const aufrufe = [];
  return {
    aufrufe, berlinTagesbeginn, berlinTag, naechsterTag,
    async lagerTag(z) { aufrufe.push(z); return liste.filter((b) => (b.erstellt_am >= z.von && b.erstellt_am < z.bis) || (z.stornoSeit && b.erstellt_am < z.von && b.storniert_am && b.storniert_am >= z.stornoSeit)); },
    async positionenZu(nr) { return nr.map((n) => pos(n)); },
  };
}

test('Sammelmail: erst ab der Uhrzeit, nur wenn aktiv, einmal am Tag, mit PDF', async () => {
  const gesendet = [];
  let jetzt = Date.UTC(2026, 10, 24, 16, 30); // 17:30 in Seeon
  const e = fakeEinstellungen({ sammelmail: JSON.stringify({ an: ['buchhaltung@randl.example'], uhrzeit: '18:00', aktiv: false }) });
  const sm = erstelleSammelmail({
    belege: fakeBelege([bv('BV-L1-0001', Date.UTC(2026, 10, 24, 9)), bv('BV-L1-0002', Date.UTC(2026, 10, 24, 10), { kunde_nr: '10511' })]),
    einstellungen: e, senden: async (m) => { gesendet.push(m); return { gesendet: m.an }; },
    holeKundenstamm: async () => [{ id: '10511', name: 'Landgasthof Seeblick' }], uhr: () => jetzt,
  });
  assert.equal(await sm.pruefeZeitplan(), null, 'nicht aktiv');
  e.w.sammelmail = JSON.stringify({ an: ['buchhaltung@randl.example'], uhrzeit: '18:00', aktiv: true });
  assert.equal(await sm.pruefeZeitplan(), null, 'vor 18 Uhr');
  jetzt = Date.UTC(2026, 10, 24, 17, 1); // 18:01
  const r = await sm.pruefeZeitplan();
  assert.deepEqual(r, { gesendet: true, an: ['buchhaltung@randl.example'], anzahl: 2 });
  assert.equal(gesendet.length, 1);
  assert.match(gesendet[0].betreff, /^Lagerbelege 24\.11\.2026: 2 Belege, bar 113,76 €$/);
  assert.match(gesendet[0].html, /Landgasthof Seeblick/);
  assert.equal(gesendet[0].anhaenge[0].name, 'Lagerbelege-2026-11-24.pdf');
  assert.ok((await PDFDocument.load(Buffer.from(gesendet[0].anhaenge[0].base64, 'base64'))).getPageCount() >= 1);
  jetzt += 5 * 60 * 1000;
  assert.equal(await sm.pruefeZeitplan(), null, 'heute schon verschickt');
  assert.equal(gesendet.length, 1);
});

test('Sammelmail: ohne Belege kein Versand, Tag gilt als erledigt; Test-Versand geht trotzdem und zählt nicht', async () => {
  const gesendet = [];
  const e = fakeEinstellungen({ sammelmail: JSON.stringify({ an: ['a@b.de'], uhrzeit: '18:00', aktiv: true }) });
  const sm = erstelleSammelmail({ belege: fakeBelege([]), einstellungen: e, senden: async (m) => { gesendet.push(m); }, uhr: () => Date.UTC(2026, 10, 24, 18) });
  assert.equal((await sm.pruefeZeitplan()).grund, 'Keine Belege an diesem Tag');
  assert.equal(JSON.parse(e.w.sammelmail_letzte).uebersprungen, true);
  assert.equal(gesendet.length, 0);
  const t = await sm.versenden('2026-11-24', { manuell: true });
  assert.equal(t.gesendet, true);
  assert.match(gesendet[0].betreff, /^\[Test\] /);
  assert.equal(JSON.parse(e.w.sammelmail_letzte).uebersprungen, true, 'Test-Versand ändert den Tagesstand nicht');
});

test('Sammelmail: ein nach dem Versand stornierter Barverkauf kommt in die Mail des nächsten Tages', async () => {
  const gesendet = [];
  const spaet = bv('BV-L1-0007', Date.UTC(2026, 10, 24, 16), { storniert_am: new Date(Date.UTC(2026, 10, 24, 18)), storno_grund: 'Kunde zurück' });
  const e = fakeEinstellungen({
    sammelmail: JSON.stringify({ an: ['a@b.de'], uhrzeit: '18:00', aktiv: true }),
    sammelmail_letzte: JSON.stringify({ tag: '2026-11-24', zeit: new Date(Date.UTC(2026, 10, 24, 17, 1)).toISOString(), anzahl: 1 }),
  });
  const sm = erstelleSammelmail({ belege: fakeBelege([spaet, bv('BV-L1-0008', Date.UTC(2026, 10, 25, 9))]), einstellungen: e, senden: async (m) => { gesendet.push(m); }, uhr: () => Date.UTC(2026, 10, 25, 17, 5) });
  const r = await sm.pruefeZeitplan();
  assert.equal(r.anzahl, 2);
  assert.match(gesendet[0].html, /BV-L1-0007/);
  assert.match(gesendet[0].html, /nach dem letzten Versand storniert/);
});

test('Sammelmail: Fehler beim Versand wird gemerkt, nächster Versuch erst nach 30 Minuten', async () => {
  let jetzt = Date.UTC(2026, 10, 24, 17, 1);
  let versuche = 0;
  const e = fakeEinstellungen({ sammelmail: JSON.stringify({ an: ['a@b.de'], uhrzeit: '18:00', aktiv: true }) });
  const sm = erstelleSammelmail({ belege: fakeBelege([bv('BV-L1-0001', Date.UTC(2026, 10, 24, 9))]), einstellungen: e, senden: async () => { versuche++; throw new Error('Graph 503'); }, uhr: () => jetzt });
  await assert.rejects(sm.pruefeZeitplan(), /Graph 503/);
  jetzt += 10 * 60 * 1000;
  assert.equal(await sm.pruefeZeitplan(), null);
  jetzt += 25 * 60 * 1000;
  await assert.rejects(sm.pruefeZeitplan(), /Graph 503/);
  assert.equal(versuche, 2);
});

test('mailHtml: Summe nur über gültige Barverkäufe, Storno rot mit Grund', () => {
  const b1 = { ...bv('BV-L1-0001', Date.UTC(2026, 10, 24, 9)), amTag: true, positionen: [pos('x')] };
  const b2 = { ...bv('BV-L1-0002', Date.UTC(2026, 10, 24, 10)), amTag: true, storniert_am: new Date(Date.UTC(2026, 10, 24, 11)), storno_grund: 'Fehlgriff <b>', positionen: [pos('x')] };
  const html = mailHtml({ tag: '2026-11-24', belege: [b1, b2] });
  assert.match(html, /Barverkäufe:<\/b> 1 \(dazu 1 storniert\)/);
  assert.match(html, /bar eingenommen 56,88 €/);
  assert.match(html, /Fehlgriff &lt;b&gt;/);
});

// ── Büro-API ─────────────────────────────────────────────────────────────────
let server;
let basis;
const gesendet = [];
const einst = fakeEinstellungen();
before(async () => {
  const belegStore = {
    berlinTagesbeginn, berlinTag, naechsterTag,
    async liste(f) { return [{ ...bv('BV-L1-0001', Date.UTC(2026, 10, 24, 9)), kunde_nr: '10511', summe_brutto_cent: 5688, positionen: 1, menge: 2, leergut: 2, _f: f }]; },
    async geraete() { return [{ id: 3, kennung: 'L1', rolle: 'lager' }]; },
    async vorgaenge() { return [{ id: 9, typ: 'beleg.storniert', lfd: 4, status: 'fehler', fehler_code: 'storno_zu_spaet', geraet_kennung: 'L1', ls_nummer: 'BV-L1-0001', verkaeufer: 'null' }]; },
    async positionenZu(nr) { return nr.map((n) => pos(n)); },
    async detail(nr) { return nr === 'BV-L1-0001' ? { ...bv(nr, Date.UTC(2026, 10, 24, 9)), kunde_nr: '10511', positionen: [pos(nr)], ereignisse: [{ id: 1, typ: 'beleg.erstellt', status: 'ok', geraet_kennung: 'L1' }] } : null; },
    async lagerTag() { return []; },
    async zuordnung(f) { return [{ ...bv('LS-T1-0007', Date.UTC(2026, 10, 23, 9)), belegart: 'LS', kunde_nr: '10511', bestell_id: 'a1b2-uuid', auftrag_ref: null, menge: 3, leergut: 3, _f: f }]; },
  };
  const sammelmail = erstelleSammelmail({ belege: belegStore, einstellungen: einst, senden: async (m) => { gesendet.push(m); }, uhr: () => Date.UTC(2026, 10, 24, 12) });
  const app = express();
  app.use(express.json());
  app.use((req, res, next) => { req.session = { user: { id: 1, username: 'klaus' } }; next(); });
  app.use('/belege', erstelleBelegeRouter({ store: belegStore, holeKundenstamm: async () => [{ id: '10511', name: 'Landgasthof Seeblick' }], uhr: () => Date.UTC(2026, 10, 24, 12) }));
  app.use('/lager', erstelleLagerRouter({ store: einst, sammelmail, uhr: () => Date.UTC(2026, 10, 24, 12) }));
  await new Promise((r) => { server = app.listen(0, '127.0.0.1', r); });
  basis = `http://127.0.0.1:${server.address().port}`;
});
after(() => server.close());

async function rufe(pfad, { methode = 'GET', body } = {}) {
  const r = await fetch(basis + pfad, { method: methode, headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  const typ = r.headers.get('content-type') || '';
  return { status: r.status, typ, daten: typ.includes('json') ? await r.json() : Buffer.from(await r.arrayBuffer()) };
}

test('Belege-API: Liste mit Kundennamen aus dem Stamm, Zeitraum geprüft, Detail, PDF, Vorgänge', async () => {
  const l = await rufe('/belege?von=2026-11-20&bis=2026-11-24&art=BV&lager=1');
  assert.equal(l.status, 200);
  assert.equal(l.daten.belege[0].kunde, 'Landgasthof Seeblick');
  assert.equal(l.daten.belege[0].bruttoCent, 5688);
  assert.equal((await rufe('/belege?von=2026-11-24&bis=2026-11-20')).daten.code, 'zeitraum_ungueltig');
  assert.equal((await rufe('/belege?von=2026-01-01&bis=2026-11-24')).daten.code, 'zeitraum_zu_lang');
  const d = await rufe('/belege/BV-L1-0001');
  assert.equal(d.daten.summen.bruttoCent, 5688);
  assert.equal(d.daten.verlauf[0].typ, 'beleg.erstellt');
  assert.equal((await rufe('/belege/BV-L1-9999')).status, 404);
  const p = await rufe('/belege/BV-L1-0001/pdf');
  assert.equal(p.typ, 'application/pdf');
  assert.equal(p.daten.subarray(0, 4).toString(), '%PDF');
  const v = await rufe('/belege/vorgaenge');
  assert.equal(v.daten.vorgaenge[0].nummer, 'BV-L1-0001');
  assert.equal(v.daten.vorgaenge[0].verkaeufer, null);
});

test('Belege zu Kunde und Bestellung: Nummern als Liste, Bestellbezug im Beleg, ohne Filter 400', async () => {
  const k = await rufe('/belege/zu?kunde=10511,30011&bestellung=a1b2-uuid');
  assert.equal(k.status, 200);
  assert.deepEqual(k.daten.belege[0].bestellung, { id: 'a1b2-uuid', ref: null });
  assert.equal(k.daten.belege[0].kunde, 'Landgasthof Seeblick');
  assert.equal(k.daten.belege[0].menge, 3);
  assert.equal((await rufe('/belege/zu')).daten.code, 'filter_fehlt');
});

test('Lager-API: Versand einschalten nur mit Empfänger, Test-Versand, PDF-Vorschau', async () => {
  assert.equal((await rufe('/lager/sammelmail', { methode: 'PUT', body: { an: '', uhrzeit: '18:00', aktiv: true } })).daten.code, 'mail_fehlt');
  const ok = await rufe('/lager/sammelmail', { methode: 'PUT', body: { an: 'a@b.de', uhrzeit: '17:45', aktiv: true } });
  assert.deepEqual(ok.daten.sammelmail, { an: ['a@b.de'], uhrzeit: '17:45', aktiv: true, letzte: null, fehler: null });
  const t = await rufe('/lager/sammelmail/senden', { methode: 'POST', body: {} });
  assert.equal(t.daten.gesendet, true);
  assert.match(gesendet[0].betreff, /^\[Test\] Lagerbelege 24\.11\.2026/);
  const p = await rufe('/lager/sammelmail/pdf?tag=2026-11-24');
  assert.equal(p.typ, 'application/pdf');
  assert.equal((await rufe('/lager/sammelmail/pdf?tag=gestern')).daten.code, 'tag_ungueltig');
});
