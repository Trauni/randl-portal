const router = require('express').Router();
const multer = require('multer');
const service = require('../../../services/artikelstamm');

// #552: Artikelstamm. Rechtepruefung am Mount-Punkt in server.js: requireArea('gashandel.preise').
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

// multer liefert den Dateinamen als Latin-1 – Umlaute sonst kaputt
const dateiname = req => Buffer.from(req.file.originalname, 'latin1').toString('utf8');

function mitDatei(handler) {
  return (req, res) => upload.single('file')(req, res, async (uploadErr) => {
    if (uploadErr) {
      return res.status(400).json({ error: uploadErr.code === 'LIMIT_FILE_SIZE' ? 'Datei zu groß (max. 5 MB)' : uploadErr.message });
    }
    if (!req.file) return res.status(400).json({ error: 'Keine Datei hochgeladen' });
    try { res.json(await handler(req)); }
    catch (err) {
      console.error('[Artikelstamm]', err.message);
      res.status(err.status || 500).json({ error: err.message });
    }
  });
}

// GET /api/finance/artikelstamm
router.get('/', async (req, res) => {
  try { res.json({ artikel: await service.liste() }); }
  catch (err) { console.error('[Artikelstamm] liste:', err); res.status(500).json({ error: 'Artikel konnten nicht geladen werden' }); }
});

// POST /api/finance/artikelstamm/vorschau   multipart „file“ – schreibt nichts
router.post('/vorschau', mitDatei(req => service.vorschau(req.file.buffer)));

// POST /api/finance/artikelstamm/import     multipart „file“ – neue Artikel + leere Felder
router.post('/import', mitDatei(req => service.anwenden(req.file.buffer, dateiname(req), req.session.user || {})));

module.exports = router;
