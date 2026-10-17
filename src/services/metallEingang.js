/**
 * Eingang Metallarbeiten (#371, Entscheidung 8): Kundenanfragen, Nachbestellungen,
 * Online-Annahmen und Freischaltungs-Anfragen aus dem Kundenbereich im Gas-Shop.
 *
 * Ablauf: Der Gas-Shop meldet jedes Ereignis ueber den internen Listener
 * (routes/internal/metall.js, POST /eingang) und verschickt danach selbst die Mail ans
 * Sammelpostfach (das Portal hat keinen Mailversand). Das Ergebnis meldet er mit
 * POST /eingang/:id/mail zurueck. Das Badge in der Sidebar zaehlt status = 'neu'.
 *
 * Anfrage/Nachbestellung/Annahme gehoeren immer zu einem Vorgang des Kunden (Anfrage =
 * Vorgang, Entscheidung #361); der Vorgang selbst wird vorher angelegt (#376). Eine
 * Freischaltung hat keinen Vorgang, der Kunde ist dann meist noch kein Metallkunde.
 *
 * Erledigt/abgelehnt setzt nur den Eingang. Eine verworfene Anfrage bricht das Buero im
 * Vorgangsdetail ab (metallDetail.brecheAb), damit der Grund dort steht.
 */

const ARTEN = ['anfrage', 'nachbestellung', 'annahme', 'freischaltung'];
const NUMMER_RE = /^V-\d{2}-\d{4,}$/;
const NACHRICHT_MAX = 2000;
const LISTE_MAX = 200;
const ERLEDIGT_TAGE = 30;

function fehler(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

/** Text bereinigen: leer → null, zu lang → Fehler (Name/E-Mail einzeilig) */
function text(wert, max, feld, { einzeilig = true } = {}) {
  if (wert == null) return null;
  let s = String(wert);
  s = einzeilig ? s.replace(/\s+/g, ' ').trim() : s.replace(/\r\n?/g, '\n').trim();
  if (!s) return null;
  if (s.length > max) throw fehler(400, `${feld} ist zu lang (max. ${max} Zeichen)`);
  return s;
}

/**
 * Meldung aus dem Gas-Shop pruefen und vereinheitlichen.
 * body: { art, vorgangsnummer?, annahme_id?, lexware_id?, kdnr?, kunden_konto_id?, name?, email?, nachricht? }
 */
function pruefeMeldung(body) {
  const b = body || {};
  const art = String(b.art || '');
  if (!ARTEN.includes(art)) throw fehler(400, 'Unbekannte Art');

  const m = {
    art,
    vorgangsnummer: null,
    annahmeId: null,
    lexwareId: text(b.lexware_id, 36, 'Lexware-ID'),
    kdnr: text(b.kdnr, 50, 'Kundennummer'),
    kontoId: text(b.kunden_konto_id, 64, 'Konto'),
    name: text(b.name, 255, 'Name'),
    email: text(b.email, 255, 'E-Mail'),
    nachricht: text(b.nachricht, NACHRICHT_MAX, 'Nachricht', { einzeilig: false }),
  };

  if (art !== 'freischaltung') {
    const nr = String(b.vorgangsnummer || '').trim();
    if (!NUMMER_RE.test(nr)) throw fehler(400, 'Vorgangsnummer fehlt');
    if (!m.lexwareId) throw fehler(400, 'Lexware-ID fehlt');
    m.vorgangsnummer = nr;
  }
  if (art === 'annahme') {
    const id = Number(b.annahme_id);
    if (!Number.isInteger(id) || id <= 0) throw fehler(400, 'Annahme fehlt');
    m.annahmeId = id;
  }
  if (!m.kdnr && !m.lexwareId) throw fehler(400, 'Kunde fehlt');
  return m;
}

/** Ereignis eintragen. Gibt { id } zurueck. 404, wenn der Vorgang nicht zum Kunden gehoert. */
async function melde(pool, body) {
  const m = pruefeMeldung(body);
  let vorgangId = null;
  if (m.vorgangsnummer) {
    const [[v]] = await pool.execute(
      `SELECT v.id, k.name FROM metall_vorgang v JOIN metall_kunde k ON k.id = v.kunde_id
       WHERE v.vorgangsnummer = ? AND k.lexware_kontakt_id = ?`,
      [m.vorgangsnummer, m.lexwareId]
    );
    if (!v) throw fehler(404, 'Vorgang nicht gefunden');
    vorgangId = v.id;
    if (!m.name) m.name = v.name;
  }
  if (m.annahmeId) {
    const [[a]] = await pool.execute('SELECT vorgang_id FROM metall_annahme WHERE id = ?', [m.annahmeId]);
    if (!a || a.vorgang_id !== vorgangId) throw fehler(404, 'Annahme nicht gefunden');
  }
  const [res] = await pool.execute(
    `INSERT INTO metall_eingang
       (art, vorgang_id, annahme_id, lexware_kontakt_id, kdnr, kunden_konto_id, kunde_name, kunde_email, nachricht)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [m.art, vorgangId, m.annahmeId, m.lexwareId, m.kdnr, m.kontoId, m.name, m.email, m.nachricht]
  );
  return { id: res.insertId };
}

/** Ergebnis des Mailversands aus dem Gas-Shop vermerken: { ok: true } oder { fehler: '…' } */
async function vermerkeMail(pool, id, ergebnis) {
  const n = Number(id);
  if (!Number.isInteger(n) || n <= 0) throw fehler(404, 'Eintrag nicht gefunden');
  const ok = ergebnis?.ok === true;
  const f = ok ? null : (String(ergebnis?.fehler || 'unbekannter Fehler').slice(0, 500));
  const [res] = await pool.execute(
    `UPDATE metall_eingang SET mail_gesendet_am = ${ok ? 'NOW()' : 'NULL'}, mail_fehler = ? WHERE id = ?`,
    [f, n]
  );
  if (!res.affectedRows) throw fehler(404, 'Eintrag nicht gefunden');
  return { ok: true };
}

const SPALTEN = `e.id, e.art, e.status, e.nachricht, e.kdnr, e.lexware_kontakt_id, e.kunde_email,
  COALESCE(k.name, e.kunde_name) AS kunde_name, e.mail_gesendet_am, e.mail_fehler,
  e.erstellt_am, e.erledigt_am, emp.full_name AS erledigt_von_name,
  v.id AS vorgang_id, v.vorgangsnummer, v.bezeichnung, v.kunden_bestellnr, v.abgebrochen_am,
  a.angebot_belegnummer, a.angebot_betrag_brutto, a.angenommen_am`;
const JOINS = `FROM metall_eingang e
  LEFT JOIN metall_vorgang v ON v.id = e.vorgang_id
  LEFT JOIN metall_kunde k ON k.id = v.kunde_id
  LEFT JOIN metall_annahme a ON a.id = e.annahme_id
  LEFT JOIN employees emp ON emp.id = e.erledigt_von`;

/** Neue Eintraege (aelteste zuerst) und die der letzten 30 Tage, die schon bearbeitet sind */
async function ladeListe(pool) {
  const [neu] = await pool.query(`SELECT ${SPALTEN} ${JOINS} WHERE e.status = 'neu' ORDER BY e.erstellt_am, e.id LIMIT ${LISTE_MAX}`);
  const [bearbeitet] = await pool.query(
    `SELECT ${SPALTEN} ${JOINS} WHERE e.status <> 'neu' AND e.erledigt_am > NOW() - INTERVAL ${ERLEDIGT_TAGE} DAY
     ORDER BY e.erledigt_am DESC, e.id DESC LIMIT ${LISTE_MAX}`
  );
  return { neu, bearbeitet };
}

async function zaehleNeue(pool) {
  const [[{ n }]] = await pool.query("SELECT COUNT(*) AS n FROM metall_eingang WHERE status = 'neu'");
  return Number(n);
}

/**
 * Status setzen: 'erledigt' | 'abgelehnt' (nur aus 'neu') oder 'neu' (zurueckholen).
 * Parallele Klicks scheitern sauber mit 409.
 */
async function setzeStatus(pool, id, status, { employeeId = null } = {}) {
  if (!['erledigt', 'abgelehnt', 'neu'].includes(status)) throw fehler(400, 'Unbekannter Status');
  const n = Number(id);
  if (!Number.isInteger(n) || n <= 0) throw fehler(404, 'Eintrag nicht gefunden');
  const [res] = status === 'neu'
    ? await pool.execute("UPDATE metall_eingang SET status = 'neu', erledigt_von = NULL, erledigt_am = NULL WHERE id = ? AND status <> 'neu'", [n])
    : await pool.execute("UPDATE metall_eingang SET status = ?, erledigt_von = ?, erledigt_am = NOW() WHERE id = ? AND status = 'neu'", [status, employeeId, n]);
  if (!res.affectedRows) {
    const [[e]] = await pool.execute('SELECT status FROM metall_eingang WHERE id = ?', [n]);
    if (!e) throw fehler(404, 'Eintrag nicht gefunden');
    throw fehler(409, 'Der Eintrag wurde inzwischen bearbeitet');
  }
  return { ok: true };
}

module.exports = { ARTEN, pruefeMeldung, melde, vermerkeMail, ladeListe, zaehleNeue, setzeStatus };
