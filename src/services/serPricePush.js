// #261 (07.10.2026): Preise der ausgewählten RG-Artikel per STMUPD (PRODSTAMM) an SER senden.
// Neuer Preis = aktueller Lexware-Nettopreis (nach „Preise anpassen“, #254). Alle übrigen Felder
// kommen unverändert aus dem gespeicherten SER-Produktstamm (#260). Upload wie beim Kunden-Push
// per SFTP nach /Eingang; danach wird der gespeicherte Datensatz auf den neuen Preis gesetzt.

const crypto = require('crypto');
const { getPool } = require('../db');
const { loadGasArticles } = require('./gasArticles');
const { uploadStmupdToSer } = require('./ser-sftp');
const { formatTimestamp } = require('./ser-stmupd');
const { buildProdstammXml, buildFprodukt } = require('../utils/serProdstammXml');
const { serNumberFor } = require('../utils/serProductMatch');

const STALE_DAYS = 7;
const parseJson = v => (typeof v === 'string' ? JSON.parse(v) : v);

/** Was würde gesendet? Schreibt nichts. */
async function planSerPush(articleIds) {
  const { articles, cachedAt } = await loadGasArticles();
  const wanted = new Set(articleIds);
  const chosen = articles.filter(a => wanted.has(a.id));

  const db = getPool();
  const [masterRows] = chosen.length
    ? await db.query(
      'SELECT prodnr, lexware_article_id, preis_cent, record FROM ser_product_master WHERE lexware_article_id IN (?)',
      [chosen.map(a => a.id)])
    : [[]];
  const masterById = new Map(masterRows.map(m => [m.lexware_article_id, m]));
  const [imports] = await db.execute('SELECT source_file, created_at FROM ser_product_imports ORDER BY id DESC LIMIT 1');
  const lastImport = imports[0] || null;
  const importAgeDays = lastImport ? Math.floor((Date.now() - new Date(lastImport.created_at).getTime()) / 86400000) : null;

  const rows = chosen.map(a => {
    const row = { id: a.id, articleNumber: a.articleNumber, name: a.name, prodnr: null, oldCents: null, newCents: null };
    const m = masterById.get(a.id);
    if (!serNumberFor(a.articleNumber)) return { ...row, status: 'skip', reason: 'kein RG-Artikel – läuft nicht über SER' };
    if (!m) return { ...row, status: 'skip', reason: 'kein SER-Datensatz – Export einlesen' };
    const record = parseJson(m.record);
    row.prodnr = m.prodnr;
    row.serName = record.name;
    row.oldCents = m.preis_cent;
    if (a.netPrice == null) return { ...row, status: 'skip', reason: 'kein Preis in Lexware' };
    row.newCents = Math.round(a.netPrice * 100);
    if (row.newCents === row.oldCents) return { ...row, status: 'same' };
    try {
      buildFprodukt(record, row.newCents);   // prüft den Satz gegen die XSD-Regeln
    } catch (err) {
      return { ...row, status: 'error', reason: err.message };
    }
    return { ...row, status: 'ok', record };
  }).sort((x, y) => x.articleNumber.localeCompare(y.articleNumber));

  const ok = rows.filter(r => r.status === 'ok');
  const signature = ok.map(r => `${r.prodnr}:${r.newCents}`).sort().join(',');
  const xmlString = ok.length
    ? buildProdstammXml(ok.map(r => ({ record: r.record, newPreisCent: r.newCents })), { timestamp: '' }).xmlString
    : null;

  return {
    cachedAt,
    lastImport: lastImport && { sourceFile: lastImport.source_file, importedAt: lastImport.created_at,
      ageDays: importAgeDays, stale: importAgeDays >= STALE_DAYS },
    rows: rows.map(({ record, ...r }) => r),
    unknown: articleIds.filter(id => !chosen.some(a => a.id === id)),
    summary: {
      selected: articleIds.length,
      send: ok.length,
      same: rows.filter(r => r.status === 'same').length,
      skipped: rows.filter(r => r.status === 'skip').length,
      errors: rows.filter(r => r.status === 'error').length,
    },
    signature,
    xmlString,
    _ok: ok,
  };
}

/** Datei bauen, nach SER hochladen, protokollieren, gespeicherten Stand nachziehen. */
async function pushPricesToSer(articleIds, expectedSignature, user = {}) {
  const plan = await planSerPush(articleIds);
  const { _ok: ok, ...preview } = plan;
  if (ok.length === 0) throw Object.assign(new Error('Keine Preise an SER zu senden'), { status: 400 });
  if (expectedSignature !== plan.signature) {
    throw Object.assign(new Error('Daten haben sich seit der Vorschau geändert – bitte prüfen und erneut senden'),
      { status: 409, preview });
  }

  const { xml, filename } = buildProdstammXml(ok.map(r => ({ record: r.record, newPreisCent: r.newCents })),
    { versorgernr: process.env.SER_VERSORGER_NR || '0070', timestamp: formatTimestamp(new Date()) });

  const db = getPool();
  const pushId = crypto.randomUUID();
  const log = (r, status, reason) => db.execute(
    `INSERT INTO price_change_log
       (job_id, target, lexware_article_id, article_number, article_name, rule_text, old_net, new_net, status, reason, changed_by, changed_by_name)
     VALUES (?, 'ser', ?, ?, ?, 'Push SER', ?, ?, ?, ?, ?, ?)`,
    [pushId, r.id, r.articleNumber, r.name, r.oldCents == null ? null : r.oldCents / 100, r.newCents / 100,
      status, reason, user.id || null, user.fullName || user.username || null]
  );

  try {
    await uploadStmupdToSer(xml, filename);
  } catch (err) {
    for (const r of ok) await log(r, 'error', `${filename}: ${err.message}`.slice(0, 500));
    throw Object.assign(new Error('Upload zu SER fehlgeschlagen: ' + err.message), { status: 502 });
  }

  for (const r of ok) {
    await log(r, 'ok', filename);
    await db.execute(
      `UPDATE ser_product_master SET preis_cent = ?, record = JSON_SET(record, '$.preis', ?) WHERE prodnr = ?`,
      [r.newCents, r.newCents, r.prodnr]
    );
  }
  console.log('[SerPricePush]', filename, ok.length, 'Produkte, von', user.username);
  return { filename, sent: ok.map(r => ({ articleNumber: r.articleNumber, prodnr: r.prodnr, oldCents: r.oldCents, newCents: r.newCents })) };
}

module.exports = { planSerPush, pushPricesToSer };
