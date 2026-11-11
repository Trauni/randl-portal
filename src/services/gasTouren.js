/** Tourliste (CSV: datum;tourende;bezeichnung;terminal;plan_kg_brutto;plan_bestellungen) -> Touren. Gas-Auswertung (#460) */
const FAHRER = /(Luis|Louis|Axel|Male|Klaus|Domi)/i;
const iso = (d) => { const [t, m, j] = d.split('.'); return `${j}-${m}-${t}`; };

function parseTourenCsv(text) {
  const zeilen = text.replace(/^﻿/, '').split(/\r?\n/).filter((z) => z.trim());
  return zeilen.slice(1).map((z) => {
    const [datum, ende, bez, terminal, kg, best] = z.split(';');
    const m = FAHRER.exec(bez);
    const fahrer = m ? m[1].charAt(0).toUpperCase() + m[1].slice(1).toLowerCase().replace('louis', 'luis') : null;
    return {
      datum: iso(datum), terminal: terminal.trim(), bezeichnung: bez.trim(), fahrer: fahrer === 'Louis' ? 'Luis' : fahrer,
      plan_kg: parseFloat(kg) || 0, plan_bestellungen: parseInt(best, 10) || 0, storniert: ende.trim() === 'STORNO',
    };
  });
}
module.exports = { parseTourenCsv };
