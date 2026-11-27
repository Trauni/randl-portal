/**
 * Prüfung Kunden-Duplikate zwischen Gas-Shop (gas-db customers) und Lexware.
 * Reine Funktionen ohne Zugriff auf Netz oder DB; das Skript scripts/kunden-duplikate-pruefen.js
 * lädt die Daten und gibt aus.
 *
 * Anlass: ein Kunde war in Lexware doppelt (alte Nummer mit Umsatz, neue Nummer). Wird der neue
 * Shop-Kunde über die Duplikat-Rückfrage mit der alten Nummer verknüpft, schlägt das Update im Shop am
 * Unique-Index auf lexware_id fehl, und der Portal-Fallback gasDirectLink setzt nur lexware_id um:
 * lexware_customer_number bleibt auf der alten Nummer, der bisherige Kunde verliert seine
 * Verknüpfung und kann beim nächsten Push neu in Lexware angelegt werden.
 */

const RECHTSFORMEN = new Set(['gmbh', 'kg', 'ohg', 'ag', 'se', 'ev', 'ug', 'co', 'gbr', 'mbh', 'und', 'u']);

function normal(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

// Name als sortierte Wortmenge ohne Rechtsform: „Mustermann Max“ = „Max Mustermann GmbH“
function nameSchluessel(name) {
  const w = normal(name).split(' ').filter((t) => t && !RECHTSFORMEN.has(t));
  return [...new Set(w)].sort().join(' ');
}

// Straße ohne „str“/„strasse“-Unterschied
function strassenSchluessel(strasse) {
  return normal(strasse).replace(/\bstr(asse)?\b/g, 'str').replace(/(\w)str(asse)?\b/g, '$1str').replace(/\s+/g, '');
}

function lexwareName(c) {
  return c.company?.name || `${c.person?.lastName || ''} ${c.person?.firstName || ''}`.trim();
}

function shopName(k) {
  return k.company_name || k.name || `${k.last_name || ''} ${k.first_name || ''}`.trim();
}

function lexwareKontakt(c) {
  const adr = (c.addresses?.billing || [])[0] || {};
  return {
    id: c.id,
    nummer: c.roles?.customer?.number != null ? String(c.roles.customer.number) : null,
    name: lexwareName(c),
    strasse: adr.street || '',
    plz: (adr.zip || '').trim(),
    ort: adr.city || '',
    archiviert: !!c.archived,
  };
}

function shopKunde(k) {
  return {
    id: k.id,
    name: shopName(k),
    strasse: k.billing_street || '',
    plz: (k.billing_zip || '').trim(),
    ort: k.billing_city || '',
    lexware_id: k.lexware_id || null,
    lexware_nr: k.lexware_customer_number ? String(k.lexware_customer_number) : null,
    in_lexware: !!k.in_lexware,
    ser_nr: k.customer_number || null,
    quelle: k.source || null,
    angelegt: k.created_at || null,
    bestellungen: k.bestellungen == null ? null : Number(k.bestellungen),
    letzte_lieferung: k.datum_letzte_lieferung ? new Date(k.datum_letzte_lieferung).toISOString().slice(0, 10) : null,
  };
}

// Gruppen mit gleichem Schlüssel, nur wo mehr als ein Eintrag
function gruppiere(liste, schluessel) {
  const m = new Map();
  for (const e of liste) {
    const s = schluessel(e);
    if (!s) continue;
    if (!m.has(s)) m.set(s, []);
    m.get(s).push(e);
  }
  return [...m.entries()].filter(([, g]) => g.length > 1).map(([s, g]) => ({ schluessel: s, eintraege: g }));
}

// Zwei Lexware-Kontakte gelten als Duplikat bei gleichem Namen + PLZ oder gleicher Straße + PLZ
function lexwareDuplikate(kontakte) {
  const nachName = gruppiere(kontakte, (k) => (k.plz && nameSchluessel(k.name) ? `${nameSchluessel(k.name)}|${k.plz}` : null));
  const nachStrasse = gruppiere(kontakte, (k) => (k.plz && strassenSchluessel(k.strasse) ? `${strassenSchluessel(k.strasse)}|${k.plz}` : null));
  // Gruppen zusammenführen, die dieselben Kontakte enthalten
  const gesehen = new Set();
  const gruppen = [];
  for (const [art, liste] of [['Name+PLZ', nachName], ['Straße+PLZ', nachStrasse]]) {
    for (const g of liste) {
      const ids = g.eintraege.map((e) => e.id).sort().join(',');
      if (gesehen.has(ids)) continue;
      gesehen.add(ids);
      gruppen.push({ art, eintraege: g.eintraege });
    }
  }
  return gruppen;
}

function shopDuplikate(kunden) {
  return gruppiere(kunden, (k) => (k.plz && nameSchluessel(k.name) ? `${nameSchluessel(k.name)}|${k.plz}` : null))
    .map((g) => ({ art: 'Name+PLZ', eintraege: g.eintraege }));
}

/**
 * Abgleich Shop ↔ Lexware:
 *  - nummerFalsch: lexware_customer_number passt nicht zur Nummer des verknüpften Kontakts
 *  - kontaktFehlt: lexware_id zeigt auf einen Kontakt, den es in Lexware nicht (mehr) gibt –
 *    der nächste „Nach Lexware“-Push legt dann einen neuen Kontakt an
 *  - verwaist: Shop-Kunde hat eine Lexware-Nummer, aber keine Verknüpfung (mehr)
 *  - doppeltVerknuepft: mehrere Shop-Kunden tragen dieselbe Lexware-Nummer
 */
function abgleich(kunden, kontakte) {
  const nachId = new Map(kontakte.map((k) => [k.id, k]));
  const nummerFalsch = [];
  const kontaktFehlt = [];
  const verwaist = [];
  for (const k of kunden) {
    if (k.lexware_id) {
      const c = nachId.get(k.lexware_id);
      if (!c) kontaktFehlt.push(k);
      else if (c.nummer && k.lexware_nr !== c.nummer) nummerFalsch.push({ ...k, nummer_lexware: c.nummer, name_lexware: c.name });
    } else if (k.lexware_nr) {
      verwaist.push(k);
    }
  }
  const doppeltVerknuepft = gruppiere(kunden, (k) => k.lexware_nr).map((g) => ({ nummer: g.schluessel, eintraege: g.eintraege }));
  return { nummerFalsch, kontaktFehlt, verwaist, doppeltVerknuepft };
}

module.exports = { normal, nameSchluessel, strassenSchluessel, lexwareKontakt, shopKunde, lexwareDuplikate, shopDuplikate, abgleich };
