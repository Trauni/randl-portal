const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');
const router = express.Router();
const requireAuth = require('../../../middleware/requireAuth');
const requireArea = require('../../../middleware/requireArea');
const db = require('../../../db');
const dateien = require('../../../services/metallDatei');

// Dateien pro Vorgang (#372): Upload (auch direkt von der Handykamera), Freigabe fuer den Kunden,
// Beschreibung, weich loeschen, ansehen/herunterladen. Ablage siehe services/metallDatei.js.
const GATE = requireArea('metallarbeiten.vorgaenge');

// Lokal, wie in kunden.js — keine geteilte Utility im Projekt
async function getEmployeeId(authentikUid) {
  const [rows] = await db.getPool().execute('SELECT id FROM employees WHERE authentik_uid = ?', [authentikUid]);
  return rows[0]?.id ?? null;
}

function sendeFehler(res, err, was) {
  if (res.headersSent) return res.end();
  if (err.code === 'LIMIT_FILE_SIZE') return res.status(400).json({ error: 'Eine Datei ist größer als 25 MB' });
  if (err.code === 'LIMIT_FILE_COUNT' || err.code === 'LIMIT_UNEXPECTED_FILE') return res.status(400).json({ error: `Höchstens ${dateien.MAX_DATEIEN} Dateien auf einmal` });
  if ([400, 404, 409, 503].includes(err.status)) return res.status(err.status).json({ error: err.message });
  console.error(`${was}:`, err);
  return res.status(500).json({ error: `${was} fehlgeschlagen` });
}

// Upload erst in <METALL_UPLOAD_DIR>/.tmp (gleiches Dateisystem → rename statt kopieren)
const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => {
      try {
        const tmp = path.join(dateien.basisOrdner(), '.tmp');
        fs.mkdirSync(tmp, { recursive: true });
        cb(null, tmp);
      } catch (err) { cb(err); }
    },
    filename: (_req, _file, cb) => cb(null, crypto.randomBytes(12).toString('hex')),
  }),
  limits: { fileSize: dateien.MAX_BYTES, files: dateien.MAX_DATEIEN },
});

// Dateien eines Vorgangs
router.get('/vorgang/:vorgangId', requireAuth, GATE, async (req, res) => {
  try { res.json(await dateien.liste(db.getPool(), req.params.vorgangId)); } catch (err) { sendeFehler(res, err, 'Dateien laden'); }
});

// Hochladen: Feld „dateien“, mehrere erlaubt
router.post('/vorgang/:vorgangId', requireAuth, GATE, (req, res) => {
  upload.array('dateien', dateien.MAX_DATEIEN)(req, res, async err => {
    if (err) {
      await Promise.all((req.files || []).map(f => fs.promises.rm(f.path, { force: true }).catch(() => {})));
      return sendeFehler(res, err, 'Hochladen');
    }
    try {
      const employeeId = await getEmployeeId(req.session.user.authentikUid);
      // multer liefert den Originalnamen als latin1 – fuer Umlaute nach UTF-8 umdeuten
      const files = (req.files || []).map(f => ({ ...f, originalname: Buffer.from(f.originalname, 'latin1').toString('utf8') }));
      res.json(await dateien.speichere(db.getPool(), req.params.vorgangId, files, { employeeId }));
    } catch (e) { sendeFehler(res, e, 'Hochladen'); }
  });
});

router.put('/:id/sichtbar', requireAuth, GATE, async (req, res) => {
  try {
    const employeeId = await getEmployeeId(req.session.user.authentikUid);
    res.json(await dateien.setzeSichtbar(db.getPool(), req.params.id, req.body?.sichtbar, { employeeId }));
  } catch (err) { sendeFehler(res, err, 'Freigabe'); }
});

router.put('/:id/beschreibung', requireAuth, GATE, async (req, res) => {
  try { res.json(await dateien.setzeBeschreibung(db.getPool(), req.params.id, req.body?.beschreibung)); } catch (err) { sendeFehler(res, err, 'Beschreibung'); }
});

router.delete('/:id', requireAuth, GATE, async (req, res) => {
  try {
    const employeeId = await getEmployeeId(req.session.user.authentikUid);
    res.json(await dateien.loesche(db.getPool(), req.params.id, { employeeId }));
  } catch (err) { sendeFehler(res, err, 'Löschen'); }
});

// Ansehen/Herunterladen (?download=1 erzwingt Download), Vorschau
router.get('/:id', requireAuth, GATE, async (req, res) => {
  try {
    const a = await dateien.oeffne(db.getPool(), req.params.id);
    if (req.query.download === '1') a.inline = false;
    await dateien.sendeDatei(res, a);
  } catch (err) { sendeFehler(res, err, 'Datei'); }
});

router.get('/:id/vorschau', requireAuth, GATE, async (req, res) => {
  try { await dateien.sendeDatei(res, await dateien.oeffne(db.getPool(), req.params.id, { vorschau: true })); } catch (err) { sendeFehler(res, err, 'Vorschau'); }
});

module.exports = router;
