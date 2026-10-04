const _db = require('../../db');
const pool = { query: (...a) => _db.getPool().execute(...a) };
// src/routes/api/notes.js
// Persoenliche Notizen, direkt im Portal (kein Nextcloud) -- Entscheidung 11.08.2026.
// An den eingeloggten Mitarbeiter gebunden (employee_notes.employee_id), analog zum
// Muster in vacation.js (getEmployeeId ueber authentik_uid).
const express = require('express');
const router  = express.Router();
const requireAuth = require('../../middleware/requireAuth');

async function getEmployeeId(uid) {
  const [rows] = await pool.query('SELECT id FROM employees WHERE authentik_uid = ?', [uid]);
  return rows[0]?.id ?? null;
}

// GET /api/notes -- eigene Notizen, offene zuerst, dann neueste zuerst
router.get('/', requireAuth, async (req, res) => {
  try {
    const empId = await getEmployeeId(req.session.user.authentikUid);
    if (!empId) return res.status(404).json({ error: 'Mitarbeiter nicht gefunden' });
    const [rows] = await pool.query(
      `SELECT * FROM employee_notes WHERE employee_id = ? ORDER BY done ASC, created_at DESC`,
      [empId]
    );
    res.json(rows);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Fehler' }); }
});

// POST /api/notes -- neue Notiz anlegen
router.post('/', requireAuth, async (req, res) => {
  try {
    const empId = await getEmployeeId(req.session.user.authentikUid);
    if (!empId) return res.status(404).json({ error: 'Mitarbeiter nicht gefunden' });
    const { text } = req.body;
    if (!text || !text.trim()) return res.status(400).json({ error: 'Text fehlt' });
    const [result] = await pool.query(
      `INSERT INTO employee_notes (employee_id, text, done) VALUES (?, ?, 0)`,
      [empId, text.trim()]
    );
    const [rows] = await pool.query('SELECT * FROM employee_notes WHERE id = ?', [result.insertId]);
    res.status(201).json(rows[0]);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Fehler' }); }
});

// PATCH /api/notes/:id -- erledigt/offen umschalten oder Text bearbeiten
router.patch('/:id', requireAuth, async (req, res) => {
  try {
    const empId = await getEmployeeId(req.session.user.authentikUid);
    const [rows] = await pool.query('SELECT * FROM employee_notes WHERE id = ?', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Nicht gefunden' });
    if (rows[0].employee_id !== empId) return res.status(403).json({ error: 'Kein Zugriff' });

    const fields = [];
    const params = [];
    if (typeof req.body.done === 'boolean') { fields.push('done = ?'); params.push(req.body.done ? 1 : 0); }
    if (typeof req.body.text === 'string' && req.body.text.trim()) { fields.push('text = ?'); params.push(req.body.text.trim()); }
    if (fields.length === 0) return res.status(400).json({ error: 'Nichts zu ändern' });
    params.push(req.params.id);
    await pool.query(`UPDATE employee_notes SET ${fields.join(', ')} WHERE id = ?`, params);

    const [updated] = await pool.query('SELECT * FROM employee_notes WHERE id = ?', [req.params.id]);
    res.json(updated[0]);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Fehler' }); }
});

// DELETE /api/notes/:id
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const empId = await getEmployeeId(req.session.user.authentikUid);
    const [rows] = await pool.query('SELECT * FROM employee_notes WHERE id = ?', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Nicht gefunden' });
    if (rows[0].employee_id !== empId) return res.status(403).json({ error: 'Kein Zugriff' });
    await pool.query('DELETE FROM employee_notes WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Fehler' }); }
});

module.exports = router;
