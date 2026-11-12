// Mitteilungen: Inbox, Push-Anmeldung, Einstellungen. Nur für die eigene Person.
const express = require('express');
const db = require('../../db');
const requireAuth = require('../../middleware/requireAuth');
const m = require('../../services/mitteilungen');
const { hasArea } = require('../../utils/permissions');

const router = express.Router();
router.use(requireAuth);

const ARTEN_BEREICH = { urlaub_antrag: 'hr.urlaubskalender', urlaub_entscheidung: null, bestellung_neu: 'gashandel' };

async function eigeneId(req) {
  const [rows] = await db.getPool().execute('SELECT id FROM employees WHERE authentik_uid = ?', [req.session.user.authentikUid]);
  return rows[0] ? rows[0].id : null;
}

router.use(async (req, res, next) => {
  try {
    req.empId = await eigeneId(req);
    if (!req.empId) return res.status(404).json({ error: 'Mitarbeiter nicht gefunden' });
    next();
  } catch (err) { console.error(err); res.status(500).json({ error: 'Fehler' }); }
});

// GET /api/mitteilungen?nur_ungelesen=1&limit=50
router.get('/', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200);
    const nurUngelesen = req.query.nur_ungelesen === '1';
    const [rows] = await db.getPool().query(
      `SELECT id, art, titel, text, link, gelesen_am, erstellt_am FROM mitteilung
        WHERE employee_id = ? ${nurUngelesen ? 'AND gelesen_am IS NULL' : ''}
        ORDER BY erstellt_am DESC, id DESC LIMIT ${limit}`, [req.empId]);
    const [[z]] = await db.getPool().execute('SELECT COUNT(*) AS ungelesen FROM mitteilung WHERE employee_id = ? AND gelesen_am IS NULL', [req.empId]);
    res.json({ ungelesen: z.ungelesen, mitteilungen: rows });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Fehler' }); }
});

router.get('/anzahl', async (req, res) => {
  try {
    const [[z]] = await db.getPool().execute('SELECT COUNT(*) AS ungelesen FROM mitteilung WHERE employee_id = ? AND gelesen_am IS NULL', [req.empId]);
    res.json({ ungelesen: z.ungelesen });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Fehler' }); }
});

router.post('/gelesen', async (req, res) => {
  try {
    const ids = Array.isArray(req.body.ids) ? req.body.ids.map(Number).filter(Number.isInteger) : null;
    if (ids && ids.length) {
      await db.getPool().query('UPDATE mitteilung SET gelesen_am = NOW() WHERE employee_id = ? AND gelesen_am IS NULL AND id IN (?)', [req.empId, ids]);
    } else if (!ids) {
      await db.getPool().execute('UPDATE mitteilung SET gelesen_am = NOW() WHERE employee_id = ? AND gelesen_am IS NULL', [req.empId]);
    }
    res.json({ ok: true });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Fehler' }); }
});

// GET /api/mitteilungen/push/schluessel — öffentlicher VAPID-Schlüssel (null = Push nicht eingerichtet)
router.get('/push/schluessel', (req, res) => {
  res.json({ schluessel: m.pushKonfiguriert() ? process.env.VAPID_PUBLIC_KEY : null });
});

router.post('/push/anmelden', async (req, res) => {
  const { endpoint, keys } = req.body.subscription || req.body || {};
  if (!endpoint || !keys || !keys.p256dh || !keys.auth || String(endpoint).length > 700) return res.status(400).json({ error: 'Anmeldung ungültig' });
  try {
    await db.getPool().execute(
      `INSERT INTO push_subscription (employee_id, endpoint, p256dh, auth, user_agent) VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE employee_id = VALUES(employee_id), p256dh = VALUES(p256dh), auth = VALUES(auth), user_agent = VALUES(user_agent)`,
      [req.empId, endpoint, keys.p256dh, keys.auth, String(req.get('user-agent') || '').slice(0, 255)]);
    res.status(201).json({ ok: true });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Fehler' }); }
});

// POST /api/mitteilungen/push/test — Testnachricht an die eigenen Geräte
router.post('/push/test', async (req, res) => {
  if (!m.pushKonfiguriert()) return res.status(409).json({ error: 'Push ist auf dem Server nicht eingerichtet' });
  try {
    const gesendet = await m.sendePush(db.getPool(), req.empId, { titel: 'Testnachricht', text: 'Push funktioniert auf diesem Gerät.', link: '/mobile/#/mitteilungen', art: 'test' });
    res.json({ gesendet });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Fehler' }); }
});

router.post('/push/abmelden', async (req, res) => {
  try {
    await db.getPool().execute('DELETE FROM push_subscription WHERE employee_id = ? AND endpoint = ?', [req.empId, String(req.body.endpoint || '')]);
    res.json({ ok: true });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Fehler' }); }
});

// GET /api/mitteilungen/einstellungen — nur Arten, die für die Person relevant sind
router.get('/einstellungen', async (req, res) => {
  try {
    const u = req.session.user;
    const eig = await m.einstellungen(db.getPool(), req.empId);
    const arten = Object.entries(m.ARTEN)
      .filter(([art]) => !ARTEN_BEREICH[art] || hasArea(u.role, u.accessTags, ARTEN_BEREICH[art]))
      .map(([art, a]) => ({ art, label: a.label, ...(eig.get(art) || m.standardFuer(art, u.accessTags)) }));
    res.json({ pushVerfuegbar: m.pushKonfiguriert(), arten });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Fehler' }); }
});

router.put('/einstellungen/:art', async (req, res) => {
  const { art } = req.params;
  if (!m.artVorhanden(art)) return res.status(404).json({ error: 'Unbekannte Art' });
  const u = req.session.user;
  if (ARTEN_BEREICH[art] && !hasArea(u.role, u.accessTags, ARTEN_BEREICH[art])) return res.status(403).json({ error: 'Kein Zugriff' });
  try {
    const std = m.standardFuer(art, u.accessTags);
    const inbox = req.body.inbox === undefined ? std.inbox : !!req.body.inbox;
    const push = req.body.push === undefined ? std.push : !!req.body.push;
    await db.getPool().execute(
      `INSERT INTO mitteilung_einstellung (employee_id, art, inbox, push) VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE inbox = VALUES(inbox), push = VALUES(push)`, [req.empId, art, inbox ? 1 : 0, push ? 1 : 0]);
    res.json({ art, inbox, push });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Fehler' }); }
});

module.exports = router;
