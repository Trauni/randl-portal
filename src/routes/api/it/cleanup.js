'use strict';
// /home/radmin/web/randlweb.de/public_html/portal/src/routes/api/it/cleanup.js

const express      = require('express');
const router       = express.Router();
const fs           = require('fs').promises;
const { exec: execCb } = require('child_process');
const requireAuth  = require('../../../middleware/requireAuth');

const CLEANUP_SCRIPT = '/opt/scripts/cleanup.sh';
const RESULT_FILE    = '/opt/scripts/cleanup-result.json';

const execAsync = (cmd, timeout = 120000) =>
  new Promise((resolve, reject) =>
    execCb(cmd, { timeout, shell: '/bin/bash', maxBuffer: 4 * 1024 * 1024 },
      (err, stdout, stderr) => err ? reject(stderr || err.message) : resolve(stdout)
    )
  );

const isAdmin = (req) => {
  const groups = req.session?.user?.groups || [];
  return groups.some(g => ['Geschäftsführung', 'Backoffice'].includes(g));
};

// GET /api/it/cleanup/result
router.get('/result', requireAuth, async (req, res) => {
  try {
    const raw = await fs.readFile(RESULT_FILE, 'utf-8');
    res.json(JSON.parse(raw));
  } catch {
    res.json(null);
  }
});

// POST /api/it/cleanup/run  (Admin only)
router.post('/run', requireAuth, async (req, res) => {
  if (!isAdmin(req)) return res.status(403).json({ error: 'Nur Admins dürfen Cleanup starten.' });
  try {
    await execAsync(`chmod +x ${CLEANUP_SCRIPT}`, 5000);
    const output = await execAsync(`bash ${CLEANUP_SCRIPT}`, 120000);
    try {
      const data = JSON.parse(await fs.readFile(RESULT_FILE, 'utf-8'));
      data.output = output;
      return res.json(data);
    } catch {
      return res.json({ output });
    }
  } catch (err) {
    return res.status(500).json({ error: String(err) });
  }
});

module.exports = router;
