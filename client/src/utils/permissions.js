/**
 * Zentrales Berechtigungsmodell (Frontend).
 * Inhaltlich identisch zu src/utils/permissions.js — dort nur CommonJS-Export.
 * Aenderungen IMMER in beiden Dateien.
 */

export const ALL_AREAS = ['metallarbeiten.kunden', 'metallarbeiten.vorgaenge', 
  'dashboard',
  'profil',
  'urlaub.eigen',
  'zeit.eigen',
  'notizen',
  'gashandel',
  'artikel.einkauf', // Einkaufspreise im Artikelstamm pflegen (aus gashandel.auswertung, #460 entfernt 25.11.2026)
  'gashandel.preise', // neu 06.10.2026 — Preis-Tool: Preise ändern + nach Lexware schreiben (#250)
  'artikel.lesen', // neu 20.11.2026 — Artikelstamm lesen, firmenweit, ohne Einkaufspreise/Rohertrag (#618)
  'artikel.bearbeiten', // neu 20.11.2026 — Artikelstamm ändern, anlegen, Lexware-Abgleich (#618)
  'hr.urlaubskalender',
  'hr.zeitauswertung',
  'hr.mitarbeiter',
  'it',
  'content',
  'zeltplanung',   // neu 14.08.2026 — Zeltplaner
  'zeltverleih.projekte', // neu 05.11.2026 — Zeltprojekte aus Rentman (#461)
  'fahrer.geraete', // neu 12.11.2026 — Geräte der Fahrer-App koppeln und sperren (#541)
];

export const ROLE_AREAS = {
  mitarbeiter: ['dashboard', 'profil', 'urlaub.eigen', 'zeit.eigen', 'notizen', 'artikel.lesen'],
  freelancer:  ['dashboard', 'profil', 'urlaub.eigen', 'zeit.eigen', 'notizen', 'artikel.lesen'],
  extern:      [],
};

export const ACCESS_TAGS = {
  geschaeftsfuehrung: { label: 'Geschäftsführung', allow: ALL_AREAS },
  backoffice:         { label: 'Backoffice',       allow: ['metallarbeiten.kunden', 'metallarbeiten.vorgaenge', 'gashandel', 'gashandel.preise', 'artikel.einkauf', 'artikel.bearbeiten', 'it', 'content', 'hr.zeitauswertung', 'hr.urlaubskalender', 'zeltverleih.projekte', 'fahrer.geraete'] }, // Urlaubskalender inkl. Genehmigen (07.11.2026)
  gashandel:          { label: 'Gashandel',        allow: ['gashandel', 'gashandel.preise', 'artikel.einkauf', 'artikel.bearbeiten', 'fahrer.geraete'] }, // Preise ändern auch für Gruppe Gashandel (#328)
  metallarbeiten:     { label: 'Maschinenbau',     allow: ['metallarbeiten.kunden', 'metallarbeiten.vorgaenge'] },
  zeltverleih:        { label: 'Zeltverleih',      allow: ['zeltplanung', 'zeltverleih.projekte'] },   // Zeltplaner, Zeltprojekte (#461)
};

export const TAG_GROUPS = {
  'Geschäftsführung': 'geschaeftsfuehrung',
  'Backoffice':       'backoffice',
  'Gashandel':        'gashandel',
  'Maschinenbau':     'metallarbeiten',
  'Metallarbeiten':   'metallarbeiten', // alter Name, entfernen nach Umbenennung in Authentik (#494)
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
