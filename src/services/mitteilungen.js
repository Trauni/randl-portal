/**
 * Mitteilungen: eine zentrale Stelle für Inbox + Web-Push.
 *
 *   notify(pool, { art, area, employeeIds, titel, text, link })
 *
 * Empfänger sind entweder explizit (employeeIds) oder alle aktiven Personen, die den Bereich
 * `area` sehen dürfen. Pro Person und Art gilt die Einstellung (mitteilung_einstellung), sonst der
 * Standard aus ARTEN. Push geht nur, wenn VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY in der .env stehen;
 * ohne Schlüssel bleibt die Inbox voll funktionsfähig.
 */
const { hasArea, roleFromGroups, tagsFromGroups } = require('../utils/permissions');

// Standard je Art. pushFuerTags: Push zunächst nur für diese Tags an, alle anderen können ihn einschalten.
const ARTEN = {
  urlaub_antrag:       { label: 'Neue Urlaubsanträge',        inbox: true, push: true },
  urlaub_entscheidung: { label: 'Entscheidung zu meinem Antrag', inbox: true, push: true },
  bestellung_neu:      { label: 'Neue Bestellungen',          inbox: true, push: false, pushFuerTags: ['geschaeftsfuehrung'] },
};

const artVorhanden = (art) => Object.prototype.hasOwnProperty.call(ARTEN, art);

function standardFuer(art, tags) {
  const a = ARTEN[art];
  const push = a.pushFuerTags ? a.pushFuerTags.some((t) => (tags || []).includes(t)) : a.push;
  return { inbox: a.inbox, push };
}

// Die Spalte kommt je nach Treiber als Text oder schon als Array zurück (wie parseGroups in hr/employees.js)
function gruppenAus(wert) {
  if (Array.isArray(wert)) return wert;
  try { const g = JSON.parse(wert || '[]'); return Array.isArray(g) ? g : []; } catch { return []; }
}

/** Aktive Personen mit Zugriff auf den Bereich (Rolle + Tags aus den Authentik-Gruppen). */
async function empfaengerFuerBereich(pool, area) {
  const [rows] = await pool.execute(
    `SELECT id, authentik_groups FROM employees WHERE status = 'aktiv'`
  );
  return rows
    .map((r) => { const g = gruppenAus(r.authentik_groups); return { id: r.id, tags: tagsFromGroups(g), role: roleFromGroups(g) }; })
    .filter((p) => hasArea(p.role, p.tags, area));
}

async function empfaengerFuerIds(pool, ids) {
  if (!ids.length) return [];
  const [rows] = await pool.execute(
    `SELECT id, authentik_groups FROM employees WHERE id IN (${ids.map(() => '?').join(',')})`, ids
  );
  return rows.map((r) => { const g = gruppenAus(r.authentik_groups); return { id: r.id, tags: tagsFromGroups(g), role: roleFromGroups(g) }; });
}

async function einstellungen(pool, employeeId) {
  const [rows] = await pool.execute('SELECT art, inbox, push FROM mitteilung_einstellung WHERE employee_id = ?', [employeeId]);
  return new Map(rows.map((r) => [r.art, { inbox: !!r.inbox, push: !!r.push }]));
}

function pushKonfiguriert() {
  return !!(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
}

let webpush = null;
function webpushLaden() {
  if (webpush) return webpush;
  webpush = require('web-push');
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:portal@randl.example', process.env.VAPID_PUBLIC_KEY, process.env.VAPID_PRIVATE_KEY);
  return webpush;
}

/** Push an alle Geräte einer Person. Abgelaufene Anmeldungen (404/410) werden gelöscht. */
async function sendePush(pool, employeeId, nutzlast, sender) {
  if (!sender && !pushKonfiguriert()) return 0;
  const senden = sender || ((sub, daten) => webpushLaden().sendNotification(sub, daten));
  const [subs] = await pool.execute('SELECT id, endpoint, p256dh, auth FROM push_subscription WHERE employee_id = ?', [employeeId]);
  let ok = 0;
  for (const s of subs) {
    try {
      await senden({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(nutzlast));
      ok++;
    } catch (err) {
      if (err && (err.statusCode === 404 || err.statusCode === 410)) {
        await pool.execute('DELETE FROM push_subscription WHERE id = ?', [s.id]);
      } else {
        console.error('[Mitteilungen] Push fehlgeschlagen:', err && (err.message || err.statusCode));
      }
    }
  }
  return ok;
}

/**
 * Mitteilung anlegen und je nach Einstellung pushen.
 * pushText: abweichender Text nur für den Push (z. B. Sammelmeldung), die Inbox behält den Einzeltext.
 * Gibt die Zahl der angelegten Inbox-Zeilen zurück. Fehler beim Push brechen nie das Anlegen ab.
 */
async function notify(pool, { art, area, employeeIds, titel, text = null, link = null, nichtAn = [], push = true, sender }) {
  if (!artVorhanden(art)) throw new Error(`Unbekannte Mitteilungsart: ${art}`);
  const personen = employeeIds ? await empfaengerFuerIds(pool, employeeIds) : await empfaengerFuerBereich(pool, area);
  let angelegt = 0;
  for (const p of personen) {
    if (nichtAn.includes(p.id)) continue;
    const eig = (await einstellungen(pool, p.id)).get(art) || standardFuer(art, p.tags);
    if (eig.inbox) {
      await pool.execute(
        'INSERT INTO mitteilung (employee_id, art, titel, text, link) VALUES (?, ?, ?, ?, ?)',
        [p.id, art, titel.slice(0, 200), text ? text.slice(0, 500) : null, link]
      );
      angelegt++;
    }
    if (push && eig.push) {
      await sendePush(pool, p.id, { titel, text, link, art }, sender).catch((e) => console.error('[Mitteilungen] Push:', e.message));
    }
  }
  return angelegt;
}

/** Nur Push (keine Inbox-Zeile), z. B. als Sammelmeldung nach mehreren Einzel-Mitteilungen. */
async function pushNur(pool, { art, area, titel, text = null, link = null, sender }) {
  if (!artVorhanden(art)) throw new Error(`Unbekannte Mitteilungsart: ${art}`);
  let gesendet = 0;
  for (const p of await empfaengerFuerBereich(pool, area)) {
    const eig = (await einstellungen(pool, p.id)).get(art) || standardFuer(art, p.tags);
    if (eig.push) gesendet += await sendePush(pool, p.id, { titel, text, link, art }, sender).catch(() => 0);
  }
  return gesendet;
}

module.exports = { pushNur, ARTEN, artVorhanden, standardFuer, empfaengerFuerBereich, einstellungen, pushKonfiguriert, sendePush, notify };
