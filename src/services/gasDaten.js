/** Lädt die Gas-Auswertung aus der Datenbank und ruft die Rechenfunktionen auf. Gas-Auswertung (#460) */
const G = require('./gasRechnung');
const P = require('./gasPreismodell');
const A = require('./gasAuswertung');
const { parseTourenCsv } = require('./gasTouren');

const iso = "DATE_FORMAT(datum,'%Y-%m-%d')";

async function ladeBasis(db) {
  const [pos] = await db.query(`SELECT terminal, kunde_nr, typ, beleg_nr, ${iso} AS datum, artikel_nr, voll, leer, kg FROM gas_beleg_position`);
  const [tou] = await db.query(`SELECT ${iso} AS datum, terminal, bezeichnung, fahrer, plan_kg, plan_bestellungen, storniert FROM gas_tour`);
  const [ek] = await db.query(`SELECT ek_gruppe, preisbasis, DATE_FORMAT(gueltig_ab,'%Y-%m-%d') AS gueltig_ab, preis_netto FROM gas_ek_preis`);
  const [par] = await db.query('SELECT schluessel, wert FROM gas_parameter');
  const [son] = await db.query('SELECT kunde_nr, periode, faktor FROM gas_sonderpreis');
  const sonder = {};
  for (const s of son) (sonder[s.kunde_nr] = sonder[s.kunde_nr] || {})[s.periode] = Number(s.faktor);
  const positionen = pos.map((p) => ({ ...p, voll: Number(p.voll), leer: Number(p.leer), kg: Number(p.kg), kunde_nr: String(p.kunde_nr) }));
  const touren = tou.map((t) => ({ ...t, storniert: !!t.storniert }));
  return {
    klass: G.klassifiziere(positionen, touren).positionen, positionen, touren, ek,
    lkParam: Object.fromEntries(par.map((r) => [r.schluessel, Number(r.wert)])), sonder,
  };
}

const heute = () => new Date().toISOString().slice(0, 10);

async function uebersicht(db) {
  const b = await ladeBasis(db);
  const stichtag = heute();
  const v0 = P.rechneVariante(b.klass, b.ek, { stichtag, vergleichStichtag: '2026-10-15', lieferkostenParam: b.lkParam });
  const monate = A.monatsUebersicht(b.klass, b.lkParam);
  const ts = G.tourStopps(b.klass);
  return {
    stand: { von: b.positionen.reduce((m, p) => (!m || p.datum < m ? p.datum : m), null), bis: b.positionen.reduce((m, p) => (!m || p.datum > m ? p.datum : m), null), stichtag_ek: stichtag },
    kacheln: {
      umsatz: G.umsatzListe(b.positionen).umsatz, touren: ts.touren, stopps: ts.stopps.filter((s) => s.voll > 0).length,
      lieferkosten: ts.stopps.filter((x) => x.voll > 0).reduce((a, x) => a + P.lieferkosten(x.voll, { ...P.LIEFERKOSTEN_DEFAULT_PUBLIC, ...b.lkParam }), 0), flaschen: G.flaschenKennzahlen(b.positionen).voll,
      rohertrag_propan: v0.rohertrag_ist, lieferkosten_propan: v0.lieferkosten, stopps_propan: v0.stopps,
    },
    monate, produktgruppen: A.produktgruppen(b.klass), kg_klassen: v0.klassen,
    rohertrag_monat: P.rohertragRueckwirkend(b.klass, b.ek, b.sonder),
  };
}

async function flaschen(db) {
  const b = await ladeBasis(db);
  return A.flaschenStatistik(b.klass);
}

const STAFFELN = { S: P.STAFFEL_S, 'S+': P.STAFFEL_SPLUS, ohne: P.OHNE };
const GRENZEN = [11, 33, 66, 99, Infinity];

/** Eingabe: { senkung (−0.10..0.10, positiv = Senkung), staffel:'S'|'S+'|'ohne'|[5 Beträge], stichtag, vergleichStichtag } */
async function preismodell(db, eingabe = {}) {
  const b = await ladeBasis(db);
  const stichtag = /^\d{4}-\d\d-\d\d$/.test(eingabe.stichtag || '') ? eingabe.stichtag : heute();
  const vergleich = /^\d{4}-\d\d-\d\d$/.test(eingabe.vergleichStichtag || '') ? eingabe.vergleichStichtag : '2026-10-15';
  const senkung = Math.max(-0.1, Math.min(0.1, Number(eingabe.senkung) || 0));
  let staffel = STAFFELN[eingabe.staffel] || P.OHNE;
  if (Array.isArray(eingabe.staffel) && eingabe.staffel.length === 5 && eingabe.staffel.every((n) => Number.isFinite(Number(n)) && Number(n) >= 0 && Number(n) < 1000)) {
    staffel = GRENZEN.map((g, i) => [g, Number(eingabe.staffel[i])]);
  }
  const basis = { stichtag, vergleichStichtag: vergleich, lieferkostenParam: b.lkParam };
  return {
    stichtag, vergleichStichtag: vergleich,
    varianten: P.VARIANTEN.map((v) => ({ name: v.name, ...P.rechneVariante(b.klass, b.ek, { ...basis, senkung: v.senkung, staffel: v.staffel }) })),
    simulator: P.rechneVariante(b.klass, b.ek, { ...basis, senkung, staffel }),
  };
}

async function importiereTouren(db, csv) {
  const touren = parseTourenCsv(csv);
  for (const t of touren) {
    await db.query(
      `INSERT INTO gas_tour (datum, terminal, bezeichnung, fahrer, plan_kg, plan_bestellungen, storniert) VALUES (?,?,?,?,?,?,?)
       ON DUPLICATE KEY UPDATE fahrer=VALUES(fahrer), plan_kg=VALUES(plan_kg), plan_bestellungen=VALUES(plan_bestellungen), storniert=VALUES(storniert)`,
      [t.datum, t.terminal, t.bezeichnung, t.fahrer, t.plan_kg, t.plan_bestellungen, t.storniert ? 1 : 0],
    );
  }
  return touren.length;
}

module.exports = { uebersicht, flaschen, preismodell, importiereTouren };
