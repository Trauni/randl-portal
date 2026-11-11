/**
 * Rohertrag und Preismodell Propan (Port von preismodell.py / historie.py). Reine Funktionen. Gas-Auswertung (#460)
 * EK kommt aus gas_ek_preis-Zeilen ({ek_gruppe, preisbasis, gueltig_ab:'YYYY-MM-DD', preis_netto}), nie aus dem Code.
 */
const { ARTIKEL } = require('./gasStammdaten');
const { preisAm } = require('./gasEkPreise');
const { LAGER_KUNDEN } = require('./gasRechnung');

const runde2 = (x) => Math.round(x * 100 + 1e-9) / 100;

// Propan-Artikel des Preismodells (inkl. Motogas/Bluetec) und ihre Gruppe/Größe
const PM_ARTIKEL = ['7801000', '7801800', '7801050', '7801100', '7801200', '7801250', '7801300', '7802000', '7802010'];
const KG = { 7801000: 5, 7801800: 5, 7801050: 8, 7801100: 11, 7801200: 11, 7801250: 11, 7801300: 33, 7802000: 11, 7802010: 11 };
const ekGruppeVon = (nr) => (nr.startsWith('7802') ? 'motogas' : 'propan');
const VK_OKT = { 7801000: 14.97, 7801800: 14.97, 7801050: 18.48, 7801100: 30.80, 7801200: 30.80, 7801250: 30.80, 7801300: 98.30, 7802000: 35.13, 7802010: 37.22 };

/** EK netto je Flasche am Stichtag (Preis mit größtem gueltig_ab <= Stichtag; kg-Basis × Füllmenge, auf Cent gerundet). */
function ekJeFlasche(ekZeilen, artikel, tag) {
  const z = preisAm(ekZeilen, ekGruppeVon(artikel), tag);
  if (!z) return null;
  const n = Number(z.preis_netto);
  return z.preisbasis === 'kg' ? runde2(n * KG[artikel]) : n;
}

const STAFFEL_S = [[11, 19.9], [33, 14.9], [66, 9.9], [99, 4.9], [Infinity, 0]];
const STAFFEL_SPLUS = [[11, 24.9], [33, 19.9], [66, 14.9], [99, 9.9], [Infinity, 4.9]];
const OHNE = [[Infinity, 0]];
const pauschale = (staffel, kg) => staffel.find(([bis]) => kg <= bis)[1];

const LIEFERKOSTEN_DEFAULT = { km_je_stopp: 12.65, eur_je_km: 0.4, fahr_min: 15.4, stand_min: 9, min_je_flasche: 0.6, eur_je_h: 20 };
const lieferkosten = (fl, p) => p.km_je_stopp * p.eur_je_km + (p.fahr_min + p.stand_min + p.min_je_flasche * fl) / 60 * p.eur_je_h;

const rund10ct = (x) => Math.round(Math.round(x * 10 + 1e-9) / 10 * 100) / 100;
const KLASSEN = [[11, 'bis 11 kg'], [33, '12–33 kg'], [66, '34–66 kg'], [99, '67–99 kg'], [Infinity, 'ab 100 kg']];
const klasseVon = (kg) => KLASSEN.find(([bis]) => kg <= bis)[1];

/** Propan-Positionen auf Tour/Lager aufbereiten: Stopps (Terminal+Datum+Kunde, nur Tour, mit Ware). */
function propanStopps(klass, ekFn) {
  const m = new Map();
  for (const x of klass) {
    if (x.art !== 'Tour' || !(x.artikel_nr in KG)) continue;
    const k = `${x.terminal}|${x.datum}|${x.kunde_nr}`;
    const s = m.get(k) || { kunde_nr: x.kunde_nr, fl: 0, kg: 0, re: 0 };
    s.fl += x.voll; s.kg += x.voll * KG[x.artikel_nr]; if (ekFn) s.re += (VK_OKT[x.artikel_nr] - ekFn(x.artikel_nr)) * x.voll; m.set(k, s);
  }
  return [...m.values()].filter((s) => s.fl > 0);
}

/**
 * Eine Variante. Alle Beträge netto. klass = klassifizierte Positionen; ekZeilen = gas_ek_preis.
 * opts: { senkung (0.04 = −4 %), staffel, stichtag (aktueller EK), vergleichStichtag (z. B. '2026-10-15'), lieferkostenParam }
 */
function rechneVariante(klass, ekZeilen, opts) {
  const { senkung = 0, staffel = OHNE, stichtag, vergleichStichtag } = opts;
  const par = { ...LIEFERKOSTEN_DEFAULT, ...(opts.lieferkostenParam || {}) };
  const pos = klass.filter((x) => x.artikel_nr in KG);
  const stopps = propanStopps(klass, (a) => ekJeFlasche(ekZeilen, a, stichtag)).map((s) => ({ ...s, fee: pauschale(staffel, s.kg), kosten: lieferkosten(s.fl, par), klasse: klasseVon(s.kg) }));
  const preisNeu = Object.fromEntries(PM_ARTIKEL.map((a) => [a, rund10ct(VK_OKT[a] * (1 - senkung))]));

  let uIst = 0; let uNeuOhneFee = 0; let ek = 0; let ekVergleich = 0;
  const kunden = new Map();
  for (const x of pos) {
    const e = ekJeFlasche(ekZeilen, x.artikel_nr, stichtag);
    const eV = vergleichStichtag ? ekJeFlasche(ekZeilen, x.artikel_nr, vergleichStichtag) : e;
    const ist = VK_OKT[x.artikel_nr] * x.voll; const neu = preisNeu[x.artikel_nr] * x.voll;
    uIst += ist; uNeuOhneFee += neu; ek += e * x.voll; ekVergleich += eV * x.voll;
    const k = kunden.get(x.kunde_nr) || { ist: 0, neu: 0, fee: 0, stopps: 0, fl: 0 };
    k.ist += ist; k.neu += neu; k.fl += x.voll; kunden.set(x.kunde_nr, k);
  }
  for (const s of stopps) { const k = kunden.get(s.kunde_nr); k.fee += s.fee; k.stopps += 1; k.neu += s.fee; }
  const pauschalen = stopps.reduce((a, s) => a + s.fee, 0);
  const uNeu = uNeuOhneFee + pauschalen;

  const echt = [...kunden.entries()].filter(([nr, k]) => !LAGER_KUNDEN.has(nr) && k.fl > 0).map(([nr, k]) => ({ kunde_nr: nr, delta: k.neu - k.ist, delta_pct: (k.neu - k.ist) / k.ist * 100, stopps: k.stopps }));
  const tour = echt.filter((k) => k.stopps > 0);
  const klassen = Object.fromEntries(KLASSEN.map(([, n]) => {
    const s = stopps.filter((x) => x.klasse === n);
    return [n, { stopps: s.length, pauschale: s.reduce((a, x) => a + x.fee, 0), lieferkosten: s.reduce((a, x) => a + x.kosten, 0), rohertrag: s.reduce((a, x) => a + x.re, 0) }];
  }));
  return {
    preise: preisNeu, umsatz_ist: uIst, umsatz_neu: uNeu, ek, rohertrag_ist: uIst - ek, rohertrag_neu: uNeu - ek,
    rohertrag_vergleich: uIst - ekVergleich, pauschalen: pauschalen,
    // Gaspreisänderung, die den EK-Anstieg seit dem Vergleichsstand nach Abzug der Pauschalen ausgleicht
    noetige_aenderung: (ek - ekVergleich - pauschalen) / uIst,
    stopps: stopps.length, lieferkosten: stopps.reduce((a, s) => a + s.kosten, 0), klassen,
    kunden_guenstiger: tour.filter((k) => k.delta < -1).length, kunden_teurer: tour.filter((k) => k.delta > 1).length,
    kunden_ueber_10: tour.filter((k) => k.delta_pct > 10).length,
    gewinner: [...tour].sort((a, b) => a.delta - b.delta).slice(0, 5), verlierer: [...tour].sort((a, b) => b.delta - a.delta).slice(0, 5),
  };
}

const VARIANTEN = [
  { name: 'V0 Heute, keine Änderung', senkung: 0, staffel: OHNE },
  { name: 'V1 Abholpreis −4 % + Staffel S', senkung: 0.04, staffel: STAFFEL_S },
  { name: 'V2 Abholpreis −6 % + Staffel S+', senkung: 0.06, staffel: STAFFEL_SPLUS },
  { name: 'V3 Abholpreis −10 % + Staffel S+', senkung: 0.10, staffel: STAFFEL_SPLUS },
];

module.exports = { LIEFERKOSTEN_DEFAULT_PUBLIC: LIEFERKOSTEN_DEFAULT, ekJeFlasche, rechneVariante, propanStopps, pauschale, lieferkosten, VARIANTEN, STAFFEL_S, STAFFEL_SPLUS, OHNE, PM_ARTIKEL, VK_OKT, KG, ARTIKEL };

// ── Rohertrag Propan rückwirkend (historie.py) ─────────────────────────────
// Verkaufspreis am Belegtag: bis 14.04. aus Barbelegen abgeleitet, danach Listenpreis vor/nach der Erhöhung im Oktober.
const VK_A = { 7801000: 13.32, 7801800: 13.32, 7801100: 25.63, 7801200: 25.63, 7801250: 25.63, 7801300: 80.63 };
const VK_VOR_OKT = { 7801000: 14.27, 7801800: 14.27, 7801050: 17.36, 7801100: 29.26, 7801200: 29.26, 7801250: 29.26, 7801300: 93.68, 7802000: 33.59, 7802010: 35.68 };
const vkAm = (nr, iso) => {
  if (iso < '2026-04-15') return VK_A[nr] ?? runde2(VK_OKT[nr] * 0.83);
  return iso < '2026-10-13' ? VK_VOR_OKT[nr] : VK_OKT[nr];
};
const periodeVon = (iso) => (iso < '2026-04-15' ? 'A' : iso < '2026-05-15' ? 'B' : iso < '2026-10-13' ? 'C' : 'D');

/** sonder: { kunde_nr: { A, B, C, D } } Faktor auf Liste (aus gas_sonderpreis). */
function rohertragRueckwirkend(klass, ekZeilen, sonder = {}) {
  const monate = {};
  for (const x of klass) {
    if (!(x.artikel_nr in KG)) continue;
    const liste = vkAm(x.artikel_nr, x.datum);
    const f = (sonder[x.kunde_nr] || {})[periodeVon(x.datum)] ?? 1;
    const vk = runde2(liste * f);
    const m = monate[x.datum.slice(0, 7)] || (monate[x.datum.slice(0, 7)] = { flaschen: 0, umsatz: 0, ek: 0 });
    m.flaschen += x.voll; m.umsatz += vk * x.voll; m.ek += ekJeFlasche(ekZeilen, x.artikel_nr, x.datum) * x.voll;
  }
  const liste = Object.entries(monate).sort().map(([monat, m]) => ({ monat, ...m, rohertrag: m.umsatz - m.ek, marge: (m.umsatz - m.ek) / m.umsatz }));
  const sum = (k) => liste.filter((m) => m.monat <= '2026-10').reduce((a, m) => a + m[k], 0);
  return { monate: liste, umsatz: sum('umsatz'), ek: sum('ek'), rohertrag: sum('rohertrag'), marge: sum('rohertrag') / sum('umsatz') };
}
module.exports.rohertragRueckwirkend = rohertragRueckwirkend;
