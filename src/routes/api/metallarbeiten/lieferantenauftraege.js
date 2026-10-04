const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const requireAuth = require('../../../middleware/requireAuth');
const requireArea = require('../../../middleware/requireArea');
const db = require('../../../db');
const { generateLieferantenauftrag } = require('../../../utils/generateLieferantenauftrag');

const GATE = requireArea('metallarbeiten.lieferantenauftrag');
const PDF_DIR = '/home/radmin/web/randlweb.de/public_html/portal/storage/lieferantenauftraege';
const TEMPLATE_PATH = path.join(__dirname, '../../../assets/lieferantenauftrag-briefpapier.pdf');

// Lokal, wie in vacation.js — keine geteilte Utility im Projekt
async function getEmployeeId(authentikUid) {
  const [rows] = await db.getPool().execute('SELECT id FROM employees WHERE authentik_uid = ?', [authentikUid]);
  return rows[0]?.id ?? null;
}

router.get('/', requireAuth, GATE, async (req, res) => {
  const [rows] = await db.getPool().execute(
    'SELECT * FROM lieferanten_auftraege ORDER BY erstellt_am DESC'
  );
  res.json(rows);
});

router.get('/:id', requireAuth, GATE, async (req, res) => {
  const [[auftrag]] = await db.getPool().execute(
    'SELECT * FROM lieferanten_auftraege WHERE id = ?', [req.params.id]
  );
  if (!auftrag) return res.status(404).json({ error: 'Nicht gefunden' });
  const [positionen] = await db.getPool().execute(
    'SELECT * FROM lieferanten_auftrag_positionen WHERE auftrag_id = ? ORDER BY position',
    [req.params.id]
  );
  res.json({ ...auftrag, positionen });
});

router.post('/', requireAuth, GATE, async (req, res) => {
  try {
    const empId = await getEmployeeId(req.session.user.authentikUid);
    if (!empId) return res.status(404).json({ error: 'Mitarbeiter nicht gefunden' });

    const { lieferant_lexware_id, lieferant_name, empfaenger_zeilen, kopfhinweis, positionen } = req.body;
    if (!lieferant_lexware_id || !lieferant_name || !positionen?.length) {
      return res.status(400).json({ error: 'Lieferant und mindestens eine Position erforderlich' });
    }
    const pool = db.getPool();

    const [[{ maxNr }]] = await pool.execute(
      "SELECT COALESCE(MAX(CAST(SUBSTRING_INDEX(auftragsnummer, '-', -1) AS UNSIGNED)), 0) AS maxNr " +
      "FROM lieferanten_auftraege WHERE auftragsnummer LIKE ?", [`LA-${new Date().getFullYear()}-%`]
    );
    const auftragsnummer = `LA-${new Date().getFullYear()}-${String(maxNr + 1).padStart(4, '0')}`;

    const [result] = await pool.execute(
      `INSERT INTO lieferanten_auftraege
       (auftragsnummer, lieferant_lexware_id, lieferant_name, kopfhinweis, ersteller_employee_id)
       VALUES (?, ?, ?, ?, ?)`,
      [auftragsnummer, lieferant_lexware_id, lieferant_name, kopfhinweis || null, empId]
    );
    const auftragId = result.insertId;

    for (const [i, pos] of positionen.entries()) {
      await pool.execute(
        'INSERT INTO lieferanten_auftrag_positionen (auftrag_id, position, stueckzahl, bezeichnung, notiz) VALUES (?, ?, ?, ?, ?)',
        [auftragId, i + 1, pos.stueckzahl, pos.bezeichnung, pos.notiz || null]
      );
    }

    const pdfBytes = await generateLieferantenauftrag({
      templatePath: TEMPLATE_PATH,
      auftrag: {
        auftragsnummer,
        datum: new Date().toLocaleDateString('de-DE'),
        empfaengerZeilen: empfaenger_zeilen,
        kopfhinweis,
      },
      positionen,
    });
    fs.mkdirSync(PDF_DIR, { recursive: true });
    const pdfPfad = path.join(PDF_DIR, `${auftragsnummer}.pdf`);
    fs.writeFileSync(pdfPfad, pdfBytes);
    await pool.execute('UPDATE lieferanten_auftraege SET pdf_pfad = ? WHERE id = ?', [pdfPfad, auftragId]);

    res.status(201).json({ id: auftragId, auftragsnummer, pdf_pfad: pdfPfad });
  } catch (err) {
    console.error('Lieferantenauftrag anlegen fehlgeschlagen:', err);
    res.status(500).json({ error: 'Anlegen fehlgeschlagen' });
  }
});

router.patch('/:id/erledigt', requireAuth, GATE, async (req, res) => {
  await db.getPool().execute("UPDATE lieferanten_auftraege SET status = 'erledigt' WHERE id = ?", [req.params.id]);
  res.json({ ok: true });
});

router.patch('/:id/offen', requireAuth, GATE, async (req, res) => {
  await db.getPool().execute("UPDATE lieferanten_auftraege SET status = 'offen' WHERE id = ?", [req.params.id]);
  res.json({ ok: true });
});

router.get('/:id/pdf', requireAuth, GATE, async (req, res) => {
  const [[auftrag]] = await db.getPool().execute(
    'SELECT pdf_pfad FROM lieferanten_auftraege WHERE id = ?', [req.params.id]
  );
  if (!auftrag?.pdf_pfad || !fs.existsSync(auftrag.pdf_pfad)) return res.status(404).end();
  res.sendFile(auftrag.pdf_pfad);
});

module.exports = router;
