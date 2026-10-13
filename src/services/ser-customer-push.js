// Gemeinsame STMUPD-Push-Logik, genutzt von:
// - POST /api/finance/customers/:id/push-ser (Staff, requireAuth, session-cookie)
// - POST /internal/customers/:id/push-ser (F29 Schritt 3, interner Listener,
//   Shared-Secret-Auth, aufgerufen vom gas-webshop-backend nach Profil-Save)
const { Pool } = require('pg');
const { generateStmupdXml } = require('./ser-stmupd');
const { uploadStmupdToSer } = require('./ser-sftp');

const gasPool = new Pool({
  host: '127.0.0.1',
  port: 5433,
  database: 'gaswebshop',
  user: process.env.GAS_DB_USER || 'gasadmin', // eigener Portal-User (#232), Fallback bis zur Umstellung
  password: process.env.GAS_DB_PASS,
});

async function pushCustomerToSer(customerId, bodyOpts = {}) {
  const result = await gasPool.query('SELECT * FROM customers WHERE id = $1', [customerId]);
  if (result.rows.length === 0) {
    const err = new Error('Kunde nicht gefunden');
    err.statusCode = 404;
    throw err;
  }
  const customer = result.rows[0];
  if (!customer.customer_number) {
    const err = new Error('Keine SER-Kundennummer vorhanden. Bitte zuerst vergeben.');
    err.statusCode = 400;
    throw err;
  }

  const addrResult = await gasPool.query(
    'SELECT lieferadrnr, name1, name2, strasse, plz, ort, land, tel FROM customer_delivery_addresses WHERE customer_id = $1 ORDER BY lieferadrnr',
    [customerId]
  );
  const deliveryAddresses = addrResult.rows;

  const rawData = customer.ser_raw_data || {};
  const opts = {
    pfjn:      bodyOpts.pfjn      !== undefined ? bodyOpts.pfjn      : (rawData.pfjn      ?? true),
    prjn:      bodyOpts.prjn      !== undefined ? bodyOpts.prjn      : (rawData.prjn      ?? true),
    nujn:      bodyOpts.nujn      !== undefined ? bodyOpts.nujn      : (rawData.nujn      ?? true),
    mwstkz:    bodyOpts.mwstkz    !== undefined ? bodyOpts.mwstkz    : (rawData.mwstkz    ?? true),
    belegart:  bodyOpts.belegart  || rawData.belegart  || 'L',
    kategorie: bodyOpts.kategorie || customer.ser_kategorie || 'F',
  };

  const { xml, filename } = generateStmupdXml(customer, opts, deliveryAddresses);
  await uploadStmupdToSer(xml, filename);
  await gasPool.query(
    'UPDATE customers SET in_ser_fvk = true, ser_active = true, updated_at = NOW() WHERE id = $1',
    [customerId]
  );
  console.log('[SER-Push]', customer.name, '→', filename);
  return { filename, message: `${filename} erfolgreich an SER übermittelt.` };
}

module.exports = { pushCustomerToSer };
