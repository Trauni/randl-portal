/**
 * Import der Komplettstatistik (Versorger-Portal, PDF je Terminal) -> gas_beleg_position.
 * Idempotent: UNIQUE (beleg_nr, pos), erneuter Import überschreibt dieselben Zeilen.
 * Gas-Auswertung (#460)
 */
const { leseZeilen, zahl, datum } = require('./gasPdf');

const ARTIKEL = /^(\d{7}|T\d{3})$/;
const BELEG = /^\d{10}$/;
const DATUM = /^\d\d\.\d\d\.\d{4}$/;
const ZAHL = /^-?[\d.]+,\d$/;
const GANZ = /^-?\d+$/;

const positionAus = (kopf, [artikel, voll, leer, kg]) => ({
  ...kopf,
  artikel_nr: artikel,
  voll: parseInt(voll, 10),
  leer: parseInt(leer, 10),
  kg: zahl(kg),
});

const istPosition = (t) => t.length === 4 && ARTIKEL.test(t[0]) && GANZ.test(t[1]) && GANZ.test(t[2]) && ZAHL.test(t[3]);

/** Kopfzeile: # | Kunde | Typ (1–2 Teile) | Beleg | Datum | Artikel | voll | leer | kg */
function leseKopf(t) {
  if (!(GANZ.test(t[0]) && GANZ.test(t[1]))) return null;
  const i = t.findIndex((s, idx) => idx >= 3 && BELEG.test(s));
  if (i < 0 || !DATUM.test(t[i + 1] || '')) return null;
  const rest = t.slice(i + 2);
  if (!istPosition(rest)) return null;
  return {
    kopf: { kunde_nr: t[1], typ: t.slice(2, i).join(' '), beleg_nr: t[i], datum: datum(t[i + 1]) },
    position: rest,
  };
}

async function parseKomplettstatistik(buffer) {
  const zeilen = await leseZeilen(buffer);
  const terminalZeile = zeilen.find((z) => z[0] === 'Lieferstelle:');
  const terminal = terminalZeile && (terminalZeile[1].match(/#(\d+)/) || [])[1];
  if (!terminal) throw new Error('Keine Lieferstelle im PDF gefunden (keine Komplettstatistik?)');

  const positionen = [];
  const posJeBeleg = new Map();
  let aktuell = null;
  const add = (kopf, p) => {
    const n = (posJeBeleg.get(kopf.beleg_nr) || 0) + 1;
    posJeBeleg.set(kopf.beleg_nr, n);
    positionen.push({ terminal, ...positionAus(kopf, p), pos: n });
  };
  for (const t of zeilen) {
    const k = leseKopf(t);
    if (k) { aktuell = k.kopf; add(aktuell, k.position); continue; }
    if (aktuell && istPosition(t)) add(aktuell, t);
  }
  return { terminal, positionen };
}

async function speicherePositionen(db, positionen, quelle) {
  const SPALTEN = 11;
  for (let i = 0; i < positionen.length; i += 500) {
    const teil = positionen.slice(i, i + 500);
    const werte = teil.flatMap((p) => [p.terminal, p.kunde_nr, p.typ, p.beleg_nr, p.pos, p.datum, p.artikel_nr, p.voll, p.leer, p.kg, quelle]);
    await db.query(
      `INSERT INTO gas_beleg_position (terminal, kunde_nr, typ, beleg_nr, pos, datum, artikel_nr, voll, leer, kg, quelle)
       VALUES ${teil.map(() => `(${Array(SPALTEN).fill('?').join(',')})`).join(',')}
       ON DUPLICATE KEY UPDATE terminal=VALUES(terminal), kunde_nr=VALUES(kunde_nr), typ=VALUES(typ), datum=VALUES(datum),
         artikel_nr=VALUES(artikel_nr), voll=VALUES(voll), leer=VALUES(leer), kg=VALUES(kg), quelle=VALUES(quelle)`,
      werte,
    );
  }
  return positionen.length;
}

module.exports = { parseKomplettstatistik, speicherePositionen };
