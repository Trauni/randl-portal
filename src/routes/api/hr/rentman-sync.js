const express = require('express');
const router = express.Router();
const { getPool } = require('../../../db');
const cron = require('node-cron');
const { findeMitarbeiter } = require('../../../services/mitarbeiterMatch');

const RENTMAN_URL = process.env.RENTMAN_API_URL || 'https://api.rentman.net';
const RENTMAN_TOKEN = process.env.RENTMAN_API_TOKEN;

// ── Core Sync Function ────────────────────────────────────────────────────────
async function syncFromRentman() {
  if (!RENTMAN_TOKEN) {
    console.error('[Rentman] RENTMAN_API_TOKEN fehlt in .env');
    return { error: 'Token nicht konfiguriert' };
  }

  let created = 0, updated = 0, errors = 0, skipped = 0;
  const konflikte = [];

  try {
    const res = await fetch(`${RENTMAN_URL}/crew`, {
      headers: { 'Authorization': `Bearer ${RENTMAN_TOKEN}` }
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Rentman API ${res.status}: ${text}`);
    }

    const json = await res.json();
    const crew = json.data || json;

    console.log(`[Rentman] ${crew.length} Crew-Mitglieder empfangen`);

    for (const m of crew) {
      // Ohne E-Mail: Support-/Entwicklungs-Account in Rentman, nicht importieren
      if (!m.email) { skipped++; continue; }
      try {
        // #500: vorhandenen Portal-User (z. B. aus SSO-Login) über E-Mail an die Rentman-ID hängen,
        // statt einen zweiten anzulegen. Mehrdeutig -> melden, nicht anlegen.
        const { row, via, konflikt } = await findeMitarbeiter(getPool(), { rentmanId: m.id, email: m.email });
        if (konflikt) { konflikte.push(`Rentman ${m.id}: ${konflikt}`); skipped++; continue; }
        if (row && via === 'email') {
          await getPool().execute('UPDATE employees SET rentman_id = ? WHERE id = ?', [m.id, row.id]);
        }
        const [result] = await getPool().execute(`
          INSERT INTO employees
            (rentman_id, displayname, firstname, lastname, email, phone, active, rentman_synced_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, NOW())
          ON DUPLICATE KEY UPDATE
            displayname        = VALUES(displayname),
            firstname          = VALUES(firstname),
            lastname           = VALUES(lastname),
            email              = VALUES(email),
            phone              = VALUES(phone),
            active             = VALUES(active),
            rentman_synced_at  = NOW()
        `, [
          m.id,
          m.displayname || `${m.firstname} ${m.lastname}`.trim(),
          m.firstname || '',
          m.lastname || '',
          m.email || null,
          m.phone || null,
          m.active ? 1 : 0
        ]);

        if (result.affectedRows === 1) created++;
        else updated++;
      } catch (err) {
        console.error(`[Rentman] Fehler bei ID ${m.id}:`, err.message);
        errors++;
      }
    }

    console.log(`[Rentman] Sync fertig: +${created} neu, ~${updated} aktualisiert, ${errors} Fehler, ${skipped} uebersprungen`);
    if (konflikte.length) console.warn('[Rentman] Konflikte:', konflikte.join(' | '));
    return { created, updated, errors, skipped, konflikte, total: crew.length };

  } catch (err) {
    console.error('[Rentman] Sync-Fehler:', err.message);
    return { error: err.message };
  }
}


// ── Nächtlicher Cron (02:00 Uhr) ─────────────────────────────────────────────
cron.schedule('0 2 * * *', async () => {
  console.log('[Rentman] Nachtlicher Sync gestartet...');
  await syncFromRentman();
});

// ── GET /api/hr/rentman/status ────────────────────────────────────────────────
router.get('/status', async (req, res) => {
  try {
    const [[stats]] = await getPool().execute(`
      SELECT
        COUNT(*) AS total,
        SUM(active = 1) AS active,
        SUM(active = 0) AS inactive,
        MAX(rentman_synced_at) AS last_sync
      FROM employees
    `);
    res.json({ ok: true, stats });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/hr/rentman/sync ─────────────────────────────────────────────────
router.post('/sync', async (req, res) => {
  if (!req.session?.user) return res.status(401).json({ error: 'Nicht eingeloggt' });

  const result = await syncFromRentman();
  if (result.error) return res.status(500).json(result);
  res.json({ ok: true, ...result });
});

module.exports = { router, syncFromRentman };
