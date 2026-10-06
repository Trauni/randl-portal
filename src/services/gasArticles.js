// #249 Preis-Tool: Gas-Artikel (RG-/NRG-) aus dem admin-backend-Cache,
// zusammengeführt mit dem Inhalt aus der Portal-DB (gas_article_content, #251).
// Gemeinsam genutzt von article-content (Inhalt pflegen) und price-tool (Vorschau/Push).

const { getPool } = require('../db');
const { shopFetch } = require('../routes/api/finance/shopClient');
const { isPriceToolArticle } = require('../utils/gasContent');

async function loadGasArticles() {
  const upstream = await shopFetch('/admin/products/all?prefix=RG-,NRG-');
  const data = await upstream.json();
  if (!upstream.ok || data.error) {
    const err = new Error(data.error || `Shop-API ${upstream.status}`);
    err.status = upstream.status >= 500 ? 502 : upstream.status;
    throw err;
  }
  const articles = (data.products || []).filter(p => isPriceToolArticle(p.articleNumber));

  const [rows] = await getPool().execute(
    'SELECT lexware_article_id, content_value, content_unit, source, updated_at FROM gas_article_content'
  );
  const byId = new Map(rows.map(r => [r.lexware_article_id, r]));

  return {
    cachedAt: data.cachedAt || null,
    articles: articles.map(a => {
      const c = byId.get(a.id);
      return {
        ...a,
        content: c && c.content_value != null
          ? { value: Number(c.content_value), unit: c.content_unit, source: c.source, updatedAt: c.updated_at }
          : null,
      };
    }),
  };
}

module.exports = { loadGasArticles };
