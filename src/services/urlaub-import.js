/**
 * Bestandsurlaube aus Rentman ins Portal übernehmen (F34, einmalig).
 *
 * Richtung umgekehrt zum laufenden Betrieb: hier liest das Portal, was in
 * Rentman schon steht, und legt daraus rückwirkend genehmigte Anträge an.
 *
 * ⚠️ Die Stunden werden NICHT neu berechnet. Was in Rentman steht, ist das,
 * was abgerechnet wurde — eine nachträgliche Neuberechnung würde bezahlte
 * Beträge verändern. Übernommen wird also die vorhandene `duration`.
 *
 * Nur Urlaub (leavetype 2). Krankheit bleibt in Rentman: das ist kein Antrag,
 * sondern eine Meldung, und das Portal kennt dafür keine Antragsart.
 *
 * Gruppierung: primär nach Abwesenheitsantrag, danach zusätzlich nach
 * zusammenhängenden Tagen. Historisch hängen unter einem Rentman-Antrag
 * mehrere getrennte Urlaube — ohne den zweiten Schritt entstünde daraus ein
 * einziger Antrag über Monate.
 *
 * Wiederholbar: bereits zugeordnete Zeiteinträge werden übersprungen.
 *
 * Aufruf (aus dem Portal-Verzeichnis):
 *   node src/services/urlaub-import.js            Probelauf, schreibt nichts
 *   node src/services/urlaub-import.js schreiben  legt die Anträge an
 *   node src/services/urlaub-import.js schreiben 2025-01-01   anderer Stichtag
 */

const { getPool } = require('../db');

const BASE = 'https://api.rentman.net';
const URLAUB = '/leavetypes/2';
const LUECKE_MAX = 3;               // Fr -> Mo bleibt ein Block
const SCHREIBEN = process.argv[2] === 'schreiben';
const AB = process.argv[3] || '2026-01-01';

async function api(pfad) {
  const token = process.env.RENTMAN_API_TOKEN;
  if (!token) throw new Error('RENTMAN_API_TOKEN fehlt');
  const res = await fetch(BASE + pfad, { headers: { Authorization: 'Bearer ' + token } });
  const roh = await res.text();
  if (!res.ok) throw new Error(`Rentman ${pfad} → ${res.status}: ${roh.slice(0, 200)}`);
  return JSON.parse(roh).data || [];
}

const hhmm = (s) => Math.floor(s / 3600) + ':' + String(Math.floor((s % 3600) / 60)).padStart(2, '0');

/** Zusammenhängende Tage bündeln; bis zu LUECKE_MAX Tage Abstand gelten als zusammenhängend. */
function bloecke(tage) {
  const sortiert = [...tage].sort((a, b) => (a.tag < b.tag ? -1 : 1));
  const raus = [];
  let aktuell = null;
  for (const t of sortiert) {
    if (aktuell) {
      const luecke = (new Date(t.tag) - new Date(aktuell[aktuell.length - 1].tag)) / 86400000;
      if (luecke <= LUECKE_MAX) { aktuell.push(t); continue; }
    }
    aktuell = [t];
    raus.push(aktuell);
  }
  return raus;
}

(async () => {
  require('dotenv').config({ override: true });
  const db = getPool();

  const [mitarbeiter] = await db.query(
    `SELECT id, rentman_id, COALESCE(full_name, displayname) AS name
       FROM employees WHERE rentman_id IS NOT NULL ORDER BY name`);

  // Wiederholungsschutz auf Tagesebene: ein Zeiteintrag kann nur einmal hängen.
  const [belegt] = await db.query(
    `SELECT rentman_timeregistration_id AS tr FROM vacation_request_days
      WHERE rentman_timeregistration_id IS NOT NULL`);
  const bekannt = new Set(belegt.map((r) => r.tr));

  const heute = new Date().toISOString().slice(0, 10);
  let angelegt = 0, uebersprungen = 0, tageGesamt = 0, gesplittet = 0, kuenftig = 0;

  for (const m of mitarbeiter) {
    const alle = await api('/timeregistration?crewmember='
      + encodeURIComponent('/crew/' + m.rentman_id) + '&limit=500');

    const urlaubstage = alle.filter((e) =>
      e.leavetype === URLAUB && e.status === 'approved' && String(e.start || '').slice(0, 10) >= AB);
    if (!urlaubstage.length) continue;

    const nachAntrag = new Map();
    for (const e of urlaubstage) {
      const lr = e.leaverequest ? Number(String(e.leaverequest).split('/').pop()) : null;
      const schluessel = lr === null ? 'ohne' : lr;
      if (!nachAntrag.has(schluessel)) nachAntrag.set(schluessel, []);
      nachAntrag.get(schluessel).push({
        tag: String(e.start).slice(0, 10), id: e.id, dauer: Number(e.duration || 0),
      });
    }

    for (const [schluessel, tage] of nachAntrag) {
      const lrId = schluessel === 'ohne' ? null : schluessel;
      const teile = bloecke(tage);
      if (teile.length > 1) {
        gesplittet++;
        console.log(`   (leaverequest ${lrId} enthält ${teile.length} getrennte Urlaube)`);
      }

      for (const block of teile) {
        if (block.some((t) => bekannt.has(t.id))) { uebersprungen++; continue; }

        block.sort((a, b) => (a.tag < b.tag ? -1 : 1));
        const von = block[0].tag;
        const bis = block[block.length - 1].tag;
        const dauern = new Set(block.map((t) => t.dauer));
        const einheitlich = dauern.size === 1 ? block[0].dauer : null;

        // Liegt der Urlaub noch vor uns, ist er nicht abgerechnet — dann darf
        // und soll der naechtliche Job den 13-Wochen-Schnitt setzen. Vergangene
        // Urlaube bleiben unangetastet: die Stunden wurden so ausgezahlt.
        const vorlaeufig = von > heute ? 1 : 0;
        if (vorlaeufig) kuenftig++;

        console.log(
          `${m.name.padEnd(22)} ${von} bis ${bis}  ${String(block.length).padStart(2)} Tage  `
          + (einheitlich !== null ? hhmm(einheitlich) + '/Tag' : 'unterschiedlich').padEnd(16)
          + (lrId ? `leaverequest ${lrId}` : 'ohne Antrag')
          + (vorlaeufig ? '   -> wird neu berechnet' : ''));

        tageGesamt += block.length;
        angelegt++;
        if (!SCHREIBEN) continue;

        const [erg] = await db.execute(
          `INSERT INTO vacation_requests
             (employee_id, start_date, end_date, days_count, reason, status, approved_at,
              rentman_leaverequest_id, stunden_sekunden, vorlaeufig)
           VALUES (?, ?, ?, ?, ?, 'approved', NOW(), ?, ?, ?)`,
          [m.id, von, bis, block.length, 'Übernahme aus Rentman', lrId, einheitlich, vorlaeufig]);

        for (const t of block) {
          await db.execute(
            `INSERT INTO vacation_request_days
               (vacation_request_id, tag, rentman_timeregistration_id, stunden_sekunden)
             VALUES (?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE stunden_sekunden = VALUES(stunden_sekunden)`,
            [erg.insertId, t.tag, t.id, t.dauer]);
          bekannt.add(t.id);
        }
      }
    }
  }

  console.log('\n' + '─'.repeat(72));
  if (gesplittet) console.log(`${gesplittet} Rentman-Anträge enthielten mehrere getrennte Urlaube.`);
  if (kuenftig) console.log(`${kuenftig} Urlaube liegen in der Zukunft und werden am ersten Urlaubstag neu berechnet.`);
  console.log(SCHREIBEN
    ? `${angelegt} Anträge angelegt, ${tageGesamt} Urlaubstage, ${uebersprungen} bereits vorhanden.`
    : `Probelauf: ${angelegt} Anträge mit ${tageGesamt} Urlaubstagen würden angelegt, `
      + `${uebersprungen} sind bereits zugeordnet.\nZum Schreiben: ... urlaub-import.js schreiben`);
  process.exit();
})().catch((e) => { console.error('FEHLER:', e.message); process.exit(1); });
