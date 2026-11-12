/** Kundennamen für die Gas-Auswertung aus der gas-db (Postgres, customers). Lexware-Nummer führend. Gas-Auswertung (#460) */
const { Pool } = require('pg');

let pool;
const getGasPool = () => {
  if (!pool) {
    pool = new Pool({ host: '127.0.0.1', port: 5433, database: 'gaswebshop', user: process.env.GAS_DB_USER, password: process.env.GAS_DB_PASS });
  }
  return pool;
};

/** SER-Kundennummern -> { name, nummer, quelle }. Bei Fehler leer (Auswertung läuft dann mit Nummern weiter). */
async function kundenInfo(serNummern) {
  const nrs = [...new Set(serNummern.map(String))];
  if (!nrs.length) return {};
  try {
    const { rows } = await getGasPool().query(
      'SELECT customer_number, lexware_customer_number, name FROM customers WHERE customer_number::text = ANY($1::text[])', [nrs],
    );
    return Object.fromEntries(rows.map((r) => [String(r.customer_number), {
      name: r.name,
      nummer: r.lexware_customer_number || r.customer_number,
      quelle: r.lexware_customer_number ? 'Lexware' : 'SER',
    }]));
  } catch (err) {
    console.error('[Gas] Kundennamen nicht ladbar:', err.message);
    return {};
  }
}

module.exports = { kundenInfo };
