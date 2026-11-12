/**
 * Doppelte Urlaubsanträge in Rentman bereinigen. Ein Rentman-Antrag, den das Portal
 * nicht kennt (rentman_leaverequest_id / Zeiteintrag nicht in vacation_requests), wird
 * storniert, wenn ALLE seine Tage durch einen genehmigten Portal-Urlaub abgedeckt sind.
 * Urlaub, der nur in Rentman existiert, bleibt unberührt und wird gemeldet.
 *
 * Aufruf (im Portal-Ordner):
 *   node scripts/rentman-urlaub-doppel.js <id|name>              Probelauf
 *   node scripts/rentman-urlaub-doppel.js <id|name> --schreiben  Anträge stornieren
 * Berührt nur Rentman. Das Gleitzeitkonto im Portal bleibt unverändert.
 */
require('dotenv').config({ override: true });
const { getPool } = require('../src/db');

const BASE = 'https://api.rentman.net';
const URLAUB = '/leavetypes/2';
const SCHREIBEN = process.argv.includes('--schreiben');
const wer = process.argv.slice(2).find((a) => !a.startsWith('--'));
const de = (t) => t.split('-').reverse().join('.');

async function api(method, pfad, body) {
  const res = await fetch(BASE + pfad, {
    method,
    headers: { Authorization: 'Bearer ' + process.env.RENTMAN_API_TOKEN, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const roh = await res.text();
  if (!res.ok) throw new Error(`Rentman ${method} ${pfad} → ${res.status}: ${roh.slice(0, 200)}`);
  return JSON.parse(roh).data;
}
const idAus = (p) => Number(String(p || '').split('/').pop()) || null;

(async () => {
  if (!wer) { console.log('Aufruf: node scripts/rentman-urlaub-doppel.js <id|name> [--schreiben]'); process.exit(1); }
  if (!process.env.RENTMAN_API_TOKEN) throw new Error('RENTMAN_API_TOKEN fehlt');
  const db = getPool();
  const [ma] = /^\d+$/.test(wer)
    ? await db.query('SELECT id, rentman_id, COALESCE(full_name, username) AS name FROM employees WHERE id = ?', [Number(wer)])
    : await db.query('SELECT id, rentman_id, COALESCE(full_name, username) AS name FROM employees WHERE full_name LIKE ?', [`%${wer}%`]);
  if (ma.length !== 1) throw new Error(`"${wer}" ist nicht eindeutig (${ma.length} Treffer)`);
  const m = ma[0];
  if (!m.rentman_id) throw new Error(`${m.name} hat keine rentman_id`);
  console.log(`${m.name} (Portal ${m.id}, Rentman ${m.rentman_id})${SCHREIBEN ? ' — SCHREIBEN' : ' — Probelauf'}\n`);

  const [antraege] = await db.query(
    `SELECT id, rentman_leaverequest_id AS lr, DATE_FORMAT(start_date,'%Y-%m-%d') AS von, DATE_FORMAT(end_date,'%Y-%m-%d') AS bis
       FROM vacation_requests WHERE employee_id = ? AND art = 'urlaub' AND status = 'approved' AND cancelled_at IS NULL`, [m.id]);
  const [tageRows] = await db.query(
    `SELECT rentman_timeregistration_id AS tr FROM vacation_request_days d JOIN vacation_requests v ON v.id = d.vacation_request_id
      WHERE v.employee_id = ? AND d.rentman_timeregistration_id IS NOT NULL`, [m.id]);
  const bekannteLr = new Set(antraege.map((a) => a.lr).filter(Boolean).map(Number));
  const bekannteTr = new Set(tageRows.map((r) => Number(r.tr)));
  const abgedeckt = (tag) => antraege.some((a) => a.von <= tag && tag <= a.bis);

  // Seitenweise ab Jahresbeginn: ohne Datumsfilter fehlen bei vielen Arbeitszeit-Einträgen die jüngsten.
  const eintraege = [];
  for (let offset = 0; ; offset += 500) {
    const seite = (await api('GET', '/timeregistration?crewmember=' + encodeURIComponent('/crew/' + m.rentman_id)
      + '&start[gte]=' + encodeURIComponent('2026-01-01T00:00:00') + '&sort=%2Bstart&limit=500&offset=' + offset)) || [];
    eintraege.push(...seite);
    if (seite.length < 500) break;
  }
  const alleUrlaub = eintraege.filter((e) => e.leavetype === URLAUB);
  const proStatus = {};
  for (const e of alleUrlaub) proStatus[e.status] = (proStatus[e.status] || 0) + 1;
  console.log(`Rentman: ${eintraege.length} Einträge seit 01.01., davon Urlaub ${alleUrlaub.length} (nach Status: ${JSON.stringify(proStatus)})\n`);
  // Alles außer 'rejected' erscheint in der Zeiterfassungs-Anzeige, also auch 'canceled'.
  const urlaub = alleUrlaub.filter((e) => e.status !== 'rejected');

  const gruppen = new Map();
  for (const e of urlaub) {
    const lr = idAus(e.leaverequest);
    if (lr && bekannteLr.has(lr)) continue;
    if (bekannteTr.has(Number(e.id))) continue;
    const k = lr === null ? 'ohne' : lr;
    if (!gruppen.has(k)) gruppen.set(k, []);
    gruppen.get(k).push(String(e.start).slice(0, 10));
  }
  if (!gruppen.size) { console.log('Keine unbekannten Urlaubseinträge in Rentman. Nichts zu tun.'); process.exit(); }

  for (const [lr, tage] of gruppen) {
    tage.sort();
    const nichtGedeckt = tage.filter((t) => !abgedeckt(t));
    const bereich = `${de(tage[0])} – ${de(tage[tage.length - 1])}, ${tage.length} Einträge`;
    if (lr === 'ohne') { console.log(`?  ohne Antrag (${bereich}) — wird nicht angefasst`); continue; }
    if (nichtGedeckt.length) {
      console.log(`!  Rentman-Antrag ${lr} (${bereich}): ${nichtGedeckt.length} Tage ohne Portal-Urlaub (${nichtGedeckt.map(de).join(', ')}) — bleibt, bitte prüfen`);
      continue;
    }
    console.log(`-  Rentman-Antrag ${lr} (${bereich}): vollständig durch Portal-Urlaub gedeckt → ${SCHREIBEN ? 'storniere' : 'würde stornieren'}`);
    if (SCHREIBEN) {
      await api('PUT', '/leaverequest/' + lr, {
        requested_for: '/crew/' + m.rentman_id, approval_status: 'canceled',
        description: 'Doppelt zum Portal-Urlaub, storniert (Mitarbeiterportal)',
      });
    }
  }
  process.exit();
})().catch((e) => { console.error('FEHLER:', e.message); process.exit(1); });
