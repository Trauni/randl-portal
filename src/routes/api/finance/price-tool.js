const router = require('express').Router();
const multer = require('multer');
// Rechtepruefung sitzt am Mount-Punkt in server.js: requireArea('gashandel.preise') (#250)
const { getPool } = require('../../../db');
const { shopFetch } = require('./shopClient');
const { loadGasArticles } = require('../../../services/gasArticles');
const { applyRule, describeRule } = require('../../../utils/priceRule');
const { importSerExport, getSerImportStatus } = require('../../../services/serProductMaster');
const { planSerPush, pushPricesToSer } = require('../../../services/serPricePush');
const { uebernehmePreis } = require('../../../services/gasArtikelPreis');

// #253/#254 (06.10.2026): Preisregel für ausgewählte Gas-Artikel – Vorschau und Übernahme.
// Gerechnet wird immer auf frisch geladenen Daten, nicht auf Werten aus dem Browser.
// Vorschau und Übernahme nutzen dieselbe Berechnung (calculate).

async function calculate(articleIds, rule) {
  const { articles, cachedAt } = await loadGasArticles();
  const wanted = new Set(articleIds);
  const chosen = articles.filter(a => wanted.has(a.id));
  const unknown = articleIds.filter(id => !chosen.some(a => a.id === id));

  const rows = applyRule(chosen, rule).sort((x, y) => x.articleNumber.localeCompare(y.articleNumber));
  const ok = rows.filter(r => r.status === 'ok');
  const same = rows.filter(r => r.status === 'same').length;
  return {
    rule, cachedAt, rows, unknown,
    summary: {
      selected: articleIds.length,
      changed: ok.length,
      same,
      skipped: rows.length - ok.length - same + unknown.length,
      diffNetTotal: Math.round(ok.reduce((s, r) => s + (r.diff || 0), 0) * 100) / 100,
    },
  };
}

function checkIds(articleIds, res) {
  if (!Array.isArray(articleIds) || articleIds.length === 0) {
    res.status(400).json({ error: 'Keine Artikel ausgewählt' });
    return false;
  }
  return true;
}

// POST /api/finance/price-tool/preview   { articleIds, rule }  – schreibt nichts
router.post('/preview', async (req, res) => {
  const { articleIds, rule } = req.body || {};
  if (!checkIds(articleIds, res)) return;
  try {
    res.json(await calculate(articleIds, rule));
  } catch (err) {
    console.error('[PriceTool] preview error:', err.message);
    res.status(err.status || 500).json({ error: err.message });
  }
});

// POST /api/finance/price-tool/apply   { articleIds, rule, confirm: true, expected: { changed, diffNetTotal } }
// Rechnet neu, vergleicht mit der gezeigten Vorschau und startet den Preis-Job im admin-backend.
router.post('/apply', async (req, res) => {
  const { articleIds, rule, confirm, expected } = req.body || {};
  if (confirm !== true) return res.status(400).json({ error: 'Übernahme muss ausdrücklich bestätigt werden' });
  if (!checkIds(articleIds, res)) return;
  try {
    const calc = await calculate(articleIds, rule);
    const toWrite = calc.rows.filter(r => r.status === 'ok');
    if (toWrite.length === 0) return res.status(400).json({ error: 'Keine Preise zu ändern' });

    // Hat sich seit der Vorschau etwas geändert? Dann nichts schreiben, Vorschau neu berechnen lassen.
    if (!expected || expected.changed !== calc.summary.changed || expected.diffNetTotal !== calc.summary.diffNetTotal) {
      return res.status(409).json({ error: 'Daten haben sich seit der Vorschau geändert – bitte Vorschau neu berechnen', preview: calc });
    }

    const upstream = await shopFetch('/admin/products/prices', {
      method: 'POST',
      body: JSON.stringify({ updates: toWrite.map(r => ({ id: r.id, articleNumber: r.articleNumber, expectedNet: r.oldNet, newNet: r.newNet })) }),
    });
    const data = await upstream.json();
    if (!upstream.ok || data.error) throw Object.assign(new Error(data.error || `Shop-API ${upstream.status}`), { status: 502 });

    const user = req.session.user || {};
    const ruleText = describeRule(rule);
    for (const r of toWrite) {
      await getPool().execute(
        `INSERT INTO price_change_log
           (job_id, lexware_article_id, article_number, article_name, rule_text, old_net, new_net, status, changed_by, changed_by_name)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)`,
        [data.jobId, r.id, r.articleNumber, r.name, ruleText, r.oldNet, r.newNet, user.id || null, user.fullName || user.username || null]
      );
    }
    console.log('[PriceTool] Übernahme gestartet:', data.jobId, toWrite.length, 'Artikel,', ruleText, 'von', user.username);
    res.json({ jobId: data.jobId, total: toWrite.length });
  } catch (err) {
    console.error('[PriceTool] apply error:', err.message);
    res.status(err.status || 500).json({ error: err.message });
  }
});

// #604: neuen Preis in gas_artikel übernehmen (Nummer ohne RG-), Fehler hier stoppen die Preisübernahme nicht
async function stammNachziehen(jobId, lexwareId) {
  try {
    const [rows] = await getPool().query(
      'SELECT article_number, new_net, changed_by, changed_by_name FROM price_change_log WHERE job_id = ? AND lexware_article_id = ? LIMIT 1',
      [jobId, lexwareId]);
    if (!rows[0]) return;
    const res = await uebernehmePreis(getPool(), {
      artikelNummer: rows[0].article_number, neuNetto: rows[0].new_net, user: { id: rows[0].changed_by, name: rows[0].changed_by_name },
    });
    if (res.status === 'kein_stammartikel') console.warn('[PriceTool] kein Stammartikel für', rows[0].article_number);
  } catch (err) {
    console.error('[PriceTool] Artikelstamm nachziehen fehlgeschlagen:', err.message);
  }
}

// GET /api/finance/price-tool/apply/:jobId – Fortschritt; Ergebnis wird ins Protokoll übernommen
router.get('/apply/:jobId', async (req, res) => {
  const { jobId } = req.params;
  if (!/^[0-9a-f-]{36}$/i.test(jobId)) return res.status(400).json({ error: 'Ungültige Job-ID' });
  try {
    const upstream = await shopFetch('/admin/products/prices/' + jobId);
    const job = await upstream.json();
    if (!upstream.ok || job.error) return res.status(upstream.status === 404 ? 404 : 502).json({ error: job.error || 'Shop-API ' + upstream.status });

    for (const r of job.results || []) {
      const [upd] = await getPool().execute(
        `UPDATE price_change_log SET status = ?, reason = ?
          WHERE job_id = ? AND lexware_article_id = ? AND status = 'pending'`,
        [r.status, r.reason || r.warning || null, jobId, r.id]
      );
      // #604: nur beim ersten Übergang pending -> ok auch den Artikelstamm nachziehen
      if (r.status === 'ok' && upd.affectedRows > 0) await stammNachziehen(jobId, r.id);
    }
    res.json(job);
  } catch (err) {
    console.error('[PriceTool] status error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/finance/price-tool/log?limit=50&artikel=7801100 – letzte Preisänderungen, optional nur eines Artikels
// (Nummer ohne Präfix; trifft RG-, NRG- und die nackte Nummer)
router.get('/log', async (req, res) => {
  const limit = Math.min(Math.max(parseInt(req.query.limit) || 50, 1), 500);
  const artikel = String(req.query.artikel || '').trim();
  if (artikel && !/^[A-Za-z0-9_-]{1,16}$/.test(artikel)) return res.status(400).json({ error: 'Ungültige Artikelnummer' });
  try {
    const [rows] = await getPool().query(
      `SELECT id, job_id, target, article_number, article_name, rule_text, old_net, new_net, status, reason,
              changed_by_name, created_at
         FROM price_change_log ${artikel ? 'WHERE article_number IN (?, ?, ?)' : ''} ORDER BY id DESC LIMIT ${limit}`,
      artikel ? [artikel, `RG-${artikel}`, `NRG-${artikel}`] : []
    );
    res.json({ entries: rows });
  } catch (err) {
    console.error('[PriceTool] log error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── SER-Produktstamm (#260) ───────────────────────────────────────────────

const csvUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (/\.csv$/i.test(file.originalname)) cb(null, true);
    else cb(Object.assign(new Error('Nur CSV-Dateien (SER-Export produkte_tab.csv)'), { status: 400 }), false);
  },
});

// GET /api/finance/price-tool/ser-import – letzter Import + Abgleich mit Lexware
router.get('/ser-import', async (req, res) => {
  try {
    res.json(await getSerImportStatus());
  } catch (err) {
    console.error('[PriceTool] ser-import status error:', err.message);
    res.status(err.status || 500).json({ error: err.message });
  }
});

// POST /api/finance/price-tool/ser-import   multipart, Feld „file“ – ersetzt den gespeicherten Produktstamm
router.post('/ser-import', (req, res) => {
  csvUpload.single('file')(req, res, async (uploadErr) => {
    if (uploadErr) {
      const msg = uploadErr.code === 'LIMIT_FILE_SIZE' ? 'Datei zu groß (max. 5 MB)' : uploadErr.message;
      return res.status(400).json({ error: msg });
    }
    if (!req.file) return res.status(400).json({ error: 'Keine Datei hochgeladen' });
    try {
      // multer liefert den Dateinamen als Latin-1 – Umlaute im Namen sonst kaputt
      const fileName = Buffer.from(req.file.originalname, 'latin1').toString('utf8');
      await importSerExport(req.file.buffer, fileName, req.session.user || {});
      res.json(await getSerImportStatus());
    } catch (err) {
      console.error('[PriceTool] ser-import error:', err.message);
      res.status(err.status || 500).json({ error: err.message });
    }
  });
});

// ── Preis-Push nach SER (#261) ────────────────────────────────────────────

// POST /api/finance/price-tool/ser-push/preview   { articleIds } – schreibt nichts
router.post('/ser-push/preview', async (req, res) => {
  const { articleIds } = req.body || {};
  if (!checkIds(articleIds, res)) return;
  try {
    const { _ok, ...plan } = await planSerPush(articleIds);
    res.json(plan);
  } catch (err) {
    console.error('[PriceTool] ser-push preview error:', err.message);
    res.status(err.status || 500).json({ error: err.message });
  }
});

// POST /api/finance/price-tool/ser-push   { articleIds, confirm: true, signature }
// signature aus der Vorschau – weicht der neu berechnete Stand ab, wird nichts gesendet (409).
router.post('/ser-push', async (req, res) => {
  const { articleIds, confirm, signature } = req.body || {};
  if (confirm !== true) return res.status(400).json({ error: 'Push nach SER muss ausdrücklich bestätigt werden' });
  if (!checkIds(articleIds, res)) return;
  try {
    res.json(await pushPricesToSer(articleIds, signature, req.session.user || {}));
  } catch (err) {
    console.error('[PriceTool] ser-push error:', err.message);
    res.status(err.status || 500).json({ error: err.message, ...(err.preview ? { preview: err.preview } : {}) });
  }
});

module.exports = router;
