/**
 * Genehmigten Urlaub verkürzen (Ende vorziehen), z. B. wenn jemand früher zurück war.
 * Setzt end_date und days_count neu und stößt dieselbe Verbuchung an wie die Genehmigung:
 * Urlaubsbemessung, Tage entfallen auch im Rentman-Spiegel, Gleitzeitkonto wird für den
 * ursprünglichen Zeitraum neu gerechnet. Der Hinweis steht in der Notiz des Antrags.
 * Nur Verkürzen. Liegt das neue Ende vor dem Beginn, bitte den Antrag stornieren.
 *
 * Aufruf (im Portal-Ordner):
 *   node scripts/urlaub-kuerzen.js <id|name> <neues-ende YYYY-MM-DD> [--von-id=1]              Probelauf
 *   node scripts/urlaub-kuerzen.js <id|name> <neues-ende YYYY-MM-DD> [--von-id=1] --schreiben  schreiben
 * Wer: Portal-ID oder Namensteil (muss eindeutig sein). Gekürzt wird der genehmigte Urlaub,
 * der das neue Ende überspannt (neues Ende liegt zwischen Beginn und Ende).
 */
require('dotenv').config({ override: true });
const { getPool } = require('../src/db');
const { arbeitstage } = require('../src/utils/feiertage');
const gleitzeit = require('../src/services/gleitzeit');
const urlaub = require('../src/services/urlaub');

const opt = (name, std) => {
  const a = process.argv.find((x) => x.startsWith(`--${name}=`));
  return a ? a.split('=')[1] : std;
};
const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const SCHREIBEN = process.argv.includes('--schreiben');
const VON_ID = Number(opt('von-id', '1'));
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const de = (tag) => tag.split('-').reverse().join('.');

(async () => {
  const [wer, neuesEnde] = args;
  if (!wer || !ISO.test(neuesEnde || '')) {
    console.log('Aufruf: node scripts/urlaub-kuerzen.js <id|name> <neues-ende YYYY-MM-DD> [--schreiben]');
    process.exit(1);
  }
  const db = getPool();
  const [kandidaten] = /^\d+$/.test(wer)
    ? await db.execute('SELECT id, COALESCE(full_name, username) AS name FROM employees WHERE id = ?', [Number(wer)])
    : await db.execute(
      `SELECT id, COALESCE(full_name, username) AS name FROM employees
        WHERE full_name LIKE ? OR username LIKE ?`, [`%${wer}%`, `%${wer}%`]);
  if (kandidaten.length !== 1) {
    console.log(kandidaten.length ? `Nicht eindeutig: ${kandidaten.map((k) => `${k.id} ${k.name}`).join(', ')}` : `Niemand gefunden für "${wer}"`);
    process.exit(1);
  }
  const emp = kandidaten[0];

  const [antraege] = await db.execute(
    `SELECT id, DATE_FORMAT(start_date,'%Y-%m-%d') AS von, DATE_FORMAT(end_date,'%Y-%m-%d') AS bis, days_count
       FROM vacation_requests
      WHERE employee_id = ? AND art = 'urlaub' AND status = 'approved' AND cancelled_at IS NULL
        AND start_date <= ? AND end_date > ?`, [emp.id, neuesEnde, neuesEnde]);
  console.log(`${emp.name} (Portal ${emp.id}) — ${SCHREIBEN ? 'SCHREIBEN' : 'Probelauf'}`);
  if (antraege.length !== 1) {
    console.log(antraege.length
      ? `Mehrere passende Anträge: ${antraege.map((a) => `${a.id} (${de(a.von)}–${de(a.bis)})`).join(', ')}`
      : `Kein genehmigter Urlaub, der über den ${de(neuesEnde)} hinausgeht und davor beginnt`);
    process.exit(1);
  }
  const a = antraege[0];
  const tage = arbeitstage(a.von, neuesEnde);
  console.log(`Antrag ${a.id}: ${de(a.von)}–${de(a.bis)} (${a.days_count} Tage) -> ${de(a.von)}–${de(neuesEnde)} (${tage.length} Tage)`);
  if (!tage.length) { console.log('Im neuen Zeitraum liegt kein Arbeitstag, bitte stattdessen den Antrag stornieren'); process.exit(1); }
  if (!SCHREIBEN) process.exit(0);

  await db.execute(
    `UPDATE vacation_requests
        SET end_date = ?, days_count = ?,
            note = CONCAT_WS('\n', note, ?)
      WHERE id = ?`,
    [neuesEnde, tage.length, `Gekürzt: Ende ${de(a.bis)} auf ${de(neuesEnde)} (Nachtrag, erfasst von ${VON_ID})`, a.id]);
  const verbuchung = await urlaub.nachRentman(a.id);
  console.log('Verbuchung:', JSON.stringify(verbuchung));
  const gz = await gleitzeit.zeitraumGeaendert(emp.id, a.von, a.bis);
  console.log('Gleitzeit neu gerechnet:', JSON.stringify(gz));
  process.exit(0);
})().catch((e) => { console.error(e.message); process.exit(1); });
