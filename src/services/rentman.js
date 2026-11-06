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
// Namen kommen live aus /statuses (Rentman fuehrt eigene Status ab 1001 ein,
// Stand 11/2026: 1001 In Bearbeitung, 1002 Ausfuehrung abgeschlossen,
// 1003 Abgerundet). Die Liste hier ist nur der Rueckfall, falls der Abruf scheitert.
const STATUS_NAMEN = {
  1: 'Option', 2: 'Annulliert', 3: 'Bestätigt', 4: 'Gepackt',
  5: 'Am Veranstaltungsort', 6: 'Retour', 7: 'Anfrage', 8: 'Konzept',
  1001: 'In Bearbeitung', 1002: 'Ausführung abgeschlossen', 1003: 'Abgerundet',
};
// Belegung: fest = Material ist verplant, vorlaeufig = noch nicht zugesagt.
// Annulliert (2) belegt nichts. Unbekannte neue Status zaehlen als vorlaeufig,
// damit sie sichtbar bleiben, aber nicht als sichere Belegung gelten.
const FESTE_STATUS = [3, 4, 5, 6, 1001, 1002, 1003];
const VORLAEUFIGE_STATUS = [1, 7, 8];
const ANNULLIERT = 2;
// Fuer Dashboard und Kalender: nur feste Belegungen.
const AKTIVE_STATUS = FESTE_STATUS;

function belegungVon(statusId) {
  if (statusId === ANNULLIERT) return 'annulliert';
  if (FESTE_STATUS.includes(statusId)) return 'fest';
  return 'vorlaeufig';
}

let projektCache = null;
let projektCacheAt = 0;

const zahlAusPfad = (p) => {
  if (p === null || p === undefined || p === '') return null;   // sonst Number('') = 0
  const n = Number(String(p).split('/').pop());
  return Number.isFinite(n) ? n : null;
};

// Stammdaten aendern sich selten: eine Stunde cachen.
const stammCache = new Map();
async function stammdaten(pfad) {
  const c = stammCache.get(pfad);
  if (c && Date.now() - c.at < 3600000) return c.map;
  const d = await api(pfad, { limit: 300 });
  const map = new Map((d.data || []).map((x) => [x.id, x.name || x.displayname || '']));
  stammCache.set(pfad, { at: Date.now(), map });
  return map;
}

async function statusNamen() {
  try { return await stammdaten('/statuses'); } catch (e) {
    console.warn('[rentman] /statuses nicht abrufbar, nutze Rueckfall:', e.message);
    return new Map(Object.entries(STATUS_NAMEN).map(([k, v]) => [Number(k), v]));
  }
}

async function projekteLaden(force) {
  if (!force && projektCache && Date.now() - projektCacheAt < 300000) return projektCache;
  const [d, namen, typen] = await Promise.all([
    api('/subprojects', { limit: 500, expand: 'project' }),
    statusNamen(),
    stammdaten('/projecttypes').catch(() => new Map()),
  ]);
  projektCache = (d.data || []).map((s) => {
    const pr = (s.project && typeof s.project === 'object') ? s.project : {};
    const statusId = zahlAusPfad(s.status);
    const projektId = pr.id || zahlAusPfad(s.project);
    const typId = zahlAusPfad(pr.project_type);
    const belegung = belegungVon(statusId);
    return {
      id: s.id,
      projektId,
      link: (APP_URL && projektId) ? APP_URL + '/#/projects/' + projektId + '/details' : null,
      name: s.name || s.displayname || '',
      projektName: pr.name || pr.displayname || '',
      nummer: pr.number || null,
      ort: pr.location || null,
      kundeId: zahlAusPfad(pr.customer),
      farbe: pr.color ? '#' + pr.color : null,
      typId,
      typ: typen.get(typId) || null,
      von: s.usageperiod_start || null,
      bis: s.usageperiod_end || null,
      planVon: s.planperiod_start || null,
      planBis: s.planperiod_end || null,
      statusId,
      status: namen.get(statusId) || STATUS_NAMEN[statusId] || null,
      belegung,
      aktiv: belegung === 'fest',
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

/** Genehmigte Abwesenheiten in einem Zeitraum. Typ 2 Urlaub, 4 Krankheit, 5 Kompensation (Gleitzeitabbau, #490), 6 Feiertag. */
const ABWESENHEIT_TYPEN = [2, 4, 5, 6];

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

// ── Zeltprojekte und Material (#461) ─────────────────────────────────────────
// Zeltprojekt = Projekttyp ZELTBAU, VERLEIH MIT ABHOLUNG oder VERLEIH MIT
// LIEFERUNG (Stand 11/2026: 126 von 130 Projekten). SONSTIGES u. a. bleiben
// ueber den Typfilter abrufbar.
const ZELT_TYPEN = [104, 107, 113];

async function alleSeiten(pfad, params = {}) {
  const alle = [];
  for (let offset = 0; offset < 30000; offset += 300) {
    const d = await api(pfad, { ...params, limit: 300, offset });
    const seite = d.data || [];
    alle.push(...seite);
    if (seite.length < 300) break;
  }
  return alle;
}

// Materialzeilen haben kein project-Feld, nur equipment_group. Die Gruppe kennt
// Projekt und Subprojekt. Rund 1600 Zeilen: komplett holen, 10 Min. cachen.
let materialCache = null;
let materialCacheAt = 0;

async function materialLaden(force) {
  if (!force && materialCache && Date.now() - materialCacheAt < 600000) return materialCache;
  const [zeilen, gruppen, equipment, ordner] = await Promise.all([
    alleSeiten('/projectequipment'),
    alleSeiten('/projectequipmentgroup'),
    alleSeiten('/equipment'),
    stammdaten('/folders').catch(() => new Map()),
  ]);
  const gruppeMap = new Map(gruppen.map((g) => [g.id, g]));
  const equipMap = new Map(equipment.map((e) => [e.id, e]));
  const proSubprojekt = new Map();
  for (const z of zeilen) {
    const g = gruppeMap.get(zahlAusPfad(z.equipment_group));
    if (!g) continue;
    const subId = zahlAusPfad(g.subproject);
    const e = equipMap.get(zahlAusPfad(z.equipment)) || {};
    const zeile = {
      id: z.id,
      equipmentId: zahlAusPfad(z.equipment),
      name: z.name || z.displayname || e.name || '',
      code: e.code || null,
      ordner: ordner.get(zahlAusPfad(e.folder)) || null,
      art: e.type || null,              // item | set | case
      parentId: zahlAusPfad(z.parent),  // Bestandteil eines Sets
      anzahl: z.quantity_total ?? z.quantity ?? 0,
      option: !!z.is_option,
      gruppe: g.name || g.displayname || '',
      gruppeOrder: g.order ?? 0,
      order: z.order ?? 0,
      planVon: z.planperiod_start || null,
      planBis: z.planperiod_end || null,
    };
    if (!proSubprojekt.has(subId)) proSubprojekt.set(subId, []);
    proSubprojekt.get(subId).push(zeile);
  }
  for (const liste of proSubprojekt.values()) {
    liste.sort((a, b) => (a.gruppeOrder - b.gruppeOrder) || a.gruppe.localeCompare(b.gruppe) || (a.order - b.order));
  }
  materialCache = proSubprojekt;
  materialCacheAt = Date.now();
  return materialCache;
}

/**
 * Zeltprojekte, deren Planzeitraum (inkl. Auf-/Abbau) [von, bis] ueberschneidet.
 * von/bis als YYYY-MM-DD, beide optional. Annullierte nur auf Wunsch.
 */
async function zeltProjekte({ von, bis, typen = ZELT_TYPEN, mitAnnulliert = false } = {}) {
  const [alle, material] = await Promise.all([projekteLaden(), materialLaden()]);
  const bisEnde = bis ? bis + 'T23:59:59' : null;
  return alle
    .filter((p) => typen.includes(p.typId))
    .filter((p) => mitAnnulliert || p.belegung !== 'annulliert')
    .filter((p) => {
      const a = p.planVon || p.von;
      const b = p.planBis || p.bis;
      if (!a || !b) return false;
      if (von && b < von) return false;
      if (bisEnde && a > bisEnde) return false;
      return true;
    })
    .map((p) => ({ ...p, materialAnzahl: (material.get(p.id) || []).length }))
    .sort((a, b) => (a.planVon || a.von || '').localeCompare(b.planVon || b.von || ''));
}

async function projektMaterial(subprojektId) {
  const material = await materialLaden();
  return material.get(Number(subprojektId)) || [];
}

async function projektTypen() {
  const typen = await stammdaten('/projecttypes');
  return [...typen.entries()].map(([id, name]) => ({ id, name, zelt: ZELT_TYPEN.includes(id) }));
}

module.exports = {
  zeltProjekte, projektMaterial, projektTypen, materialLaden, ZELT_TYPEN,
  zeitreport, leaveTypes, SUMMEN_TYPEN,
  projekteLaden, projekteImMonat, naechsteProjekte, abwesenheiten,
  STATUS_NAMEN, AKTIVE_STATUS, FESTE_STATUS, VORLAEUFIGE_STATUS,
  belegungVon, stammdaten, zahlAusPfad, api,
};
