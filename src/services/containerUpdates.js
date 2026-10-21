'use strict';
/**
 * Container-Updates (#396): pruefen, ob es fuer die laufenden Images etwas Neues gibt,
 * und Updates auf Knopfdruck einspielen. Watchtower aktualisiert weiter nur Container
 * ohne Label `com.centurylinklabs.watchtower.enable=false` (Regeln: BookStack Seite 18).
 *
 * Zwei Arten von "neu":
 *   - gleicher Tag, neues Image (z. B. bookstack:latest, postgres:16-alpine) -> per Knopf einspielbar
 *   - neuere Version als Tag (z. B. Authentik 2025.2.4 -> 2025.10.1)        -> nur Hinweis,
 *     dafuer muss der Tag in compose/.env geaendert werden (bewusst kein Knopf)
 */
const { execFile } = require('child_process');

const run = (cmd, args, timeout = 20000) => new Promise((resolve, reject) =>
  execFile(cmd, args, { timeout, maxBuffer: 8 * 1024 * 1024 }, (err, stdout, stderr) =>
    err ? reject(new Error((stderr || err.message).trim())) : resolve(stdout.trim())));

const WT_LABEL = 'com.centurylinklabs.watchtower.enable';

// Kein Knopf: Werk-2-Shopware (Produktion, nur nach Absprache) und Authentik-Outposts
// (verwaltet Authentik selbst, Objekt/Token nie anfassen)
const GESCHUETZT = [
  { re: /^sw_/, grund: 'Werk 2 (Shopware) – nur nach Absprache' },
  { re: /^ak-outpost-/, grund: 'Authentik-Outpost – wird von Authentik verwaltet' },
];

const MANIFEST_ACCEPT = [
  'application/vnd.oci.image.index.v1+json',
  'application/vnd.docker.distribution.manifest.list.v2+json',
  'application/vnd.docker.distribution.manifest.v2+json',
  'application/vnd.oci.image.manifest.v1+json',
].join(', ');

// ── Image-Referenz ────────────────────────────────────────────────────────────

/** "ghcr.io/goauthentik/server:2025.2.4" -> { registry, repo, tag } (Docker Hub wie docker selbst) */
function parseImageRef(ref) {
  let rest = String(ref || '').trim();
  if (!rest || /^sha256:/.test(rest)) return null;
  rest = rest.split('@')[0];
  let tag = 'latest';
  const slash = rest.lastIndexOf('/');
  const colon = rest.lastIndexOf(':');
  if (colon > slash) { tag = rest.slice(colon + 1); rest = rest.slice(0, colon); }
  const parts = rest.split('/');
  let registry = 'docker.io';
  if (parts.length > 1 && (/[.:]/.test(parts[0]) || parts[0] === 'localhost')) registry = parts.shift();
  let repo = parts.join('/');
  if (registry === 'docker.io' && !repo.includes('/')) repo = 'library/' + repo;
  return { registry, repo, tag };
}

function registryHost(registry) {
  return registry === 'docker.io' ? 'registry-1.docker.io' : registry;
}

// ── Versionen vergleichen ─────────────────────────────────────────────────────

/** "v1.25.3-alpine" -> { prefix:'v', nums:[1,25,3], suffix:'-alpine' }; nur Tags mit mind. zwei Zahlen */
function parseVersionTag(tag) {
  const m = String(tag).match(/^(v?)(\d+(?:\.\d+)+)(.*)$/);
  if (!m) return null;
  return { prefix: m[1], nums: m[2].split('.').map(Number), suffix: m[3] };
}

function cmpNums(a, b) {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const d = (a[i] || 0) - (b[i] || 0);
    if (d) return d;
  }
  return 0;
}

/**
 * Hoechster Tag gleicher Bauart (Praefix, Stellenzahl, Suffix), der neuer ist als `current` – sonst null.
 * Gleiche Hauptversion, ausser bei Jahres-Versionen (Authentik 2025.x -> 2026.x): Ein Major-Sprung
 * (mysql 8.4 -> 9.x, Elasticsearch 8 -> 9) ist ein eigenes Projekt und kein Update-Hinweis.
 */
function newerTag(current, tags) {
  const cur = parseVersionTag(current);
  if (!cur) return null;
  const jahr = cur.nums[0] >= 2000;
  let best = null;
  for (const t of tags) {
    const v = parseVersionTag(t);
    if (!v || v.prefix !== cur.prefix || v.suffix !== cur.suffix || v.nums.length !== cur.nums.length) continue;
    if (!jahr && v.nums[0] !== cur.nums[0]) continue;
    if (cmpNums(v.nums, cur.nums) > 0 && (!best || cmpNums(v.nums, best.nums) > 0)) best = { tag: t, nums: v.nums };
  }
  return best ? best.tag : null;
}

// ── Registry (anonym, Token per WWW-Authenticate) ─────────────────────────────

function parseAuthHeader(h) {
  const m = String(h || '').match(/^Bearer\s+(.*)$/i);
  if (!m) return null;
  const out = {};
  for (const [, k, v] of m[1].matchAll(/(\w+)="([^"]*)"/g)) out[k] = v;
  return out.realm ? out : null;
}

const tokens = new Map();

async function registryFetch(registry, repo, path, opts = {}) {
  const url = `https://${registryHost(registry)}/v2/${repo}${path}`;
  const key = registry + '|' + repo;
  const doFetch = () => fetch(url, {
    ...opts,
    headers: { ...(opts.headers || {}), ...(tokens.get(key) ? { Authorization: 'Bearer ' + tokens.get(key) } : {}) },
    signal: AbortSignal.timeout(15000),
  });
  let res = await doFetch();
  if (res.status === 401) {
    const auth = parseAuthHeader(res.headers.get('www-authenticate'));
    if (!auth) return res;
    const q = new URLSearchParams({ service: auth.service || '', scope: auth.scope || `repository:${repo}:pull` });
    const t = await fetch(`${auth.realm}?${q}`, { signal: AbortSignal.timeout(15000) }).then(r => r.json()).catch(() => ({}));
    if (!t.token && !t.access_token) return res;
    tokens.set(key, t.token || t.access_token);
    res = await doFetch();
  }
  return res;
}

async function remoteDigest(img) {
  const opts = { headers: { Accept: MANIFEST_ACCEPT } };
  let res = await registryFetch(img.registry, img.repo, `/manifests/${img.tag}`, { ...opts, method: 'HEAD' });
  let d = res.ok && res.headers.get('docker-content-digest');
  if (!d && res.ok) {
    res = await registryFetch(img.registry, img.repo, `/manifests/${img.tag}`, opts);
    d = res.headers.get('docker-content-digest');
  }
  if (!res.ok) throw new Error(`Registry ${res.status}`);
  return d || null;
}

async function listTags(img, maxPages = 30) {
  const tags = [];
  let path = '/tags/list?n=1000';
  for (let i = 0; i < maxPages && path; i++) {
    const res = await registryFetch(img.registry, img.repo, path);
    if (!res.ok) throw new Error(`Registry ${res.status}`);
    const data = await res.json();
    tags.push(...(data.tags || []));
    const next = (res.headers.get('link') || '').match(/<[^>]*?(\/tags\/list[^>]*)>;\s*rel="next"/);
    path = next ? next[1] : null;
  }
  return tags;
}

// ── Docker ────────────────────────────────────────────────────────────────────

async function containerInfos() {
  const ids = (await run('docker', ['ps', '-aq'])).split('\n').filter(Boolean);
  if (!ids.length) return [];
  const list = JSON.parse(await run('docker', ['inspect', ...ids]));
  const imageIds = [...new Set(list.map(c => c.Image))];
  const images = JSON.parse(await run('docker', ['image', 'inspect', ...imageIds]).catch(() => '[]'));
  const digests = new Map(images.map(i => [i.Id, (i.RepoDigests || []).map(d => d.split('@')[1])]));
  return list.map(c => {
    const labels = c.Config.Labels || {};
    return {
      name: c.Name.replace(/^\//, ''),
      image: c.Config.Image,
      state: c.State.Status,
      localDigests: digests.get(c.Image) || [],
      watchtower: labels[WT_LABEL] === 'false' ? 'aus' : 'an',
      compose: labels['com.docker.compose.project'] ? {
        project: labels['com.docker.compose.project'],
        service: labels['com.docker.compose.service'],
        dir: labels['com.docker.compose.project.working_dir'],
        files: (labels['com.docker.compose.project.config_files'] || '').split(',').filter(Boolean),
      } : null,
    };
  });
}

function schutz(name) {
  const g = GESCHUETZT.find(x => x.re.test(name));
  return g ? g.grund : null;
}

async function pruefeContainer(c) {
  const out = { name: c.name, image: c.image, watchtower: c.watchtower, gesperrt: schutz(c.name) };
  const img = parseImageRef(c.image);
  if (!img) return { ...out, status: 'unbekannt', hinweis: 'Image ohne Namen' };
  if (!c.localDigests.length) return { ...out, status: 'lokal', hinweis: 'lokal gebaut, keine Registry' };
  try {
    const remote = await remoteDigest(img);
    const neuesImage = !!remote && !c.localDigests.includes(remote);
    let neueVersion = null;
    if (parseVersionTag(img.tag)) neueVersion = newerTag(img.tag, await listTags(img).catch(() => []));
    return {
      ...out,
      status: neuesImage ? 'update' : neueVersion ? 'version' : 'aktuell',
      neue_version: neueVersion,
      kann_aktualisieren: neuesImage && !out.gesperrt,
    };
  } catch (e) {
    return { ...out, status: 'fehler', hinweis: e.message };
  }
}

// ── Pruefung (im Hintergrund, Ergebnis im Speicher) ───────────────────────────

const PRUEF_ALTER_MS = 12 * 3600 * 1000;
const FRIST_CONTAINER_MS = 45000;      // eine haengende Abfrage darf nicht die ganze Pruefung blockieren
const FRIST_GESAMT_MS = 10 * 60000;
let stand = { geprueft_am: null, laeuft: false, gestartet: null, fortschritt: null, container: [], fehler: null };
let lauf = 0;

function mitFrist(promise, ms, was) {
  let t;
  return Promise.race([
    promise,
    new Promise((_, reject) => { t = setTimeout(() => reject(new Error(`Zeitüberschreitung (${ms / 1000} s) bei ${was}`)), ms); }),
  ]).finally(() => clearTimeout(t));
}

async function pruefen() {
  if (stand.laeuft) return;
  const meinLauf = ++lauf;
  stand = { ...stand, laeuft: true, gestartet: new Date().toISOString(), fortschritt: null, fehler: null };
  try {
    const infos = await mitFrist(containerInfos(), 60000, 'docker inspect');
    const ergebnis = [];
    stand.fortschritt = { fertig: 0, gesamt: infos.length };
    for (let i = 0; i < infos.length; i += 4) {
      ergebnis.push(...await Promise.all(infos.slice(i, i + 4).map(c =>
        mitFrist(pruefeContainer(c), FRIST_CONTAINER_MS, c.image)
          .catch(e => ({ name: c.name, image: c.image, watchtower: c.watchtower, gesperrt: schutz(c.name), status: 'fehler', hinweis: e.message }))
          .finally(() => { if (meinLauf === lauf && stand.fortschritt) stand.fortschritt.fertig++; }))));
    }
    if (meinLauf !== lauf) return;   // inzwischen als haengend verworfen
    stand = { geprueft_am: new Date().toISOString(), laeuft: false, gestartet: null, fortschritt: null, container: ergebnis, fehler: null };
    const n = ergebnis.filter(c => c.status === 'update' || c.status === 'version').length;
    const f = ergebnis.filter(c => c.status === 'fehler');
    console.log(`[Container-Updates] Pruefung fertig: ${ergebnis.length} Container, ${n} mit Update, ${f.length} nicht pruefbar`);
    for (const c of f) console.warn(`[Container-Updates] ${c.name} (${c.image}): ${c.hinweis}`);
  } catch (e) {
    if (meinLauf !== lauf) return;
    stand = { ...stand, laeuft: false, gestartet: null, fortschritt: null, fehler: e.message };
    console.error('[Container-Updates] Pruefung fehlgeschlagen:', e.message);
  }
}

/** Aktueller Stand; ist er aelter als 12 h, startet im Hintergrund eine neue Pruefung. */
function status() {
  if (stand.laeuft && Date.now() - Date.parse(stand.gestartet) > FRIST_GESAMT_MS) {
    lauf++;   // haengenden Lauf verwerfen, damit ein neuer starten kann
    stand = { ...stand, laeuft: false, gestartet: null, fortschritt: null, fehler: 'Prüfung hing länger als 10 Minuten und wurde abgebrochen' };
    console.error('[Container-Updates] Pruefung haengt, abgebrochen');
    return stand;
  }
  const alt = !stand.geprueft_am || Date.now() - Date.parse(stand.geprueft_am) > PRUEF_ALTER_MS;
  if (alt && !stand.laeuft && !stand.fehler) pruefen();
  return stand;
}

// ── Update auf Knopfdruck ─────────────────────────────────────────────────────

const jobs = new Map();

async function updateAusfuehren(job, c) {
  const log = (s) => { job.log.push(s); };
  if (c.compose && c.compose.dir && c.compose.service) {
    const base = ['compose', '--project-directory', c.compose.dir, '-p', c.compose.project,
      ...c.compose.files.flatMap(f => ['-f', f])];
    log(`docker compose pull ${c.compose.service}`);
    log(await run('docker', [...base, 'pull', c.compose.service], 10 * 60000));
    log(`docker compose up -d --no-deps ${c.compose.service}`);
    log(await run('docker', [...base, 'up', '-d', '--no-deps', c.compose.service], 5 * 60000));
  } else {
    // ohne Compose wie Watchtower selbst: einmaliger Lauf nur fuer diesen Container
    const wtImage = await run('docker', ['inspect', '-f', '{{.Config.Image}}', 'watchtower']).catch(() => 'containrrr/watchtower');
    log(`watchtower --run-once ${c.name}`);
    log(await run('docker', ['run', '--rm', '-v', '/var/run/docker.sock:/var/run/docker.sock',
      wtImage, '--run-once', '--cleanup', c.name], 10 * 60000));
  }
}

/** Startet das Update eines Containers; nur wenn die letzte Pruefung ein neues Image gefunden hat. */
async function updateStarten(name, user) {
  const geprueft = stand.container.find(c => c.name === name);
  if (!geprueft) throw Object.assign(new Error('Container nicht in der letzten Pruefung'), { status: 404 });
  if (geprueft.gesperrt) throw Object.assign(new Error(geprueft.gesperrt), { status: 403 });
  if (!geprueft.kann_aktualisieren) throw Object.assign(new Error('Kein neues Image fuer diesen Tag'), { status: 400 });
  if ([...jobs.values()].some(j => j.name === name && !j.fertig)) throw Object.assign(new Error('Update laeuft bereits'), { status: 409 });

  const c = (await containerInfos()).find(x => x.name === name);
  if (!c) throw Object.assign(new Error('Container nicht gefunden'), { status: 404 });

  const id = Date.now().toString(36);
  const job = { id, name, user, gestartet: new Date().toISOString(), fertig: false, ok: null, log: [] };
  jobs.set(id, job);
  console.log(`[Container-Updates] ${user || '?'} startet Update ${name}`);
  updateAusfuehren(job, c)
    .then(() => { job.ok = true; })
    .catch(e => { job.ok = false; job.log.push('Fehler: ' + e.message); })
    .finally(() => {
      job.fertig = true;
      console.log(`[Container-Updates] Update ${name}: ${job.ok ? 'ok' : 'fehlgeschlagen'}`);
      pruefen();
    });
  return job;
}

function updateJob(id) { return jobs.get(id) || null; }

// ── Watchtower selbst ─────────────────────────────────────────────────────────

/** Zeile aus `docker logs watchtower` -> { time, level, msg, fields } */
function parseWatchtowerLine(line) {
  const time = (line.match(/time="([^"]+)"/) || [])[1];
  const msg = (line.match(/msg="((?:[^"\\]|\\.)*)"/) || [])[1];
  if (!time || !msg) return null;
  const fields = {};
  for (const [, k, , v] of line.replace(/msg="(?:[^"\\]|\\.)*"/, '').matchAll(/\b([A-Za-z]\w*)=("?)([^"\s]*)\2/g)) fields[k] = v;
  return { time, level: fields.level || null, msg, fields };
}

function zusammenfassen(lines) {
  const ev = lines.map(parseWatchtowerLine).filter(Boolean);
  const laeufe = ev.filter(e => e.msg === 'Session done').map(e => ({
    time: e.time,
    gescannt: Number(e.fields.Scanned || 0),
    aktualisiert: Number(e.fields.Updated || 0),
    fehler: Number(e.fields.Failed || 0),
  }));
  const updates = ev.filter(e => /^Found new /.test(e.msg)).map(e => ({
    time: e.time,
    image: e.msg.replace(/^Found new /, '').replace(/ image \(.*\)$/, ''),
  }));
  const fehler = ev.filter(e => e.level === 'error').map(e => ({ time: e.time, msg: e.msg }));
  return { laeufe: laeufe.slice(-5).reverse(), updates: updates.slice(-15).reverse(), fehler: fehler.slice(-5).reverse() };
}

function envOf(list, key) {
  const hit = (list || []).find(e => e.startsWith(key + '='));
  return hit ? hit.slice(key.length + 1) : null;
}

function argOf(args, key) {
  const i = (args || []).findIndex(a => a === key || a.startsWith(key + '='));
  if (i < 0) return null;
  return args[i].includes('=') ? args[i].split('=').slice(1).join('=') : (args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : 'true');
}

async function watchtowerStatus() {
  let c;
  try { c = JSON.parse(await run('docker', ['inspect', 'watchtower']))[0]; }
  catch { return { vorhanden: false }; }
  const env = c.Config.Env, args = c.Args;
  // watchtower schreibt nach stderr, daher beide Kanaele
  const logs = await new Promise(resolve =>
    execFile('docker', ['logs', 'watchtower', '--since', '720h'], { maxBuffer: 8 * 1024 * 1024, timeout: 20000 },
      (err, stdout, stderr) => resolve(`${stdout || ''}\n${stderr || ''}`)));
  return {
    vorhanden: true,
    laeuft: c.State.Running,
    gestartet: c.State.StartedAt,
    image: c.Config.Image,
    zeitplan: envOf(env, 'WATCHTOWER_SCHEDULE') || argOf(args, '--schedule'),
    intervall_s: Number(envOf(env, 'WATCHTOWER_POLL_INTERVAL') || argOf(args, '--interval')) || null,
    nur_melden: (envOf(env, 'WATCHTOWER_MONITOR_ONLY') || argOf(args, '--monitor-only')) === 'true',
    aufraeumen: (envOf(env, 'WATCHTOWER_CLEANUP') || argOf(args, '--cleanup')) === 'true',
    ...zusammenfassen(logs.split('\n')),
  };
}

module.exports = {
  status, pruefen, updateStarten, updateJob, watchtowerStatus,
  // fuer Tests
  parseImageRef, parseVersionTag, newerTag, parseAuthHeader, parseWatchtowerLine, zusammenfassen, argOf,
  remoteDigest, listTags, mitFrist,
};
