'use strict';
/**
 * /api/it/cloudflare
 * Cloudflare DNS Manager — vollständiges CRUD + Bulk-TTL + Cache Purge
 * Token: CF_TOKEN in .env
 */
const express     = require('express');
const router      = express.Router();
const requireAuth = require('../../../middleware/requireAuth');

async function cfFetch(route, method = 'GET', body = null) {
  const token = process.env.CF_TOKEN;
  if (!token) throw new Error('CF_TOKEN nicht in .env gesetzt');
  const opts = {
    method,
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
  };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(`https://api.cloudflare.com/client/v4${route}`, opts);
  return r.json();
}

// GET /api/it/cloudflare/zones
router.get('/zones', requireAuth, async (req, res) => {
  try {
    const r = await cfFetch('/zones?per_page=50&order=name');
    res.json({
      ok:     r.success,
      zones:  (r.result || []).map(z => ({ id: z.id, name: z.name, status: z.status })),
      errors: r.errors || [],
    });
  } catch (e) { res.json({ ok: false, error: e.message }); }
});

// GET /api/it/cloudflare/records?zone_id=xxx
router.get('/records', requireAuth, async (req, res) => {
  const { zone_id } = req.query;
  if (!zone_id) return res.json({ ok: false, error: 'zone_id fehlt' });
  try {
    const r = await cfFetch(`/zones/${zone_id}/dns_records?per_page=100&order=type`);
    res.json({ ok: r.success, records: r.result || [], errors: r.errors || [] });
  } catch (e) { res.json({ ok: false, error: e.message }); }
});

// POST /api/it/cloudflare/records — Record hinzufügen
router.post('/records', requireAuth, async (req, res) => {
  const { zone_id, type, name, content, ttl } = req.body;
  if (!zone_id || !type || !name || !content) return res.json({ ok: false, error: 'Pflichtfelder fehlen' });
  try {
    const r = await cfFetch(`/zones/${zone_id}/dns_records`, 'POST', {
      type, name, content, ttl: parseInt(ttl) || 300, proxied: false,
    });
    res.json({ ok: r.success, record: r.result, errors: r.errors || [] });
  } catch (e) { res.json({ ok: false, error: e.message }); }
});

// PATCH /api/it/cloudflare/records/:id — Record bearbeiten
router.patch('/records/:id', requireAuth, async (req, res) => {
  const { zone_id, type, name, content, ttl, proxied } = req.body;
  if (!zone_id) return res.json({ ok: false, error: 'zone_id fehlt' });
  try {
    const r = await cfFetch(`/zones/${zone_id}/dns_records/${req.params.id}`, 'PATCH', {
      type, name, content, ttl: parseInt(ttl) || 300, proxied: !!proxied,
    });
    res.json({ ok: r.success, errors: r.errors || [] });
  } catch (e) { res.json({ ok: false, error: e.message }); }
});

// DELETE /api/it/cloudflare/records/:id
router.delete('/records/:id', requireAuth, async (req, res) => {
  const { zone_id } = req.body;
  if (!zone_id) return res.json({ ok: false, error: 'zone_id fehlt' });
  try {
    const r = await cfFetch(`/zones/${zone_id}/dns_records/${req.params.id}`, 'DELETE');
    res.json({ ok: !!(r.result?.id) });
  } catch (e) { res.json({ ok: false, error: e.message }); }
});

// POST /api/it/cloudflare/bulk-ttl
router.post('/bulk-ttl', requireAuth, async (req, res) => {
  const { zone_id, ttl, mx_ttl } = req.body;
  if (!zone_id) return res.json({ ok: false, error: 'zone_id fehlt' });
  try {
    const all = await cfFetch(`/zones/${zone_id}/dns_records?per_page=100`);
    const results = [];
    for (const rec of (all.result || [])) {
      const t = rec.type === 'MX' ? parseInt(mx_ttl) || 60 : parseInt(ttl) || 300;
      const r = await cfFetch(`/zones/${zone_id}/dns_records/${rec.id}`, 'PATCH', {
        type: rec.type, name: rec.name, content: rec.content, ttl: t, proxied: rec.proxied || false,
      });
      results.push({ name: rec.name, type: rec.type, ok: r.success });
    }
    res.json({ ok: true, results });
  } catch (e) { res.json({ ok: false, error: e.message }); }
});

// POST /api/it/cloudflare/purge-cache
router.post('/purge-cache', requireAuth, async (req, res) => {
  const { zone_id } = req.body;
  if (!zone_id) return res.json({ ok: false, error: 'zone_id fehlt' });
  try {
    const r = await cfFetch(`/zones/${zone_id}/purge_cache`, 'POST', { purge_everything: true });
    res.json({ ok: r.success, errors: r.errors || [] });
  } catch (e) { res.json({ ok: false, error: e.message }); }
});

module.exports = router;
