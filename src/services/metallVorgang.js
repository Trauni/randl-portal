/**
 * Metall-Vorgang — Vorgangsnummer und erste Zeile des Lexware-Einleitungstexts (#362).
 *
 * Ein Vorgang = eine Bestellung, Nummer V-JJ-NNNN, fortlaufend pro Jahr
 * (Tabelle metall_vorgang_zaehler, siehe migration_metall.sql).
 *
 * Die Nummer steht in der ersten Zeile des Einleitungstexts, nicht im Betreff:
 * Lexware setzt den Betreff beim Umwandeln auf den Standard zurueck, den
 * Einleitungstext uebernimmt es (Test #351). Format:
 *   "Ihre Bestellnr. 4711 · Vorgang V-26-0012"   (mit Kunden-Bestellnr.)
 *   "Vorgang V-26-0012"                          (ohne)
 *
 * leseEinleitung() ist die Gegenrichtung fuer den Sync (#363, zuordnung = 'einleitung').
 */

const BESTELLNR_MAX = 100; // metall_vorgang.kunden_bestellnr VARCHAR(100)

// V-26-0012; mehr als vier Stellen erlaubt, falls ein Jahr ueber 9999 Vorgaenge hat
const NUMMER_RE = /\bV-(\d{2})-(\d{4,})\b/;
// Unsere Zeile: optional "Ihre Bestellnr. <x> · ", dann "Vorgang V-JJ-NNNN".
// Bestellnr. gierig bis zum letzten " · Vorgang", damit ein "·" in der Bestellnr. nicht stoert.
const ZEILE_RE = /^\s*(?:Ihre\s+Bestellnr\.\s*(.+)\s+·\s+)?Vorgang\s+(V-\d{2}-\d{4,})\s*$/i;

function formatVorgangsnummer(jahr, nr) {
  return `V-${String(jahr % 100).padStart(2, '0')}-${String(nr).padStart(4, '0')}`;
}

/**
 * Naechste Vorgangsnummer ziehen. Ohne Doppelvergabe auch bei gleichzeitigen
 * Aufrufen: der Zaehler wird per Zeilensperre hochgezaehlt, LAST_INSERT_ID(expr)
 * merkt sich den neuen Wert pro Verbindung.
 *
 * conn: eine Verbindung (pool.getConnection()), idealerweise in der Transaktion,
 * die auch den Vorgang anlegt — dann gibt ein Rollback die Nummer nicht frei,
 * aber es entsteht hoechstens eine Luecke (laut Entscheidung #361 in Ordnung).
 * Ein Pool geht nicht: beide Statements muessen auf derselben Verbindung laufen.
 */
async function naechsteVorgangsnummer(conn, jetzt = new Date()) {
  if (!conn || typeof conn.getConnection === 'function') {
    throw new Error('naechsteVorgangsnummer braucht eine Verbindung (pool.getConnection()), keinen Pool');
  }
  const jahr = jetzt.getFullYear();
  await conn.execute(
    `INSERT INTO metall_vorgang_zaehler (jahr, letzte_nr) VALUES (?, LAST_INSERT_ID(1))
     ON DUPLICATE KEY UPDATE letzte_nr = LAST_INSERT_ID(letzte_nr + 1)`,
    [jahr]
  );
  const [[{ nr }]] = await conn.query('SELECT LAST_INSERT_ID() AS nr');
  return formatVorgangsnummer(jahr, Number(nr));
}

/**
 * Kunden-Bestellnr. bereinigen: Zeilenumbrueche und Mehrfach-Leerzeichen zu einem
 * Leerzeichen, leer → null. Zu lang → Fehler (statt still abschneiden).
 */
function normalisiereBestellnr(wert) {
  if (wert == null) return null;
  const s = String(wert).replace(/\s+/g, ' ').trim();
  if (!s) return null;
  if (s.length > BESTELLNR_MAX) {
    throw new Error(`Bestellnummer ist zu lang (max. ${BESTELLNR_MAX} Zeichen)`);
  }
  return s;
}

function einleitungZeile({ vorgangsnummer, kundenBestellnr }) {
  if (!NUMMER_RE.test(vorgangsnummer || '')) {
    throw new Error(`Ungueltige Vorgangsnummer: ${vorgangsnummer}`);
  }
  const bestellnr = normalisiereBestellnr(kundenBestellnr);
  return bestellnr
    ? `Ihre Bestellnr. ${bestellnr} · Vorgang ${vorgangsnummer}`
    : `Vorgang ${vorgangsnummer}`;
}

/**
 * Unsere Zeile in einen Einleitungstext setzen: ist die erste Zeile schon eine
 * Vorgangszeile, wird sie ersetzt (AB aus Angebot fuer eine zweite Bestellung, #365),
 * sonst wird die Zeile vorangestellt. Der Rest bleibt unveraendert.
 */
function setzeEinleitung(text, zeile) {
  const zeilen = String(text || '').split(/\r?\n/);
  if (ZEILE_RE.test(zeilen[0])) zeilen.shift();
  const rest = zeilen.join('\n').replace(/^\n+/, '');
  return rest ? `${zeile}\n${rest}` : zeile;
}

/**
 * Vorgangs- und Bestellnummer aus einem Einleitungstext lesen.
 * Bevorzugt die erste Zeile im genauen Format; sonst die erste V-Nummer irgendwo
 * im Text (z. B. wenn das Buero die Zeile von Hand umgestellt hat), dann ohne Bestellnr.
 * Gibt null zurueck, wenn keine V-Nummer vorkommt.
 */
function leseEinleitung(text) {
  const s = String(text || '');
  const ersteZeile = s.split(/\r?\n/).find(z => z.trim()) || '';
  const m = ersteZeile.match(ZEILE_RE);
  if (m) {
    return { vorgangsnummer: m[2].toUpperCase(), kundenBestellnr: m[1] ? m[1].trim() : null, exakt: true };
  }
  const n = s.match(NUMMER_RE);
  return n ? { vorgangsnummer: n[0], kundenBestellnr: null, exakt: false } : null;
}

module.exports = {
  formatVorgangsnummer,
  naechsteVorgangsnummer,
  normalisiereBestellnr,
  einleitungZeile,
  setzeEinleitung,
  leseEinleitung,
};
