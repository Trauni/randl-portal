/**
 * Artikel und Verkaufspreise für die Gas-Auswertung (#604). Quelle ist der Artikelstamm im Portal:
 *  - gas_artikel: Bezeichnung, Gasart, kg je Füllung, aktueller Netto-Listenpreis (preis_netto_cent)
 *  - price_change_log: Preisänderungen (Status ok, Ziel Lexware) für den Preis am Belegtag
 * Der Preis am Tag t ist der Preis, der vor der ersten Änderung nach t galt (Änderung gilt ab ihrem Datum),
 * ohne spätere Änderung der aktuelle Preis. baueStamm ist rein (ohne DB), ladeStamm liest die Tabellen.
 */

const KG_ARTEN = new Set(['Propan', 'Propan Treibgas', 'CO2', 'Campingaz']); // nur hier ist die Füllmenge in kg
const GASART_REIHENFOLGE = ['Propan', 'Propan Treibgas', 'CO2', 'Biergas', 'Campingaz', 'Argon', 'Arcox (Mischgas)', 'Sauerstoff', 'Stickstoff', 'Acetylen', 'Formiergas', 'Ballongas/Helium', 'Druckluft'];

/** Nur für Artikel ohne gepflegte Gasart: aus der Artikelnummer abgeleitet, sonst 'Sonstige'. */
const gasartVon = (nr) => {
  if (nr.startsWith('7801')) return 'Propan';
  if (nr.startsWith('7802')) return 'Propan Treibgas';
  if (nr.startsWith('5909')) return 'Campingaz';
  if (nr.startsWith('5920')) return 'Ballongas/Helium';
  if (!/^T\d{3}$/.test(nr)) return 'Sonstige';
  const n = parseInt(nr.slice(1), 10);
  if (n === 1 || n === 7) return 'Biergas';
  if (n >= 2 && n <= 6) return 'CO2';
  if (n >= 10 && n <= 12) return 'Argon';
  if (n >= 15 && n <= 17) return 'Arcox (Mischgas)';
  if (n >= 20 && n <= 22) return 'Sauerstoff';
  if (n >= 30 && n <= 33) return 'Stickstoff';
  if (n >= 35 && n <= 37) return 'Acetylen';
  if (n === 38) return 'Formiergas';
  return 'Sonstige';
};

/** Lexware-Nummer RG-7801200 / NRG-7801200 -> Stammnummer 7801200 */
const stammNr = (nr) => String(nr || '').trim().replace(/^N?RG-/i, '');

const zahl = (v) => (v == null || v === '' ? null : Number(v));

/**
 * artikel: Zeilen aus gas_artikel { artikel_nr, bezeichnung, gasart, kg_fuellung, fuellgewicht_kg, typ, zaehlt_als_flasche, preis_netto_cent }
 * aenderungen: Zeilen aus price_change_log { article_number, datum 'YYYY-MM-DD', old_net, new_net, id }
 */
function baueStamm({ artikel, aenderungen = [] }) {
  const ARTIKEL = {};
  const aktuell = {};
  for (const r of artikel) {
    const nr = String(r.artikel_nr);
    if (r.preis_netto_cent != null) aktuell[nr] = Number(r.preis_netto_cent) / 100;
    // Füllungen, die als Flasche zählen. Pfand-, Steuer- und Provisionsartikel (typ P/S/V) und Paletten/Kappen nicht.
    if ((r.typ && r.typ !== 'F') || r.zaehlt_als_flasche === 0 || r.zaehlt_als_flasche === false) continue;
    const gasart = r.gasart || gasartVon(nr);
    const kg = zahl(r.kg_fuellung) ?? (KG_ARTEN.has(gasart) ? zahl(r.fuellgewicht_kg) : null);
    ARTIKEL[nr] = { artikel_nr: nr, bezeichnung: r.bezeichnung, gasart, kg_fuellung: KG_ARTEN.has(gasart) ? kg : null };
  }

  const historie = {};
  for (const a of [...aenderungen].sort((x, y) => (x.datum < y.datum ? -1 : x.datum > y.datum ? 1 : (x.id ?? 0) - (y.id ?? 0)))) {
    const nr = stammNr(a.article_number);
    (historie[nr] = historie[nr] || []).push({ ab: a.datum, davor: a.old_net == null ? null : Number(a.old_net), danach: Number(a.new_net) });
  }

  /** Aktueller Netto-Listenpreis; fehlt er im Stamm, gilt die letzte protokollierte Änderung. */
  const aktuellerPreis = (nr) => {
    if (nr in aktuell) return aktuell[nr];
    const h = historie[nr];
    return h ? h[h.length - 1].danach : null;
  };

  /** Listenpreis netto am Belegtag (ISO), null wenn unbekannt. */
  const listenpreis = (nr, iso) => {
    for (const h of historie[nr] || []) if (iso < h.ab && h.davor != null) return h.davor;
    return aktuellerPreis(nr);
  };

  const vorhanden = new Set(Object.values(ARTIKEL).map((a) => a.gasart));
  const reihenfolge = [...GASART_REIHENFOLGE, ...[...vorhanden].filter((g) => !GASART_REIHENFOLGE.includes(g)).sort()];
  return { ARTIKEL, GASART_REIHENFOLGE: reihenfolge, listenpreis, aktuellerPreis };
}

async function ladeStamm(db) {
  const [artikel] = await db.query(
    'SELECT artikel_nr, bezeichnung, gasart, kg_fuellung, fuellgewicht_kg, typ, zaehlt_als_flasche, preis_netto_cent FROM gas_artikel');
  const [aenderungen] = await db.query(
    `SELECT id, article_number, DATE_FORMAT(created_at, '%Y-%m-%d') AS datum, old_net, new_net
       FROM price_change_log WHERE status = 'ok' AND target = 'lexware' ORDER BY created_at, id`);
  return baueStamm({ artikel, aenderungen });
}

module.exports = { baueStamm, ladeStamm, stammNr, gasartVon, KG_ARTEN, GASART_REIHENFOLGE };
