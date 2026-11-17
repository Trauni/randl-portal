/**
 * Fahrer-App (#514): Ladebasen (Stamm) und ihre Zuordnung zur Tour. Datenzugriff MariaDB.
 */
const { getPool } = require('../db');
const { FahrerFehler } = require('./fahrerKrypto');

const FELDER = 'id, name, adresse, aktiv, sortierung';

async function alle() {
  const [rows] = await getPool().execute(`SELECT ${FELDER} FROM fahrer_ladebasis ORDER BY aktiv DESC, sortierung, name`);
  return rows;
}

async function nachId(id) {
  const [rows] = await getPool().execute(`SELECT ${FELDER} FROM fahrer_ladebasis WHERE id = ?`, [id]);
  return rows[0] || null;
}

async function legeAn({ name, adresse, sortierung }) {
  try {
    const [r] = await getPool().execute('INSERT INTO fahrer_ladebasis (name, adresse, sortierung) VALUES (?, ?, ?)', [name, adresse, sortierung]);
    return nachId(r.insertId);
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') throw new FahrerFehler(409, 'name_vergeben', `Ladebasis „${name}“ gibt es schon`);
    throw err;
  }
}

async function aendere(id, { name, adresse, aktiv, sortierung }) {
  try {
    await getPool().execute('UPDATE fahrer_ladebasis SET name = ?, adresse = ?, aktiv = ?, sortierung = ? WHERE id = ?', [name, adresse, aktiv ? 1 : 0, sortierung, id]);
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') throw new FahrerFehler(409, 'name_vergeben', `Ladebasis „${name}“ gibt es schon`);
    throw err;
  }
  return nachId(id);
}

/** Ladebasis an die Tour hängen (null = keine). Erhöht die Version, damit das Tablet neu lädt. */
async function setzeFuerTour(tourId, ladebasisId) {
  const [r] = await getPool().execute(
    "UPDATE fahrer_tour SET ladebasis_id = ?, version = version + 1 WHERE id = ? AND status NOT IN ('beendet', 'storniert')",
    [ladebasisId, tourId]
  );
  return r.affectedRows > 0;
}

module.exports = { alle, nachId, legeAn, aendere, setzeFuerTour };
