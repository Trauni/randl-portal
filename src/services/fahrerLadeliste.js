/**
 * Ladeliste einer Tour (#607): Flaschen, Menge und Punkte nach ADR 1.1.3.6, erwartetes Leergut. Reine Funktionen ohne DB.
 *
 * Punkte je Position = Flaschen × Füllmenge (kg oder l je Gebinde, aus dem Artikelstamm) × Faktor der Beförderungskategorie
 * (Kategorie 1: 50, 2: 3, 3: 1). Die Grenze für die Beförderungseinheit ist 1000 Punkte.
 *
 * Annahmen, vor dem Pilot fachlich zu prüfen (siehe PR):
 *  - Es zählt die Füllmenge aus dem Stamm (bei verdichteten Gasen ist das nach ADR der Fassungsraum in Litern).
 *  - Leergut, das zurückkommt, ist in der Rechnung nicht enthalten.
 *  - Erwartetes Leergut (#614): bestellte Menge der Position (leergut), sonst Tausch 1:1 zur Vollmenge.
 *    Nur bei Füllungen mit Pfandflasche; wird eine Kaufflasche mitverkauft, kommt nichts zurück.
 *  - Positionen ohne Faktor oder Füllmenge zählen 0 Punkte und werden als "unvollständig" gemeldet; die Summe ist dann nur eine Untergrenze.
 */

const GRENZE = 1000;
const KATEGORIE_ZU_FAKTOR = { 1: 50, 2: 3, 3: 1 };
const FAKTOR_ZU_KATEGORIE = { 50: 1, 3: 2, 1: 3 };

const zahlOderNull = (v) => (v == null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));

/** Faktor und Menge eines Artikels, oder null, wenn eine Angabe fehlt. */
function adrAngaben(a) {
  if (!a) return null;
  const faktor = zahlOderNull(a.ggvs_faktor) ?? KATEGORIE_ZU_FAKTOR[zahlOderNull(a.befoerderungskategorie)] ?? null;
  const menge = zahlOderNull(a.fuellmenge);
  if (faktor == null || menge == null || menge <= 0) return null;
  return { faktor, menge, einheit: a.fuellmenge_einheit === 'l' ? 'l' : 'kg', kategorie: FAKTOR_ZU_KATEGORIE[faktor] ?? null };
}

/** Welche Artikel einer Position fehlen im Stamm oder haben keine ADR-Angaben (für den Hinweis an offenen Bestellungen). */
function adrLuecken(artikelNummern, artikel) {
  return [...new Set(artikelNummern)].filter((nr) => nr && !adrAngaben(artikel[nr]));
}

/**
 * stopps: [{ id, reihenfolge, kundeName, positionen: [{ artikelNr, soll, leergut? }] }] in Tourreihenfolge
 *   leergut: bestelltes Leergut, null/fehlt = unbekannt (dann wie soll)
 * artikel: { [artikelNr]: Zeile aus gas_artikel (inkl. Pfandartikel für die Bezeichnung) }
 */
/** Leergut kommt zurück, wenn die Füllung an einer Pfandflasche hängt und keine Kaufflasche mitverkauft wird. */
function erwartetesLeergut(p, a, menge, artikel, leergut) {
  if (!a?.pfand_artikel_nr || (a.kaufflasche_artikel_nr && menge > 0)) return;
  const bestellt = p.leergut == null || p.leergut === '' ? null : Number(p.leergut);
  const anzahl = bestellt != null && Number.isFinite(bestellt) && bestellt >= 0 ? bestellt : menge;
  if (anzahl <= 0) return;
  const pf = artikel[a.pfand_artikel_nr];
  const l = leergut.get(a.pfand_artikel_nr) || { artikelNr: a.pfand_artikel_nr, bezeichnung: pf?.bezeichnung || a.pfand_artikel_nr, anzahl: 0 };
  l.anzahl += anzahl;
  leergut.set(a.pfand_artikel_nr, l);
}

function rechneLadeliste(stopps, artikel, grenze = GRENZE) {
  const zeilen = new Map();
  const leergut = new Map();
  const unvollstaendig = new Set();
  const stoppPunkte = [];
  let flaschenGesamt = 0;

  stopps.forEach((s, i) => {
    let punkte = 0;
    for (const p of s.positionen) {
      const menge = Number(p.soll) || 0;
      const a = artikel[p.artikelNr];
      erwartetesLeergut(p, a, menge, artikel, leergut);
      if (menge <= 0) continue;
      const adr = adrAngaben(a);
      flaschenGesamt += menge;
      const z = zeilen.get(p.artikelNr) || { artikelNr: p.artikelNr, bezeichnung: a?.bezeichnung || p.artikelNr, gasart: a?.gasart || null, flaschen: 0, menge: 0, einheit: adr?.einheit ?? null, kategorie: adr?.kategorie ?? null, faktor: adr?.faktor ?? null, punkte: 0, vollstaendig: !!adr };
      z.flaschen += menge;
      if (adr) { z.menge += menge * adr.menge; z.punkte += menge * adr.menge * adr.faktor; punkte += menge * adr.menge * adr.faktor; }
      else unvollstaendig.add(p.artikelNr);
      zeilen.set(p.artikelNr, z);
    }
    stoppPunkte.push({ stoppId: s.id, nr: i + 1, kundeName: s.kundeName || null, punkte });
  });

  let kumuliert = 0;
  for (const s of stoppPunkte) { kumuliert += s.punkte; s.kumuliert = kumuliert; }
  const punkte = kumuliert;
  const ueber = punkte > grenze;
  const reisst = ueber ? stoppPunkte.find((s) => s.kumuliert > grenze) : null;

  return {
    grenze, punkte, ueber, flaschenGesamt,
    zeilen: [...zeilen.values()].sort((a, b) => b.punkte - a.punkte || a.artikelNr.localeCompare(b.artikelNr)),
    unvollstaendig: [...unvollstaendig].sort(),
    stopps: stoppPunkte,
    // Der Stopp, mit dem die Grenze überschritten wird, und was übrig bliebe, wenn man einen einzelnen Stopp aus der Tour nimmt
    reisstBei: reisst ? { nr: reisst.nr, kundeName: reisst.kundeName } : null,
    ohneStopp: ueber ? stoppPunkte.filter((s) => s.punkte > 0).map((s) => ({ nr: s.nr, kundeName: s.kundeName, punkte: punkte - s.punkte, reicht: punkte - s.punkte <= grenze })) : [],
    leergut: [...leergut.values()].sort((a, b) => a.artikelNr.localeCompare(b.artikelNr)),
    leergutGesamt: [...leergut.values()].reduce((s, l) => s + l.anzahl, 0),
  };
}

module.exports = { rechneLadeliste, adrLuecken, adrAngaben, GRENZE };
