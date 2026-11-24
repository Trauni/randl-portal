'use strict';
const test   = require('node:test');
const assert = require('node:assert');
const fs     = require('fs');
const os     = require('os');
const path   = require('path');
const sharp  = require('sharp');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'aktuelles-'));
process.env.AKTUELLES_ROOT = path.join(tmp, 'web');
process.env.AKTUELLES_BACKUP_DIR = path.join(tmp, 'backup');
const akt = require('../src/services/aktuelles');
const ROOT = process.env.AKTUELLES_ROOT;

const VORLAGE = '<html><head>{{BASE}}<title>{{TITLE}}</title><meta name="description" content="{{DESCRIPTION}}"><meta name="robots" content="{{ROBOTS}}">'
  + '<link rel="canonical" href="{{CANONICAL}}"><meta property="og:image" content="{{OG_IMAGE}}">\n{{HEAD}}\n</head><body><nav><a href="/zelt/"{{ACTIVE_ZELT}}>Zelt</a></nav><main>\n{{MAIN}}\n</main></body></html>';
const SITEMAP = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  <url>\n    <loc>https://randl.group/</loc>\n  </url>\n</urlset>\n';
const seite = attrs => `<html><body><h1>Seite</h1>\n<!-- AKTUELLES:START ${attrs} -->\n<!-- AKTUELLES:END -->\n<footer></footer></body></html>`;

function setup() {
  fs.rmSync(tmp, { recursive: true, force: true });
  for (const d of ['news', 'zelt', 'metall', 'gas']) fs.mkdirSync(path.join(ROOT, d), { recursive: true });
  fs.writeFileSync(path.join(ROOT, 'news/.vorlage.html'), VORLAGE);
  fs.writeFileSync(path.join(ROOT, 'sitemap.xml'), SITEMAP);
  fs.writeFileSync(path.join(ROOT, 'index.html'), seite('sparte="alle" layout="start" max="3"'));
  fs.writeFileSync(path.join(ROOT, 'zelt/index.html'), seite('sparte="zelt" layout="sparte" klasse="section section-alt" max="3"'));
  fs.writeFileSync(path.join(ROOT, 'metall/index.html'), seite('sparte="maschinenbau" layout="sparte" max="3"'));
  fs.writeFileSync(path.join(ROOT, 'gas/index.html'), seite('sparte="gas" layout="sparte" max="3"'));
}
const read = rel => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const exists = rel => fs.existsSync(path.join(ROOT, rel));
const beitrag = (extra = {}) => ({ titel: 'Neues Galazelt 8 × 15 m', datum: '2026-11-20', sparte: 'zelt', teaser: 'Ab sofort im Verleih: unser größtes Galazelt.',
  text: 'Erster Absatz.\n\n## Technik\n\n- Breite 8 m\n- Länge 15 m', status: 'veroeffentlicht', ...extra });
const png = (r, g, b) => sharp({ create: { width: 900, height: 600, channels: 3, background: { r, g, b } } }).png().toBuffer();

test('slugify: Umlaute, Sonderzeichen', () => {
  assert.strictEqual(akt.slugify('Größeres Zelt für Bäume & Straße!'), 'groesseres-zelt-fuer-baeume-strasse');
  assert.strictEqual(akt.slugify('  Café – Été 2026 '), 'cafe-ete-2026');
});

test('markdown: Umfang, HTML wird maskiert, nur sichere Links', () => {
  const html = akt.markdown('# Titel\n\nText mit **fett** und *kursiv* und <script>alert(1)</script>.\nZweite Zeile\n\n- eins\n- zwei\n\n1. a\n2. b\n\n'
    + '[intern](/zelt/) [extern](https://example.org/x) [böse](javascript:alert(1)) [mail](mailto:info@randl.group)');
  assert.match(html, /<h2>Titel<\/h2>/);
  assert.match(html, /<strong>fett<\/strong> und <em>kursiv<\/em>/);
  assert.ok(!html.includes('<script>') && html.includes('&lt;script&gt;'));
  assert.match(html, /<br>\nZweite Zeile<\/p>/);
  assert.match(html, /<ul>\n {2}<li>eins<\/li>\n {2}<li>zwei<\/li>\n<\/ul>/);
  assert.match(html, /<ol>\n {2}<li>a<\/li>/);
  assert.match(html, /<a href="\/zelt\/">intern<\/a>/);
  assert.match(html, /<a href="https:\/\/example.org\/x" target="_blank" rel="noopener">extern<\/a>/);
  assert.ok(!html.includes('javascript:'));
  assert.match(html, /<a href="mailto:info@randl.group">mail<\/a>/);
});

test('markdown: Bild nur aus der eigenen Bilderliste', () => {
  const bilder = { 'zelt-aaaaaaa1.webp': { file: 'zelt-aaaaaaa1.webp', w: 2048, h: 1365, tw: 640, th: 427, alt: 'Zelt' } };
  const ok = akt.markdown('![Unser Zelt](/news/img/full/zelt-aaaaaaa1.webp)', bilder);
  assert.match(ok, /<figure><img src="\/news\/img\/full\/zelt-aaaaaaa1.webp" srcset="[^"]+640w[^"]+2048w"[^>]*width="2048" height="1365" alt="Unser Zelt"/);
  assert.strictEqual(akt.markdown('![x](https://example.org/a.jpg)', bilder), '');
  assert.strictEqual(akt.markdown('![x](/news/img/full/fremd-bbbbbbb2.webp)', bilder), '');
});

test('Zeitzone: Berliner Ortszeit mit Versatz, Sommer und Winter', () => {
  assert.strictEqual(akt.berlinIso('2026-11-28T10:00'), '2026-11-28T10:00:00+01:00');
  assert.strictEqual(akt.berlinIso('2026-07-04T18:30'), '2026-07-04T18:30:00+02:00');
  assert.strictEqual(akt.eventDatum({ start: '2026-11-28T10:00', ende: '2026-11-29T17:00' }), 'Sa, 28. – So, 29. November 2026');
  assert.strictEqual(akt.eventDatum({ start: '2026-11-28T10:00', ende: '2026-11-28T17:00' }), 'Samstag, 28. November 2026');
  assert.strictEqual(akt.eventZeit({ start: '2026-11-28T10:00', ende: '2026-11-28T17:00' }), '10:00–17:00 Uhr');
});

test('validate: Pflichtfelder, Slug-Regeln, Veranstaltung', () => {
  const data = { beitraege: [{ id: 'aaaaaaaa', slug: 'vergeben' }], bilder: [] };
  assert.ok(akt.validate(beitrag(), data).ok);
  assert.strictEqual(akt.validate(beitrag(), data).value.slug, 'neues-galazelt-8-15-m');
  const f = (x, re) => { const r = akt.validate(beitrag(x), data); assert.ok(!r.ok); assert.match(r.errors.join('|'), re); };
  f({ titel: '' }, /Titel fehlt/);
  f({ slug: 'Groß Schreibung' }, /Slug: nur/);
  f({ slug: 'vergeben' }, /schon vergeben/);
  f({ slug: 'img' }, /reserviert/);
  f({ datum: '2026-02-30' }, /Datum/);
  f({ sparte: 'blog' }, /Sparte/);
  f({ teaser: 'x'.repeat(161) }, /Teaser: max/);
  f({ teaser: '' }, /fehlt der Teaser/);
  f({ titelbild: 'fremd-aaaaaaa1.webp' }, /Titelbild/);
  f({ veranstaltung: { start: '2026-11-28T10:00', ende: '2026-11-27T10:00', ort: 'KU\'KO' } }, /Ende liegt vor dem Start/);
  f({ veranstaltung: { start: '2026-11-28T10:00', ort: 'Halle', url: 'http://unsicher.example' } }, /https/);
  assert.ok(akt.validate(beitrag({ slug: 'vergeben' }), data, 'aaaaaaaa').ok, 'eigener Slug bleibt erlaubt');
  assert.ok(akt.validate(beitrag({ status: 'entwurf', teaser: '', text: '' }), data).ok, 'Entwurf darf unvollständig sein');
});

test('veröffentlichen: Seite, Übersicht, news.json, Sitemap, Teaser', () => {
  setup();
  const r = akt.create(beitrag({ veranstaltung: { start: '2026-11-28T10:00', ende: '2026-11-29T17:00', ort: 'KU\'KO Rosenheim', strasse: 'Kufsteiner Str. 4', plz: '83022', stadt: 'Rosenheim' } }), 'test@randl');
  assert.strictEqual(r.beitrag.slug, 'neues-galazelt-8-15-m');
  assert.deepStrictEqual(r.build.warnungen, []);
  const html = read('news/neues-galazelt-8-15-m/index.html');
  assert.match(html, /<title>Neues Galazelt 8 × 15 m \| Dominik Randl<\/title>/);
  assert.match(html, /<h1>Neues Galazelt 8 × 15 m<\/h1>/);
  assert.match(html, /<link rel="canonical" href="https:\/\/randl.group\/news\/neues-galazelt-8-15-m\/">/);
  assert.match(html, /content="index, follow"/);
  assert.match(html, /<h2>Technik<\/h2>/, 'Inhalt steht statisch im HTML');
  assert.match(html, /<a href="\/zelt\/" class="active">/);
  const ld = [...html.matchAll(/<script type="application\/ld\+json">\n([\s\S]*?)\n\s*<\/script>/g)].map(m => JSON.parse(m[1]));
  assert.deepStrictEqual(ld.map(x => x['@type']), ['BlogPosting', 'BreadcrumbList', 'Event']);
  assert.strictEqual(ld[0].publisher.name, 'Dominik Randl');
  assert.strictEqual(ld[0].headline, 'Neues Galazelt 8 × 15 m');
  assert.strictEqual(ld[2].startDate, '2026-11-28T10:00:00+01:00');
  assert.strictEqual(ld[2].location.address.postalCode, '83022');

  assert.match(read('news/index.html'), /<a class="n-card" href="\/news\/neues-galazelt-8-15-m\/" data-sparte="zelt">/);
  assert.strictEqual(JSON.parse(read('news/news.json')).beitraege[0].url, '/news/neues-galazelt-8-15-m/');
  const sm = read('sitemap.xml');
  assert.match(sm, /<loc>https:\/\/randl.group\/news\/<\/loc>/);
  assert.match(sm, /<loc>https:\/\/randl.group\/news\/neues-galazelt-8-15-m\/<\/loc>/);
  assert.ok(sm.trim().endsWith('</urlset>') && sm.includes('<loc>https://randl.group/</loc>'));
  assert.match(read('index.html'), /<section class="content-section akt" id="aktuelles"[\s\S]*Neues aus dem Betrieb[\s\S]*href="\/news\/neues-galazelt-8-15-m\/"/);
  assert.match(read('zelt/index.html'), /<section class="section section-alt akt"[\s\S]*Neues vom Zeltverleih/);
  assert.ok(!read('metall/index.html').includes('akt-card'), 'andere Sparte bleibt leer');
  assert.ok(!read('index.html').includes('2026-11-20') && !read('index.html').includes('20. November'), 'kein Datum im Teaser');
  assert.match(read('index.html'), /<h1>Seite<\/h1>[\s\S]*<footer><\/footer>/, 'Rest der Seite unverändert');
});

test('Entwurf erscheint nirgends; zurückziehen und löschen räumen auf', () => {
  setup();
  const e = akt.create(beitrag({ titel: 'Geheimer Entwurf', status: 'entwurf' }), 'test').beitrag;
  assert.ok(!exists('news/geheimer-entwurf/index.html'));
  for (const rel of ['news/index.html', 'news/news.json', 'sitemap.xml', 'index.html', 'zelt/index.html']) {
    assert.ok(!/geheimer-entwurf|Geheimer Entwurf/.test(read(rel)), `${rel} enthält den Entwurf`);
  }
  assert.match(read('news/index.html'), /noindex, follow/, 'leere Übersicht nicht im Index');
  assert.ok(!read('sitemap.xml').includes('/news/'), 'ohne Beiträge kein Sitemap-Eintrag');

  akt.update(e.id, beitrag({ titel: 'Geheimer Entwurf', slug: e.slug, status: 'veroeffentlicht' }), 'test');
  assert.ok(exists('news/geheimer-entwurf/index.html'));
  assert.ok(read('sitemap.xml').includes('/news/geheimer-entwurf/'));

  const r = akt.update(e.id, beitrag({ titel: 'Geheimer Entwurf', slug: e.slug, status: 'entwurf' }), 'test');
  assert.deepStrictEqual(r.build.entfernt, ['geheimer-entwurf']);
  assert.ok(!exists('news/geheimer-entwurf'));
  assert.ok(!read('sitemap.xml').includes('geheimer-entwurf') && !read('index.html').includes('akt-card'));

  akt.update(e.id, beitrag({ titel: 'Geheimer Entwurf', slug: 'neue-adresse', status: 'veroeffentlicht' }), 'test');
  assert.ok(exists('news/neue-adresse/index.html'));
  akt.remove(e.id);
  assert.ok(!exists('news/neue-adresse'));
  assert.ok(!read('sitemap.xml').includes('neue-adresse'));
  assert.strictEqual(akt.list().beitraege.length, 0);
  assert.throws(() => akt.get(e.id), /nicht gefunden/);
});

test('Reihenfolge neueste zuerst, Filter nur bei mehreren Sparten, Teaser höchstens max', () => {
  setup();
  akt.create(beitrag({ titel: 'Alt', datum: '2026-01-10' }));
  assert.ok(!read('news/index.html').includes('n-chip'));
  akt.create(beitrag({ titel: 'Gas neu', datum: '2026-03-10', sparte: 'gas' }));
  akt.create(beitrag({ titel: 'Zelt zwei', datum: '2026-05-10' }));
  akt.create(beitrag({ titel: 'Zelt drei', datum: '2026-06-10' }));
  const liste = read('news/index.html');
  assert.ok(liste.indexOf('Zelt drei') < liste.indexOf('Zelt zwei') && liste.indexOf('Zelt zwei') < liste.indexOf('Gas neu') && liste.indexOf('Gas neu') < liste.indexOf('>Alt<'));
  assert.match(liste, /data-filter="zelt">Zeltverleih<\/button><button type="button" class="n-chip" data-filter="gas">Gashandel/);
  assert.strictEqual((read('index.html').match(/akt-card/g) || []).length, 3);
  assert.ok(!read('index.html').includes('>Alt<'));
  assert.match(read('gas/index.html'), /Neues vom Gashandel[\s\S]*Gas neu/);
  assert.strictEqual((read('zelt/index.html').match(/akt-card/g) || []).length, 3);
});

test('Vorschau: noindex, schreibt nichts, auch für Entwürfe', () => {
  setup();
  const html = akt.preview(beitrag({ titel: 'Nur Vorschau', teaser: '', text: 'Hallo' }));
  assert.match(html, /noindex, nofollow/);
  assert.match(html, /<base href="https:\/\/randl.group\/" \/>/);
  assert.match(html, /<h1>Nur Vorschau<\/h1>/);
  assert.ok(!exists('news/nur-vorschau') && !exists('news/.beitraege.json'));
});

test('Bilder: WebP 2048/640 ohne Metadaten, Duplikate, Löschschutz', async () => {
  setup();
  const gross = await sharp({ create: { width: 3000, height: 2000, channels: 3, background: { r: 200, g: 30, b: 30 } } })
    .withExif({ IFD0: { Copyright: 'geheim', Artist: 'Tester' } }).jpeg().toBuffer();
  const r = await akt.uploadBilder([{ buffer: gross, name: 'IMG_1234.JPG' }, { buffer: await png(1, 2, 3), name: 'klein.png' }], { alt: 'Großes Zelt', nachweis: 'Foto: Test' }, 'test');
  assert.strictEqual(r.hinzugefuegt.length, 2);
  assert.match(r.hinzugefuegt[0], /^grosses-zelt-[0-9a-f]{8}\.webp$/);
  const [a, b] = akt.listBilder().bilder.reverse();
  assert.deepStrictEqual([a.w, a.h, a.tw], [2048, 1365, 640]);
  assert.deepStrictEqual([b.w, b.tw], [900, 640]);
  const meta = await sharp(path.join(ROOT, 'news/img/full', a.file)).metadata();
  assert.strictEqual(meta.format, 'webp');
  assert.ok(!meta.exif, 'EXIF entfernt');
  assert.ok(exists(`news/img/thumb/${a.file}`));

  const nochmal = await akt.uploadBilder([{ buffer: gross, name: 'kopie.jpg' }], {}, 'test');
  assert.deepStrictEqual([nochmal.hinzugefuegt.length, nochmal.doppelt], [0, [a.file]]);

  const p = akt.create(beitrag({ titelbild: a.file, galerie: [b.file] })).beitrag;
  const html = read(`news/${p.slug}/index.html`);
  assert.ok(html.includes(`<meta property="og:image" content="https://randl.group/news/img/full/${a.file}">`));
  assert.match(html, /<figure class="n-cover"><img [^>]*alt="Großes Zelt"[^>]*fetchpriority="high"[^>]*><figcaption class="n-credit">Foto: Test<\/figcaption>/);
  assert.ok(html.includes(`<a href="/news/img/full/${b.file}"><img src="/news/img/thumb/${b.file}"`));
  assert.throws(() => akt.removeBild(a.file), /wird noch verwendet/);

  akt.updateBild(a.file, { alt: 'Neuer Alt-Text' });
  assert.match(read(`news/${p.slug}/index.html`), /alt="Neuer Alt-Text"/, 'Alt-Text-Änderung baut neu');
  akt.remove(p.id);
  akt.removeBild(a.file);
  assert.ok(!exists(`news/img/full/${a.file}`) && !exists(`news/img/thumb/${a.file}`));
});

test('fehlende Vorlage oder Marker: klare Meldung, Daten bleiben unverändert', () => {
  setup();
  fs.rmSync(path.join(ROOT, 'news/.vorlage.html'));
  assert.throws(() => akt.create(beitrag()), e => e.status === 503 && /Vorlage/.test(e.message));
  assert.strictEqual(akt.list().beitraege.length, 0);
  setup();
  fs.writeFileSync(path.join(ROOT, 'gas/index.html'), '<html></html>');
  const r = akt.create(beitrag());
  assert.deepStrictEqual(r.build.warnungen, ['gas/index.html: Marker AKTUELLES:START/END fehlt, kein Teaser']);
});

test.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
