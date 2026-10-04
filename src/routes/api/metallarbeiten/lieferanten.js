const express = require('express');
const router = express.Router();
const requireAuth = require('../../../middleware/requireAuth');
const requireArea = require('../../../middleware/requireArea');
const { shopFetch } = require('../finance/shopClient');

router.get('/', requireAuth, requireArea('metallarbeiten.lieferantenauftrag'), async (req, res) => {
  try {
    const q = req.query.q || '';
    const response = await shopFetch(`/admin/vendors?q=${encodeURIComponent(q)}`);
    const data = await response.json();
    res.json(data);
  } catch (err) {
    console.error('Lieferanten-Suche fehlgeschlagen:', err);
    res.status(502).json({ error: 'Lieferantensuche derzeit nicht verfügbar' });
  }
});

module.exports = router;
