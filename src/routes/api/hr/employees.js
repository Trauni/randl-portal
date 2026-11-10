const express = require('express');
const router = express.Router();
const { getPool } = require('../../../db');
const { syncEmployeeGroups, setUserActive, createUser } = require('../../../services/authentik');

const ROLES = ['mitarbeiter', 'freelancer', 'extern'];
const TAGS  = ['geschaeftsfuehrung', 'backoffice', 'gashandel', 'zeltverleih', 'metallarbeiten'];

const parseGroups = (v) => (v ? (typeof v === 'string' ? JSON.parse(v) : v) : []);

// GET /api/hr/employees — alle Mitarbeiter
router.get('/', async (req, res) => {
  if (!req.session?.user) return res.status(401).json({ error: 'Nicht eingeloggt' });
  try {
    const [rows] = await getPool().execute(`
      SELECT e.*,
        -- days_count statt DATEDIFF: das Portal zaehlt Werktage, DATEDIFF Kalendertage.
        -- Jahresfilter, damit der Anspruch im Januar wieder von vorn beginnt.
        COALESCE((SELECT SUM(v.days_count)
                  FROM vacation_requests v
                  WHERE v.employee_id = e.id AND v.status = 'approved' AND v.art = 'urlaub'
                    AND YEAR(v.start_date) = YEAR(CURDATE())), 0) AS vacation_taken,
        COALESCE((SELECT GROUP_CONCAT(a.tag ORDER BY a.tag)
                  FROM employee_access a WHERE a.employee_id = e.id), '') AS access_tags_raw
      FROM employees e
      WHERE e.email IS NOT NULL AND e.is_demo = 0
      ORDER BY e.active DESC, e.lastname ASC, e.firstname ASC
    `);
    res.json(rows.map(r => ({
      ...r,
      authentik_groups: parseGroups(r.authentik_groups),
      access_tags: r.access_tags_raw ? r.access_tags_raw.split(',') : [],
    })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// #501: Mitarbeiter im Portal anlegen; das Portal legt das Authentik-Konto an.
// authentik_uid bleibt leer und wird beim ersten SSO-Login ueber die E-Mail gesetzt (sub ist massgeblich).
router.post('/', async (req, res) => {
  if (!req.session?.user) return res.status(401).json({ error: 'Nicht eingeloggt' });
  const b = req.body || {};
  const firstname = String(b.firstname || '').trim();
  const lastname = String(b.lastname || '').trim();
  const email = String(b.email || '').trim();
  const role = b.role || 'mitarbeiter';
  const tags = Array.isArray(b.accessTags) ? b.accessTags.filter(t => TAGS.includes(t)) : [];
  if (!firstname || !lastname || !/^\S+@\S+\.\S+$/.test(email)) {
    return res.status(400).json({ error: 'Vor-/Nachname und gültige E-Mail erforderlich' });
  }
  if (!ROLES.includes(role)) return res.status(400).json({ error: 'Unbekannte Rolle: ' + role });
  const username = String(b.username || '').trim() || email;
  const fullName = `${firstname} ${lastname}`;
  const pool = getPool();
  try {
    const { findeMitarbeiter } = require('../../../services/mitarbeiterMatch');
    const { row, konflikt } = await findeMitarbeiter(pool, { email });
    if (row || konflikt) {
      return res.status(409).json({ error: konflikt || `Es gibt schon einen Mitarbeiter mit dieser E-Mail (ID ${row.id})` });
    }
    const authentik = await createUser({ username, name: fullName, email });
    const [ins] = await pool.execute(
      `INSERT INTO employees (username, full_name, firstname, lastname, displayname, email, role, vacation_days_total, active, status, zeiterfassung_quelle)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, 'aktiv', 'portal')`,
      [username, fullName, firstname, lastname, fullName, email, role, b.vacation_days_total ?? 30]
    );
    for (const t of tags) {
      await pool.execute('INSERT INTO employee_access (employee_id, tag) VALUES (?, ?)', [ins.insertId, t]);
    }
    let push;
    try {
      push = { ok: true, ...(await syncEmployeeGroups({ username, email, role, accessTags: tags })) };
    } catch (e) {
      push = { ok: false, error: e.message };
    }
    res.status(201).json({ ok: true, id: ins.insertId, recoveryLink: authentik.link, mailVersandt: authentik.mailVersandt, warnung: authentik.warnung, push });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// #502: Deaktivieren/Reaktivieren statt Löschen. Daten bleiben, Authentik-Konto wird gesperrt.
// Rentman wird nicht angefasst (Sync meldet nur Abweichungen).
const umschalten = (aktiv) => async (req, res) => {
  if (!req.session?.user) return res.status(401).json({ error: 'Nicht eingeloggt' });
  const pool = getPool();
  try {
    const [[emp]] = await pool.execute('SELECT id, username, email, status FROM employees WHERE id = ?', [req.params.id]);
    if (!emp) return res.status(404).json({ error: 'Nicht gefunden' });
    if (!aktiv && emp.id === req.session.user.id) {
      return res.status(400).json({ error: 'Du kannst dich nicht selbst deaktivieren' });
    }
    await pool.execute('UPDATE employees SET status = ?, active = ? WHERE id = ?',
      [aktiv ? 'aktiv' : 'inaktiv', aktiv ? 1 : 0, emp.id]);
    let authentik = { ok: true };
    try {
      await setUserActive({ username: emp.username, email: emp.email, active: aktiv });
    } catch (err) {
      authentik = { ok: false, error: err.message };
    }
    res.json({ ok: true, status: aktiv ? 'aktiv' : 'inaktiv', authentik });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
router.post('/:id/deaktivieren', umschalten(false));
router.post('/:id/reaktivieren', umschalten(true));

// GET /api/hr/employees/:id
router.get('/:id', async (req, res) => {
  if (!req.session?.user) return res.status(401).json({ error: 'Nicht eingeloggt' });
  try {
    const pool = getPool();
    const [[emp]] = await pool.execute('SELECT * FROM employees WHERE id = ?', [req.params.id]);
    if (!emp) return res.status(404).json({ error: 'Nicht gefunden' });
    const [tags] = await pool.execute(
      'SELECT tag FROM employee_access WHERE employee_id = ? ORDER BY tag', [req.params.id]
    );
    const [vacations] = await pool.execute(
      'SELECT * FROM vacation_requests WHERE employee_id = ? ORDER BY start_date DESC LIMIT 20',
      [req.params.id]
    );
    res.json({
      ...emp,
      authentik_groups: parseGroups(emp.authentik_groups),
      access_tags: tags.map(t => t.tag),
      vacations,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/hr/employees/:id — Rolle, Zugriffe, Urlaubstage, Notiz, Abteilung
router.patch('/:id', async (req, res) => {
  if (!req.session?.user) return res.status(401).json({ error: 'Nicht eingeloggt' });
  const { role, accessTags, vacation_days_total, notes, department, minijob, minijob_max_stunden_monat } = req.body;
  const id = req.params.id;
  if (role && !ROLES.includes(role)) {
    return res.status(400).json({ error: 'Unbekannte Rolle: ' + role });
  }
  const tags = Array.isArray(accessTags) ? accessTags.filter(t => TAGS.includes(t)) : null;
  const pool = getPool();
  try {
    const [[vorher]] = await pool.execute('SELECT id FROM employees WHERE id = ?', [id]);
    if (!vorher) return res.status(404).json({ error: 'Nicht gefunden' });
    await pool.execute(
      `UPDATE employees SET
         role = COALESCE(?, role),
         vacation_days_total = COALESCE(?, vacation_days_total),
         notes = COALESCE(?, notes)
       WHERE id = ?`,
      [role || null, vacation_days_total ?? null, notes ?? null, id]
    );
    // Minijob (#533): Monatslimit statt Regeltage, kein Gleitzeitkonto
    if (minijob !== undefined) {
      const limit = Number(minijob_max_stunden_monat);
      if (minijob && !(limit > 0 && limit <= 200)) {
        return res.status(400).json({ error: 'Minijob braucht ein Monatslimit zwischen 0 und 200 Stunden' });
      }
      await pool.execute(
        `UPDATE employees SET minijob = ?, minijob_max_stunden_monat = ?,
                gleitzeit_aktiv = IF(?, 0, gleitzeit_aktiv) WHERE id = ?`,
        [minijob ? 1 : 0, minijob ? limit : null, minijob ? 1 : 0, id]);
    }
    // Abteilung (#55): Profil und Urlaubskalender lesen sie; leer = keine Abteilung
    if (typeof department === 'string') {
      await pool.execute('UPDATE employees SET department = ? WHERE id = ?',
        [department.trim().slice(0, 100) || null, id]);
    }
    if (tags) {
      await pool.execute('DELETE FROM employee_access WHERE employee_id = ?', [id]);
      for (const t of tags) {
        await pool.execute('INSERT INTO employee_access (employee_id, tag) VALUES (?, ?)', [id, t]);
      }
    }
    // Push nach Authentik. Ein Fehler bricht das Speichern NICHT ab -
    // die DB-Aenderung bleibt bestehen und laesst sich erneut pushen.
    let push;
    try {
      const [[akt]] = await pool.execute(
        'SELECT role, username, email FROM employees WHERE id = ?', [id]
      );
      const [tagRows] = await pool.execute(
        'SELECT tag FROM employee_access WHERE employee_id = ?', [id]
      );
      const r = await syncEmployeeGroups({
        username: akt.username,
        email: akt.email,
        role: akt.role,
        accessTags: tagRows.map(x => x.tag),
      });
      push = { ok: true, ...r };
      console.log(`[Authentik-Push] ${r.username}: ${r.gesetzt.join(', ')}`);
    } catch (e) {
      console.error('[Authentik-Push] fehlgeschlagen:', e.message);
      push = { ok: false, error: e.message };
    }
    res.json({ ok: true, push });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
