/**
 * Pauschale Tageseinträge für Mitarbeitende, die (vorübergehend) nicht stempeln.
 * Reine Rechenlogik, die Datenbank übernimmt scripts/pauschal-zeiten-534.js.
 */
const { arbeitstage } = require('./feiertage');

const pad = (n) => String(n).padStart(2, '0');

/** '08:00' + Minuten -> 'YYYY-MM-DD HH:MM:00' (nur innerhalb eines Tages). */
function zeitpunkt(tag, startMinuten, plusMinuten) {
  const m = startMinuten + plusMinuten;
  return `${tag} ${pad(Math.floor(m / 60))}:${pad(m % 60)}:00`;
}

/**
 * @param {{von:string, bis:string, start:string, nettoMinuten:number, pauseMinuten:number,
 *          belegt?:Set<string>, abwesend?:Set<string>}} p
 * belegt   = Tage, an denen schon ein Zeiteintrag existiert
 * abwesend = Tage mit genehmigtem Urlaub/Gleitzeitabbau
 * Liefert je Arbeitstag (Mo–Fr ohne bayerische Feiertage) einen Eintrag; Brutto = netto + Pause.
 */
function planeTage({ von, bis, start, nettoMinuten, pauseMinuten, belegt = new Set(), abwesend = new Set() }) {
  const m = /^(\d{2}):(\d{2})$/.exec(start || '');
  if (!m) throw new Error('Start muss HH:MM sein');
  const startMinuten = Number(m[1]) * 60 + Number(m[2]);
  if (!(nettoMinuten > 0) || pauseMinuten < 0 || startMinuten + nettoMinuten + pauseMinuten >= 24 * 60) {
    throw new Error('Netto, Pause und Start ergeben keinen gültigen Tag');
  }
  const geplant = [];
  const uebersprungen = [];
  for (const tag of arbeitstage(von, bis)) {
    if (belegt.has(tag)) { uebersprungen.push({ tag, grund: 'Eintrag vorhanden' }); continue; }
    if (abwesend.has(tag)) { uebersprungen.push({ tag, grund: 'Urlaub/Abbau' }); continue; }
    geplant.push({
      tag,
      start: zeitpunkt(tag, startMinuten, 0),
      ende: zeitpunkt(tag, startMinuten, nettoMinuten + pauseMinuten),
      pauseSekunden: pauseMinuten * 60,
    });
  }
  return { geplant, uebersprungen };
}

module.exports = { planeTage };
