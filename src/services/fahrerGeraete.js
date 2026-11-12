/**
 * Fahrer-App (#541): Datenzugriff für Geräte, Kopplungscodes und Tages-Tokens (MariaDB).
 * Zeiten kommen immer als Date aus dem Aufrufer, damit Tests und Server dieselbe Uhr nutzen.
 */
const crypto = require('crypto');
const { getPool, getEmployeeByUid, getEmployeeById } = require('../db');
const { FahrerFehler } = require('./fahrerKrypto');

const GERAET_FELDER = `g.id, g.geraet_uid, g.kennung, g.rolle, g.bezeichnung, g.employee_id, g.public_key,
  g.gekoppelt_am, g.gesperrt_am, g.ls_stand, g.letzte_signatur_ms, g.zuletzt_gesehen, g.erstellt_am`;

async function geraetNachUid(geraetUid) {
  const [rows] = await getPool().execute(`SELECT ${GERAET_FELDER} FROM fahrer_geraet g WHERE g.geraet_uid = ?`, [String(geraetUid || '')]);
  return rows[0] || null;
}

async function geraetNachId(id) {
  const [rows] = await getPool().execute(`SELECT ${GERAET_FELDER} FROM fahrer_geraet g WHERE g.id = ?`, [id]);
  return rows[0] || null;
}

/** Büro-Liste: mit Fahrer (Notfall-Handy), aktiver Anmeldung und offenem Kopplungscode. */
async function alleGeraete(jetzt) {
  const [rows] = await getPool().execute(
    `SELECT ${GERAET_FELDER}, e.full_name AS fahrer_name,
       (SELECT e2.full_name FROM fahrer_tagestoken t JOIN employees e2 ON e2.id = t.employee_id
         WHERE t.geraet_id = g.id AND t.widerrufen_am IS NULL AND t.gueltig_bis > ?
         ORDER BY t.id DESC LIMIT 1) AS angemeldet,
       (SELECT MAX(k.gueltig_bis) FROM fahrer_kopplungscode k
         WHERE k.geraet_id = g.id AND k.benutzt_am IS NULL AND k.gueltig_bis > ?) AS code_gueltig_bis
     FROM fahrer_geraet g LEFT JOIN employees e ON e.id = g.employee_id
     ORDER BY g.rolle, g.kennung`,
    [jetzt, jetzt]
  );
  return rows;
}

async function legeGeraetAn({ kennung, rolle, bezeichnung, employeeId, erstelltVon }) {
  try {
    const [r] = await getPool().execute(
      `INSERT INTO fahrer_geraet (geraet_uid, kennung, rolle, bezeichnung, employee_id, erstellt_von)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [crypto.randomUUID(), kennung, rolle, bezeichnung || null, employeeId || null, erstelltVon || null]
    );
    return geraetNachId(r.insertId);
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') throw new FahrerFehler(409, 'kennung_vergeben', `Kennung ${kennung} ist schon vergeben`);
    throw err;
  }
}

async function aendereGeraet(id, { bezeichnung, employeeId }) {
  await getPool().execute('UPDATE fahrer_geraet SET bezeichnung = ?, employee_id = ? WHERE id = ?', [bezeichnung || null, employeeId || null, id]);
  return geraetNachId(id);
}

/** Neuer Code ersetzt alle noch nicht benutzten Codes dieses Geräts. */
async function speichereKopplungscode(geraetId, codeHash, gueltigBis) {
  const pool = getPool();
  await pool.execute('DELETE FROM fahrer_kopplungscode WHERE geraet_id = ? AND benutzt_am IS NULL', [geraetId]);
  await pool.execute('INSERT INTO fahrer_kopplungscode (geraet_id, code_hash, gueltig_bis) VALUES (?, ?, ?)', [geraetId, codeHash, gueltigBis]);
}

/**
 * Löst einen Kopplungscode ein: Schlüssel speichern, alte Anmeldungen des Geräts widerrufen.
 * Gibt das Gerät zurück oder null, wenn der Code unbekannt, benutzt oder abgelaufen ist.
 */
async function loeseKopplungscodeEin({ codeHash, publicKey, zeitstempelMs, jetzt }) {
  const conn = await getPool().getConnection();
  try {
    await conn.beginTransaction();
    const [codes] = await conn.execute(
      `SELECT id, geraet_id FROM fahrer_kopplungscode
        WHERE code_hash = ? AND benutzt_am IS NULL AND gueltig_bis > ? FOR UPDATE`,
      [codeHash, jetzt]
    );
    if (!codes[0]) { await conn.rollback(); return null; }
    const { id, geraet_id: geraetId } = codes[0];
    await conn.execute('UPDATE fahrer_kopplungscode SET benutzt_am = ? WHERE id = ?', [jetzt, id]);
    await conn.execute(
      'UPDATE fahrer_geraet SET public_key = ?, gekoppelt_am = ?, letzte_signatur_ms = ?, zuletzt_gesehen = ? WHERE id = ?',
      [publicKey, jetzt, zeitstempelMs, jetzt, geraetId]
    );
    await conn.execute('UPDATE fahrer_tagestoken SET widerrufen_am = ? WHERE geraet_id = ? AND widerrufen_am IS NULL', [jetzt, geraetId]);
    await conn.commit();
    return geraetNachId(geraetId);
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

/** Merkt sich den Zeitstempel einer Signatur. false = gleicher oder älterer Zeitstempel schon verwendet. */
async function merkeSignatur(geraetId, zeitstempelMs) {
  const [r] = await getPool().execute(
    'UPDATE fahrer_geraet SET letzte_signatur_ms = ? WHERE id = ? AND letzte_signatur_ms < ?',
    [zeitstempelMs, geraetId, zeitstempelMs]
  );
  return r.affectedRows === 1;
}

/** Eine Anmeldung pro Gerät: Ein neuer Login (auch ein anderer Fahrer) widerruft die vorige. */
async function legeTagestokenAn({ geraetId, employeeId, tokenHash, gueltigBis, jetzt }) {
  const pool = getPool();
  await pool.execute('UPDATE fahrer_tagestoken SET widerrufen_am = ? WHERE geraet_id = ? AND widerrufen_am IS NULL', [jetzt, geraetId]);
  const [r] = await pool.execute(
    'INSERT INTO fahrer_tagestoken (geraet_id, employee_id, token_hash, gueltig_bis) VALUES (?, ?, ?, ?)',
    [geraetId, employeeId, tokenHash, gueltigBis]
  );
  return r.insertId;
}

async function tagestokenNachHash(tokenHash) {
  const [rows] = await getPool().execute('SELECT * FROM fahrer_tagestoken WHERE token_hash = ?', [tokenHash]);
  return rows[0] || null;
}

/** Für die Bearer-Middleware: Anmeldung samt Gerät in einem Aufruf. */
async function anmeldungMitGeraet(tagestokenId) {
  const [rows] = await getPool().execute(
    `SELECT t.id, t.geraet_id, t.employee_id, t.gueltig_bis, t.widerrufen_am,
            g.geraet_uid, g.kennung, g.rolle, g.gesperrt_am
       FROM fahrer_tagestoken t JOIN fahrer_geraet g ON g.id = t.geraet_id
      WHERE t.id = ?`,
    [tagestokenId]
  );
  return rows[0] || null;
}

async function widerrufeTagestoken(id, jetzt) {
  await getPool().execute('UPDATE fahrer_tagestoken SET widerrufen_am = ? WHERE id = ? AND widerrufen_am IS NULL', [jetzt, id]);
}

async function sperreGeraet(id, jetzt) {
  const pool = getPool();
  await pool.execute('UPDATE fahrer_geraet SET gesperrt_am = ? WHERE id = ? AND gesperrt_am IS NULL', [jetzt, id]);
  await pool.execute('UPDATE fahrer_tagestoken SET widerrufen_am = ? WHERE geraet_id = ? AND widerrufen_am IS NULL', [jetzt, id]);
  await pool.execute('DELETE FROM fahrer_kopplungscode WHERE geraet_id = ? AND benutzt_am IS NULL', [id]);
}

async function entsperreGeraet(id) {
  await getPool().execute('UPDATE fahrer_geraet SET gesperrt_am = NULL WHERE id = ?', [id]);
}

/** LS-Stand steigt nur (Konzept Abschnitt 7). Für #542: aus beleg.erstellt aufrufen. */
async function hebeLsStand(geraetId, stand) {
  await getPool().execute('UPDATE fahrer_geraet SET ls_stand = GREATEST(ls_stand, ?) WHERE id = ?', [Number(stand) || 0, geraetId]);
}

async function beruehre(geraetId, jetzt) {
  await getPool().execute('UPDATE fahrer_geraet SET zuletzt_gesehen = ? WHERE id = ?', [jetzt, geraetId]);
}

module.exports = {
  geraetNachUid,
  geraetNachId,
  alleGeraete,
  legeGeraetAn,
  aendereGeraet,
  speichereKopplungscode,
  loeseKopplungscodeEin,
  merkeSignatur,
  legeTagestokenAn,
  tagestokenNachHash,
  anmeldungMitGeraet,
  widerrufeTagestoken,
  sperreGeraet,
  entsperreGeraet,
  hebeLsStand,
  beruehre,
  mitarbeiterNachUid: getEmployeeByUid,
  mitarbeiterNachId: getEmployeeById,
};
