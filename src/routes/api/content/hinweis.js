'use strict';
const router = require('express').Router();
const fs     = require('fs');
const path   = require('path');
const { validateBanner, isActive, defaultBanner } = require('../../../services/siteBanner');

const PUBLIC_ROOT = '/home/radmin/web/randl.group/public_html';
const BANNER_FILE = path.join(PUBLIC_ROOT, 'site-banner.json');
const BACKUP_DIR  = path.join(__dirname, '../../../../../cms-backups/hinweis');

function readBanner() {
  try {
    const raw = JSON.parse(fs.readFileSync(BANNER_FILE, 'utf8'));
    return { ...defaultBanner(), ...raw };
  } catch (e) {
    if (e.code !== 'ENOENT') console.error('[Hinweis] Lesefehler:', e.message);
    return defaultBanner();
  }
}

// ── GET /api/content/hinweis ───────────────────────────────────────
router.get('/', (req, res) => {
  const cfg = readBanner();
  res.json({ ...cfg, active: isActive(cfg, new Date()) });
});

// ── PUT /api/content/hinweis ───────────────────────────────────────
router.put('/', (req, res) => {
  const r = validateBanner(req.body);
  if (!r.ok) return res.status(400).json({ error: r.errors.join('; '), errors: r.errors });

  const u = req.session?.user || {};
  const cfg = {
    ...r.value,
    updatedAt: new Date().toISOString(),
    updatedBy: u.username || u.email || 'unbekannt',
  };
  const tmp = `${BANNER_FILE}.tmp-${process.pid}`;
  try {
    if (fs.existsSync(BANNER_FILE)) {
      const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      fs.mkdirSync(BACKUP_DIR, { recursive: true });
      fs.copyFileSync(BANNER_FILE, path.join(BACKUP_DIR, `${ts}.json`));
    }
    let mode = 0o644;
    try { mode = fs.statSync(BANNER_FILE).mode & 0o777; } catch (_) { /* neue Datei */ }
    fs.writeFileSync(tmp, JSON.stringify(cfg, null, 2) + '\n', { encoding: 'utf8', mode });
    fs.renameSync(tmp, BANNER_FILE);
    res.json({ ...cfg, active: isActive(cfg, new Date()) });
  } catch (e) {
    try { fs.unlinkSync(tmp); } catch (_) { /* nichts */ }
    console.error('[Hinweis] Speichern fehlgeschlagen:', e);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
