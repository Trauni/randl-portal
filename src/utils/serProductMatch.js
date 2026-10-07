/**
 * #260 (07.10.2026): SER-Produktstamm mit den Lexware-Gasartikeln abgleichen.
 *
 * Zuordnung wie beim Bestell-Export (gas-webshop admin-backend, serProductNumber):
 * Lexware „RG-5920051“ ↔ SER-Produktnummer „5920051“. NRG-Artikel laufen nicht über
 * SER und werden hier nicht betrachtet.
 */

const SER_PREFIX = 'RG-';

function serNumberFor(articleNumber) {
  const s = String(articleNumber || '');
  return s.startsWith(SER_PREFIX) ? s.slice(SER_PREFIX.length) : null;
}

const normName = s => String(s || '').toLowerCase().replace(/[\s\-_;,./]+/g, ' ').trim();

/**
 * @param {object[]} serProducts  { prodnr, name, preis (ct), inhalt (Wert × 1000) }
 * @param {object[]} articles     Lexware-Artikel aus loadGasArticles (id, articleNumber, name, netPrice, content)
 * @param {object[]} [serInactive] inaktive SER-Produkte { prodnr, name }
 */
function matchSerProducts(serProducts, articles, serInactive = []) {
  const serByNr = new Map(serProducts.map(p => [p.prodnr, p]));
  const inactiveByNr = new Map(serInactive.map(p => [p.prodnr, p]));

  const matched = [];
  const withoutSer = [];
  for (const a of articles) {
    const nr = serNumberFor(a.articleNumber);
    if (!nr) continue;
    const s = serByNr.get(nr);
    if (!s) {
      withoutSer.push({ id: a.id, articleNumber: a.articleNumber, name: a.name,
        serInactive: inactiveByNr.has(nr) });
      continue;
    }
    const lexInhalt = a.content ? Math.round(a.content.value * 1000) : null;
    const lexCents = a.netPrice == null ? null : Math.round(a.netPrice * 100);
    matched.push({
      id: a.id,
      articleNumber: a.articleNumber,
      prodnr: nr,
      lexName: a.name,
      serName: s.name,
      nameDiffers: normName(a.name) !== normName(s.name),
      lexContent: a.content ? { value: a.content.value, unit: a.content.unit } : null,
      serInhalt: s.inhalt,
      contentDiffers: lexInhalt != null && s.inhalt != null && s.inhalt > 0 && lexInhalt !== s.inhalt,
      lexNet: a.netPrice ?? null,
      serNet: s.preis == null ? null : s.preis / 100,
      priceDiffers: lexCents != null && s.preis != null && lexCents !== s.preis,
    });
  }

  const byNumber = (x, y) => x.articleNumber.localeCompare(y.articleNumber);
  matched.sort(byNumber);
  withoutSer.sort(byNumber);

  return {
    matched,
    withoutSer,
    prodnrs: matched.map(m => m.prodnr),
    summary: {
      rgArticles: matched.length + withoutSer.length,
      matched: matched.length,
      withoutSer: withoutSer.length,
      nameDiffers: matched.filter(m => m.nameDiffers).length,
      contentDiffers: matched.filter(m => m.contentDiffers).length,
      priceDiffers: matched.filter(m => m.priceDiffers).length,
    },
  };
}

module.exports = { matchSerProducts, serNumberFor };
