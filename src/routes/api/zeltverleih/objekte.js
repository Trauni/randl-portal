// src/routes/api/zeltverleih/objekte.js
// Objektkatalog für den Zeltplaner. Mount (mit Guard) in server.js, siehe server.js.snippet.txt.
//
// Update 14.08.2026: POST akzeptiert jetzt auch kategorie (bestuhlung/technik/eigene, nicht
// mehr fest 'eigene') und optionale kern_laenge/kern_tiefe/kern_d. Neu: PUT zum Bearbeiten
// bestehender Objekte — auch der zehn Grundobjekte, nicht nur eigener. Zugriff bewusst
// identisch zu allen anderen Zeltverleih-Routen (requireArea('zeltplanung') in server.js,
// keine eigene, engere Berechtigung).

const express = require('express');
const router = express.Router();
const { getPool } = require('../../../db');

const KATEGORIEN = ['bestuhlung', 'technik', 'eigene'];

// Kern-Logik 1:1 aus addCustom() in zeltplaner.html: bei "runde Darstellung" ohne
// explizit gesetzten Kern-Durchmesser automatisch min(laenge, tiefe) * 0.8. Ist rund
// NICHT gesetzt, sind die eckigen Kern-Felder maßgeblich (oder leer = einfaches Inset).
function resolveKern({ rund, laenge, tiefe, kern_d, kern_laenge, kern_tiefe }) {
  if (rund) {
    const d = kern_d ?? Math.round(Math.min(laenge, tiefe) * 0.8 * 100) / 100;
    return { kernD: d, kernL: null, kernT: null };
  }
  return { kernD: null, kernL: kern_laenge ?? null, kernT: kern_tiefe ?? null };
}

// GET /api/zeltverleih/objekte — aktiver Katalog (Grundbestand + eigene)
router.get('/', async (req, res) => {
  try {
    const pool = getPool();
    const [rows] = await pool.execute(
      `SELECT id, slug, name, kategorie, laenge, tiefe, personen, sitzplatz, rund, farbe,
              kern_laenge, kern_tiefe, kern_d
       FROM zelt_objekte
       WHERE aktiv = 1
       ORDER BY FIELD(kategorie, 'bestuhlung', 'technik', 'eigene'), name`
    );
    res.json(rows);
  } catch (err) {
    console.error('[zeltverleih/objekte] GET fehlgeschlagen:', err);
    res.status(500).json({ error: 'Katalog konnte nicht geladen werden.' });
  }
});

// POST /api/zeltverleih/objekte — neues Objekt anlegen (beliebige Kategorie)
router.post('/', async (req, res) => {
  const { slug, name, kategorie, laenge, tiefe, personen, sitzplatz, rund, farbe, kern_d, kern_laenge, kern_tiefe } = req.body;

  if (!slug || !name || laenge == null || tiefe == null) {
    return res.status(400).json({ error: 'slug, name, laenge und tiefe sind Pflichtfelder.' });
  }
  const kategorieValue = KATEGORIEN.includes(kategorie) ? kategorie : 'eigene';
  // ⚠️ 0 ist in JavaScript falsy (Fallstrick aus der Doku) — bewusst !== null/undefined prüfen,
  // sonst verschwindet z. B. ein Objekt mit 0 Personen (z. B. reine Deko-Objekte).
  const personenValue = personen !== null && personen !== undefined ? personen : 0;
  const { kernD, kernL, kernT } = resolveKern({ rund, laenge, tiefe, kern_d, kern_laenge, kern_tiefe });

  try {
    const pool = getPool();
    const [result] = await pool.execute(
      `INSERT INTO zelt_objekte
         (slug, name, kategorie, laenge, tiefe, personen, sitzplatz, rund, farbe, kern_laenge, kern_tiefe, kern_d)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        slug,
        name,
        kategorieValue,
        laenge,
        tiefe,
        personenValue,
        sitzplatz ? 1 : 0,
        rund ? 1 : 0,
        farbe || '#3f6f8f',
        kernL,
        kernT,
        kernD,
      ]
    );
    res.status(201).json({ id: result.insertId, slug, name, kategorie: kategorieValue, kern_d: kernD, kern_laenge: kernL, kern_tiefe: kernT });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: `slug '${slug}' existiert bereits.` });
    }
    console.error('[zeltverleih/objekte] POST fehlgeschlagen:', err);
    res.status(500).json({ error: 'Objekt konnte nicht angelegt werden.' });
  }
});

// PUT /api/zeltverleih/objekte/:id — bestehendes Objekt bearbeiten (auch Grundbestand).
// slug bleibt unangetastet — Layouts referenzieren Objekte über den Slug, ihn zu ändern
// würde gespeicherte Pläne stillschweigend zerlegen.
router.put('/:id', async (req, res) => {
  const { name, kategorie, laenge, tiefe, personen, sitzplatz, rund, farbe, kern_d, kern_laenge, kern_tiefe } = req.body;

  if (!name || laenge == null || tiefe == null) {
    return res.status(400).json({ error: 'name, laenge und tiefe sind Pflichtfelder.' });
  }
  const kategorieValue = KATEGORIEN.includes(kategorie) ? kategorie : 'eigene';
  const personenValue = personen !== null && personen !== undefined ? personen : 0;
  const { kernD, kernL, kernT } = resolveKern({ rund, laenge, tiefe, kern_d, kern_laenge, kern_tiefe });

  try {
    const pool = getPool();
    const [result] = await pool.execute(
      `UPDATE zelt_objekte
       SET name = ?, kategorie = ?, laenge = ?, tiefe = ?, personen = ?, sitzplatz = ?, rund = ?, farbe = ?,
           kern_laenge = ?, kern_tiefe = ?, kern_d = ?
       WHERE id = ? AND aktiv = 1`,
      [name, kategorieValue, laenge, tiefe, personenValue, sitzplatz ? 1 : 0, rund ? 1 : 0, farbe || '#3f6f8f',
       kernL, kernT, kernD, req.params.id]
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Objekt nicht gefunden oder deaktiviert.' });
    }
    res.json({ id: Number(req.params.id), kategorie: kategorieValue, kern_d: kernD, kern_laenge: kernL, kern_tiefe: kernT });
  } catch (err) {
    console.error('[zeltverleih/objekte] PUT fehlgeschlagen:', err);
    res.status(500).json({ error: 'Objekt konnte nicht aktualisiert werden.' });
  }
});

// DELETE /api/zeltverleih/objekte/:id — deaktivieren, NICHT löschen (Layouts referenzieren es per Slug)
router.delete('/:id', async (req, res) => {
  try {
    const pool = getPool();
    await pool.execute(`UPDATE zelt_objekte SET aktiv = 0 WHERE id = ?`, [req.params.id]);
    res.status(204).end();
  } catch (err) {
    console.error('[zeltverleih/objekte] DELETE fehlgeschlagen:', err);
    res.status(500).json({ error: 'Objekt konnte nicht deaktiviert werden.' });
  }
});

module.exports = router;
