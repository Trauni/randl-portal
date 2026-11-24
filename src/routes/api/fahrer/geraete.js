/**
 * Fahrer-App (#541), Büro: Geräte anlegen, koppeln, sperren. Session + requireArea('fahrer.geraete').
 * Rollen: tablet, notfall (an einen Fahrer gebunden), lager (#516, festes Tablet am Lager, ohne Fahrer).
 *
 *   GET   /api/fahrer-geraete                    Liste
 *   POST  /api/fahrer-geraete                    { kennung, rolle, bezeichnung?, employeeId? } → Gerät + Kopplungscode
 *   PATCH /api/fahrer-geraete/:id                { bezeichnung?, employeeId? }
 *   POST  /api/fahrer-geraete/:id/kopplungscode  neuer Code (Neuinstallation, neues Gerät mit gleicher Kennung)
 *   POST  /api/fahrer-geraete/:id/sperren        meldet sofort ab
 *   POST  /api/fahrer-geraete/:id/entsperren
 */
const express = require('express');
const { FahrerFehler, normalisiereKennung, pruefeRolle } = require('../../../services/fahrerKrypto');
const { neuerKopplungscodeFuer, sicher } = require('./index');

const ansicht = (g) => ({
  id: g.id,
  kennung: g.kennung,
  rolle: g.rolle,
  bezeichnung: g.bezeichnung,
  employeeId: g.employee_id,
  fahrerName: g.fahrer_name || null,
  gekoppelt: Boolean(g.public_key),
  gekoppeltAm: g.gekoppelt_am,
  gesperrtAm: g.gesperrt_am,
  lsStand: Number(g.ls_stand) || 0,
  bvStand: Number(g.bv_stand) || 0,
  zuletztGesehen: g.zuletzt_gesehen,
  angemeldet: g.angemeldet || null,
  codeGueltigBis: g.code_gueltig_bis || null,
});

function erstelleGeraeteRouter({ store, uhr = Date.now }) {
  const router = express.Router();

  async function pruefeMitarbeiter(employeeId) {
    if (employeeId === undefined || employeeId === null || employeeId === '') return null;
    const id = Number(employeeId);
    if (!Number.isInteger(id) || !(await store.mitarbeiterNachId(id))) throw new FahrerFehler(400, 'mitarbeiter_unbekannt', 'Mitarbeiter unbekannt');
    return id;
  }

  async function geraetOder404(id) {
    const g = await store.geraetNachId(Number(id));
    if (!g) throw new FahrerFehler(404, 'nicht_gefunden', 'Gerät nicht gefunden');
    return g;
  }

  router.get('/', sicher(async (req, res) => {
    const rows = await store.alleGeraete(new Date(uhr()));
    res.json(rows.map(ansicht));
  }));

  router.post('/', sicher(async (req, res) => {
    const kennung = normalisiereKennung(req.body?.kennung);
    const rolle = pruefeRolle(req.body?.rolle);
    // Nur ein Notfall-Handy gehört einem Fahrer. Tablet und Lager-Gerät sind für alle.
    const employeeId = rolle === 'notfall' ? await pruefeMitarbeiter(req.body?.employeeId) : null;
    const bezeichnung = String(req.body?.bezeichnung || '').trim().slice(0, 100) || null;
    const g = await store.legeGeraetAn({ kennung, rolle, bezeichnung, employeeId, erstelltVon: req.session.user?.id });
    const kopplung = await neuerKopplungscodeFuer(store, g.id, uhr());
    console.log(`[Fahrer] Gerät ${kennung} (${rolle}) angelegt von ${req.session.user?.username}`);
    res.status(201).json({ geraet: ansicht(g), kopplung });
  }));

  router.patch('/:id', sicher(async (req, res) => {
    const g = await geraetOder404(req.params.id);
    const employeeId = g.rolle !== 'notfall' ? null : 'employeeId' in (req.body || {}) ? await pruefeMitarbeiter(req.body.employeeId) : g.employee_id;
    const bezeichnung = 'bezeichnung' in (req.body || {}) ? String(req.body.bezeichnung || '').trim().slice(0, 100) || null : g.bezeichnung;
    res.json(ansicht(await store.aendereGeraet(g.id, { bezeichnung, employeeId })));
  }));

  router.post('/:id/kopplungscode', sicher(async (req, res) => {
    const g = await geraetOder404(req.params.id);
    if (g.gesperrt_am) throw new FahrerFehler(409, 'geraet_gesperrt', 'Gerät ist gesperrt, erst entsperren');
    res.json(await neuerKopplungscodeFuer(store, g.id, uhr()));
  }));

  router.post('/:id/sperren', sicher(async (req, res) => {
    const g = await geraetOder404(req.params.id);
    await store.sperreGeraet(g.id, new Date(uhr()));
    console.log(`[Fahrer] Gerät ${g.kennung} gesperrt von ${req.session.user?.username}`);
    res.json(ansicht(await store.geraetNachId(g.id)));
  }));

  router.post('/:id/entsperren', sicher(async (req, res) => {
    const g = await geraetOder404(req.params.id);
    await store.entsperreGeraet(g.id);
    console.log(`[Fahrer] Gerät ${g.kennung} entsperrt von ${req.session.user?.username}`);
    res.json(ansicht(await store.geraetNachId(g.id)));
  }));

  return router;
}

module.exports = { erstelleGeraeteRouter };
