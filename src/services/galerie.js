'use strict';
// Kundengalerie randl.group/zelt/galerie/ – Pflege aus dem Mitarbeiterportal.
//
// Die Galerie wird von tools/build-galerie.py (Repo randl-website) aus dem Nextcloud-Ordner "Photos"
// erzeugt. Das Portal ändert den fertigen Stand und merkt sich alles in .verwaltung.json, damit der
// nächste Lauf des Skripts die Änderungen übernimmt:
//   alben         Titel + Reihenfolge der Kategorien ("ordner" = Nextcloud-Zuordnung, nur im Code änderbar)
//   ausgeblendet  gelöschte Bilder (Papierkorb); endgueltig=true → Dateien weg, bleibt trotzdem gesperrt
//   hinzugefuegt  im Portal hochgeladene Bilder (gibt es nicht in der Nextcloud)
//   zuordnung     { sha8: albumId } für umsortierte Nextcloud-Bilder
//   verpixelt     { sha8: boxen } – Gesichter unkenntlich gemacht (Original im Papierkorb-Ordner /original)
//   version       { sha8: n } – Cache-Buster (?v=n) nach Bildänderung
// Gesichter (boxen = [[x,y,w,h] relativ]) erkennt build-galerie.py lokal mit OpenCV.
// Dateien: galerie.json (sichtbare Bilder), index.html (statischer Block zwischen GALERIE-Markern),
// img/full + img/thumb (WebP). Gelöschte WebPs liegen im Papierkorb (BACKUP), nicht im Webroot.
// renderBlock(), slugify() und alt-Texte müssen zu build-galerie.py passen.

const fs     = require('fs');
const path   = require('path');
const crypto = require('crypto');

const PUBLIC_ROOT = '/home/radmin/web/randl.group/public_html';
const DIR      = () => process.env.GALERIE_DIR || path.join(PUBLIC_ROOT, 'zelt/galerie');
const BACKUP   = () => process.env.GALERIE_BACKUP_DIR || path.join(__dirname, '../../../../cms-backups/galerie');
const FILE_RE  = /^[a-z0-9-]+-[0-9a-f]{8}\.webp$/;
const ID_RE    = /^[a-z0-9-]{1,40}$/;
const FULL_MAX = 2048, THUMB_W = 640;
const MAX_TITEL = 60, MAX_CAPTION = 80;

const fail = (status, msg) => Object.assign(new Error(msg), { status });
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#x27;');
const now = () => new Date().toISOString().slice(0, 19) + 'Z';
const sha8 = file => file.slice(-13, -5);

function slugify(s) {
  return String(s).toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .normalize('NFKD').replace(/[^\x00-\x7f]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}
const fileName = (album, caption, sha) => `${album}-${caption ? slugify(caption) + '-' : ''}${sha}.webp`;
const altText = (titel, caption) => `${titel}${caption ? ' – ' + caption : ''} | Zeltverleih Dominik Randl`;

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
const imgPath = (size, file) => path.join(DIR(), 'img', size, file);
const binPath = (size, file) => path.join(BACKUP(), size, file);
const origPath = (size, sha) => path.join(BACKUP(), 'original', size, `${sha}.webp`);

// ── Rendern (identisch zu build-galerie.py) ──────────────────────────
function renderBlock(alben, bilder) {
  const sichtbar = alben.filter(a => a.anzahl > 0);
  const figs = bilder.map((m, i) => {
    const lazy = i > 7 ? 'loading="lazy" decoding="async"' : i === 0 ? 'fetchpriority="high"' : '';
    const q = m.v ? `?v=${m.v}` : '';
    return `<figure class="g-item" data-album="${m.album}">`
      + `<a href="img/full/${m.file}${q}" data-w="${m.w}" data-h="${m.h}">`
      + `<img src="img/thumb/${m.file}${q}" width="${m.tw}" height="${m.th}" alt="${esc(m.alt)}" ${lazy}></a>`
      + (m.caption ? `<figcaption>${esc(m.caption)}</figcaption>` : '')
      + '</figure>';
  });
  const chips = [`<button class="g-chip active" data-filter="alle">Alle <span>${bilder.length}</span></button>`]
    .concat(sichtbar.map(a => `<button class="g-chip" data-filter="${a.id}">${esc(a.titel)} <span>${a.anzahl}</span></button>`));
  return '<!-- GALERIE:START (automatisch erzeugt von tools/build-galerie.py – nicht von Hand ändern) -->\n'
    + `<div class="g-filter" role="toolbar" aria-label="Galerie filtern">${chips.join('')}</div>\n`
    + '<div class="g-grid" id="g-grid">\n' + figs.join('\n') + '\n</div>\n<!-- GALERIE:END -->';
}

// ── Laden / Speichern ────────────────────────────────────────────────
function load() {
  const dir = DIR();
  const data = readJson(path.join(dir, 'galerie.json'));
  const state = readJson(path.join(dir, '.verwaltung.json'), {});
  const legacy = readJson(path.join(dir, '.ausgeblendet.json'), null);   // Stand aus v1.9.0
  state.ausgeblendet = (state.ausgeblendet || []).concat(legacy ? legacy.bilder : []);
  state.hinzugefuegt = state.hinzugefuegt || [];
  state.zuordnung = state.zuordnung || {};
  state.verpixelt = state.verpixelt || {};
  state.version = state.version || {};
  if (!state.alben || !state.alben.length) state.alben = data.alben.map(({ id, titel }) => ({ id, titel, ordner: [] }));
  return { data, state, hadLegacy: !!legacy };
}

function save({ data, state, hadLegacy }) {
  const dir = DIR();
  const titel = Object.fromEntries(state.alben.map(a => [a.id, a.titel]));
  const order = state.alben.map(a => a.id);
  data.bilder.sort((a, b) => order.indexOf(a.album) - order.indexOf(b.album));   // stabil
  data.bilder.forEach(b => { b.alt = altText(titel[b.album], b.caption); });
  data.alben = state.alben.map(a => ({ id: a.id, titel: a.titel, anzahl: data.bilder.filter(b => b.album === a.id).length }));
  data.geaendert = now();
  const page = path.join(dir, 'index.html');
  const html = fs.readFileSync(page, 'utf8');
  if (!/<!-- GALERIE:START[\s\S]*?<!-- GALERIE:END -->/.test(html)) throw new Error('Marker GALERIE:START/END in index.html fehlen');
  const next = html
    .replace(/<!-- GALERIE:START[\s\S]*?<!-- GALERIE:END -->/, () => renderBlock(data.alben, data.bilder))
    .replace(/(<span id="g-total">)\d*(<\/span>)/, `$1${data.bilder.length}$2`);
  writeAtomic(path.join(dir, '.verwaltung.json'), JSON.stringify(state, null, 1));
  writeAtomic(path.join(dir, 'galerie.json'), JSON.stringify(data, null, 1));
  writeAtomic(page, next);
  if (hadLegacy) fs.rmSync(path.join(dir, '.ausgeblendet.json'), { force: true });
}

function mutate(fn) {
  const ctx = load();
  const result = fn(ctx);
  save(ctx);
  return { ok: true, sichtbar: ctx.data.bilder.length, ...result };
}

function checkFiles(files) {
  if (!Array.isArray(files) || !files.length) throw fail(400, 'Keine Bilder ausgewählt');
  if (files.length > 500 || files.some(f => typeof f !== 'string' || !FILE_RE.test(f))) throw fail(400, 'Ungültiger Dateiname');
  return new Set(files);
}
function checkAlbum(state, id) {
  if (!state.alben.some(a => a.id === id)) throw fail(400, 'Unbekannte Kategorie');
}
function cleanText(s, max) {
  return String(s || '').replace(/[\u0000-\u001f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, max);
}

// ── Lesen ─────────────────────────────────────────────────────────────
function list() {
  const { data, state } = load();
  const neu = new Set(state.hinzugefuegt.map(h => h.file));
  return {
    erstellt: data.erstellt, geaendert: data.geaendert || null,
    alben: state.alben.map(a => ({ id: a.id, titel: a.titel, nextcloud: a.ordner || [],
      anzahl: data.bilder.filter(b => b.album === a.id).length })),
    bilder: data.bilder.map(b => ({ ...b, hochgeladen: neu.has(b.file) })),
    ausgeblendet: state.ausgeblendet.filter(h => !h.endgueltig),
  };
}

// ── Löschen (Papierkorb) / Wiederherstellen / endgültig löschen ──────
function hide(files, user) {
  const set = checkFiles(files);
  return mutate(({ data, state }) => {
    let n = 0;
    data.bilder.forEach((b, pos) => {
      if (!set.has(b.file)) return;
      for (const size of ['full', 'thumb']) moveFile(imgPath(size, b.file), binPath(size, b.file));
      state.ausgeblendet.push({ ...b, pos, ausgeblendet: now(), von: user || null });
      n++;
    });
    data.bilder = data.bilder.filter(b => !set.has(b.file));
    return { ausgeblendet: n };
  });
}

function restore(files) {
  const set = checkFiles(files);
  return mutate(({ data, state }) => {
    const back = state.ausgeblendet.filter(h => set.has(h.file) && !h.endgueltig).sort((a, b) => a.pos - b.pos);
    let ok = 0, fehlend = 0;
    for (const h of back) {
      const da = ['full', 'thumb'].every(size => fs.existsSync(imgPath(size, h.file)) || moveFile(binPath(size, h.file), imgPath(size, h.file)));
      if (!da) { fehlend++; continue; }  // kommt beim nächsten Lauf von build-galerie.py zurück
      const { pos, ausgeblendet, von, endgueltig, ...entry } = h;
      data.bilder.splice(Math.min(pos, data.bilder.length), 0, entry);
      ok++;
    }
    state.ausgeblendet = state.ausgeblendet.filter(h => !(set.has(h.file) && !h.endgueltig));
    return { wiederhergestellt: ok, fehlend };
  });
}

function purge(files) {
  const set = checkFiles(files);
  return mutate(({ state }) => {
    let n = 0;
    state.ausgeblendet.forEach(h => {
      if (!set.has(h.file) || h.endgueltig) return;
      for (const size of ['full', 'thumb']) {
        fs.rmSync(binPath(size, h.file), { force: true });
        fs.rmSync(origPath(size, sha8(h.file)), { force: true });
      }
      h.endgueltig = true;   // Eintrag bleibt, damit das Skript das Nextcloud-Bild nicht wieder aufnimmt
      n++;
    });
    state.hinzugefuegt = state.hinzugefuegt.filter(h => !set.has(h.file));
    return { geloescht: n };
  });
}

// ── Kategorie eines Bildes ändern ────────────────────────────────────
function move(files, album) {
  const set = checkFiles(files);
  return mutate(({ data, state }) => {
    checkAlbum(state, album);
    let n = 0;
    data.bilder.forEach(b => {
      if (!set.has(b.file) || b.album === album) return;
      const neu = fileName(album, b.caption, sha8(b.file));
      for (const size of ['full', 'thumb']) moveFile(imgPath(size, b.file), imgPath(size, neu));
      const h = state.hinzugefuegt.find(x => x.file === b.file);
      if (h) { h.file = neu; h.album = album; } else state.zuordnung[sha8(b.file)] = album;
      b.file = neu; b.album = album;
      n++;
    });
    return { verschoben: n };
  });
}

// ── Hochladen ────────────────────────────────────────────────────────
async function upload(buffers, { album, caption }, user) {
  const sharp = require('sharp');
  const cap = cleanText(caption, MAX_CAPTION);
  const { data, state } = load();
  checkAlbum(state, album);
  const vorhanden = new Set([...data.bilder, ...state.ausgeblendet].map(b => sha8(b.file)));
  const neu = [];
  let doppelt = 0;
  for (const buf of buffers) {
    const sha = crypto.createHash('sha1').update(buf).digest('hex').slice(0, 8);
    if (vorhanden.has(sha)) { doppelt++; continue; }
    const file = fileName(album, cap, sha);
    const base = sharp(buf, { failOn: 'error' }).rotate();          // EXIF-Drehung; Metadaten werden nicht übernommen
    fs.mkdirSync(path.dirname(imgPath('full', file)), { recursive: true });
    fs.mkdirSync(path.dirname(imgPath('thumb', file)), { recursive: true });
    const full = await base.clone().resize({ width: FULL_MAX, height: FULL_MAX, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 80 }).toFile(imgPath('full', file));
    const th = await base.clone().resize({ width: THUMB_W }).webp({ quality: 72 }).toFile(imgPath('thumb', file));
    neu.push({ file, album, caption: cap, w: full.width, h: full.height, tw: th.width, th: th.height, hochgeladen: now(), von: user || null });
    vorhanden.add(sha);
  }
  const res = mutate(({ data, state }) => {
    for (const e of neu) {
      state.hinzugefuegt.push(e);
      const { hochgeladen, von, ...entry } = e;
      const last = data.bilder.map(b => b.album).lastIndexOf(album);   // ans Ende der Kategorie
      data.bilder.splice(last === -1 ? data.bilder.length : last + 1, 0, entry);
    }
    return {};
  });
  return { ...res, hinzugefuegt: neu.length, doppelt };
}

// ── Kategorien ───────────────────────────────────────────────────────
// Erwartet die komplette Liste in neuer Reihenfolge: [{ id?, titel }]. Ohne id = neue Kategorie.
// Fehlende Kategorien werden gelöscht – nur erlaubt, wenn sie leer sind und nicht an Nextcloud-Ordnern hängen.
function saveAlben(liste) {
  if (!Array.isArray(liste) || !liste.length || liste.length > 30) throw fail(400, 'Ungültige Kategorienliste');
  return mutate(({ data, state }) => {
    const alt = new Map(state.alben.map(a => [a.id, a]));
    const neu = [];
    for (const item of liste) {
      const titel = cleanText(item && item.titel, MAX_TITEL);
      if (!titel) throw fail(400, 'Kategorie ohne Namen');
      if (item.id) {
        if (!ID_RE.test(item.id) || !alt.has(item.id)) throw fail(400, `Unbekannte Kategorie ${item.id}`);
        neu.push({ ...alt.get(item.id), titel });
      } else {
        let id = slugify(titel).slice(0, 34) || 'kategorie', n = 2;
        const base = id;
        while (alt.has(id) || neu.some(a => a.id === id)) id = `${base}-${n++}`;
        neu.push({ id, titel, ordner: [] });
      }
    }
    if (new Set(neu.map(a => a.id)).size !== neu.length) throw fail(400, 'Kategorie doppelt');
    for (const a of state.alben) {
      if (neu.some(x => x.id === a.id)) continue;
      const belegt = data.bilder.some(b => b.album === a.id) || state.ausgeblendet.some(b => b.album === a.id && !b.endgueltig);
      if (belegt) throw fail(409, `„${a.titel}“ enthält noch Bilder – erst verschieben oder löschen`);
      if ((a.ordner || []).length) throw fail(409, `„${a.titel}“ ist mit Nextcloud-Ordnern verknüpft und kann nicht gelöscht werden`);
    }
    state.alben = neu;
    return { alben: neu.length };
  });
}

// ── Gesichter verpixeln / wiederherstellen ───────────────────────────
// Gleiche Werte wie pixelate() in build-galerie.py: Rand 25 %, 7 Blöcke über die längere Seite.
async function pixelateFile(file, boxen) {
  const sharp = require('sharp');
  const src = imgPath('full', file);
  const { width: W, height: H } = await sharp(src).metadata();
  const comps = [];
  for (const [x, y, w, h] of boxen) {
    const l = Math.max(0, Math.round((x - w * 0.25) * W)), t = Math.max(0, Math.round((y - h * 0.25) * H));
    const r = Math.min(W, Math.round((x + w * 1.25) * W)), b = Math.min(H, Math.round((y + h * 1.25) * H));
    if (r - l < 2 || b - t < 2) continue;
    const blk = Math.max(r - l, b - t) / 7;
    const small = await sharp(src).extract({ left: l, top: t, width: r - l, height: b - t })
      .resize(Math.max(1, Math.round((r - l) / blk)), Math.max(1, Math.round((b - t) / blk)), { kernel: 'cubic', fit: 'fill' })
      .toBuffer();
    comps.push({ input: await sharp(small).resize(r - l, b - t, { kernel: 'nearest', fit: 'fill' }).toBuffer(), left: l, top: t });
  }
  const full = await sharp(src).composite(comps).webp({ quality: 80 }).toBuffer();
  const thumb = await sharp(full).resize({ width: THUMB_W }).webp({ quality: 72 }).toBuffer();
  fs.writeFileSync(`${src}.tmp`, full); fs.renameSync(`${src}.tmp`, src);
  const th = imgPath('thumb', file);
  fs.writeFileSync(`${th}.tmp`, thumb); fs.renameSync(`${th}.tmp`, th);
}

async function blur(files) {
  const set = checkFiles(files);
  const { data, state } = load();
  const ziele = data.bilder.filter(b => set.has(b.file) && !state.verpixelt[sha8(b.file)] && (b.boxen || []).length);
  for (const b of ziele) {
    for (const size of ['full', 'thumb']) {                // Original sichern (nur beim ersten Mal)
      const o = origPath(size, sha8(b.file));
      if (!fs.existsSync(o)) { fs.mkdirSync(path.dirname(o), { recursive: true }); fs.copyFileSync(imgPath(size, b.file), o); }
    }
    await pixelateFile(b.file, b.boxen);
  }
  const ohne = [...set].filter(f => !ziele.some(b => b.file === f)).length;
  return mutate(({ data, state }) => {
    for (const z of ziele) {
      const s = sha8(z.file), b = data.bilder.find(x => x.file === z.file);
      state.verpixelt[s] = z.boxen;
      state.version[s] = (state.version[s] || 0) + 1;
      if (b) { b.verpixelt = true; b.v = state.version[s]; }
    }
    return { verpixelt: ziele.length, uebersprungen: ohne };
  });
}

function unblur(files) {
  const set = checkFiles(files);
  return mutate(({ data, state }) => {
    let n = 0, fehlend = 0;
    for (const b of data.bilder) {
      const s = sha8(b.file);
      if (!set.has(b.file) || !state.verpixelt[s]) continue;
      if (!['full', 'thumb'].every(size => fs.existsSync(origPath(size, s)))) { fehlend++; continue; }
      for (const size of ['full', 'thumb']) moveFile(origPath(size, s), imgPath(size, b.file));
      delete state.verpixelt[s];
      state.version[s] = (state.version[s] || 0) + 1;
      delete b.verpixelt; b.v = state.version[s];
      n++;
    }
    return { entpixelt: n, fehlend };
  });
}

// Vorschaubild eines gelöschten Bildes aus dem Papierkorb (nur fürs Portal)
function papierkorbThumb(file) {
  if (typeof file !== 'string' || !FILE_RE.test(file)) return null;
  const p = binPath('thumb', file);
  return fs.existsSync(p) ? p : null;
}

module.exports = { list, hide, restore, purge, move, upload, saveAlben, blur, unblur, papierkorbThumb, renderBlock, slugify };
