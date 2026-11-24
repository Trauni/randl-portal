/**
 * Belege und Vorgänge der Fahrer-App im Büro (#516, Grundlage für #519 Belegarchiv). Session + requireArea('fahrer.geraete').
 *
 *   GET /api/fahrer-belege?von&bis&geraet&art&storniert&lager&q   Liste (Tage im Format YYYY-MM-DD, bis einschließlich)
 *   GET /api/fahrer-belege/geraete                                 Geräte für den Filter
 *   GET /api/fahrer-belege/vorgaenge?von&bis&geraet&typ&status     Protokoll aller Ereignisse der Geräte
 *   GET /api/fahrer-belege/zu?kunde=1,2&bestellung=uuid,uuid       Belege zu Kunden/Bestellungen, ohne Zeitraum
 *   GET /api/fahrer-belege/pdf?…                                   PDF der gefilterten Liste
 *   GET /api/fahrer-belege/:nummer                                 Beleg mit Positionen, Unterschrift und Verlauf
 *   GET /api/fahrer-belege/:nummer/pdf                             Beleg als PDF
 */
const express = require('express');
const { FahrerFehler } = require('../../../services/fahrerKrypto');
const { sicher } = require('./index');
const { belegePdf, summen } = require('../../../services/fahrerBelegPdf');

const TAG = /^\d{4}-\d{2}-\d{2}$/;
const MAX_TAGE = 93;

/**
 * @param {object} deps
 * @param {object} deps.store   services/fahrerBelege.js
 * @param {() => Promise<object[]>} [deps.holeKundenstamm]  Namen für Kundennummern ohne Stopp (Lager)
 * @param {() => number} [deps.uhr]
 */
function erstelleBelegeRouter({ store, holeKundenstamm = async () => [], uhr = Date.now }) {
  const router = express.Router();

  function zeitraum(q) {
    const heute = store.berlinTag(uhr());
    const von = TAG.test(q.von || '') ? q.von : heute;
    const bis = TAG.test(q.bis || '') ? q.bis : von;
    if (bis < von) throw new FahrerFehler(400, 'zeitraum_ungueltig', '„bis“ liegt vor „von“');
    const anfang = store.berlinTagesbeginn(von), ende = store.berlinTagesbeginn(store.naechsterTag(bis));
    if ((ende - anfang) / 864e5 > MAX_TAGE) throw new FahrerFehler(400, 'zeitraum_zu_lang', `Höchstens ${MAX_TAGE} Tage auf einmal`);
    return { von: anfang, bis: ende, vonTag: von, bisTag: bis };
  }

  async function namen(zeilen) {
    if (!zeilen.some((b) => b.kunde_nr && !b.kunde_name)) return new Map();
    try { return new Map((await holeKundenstamm()).map((k) => [String(k.id), k.name])); } catch { return new Map(); }
  }

  const ansicht = (b, n) => ({
    nummer: b.ls_nummer, belegart: b.belegart, erstelltAm: b.erstellt_am, eingegangenAm: b.eingegangen_am,
    geraet: b.geraet_kennung, geraetRolle: b.geraet_rolle, fahrer: b.fahrer_name || null, verkaeufer: b.verkaeufer || null,
    tour: b.tour_id ? { id: b.tour_id, name: b.tour_name } : null,
    bestellung: b.bestell_id || b.auftrag_ref ? { id: b.bestell_id || null, ref: b.auftrag_ref || null } : null, kundeNr: b.kunde_nr || null,
    kunde: b.kunde_name || (b.kunde_nr ? n.get(String(b.kunde_nr)) || null : null), unterzeichner: b.unterzeichner || null,
    zahlart: b.zahlart || null, nettoCent: b.summe_netto_cent ?? null, bruttoCent: b.summe_brutto_cent ?? null,
    markierung: b.markierung || null, storniertAm: b.storniert_am || null, stornoGrund: b.storno_grund || null, stornoVerkaeufer: b.storno_verkaeufer || null,
    positionen: b.positionen != null && typeof b.positionen === 'number' ? b.positionen : undefined,
    menge: b.menge != null ? Number(b.menge) : undefined, leergut: b.leergut != null ? Number(b.leergut) : undefined,
  });

  const filter = (q) => ({
    geraetId: q.geraet ? Number(q.geraet) || null : null, belegart: q.art, storniert: q.storniert,
    nurLager: q.lager === '1', suche: q.q ? String(q.q).slice(0, 60) : null,
  });

  router.get('/', sicher(async (req, res) => {
    const z = zeitraum(req.query);
    const rows = await store.liste({ ...z, ...filter(req.query) });
    const n = await namen(rows);
    res.json({ von: z.vonTag, bis: z.bisTag, belege: rows.map((b) => ansicht(b, n)) });
  }));

  const liste = (v) => String(v || '').split(',').map((x) => x.trim()).filter(Boolean).slice(0, 200);

  router.get('/zu', sicher(async (req, res) => {
    const kundenNr = liste(req.query.kunde), bestellIds = liste(req.query.bestellung);
    if (!kundenNr.length && !bestellIds.length) throw new FahrerFehler(400, 'filter_fehlt', 'Kunde oder Bestellung angeben');
    const rows = await store.zuordnung({ kundenNr, bestellIds });
    const n = await namen(rows);
    res.json({ belege: rows.map((b) => ansicht(b, n)) });
  }));

  router.get('/geraete', sicher(async (req, res) => res.json(await store.geraete())));

  router.get('/vorgaenge', sicher(async (req, res) => {
    const z = zeitraum(req.query);
    const rows = await store.vorgaenge({ ...z, geraetId: req.query.geraet ? Number(req.query.geraet) : null, typ: req.query.typ || null, status: req.query.status || null });
    res.json({
      von: z.vonTag, bis: z.bisTag,
      vorgaenge: rows.map((v) => ({
        id: v.id, typ: v.typ, lfd: v.lfd, geraetZeit: v.geraet_zeit, eingegangenAm: v.eingegangen_am, status: v.status,
        fehlerCode: v.fehler_code || null, fehlerText: v.fehler_text || null, markierung: v.markierung || null,
        tourId: v.tour_id || null, stoppId: v.stopp_id || null, geraet: v.geraet_kennung, fahrer: v.fahrer_name || null,
        nummer: v.ls_nummer && v.ls_nummer !== 'null' ? v.ls_nummer : null, verkaeufer: v.verkaeufer && v.verkaeufer !== 'null' ? v.verkaeufer : null,
      })),
    });
  }));

  async function pdfSenden(res, { belege, titel, untertitel, tagesliste, datei }) {
    const pdf = await belegePdf({ titel, untertitel, belege, tagesliste, erstellt: new Date(uhr()) });
    res.set('Content-Type', 'application/pdf');
    res.set('Content-Disposition', `inline; filename="${datei}"`);
    res.send(Buffer.from(pdf));
  }

  router.get('/pdf', sicher(async (req, res) => {
    const z = zeitraum(req.query);
    const rows = await store.liste({ ...z, ...filter(req.query) });
    const pos = await store.positionenZu(rows.map((b) => b.ls_nummer));
    const n = await namen(rows);
    const belege = rows.map((b) => ({ ...b, kundeName: b.kunde_name || n.get(String(b.kunde_nr)) || null, positionen: pos.filter((p) => p.ls_nummer === b.ls_nummer) }));
    const zeit = z.vonTag === z.bisTag ? z.vonTag.split('-').reverse().join('.') : `${z.vonTag.split('-').reverse().join('.')} bis ${z.bisTag.split('-').reverse().join('.')}`;
    await pdfSenden(res, { belege, titel: `Belege ${zeit}`, untertitel: 'Fahrer-App: Touren und Lager', tagesliste: true, datei: `Belege-${z.vonTag}_${z.bisTag}.pdf` });
  }));

  router.get('/:nummer', sicher(async (req, res) => {
    const b = await store.detail(String(req.params.nummer));
    if (!b) throw new FahrerFehler(404, 'nicht_gefunden', 'Beleg nicht gefunden');
    const n = await namen([b]);
    const s = b.belegart === 'BV' ? summen(b.positionen) : null;
    res.json({
      ...ansicht(b, n),
      unterschriftPng: b.unterschrift_png || null,
      summen: s,
      positionen: b.positionen.map((p) => ({
        artikelNr: p.artikel_nr, bezeichnung: p.bezeichnung, soll: p.soll == null ? null : Number(p.soll), geliefert: Number(p.geliefert),
        leergut: Number(p.leergut), preisNettoCent: p.preis_netto_cent ?? null, mwstSatz: p.mwst_satz == null ? null : Number(p.mwst_satz),
      })),
      verlauf: b.ereignisse.map((v) => ({
        id: v.id, typ: v.typ, lfd: v.lfd, geraetZeit: v.geraet_zeit, eingegangenAm: v.eingegangen_am, status: v.status,
        fehlerCode: v.fehler_code || null, fehlerText: v.fehler_text || null, markierung: v.markierung || null, geraet: v.geraet_kennung,
      })),
    });
  }));

  router.get('/:nummer/pdf', sicher(async (req, res) => {
    const b = await store.detail(String(req.params.nummer));
    if (!b) throw new FahrerFehler(404, 'nicht_gefunden', 'Beleg nicht gefunden');
    const n = await namen([b]);
    await pdfSenden(res, {
      belege: [{ ...b, kundeName: b.kunde_name || n.get(String(b.kunde_nr)) || null }],
      titel: `${b.belegart === 'BV' ? 'Barverkauf' : 'Lieferschein'} ${b.ls_nummer}`, tagesliste: false, datei: `${b.ls_nummer}.pdf`,
    });
  }));

  return router;
}

module.exports = { erstelleBelegeRouter };
