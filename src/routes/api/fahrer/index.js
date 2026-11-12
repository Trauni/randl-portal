/**
 * Fahrer-App (#541): Kopplung, Login über Authentik, Geräte-Tokens. Konzept #513 Abschnitt 3 und 8.
 *
 *   POST /api/fahrer/geraet/koppeln  { code, publicKey, zeitstempel, signatur }
 *   POST /api/fahrer/login           { geraetId, idToken, zeitstempel, signatur }
 *   POST /api/fahrer/token           { geraetId, tagesToken, zeitstempel, signatur }
 *   POST /api/fahrer/logout          Bearer
 *   GET  /api/fahrer/ich             Bearer
 *
 * Signiert wird mit dem Geräteschlüssel (ECDSA P-256, SHA-256, DER, Base64) – Texte siehe
 * signaturText in services/fahrerKrypto.js. Keine Session: Die App schickt „Authorization: Bearer <Access-Token>“.
 * requireFahrer (unten) schützt auch die Routen aus #542.
 */
const express = require('express');
const k = require('../../../services/fahrerKrypto');
const { FahrerFehler } = k;

const TAGES_TOKEN_MS = 16 * 60 * 60 * 1000;
const KOPPLUNG_MS = 10 * 60 * 1000;

const geraetAntwort = (g) => ({ kennung: g.kennung, rolle: g.rolle, bezeichnung: g.bezeichnung || null, lsStand: Number(g.ls_stand) || 0 });

function fehlerAntwort(res, err) {
  return res.status(err.status).json({ error: err.message, code: err.code });
}

/** Express-Handler, der FahrerFehler als JSON beantwortet und alles andere an den Error-Handler gibt. */
const sicher = (fn) => async (req, res, next) => {
  try {
    await fn(req, res, next);
  } catch (err) {
    if (err instanceof FahrerFehler) return fehlerAntwort(res, err);
    next(err);
  }
};

/**
 * @param {object} deps
 * @param {object} deps.store        Datenzugriff (services/fahrerGeraete.js)
 * @param {() => string} deps.geheimnis  Schlüssel für Access-Tokens
 * @param {object} deps.oidc         { issuer, clientId, holeSchluessel }
 * @param {() => number} [deps.uhr]  Millisekunden, für Tests
 */
function erstelleFahrer({ store, geheimnis, oidc, uhr = Date.now }) {
  const holeGeheimnis = () => {
    const g = geheimnis();
    if (!g || g.length < 32) throw new FahrerFehler(503, 'nicht_eingerichtet', 'Fahrer-API ist nicht eingerichtet (FAHRER_TOKEN_SECRET fehlt)');
    return g;
  };

  async function gekoppeltesGeraet(geraetUid) {
    const g = await store.geraetNachUid(geraetUid);
    if (!g || !g.public_key) throw new FahrerFehler(401, 'geraet_unbekannt', 'Gerät ist nicht gekoppelt');
    if (g.gesperrt_am) throw new FahrerFehler(403, 'geraet_gesperrt', 'Gerät ist gesperrt');
    return g;
  }

  /** Zeitstempel + Signatur prüfen und den Zeitstempel verbrauchen. */
  async function pruefeGeraeteSignatur(g, zeitstempel, text, signatur, jetztMs) {
    const ts = k.pruefeZeitstempel(zeitstempel, g.letzte_signatur_ms, jetztMs);
    if (!k.pruefeSignatur(g.public_key, text, signatur)) throw new FahrerFehler(401, 'signatur_ungueltig', 'Gerätesignatur ungültig');
    if (!(await store.merkeSignatur(g.id, ts))) throw new FahrerFehler(401, 'signatur_wiederholt', 'Signatur wurde schon verwendet');
  }

  function accessToken(g, mitarbeiterId, tagestokenId, jetztMs) {
    const { token, laeuftAb } = k.signiereAccessToken({ g: g.id, m: mitarbeiterId, s: tagestokenId }, holeGeheimnis(), jetztMs);
    return { accessToken: token, accessTokenBis: laeuftAb.toISOString() };
  }

  /** Middleware: Bearer-Token prüfen, Anmeldung und Gerät nachschlagen. Setzt req.fahrer. */
  const requireFahrer = sicher(async (req, res, next) => {
    const jetztMs = uhr();
    const m = /^Bearer (.+)$/.exec(req.headers.authorization || '');
    const daten = m && k.pruefeAccessToken(m[1], holeGeheimnis(), jetztMs);
    if (!daten) throw new FahrerFehler(401, 'token_ungueltig', 'Access-Token fehlt, ist ungültig oder abgelaufen');
    const a = await store.anmeldungMitGeraet(daten.s);
    if (!a || a.geraet_id !== daten.g || a.employee_id !== daten.m || a.widerrufen_am || new Date(a.gueltig_bis).getTime() <= jetztMs) {
      throw new FahrerFehler(401, 'abgemeldet', 'Anmeldung ist beendet');
    }
    if (a.gesperrt_am) throw new FahrerFehler(403, 'geraet_gesperrt', 'Gerät ist gesperrt');
    req.fahrer = { geraetId: a.geraet_id, geraetUid: a.geraet_uid, kennung: a.kennung, rolle: a.rolle, mitarbeiterId: a.employee_id, tagestokenId: a.id };
    store.beruehre(a.geraet_id, new Date(jetztMs)).catch((err) => console.error('[Fahrer] zuletzt_gesehen:', err.message));
    next();
  });

  const router = express.Router();

  router.post('/geraet/koppeln', sicher(async (req, res) => {
    const jetztMs = uhr();
    const { publicKey, zeitstempel, signatur } = req.body || {};
    const code = k.normalisiereKopplungscode(req.body?.code);
    k.oeffentlicherSchluessel(publicKey);
    const ts = k.pruefeZeitstempel(zeitstempel, 0, jetztMs);
    if (!k.pruefeSignatur(publicKey, k.signaturText.koppeln({ code, zeitstempel: ts }), signatur)) {
      throw new FahrerFehler(401, 'signatur_ungueltig', 'Signatur passt nicht zum Schlüssel');
    }
    const g = await store.loeseKopplungscodeEin({ codeHash: k.sha256(code), publicKey, zeitstempelMs: ts, jetzt: new Date(jetztMs) });
    if (!g) throw new FahrerFehler(400, 'code_ungueltig', 'Kopplungscode unbekannt, schon benutzt oder abgelaufen');
    console.log(`[Fahrer] Gerät ${g.kennung} gekoppelt`);
    res.json({ geraetId: g.geraet_uid, ...geraetAntwort(g) });
  }));

  router.post('/login', sicher(async (req, res) => {
    const jetztMs = uhr();
    const { geraetId, idToken, zeitstempel, signatur } = req.body || {};
    const g = await gekoppeltesGeraet(geraetId);
    await pruefeGeraeteSignatur(g, zeitstempel, k.signaturText.login({ geraetId, zeitstempel: Number(zeitstempel), idToken }), signatur, jetztMs);

    const claims = await k.pruefeIdToken(idToken, { ...oidc, jetztMs });
    const m = await store.mitarbeiterNachUid(claims.sub);
    if (!m) throw new FahrerFehler(403, 'kein_mitarbeiter', 'Kein Mitarbeiterkonto im Portal. Einmal im Portal anmelden oder das Büro fragen.');
    if (m.status === 'inaktiv') throw new FahrerFehler(403, 'mitarbeiter_inaktiv', 'Mitarbeiterkonto ist inaktiv');
    if (g.rolle === 'notfall' && g.employee_id && g.employee_id !== m.id) {
      throw new FahrerFehler(403, 'falscher_fahrer', 'Dieses Notfall-Handy gehört einem anderen Fahrer');
    }

    const tagesToken = k.neuesTagesToken();
    const tagesTokenBis = new Date(jetztMs + TAGES_TOKEN_MS);
    const ttId = await store.legeTagestokenAn({ geraetId: g.id, employeeId: m.id, tokenHash: k.sha256(tagesToken), gueltigBis: tagesTokenBis, jetzt: new Date(jetztMs) });
    store.beruehre(g.id, new Date(jetztMs)).catch(() => {});
    console.log(`[Fahrer] Login ${m.username} auf ${g.kennung}`);
    res.json({
      ...accessToken(g, m.id, ttId, jetztMs),
      tagesToken,
      tagesTokenBis: tagesTokenBis.toISOString(),
      fahrer: { id: m.id, name: m.full_name || m.username },
      geraet: geraetAntwort(g),
    });
  }));

  router.post('/token', sicher(async (req, res) => {
    const jetztMs = uhr();
    const { geraetId, tagesToken, zeitstempel, signatur } = req.body || {};
    const g = await gekoppeltesGeraet(geraetId);
    await pruefeGeraeteSignatur(g, zeitstempel, k.signaturText.token({ geraetId, zeitstempel: Number(zeitstempel), tagesToken }), signatur, jetztMs);
    const t = await store.tagestokenNachHash(k.sha256(tagesToken || ''));
    if (!t || t.geraet_id !== g.id || t.widerrufen_am || new Date(t.gueltig_bis).getTime() <= jetztMs) {
      throw new FahrerFehler(401, 'tagestoken_ungueltig', 'Tages-Token ungültig oder abgelaufen, bitte neu anmelden');
    }
    res.json({ ...accessToken(g, t.employee_id, t.id, jetztMs), tagesTokenBis: new Date(t.gueltig_bis).toISOString() });
  }));

  router.post('/logout', requireFahrer, sicher(async (req, res) => {
    await store.widerrufeTagestoken(req.fahrer.tagestokenId, new Date(uhr()));
    res.status(204).end();
  }));

  router.get('/ich', requireFahrer, sicher(async (req, res) => {
    const [m, g] = await Promise.all([store.mitarbeiterNachId(req.fahrer.mitarbeiterId), store.geraetNachId(req.fahrer.geraetId)]);
    res.json({ fahrer: { id: m?.id, name: m?.full_name || m?.username }, geraet: { geraetId: g.geraet_uid, ...geraetAntwort(g) } });
  }));

  return { router, requireFahrer };
}

/** Büro: Kopplungscode erzeugen (Klartext nur in der Antwort, gespeichert wird der Hash). */
async function neuerKopplungscodeFuer(store, geraetId, jetztMs = Date.now()) {
  const code = k.neuerKopplungscode();
  const gueltigBis = new Date(jetztMs + KOPPLUNG_MS);
  await store.speichereKopplungscode(geraetId, k.sha256(code), gueltigBis);
  return { code, gueltigBis: gueltigBis.toISOString() };
}

module.exports = { erstelleFahrer, neuerKopplungscodeFuer, sicher, TAGES_TOKEN_MS, KOPPLUNG_MS };
