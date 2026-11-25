const router = require('express').Router();
const { getPool } = require('../../../db');
const ek = require('../../../services/gasEkPreise');

// Einkaufspreise Gas (Reiter „Einkauf“ im Artikelstamm). Eingehängt unter requireArea('artikel.einkauf') in server.js.
const benutzer = (req) => {
  const u = req.session.user || {};
  return u.name || u.preferred_username || u.email || 'unbekannt';
};

router.get('/', async (req, res) => {
  try { res.json(await ek.liste(getPool())); }
  catch (err) { console.error('[EK] GET:', err); res.status(500).json({ error: 'Einkaufspreise konnten nicht geladen werden' }); }
});

router.post('/', async (req, res) => {
  try {
    const r = await ek.speichere(getPool(), req.body || {}, benutzer(req));
    if (r.fehler) return res.status(400).json({ error: r.fehler.join(', ') });
    res.json(r);
  } catch (err) { console.error('[EK] POST:', err); res.status(500).json({ error: 'Preis konnte nicht gespeichert werden' }); }
});

router.get('/protokoll', async (req, res) => {
  try { res.json({ protokoll: await ek.protokoll(getPool()) }); }
  catch (err) { console.error('[EK] GET protokoll:', err); res.status(500).json({ error: 'Protokoll konnte nicht geladen werden' }); }
});

module.exports = router;
