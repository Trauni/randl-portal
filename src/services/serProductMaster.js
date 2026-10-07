// #260 (07.10.2026): SER-Produktstamm importieren und mit den Lexware-Gasartikeln abgleichen.
// Grundlage für den Preis-Push nach SER (#261): dort werden alle Felder aus `record`
// unverändert mitgeschickt, nur der Preis ändert sich.

const { getPool } = require('../db');
const { loadGasArticles } = require('./gasArticles');
const { readSerExport } = require('../utils/serProductCsv');
const { matchSerProducts } = require('../utils/serProductMatch');

const parseJson = v => (typeof v === 'string' ? JSON.parse(v) : v);

/**
 * Export einlesen und den Bestand in ser_product_master komplett ersetzen.
 * Übernommen werden nur Produkte mit RG-Gegenstück in Lexware.
 */
async function importSerExport(buffer, sourceFile, user = {}) {
  const parsed = readSerExport(buffer);
  const { articles } = await loadGasArticles();
  const match = matchSerProducts(parsed.products, articles, parsed.inactive);
  if (match.matched.length === 0) {
    throw Object.assign(new Error('Kein SER-Produkt passt zu einem RG-Artikel in Lexware – falsche Datei?'), { status: 400 });
  }

  const articleIdByNr = new Map(match.matched.map(m => [m.prodnr, m.id]));
  const toStore = parsed.products.filter(p => articleIdByNr.has(p.prodnr));

  const conn = await getPool().getConnection();
  try {
    await conn.beginTransaction();
    const [ins] = await conn.execute(
      `INSERT INTO ser_product_imports
         (source_file, rows_total, products_total, stored_total, details, imported_by, imported_by_name)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [String(sourceFile || 'unbekannt').slice(0, 255), parsed.stats.rows, parsed.products.length, toStore.length,
        JSON.stringify({ warnings: parsed.warnings, inactive: parsed.inactive, stats: parsed.stats }),
        user.id || null, user.fullName || user.username || null]
    );
    const importId = ins.insertId;

    await conn.query('DELETE FROM ser_product_master');
    await conn.query(
      `INSERT INTO ser_product_master (prodnr, lexware_article_id, name, preis_cent, record, import_id) VALUES ?`,
      [toStore.map(p => [p.prodnr, articleIdByNr.get(p.prodnr), p.name.slice(0, 255), p.preis,
        JSON.stringify(p.record), importId])]
    );
    await conn.commit();
    console.log('[SerImport]', sourceFile, toStore.length, 'von', parsed.products.length, 'Produkten übernommen, von', user.username);
    return importId;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

/** Letzter Import und Abgleich des gespeicherten Bestands mit den aktuellen Lexware-Artikeln. */
async function getSerImportStatus() {
  const db = getPool();
  const [imports] = await db.execute(
    `SELECT id, source_file, rows_total, products_total, stored_total, details, imported_by_name, created_at
       FROM ser_product_imports ORDER BY id DESC LIMIT 1`
  );
  if (!imports[0]) return { lastImport: null };
  const last = imports[0];
  const details = parseJson(last.details) || {};

  const [rows] = await db.execute('SELECT prodnr, name, preis_cent, record FROM ser_product_master');
  const serProducts = rows.map(r => ({
    prodnr: r.prodnr, name: r.name, preis: r.preis_cent, inhalt: parseJson(r.record).inhalt ?? null,
  }));
  const { articles, cachedAt } = await loadGasArticles();
  const match = matchSerProducts(serProducts, articles, details.inactive || []);

  return {
    lastImport: {
      id: last.id,
      sourceFile: last.source_file,
      rowsTotal: last.rows_total,
      productsTotal: last.products_total,
      storedTotal: last.stored_total,
      importedBy: last.imported_by_name,
      importedAt: last.created_at,
      warnings: details.warnings || [],
    },
    cachedAt,
    matched: match.matched,
    withoutSer: match.withoutSer,
    summary: match.summary,
  };
}

module.exports = { importSerExport, getSerImportStatus };
