// Mitteilungen an Shop-Kunden (gasshop #283) – Durchreiche ans admin-backend.
// Gemountet unter /api/finance/news mit requireArea('gashandel').
const router = require('express').Router();
const { shopFetch } = require('./shopClient');

function userName(req) {
  const u = req.session.user || {};
  return u.fullName || u.username || null;
}

async function pass(res, upstream) {
  const data = await upstream.json().catch(() => ({}));
  res.status(upstream.status).json(data);
}

router.get('/', async (req, res) => {
  try { await pass(res, await shopFetch('/admin/news')); }
  catch (err) { res.status(500).json({ error: 'Shop-API nicht erreichbar' }); }
});

router.post('/', async (req, res) => {
  try { await pass(res, await shopFetch('/admin/news', { method: 'POST', body: JSON.stringify({ ...req.body, user: userName(req) }) })); }
  catch (err) { res.status(500).json({ error: 'Shop-API nicht erreichbar' }); }
});

router.put('/:id', async (req, res) => {
  try { await pass(res, await shopFetch('/admin/news/' + encodeURIComponent(req.params.id), { method: 'PUT', body: JSON.stringify({ ...req.body, user: userName(req) }) })); }
  catch (err) { res.status(500).json({ error: 'Shop-API nicht erreichbar' }); }
});

router.delete('/:id', async (req, res) => {
  try { await pass(res, await shopFetch('/admin/news/' + encodeURIComponent(req.params.id), { method: 'DELETE' })); }
  catch (err) { res.status(500).json({ error: 'Shop-API nicht erreichbar' }); }
});

module.exports = router;
