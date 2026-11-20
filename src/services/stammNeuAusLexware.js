/**
 * #617 Schritt A4: Lexware-Artikel, die im Portal-Stamm noch fehlen, im Stamm anlegen (Lexware führt den Artikelstamm).
 * Standardmäßig nur GZ- (Gaszubehör); RG- (Füllung) und PFAND- (Pfand) nur auf ausdrücklichen Wunsch, weil dort ADR-Angaben,
 * Gasart und Pfandflasche dazukommen müssten. Geschrieben wird nur in die Portal-Datenbank, nichts nach Lexware, SER oder in den Shop.
 *
 * Angelegt wird: Nummer ohne Präfix als Schlüssel, Bezeichnung, Typ nach Präfix, Einheit, Lexware-ID, Sparte, Nettopreis, MwSt.
 * Nicht angelegt wird, was bewusst gelöscht wurde (gas_artikel_geloescht) oder schon im Stamm steht.
 */
const { ohnePraefix, praefixVon, sparteVon } = require('../utils/lexwareArtikelAnalyse');

const NR_RE = /^[A-Za-z0-9_-]{1,16}$/;
const norm = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();

/** Typ nach Lexware-Präfix: GZ = Zubehör (Versand/Fracht = Dienstleistung), PFAND = Pfand, RG = Füllung. */
function typVon(praefix, titel) {
  if (praefix === 'GZ') return /versand|fracht/i.test(titel || '') ? 'D' : 'Z';
  if (praefix === 'PFAND') return 'P';
  if (praefix === 'RG') return 'F';
  return null;
}

function planeNeuAusLexware(stamm, lexware, geloescht = [], { praefixe = ['GZ'] } = {}) {
  const erlaubt = new Set(praefixe.map((p) => p.toUpperCase()));
  const vorhanden = new Set((stamm || []).map((s) => String(s.artikel_nr)));
  const weg = new Set((geloescht || []).map(String));
  const zeilen = [], uebersprungen = [];
  for (const a of (lexware || []).filter((x) => !x.archived && x.articleNumber)) {
    const nummer = String(a.articleNumber).trim();
    const praefix = praefixVon(nummer);
    if (!erlaubt.has(praefix)) continue;
    const nr = ohnePraefix(nummer);
    if (vorhanden.has(nr)) continue;
    if (weg.has(nr)) { uebersprungen.push({ nummer, grund: 'bewusst gelöscht' }); continue; }
    if (!NR_RE.test(nr)) { uebersprungen.push({ nummer, grund: 'Nummer passt nicht (1 bis 16 Zeichen, Buchstaben, Ziffern, - _)' }); continue; }
    const titel = norm(a.title);
    if (!titel || titel.length > 120) { uebersprungen.push({ nummer, grund: 'Bezeichnung leer oder länger als 120 Zeichen' }); continue; }
    const netto = a.price?.netPrice;
    zeilen.push({
      artikel_nr: nr, lexware_nummer: nummer, bezeichnung: titel, typ: typVon(praefix, titel), einheit: norm(a.unitName) || null,
      lexware_id: a.id, sparte: sparteVon(praefix) || null,
      preis_netto_cent: netto == null ? null : Math.round(Number(netto) * 100),
      mwst_satz: a.price?.taxRatePercentage ?? a.price?.taxRate ?? null,
    });
  }
  zeilen.sort((x, y) => x.artikel_nr.localeCompare(y.artikel_nr));
  return { zeilen, uebersprungen };
}

async function legeNeuAusLexwareAn(db, lexware, user = {}, erwartet, opt = {}) {
  const [stamm] = await db.query('SELECT artikel_nr FROM gas_artikel');
  const [geloescht] = await db.query('SELECT artikel_nr FROM gas_artikel_geloescht');
  const plan = planeNeuAusLexware(stamm, lexware, geloescht.map((g) => g.artikel_nr), opt);
  if (!erwartet || erwartet.anzahl !== plan.zeilen.length) {
    const err = new Error('Die Daten haben sich seit der Vorschau geändert, bitte die Vorschau neu laden');
    err.status = 409;
    throw err;
  }
  const jetzt = new Date().toISOString();
  const von = [user.id || null, user.fullName || user.username || 'Lexware-Übernahme (#617)'];
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const [gruppen] = await conn.query('SELECT id, name FROM artikel_gruppe WHERE parent_id IS NULL');
    const gruppeId = new Map(gruppen.map((g) => [g.name, g.id]));
    for (const z of plan.zeilen) {
      const werte = { bezeichnung: z.bezeichnung, typ: z.typ, einheit: z.einheit, lexware_id: z.lexware_id, preis_netto_cent: z.preis_netto_cent, mwst_satz: z.mwst_satz, shop_sichtbar: z.typ === 'F' ? null : 0 };
      const gid = z.sparte ? gruppeId.get(z.sparte) : null;
      if (gid) werte.gruppe_id = gid;
      const stand = Object.fromEntries(['bezeichnung', 'einheit', 'lexware_id', 'preis_netto_cent'].map((k) => [k, { quelle: 'lexware', am: jetzt }]));
      stand.typ = { quelle: 'portal', am: jetzt };
      const felder = ['artikel_nr', 'aktiv', 'zaehlt_als_flasche', 'feld_stand', ...Object.keys(werte)];
      await conn.query(`INSERT INTO gas_artikel (${felder.join(', ')}) VALUES (${felder.map(() => '?').join(', ')})`,
        [z.artikel_nr, 1, 0, JSON.stringify(stand), ...Object.values(werte)]);
      await conn.query('INSERT INTO gas_artikel_aenderungen (artikel_nr, feld, alt, neu, von_id, von_name) VALUES (?, ?, NULL, ?, ?, ?)',
        [z.artikel_nr, '(Artikel)', `angelegt aus Lexware ${z.lexware_nummer}`, ...von]);
    }
    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
  return { angelegt: plan.zeilen.length, uebersprungen: plan.uebersprungen.length };
}

module.exports = { planeNeuAusLexware, legeNeuAusLexwareAn, typVon };
