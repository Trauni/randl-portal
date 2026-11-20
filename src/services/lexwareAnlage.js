/**
 * #617: Artikel aus dem Portal-Stamm per Knopfdruck in Lexware anlegen (Vorschau, dann Bestätigung).
 * Es wird nur angelegt, was es in Lexware noch nicht gibt; bestehende Lexware-Artikel werden nie verändert.
 * Danach steht die Lexware-ID im Stamm (Verknüpfung), dazu Einheit und Sparte.
 */
const lexware = require('./lexware');
const { planeLexwareAnlage } = require('../utils/lexwareArtikelAnlegen');
const { sparteVon } = require('../utils/lexwareArtikelAnalyse');
const { vergesse } = require('./lexwareAlle');

const MAX = 50;
const fehler400 = (m) => Object.assign(new Error(m), { status: 400 });
const parseJson = (v) => { try { return (typeof v === 'string' ? JSON.parse(v) : v) || {}; } catch { return {}; } };

function pruefeEingabe(nummern, praefix) {
  if (!Array.isArray(nummern) || !nummern.length) throw fehler400('Keine Artikel ausgewählt');
  if (nummern.length > MAX) throw fehler400(`Höchstens ${MAX} Artikel auf einmal`);
  if (praefix != null && praefix !== '' && !/^[A-Za-z]{1,8}$/.test(praefix)) throw fehler400('Präfix: nur Buchstaben');
  return [...new Set(nummern.map(String))];
}

async function plane(db, nummern, praefix, listArticles) {
  const [stamm] = await db.query('SELECT artikel_nr, bezeichnung, typ, einheit, preis_netto_cent, mwst_satz FROM gas_artikel WHERE artikel_nr IN (?)', [nummern]);
  return planeLexwareAnlage(stamm, await listArticles(), nummern, { praefix: praefix || undefined });
}

/** Was würde angelegt, was geht nicht? Schreibt nichts. */
async function vorschau(db, nummernRoh, praefix, { listArticles = () => lexware.listArticles() } = {}) {
  const nummern = pruefeEingabe(nummernRoh, praefix);
  const plan = await plane(db, nummern, praefix, listArticles);
  return {
    zeilen: plan.zeilen.map((z) => ({ artikel_nr: z.artikel_nr, lexware_nummer: z.lexware_nummer, bezeichnung: z.payload.title, einheit: z.payload.unitName, netto: z.payload.price.netPrice, mwst: z.payload.price.taxRate, art: z.payload.type })),
    fehler: plan.fehler,
    brauchtPraefix: plan.fehler.some((f) => /Präfix/.test(f)),
  };
}

/**
 * Legt an. erwartet.anzahl muss zur Vorschau passen (sonst 409). Bei einem Fehler in Lexware wird abgebrochen;
 * was bis dahin angelegt wurde, bleibt angelegt und verknüpft (Ergebnis nennt es).
 */
async function anlegen(db, nummernRoh, praefix, user = {}, erwartet, { listArticles = () => lexware.listArticles(), createArticle = (p) => lexware.createArticle(p) } = {}) {
  const nummern = pruefeEingabe(nummernRoh, praefix);
  const plan = await plane(db, nummern, praefix, listArticles);
  if (plan.fehler.length) throw fehler400(plan.fehler.join('; '));
  if (!erwartet || erwartet.anzahl !== plan.zeilen.length) {
    throw Object.assign(new Error('Die Daten haben sich seit der Vorschau geändert, bitte die Vorschau neu laden'), { status: 409 });
  }
  const [gruppen] = await db.query('SELECT id, name FROM artikel_gruppe WHERE parent_id IS NULL');
  const gruppeId = new Map(gruppen.map((g) => [g.name, g.id]));
  const von = [user.id || null, user.fullName || user.username || 'Lexware anlegen (#617)'];
  const angelegt = [];
  let fehler = null;
  for (const z of plan.zeilen) {
    try {
      const r = await createArticle(z.payload);
      const [[alt]] = await db.query('SELECT feld_stand, gruppe_id FROM gas_artikel WHERE artikel_nr = ?', [z.artikel_nr]);
      const stand = { ...parseJson(alt?.feld_stand), lexware_id: { quelle: 'lexware', am: new Date().toISOString() }, einheit: { quelle: 'lexware', am: new Date().toISOString() } };
      const spalten = ['lexware_id = ?', 'einheit = ?', 'feld_stand = ?'];
      const werte = [r.id, z.payload.unitName, JSON.stringify(stand)];
      const sparte = sparteVon(z.lexware_nummer.split('-')[0]);
      if (alt?.gruppe_id == null && sparte && gruppeId.has(sparte)) { spalten.push('gruppe_id = ?'); werte.push(gruppeId.get(sparte)); }
      await db.query(`UPDATE gas_artikel SET ${spalten.join(', ')} WHERE artikel_nr = ?`, [...werte, z.artikel_nr]);
      await db.query('INSERT INTO gas_artikel_aenderungen (artikel_nr, feld, alt, neu, von_id, von_name) VALUES (?, ?, NULL, ?, ?, ?)',
        [z.artikel_nr, 'lexware_id', `${z.lexware_nummer} in Lexware angelegt`, ...von]);
      angelegt.push({ artikel_nr: z.artikel_nr, lexware_nummer: z.lexware_nummer });
    } catch (err) {
      fehler = `${z.lexware_nummer}: ${err.message}`;
      break;
    }
  }
  vergesse();   // die Liste soll die neuen Artikel gleich aus Lexware sehen
  return { angelegt, fehler };
}

module.exports = { vorschau, anlegen };
