/**
 * Fahrer-App (#542): Tagesdaten laden und Ereignisse aus der Outbox annehmen. Konzept #513 Abschnitt 5, 6 und 8.
 *
 *   GET  /api/fahrer/heute        Bearer → { datum, stand, geraet, touren, kunden, artikel, andereGeraete }
 *                                 je Tour auch ladebasis: { name, adresse } | null (#514)
 *                                 Lager-Gerät (#516): keine Touren, dafür der ganze Kundenstamm und stornoPin (nur Hash)
 *   POST /api/fahrer/ereignisse   Bearer, { ereignisse: [...] } → { ergebnisse: [{ id, status, code?, meldung?, markierung? }], lsStand }
 *
 * Ereignisse kommen so, wie die App sie in die Outbox schreibt (fahrer-app/www/speicher.js):
 *   { id: <UUID>, lfd, typ, geraet: <Kennung>, zeit: <ISO>, ...Nutzdaten in snake_case }
 * Antwort pro UUID: ok (gebucht), doppelt (war schon gebucht), fehler (fachlich abgelehnt, bleibt im Büro sichtbar).
 * Die Antwort ist immer 200, solange Anmeldung und Format des Stapels stimmen.
 *
 * Grundsatz: Ein Beleg mit Kundenunterschrift wird nie verworfen. Belege nach Büro-Ende, nach Übergabe
 * aufs Notfall-Handy oder zu stornierten Touren werden angenommen und markiert.
 *
 * Lagerverkauf (#516, Konzept #513 Abschnitt 11): Ein Lager-Gerät schickt Lieferscheine (LS-…) und Barverkäufe (BV-…,
 * eigener Nummernkreis) ohne Tour, mit kunde_nr, verkaeufer, zahlart, summen und Preisen je Position.
 * beleg.storniert storniert einen Barverkauf desselben Geräts am Tag des Verkaufs; der Beleg bleibt bestehen.
 */
const express = require('express');
const { FahrerFehler } = require('../../../services/fahrerKrypto');
const { sicher } = require('./index');

const MAX_EREIGNISSE = 200;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const BELEG_NUMMER = /^(LS|BV)-([A-Z0-9]{2,5})-(\d{4,})$/;
const TYPEN = ['tour.gestartet', 'beleg.erstellt', 'stopp.nicht_angetroffen', 'tour.beendet', 'beleg.storniert'];

/** Kalendertag in Bayern, unabhängig von der Zeitzone des Servers. */
const tagInBerlin = (ms) => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Berlin' }).format(new Date(ms));

const zahl = (v) => (v == null ? null : Number(v));
/** Text aus dem Ereignis, gekürzt; leer = null. */
const text = (v, max) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null);
/** Cent-Betrag aus dem Ereignis: ganze Zahl oder null. */
const cent = (v) => (v != null && v !== '' && Number.isFinite(Number(v)) ? Math.round(Number(v)) : null);
const id = (v) => (v == null ? null : String(v));
const ganzzahl = (v) => (v != null && v !== '' && Number.isInteger(Number(v)) ? Number(v) : null);

class Abgelehnt extends Error {
  constructor(code, meldung) {
    super(meldung);
    this.code = code;
  }
}
const ablehnen = (code, meldung) => { throw new Abgelehnt(code, meldung); };

function zeitAus(v, feld) {
  const d = new Date(v);
  if (!v || Number.isNaN(d.getTime())) ablehnen('ungueltig', `${feld} fehlt oder ist kein Zeitpunkt`);
  return d;
}

/** Markierung für Ereignisse zu einer Tour, die nicht mehr regulär auf diesem Gerät läuft. */
function markierungFuer(tour, geraetId) {
  if (!tour) return null;
  if (tour.status === 'storniert') return 'tour_storniert';
  if (tour.geraet_id && tour.geraet_id !== geraetId) return 'nach_uebergabe';
  if (tour.status === 'beendet' && tour.beendet_durch === 'buero') return 'nach_buero_ende';
  return null;
}

/**
 * @param {object} deps
 * @param {object} deps.store          Datenzugriff (services/fahrerTouren.js)
 * @param {Function} deps.requireFahrer  Bearer-Middleware aus #541
 * @param {() => Promise<object[]>} [deps.holeKundenstamm]  Lager-Gerät (#516): alle Kunden { id, name, adresse }
 * @param {() => number} [deps.uhr]    Millisekunden, für Tests
 */
function erstelleTourRouter({ store, requireFahrer, holeKundenstamm = async () => [], uhr = Date.now }) {
  // ── Fachregeln je Ereignis: liefern { aenderungen, markierung, tourId, stoppId } oder werfen Abgelehnt ──

  async function tourDesFahrers(roh, fahrer) {
    const tourId = ganzzahl(roh);
    if (tourId == null) ablehnen('ungueltig', 'tour_id fehlt');
    const t = await store.tourNachId(tourId);
    if (!t) ablehnen('tour_unbekannt', `Tour ${tourId} gibt es nicht`);
    if (t.employee_id !== fahrer.mitarbeiterId) ablehnen('fremde_tour', 'Tour gehört einem anderen Fahrer');
    return t;
  }

  async function tourGestartet(e, fahrer, zeit) {
    const t = await tourDesFahrers(e.tour_id, fahrer);
    const basis = { tourId: t.id, markierung: null };
    if (t.status === 'freigegeben') {
      return { ...basis, aenderungen: [{ art: 'tourStart', tourId: t.id, geraetId: fahrer.geraetId, zeit }] };
    }
    if (t.status === 'unterwegs' && t.geraet_id === fahrer.geraetId) return { ...basis, aenderungen: [] };
    if (t.status === 'unterwegs') ablehnen('tour_auf_anderem_geraet', `Tour läuft auf Gerät ${t.geraet_kennung || t.geraet_id}`);
    if (t.status === 'entwurf') ablehnen('nicht_freigegeben', 'Tour ist noch nicht freigegeben');
    return ablehnen(`tour_${t.status}`, `Tour ist ${t.status}`);
  }

  async function tourBeendet(e, fahrer, zeit) {
    const t = await tourDesFahrers(e.tour_id, fahrer);
    const basis = { tourId: t.id, markierung: markierungFuer(t, fahrer.geraetId) };
    if (t.status === 'unterwegs' && t.geraet_id === fahrer.geraetId) {
      return { ...basis, aenderungen: [{ art: 'tourEnde', tourId: t.id, zeit }] };
    }
    if (basis.markierung === 'nach_uebergabe') ablehnen('tour_auf_anderem_geraet', `Tour läuft auf Gerät ${t.geraet_kennung || t.geraet_id}`);
    if (t.status === 'beendet' || t.status === 'storniert') return { ...basis, aenderungen: [] };
    return ablehnen('nicht_gestartet', 'Tour wurde noch nicht gestartet');
  }

  async function stoppNichtAngetroffen(e, fahrer) {
    const t = await tourDesFahrers(e.tour_id, fahrer);
    const stoppId = ganzzahl(e.stopp_id);
    const s = stoppId != null && (await store.stoppNachId(stoppId));
    if (!s || s.tour_id !== t.id) ablehnen('stopp_unbekannt', 'Stopp gehört nicht zu dieser Tour');
    const markierung = markierungFuer(t, fahrer.geraetId);
    if (markierung === 'nach_uebergabe') ablehnen('tour_auf_anderem_geraet', `Tour läuft auf Gerät ${t.geraet_kennung || t.geraet_id}`);
    // Ein schon belieferter Stopp bleibt beliefert, der Beleg gewinnt.
    return {
      tourId: t.id, stoppId: s.id, markierung,
      aenderungen: [{ art: 'stoppStatus', stoppId: s.id, status: 'nicht_angetroffen', nurAus: ['offen'] }],
    };
  }

  function positionenAus(liste) {
    if (!Array.isArray(liste) || !liste.length) ablehnen('ungueltig', 'Beleg ohne Positionen');
    return liste.map((p, i) => {
      const bezeichnung = typeof p?.bezeichnung === 'string' ? p.bezeichnung.trim().slice(0, 160) : '';
      if (!bezeichnung) ablehnen('ungueltig', `Position ${i + 1}: Bezeichnung fehlt`);
      const werte = { soll: p.soll == null ? null : Number(p.soll), geliefert: Number(p.geliefert || 0), leergut: Number(p.leergut || 0) };
      if (Object.values(werte).some((w) => w != null && !Number.isFinite(w))) ablehnen('ungueltig', `Position ${i + 1}: Menge ist keine Zahl`);
      // Barverkauf (#516): Listenpreis je Stück und MwSt.-Satz, wie die App sie abgerechnet hat.
      return { artikelNr: p.artikelId == null ? null : String(p.artikelId), bezeichnung, ...werte, preisNettoCent: cent(p.preisNettoCent), mwstSatz: cent(p.mwstSatz) == null ? null : Number(p.mwstSatz) };
    });
  }

  /** Belege werden angenommen, sobald sie formal stimmen – egal, wie es um Tour und Stopp steht. */
  async function belegErstellt(e, fahrer, zeit) {
    const m = BELEG_NUMMER.exec(e.ls_nummer || '');
    if (!m) ablehnen('ls_ungueltig', 'Belegnummer fehlt oder hat das falsche Format');
    const [, art, kennung, laufend] = m;
    if (kennung !== fahrer.kennung) ablehnen('ls_fremde_kennung', `Belegnummer gehört nicht zu Gerät ${fahrer.kennung}`);
    if (art === 'BV' && fahrer.rolle !== 'lager') ablehnen('bv_nur_lager', 'Barverkauf gibt es nur am Lager-Gerät');
    const lager = fahrer.rolle === 'lager';
    const positionen = positionenAus(e.positionen);
    const erstellt = new Date(e.erstellt_am);
    const erstelltAm = e.erstellt_am && !Number.isNaN(erstellt.getTime()) ? erstellt : zeit;

    const tourId = ganzzahl(e.tour_id);
    const t = tourId != null ? await store.tourNachId(tourId) : null;
    const stoppId = ganzzahl(e.stopp_id);
    const s = t && stoppId != null ? await store.stoppNachId(stoppId) : null;
    const stopp = s && s.tour_id === t.id ? s : null;

    let markierung = markierungFuer(t, fahrer.geraetId);
    if (!t) markierung = e.tour_id == null ? 'ohne_tour' : 'tour_unbekannt';
    else if (!markierung && t.employee_id !== fahrer.mitarbeiterId) markierung = 'fremde_tour';

    const summen = art === 'BV' && e.summen && typeof e.summen === 'object' ? e.summen : null;
    const aenderungen = [{
      art: 'beleg',
      beleg: {
        lsNummer: e.ls_nummer, belegart: art, geraetId: fahrer.geraetId, employeeId: fahrer.mitarbeiterId,
        tourId: t ? t.id : null, stoppId: stopp ? stopp.id : null,
        // Am Lager kommt der Kunde aus der Kundensuche der App (bei BV wahlweise), auf der Tour aus dem Stopp.
        kundeNr: stopp ? stopp.kunde_nr : lager && e.kunde_nr != null ? text(String(e.kunde_nr), 20) : null,
        erstelltAm, unterzeichner: typeof e.unterzeichner === 'string' ? e.unterzeichner.slice(0, 120) : null,
        unterschriftPng: typeof e.unterschrift_png === 'string' ? e.unterschrift_png : null, markierung,
        verkaeufer: lager ? text(e.verkaeufer, 60) : null, zahlart: art === 'BV' ? 'bar' : null,
        summeNettoCent: summen ? cent(summen.nettoCent) : null, summeBruttoCent: summen ? cent(summen.bruttoCent) : null,
      },
      positionen,
    }];
    // Storno gilt nur für Stopps ohne Beleg: Ein Beleg macht den Stopp immer zu „beliefert“.
    if (stopp) aenderungen.push({ art: 'stoppStatus', stoppId: stopp.id, status: 'beliefert', nurAus: ['offen', 'nicht_angetroffen', 'storniert'] });
    aenderungen.push({ art: art === 'BV' ? 'bvStand' : 'lsStand', geraetId: fahrer.geraetId, stand: Number(laufend) });
    return { tourId: t ? t.id : null, stoppId: stopp ? stopp.id : null, markierung, aenderungen };
  }

  /**
   * Storno eines Barverkaufs (#516, Konzept 11.7): nur BV, nur vom Gerät, das ihn erstellt hat, nur einmal und nur am
   * Kalendertag des Verkaufs (deutsche Zeit, Gerätezeiten). Die Sonder-PIN hat die App geprüft. Der Beleg bleibt bestehen.
   */
  async function belegStorniert(e, fahrer, zeit) {
    if (fahrer.rolle !== 'lager') ablehnen('bv_nur_lager', 'Stornieren gibt es nur am Lager-Gerät');
    const m = BELEG_NUMMER.exec(e.ls_nummer || '');
    if (!m || m[1] !== 'BV') ablehnen('ls_ungueltig', 'Nur ein Barverkauf (BV-…) lässt sich stornieren');
    const b = await store.belegNachNummer(e.ls_nummer);
    if (!b) ablehnen('beleg_unbekannt', `Barverkauf ${e.ls_nummer} ist im Portal nicht bekannt`);
    if (b.geraet_id !== fahrer.geraetId) ablehnen('ls_fremde_kennung', 'Barverkauf stammt von einem anderen Gerät');
    if (b.storniert_am) ablehnen('schon_storniert', 'Barverkauf ist schon storniert');
    const grund = text(e.grund, 200);
    if (!grund) ablehnen('ungueltig', 'Grund fehlt');
    const storniertAm = e.storniert_am ? zeitAus(e.storniert_am, 'storniert_am') : zeit;
    if (tagInBerlin(storniertAm.getTime()) !== tagInBerlin(new Date(b.erstellt_am).getTime())) {
      ablehnen('storno_zu_spaet', 'Stornieren geht nur am Tag des Verkaufs');
    }
    return {
      tourId: null, stoppId: null, markierung: null,
      aenderungen: [{ art: 'storno', lsNummer: b.ls_nummer, storniertAm, grund, verkaeufer: text(e.verkaeufer, 60) }],
    };
  }

  const REGELN = {
    'tour.gestartet': tourGestartet,
    'tour.beendet': tourBeendet,
    'stopp.nicht_angetroffen': stoppNichtAngetroffen,
    'beleg.erstellt': belegErstellt,
    'beleg.storniert': belegStorniert,
  };

  /** Ein Ereignis bewerten und buchen. Gibt den Eintrag für die Antwort zurück. */
  async function verarbeite(e, fahrer, jetzt) {
    if (await store.ereignisStatus(e.id) === 'ok') return { id: e.id, status: 'doppelt' };

    const ereignis = {
      uuid: e.id, geraetId: fahrer.geraetId, employeeId: fahrer.mitarbeiterId, typ: String(e.typ || '').slice(0, 40),
      lfd: ganzzahl(e.lfd), geraetZeit: null, tourId: ganzzahl(e.tour_id), stoppId: ganzzahl(e.stopp_id),
      status: 'ok', fehlerCode: null, fehlerText: null, markierung: null, payload: JSON.stringify(e), eingegangenAm: jetzt,
    };
    const fehler = async (code, meldung) => {
      const r = await store.bucheEreignis({ ereignis: { ...ereignis, status: 'fehler', fehlerCode: code, fehlerText: String(meldung).slice(0, 255) } });
      return r === 'doppelt' ? { id: e.id, status: 'doppelt' } : { id: e.id, status: 'fehler', code, meldung };
    };

    let ergebnis;
    try {
      if (!TYPEN.includes(e.typ)) ablehnen('typ_unbekannt', `Unbekannter Ereignistyp ${e.typ}`);
      if (e.geraet !== fahrer.kennung) ablehnen('falsches_geraet', `Ereignis stammt von ${e.geraet}, angemeldet ist ${fahrer.kennung}`);
      if (ereignis.lfd == null || ereignis.lfd < 1) ablehnen('ungueltig', 'lfd fehlt');
      ereignis.geraetZeit = zeitAus(e.zeit, 'zeit');
      ergebnis = await REGELN[e.typ](e, fahrer, ereignis.geraetZeit);
    } catch (err) {
      if (err instanceof Abgelehnt) return fehler(err.code, err.message);
      throw err;
    }

    try {
      const r = await store.bucheEreignis({
        ereignis: { ...ereignis, tourId: ergebnis.tourId ?? ereignis.tourId, stoppId: ergebnis.stoppId ?? ereignis.stoppId, markierung: ergebnis.markierung },
        aenderungen: ergebnis.aenderungen,
      });
      if (r === 'doppelt') return { id: e.id, status: 'doppelt' };
    } catch (err) {
      if (err instanceof FahrerFehler && err.code === 'ls_doppelt') return fehler(err.code, err.message);
      throw err;
    }
    return ergebnis.markierung ? { id: e.id, status: 'ok', markierung: ergebnis.markierung } : { id: e.id, status: 'ok' };
  }

  /**
   * Tagesdaten für ein Lager-Gerät (#516, Konzept 11.4): keine Touren, alle aktiven Artikel, der ganze Kundenstamm
   * (#612) und die Sonder-PIN fürs Storno nur als Hash. Ist der Shop nicht erreichbar, schlägt der Abruf fehl:
   * Die App behält dann ihren alten Stand, statt mit leerer Kundenliste weiterzumachen.
   */
  async function heuteLager(fahrer, jetztMs, datum) {
    const [artikel, staende, kundenRoh, pin] = await Promise.all([
      store.artikel([]), store.staende(fahrer.geraetId), holeKundenstamm(), store.einstellung('storno_pin'),
    ]);
    return {
      datum,
      stand: new Date(jetztMs).toISOString(),
      geraet: { kennung: fahrer.kennung, lsStand: staende.lsStand, bvStand: staende.bvStand },
      touren: [],
      kunden: kundenRoh.map((k) => ({ id: String(k.id), name: k.name, adresse: k.adresse || null, hinweise: null })),
      artikelStand: artikelStand(artikel),
      artikel: artikel.map(artikelFuerApp),
      andereGeraete: [],
      stornoPin: pinFuerApp(pin),
    };
  }

  const router = express.Router();

  router.post('/ereignisse', requireFahrer, sicher(async (req, res) => {
    const liste = req.body?.ereignisse;
    if (!Array.isArray(liste)) throw new FahrerFehler(400, 'ungueltig', 'ereignisse fehlt');
    if (liste.length > MAX_EREIGNISSE) throw new FahrerFehler(413, 'zu_viele', `Höchstens ${MAX_EREIGNISSE} Ereignisse pro Aufruf`);
    const jetzt = new Date(uhr());

    // Ohne gültige UUID gibt es nichts zu buchen und nichts zu bestätigen: nur melden.
    const gueltig = [];
    const ergebnisse = new Array(liste.length);
    liste.forEach((e, i) => {
      if (e && typeof e === 'object' && typeof e.id === 'string' && UUID.test(e.id)) gueltig.push({ e, i });
      else ergebnisse[i] = { id: e?.id ?? null, status: 'fehler', code: 'ungueltig', meldung: 'Ereignis ohne gültige UUID' };
    });
    // Der Reihe nach (laufende Nummer pro Gerät): Ein Beleg geht nie vor dem Start seiner Tour.
    gueltig.sort((a, b) => (ganzzahl(a.e.lfd) ?? 0) - (ganzzahl(b.e.lfd) ?? 0) || a.i - b.i);
    for (const { e, i } of gueltig) ergebnisse[i] = await verarbeite(e, req.fahrer, jetzt);

    const n = ergebnisse.reduce((z, r) => ({ ...z, [r.status]: (z[r.status] || 0) + 1 }), {});
    console.log(`[Fahrer] ${req.fahrer.kennung}: ${liste.length} Ereignisse (${Object.entries(n).map(([k, v]) => `${v} ${k}`).join(', ')})`);
    const staende = await store.staende(req.fahrer.geraetId);
    res.json({ ergebnisse, lsStand: staende.lsStand, bvStand: staende.bvStand });
  }));

  router.get('/heute', requireFahrer, sicher(async (req, res) => {
    const jetztMs = uhr();
    const datum = tagInBerlin(jetztMs);
    if (req.fahrer.rolle === 'lager') return res.json(await heuteLager(req.fahrer, jetztMs, datum));
    const alle = await store.ladbareTouren(req.fahrer.mitarbeiterId, datum);
    // Läuft eine Tour schon auf einem anderen Gerät, lädt dieses Gerät sie nicht (Übernahme kommt mit #544).
    const touren = alle.filter((t) => !t.geraet_id || t.geraet_id === req.fahrer.geraetId);
    const andere = alle.filter((t) => t.geraet_id && t.geraet_id !== req.fahrer.geraetId);

    const stopps = await store.stoppsZuTouren(touren.map((t) => t.id));
    const positionen = await store.positionenZuStopps(stopps.map((s) => s.id));
    const [artikel, lsStand] = await Promise.all([
      store.artikel(positionen.map((p) => p.artikel_nr)),
      store.lsStand(req.fahrer.geraetId),
    ]);

    const kunden = new Map();
    for (const s of stopps) {
      if (!kunden.has(s.kunde_nr)) kunden.set(s.kunde_nr, { id: s.kunde_nr, name: s.kunde_name, adresse: s.kunde_adresse || null, hinweise: s.hinweise || null });
    }

    res.json({
      datum,
      stand: new Date(jetztMs).toISOString(),
      geraet: { kennung: req.fahrer.kennung, lsStand },
      touren: touren.map((t) => ({
        id: id(t.id), name: t.bezeichnung, datum: t.datum, fahrer: t.fahrer_name || null, fahrzeug: t.fahrzeug || null,
        status: t.status, version: id(t.version),
        ladebasis: ladebasisFuerApp(t),
        stopps: stopps.filter((s) => s.tour_id === t.id).map((s) => ({
          id: id(s.id), reihenfolge: s.reihenfolge, auftragId: s.auftrag_ref || null, kundeId: s.kunde_nr,
          lieferzeit: s.lieferzeit || null, status: s.status,
          positionen: positionen.filter((p) => p.stopp_id === s.id).map((p) => ({ id: id(p.id), artikelId: p.artikel_nr, sollMenge: zahl(p.soll_menge) })),
        })),
      })),
      kunden: [...kunden.values()],
      artikelStand: artikelStand(artikel),
      artikel: artikel.map(artikelFuerApp),
      andereGeraete: andere.map((t) => ({ tourId: id(t.id), name: t.bezeichnung, kennung: t.geraet_kennung || null })),
    });
  }));

  return router;
}

/** Sonder-PIN (#516) für die App: nur Verfahren, Runden, Salz und Hash. null = noch keine PIN erzeugt. */
function pinFuerApp(roh) {
  if (!roh) return null;
  try {
    const p = typeof roh === 'string' ? JSON.parse(roh) : roh;
    return p && p.hash ? { verfahren: p.verfahren, runden: p.runden, salz: p.salz, hash: p.hash } : null;
  } catch {
    return null;
  }
}

/** Ladebasis der Tour für die Kopfzeile des Beförderungspapiers (#514); null, wenn keine zugeordnet ist. */
const ladebasisFuerApp = (t) => (t.ladebasis_name ? { name: t.ladebasis_name, adresse: t.ladebasis_adresse || null } : null);

/** „UN 1965 · Klasse 2.1“ für Anzeige und Ladeliste; leer, wenn der Artikel kein Gefahrgut ist. */
function druckText(a) {
  const teile = [];
  if (a.un_nr) teile.push(`UN ${a.un_nr}`);
  if (a.gefahrklasse) teile.push(`Klasse ${a.gefahrklasse}`);
  return teile.join(' · ');
}

function artikelFuerApp(a) {
  return {
    id: a.artikel_nr, bezeichnung: a.bezeichnung, typ: a.typ || null, aktiv: a.aktiv == null ? true : Boolean(a.aktiv),
    gasart: a.gasart || null, kategorie: a.kategorie || null, faktor: zahl(a.kg_fuellung), druckText: druckText(a),
    unNr: a.un_nr || null, gefahrklasse: a.gefahrklasse || null, ggvsFaktor: zahl(a.ggvs_faktor), befoerderungskategorie: zahl(a.befoerderungskategorie),
    adrBezeichnung: a.bezadr || null,
    fuellgewichtKg: zahl(a.fuellgewicht_kg), fuellmenge: zahl(a.fuellmenge), fuellmengeEinheit: a.fuellmenge_einheit || null,
    inhaltL: a.fuellmenge_einheit === 'l' ? zahl(a.fuellmenge) : null,
    preisNettoCent: zahl(a.preis_netto_cent), mwstSatz: zahl(a.mwst_satz), pfandArtikelId: a.pfand_artikel_nr || null,
    kaufflascheArtikelId: a.kaufflasche_artikel_nr || null,
  };
}

/** Jüngste Änderung im Stamm – damit die App später nur bei Änderung neu lädt. */
function artikelStand(artikel) {
  const zeiten = artikel.map((a) => a.geaendert_am && new Date(a.geaendert_am).getTime()).filter(Number.isFinite);
  return zeiten.length ? new Date(Math.max(...zeiten)).toISOString() : null;
}

module.exports = { erstelleTourRouter, artikelFuerApp, tagInBerlin, pinFuerApp, MAX_EREIGNISSE };
