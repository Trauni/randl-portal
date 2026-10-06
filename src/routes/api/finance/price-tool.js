const router = require('express').Router();
// Rechtepruefung sitzt am Mount-Punkt in server.js: requireArea('gashandel.preise') (#250)
const { loadGasArticles } = require('../../../services/gasArticles');
const { applyRule } = require('../../../utils/priceRule');

// #253 (06.10.2026): Vorschau einer Preisregel für ausgewählte Gas-Artikel.
// Schreibt nichts – Übernahme nach Lexware erst nach ausdrücklicher Bestätigung (#254).
// Gerechnet wird immer auf frisch geladenen Daten, nicht auf Werten aus dem Browser.

// POST /api/finance/price-tool/preview   { articleIds: [...], rule: {...} }
router.post('/preview', async (req, res) => {
  const { articleIds, rule } = req.body || {};
  if (!Array.isArray(articleIds) || articleIds.length === 0) {
    return res.status(400).json({ error: 'Keine Artikel ausgewählt' });
  }
  try {
    const { articles, cachedAt } = await loadGasArticles();
    const wanted = new Set(articleIds);
    const chosen = articles.filter(a => wanted.has(a.id));
    const unknown = articleIds.filter(id => !chosen.some(a => a.id === id));

    const rows = applyRule(chosen, rule).sort((x, y) => x.articleNumber.localeCompare(y.articleNumber));
    const ok = rows.filter(r => r.status === 'ok');
    const same = rows.filter(r => r.status === 'same').length;
    res.json({
      rule,
      cachedAt,
      rows,
      unknown,
      summary: {
        selected: articleIds.length,
        changed: ok.length,
        same,
        skipped: rows.length - ok.length - same + unknown.length,
        diffNetTotal: Math.round(ok.reduce((s, r) => s + (r.diff || 0), 0) * 100) / 100,
      },
    });
  } catch (err) {
    console.error('[PriceTool] preview error:', err.message);
    res.status(err.status || 500).json({ error: err.message });
  }
});

module.exports = router;
