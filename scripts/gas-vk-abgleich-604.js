/**
 * #604: Prüft nach dem Einspielen, ob der Stamm in der Datenbank (gas_artikel + price_change_log) dieselben
 * Listenpreise und Artikel liefert wie die frühere Festtabelle (Referenz in test/fixtures). Nur lesend.
 *
 * Aufruf (im Portal-Ordner):  node scripts/gas-vk-abgleich-604.js
 * Ergebnis: "alles gleich" oder eine Liste der Abweichungen (Artikel, Tag, Datenbank, Referenz). Kein Schreibzugriff.
 */
require('dotenv').config({ override: true });
const { getPool } = require('../src/db');
const { ladeStamm } = require('../src/services/gasStamm');
const ref = require('../test/fixtures/gasStammdatenReferenz');

const TAGE = ['2026-01-05', '2026-06-01', '2026-10-05', '2026-10-06', '2026-10-07', '2026-10-12', '2026-10-13', new Date().toISOString().slice(0, 10)];

(async () => {
  const db = getPool();
  const stamm = await ladeStamm(db);
  const abw = [];
  for (const nr of Object.keys(ref.VK_AKTUELL)) {
    for (const t of TAGE) {
      const a = stamm.listenpreis(nr, t); const b = ref.listenpreis(nr, t);
      if (a == null || Math.abs(a - b) > 0.004) abw.push(`${nr} ${t}: Datenbank ${a ?? 'fehlt'}, Referenz ${b}`);
    }
  }
  for (const nr of Object.keys(ref.ARTIKEL)) {
    const a = stamm.ARTIKEL[nr];
    if (!a) abw.push(`${nr}: kein Flaschenartikel im Stamm`);
    else if (a.gasart !== ref.ARTIKEL[nr].gasart || (a.kg_fuellung ?? null) !== (ref.ARTIKEL[nr].kg_fuellung ?? null)) abw.push(`${nr}: Gasart/kg ${a.gasart}/${a.kg_fuellung}, Referenz ${ref.ARTIKEL[nr].gasart}/${ref.ARTIKEL[nr].kg_fuellung}`);
  }
  const extra = Object.keys(stamm.ARTIKEL).filter((nr) => !ref.ARTIKEL[nr]);
  console.log(abw.length ? `${abw.length} Abweichungen:\n  ${abw.join('\n  ')}` : 'Preise und Artikel: alles gleich wie die Referenz');
  if (extra.length) console.log(`Zusätzliche Flaschenartikel im Stamm (nicht in der Referenz, zählen in der Auswertung mit): ${extra.join(', ')}`);
  process.exit(abw.length ? 1 : 0);
})().catch((e) => { console.error(e.message); process.exit(2); });
