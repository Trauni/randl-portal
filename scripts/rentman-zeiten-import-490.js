/**
 * #490: Zeiten, die nur in Rentman stehen, einmalig in die Portal-Zeiterfassung übernehmen.
 *
 * Hintergrund: Das Gleitzeitkonto rechnet nur mit time_entries. Wer vor der
 * Umstellung (oder nebenbei per Rentman-App) in Rentman erfasst hat, hätte
 * dort sonst Tage mit Ist 0. Nach dem Import ist das Portal die Quelle,
 * Rentman bleibt Spiegel.
 *
 * Übernommen: leavetype 1 (Gearbeitet) und 4 (Krankheit), nicht abgelehnt.
 * Übersprungen: alles, was schon verknüpft ist (rentman_timeregistration_id),
 * und alles, was sich mit einem vorhandenen Portal-Eintrag überschneidet.
 * Die neuen Zeilen tragen die Rentman-ID — kein erneutes Spiegeln, keine
 * Doppelung in der Monatsansicht.
 *
 * Aufruf (im Portal-Ordner):
 *   node scripts/rentman-zeiten-import-490.js <employeeId> <von> [bis]               Probelauf
 *   node scripts/rentman-zeiten-import-490.js <employeeId> <von> [bis] --schreiben   übernehmen
 * bis = Standard gestern. Danach wird das Gleitzeitkonto neu berechnet (falls aktiv).
 */
require('dotenv').config({ override: true });
const { getPool } = require('../src/db');
const rentman = require('../src/services/rentman');
const gleitzeit = require('../src/services/gleitzeit');
const { mapRentmanEintrag } = require('../src/utils/rentmanImport');

const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const SCHREIBEN = process.argv.includes('--schreiben');
const [empArg, von, bisArg] = args;
const ISO = /^\d{4}-\d{2}-\d{2}$/;

const gestern = () => {
  const d = new Date(Date.now() - 86400000);
  return d.toLocaleDateString('sv-SE', { timeZone: 'Europe/Berlin' });
};
const hm = (sek) => `${Math.floor(sek / 3600)}:${String(Math.round((sek % 3600) / 60)).padStart(2, '0')}`;

/** Monatsweise abrufen — wie zeitreport(), damit das 500er-Limit nie greift. */
async function rentmanEintraege(rentmanId, von, bis) {
  const alle = [];
  let [j, m] = von.slice(0, 7).split('-').map(Number);
  const [jEnde, mEnde] = bis.slice(0, 7).split('-').map(Number);
  while (j < jEnde || (j === jEnde && m <= mEnde)) {
    const mm = String(m).padStart(2, '0');
    const letzter = new Date(Date.UTC(j, m, 0)).getUTCDate();
    const res = await rentman.api('/timeregistration', {
      crewmember: '/crew/' + rentmanId,
      'start[gte]': `${j}-${mm}-01T00:00:00`,
      'start[lte]': `${j}-${mm}-${letzter}T23:59:59`,
      sort: '+start',
      limit: 500,
    });
    const daten = res.data || [];
    if (daten.length >= 500) throw new Error(`${j}-${mm}: 500 Einträge erreicht, Abruf unvollständig`);
    alle.push(...daten);
    m += 1; if (m > 12) { m = 1; j += 1; }
  }
  return alle;
}

(async () => {
  const employeeId = Number(empArg);
  const bis = bisArg || gestern();
  if (!employeeId || !ISO.test(von || '') || !ISO.test(bis) || von > bis) {
    console.log('Aufruf: node scripts/rentman-zeiten-import-490.js <employeeId> <von YYYY-MM-DD> [bis] [--schreiben]');
    process.exit(1);
  }
  const db = getPool();
  const [[emp]] = await db.query(
    'SELECT id, COALESCE(full_name, username) AS name, rentman_id, zeiterfassung_quelle FROM employees WHERE id = ?',
    [employeeId]);
  if (!emp) throw new Error(`Mitarbeiter ${employeeId} nicht gefunden`);
  if (!emp.rentman_id) throw new Error(`${emp.name} hat keine rentman_id`);
  console.log(`${emp.name} (Portal ${emp.id}, Rentman ${emp.rentman_id}), ${von} bis ${bis}`
    + (SCHREIBEN ? ' — SCHREIBEN' : ' — Probelauf') + '\n');

  const [vorhanden] = await db.query(
    `SELECT id, rentman_timeregistration_id AS rmId, DATE_FORMAT(tag,'%Y-%m-%d') AS tag,
            DATE_FORMAT(start,'%Y-%m-%dT%H:%i:%s') AS start, DATE_FORMAT(ende,'%Y-%m-%dT%H:%i:%s') AS ende
       FROM time_entries WHERE employee_id = ? AND tag BETWEEN ? AND ?`, [employeeId, von, bis]);
  const verknuepft = new Set(vorhanden.filter((v) => v.rmId).map((v) => Number(v.rmId)));

  const roh = (await rentmanEintraege(emp.rentman_id, von, bis))
    .filter((e) => String(e.start || '').slice(0, 10) >= von && String(e.start || '').slice(0, 10) <= bis);

  const neu = [];
  const zaehler = { verknuepft: 0, nicht: 0, ueberschneidung: 0 };
  for (const e of roh) {
    if (verknuepft.has(Number(e.id))) { zaehler.verknuepft++; continue; }
    const r = mapRentmanEintrag(e);
    if (!r.uebernehmen) {
      zaehler.nicht++;
      console.log(`  –  ${String(e.start).slice(0, 16)}  #${e.id}  ${r.grund}`);
      continue;
    }
    const z = r.zeile;
    const konflikt = vorhanden.find((v) => v.tag === z.tag && v.ende && v.start < z.ende && v.ende > z.start);
    if (konflikt) {
      zaehler.ueberschneidung++;
      console.log(`  !  ${z.start.slice(0, 16)}  #${e.id}  überschneidet Portal-Eintrag ${konflikt.id} (${konflikt.start.slice(11, 16)}–${konflikt.ende.slice(11, 16)}), übersprungen`);
      continue;
    }
    neu.push(z);
    console.log(`  +  ${z.start.slice(0, 16)}–${z.ende.slice(11, 16)}  ${z.eintragTyp.padEnd(11)}  netto ${hm(z.nettoSekunden)}  Pause ${hm(z.pauseSekunden)}  (Rentman #${e.id})`);
  }

  console.log(`\nRentman: ${roh.length} Einträge · schon verknüpft ${zaehler.verknuepft} · nicht übernommen ${zaehler.nicht}`
    + ` · Überschneidung ${zaehler.ueberschneidung} · neu ${neu.length}`
    + ` (${hm(neu.filter((z) => z.eintragTyp === 'arbeitszeit').reduce((s, z) => s + z.nettoSekunden, 0))} h Arbeitszeit)`);

  if (!SCHREIBEN) {
    console.log('Nichts geschrieben — mit --schreiben übernehmen.');
    process.exit(0);
  }

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    for (const z of neu) {
      const [r] = await conn.execute(
        `INSERT INTO time_entries
           (employee_id, tag, start, ende, pause_sekunden, status, eintrag_typ, erfasst_von,
            rentman_timeregistration_id, rentman_leaverequest_id)
         VALUES (?, ?, ?, ?, ?, 'abgeschlossen', ?, ?, ?, ?)`,
        [employeeId, z.tag, z.start, z.ende, z.pauseSekunden, z.eintragTyp, employeeId,
          z.rentmanTimeregistrationId, z.rentmanLeaverequestId]);
      await conn.execute(
        `INSERT INTO time_entry_audit_log (time_entry_id, geaendert_von, feld, alt_wert, neu_wert)
         VALUES (?, ?, 'import', NULL, ?)`,
        [r.insertId, employeeId, `aus Rentman #${z.rentmanTimeregistrationId} übernommen (#490)`]);
    }
    await conn.commit();
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
  console.log(`${neu.length} Einträge übernommen.`);

  const konto = await gleitzeit.neuberechnen(employeeId);
  console.log('Gleitzeitkonto:', konto.uebersprungen || `${konto.buchungen} Buchungen ${konto.von} bis ${konto.bis} neu berechnet`);
  if (!konto.uebersprungen) console.log('Stand:', (await gleitzeit.kontostand(employeeId)).anzeige, 'h');
  process.exit(0);
})().catch((e) => { console.error('FEHLER:', e.message); process.exit(1); });
