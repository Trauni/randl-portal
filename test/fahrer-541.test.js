/**
 * #541 Fahrer-App: Kopplung, Login, Token-Erneuerung, Sperre – ohne Datenbank (Speicher im RAM)
 * und ohne Authentik (eigener RSA-Schlüssel stellt ID-Tokens aus).
 */
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const express = require('express');
const k = require('../src/services/fahrerKrypto');
const { erstelleFahrer, neuerKopplungscodeFuer } = require('../src/routes/api/fahrer');

const ISSUER = 'https://auth.test/application/o/fahrer-app/';
const CLIENT_ID = 'fahrer-app';
const GEHEIMNIS = 'x'.repeat(40);

// ── Speicher im RAM, gleiche Schnittstelle wie services/fahrerGeraete.js ─────
function ramSpeicher() {
  const geraete = [];
  const codes = [];
  const tokens = [];
  const mitarbeiter = [
    { id: 7, authentik_uid: 'uid-sepp', username: 'sepp', full_name: 'Sepp Huber', status: 'aktiv' },
    { id: 8, authentik_uid: 'uid-anna', username: 'anna', full_name: 'Anna Maier', status: 'aktiv' },
    { id: 9, authentik_uid: 'uid-alt', username: 'alt', full_name: 'Alt', status: 'inaktiv' },
  ];
  return {
    geraete, tokens,
    async geraetNachUid(uid) { return geraete.find((g) => g.geraet_uid === uid) || null; },
    async geraetNachId(id) { return geraete.find((g) => g.id === id) || null; },
    async legeGeraetAn({ kennung, rolle, employeeId }) {
      const g = { id: geraete.length + 1, geraet_uid: crypto.randomUUID(), kennung, rolle, employee_id: employeeId || null, public_key: null, gesperrt_am: null, ls_stand: 0, letzte_signatur_ms: 0 };
      geraete.push(g);
      return g;
    },
    async speichereKopplungscode(geraetId, codeHash, gueltigBis) {
      for (let i = codes.length - 1; i >= 0; i--) if (codes[i].geraet_id === geraetId && !codes[i].benutzt_am) codes.splice(i, 1);
      codes.push({ geraet_id: geraetId, code_hash: codeHash, gueltig_bis: gueltigBis, benutzt_am: null });
    },
    async loeseKopplungscodeEin({ codeHash, publicKey, zeitstempelMs, jetzt }) {
      const c = codes.find((x) => x.code_hash === codeHash && !x.benutzt_am && x.gueltig_bis > jetzt);
      if (!c) return null;
      c.benutzt_am = jetzt;
      const g = geraete.find((x) => x.id === c.geraet_id);
      Object.assign(g, { public_key: publicKey, letzte_signatur_ms: zeitstempelMs });
      tokens.filter((t) => t.geraet_id === g.id).forEach((t) => { t.widerrufen_am ??= jetzt; });
      return g;
    },
    async merkeSignatur(geraetId, ts) {
      const g = geraete.find((x) => x.id === geraetId);
      if (g.letzte_signatur_ms >= ts) return false;
      g.letzte_signatur_ms = ts;
      return true;
    },
    async legeTagestokenAn({ geraetId, employeeId, tokenHash, gueltigBis, jetzt }) {
      tokens.filter((t) => t.geraet_id === geraetId).forEach((t) => { t.widerrufen_am ??= jetzt; });
      tokens.push({ id: tokens.length + 1, geraet_id: geraetId, employee_id: employeeId, token_hash: tokenHash, gueltig_bis: gueltigBis, widerrufen_am: null });
      return tokens.length;
    },
    async tagestokenNachHash(h) { return tokens.find((t) => t.token_hash === h) || null; },
    async anmeldungMitGeraet(id) {
      const t = tokens.find((x) => x.id === id);
      if (!t) return null;
      const g = geraete.find((x) => x.id === t.geraet_id);
      return { ...t, geraet_uid: g.geraet_uid, kennung: g.kennung, rolle: g.rolle, gesperrt_am: g.gesperrt_am };
    },
    async widerrufeTagestoken(id, jetzt) { const t = tokens.find((x) => x.id === id); t.widerrufen_am ??= jetzt; },
    async sperreGeraet(id, jetzt) {
      geraete.find((g) => g.id === id).gesperrt_am = jetzt;
      tokens.filter((t) => t.geraet_id === id).forEach((t) => { t.widerrufen_am ??= jetzt; });
    },
    async beruehre() {},
    async mitarbeiterNachUid(uid) { return mitarbeiter.find((m) => m.authentik_uid === uid) || null; },
    async mitarbeiterNachId(id) { return mitarbeiter.find((m) => m.id === id) || null; },
  };
}

// ── Authentik-Ersatz ─────────────────────────────────────────────────────────
const authentik = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwk = { ...authentik.publicKey.export({ format: 'jwk' }), kid: 'k1', use: 'sig', alg: 'RS256' };

function idToken(claims, { kid = 'k1', schluessel = authentik.privateKey } = {}) {
  const jetzt = Math.floor(uhrMs / 1000);
  const kopf = Buffer.from(JSON.stringify({ alg: 'RS256', kid, typ: 'JWT' })).toString('base64url');
  const rumpf = Buffer.from(JSON.stringify({ iss: ISSUER, aud: CLIENT_ID, iat: jetzt, exp: jetzt + 300, ...claims })).toString('base64url');
  const sig = crypto.sign('sha256', Buffer.from(`${kopf}.${rumpf}`), schluessel).toString('base64url');
  return `${kopf}.${rumpf}.${sig}`;
}

// ── Gerät (Android Keystore-Ersatz) ──────────────────────────────────────────
function neuesGeraet() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' });
  return {
    publicKey: publicKey.export({ format: 'der', type: 'spki' }).toString('base64'),
    signiere: (text) => crypto.sign('sha256', Buffer.from(text), privateKey).toString('base64'),
  };
}

// ── Server ───────────────────────────────────────────────────────────────────
let uhrMs = Date.UTC(2026, 10, 13, 5, 0, 0);
let store;
let server;
let basis;

before(async () => {
  store = ramSpeicher();
  const fahrer = erstelleFahrer({
    store,
    geheimnis: () => GEHEIMNIS,
    oidc: { issuer: ISSUER, clientId: CLIENT_ID, holeSchluessel: async (kid) => (kid === 'k1' ? jwk : null) },
    uhr: () => uhrMs,
  });
  const app = express();
  app.use(express.json());
  app.use('/api/fahrer', fahrer.router);
  app.get('/api/fahrer/geschuetzt', fahrer.requireFahrer, (req, res) => res.json(req.fahrer));
  await new Promise((r) => { server = app.listen(0, '127.0.0.1', r); });
  basis = `http://127.0.0.1:${server.address().port}/api/fahrer`;
});
after(() => server.close());

async function post(pfad, body, token) {
  const res = await fetch(basis + pfad, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body || {}),
  });
  return { status: res.status, body: res.status === 204 ? null : await res.json() };
}
async function get(pfad, token) {
  const res = await fetch(basis + pfad, { headers: token ? { authorization: `Bearer ${token}` } : {} });
  return { status: res.status, body: await res.json() };
}

let ts = uhrMs;
const naechsterTs = () => { ts = Math.max(ts + 1, uhrMs); return ts; };

async function koppeln(geraet, code) {
  const zeitstempel = naechsterTs();
  return post('/geraet/koppeln', { code, publicKey: geraet.publicKey, zeitstempel, signatur: geraet.signiere(k.signaturText.koppeln({ code: k.normalisiereKopplungscode(code), zeitstempel })) });
}
async function login(geraet, geraetId, token) {
  const zeitstempel = naechsterTs();
  return post('/login', { geraetId, idToken: token, zeitstempel, signatur: geraet.signiere(k.signaturText.login({ geraetId, zeitstempel, idToken: token })) });
}
async function erneuern(geraet, geraetId, tagesToken) {
  const zeitstempel = naechsterTs();
  return post('/token', { geraetId, tagesToken, zeitstempel, signatur: geraet.signiere(k.signaturText.token({ geraetId, zeitstempel, tagesToken })) });
}

// ── Tests ────────────────────────────────────────────────────────────────────

test('Kennung und Kopplungscode', () => {
  assert.equal(k.normalisiereKennung(' t1 '), 'T1');
  assert.throws(() => k.normalisiereKennung('T'), /2–5/);
  assert.throws(() => k.normalisiereKennung('T-1'), /2–5/);
  const code = k.neuerKopplungscode();
  assert.match(code, /^[A-HJ-NP-Z2-9]{8}$/);
  assert.equal(k.normalisiereKopplungscode('abcd-efgh'), 'ABCDEFGH');
});

test('Access-Token: gültig, manipuliert, abgelaufen', () => {
  const { token } = k.signiereAccessToken({ g: 1, m: 2, s: 3 }, GEHEIMNIS, 1_000_000);
  assert.equal(k.pruefeAccessToken(token, GEHEIMNIS, 1_000_000).m, 2);
  assert.equal(k.pruefeAccessToken(token, 'y'.repeat(40), 1_000_000), null);
  const [a, , c] = token.split('.');
  const fremd = Buffer.from(JSON.stringify({ g: 1, m: 99, s: 3, typ: 'fahrer', exp: 9e9 })).toString('base64url');
  assert.equal(k.pruefeAccessToken(`${a}.${fremd}.${c}`, GEHEIMNIS, 1_000_000), null);
  assert.equal(k.pruefeAccessToken(token, GEHEIMNIS, 1_000_000 + 15 * 60 * 1000), null);
});

test('Koppeln, Login, /ich, Erneuern, Abmelden', async () => {
  const geraet = neuesGeraet();
  const g = await store.legeGeraetAn({ kennung: 'T1', rolle: 'tablet' });
  g.ls_stand = 41;
  const { code } = await neuerKopplungscodeFuer(store, g.id, uhrMs);

  const falsch = neuesGeraet();
  const zeitstempel = naechsterTs();
  const fremdSigniert = await post('/geraet/koppeln', { code, publicKey: geraet.publicKey, zeitstempel, signatur: falsch.signiere(k.signaturText.koppeln({ code, zeitstempel })) });
  assert.equal(fremdSigniert.status, 401, 'Signatur muss zum mitgeschickten Schlüssel passen');

  const kopplung = await koppeln(geraet, code.slice(0, 4).toLowerCase() + '-' + code.slice(4));
  assert.equal(kopplung.status, 200, JSON.stringify(kopplung.body));
  assert.deepEqual({ ...kopplung.body, geraetId: undefined }, { geraetId: undefined, kennung: 'T1', rolle: 'tablet', bezeichnung: null, lsStand: 41, bvStand: 0 });
  const geraetId = kopplung.body.geraetId;
  assert.equal((await koppeln(neuesGeraet(), code)).status, 400, 'Code ist nur einmal gültig');

  const anmeldung = await login(geraet, geraetId, idToken({ sub: 'uid-sepp' }));
  assert.equal(anmeldung.status, 200, JSON.stringify(anmeldung.body));
  assert.equal(anmeldung.body.fahrer.name, 'Sepp Huber');
  const bis = new Date(anmeldung.body.tagesTokenBis).getTime() - uhrMs;
  assert.equal(bis, 16 * 60 * 60 * 1000);

  const ich = await get('/ich', anmeldung.body.accessToken);
  assert.equal(ich.status, 200);
  assert.equal(ich.body.geraet.kennung, 'T1');

  uhrMs += 20 * 60 * 1000; // Access-Token abgelaufen
  assert.equal((await get('/ich', anmeldung.body.accessToken)).status, 401);
  const neu = await erneuern(geraet, geraetId, anmeldung.body.tagesToken);
  assert.equal(neu.status, 200, JSON.stringify(neu.body));
  assert.equal((await get('/geschuetzt', neu.body.accessToken)).body.mitarbeiterId, 7);

  assert.equal((await post('/logout', {}, neu.body.accessToken)).status, 204);
  assert.equal((await get('/ich', neu.body.accessToken)).status, 401, 'nach Abmelden kein Zugriff');
  assert.equal((await erneuern(geraet, geraetId, anmeldung.body.tagesToken)).status, 401, 'Tages-Token ist widerrufen');
});

test('Login abgelehnt: fremder Schlüssel, Wiederholung, falsches ID-Token, fremder Fahrer, gesperrt', async () => {
  const geraet = neuesGeraet();
  const g = await store.legeGeraetAn({ kennung: 'HSEPP', rolle: 'notfall', employeeId: 7 });
  const { code } = await neuerKopplungscodeFuer(store, g.id, uhrMs);
  const geraetId = (await koppeln(geraet, code)).body.geraetId;

  assert.equal((await login(neuesGeraet(), geraetId, idToken({ sub: 'uid-sepp' }))).status, 401, 'fremder Geräteschlüssel');

  const zeitstempel = naechsterTs();
  const tok = idToken({ sub: 'uid-sepp' });
  const body = { geraetId, idToken: tok, zeitstempel, signatur: geraet.signiere(k.signaturText.login({ geraetId, zeitstempel, idToken: tok })) };
  assert.equal((await post('/login', body)).status, 200);
  assert.equal((await post('/login', body)).status, 401, 'gleiche Anfrage ein zweites Mal');

  const pruefe = async (token, status, code) => {
    const r = await login(geraet, geraetId, token);
    assert.equal(r.status, status, JSON.stringify(r.body));
    if (code) assert.equal(r.body.code, code);
  };
  await pruefe(idToken({ sub: 'uid-sepp', aud: 'portal' }), 401, 'id_token_ungueltig');
  await pruefe(idToken({ sub: 'uid-sepp', iss: 'https://fremd/' }), 401, 'id_token_ungueltig');
  await pruefe(idToken({ sub: 'uid-sepp', iat: Math.floor(uhrMs / 1000) - 3600 }), 401, 'id_token_ungueltig');
  await pruefe(idToken({ sub: 'uid-sepp' }, { schluessel: crypto.generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey }), 401, 'id_token_ungueltig');
  await pruefe(idToken({ sub: 'uid-unbekannt' }), 403, 'kein_mitarbeiter');
  await pruefe(idToken({ sub: 'uid-alt' }), 403, 'mitarbeiter_inaktiv');
  await pruefe(idToken({ sub: 'uid-anna' }), 403, 'falscher_fahrer');

  const ok = await login(geraet, geraetId, idToken({ sub: 'uid-sepp' }));
  await store.sperreGeraet(g.id, new Date(uhrMs));
  assert.equal((await get('/ich', ok.body.accessToken)).status, 401, 'Sperre beendet die Anmeldung sofort');
  await pruefe(idToken({ sub: 'uid-sepp' }), 403, 'geraet_gesperrt');
});

test('Zweiter Login auf demselben Tablet beendet den ersten', async () => {
  const geraet = neuesGeraet();
  const g = await store.legeGeraetAn({ kennung: 'T2', rolle: 'tablet' });
  const { code } = await neuerKopplungscodeFuer(store, g.id, uhrMs);
  const geraetId = (await koppeln(geraet, code)).body.geraetId;
  const sepp = await login(geraet, geraetId, idToken({ sub: 'uid-sepp' }));
  const anna = await login(geraet, geraetId, idToken({ sub: 'uid-anna' }));
  assert.equal((await get('/ich', sepp.body.accessToken)).status, 401);
  assert.equal((await get('/ich', anna.body.accessToken)).body.fahrer.name, 'Anna Maier');
});

test('Lager-Gerät (#516): Kopplung ist die Anmeldung, Dauer-Token ohne Mitarbeiter, kein Login, Sperre wirkt', async () => {
  const geraet = neuesGeraet();
  const g = await store.legeGeraetAn({ kennung: 'L1', rolle: 'lager' });
  const { code } = await neuerKopplungscodeFuer(store, g.id, uhrMs);
  const kopplung = await koppeln(geraet, code);
  assert.equal(kopplung.status, 200, JSON.stringify(kopplung.body));
  assert.equal(kopplung.body.rolle, 'lager');
  assert.ok(kopplung.body.accessToken && kopplung.body.tagesToken, 'Tokens kommen gleich mit der Kopplung');
  const jahre = (new Date(kopplung.body.tagesTokenBis).getTime() - uhrMs) / (365 * 24 * 60 * 60 * 1000);
  assert.ok(jahre > 4, 'Dauer-Token läuft nicht nach 16 Stunden ab');

  const ich = await get('/ich', kopplung.body.accessToken);
  assert.equal(ich.status, 200, JSON.stringify(ich.body));
  assert.equal(ich.body.fahrer, null);
  assert.equal(ich.body.geraet.rolle, 'lager');
  const req = (await get('/geschuetzt', kopplung.body.accessToken)).body;
  assert.equal(req.mitarbeiterId, null);
  assert.equal(req.rolle, 'lager');

  const anmeldung = await login(geraet, kopplung.body.geraetId, idToken({ sub: 'uid-sepp' }));
  assert.equal(anmeldung.status, 403);
  assert.equal(anmeldung.body.code, 'lager_ohne_login');

  uhrMs += 3 * 24 * 60 * 60 * 1000; // drei Tage später: Access-Token weg, Dauer-Token gilt noch
  const neu = await erneuern(geraet, kopplung.body.geraetId, kopplung.body.tagesToken);
  assert.equal(neu.status, 200, JSON.stringify(neu.body));
  assert.equal((await get('/geschuetzt', neu.body.accessToken)).body.mitarbeiterId, null);

  await store.sperreGeraet(g.id, new Date(uhrMs));
  assert.equal((await get('/ich', neu.body.accessToken)).status, 401, 'Sperre beendet den Dauerlogin');
  assert.equal((await erneuern(geraet, kopplung.body.geraetId, kopplung.body.tagesToken)).status, 403, 'gesperrtes Gerät bekommt kein neues Token');
});

test('Uhrzeit des Geräts mehr als 5 Minuten falsch', async () => {
  const geraet = neuesGeraet();
  const g = await store.legeGeraetAn({ kennung: 'T3', rolle: 'tablet' });
  const { code } = await neuerKopplungscodeFuer(store, g.id, uhrMs);
  const zeitstempel = uhrMs - 6 * 60 * 1000;
  const r = await post('/geraet/koppeln', { code, publicKey: geraet.publicKey, zeitstempel, signatur: geraet.signiere(k.signaturText.koppeln({ code, zeitstempel })) });
  assert.equal(r.status, 400);
  assert.equal(r.body.code, 'uhrzeit');
});
