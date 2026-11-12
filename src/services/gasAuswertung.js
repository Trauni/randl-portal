/** Aggregate für die Seiten Überblick und Flaschen (Port von flaschen.py / preise.py / dashboard_dateien.py). Gas-Auswertung (#460) */
const { ARTIKEL, GASART_REIHENFOLGE, listenpreis } = require('./gasStammdaten');
const G = require('./gasRechnung');
const P = require('./gasPreismodell');

const gruppeVon = (a) => {
  if (['7801200', '7801100', '7801250'].includes(a)) return '11 kg Propan';
  if (['7802000', '7802010'].includes(a)) return '11 kg Treibgas';
  if (a === '7801300') return '33 kg Propan';
  if (['7801000', '7801800', '7801050'].includes(a)) return '5/8 kg Propan';
  if (a.startsWith('5909')) return 'Campingaz';
  if (a === 'T001' || a === 'T007') return 'Biergas';
  if (['T002', 'T003', 'T004', 'T005', 'T006'].includes(a)) return 'CO2';
  if (a.startsWith('5920')) return 'Helium';
  if (a.startsWith('T')) return 'Techn. Gase';
  return 'Sonstige';
};
const istPropanKategorie = (a) => a.startsWith('7801') || a.startsWith('7802');

function lieferkostenStopps(klass, lkParam, nurPropan) {
  const m = new Map();
  for (const x of klass) {
    if (x.art !== 'Tour' || (nurPropan && !(x.artikel_nr in P.KG))) continue;
    const k = `${x.terminal}|${x.datum}|${x.kunde_nr}`;
    const s = m.get(k) || { datum: x.datum, voll: 0 };
    s.voll += x.voll; m.set(k, s);
  }
  const par = { ...P.LIEFERKOSTEN_DEFAULT_PUBLIC, ...lkParam };
  return [...m.values()].filter((s) => s.voll > 0).map((s) => ({ datum: s.datum, kosten: P.lieferkosten(s.voll, par) }));
}

function monatsUebersicht(klass, lkParam) {
  return G.MONATE.map((monat) => {
    const p = klass.filter((x) => x.datum.startsWith(monat));
    const umsatz = (f) => p.filter(f).reduce((s, x) => s + (listenpreis(x.artikel_nr, x.datum) ?? 0) * x.voll, 0);
    const ts = G.tourStopps(p);
    const stopps = ts.stopps.filter((s) => s.voll > 0);
    const par = { ...P.LIEFERKOSTEN_DEFAULT_PUBLIC, ...lkParam };
    return {
      monat, umsatz: umsatz(() => true), umsatz_tour: umsatz((x) => x.art === 'Tour'), umsatz_lager: umsatz((x) => x.art !== 'Tour'),
      umsatz_propan: umsatz((x) => istPropanKategorie(x.artikel_nr)),
      flaschen: p.reduce((s, x) => s + x.voll, 0),
      touren: ts.touren, stopps: stopps.length, kg: stopps.reduce((s, x) => s + x.kg, 0),
      lieferkosten: stopps.reduce((s, x) => s + P.lieferkosten(x.voll, par), 0), km: null,
    };
  });
}

function produktgruppen(klass) {
  const g = {};
  for (const x of klass) {
    const k = gruppeVon(x.artikel_nr);
    const e = g[k] || (g[k] = { gruppe: k, flaschen: 0, umsatz: 0 });
    e.flaschen += x.voll; e.umsatz += (listenpreis(x.artikel_nr, x.datum) ?? 0) * x.voll;
  }
  return Object.values(g).sort((a, b) => b.umsatz - a.umsatz);
}

/** Flaschenstatistik je Artikel, Gasart, Monat und Woche (volle Wochen/Monate 2026). */
function flaschenStatistik(klass) {
  const p = klass.filter((x) => ARTIKEL[x.artikel_nr]);
  const jeArtikel = {};
  for (const x of p) {
    const a = ARTIKEL[x.artikel_nr];
    const e = jeArtikel[x.artikel_nr] || (jeArtikel[x.artikel_nr] = {
      artikel: x.artikel_nr, bezeichnung: a.bezeichnung, gasart: a.gasart, kg_je_flasche: a.kg_fuellung, voll: 0, leer: 0, voll_tour: 0,
      wochen: Object.fromEntries(G.WOCHEN.map((w) => [w, 0])), monate: Object.fromEntries(G.MONATE.map((m) => [m, 0])),
    });
    e.voll += x.voll; e.leer += x.leer; if (x.art === 'Tour') e.voll_tour += x.voll;
    const w = G.isoMontag(x.datum); if (w in e.wochen) e.wochen[w] += x.voll;
    const m = x.datum.slice(0, 7); if (m in e.monate) e.monate[m] += x.voll;
  }
  const median = (v) => G.quantil(v, 0.5);
  const artikel = Object.values(jeArtikel).filter((e) => e.voll > 0).map((e) => {
    const w = Object.values(e.wochen); const m = Object.values(e.monate);
    return {
      artikel: e.artikel, bezeichnung: e.bezeichnung, gasart: e.gasart, kg_je_flasche: e.kg_je_flasche, voll: e.voll, leer: e.leer,
      kg: e.kg_je_flasche == null ? null : e.voll * e.kg_je_flasche, anteil_tour: e.voll ? e.voll_tour / e.voll : null,
      woche_avg: w.reduce((s, v) => s + v, 0) / w.length, woche_median: median(w), woche_p90: G.quantil(w, 0.9), woche_max: Math.max(...w),
      wochen_mit_bedarf: w.filter((v) => v > 0).length, wochen_gesamt: w.length,
      monat_avg: m.reduce((s, v) => s + v, 0) / m.length, monat_max: Math.max(...m), monat_min: Math.min(...m),
    };
  }).sort((a, b) => GASART_REIHENFOLGE.indexOf(a.gasart) - GASART_REIHENFOLGE.indexOf(b.gasart) || (a.kg_je_flasche ?? 0) - (b.kg_je_flasche ?? 0) || b.voll - a.voll);

  const jeGasart = GASART_REIHENFOLGE.map((gasart) => {
    const q = p.filter((x) => ARTIKEL[x.artikel_nr].gasart === gasart);
    if (!q.length) return null;
    const woche = Object.fromEntries(G.WOCHEN.map((w) => [w, 0])); const kgW = { ...woche };
    for (const x of q) { const w = G.isoMontag(x.datum); if (w in woche) { woche[w] += x.voll; kgW[w] += x.voll * (ARTIKEL[x.artikel_nr].kg_fuellung ?? 0); } }
    const monat = Object.fromEntries(G.MONATE.map((m) => [m, 0]));
    for (const x of q) { const m = x.datum.slice(0, 7); if (m in monat) monat[m] += x.voll; }
    const w = Object.values(woche);
    return {
      gasart, voll: q.reduce((s, x) => s + x.voll, 0), leer: q.reduce((s, x) => s + x.leer, 0),
      woche_avg: w.reduce((s, v) => s + v, 0) / w.length, woche_p90: G.quantil(w, 0.9), woche_max: Math.max(...w),
      monat_avg: Object.values(monat).reduce((s, v) => s + v, 0) / G.MONATE.length,
      wochen: Object.entries(woche).map(([montag, voll]) => ({ montag, voll, kg: kgW[montag] })),
      monate: Object.entries(monat).map(([m, voll]) => ({ monat: m, voll })),
    };
  }).filter(Boolean);
  return { artikel, gasarten: jeGasart, kennzahlen: G.flaschenKennzahlen(p) };
}

module.exports = { monatsUebersicht, produktgruppen, flaschenStatistik, gruppeVon, lieferkostenStopps };
