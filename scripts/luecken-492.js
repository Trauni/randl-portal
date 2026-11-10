/**
 * #492: Lückenliste — Arbeitstage ohne Zeiteintrag, ohne genehmigten Urlaub/Abbau, ohne Freistellung
 * und ohne Krankheit. Gedacht für die Prüfung vor dem Aktivieren des Gleitzeitkontos.
 * Arbeitstage richten sich nach der hinterlegten Wochenarbeitszeit (Regeltage, ohne bayerische Feiertage).
 * Nur lesend.
 *
 * Aufruf (im Portal-Ordner):
 *   node scripts/luecken-492.js <employeeId> [von] [bis]
 * von = Standard gleitzeit_seit bzw. 1. Januar, bis = Standard gestern.
 */
require('dotenv').config({ override: true });
const { getPool } = require('../src/db');
const { arbeitszeitAm, regelSoll } = require('../src/utils/gleitzeit');

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const gestern = () => new Date(Date.now() - 86400000).toLocaleDateString('sv-SE', { timeZone: 'Europe/Berlin' });
const WT = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
const de = (tag) => tag.split('-').reverse().join('.');
const wochentag = (tag) => WT[new Date(tag + 'T12:00:00Z').getUTCDay()];

(async () => {
  const [idArg, vonArg, bisArg] = process.argv.slice(2);
  const id = Number(idArg);
  if (!id) { console.log('Aufruf: node scripts/luecken-492.js <employeeId> [von YYYY-MM-DD] [bis]'); process.exit(1); }
  const db = getPool();
  const [[emp]] = await db.query(
    `SELECT id, COALESCE(full_name, username) AS name, DATE_FORMAT(gleitzeit_seit,'%Y-%m-%d') AS seit FROM employees WHERE id = ?`, [id]);
  if (!emp) { console.log(`Mitarbeiter ${id} nicht gefunden`); process.exit(1); }
  const von = vonArg || emp.seit || `${new Date().getFullYear()}-01-01`;
  const bis = bisArg || gestern();
  if (!ISO.test(von) || !ISO.test(bis)) { console.log('Datum muss YYYY-MM-DD sein'); process.exit(1); }

  const [historie] = await db.query(
    `SELECT DATE_FORMAT(gueltig_ab,'%Y-%m-%d') AS gueltig_ab, wochenstunden, arbeitstage FROM gleitzeit_arbeitszeit WHERE employee_id = ?`, [id]);
  if (!historie.length) { console.log(`${emp.name}: keine Wochenarbeitszeit hinterlegt, Arbeitstage nicht bestimmbar`); process.exit(1); }

  const belegt = new Set();
  const [zeiten] = await db.query(
    `SELECT DISTINCT DATE_FORMAT(tag,'%Y-%m-%d') AS tag FROM time_entries WHERE employee_id = ? AND tag BETWEEN ? AND ?`, [id, von, bis]);
  zeiten.forEach((r) => belegt.add(r.tag));
  const bereiche = [];
  const [urlaub] = await db.query(
    `SELECT DATE_FORMAT(start_date,'%Y-%m-%d') AS von, DATE_FORMAT(end_date,'%Y-%m-%d') AS bis FROM vacation_requests
      WHERE employee_id = ? AND status = 'approved' AND cancelled_at IS NULL AND start_date <= ? AND end_date >= ?`, [id, bis, von]);
  bereiche.push(...urlaub);
  const [frei] = await db.query(
    `SELECT DATE_FORMAT(von,'%Y-%m-%d') AS von, DATE_FORMAT(bis,'%Y-%m-%d') AS bis FROM gleitzeit_freistellung
      WHERE employee_id = ? AND von <= ? AND bis >= ?`, [id, bis, von]);
  bereiche.push(...frei);
  for (const b of bereiche) {
    for (let d = new Date(b.von + 'T12:00:00Z'); d <= new Date(b.bis + 'T12:00:00Z'); d = new Date(+d + 86400000)) {
      belegt.add(d.toISOString().slice(0, 10));
    }
  }

  const luecken = [];
  for (let d = new Date(von + 'T12:00:00Z'); d <= new Date(bis + 'T12:00:00Z'); d = new Date(+d + 86400000)) {
    const tag = d.toISOString().slice(0, 10);
    if (regelSoll(arbeitszeitAm(historie, tag), tag) > 0 && !belegt.has(tag)) luecken.push(tag);
  }

  console.log(`${emp.name} (Portal ${emp.id}), ${de(von)} bis ${de(bis)}: ${luecken.length} Arbeitstage ohne Zeit, Urlaub, Abbau, Freistellung oder Krankheit\n`);
  // aufeinanderfolgende Arbeitstage zu Blöcken zusammenfassen (Wochenenden/Feiertage dazwischen unterbrechen nicht)
  const alle = [];
  for (let d = new Date(von + 'T12:00:00Z'); d <= new Date(bis + 'T12:00:00Z'); d = new Date(+d + 86400000)) {
    const tag = d.toISOString().slice(0, 10);
    if (regelSoll(arbeitszeitAm(historie, tag), tag) > 0) alle.push(tag);
  }
  const fehlt = new Set(luecken);
  let block = [];
  const ausgeben = () => {
    if (!block.length) return;
    const a = block[0], z = block[block.length - 1];
    console.log(block.length === 1
      ? `  ${wochentag(a)} ${de(a)}`
      : `  ${wochentag(a)} ${de(a)} – ${wochentag(z)} ${de(z)}  (${block.length} Tage)`);
    block = [];
  };
  for (const tag of alle) { if (fehlt.has(tag)) block.push(tag); else ausgeben(); }
  ausgeben();
  process.exit(0);
})().catch((e) => { console.error(e.message); process.exit(1); });
