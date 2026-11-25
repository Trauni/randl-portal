/**
 * Zuladungen einer Tour fürs Büro (#639): liest die gebuchten Ereignisse tour.zugeladen (#616) und bereitet sie auf.
 * Reine Anzeige aus dem Original der App, ohne Rechnung gegen Ladeliste oder Bestand.
 */

const menge = (v) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : 0);
const zeitpunkt = (v) => {
  const d = v == null ? null : new Date(v);
  return d && !Number.isNaN(d.getTime()) ? d.toISOString() : null;
};

function nutzdaten(payload) {
  if (payload && typeof payload === 'object') return payload;
  try { return JSON.parse(payload) || {}; } catch { return {}; }
}

/**
 * @param {object[]} zeilen  Zeilen aus fahrer_ereignis: { uuid, geraet_zeit, geraet_kennung, markierung, payload }
 * @returns {{ zuladungen: object[], summe: object[], zugeladenGesamt: number, leergutAbGesamt: number }}
 */
function zuladungenAnsicht(zeilen) {
  const summe = new Map();
  const zuladungen = zeilen.map((z) => {
    const e = nutzdaten(z.payload);
    const positionen = (Array.isArray(e.positionen) ? e.positionen : []).map((p) => ({
      artikelNr: p?.artikelId == null ? null : String(p.artikelId),
      bezeichnung: typeof p?.bezeichnung === 'string' && p.bezeichnung.trim() ? p.bezeichnung.trim() : null,
      zugeladen: menge(p?.zugeladen),
      leergutAb: menge(p?.leergutAb),
    }));
    for (const p of positionen) {
      const schluessel = p.artikelNr ?? `ohne:${p.bezeichnung}`;
      const s = summe.get(schluessel) || { artikelNr: p.artikelNr, bezeichnung: p.bezeichnung, zugeladen: 0, leergutAb: 0 };
      s.zugeladen += p.zugeladen;
      s.leergutAb += p.leergutAb;
      summe.set(schluessel, s);
    }
    return {
      id: z.uuid,
      zeit: zeitpunkt(e.zugeladen_am) || zeitpunkt(z.geraet_zeit),
      geraet: z.geraet_kennung || null,
      markierung: z.markierung || null,
      adrPunkte: typeof e.adr_punkte === 'number' && Number.isFinite(e.adr_punkte) ? e.adr_punkte : null,
      positionen,
    };
  });
  const liste = [...summe.values()];
  return {
    zuladungen,
    summe: liste,
    zugeladenGesamt: liste.reduce((n, s) => n + s.zugeladen, 0),
    leergutAbGesamt: liste.reduce((n, s) => n + s.leergutAb, 0),
  };
}

module.exports = { zuladungenAnsicht };
