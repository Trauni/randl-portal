/**
 * Rentman-Zeiteintrag -> Zeile für time_entries (#490, Einmal-Import).
 *
 * Übernommen werden nur leavetype 1 (Gearbeitet) und 4 (Krankheitstage).
 * Urlaub (2) kommt ohnehin aus dem Portal, Korrektur (3), Kompensation (5)
 * und Feiertag (6) werden nicht übernommen, sondern im Probelauf gemeldet.
 *
 * Zeiten werden nach Europe/Berlin umgerechnet und als naive lokale Strings
 * geliefert — wie zeit.js sie speichert ('YYYY-MM-DDTHH:MM:SS').
 *
 * Maßgeblich ist Rentmans `duration` (netto). Weicht sie von Ende − Start −
 * Pause ab (in Rentman von Hand geändert), wird die Pause so gesetzt, dass
 * netto genau der Rentman-Dauer entspricht.
 */

const TYP = { 1: 'arbeitszeit', 4: 'krankheit' };
const NAMEN = { 1: 'Gearbeitet', 2: 'Urlaub', 3: 'Korrektur', 4: 'Krankheit', 5: 'Kompensation', 6: 'Feiertag' };

const idAusPfad = (p) => {
  const n = Number(String(p || '').split('/').pop());
  return Number.isFinite(n) && n > 0 ? n : null;
};

/** ISO mit Offset -> 'YYYY-MM-DDTHH:MM:SS' in Europe/Berlin. */
function berlinLokal(iso) {
  const d = new Date(iso);
  if (Number.isNaN(+d)) throw new Error(`Ungültiger Zeitpunkt '${iso}'`);
  return d.toLocaleString('sv-SE', { timeZone: 'Europe/Berlin', hour12: false }).replace(' ', 'T');
}

/**
 * Liefert { uebernehmen: true, zeile } oder { uebernehmen: false, grund }.
 */
function mapRentmanEintrag(e) {
  const typId = idAusPfad(e.leavetype);
  const basis = { rentmanId: e.id, typId, typName: NAMEN[typId] || `Typ ${typId}`, startRoh: e.start };
  if (e.status === 'rejected') return { ...basis, uebernehmen: false, grund: 'abgelehnt/storniert' };
  if (!TYP[typId]) return { ...basis, uebernehmen: false, grund: `${basis.typName} wird nicht übernommen` };
  if (!e.start || !e.end) return { ...basis, uebernehmen: false, grund: 'Start oder Ende fehlt' };

  const start = berlinLokal(e.start);
  const ende = berlinLokal(e.end);
  const spanne = Math.round((new Date(e.end) - new Date(e.start)) / 1000);
  if (spanne <= 0) return { ...basis, uebernehmen: false, grund: 'Ende liegt nicht nach Start' };

  const dauer = Number(e.duration || 0);
  const pauseRentman = Number(e.break_duration || 0);
  const pause = dauer > 0 && dauer <= spanne ? spanne - dauer : Math.min(pauseRentman, spanne);

  return {
    ...basis,
    uebernehmen: true,
    zeile: {
      tag: start.slice(0, 10),
      start,
      ende,
      pauseSekunden: pause,
      eintragTyp: TYP[typId],
      rentmanTimeregistrationId: e.id,
      rentmanLeaverequestId: typId === 4 ? idAusPfad(e.leaverequest) : null,
      nettoSekunden: spanne - pause,
    },
  };
}

module.exports = { mapRentmanEintrag, berlinLokal };
