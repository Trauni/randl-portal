// ACHTUNG: 1:1-Nachbau anhand von BookStack Seite 190 (Technischer Umsetzungsplan),
// nicht gegen die echte src/utils/permissions.js bzw. client/src/utils/permissions.js
// verifiziert. Vor dem ersten Einsatz mit dem Original abgleichen -- Areas/Tags koennen
// sich seit dem Doku-Stand (08.08.2026) geaendert haben. Einzige bewusste Ergaenzung
// hier: Area "notizen" fuer das neue Notizen-Feature (Phase 3), analog zu profil/urlaub.eigen.

export const ALL_AREAS = [
  'dashboard', 'profil', 'urlaub.eigen', 'zeit.eigen', 'notizen',
  'gashandel', 'hr.urlaubskalender', 'hr.zeitauswertung', 'hr.mitarbeiter',
  'it', 'content',
]

export const ROLE_AREAS = {
  mitarbeiter: ['dashboard', 'profil', 'urlaub.eigen', 'zeit.eigen', 'notizen'],
  freelancer:  ['dashboard', 'profil', 'urlaub.eigen', 'zeit.eigen', 'notizen'],
  extern:      [],
}

export const ACCESS_TAGS = {
  geschaeftsfuehrung: { allow: ALL_AREAS },
  backoffice:         { allow: ['gashandel', 'it', 'content', 'hr.zeitauswertung'] },
  gashandel:          { allow: ['gashandel', 'gashandel.preise'] }, // #328
  metallarbeiten:     { allow: [] },
  zeltverleih:        { allow: [] },
}

export function areasFor(role, accessTags = []) {
  const base = ROLE_AREAS[role] || []
  const extra = accessTags.flatMap((tag) => ACCESS_TAGS[tag]?.allow || [])
  return new Set([...base, ...extra])
}

export function hasArea(user, area) {
  if (!user) return false
  return areasFor(user.role, user.accessTags).has(area)
}
