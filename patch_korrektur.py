# -*- coding: utf-8 -*-
import shutil

PFAD = 'src/services/zeit.js'

ALT = """async function spiegelNachRentman(entryId) {
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

  // Rentman erlaubt leavetype 4 (Krankheitstage) nur als Kind eines
  // Abwesenheitsantrags (leaverequest) -- ein blankes POST /timeregistration
  // mit leavetype 4 wird mit 400 abgelehnt ("Die Abwesenheitsart erfordert
  // eine Genehmigung"). Anders als beim Urlaub (urlaub.js) gibt es im Portal
  // aber bewusst keinen eigenen Genehmigungsschritt fuer Krankentage (F57)
  // -- der Antrag wird deshalb hier automatisch angelegt UND sofort
  // genehmigt, analog zum Muster in urlaub.js::urlaubNachRentman().
  let lrId = e.rentman_leaverequest_id;
  if (istKrankheit && !lrId) {
    const lr = await api('POST', '/leaverequest',
      { requested_for: crew, approval_status: 'pending', description: `Krankentag ${e.start_tag} (Mitarbeiterportal)` });
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

  let rentmanId = e.rentman_timeregistration_id;
  if (rentmanId) {
    await api('PUT', '/timeregistration/' + rentmanId, koerper);
  } else {
    const pfad = istKrankheit ? `/leaverequest/${lrId}/timeregistration` : '/timeregistration';
    const neu = await api('POST', pfad, koerper);
    rentmanId = neu.id;
    await db.execute('UPDATE time_entries SET rentman_timeregistration_id = ? WHERE id = ?', [rentmanId, entryId]);
  }

  // Genehmigung erst nach dem Anlegen des Kind-Zeiteintrags (wie in
  // urlaub.js) -- danach sperrt Rentman Aenderungen am Kind, solange der
  // Antrag nicht mehr pending ist ("kann nur angepasst werden, wenn die
  // Anfrage noch aussteht"). Bekannte Einschraenkung: eine spaetere
  // Korrektur (bearbeiten()) an einem bereits gespiegelten Krankentag laeuft
  // wieder ueber den PUT /timeregistration-Zweig oben und wuerde an dieser
  // Sperre scheitern -- bisher nicht nachgebaut (analog zum ungeloesten
  // Stornierungsfall in urlaub.js).
  // reviewer bewusst NICHT gesetzt: Rentman weist den Pruefer serverseitig
  // dem API-Dienstaccount zu (crew 235, "OpenAPI" in der Portal-Anzeige) --
  // ein selbst uebergebener reviewer-Wert fuehrte zu "instance failed to
  // match exactly one schema" (28.09.2026, per curl-Trockentest bestaetigt).
  if (istKrankheit && lrId) {
    await api('PUT', '/leaverequest/' + lrId,
      { requested_for: crew, approval_status: 'approved',
        description: `Krankentag ${e.start_tag} (Mitarbeiterportal)` });
  }

  return rentmanId;
}"""

NEU = """async function spiegelNachRentman(entryId) {
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
}"""

with open(PFAD, encoding='utf-8') as f:
    inhalt = f.read()

anzahl = inhalt.count(ALT)
assert anzahl == 1, f"Anker {anzahl}x gefunden statt 1x -- Datei hat sich vermutlich seit dem letzten Grep geaendert"

shutil.copy(PFAD, PFAD + '.bak2')
inhalt = inhalt.replace(ALT, NEU)
with open(PFAD, 'w', encoding='utf-8') as f:
    f.write(inhalt)

print('OK -- gepatcht, Backup unter', PFAD + '.bak2')
