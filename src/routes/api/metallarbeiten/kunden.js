const express = require('express');
const router = express.Router();
const requireAuth = require('../../../middleware/requireAuth');
const requireArea = require('../../../middleware/requireArea');
const db = require('../../../db');
const lexware = require('../../../services/lexware');
const metallKunde = require('../../../services/metallKunde');
const metallKonto = require('../../../services/metallKonto');
const { shopFetch } = require('../finance/shopClient');
const path = require('path');
const { generateZugangsbrief } = require('../../../utils/generateZugangsbrief');

const BRIEFPAPIER = path.join(__dirname, '../../../assets/lieferantenauftrag-briefpapier.pdf');

// Metallkunden-Merker (#366), Uebersicht mit Portalzugang (#369; Konten in der gas-db ueber die Gas-Shop-Admin-API).
const GATE = requireArea('metallarbeiten.kunden');

// Lokal, wie in lieferantenauftraege.js — keine geteilte Utility im Projekt
async function getEmployeeId(authentikUid) {
  const [rows] = await db.getPool().execute('SELECT id FROM employees WHERE authentik_uid = ?', [authentikUid]);
  return rows[0]?.id ?? null;
}

function deps() {
  return { pool: db.getPool(), lexware };
}

// Lexware-Fehler als 502 (bzw. 503 ohne Schluessel), eigene 400er durchreichen
function sendeFehler(res, err, was) {
  if ([400, 404, 409].includes(err.status)) return res.status(err.status).json({ error: err.message });
  if (err.name === 'ShopError') {
    console.error(`${was}:`, err.message);
    return res.status(err.status).json({ error: 'Gas-Shop (Kundenkonten) derzeit nicht erreichbar', detail: err.message });
  }
  if (err.name === 'LexwareError') {
    console.error(`${was}:`, err.message);
    return res.status(err.status === 0 ? 503 : 502).json({ error: 'Lexware derzeit nicht erreichbar', detail: err.message });
  }
  console.error(`${was}:`, err);
  return res.status(500).json({ error: `${was} fehlgeschlagen` });
}

// Aktive Metallkunden mit Portalzugang, laufenden Vorgaengen und offenen Belegen
router.get('/', requireAuth, GATE, async (req, res) => {
  try {
    res.json(await metallKonto.ladeUebersicht({ pool: db.getPool(), fetcher: shopFetch }));
  } catch (err) {
    sendeFehler(res, err, 'MB-Kunden laden');
  }
});

// Lexware-Kunden suchen, mit Hinweis, ob schon Metallkunde
router.get('/suche', requireAuth, GATE, async (req, res) => {
  try {
    const treffer = await lexware.searchContacts(req.query.q);
    const ids = treffer.map(c => c.id);
    const aktiv = new Set();
    if (ids.length) {
      const [rows] = await db.getPool().query(
        'SELECT lexware_kontakt_id FROM metall_kunde WHERE aktiv = 1 AND lexware_kontakt_id IN (?)', [ids]
      );
      rows.forEach(r => aktiv.add(r.lexware_kontakt_id));
    }
    // Gaskunden kennzeichnen (Kontakte aus der gas-db erscheinen nur ueber die Suche); ohne Gas-Shop ohne Kennzeichen
    const konten = await metallKonto.ladeKonten(shopFetch, ids).catch(() => new Map());
    res.json(treffer.map(c => ({
      lexware_kontakt_id: c.id,
      name: metallKunde.kontaktName(c),
      kdnr: metallKunde.kontaktKdnr(c),
      ist_metallkunde: aktiv.has(c.id),
      gaskunde: !!konten.get(c.id)?.gas,
    })));
  } catch (err) {
    sendeFehler(res, err, 'Kundensuche');
  }
});

// Merker setzen (legt an oder aktiviert wieder) und METALL in die Lexware-Notiz
router.post('/', requireAuth, GATE, async (req, res) => {
  const { lexware_kontakt_id } = req.body || {};
  if (!lexware_kontakt_id) return res.status(400).json({ error: 'lexware_kontakt_id fehlt' });
  try {
    const employeeId = await getEmployeeId(req.session.user.authentikUid);
    const kunde = await metallKunde.setzeMerker(deps(), { lexwareKontaktId: lexware_kontakt_id, employeeId });
    res.status(201).json(kunde);
  } catch (err) {
    sendeFehler(res, err, 'MB-Kunde setzen');
  }
});

// Notiz erneut schreiben, z. B. nach notiz_status = 'fehler'
router.post('/:id/notiz', requireAuth, GATE, async (req, res) => {
  const [[kunde]] = await db.getPool().execute('SELECT * FROM metall_kunde WHERE id = ?', [req.params.id]);
  if (!kunde) return res.status(404).json({ error: 'Nicht gefunden' });
  const notiz = await metallKunde.schreibeNotiz(deps(), kunde);
  res.json({ ...kunde, ...notiz });
});

// Kundenmails (#377) für diesen Metallkunden an/aus: { an: true|false }
router.put('/:id/kundenmails', requireAuth, GATE, async (req, res) => {
  if (typeof req.body?.an !== 'boolean') return res.status(400).json({ error: 'an muss true oder false sein' });
  const [r] = await db.getPool().execute('UPDATE metall_kunde SET kundenmails = ? WHERE id = ?', [req.body.an ? 1 : 0, req.params.id]);
  if (!r.affectedRows) return res.status(404).json({ error: 'Nicht gefunden' });
  res.json({ id: Number(req.params.id), kundenmails: req.body.an });
});

// Merker entfernen: nur aktiv = 0, METALL bleibt in der Lexware-Notiz stehen
router.delete('/:id', requireAuth, GATE, async (req, res) => {
  const ok = await metallKunde.entferneMerker(deps(), req.params.id);
  if (!ok) return res.status(404).json({ error: 'Nicht gefunden' });
  res.json({ ok: true });
});

// ── Portalzugang (#369) ──

async function ladeKunde(id) {
  const [[kunde]] = await db.getPool().execute('SELECT * FROM metall_kunde WHERE id = ? AND aktiv = 1', [id]);
  if (!kunde) {
    const err = new Error('MB-Kunde nicht gefunden');
    err.status = 404;
    throw err;
  }
  return kunde;
}

// Aktion am Konto des Metallkunden (ueber dessen Lexware-Kontakt-ID)
const konto = (was, fn) => async (req, res) => {
  try {
    const kunde = await ladeKunde(req.params.id);
    res.json(await fn(shopFetch, kunde.lexware_kontakt_id));
  } catch (err) {
    sendeFehler(res, err, was);
  }
};

router.post('/:id/zugang', requireAuth, GATE, konto('Zugang anlegen', metallKonto.legeAn));
router.post('/:id/sperren', requireAuth, GATE, konto('Sperren', metallKonto.sperre));
router.post('/:id/entsperren', requireAuth, GATE, konto('Entsperren', metallKonto.entsperre));
router.post('/:id/reset-mail', requireAuth, GATE, konto('Reset-Mail', metallKonto.sendeReset));

// Zugangsbrief als PDF
router.get('/:id/zugangsbrief.pdf', requireAuth, GATE, async (req, res) => {
  try {
    const kunde = await ladeKunde(req.params.id);
    const daten = await metallKonto.briefDaten(shopFetch, kunde.lexware_kontakt_id);
    const pdf = await generateZugangsbrief({ daten, templatePath: BRIEFPAPIER });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="Zugangsbrief-${String(daten.kundennummer || kunde.id).replace(/[^\w-]/g, '')}.pdf"`);
    res.send(Buffer.from(pdf));
  } catch (err) {
    sendeFehler(res, err, 'Zugangsbrief');
  }
});

module.exports = router;
