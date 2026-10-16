/**
 * Metallkunden — Merker im Portal plus Notiz "METALL" im Lexware-Kontakt (#366).
 *
 * Massgeblich ist der Merker in metall_kunde. Die Notiz ist ein Zusatz, damit man
 * Metallkunden auch in Lexware erkennt: sie wird nur ergaenzt, nie ueberschrieben,
 * und beim Entfernen des Merkers bleibt "METALL" stehen (Entscheidung 16.10.2026).
 *
 * Achtung: Solange #355 offen ist, schreibt der Gas-Shop bei jedem Kunden-Sync die
 * Notiz neu (gas-db note + info_sped) und entfernt "METALL" wieder. Der Gas-Shop
 * haengt es nach #355 im selben Format an: eigene Zeile "METALL".
 */

const MERKMAL = 'METALL';
const NOTIZ_MAX = 1000; // Lexware contact.note

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

module.exports = { MERKMAL, NOTIZ_MAX, hatMerkmal, ergaenzeNotiz };
