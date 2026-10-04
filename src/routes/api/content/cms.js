'use strict';
const router     = require('express').Router();
const fs         = require('fs');
const path       = require('path');

const PUBLIC_ROOT = '/home/radmin/web/randl.group/public_html';
const SITE_URL    = 'https://randl.group';
const BACKUP_DIR  = path.join(__dirname, '../../../../../cms-backups');

const PAGES = [
  { id:'landing',     label:'Landing Page',            icon:'home',      file:'index.html',                wysiwyg:false, desc:'randl.group Startseite' },
  { id:'impressum',   label:'Impressum',                icon:'file-text', file:'impressum/index.html',      wysiwyg:true,  desc:'Pflichtangaben §5 TMG' },
  { id:'datenschutz', label:'Datenschutzerklärung',     icon:'shield',    file:'datenschutz/index.html',    wysiwyg:true,  desc:'DSGVO-Datenschutztext' },
  { id:'kontakt',     label:'Kontakt',                  icon:'mail',      file:'kontakt/index.html',        wysiwyg:false, desc:'Kontaktseite mit Formular' },
  { id:'zelt-form',   label:'Formular: Zeltverleih',    icon:'tent',      file:'zelt/formular/index.html',  wysiwyg:false, desc:'Anfrageformular Zeltverleih' },
  { id:'metall-form', label:'Formular: Metallarbeiten', icon:'settings',  file:'metall/formular/index.html',wysiwyg:false, desc:'Anfrageformular Metallarbeiten' },
  { id:'gas-form',    label:'Formular: Gashandel',      icon:'flame',     file:'gas/formular/index.html',   wysiwyg:false, desc:'Anfrageformular Gashandel' },
  // ── Unterseiten-Landingpages ─────────────────────────────────
  { id:'zelt-landing',   label:'Zeltverleih Landingpage',    icon:'tent',     file:'zelt/index.html',   wysiwyg:false, desc:'randl.group/zelt/ Hauptseite' },
  { id:'gas-landing',    label:'Gashandel Landingpage',      icon:'flame',    file:'gas/index.html',    wysiwyg:false, desc:'randl.group/gas/ Hauptseite' },
  { id:'metall-landing', label:'Metallarbeiten Landingpage', icon:'settings', file:'metall/index.html', wysiwyg:false, desc:'randl.group/metall/ Hauptseite' },
  { id:'fotobox-landing', label:'Fotobox Landingpage', icon:'camera', file:'fotobox/index.html', wysiwyg:false, desc:'randl.group/fotobox/ Hauptseite' },
];

function parseSections(html) {
  const re = /<!--\s*RANDL:id="([^"]+)"\s+label="([^"]+)"\s+type="([^"]+)"\s*-->([\s\S]*?)<!--\s*\/RANDL\s*-->/g;
  const out = []; let m;
  while ((m = re.exec(html)) !== null)
    out.push({ id: m[1], label: m[2], type: m[3], content: m[4].trim() });
  return out;
}

function replaceSections(html, updates) {
  const re = /<!--\s*RANDL:id="([^"]+)"\s+label="([^"]+)"\s+type="([^"]+)"\s*-->([\s\S]*?)<!--\s*\/RANDL\s*-->/g;
  const secs = [];
  let m;
  while ((m = re.exec(html)) !== null)
    secs.push({ id: m[1], label: m[2], type: m[3], start: m.index, end: m.index + m[0].length });
  // Reverse so slice offsets stay valid
  for (const s of secs.filter(s => updates[s.id] !== undefined).reverse()) {
    html = html.slice(0, s.start)
      + `<!-- RANDL:id="${s.id}" label="${s.label}" type="${s.type}" -->\n${updates[s.id]}\n<!-- /RANDL -->`
      + html.slice(s.end);
  }
  return html;
}

function makeBackup(pageId, filePath) {
  if (!fs.existsSync(filePath)) return;
  const ts  = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const dir = path.join(BACKUP_DIR, pageId);
  fs.mkdirSync(dir, { recursive: true });
  fs.copyFileSync(filePath, path.join(dir, `${ts}.bak`));
}

// ── GET /api/content/cms/pages ─────────────────────────────────────
router.get('/pages', (req, res) => {
  const pages = PAGES.map(p => {
    const fp     = path.join(PUBLIC_ROOT, p.file);
    const exists = fs.existsSync(fp);
    const stat   = exists ? fs.statSync(fp) : null;
    return {
      id:         p.id,
      label:      p.label,
      icon:       p.icon,
      desc:       p.desc,
      wysiwyg:    p.wysiwyg,
      exists,
      sizeKB:     stat ? Math.round(stat.size / 1024) : 0,
      modified:   stat ? stat.mtime : null,
      previewUrl: `${SITE_URL}/${p.file.replace('index.html', '')}`,
    };
  });
  res.json(pages);
});

// ── GET /api/content/cms/page/:id ──────────────────────────────────
router.get('/page/:id', (req, res) => {
  const page = PAGES.find(p => p.id === req.params.id);
  if (!page) return res.status(404).json({ error: 'Seite nicht gefunden' });
  const fp = path.join(PUBLIC_ROOT, page.file);
  if (!fs.existsSync(fp)) return res.status(404).json({ error: 'Datei existiert nicht' });
  const content  = fs.readFileSync(fp, 'utf8');
  const sections = page.wysiwyg ? parseSections(content) : [];
  res.json({
    id:         page.id,
    label:      page.label,
    wysiwyg:    page.wysiwyg,
    content,
    sections,
    previewUrl: `${SITE_URL}/${page.file.replace('index.html', '')}`,
  });
});

// ── POST /api/content/cms/page/:id/code ────────────────────────────
router.post('/page/:id/code', (req, res) => {
  const page = PAGES.find(p => p.id === req.params.id);
  if (!page) return res.status(404).json({ error: 'Seite nicht gefunden' });
  const { content } = req.body;
  if (typeof content !== 'string') return res.status(400).json({ error: 'Kein Content' });
  const fp = path.join(PUBLIC_ROOT, page.file);
  try {
    makeBackup(page.id, fp);
    fs.mkdirSync(path.dirname(fp), { recursive: true });
    fs.writeFileSync(fp, content, 'utf8');
    res.json({ ok: true });
  } catch (e) {
    console.error('[CMS] Save error:', e);
    res.status(500).json({ error: e.message });
  }
});

// ── POST /api/content/cms/page/:id/wysiwyg ─────────────────────────
router.post('/page/:id/wysiwyg', (req, res) => {
  const page = PAGES.find(p => p.id === req.params.id);
  if (!page) return res.status(404).json({ error: 'Seite nicht gefunden' });
  const { updates } = req.body;
  if (!updates || typeof updates !== 'object') return res.status(400).json({ error: 'Kein Updates-Objekt' });
  const fp = path.join(PUBLIC_ROOT, page.file);
  if (!fs.existsSync(fp)) return res.status(404).json({ error: 'Datei existiert nicht' });
  try {
    makeBackup(page.id, fp);
    const html = replaceSections(fs.readFileSync(fp, 'utf8'), updates);
    fs.writeFileSync(fp, html, 'utf8');
    res.json({ ok: true });
  } catch (e) {
    console.error('[CMS] Wysiwyg save error:', e);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
