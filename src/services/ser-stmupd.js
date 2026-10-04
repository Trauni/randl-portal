// portal/src/services/ser-stmupd.js
// Generiert STMUPD_0070_*.XML für SER FVK (Stammdaten-Update)
// Encoding: ISO-8859-1 | Versorgernr: 0070
// Inkl. KDSPEDSTAMM für Speditionszuordnung (spednr 644)

const iconv = require('iconv-lite');

function formatTimestamp(date) {
  const d = date instanceof Date ? date : new Date(date);
  const yyyy = d.getFullYear();
  const mm   = String(d.getMonth() + 1).padStart(2, '0');
  const dd   = String(d.getDate()).padStart(2, '0');
  const hh   = String(d.getHours()).padStart(2, '0');
  const mi   = String(d.getMinutes()).padStart(2, '0');
  const ss   = String(d.getSeconds()).padStart(2, '0');
  return `${yyyy}${mm}${dd}_${hh}${mi}${ss}`;
}

function replaceUmlauts(str) {
  if (!str) return '';
  return String(str)
    .replace(/ä/g, 'ae').replace(/Ä/g, 'Ae')
    .replace(/ö/g, 'oe').replace(/Ö/g, 'Oe')
    .replace(/ü/g, 'ue').replace(/Ü/g, 'Ue')
    .replace(/ß/g, 'ss')
    .replace(/[^\x00-\xFF]/g, '?');
}

function escapeXml(str) {
  if (str === null || str === undefined) return '';
  return replaceUmlauts(String(str))
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function sanitizeKdnr(customerNumber) {
  if (!customerNumber) return null;
  const digits = String(customerNumber).replace(/\D/g, '');
  if (!digits || digits.length > 11) return null;
  return digits;
}

// Baut <LIEFERADRSTAMM> nur wenn mind. 1 Adresse existiert.
// WICHTIG: ein leeres <LIEFERADRSTAMM></LIEFERADRSTAMM> wuerde laut
// SER-Doku alle bestehenden Lieferadressen des Kunden loeschen!
function buildLieferadrBlock(kdnr, deliveryAddresses) {
  if (!Array.isArray(deliveryAddresses) || deliveryAddresses.length === 0) return '';
  const entries = deliveryAddresses.map(addr => {
    const name2Attr = addr.name2 ? ` name2="${escapeXml(addr.name2)}"` : '';
    const telAttr   = addr.tel   ? ` tel="${escapeXml(addr.tel)}"`     : '';
    const land      = (!addr.land || addr.land === 'DE') ? 'D' : escapeXml(addr.land);
    return `  <LIEFERADR
    kdnr="${kdnr}"
    lieferadrnr="${addr.lieferadrnr}"
    name1="${escapeXml(addr.name1)}"${name2Attr}
    strasse="${escapeXml(addr.strasse)}"
    plz="${escapeXml(addr.plz)}"
    ort="${escapeXml(addr.ort)}"
    land="${land}"${telAttr}
  />`;
  }).join('\n');
  return `\n<LIEFERADRSTAMM>\n${entries}\n</LIEFERADRSTAMM>`;
}

function generateStmupdXml(customer, opts = {}, deliveryAddresses = []) {
  const versorgernr = process.env.SER_VERSORGER_NR || '0070';
  const spednr      = process.env.SER_SPED_NR      || '644';
  const now = new Date();
  const filename = `STMUPD_${versorgernr}_${formatTimestamp(now)}.XML`;

  const kdnr = sanitizeKdnr(customer.customer_number);
  if (!kdnr)                    throw new Error(`Ungueltige Kundennummer "${customer.customer_number}"`);
  if (!customer.billing_street) throw new Error('Strasse fehlt');
  if (!customer.billing_zip)    throw new Error('PLZ fehlt');
  if (!customer.billing_city)   throw new Error('Ort fehlt');
  if (!customer.name)           throw new Error('Name fehlt');

  // SER-Felder mit Defaults
  const pfjn      = opts.pfjn      !== undefined ? opts.pfjn      : true;
  const prjn      = opts.prjn      !== undefined ? opts.prjn      : true;
  const nujn      = opts.nujn      !== undefined ? opts.nujn      : true;
  const mwstkz    = opts.mwstkz    !== undefined ? opts.mwstkz    : true;
  const belegart  = opts.belegart  || customer.ser_belegart  || 'L';
  const kategorie = opts.kategorie || customer.ser_kategorie || 'F';
  const land      = (!customer.billing_country || customer.billing_country === 'DE') ? 'D' : escapeXml(customer.billing_country);

  const name2Attr  = customer.name2     ? ` name2="${escapeXml(customer.name2)}"`                              : ' name2=""';
  const name3Attr  = customer.name3     ? ` name3="${escapeXml(customer.name3)}"`                              : '';
  const telAttr    = customer.phone     ? ` tel="${escapeXml(customer.phone)}"`                                : '';
  const emailAttr  = customer.email     ? ` email="${escapeXml(customer.email)}"`                              : '';
  const infoAttr   = customer.info_sped ? ` info="${escapeXml(String(customer.info_sped).substring(0, 80))}"` : '';
  const lieferadrBlock = buildLieferadrBlock(kdnr, deliveryAddresses);

  const xmlString = `<?xml version="1.0" encoding="ISO-8859-1"?>
<STAMMDATEN versorgernr="${versorgernr}">
<KUNDENSTAMM>
  <KUNDE
    kdnr="${kdnr}"
    name1="${escapeXml(customer.name)}"${name2Attr}${name3Attr}
    strasse="${escapeXml(customer.billing_street)}"
    plz="${escapeXml(customer.billing_zip)}"
    ort="${escapeXml(customer.billing_city)}"
    land="${land}"${telAttr}${emailAttr}
    pfjn="${pfjn}"
    prjn="${prjn}"
    nujn="${nujn}"
    mwstkz="${mwstkz}"
    belegart="${belegart}"
    agentur=""
    kategorie="${kategorie}"${infoAttr}
  />
</KUNDENSTAMM>${lieferadrBlock}
<KDSPEDSTAMM>
  <KDSPED kdnr="${kdnr}" lieferadrnr="0" spednr="${spednr}"/>
</KDSPEDSTAMM>
</STAMMDATEN>`;

  const buffer = iconv.encode(xmlString, 'ISO-8859-1');
  return { xml: buffer, filename };
}

module.exports = { generateStmupdXml, sanitizeKdnr, escapeXml };
