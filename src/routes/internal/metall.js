// Interne API fuer den Metall-Kundenbereich im Gas-Shop (#373). Haengt am internen Listener
// (server.js, gas-net-Bridge 172.19.0.1:3338, von aussen nicht routbar) und braucht zusaetzlich
// den Header x-internal-metall-secret = INTERNAL_METALL_SECRET (eigenes Geheimnis, getrennt vom
// SER-Push). Der Gas-Shop prueft vorher, dass das Konto Metall sehen darf. Ausserdem meldet
// der Gas-Shop hier Ereignisse fuer den Eingang (#371).
const express = require('express');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const db = require('../../db');
const lexware = require('../../services/lexware');
const api = require('../../services/metallKundenApi');
const eingang = require('../../services/metallEingang');
const dateien = require('../../services/metallDatei');
const aktion = require('../../services/metallKundenAktion');

const router = express.Router();

function gleich(a, b) {
  const x = Buffer.from(String(a || '')), y = Buffer.from(String(b || ''));
  return x.length === y.length && x.length > 0 && crypto.timingSafeEqual(x, y);
}

router.use((req, res, next) => {
  const soll = process.env.INTERNAL_METALL_SECRET;
  if (!soll || soll.length < 32) return res.status(503).json({ error: 'Interne Metall-API nicht eingerichtet' });
  if (!gleich(req.headers['x-internal-metall-secret'], soll)) return res.status(401).json({ error: 'Unauthorized' });
  next();
});

function sende(res, err, was) {
  if ([400, 404, 409, 429].includes(err.status)) return res.status(err.status).json({ error: err.message });
  if (err.code === 'LIMIT_FILE_SIZE') return res.status(400).json({ error: 'Eine Datei ist größer als 25 MB' });
  if (err.code === 'LIMIT_FILE_COUNT' || err.code === 'LIMIT_UNEXPECTED_FILE') return res.status(400).json({ error: `Höchstens ${MAX_KUNDEN_DATEIEN} Dateien` });
  if (err.name === 'LexwareError') {
    console.error(`[Interne Metall-API] ${was}:`, err.message);
    return res.status(502).json({ error: 'Beleg derzeit nicht abrufbar' });
  }
  console.error(`[Interne Metall-API] ${was}:`, err);
  return res.status(500).json({ error: `${was} fehlgeschlagen` });
}

// Liste der Vorgaenge eines Kunden
router.get('/kunden/:lexwareId/vorgaenge', async (req, res) => {
  try { res.json(await api.liste(db.getPool(), req.params.lexwareId)); } catch (err) { sende(res, err, 'Vorgänge'); }
});

// Detail eines Vorgangs (V-JJ-NNNN)
router.get('/kunden/:lexwareId/vorgaenge/:nr', async (req, res) => {
  try { res.json(await api.detail(db.getPool(), req.params.lexwareId, req.params.nr)); } catch (err) { sende(res, err, 'Vorgang'); }
});

// Beleg-PDF aus Lexware
router.get('/kunden/:lexwareId/belege/:belegId/pdf', async (req, res) => {
  try {
    const { pdf, dateiname } = await api.belegPdf({ pool: db.getPool(), lexware }, req.params.lexwareId, req.params.belegId);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${dateiname}"`);
    res.send(Buffer.from(pdf));
  } catch (err) { sende(res, err, 'Beleg-PDF'); }
});

// Freigegebene Datei bzw. Vorschau eines Vorgangs dieses Kunden (#372)
router.get('/kunden/:lexwareId/dateien/:dateiId', async (req, res) => {
  try {
    const a = await dateien.oeffneFuerKunde(db.getPool(), req.params.lexwareId, req.params.dateiId, { vorschau: req.query.vorschau === '1' });
    await dateien.sendeDatei(res, a);
  } catch (err) {
    if (res.headersSent) return res.end();
    sende(res, err, 'Datei');
  }
});

// ── Kundenaktionen (#376) ────────────────────────────────────────────────────
// Konto-Angaben kommen vom Kundenportal: bei Multipart in Kopfzeilen (URL-kodiert), sonst im JSON.
const MAX_KUNDEN_DATEIEN = 10;
const kopf = (req, name) => { const w = req.headers[name]; return w ? decodeURIComponent(String(w)) : null; };
const kontoAusKopf = req => ({ konto_id: kopf(req, 'x-konto-id'), kdnr: kopf(req, 'x-kdnr'), name: kopf(req, 'x-konto-name'), email: kopf(req, 'x-konto-email') });

const kundenUpload = multer({
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
  limits: { fileSize: dateien.MAX_BYTES, files: MAX_KUNDEN_DATEIEN, fields: 20, fieldSize: 8 * 1024 },
});

// Neue Anfrage oder Nachbestellung (multipart: Felder + „dateien“) → { vorgangsnummer, eingang_id, dateien }
router.post('/kunden/:lexwareId/anfragen', (req, res) => {
  kundenUpload.array('dateien', MAX_KUNDEN_DATEIEN)(req, res, async err => {
    const files = (req.files || []).map(f => ({ ...f, originalname: Buffer.from(f.originalname, 'latin1').toString('utf8') }));
    if (err) {
      await Promise.all(files.map(f => fs.promises.rm(f.path, { force: true }).catch(() => {})));
      return sende(res, err, 'Anfrage');
    }
    try {
      res.status(201).json(await aktion.anfrage(db.getPool(), req.params.lexwareId, req.body, files, kontoAusKopf(req)));
    } catch (e) { sende(res, e, 'Anfrage'); }
  });
});

// Online-Annahme: JSON { angebot_id, kunden_bestellnr?, nachricht?, ip?, user_agent?, konto: {…} }
router.post('/kunden/:lexwareId/vorgaenge/:nr/annahme', async (req, res) => {
  try {
    res.status(201).json(await aktion.annahme({ pool: db.getPool(), lexware }, req.params.lexwareId, req.params.nr, req.body, req.body?.konto));
  } catch (err) { sende(res, err, 'Annahme'); }
});

// Eingang (#371): Anfrage, Nachbestellung, Annahme oder Freischaltung melden → { id }
router.post('/eingang', async (req, res) => {
  try { res.status(201).json(await eingang.melde(db.getPool(), req.body)); } catch (err) { sende(res, err, 'Eingang'); }
});

// Ergebnis der Mail ans Sammelpostfach: { ok: true } oder { fehler: '…' }
router.post('/eingang/:id/mail', async (req, res) => {
  try { res.json(await eingang.vermerkeMail(db.getPool(), req.params.id, req.body)); } catch (err) { sende(res, err, 'Eingang-Mail'); }
});

module.exports = router;
