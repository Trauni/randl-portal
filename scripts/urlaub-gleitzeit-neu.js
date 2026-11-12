/**
 * Genehmigten Urlaub von Mitarbeitern mit Gleitzeitkonto neu berechnen, damit er mit dem
 * Tages-Soll (Wochenstunden / Arbeitstage) statt mit dem alten 13-Wochen-Schnitt steht.
 * Erfasst werden Urlaube ab gleitzeit_seit des jeweiligen Kontos. Rentman-Spiegel wird mitgezogen.
 *
 * Aufruf (im Portal-Ordner):
 *   node scripts/urlaub-gleitzeit-neu.js [name]              Probelauf, zeigt alt -> neu
 *   node scripts/urlaub-gleitzeit-neu.js [name] --schreiben  schreiben
 * Ohne name: alle Konten. Mit name (Teil des Namens): nur diese Person(en).
 */
require('dotenv').config({ override: true });
const { getPool } = require('../src/db');
const urlaub = require('../src/services/urlaub');

const SCHREIBEN = process.argv.includes('--schreiben');
const name = process.argv.slice(2).find((a) => !a.startsWith('--'));
const std = (s) => (s === null || s === undefined ? '-' : (s / 3600).toFixed(2) + ' h');

(async () => {
  const db = getPool();
  const [rows] = await db.query(
    `SELECT vr.id, COALESCE(e.full_name, e.username) AS name,
            DATE_FORMAT(vr.start_date,'%d.%m.%Y') AS von, vr.stunden_sekunden AS alt
       FROM vacation_requests vr JOIN employees e ON e.id = vr.employee_id
      WHERE vr.art = 'urlaub' AND vr.status = 'approved' AND vr.cancelled_at IS NULL
        AND e.gleitzeit_aktiv = 1 AND e.gleitzeit_seit IS NOT NULL
        AND vr.start_date >= e.gleitzeit_seit
        ${name ? 'AND e.full_name LIKE ?' : ''}
      ORDER BY e.full_name, vr.start_date`, name ? [`%${name}%`] : []);
  console.log(`${rows.length} Anträge${SCHREIBEN ? '' : ' (Probelauf, es wird nichts geschrieben)'}`);
  for (const r of rows) {
    try {
      if (SCHREIBEN) {
        const res = await urlaub.nachRentman(r.id);
        console.log(`${r.name} ${r.von}: ${std(r.alt)} -> ${std(res.schnitt)}${res.rentman && res.rentman.fehler ? ' (Rentman-Fehler: ' + res.rentman.fehler + ')' : ''}`);
      } else {
        const v = await urlaub.vorschau(r.id);
        console.log(`${r.name} ${r.von}: ${std(r.alt)} -> ${std(v.bemessung.schnitt)} [${v.bemessung.quelle}]`);
      }
    } catch (e) {
      console.log(`${r.name} ${r.von}: FEHLER ${e.message}`);
    }
  }
  process.exit();
})();
