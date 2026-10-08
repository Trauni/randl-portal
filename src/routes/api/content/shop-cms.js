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
const { CONTENT_DIR, CONFIG_PATH, readJson, writeAtomic, updateCmsConfig } = require('../../../utils/shopContent');

const CSS_PATH = path.join(CONTENT_DIR, 'shop-custom.css');
// Standardwerte aus dem Repo (werden ins Image gebacken)
const DEFAULT_CONFIG_PATH = process.env.SHOP_DEFAULT_CONFIG || '/srv/docker/gas-webshop/frontend/public/shop-config.json';
const MAX_CSS_BYTES = 90 * 1024; // unter dem express.json-Limit (100 KB) des Portals
const CATEGORY_IDS = ['ALLE', 'HEIZUNG', 'CAMPING', 'GASTRO', 'TECHNIK'];
// Texte, die der Shop aus der CMS-Datei liest (#285). Leer = Standardtext im Shop.
const TEXT_FIELDS = [
  'loginTitle', 'loginSubtitle', 'greeting', 'rhythmCardText', 'contactCardText',
  'priceNotice', 'priceNoticeExtra', 'orderSuccessText', 'contactIntro', 'footerCompany',
];
const URL_FIELDS = ['imprintUrl', 'privacyUrl'];
const MAX_TEXT = 1000;

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
// Nur bekannte Felder werden geaendert, alle anderen (z. B. images) bleiben. Leer = Standard.
// ──────────────────────────────────────────────
router.put('/config', requireAuth, (req, res) => {
  try {
    const body = req.body || {};
    const changes = {};
    for (const k of [...TEXT_FIELDS, ...URL_FIELDS]) {
      if (!(k in body)) continue;
      const v = body[k] == null ? '' : body[k];
      if (typeof v !== 'string') return res.status(400).json({ error: k + ' muss Text sein' });
      const t = v.trim();
      if (t.length > MAX_TEXT) return res.status(400).json({ error: k + ' ist zu lang (max. ' + MAX_TEXT + ' Zeichen)' });
      if (URL_FIELDS.includes(k) && t && !/^https?:\/\/\S+$/i.test(t)) {
        return res.status(400).json({ error: 'Link muss mit https:// beginnen' });
      }
      changes[k] = t;
    }
    if (body.categories && typeof body.categories !== 'object') {
      return res.status(400).json({ error: 'categories muss ein Objekt sein' });
    }

    const base = effectiveConfig();
    updateCmsConfig(cfg => {
      // leere Felder entfernen -> Shop zeigt den Standardtext
      for (const [k, t] of Object.entries(changes)) { if (t) cfg[k] = t; else delete cfg[k]; }
      if (body.categories) {
        cfg.categories = cfg.categories || {};
        CATEGORY_IDS.forEach(k => {
          const v = body.categories[k];
          cfg.categories[k] = (typeof v === 'string' && v.trim()) || base.categories[k] || k;
        });
      }
    });
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
