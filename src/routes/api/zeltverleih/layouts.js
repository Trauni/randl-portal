// src/routes/api/zeltverleih/layouts.js
// Gespeicherte Zeltplaner-Layouts (Referenzen + eigene). Mount siehe server.js.snippet.txt.
//
// Fix 14.08.2026: req.user existiert in eurem Auth-Setup nicht (verursachte 500 auf
// jeder Anfrage, siehe pm2-Log "Cannot read properties of undefined (reading 'id')").
// Der eingeloggte Nutzer steckt in req.session.user.authentikUid — getEmployeeId()
// löst daraus die employees.id auf, 1:1 aus src/routes/api/vacation.js übernommen
// (dort nur lokal definiert, kein gemeinsames Modul).

const express = require('express');
const router = express.Router();
const { getPool } = require('../../../db');

async function getEmployeeId(uid) {
  const pool = getPool();
  const [rows] = await pool.execute('SELECT id FROM employees WHERE authentik_uid = ?', [uid]);
  return rows[0]?.id ?? null;
}

// GET /api/zeltverleih/layouts — Referenzlayouts + eigene (des angemeldeten Nutzers)
router.get('/', async (req, res) => {
  try {
    const pool = getPool();
    const empId = await getEmployeeId(req.session.user.authentikUid);
    const [rows] = await pool.execute(
      `SELECT id, name, tent_type, tent_len, is_reference, created_by, created_at, updated_at
       FROM zelt_layouts
       WHERE is_reference = 1 OR created_by = ?
       ORDER BY is_reference DESC, updated_at DESC`,
      [empId]
    );
    res.json(rows);
  } catch (err) {
    console.error('[zeltverleih/layouts] GET Liste fehlgeschlagen:', err);
    res.status(500).json({ error: 'Layouts konnten nicht geladen werden.' });
  }
});

// GET /api/zeltverleih/layouts/:id — einzelnes Layout inkl. voller Geometrie (data)
router.get('/:id', async (req, res) => {
  try {
    const pool = getPool();
    const [rows] = await pool.execute(
      `SELECT id, name, tent_type, tent_len, data, is_reference, created_by, created_at, updated_at
       FROM zelt_layouts WHERE id = ?`,
      [req.params.id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Layout nicht gefunden.' });

    const layout = rows[0];
    // Referenzlayouts sind für alle sichtbar, eigene nur für den Ersteller.
    if (!layout.is_reference) {
      const empId = await getEmployeeId(req.session.user.authentikUid);
      if (layout.created_by !== empId) {
        return res.status(403).json({ error: 'Kein Zugriff auf dieses Layout.' });
      }
    }
    layout.data = JSON.parse(layout.data);
    res.json(layout);
  } catch (err) {
    console.error('[zeltverleih/layouts] GET Einzeln fehlgeschlagen:', err);
    res.status(500).json({ error: 'Layout konnte nicht geladen werden.' });
  }
});

// POST /api/zeltverleih/layouts — neues Layout speichern
router.post('/', async (req, res) => {
  const { name, tent_type, tent_len, data } = req.body;
  if (!name || !tent_type || tent_len == null || !data) {
    return res.status(400).json({ error: 'name, tent_type, tent_len und data sind Pflichtfelder.' });
  }
  try {
    const pool = getPool();
    const empId = await getEmployeeId(req.session.user.authentikUid);
    const [result] = await pool.execute(
      `INSERT INTO zelt_layouts (name, tent_type, tent_len, data, is_reference, created_by)
       VALUES (?, ?, ?, ?, 0, ?)`,
      [name, tent_type, tent_len, JSON.stringify(data), empId]
    );
    res.status(201).json({ id: result.insertId });
  } catch (err) {
    console.error('[zeltverleih/layouts] POST fehlgeschlagen:', err);
    res.status(500).json({ error: 'Layout konnte nicht gespeichert werden.' });
  }
});

// PUT /api/zeltverleih/layouts/:id — überschreiben (nur eigenes, keine Referenzlayouts)
router.put('/:id', async (req, res) => {
  const { name, tent_type, tent_len, data } = req.body;
  try {
    const pool = getPool();
    const empId = await getEmployeeId(req.session.user.authentikUid);
    const [existingRows] = await pool.execute(
      `SELECT created_by, is_reference FROM zelt_layouts WHERE id = ?`,
      [req.params.id]
    );
    if (existingRows.length === 0) return res.status(404).json({ error: 'Layout nicht gefunden.' });
    const existing = existingRows[0];
    if (existing.is_reference || existing.created_by !== empId) {
      return res.status(403).json({ error: 'Kein Schreibzugriff auf dieses Layout.' });
    }

    await pool.execute(
      `UPDATE zelt_layouts SET name = ?, tent_type = ?, tent_len = ?, data = ? WHERE id = ?`,
      [name, tent_type, tent_len, JSON.stringify(data), req.params.id]
    );
    res.status(204).end();
  } catch (err) {
    console.error('[zeltverleih/layouts] PUT fehlgeschlagen:', err);
    res.status(500).json({ error: 'Layout konnte nicht aktualisiert werden.' });
  }
});

// DELETE /api/zeltverleih/layouts/:id — löschen (nur eigenes, keine Referenzlayouts)
router.delete('/:id', async (req, res) => {
  try {
    const pool = getPool();
    const empId = await getEmployeeId(req.session.user.authentikUid);
    const [existingRows] = await pool.execute(
      `SELECT created_by, is_reference FROM zelt_layouts WHERE id = ?`,
      [req.params.id]
    );
    if (existingRows.length === 0) return res.status(404).json({ error: 'Layout nicht gefunden.' });
    const existing = existingRows[0];
    if (existing.is_reference || existing.created_by !== empId) {
      return res.status(403).json({ error: 'Kein Löschrecht für dieses Layout.' });
    }

    await pool.execute(`DELETE FROM zelt_layouts WHERE id = ?`, [req.params.id]);
    res.status(204).end();
  } catch (err) {
    console.error('[zeltverleih/layouts] DELETE fehlgeschlagen:', err);
    res.status(500).json({ error: 'Layout konnte nicht gelöscht werden.' });
  }
});

module.exports = router;
