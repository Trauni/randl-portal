/**
 * Nachträge für Raimund Söllner (Portal-ID 28), Jahr 2026:
 *   - Urlaub 02.01. und 05.01.            (genehmigter Urlaubsantrag, Bemessung wie bei jedem Urlaub)
 *   - Gleitzeitabbau 27.05., ganzer Tag   (Abbau in Höhe des Tages-Solls laut Wochenarbeitszeit)
 *   - 17.08. 09:00–14:00 (5 h) und 06.10. 09:00–13:00 (4 h): vergessen zu stempeln, ohne Pause
 * Läuft über dieselben Services wie die Oberfläche (Audit-Log, Urlaubsbemessung, Rentman-Spiegel,
 * Neuberechnung des Gleitzeitkontos). Mehrfach ausführbar: Tage mit Eintrag/Antrag werden übersprungen.
 *
 * Aufruf (im Portal-Ordner):
 *   node scripts/nachtrag-raimund.js [--id=28] [--von-id=1]               Probelauf
 *   node scripts/nachtrag-raimund.js [--id=28] [--von-id=1] --schreiben   schreiben
 */
require('dotenv').config({ override: true });
const { getPool } = require('../src/db');
const gleitzeit = require('../src/services/gleitzeit');
const urlaub = require('../src/services/urlaub');
const zeit = require('../src/services/zeit');

const opt = (name, std) => {
  const a = process.argv.find((x) => x.startsWith(`--${name}=`));
  return a ? a.split('=')[1] : std;
};
const SCHREIBEN = process.argv.includes('--schreiben');
const EMP = Number(opt('id', '28'));
const VON_ID = Number(opt('von-id', '1'));

const URLAUB = [{ von: '2026-01-02', bis: '2026-01-05' }];
const ABBAU = [{ von: '2026-05-27', bis: '2026-05-27' }];
const STEMPELN = [
  { tag: '2026-08-17', start: '09:00', netto: 5 * 60 },
  { tag: '2026-10-06', start: '09:00', netto: 4 * 60 },
];

const de = (tag) => tag.split('-').reverse().join('.');
const hm = (min) => `${Math.floor(min / 60)}:${String(min % 60).padStart(2, '0')}`;
const plusMinuten = (start, min) => {
  const [h, m] = start.split(':').map(Number);
  const gesamt = h * 60 + m + min;
  return `${String(Math.floor(gesamt / 60)).padStart(2, '0')}:${String(gesamt % 60).padStart(2, '0')}`;
};

async function antragVorhanden(db, art, von, bis) {
  const [rows] = await db.execute(
    `SELECT id FROM vacation_requests
      WHERE employee_id = ? AND art = ? AND status IN ('pending','approved') AND cancelled_at IS NULL
        AND start_date <= ? AND end_date >= ?`, [EMP, art, bis, von]);
  return rows[0] ? rows[0].id : null;
}

async function antragAnlegen(db, art, von, bis, tage, grund) {
  const [r] = await db.execute(
    `INSERT INTO vacation_requests (employee_id, art, start_date, end_date, days_count, reason, status, approved_by, approved_at)
     VALUES (?, ?, ?, ?, ?, ?, 'approved', ?, NOW())`, [EMP, art, von, bis, tage, grund, VON_ID]);
  const verbuchung = await urlaub.nachRentman(r.insertId);
  await gleitzeit.zeitraumGeaendert(EMP, von, bis);
  return { id: r.insertId, verbuchung };
}

(async () => {
  const db = getPool();
  const [[emp]] = await db.execute('SELECT id, COALESCE(full_name, username) AS name FROM employees WHERE id = ?', [EMP]);
  if (!emp) { console.log(`Mitarbeiter ${EMP} nicht gefunden`); process.exit(1); }
  console.log(`${emp.name} (Portal ${emp.id}) — ${SCHREIBEN ? 'SCHREIBEN' : 'Probelauf'}`);

  const konto = await gleitzeit.ladeKonto(EMP);
  console.log(`Gleitzeitkonto aktiv: ${konto.aktiv ? 'ja' : 'NEIN'}`);

  for (const u of URLAUB) {
    const da = await antragVorhanden(db, 'urlaub', u.von, u.bis);
    if (da) { console.log(`Urlaub ${de(u.von)}–${de(u.bis)}: übersprungen, Antrag ${da} vorhanden`); continue; }
    const { arbeitstage } = require('../src/utils/feiertage');
    const tage = arbeitstage(u.von, u.bis);
    console.log(`Urlaub ${de(u.von)}–${de(u.bis)}: ${tage.length} Arbeitstage (${tage.map(de).join(', ')})`);
    if (!SCHREIBEN) continue;
    const { id, verbuchung } = await antragAnlegen(db, 'urlaub', u.von, u.bis, tage.length, 'Nachtrag (vergessen einzutragen)');
    console.log(`  Antrag ${id} genehmigt, Verbuchung:`, JSON.stringify(verbuchung));
  }

  for (const a of ABBAU) {
    const da = await antragVorhanden(db, 'gleitzeitabbau', a.von, a.bis);
    if (da) { console.log(`Gleitzeitabbau ${de(a.von)}: übersprungen, Antrag ${da} vorhanden`); continue; }
    if (!konto.aktiv) { console.log(`Gleitzeitabbau ${de(a.von)}: ABGEBROCHEN, Konto nicht aktiv`); continue; }
    const tage = await gleitzeit.abbauTage(EMP, a.von, a.bis);
    if (!tage.length) { console.log(`Gleitzeitabbau ${de(a.von)}: kein vereinbarter Arbeitstag, nichts zu tun`); continue; }
    console.log(`Gleitzeitabbau ${de(a.von)}: ${tage.map((t) => `${de(t.tag)} ${hm(t.minuten)} h`).join(', ')}`);
    if (!SCHREIBEN) continue;
    const { id, verbuchung } = await antragAnlegen(db, 'gleitzeitabbau', a.von, a.bis, tage.length, 'Nachtrag (vergessen einzutragen)');
    console.log(`  Antrag ${id} genehmigt, Verbuchung:`, JSON.stringify(verbuchung));
  }

  for (const s of STEMPELN) {
    const [vorhanden] = await db.execute('SELECT id FROM time_entries WHERE employee_id = ? AND tag = ?', [EMP, s.tag]);
    if (vorhanden.length) { console.log(`Zeit ${de(s.tag)}: übersprungen, Eintrag ${vorhanden[0].id} vorhanden`); continue; }
    const ende = plusMinuten(s.start, s.netto);
    console.log(`Zeit ${de(s.tag)}: ${s.start}–${ende} (${hm(s.netto)} h netto, keine Pause)`);
    if (!SCHREIBEN) continue;
    const r = await zeit.manuellErfassen({
      employeeId: EMP, tag: s.tag, start: `${s.tag}T${s.start}:00`, ende: `${s.tag}T${ende}:00`,
      pauseMinuten: 0, erfasstVonId: VON_ID,
    });
    console.log(`  Eintrag ${r.entryId} geschrieben, Gleitzeit neu gerechnet:`, JSON.stringify(r.gleitzeitNeuberechnet));
  }

  if (SCHREIBEN) {
    const stand = await gleitzeit.kontostand(EMP);
    console.log(`Kontostand danach: ${hm(Math.abs(stand.minuten))} h${stand.minuten < 0 ? ' (minus)' : ''}`);
  }
  process.exit(0);
})().catch((e) => { console.error(e.message); process.exit(1); });
