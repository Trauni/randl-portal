const router = require('express').Router();
const multer = require('multer');
const { getPool } = require('../../../db');
const ek = require('../../../services/gasEkPreise');
const daten = require('../../../services/gasDaten');
const { parseKomplettstatistik, speicherePositionen } = require('../../../services/gasImport');

// Gas-Auswertung (#460). Eingehängt unter requireArea('gashandel.auswertung') in server.js.
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

const benutzer = (req) => {
  const u = req.session.user || {};
  return u.name || u.preferred_username || u.email || 'unbekannt';
};

// ── Einkaufspreise ────────────────────────────────────────────────────────
router.get('/ek-preise', async (req, res) => {
  try { res.json(await ek.liste(getPool())); }
  catch (err) { console.error('[Gas] GET ek-preise:', err); res.status(500).json({ error: 'Einkaufspreise konnten nicht geladen werden' }); }
});

router.post('/ek-preise', async (req, res) => {
  try {
    const r = await ek.speichere(getPool(), req.body || {}, benutzer(req));
    if (r.fehler) return res.status(400).json({ error: r.fehler.join(', ') });
    res.json(r);
  } catch (err) { console.error('[Gas] POST ek-preise:', err); res.status(500).json({ error: 'Preis konnte nicht gespeichert werden' }); }
});

router.get('/ek-preise/protokoll', async (req, res) => {
  try { res.json({ protokoll: await ek.protokoll(getPool()) }); }
  catch (err) { console.error('[Gas] GET protokoll:', err); res.status(500).json({ error: 'Protokoll konnte nicht geladen werden' }); }
});

// ── Auswertung ────────────────────────────────────────────────────────────
const antwort = (name, fn) => async (req, res) => {
  try { res.json(await fn(req)); }
  catch (err) { console.error(`[Gas] ${name}:`, err); res.status(500).json({ error: `${name} konnte nicht berechnet werden` }); }
};
router.get('/uebersicht', antwort('Überblick', () => daten.uebersicht(getPool())));
router.get('/flaschen', antwort('Flaschen', () => daten.flaschen(getPool())));
router.post('/preismodell', antwort('Preismodell', (req) => daten.preismodell(getPool(), req.body || {})));

// ── Import Touren (CSV: datum;tourende;bezeichnung;terminal;plan_kg_brutto;plan_bestellungen) ──
router.post('/import/touren', upload.single('datei'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Keine Datei hochgeladen' });
    res.json({ touren: await daten.importiereTouren(getPool(), req.file.buffer.toString('utf8')) });
  } catch (err) { console.error('[Gas] Import Touren:', err); res.status(400).json({ error: `Import fehlgeschlagen: ${err.message}` }); }
});

// ── Import Komplettstatistik (PDF je Terminal) ───────────────────────────
router.post('/import/komplettstatistik', upload.array('dateien', 8), async (req, res) => {
  try {
    if (!req.files || !req.files.length) return res.status(400).json({ error: 'Keine Datei hochgeladen' });
    const ergebnis = [];
    for (const f of req.files) {
      const { terminal, positionen } = await parseKomplettstatistik(f.buffer);
      const n = await speicherePositionen(getPool(), positionen, f.originalname.slice(0, 120));
      ergebnis.push({ datei: f.originalname, terminal, positionen: n });
    }
    res.json({ ergebnis });
  } catch (err) {
    console.error('[Gas] Import Komplettstatistik:', err);
    res.status(400).json({ error: `Import fehlgeschlagen: ${err.message}` });
  }
});

module.exports = router;
