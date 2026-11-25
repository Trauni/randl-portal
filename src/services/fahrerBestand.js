/**
 * Fahrzeugbestand einer Tour fürs Büro (#639), gerechnet wie in der Fahrer-App (bestand() in fahrer-app/www/app.js):
 *
 *   geladen  = Soll aller nicht stornierten Stopps (Ladeliste) + unterwegs zugeladen (tour.zugeladen, #616)
 *   voll     = geladen − geliefert laut Belegen, mindestens 0
 *   leergut  = Leergut laut Belegen − beim Zuladen abgeladenes Leergut, mindestens 0
 *
 * Punkte nach ADR 1.1.3.6 für das, was noch voll an Bord ist, aus dem Artikelstamm (wie die Ladeliste, #607).
 * Zubehör, Dienstleistung und Provision (Typ Z, D, V) zählen nicht zum Bestand (#629). Leergut zählt keine Punkte.
 * Reine Funktion ohne DB.
 */
const { adrAngaben, GRENZE } = require('./fahrerLadeliste');

const KEIN_BESTAND = new Set(['Z', 'D', 'V']);
const anzahl = (v) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : 0);
const runde = (n) => Math.round(n * 10) / 10;

/**
 * @param {object} d
 * @param {object[]} d.stopps      [{ status, positionen: [{ artikelNr, soll }] }]
 * @param {object[]} d.zugeladen   Summe je Artikel aus zuladungenAnsicht: [{ artikelNr, bezeichnung, zugeladen, leergutAb }]
 * @param {object[]} d.geliefert   Summe je Artikel aus den Belegen: [{ artikelNr, bezeichnung, geliefert, leergut }]
 * @param {object} d.artikel       { [artikelNr]: Zeile aus gas_artikel }
 */
function rechneBestand({ stopps = [], zugeladen = [], geliefert = [], artikel = {} }, grenze = GRENZE) {
  const zeilen = new Map();
  const zeile = (artikelNr, bezeichnung) => {
    const k = artikelNr ?? `ohne:${bezeichnung}`;
    if (!zeilen.has(k)) {
      const a = artikelNr == null ? null : artikel[artikelNr];
      zeilen.set(k, { artikelNr: artikelNr ?? null, bezeichnung: a?.bezeichnung || bezeichnung || artikelNr || 'ohne Artikel', gasart: a?.gasart || null,
        keinBestand: KEIN_BESTAND.has(a?.typ), soll: 0, zugeladen: 0, geladen: 0, geliefert: 0, voll: 0, leergutAuf: 0, abgeladen: 0, leergut: 0, punkte: null });
    }
    return zeilen.get(k);
  };

  for (const s of stopps) {
    if (s.status === 'storniert') continue;
    for (const p of s.positionen || []) {
      const n = anzahl(p.soll);
      if (n > 0) zeile(p.artikelNr).soll += n;
    }
  }
  for (const z of zugeladen) {
    const x = zeile(z.artikelNr, z.bezeichnung);
    x.zugeladen += anzahl(z.zugeladen);
    x.abgeladen += anzahl(z.leergutAb);
  }
  for (const g of geliefert) {
    const x = zeile(g.artikelNr, g.bezeichnung);
    x.geliefert += anzahl(g.geliefert);
    x.leergutAuf += anzahl(g.leergut);
  }

  const unvollstaendig = [];
  let punkte = 0;
  const liste = [...zeilen.values()].filter((x) => !x.keinBestand).map(({ keinBestand, ...x }) => {
    x.geladen = x.soll + x.zugeladen;
    x.voll = Math.max(0, x.geladen - x.geliefert);
    x.leergut = Math.max(0, x.leergutAuf - x.abgeladen);
    const adr = adrAngaben(x.artikelNr == null ? null : artikel[x.artikelNr]);
    if (adr) { x.punkte = runde(x.voll * adr.menge * adr.faktor); punkte += x.punkte; }
    else if (x.voll > 0) unvollstaendig.push(x.artikelNr ?? x.bezeichnung);
    return x;
  }).sort((a, b) => b.voll - a.voll || b.leergut - a.leergut || String(a.artikelNr).localeCompare(String(b.artikelNr)));

  const summe = (feld) => liste.reduce((n, x) => n + x[feld], 0);
  return {
    grenze, punkte: runde(punkte), ueber: punkte > grenze, unvollstaendig: unvollstaendig.sort(),
    zeilen: liste,
    geladenGesamt: summe('geladen'), zugeladenGesamt: summe('zugeladen'), geliefertGesamt: summe('geliefert'),
    vollGesamt: summe('voll'), leergutGesamt: summe('leergut'), abgeladenGesamt: summe('abgeladen'),
    // Mehr geliefert als geladen: Ware, die weder auf der Ladeliste stand noch als Zuladung gemeldet wurde
    mehrGeliefert: liste.filter((x) => x.geliefert > x.geladen).map((x) => ({ artikelNr: x.artikelNr, bezeichnung: x.bezeichnung, anzahl: x.geliefert - x.geladen })),
  };
}

module.exports = { rechneBestand };
