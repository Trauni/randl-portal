'use strict';
// „Aktuelles“ auf randl.group/news/ – siehe src/services/aktuelles.js
const router    = require('express').Router();
const multer    = require('multer');
const aktuelles = require('../../../services/aktuelles');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 30 * 1024 * 1024, files: 20 },
  fileFilter: (_req, file, cb) => {
    const ok = /jpeg|jpg|png|webp|heic|heif/i.test(file.mimetype) || /\.(jpe?g|png|webp|heic|heif)$/i.test(file.originalname);
    cb(ok ? null : Object.assign(new Error('Nur JPG, PNG, WebP oder HEIC erlaubt'), { status: 400 }), ok);
  },
});

const fehler = (res, e) => {
  if (e.code === 'LIMIT_FILE_SIZE') return res.status(400).json({ error: 'Datei zu groß (max. 30 MB)' });
  if (e.code === 'LIMIT_FILE_COUNT') return res.status(400).json({ error: 'Maximal 20 Bilder auf einmal' });
  if (!e.status) console.error('[Aktuelles]', e);
  res.status(e.status || 500).json({ error: e.message, errors: e.errors });
};
const send = (res, fn) => { try { res.json(fn()); } catch (e) { fehler(res, e); } };
const user = req => req.session?.user?.email || req.session?.user?.username || req.session?.user?.name || null;

// ── Bilder (vor /:id, damit „bilder“ nicht als Beitrags-ID gilt) ─────
router.get('/bilder', (req, res) => send(res, () => aktuelles.listBilder()));
router.post('/bilder', (req, res) => {
  upload.array('bilder', 20)(req, res, async err => {
    if (err) return fehler(res, err);
    if (!req.files?.length) return res.status(400).json({ error: 'Keine Bilder ausgewählt' });
    try {
      res.json(await aktuelles.uploadBilder(req.files.map(f => ({ buffer: f.buffer, name: f.originalname })),
        { alt: req.body?.alt, nachweis: req.body?.nachweis }, user(req)));
    } catch (e) {
      if (/unsupported image format|Input buffer|bad seek|corrupt/i.test(e.message)) { e.status = 400; e.message = 'Bild konnte nicht gelesen werden'; }
      fehler(res, e);
    }
  });
});
router.put('/bilder/:file', (req, res) => send(res, () => aktuelles.updateBild(req.params.file, req.body || {})));
router.delete('/bilder/:file', (req, res) => send(res, () => aktuelles.removeBild(req.params.file)));

// ── Beiträge ─────────────────────────────────────────────────────────
router.get('/', (req, res) => send(res, () => aktuelles.list()));
router.post('/', (req, res) => send(res, () => aktuelles.create(req.body, user(req))));
router.post('/neu-bauen', (req, res) => send(res, () => aktuelles.rebuild()));

// Vorschau als fertige Seite (auch Entwürfe und ungespeicherte Eingaben). Die Seite lädt Schriften, Bilder und
// Skripte von randl.group, deshalb bekommt nur diese Antwort eine eigene, dazu passende CSP.
router.post('/vorschau', (req, res) => {
  try {
    // Das Portal schickt ein Formular (neuer Tab) mit einem JSON-Feld; JSON direkt geht auch.
    const body = typeof req.body?.json === 'string' ? JSON.parse(req.body.json) : (req.body || {});
    const html = aktuelles.preview(body.beitrag, body.id || null);
    res.set('Content-Security-Policy', "default-src 'none'; img-src https://randl.group data:; style-src 'unsafe-inline' https://randl.group; font-src https://randl.group; script-src 'unsafe-inline' https://randl.group; connect-src https://randl.group; base-uri https://randl.group; form-action 'none'; frame-ancestors 'self'");
    res.set('X-Robots-Tag', 'noindex, nofollow');
    res.type('html').send(html);
  } catch (e) {
    if (e instanceof SyntaxError) { e.status = 400; e.message = 'Ungültige Vorschau-Daten'; }
    fehler(res, e);
  }
});

router.get('/:id', (req, res) => send(res, () => aktuelles.get(req.params.id)));
router.put('/:id', (req, res) => send(res, () => aktuelles.update(req.params.id, req.body, user(req))));
router.delete('/:id', (req, res) => send(res, () => aktuelles.remove(req.params.id)));

module.exports = router;
