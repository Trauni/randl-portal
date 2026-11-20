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

// Entscheidung Trauni 20.11.2026: Das Lexware-Präfix zeigt die Sparte. RM heißt bei uns Maschinenbau (nicht Metallarbeiten).
const SPARTE_NACH_PRAEFIX = {
  RG: 'Gashandel', NRG: 'Gashandel', PFAND: 'Gashandel', GZ: 'Gashandel',
  RZ: 'Zeltverleih', RT: 'Technik und Event', RM: 'Maschinenbau',
};
const sparteVon = (praefix) => SPARTE_NACH_PRAEFIX[praefix] || '';

/**
 * Listen zum Durchgehen vor dem Abgleich (#617), alle nur lesend:
 *  - stammOhneLexware: Stammartikel, die es in Lexware nicht (mehr) gibt; "verwendet" sagt, wo sie noch vorkommen
 *    (Touren, Lieferscheine, importierte Belege). Wer nirgends vorkommt, lässt sich bedenkenlos löschen.
 *  - lexwareOhneStamm / lexwareOhneNummer: Lexware-Artikel ohne Gegenstück im Stamm bzw. ohne Artikelnummer
 *  - typJeEinheit: bei den gefundenen Artikeln, welche Einheit zu welchem Stamm-Typ gehört (Grundlage für den Mass Change)
 *  - pfand: alle Lexware-Artikel mit Präfix PFAND mit Einheit und Stamm-Typ
 * stamm: { artikel_nr, bezeichnung, typ, aktiv, preis_netto_cent, verwendet: [Text] }
 */
function listen(lexware, stamm) {
  const aktiv = (lexware || []).filter((a) => !a.archived);
  const nachNr = new Map();
  for (const a of aktiv) if (nummerVon(a)) nachNr.set(ohnePraefix(nummerVon(a)), a);
  const stammNachNr = new Map((stamm || []).map((s) => [String(s.artikel_nr), s]));

  const zeile = (a) => {
    const nr = nummerVon(a);
    const p = praefixVon(nr);
    return { nummer: nr, sparte: sparteVon(p), bezeichnung: a.title || a.name || '', einheit: einheitVon(a), lexwareTyp: a.type || '' };
  };

  const stammOhneLexware = (stamm || []).filter((s) => !nachNr.has(String(s.artikel_nr)))
    .map((s) => ({
      artikel_nr: String(s.artikel_nr), bezeichnung: s.bezeichnung || '', typ: s.typ || '', aktiv: s.aktiv == null ? '' : (Number(s.aktiv) ? 'ja' : 'nein'),
      preisNetto: s.preis_netto_cent == null ? '' : (Number(s.preis_netto_cent) / 100).toFixed(2),
      verwendet: (s.verwendet || []).join('; '),
    }))
    .sort((x, y) => x.artikel_nr.localeCompare(y.artikel_nr));

  const lexwareOhneStamm = aktiv.filter((a) => nummerVon(a) && !stammNachNr.has(ohnePraefix(nummerVon(a)))).map(zeile)
    .sort((x, y) => x.nummer.localeCompare(y.nummer));
  const lexwareOhneNummer = aktiv.filter((a) => !nummerVon(a)).map(zeile).sort((x, y) => x.bezeichnung.localeCompare(y.bezeichnung));

  const gefunden = aktiv.filter((a) => nummerVon(a) && stammNachNr.has(ohnePraefix(nummerVon(a))));
  const typJeEinheit = zaehle(gefunden, (a) => `${stammNachNr.get(ohnePraefix(nummerVon(a))).typ || '(ohne Typ)'} | ${einheitVon(a)}`);
  const pfand = aktiv.filter((a) => praefixVon(nummerVon(a)) === 'PFAND')
    .map((a) => ({ ...zeile(a), stammTyp: stammNachNr.get(ohnePraefix(nummerVon(a)))?.typ || '(nicht im Stamm)' }))
    .sort((x, y) => x.einheit.localeCompare(y.einheit) || x.nummer.localeCompare(y.nummer));

  return { stammOhneLexware, lexwareOhneStamm, lexwareOhneNummer, typJeEinheit, pfand };
}

/** CSV für Excel: Semikolon, Anführungszeichen bei Bedarf, Windows-Zeilenende, mit BOM für die Umlaute. */
function alsCsv(zeilen, spalten) {
  const feld = (v) => {
    const t = v == null ? '' : String(v);
    return /[;"\r\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
  };
  return '﻿' + [spalten.join(';'), ...zeilen.map((z) => spalten.map((s) => feld(z[s])).join(';'))].join('\r\n') + '\r\n';
}

module.exports = { analysiere, listen, alsCsv, sparteVon, praefixVon, ohnePraefix, SPARTE_NACH_PRAEFIX };
