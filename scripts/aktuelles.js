#!/usr/bin/env node
'use strict';
// „Aktuelles“ (randl.group/news/) von der Kommandozeile – gleiche Logik wie im Portal (src/services/aktuelles.js).
//
//   node scripts/aktuelles.js liste                    Beiträge anzeigen
//   node scripts/aktuelles.js bauen                    alle Seiten, Teaser und Sitemap neu erzeugen
//   node scripts/aktuelles.js import <datei.json>      Beitrag samt Bildern anlegen (für den ersten Beitrag von Hand)
//          --ersetzen                                  vorhandenen Beitrag mit gleichem Slug überschreiben
//
// Import-Datei: { "bilder": { "<pfad im Webroot>": { "alt": "…", "nachweis": "…" } },
//                 "beitrag": { …Felder wie im Portal…, "titelbild": "<pfad>", "galerie": ["<pfad>", …] } }
// Im Text: ![Alt-Text](bild:<pfad>) setzt ein Bild aus "bilder" ein.
// Bildpfade sind relativ zum Webroot (z. B. messe/banner.webp) und müssen darin liegen.
// Webroot: Umgebungsvariable AKTUELLES_ROOT, sonst /home/radmin/web/randl.group/public_html. Als root ausführen.

const fs   = require('fs');
const path = require('path');
const aktuelles = require('../src/services/aktuelles');

const ROOT = process.env.AKTUELLES_ROOT || '/home/radmin/web/randl.group/public_html';
const [cmd, ...rest] = process.argv.slice(2);

function zeigeBuild(b) {
  console.log(`Build: ${b.seiten} Beitragsseite(n) geschrieben, entfernt: ${b.entfernt.join(', ') || 'keine'}`);
  for (const w of b.warnungen) console.log(`  WARNUNG: ${w}`);
}

async function importieren(datei, ersetzen) {
  const src = JSON.parse(fs.readFileSync(datei, 'utf8'));
  const map = {};
  for (const [rel, meta] of Object.entries(src.bilder || {})) {
    const abs = path.resolve(ROOT, rel);
    if (!abs.startsWith(path.resolve(ROOT) + path.sep)) throw new Error(`Bild außerhalb des Webroots: ${rel}`);
    const r = await aktuelles.uploadBilder([{ buffer: fs.readFileSync(abs), name: path.basename(rel) }], meta, 'import');
    map[rel] = r.hinzugefuegt[0] || r.doppelt[0];
    console.log(`Bild ${rel} -> news/img/full/${map[rel]}${r.doppelt.length ? ' (schon vorhanden)' : ''}`);
  }
  const bild = rel => { if (!map[rel]) throw new Error(`Bild ${rel} steht nicht unter "bilder"`); return map[rel]; };
  const b = { ...src.beitrag };
  b.titelbild = b.titelbild ? bild(b.titelbild) : null;
  b.galerie = (b.galerie || []).map(bild);
  b.text = String(b.text || '').replace(/\(bild:([^)\s]+)\)/g, (_m, rel) => `(/news/img/full/${bild(rel)})`);   // ![Alt](bild:messe/x.webp)
  const vorhanden = aktuelles.list().beitraege.find(x => x.slug === b.slug);
  if (vorhanden && !ersetzen) throw new Error(`Beitrag mit Slug „${b.slug}“ gibt es schon (mit --ersetzen überschreiben)`);
  const r = vorhanden ? aktuelles.update(vorhanden.id, b, 'import') : aktuelles.create(b, 'import');
  console.log(`${vorhanden ? 'Aktualisiert' : 'Angelegt'}: ${r.beitrag.titel} (${r.beitrag.status}) -> ${r.beitrag.url}`);
  zeigeBuild(r.build);
}

(async () => {
  if (cmd === 'liste') {
    for (const b of aktuelles.list().beitraege) console.log(`${b.datum}  ${b.status.padEnd(15)}  ${b.sparte.padEnd(12)}  /news/${b.slug}/  ${b.titel}`);
  } else if (cmd === 'bauen') {
    zeigeBuild(aktuelles.rebuild().build);
  } else if (cmd === 'import' && rest.find(a => !a.startsWith('--'))) {
    await importieren(rest.find(a => !a.startsWith('--')), rest.includes('--ersetzen'));
  } else {
    console.log('Aufruf: node scripts/aktuelles.js liste | bauen | import <datei.json> [--ersetzen]');
    process.exit(cmd ? 1 : 0);
  }
})().catch(e => { console.error(`FEHLER: ${e.message}`); if (e.errors) e.errors.forEach(x => console.error(`  - ${x}`)); process.exit(1); });
