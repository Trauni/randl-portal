/**
 * Zentrales Berechtigungsmodell (Backend).
 * Inhaltlich identisch zu client/src/utils/permissions.js — dort nur ESM-Export.
 *
 * Zwei Achsen:
 *   role       genau eine pro Person: mitarbeiter | freelancer | extern
 *   accessTags beliebig viele, additiv
 *
 * Rechte sind die Vereinigungsmenge. Ein Bereich ist nur gesperrt, wenn ihn
 * weder die Rollen-Basis noch ein gehaltener Tag erlaubt. Kein Ranking.
 */

const ALL_AREAS = [
  'dashboard',
  'profil',
  'urlaub.eigen',
  'zeit.eigen',
  'notizen',
  'gashandel',
  'gashandel.preise', // neu 06.10.2026 — Preis-Tool: Preise ändern + nach Lexware schreiben (#250)
  'hr.urlaubskalender',
  'hr.zeitauswertung',
  'hr.mitarbeiter',
  'it',
  'content',
  'zeltplanung',   // neu 14.08.2026 — Zeltplaner
  'metallarbeiten.lieferantenauftrag',
  'metallarbeiten.kunden', // neu 16.10.2026 — Metallkunden-Merker (#366)
  'metallarbeiten.vorgaenge', // neu 16.10.2026 — Vorgaenge, In Lexware anlegen (#365)
];

const ROLE_AREAS = {
  mitarbeiter: ['dashboard', 'profil', 'urlaub.eigen', 'zeit.eigen', 'notizen'],
  freelancer:  ['dashboard', 'profil', 'urlaub.eigen', 'zeit.eigen', 'notizen'],
  extern:      [],
};

const ACCESS_TAGS = {
  geschaeftsfuehrung: { label: 'Geschäftsführung', allow: ALL_AREAS },
  backoffice:         { label: 'Backoffice',       allow: ['gashandel', 'gashandel.preise', 'it', 'content', 'hr.zeitauswertung', 'metallarbeiten.lieferantenauftrag', 'metallarbeiten.kunden', 'metallarbeiten.vorgaenge'] },
  gashandel:          { label: 'Gashandel',        allow: ['gashandel', 'gashandel.preise'] }, // Preise ändern auch für Gruppe Gashandel (#328)
  metallarbeiten:     { label: 'Metallarbeiten',   allow: [ 'metallarbeiten.lieferantenauftrag', 'metallarbeiten.kunden', 'metallarbeiten.vorgaenge'] },
  zeltverleih:        { label: 'Zeltverleih',      allow: ['zeltplanung'] },   // neu 14.08.2026 — Zeltplaner
};

// Authentik-Gruppenname -> internes Kuerzel
const TAG_GROUPS = {
  'Geschäftsführung': 'geschaeftsfuehrung',
  'Backoffice':       'backoffice',
  'Verwaltung':       'backoffice',
  'Gashandel':        'gashandel',
  'Metallarbeiten':   'metallarbeiten',
  'Zeltverleih':      'zeltverleih',
};

function roleFromGroups(groups) {
  const g = groups || [];
  if (g.includes('Extern')) return 'extern';
  if (g.includes('Freelancer')) return 'freelancer';
  return 'mitarbeiter';
}

function tagsFromGroups(groups) {
  const tags = new Set();
  for (const g of groups || []) {
    if (TAG_GROUPS[g]) tags.add(TAG_GROUPS[g]);
  }
  return Array.from(tags);
}

function effectiveAreas(role, accessTags) {
  const areas = new Set(ROLE_AREAS[role] || []);
  for (const tag of accessTags || []) {
    const allow = ACCESS_TAGS[tag] ? ACCESS_TAGS[tag].allow : [];
    allow.forEach((a) => areas.add(a));
  }
  return areas;
}

function hasArea(role, accessTags, area) {
  return effectiveAreas(role, accessTags).has(area);
}

module.exports = {
  ALL_AREAS, ROLE_AREAS, ACCESS_TAGS, TAG_GROUPS,
  roleFromGroups, tagsFromGroups, effectiveAreas, hasArea,
};
