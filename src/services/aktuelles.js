'use strict';
// „Aktuelles“ auf randl.group/news/ – Pflege aus dem Mitarbeiterportal (#74).
//
// Die Website bleibt statisch. Das Portal hält die Daten und erzeugt bei jedem Speichern das HTML
// (gleiches Prinzip wie die Kundengalerie, siehe galerie.js):
//   news/.beitraege.json   Datenquelle: Beiträge (auch Entwürfe) + Bilderliste. Punkt-Datei, von außen gesperrt.
//   news/.vorlage.html     Seitengerüst mit Platzhaltern ({{TITLE}}, {{MAIN}} …), kommt aus randl-website/tools/aktuelles
//   news/<slug>/index.html ein veröffentlichter Beitrag, Inhalt statisch im HTML
//   news/index.html        Übersicht, neueste zuerst
//   news/news.json         öffentlich: die letzten Beiträge (für Teaser)
//   news/img/full|thumb    WebP 2048 px / 640 px, ohne Metadaten
//   sitemap.xml            Einträge zwischen <!-- AKTUELLES:START --> und <!-- AKTUELLES:END -->
//   index.html, zelt/, metall/, gas/   Teaser zwischen <!-- AKTUELLES:START sparte="…" --> und <!-- AKTUELLES:END -->
// Entwürfe erscheinen in keiner dieser Dateien. Wird ein Beitrag gelöscht oder zurückgezogen, verschwindet sein Ordner.

const fs     = require('fs');
const path   = require('path');
const crypto = require('crypto');

const SITE = 'https://randl.group';
const ROOT   = () => process.env.AKTUELLES_ROOT || '/home/radmin/web/randl.group/public_html';
const BACKUP = () => process.env.AKTUELLES_BACKUP_DIR || path.join(__dirname, '../../../../cms-backups/aktuelles');
const NEWS   = () => path.join(ROOT(), 'news');
const DATA   = () => path.join(NEWS(), '.beitraege.json');

const SPARTEN = [
  { id: 'zelt',         titel: 'Zeltverleih',  url: '/zelt/',   teaser: 'Neues vom Zeltverleih',
    cta: { label: 'Ihr nächstes Event', titel: 'Bereit für ein<br>unvergessliches Fest?', sub: 'Unverbindliche Anfrage in 2 Minuten. Wir melden uns persönlich bei Ihnen.', url: '/zelt/formular/' } },
  { id: 'maschinenbau', titel: 'Maschinenbau', url: '/metall/', teaser: 'Neues aus dem Maschinenbau',
    cta: { label: 'Ihr Projekt', titel: 'Sonderteil oder<br>Serie geplant?', sub: 'Schicken Sie uns Ihre Anfrage. Wir melden uns persönlich bei Ihnen.', url: '/metall/formular/' } },
  { id: 'gas',          titel: 'Gashandel',    url: '/gas/',    teaser: 'Neues vom Gashandel',
    cta: { label: 'Flaschengas', titel: 'Gas für Betrieb<br>und Zuhause', sub: 'Fragen Sie Ihre Lieferung oder Abholung direkt an.', url: '/gas/formular/' } },
  { id: 'allgemein',    titel: 'Allgemein',    url: '/',        teaser: 'Neues aus dem Betrieb',
    cta: { label: 'Kontakt', titel: 'Ein Ansprechpartner,<br>drei Gewerke', sub: 'Schreiben Sie uns oder rufen Sie an. Wir melden uns persönlich bei Ihnen.', url: '/kontakt' } },
];
const SPARTE = Object.fromEntries(SPARTEN.map(s => [s.id, s]));
const STATUS = ['entwurf', 'veroeffentlicht'];
const TEASER_SEITEN = ['index.html', 'zelt/index.html', 'metall/index.html', 'gas/index.html'];

const MAX = { titel: 90, slug: 80, teaser: 160, text: 20000, galerie: 40, alt: 140, nachweis: 100, ort: 80, zeiten: 80, url: 300 };
const FULL_MAX = 2048, THUMB_W = 640;
const FILE_RE = /^[a-z0-9-]+-[0-9a-f]{8}\.webp$/;
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const ID_RE   = /^[0-9a-f]{8}$/;
const DATUM_RE = /^\d{4}-\d{2}-\d{2}$/;
const ZEIT_RE  = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;
const RESERVIERT = new Set(['img', 'index', 'news']);
const MARKER_RE = /<!-- AKTUELLES:START([^>]*?)-->[\s\S]*?<!-- AKTUELLES:END -->/g;

const fail = (status, msg) => Object.assign(new Error(msg), { status });
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#x27;');
const now = () => new Date().toISOString().slice(0, 19) + 'Z';
const clean = (s, max) => String(s == null ? '' : s).replace(/[\u0000-\u001f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);

function slugify(s) {
  return String(s).toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .normalize('NFKD').replace(/[^\x00-\x7f]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

// ── Datum (alles in Ortszeit Europe/Berlin) ──────────────────────────
const MONATE = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
const TAGE = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];
const teile = d => { const [j, m, t] = d.slice(0, 10).split('-').map(Number); return { j, m, t }; };
const wochentag = d => { const { j, m, t } = teile(d); return TAGE[new Date(Date.UTC(j, m - 1, t)).getUTCDay()]; };
const datumLang = d => { const { j, m, t } = teile(d); return `${t}. ${MONATE[m - 1]} ${j}`; };
function gueltigesDatum(d) {
  if (!DATUM_RE.test(d)) return false;
  const { j, m, t } = teile(d);
  const x = new Date(Date.UTC(j, m - 1, t));
  return x.getUTCFullYear() === j && x.getUTCMonth() === m - 1 && x.getUTCDate() === t;
}
// 'YYYY-MM-DDTHH:MM' (Berliner Ortszeit) → ISO 8601 mit Zeitzonen-Versatz, z. B. 2026-11-28T10:00:00+01:00
function berlinIso(lokal) {
  const tz = new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Berlin', timeZoneName: 'longOffset' })
    .formatToParts(new Date(`${lokal}:00Z`)).find(p => p.type === 'timeZoneName').value;   // "GMT+01:00"
  return `${lokal}:00${tz.replace('GMT', '') || '+00:00'}`;
}
const uhr = z => z.slice(11, 16);

function eventDatum(v) {
  const a = v.start.slice(0, 10), b = (v.ende || v.start).slice(0, 10);
  if (a === b) return `${wochentag(a)}, ${datumLang(a)}`;
  const A = teile(a), B = teile(b);
  const kurz = d => wochentag(d).slice(0, 2);
  if (A.j === B.j && A.m === B.m) return `${kurz(a)}, ${A.t}. – ${kurz(b)}, ${datumLang(b)}`;
  return `${kurz(a)}, ${datumLang(a)} – ${kurz(b)}, ${datumLang(b)}`;
}
function eventZeit(v) {
  if (v.zeiten) return v.zeiten;
  if (!v.ende) return `ab ${uhr(v.start)} Uhr`;
  if (v.start.slice(0, 10) === v.ende.slice(0, 10)) return `${uhr(v.start)}–${uhr(v.ende)} Uhr`;
  return `Beginn ${uhr(v.start)} Uhr, Ende ${uhr(v.ende)} Uhr`;
}

// ── Links / Markdown ────────────────────────────────────────────────
// Erlaubt: /pfad, #anker, https://…, mailto:, tel:. Alles andere wird nicht verlinkt.
function safeUrl(u) {
  u = String(u || '').trim();
  if (!u || u.length > MAX.url || /[\s<>"'\\\u0000-\u001f]/.test(u)) return null;
  if (u.startsWith('//')) return null;
  if (u.startsWith('/') || u.startsWith('#')) return u;
  if (/^https:\/\/[^/]+\.[^/]+/i.test(u)) return u;
  if (/^mailto:[^@\s]+@[^@\s]+$/i.test(u) || /^tel:\+?[0-9 ()/-]+$/i.test(u)) return u.replace(/ /g, '');
  return null;
}
const extern = u => /^https:/i.test(u) && !/^https:\/\/(www\.)?randl\.group(\/|$)/i.test(u);

function fmt(s) {
  return esc(s)
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*\s](?:[^*]*[^*\s])?)\*(?!\*)/g, '$1<em>$2</em>');
}
function inline(s) {
  const re = /!?\[([^\]\n]+)\]\(([^)\s]+)\)/g;
  let out = '', last = 0, m;
  while ((m = re.exec(s)) !== null) {
    out += fmt(s.slice(last, m.index));
    const href = m[0][0] === '!' ? null : safeUrl(m[2]);
    out += href ? `<a href="${esc(href)}"${extern(href) ? ' target="_blank" rel="noopener"' : ''}>${fmt(m[1])}</a>` : fmt(m[1]);
    last = re.lastIndex;
  }
  return out + fmt(s.slice(last));
}

function bildTag(b, { sizes, cls = '', lazy = true, prio = false } = {}) {
  return `<img src="/news/img/full/${b.file}" srcset="/news/img/thumb/${b.file} ${b.tw}w, /news/img/full/${b.file} ${b.w}w"`
    + ` sizes="${sizes || '(max-width: 840px) 100vw, 800px'}" width="${b.w}" height="${b.h}" alt="${esc(b.alt || '')}"`
    + (cls ? ` class="${cls}"` : '') + (prio ? ' fetchpriority="high"' : lazy ? ' loading="lazy" decoding="async"' : '') + ' />';
}

// Kleiner, bewusst begrenzter Markdown-Umfang: ## / ### Überschrift, **fett**, *kursiv*, Listen (- oder 1.),
// [Text](Link), ![Alt](/news/img/full/datei.webp). HTML im Text wird immer maskiert.
function markdown(text, bilder = {}) {
  const lines = String(text || '').replace(/\r\n?/g, '\n').split('\n');
  const out = [];
  let i = 0;
  const leer = l => !l.trim();
  const ul = l => /^\s*[-*]\s+/.test(l), ol = l => /^\s*\d+[.)]\s+/.test(l);
  const kopf = l => /^#{1,6}\s+/.test(l);
  const bild = l => /^\s*!\[([^\]]*)\]\(([^)\s]+)\)\s*$/.exec(l);
  while (i < lines.length) {
    const l = lines[i];
    if (leer(l)) { i++; continue; }
    if (kopf(l)) {
      const tiefe = l.match(/^#+/)[0].length;
      out.push(`<h${tiefe <= 2 ? 2 : 3}>${inline(l.replace(/^#+\s+/, '').replace(/\s+#+\s*$/, '').trim())}</h${tiefe <= 2 ? 2 : 3}>`);
      i++; continue;
    }
    if (ul(l) || ol(l)) {
      const ist = ul(l) ? ul : ol, tag = ul(l) ? 'ul' : 'ol', items = [];
      while (i < lines.length && ist(lines[i])) { items.push(lines[i].replace(/^\s*(?:[-*]|\d+[.)])\s+/, '')); i++; }
      out.push(`<${tag}>\n${items.map(x => `  <li>${inline(x.trim())}</li>`).join('\n')}\n</${tag}>`);
      continue;
    }
    const b = bild(l);
    if (b) {
      const datei = (/^\/news\/img\/full\/([a-z0-9-]+-[0-9a-f]{8}\.webp)$/.exec(b[2]) || [])[1];
      const eintrag = datei && bilder[datei];
      if (eintrag) out.push(`<figure>${bildTag({ ...eintrag, alt: b[1].trim() || eintrag.alt })}${eintrag.nachweis ? `<figcaption class="n-credit">${esc(eintrag.nachweis)}</figcaption>` : ''}</figure>`);
      i++; continue;
    }
    const absatz = [];
    while (i < lines.length && !leer(lines[i]) && !kopf(lines[i]) && !ul(lines[i]) && !ol(lines[i]) && !bild(lines[i])) { absatz.push(lines[i].trim()); i++; }
    out.push(`<p>${absatz.map(inline).join('<br>\n')}</p>`);
  }
  return out.join('\n');
}

// ── Laden / Speichern ────────────────────────────────────────────────
function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch (e) { if (e.code === 'ENOENT' && fallback !== undefined) return fallback; throw e; }
}
function writeAtomic(file, text) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, text, 'utf8');
  fs.renameSync(tmp, file);
}
// Schreibt nur bei Änderung (kein Zeitstempel-Rauschen im Sync nach GitHub). true = geschrieben.
function writeIfChanged(file, text) {
  try { if (fs.readFileSync(file, 'utf8') === text) return false; } catch (e) { if (e.code !== 'ENOENT') throw e; }
  writeAtomic(file, text);
  return true;
}

function load() {
  const d = readJson(DATA(), {});
  return { version: 1, beitraege: d.beitraege || [], bilder: d.bilder || [], gebaut: d.gebaut || [], geaendert: d.geaendert || null };
}
function save(data) {
  const file = DATA();
  if (fs.existsSync(file)) {
    const dir = BACKUP();
    fs.mkdirSync(dir, { recursive: true });
    fs.copyFileSync(file, path.join(dir, `${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}.json`));
    const alt = fs.readdirSync(dir).filter(f => f.endsWith('.json')).sort();
    for (const f of alt.slice(0, Math.max(0, alt.length - 60))) fs.rmSync(path.join(dir, f), { force: true });
  }
  data.geaendert = now();
  writeAtomic(file, JSON.stringify(data, null, 1) + '\n');
}

const imgPath = (size, file) => path.join(NEWS(), 'img', size, file);
const bildMap = data => Object.fromEntries(data.bilder.map(b => [b.file, b]));
const veroeffentlicht = data => data.beitraege.filter(b => b.status === 'veroeffentlicht')
  .sort((a, b) => b.datum.localeCompare(a.datum) || String(b.erstellt).localeCompare(String(a.erstellt)));

// ── Prüfen ───────────────────────────────────────────────────────────
function validateVeranstaltung(src, errors) {
  if (!src || typeof src !== 'object') return null;
  const v = {
    start: String(src.start || '').slice(0, 16), ende: String(src.ende || '').slice(0, 16),
    ort: clean(src.ort, MAX.ort), strasse: clean(src.strasse, MAX.ort), plz: clean(src.plz, 10), stadt: clean(src.stadt, MAX.ort),
    zeiten: clean(src.zeiten, MAX.zeiten), url: String(src.url || '').trim(),
  };
  if (!ZEIT_RE.test(v.start) || !gueltigesDatum(v.start.slice(0, 10))) errors.push('Veranstaltung: Start fehlt oder ist ungültig');
  if (v.ende && (!ZEIT_RE.test(v.ende) || !gueltigesDatum(v.ende.slice(0, 10)))) errors.push('Veranstaltung: Ende ist ungültig');
  else if (v.ende && v.ende < v.start) errors.push('Veranstaltung: Ende liegt vor dem Start');
  if (!v.ort) errors.push('Veranstaltung: Ort fehlt');
  if (v.url && !(safeUrl(v.url) && /^https:/i.test(v.url))) errors.push('Veranstaltung: Link nur als https://…');
  if (!v.ende) delete v.ende;
  return v;
}

// Gibt { ok, errors, value } zurück. data = aktueller Stand, id = Beitrag, der gerade bearbeitet wird (sonst null).
function validate(input, data, id = null) {
  const errors = [];
  const src = input && typeof input === 'object' ? input : {};
  const titel = clean(src.titel, MAX.titel + 1);
  const slug = String(src.slug || '').trim() || slugify(titel).slice(0, MAX.slug).replace(/-+$/, '');
  const datum = String(src.datum || '').trim();
  const status = src.status === undefined ? 'entwurf' : src.status;
  const teaser = clean(src.teaser, MAX.teaser + 1);
  const text = String(src.text || '').replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000b-\u001f]/g, '').trim();
  const bilder = bildMap(data);
  const titelbild = src.titelbild || null;
  const galerie = Array.isArray(src.galerie) ? [...new Set(src.galerie)] : [];

  if (titel.length < 3) errors.push('Titel fehlt');
  if (titel.length > MAX.titel) errors.push(`Titel: max. ${MAX.titel} Zeichen`);
  if (!SLUG_RE.test(slug) || slug.length > MAX.slug) errors.push('Slug: nur a–z, 0–9 und Bindestrich');
  else if (RESERVIERT.has(slug)) errors.push(`Slug „${slug}“ ist reserviert`);
  else if (data.beitraege.some(b => b.slug === slug && b.id !== id)) errors.push(`Slug „${slug}“ ist schon vergeben`);
  if (!gueltigesDatum(datum)) errors.push('Datum fehlt oder ist ungültig');
  if (!SPARTE[src.sparte]) errors.push('Sparte fehlt');
  if (!STATUS.includes(status)) errors.push('Ungültiger Status');
  if (teaser.length > MAX.teaser) errors.push(`Teaser: max. ${MAX.teaser} Zeichen`);
  if (text.length > MAX.text) errors.push(`Text: max. ${MAX.text} Zeichen`);
  if (status === 'veroeffentlicht') {
    if (!teaser) errors.push('Zum Veröffentlichen fehlt der Teaser');
    if (!text) errors.push('Zum Veröffentlichen fehlt der Text');
  }
  if (titelbild && !bilder[titelbild]) errors.push('Titelbild nicht in der Bilderverwaltung gefunden');
  if (galerie.length > MAX.galerie) errors.push(`Bildergalerie: max. ${MAX.galerie} Bilder`);
  if (galerie.some(f => !bilder[f])) errors.push('Bildergalerie enthält ein unbekanntes Bild');
  const veranstaltung = validateVeranstaltung(src.veranstaltung, errors);

  if (errors.length) return { ok: false, errors };
  return { ok: true, errors: [], value: { titel, slug, datum, sparte: src.sparte, teaser, text, titelbild, galerie, status, veranstaltung } };
}

// ── Rendern ──────────────────────────────────────────────────────────
const urlOf = p => `/news/${p.slug}/`;
const jsonLd = obj => `  <script type="application/ld+json">\n${JSON.stringify(obj, null, 2).replace(/</g, '\\u003c')}\n  </script>`;
const VERLAG = { '@type': 'Organization', name: 'Dominik Randl', url: `${SITE}/`, logo: { '@type': 'ImageObject', url: `${SITE}/logo.png` } };

function fill(tpl, werte) {
  return tpl.replace(/\{\{([A-Z_]+)\}\}/g, (m, k) => (k in werte ? werte[k] : ''));
}
function seite(tpl, { title, description, canonical, ogType, ogImage, head, main, sparte, vorschau }) {
  const aktiv = id => (sparte === id ? ' class="active"' : '');
  return fill(tpl, {
    BASE: vorschau ? `<base href="${SITE}/" />\n  ` : '',
    TITLE: esc(title), OG_TITLE: esc(title.replace(/ \| Dominik Randl$/, '')), DESCRIPTION: esc(description),
    CANONICAL: esc(canonical), ROBOTS: vorschau ? 'noindex, nofollow' : 'index, follow',
    OG_TYPE: ogType, OG_IMAGE: esc(ogImage), HEAD: head, MAIN: main,
    ACTIVE_ZELT: aktiv('zelt'), ACTIVE_MASCHINENBAU: aktiv('maschinenbau'), ACTIVE_GAS: aktiv('gas'),
  });
}

function ctaBand(sparte) {
  const c = SPARTE[sparte].cta;
  return `    <section class="cta-band">
      <div class="cta-band-content container">
        <div class="cta-band-label">${esc(c.label)}</div>
        <h2 class="cta-band-title">${c.titel}</h2>
        <p class="cta-band-sub">${esc(c.sub)}</p>
        <div class="cta-band-actions">
          <a href="${c.url}" class="btn-primary">Anfrage stellen</a>
          <a href="tel:+491714585063" class="btn-tel">+49 (0) 171 45 850 63</a>
        </div>
      </div>
    </section>`;
}

function eventBox(v) {
  const adresse = [v.strasse, [v.plz, v.stadt].filter(Boolean).join(' ')].filter(Boolean).join(', ');
  return `        <aside class="n-event" aria-label="Veranstaltung">
          <h2>Auf einen Blick</h2>
          <dl>
            <div><dt>Datum</dt><dd>${esc(eventDatum(v))}</dd></div>
            <div><dt>Uhrzeit</dt><dd>${esc(eventZeit(v))}</dd></div>
            <div><dt>Ort</dt><dd>${esc(v.ort)}${adresse ? `<small>${esc(adresse)}</small>` : ''}</dd></div>${v.url ? `
            <div><dt>Mehr dazu</dt><dd><a href="${esc(v.url)}" target="_blank" rel="noopener">Zur Veranstaltung ↗</a></dd></div>` : ''}
          </dl>
        </aside>`;
}

function eventSchema(p, bild) {
  const v = p.veranstaltung;
  const adresse = { '@type': 'PostalAddress', addressCountry: 'DE' };
  if (v.strasse) adresse.streetAddress = v.strasse;
  if (v.plz) adresse.postalCode = v.plz;
  if (v.stadt) adresse.addressLocality = v.stadt;
  const e = {
    '@context': 'https://schema.org', '@type': 'Event', name: p.titel, description: p.teaser,
    startDate: berlinIso(v.start),
  };
  if (v.ende) e.endDate = berlinIso(v.ende);
  Object.assign(e, {
    eventStatus: 'https://schema.org/EventScheduled',
    eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
    location: { '@type': 'Place', name: v.ort, address: adresse },
    url: v.url || `${SITE}${urlOf(p)}`,
  });
  if (bild) e.image = [`${SITE}/news/img/full/${bild.file}`];
  return e;
}

function renderBeitrag(tpl, p, data, { vorschau = false } = {}) {
  const bilder = bildMap(data);
  const s = SPARTE[p.sparte];
  const cover = p.titelbild && bilder[p.titelbild];
  const url = `${SITE}${urlOf(p)}`;
  const galerie = (p.galerie || []).map(f => bilder[f]).filter(Boolean);
  const ogImage = cover ? `${SITE}/news/img/full/${cover.file}` : `${SITE}/og-image.png`;

  const posting = {
    '@context': 'https://schema.org', '@type': 'BlogPosting',
    mainEntityOfPage: { '@type': 'WebPage', '@id': url },
    headline: p.titel, description: p.teaser, inLanguage: 'de-DE', articleSection: s.titel,
    datePublished: berlinIso(`${p.datum}T08:00`),
    dateModified: p.geaendert && Date.parse(p.geaendert) > Date.parse(berlinIso(`${p.datum}T08:00`)) ? p.geaendert : berlinIso(`${p.datum}T08:00`),
    author: VERLAG, publisher: VERLAG,
  };
  if (cover) posting.image = [ogImage];
  const krumen = {
    '@context': 'https://schema.org', '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Startseite', item: `${SITE}/` },
      { '@type': 'ListItem', position: 2, name: 'Aktuelles', item: `${SITE}/news/` },
      { '@type': 'ListItem', position: 3, name: p.titel, item: url },
    ],
  };
  const head = [jsonLd(posting), jsonLd(krumen), p.veranstaltung ? jsonLd(eventSchema(p, cover)) : '',
    `  <meta property="article:published_time" content="${posting.datePublished}" />`,
    `  <meta property="article:section" content="${esc(s.titel)}" />`].filter(Boolean).join('\n');

  const label = p.sparte === 'allgemein' ? `<span class="n-label">Aktuelles</span>`
    : `<a class="n-label" href="${s.url}">${esc(s.titel)}</a>`;
  const main = `    <article>
      <header class="n-hero">
        <div class="container n-narrow">
          <nav class="n-crumb" aria-label="Brotkrumen"><a href="/">Startseite</a><span aria-hidden="true">/</span><a href="/news/">Aktuelles</a><span aria-hidden="true">/</span>${esc(p.titel)}</nav>
          ${label}
          <h1>${esc(p.titel)}</h1>
          ${p.teaser ? `<p class="n-lead">${esc(p.teaser)}</p>` : ''}
          <p class="n-date">Veröffentlicht am <time datetime="${p.datum}">${datumLang(p.datum)}</time></p>
        </div>
      </header>
      <div class="n-article">
        <div class="container n-narrow">
${cover ? `        <figure class="n-cover">${bildTag(cover, { prio: true })}${cover.nachweis ? `<figcaption class="n-credit">${esc(cover.nachweis)}</figcaption>` : ''}</figure>\n` : ''}${p.veranstaltung ? eventBox(p.veranstaltung) + '\n' : ''}        <div class="n-body">
${markdown(p.text, bilder)}
        </div>
${galerie.length ? `        <h2 class="n-h2">Bilder</h2>
        <div class="n-gal">
${galerie.map(b => `          <a href="/news/img/full/${b.file}"><img src="/news/img/thumb/${b.file}" width="${b.tw}" height="${b.th}" alt="${esc(b.alt || '')}" loading="lazy" decoding="async" /></a>`).join('\n')}
        </div>\n` : ''}        <p class="n-foot"><a class="n-back" href="/news/">← Alle Beiträge</a></p>
        </div>
      </div>
    </article>
${ctaBand(p.sparte)}`;

  return seite(tpl, {
    title: `${p.titel} | Dominik Randl`, description: p.teaser || p.titel, canonical: url,
    ogType: 'article', ogImage, head, main, sparte: p.sparte, vorschau,
  });
}

function karte(p, bilder, { tag = 'h2', klasse = 'n', datum = true } = {}) {
  const b = p.titelbild && bilder[p.titelbild];
  const s = SPARTE[p.sparte];
  if (klasse === 'akt') {
    return `      <a class="akt-card" href="${urlOf(p)}">
        ${b ? `<div class="akt-img"><img src="/news/img/thumb/${b.file}" width="${b.tw}" height="${b.th}" alt="${esc(b.alt || '')}" loading="lazy" decoding="async" /></div>` : ''}
        <div class="akt-body">
          <span class="akt-sparte">${esc(s.titel)}</span>
          <${tag} class="akt-title">${esc(p.titel)}</${tag}>
          <p class="akt-text">${esc(p.teaser)}</p>
          <span class="akt-more">Weiterlesen →</span>
        </div>
      </a>`;
  }
  return `          <a class="n-card" href="${urlOf(p)}" data-sparte="${p.sparte}">
            ${b ? `<div class="n-card-img"><img src="/news/img/thumb/${b.file}" width="${b.tw}" height="${b.th}" alt="${esc(b.alt || '')}" loading="lazy" decoding="async" /></div>` : ''}
            <div class="n-card-body">
              <span class="n-card-sparte">${esc(s.titel)}</span>
              <${tag}>${esc(p.titel)}</${tag}>
              <p>${esc(p.teaser)}</p>
              <div class="n-card-meta">${datum ? `<time datetime="${p.datum}">${datumLang(p.datum)}</time>` : '<span></span>'}<span class="n-card-more">Weiterlesen →</span></div>
            </div>
          </a>`;
}

function renderUebersicht(tpl, posts, data) {
  const bilder = bildMap(data);
  const url = `${SITE}/news/`;
  const description = 'Aktuelles von Dominik Randl im Chiemgau: neue Zelte und Pakete, Messen, Referenz-Aufbauten und Neuigkeiten aus Zeltverleih, Maschinenbau und Gashandel.';
  const sparten = SPARTEN.filter(s => posts.some(p => p.sparte === s.id));
  const filter = sparten.length > 1
    ? `        <div class="n-filter" role="toolbar" aria-label="Beiträge nach Sparte filtern"><button type="button" class="n-chip active" data-filter="alle">Alle</button>${sparten.map(s => `<button type="button" class="n-chip" data-filter="${s.id}">${esc(s.titel)}</button>`).join('')}</div>\n`
    : '';
  const head = [jsonLd({
    '@context': 'https://schema.org', '@type': 'CollectionPage', name: 'Aktuelles – Dominik Randl', url, inLanguage: 'de-DE',
    isPartOf: { '@type': 'WebSite', name: 'Dominik Randl', url: `${SITE}/` },
    breadcrumb: { '@type': 'BreadcrumbList', itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Startseite', item: `${SITE}/` },
      { '@type': 'ListItem', position: 2, name: 'Aktuelles', item: url }] },
    mainEntity: { '@type': 'ItemList', itemListElement: posts.map((p, i) => ({ '@type': 'ListItem', position: i + 1, url: `${SITE}${urlOf(p)}`, name: p.titel })) },
  })].join('\n');
  const main = `    <header class="n-hero">
      <div class="container">
        <nav class="n-crumb" aria-label="Brotkrumen"><a href="/">Startseite</a><span aria-hidden="true">/</span>Aktuelles</nav>
        <h1>Aktuelles</h1>
        <p class="n-lead">Neue Zelte und Pakete, Messen, Referenz-Aufbauten und Neuigkeiten aus Zeltverleih, Maschinenbau und Gashandel.</p>
      </div>
    </header>
    <section class="n-list">
      <div class="container">
${filter}${posts.length ? `        <div class="n-grid">
${posts.map(p => karte(p, bilder)).join('\n')}
        </div>` : '        <p class="n-empty">Im Moment gibt es hier keine Beiträge.</p>'}
      </div>
    </section>
${ctaBand('allgemein')}`;
  let html = seite(tpl, { title: 'Aktuelles | Dominik Randl', description, canonical: url, ogType: 'website', ogImage: `${SITE}/og-image.png`, head, main, sparte: null });
  if (!posts.length) html = html.replace('content="index, follow"', 'content="noindex, follow"');
  return html;
}

// Teaser-Block für Startseite (layout="start") und Sparten-Seiten (layout="sparte"). Ohne Beiträge bleibt der Block leer.
function attrs(s) {
  const a = {}; const re = /([a-z]+)="([^"]*)"/g; let m;
  while ((m = re.exec(s)) !== null) a[m[1]] = m[2];
  return a;
}
function renderTeaser(roh, posts, data) {
  const a = attrs(roh);
  const sparte = SPARTE[a.sparte] ? a.sparte : 'alle';
  const max = Math.min(6, Math.max(1, parseInt(a.max, 10) || 3));
  const liste = posts.filter(p => sparte === 'alle' || p.sparte === sparte).slice(0, max);
  const start = `<!-- AKTUELLES:START${roh}-->`;
  if (!liste.length) return `${start}\n<!-- AKTUELLES:END -->`;
  const bilder = bildMap(data);
  const karten = liste.map(p => karte(p, bilder, { tag: 'h3', klasse: 'akt' })).join('\n');
  const alle = `<p class="akt-all"><a href="/news/${sparte === 'alle' ? '' : '#' + sparte}">Alle Beiträge →</a></p>`;
  const titel = sparte === 'alle' ? 'Neues aus dem Betrieb' : SPARTE[sparte].teaser;
  const block = a.layout === 'start'
    ? `<section class="content-section akt" id="aktuelles" aria-labelledby="akt-titel">
  <div class="content-inner akt-inner">
    <p class="content-eyebrow">Aktuelles</p>
    <h2 class="content-title" id="akt-titel">${esc(titel)}</h2>
    <div class="akt-grid">
${karten}
    </div>
    ${alle}
  </div>
</section>`
    : `<section class="${esc(a.klasse || 'section')} akt" id="aktuelles" aria-labelledby="akt-titel">
  <div class="container">
    <div class="section-header">
      <div class="section-label">Aktuelles</div>
      <h2 class="section-title" id="akt-titel">${esc(titel)}</h2>
    </div>
    <div class="akt-grid">
${karten}
    </div>
    ${alle}
  </div>
</section>`;
  return `${start}\n${block}\n<!-- AKTUELLES:END -->`;
}

function renderSitemap(posts) {
  const eintrag = (loc, prio, lastmod) => `  <url>\n    <loc>${SITE}${loc}</loc>\n${lastmod ? `    <lastmod>${lastmod}</lastmod>\n` : ''}    <priority>${prio}</priority>\n    <changefreq>monthly</changefreq>\n  </url>`;
  const stand = p => (p.geaendert && p.geaendert.slice(0, 10) > p.datum ? p.geaendert.slice(0, 10) : p.datum);
  const zeilen = posts.length
    ? [eintrag('/news/', '0.7', posts.map(stand).sort().pop()), ...posts.map(p => eintrag(urlOf(p), '0.6', stand(p)))]
    : [];
  return ['  <!-- AKTUELLES:START (automatisch aus dem Mitarbeiterportal – nicht von Hand ändern) -->', ...zeilen, '  <!-- AKTUELLES:END -->'].join('\n');
}

// ── Build ────────────────────────────────────────────────────────────
function vorlage() {
  try { return fs.readFileSync(path.join(NEWS(), '.vorlage.html'), 'utf8'); }
  catch (e) {
    if (e.code === 'ENOENT') throw fail(503, 'Vorlage news/.vorlage.html fehlt auf der Website (randl-website/tools/aktuelles/deploy.py ausführen)');
    throw e;
  }
}

// Erzeugt alle öffentlichen Dateien aus dem Stand in data. Ändert data.gebaut, speichert data aber nicht.
function build(data) {
  const tpl = vorlage();
  if (!tpl.includes('{{MAIN}}')) throw fail(503, 'Vorlage news/.vorlage.html enthält keinen Platzhalter {{MAIN}}');
  const posts = veroeffentlicht(data);
  const bericht = { seiten: 0, entfernt: [], warnungen: [] };

  for (const p of posts) {
    if (writeIfChanged(path.join(NEWS(), p.slug, 'index.html'), renderBeitrag(tpl, p, data))) bericht.seiten++;
  }
  // Zurückgezogene / gelöschte / umbenannte Beiträge: Ordner entfernen (nur Ordner, die dieser Build selbst angelegt hat)
  const aktiv = new Set(posts.map(p => p.slug));
  for (const slug of data.gebaut) {
    if (aktiv.has(slug) || !SLUG_RE.test(slug) || RESERVIERT.has(slug)) continue;
    const dir = path.join(NEWS(), slug);
    fs.rmSync(path.join(dir, 'index.html'), { force: true });
    try { fs.rmdirSync(dir); } catch (e) { if (e.code !== 'ENOENT') bericht.warnungen.push(`Ordner news/${slug}/ nicht leer, bleibt stehen`); }
    bericht.entfernt.push(slug);
  }
  data.gebaut = [...aktiv];

  writeIfChanged(path.join(NEWS(), 'index.html'), renderUebersicht(tpl, posts, data));
  const bilder = bildMap(data);
  writeIfChanged(path.join(NEWS(), 'news.json'), JSON.stringify({
    version: 1,
    beitraege: posts.slice(0, 12).map(p => {
      const b = p.titelbild && bilder[p.titelbild];
      return { slug: p.slug, url: urlOf(p), titel: p.titel, teaser: p.teaser, sparte: p.sparte, sparteTitel: SPARTE[p.sparte].titel, datum: p.datum,
        bild: b ? { src: `/news/img/thumb/${b.file}`, w: b.tw, h: b.th, alt: b.alt || '' } : null };
    }),
  }, null, 1) + '\n');

  // Sitemap
  const sm = path.join(ROOT(), 'sitemap.xml');
  if (fs.existsSync(sm)) {
    const alt = fs.readFileSync(sm, 'utf8');
    const block = renderSitemap(posts);
    let neu = alt;
    if (/[ \t]*<!-- AKTUELLES:START[\s\S]*?<!-- AKTUELLES:END -->/.test(alt)) neu = alt.replace(/[ \t]*<!-- AKTUELLES:START[\s\S]*?<!-- AKTUELLES:END -->/, () => block);
    else if (alt.includes('</urlset>')) neu = alt.replace('</urlset>', () => `${block}\n</urlset>`);
    else bericht.warnungen.push('sitemap.xml: </urlset> nicht gefunden');
    writeIfChanged(sm, neu);
  } else bericht.warnungen.push('sitemap.xml fehlt');

  // Teaser auf Startseite und Sparten-Seiten
  for (const rel of TEASER_SEITEN) {
    const file = path.join(ROOT(), rel);
    if (!fs.existsSync(file)) { bericht.warnungen.push(`${rel} fehlt`); continue; }
    const alt = fs.readFileSync(file, 'utf8');
    if (!alt.includes('<!-- AKTUELLES:START')) { bericht.warnungen.push(`${rel}: Marker AKTUELLES:START/END fehlt, kein Teaser`); continue; }
    writeIfChanged(file, alt.replace(MARKER_RE, (_m, roh) => renderTeaser(roh, posts, data)));
  }
  return bericht;
}

function mutate(fn) {
  const data = load();
  const result = fn(data) || {};
  const bericht = build(data);
  save(data);
  return { ok: true, ...result, build: bericht };
}

// ── Beiträge ─────────────────────────────────────────────────────────
function list() {
  const data = load();
  const bilder = bildMap(data);
  return {
    sparten: SPARTEN.map(({ id, titel }) => ({ id, titel })),
    limits: MAX,
    beitraege: [...data.beitraege]
      .sort((a, b) => b.datum.localeCompare(a.datum) || String(b.erstellt).localeCompare(String(a.erstellt)))
      .map(({ text, ...b }) => ({ ...b, url: `${SITE}${urlOf(b)}`, thumb: b.titelbild && bilder[b.titelbild] ? `${SITE}/news/img/thumb/${b.titelbild}` : null })),
  };
}
function find(data, id) {
  const b = ID_RE.test(String(id)) && data.beitraege.find(x => x.id === id);
  if (!b) throw fail(404, 'Beitrag nicht gefunden');
  return b;
}
function get(id) {
  const b = find(load(), id);
  return { ...b, url: `${SITE}${urlOf(b)}` };
}
function create(input, user) {
  return mutate(data => {
    const r = validate(input, data);
    if (!r.ok) throw Object.assign(fail(400, r.errors.join('; ')), { errors: r.errors });
    const b = { id: crypto.randomBytes(4).toString('hex'), ...r.value, erstellt: now(), geaendert: now(), von: user || null };
    data.beitraege.push(b);
    return { beitrag: { ...b, url: `${SITE}${urlOf(b)}` } };
  });
}
function update(id, input, user) {
  return mutate(data => {
    const b = find(data, id);
    const r = validate(input, data, id);
    if (!r.ok) throw Object.assign(fail(400, r.errors.join('; ')), { errors: r.errors });
    Object.assign(b, r.value, { geaendert: now(), von: user || b.von || null });
    return { beitrag: { ...b, url: `${SITE}${urlOf(b)}` } };
  });
}
function remove(id) {
  return mutate(data => {
    const b = find(data, id);
    data.beitraege = data.beitraege.filter(x => x.id !== id);
    return { geloescht: b.slug };
  });
}
// Vorschau: fertige Seite als HTML, auch für Entwürfe und ungespeicherte Eingaben. Schreibt nichts.
function preview(input, id = null) {
  const data = load();
  const basis = id ? find(data, id) : {};
  const r = validate({ ...input, status: 'entwurf' }, data, id);
  if (!r.ok) throw Object.assign(fail(400, r.errors.join('; ')), { errors: r.errors });
  return renderBeitrag(vorlage(), { ...basis, ...r.value, geaendert: now() }, data, { vorschau: true });
}
function rebuild() {
  return mutate(() => ({}));
}

// ── Bilder (Tab „Aktuelles“ der Bilderverwaltung, Ordner news/img/) ──
function verwendung(data, file) {
  return data.beitraege.filter(b => b.titelbild === file || (b.galerie || []).includes(file) || String(b.text || '').includes(`/news/img/full/${file}`))
    .map(b => b.titel);
}
function listBilder() {
  const data = load();
  return {
    limits: { alt: MAX.alt, nachweis: MAX.nachweis },
    bilder: [...data.bilder].reverse().map(b => ({ ...b, url: `${SITE}/news/img/full/${b.file}`, thumb: `${SITE}/news/img/thumb/${b.file}`, verwendet: verwendung(data, b.file) })),
  };
}
async function uploadBilder(dateien, { alt, nachweis } = {}, user) {
  const sharp = require('sharp');
  const data = load();
  const vorhanden = new Map(data.bilder.map(b => [b.file.slice(-13, -5), b]));
  const neu = [], doppelt = [];
  for (const d of dateien) {
    const sha = crypto.createHash('sha1').update(d.buffer).digest('hex').slice(0, 8);
    if (vorhanden.has(sha)) { doppelt.push(vorhanden.get(sha).file); continue; }
    const text = clean(alt, MAX.alt);
    const basis = slugify(text || String(d.name || '').replace(/\.[^.]+$/, '')).slice(0, 50).replace(/-+$/, '') || 'bild';
    const file = `${basis}-${sha}.webp`;
    const img = sharp(d.buffer, { failOn: 'error' }).rotate();          // EXIF-Drehung anwenden; Metadaten werden nicht übernommen
    for (const size of ['full', 'thumb']) fs.mkdirSync(path.dirname(imgPath(size, file)), { recursive: true });
    const full = await img.clone().resize({ width: FULL_MAX, height: FULL_MAX, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 80 }).toFile(imgPath('full', file));
    const th = await img.clone().resize({ width: THUMB_W, withoutEnlargement: true }).webp({ quality: 72 }).toFile(imgPath('thumb', file));
    const e = { file, w: full.width, h: full.height, tw: th.width, th: th.height, alt: text, nachweis: clean(nachweis, MAX.nachweis), hochgeladen: now(), von: user || null };
    neu.push(e); vorhanden.set(sha, e);
  }
  if (neu.length) { const d2 = load(); d2.bilder.push(...neu); save(d2); }   // kein Build nötig: neue Bilder sind noch nirgends eingebunden
  return { ok: true, hinzugefuegt: neu.map(e => e.file), doppelt };
}
function updateBild(file, { alt, nachweis }) {
  if (!FILE_RE.test(String(file))) throw fail(400, 'Ungültiger Dateiname');
  return mutate(data => {
    const b = data.bilder.find(x => x.file === file);
    if (!b) throw fail(404, 'Bild nicht gefunden');
    if (alt !== undefined) b.alt = clean(alt, MAX.alt);
    if (nachweis !== undefined) b.nachweis = clean(nachweis, MAX.nachweis);
    return {};
  });
}
function removeBild(file) {
  if (!FILE_RE.test(String(file))) throw fail(400, 'Ungültiger Dateiname');
  const data = load();
  if (!data.bilder.some(b => b.file === file)) throw fail(404, 'Bild nicht gefunden');
  const benutzt = verwendung(data, file);
  if (benutzt.length) throw fail(409, `Bild wird noch verwendet in: ${benutzt.join(', ')}`);
  data.bilder = data.bilder.filter(b => b.file !== file);
  save(data);
  for (const size of ['full', 'thumb']) fs.rmSync(imgPath(size, file), { force: true });
  return { ok: true, geloescht: file };
}

module.exports = {
  list, get, create, update, remove, preview, rebuild,
  listBilder, uploadBilder, updateBild, removeBild,
  validate, markdown, slugify, safeUrl, berlinIso, eventDatum, eventZeit, renderTeaser, renderSitemap, load,
  SPARTEN, MAX,
};
