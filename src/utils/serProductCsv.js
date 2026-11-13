/**
 * #260 (07.10.2026): SER-Produktstamm aus dem Tabellen-Export einlesen (`produkte_tab.csv`).
 *
 * Format: CSV mit Kopfzeile, Texte in Anführungszeichen, Zahlen/True/False/NULL ohne.
 * Pro Produkt gibt es Zeilen mit history_discriminator C (aktuell) und H (Historie);
 * verwendet werden nur C-Zeilen des Versorgers 318 (Randl), aktiv und nicht gelöscht.
 * Preise stehen in Cent, `inhalt` als Wert × 1000 (11 kg → 11000, 50 L → 50000).
 *
 * Verweise auf andere Produkte (Pfand, Steuer, …) sind interne SER-IDs und werden
 * über `id` auf die Produktnummer aufgelöst (z. B. 729360 → 5920051), weil STMUPD
 * (#261) die Nummer erwartet.
 */

const RANDL_VERSORGER_ID = '318';

// Spalten, ohne die ein Import keinen Sinn ergibt
const REQUIRED_COLUMNS = ['id', 'versorger_id', 'typ', 'nr', 'name', 'preis', 'active',
  'history_discriminator', 'geloescht', 'inhalt'];

// Verweis-Spalte → Feld mit der aufgelösten Produktnummer
const REFERENCES = {
  pfand_produkt_id: 'pfand_nr',
  provision_produkt_id: 'provision_nr',
  steuer_produkt_id: 'steuer_nr',
  leerflasche_produkt_id: 'leerflaschen_nr',
  ruecknahmekosten_produkt_id: 'ruecknahmekosten_nr',
};

// Spalten des Exports vom 06.10.2026 (67) – neue oder fehlende Spalten werden gemeldet
const KNOWN_COLUMNS = new Set(['id', 'versorger_id', 'typ', 'nr', 'name', 'preis', 'allg_produkt_id',
  'pfand_produkt_id', 'provision_produkt_id', 'steuer_produkt_id', 'leerflasche_produkt_id', 'musseingabe',
  'kundenabhaengige_musseingabe', 'pfandpflicht', 'negative_bestaende', 'nachlassfaehig', 'lfdnummer',
  'active', 'produkt_id', 'history_discriminator', 'fuellgewicht', 'behaeltergewicht', 'art',
  'bestandsrelevant', 'techngas', 'unnr', 'ggvs_faktor', 'gefahrzettel_nr', 'bezadr', 'bezchem',
  'anz_dispo', 'anzahl_pro_gitterbox', 'stapelbar', 'chargenpflicht', 'inhalt', 'geloescht', 'palette',
  'eingabe_voll', 'eingabe_leer', 'nullpreis_erlaubt', 'akonto', 'mmz_bis', 'fgl_gruppenbez',
  'sonderprodukt', 'gutschrift', 'ruecknahmekosten_produkt_id', 'datev_konto', 'datev_bu_schluessel',
  'datev_konto_eu', 'datev_konto_barverkauf', 'voll_leer_check', 'handlingskosten', 'inventar',
  'rueck_zuschlag', 'apprelevant', 'palette_produkt_id', 'produkt_ex_id', 'neutral', 'tankgas',
  'ek_preis', 'campinggaz', 'fremdfuellung', 'mengen_zusammenfassung', 'mwst_ermaessigt', 'barcode_nr',
  'datev_konto_mwstfrei', 'paletten_pruefung']);

// Typische Zeichen, wenn UTF-8 als Latin-1 gelesen wurde („Ã¼“ statt „ü“) oder Ersatzzeichen
const MOJIBAKE_RE = /Ã.|Â.|�/;

/** Datei-Inhalt dekodieren: UTF-8, sonst Windows-1252 (alte Exporte). */
function decode(buffer) {
  let text;
  let encoding = 'utf-8';
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(buffer);
  } catch {
    text = new TextDecoder('windows-1252').decode(buffer);
    encoding = 'windows-1252';
  }
  if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
  return { text, encoding };
}

/** Unquotierten Wert typisieren: NULL → null, True/False → bool, Zahl → number. */
function typed(raw) {
  if (raw === 'NULL' || raw === '') return null;
  if (raw === 'True') return true;
  if (raw === 'False') return false;
  if (/^-?\d+(\.\d+)?$/.test(raw)) return Number(raw);
  return raw;
}

/**
 * CSV parsen (RFC 4180, Trennzeichen Komma). Quotierte Werte bleiben Strings,
 * damit z. B. "0070" oder "" nicht zu Zahlen bzw. null werden.
 * @returns {{ header: string[], rows: object[] }}
 */
function parseCsv(text, { delimiter = ',', allowExcel = false } = {}) {
  const records = [];
  let record = [];
  let i = 0;
  const n = text.length;

  while (i < n) {
    let value;
    if (text[i] === '"') {
      let s = '';
      i++;
      for (;;) {
        if (i >= n) throw new Error('CSV: Anführungszeichen nicht geschlossen');
        if (text[i] === '"') {
          if (text[i + 1] === '"') { s += '"'; i += 2; continue; }
          i++;
          break;
        }
        s += text[i++];
      }
      value = s;
    } else {
      let j = i;
      while (j < n && text[j] !== delimiter && text[j] !== '\n' && text[j] !== '\r') j++;
      value = typed(text.slice(i, j));
      i = j;
    }
    record.push(value);

    if (text[i] === delimiter) { i++; continue; }
    if (text[i] === '\r') i++;
    if (text[i] === '\n') i++;
    records.push(record);
    record = [];
  }

  const nonEmpty = records.filter(r => !(r.length === 1 && r[0] === null));
  if (nonEmpty.length === 0) throw new Error('Datei ist leer');
  const header = nonEmpty[0].map(String);
  // Excel packt beim Speichern gern jede Zeile in eine Zelle (alles in Anführungszeichen)
  if (header.length < 2 && !allowExcel) {
    throw Object.assign(new Error('Datei ist kein unveränderter SER-Export (nur eine Spalte erkannt) – vermutlich in Excel '
      + 'bearbeitet und gespeichert. Bitte den Original-Export verwenden; Änderungen nur im Texteditor.'), { status: 400 });
  }
  const rows = nonEmpty.slice(1).map((r, idx) => {
    if (r.length !== header.length) {
      throw new Error(`CSV: Zeile ${idx + 2} hat ${r.length} statt ${header.length} Spalten`);
    }
    return Object.fromEntries(header.map((h, k) => [h, r[k]]));
  });
  return { header, rows };
}

/** Trennzeichen aus der Kopfzeile: Excel speichert deutsche CSV mit Semikolon. */
function detectDelimiter(text) {
  const head = text.slice(0, text.search(/\r?\n/) === -1 ? text.length : text.search(/\r?\n/));
  return (head.match(/;/g) || []).length > (head.match(/,/g) || []).length ? ';' : ',';
}

/**
 * Export einlesen und aktuelle Randl-Produkte liefern.
 * @param {Buffer|Uint8Array} buffer
 * @returns {{ products: object[], inactive: object[], warnings: string[], stats: object }}
 *   products: { prodnr, name, typ, preis, inhalt, record } – record = vollständige Zeile
 *   plus aufgelöste Verweise (*_nr).
 */
function readSerExport(buffer, { versorgerId = RANDL_VERSORGER_ID } = {}) {
  const { text, encoding } = decode(buffer);
  const { header, rows } = parseCsv(text);
  const warnings = [];

  const missing = REQUIRED_COLUMNS.filter(c => !header.includes(c));
  if (missing.length) {
    throw Object.assign(new Error(`Kein SER-Produktexport: Spalten fehlen (${missing.join(', ')})`), { status: 400 });
  }
  const unknown = header.filter(h => !KNOWN_COLUMNS.has(h));
  const absent = [...KNOWN_COLUMNS].filter(c => !header.includes(c));
  if (unknown.length) warnings.push(`Neue Spalten im Export: ${unknown.join(', ')}`);
  if (absent.length) warnings.push(`Spalten fehlen im Export: ${absent.join(', ')}`);
  if (encoding !== 'utf-8') warnings.push('Datei ist nicht UTF-8 – als Windows-1252 gelesen, Umlaute prüfen');

  const nrById = new Map(rows.map(r => [String(r.id), r.nr == null ? null : String(r.nr)]));
  const current = rows.filter(r => String(r.versorger_id) === versorgerId && r.history_discriminator === 'C');
  const usable = current.filter(r => r.active === true && r.geloescht !== true);
  const inactive = current.filter(r => !(r.active === true && r.geloescht !== true));

  const seen = new Set();
  const products = [];
  for (const r of usable) {
    const prodnr = r.nr == null ? '' : String(r.nr);
    if (!prodnr) { warnings.push(`Produkt ohne Nummer (id ${r.id}) übersprungen`); continue; }
    if (prodnr.length > 10) warnings.push(`Produktnummer ${prodnr} länger als 10 Zeichen`);
    if (seen.has(prodnr)) {
      throw Object.assign(new Error(`Produktnummer ${prodnr} kommt mehrfach als aktuell vor`), { status: 400 });
    }
    seen.add(prodnr);

    const record = { ...r };
    for (const [col, field] of Object.entries(REFERENCES)) {
      if (!(col in r) || r[col] == null) { record[field] = null; continue; }
      const nr = nrById.get(String(r[col]));
      if (!nr) warnings.push(`${prodnr}: Verweis ${col}=${r[col]} nicht auflösbar`);
      record[field] = nr || null;
    }
    if (MOJIBAKE_RE.test(String(r.name || ''))) warnings.push(`${prodnr}: Name mit kaputten Sonderzeichen („${r.name}“)`);

    products.push({
      prodnr,
      name: r.name == null ? '' : String(r.name),
      typ: r.typ == null ? null : String(r.typ),
      preis: typeof r.preis === 'number' ? r.preis : null,
      inhalt: typeof r.inhalt === 'number' ? r.inhalt : null,
      record,
    });
  }

  if (products.length === 0) {
    throw Object.assign(new Error(`Keine aktuellen Produkte des Versorgers ${versorgerId} in der Datei`), { status: 400 });
  }

  return {
    products,
    inactive: inactive.map(r => ({ prodnr: String(r.nr), name: r.name })),
    warnings,
    stats: { rows: rows.length, columns: header.length, current: current.length, usable: products.length, encoding },
  };
}

module.exports = { readSerExport, parseCsv, decode, detectDelimiter, RANDL_VERSORGER_ID };
