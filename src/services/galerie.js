'use strict';
// Kundengalerie randl.group/zelt/galerie/ – Bilder ausblenden / wiederherstellen.
//
// Die Galerie wird von tools/build-galerie.py (Repo randl-website) aus dem Nextcloud-Ordner "Photos"
// erzeugt. Das Portal ändert nur den fertigen Stand:
//   - galerie.json            sichtbare Bilder + Alben
//   - .ausgeblendet.json      im Portal ausgeblendete Bilder (das Python-Skript lässt sie weg)
//   - index.html              statischer Bilderblock zwischen <!-- GALERIE:START --> und <!-- GALERIE:END -->
// Ausgeblendete WebP-Dateien werden in den Backup-Ordner verschoben, nicht gelöscht.
// renderBlock() muss zur Ausgabe von build-galerie.py passen.

const fs   = require('fs');
const path = require('path');

const PUBLIC_ROOT = '/home/radmin/web/randl.group/public_html';
const DIR        = () => process.env.GALERIE_DIR || path.join(PUBLIC_ROOT, 'zelt/galerie');
const BACKUP     = () => process.env.GALERIE_BACKUP_DIR || path.join(__dirname, '../../../../cms-backups/galerie');
const FILE_RE    = /^[a-z0-9-]+-[0-9a-f]{8}\.webp$/;

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#x27;');

function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch (e) { if (e.code === 'ENOENT' && fallback !== undefined) return fallback; throw e; }
}
function writeAtomic(file, text) {
  const tmp = `${file}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, text, 'utf8');
  fs.renameSync(tmp, file);
}
function moveFile(from, to) {
  if (!fs.existsSync(from)) return false;
  fs.mkdirSync(path.dirname(to), { recursive: true });
  try { fs.renameSync(from, to); }
  catch (e) { if (e.code !== 'EXDEV') throw e; fs.copyFileSync(from, to); fs.unlinkSync(from); }
  return true;
}

function countAlbums(alben, bilder) {
  return alben.map(a => ({ ...a, anzahl: bilder.filter(b => b.album === a.id).length }));
}

function renderBlock(alben, bilder) {
  const sichtbar = alben.filter(a => a.anzahl > 0);
  const figs = bilder.map((m, i) => {
    const lazy = i > 7 ? 'loading="lazy" decoding="async"' : i === 0 ? 'fetchpriority="high"' : '';
    return `<figure class="g-item" data-album="${m.album}">`
      + `<a href="img/full/${m.file}" data-w="${m.w}" data-h="${m.h}">`
      + `<img src="img/thumb/${m.file}" width="${m.tw}" height="${m.th}" alt="${esc(m.alt)}" ${lazy}></a>`
      + (m.caption ? `<figcaption>${esc(m.caption)}</figcaption>` : '')
      + '</figure>';
  });
  const chips = [`<button class="g-chip active" data-filter="alle">Alle <span>${bilder.length}</span></button>`]
    .concat(sichtbar.map(a => `<button class="g-chip" data-filter="${a.id}">${esc(a.titel)} <span>${a.anzahl}</span></button>`));
  return '<!-- GALERIE:START (automatisch erzeugt von tools/build-galerie.py – nicht von Hand ändern) -->\n'
    + `<div class="g-filter" role="toolbar" aria-label="Galerie filtern">${chips.join('')}</div>\n`
    + '<div class="g-grid" id="g-grid">\n' + figs.join('\n') + '\n</div>\n<!-- GALERIE:END -->';
}

function save(data, hidden) {
  const dir = DIR();
  data.alben = countAlbums(data.alben, data.bilder);
  data.geaendert = new Date().toISOString().slice(0, 19) + 'Z';
  const page = path.join(dir, 'index.html');
  const html = fs.readFileSync(page, 'utf8');
  if (!/<!-- GALERIE:START[\s\S]*?<!-- GALERIE:END -->/.test(html)) throw new Error('Marker GALERIE:START/END in index.html fehlen');
  const next = html
    .replace(/<!-- GALERIE:START[\s\S]*?<!-- GALERIE:END -->/, () => renderBlock(data.alben, data.bilder))
    .replace(/(<span id="g-total">)\d*(<\/span>)/, `$1${data.bilder.length}$2`);
  writeAtomic(path.join(dir, '.ausgeblendet.json'), JSON.stringify(hidden, null, 1));
  writeAtomic(path.join(dir, 'galerie.json'), JSON.stringify(data, null, 1));
  writeAtomic(page, next);
}

function load() {
  const dir = DIR();
  const data = readJson(path.join(dir, 'galerie.json'));
  const hidden = readJson(path.join(dir, '.ausgeblendet.json'), { bilder: [] });
  return { data, hidden };
}

function list() {
  const { data, hidden } = load();
  return { erstellt: data.erstellt, geaendert: data.geaendert || null, alben: data.alben, bilder: data.bilder, ausgeblendet: hidden.bilder };
}

function checkFiles(files) {
  if (!Array.isArray(files) || !files.length) throw Object.assign(new Error('Keine Bilder ausgewählt'), { status: 400 });
  if (files.length > 500 || files.some(f => typeof f !== 'string' || !FILE_RE.test(f)))
    throw Object.assign(new Error('Ungültiger Dateiname'), { status: 400 });
}

function hide(files, user) {
  checkFiles(files);
  const { data, hidden } = load();
  const dir = DIR(), bak = BACKUP();
  const set = new Set(files);
  const stamp = new Date().toISOString().slice(0, 19) + 'Z';
  const moved = [];
  data.bilder.forEach((b, pos) => {
    if (!set.has(b.file)) return;
    for (const size of ['full', 'thumb']) moveFile(path.join(dir, 'img', size, b.file), path.join(bak, size, b.file));
    hidden.bilder.push({ ...b, pos, ausgeblendet: stamp, von: user || null });
    moved.push(b.file);
  });
  data.bilder = data.bilder.filter(b => !set.has(b.file));
  save(data, hidden);
  return { ok: true, ausgeblendet: moved.length, sichtbar: data.bilder.length };
}

function restore(files) {
  checkFiles(files);
  const { data, hidden } = load();
  const dir = DIR(), bak = BACKUP();
  const set = new Set(files);
  const back = hidden.bilder.filter(b => set.has(b.file)).sort((a, b) => a.pos - b.pos);
  let fehlend = 0;
  for (const h of back) {
    let ok = true;
    for (const size of ['full', 'thumb']) {
      const target = path.join(dir, 'img', size, h.file);
      if (!fs.existsSync(target) && !moveFile(path.join(bak, size, h.file), target)) ok = false;
    }
    if (!ok) { fehlend++; continue; }  // Datei weg: kommt beim nächsten Lauf von build-galerie.py zurück
    const { pos, ausgeblendet, von, ...entry } = h;
    data.bilder.splice(Math.min(pos, data.bilder.length), 0, entry);
  }
  hidden.bilder = hidden.bilder.filter(b => !set.has(b.file));
  save(data, hidden);
  return { ok: true, wiederhergestellt: back.length - fehlend, fehlend, sichtbar: data.bilder.length };
}

module.exports = { list, hide, restore, renderBlock };

// Vorschaubild eines ausgeblendeten Bildes aus dem Papierkorb (nur fürs Portal)
module.exports.papierkorbThumb = file => {
  if (typeof file !== 'string' || !FILE_RE.test(file)) return null;
  const p = path.join(BACKUP(), 'thumb', file);
  return fs.existsSync(p) ? p : null;
};
