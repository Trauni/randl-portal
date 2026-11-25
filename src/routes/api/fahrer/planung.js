/**
 * Fahrer-App (#518), Büro: Touren anlegen, Bestellungen zuordnen, sortieren, freigeben. Session + requireArea('fahrer.geraete').
 *
 *   GET    /api/fahrer-touren?von=&bis=              Touren (Standard: heute bis +14 Tage)
 *   POST   /api/fahrer-touren                        { datum, bezeichnung, employeeId, fahrzeug?, ladebasisId? }
 *   GET    /api/fahrer-touren/fahrer                 Fahrer-Auswahl (aktive Mitarbeiter)
 *   GET    /api/fahrer-touren/kunden?q=              Kundensuche für Vorlagen (ab 2 Zeichen, nur Kunden mit Nummer)
 *   GET    /api/fahrer-touren/offene-bestellungen    Bestellungen, die in keiner aktiven Tour stecken
 *   GET    /api/fahrer-touren/vorlagen               Vorlagen mit Kunden in Reihenfolge
 *   POST   /api/fahrer-touren/vorlagen               { name, employeeId, fahrzeug?, ladebasisId?, kunden: [{ kundeNr, kundeName, lieferzeit?, hinweise? }] }
 *   PUT    /api/fahrer-touren/vorlagen/:vid          dasselbe, ersetzt die Vorlage
 *   DELETE /api/fahrer-touren/vorlagen/:vid
 *   POST   /api/fahrer-touren/aus-vorlage            { vorlageId, datum, bezeichnung? } → { tour, uebernommen, ohneBestellung, fehler }
 *   POST   /api/fahrer-touren/:id/als-vorlage        { name } – Vorlage aus den Stopps dieser Tour
 *   GET    /api/fahrer-touren/:id                    Tour mit Stopps
 *   PATCH  /api/fahrer-touren/:id                    Kopfdaten (nur Entwurf)
 *   DELETE /api/fahrer-touren/:id                    nur leere oder stornierte Tour
 *   GET    /api/fahrer-touren/:id/ladeliste         Ladeliste: Flaschen, Menge, Punkte nach ADR 1.1.3.6, erwartetes Leergut (#607)
 *   GET    /api/fahrer-touren/:id/zuladungen        Vom Fahrer unterwegs zugeladene Ware (tour.zugeladen, #639)
 *   GET    /api/fahrer-touren/:id/bestand           Fahrzeugbestand: geladen, zugeladen, geliefert, voll und Leergut an Bord, ADR-Punkte (#639)
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
const { rechneLadeliste, adrLuecken } = require('../../../services/fahrerLadeliste');
const { zuladungenAnsicht } = require('../../../services/fahrerZuladungen');
const { rechneBestand } = require('../../../services/fahrerBestand');
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
 * @param {(q: string) => Promise<object[]>} [deps.sucheKunden]  Kundensuche in der Shop-API (nur lesen)
 * @param {(id: string) => Promise<object|null>} [deps.holeKunde]  Kundenzeile aus der Shop-API (nur lesen), für die Adresse
 * @param {boolean} [deps.erledigteAkzeptierte]  Testphase: erledigte, von SER akzeptierte Bestellungen bleiben wählbar
 * @param {() => number} [deps.uhr]       Millisekunden, für Tests
 */
function erstellePlanungRouter({ store, holeBestellungen, sucheKunden = async () => [], holeKunde = async () => null, erledigteAkzeptierte = false, uhr = Date.now }) {
  const istOffen = (b, belegt) => plan.istOffen(b, belegt, { erledigteAkzeptierte });

  // Adresse aus dem Kundenstamm nachladen, wenn die Bestellung keine eigene Lieferadresse hat. Kurz gemerkt, damit die Liste nicht je Aufruf alle Kunden holt.
  const kundenCache = new Map();
  const KUNDEN_TTL_MS = 10 * 60 * 1000;
  async function kundeZu(customerId) {
    const alt = kundenCache.get(customerId);
    if (alt && uhr() - alt.zeit < KUNDEN_TTL_MS) return alt.kunde;
    let kunde = null;
    try { kunde = (await holeKunde(customerId)) || null; } catch { return null; } // Shop kurz nicht erreichbar: Adresse bleibt leer, nichts merken
    kundenCache.set(customerId, { kunde, zeit: uhr() });
    return kunde;
  }
  async function mitAdresse(bestellungen) {
    const offene = bestellungen.filter((b) => b.customer_id && !b.delivery_strasse);
    const ids = [...new Set(offene.map((b) => b.customer_id))];
    const kunden = new Map();
    for (let i = 0; i < ids.length; i += 8) {
      await Promise.all(ids.slice(i, i + 8).map(async (id) => kunden.set(id, await kundeZu(id))));
    }
    return bestellungen.map((b) => (kunden.get(b.customer_id) ? { ...b, kunde: kunden.get(b.customer_id) } : b));
  }
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

  router.get('/fahrer', sicher(async (req, res) => res.json(await store.fahrer())));

  router.get('/kunden', sicher(async (req, res) => {
    const q = text(req.query.q, 60);
    if (q.length < 2) return res.json([]);
    res.json((await sucheKunden(q)).map(plan.kundeAnsicht).filter(Boolean));
  }));

  router.get('/offene-bestellungen', sicher(async (req, res) => {
    const belegt = await store.belegteBestellungen();
    const offen = await mitAdresse((await holeBestellungen()).filter((b) => b && b.id != null && istOffen(b, belegt)));
    const ansicht = offen.map(plan.bestellAnsicht);
    // #607: Hinweis an Bestellungen, deren Artikel für die Ladeliste noch ADR-Angaben brauchen
    const stamm = store.artikelFuerLadeliste ? await store.artikelFuerLadeliste(ansicht.flatMap((b) => b.positionen.map((p) => p.artikelNr))) : null;
    res.json(stamm ? ansicht.map((b) => ({ ...b, adrFehlt: adrLuecken(b.positionen.map((p) => p.artikelNr), stamm) })) : ansicht);
  }));

  // ── Vorlagen (müssen vor '/:id' stehen) ──
  const vorlageAnsicht = (v) => ({
    id: v.id, name: v.name, employeeId: v.employee_id, fahrerName: v.fahrer_name || null, fahrzeug: v.fahrzeug || null,
    ladebasisId: v.ladebasis_id ?? null, ladebasisName: v.ladebasis_name || null,
    kunden: v.kunden.map((k) => ({ kundeNr: k.kunde_nr, kundeName: k.kunde_name, lieferzeit: k.lieferzeit || null, hinweise: k.hinweise || null })),
  });

  function vorlageAus(k) {
    const name = text(k.name, 120);
    if (!name) throw new FahrerFehler(400, 'ungueltig', 'Name der Vorlage fehlt');
    const employeeId = ganzzahl(k.employeeId);
    if (employeeId == null) throw new FahrerFehler(400, 'ungueltig', 'Fahrer fehlt');
    const kunden = (Array.isArray(k.kunden) ? k.kunden : []).map((x) => ({
      kundeNr: text(x?.kundeNr, 20), kundeName: text(x?.kundeName, 160), lieferzeit: text(x?.lieferzeit, 60) || null, hinweise: text(x?.hinweise, 500) || null,
    }));
    if (kunden.some((x) => !x.kundeNr || !x.kundeName)) throw new FahrerFehler(400, 'ungueltig', 'Kunde ohne Nummer oder Name');
    if (new Set(kunden.map((x) => x.kundeNr)).size !== kunden.length) throw new FahrerFehler(400, 'ungueltig', 'Kunde kommt doppelt vor');
    return { name, employeeId, fahrzeug: text(k.fahrzeug, 40) || null, ladebasisId: ganzzahl(k.ladebasisId), kunden };
  }

  router.get('/vorlagen', sicher(async (req, res) => res.json((await store.vorlagen()).map(vorlageAnsicht))));

  router.post('/vorlagen', sicher(async (req, res) => {
    const id = await store.speichereVorlage(null, vorlageAus(req.body || {}));
    res.status(201).json(vorlageAnsicht(await store.vorlageNachId(id)));
  }));

  router.put('/vorlagen/:vid', sicher(async (req, res) => {
    const id = ganzzahl(req.params.vid);
    if (id == null || !(await store.vorlageNachId(id))) throw new FahrerFehler(404, 'vorlage_nicht_gefunden', 'Vorlage nicht gefunden');
    await store.speichereVorlage(id, vorlageAus(req.body || {}));
    res.json(vorlageAnsicht(await store.vorlageNachId(id)));
  }));

  router.delete('/vorlagen/:vid', sicher(async (req, res) => {
    if (!(await store.loescheVorlage(ganzzahl(req.params.vid)))) throw new FahrerFehler(404, 'vorlage_nicht_gefunden', 'Vorlage nicht gefunden');
    res.json({ ok: true });
  }));

  /** Neue Tour aus Vorlage: Fahrer, Fahrzeug, Ladebasis aus der Vorlage; Stopps aus den offenen Bestellungen der Stammkunden. */
  router.post('/aus-vorlage', sicher(async (req, res) => {
    const vorlage = await store.vorlageNachId(ganzzahl(req.body?.vorlageId));
    if (!vorlage) throw new FahrerFehler(404, 'vorlage_nicht_gefunden', 'Vorlage nicht gefunden');
    const datum = text(req.body?.datum, 10);
    if (!DATUM.test(datum)) throw new FahrerFehler(400, 'ungueltig', 'Datum fehlt (JJJJ-MM-TT)');
    const belegt = await store.belegteBestellungen();
    const vorlagenKunden = new Set(vorlage.kunden.map((k) => k.kunde_nr));
    const passende = (await holeBestellungen()).filter((b) => b && b.id != null && istOffen(b, belegt) && vorlagenKunden.has(plan.bestellAnsicht(b).kundeNr));
    const offen = await mitAdresse(passende);
    const { stopps, ohneBestellung, fehler } = plan.stoppsAusVorlage(vorlage.kunden, offen);
    const fehlen = new Set(await store.unbekannteArtikel([...new Set(stopps.flatMap((s) => s.positionen.map((p) => p.artikelNr)))]));
    const t = await store.legeAn({
      datum, bezeichnung: text(req.body?.bezeichnung, 120) || vorlage.name, employeeId: vorlage.employee_id,
      fahrzeug: vorlage.fahrzeug, ladebasisId: vorlage.ladebasis_id, erstelltVon: req.session?.user?.id ?? null,
    });
    let uebernommen = 0;
    for (const s of stopps) {
      const unbekannt = s.positionen.filter((p) => fehlen.has(p.artikelNr)).map((p) => p.artikelNr);
      if (unbekannt.length) { fehler.push({ bestellId: s.bestellId, kundeNr: s.kundeNr, grund: `Artikel nicht im Stamm: ${unbekannt.join(', ')}` }); continue; }
      try {
        await store.fuegeStoppHinzu(t.id, s);
        uebernommen += 1;
      } catch (err) {
        if (!(err instanceof FahrerFehler)) throw err;
        fehler.push({ bestellId: s.bestellId, kundeNr: s.kundeNr, grund: err.message });
      }
    }
    res.status(201).json({ tour: tourAnsicht(await store.tourNachId(t.id)), uebernommen, ohneBestellung, fehler });
  }));

  /** Vorlage aus einer vorhandenen Tour: Fahrer, Fahrzeug, Ladebasis und die Kunden in Stopp-Reihenfolge. */
  router.post('/:id/als-vorlage', sicher(async (req, res) => {
    const t = await oder404(req.params.id);
    const kunden = plan.vorlageKundenAusStopps(await store.stopps(t.id));
    if (!kunden.length) throw new FahrerFehler(422, 'tour_leer', 'Tour ohne Stopps kann keine Vorlage werden');
    const id = await store.speichereVorlage(null, vorlageAus({
      name: req.body?.name, employeeId: t.employee_id, fahrzeug: t.fahrzeug, ladebasisId: t.ladebasis_id, kunden,
    }));
    res.status(201).json(vorlageAnsicht(await store.vorlageNachId(id)));
  }));

  router.get('/:id', sicher(async (req, res) => {
    const t = await oder404(req.params.id);
    res.json({ ...tourAnsicht(t), stoppListe: (await store.stopps(t.id)).map(stoppAnsicht) });
  }));

  router.get('/:id/ladeliste', sicher(async (req, res) => {
    const t = await oder404(req.params.id);
    const stoppListe = await store.stopps(t.id);
    const nummern = stoppListe.flatMap((s) => s.positionen.map((p) => p.artikelNr));
    const artikel = await store.artikelFuerLadeliste(nummern);
    res.json(rechneLadeliste(stoppListe.map((s) => ({ id: s.id, kundeName: s.kunde_name, positionen: s.positionen })), artikel));
  }));

  router.get('/:id/zuladungen', sicher(async (req, res) => {
    const t = await oder404(req.params.id);
    res.json(zuladungenAnsicht(await store.zuladungen(t.id)));
  }));

  router.get('/:id/bestand', sicher(async (req, res) => {
    const t = await oder404(req.params.id);
    const [stoppListe, ereignisse, geliefert] = await Promise.all([store.stopps(t.id), store.zuladungen(t.id), store.geliefertJeArtikel(t.id)]);
    const zugeladen = zuladungenAnsicht(ereignisse).summe;
    const nummern = [...stoppListe.flatMap((s) => s.positionen.map((p) => p.artikelNr)), ...zugeladen.map((z) => z.artikelNr), ...geliefert.map((g) => g.artikelNr)];
    const artikel = await store.artikelFuerLadeliste(nummern);
    res.json(rechneBestand({ stopps: stoppListe, zugeladen, geliefert, artikel }));
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
    const gewaehlt = new Set(ids);
    const alle = new Map((await mitAdresse((await holeBestellungen()).filter((b) => gewaehlt.has(String(b.id))))).map((b) => [String(b.id), b]));
    const belegt = await store.belegteBestellungen();
    // Erst alles prüfen und umbauen, dann buchen: Fehler in der dritten Bestellung lassen keine halbe Auswahl zurück.
    const stopps = ids.map((id) => {
      const b = alle.get(id);
      if (!b || !istOffen(b, belegt)) throw new FahrerFehler(409, 'bestellung_nicht_offen', `Bestellung ${id} ist nicht (mehr) offen`);
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
