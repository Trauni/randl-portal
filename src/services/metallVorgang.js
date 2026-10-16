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

// ── Vorgang anlegen (#384) ───────────────────────────────────────────────────

const BEZEICHNUNG_MAX = 255; // metall_vorgang.bezeichnung
const HERKUNFT = ['buero', 'anfrage', 'nachbestellung', 'annahme'];
const DEADLOCK_VERSUCHE = 3;

function eingabeFehler(message, status = 400) {
  const err = new Error(message);
  err.status = status;
  return err;
}

/**
 * Eingaben pruefen und bereinigen (ohne Datenbank).
 * Grundlage: hoechstens eins von angebotBelegId (Angebot als Vorlage) und
 * vorlageVorgangId (Nachbestellung eines frueheren Vorgangs).
 */
function pruefeNeuenVorgang({ kundeId, bezeichnung, kundenBestellnr, angebotBelegId, vorlageVorgangId, herkunft = 'buero' }) {
  const id = n => (n === undefined || n === null || n === '' ? null : Number(n));
  const k = id(kundeId);
  if (!Number.isInteger(k) || k <= 0) throw eingabeFehler('Bitte einen Metallkunden wählen');
  const b = String(bezeichnung || '').replace(/\s+/g, ' ').trim();
  if (!b) throw eingabeFehler('Bezeichnung fehlt');
  if (b.length > BEZEICHNUNG_MAX) throw eingabeFehler(`Bezeichnung ist zu lang (max. ${BEZEICHNUNG_MAX} Zeichen)`);
  const an = id(angebotBelegId);
  const vo = id(vorlageVorgangId);
  if (an && vo) throw eingabeFehler('Entweder Angebot oder Vorlage-Vorgang, nicht beides');
  if (!HERKUNFT.includes(herkunft)) throw eingabeFehler(`Unbekannte Herkunft: ${herkunft}`);
  let bestellnr;
  try { bestellnr = normalisiereBestellnr(kundenBestellnr); } catch (e) { throw eingabeFehler(e.message); }
  return { kundeId: k, bezeichnung: b, kundenBestellnr: bestellnr, angebotBelegId: an, vorlageVorgangId: vo, herkunft };
}

/**
 * Vorgang anlegen: Nummer und INSERT in einer Transaktion auf einer Verbindung.
 * Prueft, dass Kunde aktiv ist und Angebot bzw. Vorlage zum selben Kunden gehoeren.
 * Ein gewaehltes Angebot, das noch in "Belege zuordnen" steht, gilt danach als manuell
 * zugeordnet. Ergebnis: die neue Zeile aus metall_vorgang.
 */
async function legeVorgangAn(pool, eingabe, opts = {}) {
  const e = pruefeNeuenVorgang(eingabe);
  // Deadlock (1213) ist bei gleichzeitigem ersten Zaehler-INSERT moeglich → neu versuchen
  for (let versuch = 1; ; versuch++) {
    try {
      return await legeAnInTransaktion(pool, e, opts);
    } catch (err) {
      if (err.errno === 1213 && versuch < DEADLOCK_VERSUCHE) continue;
      throw err;
    }
  }
}

async function legeAnInTransaktion(pool, e, { employeeId = null, jetzt = new Date() }) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [[kunde]] = await conn.execute('SELECT id, lexware_kontakt_id, aktiv FROM metall_kunde WHERE id = ?', [e.kundeId]);
    if (!kunde || !kunde.aktiv) throw eingabeFehler('Metallkunde nicht gefunden oder nicht aktiv');

    if (e.angebotBelegId) {
      const [[an]] = await conn.execute('SELECT id, belegart, lexware_kontakt_id FROM metall_beleg WHERE id = ?', [e.angebotBelegId]);
      if (!an || an.belegart !== 'quotation') throw eingabeFehler('Angebot nicht gefunden');
      if (an.lexware_kontakt_id !== kunde.lexware_kontakt_id) throw eingabeFehler('Das Angebot gehört zu einem anderen Kunden');
    }
    if (e.vorlageVorgangId) {
      const [[vo]] = await conn.execute('SELECT id, kunde_id FROM metall_vorgang WHERE id = ?', [e.vorlageVorgangId]);
      if (!vo) throw eingabeFehler('Vorlage-Vorgang nicht gefunden');
      if (vo.kunde_id !== kunde.id) throw eingabeFehler('Der Vorlage-Vorgang gehört zu einem anderen Kunden');
    }

    const nummer = await naechsteVorgangsnummer(conn, jetzt);
    const [res] = await conn.execute(
      `INSERT INTO metall_vorgang (vorgangsnummer, kunde_id, kunden_bestellnr, bezeichnung, herkunft,
         angebot_beleg_id, vorlage_vorgang_id, erstellt_von)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [nummer, kunde.id, e.kundenBestellnr, e.bezeichnung, e.herkunft, e.angebotBelegId, e.vorlageVorgangId, employeeId]
    );
    if (e.angebotBelegId) {
      await conn.execute(
        `UPDATE metall_beleg SET zuordnung = 'manuell', vorschlag_vorgang_id = NULL, zugeordnet_von = ?, zugeordnet_am = NOW()
         WHERE id = ? AND zuordnung = 'offen'`,
        [employeeId, e.angebotBelegId]
      );
    }
    await conn.commit();
    const [[zeile]] = await conn.execute('SELECT * FROM metall_vorgang WHERE id = ?', [res.insertId]);
    return zeile;
  } catch (err) {
    await conn.rollback().catch(() => {});
    throw err;
  } finally {
    conn.release();
  }
}

module.exports = {
  pruefeNeuenVorgang,
  legeVorgangAn,
  formatVorgangsnummer,
  naechsteVorgangsnummer,
  normalisiereBestellnr,
  einleitungZeile,
  setzeEinleitung,
  leseEinleitung,
};

/*
 * CLI (im Portal-Ordner, liest die .env):
 *   node src/services/metallVorgang.js probe <lexware_kontakt_id>
 *   legt zwei Test-Vorgaenge gleichzeitig an (Nummernvergabe gegen die echte DB) und
 *   gibt die Nummern aus. Aufraeumen danach per SQL (siehe Ausgabe).
 */
if (require.main === module) {
  require('dotenv').config();
  const [, , befehl, kontakt] = process.argv;
  (async () => {
    const pool = require('../db').getPool();
    try {
      if (befehl !== 'probe' || !kontakt) throw new Error('Aufruf: probe <lexware_kontakt_id>');
      const [[k]] = await pool.execute('SELECT id FROM metall_kunde WHERE lexware_kontakt_id = ?', [kontakt]);
      if (!k) throw new Error('Kein Metallkunde mit dieser Lexware-Kontakt-ID');
      const neu = await Promise.all(['A', 'B'].map(x => legeVorgangAn(pool, { kundeId: k.id, bezeichnung: `TEST 384 ${x}` })));
      console.table(neu.map(v => ({ id: v.id, vorgangsnummer: v.vorgangsnummer, bezeichnung: v.bezeichnung })));
      const doppelt = new Set(neu.map(v => v.vorgangsnummer)).size !== neu.length;
      console.log(doppelt ? 'FEHLER: doppelte Nummer' : 'ok: zwei verschiedene Nummern');
      process.exit(doppelt ? 1 : 0);
    } catch (err) {
      console.error(err.message);
      process.exit(1);
    }
  })();
}
