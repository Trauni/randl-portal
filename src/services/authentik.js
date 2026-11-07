/**
 * Push Portal -> Authentik.
 * Das Portal ist Quelle der Wahrheit fuer Rolle und Zugriffe.
 * Verwaltet werden ausschliesslich die 8 Modell-Gruppen; alle anderen
 * Mitgliedschaften eines Nutzers (z.B. "authentik Admins") bleiben erhalten.
 */
const API_URL = process.env.AUTHENTIK_API_URL;
const API_TOKEN = process.env.AUTHENTIK_API_TOKEN;

const ROLE_TO_GROUP = {
  mitarbeiter: 'Mitarbeiter',
  freelancer:  'Freelancer',
  extern:      'Extern',
};
const TAG_TO_GROUP = {
  geschaeftsfuehrung: 'Geschäftsführung',
  backoffice:         'Backoffice',
  gashandel:          'Gashandel',
  metallarbeiten:     'Maschinenbau',
  zeltverleih:        'Zeltverleih',
};
// Alte Gruppennamen, solange die Umbenennung in Authentik noch aussteht (#494).
// Fehlt der neue Name, wird der alte genommen; gezaehlt werden beide als verwaltet.
const GROUP_FALLBACK = {
  'Maschinenbau': 'Metallarbeiten',
};
const MANAGED = new Set([
  ...Object.values(ROLE_TO_GROUP), ...Object.values(TAG_TO_GROUP), ...Object.values(GROUP_FALLBACK),
]);

let cache = null;
let cacheAt = 0;

async function api(path, opts = {}) {
  if (!API_URL || !API_TOKEN) {
    throw new Error('AUTHENTIK_API_URL oder AUTHENTIK_API_TOKEN fehlt in der .env');
  }
  const res = await fetch(API_URL + path, {
    ...opts,
    headers: {
      Authorization: `Bearer ${API_TOKEN}`,
      'Content-Type': 'application/json',
      ...(opts.headers || {}),
    },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Authentik ${res.status} bei ${path}: ${text.slice(0, 200)}`);
  return text ? JSON.parse(text) : null;
}

async function getGroups(force) {
  if (!force && cache && Date.now() - cacheAt < 300000) return cache;
  const data = await api('/core/groups/?page_size=200');
  cache = new Map(data.results.map(g => [g.name, g.pk]));
  cacheAt = Date.now();
  return cache;
}

async function findUser({ username, email }) {
  if (username) {
    const r = await api(`/core/users/?username=${encodeURIComponent(username)}`);
    const hit = (r.results || []).find(u => u.username === username);
    if (hit) return hit;
  }
  if (email) {
    const r = await api(`/core/users/?email=${encodeURIComponent(email)}`);
    const treffer = (r.results || []).filter(u => u.email === email);
    if (treffer.length === 1) return treffer[0];
    if (treffer.length > 1) throw new Error(`E-Mail ${email} ist in Authentik mehrfach vergeben`);
  }
  return null;
}

async function syncEmployeeGroups({ username, email, role, accessTags }) {
  const groups = await getGroups();
  const ziel = [ROLE_TO_GROUP[role], ...(accessTags || []).map(t => TAG_TO_GROUP[t])]
    .filter(Boolean)
    .map(n => (!groups.has(n) && GROUP_FALLBACK[n] && groups.has(GROUP_FALLBACK[n]) ? GROUP_FALLBACK[n] : n));
  const fehlend = ziel.filter(n => !groups.has(n));
  if (fehlend.length) throw new Error('Gruppen fehlen in Authentik: ' + fehlend.join(', '));
  const user = await findUser({ username, email });
  if (!user) throw new Error(`Kein Authentik-Konto fuer ${username || email}`);
  const bisher = user.groups_obj || [];
  const fremd = bisher.filter(g => !MANAGED.has(g.name));
  const pks = Array.from(new Set([...fremd.map(g => g.pk), ...ziel.map(n => groups.get(n))]));
  await api(`/core/users/${user.pk}/`, { method: 'PATCH', body: JSON.stringify({ groups: pks }) });
  return { username: user.username, gesetzt: ziel, unberuehrt: fremd.map(g => g.name) };
}

// E-Mail aus dem Profil nach Authentik. Gesucht wird ueber Benutzername bzw.
// die bisherige Adresse - die neue kennt Authentik ja noch nicht.
async function updateUserEmail({ username, oldEmail, email }) {
  const user = await findUser({ username, email: oldEmail });
  if (!user) throw new Error(`Kein Authentik-Konto fuer ${username || oldEmail}`);
  if (user.email === email) return { username: user.username, geaendert: false };
  await api(`/core/users/${user.pk}/`, { method: 'PATCH', body: JSON.stringify({ email }) });
  return { username: user.username, geaendert: true };
}

module.exports = { syncEmployeeGroups, getGroups, updateUserEmail };
