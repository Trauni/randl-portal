const _db = require('../../db');
const pool = { query: (...a) => _db.getPool().execute(...a) };
// src/routes/api/vacation.js
const express = require('express');
const router  = express.Router();
const requireAuth = require('../../middleware/requireAuth');
const { hasArea } = require('../../utils/permissions');
const urlaub = require('../../services/urlaub');
// Urlaubsverwaltung (Kalender, Genehmigen, Ablehnen) ist Geschaeftsfuehrung.
const canHr = (u) => hasArea(u.role, u.accessTags, 'hr.urlaubskalender');

function dateOnly(d) {
  if (d instanceof Date) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }
  return d;
}
function normalizeRow(row) {
  if (!row) return row;
  const r = { ...row };
  if (r.start_date !== undefined) r.start_date = dateOnly(r.start_date);
  if (r.end_date !== undefined) r.end_date = dateOnly(r.end_date);
  return r;
}
function normalizeRows(rows) {
  return (rows || []).map(normalizeRow);
}

async function getEmployeeId(uid) {
  const [rows] = await pool.query('SELECT id FROM employees WHERE authentik_uid = ?', [uid]);
  return rows[0]?.id ?? null;
}

function workdaysBetween(start, end) {
  let count = 0;
  const cur = new Date(start);
  while (cur <= end) {
    const day = cur.getDay();
    if (day !== 0 && day !== 6) count++;
    cur.setDate(cur.getDate() + 1);
  }
  return count;
}

// GET /api/vacation — eigene Anträge
router.get('/', requireAuth, async (req, res) => {
  try {
    const empId = await getEmployeeId(req.session.user.authentikUid);
    if (!empId) return res.status(404).json({ error: 'Mitarbeiter nicht gefunden' });
    const [rows] = await pool.query(
      `SELECT vr.*,
              approver.display_name AS approver_display,
              canceller.display_name AS canceller_display
       FROM vacation_requests vr
       LEFT JOIN employees approver  ON approver.id  = vr.approved_by
       LEFT JOIN employees canceller ON canceller.id = vr.cancelled_by
       WHERE vr.employee_id = ?
       ORDER BY vr.start_date DESC`, [empId]
    );
    res.json(normalizeRows(rows));
  } catch (err) { console.error(err); res.status(500).json({ error: 'Fehler' }); }
});

// GET /api/vacation/timeline — Admin: Gantt-Daten
router.get('/timeline', requireAuth, async (req, res) => {
  const isAdmin = canHr(req.session.user);
  if (!isAdmin) return res.status(403).json({ error: 'Kein Zugriff' });
  try {
    const now  = new Date();
    const from = req.query.from || new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString().split('T')[0];
    const to   = req.query.to   || new Date(now.getFullYear(), now.getMonth() + 4, 0).toISOString().split('T')[0];
    const [rows] = await pool.query(
      `SELECT vr.id, vr.start_date, vr.end_date, vr.days_count,
              vr.status, vr.reason, vr.cancel_reason,
              e.id AS emp_id,
              COALESCE(e.display_name, e.full_name, e.username) AS emp_name,
              e.department
       FROM vacation_requests vr
       JOIN employees e ON e.id = vr.employee_id
       WHERE vr.status IN ('pending', 'approved')
         AND vr.start_date <= ? AND vr.end_date >= ?
       ORDER BY e.department, emp_name, vr.start_date`, [to, from]
    );
    const empMap = {};
    rows.forEach(r => {
      if (!empMap[r.emp_id])
        empMap[r.emp_id] = { id: r.emp_id, name: r.emp_name, department: r.department };
    });
    res.json({ from, to, employees: Object.values(empMap), requests: normalizeRows(rows) });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Fehler' }); }
});

// GET /api/vacation/all — Admin: alle Anträge
router.get('/all', requireAuth, async (req, res) => {
  const isAdmin = canHr(req.session.user);
  if (!isAdmin) return res.status(403).json({ error: 'Kein Zugriff' });
  try {
    const [rows] = await pool.query(
      `SELECT vr.*,
              COALESCE(e.display_name, e.full_name, e.username) AS emp_display,
              e.full_name AS emp_full, e.department AS emp_department,
              approver.display_name AS approver_display,
              canceller.display_name AS canceller_display
       FROM vacation_requests vr
       JOIN employees e ON e.id = vr.employee_id
       LEFT JOIN employees approver  ON approver.id  = vr.approved_by
       LEFT JOIN employees canceller ON canceller.id = vr.cancelled_by
       ORDER BY vr.start_date DESC`
    );
    res.json(normalizeRows(rows));
  } catch (err) { console.error(err); res.status(500).json({ error: 'Fehler' }); }
});

// POST /api/vacation — Antrag stellen
router.post('/', requireAuth, async (req, res) => {
  try {
    const empId = await getEmployeeId(req.session.user.authentikUid);
    if (!empId) return res.status(404).json({ error: 'Mitarbeiter nicht gefunden' });
    const { start_date, end_date, reason } = req.body;
    if (!start_date || !end_date) return res.status(400).json({ error: 'Datum fehlt' });
    const days = workdaysBetween(new Date(start_date), new Date(end_date));
    if (days <= 0) return res.status(400).json({ error: 'Kein gültiger Zeitraum' });
    const [result] = await pool.query(
      `INSERT INTO vacation_requests (employee_id, start_date, end_date, days_count, reason, status)
       VALUES (?, ?, ?, ?, ?, 'pending')`,
      [empId, start_date, end_date, days, reason || null]
    );
    const [newReq] = await pool.query('SELECT * FROM vacation_requests WHERE id = ?', [result.insertId]);
    res.status(201).json(normalizeRow(newReq[0]));
  } catch (err) { console.error(err); res.status(500).json({ error: 'Fehler' }); }
});

// PATCH /api/vacation/:id/approve
router.patch('/:id/approve', requireAuth, async (req, res) => {
  const isAdmin = canHr(req.session.user);
  if (!isAdmin) return res.status(403).json({ error: 'Kein Zugriff' });
  try {
    const approverId = await getEmployeeId(req.session.user.authentikUid);
    await pool.query(
      `UPDATE vacation_requests SET status='approved', approved_by=?, approved_at=NOW(), note=?
       WHERE id=? AND status='pending'`,
      [approverId, req.body.note || null, req.params.id]
    );
    const [rows] = await pool.query('SELECT * FROM vacation_requests WHERE id=?', [req.params.id]);
    const antwort = normalizeRow(rows[0]);
    // Urlaub nach Rentman schreiben. Ein Fehler darf die Genehmigung nicht
    // scheitern lassen: der naechtliche Job holt es nach, und die Abgleichs-
    // liste auf der Zeiterfassungsseite zeigt den Rueckstand.
    if (antwort && antwort.status === 'approved') {
      try {
        antwort.rentman = await urlaub.urlaubNachRentman(Number(req.params.id));
      } catch (e) {
        console.error(`[vacation] Antrag ${req.params.id} nicht nach Rentman uebertragen: ${e.message}`);
        antwort.rentman = { fehler: e.message };
      }
    }
    res.json(antwort);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Fehler' }); }
});

// PATCH /api/vacation/:id/reject
router.patch('/:id/reject', requireAuth, async (req, res) => {
  const isAdmin = canHr(req.session.user);
  if (!isAdmin) return res.status(403).json({ error: 'Kein Zugriff' });
  try {
    await pool.query(
      `UPDATE vacation_requests SET status='rejected', note=? WHERE id=? AND status='pending'`,
      [req.body.note || null, req.params.id]
    );
    const [rows] = await pool.query('SELECT * FROM vacation_requests WHERE id=?', [req.params.id]);
    res.json(normalizeRow(rows[0]));
  } catch (err) { console.error(err); res.status(500).json({ error: 'Fehler' }); }
});

// PATCH /api/vacation/:id/cancel
router.patch('/:id/cancel', requireAuth, async (req, res) => {
  try {
    const uid      = req.session.user.authentikUid;
    const isAdmin  = canHr(req.session.user);
    const cancellerId = await getEmployeeId(uid);
    const [rows] = await pool.query(
      `SELECT vr.*, e.authentik_uid FROM vacation_requests vr
       JOIN employees e ON e.id = vr.employee_id WHERE vr.id = ?`, [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Nicht gefunden' });
    const vr = rows[0];
    if (vr.authentik_uid !== uid && !isAdmin) return res.status(403).json({ error: 'Kein Zugriff' });
    if (!['pending','approved'].includes(vr.status))
      return res.status(400).json({ error: `Status "${vr.status}" kann nicht storniert werden.` });
    const today = new Date().toISOString().split('T')[0];
    const vrStartDate = dateOnly(vr.start_date);
    if (vr.status === 'approved' && vrStartDate < today && !isAdmin)
      return res.status(400).json({ error: 'Vergangene Urlaube nur vom Admin stornierbar.' });
    await pool.query(
      `UPDATE vacation_requests SET status='cancelled', cancelled_at=NOW(), cancelled_by=?, cancel_reason=? WHERE id=?`,
      [cancellerId, req.body.reason || null, req.params.id]
    );
    // In Rentman stornieren. Loeschen ist nicht noetig: die Zeiteintraege
    // folgen dem Antrag und werden dabei automatisch rejected.
    if (vr.rentman_leaverequest_id) {
      try {
        await urlaub.urlaubStornieren(Number(req.params.id));
      } catch (e) {
        console.error(`[vacation] Antrag ${req.params.id} in Rentman nicht storniert: ${e.message}`);
      }
    }
    const [updated] = await pool.query('SELECT * FROM vacation_requests WHERE id=?', [req.params.id]);
    res.json(normalizeRow(updated[0]));
  } catch (err) { console.error(err); res.status(500).json({ error: 'Stornierung fehlgeschlagen' }); }
});

module.exports = router;
