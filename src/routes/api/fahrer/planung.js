/**
 * Fahrer-App (#518), Büro: Touren anlegen, Bestellungen zuordnen, sortieren, freigeben. Session + requireArea('fahrer.geraete').
 *
 *   GET    /api/fahrer-touren?von=&bis=              Touren (Standard: heute bis +14 Tage)
 *   POST   /api/fahrer-touren                        { datum, bezeichnung, employeeId, fahrzeug?, ladebasisId? }
 *   GET    /api/fahrer-touren/offene-bestellungen    Bestellungen, die in keiner aktiven Tour stecken
 *   GET    /api/fahrer-touren/:id                    Tour mit Stopps
 *   PATCH  /api/fahrer-touren/:id                    Kopfdaten (nur Entwurf)
 *   DELETE /api/fahrer-touren/:id                    nur leere oder stornierte Tour
 *   POST   /api/fahrer-touren/:id/bestellungen       { bestellIds: [...] } → hängt je Bestellung einen Stopp an (Entwurf)
 *   PUT    /api/fahrer-touren/:id/reihenfolge        { stoppIds: [...] }
 *   PATCH  /api/fahrer-touren/:id/stopps/:stoppId    { lieferzeit?, hinweise? }
 *   DELETE /api/fahrer-touren/:id/stopps/:stoppId    Bestellung wird wieder frei
 *   POST   /api/fahrer-touren/:id/:aktion            aktion = freigeben | zurueck | stornieren | beenden
 *
 * Ladebasis der Tour: PUT /api/fahrer-ladebasen/touren/:tourId (#514).
 */
const express = require('express');
const { FahrerFehler } = require('../../../services/fahrerKrypto');
const plan = require('../../../services/fahrerPlanung');
const { sicher } = require('./index');

const DATUM = /^\d{4}-\d{2}-\d{2}$/;
const text = (v, max) => String(v ?? '').trim().slice(0, max);
const ganzzahl = (v) => (v != null && v !== '' && Number.isInteger(Number(v)) ? Number(v) : null);
const heute = (jetzt) => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Berlin' }).format(new Date(jetzt));
const plusTage = (iso, n) => { const d = new Date(`${iso}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

const tourAnsicht = (t) => ({
  id: t.id, datum: t.datum, bezeichnung: t.bezeichnung, employeeId: t.employee_id, fahrerName: t.fahrer_name || null,
  fahrzeug: t.fahrzeug || null, ladebasisId: t.ladebasis_id ?? null, ladebasisName: t.ladebasis_name || null,
  status: t.status, version: t.version, beendetDurch: t.beendet_durch || null, stopps: Number(t.stopps) || 0,
});
const stoppAnsicht = (s) => ({
  id: s.id, reihenfolge: s.reihenfolge, auftragRef: s.auftrag_ref, bestellId: s.bestell_id || null, kundeNr: s.kunde_nr,
  kundeName: s.kunde_name, adresse: s.kunde_adresse || null, hinweise: s.hinweise || null, lieferzeit: s.lieferzeit || null,
  status: s.status, positionen: s.positionen,
});

/**
 * @param {object} deps
 * @param {object} deps.store             Datenzugriff (services/fahrerTourPlanung.js)
 * @param {() => Promise<object[]>} deps.holeBestellungen  Bestellungen aus der Shop-API
 * @param {() => number} [deps.uhr]       Millisekunden, für Tests
 */
function erstellePlanungRouter({ store, holeBestellungen, uhr = Date.now }) {
  const router = express.Router();

  async function oder404(id) {
    const n = ganzzahl(id);
    const t = n == null ? null : await store.tourNachId(n);
    if (!t) throw new FahrerFehler(404, 'tour_nicht_gefunden', 'Tour nicht gefunden');
    return t;
  }

  function kopfAus(k, alt = {}) {
    const datum = 'datum' in k ? text(k.datum, 10) : alt.datum;
    if (!DATUM.test(datum || '')) throw new FahrerFehler(400, 'ungueltig', 'Datum fehlt (JJJJ-MM-TT)');
    const bezeichnung = 'bezeichnung' in k ? text(k.bezeichnung, 120) : alt.bezeichnung;
    if (!bezeichnung) throw new FahrerFehler(400, 'ungueltig', 'Bezeichnung fehlt');
    const employeeId = 'employeeId' in k ? ganzzahl(k.employeeId) : alt.employee_id;
    if (employeeId == null) throw new FahrerFehler(400, 'ungueltig', 'Fahrer fehlt');
    return {
      datum, bezeichnung, employeeId,
      fahrzeug: 'fahrzeug' in k ? text(k.fahrzeug, 40) || null : alt.fahrzeug ?? null,
      ladebasisId: 'ladebasisId' in k ? ganzzahl(k.ladebasisId) : alt.ladebasis_id ?? null,
    };
  }

  router.get('/', sicher(async (req, res) => {
    const von = DATUM.test(req.query.von || '') ? req.query.von : heute(uhr());
    const bis = DATUM.test(req.query.bis || '') ? req.query.bis : plusTage(von, 14);
    res.json((await store.touren({ von, bis })).map(tourAnsicht));
  }));

  router.post('/', sicher(async (req, res) => {
    const kopf = kopfAus(req.body || {});
    const t = await store.legeAn({ ...kopf, erstelltVon: req.session?.user?.id ?? null });
    res.status(201).json(tourAnsicht(t));
  }));

  router.get('/offene-bestellungen', sicher(async (req, res) => {
    const belegt = await store.belegteBestellungen();
    const offen = (await holeBestellungen()).filter((b) => b && b.id != null && plan.istOffen(b, belegt));
    res.json(offen.map(plan.bestellAnsicht));
  }));

  router.get('/:id', sicher(async (req, res) => {
    const t = await oder404(req.params.id);
    res.json({ ...tourAnsicht(t), stoppListe: (await store.stopps(t.id)).map(stoppAnsicht) });
  }));

  router.patch('/:id', sicher(async (req, res) => {
    const t = await oder404(req.params.id);
    plan.pruefeBearbeitbar(t);
    if (!(await store.aendereKopf(t.id, kopfAus(req.body || {}, t)))) throw new FahrerFehler(409, 'tour_gesperrt', 'Tour ist nicht mehr im Entwurf');
    res.json(tourAnsicht(await store.tourNachId(t.id)));
  }));

  router.delete('/:id', sicher(async (req, res) => {
    const t = await oder404(req.params.id);
    plan.pruefeLoeschbar(t, Number(t.stopps) || 0);
    await store.loesche(t.id);
    res.json({ id: t.id });
  }));

  router.post('/:id/bestellungen', sicher(async (req, res) => {
    const t = await oder404(req.params.id);
    plan.pruefeBearbeitbar(t);
    const ids = [...new Set((Array.isArray(req.body?.bestellIds) ? req.body.bestellIds : []).map(String))];
    if (!ids.length) throw new FahrerFehler(400, 'ungueltig', 'bestellIds fehlt');
    const alle = new Map((await holeBestellungen()).map((b) => [String(b.id), b]));
    const belegt = await store.belegteBestellungen();
    // Erst alles prüfen und umbauen, dann buchen: Fehler in der dritten Bestellung lassen keine halbe Auswahl zurück.
    const stopps = ids.map((id) => {
      const b = alle.get(id);
      if (!b || !plan.istOffen(b, belegt)) throw new FahrerFehler(409, 'bestellung_nicht_offen', `Bestellung ${id} ist nicht (mehr) offen`);
      return plan.stoppAusBestellung(b);
    });
    const fehlen = await store.unbekannteArtikel([...new Set(stopps.flatMap((s) => s.positionen.map((p) => p.artikelNr)))]);
    if (fehlen.length) throw new FahrerFehler(422, 'artikel_unbekannt', `Artikel nicht im Stamm: ${fehlen.join(', ')}`);
    const stoppIds = [];
    for (const s of stopps) stoppIds.push(await store.fuegeStoppHinzu(t.id, s));
    res.status(201).json({ stoppIds });
  }));

  router.put('/:id/reihenfolge', sicher(async (req, res) => {
    const t = await oder404(req.params.id);
    plan.pruefeBearbeitbar(t);
    const ids = Array.isArray(req.body?.stoppIds) ? req.body.stoppIds.map(ganzzahl) : [];
    if (ids.some((i) => i == null) || new Set(ids).size !== ids.length) throw new FahrerFehler(400, 'ungueltig', 'stoppIds ungültig');
    await store.sortiere(t.id, ids);
    res.json({ ok: true });
  }));

  router.patch('/:id/stopps/:stoppId', sicher(async (req, res) => {
    const t = await oder404(req.params.id);
    plan.pruefeBearbeitbar(t);
    const stoppId = ganzzahl(req.params.stoppId);
    const alt = (await store.stopps(t.id)).find((s) => s.id === stoppId);
    if (!alt) throw new FahrerFehler(404, 'stopp_nicht_gefunden', 'Stopp gehört nicht zu dieser Tour');
    const k = req.body || {};
    await store.aendereStopp(t.id, stoppId, {
      lieferzeit: 'lieferzeit' in k ? text(k.lieferzeit, 60) || null : alt.lieferzeit,
      hinweise: 'hinweise' in k ? text(k.hinweise, 500) || null : alt.hinweise,
    });
    res.json({ ok: true });
  }));

  router.delete('/:id/stopps/:stoppId', sicher(async (req, res) => {
    const t = await oder404(req.params.id);
    plan.pruefeBearbeitbar(t);
    await store.entferneStopp(t.id, ganzzahl(req.params.stoppId));
    res.json({ ok: true });
  }));

  router.post('/:id/:aktion', sicher(async (req, res) => {
    const t = await oder404(req.params.id);
    const nach = plan.wechsel(req.params.aktion, t);
    if (nach === 'freigegeben') {
      const liste = await store.stopps(t.id);
      if (!liste.length) throw new FahrerFehler(422, 'tour_leer', 'Tour ohne Stopps kann nicht freigegeben werden');
    }
    const von = [t.status]; // Rennen mit dem Tablet: nur wechseln, wenn der Status noch so ist
    if (!(await store.setzeStatus(t.id, req.params.aktion, von, nach, new Date(uhr())))) {
      throw new FahrerFehler(409, 'status_unpassend', 'Der Status der Tour hat sich inzwischen geändert');
    }
    res.json(tourAnsicht(await store.tourNachId(t.id)));
  }));

  return router;
}

module.exports = { erstellePlanungRouter };
