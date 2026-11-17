/**
 * Fahrer-App (#514), Büro: Ladebasen pflegen und der Tour zuordnen. Session + requireArea('fahrer.geraete').
 *
 *   GET   /api/fahrer-ladebasen                 Liste (auch deaktivierte)
 *   POST  /api/fahrer-ladebasen                 { name, adresse?, sortierung? }
 *   PATCH /api/fahrer-ladebasen/:id             { name?, adresse?, aktiv?, sortierung? }  (Deaktivieren statt Löschen)
 *   PUT   /api/fahrer-ladebasen/touren/:tourId  { ladebasisId | null }
 */
const express = require('express');
const { FahrerFehler } = require('../../../services/fahrerKrypto');
const { sicher } = require('./index');

const ansicht = (b) => ({ id: b.id, name: b.name, adresse: b.adresse || null, aktiv: Boolean(b.aktiv), sortierung: Number(b.sortierung) || 0 });
const text = (v, max) => String(v ?? '').trim().slice(0, max);

function erstelleLadebasenRouter({ store }) {
  const router = express.Router();

  async function oder404(id) {
    const b = await store.nachId(Number(id));
    if (!b) throw new FahrerFehler(404, 'nicht_gefunden', 'Ladebasis nicht gefunden');
    return b;
  }

  const sortierungAus = (v, alt = 0) => (v === undefined || v === '' ? alt : Number.isInteger(Number(v)) ? Number(v) : alt);

  router.get('/', sicher(async (req, res) => res.json((await store.alle()).map(ansicht))));

  router.post('/', sicher(async (req, res) => {
    const name = text(req.body?.name, 80);
    if (!name) throw new FahrerFehler(400, 'ungueltig', 'Name fehlt');
    const b = await store.legeAn({ name, adresse: text(req.body?.adresse, 200) || null, sortierung: sortierungAus(req.body?.sortierung) });
    res.status(201).json(ansicht(b));
  }));

  router.patch('/:id', sicher(async (req, res) => {
    const alt = await oder404(req.params.id);
    const k = req.body || {};
    const name = 'name' in k ? text(k.name, 80) : alt.name;
    if (!name) throw new FahrerFehler(400, 'ungueltig', 'Name fehlt');
    const b = await store.aendere(alt.id, {
      name,
      adresse: 'adresse' in k ? text(k.adresse, 200) || null : alt.adresse,
      aktiv: 'aktiv' in k ? Boolean(k.aktiv) : Boolean(alt.aktiv),
      sortierung: 'sortierung' in k ? sortierungAus(k.sortierung, alt.sortierung) : alt.sortierung,
    });
    res.json(ansicht(b));
  }));

  router.put('/touren/:tourId', sicher(async (req, res) => {
    const tourId = Number(req.params.tourId);
    if (!Number.isInteger(tourId)) throw new FahrerFehler(400, 'ungueltig', 'Tour-ID ungültig');
    const roh = req.body?.ladebasisId;
    let ladebasisId = null;
    if (roh !== null && roh !== undefined) {
      const b = await oder404(roh);
      if (!b.aktiv) throw new FahrerFehler(400, 'ladebasis_inaktiv', 'Ladebasis ist deaktiviert');
      ladebasisId = b.id;
    }
    if (!(await store.setzeFuerTour(tourId, ladebasisId))) throw new FahrerFehler(404, 'tour_nicht_aenderbar', 'Tour gibt es nicht oder ist beendet/storniert');
    res.json({ tourId, ladebasisId });
  }));

  return router;
}

module.exports = { erstelleLadebasenRouter, ansicht };
