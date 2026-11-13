/**
 * #552: Artikelstamm aus dem SER-Tabellenexport (`produkte_tab.csv`) in gas_artikel überführen.
 *
 * Anders als der Preis-Push-Import (#260, serProductCsv.readSerExport) darf die Datei hier
 * in Excel bearbeitet sein (Semikolon, CRLF, NULL → leer): Wer Artikel nicht mehr führt,
 * löscht die Zeilen einfach. Der Abgleich ergänzt nur leere Felder und überschreibt nie einen
 * Wert, der im Portal schon steht (z. B. eine Preisänderung der letzten Wochen).
 */

const { parseCsv, decode, detectDelimiter, RANDL_VERSORGER_ID } = require('./serProductCsv');

const QUELLE = 'ser';

// Felder, die der Import befüllt (Portal-Spalte in gas_artikel)
const FELDER = ['bezeichnung', 'typ', 'un_nr', 'gefahrklasse', 'ggvs_faktor', 'befoerderungskategorie',
  'fuellgewicht_kg', 'inhalt_l', 'preis_netto_cent', 'mwst_satz', 'pfand_artikel_nr', 'kategorie', 'kg_fuellung'];

const MWST_REGEL = 19;
const MWST_ERMAESSIGT = 7;

// ADR 1.1.3.6: Multiplikator → Beförderungskategorie
const KATEGORIE_ZU_FAKTOR = { 50: 1, 3: 2, 1: 3 };

// Excel macht aus „2.1“ ein Datum („02. Jan“); zurück in die Gefahrklasse wandeln
const MONATE = { jan: 1, feb: 2, mär: 3, mrz: 3, apr: 4, mai: 5, jun: 6, jul: 7, aug: 8, sep: 9, okt: 10, nov: 11, dez: 12 };
const excelDatumZuKlasse = v => {
  const m = /^0?(\d{1,2})\.\s*([A-Za-zäÄ]{3})\.?$/.exec(String(v ?? '').trim());
  const monat = m && MONATE[m[2].toLowerCase()];
  return monat ? `${Number(m[1])}.${monat}` : null;
};

const text = v => (v == null || String(v).trim() === '' ? null : String(v).trim());
const zahl = v => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/** SER speichert Gewicht und Inhalt × 1000 (11 kg → 11000). */
const tausendstel = v => (zahl(v) > 0 ? v / 1000 : null);

/** Eine Exportzeile auf die Felder des Portals abbilden. */
function abbilden(r, nrZuId) {
  const artikelNr = String(r.nr);
  const faktor = zahl(r.ggvs_faktor);
  const faktorBekannt = faktor in KATEGORIE_ZU_FAKTOR;
  const unNr = text(r.unnr);
  const typ = text(r.typ);
  const gewicht = tausendstel(r.fuellgewicht);
  const istPropan = typ === 'F' && artikelNr.startsWith('78');

  return {
    artikel_nr: artikelNr,
    aktiv: r.active !== false,
    werte: {
      bezeichnung: text(r.name),
      typ,
      un_nr: unNr && unNr !== '0' ? unNr : null,
      gefahrklasse: excelDatumZuKlasse(r.gefahrzettel_nr) || text(r.gefahrzettel_nr),
      ggvs_faktor: faktor > 0 ? faktor : null,
      befoerderungskategorie: faktorBekannt ? KATEGORIE_ZU_FAKTOR[faktor] : null,
      fuellgewicht_kg: gewicht,
      inhalt_l: tausendstel(r.inhalt),
      preis_netto_cent: typ === 'F' || typ === 'P' ? zahl(r.preis) : null,
      mwst_satz: r.mwst_ermaessigt === true ? MWST_ERMAESSIGT : MWST_REGEL,
      pfand_artikel_nr: r.pfand_produkt_id == null ? null : (nrZuId.get(String(r.pfand_produkt_id)) || null),
      kategorie: typ === 'F' ? (istPropan ? 'propan' : 'technisch') : null,
      kg_fuellung: istPropan ? gewicht : null,
    },
    pfandVerweisOffen: r.pfand_produkt_id != null && !nrZuId.has(String(r.pfand_produkt_id)),
  };
}

/**
 * Export einlesen.
 * @param {Buffer|Uint8Array} buffer
 * @returns {{ artikel: object[], warnings: string[], stats: object }}
 */
function leseArtikelExport(buffer, { versorgerId = RANDL_VERSORGER_ID } = {}) {
  const { text: inhalt, encoding } = decode(buffer);
  const delimiter = detectDelimiter(inhalt);
  const { header, rows } = parseCsv(inhalt, { delimiter, allowExcel: true });
  const warnings = [];

  const fehlend = ['id', 'typ', 'nr', 'name', 'preis', 'active'].filter(c => !header.includes(c));
  if (fehlend.length) {
    throw Object.assign(new Error(`Kein SER-Produktexport: Spalten fehlen (${fehlend.join(', ')})`), { status: 400 });
  }
  if (encoding !== 'utf-8') warnings.push('Datei ist nicht UTF-8 – als Windows-1252 gelesen, Umlaute prüfen');

  // Verweise (Pfand) werden über id aufgelöst, auch wenn der Zielartikel gelöscht wurde
  const nrZuId = new Map(rows.filter(r => r.nr != null).map(r => [String(r.id), String(r.nr)]));

  const hatVersorger = header.includes('versorger_id');
  const hatHistorie = header.includes('history_discriminator');
  const aktuell = rows.filter(r => (!hatVersorger || String(r.versorger_id) === versorgerId)
    && (!hatHistorie || r.history_discriminator === 'C' || r.history_discriminator == null) && r.geloescht !== true);
  const ohneHistorie = aktuell.filter(r => r.history_discriminator == null).length;
  if (hatHistorie && ohneHistorie) warnings.push(`${ohneHistorie} Zeilen ohne Historie-Kennung (von Hand ergänzt?) als aktuell übernommen`);
  if (rows.some(r => excelDatumZuKlasse(r.gefahrzettel_nr))) warnings.push('Gefahrklasse war von Excel in ein Datum verwandelt (z. B. „02. Jan“) und wurde zurückgesetzt (2.1, 2.2)');

  const gesehen = new Set();
  const artikel = [];
  for (const r of aktuell) {
    if (r.nr == null || String(r.nr).trim() === '') { warnings.push(`Zeile ohne Artikelnummer (id ${r.id}) übersprungen`); continue; }
    const a = abbilden(r, nrZuId);
    if (a.artikel_nr.length > 16) { warnings.push(`${a.artikel_nr}: Nummer länger als 16 Zeichen, übersprungen`); continue; }
    if (gesehen.has(a.artikel_nr)) {
      throw Object.assign(new Error(`Artikelnummer ${a.artikel_nr} kommt mehrfach als aktuell vor`), { status: 400 });
    }
    gesehen.add(a.artikel_nr);
    if (a.pfandVerweisOffen) warnings.push(`${a.artikel_nr}: Pfandartikel im Export nicht (mehr) vorhanden, Zuordnung bleibt leer`);
    if (r.ggvs_faktor > 0 && !(r.ggvs_faktor in KATEGORIE_ZU_FAKTOR)) {
      warnings.push(`${a.artikel_nr}: ADR-Faktor ${r.ggvs_faktor} ist keiner Beförderungskategorie zugeordnet`);
    }
    if (a.werte.typ === 'F' && a.aktiv && !a.werte.un_nr) warnings.push(`${a.artikel_nr}: Füllung ohne UN-Nummer`);
    delete a.pfandVerweisOffen;
    artikel.push(a);
  }

  if (!artikel.length) {
    throw Object.assign(new Error('Keine aktuellen Artikel in der Datei'), { status: 400 });
  }

  // Pfandzuordnung auf Artikel prüfen, die in dieser Datei fehlen
  const nummern = new Set(artikel.map(a => a.artikel_nr));
  for (const a of artikel) {
    const p = a.werte.pfand_artikel_nr;
    if (p && !nummern.has(p)) warnings.push(`${a.artikel_nr}: Pfandartikel ${p} steht nicht in der Datei`);
  }

  return { artikel, warnings, stats: { rows: rows.length, delimiter, encoding, uebernommen: artikel.length } };
}

const leer = v => v == null || v === '';
const gleich = (a, b) => (leer(a) && leer(b)) || String(a) === String(b)
  || (Number.isFinite(Number(a)) && Number.isFinite(Number(b)) && Number(a) === Number(b));

/**
 * Abgleich Export ↔ Portal.
 * - neu: Artikel fehlt im Portal → komplett anlegen
 * - ergaenzt: Artikel da, einzelne Felder leer → nur diese füllen
 * - abweichend: Feld im Portal gefüllt und anders → bleibt, wird gemeldet
 * Nichts wird gelöscht oder deaktiviert; Artikel nur im Portal bleiben unberührt.
 *
 * @param {object[]} bestand  Zeilen aus gas_artikel (Spaltennamen wie in der Tabelle)
 * @param {object[]} artikel  Ergebnis von leseArtikelExport().artikel
 */
function planeAbgleich(bestand, artikel, { jetzt = new Date().toISOString() } = {}) {
  const vorhanden = new Map(bestand.map(b => [String(b.artikel_nr), b]));
  const plan = { neu: [], ergaenzt: [], abweichend: [], unveraendert: 0, nurImPortal: [] };
  const importiert = new Set();

  for (const a of artikel) {
    importiert.add(a.artikel_nr);
    const b = vorhanden.get(a.artikel_nr);
    const stand = Object.fromEntries(FELDER.filter(f => !leer(a.werte[f]))
      .map(f => [f, { quelle: QUELLE, am: jetzt }]));

    if (!b) {
      plan.neu.push({ artikel_nr: a.artikel_nr, aktiv: a.aktiv, werte: a.werte, feld_stand: stand });
      continue;
    }

    const fuellen = {};
    const abweichungen = [];
    for (const f of FELDER) {
      const neu = a.werte[f];
      if (leer(neu)) continue;
      if (leer(b[f])) fuellen[f] = neu;
      else if (!gleich(b[f], neu)) abweichungen.push({ feld: f, portal: b[f], export: neu });
    }
    if (abweichungen.length) plan.abweichend.push({ artikel_nr: a.artikel_nr, bezeichnung: b.bezeichnung, felder: abweichungen });
    if (Object.keys(fuellen).length) {
      plan.ergaenzt.push({
        artikel_nr: a.artikel_nr, werte: fuellen,
        feld_stand: Object.fromEntries(Object.keys(fuellen).map(f => [f, stand[f]])),
      });
    } else if (!abweichungen.length) plan.unveraendert++;
  }

  plan.nurImPortal = bestand.filter(b => !importiert.has(String(b.artikel_nr))).map(b => String(b.artikel_nr));
  return plan;
}

module.exports = { leseArtikelExport, planeAbgleich, FELDER };
