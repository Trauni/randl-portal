/**
 * Fahrer-App (#541): Krypto-Bausteine ohne Datenbank.
 * Konzept #513 Abschnitt 3 (BookStack 290 „Mobile App“, Repo dr-ser-abloese docs/konzept-513-offline-login.md).
 *
 * - Kopplungscode: 8 Zeichen ohne verwechselbare Zeichen (0/O, 1/I).
 * - Access-Token: HS256-JWT, 15 Minuten, Schlüssel FAHRER_TOKEN_SECRET.
 * - Gerätesignatur: ECDSA P-256 mit SHA-256 (Android Keystore „SHA256withECDSA“, DER-Format),
 *   öffentlicher Schlüssel als SPKI in Base64.
 * - ID-Token von Authentik: RS256, Prüfung gegen die JWKS des Providers „Fahrer-App“.
 */
const crypto = require('crypto');

const CODE_ZEICHEN = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const KENNUNG_MUSTER = /^[A-Z0-9]{2,5}$/;
const ROLLEN = ['tablet', 'notfall', 'lager']; // lager = festes Tablet am Lager (#516)
const ACCESS_TOKEN_SEKUNDEN = 15 * 60;
const SIGNATUR_FENSTER_MS = 5 * 60 * 1000;

class FahrerFehler extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

const sha256 = (text) => crypto.createHash('sha256').update(String(text)).digest('hex');
const b64url = (buf) => Buffer.from(buf).toString('base64url');

function neuerKopplungscode() {
  let code = '';
  for (let i = 0; i < 8; i++) code += CODE_ZEICHEN[crypto.randomInt(CODE_ZEICHEN.length)];
  return code;
}

/** Eingabe tolerant: Kleinbuchstaben, Leerzeichen und Bindestrich („ABCD-EFGH“) sind erlaubt. */
function normalisiereKopplungscode(eingabe) {
  return String(eingabe || '').toUpperCase().replace(/[\s-]/g, '');
}

function neuesTagesToken() {
  return b64url(crypto.randomBytes(32));
}

function normalisiereKennung(kennung) {
  const k = String(kennung || '').trim().toUpperCase();
  if (!KENNUNG_MUSTER.test(k)) throw new FahrerFehler(400, 'kennung_ungueltig', 'Gerätekennung: 2–5 Zeichen, nur A–Z und 0–9');
  return k;
}

function pruefeRolle(rolle) {
  if (!ROLLEN.includes(rolle)) throw new FahrerFehler(400, 'rolle_ungueltig', 'Rolle muss tablet, notfall oder lager sein');
  return rolle;
}

// ── Access-Token (HS256) ─────────────────────────────────────────────────────

function signiereAccessToken(nutzlast, geheimnis, jetztMs) {
  const iat = Math.floor(jetztMs / 1000);
  const kopf = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const rumpf = b64url(JSON.stringify({ ...nutzlast, typ: 'fahrer', iat, exp: iat + ACCESS_TOKEN_SEKUNDEN }));
  const sig = crypto.createHmac('sha256', geheimnis).update(`${kopf}.${rumpf}`).digest('base64url');
  return { token: `${kopf}.${rumpf}.${sig}`, laeuftAb: new Date((iat + ACCESS_TOKEN_SEKUNDEN) * 1000) };
}

/** Liefert die Nutzlast oder null (falsche Signatur, abgelaufen, kein Fahrer-Token). */
function pruefeAccessToken(token, geheimnis, jetztMs) {
  const teile = String(token || '').split('.');
  if (teile.length !== 3) return null;
  const [kopf, rumpf, sig] = teile;
  const erwartet = crypto.createHmac('sha256', geheimnis).update(`${kopf}.${rumpf}`).digest();
  let erhalten;
  try { erhalten = Buffer.from(sig, 'base64url'); } catch { return null; }
  if (erhalten.length !== erwartet.length || !crypto.timingSafeEqual(erhalten, erwartet)) return null;
  let daten;
  try {
    const k = JSON.parse(Buffer.from(kopf, 'base64url').toString());
    if (k.alg !== 'HS256') return null;
    daten = JSON.parse(Buffer.from(rumpf, 'base64url').toString());
  } catch { return null; }
  if (daten.typ !== 'fahrer' || typeof daten.exp !== 'number' || daten.exp * 1000 <= jetztMs) return null;
  return daten;
}

// ── Gerätesignatur (ECDSA P-256) ─────────────────────────────────────────────

function oeffentlicherSchluessel(spkiBase64) {
  let schluessel;
  try {
    schluessel = crypto.createPublicKey({ key: Buffer.from(String(spkiBase64 || ''), 'base64'), format: 'der', type: 'spki' });
  } catch {
    throw new FahrerFehler(400, 'schluessel_ungueltig', 'Öffentlicher Schlüssel ist kein gültiger SPKI-Schlüssel');
  }
  if (schluessel.asymmetricKeyType !== 'ec' || schluessel.asymmetricKeyDetails?.namedCurve !== 'prime256v1') {
    throw new FahrerFehler(400, 'schluessel_ungueltig', 'Erwartet wird ein EC-Schlüssel P-256');
  }
  return schluessel;
}

function pruefeSignatur(spkiBase64, nachricht, signaturBase64) {
  if (!signaturBase64) return false;
  try {
    return crypto.verify('sha256', Buffer.from(nachricht), oeffentlicherSchluessel(spkiBase64), Buffer.from(String(signaturBase64), 'base64'));
  } catch {
    return false;
  }
}

/**
 * Zeitstempel der App (Millisekunden) muss im Fenster ±5 min liegen und größer sein als der zuletzt
 * angenommene, damit eine mitgeschnittene Anfrage nicht ein zweites Mal funktioniert.
 */
function pruefeZeitstempel(zeitstempel, letzterMs, jetztMs) {
  const ts = Number(zeitstempel);
  if (!Number.isSafeInteger(ts) || Math.abs(ts - jetztMs) > SIGNATUR_FENSTER_MS) {
    throw new FahrerFehler(400, 'uhrzeit', 'Uhrzeit des Geräts weicht mehr als 5 Minuten ab');
  }
  if (ts <= Number(letzterMs || 0)) throw new FahrerFehler(401, 'signatur_wiederholt', 'Signatur wurde schon verwendet');
  return ts;
}

/** Die Texte, die die App signiert. Felder mit „|“ getrennt, Hashes als Hex in Kleinbuchstaben. */
const signaturText = {
  koppeln: ({ code, zeitstempel }) => `koppeln|${code}|${zeitstempel}`,
  login: ({ geraetId, zeitstempel, idToken }) => `login|${geraetId}|${zeitstempel}|${sha256(idToken)}`,
  token: ({ geraetId, zeitstempel, tagesToken }) => `token|${geraetId}|${zeitstempel}|${sha256(tagesToken)}`,
};

// ── ID-Token von Authentik (RS256) ───────────────────────────────────────────

/**
 * Prüft das ID-Token. holeSchluessel(kid) liefert ein JWK (oder null). Gibt die Claims zurück.
 * Das Token muss frisch sein (iat höchstens 10 Minuten alt): Es wird direkt nach der Anmeldung eingetauscht.
 */
async function pruefeIdToken(idToken, { issuer, clientId, holeSchluessel, jetztMs }) {
  const ungueltig = (grund) => new FahrerFehler(401, 'id_token_ungueltig', `ID-Token ungültig: ${grund}`);
  const teile = String(idToken || '').split('.');
  if (teile.length !== 3) throw ungueltig('Format');
  let kopf, claims;
  try {
    kopf = JSON.parse(Buffer.from(teile[0], 'base64url').toString());
    claims = JSON.parse(Buffer.from(teile[1], 'base64url').toString());
  } catch { throw ungueltig('Format'); }
  if (kopf.alg !== 'RS256') throw ungueltig('Algorithmus');

  const jwk = await holeSchluessel(kopf.kid);
  if (!jwk) throw ungueltig('Schlüssel unbekannt');
  let schluessel;
  try { schluessel = crypto.createPublicKey({ key: jwk, format: 'jwk' }); } catch { throw ungueltig('Schlüssel'); }
  const ok = crypto.verify('sha256', Buffer.from(`${teile[0]}.${teile[1]}`), schluessel, Buffer.from(teile[2], 'base64url'));
  if (!ok) throw ungueltig('Signatur');

  const jetzt = Math.floor(jetztMs / 1000);
  const toleranz = 60;
  if (claims.iss !== issuer) throw ungueltig('Aussteller');
  const aud = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (!aud.includes(clientId)) throw ungueltig('Empfänger');
  if (aud.length > 1 && claims.azp !== clientId) throw ungueltig('azp');
  if (typeof claims.exp !== 'number' || claims.exp + toleranz < jetzt) throw ungueltig('abgelaufen');
  if (typeof claims.nbf === 'number' && claims.nbf - toleranz > jetzt) throw ungueltig('noch nicht gültig');
  if (typeof claims.iat !== 'number' || claims.iat < jetzt - 600 || claims.iat - toleranz > jetzt) throw ungueltig('nicht frisch');
  if (!claims.sub) throw ungueltig('sub fehlt');
  return claims;
}

module.exports = {
  FahrerFehler,
  ACCESS_TOKEN_SEKUNDEN,
  sha256,
  neuerKopplungscode,
  normalisiereKopplungscode,
  neuesTagesToken,
  normalisiereKennung,
  pruefeRolle,
  signiereAccessToken,
  pruefeAccessToken,
  oeffentlicherSchluessel,
  pruefeSignatur,
  pruefeZeitstempel,
  signaturText,
  pruefeIdToken,
};
