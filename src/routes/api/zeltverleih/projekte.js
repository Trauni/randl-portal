// src/routes/api/zeltverleih/projekte.js
// Zeltprojekte aus Rentman, nur lesend (#461).
// Eigener Mount in server.js mit requireArea('zeltverleih.projekte'), VOR
// /api/zeltverleih (dort greift sonst der Guard 'zeltplanung').

const express = require('express');
const router = express.Router();
const { zeltProjekte, projektMaterial, projektTypen, ZELT_TYPEN } = require('../../../services/rentman');

const DATUM = /^\d{4}-\d{2}-\d{2}$/;

// GET /api/zeltverleih/projekte?von=YYYY-MM-DD&bis=YYYY-MM-DD&typen=104,107&annulliert=1
router.get('/', async (req, res) => {
  const { von, bis } = req.query;
  if ((von && !DATUM.test(von)) || (bis && !DATUM.test(bis))) {
    return res.status(400).json({ error: 'Datum bitte als JJJJ-MM-TT.' });
  }
  if (von && bis && von > bis) {
    return res.status(400).json({ error: '„Von“ liegt nach „Bis“.' });
  }
  const typen = req.query.typen
    ? String(req.query.typen).split(',').map(Number).filter(Number.isFinite)
    : ZELT_TYPEN;
  try {
    const projekte = await zeltProjekte({ von, bis, typen, mitAnnulliert: req.query.annulliert === '1' });
    res.json({ von: von || null, bis: bis || null, typen, projekte });
  } catch (err) {
    console.error('[zeltverleih/projekte] Liste fehlgeschlagen:', err.message);
    res.status(502).json({ error: 'Rentman ist gerade nicht erreichbar.' });
  }
});

// GET /api/zeltverleih/projekte/typen
router.get('/typen', async (req, res) => {
  try {
    res.json({ typen: await projektTypen() });
  } catch (err) {
    console.error('[zeltverleih/projekte] Typen fehlgeschlagen:', err.message);
    res.status(502).json({ error: 'Rentman ist gerade nicht erreichbar.' });
  }
});

// GET /api/zeltverleih/projekte/:subprojektId/material
router.get('/:id/material', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'Ungültige Projekt-ID.' });
  try {
    res.json({ material: await projektMaterial(id) });
  } catch (err) {
    console.error('[zeltverleih/projekte] Material fehlgeschlagen:', err.message);
    res.status(502).json({ error: 'Rentman ist gerade nicht erreichbar.' });
  }
});

module.exports = router;
