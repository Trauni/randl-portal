// /home/radmin/web/randlweb.de/public_html/portal/src/routes/api/content/shop-cms.js
// CMS Shopseite – Texte (shop-config.json) und Zusatz-CSS (shop-custom.css)
//
// Seit gasshop #281: Das CMS schreibt nur noch in /srv/docker/gas-webshop/shop-content.
// Der Ordner ist per Bind-Mount unter /content/ im Shop-Frontend erreichbar und nicht
// in Git – Aenderungen wirken sofort, ohne Rebuild, und der Git-Checkout bleibt sauber.
// Das Grund-CSS steht im Shop-Code (App.jsx) und wird nur ueber das Repo geaendert.

const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const requireAuth = require('../../../middleware/requireAuth');

const CONTENT_DIR = '/srv/docker/gas-webshop/shop-content';
const CONFIG_PATH = path.join(CONTENT_DIR, 'shop-config.json');
const CSS_PATH = path.join(CONTENT_DIR, 'shop-custom.css');
// Standardwerte aus dem Repo (werden ins Image gebacken)
const DEFAULT_CONFIG_PATH = '/srv/docker/gas-webshop/frontend/public/shop-config.json';
const MAX_CSS_BYTES = 90 * 1024; // unter dem express.json-Limit (100 KB) des Portals
const CATEGORY_IDS = ['ALLE', 'HEIZUNG', 'CAMPING', 'GASTRO', 'TECHNIK'];

function readJson(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; }
}

// Atomar schreiben, damit nginx nie eine halbe Datei ausliefert
function writeAtomic(file, content) {
  fs.mkdirSync(CONTENT_DIR, { recursive: true });
  const tmp = file + '.tmp-' + process.pid;
  fs.writeFileSync(tmp, content, 'utf8');
  fs.renameSync(tmp, file);
}

// Wirksame Config = Standardwerte, ueberlagert von der CMS-Datei (wie im Shop)
function effectiveConfig() {
  const base = readJson(DEFAULT_CONFIG_PATH) || {};
  const cms = readJson(CONFIG_PATH) || {};
  return { ...base, ...cms, categories: { ...(base.categories || {}), ...(cms.categories || {}) } };
}

// ──────────────────────────────────────────────
// GET /api/shop-cms/config
// ──────────────────────────────────────────────
router.get('/config', requireAuth, (req, res) => {
  res.json(effectiveConfig());
});

// ──────────────────────────────────────────────
// PUT /api/shop-cms/config
// Nur bekannte Felder werden geaendert, alle anderen (z. B. priceNoticeExtra) bleiben.
// ──────────────────────────────────────────────
router.put('/config', requireAuth, (req, res) => {
  try {
    const { priceNotice, loginSubtitle, categories } = req.body;
    if (typeof priceNotice !== 'string' || typeof loginSubtitle !== 'string') {
      return res.status(400).json({ error: 'priceNotice und loginSubtitle müssen Strings sein' });
    }
    if (categories && typeof categories !== 'object') {
      return res.status(400).json({ error: 'categories muss ein Objekt sein' });
    }

    const config = effectiveConfig();
    config.priceNotice = priceNotice.trim();
    config.loginSubtitle = loginSubtitle.trim();
    CATEGORY_IDS.forEach(k => {
      const v = categories?.[k];
      config.categories[k] = (typeof v === 'string' && v.trim()) || config.categories[k] || k;
    });

    writeAtomic(CONFIG_PATH, JSON.stringify(config, null, 2) + '\n');
    console.log('[shop-cms] shop-config.json gespeichert');
    res.json({ ok: true });
  } catch (err) {
    console.error('[shop-cms] config write error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ──────────────────────────────────────────────
// GET /api/shop-cms/css – Zusatz-CSS (leer, wenn noch nicht angelegt)
// ──────────────────────────────────────────────
router.get('/css', requireAuth, (req, res) => {
  try {
    const css = fs.existsSync(CSS_PATH) ? fs.readFileSync(CSS_PATH, 'utf8') : '';
    res.json({ css });
  } catch (err) {
    console.error('[shop-cms] css read error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ──────────────────────────────────────────────
// PUT /api/shop-cms/css – Zusatz-CSS speichern, wirkt sofort
// ──────────────────────────────────────────────
router.put('/css', requireAuth, (req, res) => {
  try {
    const { css } = req.body;
    if (typeof css !== 'string') {
      return res.status(400).json({ error: 'css muss ein String sein' });
    }
    if (Buffer.byteLength(css, 'utf8') > MAX_CSS_BYTES) {
      return res.status(413).json({ error: 'Zusatz-CSS ist zu groß (max. 90 KB)' });
    }
    writeAtomic(CSS_PATH, css);
    console.log('[shop-cms] shop-custom.css gespeichert (' + css.length + ' Zeichen)');
    res.json({ ok: true });
  } catch (err) {
    console.error('[shop-cms] css write error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
