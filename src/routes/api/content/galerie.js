'use strict';
// Kundengalerie randl.group/zelt/galerie/ – siehe src/services/galerie.js
const router  = require('express').Router();
const galerie = require('../../../services/galerie');

const send = (res, fn) => {
  try { res.json(fn()); }
  catch (e) {
    if (e.code === 'ENOENT') return res.status(404).json({ error: 'Galerie noch nicht erzeugt (tools/build-galerie.py auf dem Server ausführen)' });
    console.error('[Galerie]', e);
    res.status(e.status || 500).json({ error: e.message });
  }
};
const user = req => req.session?.user?.email || req.session?.user?.name || null;

router.get('/list', (req, res) => send(res, () => galerie.list()));
router.post('/ausblenden', (req, res) => send(res, () => galerie.hide(req.body?.files, user(req))));
router.post('/einblenden', (req, res) => send(res, () => galerie.restore(req.body?.files)));

router.get('/papierkorb/:file', (req, res) => {
  const p = galerie.papierkorbThumb(req.params.file);
  if (!p) return res.status(404).end();
  res.type('image/webp').sendFile(p);
});

module.exports = router;
