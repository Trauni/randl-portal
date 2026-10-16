const express = require('express');
const router = express.Router();
const requireAuth = require('../../../middleware/requireAuth');
const requireArea = require('../../../middleware/requireArea');
const db = require('../../../db');
const z = require('../../../services/metallZuordnen');

// „Belege zuordnen“ (#370): Eingang fuer Belege, die der Sync nicht sicher zuordnen konnte
const GATE = requireArea('metallarbeiten.vorgaenge');

// Lokal, wie in kunden.js — keine geteilte Utility im Projekt
async function getEmployeeId(authentikUid) {
  const [rows] = await db.getPool().execute('SELECT id FROM employees WHERE authentik_uid = ?', [authentikUid]);
  return rows[0]?.id ?? null;
}

function sendeFehler(res, err, was) {
  if ([400, 404, 409].includes(err.status)) return res.status(err.status).json({ error: err.message });
  console.error(`${was}:`, err);
  return res.status(500).json({ error: `${was} fehlgeschlagen` });
}

// Eingang: offene Belege mit Vorschlag und Grund, Hinweis doppelte AB, zuletzt ignorierte
router.get('/', requireAuth, GATE, async (req, res) => {
  const pool = db.getPool();
  const [offen, doppelt, ignoriert] = await Promise.all([z.ladeOffene(pool), z.ladeDoppelteAbAlle(pool), z.ladeIgnorierte(pool)]);
  res.json({ offen, doppelt, ignoriert });
});

// Zahl fuer die Sidebar
router.get('/anzahl', requireAuth, GATE, async (req, res) => {
  res.json({ offen: await z.zaehleOffene(db.getPool()) });
});

// Aktion mit Mitarbeiter-ID ausfuehren und Ergebnis bzw. Fehler senden
function aktion(was, fn) {
  return async (req, res) => {
    try {
      const employeeId = await getEmployeeId(req.session.user.authentikUid);
      res.json(await fn(db.getPool(), req, { employeeId }));
    } catch (err) {
      sendeFehler(res, err, was);
    }
  };
}

router.post('/:id/zuordnen', requireAuth, GATE,
  aktion('Zuordnen', (pool, req, opt) => z.ordneZu(pool, req.params.id, req.body?.vorgang_id, opt)));

router.post('/:id/neuer-vorgang', requireAuth, GATE,
  aktion('Neuer Vorgang', (pool, req, opt) => z.neuerVorgangAusBeleg(pool, req.params.id, {
    bezeichnung: req.body?.bezeichnung, kundenBestellnr: req.body?.kunden_bestellnr,
  }, opt)));

router.post('/:id/ignorieren', requireAuth, GATE,
  aktion('Ignorieren', (pool, req, opt) => z.ignoriere(pool, req.params.id, opt)));

router.post('/:id/zurueckholen', requireAuth, GATE,
  aktion('Zurückholen', (pool, req) => z.holeZurueck(pool, req.params.id)));

module.exports = router;
