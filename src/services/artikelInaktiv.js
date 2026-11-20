/**
 * #617: Artikel gesammelt auf inaktiv setzen (nach dem Abgleich mit der überarbeiteten Artikeldatei: alles, was nicht
 * in der Datei steht). Löscht nichts. Je Artikel ein Eintrag im Änderungsverlauf und in feld_stand.
 * Inaktive Artikel verschwinden aus der Artikelauswahl der Fahrer-App (laufende Touren behalten ihre Positionen).
 */
async function setzeInaktiv(db, nummern, user = {}) {
  const liste = [...new Set((nummern || []).map(String))];
  if (!liste.length) return { geaendert: 0, schonInaktiv: 0 };
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const [rows] = await conn.query('SELECT artikel_nr, aktiv, feld_stand FROM gas_artikel WHERE artikel_nr IN (?) FOR UPDATE', [liste]);
    const jetzt = new Date().toISOString();
    let geaendert = 0;
    for (const r of rows) {
      if (!Number(r.aktiv)) continue;
      let stand = {};
      try { stand = typeof r.feld_stand === 'string' ? JSON.parse(r.feld_stand) : (r.feld_stand || {}); } catch { stand = {}; }
      stand.aktiv = { quelle: 'portal', am: jetzt };
      await conn.query('UPDATE gas_artikel SET aktiv = 0, feld_stand = ? WHERE artikel_nr = ?', [JSON.stringify(stand), r.artikel_nr]);
      await conn.query('INSERT INTO gas_artikel_aenderungen (artikel_nr, feld, alt, neu, von_id, von_name) VALUES (?, ?, ?, ?, ?, ?)',
        [r.artikel_nr, 'aktiv', '1', '0', user.id || null, user.fullName || user.username || 'Abgleich Artikeldatei (#617)']);
      geaendert++;
    }
    await conn.commit();
    return { geaendert, schonInaktiv: rows.length - geaendert, unbekannt: liste.length - rows.length };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

module.exports = { setzeInaktiv };
