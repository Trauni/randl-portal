/**
 * Fahrer-App (#516): Einstellungen, die das Büro pflegt (Tabelle fahrer_einstellung, Schlüssel → Text).
 *   storno_pin    JSON { verfahren, runden, salz, hash, gesetztAm, gesetztVon } – nie die PIN selbst
 *   sammelmail    JSON { an, uhrzeit }
 */
const { getPool } = require('../db');

async function lesen(schluessel) {
  const [rows] = await getPool().execute('SELECT wert FROM fahrer_einstellung WHERE schluessel = ?', [schluessel]);
  return rows[0] ? rows[0].wert : null;
}

async function setzen(schluessel, wert, von) {
  await getPool().execute(
    `INSERT INTO fahrer_einstellung (schluessel, wert, geaendert_von) VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE wert = VALUES(wert), geaendert_von = VALUES(geaendert_von)`,
    [schluessel, wert == null ? null : String(wert), von || null]
  );
}

module.exports = { lesen, setzen };
