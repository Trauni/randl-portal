/**
 * #490: days_count offener und künftiger Urlaubsanträge ohne Feiertage neu zählen.
 *
 * Seit #490 zählt das Portal Urlaubstage ohne gesetzliche Feiertage in Bayern.
 * Bestehende Anträge tragen noch die alte Zählung (nur Mo–Fr). Vergangene und
 * laufende Urlaube bleiben unangetastet — die sind abgerechnet bzw. in Rentman
 * bereits genehmigt. Rentman selbst zieht beim ersten Urlaubstag nach, weil
 * der nächtliche Job vorläufige Anträge dann neu überträgt.
 *
 * Aufruf (im Portal-Ordner):
 *   node scripts/urlaub-feiertage-490.js              nur auflisten
 *   node scripts/urlaub-feiertage-490.js --schreiben  days_count korrigieren
 */
require('dotenv').config({ override: true });
const { getPool } = require('../src/db');
const { arbeitstage, feiertag } = require('../src/utils/feiertage');

const SCHREIBEN = process.argv.includes('--schreiben');

(async () => {
  const db = getPool();
  const [rows] = await db.query(
    `SELECT vr.id, vr.status, vr.days_count, vr.vorlaeufig,
            DATE_FORMAT(vr.start_date,'%Y-%m-%d') AS von,
            DATE_FORMAT(vr.end_date,  '%Y-%m-%d') AS bis,
            COALESCE(e.full_name, e.username) AS name
       FROM vacation_requests vr
       JOIN employees e ON e.id = vr.employee_id
      WHERE vr.status IN ('pending', 'approved')
        AND vr.cancelled_at IS NULL
        AND vr.start_date > CURDATE()
      ORDER BY vr.start_date`);

  let betroffen = 0;
  for (const r of rows) {
    const neu = arbeitstage(r.von, r.bis).length;
    if (neu === r.days_count) continue;
    betroffen++;
    const namen = [];
    for (let d = new Date(r.von + 'T12:00:00Z'); d <= new Date(r.bis + 'T12:00:00Z'); d = new Date(+d + 86400000)) {
      const tag = d.toISOString().slice(0, 10);
      const f = feiertag(tag);
      if (f && d.getUTCDay() % 6 !== 0) namen.push(`${tag.slice(8)}.${tag.slice(5, 7)}. ${f}`);
    }
    console.log(
      `#${String(r.id).padEnd(5)} ${r.name.padEnd(24)} ${r.von} bis ${r.bis}  ${r.status.padEnd(8)}`
      + `  ${r.days_count} -> ${neu} Tage  (${namen.join(', ') || 'Abweichung ohne Feiertag'})`);
    if (SCHREIBEN) {
      await db.execute('UPDATE vacation_requests SET days_count = ? WHERE id = ?', [neu, r.id]);
    }
  }

  console.log(`\n${rows.length} künftige Anträge geprüft, ${betroffen} betroffen`
    + (SCHREIBEN ? ' — korrigiert.' : ' — nichts geschrieben (mit --schreiben korrigieren).'));
  process.exit(0);
})().catch((e) => { console.error('FEHLER:', e.message); process.exit(1); });
