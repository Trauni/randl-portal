/**
 * Metallkunden — Merker im Portal plus Notiz "METALL" im Lexware-Kontakt (#366).
 *
 * Massgeblich ist der Merker in metall_kunde. Die Notiz ist ein Zusatz, damit man
 * Metallkunden auch in Lexware erkennt: sie wird nur ergaenzt, nie ueberschrieben,
 * und beim Entfernen des Merkers bleibt "METALL" stehen (Entscheidung 16.10.2026).
 *
 * Schlaegt das Schreiben der Notiz fehl, bleibt der Merker trotzdem gesetzt:
 * notiz_status = 'fehler' mit Grund, erneut versuchen ueber schreibeNotiz().
 *
 * Achtung: Solange #355 offen ist, schreibt der Gas-Shop bei jedem Kunden-Sync die
 * Notiz neu (gas-db note + info_sped) und entfernt "METALL" wieder. Der Gas-Shop
 * haengt es nach #355 im selben Format an: eigene Zeile "METALL".
 */

const MERKMAL = 'METALL';
const NOTIZ_MAX = 1000; // Lexware contact.note
const FEHLER_MAX = 500; // metall_kunde.notiz_fehler

// Ganzes Wort in Grossbuchstaben; "METALLBAU" zaehlt nicht
const MERKMAL_RE = new RegExp(`\\b${MERKMAL}\\b`);

/** Hat die Notiz das Merkmal schon? */
function hatMerkmal(note) {
  return MERKMAL_RE.test(note || '');
}

/**
 * "METALL" als eigene Zeile anhaengen, wenn es noch fehlt. Vorhandener Text bleibt
 * unveraendert, nur Leerraum am Ende wird vor dem Anhaengen entfernt.
 * Wuerde die Notiz zu lang, gibt es einen Fehler statt etwas abzuschneiden.
 */
function ergaenzeNotiz(note) {
  const alt = note || '';
  if (hatMerkmal(alt)) return alt;
  const basis = alt.replace(/\s+$/, '');
  const neu = basis ? `${basis}\n${MERKMAL}` : MERKMAL;
  if (neu.length > NOTIZ_MAX) {
    throw new Error(`Lexware-Notiz wuerde zu lang (${neu.length} von max. ${NOTIZ_MAX} Zeichen)`);
  }
  return neu;
}

/** Anzeigename eines Lexware-Kontakts: Firma, sonst Vor- und Nachname */
function kontaktName(contact) {
  const firma = contact?.company?.name;
  if (firma) return firma;
  const p = contact?.person || {};
  return [p.firstName, p.lastName].filter(Boolean).join(' ').trim() || '(ohne Namen)';
}

/** Lexware-Kundennummer als Text, oder null */
function kontaktKdnr(contact) {
  const nr = contact?.roles?.customer?.number;
  return nr == null ? null : String(nr);
}

/**
 * Notiz fuer einen Metallkunden schreiben und das Ergebnis festhalten.
 * aktuell: schon gelesener Lexware-Kontakt (optional).
 * Wirft nicht bei Lexware-Fehlern — die landen in notiz_status/notiz_fehler.
 */
async function schreibeNotiz({ pool, lexware }, kunde, aktuell) {
  try {
    await lexware.updateContactNote(kunde.lexware_kontakt_id, ergaenzeNotiz, { aktuell });
    await pool.execute(
      `UPDATE metall_kunde SET notiz_status = 'ok', notiz_fehler = NULL, notiz_geschrieben_am = NOW() WHERE id = ?`,
      [kunde.id]
    );
    return { notiz_status: 'ok', notiz_fehler: null };
  } catch (err) {
    const grund = String(err.message || err).slice(0, FEHLER_MAX);
    await pool.execute(
      `UPDATE metall_kunde SET notiz_status = 'fehler', notiz_fehler = ? WHERE id = ?`,
      [grund, kunde.id]
    );
    return { notiz_status: 'fehler', notiz_fehler: grund };
  }
}

/**
 * Merker setzen: Kontakt in Lexware lesen (muss Kunde sein), metall_kunde anlegen
 * bzw. wieder aktivieren, dann die Notiz ergaenzen. Gibt die Zeile zurueck.
 * Lexware-Fehler beim Lesen werden weitergereicht (dann wird nichts gespeichert).
 */
async function setzeMerker({ pool, lexware }, { lexwareKontaktId, employeeId }) {
  const contact = await lexware.getContact(lexwareKontaktId);
  if (!contact?.roles?.customer) {
    const err = new Error('Der Lexware-Kontakt ist kein Kunde');
    err.status = 400;
    throw err;
  }
  await pool.execute(
    `INSERT INTO metall_kunde (lexware_kontakt_id, kdnr, name, aktiv, gesetzt_von)
     VALUES (?, ?, ?, 1, ?)
     ON DUPLICATE KEY UPDATE kdnr = VALUES(kdnr), name = VALUES(name), aktiv = 1, gesetzt_von = VALUES(gesetzt_von)`,
    [lexwareKontaktId, kontaktKdnr(contact), kontaktName(contact), employeeId ?? null]
  );
  const [[kunde]] = await pool.execute('SELECT * FROM metall_kunde WHERE lexware_kontakt_id = ?', [lexwareKontaktId]);
  const notiz = await schreibeNotiz({ pool, lexware }, kunde, contact);
  return { ...kunde, ...notiz };
}

/** Merker entfernen: nur aktiv = 0, die Notiz in Lexware bleibt unveraendert. */
async function entferneMerker({ pool }, kundeId) {
  const [res] = await pool.execute('UPDATE metall_kunde SET aktiv = 0 WHERE id = ?', [kundeId]);
  return res.affectedRows > 0;
}

module.exports = {
  MERKMAL, NOTIZ_MAX,
  hatMerkmal, ergaenzeNotiz, kontaktName, kontaktKdnr,
  schreibeNotiz, setzeMerker, entferneMerker,
};
