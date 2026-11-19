/**
 * Rechenlogik der Gas-Auswertung (Port von docs/gas-auswertung/referenz/python). Reine Funktionen, keine DB.
 * Positionen: { terminal, kunde_nr, typ, beleg_nr, datum:'YYYY-MM-DD', artikel_nr, voll, leer, kg }
 */

const LAGER_KUNDEN = new Set(['125001', '125218', '125222']);
const KEIN_FLASCHENARTIKEL = new Set(['2805400', '2805600', '5904000']); // Paletten, Kappen

const addTage = (iso, n) => { const d = new Date(`${iso}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

/** Belegart je Position: Tour | Lager-Account | Lager-PC (6444) | Tablet ohne Tour. Touren ohne Belege am Tourtag: ±3 Tage (match.py). */
function klassifiziere(positionen, touren) {
  const tage = new Set(positionen.map((p) => `${p.terminal}|${p.datum}`));
  const tkey = new Map();
  const aktiv = touren.filter((t) => !t.storniert);
  for (const t of aktiv) tkey.set(`${t.terminal}|${t.datum}`, t);
  const used = new Set(tkey.keys());
  const verschoben = [];
  for (const t of aktiv) {
    if (tage.has(`${t.terminal}|${t.datum}`)) continue;
    const gefunden = [1, -1, 2, -2, 3, -3].map((dd) => `${t.terminal}|${addTage(t.datum, dd)}`).find((k) => tage.has(k) && !used.has(k));
    if (gefunden) { used.add(gefunden); tkey.set(gefunden, t); verschoben.push({ tour: t.bezeichnung, nach: gefunden.split('|')[1] }); }
    else verschoben.push({ tour: t.bezeichnung, nach: null });
  }
  return {
    verschoben,
    positionen: positionen.map((p) => {
      const t = tkey.get(`${p.terminal}|${p.datum}`);
      let art;
      if (LAGER_KUNDEN.has(p.kunde_nr)) art = 'Lager-Account';
      else if (p.terminal === '6444') art = 'Lager-PC (6444)';
      else if (t) art = 'Tour';
      else art = 'Tablet ohne Tour';
      return { ...p, art, tour: art === 'Tour' ? t.bezeichnung : null };
    }),
  };
}

/** Quantil wie pandas (lineare Interpolation). */
function quantil(werte, q) {
  const s = [...werte].sort((a, b) => a - b);
  const pos = (s.length - 1) * q; const lo = Math.floor(pos); const hi = Math.ceil(pos);
  return s[lo] + (s[hi] - s[lo]) * (pos - lo);
}

const isoMontag = (iso) => { const d = new Date(`${iso}T12:00:00Z`); return addTage(iso, -((d.getUTCDay() + 6) % 7)); };

/** Volle Wochen Mo 05.01.–So 01.11.2026, volle Monate Jan–Okt (Auswertungszeitraum 2026). */
const WOCHEN = Array.from({ length: 43 }, (_, i) => addTage('2026-01-05', i * 7));
const MONATE = Array.from({ length: 10 }, (_, i) => `2026-${String(i + 1).padStart(2, '0')}`);

function flaschenKennzahlen(positionen, stamm) {
  const { ARTIKEL } = stamm;
  const p = positionen.filter((x) => ARTIKEL[x.artikel_nr]);
  const summe = (f, k) => p.filter(f).reduce((s, x) => s + x[k], 0);
  const jeWoche = Object.fromEntries(WOCHEN.map((w) => [w, 0]));
  const jeMonat = Object.fromEntries(MONATE.map((m) => [m, 0]));
  for (const x of p) {
    const w = isoMontag(x.datum);
    if (w in jeWoche) jeWoche[w] += x.voll;
    const m = x.datum.slice(0, 7);
    if (m in jeMonat) jeMonat[m] += x.voll;
  }
  const wochen = Object.values(jeWoche);
  const nach = (gasart) => summe((x) => ARTIKEL[x.artikel_nr].gasart === gasart, 'voll');
  return {
    voll: summe(() => true, 'voll'), leer: summe(() => true, 'leer'),
    propan: nach('Propan') + nach('Propan Treibgas') + nach('Campingaz'), treibgas: nach('Propan Treibgas'), co2: nach('CO2'),
    woche_avg: wochen.reduce((a, b) => a + b, 0) / wochen.length, woche_p90: quantil(wochen, 0.9),
    monat_avg: Object.values(jeMonat).reduce((a, b) => a + b, 0) / MONATE.length,
  };
}

/** Umsatz zum Listenpreis am Belegtag, Positionen ohne Preis zählen 0. */
function umsatzListe(positionen, stamm) {
  let u = 0; const ohnePreis = new Set();
  for (const x of positionen) {
    const pr = stamm.listenpreis(x.artikel_nr, x.datum);
    if (pr == null) { ohnePreis.add(x.artikel_nr); continue; }
    u += pr * x.voll;
  }
  return { umsatz: u, ohnePreis: [...ohnePreis] };
}

/** Stopp = Terminal + Datum + Kunde auf Tour. */
function tourStopps(klass) {
  const stopps = new Map(); const touren = new Set();
  for (const x of klass.filter((p) => p.art === 'Tour')) {
    touren.add(`${x.terminal}|${x.datum}`);
    const k = `${x.terminal}|${x.datum}|${x.kunde_nr}`;
    const s = stopps.get(k) || { terminal: x.terminal, datum: x.datum, kunde_nr: x.kunde_nr, kg: 0, voll: 0 };
    s.kg += x.kg; s.voll += x.voll; stopps.set(k, s);
  }
  return { touren: touren.size, stopps: [...stopps.values()] };
}

module.exports = { klassifiziere, flaschenKennzahlen, umsatzListe, tourStopps, quantil, isoMontag, LAGER_KUNDEN, KEIN_FLASCHENARTIKEL, WOCHEN, MONATE };
