// Filter der Artikel-Liste (#606). Rein, damit er getestet werden kann (test/artikelFilter.test.js).
// Zeilen kommen aus GET /api/finance/artikelliste (siehe src/utils/artikelListe.js).

export const istAbweichend = (a) => a.lexware_status === 'abweichend' || a.ser_status === 'abweichend' || a.ser_status === 'Name anders' || a.shop_abweichend === true;

/**
 * kurz:     alle | fuell | flasche | abw | luecke
 * suche:    Wörter, alle müssen in Nummer, Name oder UN-Nummer vorkommen
 * typ:      '' | F | P | S | V
 * einheit:  '' | kg | L | fehlt   (Inhalt aus Lexware)
 * fehlt:     '' | Bezeichnung einer Lücke (z. B. 'UN-Nr.', 'Pfand- oder Kaufflasche') = Prüffilter "Füllung ohne …"
 * tags:     leer = alle, sonst muss der Lexware-Artikel mindestens einen haben
 * nurAktiv: blendet im Stamm inaktive Artikel aus (Artikel nur in Lexware bleiben sichtbar)
 */
export function filtereArtikel(artikel, { kurz = 'alle', suche = '', typ = '', einheit = '', fehlt = '', tags = [], nurAktiv = false } = {}) {
  const woerter = suche.trim().toLowerCase().split(/\s+/).filter(Boolean);
  return artikel.filter((a) => {
    if (nurAktiv && a.aktiv === false) return false;
    if (kurz === 'fuell' && a.typ !== 'F') return false;
    if (kurz === 'flasche' && a.typ !== 'P' && a.typ !== 'S') return false;
    if (kurz === 'abw' && !istAbweichend(a)) return false;
    if (kurz === 'luecke' && a.luecken.length === 0) return false;
    if (typ && a.typ !== typ) return false;
    if (fehlt && !a.luecken.includes(fehlt)) return false;
    if (einheit === 'fehlt' && !(a.lexware && !a.lexware.inhalt)) return false;
    if ((einheit === 'kg' || einheit === 'L') && a.lexware?.inhalt?.unit !== einheit) return false;
    if (tags.length && !(a.lexware?.tags || []).some((t) => tags.includes(t))) return false;
    if (woerter.length) {
      const heu = `${a.artikel_nr} ${a.bezeichnung} ${a.un_nr || ''}`.toLowerCase();
      if (!woerter.every((w) => heu.includes(w))) return false;
    }
    return true;
  });
}

/** Lücken, nach denen sich filtern lässt (Namen wie in src/utils/artikelListe.js luecken()). */
export const LUECKEN = ['UN-Nr.', 'Gefahrzettel', 'Beförderungskategorie', 'Gewicht', 'Pfand- oder Kaufflasche'];
