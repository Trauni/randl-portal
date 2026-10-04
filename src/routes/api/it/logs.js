'use strict';
/**
 * /api/it/logs
 * System Log Reader — tail verschiedener Log-Quellen
 */
const express     = require('express');
const router      = express.Router();
const { exec: execCb } = require('child_process');
const requireAuth = require('../../../middleware/requireAuth');

const execAsync = (cmd) => new Promise((res, rej) =>
  execCb(cmd, { timeout: 8000 }, (e, o) => e ? rej(e) : res(o.trim()))
);

const LOG_SOURCES = [
  { id: 'auth',     label: 'Auth / SSH',       file: '/var/log/auth.log' },
  { id: 'mail',     label: 'Mail',             file: '/var/log/mail.log' },
  { id: 'fail2ban', label: 'Fail2Ban',         file: '/var/log/fail2ban.log' },
  { id: 'nginx',    label: 'Nginx Error',      file: '/var/log/nginx/error.log' },
  { id: 'apache',   label: 'Apache Error',     file: '/var/log/apache2/error.log' },
  { id: 'cron',     label: 'Cron',             file: '/var/log/cron.log' },
  { id: 'dovecot',  label: 'Dovecot',          file: '/var/log/dovecot.log' },
  { id: 'pm2portal',label: 'PM2 Portal',       file: '/home/radmin/logs/portal-error-0.log' },
  { id: 'syslog',   label: 'Syslog',           file: '/var/log/syslog' },
];

const CRIT = /error|critical|fatal|failed|refused|banned|invalid user|authentication failure/i;

// GET /api/it/logs/sources — verfügbare Log-Quellen
router.get('/sources', requireAuth, (req, res) => {
  res.json({ sources: LOG_SOURCES.map(s => ({ id: s.id, label: s.label, file: s.file })) });
});

// GET /api/it/logs/data?src=auth&n=100 — Log-Zeilen lesen
router.get('/data', requireAuth, async (req, res) => {
  const srcId = req.query.src || 'auth';
  const n     = Math.min(parseInt(req.query.n) || 100, 1000);
  const src   = LOG_SOURCES.find(s => s.id === srcId) || LOG_SOURCES[0];

  try {
    const raw   = await execAsync(`tail -n ${n} "${src.file}" 2>/dev/null`);
    const lines = raw.split('\n').filter(Boolean).map(line => {
      const l = line.toLowerCase();
      let color = 'var(--text2)';
      if (/error|critical|fatal|failed|refused|banned|invalid user|authentication failure/.test(l)) color = 'var(--red2)';
      else if (/warn|warning/.test(l)) color = 'var(--amber)';
      else if (/success|accepted|started/.test(l)) color = 'var(--green)';
      return { line, color };
    });
    res.json({ ok: true, lines, file: src.file, source: src.label });
  } catch (e) {
    res.json({ ok: false, error: e.message, lines: [], file: src.file });
  }
});

// GET /api/it/logs/critical — kritische Zeilen aus allen Quellen (für Dashboard)
router.get('/critical', requireAuth, async (req, res) => {
  const results = [];
  for (const src of LOG_SOURCES) {
    try {
      const raw   = await execAsync(`tail -n 100 "${src.file}" 2>/dev/null`);
      const crits = raw.split('\n').filter(l => CRIT.test(l)).slice(-3);
      crits.forEach(line => results.push({ src: src.label, line }));
    } catch {}
  }
  res.json({ ok: true, lines: results.slice(-20) });
});

module.exports = router;
