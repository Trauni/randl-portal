/**
 * #617 Schritt A3: Lexware-ID, Einheit und Bezeichnung aus Lexware in den Artikelstamm übernehmen, Sparten anlegen und zuordnen.
 * Lexware ist hier nur Quelle (gelesen), geschrieben wird nur in die Portal-DB:
 *  - gas_artikel: lexware_id, einheit, bezeichnung (nur wo das Portal sie nicht selbst geändert hat), gruppe_id (Sparte, nur wenn leer)
 *  - gas_artikel.feld_stand (Quelle "lexware") und gas_artikel_aenderungen (Verlauf)
 *  - artikel_gruppe: die Sparten (Gashandel, Zeltverleih, Technik und Event, Maschinenbau)
 * Der Typ wird NICHT angefasst. Nichts geht nach Lexware, SER oder in den Shop.
 *
 * Zuordnung: Nummer ohne Präfix, nur für die Gas-Präfixe (RG, NRG, PFAND, GZ), damit keine Zelt-Nummer zufällig trifft.
 * Hat ein Stammartikel mehrere Lexware-Treffer, wird er übersprungen und gemeldet.
 */
const { ohnePraefix, praefixVon, sparteVon, SPARTE_NACH_PRAEFIX } = require('../utils/lexwareArtikelAnalyse');

const GAS_PRAEFIXE = new Set(['RG', 'NRG', 'PFAND', 'GZ']);
const SPARTEN = ['Gashandel', 'Zeltverleih', 'Technik und Event', 'Maschinenbau'];
const norm = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();
const parseJson = (v) => { try { return (typeof v === 'string' ? JSON.parse(v) : v) || {}; } catch { return {}; } };

/**
 * stamm: gas_artikel { artikel_nr, bezeichnung, einheit, lexware_id, gruppe_id, feld_stand }
 * lexware: Artikel von GET /articles
 * opt.auchPortalGeaenderte: Bezeichnungen überschreiben, die im Portal von Hand geändert wurden (sonst nur gemeldet)
 */
function planeStammAusLexware(stamm, lexware, { auchPortalGeaenderte = false } = {}) {
  const nachKern = new Map();
  for (const a of (lexware || []).filter((x) => !x.archived && x.articleNumber && GAS_PRAEFIXE.has(praefixVon(String(x.articleNumber).trim())))) {
    const k = ohnePraefix(String(a.articleNumber).trim());
    nachKern.set(k, [...(nachKern.get(k) || []), a]);
  }
  const zeilen = [], mehrdeutig = [], portalGeaendert = [], keinLexware = [];
  let gleich = 0;
  for (const s of stamm) {
    const nr = String(s.artikel_nr);
    const treffer = nachKern.get(nr) || [];
    if (!treffer.length) { keinLexware.push(nr); continue; }
    if (treffer.length > 1) { mehrdeutig.push(nr); continue; }
    const l = treffer[0];
    const stand = parseJson(s.feld_stand);
    const neu = {};
    if (s.lexware_id !== l.id) neu.lexware_id = l.id;
    if (norm(l.unitName) && norm(s.einheit) !== norm(l.unitName)) neu.einheit = norm(l.unitName);
    if (norm(l.title) && norm(s.bezeichnung) !== norm(l.title)) {
      if (stand.bezeichnung?.quelle === 'portal' && !auchPortalGeaenderte) portalGeaendert.push({ artikel_nr: nr, portal: norm(s.bezeichnung), lexware: norm(l.title) });
      else neu.bezeichnung = norm(l.title);
    }
    const sparte = sparteVon(praefixVon(String(l.articleNumber).trim()));
    if (s.gruppe_id == null && sparte) neu.sparte = sparte;
    if (!Object.keys(neu).length) { gleich++; continue; }
    zeilen.push({ artikel_nr: nr, lexware_nummer: l.articleNumber, alt: { bezeichnung: s.bezeichnung, einheit: s.einheit, lexware_id: s.lexware_id }, neu, felder: Object.keys(neu) });
  }
  zeilen.sort((a, b) => a.artikel_nr.localeCompare(b.artikel_nr));
  return { zeilen, gleich, mehrdeutig, portalGeaendert, keinLexware };
}

/** Übernahme nur, wenn die Vorschau noch stimmt (Anzahl der Zeilen), sonst 409. */
function pruefeErwartung(plan, erwartet) {
  return !!erwartet && erwartet.anzahl === plan.zeilen.length;
}

async function uebernehmeStammAusLexware(db, lexware, user = {}, erwartet, opt = {}) {
  const [stamm] = await db.query('SELECT artikel_nr, bezeichnung, einheit, lexware_id, gruppe_id, feld_stand FROM gas_artikel');
  const plan = planeStammAusLexware(stamm, lexware, opt);
  if (!pruefeErwartung(plan, erwartet)) {
    const err = new Error('Die Daten haben sich seit der Vorschau geändert, bitte die Vorschau neu laden');
    err.status = 409;
    err.plan = plan;
    throw err;
  }
  const standNachNr = new Map(stamm.map((a) => [String(a.artikel_nr), parseJson(a.feld_stand)]));
  const jetzt = new Date().toISOString();
  const von = [user.id || null, user.fullName || user.username || user.name || 'Abgleich aus Lexware (#617)'];
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    // Sparten: je Name einmal oberste Ebene (UNIQUE (parent_id, name) greift bei NULL nicht, deshalb NOT EXISTS)
    for (const [i, name] of SPARTEN.entries()) {
      await conn.query('INSERT INTO artikel_gruppe (parent_id, name, sortierung) SELECT NULL, ?, ? FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM artikel_gruppe WHERE parent_id IS NULL AND name = ?)', [name, (i + 1) * 10, name]);
    }
    const [gruppen] = await conn.query('SELECT id, name FROM artikel_gruppe WHERE parent_id IS NULL');
    const gruppeId = new Map(gruppen.map((g) => [g.name, g.id]));
    for (const z of plan.zeilen) {
      const spalten = [], werte = [], verlauf = [];
      for (const f of ['lexware_id', 'einheit', 'bezeichnung']) {
        if (!(f in z.neu)) continue;
        spalten.push(`${f} = ?`); werte.push(z.neu[f]);
        verlauf.push([z.artikel_nr, f, z.alt[f] == null ? null : String(z.alt[f]), z.neu[f], ...von]);
      }
      if (z.neu.sparte && gruppeId.has(z.neu.sparte)) {
        spalten.push('gruppe_id = ?'); werte.push(gruppeId.get(z.neu.sparte));
        verlauf.push([z.artikel_nr, 'gruppe', null, z.neu.sparte, ...von]);
      }
      if (!spalten.length) continue;
      const stand = { ...standNachNr.get(z.artikel_nr) };
      for (const f of ['lexware_id', 'einheit', 'bezeichnung']) if (f in z.neu) stand[f] = { quelle: 'lexware', am: jetzt };
      spalten.push('feld_stand = ?'); werte.push(JSON.stringify(stand));
      await conn.query(`UPDATE gas_artikel SET ${spalten.join(', ')} WHERE artikel_nr = ?`, [...werte, z.artikel_nr]);
      await conn.query('INSERT INTO gas_artikel_aenderungen (artikel_nr, feld, alt, neu, von_id, von_name) VALUES ?', [verlauf]);
    }
    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
  return { geaendert: plan.zeilen.length, unveraendert: plan.gleich, mehrdeutig: plan.mehrdeutig.length, portalGeaendert: plan.portalGeaendert.length };
}

/**
 * Typ-Vorschlag aus dem Lexware-Präfix: GZ- (Gaszubehör) ist Zubehör (Z), außer Versand und Fracht (D = Dienstleistung).
 * Der Typ ist ein Portal-Feld; vorgeschlagen wird nur, gesetzt wird erst nach Bestätigung (Skript mit --ja), über dieselbe
 * Änderungsfunktion wie "Felder bearbeiten" (Regeln, Verlauf, feld_stand Quelle portal).
 */
function planeTypAusPraefix(stamm, lexware) {
  const nachKern = new Map();
  for (const a of (lexware || []).filter((x) => !x.archived && x.articleNumber)) {
    const nr = String(a.articleNumber).trim();
    if (praefixVon(nr) === 'GZ') nachKern.set(ohnePraefix(nr), a);
  }
  const zeilen = [];
  for (const s of stamm || []) {
    const l = nachKern.get(String(s.artikel_nr));
    if (!l) continue;
    const typNeu = /versand|fracht/i.test(l.title || s.bezeichnung || '') ? 'D' : 'Z';
    if (s.typ === typNeu) continue;
    zeilen.push({ artikel_nr: String(s.artikel_nr), bezeichnung: l.title || s.bezeichnung || '', typAlt: s.typ || '', typNeu });
  }
  return zeilen.sort((a, b) => a.artikel_nr.localeCompare(b.artikel_nr));
}

/** Typen setzen: gruppiert je neuem Typ über artikelstamm.aendere; Fehler je Gruppe werden gesammelt, nichts bricht ab. */
async function setzeTypen(zeilen, user = {}) {
  const { aendere } = require('./artikelstamm');
  const ergebnis = { geaendert: 0, fehler: [] };
  for (const typ of [...new Set(zeilen.map((z) => z.typNeu))]) {
    const nummern = zeilen.filter((z) => z.typNeu === typ).map((z) => z.artikel_nr);
    try { ergebnis.geaendert += (await aendere(nummern, { typ }, user)).geaendert; }
    catch (err) { ergebnis.fehler.push(`${typ}: ${err.message}`); }
  }
  return ergebnis;
}

module.exports = { planeTypAusPraefix, setzeTypen, planeStammAusLexware, pruefeErwartung, uebernehmeStammAusLexware, SPARTEN, SPARTE_NACH_PRAEFIX };
