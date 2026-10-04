const express = require('express');
const { Issuer, generators } = require('openid-client');
const db = require('../db');
const { roleFromGroups, tagsFromGroups } = require('../utils/permissions');
const router = express.Router();

let oidcClient = null;

// OIDC Client lazy-init (beim ersten Request, damit Server schnell startet)
async function getOidcClient() {
  if (oidcClient) return oidcClient;

  try {
    const issuer = await Issuer.discover(process.env.OIDC_ISSUER);
    oidcClient = new issuer.Client({
      client_id: process.env.OIDC_CLIENT_ID,
      client_secret: process.env.OIDC_CLIENT_SECRET,
      redirect_uris: [process.env.OIDC_REDIRECT_URI],
      response_types: ['code'],
    });
    console.log('✓ OIDC Client initialisiert:', issuer.metadata.issuer);
    return oidcClient;
  } catch (err) {
    console.error('✗ OIDC Discover fehlgeschlagen:', err.message);
    throw err;
  }
}

// ── GET /auth/login ───────────────────────────────────────────────────────────
router.get('/login', async (req, res, next) => {
  try {
    const client = await getOidcClient();
    const state = generators.state();
    const nonce = generators.nonce();
    const codeVerifier = generators.codeVerifier();
    const codeChallenge = generators.codeChallenge(codeVerifier);

    // PKCE + State in Session speichern
    req.session.oidcState = state;
    req.session.oidcNonce = nonce;
    req.session.oidcCodeVerifier = codeVerifier;
    const redirectParam = req.query.redirect;
    const redirectTo = (typeof redirectParam === 'string' && redirectParam.startsWith('/') && !redirectParam.startsWith('//'))
      ? redirectParam
      : '/';
    req.session.postLoginRedirect = redirectTo;

    const authUrl = client.authorizationUrl({
      scope: 'openid profile email groups',
      state,
      nonce,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
    });

    req.session.save((err) => {
  if (err) console.error('Session save Fehler:', err);
  res.redirect(authUrl);
});;
  } catch (err) {
    next(err);
  }
});

// ── GET /auth/callback ────────────────────────────────────────────────────────
router.get('/callback', async (req, res, next) => {
  try {
    const client = await getOidcClient();
    const params = client.callbackParams(req);

    const tokenSet = await client.callback(
      process.env.OIDC_REDIRECT_URI,
      params,
      {
        state: req.session.oidcState,
        nonce: req.session.oidcNonce,
        code_verifier: req.session.oidcCodeVerifier,
      }
    );

    const claims = tokenSet.claims();

    // Gruppen aus Token (Authentik legt sie als 'groups' claim ab)
    const groups = claims.groups || [];

    // Alle bekannten Authentik-Gruppen dürfen einloggen; Berechtigungen per requireArea (server.js)
    const KNOWN_GROUPS = ['Geschäftsführung', 'Verwaltung','Backoffice', 'Gashandel', 'Metallarbeiten', 'Mitarbeiter', 'Zeltverleih', 'Freelancer'];
    const hasAccess = groups.some(g => KNOWN_GROUPS.includes(g));
    const role = roleFromGroups(groups);
    const accessTags = tagsFromGroups(groups);
    if (!hasAccess) {
      req.session.destroy();
      return res.redirect('/auth/unauthorized');
    }

    // Benutzer in DB upserten
    const authentikUid = claims.sub;
    const username = claims.preferred_username || claims.email;
    const fullName = claims.name || username;
    const email = claims.email || '';

    let employee;
    try {
      employee = await db.upsertEmployee({
        authentikUid,
        username,
        fullName,
        email,
        groups,
      });
    } catch (dbErr) {
      console.error('DB upsert fehlgeschlagen:', dbErr.message);
      // Trotzdem weitermachen — Session ohne DB-ID
    }

    // Initialen für Avatar berechnen
    const parts = fullName.split(' ');
    const avatarInitials = parts.length >= 2
      ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
      : fullName.substring(0, 2).toUpperCase();

    // Session befüllen
    req.session.user = {
      id: employee?.id || null,
      authentikUid,
      username,
      fullName,
      email,
      groups,
      role,
      accessTags,
      avatarInitials,
    };

    // OIDC-State aus Session aufräumen
    delete req.session.oidcState;
    delete req.session.oidcNonce;
    delete req.session.oidcCodeVerifier;

    const redirectTo = req.session.postLoginRedirect || '/';
    delete req.session.postLoginRedirect;
    res.redirect(redirectTo);
  } catch (err) {
    console.error('OIDC Callback Fehler:', err.message);
    next(err);
  }
});

// ── GET /auth/logout ──────────────────────────────────────────────────────────
router.get('/logout', async (req, res, next) => {
  try {
    const client = await getOidcClient();

    req.session.destroy((err) => {
      if (err) console.error('Session destroy Fehler:', err);
    });

    // Authentik End-Session Endpoint
    const logoutUrl = client.endSessionUrl({
      post_logout_redirect_uri: process.env.APP_URL || 'https://randlweb.de',
    });

    res.redirect(logoutUrl);
  } catch (err) {
    // Fallback falls OIDC nicht erreichbar
    req.session.destroy();
    res.redirect(process.env.APP_URL || '/');
  }
});

// ── GET /auth/unauthorized ────────────────────────────────────────────────────
router.get('/unauthorized', (req, res) => {
  res.status(403).send(`
    <!DOCTYPE html>
    <html lang="de">
    <head>
      <meta charset="UTF-8">
      <title>Kein Zugriff – Randl Portal</title>
      <style>
        body { background: #111214; color: #eceef2; font-family: DM Sans, sans-serif;
               display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }
        .box { text-align: center; max-width: 400px; }
        .logo { font-size: 2.5rem; color: #b8311f; margin-bottom: 1rem; }
        h1 { font-size: 1.25rem; margin-bottom: .5rem; }
        p { color: #8b909e; font-size: .875rem; }
        a { color: #b8311f; text-decoration: none; }
      </style>
    </head>
    <body>
      <div class="box">
        <div class="logo">ℛ</div>
        <h1>Kein Zugriff</h1>
        <p>Dein Account hat keine Berechtigung für das Mitarbeiterportal.<br>
           Wende dich an den Administrator.</p>
        <p style="margin-top:1.5rem"><a href="/auth/login">Erneut anmelden</a></p>
      </div>
    </body>
    </html>
  `);
});

module.exports = router;
