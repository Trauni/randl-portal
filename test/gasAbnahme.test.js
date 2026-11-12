// Abnahmewerte aus docs/gas-auswertung/HANDOFF-460.md (01.01.–03.11.2026). Rohdaten nur lokal in data-raw/ (gitignored).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { parseKomplettstatistik } = require('../src/services/gasImport');
const { parseTourenCsv } = require('../src/services/gasTouren');
const G = require('../src/services/gasRechnung');
const P = require('../src/services/gasPreismodell');

const RAW = path.join(__dirname, '..', 'data-raw');
const STAT = path.join(RAW, 'Komplettstatistiken pro Terminal Belege');
const TOUREN = path.join(RAW, 'touren', 'touren_2026.csv');
const SONDER = path.join(RAW, 'sonderpreise.json');
const skip = !(fs.existsSync(STAT) && fs.existsSync(TOUREN));

// EK-Zeilen wie in der Migration (gas_ek_preis)
const sql = fs.readFileSync(path.join(__dirname, '..', 'migration_gas_auswertung_460.sql'), 'utf8');
const ek = [...sql.matchAll(/\('Tyczka','(\w+)','(\w+)','([\d-]+)',([\d.]+),/g)]
  .map((m) => ({ ek_gruppe: m[1], preisbasis: m[2], gueltig_ab: m[3], preis_netto: m[4] }));

let cache;
const lade = async () => {
  if (cache) return cache;
  const pos = [];
  for (const f of fs.readdirSync(STAT).filter((n) => n.endsWith('.pdf'))) pos.push(...(await parseKomplettstatistik(fs.readFileSync(path.join(STAT, f)))).positionen);
  const klass = G.klassifiziere(pos, parseTourenCsv(fs.readFileSync(TOUREN, 'utf8'))).positionen;
  cache = { pos, klass };
  return cache;
};
const rund = (x) => Math.round(x);

test('Touren, Stopps, Flaschen, Umsatz', { skip }, async () => {
  const { pos, klass } = await lade();
  const ts = G.tourStopps(klass);
  assert.equal(ts.touren, 197);
  assert.equal(ts.stopps.filter((s) => s.voll > 0).length, 1338);
  const f = G.flaschenKennzahlen(pos);
  assert.equal(f.voll, 7215);
  assert.ok(Math.abs(f.leer - 6981) <= 1, `leer ${f.leer}`);
  assert.equal(f.treibgas, 746);
  assert.equal(f.co2, 598);
  assert.equal(Math.round(f.woche_avg * 10) / 10, 167.3);
  assert.equal(Math.round(f.woche_p90 * 10) / 10, 237.8);
  assert.equal(Math.round(f.monat_avg * 10) / 10, 721.4);
  assert.equal(rund(G.umsatzListe(pos).umsatz), 295877);
});

test('Preismodell: Rohertrag, Pauschalen, Varianten V0–V3', { skip }, async () => {
  const { klass } = await lade();
  const basis = { stichtag: '2026-11-15', vergleichStichtag: '2026-10-15' };
  const v = P.VARIANTEN.map((x) => P.rechneVariante(klass, ek, { ...basis, ...x }));
  assert.equal(rund(v[0].umsatz_ist), 258267);
  assert.equal(v[0].stopps, 1029);
  assert.equal(rund(v[0].lieferkosten), 14706);
  assert.equal(rund(v[0].rohertrag_vergleich), 119151);
  assert.equal(rund(v[0].rohertrag_neu), 119444);
  assert.equal(rund(v[1].rohertrag_neu), 119430);
  assert.equal(rund(v[2].rohertrag_neu), 119415);
  assert.equal(rund(v[3].rohertrag_neu), 108878);
  assert.equal(rund(v[1].pauschalen), 10164);
  assert.equal(rund(v[2].pauschalen), 15292);
});

test('Rohertrag Propan Jan.–Okt. rückwirkend (±1 € Rundung)', { skip: skip || !fs.existsSync(SONDER) }, async () => {
  const { klass } = await lade();
  const r = P.rohertragRueckwirkend(klass, ek, JSON.parse(fs.readFileSync(SONDER, 'utf8')));
  assert.ok(Math.abs(r.rohertrag - 106655) <= 1.5, `${r.rohertrag}`);
  assert.equal(Math.round(r.marge * 1000) / 10, 45.7);
});
