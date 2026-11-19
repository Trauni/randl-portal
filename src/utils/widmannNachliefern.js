// #603: Rechnung "nachliefern" für die Widmann-Zählung.
// nachliefern = max(0, Mindestbestand - (gezählt - reserviert))
// Reservierte Flaschen stehen zwar im Lager, sind aber schon vergeben und zählen nicht zum freien Bestand.

const ganzzahl = (wert) => {
  const n = parseInt(wert, 10);
  return Number.isFinite(n) ? n : 0;
};

/** Zählwerte kommen aus Formularen: leer, Text oder negativ wird zu 0. */
const zaehlwert = (wert) => Math.max(0, ganzzahl(wert));

const nachliefern = (mindestbestand, gezaehlt, reserviert) =>
  Math.max(0, zaehlwert(mindestbestand) - (zaehlwert(gezaehlt) - zaehlwert(reserviert)));

/** Ergänzt jede Zeile um `nachliefern` und liefert Summe sowie die Positionen, die nachgeliefert werden müssen. */
const ergebnis = (zeilen) => {
  const mitNachliefern = zeilen.map((z) => ({
    ...z,
    nachliefern: nachliefern(z.mindestbestand, z.gezaehlt, z.reserviert),
  }));
  const offen = mitNachliefern.filter((z) => z.nachliefern > 0);
  return {
    zeilen: mitNachliefern,
    summe: offen.reduce((s, z) => s + z.nachliefern, 0),
    positionen: offen.length,
  };
};

module.exports = { nachliefern, ergebnis, zaehlwert };
