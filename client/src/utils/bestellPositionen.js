// Positionen einer Bestellung aus dem Portal vor dem Speichern bereinigen.
// 0 Vollgut ist erlaubt: reine Leergut-Abholung oder ein Gas wird gegen ein anderes getauscht.
// Eine Position mit Artikel braucht Vollgut oder Leergut; leere Zeilen ohne Artikel fallen weg.
const menge = (v) => Math.max(0, parseInt(v, 10) || 0);

export function bereinigePositionen(items) {
  const mitArtikel = (items || [])
    .filter((it) => it.articleNumber || it.product_id || it.productId)
    .map((it) => ({ ...it, quantity: menge(it.quantity), emptyReturn: menge(it.emptyReturn) }));
  if (!mitArtikel.length) return { fehler: 'Bitte mindestens einen Artikel eintragen' };
  if (mitArtikel.some((it) => it.quantity + it.emptyReturn === 0)) {
    return { fehler: 'Bitte bei jedem Artikel Vollgut oder Leergut eintragen (0 Vollgut geht, z. B. nur Leergut abholen)' };
  }
  return { items: mitArtikel };
}

// Kurztext einer Position für Listen: "2x · 2 Leergut" bzw. "nur 3 Leergut"
export function positionMengeText(it) {
  const voll = Number(it.quantity) || 0;
  const leer = Number(it.emptyReturn) || 0;
  if (voll === 0) return `nur ${leer} Leergut`;
  return `${voll}x` + (leer > 0 ? ` · ${leer} Leergut` : '');
}
