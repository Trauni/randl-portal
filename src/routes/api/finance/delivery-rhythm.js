const router = require('express').Router();
const { shopFetch } = require('./shopClient');

router.get('/', async (req, res) => {
  try {
    const upstream = await shopFetch('/admin/delivery-rhythm');
    const data = await upstream.json();
    res.status(upstream.status).json(data);
  } catch (err) { res.status(500).json({ error: 'Shop-API nicht erreichbar' }); }
});

router.put('/:customerId', async (req, res) => {
  try {
    const u = req.session.user || {};
    const body = { ...req.body, updated_by: u.fullName || u.username || req.body.updated_by || null };
    const upstream = await shopFetch('/admin/delivery-rhythm/' + req.params.customerId, { method: 'PUT', body: JSON.stringify(body) });
    const data = await upstream.json();
    res.status(upstream.status).json(data);
  } catch (err) { res.status(500).json({ error: 'Shop-API nicht erreichbar' }); }
});

router.delete('/:customerId', async (req, res) => {
  try {
    const upstream = await shopFetch('/admin/delivery-rhythm/' + req.params.customerId, { method: 'DELETE' });
    const data = await upstream.json();
    res.status(upstream.status).json(data);
  } catch (err) { res.status(500).json({ error: 'Shop-API nicht erreichbar' }); }
});

router.post('/:customerId/send', async (req, res) => {
  try {
    const upstream = await shopFetch('/admin/delivery-rhythm/' + req.params.customerId + '/send', { method: 'POST', body: JSON.stringify(req.body) });
    const data = await upstream.json();
    res.status(upstream.status).json(data);
  } catch (err) { res.status(500).json({ error: 'Shop-API nicht erreichbar' }); }
});

module.exports = router;
