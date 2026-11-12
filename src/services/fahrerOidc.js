/**
 * Fahrer-App (#541): Schlüssel des Authentik-Providers „Fahrer-App“ (#539) für die ID-Token-Prüfung.
 * Discovery und JWKS werden eine Stunde gepuffert. Ein unbekannter kid löst einmal einen neuen Abruf aus
 * (Schlüsselwechsel in Authentik), höchstens alle 30 Sekunden.
 */
const ISSUER = process.env.FAHRER_OIDC_ISSUER || 'https://auth.randlweb.de/application/o/fahrer-app/';
const CLIENT_ID = process.env.FAHRER_OIDC_CLIENT_ID || 'fahrer-app';
const PUFFER_MS = 60 * 60 * 1000;
const MIN_ABSTAND_MS = 30 * 1000;

let puffer = { schluessel: [], geholt: 0 };

async function holeJson(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return res.json();
}

async function ladeSchluessel() {
  const discovery = await holeJson(`${ISSUER.replace(/\/?$/, '/')}.well-known/openid-configuration`);
  const jwks = await holeJson(discovery.jwks_uri);
  puffer = { schluessel: jwks.keys || [], geholt: Date.now() };
}

async function holeSchluessel(kid) {
  const finde = () => puffer.schluessel.find((k) => (kid ? k.kid === kid : true) && (!k.use || k.use === 'sig'));
  const alt = Date.now() - puffer.geholt;
  if (alt > PUFFER_MS || (!finde() && alt > MIN_ABSTAND_MS)) await ladeSchluessel();
  return finde() || null;
}

module.exports = { ISSUER, CLIENT_ID, holeSchluessel };
