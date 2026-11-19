const router = require('express').Router();
const { getPool } = require('../../../db');
const { ergebnis, zaehlwert } = require('../../../utils/widmannNachliefern');

// F52 (09.09.2026): Widmann-Bestandszaehlung. Fest auf den Kunden Widmann
// zugeschnitten (bewusste Entscheidung, kein generisches Feature). Eigene
// Tabellen in der Portal-DB (nicht im gas-webshop admin-backend/Postgres,
// da unabhaengig von Kunden/Bestellungen -- nur eine optionale, rein
// informelle Verknuepfung zur Lexware-Artikelnummer). Historie ist
// Snapshot-basiert: widmann_stock_check_entries speichert Name und
// Mindestbestand zum Zeitpunkt der Zaehlung, damit spaetere Aenderungen an
// der Artikelliste alte Zaehlungen nicht verfaelschen. Bewusst KEIN
// automatischer Bestellmengen-Vorschlag (Nutzer-Entscheidung 09.09.2026) --
// nur die reinen Zahlen (Mindestbestand, Gezaehlt).
// #603 (19.11.2026): hebt diese Entscheidung auf. Je Zeile "reserviert" und
// das berechnete "nachliefern" = max(0, Mindestbestand - (gezaehlt - reserviert)),
// siehe utils/widmannNachliefern.js. Nachliefern wird nicht gespeichert.

function buildMarkdown(check, entries) {
  const dateStr = new Date(check.created_at).toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' });
  let md = `# Widmann Bestandszaehlung – ${dateStr}\n\n`;
  md += `Gezaehlt von: ${check.checked_by_name || 'Unbekannt'}\n\n`;
  const erg = ergebnis(entries);
  md += `Nachliefern gesamt: ${erg.summe} Flaschen in ${erg.positionen} Positionen\n\n`;
  md += `| Gas | Mindestbestand | Gezaehlt | Reserviert | Nachliefern |\n`;
  md += `|---|---|---|---|---|\n`;
  for (const e of erg.zeilen) {
    md += `| ${e.item_name} | ${e.mindestbestand} | ${e.gezaehlt} | ${e.reserviert || 0} | ${e.nachliefern} |\n`;
  }
  if (check.note) md += `\nNotiz: ${check.note}\n`;
  return md;
}

// entries (mit nachliefern je Zeile) und der Ergebnisblock oben auf der Seite
function ergebnisFuerAntwort(entries) {
  const erg = ergebnis(entries);
  return { entries: erg.zeilen, ergebnis: { summe: erg.summe, positionen: erg.positionen } };
}

// ── Artikel-Liste ─────────────────────────────────────────────────────────
router.get('/items', async (req, res) => {
  try {
    const db = getPool();
    const [rows] = await db.execute(
      `SELECT id, name, mindestbestand, lexware_article_number, sort_order, active
       FROM widmann_stock_items
       WHERE active = 1
       ORDER BY sort_order, name`
    );
    res.json({ items: rows });
  } catch (err) {
    console.error('[Widmann] GET items error:', err);
    res.status(500).json({ error: 'Fehler beim Laden der Artikelliste' });
  }
});

router.get('/items/all', async (req, res) => {
  try {
    const db = getPool();
    const [rows] = await db.execute(
      `SELECT id, name, mindestbestand, lexware_article_number, sort_order, active
       FROM widmann_stock_items
       ORDER BY active DESC, sort_order, name`
    );
    res.json({ items: rows });
  } catch (err) {
    console.error('[Widmann] GET items/all error:', err);
    res.status(500).json({ error: 'Fehler beim Laden der Artikelliste' });
  }
});

router.post('/items', async (req, res) => {
  const { name, mindestbestand, lexware_article_number, sort_order } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'Name ist Pflichtfeld' });
  try {
    const db = getPool();
    const [result] = await db.execute(
      `INSERT INTO widmann_stock_items (name, mindestbestand, lexware_article_number, sort_order)
       VALUES (?, ?, ?, ?)`,
      [name.trim(), parseInt(mindestbestand, 10) || 0, lexware_article_number || null, parseInt(sort_order, 10) || 0]
    );
    res.status(201).json({ id: result.insertId });
  } catch (err) {
    console.error('[Widmann] POST items error:', err);
    res.status(500).json({ error: 'Fehler beim Anlegen' });
  }
});

router.put('/items/:id', async (req, res) => {
  const { name, mindestbestand, lexware_article_number, sort_order, active } = req.body;
  try {
    const db = getPool();
    await db.execute(
      `UPDATE widmann_stock_items
       SET name = ?, mindestbestand = ?, lexware_article_number = ?, sort_order = ?, active = ?
       WHERE id = ?`,
      [
        name?.trim(), parseInt(mindestbestand, 10) || 0, lexware_article_number || null,
        parseInt(sort_order, 10) || 0, (active === false || active === 0) ? 0 : 1, req.params.id,
      ]
    );
    res.json({ success: true });
  } catch (err) {
    console.error('[Widmann] PUT items error:', err);
    res.status(500).json({ error: 'Fehler beim Speichern' });
  }
});

router.delete('/items/:id', async (req, res) => {
  try {
    const db = getPool();
    await db.execute('UPDATE widmann_stock_items SET active = 0 WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.error('[Widmann] DELETE items error:', err);
    res.status(500).json({ error: 'Fehler beim Ausblenden' });
  }
});

router.post('/items/:id/restore', async (req, res) => {
  try {
    const db = getPool();
    await db.execute('UPDATE widmann_stock_items SET active = 1 WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Fehler beim Wiederherstellen' });
  }
});

// ── Zaehlungen ────────────────────────────────────────────────────────────
router.get('/checks', async (req, res) => {
  try {
    const db = getPool();
    const [rows] = await db.execute(
      `SELECT c.id, c.created_at, c.checked_by_name, c.note,
              COUNT(e.id) AS entry_count,
              COALESCE(SUM(GREATEST(0, e.mindestbestand - (e.gezaehlt - e.reserviert))), 0) AS nachliefern_summe
       FROM widmann_stock_checks c
       LEFT JOIN widmann_stock_check_entries e ON e.check_id = c.id
       GROUP BY c.id
       ORDER BY c.created_at DESC
       LIMIT 100`
    );
    res.json({ checks: rows });
  } catch (err) {
    console.error('[Widmann] GET checks error:', err);
    res.status(500).json({ error: 'Fehler beim Laden der Historie' });
  }
});

router.get('/checks/:id', async (req, res) => {
  try {
    const db = getPool();
    const [checkRows] = await db.execute('SELECT * FROM widmann_stock_checks WHERE id = ?', [req.params.id]);
    if (!checkRows[0]) return res.status(404).json({ error: 'Nicht gefunden' });
    const [entries] = await db.execute(
      'SELECT * FROM widmann_stock_check_entries WHERE check_id = ? ORDER BY sort_order, item_name',
      [req.params.id]
    );
    res.json({ check: checkRows[0], ...ergebnisFuerAntwort(entries) });
  } catch (err) {
    console.error('[Widmann] GET check detail error:', err);
    res.status(500).json({ error: 'Fehler beim Laden' });
  }
});

router.get('/checks/:id/markdown', async (req, res) => {
  try {
    const db = getPool();
    const [checkRows] = await db.execute('SELECT * FROM widmann_stock_checks WHERE id = ?', [req.params.id]);
    if (!checkRows[0]) return res.status(404).send('Nicht gefunden');
    const [entries] = await db.execute(
      'SELECT * FROM widmann_stock_check_entries WHERE check_id = ? ORDER BY sort_order, item_name',
      [req.params.id]
    );
    const md = buildMarkdown(checkRows[0], entries);
    const dateForFile = new Date(checkRows[0].created_at).toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="widmann-bestand-${dateForFile}.md"`);
    res.send(md);
  } catch (err) {
    console.error('[Widmann] GET markdown error:', err);
    res.status(500).send('Fehler beim Erzeugen der Markdown-Datei');
  }
});

router.post('/checks', async (req, res) => {
  const { entries, note } = req.body;
  if (!Array.isArray(entries) || entries.length === 0) {
    return res.status(400).json({ error: 'Mindestens ein Eintrag erforderlich' });
  }
  const checkedById = req.session.user?.id || null;
  const checkedByName = req.session.user?.fullName || req.session.user?.username || 'Unbekannt';
  const db = getPool();
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const [result] = await conn.execute(
      `INSERT INTO widmann_stock_checks (checked_by, checked_by_name, note) VALUES (?, ?, ?)`,
      [checkedById, checkedByName, note || null]
    );
    const checkId = result.insertId;
    let sortOrder = 0;
    for (const e of entries) {
      await conn.execute(
        `INSERT INTO widmann_stock_check_entries
           (check_id, item_id, item_name, mindestbestand, gezaehlt, reserviert, sort_order)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [checkId, e.itemId || null, e.name, parseInt(e.mindestbestand, 10) || 0, zaehlwert(e.gezaehlt), zaehlwert(e.reserviert), sortOrder++]
      );
    }
    await conn.commit();
    res.status(201).json({
      id: checkId,
      ...ergebnisFuerAntwort(entries.map((e) => ({
        item_name: e.name, mindestbestand: parseInt(e.mindestbestand, 10) || 0, gezaehlt: e.gezaehlt, reserviert: e.reserviert,
      }))),
    });
  } catch (err) {
    await conn.rollback();
    console.error('[Widmann] POST checks error:', err);
    res.status(500).json({ error: 'Fehler beim Speichern der Zaehlung' });
  } finally {
    conn.release();
  }
});

module.exports = router;
