/**
 * Metall-Kundenkonten (#369) – Client fuer die Admin-API des Gas-Shops (/admin/metall,
 * gas-webshop PR zu #355). Konten liegen in der gas-db (ein Konto pro KdNr, Metall als
 * Freigabe); das Portal schreibt dort nie direkt (Entscheidung 16.10.2026).
 *
 * fetcher: shopFetch aus routes/api/finance/shopClient.js (per Parameter, damit testbar).
 */

const { sucheVorgaenge } = require('./metallAuftraege');

class ShopError extends Error {
  constructor(message, status) {
    super(message);
    this.name = 'ShopError';
    this.status = status;
  }
}

async function rufe(fetcher, pfad, { method = 'GET', body } = {}) {
  let res;
  try {
    res = await fetcher(pfad, body === undefined ? { method } : { method, body: JSON.stringify(body) });
  } catch (err) {
    throw new ShopError(`Gas-Shop nicht erreichbar: ${err.message}`, 503);
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    // 400/404/409 sind Sachfehler (z. B. „PLZ fehlt“) und gehen so an die Oberflaeche
    throw new ShopError(data.error || `Gas-Shop antwortet mit ${res.status}`, [400, 404, 409].includes(res.status) ? res.status : 502);
  }
  return data;
}

const enc = encodeURIComponent;

/** Konten zu Lexware-IDs als Map lexware_id → Konto */
async function ladeKonten(fetcher, lexwareIds) {
  const ids = [...new Set(lexwareIds.filter(Boolean))];
  if (!ids.length) return new Map();
  const liste = await rufe(fetcher, `/admin/metall/konten?ids=${ids.map(enc).join(',')}`);
  return new Map(liste.map(k => [k.lexware_id, k]));
}

const legeAn = (f, lexwareId) => rufe(f, '/admin/metall/konten', { method: 'POST', body: { lexware_id: lexwareId } });
const sperre = (f, lexwareId) => rufe(f, `/admin/metall/konten/${enc(lexwareId)}/sperren`, { method: 'POST', body: {} });
const entsperre = (f, lexwareId) => rufe(f, `/admin/metall/konten/${enc(lexwareId)}/entsperren`, { method: 'POST', body: {} });
const sendeReset = (f, lexwareId) => rufe(f, `/admin/metall/konten/${enc(lexwareId)}/reset-mail`, { method: 'POST', body: {} });
const briefDaten = (f, lexwareId) => rufe(f, `/admin/metall/konten/${enc(lexwareId)}/brief`);

/**
 * Uebersicht: Metallkunden mit Konto, laufenden Vorgaengen und offenen Belegen.
 * Hinweis: zaehlt hoechstens die juengsten Treffer von sucheVorgaenge (TREFFER_MAX).
 * Ist der Gas-Shop nicht erreichbar, kommt die Liste trotzdem (konto = null, konto_fehler gesetzt).
 */
async function ladeUebersicht({ pool, fetcher }) {
  const [kunden] = await pool.query(
    `SELECT k.*,
       (SELECT COUNT(*) FROM metall_beleg b WHERE b.lexware_kontakt_id = k.lexware_kontakt_id AND b.zuordnung = 'offen') AS belege_offen
     FROM metall_kunde k WHERE k.aktiv = 1 ORDER BY k.name`
  );
  // Laufend wie in „Alle Auftraege“ (Status aus den Belegen, #367)
  const { treffer } = await sucheVorgaenge(pool, { status: 'laufend' });
  const laufend = new Map();
  for (const v of treffer) laufend.set(v.kunde_id, (laufend.get(v.kunde_id) || 0) + 1);
  let konten = new Map();
  let kontoFehler = null;
  try {
    konten = await ladeKonten(fetcher, kunden.map(k => k.lexware_kontakt_id));
  } catch (err) {
    kontoFehler = err.message;
  }
  return {
    kunden: kunden.map(k => ({
      ...k,
      vorgaenge_laufend: laufend.get(k.id) || 0,
      belege_offen: Number(k.belege_offen),
      konto: kontoFehler ? null : (konten.get(k.lexware_kontakt_id) || { status: 'keiner', gas: false }),
    })),
    konto_fehler: kontoFehler,
  };
}

module.exports = { ShopError, ladeKonten, legeAn, sperre, entsperre, sendeReset, briefDaten, ladeUebersicht };
