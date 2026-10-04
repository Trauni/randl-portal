// Proxy: Portal → Admin-Backend Port 3002
const express = require('express');
const router = express.Router();
const requireAuth = require('../../../middleware/requireAuth');

router.get('/', requireAuth, async (req, res) => {
  try {
    const response = await fetch('http://127.0.0.1:3002/admin/products');
    if (!response.ok) throw new Error(`Admin-Backend: ${response.status}`);
    const data = await response.json();
    res.json(data);
  } catch (e) {
    console.error('[shop-products]', e.message);
    res.status(502).json({ error: e.message });
  }
});

module.exports = router;
