const router = require('express').Router();
// Rechtepruefung sitzt am Mount-Punkt in server.js: requireArea('gashandel')
const { shopFetch } = require('./shopClient');

router.get('/', async (req, res) => {
  try {
    const params = new URLSearchParams();
    if (req.query.q) params.set('q', req.query.q);
    const upstream = await shopFetch('/admin/products?' + params);
    const data = await upstream.json();
    if (data.error) return res.status(upstream.status).json(data);
    // Nur RG- Artikel
    const filtered = (data.products || []).filter(p =>
      p.articleNumber && p.articleNumber.startsWith('RG-')
    );
    res.json({ products: filtered });
  } catch (err) {
    console.error('[Finance/Products] GET error:', err);
    res.status(500).json({ error: 'Shop-API nicht erreichbar' });
  }
});

module.exports = router;
