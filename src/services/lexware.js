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
const ABSTAND_MS = 1000;
const VERSUCHE_429 = 4;

// Felder, die Lexware beim Lesen liefert, beim PUT aber nicht annimmt
const NUR_LESEN = ['organizationId', 'archived'];

const sleep = ms => new Promise(r => setTimeout(r, ms));

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

  async function apiCall(method, path, body) {
    const key = typeof apiKey === 'function' ? apiKey() : apiKey;
    if (!key) throw new LexwareError('LEXWARE_API_KEY fehlt in der .env', 0);

    for (let versuch = 1; ; versuch++) {
      const res = await imTakt(() => fetchImpl(`${BASE_URL}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${key}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: body ? JSON.stringify(body) : undefined,
      }));

      if (res.status === 429 && versuch < VERSUCHE_429) {
        const retryAfter = Number(res.headers?.get?.('retry-after'));
        await warte(retryAfter > 0 ? retryAfter * 1000 : pauseMs * versuch);
        continue;
      }

      const text = await res.text();
      let data;
      try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text }; }

      if (!res.ok) {
        // Die eigentliche Ursache (z. B. bei 400/406) steht nur in IssueList
        const issues = (data?.IssueList || [])
          .map(i => [i.i18nKey, i.source, i.type].filter(Boolean).join(' / '))
          .filter(Boolean);
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
   * Ergebnis: { geaendert, note, version }
   */
  async function updateContactNote(id, aendern) {
    for (let versuch = 1; ; versuch++) {
      const current = await getContact(id);
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

  return { apiCall, getContact, searchContacts, updateContactNote };
}

module.exports = { ...createClient(), createClient, LexwareError, BASE_URL };
