/**
 * Tourplanung im Büro (#518): Fachregeln ohne Datenbank.
 * Statuswechsel, Auswahl offener Bestellungen und Umbau Bestellung → Stopp.
 */
const { FahrerFehler } = require('./fahrerKrypto');

/** Erlaubte Statuswechsel durch das Büro. unterwegs → beendet ist „Tour im Büro beenden“. Start/Ende am Tablet kommen aus den Ereignissen. */
const BUERO_WECHSEL = {
  freigeben: { von: ['entwurf'], nach: 'freigegeben' },
  zurueck: { von: ['freigegeben'], nach: 'entwurf' },
  stornieren: { von: ['entwurf', 'freigegeben', 'unterwegs'], nach: 'storniert' },
  beenden: { von: ['unterwegs'], nach: 'beendet' },
};

function wechsel(aktion, tour) {
  const w = BUERO_WECHSEL[aktion];
  if (!w) throw new FahrerFehler(400, 'ungueltig', `Unbekannte Aktion ${aktion}`);
  if (!w.von.includes(tour.status)) {
    throw new FahrerFehler(409, 'status_unpassend', `Tour ist „${tour.status}“, ${aktion} geht nur aus: ${w.von.join(', ')}`);
  }
  return w.nach;
}

/** Stopps ändern, hinzufügen, entfernen und sortieren geht nur im Entwurf; danach ist die Tour gesperrt. */
function pruefeBearbeitbar(tour) {
  if (tour.status !== 'entwurf') throw new FahrerFehler(409, 'tour_gesperrt', `Tour ist „${tour.status}“ und nicht mehr änderbar (erst zurück in den Entwurf)`);
}

/** Löschen nur bei leerer oder stornierter Tour. */
function pruefeLoeschbar(tour, anzahlStopps) {
  if (tour.status === 'storniert' || anzahlStopps === 0) return;
  throw new FahrerFehler(409, 'tour_nicht_loeschbar', 'Nur leere oder stornierte Touren können entfernt werden');
}

/**
 * Offen für eine Tour: nicht storniert, nicht erledigt, in keiner aktiven Tour.
 * Von SER abgelehnte Bestellungen bleiben auswählbar, tragen aber eine Warnung.
 * Mit erledigteAkzeptierte zählen auch erledigte Bestellungen mit SER-Status „akzeptiert“ als offen (Testphase).
 */
function istOffen(bestellung, belegteIds, { erledigteAkzeptierte = false } = {}) {
  if (bestellung.status === 'cancelled' || belegteIds.has(String(bestellung.id))) return false;
  // Testphase: von SER akzeptierte Bestellungen bleiben wählbar, auch wenn sie als erledigt markiert sind.
  if (bestellung.done === true) return erledigteAkzeptierte && bestellung.ser_status === 'ok';
  return true;
}

/**
 * SER-Produktnummer wie im Shop (ser-xml.js): UUID als product_id → articleNumber, Lexware-Präfix „RG-“ entfällt
 * („RG-7801200“ → „7801200“). Der Artikelstamm folgt der SER-Vorgabe, also ohne Präfix.
 */
const LEXWARE_PREFIX = process.env.ARTICLE_PREFIX || 'RG-';
function artikelNr(position) {
  const roh = position.product_id || position.productId || position.prodnr || position.id;
  const istUuid = roh && /^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(String(roh));
  const nr = istUuid ? position.articleNumber || roh : roh;
  if (nr == null || nr === '') return null;
  const s = String(nr);
  const ohne = s.startsWith(LEXWARE_PREFIX) ? s.slice(LEXWARE_PREFIX.length) : s;
  return ohne || null;
}

const WARN_SER = new Set(['err', 'upload_error']);

/** Anzeige für die Auswahlliste im Büro. */
function bestellAnsicht(b) {
  const positionen = Array.isArray(b.items) ? b.items : [];
  return {
    id: String(b.id),
    kundeNr: b.lexware_customer_number || b.customer_number || null,
    kundeName: b.customer_name || null,
    adresse: lieferadresse(b),
    lieferzeit: lieferzeit(b),
    hinweis: b.delivery_note || null,
    positionen: positionen.map((p) => ({ artikelNr: artikelNr(p), name: p.name || p.title || null, menge: Number(p.quantity ?? p.voll ?? 0) })),
    serStatus: b.ser_status || null,
    serAbgelehnt: WARN_SER.has(b.ser_status),
    herkunft: String(b.delivery_note || '').startsWith('[Mobile]') ? 'mobile' : 'shop',
    angelegt: b.created_at || null,
  };
}

/**
 * Lieferadresse in dieser Reihenfolge: abweichende Lieferadresse der Bestellung (delivery_address_id),
 * Lieferadresse am Kundenstamm (shipping_*), Hauptadresse des Kunden (billing_*), PLZ/Ort an der Bestellung.
 * b.kunde ist die Kundenzeile aus der Shop-API (wird in der Route nachgeladen); ohne sie bleibt nur, was an der Bestellung steht.
 */
function zeile(strasse, plz, ort) {
  return [String(strasse || '').trim(), [plz, ort].filter(Boolean).join(' ').trim()].filter(Boolean).join(', ') || null;
}

function lieferadresse(b) {
  const k = b.kunde || {};
  return zeile(b.delivery_strasse, b.delivery_plz, b.delivery_ort)
    || (k.shipping_street ? zeile(k.shipping_street, k.shipping_zip, k.shipping_city) : null)
    || zeile(k.billing_street, k.billing_zip, k.billing_city)
    || zeile(null, b.billing_zip, b.billing_city);
}

function lieferzeit(b) {
  const von = b.delivery_time_from ? String(b.delivery_time_from).slice(0, 5) : '';
  const bis = b.delivery_time_to ? String(b.delivery_time_to).slice(0, 5) : '';
  if (von && bis) return `${von}–${bis} Uhr`;
  if (bis) return `bis ${bis} Uhr`;
  if (von) return `ab ${von} Uhr`;
  return null;
}

/**
 * Bestellung → Stopp samt Positionen. Kundendaten werden kopiert (die Tour bleibt, wie sie freigegeben wurde).
 * Wirft, wenn Kunde oder Position keine Nummer hat; das Büro soll das sehen, statt dass etwas still fehlt.
 */
function stoppAusBestellung(b) {
  const a = bestellAnsicht(b);
  if (!a.kundeNr) throw new FahrerFehler(422, 'kunde_ohne_nummer', `Bestellung ${a.id}: Kunde hat keine Kundennummer`);
  const positionen = (Array.isArray(b.items) ? b.items : []).map((p) => ({ artikelNr: artikelNr(p), soll: Number(p.quantity ?? p.voll ?? 0) }));
  if (!positionen.length) throw new FahrerFehler(422, 'bestellung_leer', `Bestellung ${a.id} hat keine Positionen`);
  const ohneNr = positionen.find((p) => !p.artikelNr);
  if (ohneNr) throw new FahrerFehler(422, 'position_ohne_artikel', `Bestellung ${a.id}: Position ohne Artikelnummer`);
  return {
    bestellId: a.id,
    auftragRef: `B-${a.id.slice(0, 8)}`,
    kundeNr: a.kundeNr,
    kundeName: a.kundeName || a.kundeNr,
    kundeAdresse: a.adresse,
    hinweise: a.hinweis ? a.hinweis.replace(/^\[Mobile\]\s*/, '').slice(0, 500) : null,
    lieferzeit: a.lieferzeit,
    positionen: positionen.filter((p) => p.soll > 0),
  };
}

/** Kunde aus dem Shop für die Suche in Vorlagen. Ohne Kundennummer ist er nicht wählbar (Stopps brauchen sie). */
function kundeAnsicht(c) {
  const kundeNr = c.lexware_customer_number || c.customer_number || null;
  if (!kundeNr) return null;
  const name = c.name || c.company_name || [c.first_name, c.last_name].filter(Boolean).join(' ') || kundeNr;
  return { kundeNr: String(kundeNr), kundeName: name, ort: [c.billing_zip, c.billing_city].filter(Boolean).join(' ') || null };
}

/** Vorlage aus den Stopps einer Tour: ein Eintrag je Kunde in der Reihenfolge des ersten Stopps. */
function vorlageKundenAusStopps(stopps) {
  const gesehen = new Set();
  const kunden = [];
  for (const s of stopps) {
    if (gesehen.has(s.kunde_nr)) continue;
    gesehen.add(s.kunde_nr);
    kunden.push({ kundeNr: s.kunde_nr, kundeName: s.kunde_name, lieferzeit: s.lieferzeit || null, hinweise: s.hinweise || null });
  }
  return kunden;
}

const nachAlter = (a, b) => String(a.created_at || '').localeCompare(String(b.created_at || ''));

/**
 * Stopps für eine Tour aus Vorlage + offenen Bestellungen. Je offener Bestellung eines Stammkunden ein Stopp,
 * Kunden in Vorlagenreihenfolge, mehrere Bestellungen eines Kunden nach Alter. Werte der Bestellung gehen vor
 * den Standardwerten der Vorlage. Kunden ohne offene Bestellung und nicht baubare Bestellungen werden gemeldet, nicht still ausgelassen.
 */
function stoppsAusVorlage(vorlageKunden, offeneBestellungen) {
  const stopps = [];
  const ohneBestellung = [];
  const fehler = [];
  for (const k of vorlageKunden) {
    const passende = offeneBestellungen.filter((b) => bestellAnsicht(b).kundeNr === k.kunde_nr).sort(nachAlter);
    if (!passende.length) { ohneBestellung.push({ kundeNr: k.kunde_nr, kundeName: k.kunde_name }); continue; }
    for (const b of passende) {
      try {
        const st = stoppAusBestellung(b);
        stopps.push({ ...st, lieferzeit: st.lieferzeit || k.lieferzeit || null, hinweise: st.hinweise || k.hinweise || null });
      } catch (err) {
        if (!(err instanceof FahrerFehler)) throw err;
        fehler.push({ bestellId: String(b.id), kundeNr: k.kunde_nr, grund: err.message });
      }
    }
  }
  return { stopps, ohneBestellung, fehler };
}

module.exports = { lieferadresse, kundeAnsicht, vorlageKundenAusStopps, stoppsAusVorlage, wechsel, pruefeBearbeitbar, pruefeLoeschbar, istOffen, artikelNr, bestellAnsicht, stoppAusBestellung };
