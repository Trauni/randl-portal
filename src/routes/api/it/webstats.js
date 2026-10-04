'use strict';
/**
 * GET /api/it/webstats
 * Hestia API → Domain-Liste + AWStats-Daten pro Domain
 * Credentials: HESTIA_KEY_ID + HESTIA_KEY_SECRET in .env
 */
const express     = require('express');
const router      = express.Router();
const https       = require('https');
const fs          = require('fs');
const path        = require('path');
const requireAuth = require('../../../middleware/requireAuth');

async function hestiaReq(cmd, args = []) {
  const keyId     = process.env.HESTIA_KEY_ID;
  const keySecret = process.env.HESTIA_KEY_SECRET;
  if (!keyId || !keySecret) throw new Error('HESTIA_KEY_ID / HESTIA_KEY_SECRET nicht in .env gesetzt');

  const params = [`access_key=${encodeURIComponent(keyId)}`, `secret_key=${encodeURIComponent(keySecret)}`, `cmd=${cmd}`];
  args.forEach((a, i) => params.push(`arg${i + 1}=${encodeURIComponent(a)}`));
  const qs = params.join('&');

  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: '127.0.0.1', port: 8083, path: '/api/index.php', method: 'POST',
      rejectUnauthorized: false,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(qs) }
    }, res => {
      let b = '';
      res.on('data', d => b += d);
      res.on('end', () => { try { resolve(JSON.parse(b)); } catch { resolve({}); } });
    });
    req.on('error', reject);
    req.write(qs);
    req.end();
  });
}

function parseAwstats(file) {
  try {
    const lines = fs.readFileSync(file, 'utf8').split('\n');
    const get   = key => { const l = lines.find(x => x.startsWith(key + ' ')); return l ? parseInt(l.split(' ')[1]) || 0 : 0; };
    return { visits: get('TotalVisits'), unique: get('TotalUnique') };
  } catch { return { visits: 0, unique: 0 }; }
}

router.get('/', requireAuth, async (req, res) => {
  try {
    const data = await hestiaReq('v-list-web-domains', ['radmin', 'json']);
    const now  = new Date();
    const ym   = String(now.getMonth() + 1).padStart(2, '0') + String(now.getFullYear());

    const domains = Object.entries(data).map(([domain, info]) => {
      const statsFile = `/home/radmin/web/${domain}/stats/awstats${ym}.${domain}.txt`;
      const aws = parseAwstats(statsFile);
      return {
        domain,
        ssl:    info.SSL === 'yes',
        tpl:    info.TPL || '–',
        disk:   info.U_DISK || 0,
        bw:     info.U_BANDWIDTH || 0,
        visits: aws.visits,
        unique: aws.unique,
      };
    }).sort((a, b) => b.visits - a.visits);

    const month = now.toLocaleDateString('de-DE', { month: 'long', year: 'numeric' });
    res.json({ ok: true, domains, month, total: domains.length });
  } catch (e) {
    res.json({ ok: false, error: e.message });
  }
});

module.exports = router;
