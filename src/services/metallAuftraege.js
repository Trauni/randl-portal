/**
 * Alle Auftraege Metallarbeiten (#367): Suche, Filter, Belegkette und Status pro Vorgang.
 *
 * Der Status wird nicht gespeichert, sondern aus den Belegen und fertigung_am berechnet
 * (docs/db-schema.md): Anfrage → Angebot → Auftrag → Fertigung → Lieferung → Rechnung.
 * Stornierte und archivierte Belege zaehlen nicht (wie AB_ZAEHLT im Sync).
 *
 * Suche per SQL (LIKE ueber Nummern, Kunde, Bezeichnung), Status und Belegart danach
 * in JS — der Status ist berechnet, die Mengen sind klein.
 */

const ARTEN = { quotation: 'AN', orderconfirmation: 'AB', deliverynote: 'LS', invoice: 'RE' };
const KUERZEL = ['AN', 'AB', 'LS', 'RE'];
const GRUPPEN = ['laufend', 'abgeschlossen', 'abgebrochen'];
const BEZAHLT = ['paid', 'paidoff'];
const SUCHE_MAX = 100;
const KANDIDATEN_MAX = 1000;
const TREFFER_MAX = 200;

const zaehlt = b => !!b && !b.archiviert && b.belegstatus !== 'voided';

function zeit(d) {
  if (!d) return 0;
  const t = (d instanceof Date ? d : new Date(d)).getTime();
  return Number.isNaN(t) ? 0 : t;
}

/**
 * Belegkette eines Vorgangs: pro Kuerzel die zaehlenden Belege, aelteste zuerst.
 * angebot: der Beleg aus metall_vorgang.angebot_beleg_id (oder undefined),
 * belege: AB/LS/RE mit vorgang_id = Vorgang.
 */
function baueKette(angebot, belege = []) {
  const kette = { AN: [], AB: [], LS: [], RE: [] };
  for (const b of [angebot, ...belege]) {
    if (!zaehlt(b) || !ARTEN[b.belegart]) continue;
    kette[ARTEN[b.belegart]].push({ id: b.id, nr: b.belegnummer || null, status: b.belegstatus, datum: b.belegdatum || null });
  }
  for (const k of KUERZEL) kette[k].sort((a, b) => zeit(a.datum) - zeit(b.datum) || a.id - b.id);
  return kette;
}

/**
 * Status aus Kette und Vorgang. Ergebnis { code, text, gruppe, ton }:
 * ton fuer die Farbe in der Liste (ok, warn, rot, neutral).
 */
function berechneStatus(v, kette) {
  const s = (code, text, ton = 'neutral', gruppe = 'laufend') => ({ code, text, gruppe, ton });
  if (v.abgebrochen_am) return s('abgebrochen', 'Abgebrochen', 'neutral', 'abgebrochen');
  const re = kette.RE;
  if (re.length) {
    if (re.every(r => BEZAHLT.includes(r.status))) return s('abgeschlossen', 'Abgeschlossen', 'ok', 'abgeschlossen');
    if (re.some(r => r.status === 'overdue')) return s('rechnung_ueberfaellig', 'Rechnung überfällig', 'rot');
    if (re.some(r => r.status !== 'draft' && !BEZAHLT.includes(r.status))) return s('rechnung_offen', 'Rechnung offen', 'warn');
    return s('abrechnung', 'Rechnung in Arbeit');
  }
  if (kette.LS.length) return s('abrechnung', 'Geliefert, Rechnung folgt');
  if (kette.AB.length) {
    return v.fertigung_am ? s('lieferung', 'Bereit zur Lieferung') : s('fertigung', 'In Fertigung');
  }
  const an = kette.AN[kette.AN.length - 1];
  if (an) {
    if (an.status === 'accepted') return s('auftrag', 'Angebot angenommen, AB folgt', 'warn');
    if (an.status === 'rejected') return s('angebot_abgelehnt', 'Angebot abgelehnt', 'rot');
    if (an.status === 'draft') return s('angebot_entwurf', 'Angebot im Entwurf');
    return s('angebot', 'Angebot liegt vor', 'warn');
  }
  if (v.vorlage_vorgang_id) return s('nachbestellung', 'Nachbestellung, AB folgt');
  return s('anfrage', 'Angebot folgt');
}

// Letzte Aenderung: Vorgang selbst, Fertigung/Abbruch und alle Belege
function letzteAenderung(v, roh = []) {
  const t = [v.erstellt_am, v.fertigung_am, v.abgebrochen_am, ...roh.flatMap(b => [b.belegdatum, b.lexware_geaendert_am])]
    .map(zeit);
  const max = Math.max(0, ...t);
  return max ? new Date(max) : null;
}

/** Filter pruefen und bereinigen. art: alle|AN|AB|LS|RE, status: alle|laufend|abgeschlossen|abgebrochen */
function pruefeFilter({ q, art, status } = {}) {
  const such = String(q ?? '').replace(/\s+/g, ' ').trim().slice(0, SUCHE_MAX);
  const a = KUERZEL.includes(art) ? art : 'alle';
  const st = GRUPPEN.includes(status) ? status : 'alle';
  return { q: such, art: a, status: st };
}

// LIKE-Platzhalter im Suchtext wortwoertlich nehmen
const likeMuster = q => `%${q.replace(/[\\%_]/g, c => `\\${c}`)}%`;

/** SQL fuer die Kandidaten (Suche ohne Status/Belegart). Getrennt, damit testbar. */
function sucheSql(q) {
  const params = [];
  let where = '';
  if (q) {
    const m = likeMuster(q);
    where = `WHERE v.vorgangsnummer LIKE ? OR v.kunden_bestellnr LIKE ? OR v.bezeichnung LIKE ?
         OR k.name LIKE ? OR k.kdnr LIKE ?
         OR EXISTS (SELECT 1 FROM metall_beleg b
                    WHERE (b.vorgang_id = v.id OR b.id = v.angebot_beleg_id) AND b.belegnummer LIKE ?)`;
    params.push(m, m, m, m, m, m);
  }
  const sql = `SELECT v.id, v.vorgangsnummer, v.bezeichnung, v.kunden_bestellnr, v.herkunft, v.erstellt_am,
            v.angebot_beleg_id, v.vorlage_vorgang_id, v.fertigung_am, v.abgebrochen_am,
            k.id AS kunde_id, k.name AS kunde_name, k.kdnr, vl.vorgangsnummer AS vorlage_nr
     FROM metall_vorgang v
     JOIN metall_kunde k ON k.id = v.kunde_id
     LEFT JOIN metall_vorgang vl ON vl.id = v.vorlage_vorgang_id
     ${where}
     ORDER BY v.id DESC LIMIT ${KANDIDATEN_MAX}`;
  return { sql, params };
}

/**
 * Vorgaenge suchen. Ergebnis { treffer, gesamt, mehr }:
 * treffer: hoechstens TREFFER_MAX, juengste Aenderung zuerst; jede Zeile mit kette, status,
 * aktualisiert und den Feldern fuer „In Lexware anlegen“ (angebot_nr, angebot_status, ab_nr).
 */
async function sucheVorgaenge(pool, filter = {}) {
  const f = pruefeFilter(filter);
  const { sql, params } = sucheSql(f.q);
  const [vorgaenge] = await pool.query(sql, params);
  if (!vorgaenge.length) return { treffer: [], gesamt: 0, mehr: false, filter: f };

  const ids = vorgaenge.map(v => v.id);
  const anIds = vorgaenge.map(v => v.angebot_beleg_id).filter(Boolean);
  const [belege] = await pool.query(
    `SELECT id, vorgang_id, belegart, belegnummer, belegstatus, archiviert, belegdatum, lexware_geaendert_am
     FROM metall_beleg WHERE vorgang_id IN (?)${anIds.length ? ' OR id IN (?)' : ''}`,
    anIds.length ? [ids, anIds] : [ids]
  );
  const proVorgang = new Map();
  const byId = new Map();
  for (const b of belege) {
    byId.set(b.id, b);
    if (b.vorgang_id) {
      if (!proVorgang.has(b.vorgang_id)) proVorgang.set(b.vorgang_id, []);
      proVorgang.get(b.vorgang_id).push(b);
    }
  }

  const alle = vorgaenge.map(v => {
    const angebot = v.angebot_beleg_id ? byId.get(v.angebot_beleg_id) : undefined;
    const eigene = (proVorgang.get(v.id) || []).filter(b => b.belegart !== 'quotation');
    const kette = baueKette(angebot, eigene);
    const ab = kette.AB[kette.AB.length - 1];
    return {
      ...v,
      kette,
      an_entfaellt: !kette.AN.length && !!v.vorlage_vorgang_id,
      status: berechneStatus(v, kette),
      aktualisiert: letzteAenderung(v, [angebot, ...eigene].filter(Boolean)),
      angebot_nr: angebot ? angebot.belegnummer : null,
      angebot_status: angebot ? angebot.belegstatus : null,
      ab_nr: ab ? (ab.nr || 'Entwurf') : null,
    };
  });

  const passend = alle
    .filter(v => f.status === 'alle' || v.status.gruppe === f.status)
    .filter(v => f.art === 'alle' || v.kette[f.art].length > 0)
    .sort((a, b) => zeit(b.aktualisiert) - zeit(a.aktualisiert) || b.id - a.id);

  return {
    treffer: passend.slice(0, TREFFER_MAX),
    gesamt: passend.length,
    mehr: passend.length > TREFFER_MAX || vorgaenge.length >= KANDIDATEN_MAX,
    filter: f,
  };
}

module.exports = { baueKette, berechneStatus, letzteAenderung, pruefeFilter, sucheSql, sucheVorgaenge, TREFFER_MAX };
