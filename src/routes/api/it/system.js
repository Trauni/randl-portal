'use strict';
/**
 * GET /api/it/system
 * Liefert: RAM, CPU, Disk, Uptime, Network, PM2, Docker, Top-Prozesse
 */
const express    = require('express');
const router     = express.Router();
const os         = require('os');
const { exec: execCb } = require('child_process');
const requireAuth = require('../../../middleware/requireAuth');

const execAsync = (cmd) => new Promise((res, rej) =>
  execCb(cmd, { timeout: 8000, shell: '/bin/bash' }, (e, o, er) => e ? rej(er || e.message) : res(o.trim()))
);

router.get('/', requireAuth, async (req, res) => {
  const out = {};

  // ── OS Basis ────────────────────────────────────────────────────
  const totalMem  = os.totalmem();
  const freeMem   = os.freemem();
  const usedMem   = totalMem - freeMem;
  const load      = os.loadavg();
  const cpuCount  = os.cpus().length;
  const uptSec    = os.uptime();

  out.hostname = os.hostname();
  out.cpuCount = cpuCount;
  out.uptime   = uptSec > 86400
    ? `${Math.floor(uptSec / 86400)}d ${Math.floor((uptSec % 86400) / 3600)}h ${Math.floor((uptSec % 3600) / 60)}m`
    : `${Math.floor(uptSec / 3600)}h ${Math.floor((uptSec % 3600) / 60)}m`;

  out.ram = {
    total: totalMem,
    used:  usedMem,
    free:  freeMem,
    pct:   Math.round(usedMem / totalMem * 100),
    usedGb: (usedMem  / 1073741824).toFixed(1),
    totalGb:(totalMem / 1073741824).toFixed(1),
    freeGb: (freeMem  / 1073741824).toFixed(1),
  };

  out.load = {
    '1m':  load[0].toFixed(2),
    '5m':  load[1].toFixed(2),
    '15m': load[2].toFixed(2),
    pct:   Math.min(Math.round(load[0] / cpuCount * 100), 100),
  };

  // ── Disk ────────────────────────────────────────────────────────
  out.disk = { used: '–', total: '–', pct: 0 };
  try {
    const df = await execAsync("df -h / | tail -1 | awk '{print $2,$3,$5}'");
    const [t, u, p] = df.split(' ');
    out.disk = { total: t, used: u, pct: parseInt(p) || 0 };
  } catch {}

  // ── Netzwerk live (2 Messungen, 1s Abstand) ─────────────────────
  out.network = { rx: '–', tx: '–' };
  try {
    const getNet = async () => {
      const ni = await execAsync(
        "grep -E '(eth0|ens|enp)' /proc/net/dev | head -1 | awk '{print $2,$10}'"
      );
      const [rx, tx] = ni.trim().split(/\s+/).map(Number);
      return { rx, tx };
    };
    const a = await getNet();
    await new Promise(r => setTimeout(r, 1000));
    const b = await getNet();
    const fmt = v =>
      v > 1048576 ? (v / 1048576).toFixed(1) + ' MB/s'
      : v > 1024  ? (v / 1024).toFixed(0) + ' KB/s'
      : v + ' B/s';
    out.network = { rx: fmt(b.rx - a.rx), tx: fmt(b.tx - a.tx) };
  } catch {}

  // ── PM2 ─────────────────────────────────────────────────────────
  out.pm2 = [];
  try {
    const pj = await execAsync('pm2 jlist');
    out.pm2 = JSON.parse(pj).map(p => ({
      name:   p.name,
      status: p.pm2_env.status,
      cpu:    p.monit?.cpu   ?? 0,
      mem:    Math.round((p.monit?.memory ?? 0) / 1048576),
    }));
  } catch {}

  // ── Docker ──────────────────────────────────────────────────────
  out.docker = { running: 0, total: 0, containers: [] };
  try {
    const psOut = await execAsync("docker ps -a --format '{{json .}}'");
    const containers = psOut.split('\n').filter(Boolean).map(l => JSON.parse(l));
    out.docker = {
      running: containers.filter(c => c.State === 'running').length,
      total:   containers.length,
      containers: containers.slice(0, 12).map(c => ({
        id:     (c.ID || '').substring(0, 12),
        name:   (c.Names || '').replace(/^\//, ''),
        image:  (c.Image || '').split('/').pop().substring(0, 22),
        state:  c.State || '',
        status: c.Status || '',
      })),
    };
  } catch {}

  // ── Top-Prozesse ────────────────────────────────────────────────
  out.topProcs = [];
  try {
    const ps = await execAsync(
      "/home/radmin/web/randlweb.de/public_html/portal/scripts/top-procs.sh"
    );
    out.topProcs = ps.split('\n').filter(Boolean).map(l => {
      const [n, c, m] = l.split('|');
      return { name: (n || '').split('/').pop().substring(0, 28), cpu: c || '0', mem: m || '0' };
    });
  } catch {}

  res.json({ ok: true, ...out });
});

module.exports = router;
