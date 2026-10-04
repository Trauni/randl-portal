/**
 * Zeit — Zeiterfassung im Portal ("Randl OS"), Rueckschreiben nach Rentman.
 *
 * Gilt nur fuer Mitarbeitende mit employees.zeiterfassung_quelle = 'portal'.
 * Fuer 'rentman' bleibt zeitreport() in services/rentman.js unveraendert
 * die Quelle — diese Pruefung passiert eine Ebene hoeher, in den Routen,
 * nicht hier im Service.
 *
 * Sobald ein Eintrag abgeschlossen wird (Stop, manuelle Erfassung, oder
 * Korrektur), wird er nach Rentman gespiegelt — try/catch, ein Rentman-
 * Ausfall blockiert die Erfassung nicht (analog services/urlaub.js).
 *
 * Zwei Pause-Modelle in derselben Tabelle:
 *   - Live-Timer (mobil): pause_start waehrend einer laufenden Pause
 *     gesetzt, pause_sekunden kumuliert bei jedem Pause-Stopp.
 *   - Manuelle Erfassung: pause_sekunden direkt aus Minutenangabe,
 *     pause_start bleibt immer NULL.
 *
 * Alle Zeitstempel werden bewusst als naive lokale Strings behandelt
 * (kein new Date()-Roundtrip fuer start/ende/pause_start) — MariaDB
 * rechnet Differenzen selbst per TIMESTAMPDIFF, das umgeht jedes
 * Timezone-Risiko durch mysql2-Date-Objekte.
 *
 * Parallel-Sperre zusaetzlich in der DB erzwungen (generated column
 * aktive_sperre + UNIQUE-Index) — ein Duplicate-Key-Fehler beim Starten
 * heisst: es laeuft schon eine Erfassung fuer diesen Mitarbeiter.
 *
 * CLI:
 *   node src/services/zeit.js zwangsschliessen    offene Eintraege von heute zwangsbeenden
 *   node src/services/zeit.js spiegeln <id>       Eintrag <id> nach Rentman spiegeln
 */
const { getPool } = require('../db');
const urlaub = require('./urlaub');

const BASE = 'https://api.rentman.net';
const ARBEITSZEIT = '/leavetypes/1';
const KRANKHEIT = '/leavetypes/4';

async function api(method, pfad, body) {
  const token = process.env.RENTMAN_API_TOKEN;
  if (!token) throw new Error('RENTMAN_API_TOKEN fehlt');
  const res = await fetch(BASE + pfad, {
    method,
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const roh = await res.text();
  if (!res.ok) throw new Error(`Rentman ${method} ${pfad} -> ${res.status}: ${roh.slice(0, 300)}`);
  return JSON.parse(roh).data;
}

/** Zeitzonen-Offset fuer Europe/Berlin am gegebenen Tag, etwa '+0200'. */
function offsetFuer(tag) {
  const s = new Date(tag + 'T12:00:00Z')
    .toLocaleString('en-US', { timeZone: 'Europe/Berlin', timeZoneName: 'longOffset' });
  const m = s.match(/GMT([+-]\d{2}):(\d{2})/);
  return m ? m[1] + m[2] : '+0100';
}

/** Naiver lokaler Zeitstring 'YYYY-MM-DDTHH:MM:SS', fuer DATETIME-Spalten. */
function jetztLokal() {
  return new Date().toLocaleString('sv-SE', { timeZone: 'Europe/Berlin' }).replace(' ', 'T');
}

function rundeAufFuenf(sekunden) {
  return Math.round(sekunden / 300) * 300;
}

async function protokollieren(entryId, geaendertVon, feld, altWert, neuWert) {
  const db = getPool();
  await db.execute(
    `INSERT INTO time_entry_audit_log (time_entry_id, geaendert_von, feld, alt_wert, neu_wert)
     VALUES (?, ?, ?, ?, ?)`,
    [entryId, geaendertVon, feld, altWert === null || altWert === undefined ? null : String(altWert),
     neuWert === null || neuWert === undefined ? null : String(neuWert)]);
}

/** Start-Button: legt einen neuen laufenden Eintrag an. */
async function starten(employeeId, erfasstVonId) {
  const db = getPool();
  try {
    const [r] = await db.execute(
      `INSERT INTO time_entries (employee_id, tag, start, status, erfasst_von)
       VALUES (?, CURDATE(), ?, 'laufend', ?)`,
      [employeeId, jetztLokal(), erfasstVonId]);
    return r.insertId;
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY' && String(err.message).includes('uq_aktive_sperre')) {
      throw new Error('Es laeuft bereits eine Zeiterfassung fuer diesen Mitarbeiter');
    }
    throw err;
  }
}

/** Pause-Button (an): stoppt die aktive Erfassung in den Pause-Zustand. */
async function pausieren(entryId) {
  const db = getPool();
  const [r] = await db.execute(
    `UPDATE time_entries SET status='pausiert', pause_start=?
      WHERE id=? AND status='laufend'`,
    [jetztLokal(), entryId]);
  if (r.affectedRows === 0) throw new Error('Eintrag laeuft nicht (schon pausiert oder beendet?)');
}

/** Pause-Button (aus): rechnet die Pausenzeit auf pause_sekunden auf. */
async function fortsetzen(entryId) {
  const db = getPool();
  const [r] = await db.execute(
    `UPDATE time_entries
        SET status='laufend',
            pause_sekunden = pause_sekunden + TIMESTAMPDIFF(SECOND, pause_start, ?),
            pause_start = NULL
      WHERE id=? AND status='pausiert'`,
    [jetztLokal(), entryId]);
  if (r.affectedRows === 0) throw new Error('Eintrag ist nicht (mehr) pausiert');
}

/** Stop-Button: beendet den Eintrag und spiegelt ihn nach Rentman. */
async function stoppen(entryId) {
  const db = getPool();
  await db.execute(
    `UPDATE time_entries
        SET pause_sekunden = pause_sekunden + TIMESTAMPDIFF(SECOND, pause_start, ?),
            pause_start = NULL
      WHERE id=? AND status='pausiert'`,
    [jetztLokal(), entryId]);

  const [r] = await db.execute(
    `UPDATE time_entries SET status='abgeschlossen', ende=?
      WHERE id=? AND status IN ('laufend','pausiert')`,
    [jetztLokal(), entryId]);
  if (r.affectedRows === 0) throw new Error('Eintrag laeuft nicht');

  await rundenUndSpiegeln(entryId);
}

/** Manuelle Tageserfassung — Pause ist eine reine Minutenzahl, kein Timer. */
async function manuellErfassen({ employeeId, tag, start, ende, pauseMinuten, erfasstVonId, typ = 'arbeitszeit', stunden }) {
  let pauseSekunden = Math.round(Number(pauseMinuten || 0) * 60);

  if (typ === 'krankheit') {
    // Krankentag (F57): manuelles Stundenfeld statt Start/Ende. Stunden
    // bleiben weiterhin Handarbeit (kein Formelwechsel, s. F38) -- nur der
    // Erfassungsort wandert von Rentman ins Portal. Start/Ende werden aus
    // den Stunden konstruiert (00:00 + Stunden), damit die bestehende
    // Dauer-/Rundungslogik beim Spiegeln unveraendert greift.
    const std = Number(stunden);
    if (!std || std <= 0 || std > 24) throw new Error('Stunden müssen zwischen 0 und 24 liegen');
    start = `${tag}T00:00:00`;
    const gesamtMinuten = Math.round(std * 60);
    const h = Math.floor(gesamtMinuten / 60);
    const m = gesamtMinuten % 60;
    ende = `${tag}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`;
    pauseSekunden = 0;
  } else if (new Date(ende + 'Z') <= new Date(start + 'Z')) {
    throw new Error('Ende muss nach Start liegen');
  }

  const db = getPool();
  const [r] = await db.execute(
    `INSERT INTO time_entries (employee_id, tag, start, ende, pause_sekunden, status, eintrag_typ, erfasst_von)
     VALUES (?, ?, ?, ?, ?, 'abgeschlossen', ?, ?)`,
    [employeeId, tag, start, ende, pauseSekunden, typ, erfasstVonId]);
  const entryId = r.insertId;
  await protokollieren(entryId, erfasstVonId, 'anlage', null,
    typ === 'krankheit' ? `Krankentag, ${stunden}h` : `${start} - ${ende}, Pause ${pauseMinuten}min`);
  await rundenUndSpiegeln(entryId);

  // Fremderfassung (Backoffice/GF traegt fuer jemand anderen ein) kann die
  // Bemessungsgrundlage laufender Urlaube veraendern -- bei Selbst-Erfassung
  // (employeeId === erfasstVonId) bewusst nicht ausgeloest. Krankentage
  // zaehlen ohnehin nicht in den 13-Wochen-Schnitt (nur leavetype 1, s.
  // urlaub.js) -- die Neuberechnung laeuft trotzdem mit, liefert dann nur
  // denselben Wert wie vorher.
  let urlaubNeuberechnet = null;
  if (employeeId !== erfasstVonId) {
    urlaubNeuberechnet = await urlaub.betroffeneUrlaubeNeuberechnen(employeeId, tag).catch((e) => {
      console.error(`[zeit] Urlaubs-Neuberechnung nach Fremderfassung fehlgeschlagen: ${e.message}`);
      return null;
    });
  }
  return { entryId, urlaubNeuberechnet };
}

/**
 * Korrektur durch Backoffice/GF an fremden Eintraegen. Nur uebergebene
 * Felder werden geaendert, jede tatsaechliche Aenderung wird protokolliert.
 */
async function bearbeiten(entryId, updates, geaendertVonId) {
  const db = getPool();
  const [[alt]] = await db.execute(
    `SELECT DATE_FORMAT(start,'%Y-%m-%dT%H:%i:%s') AS start,
            DATE_FORMAT(ende,'%Y-%m-%dT%H:%i:%s') AS ende,
            pause_sekunden, employee_id, DATE_FORMAT(tag,'%Y-%m-%d') AS tag
       FROM time_entries WHERE id=?`, [entryId]);
  if (!alt) throw new Error(`Eintrag ${entryId} nicht gefunden`);

  const zuordnung = { start: 'start', ende: 'ende', pauseMinuten: 'pause_sekunden' };
  const setzen = [];
  const werte = [];
  for (const [feld, spalte] of Object.entries(zuordnung)) {
    if (updates[feld] === undefined) continue;
    const neuerWert = feld === 'pauseMinuten' ? Math.round(updates[feld] * 60) : updates[feld];
    const alterWert = feld === 'pauseMinuten' ? alt.pause_sekunden : alt[spalte];
    if (String(neuerWert) === String(alterWert)) continue;
    setzen.push(`${spalte} = ?`);
    werte.push(neuerWert);
    await protokollieren(entryId, geaendertVonId, spalte, alterWert, neuerWert);
  }
  if (!setzen.length) return { urlaubNeuberechnet: null };
  werte.push(entryId);
  await db.execute(`UPDATE time_entries SET ${setzen.join(', ')} WHERE id=?`, werte);
  await rundenUndSpiegeln(entryId);

  // bearbeiten() wird ausschliesslich von der Korrektur-Route aufgerufen
  // (Backoffice/GF), Selbst-Erfassung hat keine eigene Korrektur-UI.
  const urlaubNeuberechnet = await urlaub.betroffeneUrlaubeNeuberechnen(alt.employee_id, alt.tag).catch((e) => {
    console.error(`[zeit] Urlaubs-Neuberechnung nach Korrektur fehlgeschlagen: ${e.message}`);
    return null;
  });
  return { urlaubNeuberechnet };
}

/** Spiegelt einen abgeschlossenen Eintrag nach Rentman (POST oder PUT). */
async function spiegelNachRentman(entryId) {
  const db = getPool();
  const [[e]] = await db.execute(
    `SELECT te.pause_sekunden, te.rentman_timeregistration_id, te.rentman_leaverequest_id, te.eintrag_typ,
            DATE_FORMAT(te.start, '%Y-%m-%dT%H:%i:%s') AS start_str,
            DATE_FORMAT(te.ende, '%Y-%m-%dT%H:%i:%s') AS ende_str,
            DATE_FORMAT(te.start, '%Y-%m-%d') AS start_tag,
            emp.rentman_id
       FROM time_entries te JOIN employees emp ON emp.id = te.employee_id
      WHERE te.id = ?`, [entryId]);
  if (!e) throw new Error(`Zeiteintrag ${entryId} nicht gefunden`);
  if (!e.rentman_id) throw new Error(`Mitarbeiter zu Eintrag ${entryId} hat keine rentman_id`);
  if (!e.ende_str) throw new Error(`Eintrag ${entryId} laeuft noch, kein Ende gesetzt`);

  const crew = '/crew/' + e.rentman_id;
  const off = offsetFuer(e.start_tag);
  const spanneSekunden = Math.round(
    (new Date(e.ende_str + 'Z') - new Date(e.start_str + 'Z')) / 1000
  );
  const dauer = rundeAufFuenf(spanneSekunden - e.pause_sekunden);
  const istKrankheit = e.eintrag_typ === 'krankheit';
  const titel = `Krankentag ${e.start_tag} (Mitarbeiterportal)`;

  let lrId = e.rentman_leaverequest_id;
  let rentmanId = e.rentman_timeregistration_id;

  // Rentman erlaubt leavetype 4 (Krankheitstage) nur als Kind eines
  // Abwesenheitsantrags (leaverequest) -- ein blankes POST /timeregistration
  // mit leavetype 4 wird mit 400 abgelehnt ("Die Abwesenheitsart erfordert
  // eine Genehmigung"). Anders als beim Urlaub (urlaub.js) gibt es im Portal
  // aber bewusst keinen eigenen Genehmigungsschritt fuer Krankentage (F57)
  // -- der Antrag wird deshalb hier automatisch angelegt UND sofort
  // genehmigt, analog zum Muster in urlaub.js::urlaubNachRentman().
  //
  // Sobald ein Antrag genehmigt ist, sperrt Rentman jede Aenderung an dessen
  // Kind-Zeiteintrag ("kann nur angepasst werden, wenn die Anfrage noch
  // aussteht") -- eine spaetere Korrektur (bearbeiten()) an einem schon
  // gespiegelten Krankentag muss den alten Antrag deshalb stornieren und
  // alles neu anlegen, exakt wie in urlaub.js::urlaubNachRentman() bei einer
  // Neuberechnung. Der alte Kind-Zeiteintrag bleibt dabei als Waise liegen
  // (Rentman setzt ihn selbst auf 'rejected'), s. F42.
  if (istKrankheit && lrId) {
    let rmStatus = null;
    try {
      const lr = await api('GET', '/leaverequest/' + lrId);
      rmStatus = lr && lr.approval_status;
    } catch (err) {
      console.warn(`[zeit] leaverequest ${lrId} nicht lesbar: ${err.message}`);
    }
    if (rmStatus && rmStatus !== 'pending') {
      if (rmStatus === 'approved') {
        await api('PUT', '/leaverequest/' + lrId,
          { requested_for: crew, approval_status: 'canceled', description: titel + ' — ersetzt durch Korrektur' });
      }
      lrId = null;
      rentmanId = null;
      await db.execute(
        'UPDATE time_entries SET rentman_leaverequest_id = NULL, rentman_timeregistration_id = NULL WHERE id = ?',
        [entryId]);
    }
  }

  if (istKrankheit && !lrId) {
    const lr = await api('POST', '/leaverequest',
      { requested_for: crew, approval_status: 'pending', description: titel });
    lrId = lr.id;
    await db.execute('UPDATE time_entries SET rentman_leaverequest_id = ? WHERE id = ?', [lrId, entryId]);
  }

  const koerper = {
    crewmember: crew,
    leavetype: istKrankheit ? KRANKHEIT : ARBEITSZEIT,
    start: e.start_str + off,
    end: e.ende_str + off,
    break_duration: e.pause_sekunden,
    duration: dauer,
    remark: istKrankheit ? 'Krankentag — erfasst über Randl OS' : 'Erfasst über Randl OS',
  };

  if (rentmanId) {
    await api('PUT', '/timeregistration/' + rentmanId, koerper);
  } else {
    const pfad = istKrankheit ? `/leaverequest/${lrId}/timeregistration` : '/timeregistration';
    const neu = await api('POST', pfad, koerper);
    rentmanId = neu.id;
    await db.execute('UPDATE time_entries SET rentman_timeregistration_id = ? WHERE id = ?', [rentmanId, entryId]);
  }

  // reviewer bewusst NICHT gesetzt: Rentman weist den Pruefer serverseitig
  // dem API-Dienstaccount zu (crew 235, "OpenAPI" in der Portal-Anzeige) --
  // ein selbst uebergebener reviewer-Wert fuehrte zu "instance failed to
  // match exactly one schema" (28.09.2026, per curl-Trockentest bestaetigt).
  // Genehmigung bewusst erst nach dem Anlegen/Aktualisieren des Kind-
  // Zeiteintrags (wie in urlaub.js).
  if (istKrankheit && lrId) {
    await api('PUT', '/leaverequest/' + lrId,
      { requested_for: crew, approval_status: 'approved', description: titel });
  }

  return rentmanId;
}

/** Wrapper: Rentman-Ausfall darf die Erfassung nie blockieren. */
async function rundenUndSpiegeln(entryId) {
  try {
    await spiegelNachRentman(entryId);
  } catch (err) {
    console.error(`[zeit] Spiegeln nach Rentman fuer Eintrag ${entryId} fehlgeschlagen:`, err.message);
  }
}

/** 20-Uhr-Job: offene Eintraege von heute zwangsbeenden. */
/**
 * Portal-Eintraege eines Monats, aufgeteilt in zwei Gruppen:
 *   - ungespiegelt: noch nicht nach Rentman uebertragen (laufende Timer,
 *     oder falls eine Spiegelung mal fehlschlaegt) -- werden der Rentman-
 *     Liste direkt hinzugefuegt, statt Rentman als Quelle zu ersetzen.
 *   - gespiegeltMap: rentman_timeregistration_id -> time_entries.id, damit
 *     bereits gespiegelte Eintraege in der Rentman-Liste ihre time_entries.id
 *     zurueckbekommen und darueber weiter korrigierbar bleiben (bearbeiten()
 *     arbeitet auf time_entries.id, nicht auf der Rentman-ID).
 * Rentman bleibt so durchgehend die Quelle der Monatsansicht, auch fuer
 * zeiterfassung_quelle = 'portal'.
 */
async function portalEintraegeFuerMonat({ employeeId, jahr, monat }) {
  const db = getPool();
  const [rows] = await db.execute(
    `SELECT id, DATE_FORMAT(start,'%Y-%m-%dT%H:%i:%s') AS start,
            DATE_FORMAT(ende,'%Y-%m-%dT%H:%i:%s') AS ende,
            pause_sekunden, status, rentman_timeregistration_id
       FROM time_entries
      WHERE employee_id = ? AND YEAR(tag) = ? AND MONTH(tag) = ?
      ORDER BY start`, [employeeId, jahr, monat]);

  const ungespiegelt = [];
  const gespiegeltMap = new Map();

  for (const r of rows) {
    if (r.rentman_timeregistration_id) {
      gespiegeltMap.set(r.rentman_timeregistration_id, r.id);
      continue;
    }
    const dauer = r.ende
      ? Math.round((new Date(r.ende + 'Z') - new Date(r.start + 'Z')) / 1000) - r.pause_sekunden
      : null;
    ungespiegelt.push({
      id: `portal-${r.id}`,
      start: r.start,
      end: r.ende,
      dauer,
      pause: r.pause_sekunden,
      status: r.status,
      quelle: 'portal',
      zeitEintragId: r.id,
    });
  }

  return { ungespiegelt, gespiegeltMap };
}

/** Einzelnen Portal-Zeiteintrag laden -- fuer das Vorbefuellen des Korrektur-Formulars. */
async function ladeEintrag(entryId) {
  const db = getPool();
  const [[row]] = await db.execute(
    `SELECT DATE_FORMAT(start,'%Y-%m-%dT%H:%i:%s') AS start,
            DATE_FORMAT(ende,'%Y-%m-%dT%H:%i:%s') AS ende,
            pause_sekunden, employee_id
       FROM time_entries WHERE id = ?`, [entryId]);
  if (!row) return null;
  return {
    start: row.start,
    ende: row.ende,
    pauseMinuten: Math.round(row.pause_sekunden / 60),
    employeeId: row.employee_id,
  };
}

async function zwangsSchliessen() {
  const db = getPool();
  const [offene] = await db.query(
    `SELECT id FROM time_entries WHERE status IN ('laufend','pausiert') AND tag = CURDATE()`);
  for (const { id } of offene) {
    await db.execute(
      `UPDATE time_entries
          SET pause_sekunden = pause_sekunden
                + IF(status='pausiert', TIMESTAMPDIFF(SECOND, pause_start, CONCAT(CURDATE(), ' 20:00:00')), 0),
              pause_start = NULL,
              status = 'auto_beendet',
              ende = CONCAT(CURDATE(), ' 20:00:00'),
              braucht_pruefung = 1
        WHERE id = ?`, [id]);
    await rundenUndSpiegeln(id);
  }
  return offene.length;
}

module.exports = {
  starten, pausieren, fortsetzen, stoppen, manuellErfassen, bearbeiten,
  zwangsSchliessen, spiegelNachRentman, rundeAufFuenf,
  portalEintraegeFuerMonat, ladeEintrag,
};

if (require.main === module) {
  const [, , befehl, arg] = process.argv;
  (async () => {
    try {
      if (befehl === 'zwangsschliessen') {
        console.log(`${await zwangsSchliessen()} Eintraege zwangsbeendet`);
      } else if (befehl === 'spiegeln' && arg) {
        console.dir(await spiegelNachRentman(Number(arg)), { depth: null });
      } else {
        console.log('Aufruf: zwangsschliessen | spiegeln <id>');
      }
      process.exit(0);
    } catch (err) {
      console.error(err.message);
      process.exit(1);
    }
  })();
}
