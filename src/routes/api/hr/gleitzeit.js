/**
 * Gleitzeitkonto (#490) — zwei Router mit unterschiedlichen Rechten (BookStack 188):
 *
 *   einstellungen  hr.mitarbeiter (nur GF): Arbeitszeitvereinbarung = Personalstammdaten.
 *                  Konto an/aus, Aktiv seit, Startsaldo, Wochenstunden mit Gültig-ab.
 *   konto          hr.zeitauswertung (GF + Backoffice): Kontostand, Verlauf,
 *                  Korrekturbuchungen — Stunden für die Lohnabrechnung.
 *
 * Jede Änderung an den Einstellungen rechnet das Konto ab dem betroffenen Tag neu.
 */
const express = require('express');
const { getPool } = require('../../../db');
const gleitzeit = require('../../../services/gleitzeit');

const ISO_TAG = /^\d{4}-\d{2}-\d{2}$/;

async function sessionEmployeeId(req) {
  const uid = req.session?.user?.authentikUid;
  if (!uid) return null;
  const [[r]] = await getPool().execute('SELECT id FROM employees WHERE authentik_uid = ?', [uid]);
  return r ? r.id : null;
}

async function ladeArbeitszeit(employeeId) {
  const [rows] = await getPool().query(
    `SELECT DATE_FORMAT(gueltig_ab,'%Y-%m-%d') AS gueltig_ab, wochenstunden, arbeitstage,
            DATE_FORMAT(created_at,'%Y-%m-%d %H:%i') AS erfasst_am
       FROM gleitzeit_arbeitszeit WHERE employee_id = ? ORDER BY gueltig_ab DESC`, [employeeId]);
  return rows.map((r) => ({
    gueltigAb: r.gueltig_ab,
    wochenstunden: Number(r.wochenstunden),
    arbeitstage: String(r.arbeitstage).split(',').map(Number),
    erfasstAm: r.erfasst_am,
  }));
}

const FREISTELLUNG_ARTEN = ['elternzeit', 'sonderurlaub'];

async function ladeFreistellungen(employeeId) {
  const [rows] = await getPool().query(
    `SELECT id, art, notiz, DATE_FORMAT(von,'%Y-%m-%d') AS von, DATE_FORMAT(bis,'%Y-%m-%d') AS bis
       FROM gleitzeit_freistellung WHERE employee_id = ? ORDER BY von DESC`, [employeeId]);
  return rows;
}

async function uebersicht(employeeId) {
  const konto = await gleitzeit.ladeKonto(employeeId);
  return {
    employeeId,
    einstellungen: {
      aktiv: Boolean(konto.gleitzeit_aktiv),
      seit: konto.seit,
      startsaldoMinuten: Number(konto.startsaldo || 0),
      zeiterfassungQuelle: konto.zeiterfassung_quelle,
    },
    wirksam: konto.aktiv,
    arbeitszeit: await ladeArbeitszeit(employeeId),
    freistellungen: await ladeFreistellungen(employeeId),
    stand: await gleitzeit.kontostand(employeeId),
  };
}

function fehler(res, err) {
  if (/nicht gefunden/.test(err.message)) return res.status(404).json({ error: err.message });
  console.error('[gleitzeit]', err);
  return res.status(500).json({ error: err.message });
}

// ── Einstellungen (nur GF) ────────────────────────────────────────────────────
const einstellungen = express.Router();

einstellungen.get('/:employeeId', async (req, res) => {
  try {
    res.json(await uebersicht(Number(req.params.employeeId)));
  } catch (err) { fehler(res, err); }
});

// PUT /:employeeId — { aktiv, seit, startsaldoMinuten }
einstellungen.put('/:employeeId', async (req, res) => {
  const employeeId = Number(req.params.employeeId);
  const { aktiv, seit, startsaldoMinuten } = req.body || {};
  try {
    const konto = await gleitzeit.ladeKonto(employeeId);
    if (seit !== null && seit !== undefined && !ISO_TAG.test(seit)) {
      return res.status(400).json({ error: '„Aktiv seit“ ist kein gültiges Datum' });
    }
    const saldo = startsaldoMinuten === undefined ? Number(konto.startsaldo || 0) : Number(startsaldoMinuten);
    if (!Number.isInteger(saldo) || Math.abs(saldo) > 1000 * 60) {
      return res.status(400).json({ error: 'Startsaldo ungültig (ganze Minuten, höchstens ±1000 Stunden)' });
    }
    if (aktiv) {
      if (konto.zeiterfassung_quelle !== 'portal') {
        return res.status(409).json({
          error: 'Gleitzeitkonto nur bei Zeiterfassung im Portal möglich',
          hinweis: 'employees.zeiterfassung_quelle muss auf \'portal\' stehen',
        });
      }
      if (!seit) return res.status(400).json({ error: '„Aktiv seit“ fehlt' });
      const [[az]] = await getPool().execute(
        'SELECT COUNT(*) AS n FROM gleitzeit_arbeitszeit WHERE employee_id = ?', [employeeId]);
      if (!Number(az.n)) return res.status(400).json({ error: 'Zuerst eine Wochenarbeitszeit hinterlegen' });
    }

    await getPool().execute(
      `UPDATE employees SET gleitzeit_aktiv = ?, gleitzeit_seit = ?, gleitzeit_startsaldo_minuten = ? WHERE id = ?`,
      [aktiv ? 1 : 0, seit || null, saldo, employeeId]);

    // Deaktivieren löscht keine Buchungen — das Konto bleibt als Historie lesbar.
    const neuberechnung = aktiv ? await gleitzeit.neuberechnen(employeeId) : null;
    res.json({ ...(await uebersicht(employeeId)), neuberechnung });
  } catch (err) { fehler(res, err); }
});

// POST /:employeeId/arbeitszeit — { gueltigAb, wochenstunden, arbeitstage: [1..5] }
// Gleicher gueltigAb überschreibt den bestehenden Eintrag.
einstellungen.post('/:employeeId/arbeitszeit', async (req, res) => {
  const employeeId = Number(req.params.employeeId);
  const { gueltigAb, wochenstunden, arbeitstage } = req.body || {};
  const std = Number(wochenstunden);
  const tage = Array.isArray(arbeitstage) ? [...new Set(arbeitstage.map(Number))].sort() : [];
  if (!ISO_TAG.test(gueltigAb || '')) return res.status(400).json({ error: '„Gültig ab“ ist kein gültiges Datum' });
  if (!(std > 0 && std <= 60)) return res.status(400).json({ error: 'Wochenstunden müssen zwischen 0 und 60 liegen' });
  if (!tage.length || tage.some((t) => !Number.isInteger(t) || t < 0 || t > 6)) {
    return res.status(400).json({ error: 'Mindestens einen Arbeitstag wählen' });
  }
  try {
    await gleitzeit.ladeKonto(employeeId); // 404, falls es den Mitarbeiter nicht gibt
    const von = await sessionEmployeeId(req);
    await getPool().execute(
      `INSERT INTO gleitzeit_arbeitszeit (employee_id, gueltig_ab, wochenstunden, arbeitstage, geaendert_von)
       VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE wochenstunden = VALUES(wochenstunden), arbeitstage = VALUES(arbeitstage),
                               geaendert_von = VALUES(geaendert_von)`,
      [employeeId, gueltigAb, std.toFixed(2), tage.join(','), von]);
    const neuberechnung = await gleitzeit.neuberechnen(employeeId, { von: gueltigAb });
    res.json({ ...(await uebersicht(employeeId)), neuberechnung });
  } catch (err) { fehler(res, err); }
});

einstellungen.delete('/:employeeId/arbeitszeit/:gueltigAb', async (req, res) => {
  const employeeId = Number(req.params.employeeId);
  const { gueltigAb } = req.params;
  if (!ISO_TAG.test(gueltigAb)) return res.status(400).json({ error: 'Datum ungültig' });
  try {
    const [r] = await getPool().execute(
      'DELETE FROM gleitzeit_arbeitszeit WHERE employee_id = ? AND gueltig_ab = ?', [employeeId, gueltigAb]);
    if (!r.affectedRows) return res.status(404).json({ error: 'Eintrag nicht gefunden' });
    const neuberechnung = await gleitzeit.neuberechnen(employeeId, { von: gueltigAb });
    res.json({ ...(await uebersicht(employeeId)), neuberechnung });
  } catch (err) { fehler(res, err); }
});

// POST /:employeeId/freistellung — { von, bis, art: 'elternzeit'|'sonderurlaub', notiz? }
// Soll 0 im Zeitraum; Urlaubstage und Rentman bleiben unberührt.
einstellungen.post('/:employeeId/freistellung', async (req, res) => {
  const employeeId = Number(req.params.employeeId);
  const { von, bis, art, notiz } = req.body || {};
  if (!ISO_TAG.test(von || '') || !ISO_TAG.test(bis || '')) return res.status(400).json({ error: 'Von/bis ist kein gültiges Datum' });
  if (bis < von) return res.status(400).json({ error: '„Bis“ liegt vor „Von“' });
  if (!FREISTELLUNG_ARTEN.includes(art)) return res.status(400).json({ error: 'Art muss Elternzeit oder Sonderurlaub sein' });
  try {
    await gleitzeit.ladeKonto(employeeId); // 404, falls es den Mitarbeiter nicht gibt
    const [[doppelt]] = await getPool().execute(
      'SELECT COUNT(*) AS n FROM gleitzeit_freistellung WHERE employee_id = ? AND von <= ? AND bis >= ?',
      [employeeId, bis, von]);
    if (Number(doppelt.n)) return res.status(409).json({ error: 'Im Zeitraum gibt es schon eine Freistellung' });
    await getPool().execute(
      `INSERT INTO gleitzeit_freistellung (employee_id, von, bis, art, notiz, erstellt_von) VALUES (?, ?, ?, ?, ?, ?)`,
      [employeeId, von, bis, art, String(notiz || '').trim().slice(0, 255) || null, await sessionEmployeeId(req)]);
    const neuberechnung = await gleitzeit.neuberechnen(employeeId, { von, bis });
    res.status(201).json({ ...(await uebersicht(employeeId)), neuberechnung });
  } catch (err) { fehler(res, err); }
});

einstellungen.delete('/:employeeId/freistellung/:id', async (req, res) => {
  const employeeId = Number(req.params.employeeId);
  try {
    const [[f]] = await getPool().execute(
      `SELECT DATE_FORMAT(von,'%Y-%m-%d') AS von, DATE_FORMAT(bis,'%Y-%m-%d') AS bis
         FROM gleitzeit_freistellung WHERE id = ? AND employee_id = ?`, [Number(req.params.id), employeeId]);
    if (!f) return res.status(404).json({ error: 'Freistellung nicht gefunden' });
    await getPool().execute('DELETE FROM gleitzeit_freistellung WHERE id = ?', [Number(req.params.id)]);
    const neuberechnung = await gleitzeit.neuberechnen(employeeId, { von: f.von, bis: f.bis });
    res.json({ ...(await uebersicht(employeeId)), neuberechnung });
  } catch (err) { fehler(res, err); }
});

module.exports = { einstellungen, uebersicht, sessionEmployeeId };
