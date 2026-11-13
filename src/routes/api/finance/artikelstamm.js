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

// POST /api/finance/artikelstamm/aendern   { nummern: [...], werte: { feld: wert } } – Einzel- und Massenbearbeitung
router.post('/aendern', async (req, res) => {
  const { nummern, werte } = req.body || {};
  try { res.json(await service.aendere(nummern, werte, req.session.user || {})); }
  catch (err) {
    if (!err.status) console.error('[Artikelstamm] aendern:', err);
    res.status(err.status || 500).json({ error: err.status ? err.message : 'Änderung konnte nicht gespeichert werden' });
  }
});

function jsonRoute(handler, fehlertext) {
  return async (req, res) => {
    try { res.json(await handler(req)); }
    catch (err) {
      if (!err.status) console.error('[Artikelstamm]', err);
      res.status(err.status || 500).json({ error: err.status ? err.message : fehlertext });
    }
  };
}

// POST /api/finance/artikelstamm/loeschen   { nummern: [...], pruefen?: true } – nur nicht mehr verwendete Artikel
router.post('/loeschen', jsonRoute(req => service.loesche(req.body?.nummern, req.session.user || {}, { pruefen: req.body?.pruefen === true }),
  'Löschen fehlgeschlagen'));

// POST /api/finance/artikelstamm/anlegen    { artikel_nr, bezeichnung, typ, ...weitere Felder }
router.post('/anlegen', jsonRoute(req => service.lege_an(req.body, req.session.user || {}), 'Artikel konnte nicht angelegt werden'));

// GET /api/finance/artikelstamm/:nr/protokoll
router.get('/:nr/protokoll', async (req, res) => {
  try { res.json({ eintraege: await service.protokoll(req.params.nr) }); }
  catch (err) { console.error('[Artikelstamm] protokoll:', err); res.status(500).json({ error: 'Protokoll konnte nicht geladen werden' }); }
});

module.exports = router;
