/**
 * #604: Das Preis-Tool schreibt den neuen Netto-Preis nach erfolgreicher Übernahme auch in den Artikelstamm
 * (gas_artikel.preis_netto_cent) und trägt die Änderung im Änderungsverlauf ein. Die Gas-Auswertung liest den Preis dort.
 */
const { stammNr } = require('./gasStamm');

const parseJson = (v) => { try { return (typeof v === 'string' ? JSON.parse(v) : v) || {}; } catch { return {}; } };

/**
 * artikelNummer: Lexware-Nummer (RG-7801200) oder Stammnummer. neuNetto in Euro.
 * Liefert { status: 'geschrieben' | 'gleich' | 'kein_stammartikel' | 'ungueltig', alt?, neu? } (Cent).
 */
async function uebernehmePreis(db, { artikelNummer, neuNetto, user = {} }) {
  const nr = stammNr(artikelNummer);
  const neu = Math.round(Number(neuNetto) * 100);
  if (!nr || !Number.isFinite(neu) || neu <= 0) return { status: 'ungueltig' };

  const [rows] = await db.query('SELECT preis_netto_cent, feld_stand FROM gas_artikel WHERE artikel_nr = ?', [nr]);
  if (!rows[0]) return { status: 'kein_stammartikel' };
  const alt = rows[0].preis_netto_cent == null ? null : Number(rows[0].preis_netto_cent);
  if (alt === neu) return { status: 'gleich', alt, neu };

  const stand = { ...parseJson(rows[0].feld_stand), preis_netto_cent: { quelle: 'preis-tool', am: new Date().toISOString() } };
  await db.query('UPDATE gas_artikel SET preis_netto_cent = ?, feld_stand = ? WHERE artikel_nr = ?', [neu, JSON.stringify(stand), nr]);
  await db.query(
    'INSERT INTO gas_artikel_aenderungen (artikel_nr, feld, alt, neu, von_id, von_name) VALUES (?, ?, ?, ?, ?, ?)',
    [nr, 'preis_netto_cent', alt == null ? null : String(alt), String(neu), user.id || null, user.name || null]);
  return { status: 'geschrieben', alt, neu };
}

module.exports = { uebernehmePreis };
