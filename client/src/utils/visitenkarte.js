// Visitenkarte (#630): ein Layout in mm, daraus Vorschau (SVG), PDF und Bilder (PNG/JPG).
// Maße und Farben aus dem freigegebenen Design (Canvas „Visitenkarte“, Designsystem Randl Group, hell).
// Koordinaten: Ursprung = linke obere Ecke des Endformats 85×55 mm, Beschnitt ragt nach außen.
import { PDFDocument, rgb, setCharacterSpacing } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';

export const ENDFORMAT = { w: 85, h: 55 };

// Beschnitt je Druckerei. Flyeralarm-Datenblatt Visitenkarte 85×55: Datenformat 87×57 (1 mm).
export const BESCHNITT = [
  { id: 'standard', label: 'Standard, 3 mm (91 × 61 mm)', mm: 3 },
  { id: 'flyeralarm', label: 'Flyeralarm, 1 mm (87 × 57 mm)', mm: 1 },
];

export const BEREICHE = ['Gruppe', 'Zeltverleih', 'Maschinenbau', 'Gashandel'];

// Zentrale Festnetznummer. Leer = Option im Formular gesperrt („noch nicht festgelegt“).
// Sobald es eine Nummer gibt, hier eintragen, z. B. '+49 8624 …'.
export const ZENTRALE_TELEFON = '';

export const WEB = 'https://randl.group';
export const ADRESSE = 'Firma Dominik Randl · Grünweg 1 · 83370 Seeon';

const RUECKSEITE_ZEILE = {
  Gruppe: 'Zeltverleih · Maschinenbau · Gashandel',
  Zeltverleih: 'Zeltverleih · randl.group/zelt',
  Maschinenbau: 'Maschinenbau · CNC-Technik',
  Gashandel: 'Gashandel · randl.group/gas',
};

const FONT_FILES = {
  barlow700: 'BarlowCondensed-700.ttf',
  barlow800: 'BarlowCondensed-800.ttf',
  bebas: 'BebasNeue-400.ttf',
  dm400: 'DMSans-400.ttf',
  dm600: 'DMSans-600.ttf',
};
// Zeilenmetrik (hhea) in em, für die Grundlinie wie im Browser
const METRIK = {
  barlow700: [1.0, 0.2], barlow800: [1.0, 0.2], bebas: [0.9, 0.3], dm400: [0.992, 0.31], dm600: [0.992, 0.31],
};
export const FONT_BASE = '/fonts/visitenkarte/';
export const LOGO_URL = '/logo.png';

// Design-Pixel (CSS px, Artboard 344×231 = 91×61 mm) → mm
const PX = 25.4 / 96;
const px = v => v * PX;

const hex = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
// Transparente Farben auf den Kartengrund verrechnen: der Druck bekommt nur Vollfarben.
const auf = (grund, [r, g, b], a) => {
  const [R, G, B] = hex(grund);
  const m = (c, C) => Math.round(c * a + C * (1 - a));
  return '#' + [m(r, R), m(g, G), m(b, B)].map(v => v.toString(16).padStart(2, '0')).join('');
};

const farben = bereich => {
  const mb = bereich === 'Maschinenbau';
  const grund = mb ? '#eee0cb' : '#f5f5f0';
  return {
    grund,
    text: mb ? '#1b1725' : auf(grund, [0, 0, 0], 0.85),
    text2: mb ? '#1b1725' : auf(grund, [0, 0, 0], 0.6),
    grau: mb ? auf(grund, [27, 23, 37], 0.6) : auf(grund, [0, 0, 0], 0.55),
    aktiv: mb ? '#280003' : '#cc0000',
    kuerzel: mb ? '#280003' : '#cc0000',
    web: '#cc0000',
    akzent: mb ? '#e83049' : '#cc0000',
    rueckText2: mb ? '#280003' : auf(grund, [0, 0, 0], 0.6),
    initial: mb ? '#280003' : '#a83020',
  };
};

// ── Schriften laden und messen ─────────────────────────────────────────────
export async function ladeAssets(holeBytes = async url => new Uint8Array(await (await fetch(url)).arrayBuffer())) {
  const fonts = {};
  await Promise.all(Object.entries(FONT_FILES).map(async ([key, file]) => {
    const bytes = await holeBytes(FONT_BASE + file);
    fonts[key] = { bytes, fk: fontkit.create(bytes), file };
  }));
  const logo = await holeBytes(LOGO_URL);
  return { fonts, logo };
}

// Breite in mm ohne Kerning/Ligaturen (so zeichnen auch PDF und SVG)
const OHNE = { kern: false, liga: false };
const breite = (assets, font, size, text, ls = 0) => {
  if (!text) return 0;
  const f = assets.fonts[font].fk;
  const run = f.layout(text, OHNE);
  const adv = run.glyphs.reduce((s, g) => s + g.advanceWidth, 0) / f.unitsPerEm * size;
  return adv + ls * (Array.from(text).length - 1);
};
const grundlinie = (font, size, top, lh) => {
  const [a, d] = METRIK[font];
  return top + (lh - (a + d) * size) / 2 + a * size;
};

// Text, der höchstens maxW breit sein darf (sonst Schrift verkleinern)
const passend = (assets, font, size, text, ls, maxW) => {
  const w = breite(assets, font, size, text, ls);
  return w <= maxW ? { size, ls, w } : { size: size * maxW / w, ls: ls * maxW / w, w: maxW };
};

// ── Layout ────────────────────────────────────────────────────────────────
const PAD_X = px(23) - 3, PAD_Y = px(22) - 3;          // Innenabstand ab Endformat
const RECHTS = ENDFORMAT.w - PAD_X, UNTEN = ENDFORMAT.h - PAD_Y;
const LEISTE = px(18) - 3;                               // sichtbare Leiste nach dem Schnitt

export function normalisiere(daten) {
  const t = v => String(v ?? '').trim();
  return {
    bereich: BEREICHE.includes(daten.bereich) ? daten.bereich : 'Gruppe',
    name: t(daten.name), funktion: t(daten.funktion),
    telefon: daten.zentrale && ZENTRALE_TELEFON ? ZENTRALE_TELEFON : '',
    mobil: t(daten.mobil), email: t(daten.email).toLowerCase(),
  };
}

export function vorderseite(assets, daten, b) {
  const d = normalisiere(daten);
  const c = farben(d.bereich);
  const el = [];
  el.push({ t: 'rect', x: -b, y: -b, w: ENDFORMAT.w + 2 * b, h: ENDFORMAT.h + 2 * b, fill: c.grund });

  // Logo oben links
  el.push({ t: 'image', x: PAD_X, y: PAD_Y, w: px(38), h: px(38) });

  // Bereiche oben rechts
  const bs = px(12), bls = 0.2 * bs, blh = px(12 * 1.3);
  ['Zeltverleih', 'Maschinenbau', 'Gashandel'].forEach((label, i) => {
    const top = PAD_Y + i * (blh + px(1));
    const txt = label.toUpperCase();
    const w = breite(assets, 'barlow700', bs, txt, bls);
    const x = RECHTS - w;
    const an = d.bereich === 'Gruppe' || d.bereich === label;
    el.push({ t: 'text', font: 'barlow700', size: bs, ls: bls, x, y: grundlinie('barlow700', bs, top, blh), text: txt, fill: an ? c.aktiv : c.grau });
    if (d.bereich === label) el.push({ t: 'rect', x: x - px(6) - px(10), y: top + blh / 2 - px(1), w: px(10), h: px(2), fill: c.akzent });
  });
  const h1 = 3 * blh + 2 * px(1);

  // Kontaktzeilen unten
  const zeilen = [];
  if (d.telefon) zeilen.push(['T', d.telefon, c.kuerzel]);
  if (d.mobil) zeilen.push(['M', d.mobil, c.kuerzel]);
  zeilen.push(['E', d.email || 'name@randl.group', c.kuerzel]);
  zeilen.push(['W', WEB, c.web]);
  const ks = px(12), klh = px(12 * 1.4), kEinzug = px(14);
  const h3 = zeilen.length * klh + (zeilen.length - 1) * px(1);
  const kTop = UNTEN - h3;
  zeilen.forEach(([k, wert, kf], i) => {
    const top = kTop + i * (klh + px(1));
    const y = grundlinie('dm400', ks, top, klh);
    el.push({ t: 'text', font: 'dm600', size: ks, ls: 0, x: PAD_X, y, text: k, fill: kf });
    const fit = passend(assets, 'dm400', ks, wert, 0, RECHTS - PAD_X - kEinzug);
    el.push({ t: 'text', font: 'dm400', size: fit.size, ls: 0, x: PAD_X + kEinzug, y, text: wert, fill: c.text });
  });

  // Name und Funktion mittig zwischen beiden Blöcken (wie flex space-between)
  const ns = px(22), nlh = ns * 1.05, nls = 0.02 * ns, fs = px(12), flh = fs * 1.35;
  const h2 = nlh + (d.funktion ? px(2) + flh : 0);
  const luecke = (UNTEN - PAD_Y - h1 - h2 - h3) / 2;
  const nTop = PAD_Y + h1 + luecke;
  const nameTxt = (d.name || 'Vorname Nachname').toUpperCase();
  const nfit = passend(assets, 'barlow800', ns, nameTxt, nls, RECHTS - PAD_X);
  el.push({ t: 'text', font: 'barlow800', size: nfit.size, ls: nfit.ls, x: PAD_X, y: grundlinie('barlow800', nfit.size, nTop, nlh), text: nameTxt, fill: c.text });
  if (d.funktion) {
    const ffit = passend(assets, 'dm400', fs, d.funktion, 0, RECHTS - PAD_X);
    el.push({ t: 'text', font: 'dm400', size: ffit.size, ls: 0, x: PAD_X, y: grundlinie('dm400', fs, nTop + nlh + px(2), flh), text: d.funktion, fill: c.text2 });
  }

  // Rote Leiste unten, bis in den Beschnitt
  el.push({ t: 'rect', x: -b, y: ENDFORMAT.h - LEISTE, w: ENDFORMAT.w + 2 * b, h: LEISTE + b, fill: c.akzent });
  return el;
}

export function rueckseite(assets, daten, b) {
  const d = normalisiere(daten);
  const c = farben(d.bereich);
  const cx = ENDFORMAT.w / 2;
  const el = [];
  el.push({ t: 'rect', x: -b, y: -b, w: ENDFORMAT.w + 2 * b, h: ENDFORMAT.h + 2 * b, fill: c.grund });

  const logo = px(64), gap = px(10);
  const ts = px(34), tlh = ts * 0.92, tls = 0.015 * ts;
  const zs = px(12), zlh = zs * 1.3, zls = 0.2 * zs;
  const hoehe = logo + gap + tlh + gap + zlh;
  let top = PAD_Y + (UNTEN - PAD_Y - hoehe) / 2;

  el.push({ t: 'image', x: cx - logo / 2, y: top, w: logo, h: logo });
  top += logo + gap;

  // DOMINIK RANDL, D und R abgesetzt
  const teile = [['D', c.initial], ['OMINIK ', c.text], ['R', c.initial], ['ANDL', c.text]];
  const gesamt = breite(assets, 'bebas', ts, 'DOMINIK RANDL', tls);
  let x = cx - gesamt / 2;
  const ty = grundlinie('bebas', ts, top, tlh);
  teile.forEach(([txt, fill]) => {
    el.push({ t: 'text', font: 'bebas', size: ts, ls: tls, x, y: ty, text: txt, fill });
    x += breite(assets, 'bebas', ts, txt, tls) + tls;
  });
  top += tlh + gap;

  const zeile = RUECKSEITE_ZEILE[d.bereich].toUpperCase();
  const zw = breite(assets, 'barlow700', zs, zeile, zls);
  el.push({ t: 'text', font: 'barlow700', size: zs, ls: zls, x: cx - zw / 2, y: grundlinie('barlow700', zs, top, zlh), text: zeile, fill: c.rueckText2 });

  // Adresse unten
  const as = px(12), alh = as * 1.4;
  const aw = breite(assets, 'dm400', as, ADRESSE);
  el.push({ t: 'text', font: 'dm400', size: as, ls: 0, x: cx - aw / 2, y: grundlinie('dm400', as, UNTEN - alh, alh), text: ADRESSE, fill: c.rueckText2 });

  // Rote Leiste oben
  el.push({ t: 'rect', x: -b, y: -b, w: ENDFORMAT.w + 2 * b, h: LEISTE + b, fill: c.akzent });
  return el;
}

// ── SVG (Vorschau und Grundlage für die Bilder) ───────────────────────────
const esc = s => String(s).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
const r4 = v => Math.round(v * 10000) / 10000;

// quellen: { fonts: {key: url}, logo: url }; ausschnitt: Beschnitt in mm, der gezeigt wird (0 = Endformat)
export function svg(elemente, ausschnitt, quellen, breitePx) {
  const W = ENDFORMAT.w + 2 * ausschnitt, H = ENDFORMAT.h + 2 * ausschnitt;
  const faces = Object.entries(quellen.fonts)
    .map(([k, url]) => `@font-face{font-family:"vk-${k}";src:url("${url}") format("truetype");}`).join('');
  const body = elemente.map(e => {
    if (e.t === 'rect') return `<rect x="${r4(e.x)}" y="${r4(e.y)}" width="${r4(e.w)}" height="${r4(e.h)}" fill="${e.fill}"/>`;
    if (e.t === 'image') return `<image href="${quellen.logo}" x="${r4(e.x)}" y="${r4(e.y)}" width="${r4(e.w)}" height="${r4(e.h)}" preserveAspectRatio="xMidYMid meet"/>`;
    return `<text x="${r4(e.x)}" y="${r4(e.y)}" font-family="vk-${e.font}" font-size="${r4(e.size)}" letter-spacing="${r4(e.ls)}" fill="${e.fill}" style="font-kerning:none;font-variant-ligatures:none;white-space:pre">${esc(e.text)}</text>`;
  }).join('');
  const groesse = breitePx ? ` width="${breitePx}" height="${Math.round(breitePx * H / W)}"` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${-ausschnitt} ${-ausschnitt} ${W} ${H}"${groesse}><style>${faces}</style>${body}</svg>`;
}

export const vorschauQuellen = () => ({
  fonts: Object.fromEntries(Object.entries(FONT_FILES).map(([k, f]) => [k, FONT_BASE + f])),
  logo: LOGO_URL,
});

// ── PDF ──────────────────────────────────────────────────────────────────
const PT = 72 / 25.4;
const farbe = h => { const [r, g, bb] = hex(h); return rgb(r / 255, g / 255, bb / 255); };

export async function pdf(assets, daten, b) {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const d = normalisiere(daten);
  doc.setTitle(`Visitenkarte ${d.name}`.trim());
  doc.setAuthor('Firma Dominik Randl');
  doc.setCreator('Randl Mitarbeiterportal');
  doc.setProducer('Randl Mitarbeiterportal (pdf-lib)');
  const fonts = {};
  for (const [k, f] of Object.entries(assets.fonts)) fonts[k] = await doc.embedFont(f.bytes, { subset: true, features: OHNE });
  const logo = await doc.embedPng(assets.logo);

  const W = (ENDFORMAT.w + 2 * b) * PT, H = (ENDFORMAT.h + 2 * b) * PT;
  for (const seite of [vorderseite, rueckseite]) {
    const page = doc.addPage([W, H]);
    page.setBleedBox(0, 0, W, H);
    page.setTrimBox(b * PT, b * PT, ENDFORMAT.w * PT, ENDFORMAT.h * PT);
    const X = x => (x + b) * PT, Y = y => H - (y + b) * PT;
    for (const e of seite(assets, daten, b)) {
      if (e.t === 'rect') page.drawRectangle({ x: X(e.x), y: Y(e.y + e.h), width: e.w * PT, height: e.h * PT, color: farbe(e.fill) });
      else if (e.t === 'image') page.drawImage(logo, { x: X(e.x), y: Y(e.y + e.h), width: e.w * PT, height: e.h * PT });
      else {
        if (e.ls) page.pushOperators(setCharacterSpacing(e.ls * PT));
        page.drawText(e.text, { x: X(e.x), y: Y(e.y), size: e.size * PT, font: fonts[e.font], color: farbe(e.fill) });
        if (e.ls) page.pushOperators(setCharacterSpacing(0));
      }
    }
  }
  return doc.save();
}

// ── Bilder (PNG/JPG, 300 dpi) ─────────────────────────────────────────────
export const DPI = 300;

const base64 = bytes => {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s);
};

const CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return t;
})();
const crc32 = bytes => { let c = 0xffffffff; for (const v of bytes) c = CRC[(c ^ v) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };

// Auflösung in die Datei schreiben, sonst rechnen Druckereien mit 72 dpi
export function setzeDpi(bytes, typ, dpi = DPI) {
  if (typ === 'png') {
    const ppm = Math.round(dpi / 0.0254);
    const chunk = new Uint8Array(21);
    const dv = new DataView(chunk.buffer);
    dv.setUint32(0, 9);
    chunk.set([0x70, 0x48, 0x59, 0x73], 4); // pHYs
    dv.setUint32(8, ppm); dv.setUint32(12, ppm); chunk[16] = 1;
    dv.setUint32(17, crc32(chunk.subarray(4, 17)));
    const out = new Uint8Array(bytes.length + 21);
    out.set(bytes.subarray(0, 33)); out.set(chunk, 33); out.set(bytes.subarray(33), 54);
    return out;
  }
  // JPEG mit JFIF-Kopf: Dichte-Einheit dpi
  if (bytes[2] === 0xff && bytes[3] === 0xe0 && String.fromCharCode(...bytes.subarray(6, 10)) === 'JFIF') {
    const out = bytes.slice();
    const dv = new DataView(out.buffer);
    out[13] = 1; dv.setUint16(14, dpi); dv.setUint16(16, dpi);
    return out;
  }
  return bytes;
}

export async function bild(assets, daten, b, seite, typ) {
  const quellen = {
    fonts: Object.fromEntries(Object.entries(assets.fonts).map(([k, f]) => [k, 'data:font/ttf;base64,' + base64(f.bytes)])),
    logo: 'data:image/png;base64,' + base64(assets.logo),
  };
  const W = Math.round((ENDFORMAT.w + 2 * b) / 25.4 * DPI);
  const H = Math.round((ENDFORMAT.h + 2 * b) / 25.4 * DPI);
  const el = (seite === 'rueck' ? rueckseite : vorderseite)(assets, daten, b);
  const url = URL.createObjectURL(new Blob([svg(el, b, quellen, W)], { type: 'image/svg+xml' }));
  try {
    const img = new Image();
    img.decoding = 'sync';
    await new Promise((ok, fehler) => { img.onload = ok; img.onerror = () => fehler(new Error('Bild konnte nicht erzeugt werden')); img.src = url; });
    // Schriften im SVG-Bild brauchen einen Moment, bis sie greifen
    await new Promise(r => setTimeout(r, 150));
    const canvas = document.createElement('canvas');
    canvas.width = W; canvas.height = H;
    canvas.getContext('2d').drawImage(img, 0, 0, W, H);
    const mime = typ === 'png' ? 'image/png' : 'image/jpeg';
    const blob = await new Promise(r => canvas.toBlob(r, mime, 0.95));
    return setzeDpi(new Uint8Array(await blob.arrayBuffer()), typ);
  } finally {
    URL.revokeObjectURL(url);
  }
}

export const dateiname = (daten, endung, seite) => {
  const n = normalisiere(daten).name.normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/ß/g, 'ss')
    .replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'Visitenkarte';
  return `Visitenkarte_${n}${seite ? '_' + seite : ''}.${endung}`;
};

export function herunterladen(bytes, name, mime) {
  const url = URL.createObjectURL(new Blob([bytes], { type: mime }));
  const a = document.createElement('a');
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

// Bereich aus dem Profilfeld „department“ ableiten (frei gepflegt, daher tolerant)
export function bereichAusAbteilung(dep) {
  const s = String(dep || '').toLowerCase();
  if (/zelt|veranstalt/.test(s)) return 'Zeltverleih';
  if (/gas/.test(s)) return 'Gashandel';
  if (/metall|maschinen|cnc/.test(s)) return 'Maschinenbau';
  return 'Gruppe';
}
