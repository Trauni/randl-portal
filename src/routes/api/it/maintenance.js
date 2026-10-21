'use strict';
// /home/radmin/web/randlweb.de/public_html/portal/src/routes/api/it/maintenance.js

const express     = require('express');
const router      = express.Router();
const fs           = require('fs').promises;
const { exec: execCb } = require('child_process');
const requireAuth  = require('../../../middleware/requireAuth');
const updates      = require('../../../services/containerUpdates');

const execAsync = (cmd, timeout = 15000) =>
  new Promise((resolve, reject) =>
    execCb(cmd, { timeout, shell: '/bin/bash', maxBuffer: 4 * 1024 * 1024 },
      (err, stdout) => err ? reject(err) : resolve(stdout)
    )
  );

const BACKUP_DIRS = {
  shopware: { dir: '/srv/backups/auto', pattern: /^db-.*\.sql\.gz$/ },
  gas_db:   { dir: '/srv/backups/gas-auto',  pattern: /^gas-db-.*\.sql\.gz$/ },
};

const CERTS = [
  { label: 'Hestia Panel',        path: '/usr/local/hestia/ssl/certificate.crt' },
  { label: 'mail.randlweb.de',    path: '/home/radmin/conf/web/mail.randlweb.de/ssl/mail.randlweb.de.pem' },
  { label: 'server.randlweb.de',  path: '/home/radmin/conf/web/server.randlweb.de/ssl/server.randlweb.de.pem' },
  { label: 'randlweb.de',         path: '/home/radmin/conf/web/randlweb.de/ssl/randlweb.de.pem' },
  { label: 'shop.randl.group',    path: '/home/radmin/conf/web/shop.randl.group/ssl/shop.randl.group.pem' },
  { label: 'randl.group',         path: '/home/radmin/conf/web/randl.group/ssl/randl.group.pem' },
  { label: 'docs.randlweb.de',    path: '/home/radmin/conf/web/docs.randlweb.de/ssl/docs.randlweb.de.pem' },
  { label: 'projects.randlweb.de',path: '/home/radmin/conf/web/projects.randlweb.de/ssl/projects.randlweb.de.pem' },
  { label: 'cloud.randlweb.de',   path: '/home/radmin/conf/web/cloud.randlweb.de/ssl/cloud.randlweb.de.pem' },
];

async function latestBackupInfo(dir, pattern) {
  try {
    const files = (await fs.readdir(dir)).filter(f => pattern.test(f));
    if (files.length === 0) return { file: null, age_hours: null };
    let newest = null, newestMtime = 0;
    for (const f of files) {
      const stat = await fs.stat(`${dir}/${f}`);
      if (stat.mtimeMs > newestMtime) { newestMtime = stat.mtimeMs; newest = f; }
    }
    const ageHours = (Date.now() - newestMtime) / 3600000;
    return { file: newest, age_hours: Math.round(ageHours * 10) / 10 };
  } catch {
    return { file: null, age_hours: null };
  }
}

async function certInfo(label, certPath) {
  try {
    const out = await execAsync(`openssl x509 -enddate -noout -in "${certPath}"`);
    const match = out.match(/notAfter=(.+)/);
    if (!match) return null;
    const end = new Date(match[1]);
    const daysLeft = Math.round((end.getTime() - Date.now()) / 86400000);
    return { label, days_left: daysLeft };
  } catch {
    return null;
  }
}

async function diskInfo() {
  try {
    const out = await execAsync(`df -h / | tail -1`);
    const parts = out.trim().split(/\s+/);
    return { used_pct: parseInt(parts[4], 10), available: parts[3], total: parts[1] };
  } catch {
    return null;
  }
}

async function dockerLogSizes() {
  try {
    const out = await execAsync(
      `find /var/lib/docker/containers/ -name "*.log" -printf "%s %f\\n" | sort -rn | head -6`
    );
    const lines = out.trim().split('\n').filter(Boolean);
    const results = [];
    for (const line of lines) {
      const [sizeStr, filename] = line.trim().split(/\s+/);
      const cid = filename.replace('-json.log', '');
      try {
        const name = (await execAsync(`docker ps -a --no-trunc --filter "id=${cid}" --format "{{.Names}}"`)).trim();
        if (name) results.push({ container: name, size_bytes: parseInt(sizeStr, 10) });
      } catch { /* Container evtl. entfernt */ }
    }
    return results;
  } catch {
    return [];
  }
}

// GET /api/it/maintenance/status
router.get('/status', requireAuth, async (req, res) => {
  try {
    const [sw, gasDb, disk, logs, wt] = await Promise.all([
      latestBackupInfo(BACKUP_DIRS.shopware.dir, BACKUP_DIRS.shopware.pattern),
      latestBackupInfo(BACKUP_DIRS.gas_db.dir, BACKUP_DIRS.gas_db.pattern),
      diskInfo(),
      dockerLogSizes(),
      updates.watchtowerStatus().catch(e => ({ vorhanden: false, fehler: e.message })),
    ]);
    // Update-Pruefung aller Container (#396): nur Zaehler, Details auf der Docker-Seite
    const u = updates.status();
    const certs = (await Promise.all(CERTS.map(c => certInfo(c.label, c.path)))).filter(Boolean);

    res.json({
      timestamp: new Date().toISOString(),
      backups: {
        shopware: { ...sw, warn: sw.age_hours === null || sw.age_hours > 26 },
        gas_db:   { ...gasDb, warn: gasDb.age_hours === null || gasDb.age_hours > 26 },
      },
      certificates: certs.map(c => ({ ...c, warn: c.days_left <= 21 })),
      disk,
      docker_log_sizes: logs,
      watchtower: wt,
      container_updates: {
        geprueft_am: u.geprueft_am,
        laeuft: u.laeuft,
        neues_image: u.container.filter(c => c.status === 'update').map(c => c.name),
        neue_version: u.container.filter(c => c.neue_version).map(c => ({ name: c.name, image: c.image, version: c.neue_version })),
      },
    });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

module.exports = router;
