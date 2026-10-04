const express = require('express');
const { getPool } = require('../../db');
const { shopFetch } = require('./finance/shopClient');
const { hasArea, roleFromGroups, tagsFromGroups } = require('../../utils/permissions');
const { projekteImMonat, naechsteProjekte, abwesenheiten } = require('../../services/rentman');

const router = express.Router();

// Bereichspruefung fuer den angemeldeten Nutzer. Fallback fuer Alt-Sessions.
const darf = (u, area) => hasArea(
  u.role || roleFromGroups(u.groups),
  u.accessTags || tagsFromGroups(u.groups),
  area
);

// Montag bis Sonntag der laufenden Woche
function aktuelleWoche() {
  const heute = new Date();
  const tag = (heute.getDay() + 6) % 7;              // Montag = 0
  const mo = new Date(heute); mo.setDate(heute.getDate() - tag); mo.setHours(0, 0, 0, 0);
  const so = new Date(mo);    so.setDate(mo.getDate() + 6);      so.setHours(23, 59, 59, 0);
  const iso = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0')
                   + '-' + String(d.getDate()).padStart(2, '0');
  return { von: iso(mo) + 'T00:00:00', bis: iso(so) + 'T23:59:59', vonTag: iso(mo), bisTag: iso(so) };
}

// ── GET /api/dashboard — schnell, nur eigene Datenbank ───────────────────────
router.get('/', async (req, res, next) => {
  try {
    const u = req.session.user;
    const pool = getPool();
    const antwort = {
      user: {
        fullName: u.fullName,
        username: u.username,
        role: u.role,
        accessTags: u.accessTags,
        avatarInitials: u.avatarInitials,
      },
      kacheln: {},
    };

    if (darf(u, 'hr.mitarbeiter')) {
      const [[r]] = await pool.execute('SELECT COUNT(*) AS n FROM employees WHERE active = true');
      antwort.kacheln.mitarbeiter = r.n;
    }

    if (darf(u, 'hr.urlaubskalender')) {
      const [[r]] = await pool.execute(
        "SELECT COUNT(*) AS n FROM vacation_requests WHERE status = 'pending'"
      );
      antwort.kacheln.offeneAntraege = r.n;
    }

    if (darf(u, 'gashandel')) {
      try {
        const d = await (await shopFetch('/admin/webshop-orders')).json();
        const alle = d.orders || [];
        // Storniertes und Kunden ohne SER-Anbindung zaehlen nicht - sonst zeigt die
        // Kachel auf etwas, das man gar nicht bearbeiten kann.
        const serRelevant = alle.filter(o => o.status !== 'cancelled' && o.in_ser_fvk !== false);
        antwort.kacheln.bestellungenOhneSer = serRelevant.filter(
          o => o.ser_status !== 'ok' && o.ser_status !== 'pending'
        ).length;
        antwort.kacheln.bestellungenSerOffen = serRelevant.filter(
          o => o.ser_status === 'pending'
        ).length;
        antwort.kacheln.bestellungenOffen = alle.filter(o => !o.done && o.status !== 'cancelled').length;
      } catch (e) {
        console.error('[Dashboard] Bestellungen:', e.message);
        antwort.kacheln.bestellungenOhneSer = null;
      }
    }

    if (u.id) {
      const [rows] = await pool.execute(
        `SELECT id, start_date, end_date, days_count, status
         FROM vacation_requests WHERE employee_id = ?
         ORDER BY start_date DESC LIMIT 3`, [u.id]
      );
      antwort.meineAntraege = rows;
    }

    res.json(antwort);
  } catch (err) { next(err); }
});

// ── Abwesenheiten der laufenden Woche, fuer alle sichtbar ───────────────────
router.get('/abwesend', async (req, res) => {
  const w = aktuelleWoche();
  try {
    const [roh, [mitarbeiter]] = await Promise.all([
      abwesenheiten(w.von, w.bis),
      getPool().execute(
        'SELECT rentman_id, COALESCE(full_name, displayname) AS name FROM employees WHERE rentman_id IS NOT NULL'
      ),
    ]);
    const namen = new Map(mitarbeiter.map(m => [m.rentman_id, m.name]));
    // pro Person und Typ zusammenfassen
    const zusammen = new Map();
    for (const a of roh) {
      const schluessel = a.rentmanId + '|' + a.typId;
      const bisher = zusammen.get(schluessel);
      if (bisher) {
        if (a.von < bisher.von) bisher.von = a.von;
        if (a.bis > bisher.bis) bisher.bis = a.bis;
      } else {
        zusammen.set(schluessel, {
          name: namen.get(a.rentmanId) || 'Unbekannt (Crew ' + a.rentmanId + ')',
          typ: a.typ, von: a.von, bis: a.bis,
        });
      }
    }
    res.json({ woche: { von: w.vonTag, bis: w.bisTag }, abwesend: Array.from(zusammen.values()) });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

// ── Projekte: Kalender und Liste, fuer alle sichtbar ────────────────────────
router.get('/projekte', async (req, res) => {
  const jahr = Number(req.query.jahr) || new Date().getFullYear();
  const monat = Number(req.query.monat) || (new Date().getMonth() + 1);
  if (monat < 1 || monat > 12 || jahr < 2000 || jahr > 2100) {
    return res.status(400).json({ error: 'Ungueltiger Zeitraum' });
  }
  try {
    res.json({ jahr, monat, projekte: await projekteImMonat(jahr, monat) });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

router.get('/projekte/naechste', async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 10, 25);
  try {
    res.json({ projekte: await naechsteProjekte(limit) });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

// ── Letzte Gasbestellungen, nur mit Bereich gashandel ───────────────────────
router.get('/bestellungen', async (req, res) => {
  if (!darf(req.session.user, 'gashandel')) {
    return res.status(403).json({ error: 'Keine Berechtigung' });
  }
  try {
    const d = await (await shopFetch('/admin/webshop-orders')).json();
    const letzte = (d.orders || [])
      .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
      .slice(0, Math.min(Number(req.query.limit) || 10, 25))
      .map(o => ({
        id: o.id,
        kunde: o.customer_name,
        kundennummer: o.customer_number,
        betrag: o.total_gross,
        angelegt: o.created_at,
        serStatus: o.ser_status,
        serFehler: o.ser_error_msg,
        storniert: o.status === 'cancelled',
      }));
    res.json({ bestellungen: letzte });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

// ── Zuletzt geaenderte Doku-Seiten ──────────────────────────────────────────
router.get('/doku', async (req, res) => {
  const token = process.env.BOOKSTACK_TOKEN;
  // 127.0.0.1 statt localhost: Node bevorzugt IPv6, BookStack lauscht nur auf IPv4
  if (!token) return res.json({ seiten: [] });
  try {
    const r = await fetch('http://127.0.0.1:6875/api/pages?sort=-updated_at&count=5', {
      headers: { Authorization: 'Token ' + token },
    });
    if (!r.ok) throw new Error('BookStack ' + r.status);
    const d = await r.json();
    res.json({
      seiten: (d.data || []).map(p => ({
        id: p.id, name: p.name, geaendert: p.updated_at,
        url: 'https://docs.randlweb.de/books/' + p.book_slug + '/page/' + p.slug,
      })),
    });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

module.exports = router;
