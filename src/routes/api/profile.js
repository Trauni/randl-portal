const _db = require('../../db');
const pool = { query: (...a) => _db.getPool().execute(...a) };
// src/routes/api/profile.js
const express = require('express');
const router  = express.Router();
const requireAuth = require('../../middleware/requireAuth');
const { updateUserEmail } = require('../../services/authentik');

router.get('/', requireAuth, async (req, res) => {
  try {
    const uid = req.session.user.authentikUid;
    const [rows] = await pool.query(
      `SELECT id, authentik_uid, username, full_name, display_name,
              email, phone, phone_mobile, position_title, department,
              start_date, address_street, address_zip, address_city,
              address_country, created_at, updated_at
       FROM employees WHERE authentik_uid = ?`, [uid]
    );
    if (!rows.length) {
      await pool.query(
        `INSERT INTO employees (authentik_uid, username, full_name, email)
         VALUES (?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE username=VALUES(username)`,
        [uid,
         req.session.user.preferred_username || req.session.user.email,
         req.session.user.name || '',
         req.session.user.email || '']
      );
      const [newRows] = await pool.query('SELECT * FROM employees WHERE authentik_uid = ?', [uid]);
      return res.json(newRows[0]);
    }
    res.json(rows[0]);
  } catch (err) {
    console.error('GET /api/profile:', err);
    res.status(500).json({ error: 'Datenbankfehler' });
  }
});

router.put('/', requireAuth, async (req, res) => {
  try {
    const uid = req.session.user.authentikUid;
    const { display_name, phone, phone_mobile, address_street,
            address_zip, address_city, address_country, email } = req.body;

    if (display_name !== undefined && display_name.trim() === '')
      return res.status(400).json({ error: 'Anzeigename darf nicht leer sein.' });
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      return res.status(400).json({ error: 'Ungültige E-Mail-Adresse.' });

    const [[vorher]] = await pool.query(
      'SELECT username, email FROM employees WHERE authentik_uid = ?', [uid]
    );

    await pool.query(
      `UPDATE employees SET
         display_name    = COALESCE(?, display_name),
         phone           = COALESCE(?, phone),
         phone_mobile    = COALESCE(?, phone_mobile),
         address_street  = COALESCE(?, address_street),
         address_zip     = COALESCE(?, address_zip),
         address_city    = COALESCE(?, address_city),
         address_country = COALESCE(?, address_country),
         email           = COALESCE(?, email)
       WHERE authentik_uid = ?`,
      [display_name??null, phone??null, phone_mobile??null,
       address_street??null, address_zip??null, address_city??null,
       address_country??null, email??null, uid]
    );

    // E-Mail nach Authentik (PATCH nur bei Abweichung, holt auch alte Altfaelle nach).
    // Ein Fehler bricht das Speichern nicht ab.
    if (email) {
      try {
        const r = await updateUserEmail({
          username: vorher?.username || req.session.user.username,
          oldEmail: vorher?.email,
          email,
        });
        if (r.geaendert) console.log(`[Authentik-Email] ${r.username}: ${email}`);
        req.session.user.email = email;
      } catch (e) { console.error('[Authentik-Email] fehlgeschlagen:', e.message); }
    }

    const [updated] = await pool.query(
      `SELECT id, authentik_uid, username, full_name, display_name,
              email, phone, phone_mobile, position_title, department,
              start_date, address_street, address_zip, address_city,
              address_country, updated_at
       FROM employees WHERE authentik_uid = ?`, [uid]
    );
    res.json(updated[0]);
  } catch (err) {
    console.error('PUT /api/profile:', err);
    res.status(500).json({ error: 'Speichern fehlgeschlagen' });
  }
});

router.get('/:id', requireAuth, async (req, res) => {
  const isAdmin = ['Geschäftsführung','Backoffice'].some(g => (req.session.user.groups || []).includes(g));
  if (!isAdmin) return res.status(403).json({ error: 'Kein Zugriff' });
  const [rows] = await pool.query(
    `SELECT id, username, full_name, display_name, email, phone, phone_mobile,
            position_title, department, start_date,
            address_street, address_zip, address_city, address_country
     FROM employees WHERE id = ?`, [req.params.id]
  );
  if (!rows.length) return res.status(404).json({ error: 'Nicht gefunden' });
  res.json(rows[0]);
});

module.exports = router;
