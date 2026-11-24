/**
 * #516 Lagerverkauf: Büro-API (Sonder-PIN, Sammelmail) und Kundenstamm aus der Shop-API – ohne Datenbank und ohne Shop.
 */
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const express = require('express');
const { erstelleLagerRouter, pinHash, empfaenger, PIN_RUNDEN } = require('../src/routes/api/fahrer/lager');
const { erstelleKundenstamm, kundeFuerApp } = require('../src/services/fahrerKundenstamm');
const { pinFuerApp } = require('../src/routes/api/fahrer/touren');

// ── Büro-API ─────────────────────────────────────────────────────────────────
const werte = {};
const store = {
  async lesen(k) { return werte[k] ?? null; },
  async setzen(k, w, von) { werte[k] = w; werte[`${k}.von`] = von; },
};
let server;
let basis;
before(async () => {
  const app = express();
  app.use(express.json());
  app.use((req, res, next) => { req.session = { user: { id: 1, username: 'klaus', name: 'Klaus Parzinger' } }; next(); });
  app.use('/api/fahrer-lager', erstelleLagerRouter({ store, uhr: () => Date.UTC(2026, 10, 24, 9, 0, 0) }));
  await new Promise((r) => { server = app.listen(0, '127.0.0.1', r); });
  basis = `http://127.0.0.1:${server.address().port}/api/fahrer-lager`;
});
after(() => server.close());

async function rufe(pfad, methode = 'GET', body) {
  const r = await fetch(basis + pfad, { method: methode, headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, daten: await r.json(), cache: r.headers.get('cache-control') };
}

test('Sonder-PIN: 5 Ziffern, nur einmal im Klartext, gespeichert nur als Hash, den die App nachrechnen kann', async () => {
  const vorher = (await rufe('/')).daten;
  assert.deepEqual(vorher.pin, { gesetzt: false, gesetztAm: null, gesetztVon: null });

  const { status, daten, cache } = await rufe('/pin', 'POST');
  assert.equal(status, 200);
  assert.match(daten.pin, /^\d{5}$/);
  assert.equal(cache, 'no-store');
  const gespeichert = JSON.parse(werte.storno_pin);
  assert.ok(!JSON.stringify(gespeichert).includes(`"${daten.pin}"`), 'PIN steht nicht im Klartext in der Einstellung');
  assert.equal(gespeichert.verfahren, 'pbkdf2-sha256');
  assert.equal(gespeichert.runden, PIN_RUNDEN);
  assert.equal(gespeichert.hash, pinHash(daten.pin, gespeichert.salz, gespeichert.runden));
  // Dieselbe Rechnung wie die App (WebCrypto PBKDF2, SHA-256, 256 Bit)
  const key = await crypto.webcrypto.subtle.importKey('raw', new TextEncoder().encode(daten.pin), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.webcrypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: Buffer.from(gespeichert.salz, 'hex'), iterations: gespeichert.runden }, key, 256);
  assert.equal(Buffer.from(bits).toString('hex'), gespeichert.hash);

  const nachher = (await rufe('/')).daten.pin;
  assert.deepEqual(nachher, { gesetzt: true, gesetztAm: '2026-11-24T09:00:00.000Z', gesetztVon: 'Klaus Parzinger' });
  assert.deepEqual(pinFuerApp(werte.storno_pin), { verfahren: 'pbkdf2-sha256', runden: PIN_RUNDEN, salz: gespeichert.salz, hash: gespeichert.hash });

  const zweite = (await rufe('/pin', 'POST')).daten;
  assert.notEqual(JSON.parse(werte.storno_pin).salz, gespeichert.salz, 'neue PIN, neues Salz');
  assert.match(zweite.pin, /^\d{5}$/);
});

test('Sammelmail: Empfänger prüfen, Uhrzeit HH:MM, Standard 18:00', async () => {
  assert.deepEqual((await rufe('/')).daten.sammelmail, { an: [], uhrzeit: '18:00', aktiv: false, letzte: null, fehler: null });
  const ok = await rufe('/sammelmail', 'PUT', { an: 'buchhaltung@randl.example; chef@randl.example\nbuchhaltung@randl.example', uhrzeit: '17:30' });
  assert.equal(ok.status, 200, JSON.stringify(ok.daten));
  assert.deepEqual(ok.daten.sammelmail, { an: ['buchhaltung@randl.example', 'chef@randl.example'], uhrzeit: '17:30', aktiv: false, letzte: null, fehler: null });
  assert.equal((await rufe('/sammelmail', 'PUT', { an: 'kein-at-zeichen', uhrzeit: '17:30' })).daten.code, 'mail_ungueltig');
  assert.equal((await rufe('/sammelmail', 'PUT', { an: [], uhrzeit: '25:00' })).daten.code, 'uhrzeit_ungueltig');
  assert.throws(() => empfaenger(['a@b.de', 'c@d.de', 'e@f.de', 'g@h.de', 'i@j.de', 'k@l.de']), /Höchstens 5/);
});

// ── Kundenstamm ──────────────────────────────────────────────────────────────
test('Kundenstamm: Lexware-Nummer vor SER-Nummer, Name wie in der Tourplanung, ohne Nummer kein Eintrag', () => {
  assert.deepEqual(kundeFuerApp({ customer_number: 123, lexware_customer_number: '10511', name: 'Landgasthof Seeblick', company_name: 'Seeblick GmbH', billing_street: 'Seestr. 2', billing_zip: '83370', billing_city: 'Seeon' }),
    { id: '10511', name: 'Landgasthof Seeblick', adresse: 'Seestr. 2, 83370 Seeon' });
  assert.deepEqual(kundeFuerApp({ customer_number: 77, first_name: 'Anna', last_name: 'Maier' }), { id: '77', name: 'Anna Maier', adresse: null });
  assert.equal(kundeFuerApp({ name: 'Ohne Nummer' }), null);
});

test('Kundenstamm: alle Seiten, ausgeblendete Kunden weg, sortiert, 10 Minuten zwischengespeichert', async () => {
  const alle = Array.from({ length: 1203 }, (_, i) => ({ id: i + 1, customer_number: 20000 + i, name: `Kunde ${String(1203 - i).padStart(4, '0')}` }));
  const abrufe = [];
  let jetzt = 0;
  const hole = erstelleKundenstamm({
    shopFetch: async (pfad) => {
      abrufe.push(pfad);
      const q = new URLSearchParams(pfad.split('?')[1]);
      const limit = Number(q.get('limit')), seite = Number(q.get('page'));
      return { ok: true, json: async () => ({ customers: alle.slice((seite - 1) * limit, seite * limit), total: alle.length }) };
    },
    ausgeblendet: async () => new Set([5, 6]),
    uhr: () => jetzt,
  });
  const k = await hole();
  assert.equal(k.length, 1201);
  assert.equal(abrufe.length, 3);
  assert.equal(k[0].name, 'Kunde 0001');
  assert.ok(!k.some((x) => x.id === '20004' || x.id === '20005'), 'ausgeblendete Kunden fehlen');

  jetzt += 5 * 60 * 1000;
  await hole();
  assert.equal(abrufe.length, 3, 'innerhalb von 10 Minuten aus dem Zwischenspeicher');
  jetzt += 6 * 60 * 1000;
  await hole();
  assert.equal(abrufe.length, 6, 'danach neu aus dem Shop');
});

test('Kundenstamm: Fehler der Shop-API wird gemeldet, nicht als leere Liste', async () => {
  const hole = erstelleKundenstamm({ shopFetch: async () => ({ ok: false, status: 502 }) });
  await assert.rejects(hole(), /Shop-API 502/);
});
