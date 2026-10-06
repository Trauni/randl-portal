/**
 * Zentrales Berechtigungsmodell (Frontend).
 * Inhaltlich identisch zu src/utils/permissions.js — dort nur CommonJS-Export.
 * Aenderungen IMMER in beiden Dateien.
 */

export const ALL_AREAS = ['metallarbeiten.lieferantenauftrag', 
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
];

export const ROLE_AREAS = {
  mitarbeiter: ['dashboard', 'profil', 'urlaub.eigen', 'zeit.eigen', 'notizen'],
  freelancer:  ['dashboard', 'profil', 'urlaub.eigen', 'zeit.eigen', 'notizen'],
  extern:      [],
};

export const ACCESS_TAGS = {
  geschaeftsfuehrung: { label: 'Geschäftsführung', allow: ALL_AREAS },
  backoffice:         { label: 'Backoffice',       allow: ['metallarbeiten.lieferantenauftrag', 'gashandel', 'gashandel.preise', 'it', 'content', 'hr.zeitauswertung'] },
  gashandel:          { label: 'Gashandel',        allow: ['gashandel'] },
  metallarbeiten:     { label: 'Metallarbeiten',   allow: ['metallarbeiten.lieferantenauftrag', ] },
  zeltverleih:        { label: 'Zeltverleih',      allow: ['zeltplanung'] },   // neu 14.08.2026 — Zeltplaner
};

export const TAG_GROUPS = {
  'Geschäftsführung': 'geschaeftsfuehrung',
  'Backoffice':       'backoffice',
  'Verwaltung':       'backoffice',
  'Gashandel':        'gashandel',
  'Metallarbeiten':   'metallarbeiten',
  'Zeltverleih':      'zeltverleih',
};

export function roleFromGroups(groups) {
  const g = groups || [];
  if (g.includes('Extern')) return 'extern';
  if (g.includes('Freelancer')) return 'freelancer';
  return 'mitarbeiter';
}

export function tagsFromGroups(groups) {
  const tags = new Set();
  for (const g of groups || []) {
    if (TAG_GROUPS[g]) tags.add(TAG_GROUPS[g]);
  }
  return Array.from(tags);
}

export function effectiveAreas(role, accessTags) {
  const areas = new Set(ROLE_AREAS[role] || []);
  for (const tag of accessTags || []) {
    const allow = ACCESS_TAGS[tag] ? ACCESS_TAGS[tag].allow : [];
    allow.forEach((a) => areas.add(a));
  }
  return areas;
}

export function hasArea(role, accessTags, area) {
  return effectiveAreas(role, accessTags).has(area);
}
