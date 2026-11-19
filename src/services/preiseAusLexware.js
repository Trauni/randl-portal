/**
 * Preise aus Lexware in den Artikelstamm übernehmen (einmaliger Abgleich oder bei Bedarf wiederholbar).
 * Lexware ist hier nur Quelle (gelesen aus dem Artikel-Cache), geschrieben wird nur in die Portal-DB:
 *  - gas_artikel.preis_netto_cent (mit feld_stand, Quelle "lexware")
 *  - gas_artikel_aenderungen (Änderungsverlauf des Artikels)
 *  - price_change_log (Ziel lexware, Status ok): Der Preis am Belegtag der Gas-Auswertung bleibt vor dem heutigen Tag der alte,
 *    ab heute gilt der neue. Ohne diesen Eintrag würden rückwirkend alle Belege neu bewertet.
 * Nichts geht nach Lexware, SER oder in den Shop. Für SER danach "Push SER".
 */
const { stammNr } = require('../utils/artikelListe');

const cent = (euro) => Math.round(Number(euro) * 100);

/**
 * stamm: Zeilen aus gas_artikel { artikel_nr, bezeichnung, preis_netto_cent }
 * lexware: Artikel aus loadGasArticles { id, articleNumber, name, netPrice }
 * Liefert die Zeilen, bei denen Stamm und Lexware (netto) auseinanderliegen, und Zähler.
 */
function planePreiseAusLexware(stamm, lexware) {
  const lex = new Map();
  for (const l of lexware) {
    const nr = stammNr(l.articleNumber);
    const rg = !String(l.articleNumber).toUpperCase().startsWith('NRG-');
    if (!lex.has(nr) || rg) lex.set(nr, l); // RG- hat Vorrang, falls es beide Schreibweisen gibt
  }
  const zeilen = []; const ohnePreis = []; let gleich = 0;
  for (const a of stamm) {
    const l = lex.get(String(a.artikel_nr));
    if (!l) continue;
    if (l.netPrice == null || !(Number(l.netPrice) > 0)) { ohnePreis.push(String(a.artikel_nr)); continue; }
    const neu = cent(l.netPrice);
    const alt = a.preis_netto_cent == null ? null : Number(a.preis_netto_cent);
    if (alt === neu) { gleich += 1; continue; }
    zeilen.push({ artikel_nr: String(a.artikel_nr), bezeichnung: a.bezeichnung, lexware_id: l.id, lexware_nummer: l.articleNumber, lexware_name: l.name, alt_cent: alt, neu_cent: neu, diff_cent: alt == null ? null : neu - alt });
  }
  zeilen.sort((x, y) => x.artikel_nr.localeCompare(y.artikel_nr));
  const stammNrn = new Set(stamm.map((a) => String(a.artikel_nr)));
  return {
    zeilen, ohnePreis, gleich,
    nurInLexware: [...lex.keys()].filter((n) => !stammNrn.has(n)).length,
    summeDiffCent: zeilen.reduce((s, z) => s + (z.diff_cent ?? 0), 0),
  };
}

/** Übernahme nur, wenn die Vorschau noch stimmt (Anzahl und Summe der Änderungen), sonst 409 wie beim Preis-Tool. */
function pruefeErwartung(plan, erwartet) {
  return !!erwartet && erwartet.anzahl === plan.zeilen.length && erwartet.summeDiffCent === plan.summeDiffCent;
}

async function ladeStamm(db) {
  const [rows] = await db.query('SELECT artikel_nr, bezeichnung, preis_netto_cent, feld_stand FROM gas_artikel');
  return rows;
}

const parseJson = (v) => { try { return (typeof v === 'string' ? JSON.parse(v) : v) || {}; } catch { return {}; } };

async function uebernehmePreiseAusLexware(db, lexware, user = {}, erwartet) {
  const stamm = await ladeStamm(db);
  const plan = planePreiseAusLexware(stamm, lexware);
  if (!pruefeErwartung(plan, erwartet)) {
    const err = new Error('Die Daten haben sich seit der Vorschau geändert, bitte die Vorschau neu laden');
    err.status = 409;
    err.plan = plan;
    throw err;
  }
  const feldStand = new Map(stamm.map((a) => [String(a.artikel_nr), parseJson(a.feld_stand)]));
  const jobId = `abgleich-${new Date().toISOString().replace(/\D/g, '').slice(0, 14)}`;
  const jetzt = new Date().toISOString();
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    for (const z of plan.zeilen) {
      const stand = { ...feldStand.get(z.artikel_nr), preis_netto_cent: { quelle: 'lexware', am: jetzt } };
      await conn.query('UPDATE gas_artikel SET preis_netto_cent = ?, feld_stand = ? WHERE artikel_nr = ?', [z.neu_cent, JSON.stringify(stand), z.artikel_nr]);
      await conn.query('INSERT INTO gas_artikel_aenderungen (artikel_nr, feld, alt, neu, von_id, von_name) VALUES (?, ?, ?, ?, ?, ?)',
        [z.artikel_nr, 'preis_netto_cent', z.alt_cent == null ? null : String(z.alt_cent), String(z.neu_cent), user.id || null, user.name || null]);
      await conn.query(
        `INSERT INTO price_change_log (job_id, target, lexware_article_id, article_number, article_name, rule_text, old_net, new_net, status, reason, changed_by, changed_by_name)
         VALUES (?, 'lexware', ?, ?, ?, ?, ?, ?, 'ok', ?, ?, ?)`,
        [jobId, z.lexware_id, z.lexware_nummer, z.lexware_name || z.bezeichnung, 'Abgleich: Preis aus Lexware übernommen',
          z.alt_cent == null ? null : z.alt_cent / 100, z.neu_cent / 100, 'Lexware führend, nur ins Portal übernommen', user.id || null, user.name || null]);
    }
    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
  return { geaendert: plan.zeilen.length, unveraendert: plan.gleich, ohnePreis: plan.ohnePreis.length, jobId };
}

module.exports = { planePreiseAusLexware, pruefeErwartung, uebernehmePreiseAusLexware };
