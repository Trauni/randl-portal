/** #514: Büro-API für Ladebasen – ohne Datenbank (Speicher im RAM, gleiche Schnittstelle wie services/fahrerLadebasen.js). */
const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { FahrerFehler } = require('../src/services/fahrerKrypto');
const { erstelleLadebasenRouter } = require('../src/routes/api/fahrer/ladebasen');

let basen;
let touren;
const ramStore = {
  async alle() { return [...basen].sort((a, b) => b.aktiv - a.aktiv || a.sortierung - b.sortierung); },
  async nachId(id) { return basen.find((b) => b.id === id) || null; },
  async legeAn({ name, adresse, sortierung }) {
    if (basen.some((b) => b.name === name)) throw new FahrerFehler(409, 'name_vergeben', 'doppelt');
    const b = { id: basen.length + 1, name, adresse, aktiv: 1, sortierung };
    basen.push(b);
    return b;
  },
  async aendere(id, w) { return Object.assign(basen.find((b) => b.id === id), { ...w, aktiv: w.aktiv ? 1 : 0 }); },
  async setzeFuerTour(tourId, ladebasisId) {
    const t = touren.find((x) => x.id === tourId);
    if (!t || ['beendet', 'storniert'].includes(t.status)) return false;
    Object.assign(t, { ladebasis_id: ladebasisId, version: t.version + 1 });
    return true;
  },
};

let server;
let basis;
beforeEach(() => {
  basen = [{ id: 1, name: 'Seeon', adresse: 'Grünweg 1, 83370 Seeon', aktiv: 1, sortierung: 40 }, { id: 2, name: 'Alt', adresse: null, aktiv: 0, sortierung: 5 }];
  touren = [{ id: 1, status: 'freigegeben', version: 1, ladebasis_id: null }, { id: 2, status: 'beendet', version: 1, ladebasis_id: null }];
});
before(async () => {
  const app = express();
  app.use(express.json());
  app.use('/api/fahrer-ladebasen', erstelleLadebasenRouter({ store: ramStore }));
  await new Promise((r) => { server = app.listen(0, '127.0.0.1', r); });
  basis = `http://127.0.0.1:${server.address().port}/api/fahrer-ladebasen`;
});
after(() => server.close());

const rufe = async (methode, pfad, body) => {
  const r = await fetch(basis + pfad, { method: methode, headers: { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: r.status, daten: await r.json() };
};

test('Liste: aktive zuerst, Adresse null wenn leer', async () => {
  const { daten } = await rufe('GET', '');
  assert.deepEqual(daten.map((b) => b.name), ['Seeon', 'Alt']);
  assert.equal(daten[1].adresse, null);
  assert.equal(daten[1].aktiv, false);
});

test('Anlegen: nur Name genügt, leerer Name und doppelter Name werden abgelehnt', async () => {
  const neu = await rufe('POST', '', { name: ' Obing ' });
  assert.equal(neu.status, 201);
  assert.deepEqual(neu.daten, { id: 3, name: 'Obing', adresse: null, aktiv: true, sortierung: 0 });
  assert.equal((await rufe('POST', '', { name: ' ' })).status, 400);
  assert.equal((await rufe('POST', '', { name: 'Seeon' })).status, 409);
});

test('Ändern und Deaktivieren: nur gesendete Felder ändern sich', async () => {
  const r = await rufe('PATCH', '/2', { adresse: 'Musterweg 1, 83000 Ort', aktiv: true });
  assert.equal(r.daten.adresse, 'Musterweg 1, 83000 Ort');
  assert.equal(r.daten.aktiv, true);
  assert.equal(r.daten.name, 'Alt');
  assert.equal((await rufe('PATCH', '/1', { aktiv: false })).daten.aktiv, false);
  assert.equal((await rufe('PATCH', '/99', { aktiv: false })).status, 404);
});

test('Tour zuordnen: erhöht die Version, null löst, inaktive Ladebasis und beendete Tour werden abgelehnt', async () => {
  assert.equal((await rufe('PUT', '/touren/1', { ladebasisId: 1 })).status, 200);
  assert.deepEqual(touren[0], { id: 1, status: 'freigegeben', version: 2, ladebasis_id: 1 });
  assert.equal((await rufe('PUT', '/touren/1', { ladebasisId: null })).status, 200);
  assert.equal(touren[0].ladebasis_id, null);
  assert.equal((await rufe('PUT', '/touren/1', { ladebasisId: 2 })).status, 400, 'deaktiviert');
  assert.equal((await rufe('PUT', '/touren/2', { ladebasisId: 1 })).status, 404, 'beendet');
  assert.equal((await rufe('PUT', '/touren/abc', { ladebasisId: 1 })).status, 400);
});
