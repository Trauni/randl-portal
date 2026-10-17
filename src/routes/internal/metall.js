// Interne API fuer den Metall-Kundenbereich im Gas-Shop (#373). Haengt am internen Listener
// (server.js, gas-net-Bridge 172.19.0.1:3338, von aussen nicht routbar) und braucht zusaetzlich
// den Header x-internal-metall-secret = INTERNAL_METALL_SECRET (eigenes Geheimnis, getrennt vom
// SER-Push). Der Gas-Shop prueft vorher, dass das Konto Metall sehen darf. Ausserdem meldet
// der Gas-Shop hier Ereignisse fuer den Eingang (#371).
const express = require('express');
const crypto = require('crypto');
const db = require('../../db');
const lexware = require('../../services/lexware');
const api = require('../../services/metallKundenApi');
const eingang = require('../../services/metallEingang');

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
  if (err.status === 400 || err.status === 404) return res.status(err.status).json({ error: err.message });
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

// Eingang (#371): Anfrage, Nachbestellung, Annahme oder Freischaltung melden → { id }
router.post('/eingang', async (req, res) => {
  try { res.status(201).json(await eingang.melde(db.getPool(), req.body)); } catch (err) { sende(res, err, 'Eingang'); }
});

// Ergebnis der Mail ans Sammelpostfach: { ok: true } oder { fehler: '…' }
router.post('/eingang/:id/mail', async (req, res) => {
  try { res.json(await eingang.vermerkeMail(db.getPool(), req.params.id, req.body)); } catch (err) { sende(res, err, 'Eingang-Mail'); }
});

module.exports = router;
