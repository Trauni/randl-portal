'use strict';
const router = require('express').Router();
const fs     = require('fs');
const path   = require('path');
const multer = require('multer');
const sharp  = require('sharp');

const PUBLIC_ROOT = '/home/radmin/web/randl.group/public_html';
const SITE_URL    = 'https://randl.group';
const BACKUP_DIR  = path.join(__dirname, '../../../../../cms-backups/bilder');

const IMG_TARGETS = [
  // ── Landingpage randl.group (Karten-Bilder) ────────────────────
  { id:'zelt',   label:'Zeltverleih',    file:'zelt/zelt.webp',     group:'landingpage' },
  { id:'metall', label:'Metallarbeiten', file:'metall/metall.webp', group:'landingpage' },
  { id:'gas',    label:'Gashandel',      file:'gas/gas.webp',       group:'landingpage' },
  // ── Zeltverleih-Unterseite (randl.group/zelt/) ─────────────────
  { id:'zelt-hero',              label:'Hero-Bild',              file:'zelt/hero.webp',                group:'zelt' },
  { id:'zelt-galerie-galazelt',  label:'Galerie: Galazelt',      file:'zelt/galerie-galazelt.webp',    group:'zelt' },
  { id:'zelt-galerie-weinzelt',  label:'Galerie: Weinzelt',      file:'zelt/galerie-weinzelt.webp',    group:'zelt' },
  { id:'zelt-galerie-boden',     label:'Galerie: Systemboden',   file:'zelt/galerie-systemboden.webp', group:'zelt' },
  { id:'zelt-galerie-fotobox',   label:'Galerie: Fotobox',       file:'zelt/galerie-fotobox.webp',     group:'zelt' },
  { id:'zelt-galerie-led',       label:'Galerie: LED-Strahler',  file:'zelt/galerie-led.webp',         group:'zelt' },
  { id:'zelt-produkt-galazelt',  label:'Produkt: Galazelt 6m',   file:'zelt/produkt-galazelt.webp',    group:'zelt' },
  { id:'zelt-produkt-weinzelt',  label:'Produkt: Weinzelt 12m',  file:'zelt/produkt-weinzelt.webp',    group:'zelt' },
  { id:'zelt-produkt-boden',     label:'Produkt: Systemboden',   file:'zelt/produkt-systemboden.webp', group:'zelt' },
  // ── Gashandel-Unterseite (randl.group/gas/) ─────────────────────
  { id:'gas-hero',              label:'Hero-Bild',            file:'gas/hero.webp',               group:'gas' },
  { id:'gas-partner-widmann',   label:'Partner: Widmann',     file:'gas/partner-widmann.webp',    group:'gas' },
  { id:'gas-partner-tyczka',    label:'Partner: Tyczka',      file:'gas/partner-tyczka.webp',     group:'gas' },
  { id:'gas-partner-campingaz', label:'Partner: CampingGaz',  file:'gas/partner-campingaz.webp',  group:'gas' },
  // ── Metallarbeiten-Unterseite (randl.group/metall/) ─────────────
  { id:'metall-hero',           label:'Hero-Bild',              file:'metall/hero.webp',            group:'metall' },
  { id:'metall-maschine-dmu60', label:'Maschine: DMU 60',       file:'metall/maschine-dmu60.webp',  group:'metall' },
  { id:'metall-maschine-mazak', label:'Maschine: Mazak Nexus',  file:'metall/maschine-mazak.webp',  group:'metall' },
  { id:'metall-maschine-hurco', label:'Maschine: Hurco VMX42T', file:'metall/maschine-hurco.webp',  group:'metall' },
  // ── Fotobox-Unterseite (randl.group/fotobox/) ───────────────────
  { id:'fotobox-hero',       label:'Hero-Bild',           file:'fotobox/hero.webp',       group:'fotobox' },
  { id:'fotobox-foto-01',    label:'Slider Foto 1',       file:'fotobox/foto-01.webp',    group:'fotobox' },
  { id:'fotobox-foto-02',    label:'Slider Foto 2',       file:'fotobox/foto-02.webp',    group:'fotobox' },
  { id:'fotobox-foto-03',    label:'Slider Foto 3',       file:'fotobox/foto-03.webp',    group:'fotobox' },
  { id:'fotobox-setup',      label:'Zubehör: Setup',      file:'fotobox/setup.webp',      group:'fotobox' },
  { id:'fotobox-requisiten', label:'Zubehör: Requisiten', file:'fotobox/requisiten.webp', group:'fotobox' },
];

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 30 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ok = /jpeg|jpg|png|webp|heic|heif/i.test(file.mimetype) ||
               /\.(jpe?g|png|webp|heic|heif)$/i.test(file.originalname);
    cb(ok ? null : new Error('Nur JPEG/PNG/WebP/HEIC erlaubt'), ok);
  },
});

// ── GET /api/content/bilder/list ───────────────────────────────────
router.get('/list', (req, res) => {
  const { group } = req.query;
  const targets = group ? IMG_TARGETS.filter(t => t.group === group) : IMG_TARGETS;
  const images = targets.map(t => {
    const fp     = path.join(PUBLIC_ROOT, t.file);
    const exists = fs.existsSync(fp);
    const stat   = exists ? fs.statSync(fp) : null;
    return {
      id:       t.id,
      label:    t.label,
      file:     t.file,
      exists,
      sizeKB:   stat ? Math.round(stat.size / 1024) : 0,
      modified: stat ? stat.mtime : null,
      url:      `${SITE_URL}/${t.file}`,
      mtime:    stat ? stat.mtimeMs : 0,
    };
  });
  res.json(images);
});

// ── POST /api/content/bilder/upload ───────────────────────────────
router.post('/upload', (req, res, next) => {
  upload.single('image')(req, res, err => {
    if (err) return res.status(400).json({ error: err.message });
    next();
  });
}, async (req, res) => {
  const target = IMG_TARGETS.find(t => t.id === req.body?.target);
  if (!target) return res.status(400).json({ error: 'Ungültiges Ziel' });
  if (!req.file) return res.status(400).json({ error: 'Keine Datei hochgeladen' });

  const destPath = path.join(PUBLIC_ROOT, target.file);
  try {
    if (fs.existsSync(destPath)) {
      const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      fs.mkdirSync(BACKUP_DIR, { recursive: true });
      fs.copyFileSync(destPath, path.join(BACKUP_DIR, `${target.id}-${ts}.bak`));
    }
    await sharp(req.file.buffer)
      .rotate()
      .resize({ width: 1920, height: 1920, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 85 })
      .toFile(destPath);

    const stat = fs.statSync(destPath);
    res.json({ ok: true, sizeKB: Math.round(stat.size / 1024), label: target.label });
  } catch (e) {
    console.error('[Bilder] Upload Fehler:', e);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
