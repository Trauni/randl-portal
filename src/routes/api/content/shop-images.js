// /home/radmin/web/randlweb.de/public_html/portal/src/routes/api/content/shop-images.js
// Bildverwaltung fuer den Webshop (Kategorien + Produkte)
//
// Seit gasshop #285: Uploads landen in shop-content/img (nicht in Git, unter /content/
// im Shop eingehaengt) und wirken sofort. Die Standardbilder aus dem Repo
// (frontend/public) werden nur gelesen. Der Shop nimmt ein hochgeladenes Bild, wenn es
// in der CMS-Config unter "images" steht (Wert = Zeitstempel gegen den Browser-Cache),
// sonst das Standardbild. Loeschen setzt auf das Standardbild zurueck.

const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const requireAuth = require('../../../middleware/requireAuth');
const { IMG_DIR, readJson, CONFIG_PATH, writeAtomic, updateCmsConfig } = require('../../../utils/shopContent');

const SHOP_URL = 'https://shop.randl.group';
// Standardbilder aus dem Git-Checkout (nur lesen)
const STD_DIR = process.env.SHOP_STD_DIR || '/srv/docker/gas-webshop/frontend/public';
const VALID_CAT_IDS = ['ALLE', 'HEIZUNG', 'CAMPING', 'GASTRO', 'TECHNIK'];
const ART_RE = /^[a-zA-Z0-9\-_.]+$/;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
});

// JPEG an den ersten Bytes erkennen (Dateiname wird immer .jpg)
const isJpeg = buf => buf && buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;

function fileInfo(file) {
  try { const st = fs.statSync(file); return { size: st.size, mtime: st.mtime }; } catch { return null; }
}

// key = Pfad unter img/, z. B. "cat-HEIZUNG.jpg" oder "products/RG-T015.jpg"
function describe(key, stdRel) {
  const versions = (readJson(CONFIG_PATH) || {}).images || {};
  const custom = versions[key] ? fileInfo(path.join(IMG_DIR, key)) : null;
  const std = fileInfo(path.join(STD_DIR, stdRel));
  const url = custom ? `${SHOP_URL}/content/img/${key}?v=${versions[key]}`
    : std ? `${SHOP_URL}/${stdRel}?t=${new Date(std.mtime).getTime()}` : null;
  const info = custom || std;
  return { custom: !!custom, standard: !!std, exists: !!(custom || std), url, size: info?.size ?? null, mtime: info?.mtime ?? null };
}

function listJpgs(dir) {
  try { return fs.readdirSync(dir).filter(f => /\.jpg$/i.test(f) && !/\.orig\.jpg$/i.test(f)); } catch { return []; }
}

// GET /api/shop-images/list
router.get('/list', requireAuth, (req, res) => {
  try {
    const categories = VALID_CAT_IDS.map(id => ({ id, filename: `cat-${id}.jpg`, ...describe(`cat-${id}.jpg`, `cat-${id}.jpg`) }));
    const names = new Set([...listJpgs(path.join(STD_DIR, 'products')), ...listJpgs(path.join(IMG_DIR, 'products'))]);
    const products = [...names].sort((a, b) => a.localeCompare(b)).map(f => ({
      filename: f, artikelnr: f.replace(/\.jpg$/i, ''), ...describe(`products/${f}`, `products/${f}`),
    }));
    res.json({ categories, products });
  } catch (err) {
    console.error('[shop-images] list error:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/shop-images/upload – multipart: type ('category'|'product'), id, file
router.post('/upload', requireAuth, (req, res, next) => {
  upload.single('file')(req, res, err => {
    if (err) return res.status(400).json({ error: err.code === 'LIMIT_FILE_SIZE' ? 'Datei zu groß (max. 5 MB)' : err.message });
    next();
  });
}, (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Keine Datei übermittelt' });
    if (!isJpeg(req.file.buffer)) return res.status(400).json({ error: 'Bitte ein JPG hochladen (kein PNG/WebP/HEIC)' });
    const { type } = req.body;
    const id = String(req.body.id || '').trim();
    let key;
    if (type === 'category') {
      if (!VALID_CAT_IDS.includes(id.toUpperCase())) return res.status(400).json({ error: `Ungültige Kategorie. Erlaubt: ${VALID_CAT_IDS.join(', ')}` });
      key = `cat-${id.toUpperCase()}.jpg`;
    } else if (type === 'product') {
      if (!ART_RE.test(id) || id.includes('..')) return res.status(400).json({ error: 'Ungültige Artikelnummer (nur Buchstaben, Zahlen, - _ .)' });
      key = `products/${id}.jpg`;
    } else {
      return res.status(400).json({ error: 'Ungültiger type. Erlaubt: category, product' });
    }
    writeAtomic(path.join(IMG_DIR, key), req.file.buffer);
    updateCmsConfig(cfg => { cfg.images = { ...(cfg.images || {}), [key]: String(Date.now()) }; });
    console.log(`[shop-images] hochgeladen: ${key} (${req.file.size} bytes)`);
    res.json({ ok: true, key });
  } catch (err) {
    console.error('[shop-images] upload error:', err);
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/shop-images/:type/:filename – entfernt nur das hochgeladene Bild,
// danach zeigt der Shop wieder das Standardbild (falls vorhanden)
router.delete('/:type/:filename', requireAuth, (req, res) => {
  try {
    const { type, filename } = req.params;
    if (!/^[a-zA-Z0-9\-_.]+\.jpg$/i.test(filename) || filename.includes('..')) return res.status(400).json({ error: 'Ungültiger Dateiname' });
    let key;
    if (type === 'category' && /^cat-[A-Z]+\.jpg$/i.test(filename)) key = filename;
    else if (type === 'product') key = `products/${filename}`;
    else return res.status(400).json({ error: 'Ungültiger type' });

    const versions = (readJson(CONFIG_PATH) || {}).images || {};
    if (!versions[key]) return res.status(404).json({ error: 'Kein hochgeladenes Bild – Standardbilder ändern sich nur über das Repo' });
    updateCmsConfig(cfg => { if (cfg.images) delete cfg.images[key]; });
    try { fs.unlinkSync(path.join(IMG_DIR, key)); } catch {}
    console.log(`[shop-images] entfernt: ${key}`);
    res.json({ ok: true });
  } catch (err) {
    console.error('[shop-images] delete error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
