/**
 * Urlaub — Berechnung der Urlaubsstunden und Rückschreiben nach Rentman.
 *
 * Das Portal ist führend für Urlaub, Rentman für die Arbeitszeit. Bei der
 * Genehmigung legt das Portal in Rentman einen Abwesenheitsantrag mit einem
 * Zeiteintrag je Werktag an. Die angerechneten Stunden sind der Durchschnitt
 * pro Arbeitstag aus den 13 Wochen vor dem Urlaubsbeginn (§ 11 BUrlG).
 *
 * Fallstricke, die hier bereits berücksichtigt sind — Details auf BookStack 39:
 *   - Urlaub geht NUR über einen Abwesenheitsantrag, nie direkt.
 *   - Anträge lassen sich nur als `pending` anlegen, danach per PUT genehmigen.
 *   - `pending` ist der einzige änderbare Zustand. Weder `approved -> pending`
 *     noch `canceled -> pending` sind erlaubt.
 *   - Schreiben verlangt einen Zeitzonen-Offset, Sommer- und Winterzeit beachten.
 *   - Fehlerantworten sind kein gültiges JSON und dürfen nie geparst werden.
 *
 * Daraus folgt der Lebenszyklus: solange der Wert vorläufig ist, bleibt der
 * Antrag in Rentman `pending` und damit editierbar. Genehmigt wird erst, wenn
 * das Bemessungsfenster vollständig ist — also am ersten Urlaubstag. Ändert
 * sich danach noch etwas, hilft nur stornieren und neu anlegen; der stornierte
 * Antrag bleibt als Spur stehen, weil Rentman kein Löschen anbietet.
 *
 * CLI:
 *   node src/services/urlaub.js rechnen <antragId>     nur rechnen
 *   node src/services/urlaub.js schreiben <antragId>   anlegen oder aktualisieren
 *   node src/services/urlaub.js faellig                alle fälligen neu berechnen
 */

const { getPool } = require('../db');

const BASE = 'https://api.rentman.net';
const FENSTER_TAGE = 91;              // 13 Wochen
const ARBEITSZEIT = '/leavetypes/1';
const URLAUB = '/leavetypes/2';
const TAG_MS = 86400000;

async function api(method, pfad, body) {
  const token = process.env.RENTMAN_API_TOKEN;
  if (!token) throw new Error('RENTMAN_API_TOKEN fehlt');
  const res = await fetch(BASE + pfad, {
    method,
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const roh = await res.text();
  // Fehlertexte NICHT parsen — Rentman liefert dort ungültiges JSON.
  if (!res.ok) throw new Error(`Rentman ${method} ${pfad} → ${res.status}: ${roh.slice(0, 300)}`);
  return JSON.parse(roh).data;
}

/** Zeitzonen-Offset für Europe/Berlin am gegebenen Tag, etwa '+0200'. */
function offsetFuer(tag) {
  const s = new Date(tag + 'T12:00:00Z')
    .toLocaleString('en-US', { timeZone: 'Europe/Berlin', timeZoneName: 'longOffset' });
  const m = s.match(/GMT([+-]\d{2}):(\d{2})/);
  return m ? m[1] + m[2] : '+0100';
}

/** Werktage Mo–Fr im Zeitraum. Feiertage werden bei Randl nicht gepflegt. */
function werktage(von, bis) {
  const liste = [];
  const ende = new Date(bis + 'T12:00:00Z');
  for (let d = new Date(von + 'T12:00:00Z'); d <= ende; d = new Date(+d + TAG_MS)) {
    const wt = d.getUTCDay();
    if (wt !== 0 && wt !== 6) liste.push(d.toISOString().slice(0, 10));
  }
  return liste;
}

const tagVor = (tag, n = 1) =>
  new Date(+new Date(tag + 'T12:00:00Z') - n * TAG_MS).toISOString().slice(0, 10);

/**
 * Durchschnittliche Arbeitszeit pro Arbeitstag im Fenster vor dem Urlaubsbeginn.
 * Nur `leavetype 1` — sonst rechnen sich Urlaub und Krankheit in ihre eigene
 * Bemessungsgrundlage hinein. Nenner sind verschiedene Kalendertage, keine
 * Buchungen: zwei Buchungen an einem Tag würden den Schnitt sonst halbieren.
 */
async function bemessung(rentmanId, beginn) {
  const von = tagVor(beginn, FENSTER_TAGE);
  const eintraege = await api('GET', '/timeregistration?crewmember='
    + encodeURIComponent('/crew/' + rentmanId) + '&limit=500');
  const proTag = {};
  for (const e of eintraege || []) {
    if (e.leavetype !== ARBEITSZEIT) continue;
    const tag = String(e.start || '').slice(0, 10);
    if (!tag || tag < von || tag >= beginn) continue;
    proTag[tag] = (proTag[tag] || 0) + Number(e.duration || 0);
  }
  const tage = Object.keys(proTag);
  const sekunden = tage.reduce((s, t) => s + proTag[t], 0);
  return {
    von,
    bis: tagVor(beginn),
    tage: tage.length,
    sekunden,
    schnitt: tage.length ? Math.round(sekunden / tage.length) : 0,
  };
}

async function ladeAntrag(antragId) {
  const [[a]] = await getPool().query(
    `SELECT vr.id, vr.employee_id, vr.status, vr.days_count,
            vr.rentman_leaverequest_id AS lrId,
            DATE_FORMAT(vr.start_date, '%Y-%m-%d') AS von,
            DATE_FORMAT(vr.end_date,   '%Y-%m-%d') AS bis,
            e.rentman_id, e.full_name,
            (SELECT rentman_id FROM employees WHERE id = vr.approved_by) AS pruefer
       FROM vacation_requests vr
       JOIN employees e ON e.id = vr.employee_id
      WHERE vr.id = ?`, [antragId]);
  if (!a) throw new Error(`Antrag ${antragId} nicht gefunden`);
  return a;
}

/** Aktueller Status des Rentman-Antrags, oder null wenn keiner hinterlegt ist. */
async function rentmanStatus(lrId) {
  if (!lrId) return null;
  try {
    const lr = await api('GET', '/leaverequest/' + lrId);
    return lr && lr.approval_status;
  } catch (e) {
    console.warn(`[urlaub] leaverequest ${lrId} nicht lesbar: ${e.message}`);
    return null;
  }
}

/** Rechnet, ohne zu schreiben. */
async function vorschau(antragId) {
  const a = await ladeAntrag(antragId);
  if (!a.rentman_id) throw new Error(`${a.full_name} hat keine rentman_id`);
  const tage = werktage(a.von, a.bis);
  const b = await bemessung(a.rentman_id, a.von);
  const rmStatus = await rentmanStatus(a.lrId);
  const heute = new Date().toISOString().slice(0, 10);
  const vorlaeufig = heute < a.von;
  return {
    antrag: a.id, mitarbeiter: a.full_name, status: a.status,
    von: a.von, bis: a.bis, werktage: tage, bemessung: b,
    gesamtSekunden: b.schnitt * tage.length,
    vorlaeufig,
    rentmanAntrag: a.lrId || null,
    rentmanStatus: rmStatus,
    vorgehen: !a.lrId ? 'neu anlegen'
      : rmStatus === 'pending' ? 'vorhandenen Antrag aktualisieren'
      : `Antrag ist ${rmStatus} — stornieren und neu anlegen`,
  };
}

/** Legt den Urlaub in Rentman an oder aktualisiert ihn. */
async function urlaubNachRentman(antragId) {
  const db = getPool();
  const a = await ladeAntrag(antragId);

  if (a.status !== 'approved') throw new Error(`Antrag ${antragId} ist ${a.status}, nicht approved`);
  if (!a.rentman_id) throw new Error(`${a.full_name} hat keine rentman_id`);

  const tage = werktage(a.von, a.bis);
  if (!tage.length) throw new Error(`Antrag ${antragId} enthält keine Werktage`);
  if (tage.length !== a.days_count) {
    console.warn(`[urlaub] Antrag ${antragId}: ${tage.length} Werktage berechnet, days_count sagt ${a.days_count}`);
  }

  const b = await bemessung(a.rentman_id, a.von);
  if (!b.tage) throw new Error(`Keine Arbeitszeit zwischen ${b.von} und ${b.bis} — Schnitt nicht berechenbar`);

  const heute = new Date().toISOString().slice(0, 10);
  const vorlaeufig = heute < a.von ? 1 : 0;
  const bemerkung = vorlaeufig
    ? `VORLAEUFIG - Neuberechnung am ${a.von} (Mitarbeiterportal)`
    : `Urlaub, Schnitt aus ${b.tage} Arbeitstagen ${b.von} bis ${b.bis} (Mitarbeiterportal)`;

  const crew = '/crew/' + a.rentman_id;
  const pruefer = a.pruefer ? '/crew/' + a.pruefer : crew;
  const titel = `Urlaub ${a.von} bis ${a.bis} (Mitarbeiterportal)`;
  let lrId = a.lrId;
  let neuAngelegt = false;

  // Nur ein `pending`-Antrag lässt sich ändern. Ist er schon genehmigt oder
  // storniert, bleibt nur stornieren und neu anlegen — der alte Antrag wird
  // dabei automatisch `rejected` und fällt aus allen Summen.
  if (lrId) {
    const rmStatus = await rentmanStatus(lrId);
    if (rmStatus !== 'pending') {
      // Rentman verbietet JEDE Aenderung an timeregistration-Kindern eines
      // leaverequest, der nicht mehr pending ist -- auch Loeschen (bestaetigt
      // per Test: "[400] Ein Abwesenheitsantrag kann nur dann angepasst
      // werden, wenn die Anfrage noch aussteht."). Ein Loeschversuch wuerde
      // hier immer scheitern und die ganze Neuberechnung zum Absturz bringen.
      // Die alten Eintraege bleiben deshalb zwangslaeufig als Waisen liegen
      // (status wird von Rentman selbst auf 'rejected' gesetzt) -- die
      // Zeiterfassungs-Anzeige filtert die bereits korrekt raus (s. F42).
      if (rmStatus === 'approved') {
        await api('PUT', '/leaverequest/' + lrId, {
          requested_for: crew, approval_status: 'canceled',
          description: titel + ' — ersetzt durch Neuberechnung',
        });
      }
      console.warn(`[urlaub] Antrag ${antragId}: leaverequest ${lrId} war ${rmStatus}, wird ersetzt`);
      await db.execute('DELETE FROM vacation_request_days WHERE vacation_request_id = ?', [antragId]);
      lrId = null;
    }
  }

  if (!lrId) {
    const lr = await api('POST', '/leaverequest',
      { requested_for: crew, approval_status: 'pending', description: titel });
    lrId = lr.id;
    neuAngelegt = true;
    await db.execute('UPDATE vacation_requests SET rentman_leaverequest_id = ? WHERE id = ?', [lrId, antragId]);
  }

  const [vorhanden] = await db.query(
    `SELECT id, DATE_FORMAT(tag,'%Y-%m-%d') AS tag, rentman_timeregistration_id AS tr
       FROM vacation_request_days WHERE vacation_request_id = ?`, [antragId]);
  const bekannt = new Map(vorhanden.map((r) => [r.tag, r]));

  for (const tag of tage) {
    const off = offsetFuer(tag);
    const koerper = {
      crewmember: crew, leavetype: URLAUB,
      start: tag + 'T08:00:00' + off, end: tag + 'T16:00:00' + off,
      duration: b.schnitt, remark: bemerkung,
    };
    const alt = bekannt.get(tag);
    if (alt && alt.tr) {
      await api('PUT', '/timeregistration/' + alt.tr, koerper);
      await db.execute('UPDATE vacation_request_days SET stunden_sekunden = ? WHERE id = ?', [b.schnitt, alt.id]);
    } else {
      const neu = await api('POST', '/leaverequest/' + lrId + '/timeregistration', koerper);
      await db.execute(
        `INSERT INTO vacation_request_days
           (vacation_request_id, tag, rentman_timeregistration_id, stunden_sekunden)
         VALUES (?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE rentman_timeregistration_id = VALUES(rentman_timeregistration_id),
                                 stunden_sekunden = VALUES(stunden_sekunden)`,
        [antragId, tag, neu.id, b.schnitt]);
    }
    bekannt.delete(tag);
  }

  // Tage, die im Portal nicht mehr zum Antrag gehören (Zeitraum verkürzt).
  for (const [tag, alt] of bekannt) {
    if (alt.tr) await api('DELETE', '/timeregistration/' + alt.tr);
    await db.execute('DELETE FROM vacation_request_days WHERE id = ?', [alt.id]);
    console.warn(`[urlaub] Antrag ${antragId}: Tag ${tag} entfernt`);
  }

  // Genehmigen erst, wenn der Wert final ist — danach ist nichts mehr änderbar.
  if (!vorlaeufig) {
    await api('PUT', '/leaverequest/' + lrId,
      { requested_for: crew, approval_status: 'approved', reviewer: pruefer, description: titel });
  }

  await db.execute(
    `UPDATE vacation_requests
        SET stunden_sekunden = ?, vorlaeufig = ?, bemessung_von = ?, bemessung_bis = ?,
            bemessung_tage = ?, bemessung_sekunden = ?, berechnet_am = NOW()
      WHERE id = ?`,
    [b.schnitt, vorlaeufig, b.von, b.bis, b.tage, b.sekunden, antragId]);

  return {
    antragId, leaverequestId: lrId, neuAngelegt,
    tage: tage.length, schnitt: b.schnitt, vorlaeufig,
    rentmanStatus: vorlaeufig ? 'pending (Wert noch vorläufig)' : 'approved',
    bemessung: b,
  };
}

/**
 * Urlaub zurücknehmen. Kein Löschen nötig: der Zeiteintrag folgt dem Antrag
 * und wird durch das Stornieren automatisch `rejected`, fällt also aus allen
 * Summen. Achtung — danach ist der Datensatz in Rentman eingefroren.
 */
async function urlaubStornieren(antragId) {
  const db = getPool();
  const a = await ladeAntrag(antragId);
  if (!a.lrId) return { antragId, uebersprungen: 'kein Rentman-Antrag hinterlegt' };
  const rmStatus = await rentmanStatus(a.lrId);
  if (rmStatus === 'canceled' || rmStatus === 'rejected') {
    return { antragId, leaverequestId: a.lrId, uebersprungen: `bereits ${rmStatus}` };
  }
  await api('PUT', '/leaverequest/' + a.lrId, {
    requested_for: '/crew/' + a.rentman_id, approval_status: 'canceled',
    description: `Urlaub ${a.von} bis ${a.bis} storniert (Mitarbeiterportal)`,
  });
  await db.execute('UPDATE vacation_requests SET vorlaeufig = 0 WHERE id = ?', [antragId]);
  return { antragId, leaverequestId: a.lrId, storniert: true };
}

/**
 * Alles, was mit Rentman nicht im Reinen ist: nie uebertragene Urlaube und
 * solche, deren Beginn erreicht ist, die aber noch einen vorlaeufigen Wert
 * tragen. Speist den naechtlichen Job und die Abgleichsliste im Portal.
 */
/**
 * Nach einer Zeitkorrektur (Fremderfassung/Korrektur durch Backoffice/GF,
 * nicht bei Selbst-Erfassung): alle genehmigten Urlaubsantraege eines
 * Mitarbeiters neu berechnen, deren 13-Wochen-Bemessungsfenster das
 * geaenderte Datum enthaelt. Fenster wird direkt aus start_date berechnet,
 * nicht aus dem zuletzt gespeicherten bemessung_von/bis (das waere bei nie
 * berechneten Antraegen leer).
 */
async function betroffeneUrlaubeNeuberechnen(employeeId, tag) {
  const db = getPool();
  const [rows] = await db.query(
    `SELECT id, DATE_FORMAT(start_date,'%Y-%m-%d') AS von, stunden_sekunden AS alt
       FROM vacation_requests
      WHERE employee_id = ? AND status = 'approved' AND cancelled_at IS NULL
        AND start_date > ?
        AND DATE_SUB(start_date, INTERVAL ? DAY) <= ?`,
    [employeeId, tag, FENSTER_TAGE, tag]);

  const ergebnisse = [];
  for (const r of rows) {
    try {
      const res = await urlaubNachRentman(r.id);
      ergebnisse.push({ antragId: r.id, von: r.von, altSekunden: r.alt, neuSekunden: res.schnitt });
    } catch (e) {
      console.error(`[urlaub] Auto-Neuberechnung Antrag ${r.id} fehlgeschlagen: ${e.message}`);
      ergebnisse.push({ antragId: r.id, von: r.von, fehler: e.message });
    }
  }
  return ergebnisse;
}

async function offeneNeuberechnungen() {
  const [rows] = await getPool().query(
    `SELECT vr.id, vr.employee_id, e.full_name,
            DATE_FORMAT(vr.start_date, '%Y-%m-%d') AS von,
            DATE_FORMAT(vr.end_date,   '%Y-%m-%d') AS bis,
            vr.stunden_sekunden, vr.berechnet_am, vr.rentman_leaverequest_id
       FROM vacation_requests vr
       JOIN employees e ON e.id = vr.employee_id
      WHERE vr.status = 'approved'
        AND ( vr.rentman_leaverequest_id IS NULL
              OR (vr.vorlaeufig = 1 AND vr.start_date <= CURDATE()) )
      ORDER BY vr.start_date`);
  return rows;
}

/** Für den nächtlichen Job. Ein Fehler bricht nicht den ganzen Lauf ab. */
async function faelligeNeuberechnung() {
  const offen = await offeneNeuberechnungen();
  const ergebnis = [];
  for (const r of offen) {
    try {
      ergebnis.push(await urlaubNachRentman(r.id));
    } catch (e) {
      console.error(`[urlaub] Antrag ${r.id} (${r.full_name}): ${e.message}`);
      ergebnis.push({ antragId: r.id, fehler: e.message });
    }
  }
  return ergebnis;
}

module.exports = {
  betroffeneUrlaubeNeuberechnen,
  bemessung, werktage, offsetFuer, vorschau, rentmanStatus,
  urlaubNachRentman, urlaubStornieren,
  offeneNeuberechnungen, faelligeNeuberechnung,
};

// ── CLI ───────────────────────────────────────────────────────────────────────
if (require.main === module) {
  require('dotenv').config({ override: true });
  const [, , befehl, arg] = process.argv;
  (async () => {
    try {
      if (befehl === 'rechnen' && arg) console.dir(await vorschau(Number(arg)), { depth: null });
      else if (befehl === 'schreiben' && arg) console.dir(await urlaubNachRentman(Number(arg)), { depth: null });
      else if (befehl === 'faellig') console.dir(await faelligeNeuberechnung(), { depth: null });
      else if (befehl === 'offen') console.dir(await offeneNeuberechnungen(), { depth: null });
      else console.log('Aufruf: rechnen <id> | schreiben <id> | faellig | offen');
    } catch (e) {
      console.error('FEHLER:', e.message);
      process.exitCode = 1;
    }
    process.exit();
  })();
}
