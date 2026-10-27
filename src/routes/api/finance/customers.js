const router = require('express').Router();
// Rechtepruefung sitzt am Mount-Punkt in server.js: requireArea('gashandel')
const { shopFetch } = require('./shopClient');
const { getPool } = require('../../../db');
const requireAuth = require('../../../middleware/requireAuth');
const { Pool } = require('pg');

// Direkter PostgreSQL-Pool für gas-db Fallback
const gasPool = new Pool({
  host: '127.0.0.1',
  port: 5433,
  database: 'gaswebshop',
  user: process.env.GAS_DB_USER, // eigener Portal-User randl_portal (#232), kein Superuser
  password: process.env.GAS_DB_PASS,
});


// Direktverknüpfung in gas-db: alte Verknüpfung lösen, neue setzen
async function gasDirectLink(customerId, lexwareId) {
  const client = await gasPool.connect();
  try {
    await client.query('BEGIN');
    // Alte Verknüpfung dieser Lexware-ID entfernen (falls vorhanden)
    await client.query(
      'UPDATE customers SET lexware_id = NULL, in_lexware = false WHERE lexware_id = $1 AND id != $2',
      [lexwareId, customerId]
    );
    // Neue Verknüpfung setzen
    await client.query(
      'UPDATE customers SET lexware_id = $1, in_lexware = true WHERE id = $2',
      [lexwareId, customerId]
    );
    await client.query('COMMIT');
    console.log('[Finance/Customers] gasDirectLink OK:', customerId, '->', lexwareId);
  } catch(err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// GET /api/finance/customers
router.get('/', async (req, res) => {
  try {
    const showInactive = req.query.showInactive === 'true';
    const params = new URLSearchParams();
    ['q','zip','city','source','in_lexware','in_ser_fvk','page','limit'].forEach(k => {
      if (req.query[k] !== undefined && req.query[k] !== '') params.set(k, req.query[k]);
    });
    const upstream = await shopFetch('/admin/customers?' + params);
    const data = await upstream.json();

    let excluded = [];
    try {
      const [rows] = await getPool().execute(
        'SELECT customer_id, deleted_at FROM customer_exclusions'
      );
      excluded = rows;
    } catch(dbErr) {
      console.error('[Finance/Customers] exclusions error:', dbErr.message);
    }
    if (excluded.length > 0) {
      const excludedMap = new Map(excluded.map(r => [r.customer_id, r]));
      if (!showInactive) {
        data.customers = (data.customers || []).filter(c => !excludedMap.has(c.id));
        if (data.total) data.total = Math.max(0, data.total - excluded.length);
      } else {
        data.customers = (data.customers || []).map(c =>
          excludedMap.has(c.id)
            ? { ...c, deleted_at: excludedMap.get(c.id).deleted_at }
            : c
        );
      }
    }
    res.status(upstream.status).json(data);
  } catch(err) {
    console.error('[Finance/Customers] GET error:', err);
    res.status(500).json({ error: 'Shop-API nicht erreichbar' });
  }
});

// DELETE /api/finance/customers/:id  (Soft-Delete)
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const name = (req.body && (req.body.company_name || req.body.name)) || null;
    await getPool().execute(
      'INSERT INTO customer_exclusions (customer_id, customer_name) VALUES (?, ?)' +
      ' ON DUPLICATE KEY UPDATE deleted_at = NOW(), customer_name = VALUES(customer_name)',
      [req.params.id, name]
    );
    res.json({ success: true });
  } catch(err) {
    console.error('[Finance/Customers] DELETE error:', err);
    res.status(500).json({ error: 'Fehler beim Soft-Delete' });
  }
});

// PATCH /api/finance/customers/:id/restore
router.patch('/:id/restore', requireAuth, async (req, res) => {
  try {
    await getPool().execute(
      'DELETE FROM customer_exclusions WHERE customer_id = ?',
      [req.params.id]
    );
    res.json({ success: true });
  } catch(err) {
    console.error('[Finance/Customers] RESTORE error:', err);
    res.status(500).json({ error: 'Fehler beim Wiederherstellen' });
  }
});

// POST /api/finance/customers
router.post('/', async (req, res) => {
  try {
    const upstream = await shopFetch('/admin/customers', { method: 'POST', body: JSON.stringify(req.body) });
    const data = await upstream.json();
    res.status(upstream.status).json(data);
  } catch(err) { res.status(500).json({ error: 'Shop-API nicht erreichbar' }); }
});

// POST /api/finance/customers/bulk-push
router.post('/bulk-push', async (req, res) => {
  try {
    const upstream = await shopFetch('/admin/customers/bulk-push', { method: 'POST', body: JSON.stringify(req.body) });
    const data = await upstream.json();
    res.status(upstream.status).json(data);
  } catch(err) { res.status(500).json({ error: 'Shop-API nicht erreichbar' }); }
});

// GET /api/finance/customers/bulk-push/:jobId/status
router.get('/bulk-push/:jobId/status', async (req, res) => {
  try {
    const upstream = await shopFetch('/admin/customers/bulk-push/' + req.params.jobId + '/status');
    const data = await upstream.json();
    res.status(upstream.status).json(data);
  } catch(err) { res.status(500).json({ error: 'Shop-API nicht erreichbar' }); }
});

// GET /api/finance/customers/:id
router.get('/:id', async (req, res) => {
  try {
    const upstream = await shopFetch('/admin/customers/' + req.params.id);
    const data = await upstream.json();
    res.status(upstream.status).json(data);
  } catch(err) { res.status(500).json({ error: 'Shop-API nicht erreichbar' }); }
});

// PUT /api/finance/customers/:id
router.put('/:id', async (req, res) => {
  try {
    const upstream = await shopFetch('/admin/customers/' + req.params.id, { method: 'PUT', body: JSON.stringify(req.body) });
    const data = await upstream.json();
    res.status(upstream.status).json(data);
  } catch(err) { res.status(500).json({ error: 'Shop-API nicht erreichbar' }); }
});

// GET /api/finance/customers/:id/check-duplicates
router.get('/:id/check-duplicates', async (req, res) => {
  try {
    const upstream = await shopFetch('/admin/customers/' + req.params.id + '/check-duplicates');
    const data = await upstream.json();
    res.status(upstream.status).json(data);
  } catch(err) { res.status(500).json({ error: 'Shop-API nicht erreichbar' }); }
});

// POST /api/finance/customers/:id/push-to-lexware
router.post('/:id/push-to-lexware', async (req, res) => {
  try {
    const force = req.query.force ? '?force=true' : '';
    const upstream = await shopFetch('/admin/customers/' + req.params.id + '/push-to-lexware' + force, {
      method: 'POST', body: JSON.stringify(req.body)
    });
    const data = await upstream.json();
    res.status(upstream.status).json(data);
  } catch(err) { res.status(500).json({ error: 'Shop-API nicht erreichbar' }); }
});

// POST /api/finance/customers/:id/link-to-lexware
router.post('/:id/link-to-lexware', async (req, res) => {
  const linkOnly = req.query.linkOnly === 'true';
  const { lexwareId } = req.body || {};
  try {
    const qs = linkOnly ? '?linkOnly=true' : '';
    const upstream = await shopFetch('/admin/customers/' + req.params.id + '/link-to-lexware' + qs, {
      method: 'POST', body: JSON.stringify(req.body)
    });
    const data = await upstream.json();
    // Fallback: bei 406 oder duplicate-key direkt in gas-db schreiben
    if ((upstream.status === 406 || (data.error && data.error.includes('duplicate'))) && lexwareId) {
      console.log('[Finance/Customers] link-to-lexware Fallback: direkt gas-db Update für', req.params.id);
      await gasDirectLink(req.params.id, lexwareId);
      return res.json({ success: true, fallback: true, lexware_id: lexwareId });
    }
    res.status(upstream.status).json(data);
  } catch(err) {
    if (lexwareId) {
      try {
        console.log('[Finance/Customers] link-to-lexware Exception-Fallback für', req.params.id);
        await gasDirectLink(req.params.id, lexwareId);
        return res.json({ success: true, fallback: true, lexware_id: lexwareId });
      } catch(dbErr) {
        console.error('[Finance/Customers] Fallback DB error:', dbErr.message);
        return res.status(500).json({ error: 'Verknüpfung fehlgeschlagen: ' + dbErr.message });
      }
    }
    res.status(500).json({ error: 'Shop-API nicht erreichbar' });
  }
});

// GET /api/finance/customers/:id/delivery-addresses
router.get('/:id/delivery-addresses', async (req, res) => {
  try {
    const upstream = await shopFetch('/admin/customers/' + req.params.id + '/delivery-addresses');
    const data = await upstream.json();
    res.status(upstream.status).json(data);
  } catch(err) { res.status(500).json({ error: 'Shop-API nicht erreichbar' }); }
});


// POST /api/finance/customers/:id/delivery-addresses
router.post('/:id/delivery-addresses', async (req, res) => {
  try {
    const upstream = await shopFetch('/admin/customers/' + req.params.id + '/delivery-addresses', {
      method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(req.body)
    });
    const data = await upstream.json();
    res.status(upstream.status).json(data);
  } catch(err) { res.status(500).json({ error: 'Shop-API nicht erreichbar' }); }
});

// PUT /api/finance/customers/:id/delivery-addresses/:addrId
router.put('/:id/delivery-addresses/:addrId', async (req, res) => {
  try {
    const upstream = await shopFetch('/admin/customers/' + req.params.id + '/delivery-addresses/' + req.params.addrId, {
      method: 'PUT', headers: {'Content-Type':'application/json'}, body: JSON.stringify(req.body)
    });
    const data = await upstream.json();
    res.status(upstream.status).json(data);
  } catch(err) { res.status(500).json({ error: 'Shop-API nicht erreichbar' }); }
});

// DELETE /api/finance/customers/:id/delivery-addresses/:addrId
router.delete('/:id/delivery-addresses/:addrId', async (req, res) => {
  try {
    const upstream = await shopFetch('/admin/customers/' + req.params.id + '/delivery-addresses/' + req.params.addrId, {
      method: 'DELETE'
    });
    const data = await upstream.json();
    res.status(upstream.status).json(data);
  } catch(err) { res.status(500).json({ error: 'Shop-API nicht erreichbar' }); }
});
// GET /api/finance/customers/:id/qr-code
router.get('/:id/qr-code', async (req, res) => {
  try {
    const upstream = await shopFetch('/admin/customers/' + req.params.id + '/qr-code');
    const data = await upstream.json();
    res.status(upstream.status).json(data);
  } catch(err) { res.status(500).json({ error: 'Shop-API nicht erreichbar' }); }
});
// POST /api/finance/customers/:id/reset-mail – Link für ein neues Passwort per Mail
router.post('/:id/reset-mail', requireAuth, async (req, res) => {
  try {
    const upstream = await shopFetch('/admin/customers/' + encodeURIComponent(req.params.id) + '/reset-mail', { method: 'POST', body: '{}' });
    res.status(upstream.status).json(await upstream.json().catch(() => ({})));
  } catch(err) { res.status(500).json({ error: 'Shop-API nicht erreichbar' }); }
});


// ─── F11: Neuer Kunde anlegen (direkt in gas-db) ────────────────
// POST /api/finance/customers/create
router.post('/create', requireAuth, async (req, res) => {
  const {
    company_name, first_name, last_name, name2, name3, billing_street, billing_zip, billing_city,
    billing_country, phone, email, invoice_email,
    ser_kategorie, info_sped,
    pfjn, mwstkz, belegart,
  } = req.body;

  const name = (company_name && company_name.trim())
    || `${(last_name || '').trim()} ${(first_name || '').trim()}`.trim();

  if (!name || !billing_street || !billing_zip || !billing_city) {
    return res.status(400).json({ error: 'Firma oder Vorname/Nachname sowie Straße, PLZ und Ort sind Pflichtfelder' });
  }
  // Rechnungsadresse: optional, geht nur nach Lexware (nicht SER)
  const invoiceEmail = typeof invoice_email === 'string' ? (invoice_email.trim() || null) : null;
  if (invoiceEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(invoiceEmail)) {
    return res.status(400).json({ error: 'E-Mail für Rechnungen ist ungültig' });
  }

  // Kundennummer atomar aus Portal-Sequenz vergeben
  let customer_number;
  try {
    await getPool().execute('UPDATE customer_number_seq SET last_number = last_number + 1 WHERE id = 1');
    const [numRows] = await getPool().execute('SELECT last_number FROM customer_number_seq WHERE id = 1');
    customer_number = String(numRows[0].last_number);
    console.log('[Finance/Customers] Kundennummer vergeben:', customer_number);
  } catch (seqErr) {
    console.error('[Finance/Customers] Sequenz-Fehler:', seqErr.message);
    return res.status(500).json({ error: 'Kundennummer konnte nicht vergeben werden: ' + seqErr.message });
  }

  // created_by nur setzen wenn echte UUID
  const rawId = req.session?.user?.id;
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const employeeId = rawId && uuidRegex.test(String(rawId)) ? rawId : null;

  try {
    const result = await gasPool.query(
      `INSERT INTO customers
         (name, name2, name3, company_name, first_name, last_name,
          billing_street, billing_zip, billing_city, billing_country,
          phone, email, customer_number, ser_kategorie, info_sped,
          source, in_ser_fvk, in_lexware, created_by, invoice_email)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,'manual',false,false,$16,$17)
       RETURNING id, name, customer_number`,
      [
        name, name2 || null, name3 || null,
        company_name || null, first_name || null, last_name || null,
        billing_street, billing_zip, billing_city,
        billing_country || 'DE',
        phone || null, email || null,
        customer_number,
        ser_kategorie || 'F',
        info_sped || null,
        employeeId,
        invoiceEmail,
      ]
    );
    const newCustomer = result.rows[0];
    console.log('[Finance/Customers] Neuer Kunde angelegt:', newCustomer.id, newCustomer.name, newCustomer.customer_number);
    if (pfjn !== undefined || mwstkz !== undefined || belegart !== undefined) {
      await gasPool.query(
        'UPDATE customers SET ser_raw_data = $1 WHERE id = $2',
        [JSON.stringify({ pfjn: pfjn ?? true, mwstkz: mwstkz ?? true, belegart: belegart || 'L' }), newCustomer.id]
      );
    }
    res.status(201).json({ success: true, id: newCustomer.id, name: newCustomer.name, customer_number: newCustomer.customer_number });
  } catch (err) {
    console.error('[Finance/Customers] create error:', err.message);
    res.status(500).json({ error: 'Fehler beim Anlegen: ' + err.message });
  }
});

// ─── F11: SER Push (STMUPD) ─────────────────────────────────────
// POST /api/finance/customers/:id/push-ser
const { pushCustomerToSer } = require('../../../services/ser-customer-push');
router.post('/:id/push-ser', requireAuth, async (req, res) => {
  try {
    const result = await pushCustomerToSer(req.params.id, req.body);
    res.json({ success: true, ...result });
  } catch (err) {
    console.error('[Finance/Customers] push-ser error:', err.message);
    if (err.statusCode === 404 || err.statusCode === 400) {
      return res.status(err.statusCode).json({ error: err.message });
    }
    res.status(500).json({ error: 'SER Push fehlgeschlagen: ' + err.message });
  }
});


// ─── F12: Lexware-Import ────────────────────────────────────────
// POST /api/finance/customers/import-from-lexware
router.post('/import-from-lexware', requireAuth, async (req, res) => {
  try {
    const upstream = await shopFetch('/admin/customers/import-from-lexware', { method: 'POST', body: JSON.stringify(req.body) });
    const data = await upstream.json();
    res.status(upstream.status).json(data);
  } catch(err) { res.status(500).json({ error: 'Shop-API nicht erreichbar' }); }
});

// GET /api/finance/customers/import-from-lexware/:jobId/status
router.get('/import-from-lexware/:jobId/status', async (req, res) => {
  try {
    const upstream = await shopFetch('/admin/customers/import-from-lexware/' + req.params.jobId + '/status');
    const data = await upstream.json();
    res.status(upstream.status).json(data);
  } catch(err) { res.status(500).json({ error: 'Shop-API nicht erreichbar' }); }
});

// POST /api/finance/customers/import-from-lexware/resolve
router.post('/import-from-lexware/resolve', requireAuth, async (req, res) => {
  try {
    const upstream = await shopFetch('/admin/customers/import-from-lexware/resolve', { method: 'POST', body: JSON.stringify(req.body) });
    const data = await upstream.json();
    res.status(upstream.status).json(data);
  } catch(err) { res.status(500).json({ error: 'Shop-API nicht erreichbar' }); }
});

module.exports = router;
