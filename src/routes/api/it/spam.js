'use strict';
/**
 * GET /api/it/spam
 * Liest spam-data.json (wird vom Cron /opt/scripts/spam-stats.sh geschrieben)
 * Pfad: SPAM_DATA_FILE in .env (default: /home/radmin/web/randlweb.de/public_html/system/spam-data.json)
 */
const express     = require('express');
const router      = express.Router();
const fs          = require('fs');
const requireAuth = require('../../../middleware/requireAuth');

const SPAM_FILE = process.env.SPAM_DATA_FILE
  || '/home/radmin/web/randlweb.de/public_html/system/spam-data.json';

router.get('/', requireAuth, (req, res) => {
  try {
    if (!fs.existsSync(SPAM_FILE)) {
      return res.json({ ok: false, error: `spam-data.json nicht gefunden: ${SPAM_FILE}` });
    }
    const data   = JSON.parse(fs.readFileSync(SPAM_FILE, 'utf8'));
    const stat   = fs.statSync(SPAM_FILE);
    const ageMin = Math.round((Date.now() - stat.mtimeMs) / 60000);
    res.json({ ok: true, data, ageMin });
  } catch (e) {
    res.json({ ok: false, error: e.message });
  }
});

module.exports = router;
