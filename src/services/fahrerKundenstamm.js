/**
 * Kundenstamm fürs Lager-Gerät (#516, #612): alle Kunden aus der Shop-API, seitenweise, ohne im Portal ausgeblendete
 * (customer_exclusions). Kundennummer wie auf der Tour: Lexware-Nummer, sonst SER-Nummer. Ohne Nummer kein Eintrag.
 * Kurzer Zwischenspeicher, damit nicht jeder Abruf von /heute den ganzen Stamm aus dem Shop zieht.
 */
const SEITE = 500;
const MAX_SEITEN = 40;
const PUFFER_MS = 10 * 60 * 1000;

/** Kunde aus dem Shop → Eintrag für die App, oder null ohne Kundennummer. */
function kundeFuerApp(c) {
  const id = c.lexware_customer_number || c.customer_number || null;
  if (!id) return null;
  // Wie die Tourplanung (fahrerPlanung.kundeAnsicht), damit der Kunde am Lager genauso heißt wie auf der Tour.
  const name = c.name || c.company_name || [c.first_name, c.last_name].filter(Boolean).join(' ') || String(id);
  const ort = [c.billing_zip, c.billing_city].filter(Boolean).join(' ');
  const adresse = [c.billing_street, ort].filter(Boolean).join(', ') || null;
  return { id: String(id), name, adresse };
}

/**
 * @param {object} deps
 * @param {(pfad: string) => Promise<Response>} deps.shopFetch
 * @param {() => Promise<Set<string|number>>} [deps.ausgeblendet]  IDs aus customer_exclusions
 * @param {() => number} [deps.uhr]
 */
function erstelleKundenstamm({ shopFetch, ausgeblendet = async () => new Set(), uhr = Date.now }) {
  let puffer = null;

  async function laden() {
    const raus = await ausgeblendet();
    const kunden = new Map();
    for (let seite = 1; seite <= MAX_SEITEN; seite++) {
      const res = await shopFetch(`/admin/customers?limit=${SEITE}&page=${seite}`);
      if (!res.ok) throw new Error(`Shop-API ${res.status}`);
      const d = await res.json();
      const liste = d.customers || [];
      for (const c of liste) {
        if (raus.has(c.id)) continue;
        const k = kundeFuerApp(c);
        if (k && !kunden.has(k.id)) kunden.set(k.id, k);
      }
      if (liste.length < SEITE || (d.total && seite * SEITE >= d.total)) break;
    }
    return [...kunden.values()].sort((a, b) => a.name.localeCompare(b.name, 'de'));
  }

  return async function holeKundenstamm() {
    if (puffer && uhr() - puffer.zeit < PUFFER_MS) return puffer.kunden;
    const kunden = await laden();
    puffer = { zeit: uhr(), kunden };
    return kunden;
  };
}

module.exports = { erstelleKundenstamm, kundeFuerApp };
