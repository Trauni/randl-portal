/**
 * Urlaub — Berechnung der Urlaubsstunden im Portal, optional gespiegelt nach Rentman.
 *
 * Das Portal ist führend für Urlaub und Arbeitszeit (#491); Rentman ist nur noch
 * Spiegel für Personen, die in beiden Systemen existieren. Berechnung und Nachweis
 * (Schnitt, Fenster, Quelle, Stunden je Tag) liegen vollständig im Portal. Bei der
 * Genehmigung legt das Portal für Personen mit rentman_id in Rentman einen Abwesenheitsantrag mit einem
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
const { arbeitstage } = require('../utils/feiertage');
const gleitzeit = require('./gleitzeit');
const { eintragMinuten, arbeitszeitAm } = require('../utils/gleitzeit');

const BASE = 'https://api.rentman.net';
const FENSTER_TAGE = 91;              // 13 Wochen
const ARBEITSZEIT = '/leavetypes/1';
const URLAUB = '/leavetypes/2';
const KOMPENSATION = '/leavetypes/5';   // Gleitzeitabbau (#490), zählt in Rentman nicht in die Summe
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

/** Werktage Mo–Fr im Zeitraum, ohne gesetzliche Feiertage in Bayern (#490). */
function werktage(von, bis) {
  return arbeitstage(von, bis);
}

const tagVor = (tag, n = 1) =>
  new Date(+new Date(tag + 'T12:00:00Z') - n * TAG_MS).toISOString().slice(0, 10);

/** Fasst Sekunden je Kalendertag zum Schnitt zusammen. Nenner sind Tage, keine Buchungen. */
function schnittAusTagen(proTag, von, beginn, quelle) {
  const tage = Object.keys(proTag);
  const sekunden = tage.reduce((s, t) => s + proTag[t], 0);
  return {
    von,
    bis: tagVor(beginn),
    tage: tage.length,
    sekunden,
    schnitt: tage.length ? Math.round(sekunden / tage.length) : 0,
    quelle,
  };
}

/** Arbeitszeit je Tag aus der Portal-Zeiterfassung (#491). Krankheit zählt nicht mit. */
async function arbeitszeitAusPortal(employeeId, von, beginn) {
  const [rows] = await getPool().query(
    `SELECT DATE_FORMAT(tag,'%Y-%m-%d') AS tag, pause_sekunden,
            TIMESTAMPDIFF(SECOND, start, ende) AS spanne
       FROM time_entries
      WHERE employee_id = ? AND tag >= ? AND tag < ?
        AND eintrag_typ = 'arbeitszeit'
        AND ende IS NOT NULL AND status IN ('abgeschlossen', 'auto_beendet')`,
    [employeeId, von, beginn]);
  const proTag = {};
  for (const r of rows) {
    const minuten = eintragMinuten(Number(r.spanne), Number(r.pause_sekunden));
    proTag[r.tag] = (proTag[r.tag] || 0) + minuten * 60;
  }
  return proTag;
}

/** Arbeitszeit je Tag aus Rentman, nur für Mitarbeiter, die noch nicht im Portal buchen. */
async function arbeitszeitAusRentman(rentmanId, von, beginn) {
  const eintraege = await api('GET', '/timeregistration?crewmember='
    + encodeURIComponent('/crew/' + rentmanId) + '&limit=500');
  const proTag = {};
  for (const e of eintraege || []) {
    if (e.leavetype !== ARBEITSZEIT) continue;
    const tag = String(e.start || '').slice(0, 10);
    if (!tag || tag < von || tag >= beginn) continue;
    proTag[tag] = (proTag[tag] || 0) + Number(e.duration || 0);
  }
  return proTag;
}

/**
 * Durchschnittliche Arbeitszeit pro Arbeitstag im Fenster vor dem Urlaubsbeginn (#491).
 * Quelle ist die Portal-Zeiterfassung; Rentman ist dort nur Spiegel. Nur wer noch
 * `zeiterfassung_quelle = 'rentman'` hat, wird bis zur Umstellung weiter aus Rentman
 * gerechnet. Nur Arbeitszeit — sonst rechnen sich Urlaub und Krankheit in ihre eigene
 * Bemessungsgrundlage hinein. Nenner sind verschiedene Kalendertage, keine Buchungen:
 * zwei Buchungen an einem Tag würden den Schnitt sonst halbieren.
 * mitarbeiter: { employee_id, zeiterfassung_quelle, rentman_id }
 */
async function bemessung(mitarbeiter, beginn) {
  const gleit = await bemessungGleitzeit(mitarbeiter.employee_id, beginn);
  if (gleit) return gleit;
  const von = tagVor(beginn, FENSTER_TAGE);
  let proTag;
  const quelle = mitarbeiter.zeiterfassung_quelle === 'portal' ? 'portal' : 'rentman';
  if (quelle === 'portal') {
    proTag = await arbeitszeitAusPortal(mitarbeiter.employee_id, von, beginn);
  } else {
    if (!mitarbeiter.rentman_id) {
      throw new Error('Zeiterfassung läuft über Rentman, aber keine rentman_id hinterlegt');
    }
    proTag = await arbeitszeitAusRentman(mitarbeiter.rentman_id, von, beginn);
  }
  return schnittAusTagen(proTag, von, beginn, quelle);
}

/**
 * Gleitzeitkonto: kein 13-Wochen-Schnitt. Ab `gleitzeit_seit` zählt jeder Urlaubstag
 * mit dem Tages-Soll (Wochenstunden / Arbeitstage, 35 h Mo–Fr = 7 h), damit das Konto
 * ausgeglichen bleibt. Modus 'keine': Urlaubstage tragen gar keine Stunden.
 * Ohne hinterlegte Arbeitszeit oder vor Kontobeginn: null, es gilt der Schnitt.
 */
async function bemessungGleitzeit(employeeId, beginn) {
  const konto = await gleitzeit.ladeKonto(employeeId);
  if (!konto.aktiv || beginn < konto.seit) return null;
  if (konto.urlaubModus === 'keine') {
    return { von: null, bis: null, tage: 0, sekunden: 0, schnitt: 0, quelle: 'gl_keine', gleitzeit: true };
  }
  const historie = await gleitzeit.ladeHistorie(employeeId, getPool());
  const az = arbeitszeitAm(historie, beginn);
  if (!az) return null;
  const schnitt = Math.round((az.wochenstunden * 3600) / az.arbeitstage.length);
  return { von: null, bis: null, tage: 0, sekunden: 0, schnitt, quelle: 'gl_soll', gleitzeit: true };
}

/**
 * Ersatz, wenn im Fenster keine Arbeitszeit liegt (neu eingestellt, lange krank):
 * der vertraglich vereinbarte Tagesumfang aus der Arbeitszeit-Historie. Ohne
 * Historie gibt es keinen belastbaren Wert, dann bleibt es beim Fehler.
 */
async function bemessungAusVertrag(employeeId, beginn, leer) {
  const [rows] = await getPool().query(
    `SELECT DATE_FORMAT(gueltig_ab,'%Y-%m-%d') AS gueltig_ab, wochenstunden, arbeitstage
       FROM gleitzeit_arbeitszeit WHERE employee_id = ?`, [employeeId]);
  const az = arbeitszeitAm(rows, beginn);
  if (!az) {
    throw new Error(`Keine Arbeitszeit zwischen ${leer.von} und ${leer.bis} und keine vereinbarte Wochenarbeitszeit hinterlegt — Schnitt nicht berechenbar`);
  }
  const schnitt = Math.round((az.wochenstunden * 3600) / az.arbeitstage.length);
  return { ...leer, schnitt, quelle: 'vertrag' };
}

async function ladeAntrag(antragId) {
  const [[a]] = await getPool().query(
    `SELECT vr.id, vr.employee_id, vr.status, vr.days_count, vr.art,
            vr.rentman_leaverequest_id AS lrId,
            DATE_FORMAT(vr.start_date, '%Y-%m-%d') AS von,
            DATE_FORMAT(vr.end_date,   '%Y-%m-%d') AS bis,
            TIME_FORMAT(vr.abbau_von, '%H:%i') AS zeitVon,
            TIME_FORMAT(vr.abbau_bis, '%H:%i') AS zeitBis,
            e.rentman_id, e.full_name, e.zeiterfassung_quelle,
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
  if (a.art === 'gleitzeitabbau') {
    const tage = await gleitzeit.abbauTage(a.employee_id, a.von, a.bis, undefined, abbauZeiten(a));
    return {
      antrag: a.id, art: a.art, mitarbeiter: a.full_name, status: a.status, von: a.von, bis: a.bis,
      werktage: tage.map((t) => t.tag), gesamtSekunden: tage.reduce((s, t) => s + t.minuten * 60, 0),
      vorlaeufig: false, rentmanAntrag: a.lrId || null,
      vorgehen: a.lrId ? 'bereits als Kompensation übertragen' : 'als Kompensation anlegen und genehmigen',
    };
  }
  const tage = werktage(a.von, a.bis);
  const b = await bemessung(a, a.von);
  const rmStatus = await rentmanStatus(a.lrId);
  const heute = new Date().toISOString().slice(0, 10);
  const vorlaeufig = heute < a.von && !b.gleitzeit;
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

/**
 * Rechnet den Urlaub und hält das Ergebnis im Portal fest (#491). Das Portal ist
 * die Akte: Schnitt, Bemessungsfenster, Quelle und Stunden je Tag stehen hier,
 * unabhängig davon, ob es Rentman noch gibt. Wird bei Neuberechnung überschrieben,
 * nicht vervielfacht.
 */
async function urlaubBerechnen(antragId) {
  const db = getPool();
  const a = await ladeAntrag(antragId);

  if (a.status !== 'approved') throw new Error(`Antrag ${antragId} ist ${a.status}, nicht approved`);
  if (a.art !== 'urlaub') throw new Error(`Antrag ${antragId} ist ${a.art}, kein Urlaub`);

  const tage = werktage(a.von, a.bis);
  if (!tage.length) throw new Error(`Antrag ${antragId} enthält keine Werktage`);
  if (tage.length !== a.days_count) {
    console.warn(`[urlaub] Antrag ${antragId}: ${tage.length} Werktage berechnet, days_count sagt ${a.days_count}`);
  }

  let b = await bemessung(a, a.von);
  if (!b.tage && !b.gleitzeit) b = await bemessungAusVertrag(a.employee_id, a.von, b);

  const heute = new Date().toISOString().slice(0, 10);
  const vorlaeufig = heute < a.von && !b.gleitzeit ? 1 : 0;

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    for (const tag of tage) {
      await conn.execute(
        `INSERT INTO vacation_request_days (vacation_request_id, tag, stunden_sekunden)
         VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE stunden_sekunden = VALUES(stunden_sekunden)`,
        [antragId, tag, b.schnitt]);
    }
    // Tage mit Rentman-Zeiteintrag räumt erst der Spiegel ab, nachdem er sie dort gelöscht hat.
    await conn.query(
      `DELETE FROM vacation_request_days
        WHERE vacation_request_id = ? AND rentman_timeregistration_id IS NULL AND tag NOT IN (?)`,
      [antragId, tage]);
    await conn.execute(
      `UPDATE vacation_requests
          SET stunden_sekunden = ?, vorlaeufig = ?, bemessung_von = ?, bemessung_bis = ?,
              bemessung_tage = ?, bemessung_sekunden = ?, bemessung_quelle = ?, berechnet_am = NOW()
        WHERE id = ?`,
      [b.schnitt, vorlaeufig, b.von, b.bis, b.tage, b.sekunden, b.quelle, antragId]);
    await conn.commit();
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }

  return { antragId, tage: tage.length, schnitt: b.schnitt, vorlaeufig: Boolean(vorlaeufig), bemessung: b };
}

/**
 * Spiegelt einen bereits im Portal berechneten Urlaub nach Rentman (nur Mitarbeiter
 * mit rentman_id). Schlägt das fehl, bleibt der Portal-Stand unberührt.
 */
async function urlaubNachRentman(antragId, berechnung) {
  const db = getPool();
  const a = await ladeAntrag(antragId);
  if (!a.rentman_id) throw new Error(`${a.full_name} hat keine rentman_id`);

  const tage = werktage(a.von, a.bis);
  const b = berechnung.bemessung;
  const vorlaeufig = berechnung.vorlaeufig ? 1 : 0;
  const bemerkung = vorlaeufig
    ? `VORLAEUFIG - Neuberechnung am ${a.von} (Mitarbeiterportal)`
    : b.gleitzeit
      ? (b.quelle === 'gl_keine'
        ? 'Urlaub, Gleitzeitkonto ohne Urlaubsstunden (Mitarbeiterportal)'
        : 'Urlaub, Gleitzeitkonto: Tages-Soll aus Wochenarbeitszeit (Mitarbeiterportal)')
    : b.quelle === 'vertrag'
      ? `Urlaub, vereinbarte Tagesarbeitszeit, keine Arbeitszeit ${b.von} bis ${b.bis} (Mitarbeiterportal)`
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
      // Die Tage selbst gehören dem Portal und bleiben; nur der Rentman-Bezug fällt weg.
      await db.execute('UPDATE vacation_request_days SET rentman_timeregistration_id = NULL WHERE vacation_request_id = ?', [antragId]);
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
    } else {
      const neu = await api('POST', '/leaverequest/' + lrId + '/timeregistration', koerper);
      await db.execute(
        'UPDATE vacation_request_days SET rentman_timeregistration_id = ? WHERE vacation_request_id = ? AND tag = ?',
        [neu.id, antragId, tag]);
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

  return {
    leaverequestId: lrId, neuAngelegt,
    rentmanStatus: vorlaeufig ? 'pending (Wert noch vorläufig)' : 'approved',
  };
}

/**
 * Urlaub verbuchen: erst im Portal, dann — falls es Rentman für diese Person
 * gibt — als Spiegel dorthin. Ein Rentman-Fehler macht die Berechnung nicht
 * ungeschehen, er steht im Ergebnis unter `rentman.fehler`.
 */
async function urlaubVerbuchen(antragId) {
  const berechnung = await urlaubBerechnen(antragId);
  const a = await ladeAntrag(antragId);
  if (!a.rentman_id) return { ...berechnung, rentman: { uebersprungen: true } };
  try {
    return { ...berechnung, rentman: await urlaubNachRentman(antragId, berechnung) };
  } catch (e) {
    console.error(`[urlaub] Antrag ${antragId} nicht nach Rentman gespiegelt: ${e.message}`);
    return { ...berechnung, rentman: { fehler: e.message } };
  }
}

/**
 * Gleitzeitabbau (#490) als Kompensation nach Rentman. Anders als Urlaub gibt
 * es keinen vorläufigen Wert: abgebucht wird das vereinbarte Tages-Soll, das
 * steht bei Genehmigung fest. Der Antrag wird deshalb sofort genehmigt.
 * Die Stunden sind in Rentman nur Information (leavetype 5 zählt nicht in die
 * Summe) — maßgeblich ist das Gleitzeitkonto im Portal. Sinn des Spiegels:
 * Disposition und Sicherung sehen, dass die Person fehlt.
 */
async function kompensationNachRentman(antragId) {
  const db = getPool();
  const a = await ladeAntrag(antragId);
  if (a.art !== 'gleitzeitabbau') throw new Error(`Antrag ${antragId} ist kein Gleitzeitabbau`);
  if (a.status !== 'approved') throw new Error(`Antrag ${antragId} ist ${a.status}, nicht approved`);
  if (a.lrId) return { antragId, leaverequestId: a.lrId, uebersprungen: 'bereits übertragen' };
  if (!a.rentman_id) throw new Error(`${a.full_name} hat keine rentman_id`);

  const zeiten = abbauZeiten(a);
  const tage = await gleitzeit.abbauTage(a.employee_id, a.von, a.bis, db, zeiten);
  if (!tage.length) throw new Error(`Antrag ${antragId} enthält keine Arbeitstage`);

  const crew = '/crew/' + a.rentman_id;
  const pruefer = a.pruefer ? '/crew/' + a.pruefer : crew;
  const titel = zeiten
    ? `Gleitzeitabbau ${a.von} ${zeiten.von}–${zeiten.bis} (Mitarbeiterportal)`
    : `Gleitzeitabbau ${a.von} bis ${a.bis} (Mitarbeiterportal)`;
  const lr = await api('POST', '/leaverequest', { requested_for: crew, approval_status: 'pending', description: titel });
  await db.execute('UPDATE vacation_requests SET rentman_leaverequest_id = ?, vorlaeufig = 0 WHERE id = ?', [lr.id, antragId]);

  for (const { tag, minuten } of tage) {
    const off = offsetFuer(tag);
    // Stundenweise: echte Uhrzeit, damit die Disposition sieht, wann die Person fehlt
    const [start, ende] = zeiten ? [zeiten.von, zeiten.bis] : ['08:00', '16:00'];
    const neu = await api('POST', '/leaverequest/' + lr.id + '/timeregistration', {
      crewmember: crew, leavetype: KOMPENSATION,
      start: `${tag}T${start}:00${off}`, end: `${tag}T${ende}:00${off}`,
      duration: minuten * 60, remark: 'Gleitzeitabbau (Mitarbeiterportal)',
    });
    await db.execute(
      `INSERT INTO vacation_request_days (vacation_request_id, tag, rentman_timeregistration_id, stunden_sekunden)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE rentman_timeregistration_id = VALUES(rentman_timeregistration_id),
                               stunden_sekunden = VALUES(stunden_sekunden)`,
      [antragId, tag, neu.id, minuten * 60]);
  }
  await api('PUT', '/leaverequest/' + lr.id,
    { requested_for: crew, approval_status: 'approved', reviewer: pruefer, description: titel });
  return { antragId, leaverequestId: lr.id, tage: tage.length, rentmanStatus: 'approved' };
}

/** Uhrzeiten eines stundenweisen Gleitzeitabbaus, sonst null (ganzer Tag). */
function abbauZeiten(a) {
  return a.zeitVon && a.zeitBis ? { von: a.zeitVon, bis: a.zeitBis } : null;
}

/**
 * Genehmigten Antrag verbuchen: Urlaub (Portal-Berechnung, dann Spiegel) oder
 * Gleitzeitabbau (#490). Der Abbau wird im Portal über das Gleitzeitkonto geführt
 * und braucht Rentman nur als Spiegel — ohne rentman_id bleibt nichts zu tun.
 */
async function nachRentman(antragId) {
  const a = await ladeAntrag(antragId);
  if (a.art !== 'gleitzeitabbau') return urlaubVerbuchen(antragId);
  if (!a.rentman_id) return { antragId, rentman: { uebersprungen: true } };
  return kompensationNachRentman(antragId);
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
    description: `${a.art === 'gleitzeitabbau' ? 'Gleitzeitabbau' : 'Urlaub'} ${a.von} bis ${a.bis} storniert (Mitarbeiterportal)`,
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
        AND art = 'urlaub'
        AND start_date > ?
        AND DATE_SUB(start_date, INTERVAL ? DAY) <= ?`,
    [employeeId, tag, FENSTER_TAGE, tag]);

  const ergebnisse = [];
  for (const r of rows) {
    try {
      const res = await urlaubVerbuchen(r.id);
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
    `SELECT vr.id, vr.employee_id, vr.art, e.full_name,
            DATE_FORMAT(vr.start_date, '%Y-%m-%d') AS von,
            DATE_FORMAT(vr.end_date,   '%Y-%m-%d') AS bis,
            vr.stunden_sekunden, vr.berechnet_am, vr.rentman_leaverequest_id,
            e.rentman_id IS NOT NULL AS hat_rentman
       FROM vacation_requests vr
       JOIN employees e ON e.id = vr.employee_id
      WHERE vr.status = 'approved' AND vr.cancelled_at IS NULL
        AND ( (vr.art = 'urlaub' AND (vr.stunden_sekunden IS NULL
                                      OR (vr.vorlaeufig = 1 AND vr.start_date <= CURDATE())))
              OR (e.rentman_id IS NOT NULL AND vr.rentman_leaverequest_id IS NULL) )
      ORDER BY vr.start_date`);
  return rows;
}

/** Für den nächtlichen Job. Ein Fehler bricht nicht den ganzen Lauf ab. */
async function faelligeNeuberechnung() {
  const offen = await offeneNeuberechnungen();
  const ergebnis = [];
  for (const r of offen) {
    try {
      ergebnis.push(await nachRentman(r.id));
    } catch (e) {
      console.error(`[urlaub] Antrag ${r.id} (${r.full_name}): ${e.message}`);
      ergebnis.push({ antragId: r.id, fehler: e.message });
    }
  }
  return ergebnis;
}

/**
 * Nächtlicher Lauf (#491): schließt vorläufige Urlaube ab, sobald der Urlaub
 * begonnen hat, und holt Liegengebliebenes nach. Läuft im Portal-Prozess und
 * braucht Rentman nicht. Mehrfachläufe sind unschädlich (idempotent).
 * Abschalten mit URLAUB_NACHTJOB=0.
 */
function starteZeitplan() {
  if (process.env.URLAUB_NACHTJOB === '0') return;
  const cron = require('node-cron');
  cron.schedule('30 3 * * *', async () => {
    try {
      const r = await faelligeNeuberechnung();
      const fehler = r.filter((x) => x.fehler || (x.rentman && x.rentman.fehler)).length;
      console.log(`[urlaub] Nachtlauf: ${r.length} Antraege, ${fehler} mit Fehler`);
    } catch (err) {
      console.error('[urlaub] Nachtlauf fehlgeschlagen:', err.message);
    }
  });
  console.log('[urlaub] Nachtlauf aktiv (03:30)');
}

module.exports = {
  starteZeitplan,
  betroffeneUrlaubeNeuberechnen,
  bemessung, werktage, offsetFuer, vorschau, rentmanStatus,
  urlaubBerechnen, urlaubVerbuchen, urlaubNachRentman, urlaubStornieren, kompensationNachRentman, nachRentman,
  offeneNeuberechnungen, faelligeNeuberechnung,
};

// ── CLI ───────────────────────────────────────────────────────────────────────
if (require.main === module) {
  require('dotenv').config({ override: true });
  const [, , befehl, arg] = process.argv;
  (async () => {
    try {
      if (befehl === 'rechnen' && arg) console.dir(await vorschau(Number(arg)), { depth: null });
      else if (befehl === 'schreiben' && arg) console.dir(await nachRentman(Number(arg)), { depth: null });
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
