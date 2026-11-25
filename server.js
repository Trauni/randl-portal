require('dotenv').config({ override: true });
const express = require('express');
const session = require('express-session');
const MySQLStore = require('express-mysql-session')(session);
const helmet = require('helmet');
const morgan = require('morgan');
const path = require('path');
const { execSync } = require('child_process');

const authRoutes = require('./src/routes/auth');
const requireArea = require('./src/middleware/requireArea');
const vacationRoutes = require('./src/routes/api/vacation');
const notesRoutes = require('./src/routes/api/notes');
const profileRoutes = require('./src/routes/api/profile');
const dashboardRoutes = require('./src/routes/api/dashboard');
const itSystemRouter     = require('./src/routes/api/it/system');
const itCloudflareRouter = require('./src/routes/api/it/cloudflare');
const itSpamRouter       = require('./src/routes/api/it/spam');
const itDockerRouter     = require('./src/routes/api/it/docker');
const itShopwareRouter   = require('./src/routes/api/it/shopware');
const itLogsRouter     = require('./src/routes/api/it/logs');
const itCleanupRouter  = require('./src/routes/api/it/cleanup');
const itMaintenanceRouter = require('./src/routes/api/it/maintenance');
const financeOrdersRouter   = require('./src/routes/api/finance/orders');
const zeltverleihRouter      = require('./src/routes/api/zeltverleih');
const financeProductsRouter = require('./src/routes/api/finance/products');
const financeCustomersRouter = require('./src/routes/api/finance/customers');
const financeRhythmRouter = require('./src/routes/api/finance/delivery-rhythm');
const financeNewsRouter = require('./src/routes/api/finance/news');
const financeInfoMailRouter = require('./src/routes/api/finance/info-mail');
const financeWidmannRouter = require('./src/routes/api/finance/widmann-bestand');
const financeArticleContentRouter = require('./src/routes/api/finance/article-content');
const financePriceToolRouter = require('./src/routes/api/finance/price-tool');
const financeArtikelstammRouter = require('./src/routes/api/finance/artikelstamm');
const financeEkPreiseRouter = require('./src/routes/api/finance/ek-preise');
const financeArtikellisteRouter = require('./src/routes/api/finance/artikelliste');
const contentCmsRouter    = require('./src/routes/api/content/cms');
const contentBilderRouter  = require('./src/routes/api/content/bilder');
const contentGalerieRouter = require('./src/routes/api/content/galerie');
const contentHinweisRouter = require('./src/routes/api/content/hinweis');
const contentAktuellesRouter = require('./src/routes/api/content/aktuelles');
const shopImagesRouter     = require('./src/routes/api/content/shop-images');
const shopCmsRouter        = require('./src/routes/api/content/shop-cms');
const shopProductsRouter   = require('./src/routes/api/content/shop-products');
const hrEmployeesRouter    = require('./src/routes/api/hr/employees');
const { auswertung: hrZeitRouter, eigen: zeitEigenRouter } = require('./src/routes/api/hr/zeiterfassung');
const { router: hrRentmanRouter } = require('./src/routes/api/hr/rentman-sync');
const app = express();
const PORT = process.env.PORT || 3337;

// ── Security & Logging ───────────────────────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'"],
    }
  }
}));
app.use(morgan('combined'));
// #542: Belege samt Unterschrift (Base64-PNG) sprengen die 100 kB des Standard-Parsers. Muss vor express.json() stehen.
app.use('/api/fahrer/ereignisse', express.json({ limit: '10mb' }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Trust proxy (Nginx sitzt davor)
app.set('trust proxy', 1);

// ── Session Store (MariaDB) ──────────────────────────────────────────────────
const sessionStoreOptions = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT) || 3306,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  clearExpired: true,
  checkExpirationInterval: 900000,
  expiration: 7776000000, // 90 Tage
  createDatabaseTable: true,
  schema: {
    tableName: 'portal_sessions',
    columnNames: {
      session_id: 'session_id',
      expires: 'expires',
      data: 'data'
    }
  }
};

const sessionStore = new MySQLStore(sessionStoreOptions);

app.use(session({
  key: 'randlweb_portal_sid',
  secret: process.env.SESSION_SECRET || 'dev-secret-change-me',
  store: sessionStore,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 7776000000, // 90 Tage
    sameSite: 'none'
  }
}));

// Internes Portal: Crawler komplett aussperren (#234)
app.get('/robots.txt', (req, res) => {
  res.type('text/plain').send('User-agent: *\nDisallow: /\n');
});

// ── Static Files (vor Routes!) ─────────────────────────────────────────────
const distPath = path.join(__dirname, 'dist');
app.use(express.static(distPath));
// --- Mobile Bundle (PWA) ---------------------------------------------------
const distMobilePath = path.join(__dirname, 'dist-mobile');
app.use('/mobile', express.static(distMobilePath));
app.get('/mobile/*', (req, res) => {
  res.sendFile(path.join(distMobilePath, 'index.html'));
});

// ── Routes ───────────────────────────────────────────────────────────────────
app.use('/auth', authRoutes);
app.use('/api/vacation', requireArea('urlaub.eigen'), vacationRoutes);
app.use('/api/mitteilungen', requireArea('dashboard'), require('./src/routes/api/mitteilungen'));
app.use('/api/notes', requireArea('notizen'), notesRoutes);
app.use('/api/profile', requireArea('profil'), profileRoutes);
app.use('/api/dashboard', requireArea('dashboard'), dashboardRoutes);
app.use('/api/it/system',     requireArea('it'), itSystemRouter);
app.use('/api/it/cloudflare', requireArea('it'), itCloudflareRouter);
app.use('/api/it/spam',       requireArea('it'), itSpamRouter);
app.use('/api/it/docker',     requireArea('it'), itDockerRouter);
app.use('/api/it/shopware',   requireArea('it'), itShopwareRouter);
app.use('/api/it/logs',     requireArea('it'), itLogsRouter);
app.use('/api/it/cleanup',  requireArea('it'), itCleanupRouter);
app.use('/api/it/maintenance', requireArea('it'), itMaintenanceRouter);
app.use('/api/finance/orders',   requireArea('gashandel'), financeOrdersRouter);
app.use('/api/finance/products', requireArea('gashandel'), financeProductsRouter);
app.use('/api/finance/customers', requireArea('gashandel'), financeCustomersRouter);
app.use('/api/finance/delivery-rhythm', requireArea('gashandel'), financeRhythmRouter);
app.use('/api/finance/news', requireArea('gashandel'), financeNewsRouter);
app.use('/api/finance/info-mail', requireArea('gashandel'), financeInfoMailRouter);
app.use('/api/finance/widmann-bestand', requireArea('gashandel'), financeWidmannRouter);
app.use('/api/finance/article-content', requireArea('gashandel'), financeArticleContentRouter);
app.use('/api/finance/price-tool', requireArea('gashandel.preise'), financePriceToolRouter);
app.use('/api/finance/artikelstamm', requireArea('artikel.bearbeiten'), financeArtikelstammRouter);
app.use('/api/finance/artikelliste', requireArea('artikel.lesen'), financeArtikellisteRouter);
app.use('/api/finance/ek-preise', requireArea('artikel.einkauf'), financeEkPreiseRouter);
app.use('/api/content/cms',    requireArea('content'), contentCmsRouter);
app.use('/api/content/bilder', requireArea('content'), contentBilderRouter);
app.use('/api/content/galerie', requireArea('content'), contentGalerieRouter);
app.use('/api/content/hinweis', requireArea('content'), contentHinweisRouter);
app.use('/api/content/aktuelles', requireArea('content'), contentAktuellesRouter);
app.use('/api/shop-images',    requireArea('content'), shopImagesRouter);
app.use('/api/shop-cms',       requireArea('content'), shopCmsRouter);
app.use('/api/shop-products',  requireArea('content'), shopProductsRouter);
app.use('/api/hr/employees',   requireArea('hr.mitarbeiter'), hrEmployeesRouter);
// Gleitzeitkonto (#490): Einstellungen = Personalstammdaten, nur GF (BookStack 188)
app.use('/api/hr/gleitzeit/einstellungen', requireArea('hr.mitarbeiter'), require('./src/routes/api/hr/gleitzeit').einstellungen);
app.use('/api/hr/zeiterfassung', requireArea('hr.zeitauswertung'), hrZeitRouter);
app.use('/api/zeit',            requireArea('zeit.eigen'), zeitEigenRouter);
app.use('/api/hr/rentman',     requireArea('hr.mitarbeiter'), hrRentmanRouter);
// Muss VOR /api/zeltverleih stehen, sonst greift dort der Guard 'zeltplanung' (#461)
app.use('/api/zeltverleih/projekte', requireArea('zeltverleih.projekte'), require('./src/routes/api/zeltverleih/projekte'));
app.use('/api/zeltverleih',    requireArea('zeltplanung'), zeltverleihRouter);   // neu 14.08.2026 — Zeltplaner
app.use('/api/metallarbeiten/kunden', require('./src/routes/api/metallarbeiten/kunden'));   // neu 16.10.2026 — Metallkunden-Merker (#366)
app.use('/api/metallarbeiten/vorgaenge', require('./src/routes/api/metallarbeiten/vorgaenge'));   // neu 16.10.2026 — In Lexware anlegen (#365)
app.use('/api/metallarbeiten/zuordnen', require('./src/routes/api/metallarbeiten/zuordnen'));   // neu 16.10.2026 — Belege zuordnen (#370)
app.use('/api/metallarbeiten/eingang', require('./src/routes/api/metallarbeiten/eingang'));   // neu 17.10.2026 — Eingang Kundenanfragen (#371)
app.use('/api/metallarbeiten/dateien', require('./src/routes/api/metallarbeiten/dateien'));   // neu 17.10.2026 — Dateien pro Vorgang (#372)

// Fahrer-App (#541): eigene Geräte-Tokens statt Session. CORS nur für die WebView der App (Bearer, keine Cookies).
const fahrerStore = require('./src/services/fahrerGeraete');
const fahrerOidc = require('./src/services/fahrerOidc');
const fahrer = require('./src/routes/api/fahrer').erstelleFahrer({
  store: fahrerStore,
  geheimnis: () => process.env.FAHRER_TOKEN_SECRET,
  oidc: { issuer: fahrerOidc.ISSUER, clientId: fahrerOidc.CLIENT_ID, holeSchluessel: fahrerOidc.holeSchluessel },
});
app.use('/api/fahrer', require('cors')({ origin: ['https://localhost', 'capacitor://localhost'] }), fahrer.router);
app.locals.requireFahrer = fahrer.requireFahrer;
// #542: Tagesdaten und Ereignis-Eingang (Bearer wie oben). #516: Lager-Gerät bekommt den ganzen Kundenstamm aus dem Shop.
const holeKundenstamm = require('./src/services/fahrerKundenstamm').erstelleKundenstamm({
  shopFetch: (pfad) => require('./src/routes/api/finance/shopClient').shopFetch(pfad),
  ausgeblendet: async () => {
    const [rows] = await require('./src/db').getPool().execute('SELECT customer_id FROM customer_exclusions');
    return new Set(rows.map((r) => r.customer_id));
  },
});
app.use('/api/fahrer', require('cors')({ origin: ['https://localhost', 'capacitor://localhost'] }),
  require('./src/routes/api/fahrer/touren').erstelleTourRouter({ store: require('./src/services/fahrerTouren'), requireFahrer: fahrer.requireFahrer, holeKundenstamm }));
app.use('/api/fahrer-ladebasen', requireArea('fahrer.geraete'), require('./src/routes/api/fahrer/ladebasen').erstelleLadebasenRouter({ store: require('./src/services/fahrerLadebasen') }));
// #518: Tourplanung im Büro (Bestellungen kommen aus der Shop-API)
app.use('/api/fahrer-touren', requireArea('fahrer.geraete'), require('./src/routes/api/fahrer/planung').erstellePlanungRouter({
  store: require('./src/services/fahrerTourPlanung'),
  // Testphase (#518): erledigte, von SER akzeptierte Bestellungen bleiben für Touren wählbar. Abschalten mit TOUR_ERLEDIGTE_AKZEPTIERTE=0.
  erledigteAkzeptierte: process.env.TOUR_ERLEDIGTE_AKZEPTIERTE !== '0',
  holeBestellungen: async () => {
    const res = await require('./src/routes/api/finance/shopClient').shopFetch('/admin/webshop-orders?limit=500');
    if (!res.ok) throw new Error(`Shop-API ${res.status}`);
    return (await res.json()).orders || [];
  },
  holeKunde: async (id) => {
    const res = await require('./src/routes/api/finance/shopClient').shopFetch(`/admin/customers/${encodeURIComponent(id)}`);
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`Shop-API ${res.status}`);
    return res.json();
  },
  sucheKunden: async (q) => {
    const res = await require('./src/routes/api/finance/shopClient').shopFetch(`/admin/customers?limit=15&q=${encodeURIComponent(q)}`);
    if (!res.ok) throw new Error(`Shop-API ${res.status}`);
    return (await res.json()).customers || [];
  },
}));
app.use('/api/fahrer-geraete', requireArea('fahrer.geraete'), require('./src/routes/api/fahrer/geraete').erstelleGeraeteRouter({ store: fahrerStore }));
// #516: Lagerverkauf – Sonder-PIN fürs Storno und Sammelmail an die Buchhaltung (Versand über das admin-backend)
const fahrerSammelmail = require('./src/services/fahrerSammelmail');
const sammelmail = fahrerSammelmail.erstelleSammelmail({
  belege: require('./src/services/fahrerBelege'),
  einstellungen: require('./src/services/fahrerEinstellungen'),
  senden: fahrerSammelmail.sendenUeber((pfad, o) => require('./src/routes/api/finance/shopClient').shopFetch(pfad, o)),
  holeKundenstamm,
});
app.use('/api/fahrer-lager', requireArea('fahrer.geraete'), require('./src/routes/api/fahrer/lager').erstelleLagerRouter({ store: require('./src/services/fahrerEinstellungen'), sammelmail }));
// #516: Belege und Vorgänge der Fahrer-App im Büro
app.use('/api/fahrer-belege', requireArea('fahrer.geraete'), require('./src/routes/api/fahrer/belege').erstelleBelegeRouter({ store: require('./src/services/fahrerBelege'), holeKundenstamm }));


// Versionsanzeige (#334): einmal beim Start ermitteln
const APP_VERSION = require('./package.json').version;
const APP_COMMIT = (() => {
  if (process.env.APP_COMMIT) return process.env.APP_COMMIT;
  try {
    return execSync('git rev-parse --short HEAD', { cwd: __dirname, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim() || 'unknown';
  } catch { return 'unknown'; }
})();

// Health-Check (kein Auth required — nur Version, Commit, Laufzeit)
app.get('/api/health', (req, res) => {
  res.json({ version: APP_VERSION, commit: APP_COMMIT, uptime: Math.round(process.uptime()) });
});

// Session-Info für Frontend (kein Auth required — gibt nur zurück was vorhanden)
app.get('/api/me', (req, res) => {
  if (!req.session.user) {
    return res.json({ authenticated: false });
  }
  res.json({
    authenticated: true,
    user: {
      id: req.session.user.id,
      username: req.session.user.username,
      fullName: req.session.user.fullName,
      email: req.session.user.email,
      groups: req.session.user.groups || [],
      role: req.session.user.role,
      accessTags: req.session.user.accessTags || [],
      avatarInitials: req.session.user.avatarInitials
    }
  });
});


// SPA Catch-all — alle unbekannten Routes → index.html
app.get('*', (req, res, next) => {
  // API-Routen nicht durch SPA fangen
  if (req.path.startsWith('/api/') || req.path.startsWith('/auth/')) {
    return next();
  }
  res.sendFile(path.join(distPath, 'index.html'));
});

// ── Error Handler ─────────────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('[Error]', err.stack);
  res.status(err.status || 500).json({
    error: process.env.NODE_ENV === 'production' ? 'Interner Serverfehler' : err.message
  });
});

// ── Start ─────────────────────────────────────────────────────────────────────
app.listen(PORT, '127.0.0.1', () => {
  console.log(`✓ Randl Portal läuft auf Port ${PORT}`);
  console.log(`  Env: ${process.env.NODE_ENV}`);
  console.log(`  OIDC Issuer: ${process.env.OIDC_ISSUER}`);
});

// Metall-Sync (#363): Lexware-Belege der Metallkunden, nur mit METALL_SYNC_AKTIV=1
if (process.env.METALL_SYNC_AKTIV === '1') require('./src/services/metallSync').starteZeitplan();
// Urlaub: vorlaeufige Werte abschliessen (#491), abschaltbar mit URLAUB_NACHTJOB=0
require('./src/services/urlaub').starteZeitplan();
// Kundenmails Fertigung/neue Fotos (#377), nur mit METALL_KUNDENMAILS_AKTIV=1
require('./src/services/metallBenachrichtigung').starteZeitplan();
require('./src/services/bestellMitteilungen').starteZeitplan();
fahrerSammelmail.starteZeitplan(sammelmail); // #516: verschickt nur, wenn unter Einstellungen → Lagerverkauf eingeschaltet

// ── F29 Schritt 3: Interner Listener fuer Service-zu-Service-Aufrufe ─────────
// Komplett separate Express-Instanz, NUR die eine Route. Gebunden an die
// gas-net-Docker-Bridge-IP (172.19.0.1) statt 0.0.0.0 - von aussen nicht
// routbar, unabhaengig vom Haupt-Port 3336. Zusaetzlich Shared-Secret-Header,
// gleiches Muster wie SER_CALLBACK_SECRET (admin-backend/routes/ser.js).
const { pushCustomerToSer } = require('./src/services/ser-customer-push');
const internalApp = express();
internalApp.use(express.json());
internalApp.post('/internal/customers/:id/push-ser', async (req, res) => {
  const secret = req.headers['x-internal-ser-secret'];
  if (!process.env.INTERNAL_SER_PUSH_SECRET || secret !== process.env.INTERNAL_SER_PUSH_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  try {
    const result = await pushCustomerToSer(req.params.id, req.body);
    res.json({ success: true, ...result });
  } catch (err) {
    console.error('[Internal SER-Push] Fehler:', err.message);
    if (err.statusCode === 404 || err.statusCode === 400) {
      return res.status(err.statusCode).json({ error: err.message });
    }
    res.status(500).json({ error: 'SER Push fehlgeschlagen: ' + err.message });
  }
});
// Metall-Kundenbereich (#373): Vorgaenge, Belege, PDFs – eigenes Secret INTERNAL_METALL_SECRET
internalApp.use('/internal/metall', require('./src/routes/internal/metall'));
// Artikel-Kennzeichen "im Shop sichtbar" (#610): nur lesend, eigenes Secret INTERNAL_ARTIKEL_SECRET
internalApp.use('/internal/artikel', require('./src/routes/internal/artikel').erstelleArtikelRouter());
const INTERNAL_PORT = process.env.INTERNAL_PORT || 3338;
const INTERNAL_BIND_IP = process.env.INTERNAL_BIND_IP || '172.19.0.1';
internalApp.listen(INTERNAL_PORT, INTERNAL_BIND_IP, () => {
  console.log(`✓ Interner Listener (SER-Push, Metall) läuft auf ${INTERNAL_BIND_IP}:${INTERNAL_PORT}`);
});
