/**
 * Fahrer-App (#542): Datenzugriff für Touren, Stopps und den Ereignis-Eingang (MariaDB).
 * Die Fachregeln stehen in routes/api/fahrer/touren.js; hier wird nur gelesen und gebucht.
 * Zeiten kommen immer als Date aus dem Aufrufer.
 */
const { getPool } = require('../db');
const { FahrerFehler } = require('./fahrerKrypto');

const TOUR_FELDER = `t.id, DATE_FORMAT(t.datum, '%Y-%m-%d') AS datum, t.bezeichnung, t.employee_id, t.fahrzeug, t.status,
  t.version, t.geraet_id, t.beendet_durch, e.full_name AS fahrer_name, g.kennung AS geraet_kennung,
  l.name AS ladebasis_name, l.adresse AS ladebasis_adresse`;
const TOUR_JOIN = `fahrer_tour t LEFT JOIN employees e ON e.id = t.employee_id LEFT JOIN fahrer_geraet g ON g.id = t.geraet_id
  LEFT JOIN fahrer_ladebasis l ON l.id = t.ladebasis_id`;

const platzhalter = (n) => Array(n).fill('?').join(', ');

/** Touren eines Fahrers an einem Tag, die ein Gerät laden darf (Konzept Abschnitt 6). */
async function ladbareTouren(employeeId, datum) {
  const [rows] = await getPool().execute(
    `SELECT ${TOUR_FELDER} FROM ${TOUR_JOIN}
      WHERE t.employee_id = ? AND t.datum = ? AND t.status IN ('freigegeben', 'unterwegs')
      ORDER BY t.id`,
    [employeeId, datum]
  );
  return rows;
}

async function stoppsZuTouren(tourIds) {
  if (!tourIds.length) return [];
  const [rows] = await getPool().execute(
    `SELECT id, tour_id, reihenfolge, auftrag_ref, kunde_nr, kunde_name, kunde_adresse, hinweise, lieferzeit, status
       FROM fahrer_stopp WHERE tour_id IN (${platzhalter(tourIds.length)}) ORDER BY tour_id, reihenfolge, id`,
    tourIds
  );
  return rows;
}

async function positionenZuStopps(stoppIds) {
  if (!stoppIds.length) return [];
  const [rows] = await getPool().execute(
    `SELECT id, stopp_id, artikel_nr, soll_menge FROM fahrer_stopp_position
      WHERE stopp_id IN (${platzhalter(stoppIds.length)}) ORDER BY stopp_id, id`,
    stoppIds
  );
  return rows;
}

/** Alle aktiven Artikel; zusätzlich inaktive, die in den geladenen Touren noch vorkommen (#552). */
async function artikel(auchNummern = []) {
  const extra = [...new Set(auchNummern)];
  const [rows] = await getPool().query(
    `SELECT artikel_nr, bezeichnung, typ, gasart, kategorie, kg_fuellung, un_nr, gefahrklasse, ggvs_faktor, befoerderungskategorie,
            bezadr, fuellgewicht_kg, fuellmenge, fuellmenge_einheit, preis_netto_cent, mwst_satz, pfand_artikel_nr, kaufflasche_artikel_nr, aktiv, geaendert_am
       FROM gas_artikel WHERE aktiv = 1${extra.length ? ' OR artikel_nr IN (?)' : ''} ORDER BY artikel_nr`,
    extra.length ? [extra] : []);
  return rows;
}

async function tourNachId(id) {
  const [rows] = await getPool().execute(`SELECT ${TOUR_FELDER} FROM ${TOUR_JOIN} WHERE t.id = ?`, [id]);
  return rows[0] || null;
}

async function stoppNachId(id) {
  const [rows] = await getPool().execute('SELECT id, tour_id, kunde_nr, status FROM fahrer_stopp WHERE id = ?', [id]);
  return rows[0] || null;
}

/** 'ok' | 'fehler' | null – Stand eines schon eingegangenen Ereignisses. */
async function ereignisStatus(uuid) {
  const [rows] = await getPool().execute('SELECT status FROM fahrer_ereignis WHERE uuid = ?', [uuid]);
  return rows[0]?.status || null;
}

async function lsStand(geraetId) {
  const [rows] = await getPool().execute('SELECT ls_stand FROM fahrer_geraet WHERE id = ?', [geraetId]);
  return Number(rows[0]?.ls_stand) || 0;
}

/** Eine Änderung aus der Fachlogik innerhalb der Buchungs-Transaktion anwenden. */
async function wendeAn(conn, a, ereignisId) {
  switch (a.art) {
    case 'tourStart':
      await conn.execute(
        "UPDATE fahrer_tour SET status = 'unterwegs', geraet_id = ?, gestartet_am = ? WHERE id = ? AND status = 'freigegeben'",
        [a.geraetId, a.zeit, a.tourId]
      );
      return;
    case 'tourEnde':
      await conn.execute(
        "UPDATE fahrer_tour SET status = 'beendet', beendet_am = ?, beendet_durch = 'fahrer' WHERE id = ? AND status = 'unterwegs'",
        [a.zeit, a.tourId]
      );
      return;
    case 'stoppStatus':
      await conn.execute(
        `UPDATE fahrer_stopp SET status = ? WHERE id = ? AND status IN (${platzhalter(a.nurAus.length)})`,
        [a.status, a.stoppId, ...a.nurAus]
      );
      return;
    case 'beleg': {
      const b = a.beleg;
      await conn.execute(
        `INSERT INTO fahrer_beleg (ls_nummer, ereignis_id, geraet_id, employee_id, tour_id, stopp_id, kunde_nr, erstellt_am, unterzeichner, unterschrift_png, markierung)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [b.lsNummer, ereignisId, b.geraetId, b.employeeId, b.tourId, b.stoppId, b.kundeNr, b.erstelltAm, b.unterzeichner, b.unterschriftPng, b.markierung]
      );
      for (const p of a.positionen) {
        await conn.execute(
          'INSERT INTO fahrer_beleg_position (ls_nummer, artikel_nr, bezeichnung, soll, geliefert, leergut) VALUES (?, ?, ?, ?, ?, ?)',
          [b.lsNummer, p.artikelNr, p.bezeichnung, p.soll, p.geliefert, p.leergut]
        );
      }
      return;
    }
    case 'lsStand':
      await conn.execute('UPDATE fahrer_geraet SET ls_stand = GREATEST(ls_stand, ?) WHERE id = ?', [a.stand, a.geraetId]);
      return;
    default:
      throw new Error(`Unbekannte Änderung ${a.art}`);
  }
}

/**
 * Ereignis samt Änderungen in einer Transaktion buchen.
 * 'doppelt': UUID ist schon erfolgreich gebucht. Ein früher abgelehntes Ereignis wird neu bewertet und überschrieben.
 * Wirft FahrerFehler 'ls_doppelt', wenn die LS-Nummer schon zu einem anderen Ereignis gehört.
 */
async function bucheEreignis({ ereignis: e, aenderungen = [] }) {
  const conn = await getPool().getConnection();
  try {
    await conn.beginTransaction();
    const [alt] = await conn.execute('SELECT id, status FROM fahrer_ereignis WHERE uuid = ? FOR UPDATE', [e.uuid]);
    if (alt[0]?.status === 'ok') { await conn.rollback(); return 'doppelt'; }
    const werte = [e.geraetId, e.employeeId, e.typ, e.lfd, e.geraetZeit, e.tourId, e.stoppId, e.status, e.fehlerCode, e.fehlerText, e.markierung, e.payload];
    let id;
    if (alt[0]) {
      id = alt[0].id;
      await conn.execute(
        `UPDATE fahrer_ereignis SET geraet_id = ?, employee_id = ?, typ = ?, lfd = ?, geraet_zeit = ?, tour_id = ?, stopp_id = ?,
           status = ?, fehler_code = ?, fehler_text = ?, markierung = ?, payload = ?, eingegangen_am = ? WHERE id = ?`,
        [...werte, e.eingegangenAm, id]
      );
    } else {
      const [r] = await conn.execute(
        `INSERT INTO fahrer_ereignis (uuid, geraet_id, employee_id, typ, lfd, geraet_zeit, tour_id, stopp_id, status, fehler_code, fehler_text, markierung, payload, eingegangen_am)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [e.uuid, ...werte, e.eingegangenAm]
      );
      id = r.insertId;
    }
    for (const a of aenderungen) await wendeAn(conn, a, id);
    await conn.commit();
    return 'neu';
  } catch (err) {
    await conn.rollback();
    if (err.code === 'ER_DUP_ENTRY' && /uq_fahrer_ereignis_uuid/.test(err.message)) return 'doppelt';
    if (err.code === 'ER_DUP_ENTRY' && /fahrer_beleg\.PRIMARY|'PRIMARY'/.test(err.message)) {
      throw new FahrerFehler(409, 'ls_doppelt', 'LS-Nummer ist schon zu einem anderen Ereignis gebucht');
    }
    throw err;
  } finally {
    conn.release();
  }
}

module.exports = {
  ladbareTouren,
  stoppsZuTouren,
  positionenZuStopps,
  artikel,
  tourNachId,
  stoppNachId,
  ereignisStatus,
  lsStand,
  bucheEreignis,
};
