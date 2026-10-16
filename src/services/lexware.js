/**
 * Lexware (Lex API) — direkter Zugang des Portals fuer die Metallarbeiten (#382).
 *
 * Alles andere (Preis-Tool, Kunden, Bestellungen, Lieferanten) laeuft weiter ueber
 * shopClient.js → Gas-Shop-admin-backend. Gleicher Schluessel wie der Gas-Shop:
 * LEXWARE_API_KEY in der Portal-.env.
 *
 * Grenze der API: 2 Anfragen/s fuer den ganzen Schluessel, also gemeinsam mit dem
 * Gas-Shop. Dieses Modul schickt deshalb hoechstens 1 Anfrage/s (alle Aufrufe in
 * einer Warteschlange) und wartet bei 429 mit steigenden Pausen.
 *
 * Kontakte: PUT ersetzt den ganzen Kontakt. updateContactNote() liest deshalb den
 * aktuellen Stand, aendert nur note und schickt alles andere unveraendert zurueck;
 * bei 409 (zwischendurch geaendert) einmal neu lesen und erneut schreiben.
 */

const BASE_URL = 'https://api.lexware.io/v1';

// Belegart (voucherType in der Belegliste) → Pfad der Einzel-Endpunkte
const BELEG_PFADE = {
  quotation: 'quotations',
  orderconfirmation: 'order-confirmations',
  deliverynote: 'delivery-notes',
  invoice: 'invoices',
};
const SEITE_MAX = 250;   // Lexware: max. 250 Eintraege pro Seite der Belegliste
const SEITEN_LIMIT = 100; // Sicherung gegen Endlosschleifen
const ABSTAND_MS = 1000;
const VERSUCHE_429 = 4;

// Nur-Lesen-Felder, die beim PUT weggelassen werden (Test am Testkontakt 16.10.2026: PUT ok,
// sonst keine Felder veraendert)
const NUR_LESEN = ['organizationId', 'archived'];

const sleep = ms => new Promise(r => setTimeout(r, ms));

// Date → 'YYYY-MM-DD' (lokales Datum); Strings werden durchgereicht
function datum(d) {
  if (typeof d === 'string') return d;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

class LexwareError extends Error {
  constructor(message, status) {
    super(message);
    this.name = 'LexwareError';
    this.status = status;
  }
}

/**
 * Client bauen. Die Optionen sind fuer Tests; im Portal reicht der Standard-Client unten.
 */
function createClient({
  apiKey = () => process.env.LEXWARE_API_KEY,
  fetchImpl = (...a) => fetch(...a),
  abstandMs = ABSTAND_MS,
  pauseMs = 1500,
  warte = sleep,
} = {}) {
  let kette = Promise.resolve();
  let letzterStart = 0;

  // Reiht den Aufruf ein: zwischen zwei Anfragen liegen mindestens abstandMs
  function imTakt(fn) {
    const lauf = kette.then(async () => {
      const rest = letzterStart + abstandMs - Date.now();
      if (rest > 0) await warte(rest);
      letzterStart = Date.now();
      return fn();
    });
    kette = lauf.catch(() => {});
    return lauf;
  }

  // opts.binary: Antwort als Buffer (PDF), opts.accept: Accept-Header
  async function apiCall(method, path, body, { binary = false, accept = 'application/json' } = {}) {
    const key = typeof apiKey === 'function' ? apiKey() : apiKey;
    if (!key) throw new LexwareError('LEXWARE_API_KEY fehlt in der .env', 0);

    for (let versuch = 1; ; versuch++) {
      const res = await imTakt(() => fetchImpl(`${BASE_URL}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${key}`,
          'Content-Type': 'application/json',
          Accept: accept,
        },
        body: body ? JSON.stringify(body) : undefined,
      }));

      if (res.status === 429 && versuch < VERSUCHE_429) {
        const retryAfter = Number(res.headers?.get?.('retry-after'));
        await warte(retryAfter > 0 ? retryAfter * 1000 : pauseMs * versuch);
        continue;
      }

      if (binary && res.ok) return Buffer.from(await res.arrayBuffer());

      const text = await res.text();
      let data;
      try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text }; }

      if (!res.ok) {
        // Die eigentliche Ursache (z. B. bei 400/406) steht in IssueList (aelteres Format)
        // oder in details (neueres Format, z. B. POST /order-confirmations)
        const issues = [
          ...(data?.IssueList || []).map(i => [i.i18nKey, i.source, i.type].filter(Boolean).join(' / ')),
          ...(data?.details || []).map(d => [d.field, d.violation, d.message].filter(Boolean).join(' / ')),
        ].filter(Boolean);
        const msg = [data?.message || data?.error || `HTTP ${res.status}`, ...issues].join(' – ');
        throw new LexwareError(`Lexware ${method} ${path} (${res.status}): ${msg}`, res.status);
      }
      return data;
    }
  }

  function getContact(id) {
    return apiCall('GET', `/contacts/${encodeURIComponent(id)}`);
  }

  // Lexware sucht ab 3 Zeichen im Namen; nur Kunden, erste Seite reicht fuer die Auswahl
  async function searchContacts(name, { size = 25 } = {}) {
    const q = String(name || '').trim();
    if (q.length < 3) return [];
    const data = await apiCall('GET', `/contacts?customer=true&size=${size}&name=${encodeURIComponent(q)}`);
    return data?.content || [];
  }

  /**
   * Notiz eines Kontakts aendern, ohne den Rest anzufassen.
   * aendern(alteNotiz) → neue Notiz; gibt sie dieselbe zurueck, wird nichts geschrieben.
   * aktuell: schon gelesener Kontakt (spart eine Anfrage); nach 409 wird neu gelesen.
   * Ergebnis: { geaendert, note, version }
   */
  async function updateContactNote(id, aendern, { aktuell } = {}) {
    for (let versuch = 1; ; versuch++) {
      const current = versuch === 1 && aktuell ? aktuell : await getContact(id);
      const alt = current.note || '';
      const neu = aendern(alt);
      if (neu === alt) return { geaendert: false, note: alt, version: current.version };

      const payload = { ...current, note: neu };
      for (const f of NUR_LESEN) delete payload[f];
      try {
        const res = await apiCall('PUT', `/contacts/${encodeURIComponent(id)}`, payload);
        return { geaendert: true, note: neu, version: res?.version };
      } catch (err) {
        if (err.status === 409 && versuch < 2) continue;
        throw err;
      }
    }
  }

  function belegPfad(typ) {
    const p = BELEG_PFADE[typ];
    if (!p) throw new LexwareError(`Unbekannte Belegart: ${typ}`, 0);
    return p;
  }

  /**
   * Belegliste, alle Seiten. Filter: contactId, types (Liste aus BELEG_PFADE),
   * updatedDateFrom / voucherDateFrom (Date oder 'YYYY-MM-DD').
   * Die Liste enthaelt weder Einleitungstext noch relatedVouchers → getVoucher().
   */
  async function listVouchers({ contactId, types = Object.keys(BELEG_PFADE), updatedDateFrom, voucherDateFrom } = {}) {
    const q = new URLSearchParams({ voucherType: types.join(','), voucherStatus: 'any', size: String(SEITE_MAX) });
    if (contactId) q.set('contactId', contactId);
    if (updatedDateFrom) q.set('updatedDateFrom', datum(updatedDateFrom));
    if (voucherDateFrom) q.set('voucherDateFrom', datum(voucherDateFrom));

    const alle = [];
    for (let page = 0; page < SEITEN_LIMIT; page++) {
      q.set('page', String(page));
      const data = await apiCall('GET', `/voucherlist?${q}`);
      const inhalt = data?.content || [];
      alle.push(...inhalt);
      // Ende: letzte Seite laut Lexware, oder Seite nicht voll
      if (data?.last === true || inhalt.length < SEITE_MAX) break;
      if (data?.totalPages != null && page + 1 >= data.totalPages) break;
    }
    return alle;
  }

  async function getVoucher(typ, id) {
    return apiCall('GET', `/${belegPfad(typ)}/${encodeURIComponent(id)}`);
  }

  // PDF eines fertigen Belegs als Buffer; bei Entwuerfen antwortet Lexware mit 409
  async function getVoucherFile(typ, id) {
    return apiCall('GET', `/${belegPfad(typ)}/${encodeURIComponent(id)}/file`, null, { binary: true, accept: 'application/pdf' });
  }

  /**
   * Beleg anlegen (#365). Ohne ?finalize legt Lexware einen Entwurf an.
   * vorgaenger: Lexware-ID des vorhergehenden Belegs (precedingSalesVoucherId), z. B. die AB
   * aus einem Angebot; Lexware setzt dann relatedVouchers. Ungueltiger Uebergang → 406.
   * Ergebnis laut Lexware: { id, resourceUri, createdDate, updatedDate, version }
   */
  function createVoucher(typ, payload, { vorgaenger } = {}) {
    const q = vorgaenger ? `?precedingSalesVoucherId=${encodeURIComponent(vorgaenger)}` : '';
    return apiCall('POST', `/${belegPfad(typ)}${q}`, payload);
  }

  return { apiCall, getContact, searchContacts, updateContactNote, listVouchers, getVoucher, getVoucherFile, createVoucher };
}

module.exports = { ...createClient(), createClient, LexwareError, BASE_URL, BELEG_PFADE, datum };
