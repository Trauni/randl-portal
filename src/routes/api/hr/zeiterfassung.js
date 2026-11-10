const express = require('express');
const { getPool } = require('../../../db');
const { zeitreport } = require('../../../services/rentman');
const urlaub = require('../../../services/urlaub');
const zeit = require('../../../services/zeit');
const gleitzeit = require('../../../services/gleitzeit');

function pruefeZeitraum(req, res) {
  const jahr = Number(req.query.jahr);
  const monat = Number(req.query.monat);
  if (!Number.isInteger(jahr) || jahr < 2000 || jahr > 2100) {
    res.status(400).json({ error: 'Ungueltiges Jahr' });
    return null;
  }
  if (!Number.isInteger(monat) || monat < 1 || monat > 12) {
    res.status(400).json({ error: 'Ungueltiger Monat' });
    return null;
  }
  return { jahr, monat };
}

async function pruefePortalQuelle(employeeId, res) {
  const [[emp]] = await getPool().execute(
    'SELECT id, zeiterfassung_quelle FROM employees WHERE id = ?', [employeeId]);
  if (!emp) { res.status(404).json({ error: 'Mitarbeiter nicht gefunden' }); return false; }
  if (emp.zeiterfassung_quelle !== 'portal') {
    res.status(409).json({
      error: 'Zeiterfassung laeuft fuer diesen Mitarbeiter noch ueber Rentman',
      hinweis: 'employees.zeiterfassung_quelle muss auf \'portal\' stehen, bevor hier geschrieben werden kann',
    });
    return false;
  }
  return true;
}

async function pruefeEigentum(entryId, employeeId, res) {
  const [[row]] = await getPool().execute(
    'SELECT employee_id FROM time_entries WHERE id = ?', [entryId]);
  if (!row) { res.status(404).json({ error: 'Eintrag nicht gefunden' }); return false; }
  if (row.employee_id !== employeeId) { res.status(403).json({ error: 'Eintrag gehoert nicht diesem Mitarbeiter' }); return false; }
  return true;
}

async function report(res, employeeId, jahr, monat) {
  const [[emp]] = await getPool().execute(
    'SELECT id, COALESCE(full_name, displayname) AS name, rentman_id, zeiterfassung_quelle, minijob, minijob_max_stunden_monat FROM employees WHERE id = ?',
    [employeeId]
  );
  if (!emp) return res.status(404).json({ error: 'Mitarbeiter nicht gefunden' });
  // Ohne Rentman-Zuordnung (z. B. neu im Portal angelegt, #498): Bericht nur aus den Portal-Eintraegen.
  const daten = emp.rentman_id
    ? await zeitreport({ rentmanId: emp.rentman_id, jahr, monat })
    : { jahr, monat, rentmanId: null, eintraege: [], summe: 0, aktivitaetenSumme: 0, summenTypen: [1, 2, 3, 4] };

  // Portal-Eintraege draufmischen -- Rentman bleibt die durchgehende Quelle.
  // Bereits gespiegelte Rentman-Zeilen bekommen ihre time_entries.id zurueck
  // (zeitEintragId), damit sie ueber die Portal-UI korrigierbar bleiben.
  if (emp.zeiterfassung_quelle === 'portal' || !emp.rentman_id) {
    const { ungespiegelt, gespiegeltMap } = await zeit.portalEintraegeFuerMonat({ employeeId: emp.id, jahr, monat });
    for (const e of daten.eintraege) {
      if (gespiegeltMap.has(e.id)) e.zeitEintragId = gespiegeltMap.get(e.id);
    }
    daten.eintraege = [...daten.eintraege, ...ungespiegelt]
      .sort((a, b) => String(a.start).localeCompare(String(b.start)));
    daten.summe += ungespiegelt.reduce((s, e) => s + (e.dauer || 0), 0);
  }

  res.json({
    mitarbeiter: {
      id: emp.id, name: emp.name, rentman_id: emp.rentman_id, zeiterfassung_quelle: emp.zeiterfassung_quelle,
      minijob: emp.minijob ? { maxStunden: Number(emp.minijob_max_stunden_monat) || null } : null,
    },
    ...daten,
  });
}

// ── Auswertung: beliebiger Mitarbeiter, Bereich hr.zeitauswertung ────────────
const auswertung = express.Router();

// Eigene Mitarbeiterliste, weil Backoffice keinen Zugriff auf /api/hr/employees hat
auswertung.get('/mitarbeiter', async (req, res) => {
  try {
    const [rows] = await getPool().execute(`
      SELECT id, COALESCE(full_name, displayname) AS name, rentman_id, active
      FROM employees
      WHERE (rentman_id IS NOT NULL OR zeiterfassung_quelle = 'portal') AND is_demo = 0
      ORDER BY active DESC, name ASC
    `);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

auswertung.get('/', async (req, res) => {
  const z = pruefeZeitraum(req, res);
  if (!z) return;
  const employeeId = Number(req.query.employee_id);
  if (!Number.isInteger(employeeId)) {
    return res.status(400).json({ error: 'employee_id fehlt' });
  }
  try {
    await report(res, employeeId, z.jahr, z.monat);
  } catch (err) {
    console.error('[Zeiterfassung]', err.message);
    res.status(502).json({ error: err.message });
  }
});

// ── Urlaubsabgleich mit Rentman ──────────────────────────────────────────────
// Zeigt, was mit Rentman nicht im Reinen ist, und erlaubt die Neuberechnung.
// Bewusst hier und nicht unter /api/vacation: der Bereich hr.zeitauswertung
// gilt auch fuer Backoffice, der Urlaubskalender dagegen nur fuer die GF.
auswertung.get('/urlaub-abgleich', async (req, res) => {
  try {
    const offen = await urlaub.offeneNeuberechnungen();
    const heute = new Date().toISOString().slice(0, 10);
    res.json(offen.map((r) => ({
      ...r,
      grund: r.stunden_sekunden === null || r.stunden_sekunden === undefined
        ? 'nie berechnet'
        : r.rentman_leaverequest_id ? 'Wert noch vorlaeufig' : 'nie nach Rentman uebertragen',
      artLabel: r.art === 'gleitzeitabbau' ? 'Gleitzeitabbau' : 'Urlaub',
      vergangen: r.bis < heute,
    })));
  } catch (err) {
    console.error('[Urlaubsabgleich]', err.message);
    res.status(500).json({ error: err.message });
  }
});

auswertung.get('/urlaub/:id/vorschau', async (req, res) => {
  try {
    res.json(await urlaub.vorschau(Number(req.params.id)));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

auswertung.post('/urlaub/:id/neuberechnen', async (req, res) => {
  try {
    const ergebnis = await urlaub.nachRentman(Number(req.params.id)); // Urlaub oder Gleitzeitabbau (#490)
    console.log(`[Urlaubsabgleich] Antrag ${req.params.id} neu berechnet von `
      + (req.session?.user?.username || 'unbekannt'));
    res.json(ergebnis);
  } catch (err) {
    console.error('[Urlaubsabgleich]', err.message);
    res.status(502).json({ error: err.message });
  }
});

// ── Zeit fuer andere Mitarbeiter erfassen/korrigieren, Bereich hr.zeitauswertung ─
auswertung.post('/mitarbeiter/:employeeId/zeit', async (req, res) => {
  const employeeId = Number(req.params.employeeId);
  const geaendertVonId = req.session?.user?.id;
  if (!(await pruefePortalQuelle(employeeId, res))) return;
  const { tag, start, ende, pauseMinuten, typ, stunden } = req.body;
  if (!tag) return res.status(400).json({ error: 'tag ist Pflicht' });
  if (typ === 'krankheit') {
    if (!stunden) return res.status(400).json({ error: 'stunden ist bei Krankentag Pflicht' });
  } else if (!start || !ende) {
    return res.status(400).json({ error: 'tag, start und ende sind Pflicht' });
  }
  try {
    const { entryId, urlaubNeuberechnet } = await zeit.manuellErfassen({ employeeId, tag, start, ende, pauseMinuten, erfasstVonId: geaendertVonId, typ, stunden });
    console.log(`[Zeiterfassung] Eintrag ${entryId} (${typ || 'arbeitszeit'}) fuer Mitarbeiter ${employeeId} angelegt von `
      + (req.session?.user?.username || 'unbekannt'));
    res.json({ id: entryId, urlaubNeuberechnet });
  } catch (err) {
    console.error('[Zeiterfassung Fremderfassung]', err.message);
    res.status(502).json({ error: err.message });
  }
});

auswertung.get('/zeit/:id', async (req, res) => {
  try {
    const eintrag = await zeit.ladeEintrag(Number(req.params.id));
    if (!eintrag) return res.status(404).json({ error: 'Eintrag nicht gefunden' });
    res.json(eintrag);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

auswertung.put('/zeit/:id', async (req, res) => {
  const entryId = Number(req.params.id);
  const geaendertVonId = req.session?.user?.id;
  try {
    const { urlaubNeuberechnet } = await zeit.bearbeiten(entryId, req.body, geaendertVonId);
    console.log(`[Zeiterfassung] Eintrag ${entryId} korrigiert von `
      + (req.session?.user?.username || 'unbekannt'));
    res.json({ ok: true, urlaubNeuberechnet });
  } catch (err) {
    console.error('[Zeiterfassung Korrektur]', err.message);
    res.status(502).json({ error: err.message });
  }
});

// ── Eigene Zeiten, Bereich zeit.eigen ────────────────────────────────────────
const eigen = express.Router();

eigen.get('/', async (req, res) => {
  const z = pruefeZeitraum(req, res);
  if (!z) return;
  const employeeId = req.session?.user?.id;
  if (!employeeId) {
    return res.status(409).json({ error: 'Keine Mitarbeiterzuordnung in der Sitzung' });
  }
  try {
    await report(res, employeeId, z.jahr, z.monat);
  } catch (err) {
    console.error('[Zeiterfassung eigen]', err.message);
    res.status(502).json({ error: err.message });
  }
});

eigen.post('/start', async (req, res) => {
  const employeeId = req.session?.user?.id;
  if (!employeeId) return res.status(409).json({ error: 'Keine Mitarbeiterzuordnung in der Sitzung' });
  if (!(await pruefePortalQuelle(employeeId, res))) return;
  try {
    const id = await zeit.starten(employeeId, employeeId);
    res.json({ id });
  } catch (err) {
    res.status(409).json({ error: err.message });
  }
});

eigen.post('/:id/pause', async (req, res) => {
  const employeeId = req.session?.user?.id;
  if (!employeeId) return res.status(409).json({ error: 'Keine Mitarbeiterzuordnung in der Sitzung' });
  const entryId = Number(req.params.id);
  if (!(await pruefeEigentum(entryId, employeeId, res))) return;
  try {
    await zeit.pausieren(entryId);
    res.json({ ok: true });
  } catch (err) {
    res.status(409).json({ error: err.message });
  }
});

eigen.post('/:id/fortsetzen', async (req, res) => {
  const employeeId = req.session?.user?.id;
  if (!employeeId) return res.status(409).json({ error: 'Keine Mitarbeiterzuordnung in der Sitzung' });
  const entryId = Number(req.params.id);
  if (!(await pruefeEigentum(entryId, employeeId, res))) return;
  try {
    await zeit.fortsetzen(entryId);
    res.json({ ok: true });
  } catch (err) {
    res.status(409).json({ error: err.message });
  }
});

eigen.post('/:id/stop', async (req, res) => {
  const employeeId = req.session?.user?.id;
  if (!employeeId) return res.status(409).json({ error: 'Keine Mitarbeiterzuordnung in der Sitzung' });
  const entryId = Number(req.params.id);
  if (!(await pruefeEigentum(entryId, employeeId, res))) return;
  try {
    await zeit.stoppen(entryId);
    res.json({ ok: true });
  } catch (err) {
    res.status(409).json({ error: err.message });
  }
});

eigen.post('/manuell', async (req, res) => {
  const employeeId = req.session?.user?.id;
  if (!employeeId) return res.status(409).json({ error: 'Keine Mitarbeiterzuordnung in der Sitzung' });
  if (!(await pruefePortalQuelle(employeeId, res))) return;
  const { tag, start, ende, pauseMinuten } = req.body;
  if (!tag || !start || !ende) return res.status(400).json({ error: 'tag, start und ende sind Pflicht' });
  try {
    const { entryId } = await zeit.manuellErfassen({ employeeId, tag, start, ende, pauseMinuten, erfasstVonId: employeeId });
    res.json({ id: entryId });
  } catch (err) {
    console.error('[Zeiterfassung eigen manuell]', err.message);
    res.status(502).json({ error: err.message });
  }
});

eigen.get('/laufend', async (req, res) => {
  const employeeId = req.session?.user?.id;
  if (!employeeId) return res.status(409).json({ error: 'Keine Mitarbeiterzuordnung in der Sitzung' });
  try {
    const [[row]] = await getPool().execute(
      `SELECT id, DATE_FORMAT(start,'%Y-%m-%dT%H:%i:%s') AS start,
              DATE_FORMAT(pause_start,'%Y-%m-%dT%H:%i:%s') AS pause_start,
              status
         FROM time_entries
        WHERE employee_id = ? AND status IN ('laufend','pausiert')`, [employeeId]);
    res.json(row || null);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Gleitzeitkonto (#490) ─────────────────────────────────────────────────────
// gruppe=monat: Monate des Jahres; gruppe=woche: Wochen des gewählten Monats.
function gleitzeitZeitraum(req) {
  const jahr = Number(req.query.jahr);
  const monat = Number(req.query.monat);
  if (!Number.isInteger(jahr) || jahr < 2000 || jahr > 2100) return null;
  const gruppe = req.query.gruppe === 'woche' ? 'woche' : 'monat';
  if (gruppe === 'monat') return { gruppe, von: `${jahr}-01-01`, bis: `${jahr}-12-31` };
  if (!Number.isInteger(monat) || monat < 1 || monat > 12) return null;
  const mm = String(monat).padStart(2, '0');
  const letzter = new Date(Date.UTC(jahr, monat, 0)).getUTCDate();
  return { gruppe, von: `${jahr}-${mm}-01`, bis: `${jahr}-${mm}-${letzter}` };
}

async function gleitzeitAntwort(employeeId, z, mitKorrekturen) {
  const stand = await gleitzeit.kontostand(employeeId);
  if (!stand.aktiv && !stand.gebuchtBis) return { aktiv: false };
  return {
    ...stand,
    gruppe: z.gruppe,
    verlauf: await gleitzeit.verlauf(employeeId, z),
    ...(mitKorrekturen ? { korrekturen: await gleitzeit.korrekturen(employeeId, z) } : {}),
  };
}

eigen.get('/gleitzeit', async (req, res) => {
  const employeeId = req.session?.user?.id;
  if (!employeeId) return res.status(409).json({ error: 'Keine Mitarbeiterzuordnung in der Sitzung' });
  const z = gleitzeitZeitraum(req);
  if (!z) return res.status(400).json({ error: 'Ungueltiger Zeitraum' });
  try {
    res.json(await gleitzeitAntwort(employeeId, z, false));
  } catch (err) {
    console.error('[Gleitzeit eigen]', err.message);
    res.status(500).json({ error: err.message });
  }
});

auswertung.get('/mitarbeiter/:employeeId/gleitzeit', async (req, res) => {
  const z = gleitzeitZeitraum(req);
  if (!z) return res.status(400).json({ error: 'Ungueltiger Zeitraum' });
  try {
    res.json(await gleitzeitAntwort(Number(req.params.employeeId), z, true));
  } catch (err) {
    console.error('[Gleitzeit]', err.message);
    res.status(/nicht gefunden/.test(err.message) ? 404 : 500).json({ error: err.message });
  }
});

// { datum, minuten, notiz } — minuten mit Vorzeichen
auswertung.post('/mitarbeiter/:employeeId/gleitzeit/korrektur', async (req, res) => {
  try {
    const { datum, minuten, notiz } = req.body || {};
    res.status(201).json(await gleitzeit.korrekturBuchen(
      Number(req.params.employeeId), { datum, minuten: Number(minuten), notiz }, req.session?.user?.id));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

auswertung.delete('/mitarbeiter/:employeeId/gleitzeit/korrektur/:id', async (req, res) => {
  try {
    res.json(await gleitzeit.korrekturLoeschen(
      Number(req.params.employeeId), Number(req.params.id), req.session?.user?.id));
  } catch (err) {
    res.status(/nicht gefunden/.test(err.message) ? 404 : 500).json({ error: err.message });
  }
});

module.exports = { auswertung, eigen };
