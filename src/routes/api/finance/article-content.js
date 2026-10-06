const router = require('express').Router();
// Lesen: requireArea('gashandel') am Mount-Punkt in server.js.
// Schreiben (Vorbefüllen, Pflegen): zusätzlich gashandel.preise (#250).
const requireArea = require('../../../middleware/requireArea');
const { getPool } = require('../../../db');
const { parseContentFromTitle } = require('../../../utils/gasContent');
const { loadGasArticles: loadArticles } = require('../../../services/gasArticles');

// #251 (06.10.2026): Inhalt (Wert + Einheit kg/L) pro Gas-Artikel für das
// Preis-Tool (#249). Lexware bleibt führend für Titel und Preise; der Inhalt
// liegt in der Portal-DB (gas_article_content). Einmalig aus dem Titel
// vorbefüllt (source 'auto'), danach gilt das Feld, nicht mehr der Titel.

const PREISE = requireArea('gashandel.preise');

// GET /api/finance/article-content
router.get('/', async (req, res) => {
  try {
    const { articles, cachedAt } = await loadArticles();
    res.json({
      articles,
      cachedAt,
      missing: articles.filter(a => !a.content).length,
    });
  } catch (err) {
    console.error('[ArticleContent] GET error:', err.message);
    res.status(err.status || 500).json({ error: err.message });
  }
});

// POST /api/finance/article-content/prefill
// Füllt nur Artikel ohne Eintrag aus dem Titel; vorhandene (auch manuelle) bleiben unberührt.
router.post('/prefill', PREISE, async (req, res) => {
  try {
    const { articles } = await loadArticles();
    const todo = articles.filter(a => !a.content);
    const filled = [];
    const unrecognized = [];
    for (const a of todo) {
      const parsed = parseContentFromTitle(a.name);
      if (!parsed) {
        unrecognized.push({ id: a.id, articleNumber: a.articleNumber, name: a.name });
        continue;
      }
      await getPool().execute(
        `INSERT IGNORE INTO gas_article_content
           (lexware_article_id, article_number, title_snapshot, content_value, content_unit, source, updated_by)
         VALUES (?, ?, ?, ?, ?, 'auto', ?)`,
        [a.id, a.articleNumber, a.name, parsed.value, parsed.unit, req.session.user.id || null]
      );
      filled.push({ articleNumber: a.articleNumber, value: parsed.value, unit: parsed.unit });
    }
    console.log('[ArticleContent] Vorbefüllt:', filled.length, 'erkannt,', unrecognized.length, 'nicht erkannt');
    res.json({ filled, unrecognized });
  } catch (err) {
    console.error('[ArticleContent] prefill error:', err.message);
    res.status(err.status || 500).json({ error: err.message });
  }
});

// PUT /api/finance/article-content/:id   { value, unit }  – manuell pflegen
// value null/leer entfernt den Inhalt wieder.
router.put('/:id', PREISE, async (req, res) => {
  const { id } = req.params;
  let { value, unit, articleNumber, name } = req.body || {};
  if (!/^[0-9a-f-]{36}$/i.test(id)) return res.status(400).json({ error: 'Ungültige Artikel-ID' });

  try {
    if (value === null || value === '' || value === undefined) {
      await getPool().execute('DELETE FROM gas_article_content WHERE lexware_article_id = ?', [id]);
      return res.json({ success: true, content: null });
    }
    value = parseFloat(String(value).replace(',', '.'));
    if (!(value > 0) || value > 100000) return res.status(400).json({ error: 'Inhalt muss eine positive Zahl sein' });
    if (unit !== 'kg' && unit !== 'L') return res.status(400).json({ error: 'Einheit muss kg oder L sein' });

    await getPool().execute(
      `INSERT INTO gas_article_content
         (lexware_article_id, article_number, title_snapshot, content_value, content_unit, source, updated_by)
       VALUES (?, ?, ?, ?, ?, 'manuell', ?)
       ON DUPLICATE KEY UPDATE
         article_number = COALESCE(VALUES(article_number), article_number),
         title_snapshot = COALESCE(VALUES(title_snapshot), title_snapshot),
         content_value = VALUES(content_value), content_unit = VALUES(content_unit),
         source = 'manuell', updated_by = VALUES(updated_by)`,
      [id, articleNumber || null, name || null, value, unit, req.session.user.id || null]
    );
    res.json({ success: true, content: { value, unit, source: 'manuell' } });
  } catch (err) {
    console.error('[ArticleContent] PUT error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
