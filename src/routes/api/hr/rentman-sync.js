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
  const unbekannt = [];

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
        // Portal führt (#498): Der Sync legt niemanden mehr an und überschreibt keine Stammdaten
        // (Name, E-Mail, Telefon). Er verknüpft nur vorhandene Portal-User mit ihrer Rentman-ID
        // und merkt sich den Sync-Zeitpunkt. Unbekannte Crew-Mitglieder werden nur gemeldet.
        const { row, via, konflikt } = await findeMitarbeiter(getPool(), { rentmanId: m.id, email: m.email });
        if (konflikt) { konflikte.push(`Rentman ${m.id}: ${konflikt}`); skipped++; continue; }
        if (!row) { unbekannt.push(`${m.displayname || m.id} <${m.email}>`); skipped++; continue; }
        if (row.is_demo) { skipped++; continue; }
        if (row.status === 'inaktiv' && m.active) {
          konflikte.push(`Rentman ${m.id}: im Portal inaktiv, in Rentman aktiv (Abweichung, nicht geändert)`);
        }
        await getPool().execute(
          'UPDATE employees SET rentman_id = ?, rentman_synced_at = NOW() WHERE id = ?', [m.id, row.id]);
        if (via === 'email') created++; else updated++; // created = neu verknüpft
      } catch (err) {
        console.error(`[Rentman] Fehler bei ID ${m.id}:`, err.message);
        errors++;
      }
    }

    console.log(`[Rentman] Sync fertig: +${created} neu, ~${updated} aktualisiert, ${errors} Fehler, ${skipped} uebersprungen`);
    if (unbekannt.length) console.warn('[Rentman] Nicht im Portal:', unbekannt.join(' | '));
    if (konflikte.length) console.warn('[Rentman] Konflikte:', konflikte.join(' | '));
    return { created, updated, errors, skipped, konflikte, unbekannt, total: crew.length };

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
