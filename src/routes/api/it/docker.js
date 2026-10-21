'use strict';
/**
 * /api/it/docker
 * Docker Container-Verwaltung via CLI
 * Der Portal-User (radmin / pm2) muss in der docker-Gruppe sein oder sudo-Berechtigung haben.
 * Prüfen: id radmin → groups sollte "docker" enthalten
 * Falls nicht: usermod -aG docker radmin && newgrp docker
 */
const express     = require('express');
const router      = express.Router();
const { exec: execCb } = require('child_process');
const requireAuth = require('../../../middleware/requireAuth');
const updates     = require('../../../services/containerUpdates');

const execAsync = (cmd) => new Promise((res, rej) =>
  execCb(cmd, { timeout: 15000 }, (e, o, er) => e ? rej(er || e.message) : res(o.trim()))
);

// Whitelist: nur alphanumerische Container-IDs/Namen
const SAFE_ID = /^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,63}$/;

// GET /api/it/docker — alle Container + Stats
router.get('/', requireAuth, async (req, res) => {
  try {
    const psOut = await execAsync("docker ps -a --format '{{json .}}'");
    const containers = psOut.split('\n').filter(Boolean).map(l => JSON.parse(l));

    // Stats nur für laufende Container
    let stats = {};
    try {
      const stOut = await execAsync("docker stats --no-stream --format '{{json .}}'");
      stOut.split('\n').filter(Boolean).forEach(l => {
        const o = JSON.parse(l);
        const id = (o.ID || '').substring(0, 12);
        if (id) stats[id] = o;
      });
    } catch {}

    res.json({
      ok: true,
      containers: containers.map(c => {
        const id12 = (c.ID || '').substring(0, 12);
        const st   = stats[id12] || {};
        return {
          id:     id12,
          name:   (c.Names  || '').replace(/^\//, ''),
          image:  c.Image   || '',
          state:  c.State   || '',
          status: c.Status  || '',
          ports:  c.Ports   || '',
          cpu:    st.CPUPerc  || '–',
          mem:    st.MemUsage || '–',
        };
      }),
    });
  } catch (e) {
    res.json({ ok: false, error: e.message });
  }
});

// GET /api/it/docker/logs?id=xxx&lines=150
router.get('/logs', requireAuth, async (req, res) => {
  const id    = (req.query.id || '').trim();
  const lines = Math.min(parseInt(req.query.lines) || 150, 500);
  if (!SAFE_ID.test(id)) return res.json({ ok: false, error: 'Ungültige Container-ID' });
  try {
    const logs = await execAsync(`docker logs ${id} --tail ${lines} 2>&1`);
    res.json({ ok: true, logs });
  } catch (e) { res.json({ ok: false, error: e.message }); }
});

// POST /api/it/docker/action — start / stop / restart
router.post('/action', requireAuth, async (req, res) => {
  const { action, id } = req.body;
  if (!['start', 'stop', 'restart'].includes(action))
    return res.json({ ok: false, error: 'Ungültige Aktion' });
  if (!SAFE_ID.test(id))
    return res.json({ ok: false, error: 'Ungültige Container-ID' });
  try {
    await execAsync(`docker ${action} ${id}`);
    res.json({ ok: true });
  } catch (e) { res.json({ ok: false, error: e.message }); }
});

// ── Updates (#396) ───────────────────────────────────────────────────

// GET /api/it/docker/updates — Ergebnis der letzten Pruefung (aelter als 12 h: neue startet im Hintergrund)
router.get('/updates', requireAuth, (req, res) => {
  res.json({ ok: true, ...updates.status() });
});

// POST /api/it/docker/updates/check — jetzt pruefen (laeuft im Hintergrund)
router.post('/updates/check', requireAuth, (req, res) => {
  updates.pruefen();
  res.json({ ok: true, ...updates.status() });
});

// POST /api/it/docker/update { name } — neues Image fuer den gleichen Tag einspielen
router.post('/update', requireAuth, async (req, res) => {
  const name = String(req.body?.name || '').trim();
  if (!SAFE_ID.test(name)) return res.status(400).json({ ok: false, error: 'Ungültiger Container-Name' });
  try {
    const u = req.session.user || {};
    const job = await updates.updateStarten(name, u.fullName || u.username);
    res.json({ ok: true, job });
  } catch (e) { res.status(e.status || 500).json({ ok: false, error: e.message }); }
});

// GET /api/it/docker/update/:id — Fortschritt eines Updates
router.get('/update/:id', requireAuth, (req, res) => {
  const job = updates.updateJob(req.params.id);
  if (!job) return res.status(404).json({ ok: false, error: 'Update unbekannt (Portal neu gestartet?)' });
  res.json({ ok: true, job });
});

module.exports = router;
