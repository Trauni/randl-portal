const express = require('express');
const router = express.Router();
const requireAuth = require('../../../middleware/requireAuth');
const requireArea = require('../../../middleware/requireArea');
const db = require('../../../db');
const eingang = require('../../../services/metallEingang');

// „Eingang“ (#371): Anfragen, Nachbestellungen, Annahmen und Freischaltungen aus dem Kundenbereich
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

router.get('/', requireAuth, GATE, async (req, res) => {
  try { res.json(await eingang.ladeListe(db.getPool())); } catch (err) { sendeFehler(res, err, 'Eingang laden'); }
});

// Zahl fuer die Sidebar
router.get('/anzahl', requireAuth, GATE, async (req, res) => {
  try { res.json({ neu: await eingang.zaehleNeue(db.getPool()) }); } catch (err) { sendeFehler(res, err, 'Eingang zählen'); }
});

function status(neuerStatus, was) {
  return async (req, res) => {
    try {
      const employeeId = await getEmployeeId(req.session.user.authentikUid);
      res.json(await eingang.setzeStatus(db.getPool(), req.params.id, neuerStatus, { employeeId }));
    } catch (err) {
      sendeFehler(res, err, was);
    }
  };
}

router.post('/:id/erledigt', requireAuth, GATE, status('erledigt', 'Erledigt'));
router.post('/:id/abgelehnt', requireAuth, GATE, status('abgelehnt', 'Ablehnen'));
router.post('/:id/zurueckholen', requireAuth, GATE, status('neu', 'Zurückholen'));

module.exports = router;
