// #249 Preis-Tool: Gas-Artikel (RG-/NRG-) aus dem admin-backend-Cache,
// zusammengeführt mit dem Inhalt aus der Portal-DB (gas_article_content, #251).
// #617: Der Inhalt kommt aus der Füllmenge des Artikelstamms (eine Quelle); gas_article_content gilt nur noch, wo der Stamm keine hat.
// Gemeinsam genutzt von article-content (Inhalt pflegen) und price-tool (Vorschau/Push).

const { getPool } = require('../db');
const { shopFetch } = require('../routes/api/finance/shopClient');
const { isPriceToolArticle, inhaltFuer } = require('../utils/gasContent');

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
  const [stammRows] = await getPool().query('SELECT artikel_nr, fuellmenge, fuellmenge_einheit FROM gas_artikel WHERE fuellmenge IS NOT NULL AND fuellmenge_einheit IS NOT NULL');
  const stammNachNr = new Map(stammRows.map(r => [String(r.artikel_nr), r]));

  return {
    cachedAt: data.cachedAt || null,
    articles: articles.map(a => ({ ...a, content: inhaltFuer(a, byId.get(a.id), stammNachNr) })),
  };
}

module.exports = { loadGasArticles };
