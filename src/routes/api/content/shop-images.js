// /home/radmin/web/randlweb.de/public_html/portal/src/routes/api/content/shop-images.js
// Phase 5: Bildverwaltung für Webshop (Kategorien + Produkte)

const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const requireAuth = require('../../../middleware/requireAuth');

// Pfade auf dem Server
const CAT_DIR = '/srv/docker/gas-webshop/frontend/public';
const PRODUCTS_DIR = '/srv/docker/gas-webshop/frontend/public/products';

// Sicherstellen dass products/ existiert
if (!fs.existsSync(PRODUCTS_DIR)) {
  fs.mkdirSync(PRODUCTS_DIR, { recursive: true });
}

// Gültige Kategorie-IDs
const VALID_CAT_IDS = ['ALLE', 'HEIZUNG', 'CAMPING', 'GASTRO', 'TECHNIK'];

// Multer: In-Memory speichern, dann selbst schreiben
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB max
  fileFilter: (req, file, cb) => {
    const allowed = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Nur JPEG, PNG oder WebP erlaubt'), false);
    }
  }
});

// ──────────────────────────────────────────────
// GET /api/shop-images/list
// Gibt alle Bilder beider Ordner zurück
// ──────────────────────────────────────────────
router.get('/list', requireAuth, (req, res) => {
  try {
    // Kategorie-Bilder: cat-{ID}.jpg
    const categories = VALID_CAT_IDS.map(id => {
      const filePath = path.join(CAT_DIR, `cat-${id}.jpg`);
      const exists = fs.existsSync(filePath);
      let size = null;
      let mtime = null;
      if (exists) {
        const stat = fs.statSync(filePath);
        size = stat.size;
        mtime = stat.mtime;
      }
      return { id, filename: `cat-${id}.jpg`, exists, size, mtime };
    });

    // Produktbilder: products/*.jpg
    let products = [];
    if (fs.existsSync(PRODUCTS_DIR)) {
      products = fs.readdirSync(PRODUCTS_DIR)
        .filter(f => /\.(jpg|jpeg|png|webp)$/i.test(f))
        .map(f => {
          const stat = fs.statSync(path.join(PRODUCTS_DIR, f));
          return {
            filename: f,
            artikelnr: f.replace(/\.(jpg|jpeg|png|webp)$/i, ''),
            size: stat.size,
            mtime: stat.mtime
          };
        })
        .sort((a, b) => a.filename.localeCompare(b.filename));
    }

    res.json({ categories, products });
  } catch (err) {
    console.error('[shop-images] list error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ──────────────────────────────────────────────
// POST /api/shop-images/upload
// multipart/form-data: type ('category'|'product'), id, file
// ──────────────────────────────────────────────
router.post('/upload', requireAuth, upload.single('file'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Keine Datei übermittelt' });
    }

    const { type, id } = req.body;

    if (type === 'category') {
      // Kategoriebild: cat-{ID}.jpg
      if (!id || !VALID_CAT_IDS.includes(id.toUpperCase())) {
        return res.status(400).json({ error: `Ungültige Kategorie-ID. Erlaubt: ${VALID_CAT_IDS.join(', ')}` });
      }
      const filename = `cat-${id.toUpperCase()}.jpg`;
      const dest = path.join(CAT_DIR, filename);
      fs.writeFileSync(dest, req.file.buffer);
      console.log(`[shop-images] Kategoriebild gespeichert: ${dest} (${req.file.size} bytes)`);
      syncToContainer(dest, `/usr/share/nginx/html/${filename}`);
      return res.json({ ok: true, filename, path: `/public/${filename}` });

    } else if (type === 'product') {
      // Produktbild: products/{artikelnr}.jpg
      if (!id || !/^[a-zA-Z0-9\-_.]+$/.test(id)) {
        return res.status(400).json({ error: 'Ungültige Artikelnummer (nur Buchstaben, Zahlen, - _ . erlaubt)' });
      }
      const filename = `${id}.jpg`;
      const dest = path.join(PRODUCTS_DIR, filename);
      fs.writeFileSync(dest, req.file.buffer);
      console.log(`[shop-images] Produktbild gespeichert: ${dest} (${req.file.size} bytes)`);
      syncToContainer(dest, `/usr/share/nginx/html/products/${filename}`);
      return res.json({ ok: true, filename, path: `/public/products/${filename}` });

    } else {
      return res.status(400).json({ error: 'Ungültiger type. Erlaubt: category, product' });
    }
  } catch (err) {
    console.error('[shop-images] upload error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ──────────────────────────────────────────────
// DELETE /api/shop-images/:type/:filename
// type: 'category' | 'product'
// ──────────────────────────────────────────────
router.delete('/:type/:filename', requireAuth, (req, res) => {
  try {
    const { type, filename } = req.params;

    // Sicherheit: keine Pfad-Traversal
    if (filename.includes('..') || filename.includes('/')) {
      return res.status(400).json({ error: 'Ungültiger Dateiname' });
    }

    let filePath;
    if (type === 'category') {
      // Nur cat-*.jpg darf gelöscht werden
      if (!/^cat-[A-Z]+\.(jpg|jpeg|png|webp)$/i.test(filename)) {
        return res.status(400).json({ error: 'Nur cat-*.jpg Dateien löschbar' });
      }
      filePath = path.join(CAT_DIR, filename);
    } else if (type === 'product') {
      filePath = path.join(PRODUCTS_DIR, filename);
    } else {
      return res.status(400).json({ error: 'Ungültiger type' });
    }

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Datei nicht gefunden' });
    }

    fs.unlinkSync(filePath);
    console.log(`[shop-images] Gelöscht: ${filePath}`);
    res.json({ ok: true });
  } catch (err) {
    console.error('[shop-images] delete error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

// ──────────────────────────────────────────────
// Hilfsfunktion: Datei nach docker cp in Container synchronisieren
// ──────────────────────────────────────────────
function syncToContainer(hostPath, containerPath) {
  const { exec } = require('child_process');
  exec(`docker cp "${hostPath}" "gas-webshop-frontend:${containerPath}"`, (err) => {
    if (err) console.error('[shop-images] docker cp Fehler:', err.message);
    else console.log('[shop-images] docker cp OK:', containerPath);
  });
}
