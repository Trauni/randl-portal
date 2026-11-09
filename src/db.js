const mysql = require('mysql2/promise');
const { findeMitarbeiter } = require('./services/mitarbeiterMatch');

let pool = null;

function getPool() {
  if (pool) return pool;
  pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT) || 3306,
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    timezone: '+01:00',
  });
  return pool;
}

// ── Employee ──────────────────────────────────────────────────────────────────
async function upsertEmployee({ authentikUid, username, fullName, email, groups }) {
  const db = getPool();
  const groupsJson = JSON.stringify(groups || []);

  // #500: erst über feste IDs, dann über E-Mail (case-insensitive) zuordnen, nie doppelt anlegen.
  // fullName ist leer, wenn Authentik keinen echten Namen liefert -> vorhandenen Namen behalten.
  const { row, konflikt } = await findeMitarbeiter(db, { authentikUid, email });
  if (konflikt) throw new Error(`Mitarbeiter-Zuordnung mehrdeutig: ${konflikt}`);

  if (row) {
    await db.execute(
      `UPDATE employees SET
         authentik_uid    = ?,
         username         = COALESCE(NULLIF(?, ''), username),
         full_name        = COALESCE(NULLIF(?, ''), full_name),
         email            = COALESCE(NULLIF(?, ''), email),
         authentik_groups = ?,
         updated_at       = NOW()
       WHERE id = ?`,
      [authentikUid, username || '', fullName || '', email || '', groupsJson, row.id]
    );
    return getEmployeeById(row.id);
  }

  await db.execute(
    `INSERT INTO employees (authentik_uid, username, full_name, email, authentik_groups)
     VALUES (?, ?, ?, ?, ?)`,
    [authentikUid, username, fullName || username, email, groupsJson]
  );
  return getEmployeeByUid(authentikUid);
}

async function getEmployeeById(id) {
  const db = getPool();
  const [rows] = await db.execute(
    'SELECT * FROM employees WHERE id = ?',
    [id]
  );
  return rows[0] || null;
}

async function getEmployeeByUid(uid) {
  const db = getPool();
  const [rows] = await db.execute(
    'SELECT * FROM employees WHERE authentik_uid = ?',
    [uid]
  );
  return rows[0] || null;
}

async function updateEmployee(id, data) {
  const db = getPool();
  const allowed = ['phone', 'position_title', 'department', 'start_date'];
  const fields = Object.keys(data).filter(k => allowed.includes(k));
  if (fields.length === 0) return null;

  const sql = `UPDATE employees SET ${fields.map(f => `${f} = ?`).join(', ')}, updated_at = NOW() WHERE id = ?`;
  const values = [...fields.map(f => data[f]), id];
  await db.execute(sql, values);
  return getEmployeeById(id);
}

async function getAllEmployees() {
  const db = getPool();
  const [rows] = await db.execute(
    `SELECT id, username, full_name, email, position_title, department, start_date
     FROM employees ORDER BY full_name`
  );
  return rows;
}

// ── Vacation ──────────────────────────────────────────────────────────────────
async function getVacationsByEmployee(employeeId) {
  const db = getPool();
  const [rows] = await db.execute(
    `SELECT vr.*, e.full_name as approved_by_name
     FROM vacation_requests vr
     LEFT JOIN employees e ON e.id = vr.approved_by
     WHERE vr.employee_id = ?
     ORDER BY vr.created_at DESC`,
    [employeeId]
  );
  return rows;
}

async function getAllVacations() {
  const db = getPool();
  const [rows] = await db.execute(
    `SELECT vr.*, e.full_name, e.username, e.department
     FROM vacation_requests vr
     JOIN employees e ON e.id = vr.employee_id
     ORDER BY vr.start_date DESC`
  );
  return rows;
}

async function getPendingVacations() {
  const db = getPool();
  const [rows] = await db.execute(
    `SELECT vr.*, e.full_name, e.username, e.department
     FROM vacation_requests vr
     JOIN employees e ON e.id = vr.employee_id
     WHERE vr.status = 'pending'
     ORDER BY vr.created_at ASC`
  );
  return rows;
}

async function createVacationRequest({ employeeId, startDate, endDate, daysCount, reason }) {
  const db = getPool();
  const [result] = await db.execute(
    `INSERT INTO vacation_requests (employee_id, start_date, end_date, days_count, reason, status)
     VALUES (?, ?, ?, ?, ?, 'pending')`,
    [employeeId, startDate, endDate, daysCount, reason || null]
  );
  return { id: result.insertId };
}

async function updateVacationStatus(id, status, approvedById, note) {
  const db = getPool();
  await db.execute(
    `UPDATE vacation_requests
     SET status = ?, approved_by = ?, approved_at = NOW(), note = ?
     WHERE id = ?`,
    [status, approvedById, note || null, id]
  );
  const [rows] = await db.execute('SELECT * FROM vacation_requests WHERE id = ?', [id]);
  return rows[0] || null;
}

// ── Documents ─────────────────────────────────────────────────────────────────
async function getDocumentsByEmployee(employeeId) {
  const db = getPool();
  const [rows] = await db.execute(
    'SELECT * FROM documents WHERE employee_id = ? ORDER BY uploaded_at DESC',
    [employeeId]
  );
  return rows;
}

// ── Dashboard Stats ───────────────────────────────────────────────────────────
async function getDashboardStats() {
  const db = getPool();
  const [[empCount]] = await db.execute('SELECT COUNT(*) as count FROM employees WHERE active = true');
  const [[pendingCount]] = await db.execute(
    "SELECT COUNT(*) as count FROM vacation_requests WHERE status = 'pending'"
  );
  const [[approvedThisMonth]] = await db.execute(
    `SELECT COUNT(*) as count FROM vacation_requests
     WHERE status = 'approved'
     AND MONTH(created_at) = MONTH(NOW())
     AND YEAR(created_at) = YEAR(NOW())`
  );
  return {
    totalEmployees: empCount.count,
    pendingVacations: pendingCount.count,
    approvedThisMonth: approvedThisMonth.count,
  };
}


module.exports = {
  getPool,
  upsertEmployee,
  getEmployeeById,
  getEmployeeByUid,
  updateEmployee,
  getAllEmployees,
  getVacationsByEmployee,
  getAllVacations,
  getPendingVacations,
  createVacationRequest,
  updateVacationStatus,
  getDocumentsByEmployee,
  getDashboardStats,
};
