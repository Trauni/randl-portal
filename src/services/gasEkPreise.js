/**
 * Einkaufspreise Gas: Pflege im Artikelstamm (Reiter „Einkauf“), mit Gültigkeitsdatum und Protokoll.
 * Kein Überschreiben alter Stände: jede Änderung steht in gas_ek_preis_log.
 */

const GRUPPEN = {
  propan: { label: 'Propan (alle Brenngas-Größen)', preisbasis: 'kg' },
  motogas: { label: 'Motogas / Bluetec', preisbasis: 'fuellung' },
};

/** Preis mit dem größten gueltig_ab <= tag je Gruppe; Zeilen als { ek_gruppe, gueltig_ab:'YYYY-MM-DD', preis_netto } */
function preisAm(zeilen, gruppe, tag) {
  let best = null;
  for (const z of zeilen) {
    if (z.ek_gruppe !== gruppe || z.gueltig_ab > tag) continue;
    if (!best || z.gueltig_ab > best.gueltig_ab) best = z;
  }
  return best;
}

function pruefe(eingabe) {
  const fehler = [];
  const g = GRUPPEN[eingabe.ek_gruppe];
  if (!g) fehler.push('Unbekannte Preisgruppe');
  const preis = Number(eingabe.preis_netto);
  if (!Number.isFinite(preis) || preis <= 0 || preis > 500) fehler.push('Preis muss zwischen 0 und 500 € liegen');
  if (!/^\d{4}-\d\d-\d\d$/.test(eingabe.gueltig_ab || '') || Number.isNaN(Date.parse(eingabe.gueltig_ab))) fehler.push('„Gültig ab“ fehlt oder ist kein Datum');
  if ((eingabe.notiz || '').length > 200) fehler.push('Notiz ist länger als 200 Zeichen');
  return { fehler, preis, preisbasis: g && g.preisbasis };
}

async function liste(db) {
  const [rows] = await db.query(
    `SELECT id, lieferant, ek_gruppe, preisbasis, DATE_FORMAT(gueltig_ab,'%Y-%m-%d') AS gueltig_ab,
            preis_netto, notiz, erfasst_von, erfasst_am
     FROM gas_ek_preis ORDER BY ek_gruppe, gueltig_ab DESC`,
  );
  const heute = new Date().toISOString().slice(0, 10);
  const aktuell = {};
  for (const g of Object.keys(GRUPPEN)) {
    const a = preisAm(rows, g, heute);
    if (a) aktuell[g] = a.id;
  }
  return { gruppen: GRUPPEN, preise: rows.map((r) => ({ ...r, preis_netto: Number(r.preis_netto), aktuell: aktuell[r.ek_gruppe] === r.id })) };
}

async function speichere(db, eingabe, benutzer, lieferant = 'Tyczka') {
  const { fehler, preis, preisbasis } = pruefe(eingabe);
  if (fehler.length) return { fehler };
  const notiz = (eingabe.notiz || '').trim() || null;
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const [alt] = await conn.query(
      'SELECT preis_netto FROM gas_ek_preis WHERE lieferant=? AND ek_gruppe=? AND gueltig_ab=? FOR UPDATE',
      [lieferant, eingabe.ek_gruppe, eingabe.gueltig_ab],
    );
    await conn.query(
      `INSERT INTO gas_ek_preis (lieferant, ek_gruppe, preisbasis, gueltig_ab, preis_netto, notiz, erfasst_von)
       VALUES (?,?,?,?,?,?,?)
       ON DUPLICATE KEY UPDATE preis_netto=VALUES(preis_netto), notiz=VALUES(notiz), erfasst_von=VALUES(erfasst_von), erfasst_am=NOW()`,
      [lieferant, eingabe.ek_gruppe, preisbasis, eingabe.gueltig_ab, preis, notiz, benutzer],
    );
    await conn.query(
      `INSERT INTO gas_ek_preis_log (aktion, lieferant, ek_gruppe, preisbasis, gueltig_ab, preis_alt, preis_neu, notiz, benutzer)
       VALUES (?,?,?,?,?,?,?,?,?)`,
      [alt.length ? 'ersetzt' : 'neu', lieferant, eingabe.ek_gruppe, preisbasis, eingabe.gueltig_ab, alt.length ? alt[0].preis_netto : null, preis, notiz, benutzer],
    );
    await conn.commit();
    return { ok: true, ersetzt: alt.length > 0 };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

async function protokoll(db, limit = 200) {
  const [rows] = await db.query(
    `SELECT id, aktion, lieferant, ek_gruppe, preisbasis, DATE_FORMAT(gueltig_ab,'%Y-%m-%d') AS gueltig_ab,
            preis_alt, preis_neu, notiz, benutzer, zeitpunkt
     FROM gas_ek_preis_log ORDER BY id DESC LIMIT ?`, [limit],
  );
  return rows;
}

module.exports = { GRUPPEN, preisAm, pruefe, liste, speichere, protokoll };
