/**
 * #534: Pauschale Zeiten für Mitarbeitende, die nicht stempeln (Dominik Randl, Günther Randl).
 * Je Arbeitstag (Mo–Fr ohne bayerische Feiertage) ein abgeschlossener Eintrag: 8 h netto + 30 min Pause
 * (Standard 08:00–16:30). Ausgelassen werden Tage mit vorhandenem Zeiteintrag und genehmigtem Urlaub/Abbau.
 * Die Einträge gehen NICHT nach Rentman (kein Spiegeln) und tragen im Verlauf (time_entry_audit_log,
 * Feld 'pauschal') eine Markierung — damit lassen sie sich beim Geradeziehen am Jahresende finden.
 * Mehrfach ausführbar: Tage mit Eintrag werden übersprungen.
 *
 * Aufruf (im Portal-Ordner):
 *   node scripts/pauschal-zeiten-534.js <id[,id…]> <von> [bis] [--start=08:00] [--netto=8] [--pause=30] [--von-id=1]            Probelauf
 *   node scripts/pauschal-zeiten-534.js <id[,id…]> <von> [bis] … --schreiben                                                  schreiben
 * bis = Standard gestern. --netto in Stunden, --pause in Minuten, --von-id = erfassende Person (Standard 1).
 */
require('dotenv').config({ override: true });
const { getPool } = require('../src/db');
const { planeTage } = require('../src/utils/pauschalZeit');

const opt = (name, std) => {
  const a = process.argv.find((x) => x.startsWith(`--${name}=`));
  return a ? a.split('=')[1] : std;
};
const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const SCHREIBEN = process.argv.includes('--schreiben');
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const gestern = () => new Date(Date.now() - 86400000).toLocaleDateString('sv-SE', { timeZone: 'Europe/Berlin' });
const hm = (min) => `${Math.floor(min / 60)}:${String(min % 60).padStart(2, '0')}`;

(async () => {
  const [idsArg, von, bisArg] = args;
  const bis = bisArg || gestern();
  const ids = String(idsArg || '').split(',').map(Number).filter(Boolean);
  if (!ids.length || !ISO.test(von || '') || !ISO.test(bis)) {
    console.log('Aufruf: node scripts/pauschal-zeiten-534.js <id[,id…]> <von YYYY-MM-DD> [bis] [--start=08:00] [--netto=8] [--pause=30] [--schreiben]');
    process.exit(1);
  }
  const start = opt('start', '08:00');
  const nettoMinuten = Math.round(Number(opt('netto', '8').replace(',', '.')) * 60);
  const pauseMinuten = Number(opt('pause', '30'));
  const erfasstVon = Number(opt('von-id', '1'));

  const db = getPool();
  for (const id of ids) {
    const [[emp]] = await db.execute('SELECT id, COALESCE(full_name, username) AS name FROM employees WHERE id = ?', [id]);
    if (!emp) { console.log(`Mitarbeiter ${id} nicht gefunden`); continue; }

    const [belegt] = await db.execute(
      `SELECT DISTINCT DATE_FORMAT(tag,'%Y-%m-%d') AS tag FROM time_entries WHERE employee_id = ? AND tag BETWEEN ? AND ?`,
      [id, von, bis]);
    const [urlaub] = await db.execute(
      `SELECT DATE_FORMAT(start_date,'%Y-%m-%d') AS von, DATE_FORMAT(end_date,'%Y-%m-%d') AS bis
         FROM vacation_requests
        WHERE employee_id = ? AND status = 'approved' AND cancelled_at IS NULL
          AND start_date <= ? AND end_date >= ?`, [id, bis, von]);
    const abwesend = new Set();
    for (const u of urlaub) {
      for (let d = new Date(u.von + 'T12:00:00Z'); d <= new Date(u.bis + 'T12:00:00Z'); d = new Date(+d + 86400000)) {
        abwesend.add(d.toISOString().slice(0, 10));
      }
    }
    const { geplant, uebersprungen } = planeTage({
      von, bis, start, nettoMinuten, pauseMinuten,
      belegt: new Set(belegt.map((r) => r.tag)), abwesend,
    });

    console.log(`\n${emp.name} (Portal ${emp.id}), ${von} bis ${bis} — ${SCHREIBEN ? 'SCHREIBEN' : 'Probelauf'}`);
    console.log(`  ${geplant.length} Tage à ${hm(nettoMinuten)} h netto + ${pauseMinuten} min Pause (${start}–${geplant[0] ? geplant[0].ende.slice(11, 16) : '—'}) = ${hm(geplant.length * nettoMinuten)} h`);
    if (uebersprungen.length) {
      console.log(`  übersprungen (${uebersprungen.length}): ` + uebersprungen.map((u) => `${u.tag} ${u.grund}`).join(', '));
    }
    if (!SCHREIBEN) continue;

    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();
      for (const z of geplant) {
        const [r] = await conn.execute(
          `INSERT INTO time_entries (employee_id, tag, start, ende, pause_sekunden, status, eintrag_typ, erfasst_von)
           VALUES (?, ?, ?, ?, ?, 'abgeschlossen', 'arbeitszeit', ?)`,
          [id, z.tag, z.start, z.ende, z.pauseSekunden, erfasstVon]);
        await conn.execute(
          `INSERT INTO time_entry_audit_log (time_entry_id, geaendert_von, feld, alt_wert, neu_wert)
           VALUES (?, ?, 'pauschal', NULL, ?)`,
          [r.insertId, erfasstVon, 'pauschal erfasst (#534), wird zum Jahresende geradegezogen']);
      }
      await conn.commit();
      console.log(`  ${geplant.length} Einträge geschrieben.`);
    } catch (e) {
      await conn.rollback();
      console.error('  Fehler, nichts geschrieben:', e.message);
      process.exitCode = 1;
    } finally {
      conn.release();
    }
  }
  process.exit(process.exitCode || 0);
})().catch((e) => { console.error(e.message); process.exit(1); });
