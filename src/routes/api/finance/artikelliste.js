const router = require('express').Router();
// Mount-Punkt in server.js: requireArea('gashandel'). Stammdaten (ADR, Gewicht, Fahrer-App) nur mit gashandel.preise,
// ohne dieses Recht zeigt die Liste wie die frühere Produktseite nur Lexware-Artikel.
const { getPool } = require('../../../db');
const { hasArea } = require('../../../utils/permissions');
const { loadGasArticles } = require('../../../services/gasArticles');
const { ladeAlleLexware, alsListenArtikel } = require('../../../services/lexwareAlle');
const lexwareAnlage = require('../../../services/lexwareAnlage');
const requireArea = require('../../../middleware/requireArea');
const { verbinde, zusammenfassung } = require('../../../utils/artikelListe');
const { uebernehmeShopAusLexware } = require('../../../services/shopSichtbar');
const { planePreiseAusLexware, uebernehmePreiseAusLexware } = require('../../../services/preiseAusLexware');

// #606: eine Artikelliste aus Stamm, Lexware und SER (siehe utils/artikelListe.js)
router.get('/', async (req, res) => {
  const user = req.session.user || {};
  const darfStamm = hasArea(user.role, user.accessTags, 'gashandel.preise');
  try {
    let lexware = []; let cachedAt = null; let lexwareFehler = null;
    try {
      ({ articles: lexware, cachedAt } = await loadGasArticles());
      // PFAND- und GZ-Artikel direkt aus Lexware dazu; fällt das aus, bleibt die Liste wie bisher (RG/NRG)
      try { lexware = [...lexware, ...alsListenArtikel(await ladeAlleLexware())]; } catch (e) { console.error('[Artikelliste] Lexware (alle Artikel):', e.message); }
    }
    catch (err) {
      if (!darfStamm) throw err;            // ohne Stamm gäbe es sonst gar nichts zu zeigen
      lexwareFehler = err.message;
    }

    let stamm = null; let ser = [];
    if (darfStamm) {
      [stamm] = (await getPool().query(
        `SELECT a.artikel_nr, a.bezeichnung, a.typ, a.aktiv, a.gasart, a.un_nr, a.gefahrklasse, a.ggvs_faktor, a.befoerderungskategorie, a.bezadr,
                a.fuellgewicht_kg, a.fuellmenge, a.fuellmenge_einheit, a.preis_netto_cent, a.mwst_satz, a.pfand_artikel_nr, a.kaufflasche_artikel_nr, a.ek_gruppe, a.shop_sichtbar,
                a.einheit, a.lexware_id, g.name AS sparte
           FROM gas_artikel a LEFT JOIN artikel_gruppe g ON g.id = a.gruppe_id ORDER BY a.artikel_nr`));
      [ser] = await getPool().query('SELECT prodnr, name, preis_cent FROM ser_product_master');
    }

    const artikel = verbinde({ stamm, lexware, ser, lexwareVerfuegbar: !lexwareFehler });
    res.json({
      artikel, zusammenfassung: zusammenfassung(artikel), cachedAt, lexwareFehler,
      rechte: { stamm: darfStamm },
      ohneInhalt: lexware.filter((a) => !a.content).length,
    });
  } catch (err) {
    console.error('[Artikelliste] GET error:', err.message);
    res.status(err.status || 500).json({ error: err.message });
  }
});

// #610: Shop-Kennzeichen aus dem Lexware-Präfix übernehmen (RG- = sichtbar, NRG- = ausgeblendet), nur wo im Portal noch nichts steht
router.post('/shop-aus-lexware', requireArea('gashandel.preise'), async (req, res) => {
  try {
    const { articles } = await loadGasArticles();
    const u = req.session.user || {};
    res.json(await uebernehmeShopAusLexware(getPool(), articles, { id: u.id, name: u.fullName || u.username }));
  } catch (err) {
    console.error('[Artikelliste] shop-aus-lexware:', err.message);
    res.status(err.status || 500).json({ error: err.message });
  }
});

// Preise aus Lexware in den Artikelstamm übernehmen: Vorschau (schreibt nichts) und Übernahme mit Bestätigung.
// Lexware ist nur Quelle; es wird nichts nach Lexware, SER oder in den Shop geschrieben.
router.get('/preise-aus-lexware', requireArea('gashandel.preise'), async (req, res) => {
  try {
    const { articles, cachedAt } = await loadGasArticles();
    const [stamm] = await getPool().query('SELECT artikel_nr, bezeichnung, preis_netto_cent FROM gas_artikel');
    res.json({ ...planePreiseAusLexware(stamm, articles), cachedAt });
  } catch (err) {
    console.error('[Artikelliste] preise-aus-lexware Vorschau:', err.message);
    res.status(err.status || 500).json({ error: err.message });
  }
});

router.post('/preise-aus-lexware', requireArea('gashandel.preise'), async (req, res) => {
  const { confirm, expected } = req.body || {};
  if (confirm !== true) return res.status(400).json({ error: 'Übernahme muss ausdrücklich bestätigt werden' });
  try {
    const { articles } = await loadGasArticles();
    const u = req.session.user || {};
    const r = await uebernehmePreiseAusLexware(getPool(), articles, { id: u.id, name: u.fullName || u.username }, expected);
    console.log('[Artikelliste] Preise aus Lexware übernommen:', r.geaendert, 'Artikel, von', u.username);
    res.json(r);
  } catch (err) {
    console.error('[Artikelliste] preise-aus-lexware:', err.message);
    res.status(err.status || 500).json({ error: err.message });
  }
});

// #617: Artikel aus dem Portal in Lexware anlegen. bestaetigt=false: Vorschau (schreibt nichts); true: anlegen.
// Es wird nur angelegt, was es in Lexware noch nicht gibt; nach SER und in den Shop geht nichts.
router.post('/lexware-anlegen', requireArea('gashandel.preise'), async (req, res) => {
  const { nummern, praefix, bestaetigt, erwartet } = req.body || {};
  const u = req.session.user || {};
  try {
    if (bestaetigt !== true) return res.json(await lexwareAnlage.vorschau(getPool(), nummern, praefix));
    const r = await lexwareAnlage.anlegen(getPool(), nummern, praefix, u, erwartet);
    console.log('[Artikelliste] in Lexware angelegt:', r.angelegt.map((a) => a.lexware_nummer).join(', ') || '-', r.fehler ? `Fehler: ${r.fehler}` : '', 'von', u.username);
    res.json(r);
  } catch (err) {
    console.error('[Artikelliste] lexware-anlegen:', err.message);
    res.status(err.status || 500).json({ error: err.message });
  }
});

module.exports = router;
