const router = require('express').Router();
// Mount-Punkt in server.js: requireArea('gashandel'). Stammdaten (ADR, Gewicht, Fahrer-App) nur mit gashandel.preise,
// ohne dieses Recht zeigt die Liste wie die frühere Produktseite nur Lexware-Artikel.
const { getPool } = require('../../../db');
const { hasArea } = require('../../../utils/permissions');
const { loadGasArticles } = require('../../../services/gasArticles');
const requireArea = require('../../../middleware/requireArea');
const { verbinde, zusammenfassung } = require('../../../utils/artikelListe');
const { uebernehmeShopAusLexware } = require('../../../services/shopSichtbar');

// #606: eine Artikelliste aus Stamm, Lexware und SER (siehe utils/artikelListe.js)
router.get('/', async (req, res) => {
  const user = req.session.user || {};
  const darfStamm = hasArea(user.role, user.accessTags, 'gashandel.preise');
  try {
    let lexware = []; let cachedAt = null; let lexwareFehler = null;
    try { ({ articles: lexware, cachedAt } = await loadGasArticles()); }
    catch (err) {
      if (!darfStamm) throw err;            // ohne Stamm gäbe es sonst gar nichts zu zeigen
      lexwareFehler = err.message;
    }

    let stamm = null; let ser = [];
    if (darfStamm) {
      [stamm] = (await getPool().query(
        `SELECT artikel_nr, bezeichnung, typ, aktiv, gasart, un_nr, gefahrklasse, ggvs_faktor, befoerderungskategorie, bezadr,
                fuellgewicht_kg, fuellmenge, fuellmenge_einheit, preis_netto_cent, mwst_satz, pfand_artikel_nr, kaufflasche_artikel_nr, ek_gruppe, shop_sichtbar
           FROM gas_artikel ORDER BY artikel_nr`));
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

module.exports = router;
