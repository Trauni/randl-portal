const express = require('express');
const router = express.Router();
const requireAuth = require('../../../middleware/requireAuth');
const requireArea = require('../../../middleware/requireArea');
const db = require('../../../db');
const lexware = require('../../../services/lexware');
const metallKunde = require('../../../services/metallKunde');

// Metallkunden-Merker (#366). Die Uebersicht mit Portalstatus kommt mit #369.
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
  if (err.status === 400) return res.status(400).json({ error: err.message });
  if (err.name === 'LexwareError') {
    console.error(`${was}:`, err.message);
    return res.status(err.status === 0 ? 503 : 502).json({ error: 'Lexware derzeit nicht erreichbar', detail: err.message });
  }
  console.error(`${was}:`, err);
  return res.status(500).json({ error: `${was} fehlgeschlagen` });
}

// Aktive Metallkunden
router.get('/', requireAuth, GATE, async (req, res) => {
  const [rows] = await db.getPool().execute('SELECT * FROM metall_kunde WHERE aktiv = 1 ORDER BY name');
  res.json(rows);
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
    res.json(treffer.map(c => ({
      lexware_kontakt_id: c.id,
      name: metallKunde.kontaktName(c),
      kdnr: metallKunde.kontaktKdnr(c),
      ist_metallkunde: aktiv.has(c.id),
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
    sendeFehler(res, err, 'Metallkunde setzen');
  }
});

// Notiz erneut schreiben, z. B. nach notiz_status = 'fehler'
router.post('/:id/notiz', requireAuth, GATE, async (req, res) => {
  const [[kunde]] = await db.getPool().execute('SELECT * FROM metall_kunde WHERE id = ?', [req.params.id]);
  if (!kunde) return res.status(404).json({ error: 'Nicht gefunden' });
  const notiz = await metallKunde.schreibeNotiz(deps(), kunde);
  res.json({ ...kunde, ...notiz });
});

// Merker entfernen: nur aktiv = 0, METALL bleibt in der Lexware-Notiz stehen
router.delete('/:id', requireAuth, GATE, async (req, res) => {
  const ok = await metallKunde.entferneMerker(deps(), req.params.id);
  if (!ok) return res.status(404).json({ error: 'Nicht gefunden' });
  res.json({ ok: true });
});

module.exports = router;
