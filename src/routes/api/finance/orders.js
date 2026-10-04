const router = require('express').Router();
// Rechtepruefung sitzt am Mount-Punkt in server.js: requireArea('gashandel')
const { shopFetch } = require('./shopClient');

router.get('/', async (req, res) => {
  try {
    const params = new URLSearchParams();
    if (req.query.derived_status) params.set('derived_status', req.query.derived_status);
    if (req.query.period)         params.set('period', req.query.period);
    if (req.query.q)              params.set('q', req.query.q);
    const upstream = await shopFetch('/admin/webshop-orders?' + params.toString());
    const data = await upstream.json();
    res.status(upstream.status).json(data);
  } catch (err) {
    console.error('[Finance/Orders] GET error:', err);
    res.status(500).json({ error: 'Shop-API nicht erreichbar' });
  }
});

router.get('/customer/:customerId/delivery-addresses', async (req, res) => {
  try {
    const upstream = await shopFetch('/admin/customers/' + req.params.customerId + '/delivery-addresses');
    const data = await upstream.json();
    res.status(upstream.status).json(data);
  } catch (err) {
    res.status(500).json({ error: 'Shop-API nicht erreichbar' });
  }
});

router.post('/', async (req, res) => {
  try {
    const upstream = await shopFetch('/admin/webshop-orders', { method: 'POST', body: JSON.stringify(req.body) });
    const data = await upstream.json();
    res.status(upstream.status).json(data);
  } catch (err) { res.status(500).json({ error: 'Shop-API nicht erreichbar' }); }
});

router.put('/:id', async (req, res) => {
  try {
    const upstream = await shopFetch('/admin/webshop-orders/' + req.params.id, { method: 'PUT', body: JSON.stringify(req.body) });
    const data = await upstream.json();
    res.status(upstream.status).json(data);
  } catch (err) { res.status(500).json({ error: 'Shop-API nicht erreichbar' }); }
});

router.delete('/:id', async (req, res) => {
  try {
    const upstream = await shopFetch('/admin/webshop-orders/' + req.params.id, { method: 'DELETE' });
    const data = await upstream.json();
    res.status(upstream.status).json(data);
  } catch (err) { res.status(500).json({ error: 'Shop-API nicht erreichbar' }); }
});

router.post('/:id/generate-xml', async (req, res) => {
  try {
    const force = req.query.force === 'true' ? '?force=true' : '';
    const upstream = await shopFetch('/admin/ser/upload/' + req.params.id + force, { method: 'POST' });
    const data = await upstream.json();
    res.status(upstream.status).json(data);
  } catch (err) { res.status(500).json({ error: 'Shop-API nicht erreichbar' }); }
});

router.post('/:id/push-lexware', async (req, res) => {
  try {
    const upstream = await shopFetch('/admin/webshop-orders/' + req.params.id + '/push-lexware', { method: 'POST' });
    const data = await upstream.json();
    res.status(upstream.status).json(data);
  } catch (err) { res.status(500).json({ error: 'Shop-API nicht erreichbar' }); }
});

router.patch('/:id/done', async (req, res) => {
  try {
    const upstream = await shopFetch('/admin/webshop-orders/' + req.params.id + '/done', { method: 'PATCH' });
    const data = await upstream.json();
    res.status(upstream.status).json(data);
  } catch (err) { res.status(500).json({ error: 'Shop-API nicht erreichbar' }); }
});

module.exports = router;

router.post('/mass-ser', async (req, res) => {
  const { ids } = req.body;
  if (!Array.isArray(ids) || ids.length === 0)
    return res.status(400).json({ error: 'ids[] erforderlich' });
  try {
    const upstream = await shopFetch('/admin/ser/bulk-upload', {
      method: 'POST',
      body: JSON.stringify({ orderIds: ids })
    });
    const data = await upstream.json();
    res.status(upstream.status).json(data);
  } catch(err) {
    console.error('[Finance/Orders] mass-ser error:', err);
    res.status(500).json({ error: 'Shop-API nicht erreichbar' });
  }
});
