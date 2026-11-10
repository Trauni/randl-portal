/**
 * #492: Übersicht für die Umstellung der Zeiterfassung auf das Portal. Nur lesend, kein Rentman-Aufruf.
 * Je Mitarbeiter (aktiv, nicht Demo): Quelle, Rentman-Verknüpfung, Minijob, Arbeitszeit, Gleitzeitkonto,
 * Portal-Zeiten dieses Jahr, letzter Eintrag, Urlaub und Auffälligkeiten.
 * Die Rentman-Stunden zeigt der Probelauf: node scripts/rentman-zeiten-import-490.js <id> 2026-01-01
 *
 * Aufruf (im Portal-Ordner):  node scripts/umstellung-status-492.js
 */
require('dotenv').config({ override: true });
const { getPool } = require('../src/db');

const hm = (sek) => `${Math.floor(sek / 3600)}:${String(Math.round((sek % 3600) / 60)).padStart(2, '0')}`;

(async () => {
  const db = getPool();
  const jahr = new Date().getFullYear();
  const [rows] = await db.query(
    `SELECT e.id, e.full_name, e.email, e.role, e.department, e.zeiterfassung_quelle AS quelle, e.rentman_id,
            e.minijob, e.minijob_max_stunden_monat AS limit_h, e.gleitzeit_aktiv, e.authentik_uid,
            (SELECT CONCAT(wochenstunden, ' h') FROM gleitzeit_arbeitszeit a WHERE a.employee_id = e.id ORDER BY gueltig_ab DESC LIMIT 1) AS arbeitszeit,
            (SELECT COUNT(*) FROM time_entries t WHERE t.employee_id = e.id AND YEAR(t.tag) = ?) AS portal_n,
            (SELECT COALESCE(SUM(GREATEST(TIMESTAMPDIFF(SECOND, t.start, t.ende) - t.pause_sekunden, 0)), 0)
               FROM time_entries t WHERE t.employee_id = e.id AND YEAR(t.tag) = ? AND t.ende IS NOT NULL AND t.eintrag_typ <> 'krankheit') AS portal_sek,
            (SELECT DATE_FORMAT(MAX(t.tag), '%Y-%m-%d') FROM time_entries t WHERE t.employee_id = e.id) AS letzter,
            (SELECT COUNT(*) FROM vacation_requests v WHERE v.employee_id = e.id AND v.status = 'approved' AND v.cancelled_at IS NULL AND YEAR(v.start_date) = ?) AS urlaub_n
       FROM employees e
      WHERE e.is_demo = 0 AND e.status = 'aktiv'
      ORDER BY (e.zeiterfassung_quelle = 'portal'), e.full_name`, [jahr, jahr, jahr]);

  console.log(`Umstellung Zeiterfassung ${jahr}: ${rows.length} aktive Mitarbeiter\n`);
  for (const r of rows) {
    const hinweise = [];
    if (!r.full_name) hinweise.push('KEIN NAME');
    if (!r.rentman_id) hinweise.push('keine rentman_id');
    if (!r.authentik_uid) hinweise.push('nie angemeldet');
    if (r.quelle === 'portal' && !r.minijob && !r.arbeitszeit) hinweise.push('Quelle portal, aber keine Wochenarbeitszeit');
    if (r.minijob && !r.limit_h) hinweise.push('Minijob ohne Limit');
    if (r.quelle === 'rentman' && r.portal_n > 0) hinweise.push(`schon ${r.portal_n} Portal-Einträge`);
    const status = r.quelle === 'portal' ? 'PORTAL ' : 'RENTMAN';
    console.log(`${status} #${r.id} ${r.full_name || 'null'} <${r.email || '—'}> ${r.role}/${r.department || '—'}`);
    console.log(`   rentman_id ${r.rentman_id || '—'} · Arbeitszeit ${r.minijob ? `Minijob ${Number(r.limit_h) || '?'} h/Monat` : (r.arbeitszeit || 'keine')}`
      + ` · Gleitzeit ${r.gleitzeit_aktiv ? 'an' : 'aus'} · Portal ${r.portal_n} Einträge, ${hm(r.portal_sek)} h, zuletzt ${r.letzter || '—'}`
      + ` · Urlaub genehmigt ${r.urlaub_n}`);
    if (hinweise.length) console.log(`   ⚠ ${hinweise.join('; ')}`);
  }
  process.exit(0);
})().catch((e) => { console.error(e.message); process.exit(1); });
