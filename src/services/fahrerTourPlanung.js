/**
 * Tourplanung im Büro (#518): Datenzugriff MariaDB. Die Fachregeln stehen in fahrerPlanung.js und im Router.
 * Jede Änderung zählt fahrer_tour.version hoch, damit das Tablet neu lädt.
 */
const { getPool } = require('../db');
const { FahrerFehler } = require('./fahrerKrypto');
const { gibNichtGelieferteFrei } = require('./fahrerTouren');

const TOUR = `t.id, DATE_FORMAT(t.datum, '%Y-%m-%d') AS datum, t.bezeichnung, t.employee_id, t.fahrzeug, t.ladebasis_id, t.status,
  t.version, t.geraet_id, t.gestartet_am, t.beendet_am, t.beendet_durch, e.full_name AS fahrer_name, l.name AS ladebasis_name,
  (SELECT COUNT(*) FROM fahrer_stopp s WHERE s.tour_id = t.id) AS stopps`;
const TOUR_VON = 'fahrer_tour t LEFT JOIN employees e ON e.id = t.employee_id LEFT JOIN fahrer_ladebasis l ON l.id = t.ladebasis_id';

/** Aktive Mitarbeiter für die Fahrer-Auswahl. */
async function fahrer() {
  const [rows] = await getPool().execute('SELECT id, full_name FROM employees WHERE active = 1 ORDER BY full_name');
  return rows.map((r) => ({ id: r.id, name: r.full_name }));
}

async function touren({ von, bis } = {}) {
  const [rows] = await getPool().execute(
    `SELECT ${TOUR} FROM ${TOUR_VON} WHERE t.datum BETWEEN ? AND ? ORDER BY t.datum, t.id`,
    [von, bis]
  );
  return rows;
}

async function tourNachId(id) {
  const [rows] = await getPool().execute(`SELECT ${TOUR} FROM ${TOUR_VON} WHERE t.id = ?`, [id]);
  return rows[0] || null;
}

async function stopps(tourId) {
  const [rows] = await getPool().execute(
    `SELECT id, reihenfolge, auftrag_ref, bestell_id, kunde_nr, kunde_name, kunde_adresse, hinweise, lieferzeit, status
       FROM fahrer_stopp WHERE tour_id = ? ORDER BY reihenfolge, id`, [tourId]);
  if (!rows.length) return [];
  const [pos] = await getPool().query(
    'SELECT stopp_id, artikel_nr, soll_menge, soll_leergut FROM fahrer_stopp_position WHERE stopp_id IN (?) ORDER BY id', [rows.map((r) => r.id)]);
  return rows.map((r) => ({ ...r, positionen: pos.filter((p) => p.stopp_id === r.id).map((p) => ({ artikelNr: p.artikel_nr, soll: Number(p.soll_menge), leergut: p.soll_leergut == null ? null : Number(p.soll_leergut) })) }));
}

async function legeAn({ datum, bezeichnung, employeeId, fahrzeug, ladebasisId, erstelltVon }) {
  const [r] = await getPool().execute(
    'INSERT INTO fahrer_tour (datum, bezeichnung, employee_id, fahrzeug, ladebasis_id, erstellt_von) VALUES (?, ?, ?, ?, ?, ?)',
    [datum, bezeichnung, employeeId, fahrzeug, ladebasisId, erstelltVon]);
  return tourNachId(r.insertId);
}

/** Kopfdaten ändern, nur im Entwurf. false = Tour gibt es nicht oder ist nicht mehr im Entwurf. */
async function aendereKopf(id, { datum, bezeichnung, employeeId, fahrzeug, ladebasisId }) {
  const [r] = await getPool().execute(
    "UPDATE fahrer_tour SET datum = ?, bezeichnung = ?, employee_id = ?, fahrzeug = ?, ladebasis_id = ?, version = version + 1 WHERE id = ? AND status = 'entwurf'",
    [datum, bezeichnung, employeeId, fahrzeug, ladebasisId, id]);
  return r.affectedRows > 0;
}

/** Bestell-IDs, die schon in einer aktiven Tour stecken. */
async function belegteBestellungen() {
  const [rows] = await getPool().execute('SELECT bestell_sperre FROM fahrer_stopp WHERE bestell_sperre IS NOT NULL');
  return new Set(rows.map((r) => r.bestell_sperre));
}

async function unbekannteArtikel(nummern) {
  if (!nummern.length) return [];
  const [rows] = await getPool().query('SELECT artikel_nr FROM gas_artikel WHERE artikel_nr IN (?)', [nummern]);
  const da = new Set(rows.map((r) => r.artikel_nr));
  return nummern.filter((n) => !da.has(n));
}

/**
 * Artikel für die Ladeliste (#607): ADR-Angaben, Füllmenge und Pfandbezug, dazu die Pfandartikel selbst (für die Bezeichnung).
 * Liefert { [artikel_nr]: Zeile }.
 */
async function artikelFuerLadeliste(nummern) {
  const nr = [...new Set(nummern.filter(Boolean))];
  if (!nr.length) return {};
  const SPALTEN = 'artikel_nr, bezeichnung, gasart, ggvs_faktor, befoerderungskategorie, fuellmenge, fuellmenge_einheit, pfand_artikel_nr, kaufflasche_artikel_nr';
  const [rows] = await getPool().query(`SELECT ${SPALTEN} FROM gas_artikel WHERE artikel_nr IN (?)`, [nr]);
  const karte = Object.fromEntries(rows.map((r) => [r.artikel_nr, r]));
  const pfand = [...new Set(rows.map((r) => r.pfand_artikel_nr).filter((n) => n && !karte[n]))];
  if (pfand.length) {
    const [pf] = await getPool().query(`SELECT ${SPALTEN} FROM gas_artikel WHERE artikel_nr IN (?)`, [pfand]);
    for (const r of pf) karte[r.artikel_nr] = r;
  }
  return karte;
}

/** Gebuchte Zuladungen einer Tour (#639), älteste zuerst. Abgelehnte Ereignisse zählen nicht. */
async function zuladungen(tourId) {
  const [rows] = await getPool().execute(
    `SELECT ev.uuid, ev.geraet_zeit, ev.markierung, ev.payload, g.kennung AS geraet_kennung
       FROM fahrer_ereignis ev LEFT JOIN fahrer_geraet g ON g.id = ev.geraet_id
      WHERE ev.tour_id = ? AND ev.typ = 'tour.zugeladen' AND ev.status = 'ok'
      ORDER BY ev.geraet_zeit, ev.id`, [tourId]);
  return rows;
}

/** Eine Transaktion mit gesperrter Tourzeile; fn bekommt die Verbindung. */
async function imEntwurf(tourId, fn) {
  const conn = await getPool().getConnection();
  try {
    await conn.beginTransaction();
    const [[t]] = await conn.execute('SELECT status FROM fahrer_tour WHERE id = ? FOR UPDATE', [tourId]);
    if (!t) throw new FahrerFehler(404, 'tour_nicht_gefunden', 'Tour nicht gefunden');
    if (t.status !== 'entwurf') throw new FahrerFehler(409, 'tour_gesperrt', `Tour ist „${t.status}“ und nicht mehr änderbar`);
    const ergebnis = await fn(conn);
    await conn.execute('UPDATE fahrer_tour SET version = version + 1 WHERE id = ?', [tourId]);
    await conn.commit();
    return ergebnis;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

/** Stopp mit Positionen ans Ende der Tour hängen. 409 bestellung_belegt, wenn die Bestellung schon in einer aktiven Tour steckt. */
async function fuegeStoppHinzu(tourId, s) {
  return imEntwurf(tourId, async (conn) => {
    const [[{ naechste }]] = await conn.execute('SELECT COALESCE(MAX(reihenfolge), 0) + 1 AS naechste FROM fahrer_stopp WHERE tour_id = ?', [tourId]);
    let stoppId;
    try {
      const [r] = await conn.execute(
        `INSERT INTO fahrer_stopp (tour_id, reihenfolge, auftrag_ref, bestell_id, bestell_sperre, kunde_nr, kunde_name, kunde_adresse, hinweise, lieferzeit)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [tourId, naechste, s.auftragRef, s.bestellId, s.bestellId, s.kundeNr, s.kundeName, s.kundeAdresse, s.hinweise, s.lieferzeit]);
      stoppId = r.insertId;
    } catch (err) {
      if (err.code === 'ER_DUP_ENTRY') throw new FahrerFehler(409, 'bestellung_belegt', `Bestellung ${s.auftragRef} steckt schon in einer Tour`);
      throw err;
    }
    for (const p of s.positionen) {
      await conn.execute('INSERT INTO fahrer_stopp_position (stopp_id, artikel_nr, soll_menge, soll_leergut) VALUES (?, ?, ?, ?)', [stoppId, p.artikelNr, p.soll, p.leergut ?? null]);
    }
    return stoppId;
  });
}

async function entferneStopp(tourId, stoppId) {
  return imEntwurf(tourId, async (conn) => {
    const [r] = await conn.execute('DELETE FROM fahrer_stopp WHERE id = ? AND tour_id = ?', [stoppId, tourId]);
    if (!r.affectedRows) throw new FahrerFehler(404, 'stopp_nicht_gefunden', 'Stopp gehört nicht zu dieser Tour');
    // Lücken in reihenfolge stören nicht, gelesen wird nach reihenfolge, id.
  });
}

async function aendereStopp(tourId, stoppId, { lieferzeit, hinweise }) {
  return imEntwurf(tourId, async (conn) => {
    const [r] = await conn.execute('UPDATE fahrer_stopp SET lieferzeit = ?, hinweise = ? WHERE id = ? AND tour_id = ?', [lieferzeit, hinweise, stoppId, tourId]);
    if (!r.affectedRows) throw new FahrerFehler(404, 'stopp_nicht_gefunden', 'Stopp gehört nicht zu dieser Tour');
  });
}

/** Neue Reihenfolge: stoppIds muss genau die Stopps der Tour enthalten. */
async function sortiere(tourId, stoppIds) {
  return imEntwurf(tourId, async (conn) => {
    const [rows] = await conn.execute('SELECT id FROM fahrer_stopp WHERE tour_id = ?', [tourId]);
    const vorhanden = rows.map((r) => r.id).sort((a, b) => a - b);
    const neu = [...stoppIds].sort((a, b) => a - b);
    if (vorhanden.length !== neu.length || vorhanden.some((id, i) => id !== neu[i])) {
      throw new FahrerFehler(400, 'ungueltig', 'Die Liste muss genau die Stopps der Tour enthalten');
    }
    for (let i = 0; i < stoppIds.length; i += 1) {
      await conn.execute('UPDATE fahrer_stopp SET reihenfolge = ? WHERE id = ?', [i + 1, stoppIds[i]]);
    }
  });
}

/**
 * Statuswechsel durch das Büro. von = erlaubte Ausgangszustände (Rennen mit dem Tablet: WHERE status IN).
 * stornieren gibt die Bestellungen wieder frei; beenden bucht das Büro-Ende.
 */
async function setzeStatus(tourId, aktion, von, nach, jetzt) {
  const conn = await getPool().getConnection();
  try {
    await conn.beginTransaction();
    const zusatz = nach === 'beendet' ? ", beendet_am = ?, beendet_durch = 'buero'" : '';
    const [r] = await conn.execute(
      `UPDATE fahrer_tour SET status = ?, version = version + 1${zusatz} WHERE id = ? AND status IN (${von.map(() => '?').join(', ')})`,
      [nach, ...(nach === 'beendet' ? [jetzt] : []), tourId, ...von]);
    if (!r.affectedRows) { await conn.rollback(); return false; }
    if (nach === 'beendet') await gibNichtGelieferteFrei(conn, tourId);
    if (nach === 'storniert') await conn.execute('UPDATE fahrer_stopp SET bestell_sperre = NULL, status = IF(status = \'offen\', \'storniert\', status) WHERE tour_id = ?', [tourId]);
    await conn.commit();
    return true;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

const VORLAGE = 'v.id, v.name, v.employee_id, v.fahrzeug, v.ladebasis_id, e.full_name AS fahrer_name, l.name AS ladebasis_name';
const VORLAGE_VON = 'fahrer_tour_vorlage v LEFT JOIN employees e ON e.id = v.employee_id LEFT JOIN fahrer_ladebasis l ON l.id = v.ladebasis_id';

async function vorlagen() {
  const [rows] = await getPool().execute(`SELECT ${VORLAGE} FROM ${VORLAGE_VON} ORDER BY v.name`);
  if (!rows.length) return [];
  const [kunden] = await getPool().query(
    'SELECT id, vorlage_id, kunde_nr, kunde_name, lieferzeit, hinweise FROM fahrer_tour_vorlage_kunde WHERE vorlage_id IN (?) ORDER BY reihenfolge, id', [rows.map((r) => r.id)]);
  return rows.map((r) => ({ ...r, kunden: kunden.filter((k) => k.vorlage_id === r.id) }));
}

async function vorlageNachId(id) {
  return (await vorlagen()).find((v) => v.id === id) || null;
}

async function schreibeKunden(conn, vorlageId, kunden) {
  await conn.execute('DELETE FROM fahrer_tour_vorlage_kunde WHERE vorlage_id = ?', [vorlageId]);
  for (let i = 0; i < kunden.length; i += 1) {
    const k = kunden[i];
    await conn.execute(
      'INSERT INTO fahrer_tour_vorlage_kunde (vorlage_id, reihenfolge, kunde_nr, kunde_name, lieferzeit, hinweise) VALUES (?, ?, ?, ?, ?, ?)',
      [vorlageId, i + 1, k.kundeNr, k.kundeName, k.lieferzeit, k.hinweise]);
  }
}

/** Neu anlegen (id = null) oder ersetzen. 409 name_vergeben bei doppeltem Namen. */
async function speichereVorlage(id, { name, employeeId, fahrzeug, ladebasisId, kunden }) {
  const conn = await getPool().getConnection();
  try {
    await conn.beginTransaction();
    let vorlageId = id;
    if (id == null) {
      const [r] = await conn.execute('INSERT INTO fahrer_tour_vorlage (name, employee_id, fahrzeug, ladebasis_id) VALUES (?, ?, ?, ?)', [name, employeeId, fahrzeug, ladebasisId]);
      vorlageId = r.insertId;
    } else {
      const [r] = await conn.execute('UPDATE fahrer_tour_vorlage SET name = ?, employee_id = ?, fahrzeug = ?, ladebasis_id = ? WHERE id = ?', [name, employeeId, fahrzeug, ladebasisId, id]);
      if (!r.affectedRows) throw new FahrerFehler(404, 'vorlage_nicht_gefunden', 'Vorlage nicht gefunden');
    }
    await schreibeKunden(conn, vorlageId, kunden);
    await conn.commit();
    return vorlageId;
  } catch (err) {
    await conn.rollback();
    if (err.code === 'ER_DUP_ENTRY') throw new FahrerFehler(409, 'name_vergeben', `Vorlage „${name}“ gibt es schon`);
    throw err;
  } finally {
    conn.release();
  }
}

async function loescheVorlage(id) {
  const [r] = await getPool().execute('DELETE FROM fahrer_tour_vorlage WHERE id = ?', [id]);
  return r.affectedRows > 0;
}

async function loesche(tourId) {
  await getPool().execute('DELETE FROM fahrer_tour WHERE id = ?', [tourId]);
}

module.exports = {
  vorlagen, vorlageNachId, speichereVorlage, loescheVorlage,
  fahrer, touren, tourNachId, stopps, legeAn, aendereKopf, belegteBestellungen, unbekannteArtikel, artikelFuerLadeliste, zuladungen,
  fuegeStoppHinzu, entferneStopp, aendereStopp, sortiere, setzeStatus, loesche,
};
