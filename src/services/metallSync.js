/**
 * Metall-Sync — Lexware-Belege (AN/AB/LS/RE) der Metallkunden ins Portal holen
 * und den Vorgaengen zuordnen (#363).
 *
 * Ablauf pro aktivem Metallkunden (metall_kunde.aktiv = 1):
 *   A) Belegliste seit dem letzten Stand holen (erstes Mal: Belege ab ERSTABGLEICH_AB),
 *      jeden geaenderten Beleg einzeln lesen (nur dort stehen Einleitungstext und
 *      relatedVouchers), in metall_beleg + metall_beleg_bezug speichern.
 *   B) Alle noch offenen Belege des Kunden zuordnen, in der Reihenfolge AN → AB → LS → RE,
 *      damit ein LS seine gerade zugeordnete AB schon sieht.
 *
 * Zuordnung (bestimmeZuordnung):
 *   - Schon zugeordnet (api, verknuepfung, einleitung, auto, manuell, ignoriert) → bleibt.
 *   - AB/LS/RE mit verknuepftem AB/LS/RE, der genau einen Vorgang hat → 'verknuepfung'.
 *   - AB, die aus einem Angebot umgewandelt wurde (#364): Das Angebot kann zu mehreren
 *     Vorgaengen gehoeren und die AB erbt dessen Einleitungszeile, die zaehlt deshalb nicht.
 *     Gibt es zum Angebot genau einen offenen Vorgang ohne AB → 'auto', sonst offen mit
 *     Vorschlag (Einleitung, wenn noch ohne AB, sonst der aelteste Kandidat).
 *   - Sonst Vorgangsnummer genau in der ersten Zeile des Einleitungstexts, Vorgang gehoert
 *     zum selben Kunden → 'einleitung'. Angebote haengen dann ueber
 *     metall_vorgang.angebot_beleg_id am Vorgang (nur wenn dort noch keins steht).
 *   - Alles andere → 'offen' (Eingang "Belege zuordnen"), ggf. mit Vorschlag. Eine freie AB
 *     (ohne Verknuepfung, ohne Nummer) bekommt den Vorschlag, wenn der Kunde genau einen
 *     offenen Vorgang ohne AB hat – automatisch zugeordnet wird sie nicht.
 *
 * Zaehlende AB: nicht archiviert, nicht storniert (docs/lexware-api.md). Zwei zaehlende ABs
 * im selben Vorgang → Hinweis "doppelte AB pruefen" (ladeDoppelteAb, stat.doppelte_ab).
 *
 * Der Sync-Stand braucht keine eigene Tabelle: juengstes lexware_geaendert_am der Belege
 * des Kunden minus PUFFER_TAGE.
 */

const { leseEinleitung } = require('./metallVorgang');

const ERSTABGLEICH_AB = '2025-01-01'; // Entscheidung 16.10.2026
const PUFFER_TAGE = 1;
const REIHENFOLGE = ['quotation', 'orderconfirmation', 'deliverynote', 'invoice'];
const FESTE_ZUORDNUNG = new Set(['api', 'verknuepfung', 'einleitung', 'auto', 'manuell', 'ignoriert']);
const EINLEITUNG_MAX = 255; // metall_beleg.einleitung_zeile
// AB, die fuer den Vorgang zaehlt (Alias a)
const AB_ZAEHLT = "a.belegart = 'orderconfirmation' AND a.archiviert = 0 AND a.belegstatus <> 'voided'";

// ── Reine Funktionen ──────────────────────────────────────────────────────────

/** Erste nicht leere Zeile eines Einleitungstexts, gekuerzt fuer die Spalte */
function ersteZeile(text) {
  const z = String(text || '').split(/\r?\n/).map(s => s.trim()).find(Boolean);
  return z ? z.slice(0, EINLEITUNG_MAX) : null;
}

function alsDatum(iso) {
  return iso ? String(iso).slice(0, 10) : null;
}

function alsBetrag(x) {
  return x == null || x === '' ? null : Number(x);
}

/** Lexware-Beleg (Einzelabruf) → Spalten fuer metall_beleg */
function belegZeile(voucher, belegart) {
  return {
    lexware_id: voucher.id,
    belegart,
    belegnummer: voucher.voucherNumber || null,
    belegstatus: voucher.voucherStatus || 'unknown',
    archiviert: voucher.archived ? 1 : 0,
    belegdatum: alsDatum(voucher.voucherDate),
    betrag_netto: alsBetrag(voucher.totalPrice?.totalNetAmount),
    betrag_brutto: alsBetrag(voucher.totalPrice?.totalGrossAmount),
    lexware_kontakt_id: voucher.address?.contactId || null,
    lexware_version: voucher.version ?? null,
    lexware_geaendert_am: voucher.updatedDate ? new Date(voucher.updatedDate) : null,
    einleitung_zeile: ersteZeile(voucher.introduction),
  };
}

/** relatedVouchers → Zeilen fuer metall_beleg_bezug (ohne beleg_id) */
function bezugZeilen(voucher) {
  const gesehen = new Set();
  return (voucher.relatedVouchers || [])
    .filter(r => r?.id && !gesehen.has(r.id) && gesehen.add(r.id))
    .map(r => ({ bezug_lexware_id: r.id, bezug_belegart: r.voucherType || null }));
}

/**
 * Muss der Beleg neu gelesen werden? Verglichen wird mit dem Aenderungsdatum aus der
 * Belegliste, das beim letzten Holen gespeichert wurde. Bis 1 s Abweichung gilt als
 * gleich (DATETIME ohne Sekundenbruchteile).
 */
function istGeaendert(listenEintrag, bestehend) {
  if (!bestehend?.lexware_geaendert_am || !listenEintrag.updatedDate) return true;
  const neu = new Date(listenEintrag.updatedDate).getTime();
  const alt = new Date(bestehend.lexware_geaendert_am).getTime();
  return Math.abs(neu - alt) > 1000;
}

/** Ab wann fragt der Sync? Erstabgleich nach Belegdatum, sonst nach Aenderungsdatum */
function abfrageAb(juengsteAenderung) {
  if (!juengsteAenderung) return { voucherDateFrom: ERSTABGLEICH_AB };
  const d = new Date(juengsteAenderung);
  d.setDate(d.getDate() - PUFFER_TAGE);
  return { updatedDateFrom: d };
}

/**
 * Zuordnung eines Belegs bestimmen.
 *   beleg:   { belegart, zuordnung } (zuordnung der gespeicherten Zeile)
 *   nachbarn: bekannte verknuepfte Belege [{ belegart, vorgang_id }]
 *   einleitung: Treffer aus der Einleitungszeile oder null:
 *               { vorgang_id, exakt, kunde_passt, angebot_beleg_id }
 *   kandidaten: nur fuer AB – offene Vorgaenge des Kunden ohne zaehlende AB [vorgang_id],
 *               aelteste zuerst; bei AB aus Angebot nur die Vorgaenge dieses Angebots
 * Ergebnis: null (nichts aendern) oder
 *   { zuordnung, vorgang_id, vorschlag_vorgang_id, angebot_fuer_vorgang_id }
 */
function bestimmeZuordnung({ beleg, nachbarn = [], einleitung = null, kandidaten = [] }) {
  if (FESTE_ZUORDNUNG.has(beleg.zuordnung)) return null;

  const treffer = einleitung && einleitung.kunde_passt ? einleitung : null;
  const vorschlag = treffer ? treffer.vorgang_id : null;
  const offen = { zuordnung: 'offen', vorgang_id: null, vorschlag_vorgang_id: vorschlag, angebot_fuer_vorgang_id: null };

  if (beleg.belegart === 'quotation') {
    if (treffer?.exakt && !treffer.angebot_beleg_id) {
      return { zuordnung: 'einleitung', vorgang_id: null, vorschlag_vorgang_id: null, angebot_fuer_vorgang_id: treffer.vorgang_id };
    }
    return offen;
  }

  const vorgaenge = [...new Set(nachbarn.filter(n => n.belegart !== 'quotation' && n.vorgang_id).map(n => n.vorgang_id))];
  if (vorgaenge.length === 1) {
    return { zuordnung: 'verknuepfung', vorgang_id: vorgaenge[0], vorschlag_vorgang_id: null, angebot_fuer_vorgang_id: null };
  }
  if (vorgaenge.length > 1) return { ...offen, vorschlag_vorgang_id: null }; // widerspruechlich

  const istAb = beleg.belegart === 'orderconfirmation';

  // Aus einem Angebot umgewandelte AB: Einleitungszeile ist geerbt, zaehlt nur als Vorschlag
  if (istAb && nachbarn.some(n => n.belegart === 'quotation')) {
    if (kandidaten.length === 1) {
      return { zuordnung: 'auto', vorgang_id: kandidaten[0], vorschlag_vorgang_id: null, angebot_fuer_vorgang_id: null };
    }
    const besser = kandidaten.includes(vorschlag) ? vorschlag : (kandidaten[0] ?? vorschlag);
    return { ...offen, vorschlag_vorgang_id: besser };
  }

  if (treffer?.exakt) {
    return { zuordnung: 'einleitung', vorgang_id: treffer.vorgang_id, vorschlag_vorgang_id: null, angebot_fuer_vorgang_id: null };
  }
  if (istAb && !vorschlag && kandidaten.length === 1) return { ...offen, vorschlag_vorgang_id: kandidaten[0] };
  return offen;
}

// ── Datenbank ─────────────────────────────────────────────────────────────────

const BELEG_SPALTEN = [
  'lexware_id', 'belegart', 'belegnummer', 'belegstatus', 'archiviert', 'belegdatum',
  'betrag_netto', 'betrag_brutto', 'lexware_kontakt_id', 'lexware_version',
  'lexware_geaendert_am', 'einleitung_zeile',
];

async function speichereBeleg(pool, zeile, bezuege) {
  const werte = BELEG_SPALTEN.map(s => zeile[s]);
  const update = BELEG_SPALTEN.filter(s => s !== 'lexware_id').map(s => `${s} = VALUES(${s})`).join(', ');
  const [res] = await pool.execute(
    `INSERT INTO metall_beleg (${BELEG_SPALTEN.join(', ')}, sync_am)
     VALUES (${BELEG_SPALTEN.map(() => '?').join(', ')}, NOW())
     ON DUPLICATE KEY UPDATE ${update}, sync_am = NOW()`,
    werte
  );
  const [[{ id }]] = await pool.execute('SELECT id FROM metall_beleg WHERE lexware_id = ?', [zeile.lexware_id]);
  await pool.execute('DELETE FROM metall_beleg_bezug WHERE beleg_id = ?', [id]);
  if (bezuege.length) {
    await pool.query(
      'INSERT INTO metall_beleg_bezug (beleg_id, bezug_lexware_id, bezug_belegart) VALUES ?',
      [bezuege.map(b => [id, b.bezug_lexware_id, b.bezug_belegart])]
    );
  }
  // affectedRows: 1 = neu, 2 = geaendert (MariaDB bei ON DUPLICATE KEY UPDATE)
  return { id, neu: res.affectedRows === 1 };
}

// Verknuepfte Belege in beide Richtungen (Lexware setzt sie beidseitig, sicher ist sicher)
async function ladeNachbarn(pool, beleg) {
  const [rows] = await pool.execute(
    `SELECT DISTINCT b.id, b.belegart, b.vorgang_id FROM metall_beleg b
     WHERE b.id <> ? AND (
       b.lexware_id IN (SELECT bezug_lexware_id FROM metall_beleg_bezug WHERE beleg_id = ?)
       OR b.id IN (SELECT beleg_id FROM metall_beleg_bezug WHERE bezug_lexware_id = ?)
     )`,
    [beleg.id, beleg.id, beleg.lexware_id]
  );
  return rows;
}

async function ladeEinleitung(pool, beleg, kundeId) {
  const gelesen = leseEinleitung(beleg.einleitung_zeile);
  if (!gelesen) return null;
  const [[v]] = await pool.execute(
    'SELECT id, kunde_id, angebot_beleg_id FROM metall_vorgang WHERE vorgangsnummer = ? AND abgebrochen_am IS NULL',
    [gelesen.vorgangsnummer]
  );
  if (!v) return null;
  return { vorgang_id: v.id, exakt: gelesen.exakt, kunde_passt: v.kunde_id === kundeId, angebot_beleg_id: v.angebot_beleg_id };
}

/**
 * Kandidaten fuer eine AB: offene Vorgaenge des Kunden ohne zaehlende AB (die AB selbst
 * ausgenommen). Haengt die AB an Angeboten, nur die Vorgaenge dieser Angebote.
 */
async function ladeKandidaten(pool, beleg, kundeId, nachbarn) {
  const angebote = nachbarn.filter(n => n.belegart === 'quotation').map(n => n.id);
  const [rows] = await pool.query(
    `SELECT v.id FROM metall_vorgang v
     WHERE v.kunde_id = ? AND v.abgebrochen_am IS NULL
       ${angebote.length ? 'AND v.angebot_beleg_id IN (?)' : ''}
       AND NOT EXISTS (SELECT 1 FROM metall_beleg a WHERE a.vorgang_id = v.id AND a.id <> ? AND ${AB_ZAEHLT})
     ORDER BY v.id`,
    angebote.length ? [kundeId, angebote, beleg.id] : [kundeId, beleg.id]
  );
  return rows.map(r => r.id);
}

/** Vorgaenge des Kunden mit mehr als einer zaehlenden AB → Hinweis "doppelte AB pruefen" */
async function ladeDoppelteAb(pool, kundeId) {
  const [rows] = await pool.execute(
    `SELECT v.id, v.vorgangsnummer, COUNT(*) AS anzahl,
            GROUP_CONCAT(COALESCE(a.belegnummer, 'Entwurf') ORDER BY a.belegdatum, a.id SEPARATOR ', ') AS abs
     FROM metall_vorgang v JOIN metall_beleg a ON a.vorgang_id = v.id AND ${AB_ZAEHLT}
     WHERE v.kunde_id = ? AND v.abgebrochen_am IS NULL
     GROUP BY v.id, v.vorgangsnummer HAVING COUNT(*) > 1
     ORDER BY v.id`,
    [kundeId]
  );
  return rows;
}

async function wendeZuordnungAn(pool, belegId, z) {
  await pool.execute(
    `UPDATE metall_beleg SET zuordnung = ?, vorgang_id = ?, vorschlag_vorgang_id = ?,
       zugeordnet_am = IF(? = 'offen', zugeordnet_am, NOW())
     WHERE id = ?`,
    [z.zuordnung, z.vorgang_id, z.vorschlag_vorgang_id, z.zuordnung, belegId]
  );
  if (z.angebot_fuer_vorgang_id) {
    await pool.execute(
      'UPDATE metall_vorgang SET angebot_beleg_id = ? WHERE id = ? AND angebot_beleg_id IS NULL',
      [belegId, z.angebot_fuer_vorgang_id]
    );
  }
}

// ── Durchgang ─────────────────────────────────────────────────────────────────

/**
 * Einen Metallkunden abgleichen. deps: { pool, lexware }, kunde: Zeile aus metall_kunde.
 * Ergebnis: Zaehler fuer das Log.
 */
async function syncKunde({ pool, lexware }, kunde) {
  const stat = { gelistet: 0, geholt: 0, neu: 0, zugeordnet: 0, offen: 0, fehler: 0, doppelte_ab: 0 };

  // A) Belege holen und speichern
  const [[{ juengste }]] = await pool.execute(
    'SELECT MAX(lexware_geaendert_am) AS juengste FROM metall_beleg WHERE lexware_kontakt_id = ?',
    [kunde.lexware_kontakt_id]
  );
  const liste = (await lexware.listVouchers({ contactId: kunde.lexware_kontakt_id, ...abfrageAb(juengste) }))
    .filter(e => REIHENFOLGE.includes(e.voucherType));
  stat.gelistet = liste.length;

  for (const eintrag of liste) {
    const [[bestehend]] = await pool.execute(
      'SELECT lexware_geaendert_am FROM metall_beleg WHERE lexware_id = ?', [eintrag.id]
    );
    if (!istGeaendert(eintrag, bestehend)) continue;
    try {
      const voucher = await lexware.getVoucher(eintrag.voucherType, eintrag.id);
      const zeile = belegZeile(voucher, eintrag.voucherType);
      zeile.lexware_kontakt_id = zeile.lexware_kontakt_id || kunde.lexware_kontakt_id; // Adresse ohne contactId
      // Aenderungsdatum aus der Liste speichern: damit vergleicht der naechste Lauf
      if (eintrag.updatedDate) zeile.lexware_geaendert_am = new Date(eintrag.updatedDate);
      const { neu } = await speichereBeleg(pool, zeile, bezugZeilen(voucher));
      stat.geholt++;
      if (neu) stat.neu++;
    } catch (err) {
      stat.fehler++;
      console.error(`[Metall-Sync] Beleg ${eintrag.voucherNumber || eintrag.id}:`, err.message);
    }
  }

  // B) Offene Belege des Kunden zuordnen, AN → AB → LS → RE
  const [offene] = await pool.execute(
    `SELECT id, lexware_id, belegart, zuordnung, einleitung_zeile FROM metall_beleg
     WHERE lexware_kontakt_id = ? AND zuordnung = 'offen'
     ORDER BY FIELD(belegart, ${REIHENFOLGE.map(() => '?').join(', ')}), belegdatum, id`,
    [kunde.lexware_kontakt_id, ...REIHENFOLGE]
  );
  for (const beleg of offene) {
    const nachbarn = await ladeNachbarn(pool, beleg);
    const z = bestimmeZuordnung({
      beleg,
      nachbarn,
      einleitung: await ladeEinleitung(pool, beleg, kunde.id),
      kandidaten: beleg.belegart === 'orderconfirmation' ? await ladeKandidaten(pool, beleg, kunde.id, nachbarn) : [],
    });
    if (!z) continue;
    await wendeZuordnungAn(pool, beleg.id, z);
    if (z.zuordnung === 'offen') stat.offen++; else stat.zugeordnet++;
  }

  // C) Hinweis doppelte AB
  stat.doppelte_ab = (await ladeDoppelteAb(pool, kunde.id)).length;
  return stat;
}

let laeuft = false;

/** Alle aktiven Metallkunden abgleichen; ein laufender Durchgang wird nicht doppelt gestartet */
async function syncAlle(deps) {
  if (laeuft) return { uebersprungen: true };
  laeuft = true;
  const summe = { kunden: 0, gelistet: 0, geholt: 0, neu: 0, zugeordnet: 0, offen: 0, fehler: 0, doppelte_ab: 0 };
  try {
    const [kunden] = await deps.pool.execute('SELECT * FROM metall_kunde WHERE aktiv = 1 ORDER BY id');
    for (const kunde of kunden) {
      try {
        const s = await syncKunde(deps, kunde);
        for (const k of Object.keys(s)) summe[k] += s[k];
      } catch (err) {
        summe.fehler++;
        console.error(`[Metall-Sync] Kunde ${kunde.kdnr || kunde.id}:`, err.message);
      }
      summe.kunden++;
    }
    return summe;
  } finally {
    laeuft = false;
  }
}

function standardDeps() {
  return { pool: require('../db').getPool(), lexware: require('./lexware') };
}

/**
 * Zeitplan im Portal-Prozess (PM2 fork, eine Instanz → laeuft genau einmal).
 * Nur aktiv mit METALL_SYNC_AKTIV=1 in der .env; Takt ueber METALL_SYNC_CRON.
 */
function starteZeitplan() {
  const cron = require('node-cron');
  const takt = process.env.METALL_SYNC_CRON || '*/15 * * * *';
  cron.schedule(takt, async () => {
    try {
      const r = await syncAlle(standardDeps());
      if (r.uebersprungen) return console.log('[Metall-Sync] voriger Durchgang laeuft noch, uebersprungen');
      if (r.geholt || r.zugeordnet || r.fehler) console.log('[Metall-Sync]', JSON.stringify(r));
    } catch (err) {
      console.error('[Metall-Sync] Durchgang fehlgeschlagen:', err.message);
    }
  });
  console.log(`[Metall-Sync] Zeitplan aktiv (${takt})`);
}

module.exports = {
  ERSTABGLEICH_AB, REIHENFOLGE,
  ersteZeile, belegZeile, bezugZeilen, istGeaendert, abfrageAb, bestimmeZuordnung,
  syncKunde, syncAlle, starteZeitplan, ladeDoppelteAb,
};

/*
 * CLI (im Portal-Ordner, liest die .env; Umgebungsvariablen der Shell haben Vorrang):
 *   node src/services/metallSync.js kunde <lexware_kontakt_id>   einen Metallkunden abgleichen
 *   node src/services/metallSync.js vergleich <lexware_kontakt_id>  Diagnose Aenderungsdatum Liste/DB
 *   node src/services/metallSync.js alle                         alle aktiven Metallkunden
 * Danach Uebersicht der Belege des Kunden: Nummer, Art, Status, Zuordnung, Vorgang.
 */
if (require.main === module) {
  require('dotenv').config();
  const [, , befehl, arg] = process.argv;
  (async () => {
    const deps = standardDeps();
    try {
      if (befehl === 'kunde' && arg) {
        const [[kunde]] = await deps.pool.execute('SELECT * FROM metall_kunde WHERE lexware_kontakt_id = ?', [arg]);
        if (!kunde) throw new Error('Kein Metallkunde mit dieser Lexware-Kontakt-ID (erst Merker setzen)');
        console.log(JSON.stringify(await syncKunde(deps, kunde)));
        const [belege] = await deps.pool.execute(
          `SELECT b.belegnummer, b.belegart, b.belegstatus, b.archiviert, b.zuordnung,
                  v.vorgangsnummer, vs.vorgangsnummer AS vorschlag,
                  (SELECT COUNT(*) FROM metall_beleg_bezug z WHERE z.beleg_id = b.id) AS bezuege
           FROM metall_beleg b
           LEFT JOIN metall_vorgang v ON v.id = b.vorgang_id
           LEFT JOIN metall_vorgang vs ON vs.id = b.vorschlag_vorgang_id
           WHERE b.lexware_kontakt_id = ?
           ORDER BY b.belegdatum, FIELD(b.belegart, 'quotation', 'orderconfirmation', 'deliverynote', 'invoice'), b.belegnummer`,
          [arg]
        );
        console.table(belege);
        const doppelt = await ladeDoppelteAb(deps.pool, kunde.id);
        if (doppelt.length) {
          console.log('Doppelte AB pruefen:');
          console.table(doppelt.map(d => ({ vorgang: d.vorgangsnummer, anzahl: d.anzahl, abs: d.abs })));
        }
      } else if (befehl === 'vergleich' && arg) {
        // Diagnose: Aenderungsdatum laut Belegliste vs. gespeichert, und was istGeaendert sagt
        const liste = await deps.lexware.listVouchers({ contactId: arg, voucherDateFrom: ERSTABGLEICH_AB });
        const [rows] = await deps.pool.execute('SELECT lexware_id, lexware_geaendert_am FROM metall_beleg WHERE lexware_kontakt_id = ?', [arg]);
        const gespeichert = new Map(rows.map(r => [r.lexware_id, r]));
        console.table(liste.map(e => ({
          beleg: e.voucherNumber,
          liste: e.updatedDate,
          gespeichert: gespeichert.get(e.id)?.lexware_geaendert_am?.toISOString?.() ?? null,
          neu_holen: istGeaendert(e, gespeichert.get(e.id)),
        })));
      } else if (befehl === 'alle') {
        console.log(JSON.stringify(await syncAlle(deps)));
      } else {
        console.log('Aufruf: kunde <lexware_kontakt_id> | vergleich <lexware_kontakt_id> | alle');
      }
      process.exit(0);
    } catch (err) {
      console.error(err.message);
      process.exit(1);
    }
  })();
}
