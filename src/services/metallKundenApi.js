/**
 * Daten fuer den Metall-Kundenbereich im Gas-Shop (#373). Aufruf nur ueber den internen
 * Listener (routes/internal/metall.js), nie aus dem Browser.
 *
 * Der Kunde wird ueber seine Lexware-Kontakt-ID bestimmt (gas-db customers.lexware_id =
 * metall_kunde.lexware_kontakt_id). Ob er Metall sehen darf (Freigabe, nicht gesperrt),
 * prueft der Gas-Shop vor dem Aufruf; hier zaehlt zusaetzlich der Merker (metall_kunde.aktiv).
 *
 * Sichtbar fuer Kunden (Entscheidung 16.10.2026):
 *   - Belege nur fertig: kein Entwurf, nicht storniert, nicht archiviert, mit Belegnummer.
 *   - Abgebrochene Vorgaenge erscheinen als „Storniert“ (Gruppe abgeschlossen).
 *   - Dateien nur mit fuer_kunde_sichtbar = 1 und nicht geloescht.
 * Interne Felder (Zuordnung, Mitarbeiter, Lexware-IDs, Notizen) gehen nie raus.
 */

const { baueKette, berechneStatus, statusleiste, fertigungsStufe, letzteAenderung } = require('./metallAuftraege');

const ART = { quotation: 'AN', orderconfirmation: 'AB', deliverynote: 'LS', invoice: 'RE' };
const NUMMER_RE = /^V-\d{2}-\d{4,}$/;

function fehler(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

/** Fuer Kunden sichtbar: fertig, nicht storniert, nicht archiviert, mit Nummer */
const sichtbar = b => !!b && !b.archiviert && b.belegstatus !== 'voided' && b.belegstatus !== 'draft' && !!b.belegnummer;

/** Status aus Kundensicht: abgebrochen → „Storniert“, sonst wie im Portal */
function kundenStatus(v, kette) {
  if (v.abgebrochen_am) return { code: 'storniert', text: 'Storniert', gruppe: 'abgeschlossen', ton: 'neutral' };
  return berechneStatus(v, kette);
}

const belegZeile = b => ({
  id: b.id,
  art: ART[b.belegart],
  nr: b.belegnummer,
  datum: b.belegdatum,
  status: b.belegstatus,
  betrag_netto: b.betrag_netto == null ? null : Number(b.betrag_netto),
  betrag_brutto: b.betrag_brutto == null ? null : Number(b.betrag_brutto),
});

async function ladeKunde(pool, lexwareId) {
  if (!lexwareId || typeof lexwareId !== 'string' || lexwareId.length > 64) throw fehler(404, 'Kunde nicht gefunden');
  const [[kunde]] = await pool.execute('SELECT id, name, kdnr FROM metall_kunde WHERE lexware_kontakt_id = ? AND aktiv = 1', [lexwareId]);
  if (!kunde) throw fehler(404, 'Kunde nicht gefunden');
  return kunde;
}

/** Vorgaenge des Kunden mit ihren Belegen (Angebot ueber angebot_beleg_id, Rest ueber vorgang_id) */
async function ladeVorgaenge(pool, kundeId, vorgangsnummer = null) {
  const [vorgaenge] = await pool.query(
    `SELECT v.id, v.vorgangsnummer, v.bezeichnung, v.kunden_bestellnr, v.herkunft, v.erstellt_am,
            v.angebot_beleg_id, v.vorlage_vorgang_id, v.fertigung_begonnen_am, v.fertigung_am, v.abgebrochen_am,
            vl.vorgangsnummer AS vorlage_nr
     FROM metall_vorgang v LEFT JOIN metall_vorgang vl ON vl.id = v.vorlage_vorgang_id
     WHERE v.kunde_id = ?${vorgangsnummer ? ' AND v.vorgangsnummer = ?' : ''}
     ORDER BY v.id DESC`,
    vorgangsnummer ? [kundeId, vorgangsnummer] : [kundeId]
  );
  if (!vorgaenge.length) return [];
  const ids = vorgaenge.map(v => v.id);
  const anIds = vorgaenge.map(v => v.angebot_beleg_id).filter(Boolean);
  const [belege] = await pool.query(
    `SELECT id, vorgang_id, belegart, belegnummer, belegstatus, archiviert, belegdatum, betrag_netto, betrag_brutto,
            lexware_geaendert_am
     FROM metall_beleg WHERE vorgang_id IN (?)${anIds.length ? ' OR id IN (?)' : ''}`,
    anIds.length ? [ids, anIds] : [ids]
  );
  const byId = new Map(belege.map(b => [b.id, b]));
  return vorgaenge.map(v => {
    const angebot = v.angebot_beleg_id ? byId.get(v.angebot_beleg_id) : undefined;
    const eigene = belege.filter(b => b.vorgang_id === v.id && b.belegart !== 'quotation');
    const zeigen = [angebot, ...eigene].filter(sichtbar);
    const kette = baueKette(zeigen.find(b => b.belegart === 'quotation'), zeigen.filter(b => b.belegart !== 'quotation'));
    return { v, kette, zeigen };
  });
}

function vorgangZeile({ v, kette, zeigen }) {
  return {
    vorgangsnummer: v.vorgangsnummer,
    bezeichnung: v.bezeichnung,
    kunden_bestellnr: v.kunden_bestellnr,
    erstellt_am: v.erstellt_am,
    nachbestellung_von: v.vorlage_nr || null,
    status: kundenStatus(v, kette),
    statusleiste: statusleiste(v, kette),
    fertigung: fertigungsStufe(v),
    kette: Object.fromEntries(Object.entries(kette).map(([k, docs]) => [k, docs.map(d => ({ id: d.id, nr: d.nr, datum: d.datum, status: d.status }))])),
    aktualisiert: letzteAenderung(v, zeigen),
  };
}

/** Liste fuer „Meine Auftraege“, juengste Aenderung zuerst */
async function liste(pool, lexwareId) {
  const kunde = await ladeKunde(pool, lexwareId);
  const zeilen = (await ladeVorgaenge(pool, kunde.id)).map(vorgangZeile);
  zeilen.sort((a, b) => new Date(b.aktualisiert || 0) - new Date(a.aktualisiert || 0));
  return { kunde: { name: kunde.name, kdnr: kunde.kdnr }, vorgaenge: zeilen };
}

/** Detail eines Vorgangs mit Belegen und freigegebenen Dateien */
async function detail(pool, lexwareId, vorgangsnummer) {
  if (!NUMMER_RE.test(String(vorgangsnummer || ''))) throw fehler(404, 'Vorgang nicht gefunden');
  const kunde = await ladeKunde(pool, lexwareId);
  const [eintrag] = await ladeVorgaenge(pool, kunde.id, vorgangsnummer);
  if (!eintrag) throw fehler(404, 'Vorgang nicht gefunden');
  const [dateien] = await pool.execute(
    `SELECT id, art, dateiname, mime_typ, groesse_bytes, beschreibung, hochgeladen_am, vorschau_pfad IS NOT NULL AS vorschau
     FROM metall_datei WHERE vorgang_id = ? AND fuer_kunde_sichtbar = 1 AND geloescht_am IS NULL
     ORDER BY hochgeladen_am, id`,
    [eintrag.v.id]
  );
  for (const d of dateien) d.vorschau = !!d.vorschau;
  const reihenfolge = ['quotation', 'orderconfirmation', 'deliverynote', 'invoice'];
  const belege = [...eintrag.zeigen]
    .sort((a, b) => reihenfolge.indexOf(a.belegart) - reihenfolge.indexOf(b.belegart) || new Date(a.belegdatum || 0) - new Date(b.belegdatum || 0) || a.id - b.id)
    .map(belegZeile);
  return { ...vorgangZeile(eintrag), belege, dateien };
}

/**
 * PDF eines Belegs fuer den Kunden: nur sichtbare Belege seiner eigenen Vorgaenge.
 * Ergebnis: { pdf (Buffer), dateiname }
 */
async function belegPdf({ pool, lexware }, lexwareId, belegId) {
  const id = Number(belegId);
  if (!Number.isInteger(id) || id <= 0) throw fehler(404, 'Beleg nicht gefunden');
  const kunde = await ladeKunde(pool, lexwareId);
  const [[b]] = await pool.execute(
    `SELECT b.id, b.lexware_id, b.belegart, b.belegnummer, b.belegstatus, b.archiviert
     FROM metall_beleg b
     WHERE b.id = ? AND EXISTS (
       SELECT 1 FROM metall_vorgang v WHERE v.kunde_id = ? AND (v.id = b.vorgang_id OR v.angebot_beleg_id = b.id))`,
    [id, kunde.id]
  );
  if (!b || !sichtbar(b)) throw fehler(404, 'Beleg nicht gefunden');
  const pdf = await lexware.getVoucherFile(b.belegart, b.lexware_id);
  return { pdf, dateiname: `${b.belegnummer.replace(/[^\w-]/g, '')}.pdf` };
}

module.exports = { sichtbar, kundenStatus, liste, detail, belegPdf };
