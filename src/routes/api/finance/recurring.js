const router = require('express').Router();
// Rechtepruefung sitzt am Mount-Punkt in server.js: requireArea('gashandel')
const { shopFetch } = require('./shopClient');

router.get('/', async (req, res) => {
  try {
    const upstream = await shopFetch('/admin/recurring-orders');
    const data = await upstream.json();
    res.status(upstream.status).json(data);
  } catch(err) { res.status(500).json({ error: 'Shop-API nicht erreichbar' }); }
});

router.post('/', async (req, res) => {
  try {
    const upstream = await shopFetch('/admin/recurring-orders', { method: 'POST', body: JSON.stringify(req.body) });
    const data = await upstream.json();
    res.status(upstream.status).json(data);
  } catch(err) { res.status(500).json({ error: 'Shop-API nicht erreichbar' }); }
});

router.put('/:id', async (req, res) => {
  try {
    const upstream = await shopFetch('/admin/recurring-orders/' + req.params.id, { method: 'PUT', body: JSON.stringify(req.body) });
    const data = await upstream.json();
    res.status(upstream.status).json(data);
  } catch(err) { res.status(500).json({ error: 'Shop-API nicht erreichbar' }); }
});

router.delete('/:id', async (req, res) => {
  try {
    const upstream = await shopFetch('/admin/recurring-orders/' + req.params.id, { method: 'DELETE' });
    const data = await upstream.json();
    res.status(upstream.status).json(data);
  } catch(err) { res.status(500).json({ error: 'Shop-API nicht erreichbar' }); }
});

router.post('/:id/send', async (req, res) => {
  try {
    const upstream = await shopFetch('/admin/recurring-orders/' + req.params.id + '/send', { method: 'POST' });
    const data = await upstream.json();
    res.status(upstream.status).json(data);
  } catch(err) { res.status(500).json({ error: 'Shop-API nicht erreichbar' }); }
});

module.exports = router;
