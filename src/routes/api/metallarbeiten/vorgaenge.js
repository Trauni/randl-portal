const express = require('express');
const router = express.Router();
const requireAuth = require('../../../middleware/requireAuth');
const requireArea = require('../../../middleware/requireArea');
const db = require('../../../db');
const lexware = require('../../../services/lexware');
const metallAnlegen = require('../../../services/metallAnlegen');
const metallVorgang = require('../../../services/metallVorgang');
const metallAuftraege = require('../../../services/metallAuftraege');

// Vorgaenge: Alle Auftraege mit Suche/Filter (#367), anlegen (#384), In Lexware anlegen (#365). Detail kommt mit #368.
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

// Alle Auftraege (#367): Suche ?q=, Belegart ?art=AN|AB|LS|RE, Status ?status=laufend|abgeschlossen|abgebrochen
router.get('/', requireAuth, GATE, async (req, res) => {
  try {
    res.json(await metallAuftraege.sucheVorgaenge(db.getPool(), req.query));
  } catch (err) {
    sendeFehler(res, err, 'Vorgänge laden');
  }
});

// Aktive Metallkunden fuer das Formular (eigener Bereich, unabhaengig von metallarbeiten.kunden)
router.get('/kunden', requireAuth, GATE, async (req, res) => {
  const [rows] = await db.getPool().execute('SELECT id, name, kdnr FROM metall_kunde WHERE aktiv = 1 ORDER BY name');
  res.json(rows);
});

// Auswahl fuer das Formular: Angebote und fruehere Vorgaenge eines Kunden
router.get('/auswahl', requireAuth, GATE, async (req, res) => {
  const pool = db.getPool();
  const [[kunde]] = await pool.execute('SELECT id, lexware_kontakt_id FROM metall_kunde WHERE id = ? AND aktiv = 1', [req.query.kunde_id || 0]);
  if (!kunde) return res.status(404).json({ error: 'Metallkunde nicht gefunden' });
  const [angebote] = await pool.execute(
    `SELECT b.id, b.belegnummer, b.belegstatus, b.belegdatum, b.betrag_netto,
            (SELECT COUNT(*) FROM metall_vorgang v WHERE v.angebot_beleg_id = b.id) AS vorgaenge
     FROM metall_beleg b
     WHERE b.lexware_kontakt_id = ? AND b.belegart = 'quotation' AND b.archiviert = 0
       AND b.belegstatus NOT IN ('voided', 'rejected')
     ORDER BY b.belegdatum DESC, b.id DESC LIMIT 50`,
    [kunde.lexware_kontakt_id]
  );
  const [vorgaenge] = await pool.execute(
    `SELECT id, vorgangsnummer, bezeichnung, erstellt_am FROM metall_vorgang
     WHERE kunde_id = ? AND abgebrochen_am IS NULL ORDER BY id DESC LIMIT 50`,
    [kunde.id]
  );
  res.json({ angebote, vorgaenge });
});

// Vorgang anlegen (Buero, Auftrag per Telefon/Mail)
router.post('/', requireAuth, GATE, async (req, res) => {
  const b = req.body || {};
  try {
    const employeeId = await getEmployeeId(req.session.user.authentikUid);
    const vorgang = await metallVorgang.legeVorgangAn(db.getPool(), {
      kundeId: b.kunde_id,
      bezeichnung: b.bezeichnung,
      kundenBestellnr: b.kunden_bestellnr,
      angebotBelegId: b.angebot_beleg_id,
      vorlageVorgangId: b.vorlage_vorgang_id,
      herkunft: 'buero',
    }, { employeeId });
    res.status(201).json(vorgang);
  } catch (err) {
    sendeFehler(res, err, 'Vorgang anlegen');
  }
});

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
