const express = require('express');
const router = express.Router();
const requireAuth = require('../../../middleware/requireAuth');
const requireArea = require('../../../middleware/requireArea');
const db = require('../../../db');
const lexware = require('../../../services/lexware');
const metallAnlegen = require('../../../services/metallAnlegen');

// Vorgaenge (#365). Anlegen im Portal (POST /) kommt mit #384, die Ansichten mit #367/#368.
const GATE = requireArea('metallarbeiten.vorgaenge');

// Lokal, wie in kunden.js — keine geteilte Utility im Projekt
async function getEmployeeId(authentikUid) {
  const [rows] = await db.getPool().execute('SELECT id FROM employees WHERE authentik_uid = ?', [authentikUid]);
  return rows[0]?.id ?? null;
}

// Eigene Fehler (400/404/409) durchreichen, Lexware-Fehler als 502 (bzw. 503 ohne Schluessel)
function sendeFehler(res, err, was) {
  if (err.name === 'LexwareError') {
    console.error(`${was}:`, err.message);
    return res.status(err.status === 0 ? 503 : 502).json({ error: 'Lexware hat den Beleg nicht angenommen', detail: err.message });
  }
  if ([400, 404, 409].includes(err.status)) return res.status(err.status).json({ error: err.message });
  console.error(`${was}:`, err);
  return res.status(500).json({ error: `${was} fehlgeschlagen` });
}

// „In Lexware anlegen“: Entwurf (Angebot oder AB) anlegen und dem Vorgang zuordnen
router.post('/:id/lexware', requireAuth, GATE, async (req, res) => {
  const { art } = req.body || {};
  try {
    const employeeId = await getEmployeeId(req.session.user.authentikUid);
    const beleg = await metallAnlegen.inLexwareAnlegen({ pool: db.getPool(), lexware }, req.params.id, { art, employeeId });
    res.status(201).json(beleg);
  } catch (err) {
    sendeFehler(res, err, 'In Lexware anlegen');
  }
});

module.exports = router;
