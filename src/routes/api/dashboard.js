const express = require('express');
const { getPool } = require('../../db');
const { shopFetch } = require('./finance/shopClient');
const { hasArea } = require('../../utils/permissions');
const os = require('os');
const { execFile } = require('child_process');
const { projekteImMonat, naechsteProjekte, abwesenheiten, ZELT_TYPEN } = require('../../services/rentman');
const gleitzeit = require('../../services/gleitzeit');
const metallEingang = require('../../services/metallEingang');
const metallZuordnen = require('../../services/metallZuordnen');

const router = express.Router();

// Bereichspruefung fuer den angemeldeten Nutzer.
const darf = (u, area) => hasArea(u.role, u.accessTags, area);

// Rentman-Projekte auf dem Dashboard: für alle sichtbar (Mount verlangt schon 'dashboard').
// Geschäftsführung und Backoffice sehen alle Projekttypen, alle anderen nur Zeltprojekte.
const alleProjektTypen = (u) => (u.accessTags || []).some(t => t === 'geschaeftsfuehrung' || t === 'backoffice');
const projektFilter = (u) => (p) => alleProjektTypen(u) || ZELT_TYPEN.includes(p.typId);

// Belegung der Root-Partition in Prozent, ohne Shell
function diskProzent() {
  return new Promise((resolve) => {
    execFile('df', ['-P', '/'], { timeout: 3000 }, (err, out) => {
      if (err) return resolve(null);
      const m = String(out).trim().split('\n').pop().match(/(\d+)%/);
      resolve(m ? Number(m[1]) : null);
    });
  });
}

// Persönliche Kennzahlen: heute/Woche erfasst, laufende Stempeluhr, Gleitzeit, nächster Urlaub
async function persoenlich(pool, employeeId) {
  const [[emp]] = await pool.execute(
    'SELECT zeiterfassung_quelle FROM employees WHERE id = ?', [employeeId]);
  const [[summe]] = await pool.execute(
    `SELECT
       COALESCE(SUM(IF(tag = CURDATE(), GREATEST(TIMESTAMPDIFF(SECOND, start, ende) - pause_sekunden, 0), 0)), 0) AS heute,
       COALESCE(SUM(GREATEST(TIMESTAMPDIFF(SECOND, start, ende) - pause_sekunden, 0)), 0) AS woche
     FROM time_entries
     WHERE employee_id = ? AND ende IS NOT NULL AND eintrag_typ <> 'krankheit'
       AND status IN ('abgeschlossen', 'auto_beendet')
       AND tag BETWEEN DATE_SUB(CURDATE(), INTERVAL WEEKDAY(CURDATE()) DAY) AND CURDATE()`,
    [employeeId]);
  // Laufender Eintrag: bisherige Netto-Sekunden rechnet die DB (keine Zeitzonen-Fallen)
  const [[laufend]] = await pool.execute(
    `SELECT id, status,
            DATE_FORMAT(start, '%H:%i') AS seit,
            GREATEST(TIMESTAMPDIFF(SECOND, start, COALESCE(pause_start, NOW())) - pause_sekunden, 0) AS sekunden
       FROM time_entries
      WHERE employee_id = ? AND status IN ('laufend', 'pausiert')`, [employeeId]);
  const [[urlaub]] = await pool.execute(
    `SELECT DATE_FORMAT(start_date, '%Y-%m-%d') AS von, DATE_FORMAT(end_date, '%Y-%m-%d') AS bis,
            art, days_count, status
       FROM vacation_requests
      WHERE employee_id = ? AND status IN ('approved', 'pending') AND end_date >= CURDATE()
      ORDER BY start_date LIMIT 1`, [employeeId]);
  let konto = null;
  try {
    const stand = await gleitzeit.kontostand(employeeId);
    if (stand.aktiv) konto = { minuten: stand.minuten, anzeige: stand.anzeige };
  } catch (e) { /* kein Gleitzeitkonto */ }
  return {
    zeitQuelle: emp ? emp.zeiterfassung_quelle : null,
    heuteSekunden: Number(summe.heute),
    wocheSekunden: Number(summe.woche),
    laufend: laufend ? { id: laufend.id, status: laufend.status, seit: laufend.seit, sekunden: Number(laufend.sekunden) } : null,
    gleitzeit: konto,
    naechsterUrlaub: urlaub || null,
  };
}

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

    if (darf(u, 'metallarbeiten.vorgaenge')) {
      try {
        antwort.kacheln.metallEingangNeu = await metallEingang.zaehleNeue(pool);
        antwort.kacheln.metallBelegeOffen = await metallZuordnen.zaehleOffene(pool);
      } catch (e) { console.error('[Dashboard] Maschinenbau:', e.message); }
    }

    if (darf(u, 'hr.zeitauswertung')) {
      const [[r]] = await pool.execute(
        "SELECT COUNT(*) AS n FROM time_entries WHERE status IN ('laufend', 'pausiert')");
      antwort.kacheln.jetztEingestempelt = r.n;
    }

    if (darf(u, 'it')) {
      const ram = Math.round((1 - os.freemem() / os.totalmem()) * 100);
      const last = Math.min(Math.round(os.loadavg()[0] / os.cpus().length * 100), 100);
      antwort.kacheln.server = { ram, last, disk: await diskProzent() };
    }

    if (u.id && darf(u, 'zeit.eigen')) {
      try { antwort.persoenlich = await persoenlich(pool, u.id); }
      catch (e) { console.error('[Dashboard] Persönlich:', e.message); }
    }

    if (u.id) {
      const [rows] = await pool.execute(
        `SELECT id, art, start_date, end_date, abbau_von, abbau_bis, days_count, status
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
    const projekte = (await projekteImMonat(jahr, monat)).filter(projektFilter(req.session.user));
    res.json({ jahr, monat, projekte });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

router.get('/projekte/naechste', async (req, res) => {
  const u = req.session.user;
  const limit = Math.min(Number(req.query.limit) || 10, 25);
  try {
    // alle kommenden holen, dann filtern — sonst fehlen Zelte, wenn andere Typen vorne liegen
    const alle = (await naechsteProjekte(500)).filter(projektFilter(u));
    const w = aktuelleWoche();
    const in14 = new Date(); in14.setDate(in14.getDate() + 14);
    const in14Tag = in14.toISOString().slice(0, 10) + 'T23:59:59';
    res.json({
      projekte: alle.slice(0, limit),
      dieseWoche: alle.filter(p => p.von && p.von <= w.bis && p.bis >= w.von).length,
      naechste14: alle.filter(p => p.von && p.von <= in14Tag).length,
    });
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
