/**
 * #606: Eine Artikelliste aus Artikelstamm (gas_artikel), Lexware (RG-/NRG-) und SER-Produktstamm.
 * Reine Funktionen ohne DB. Schlüssel ist die Nummer ohne Präfix (wie im Stamm).
 *
 *  - Lexware:  "ok" | "abweichend" (Netto-Preis anders als im Stamm) | "fehlt" (Füllung ohne RG-/NRG-Artikel) | "nicht verglichen"
 *  - SER:      "ok" | "abweichend" (Preis) | "Name anders" | "fehlt" (RG-Füllung ohne SER-Produkt) | "nicht verglichen"
 *  - Fahrer-App: "aktiv" | "inaktiv" (nur aktive Artikel gehen an die App); dazu `luecken` = was für die App noch fehlt
 */

const stammNr = (nr) => String(nr || '').trim().replace(/^N?RG-/i, '');
const normName = (s) => String(s || '').toLowerCase().replace(/[\s\-_;,./]+/g, ' ').trim();
const leer = (v) => v == null || v === '';
const cent = (euro) => (euro == null ? null : Math.round(Number(euro) * 100));

/** Was für die Fahrer-App einer Füllung noch fehlt (Pfand-, Steuer- und Provisionsartikel brauchen nichts). */
function luecken(a) {
  if (a.typ !== 'F') return [];
  const fehlt = [];
  if (leer(a.un_nr)) fehlt.push('UN-Nr.');
  if (leer(a.gefahrklasse)) fehlt.push('Gefahrzettel');
  if (leer(a.befoerderungskategorie) && leer(a.ggvs_faktor)) fehlt.push('Beförderungskategorie');
  if (leer(a.fuellgewicht_kg)) fehlt.push('Gewicht');
  if (leer(a.pfand_artikel_nr)) fehlt.push('Pfandflasche');
  return fehlt;
}

/**
 * "Wo läuft der Artikel schon": je Stelle ein Eintrag { stelle, ok: 'ok' | 'warn', text } für die Detailseite.
 * Stellen ohne Aussage (z. B. SER bei NRG-Artikeln) fehlen.
 */
function laeuftSchon(z) {
  const punkte = [];
  if (z.lexware) {
    const abw = z.lexware_status === 'abweichend';
    punkte.push({ stelle: 'Lexware', ok: abw ? 'warn' : 'ok',
      text: `${z.lexware.nummer}, im Shop ${z.lexware.shop}${abw ? ', Preis weicht vom Stamm ab' : ''}` });
  } else if (z.lexware_status === 'fehlt') {
    punkte.push({ stelle: 'Lexware', ok: 'warn', text: 'kein RG-/NRG-Artikel gefunden' });
  }
  if (z.ser_status === 'ok') punkte.push({ stelle: 'SER', ok: 'ok', text: 'angelegt, Preis und Name passen' });
  else if (z.ser_status === 'abweichend') punkte.push({ stelle: 'SER', ok: 'warn', text: 'Preis weicht ab, Push SER nötig' });
  else if (z.ser_status === 'Name anders') punkte.push({ stelle: 'SER', ok: 'warn', text: 'Name weicht ab' });
  else if (z.ser_status === 'fehlt') punkte.push({ stelle: 'SER', ok: 'warn', text: 'nicht im SER-Export' });
  punkte.push(z.im_stamm
    ? { stelle: 'Tourplanung', ok: 'ok', text: 'nimmt den Artikel an' }
    : { stelle: 'Tourplanung', ok: 'warn', text: 'nicht im Stamm, Bestellungen mit diesem Artikel werden abgelehnt' });
  if (z.im_stamm) {
    punkte.push(z.fahrer_app === 'aktiv'
      ? { stelle: 'Fahrer-App', ok: 'ok', text: 'aktiv' }
      : { stelle: 'Fahrer-App', ok: 'warn', text: 'inaktiv' });
    const fehlt = [z.gasart ? null : 'Gasart', z.preis_netto_cent != null ? null : 'Preis'].filter(Boolean);
    punkte.push(fehlt.length
      ? { stelle: 'Auswertung', ok: 'warn', text: `ohne ${fehlt.join(' und ')}, Umsatz fehlt` }
      : { stelle: 'Auswertung', ok: 'ok', text: 'Gasart und Preis vorhanden' });
  }
  return punkte;
}

function lexwareInfo(l) {
  return {
    id: l.id, nummer: l.articleNumber, name: l.name, tags: l.tags || [],
    netto_cent: cent(l.netPrice), inhalt: l.content || null,
    shop: String(l.articleNumber).toUpperCase().startsWith('NRG-') ? 'ausgeblendet' : 'sichtbar',
  };
}

/**
 * stamm: Zeilen aus gas_artikel (null = Nutzer darf den Stamm nicht sehen, dann nur Lexware wie früher)
 * lexware: Artikel aus loadGasArticles (id, articleNumber, name, netPrice, tags, content)
 * ser: Zeilen aus ser_product_master { prodnr, name, preis_cent }
 */
function verbinde({ stamm, lexware = [], ser = [], lexwareVerfuegbar = true }) {
  const serVerfuegbar = stamm != null; // SER-Produktstamm gehört zum Stamm-Recht
  const lexNachNr = new Map();
  for (const l of lexware) {
    const nr = stammNr(l.articleNumber);
    // RG- (im Shop sichtbar) hat Vorrang, falls es beide Schreibweisen gibt
    if (!lexNachNr.has(nr) || !String(l.articleNumber).toUpperCase().startsWith('NRG-')) lexNachNr.set(nr, l);
  }
  const serNachNr = new Map(ser.map((s) => [String(s.prodnr), s]));
  const stammNachNr = new Map((stamm || []).map((a) => [String(a.artikel_nr), a]));
  const nummern = [...new Set([...stammNachNr.keys(), ...lexNachNr.keys()])].sort();

  return nummern.map((nr) => {
    const a = stammNachNr.get(nr) || null;
    const l = lexNachNr.get(nr) || null;
    const s = serNachNr.get(nr) || null;
    const typ = a ? a.typ : null;
    const stammCent = a && a.preis_netto_cent != null ? Number(a.preis_netto_cent) : null;
    const lex = l ? lexwareInfo(l) : null;

    // Vergleichspreis: der Stamm führt, ohne Stammpreis gilt Lexware
    const bezugCent = stammCent ?? lex?.netto_cent ?? null;

    let lexStatus;
    if (!lexwareVerfuegbar) lexStatus = 'nicht verglichen';
    else if (!lex) lexStatus = typ === 'F' || !a ? 'fehlt' : 'nicht verglichen';
    else lexStatus = stammCent != null && lex.netto_cent != null && stammCent !== lex.netto_cent ? 'abweichend' : 'ok';

    let serStatus;
    if (!serVerfuegbar) serStatus = 'nicht verglichen';
    else if (!s) serStatus = lex && lex.shop === 'sichtbar' && (typ === 'F' || !a) ? 'fehlt' : 'nicht verglichen';
    else if (bezugCent != null && s.preis_cent != null && Number(s.preis_cent) !== bezugCent) serStatus = 'abweichend';
    else if (normName(s.name) !== normName(a?.bezeichnung ?? lex?.name)) serStatus = 'Name anders';
    else serStatus = 'ok';

    const fehlt = a ? luecken(a) : [];
    return {
      artikel_nr: nr,
      bezeichnung: a?.bezeichnung ?? lex?.name ?? s?.name ?? nr,
      im_stamm: !!a,
      typ,
      aktiv: a ? !!a.aktiv : null,
      gasart: a?.gasart ?? null,
      un_nr: a?.un_nr ?? null, gefahrklasse: a?.gefahrklasse ?? null,
      befoerderungskategorie: a?.befoerderungskategorie ?? null, ggvs_faktor: a?.ggvs_faktor ?? null,
      bezadr: a?.bezadr ?? null, fuellgewicht_kg: a?.fuellgewicht_kg ?? null,
      fuellmenge: a?.fuellmenge ?? null, fuellmenge_einheit: a?.fuellmenge_einheit ?? null,
      mwst_satz: a?.mwst_satz ?? null,
      pfand_artikel_nr: a?.pfand_artikel_nr ?? null, kaufflasche_artikel_nr: a?.kaufflasche_artikel_nr ?? null,
      preis_netto_cent: stammCent ?? lex?.netto_cent ?? null,
      lexware: lex,
      lexware_status: lexStatus,
      ser: s ? { name: s.name, preis_cent: s.preis_cent == null ? null : Number(s.preis_cent) } : null,
      ser_status: serStatus,
      fahrer_app: a ? (a.aktiv ? 'aktiv' : 'inaktiv') : null,
      luecken: fehlt,
      ek_gruppe: a?.ek_gruppe ?? null,
    };
  }).map((z) => ({ ...z, laeuft: laeuftSchon(z) }));
}

/** Zähler für den Hinweisbalken "Zu erledigen" und die Filter. */
function zusammenfassung(zeilen) {
  const abweichend = (z) => z.lexware_status === 'abweichend' || z.ser_status === 'abweichend' || z.ser_status === 'Name anders';
  return {
    gesamt: zeilen.length,
    unvollstaendig: zeilen.filter((z) => z.luecken.length > 0).map((z) => z.artikel_nr),
    abweichungen: zeilen.filter(abweichend).map((z) => z.artikel_nr),
    nicht_im_stamm: zeilen.filter((z) => !z.im_stamm).map((z) => z.artikel_nr),
  };
}

module.exports = { verbinde, zusammenfassung, luecken, laeuftSchon, stammNr };
