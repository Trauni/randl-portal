// /home/radmin/web/randlweb.de/public_html/portal/src/routes/api/content/shop-cms.js
// Phase 5: CMS Shopseite – shop-config.json + CSS + Rebuild

const express = require('express');
const router = express.Router();
const fs = require('fs');
const { exec } = require('child_process');
const requireAuth = require('../../../middleware/requireAuth');

const CONFIG_PATH = '/srv/docker/gas-webshop/frontend/public/shop-config.json';
const APP_JSX_PATH = '/srv/docker/gas-webshop/frontend/src/App.jsx';
const REBUILD_CMD = 'cd /srv/docker/gas-webshop && docker compose build --no-cache frontend && docker compose up -d frontend';

// Build-State (In-Memory, überlebt pm2-Restart nicht – reicht für UI)
let buildState = {
  running: false,
  status: 'idle', // 'idle' | 'running' | 'success' | 'error'
  lastTime: null,
  lastOutput: '',
  startTime: null
};

// ──────────────────────────────────────────────
// Hilfsfunktionen: CSS-Block aus App.jsx
// ──────────────────────────────────────────────
function getCssBlock(content) {
  // Sucht: const css = `...`
  const match = content.match(/const css = `([\s\S]*?)`(?=\s*;\s*\n|\s*;?\s*\n\s*(?:\/\/|const|function|export|return))/);
  if (match) return match[1];
  // Fallback: alles zwischen erstem und letztem Backtick des const css
  const m2 = content.match(/const css = `([\s\S]*?)`/);
  return m2 ? m2[1] : null;
}

function setCssBlock(content, newCss) {
  // Escaped Backticks im neuen CSS
  const escaped = newCss.replace(/`/g, '\\`').replace(/\$\{/g, '\\${');
  return content.replace(/const css = `[\s\S]*?`/, `const css = \`${escaped}\``);
}

// ──────────────────────────────────────────────
// Rebuild-Funktion
// ──────────────────────────────────────────────
function triggerRebuild(callback) {
  if (buildState.running) {
    if (callback) callback(new Error('Rebuild läuft bereits'));
    return;
  }
  buildState.running = true;
  buildState.status = 'running';
  buildState.startTime = new Date();
  buildState.lastOutput = '';
  console.log('[shop-cms] Rebuild gestartet:', REBUILD_CMD);

  exec(REBUILD_CMD, { timeout: 120000 }, (err, stdout, stderr) => {
    buildState.running = false;
    buildState.lastTime = new Date();
    buildState.lastOutput = (stdout || '') + (stderr ? '\nSTDERR:\n' + stderr : '');
    if (err) {
      buildState.status = 'error';
      console.error('[shop-cms] Rebuild FEHLER:', err.message);
    } else {
      buildState.status = 'success';
      console.log('[shop-cms] Rebuild erfolgreich');
    }
    if (callback) callback(err);
  });
}

// ──────────────────────────────────────────────
// GET /api/shop-cms/config
// ──────────────────────────────────────────────
router.get('/config', requireAuth, (req, res) => {
  try {
    if (!fs.existsSync(CONFIG_PATH)) {
      // Defaults zurückgeben wenn noch nicht angelegt
      return res.json({
        priceNotice: 'Alle Preise sind Nettopreise zzgl. gesetzlicher MwSt.',
        loginSubtitle: 'Gashandel - Gewerbe, Camper und Haushalter',
        categories: {
          ALLE: 'Alle Produkte',
          HEIZUNG: 'Heizgase',
          CAMPING: 'Camping Gase',
          GASTRO: 'Gastro Gase',
          TECHNIK: 'Technische Gase'
        }
      });
    }
    const content = fs.readFileSync(CONFIG_PATH, 'utf8');
    res.json(JSON.parse(content));
  } catch (err) {
    console.error('[shop-cms] config read error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ──────────────────────────────────────────────
// PUT /api/shop-cms/config
// ──────────────────────────────────────────────
router.put('/config', requireAuth, (req, res) => {
  try {
    const { priceNotice, loginSubtitle, categories } = req.body;

    // Validierung
    if (typeof priceNotice !== 'string' || typeof loginSubtitle !== 'string') {
      return res.status(400).json({ error: 'priceNotice und loginSubtitle müssen Strings sein' });
    }
    const allowedCats = ['ALLE', 'HEIZUNG', 'CAMPING', 'GASTRO', 'TECHNIK'];
    if (categories && typeof categories !== 'object') {
      return res.status(400).json({ error: 'categories muss ein Objekt sein' });
    }

    const config = {
      priceNotice: priceNotice.trim(),
      loginSubtitle: loginSubtitle.trim(),
      categories: {}
    };
    allowedCats.forEach(k => {
      config.categories[k] = categories?.[k]?.trim() || k;
    });

    // Backup
    if (fs.existsSync(CONFIG_PATH)) {
      fs.copyFileSync(CONFIG_PATH, CONFIG_PATH + '.bak');
    }

    fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf8');
    console.log('[shop-cms] shop-config.json gespeichert');
    res.json({ ok: true });
  } catch (err) {
    console.error('[shop-cms] config write error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ──────────────────────────────────────────────
// GET /api/shop-cms/css
// ──────────────────────────────────────────────
router.get('/css', requireAuth, (req, res) => {
  try {
    if (!fs.existsSync(APP_JSX_PATH)) {
      return res.status(404).json({ error: 'App.jsx nicht gefunden' });
    }
    const content = fs.readFileSync(APP_JSX_PATH, 'utf8');
    const css = getCssBlock(content);
    if (css === null) {
      return res.status(404).json({ error: 'CSS-Block (const css = `...`) nicht gefunden in App.jsx' });
    }
    res.json({ css });
  } catch (err) {
    console.error('[shop-cms] css read error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ──────────────────────────────────────────────
// PUT /api/shop-cms/css
// Schreibt CSS-Block + triggert Rebuild
// ──────────────────────────────────────────────
router.put('/css', requireAuth, (req, res) => {
  try {
    const { css } = req.body;
    if (typeof css !== 'string') {
      return res.status(400).json({ error: 'css muss ein String sein' });
    }
    if (!fs.existsSync(APP_JSX_PATH)) {
      return res.status(404).json({ error: 'App.jsx nicht gefunden' });
    }

    const content = fs.readFileSync(APP_JSX_PATH, 'utf8');

    // Prüfen ob CSS-Block vorhanden
    if (getCssBlock(content) === null) {
      return res.status(422).json({ error: 'CSS-Block nicht gefunden – manuelles Eingreifen erforderlich' });
    }

    // Backup anlegen
    const backupPath = APP_JSX_PATH + '.css-backup-' + Date.now();
    fs.copyFileSync(APP_JSX_PATH, backupPath);
    console.log('[shop-cms] App.jsx Backup:', backupPath);

    // CSS schreiben
    const newContent = setCssBlock(content, css);
    fs.writeFileSync(APP_JSX_PATH, newContent, 'utf8');
    console.log('[shop-cms] App.jsx CSS-Block aktualisiert, triggere Rebuild...');

    // Rebuild asynchron
    triggerRebuild();

    res.json({ ok: true, rebuildStarted: true, backupPath });
  } catch (err) {
    console.error('[shop-cms] css write error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ──────────────────────────────────────────────
// GET /api/shop-cms/rebuild-status
// ──────────────────────────────────────────────
router.get('/rebuild-status', requireAuth, (req, res) => {
  res.json({
    running: buildState.running,
    status: buildState.status,
    lastTime: buildState.lastTime,
    startTime: buildState.startTime,
    lastOutput: buildState.lastOutput.slice(-2000) // letzte 2000 Zeichen
  });
});

// ──────────────────────────────────────────────
// POST /api/shop-cms/rebuild
// Manueller Rebuild
// ──────────────────────────────────────────────
router.post('/rebuild', requireAuth, (req, res) => {
  if (buildState.running) {
    return res.status(409).json({ error: 'Rebuild läuft bereits', running: true });
  }
  triggerRebuild();
  res.json({ ok: true, message: 'Rebuild gestartet' });
});

module.exports = router;
