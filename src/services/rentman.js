/**
 * Rentman-Zeiterfassung, lesend.
 * Rentman bleibt das fuehrende System; das Portal spiegelt nur.
 *
 * ACHTUNG: alle Dauern kommen in SEKUNDEN.
 * `duration` einer Buchung = (end - start) - break_duration, die Pause ist
 * also bereits abgezogen. Nicht noch einmal abziehen.
 */
const API_URL = process.env.RENTMAN_API_URL || 'https://api.rentman.net';
const TOKEN = process.env.RENTMAN_API_TOKEN;
// Weboberflaeche fuer Deeplinks, ohne Schraegstrich am Ende
const APP_URL = (process.env.RENTMAN_APP_URL || '').replace(/\/+$/, '');

// leavetypes, die in die Monatssumme einfliessen:
// 1 Gearbeitet, 2 Urlaub, 3 Korrektur, 4 Krankheitstage.
// Nicht enthalten: 5 Kompensation (von Rentman selbst ausgeschlossen),
//                  6 Feiertag (wird bei uns nicht gepflegt).
const SUMMEN_TYPEN = [1, 2, 3, 4];

async function api(pfad, params) {
  if (!TOKEN) throw new Error('RENTMAN_API_TOKEN fehlt in der .env');
  let url = API_URL + pfad;
  if (params) {
    url += '?' + Object.entries(params)
      .map(([k, v]) => k + '=' + encodeURIComponent(v).replace(/%2F/g, '/').replace(/%2B/g, '+'))
      .join('&');
  }
  const res = await fetch(url, { headers: { Authorization: 'Bearer ' + TOKEN } });
  const text = await res.text();
  if (!res.ok) throw new Error('Rentman ' + res.status + ' bei ' + pfad + ': ' + text.slice(0, 200));
  return text ? JSON.parse(text) : null;
}

let typenCache = null;
async function leaveTypes() {
  if (typenCache) return typenCache;
  const d = await api('/leavetypes', { limit: 100 });
  typenCache = new Map((d.data || []).map(t => [t.id, t.displayname || t.name]));
  return typenCache;
}

const idAusPfad = (p) => {
  const n = Number(String(p || '').split('/').pop());
  return Number.isFinite(n) ? n : null;
};

/**
 * Monatsreport fuer eine Person.
 * @param {number} rentmanId  employees.rentman_id
 * @param {number} jahr
 * @param {number} monat      1-12
 */
async function zeitreport({ rentmanId, jahr, monat }) {
  const mm = String(monat).padStart(2, '0');
  const letzter = new Date(jahr, monat, 0).getDate();
  const von = jahr + '-' + mm + '-01T00:00:00';
  const bis = jahr + '-' + mm + '-' + String(letzter).padStart(2, '0') + 'T23:59:59';

  const [res, typen] = await Promise.all([
    api('/timeregistration', {
      crewmember: '/crew/' + rentmanId,
      'start[gte]': von,
      'start[lte]': bis,
      sort: '+start',
      limit: 500,
    }),
    leaveTypes(),
  ]);

  // rejected = Zeiteintrag folgt einem stornierten/abgelehnten Urlaubsantrag,
  // taucht sonst als Waise/Duplikat in der Zeiterfassung auf (s. F42).
  const roh = (res.data || []).filter((e) => e.status !== 'rejected');
  const aktListen = await Promise.all(
    roh.map(e => api('/timeregistration/' + e.id + '/timeregistrationactivities')
      .then(r => r.data || [])
      .catch(() => []))
  );

  let summe = 0;
  let aktivitaetenSumme = 0;
  const eintraege = roh.map((e, i) => {
    const akts = aktListen[i];
    const aktSek = akts.reduce((s, a) => s + Number(a.duration || 0), 0);
    const typId = idAusPfad(e.leavetype);
    const zaehlt = SUMMEN_TYPEN.includes(typId);
    if (zaehlt) {
      summe += Number(e.duration || 0);
      aktivitaetenSumme += aktSek;
    }
    return {
      id: e.id,
      start: e.start,
      end: e.end,
      dauer: Number(e.duration || 0),
      pause: Number(e.break_duration || 0),
      aktivitaeten: aktSek,
      aktivitaetenDetails: akts.map(a => ({
        beschreibung: a.description || '',
        dauer: Number(a.duration || 0),
      })),
      typId,
      typ: typen.get(typId) || null,
      zaehlt,
      status: e.status || null,
      bemerkung: e.remark || '',
    };
  });

  return { jahr, monat, rentmanId, eintraege, summe, aktivitaetenSumme, summenTypen: SUMMEN_TYPEN };
}


// ── Projekte ─────────────────────────────────────────────────────────────────
// Status liegt am SUBPROJEKT, nicht am Projekt. Zeitraeume sind "generated
// fields" und lassen sich weder filtern noch sortieren - deshalb einmal alles
// holen und in Node verarbeiten. Bei rund 140 Datensaetzen unkritisch.
const STATUS_NAMEN = {
  1: 'Option', 2: 'Annulliert', 3: 'Bestätigt', 4: 'Gepackt',
  5: 'Am Veranstaltungsort', 6: 'Retour', 7: 'Anfrage', 8: 'Konzept',
};
const AKTIVE_STATUS = [3, 5];   // Bestaetigt, Am Veranstaltungsort

let projektCache = null;
let projektCacheAt = 0;

const zahlAusPfad = (p) => {
  const n = Number(String(p || '').split('/').pop());
  return Number.isFinite(n) ? n : null;
};

async function projekteLaden(force) {
  if (!force && projektCache && Date.now() - projektCacheAt < 300000) return projektCache;
  const d = await api('/subprojects', { limit: 500, expand: 'project' });
  projektCache = (d.data || []).map((s) => {
    const pr = (s.project && typeof s.project === 'object') ? s.project : {};
    const statusId = zahlAusPfad(s.status);
    const projektId = pr.id || zahlAusPfad(s.project);
    return {
      id: s.id,
      projektId,
      link: (APP_URL && projektId) ? APP_URL + '/#/projects/' + projektId + '/details' : null,
      name: s.name || s.displayname || '',
      nummer: pr.number || null,
      ort: pr.location || null,
      farbe: pr.color ? '#' + pr.color : null,
      von: s.usageperiod_start || null,
      bis: s.usageperiod_end || null,
      statusId,
      status: STATUS_NAMEN[statusId] || null,
      aktiv: AKTIVE_STATUS.includes(statusId),
    };
  });
  projektCacheAt = Date.now();
  return projektCache;
}

/** Projekte, deren Mietzeitraum den Monat beruehrt. Fuer den Kalender. */
async function projekteImMonat(jahr, monat) {
  const alle = await projekteLaden();
  const mm = String(monat).padStart(2, '0');
  const letzter = new Date(jahr, monat, 0).getDate();
  const von = `${jahr}-${mm}-01`;
  const bis = `${jahr}-${mm}-${String(letzter).padStart(2, '0')}T23:59:59`;
  return alle
    .filter((p) => p.aktiv && p.von && p.bis && p.von <= bis && p.bis >= von)
    .sort((a, b) => a.von.localeCompare(b.von));
}

/** Die naechsten laufenden oder kommenden Projekte. Fuer die Liste. */
async function naechsteProjekte(limit = 10) {
  const alle = await projekteLaden();
  const jetzt = new Date().toISOString().slice(0, 10);
  return alle
    .filter((p) => p.aktiv && p.bis && p.bis >= jetzt)
    .sort((a, b) => (a.von || '').localeCompare(b.von || ''))
    .slice(0, limit);
}

/** Genehmigte Abwesenheiten in einem Zeitraum. Typ 2 Urlaub, 4 Krankheit, 6 Feiertag. */
const ABWESENHEIT_TYPEN = [2, 4, 6];

async function abwesenheiten(von, bis) {
  const d = await api('/timeregistration', {
    'start[gte]': von,
    'start[lte]': bis,
    limit: 500,
  });
  const typen = await leaveTypes();
  return (d.data || [])
    .filter((e) => ABWESENHEIT_TYPEN.includes(zahlAusPfad(e.leavetype)) && e.status === 'approved')
    .map((e) => ({
      rentmanId: zahlAusPfad(e.crewmember),
      von: e.start,
      bis: e.end,
      typId: zahlAusPfad(e.leavetype),
      typ: typen.get(zahlAusPfad(e.leavetype)) || null,
    }));
}

module.exports = {
  zeitreport, leaveTypes, SUMMEN_TYPEN,
  projekteLaden, projekteImMonat, naechsteProjekte, abwesenheiten,
  STATUS_NAMEN, AKTIVE_STATUS,
};
