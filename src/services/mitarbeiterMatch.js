/**
 * Mitarbeiter eindeutig zuordnen (#500, Epic #498).
 *
 * Reihenfolge: feste IDs (authentik_uid, rentman_id), danach E-Mail
 * (ohne Groß-/Kleinschreibung) als Fallback beim Erst-Zuordnen.
 * Mehrdeutige Treffer oder widersprüchliche IDs sind ein Konflikt:
 * dann wird nichts angelegt und nichts überschrieben.
 */

const normMail = (m) => (m ? String(m).trim().toLowerCase() : '');

/**
 * @param {{ execute: Function }} db  mysql2-Pool
 * @param {{ authentikUid?: string, rentmanId?: number, email?: string }} k
 * @returns {Promise<{ row: object|null, via?: string, konflikt?: string }>}
 */
async function findeMitarbeiter(db, { authentikUid, rentmanId, email }) {
  if (authentikUid) {
    const [r] = await db.execute('SELECT * FROM employees WHERE authentik_uid = ?', [authentikUid]);
    if (r[0]) return { row: r[0], via: 'authentik_uid' };
  }
  if (rentmanId) {
    const [r] = await db.execute('SELECT * FROM employees WHERE rentman_id = ?', [rentmanId]);
    if (r[0]) return { row: r[0], via: 'rentman_id' };
  }
  const mail = normMail(email);
  if (!mail) return { row: null };

  const [r] = await db.execute('SELECT * FROM employees WHERE LOWER(TRIM(email)) = ?', [mail]);
  if (r.length === 0) return { row: null };
  if (r.length > 1) return { row: null, konflikt: `E-Mail ${mail} gehört mehreren Portal-Usern (IDs ${r.map(x => x.id).join(', ')})` };

  const row = r[0];
  if (authentikUid && row.authentik_uid && row.authentik_uid !== authentikUid) {
    return { row: null, konflikt: `E-Mail ${mail} gehört User ${row.id} mit anderer Authentik-ID` };
  }
  if (rentmanId && row.rentman_id && Number(row.rentman_id) !== Number(rentmanId)) {
    return { row: null, konflikt: `E-Mail ${mail} gehört User ${row.id} mit anderer Rentman-ID` };
  }
  return { row, via: 'email' };
}

/** Anzeigename aus OIDC-Claims; leer, wenn Authentik keinen echten Namen liefert. */
function namenAusClaims(claims) {
  const name = (claims.name || '').trim();
  const teil = `${claims.given_name || ''} ${claims.family_name || ''}`.trim();
  const kandidat = name || teil;
  if (!kandidat) return '';
  const benutzername = claims.preferred_username || '';
  return kandidat === benutzername || kandidat === claims.email ? '' : kandidat;
}

module.exports = { findeMitarbeiter, namenAusClaims, normMail };
