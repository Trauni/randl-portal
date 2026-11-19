'use strict';
// Kundengalerie randl.group/zelt/galerie/ – siehe src/services/galerie.js
const router  = require('express').Router();
const multer  = require('multer');
const galerie = require('../../../services/galerie');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 30 * 1024 * 1024, files: 20 },
  fileFilter: (_req, file, cb) => {
    const ok = /jpeg|jpg|png|webp|heic|heif/i.test(file.mimetype) || /\.(jpe?g|png|webp|heic|heif)$/i.test(file.originalname);
    cb(ok ? null : Object.assign(new Error('Nur JPG, PNG, WebP oder HEIC erlaubt'), { status: 400 }), ok);
  },
});

const fehler = (res, e) => {
  if (e.code === 'ENOENT') return res.status(404).json({ error: 'Galerie noch nicht erzeugt (tools/build-galerie.py auf dem Server ausführen)' });
  if (e.code === 'LIMIT_FILE_SIZE') return res.status(400).json({ error: 'Datei zu groß (max. 30 MB)' });
  if (e.code === 'LIMIT_FILE_COUNT') return res.status(400).json({ error: 'Maximal 20 Bilder auf einmal' });
  if (!e.status) console.error('[Galerie]', e);
  res.status(e.status || 500).json({ error: e.message });
};
const send = (res, fn) => { try { res.json(fn()); } catch (e) { fehler(res, e); } };
const user = req => req.session?.user?.email || req.session?.user?.name || null;

router.get('/list', (req, res) => send(res, () => galerie.list()));
router.post('/ausblenden', (req, res) => send(res, () => galerie.hide(req.body?.files, user(req))));
router.post('/einblenden', (req, res) => send(res, () => galerie.restore(req.body?.files)));
router.post('/endgueltig', (req, res) => send(res, () => galerie.purge(req.body?.files)));
router.post('/verschieben', (req, res) => send(res, () => galerie.move(req.body?.files, req.body?.album)));
router.put('/alben', (req, res) => send(res, () => galerie.saveAlben(req.body?.alben)));
router.post('/verpixeln', async (req, res) => { try { res.json(await galerie.blur(req.body?.files)); } catch (e) { fehler(res, e); } });
router.post('/entpixeln', (req, res) => send(res, () => galerie.unblur(req.body?.files)));

router.post('/hochladen', (req, res) => {
  upload.array('bilder', 20)(req, res, async err => {
    if (err) return fehler(res, err);
    if (!req.files?.length) return res.status(400).json({ error: 'Keine Bilder ausgewählt' });
    try {
      res.json(await galerie.upload(req.files.map(f => f.buffer), { album: req.body?.album, caption: req.body?.caption }, user(req)));
    } catch (e) {
      if (/unsupported image format|Input buffer/i.test(e.message)) e.status = 400, e.message = 'Bild konnte nicht gelesen werden';
      fehler(res, e);
    }
  });
});

router.get('/papierkorb/:file', (req, res) => {
  const p = galerie.papierkorbThumb(req.params.file);
  if (!p) return res.status(404).end();
  res.type('image/webp').sendFile(p);
});

module.exports = router;
