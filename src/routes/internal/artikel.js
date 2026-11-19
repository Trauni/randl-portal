// Interne, nur lesende API für den Gas-Shop (#610): Welche Artikel sind im Shop sichtbar? Hängt am internen Listener
// (server.js, nur über die gas-net-Bridge erreichbar) und braucht den Header x-internal-artikel-secret = INTERNAL_ARTIKEL_SECRET
// (eigenes Geheimnis, min. 32 Zeichen, gleicher Wert in der Shop-.env). Bis der Shop diese Route abfragt, ändert sich im Shop nichts.
const express = require('express');
const crypto = require('crypto');

const gleich = (a, b) => {
  const x = Buffer.from(String(a || '')); const y = Buffer.from(String(b || ''));
  return x.length === y.length && x.length > 0 && crypto.timingSafeEqual(x, y);
};

/** holeZeilen: async () => [{ artikel_nr, shop_sichtbar }] (Standard: gas_artikel). */
function erstelleArtikelRouter({ holeZeilen = async () => { const [rows] = await require('../../db').getPool().query('SELECT artikel_nr, shop_sichtbar FROM gas_artikel WHERE shop_sichtbar IS NOT NULL'); return rows; } } = {}) {
  const router = express.Router();
  router.use((req, res, next) => {
    const soll = process.env.INTERNAL_ARTIKEL_SECRET;
    if (!soll || soll.length < 32) return res.status(503).json({ error: 'Interne Artikel-API nicht eingerichtet' });
    if (!gleich(req.headers['x-internal-artikel-secret'], soll)) return res.status(401).json({ error: 'Unauthorized' });
    next();
  });

  // GET /internal/artikel/shop-sichtbar -> { stand, artikel: { "7801100": true, "7801200": false } }
  // Nur Artikel mit gesetztem Wert; für alle anderen gilt im Shop weiter das Lexware-Präfix.
  router.get('/shop-sichtbar', async (req, res) => {
    try {
      const zeilen = await holeZeilen();
      res.json({ stand: new Date().toISOString(), artikel: Object.fromEntries(zeilen.map((z) => [String(z.artikel_nr), Number(z.shop_sichtbar) === 1])) });
    } catch (err) {
      console.error('[Interne Artikel-API] shop-sichtbar:', err.message);
      res.status(500).json({ error: 'Artikel konnten nicht gelesen werden' });
    }
  });
  return router;
}

module.exports = { erstelleArtikelRouter };
