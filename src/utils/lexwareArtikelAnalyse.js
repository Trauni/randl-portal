/**
 * #617 Schritt A2: Was steht in Lexware? Reine Auswertung der Artikelliste von Lexware gegen den Portal-Stamm,
 * ohne etwas zu schreiben. Grundlage für die Regeln des späteren Abgleichs (Präfixe, RG-/NRG-Paare, Typ aus Einheit).
 *
 * lexware: Artikel wie von GET /v1/articles { id, title, type, articleNumber, unitName, archived, … }
 * stamm:   Zeilen aus gas_artikel { artikel_nr }
 */

const PRAEFIX_RE = /^([A-Za-zÄÖÜäöü]+)-/;

const nummerVon = (a) => String(a?.articleNumber || '').trim();
const praefixVon = (nr) => (!nr ? '(ohne Nummer)' : (nr.match(PRAEFIX_RE)?.[1].toUpperCase() || '(ohne Präfix)'));
const ohnePraefix = (nr) => nr.replace(PRAEFIX_RE, '');
const einheitVon = (a) => String(a?.unitName || '').trim() || '(leer)';

function zaehle(liste, schluessel) {
  const m = new Map();
  for (const x of liste) m.set(schluessel(x), (m.get(schluessel(x)) || 0) + 1);
  return Object.fromEntries([...m].sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0]))));
}

function beispiele(liste, schluessel, wert, je = 5) {
  const m = new Map();
  for (const x of liste) {
    const k = schluessel(x);
    if (!m.has(k)) m.set(k, []);
    if (m.get(k).length < je) m.get(k).push(wert(x));
  }
  return Object.fromEntries(m);
}

function analysiere(lexware, stamm) {
  const artikel = lexware || [];
  const aktiv = artikel.filter((a) => !a.archived);
  const archiviert = artikel.length - aktiv.length;

  // Dieselbe Nummer ohne Präfix mehrfach: z. B. RG-7801100 und NRG-7801100 (wäre ein Stammartikel für zwei Lexware-Artikel)
  const gruppen = new Map();
  for (const a of aktiv) {
    const nr = nummerVon(a);
    if (!nr) continue;
    const k = ohnePraefix(nr);
    if (!gruppen.has(k)) gruppen.set(k, []);
    gruppen.get(k).push(a);
  }
  const mehrfach = [...gruppen].filter(([, l]) => l.length > 1)
    .map(([nr, l]) => ({ stammNr: nr, lexware: l.map((a) => nummerVon(a)).sort() }))
    .sort((x, y) => x.stammNr.localeCompare(y.stammNr));

  // Genau dieselbe Nummer zweimal (sollte es nicht geben, würde die Nummer als Schlüssel brechen)
  const gleicheNummer = Object.entries(zaehle(aktiv.filter((a) => nummerVon(a)), nummerVon)).filter(([, n]) => n > 1).map(([nr, n]) => ({ nummer: nr, anzahl: n }));

  const stammNrn = new Set((stamm || []).map((s) => String(s.artikel_nr)));
  const imStamm = aktiv.filter((a) => nummerVon(a) && stammNrn.has(ohnePraefix(nummerVon(a))));
  const lexwareNrn = new Set(aktiv.map((a) => ohnePraefix(nummerVon(a))).filter(Boolean));
  const nurImStamm = [...stammNrn].filter((nr) => !lexwareNrn.has(nr)).sort();

  return {
    gesamt: artikel.length,
    aktiv: aktiv.length,
    archiviert,
    nachTyp: zaehle(aktiv, (a) => a.type || '(leer)'),
    nachPraefix: zaehle(aktiv, (a) => praefixVon(nummerVon(a))),
    nachEinheit: zaehle(aktiv, einheitVon),
    einheitJePraefix: Object.fromEntries(Object.entries(zaehle(aktiv, (a) => `${praefixVon(nummerVon(a))} | ${einheitVon(a)}`))),
    beispielJePraefix: beispiele(aktiv, (a) => praefixVon(nummerVon(a)), (a) => `${nummerVon(a) || '(ohne Nummer)'} – ${a.title || a.name || ''}`.trim()),
    ohneNummer: aktiv.filter((a) => !nummerVon(a)).length,
    gleicheNummer,
    mehrfachOhnePraefix: mehrfach,
    stamm: {
      artikel: stammNrn.size,
      mitLexwareArtikel: new Set(imStamm.map((a) => ohnePraefix(nummerVon(a)))).size,
      nurImStamm,
      lexwareOhneStamm: aktiv.length - imStamm.length,
    },
  };
}

module.exports = { analysiere, praefixVon, ohnePraefix };
