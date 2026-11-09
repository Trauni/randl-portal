/**
 * Gleitzeit — Gleitzeitkonto aus der Portal-Zeiterfassung (#490).
 *
 * Gilt nur für Mitarbeitende mit gleitzeit_aktiv = 1, gleitzeit_seit gesetzt
 * und zeiterfassung_quelle = 'portal' (bei 'rentman' gibt es keine
 * time_entries, das Konto liefe sonst nur ins Minus).
 *
 * Die Rechenregeln stehen in src/utils/gleitzeit.js. Hier wird nur geladen
 * und gebucht. Neuberechnen ist idempotent: die automatischen Buchungen
 * (tagessaldo, abbau) eines Zeitraums werden in einer Transaktion gelöscht und
 * neu geschrieben. Korrekturen von Hand (art = 'korrektur') bleiben stehen.
 *
 * Der laufende Tag wird erst nach dem Tagesabschluss gebucht (20-Uhr-Job,
 * nach `zeit.js zwangsschliessen`). Davor endet jede Berechnung gestern.
 *
 * CLI:
 *   node src/services/gleitzeit.js abschluss           Tagesabschluss für alle Konten (Cron, nach 20:00)
 *   node src/services/gleitzeit.js neuberechnen <id>   Konto komplett ab gleitzeit_seit neu rechnen
 *   node src/services/gleitzeit.js stand <id>          Kontostand anzeigen
 */
const { getPool } = require('../db');
const {
  zeitraumBuchungen, eintragMinuten, formatMinuten, arbeitszeitAm, regelSoll,
  abbauDauer, abbauAmTag,
} = require('../utils/gleitzeit');

const AUTOMATISCH = ['tagessaldo', 'abbau'];

const heuteLokal = () =>
  new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Berlin' }); // 'YYYY-MM-DD'
const tagVor = (tag, n = 1) =>
  new Date(+new Date(tag + 'T12:00:00Z') - n * 86400000).toISOString().slice(0, 10);
const maxTag = (a, b) => (a > b ? a : b);
const minTag = (a, b) => (a < b ? a : b);

/** Kontodaten des Mitarbeiters; aktiv = Konto wird tatsächlich gerechnet. */
async function ladeKonto(employeeId, db = getPool()) {
  const [[e]] = await db.query(
    `SELECT id, COALESCE(full_name, username) AS name, zeiterfassung_quelle,
            gleitzeit_aktiv, DATE_FORMAT(gleitzeit_seit,'%Y-%m-%d') AS seit,
            gleitzeit_startsaldo_minuten AS startsaldo
       FROM employees WHERE id = ?`, [employeeId]);
  if (!e) throw new Error(`Mitarbeiter ${employeeId} nicht gefunden`);
  e.aktiv = Boolean(e.gleitzeit_aktiv && e.seit && e.zeiterfassung_quelle === 'portal');
  return e;
}

async function ladeHistorie(employeeId, db) {
  const [rows] = await db.query(
    `SELECT DATE_FORMAT(gueltig_ab,'%Y-%m-%d') AS gueltig_ab, wochenstunden, arbeitstage
       FROM gleitzeit_arbeitszeit WHERE employee_id = ? ORDER BY gueltig_ab`, [employeeId]);
  return rows;
}

/** Ist-Minuten pro Tag (ohne Krankheit) und Krankheitstage. */
async function ladeZeiten(employeeId, von, bis, db) {
  const [rows] = await db.query(
    `SELECT DATE_FORMAT(tag,'%Y-%m-%d') AS tag, eintrag_typ, pause_sekunden,
            TIMESTAMPDIFF(SECOND, start, ende) AS spanne
       FROM time_entries
      WHERE employee_id = ? AND tag BETWEEN ? AND ?
        AND ende IS NOT NULL AND status IN ('abgeschlossen', 'auto_beendet')`,
    [employeeId, von, bis]);
  const istProTag = new Map();
  const krank = new Set();
  for (const r of rows) {
    if (r.eintrag_typ === 'krankheit') { krank.add(r.tag); continue; }
    istProTag.set(r.tag, (istProTag.get(r.tag) || 0) + eintragMinuten(Number(r.spanne), Number(r.pause_sekunden)));
  }
  return { istProTag, krank };
}

/**
 * Genehmigte Urlaube/Abbau-Tage im Zeitraum: Map tag -> { art, referenzId, abbauMinuten }.
 * abbauMinuten nur beim stundenweisen Abbau (abbau_von/abbau_bis gesetzt), sonst null.
 */
async function ladeAbwesenheiten(employeeId, von, bis, krank, db) {
  const [rows] = await db.query(
    `SELECT id, art, DATE_FORMAT(start_date,'%Y-%m-%d') AS von, DATE_FORMAT(end_date,'%Y-%m-%d') AS bis,
            TIME_FORMAT(abbau_von,'%H:%i') AS zeitVon, TIME_FORMAT(abbau_bis,'%H:%i') AS zeitBis
       FROM vacation_requests
      WHERE employee_id = ? AND status = 'approved' AND cancelled_at IS NULL
        AND start_date <= ? AND end_date >= ?`,
    [employeeId, bis, von]);
  const map = new Map();
  for (const r of rows) {
    const ende = new Date(minTag(r.bis, bis) + 'T12:00:00Z');
    for (let d = new Date(maxTag(r.von, von) + 'T12:00:00Z'); d <= ende; d = new Date(+d + 86400000)) {
      const abbau = r.art === 'gleitzeitabbau';
      map.set(d.toISOString().slice(0, 10), {
        art: abbau ? 'gleitzeitabbau' : 'urlaub',
        referenzId: r.id,
        abbauMinuten: abbau && r.zeitVon ? abbauDauer(r.zeitVon, r.zeitBis) : null,
      });
    }
  }
  // Krankheit schlägt Urlaub/Abbau: ein Krankentag im Urlaub bucht nichts ab.
  for (const tag of krank) map.set(tag, { art: 'krankheit' });
  return map;
}

/**
 * Automatische Buchungen eines Zeitraums neu schreiben.
 * Der Zeitraum wird auf [gleitzeit_seit, gestern bzw. heute nach Abschluss] begrenzt.
 * Buchungen vor gleitzeit_seit werden dabei mit entfernt (falls "Aktiv seit" nach hinten verschoben wurde).
 */
async function neuberechnen(employeeId, { von, bis, heuteAbgeschlossen = false, quelle = 'neuberechnung' } = {}) {
  const pool = getPool();
  const konto = await ladeKonto(employeeId, pool);
  if (!konto.aktiv) return { employeeId, uebersprungen: 'Gleitzeitkonto nicht aktiv' };

  const grenze = heuteAbgeschlossen ? heuteLokal() : tagVor(heuteLokal());
  const ab = maxTag(von || konto.seit, konto.seit);
  const bisTag = minTag(bis || grenze, grenze);

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.execute(
      `DELETE FROM gleitzeit_buchungen
        WHERE employee_id = ? AND art IN (?, ?) AND datum < ?`, [employeeId, ...AUTOMATISCH, konto.seit]);

    let buchungen = [];
    if (ab <= bisTag) {
      const historie = await ladeHistorie(employeeId, conn);
      const { istProTag, krank } = await ladeZeiten(employeeId, ab, bisTag, conn);
      const abwesenheiten = await ladeAbwesenheiten(employeeId, ab, bisTag, krank, conn);
      buchungen = zeitraumBuchungen({ von: ab, bis: bisTag, historie, istProTag, abwesenheiten });

      await conn.execute(
        `DELETE FROM gleitzeit_buchungen
          WHERE employee_id = ? AND art IN (?, ?) AND datum BETWEEN ? AND ?`,
        [employeeId, ...AUTOMATISCH, ab, bisTag]);
      for (const b of buchungen) {
        await conn.execute(
          `INSERT INTO gleitzeit_buchungen
             (employee_id, datum, art, minuten, soll_minuten, ist_minuten, quelle, referenz_id)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [employeeId, b.datum, b.art, b.minuten, b.soll_minuten ?? null, b.ist_minuten ?? null,
            quelle, b.referenz_id ?? null]);
      }
    }
    await conn.commit();
    return {
      employeeId, von: ab, bis: bisTag, buchungen: buchungen.length,
      summe: buchungen.reduce((s, b) => s + b.minuten, 0),
    };
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}

/** Kontostand = Startsaldo + Summe aller Buchungen (bis einschließlich stichtag). */
async function kontostand(employeeId, stichtag = null) {
  const db = getPool();
  const konto = await ladeKonto(employeeId, db);
  const [[s]] = await db.query(
    `SELECT COALESCE(SUM(minuten), 0) AS summe, DATE_FORMAT(MAX(IF(art = 'tagessaldo', datum, NULL)),'%Y-%m-%d') AS bis
       FROM gleitzeit_buchungen
      WHERE employee_id = ? ${stichtag ? 'AND datum <= ?' : ''}`,
    stichtag ? [employeeId, stichtag] : [employeeId]);
  const minuten = Number(konto.startsaldo || 0) + Number(s.summe);
  return {
    employeeId, aktiv: konto.aktiv, seit: konto.seit,
    startsaldo: Number(konto.startsaldo || 0), minuten, anzeige: formatMinuten(minuten),
    gebuchtBis: s.bis,
  };
}

/** Verlauf je Woche (ISO-Woche) oder Monat: [{ zeitraum, soll, ist, abbau, korrektur, saldo }]. */
async function verlauf(employeeId, { von, bis, gruppe = 'monat' } = {}) {
  const schluessel = gruppe === 'woche' ? "DATE_FORMAT(datum, '%x-W%v')" : "DATE_FORMAT(datum, '%Y-%m')";
  const bedingungen = ['employee_id = ?'];
  const werte = [employeeId];
  if (von) { bedingungen.push('datum >= ?'); werte.push(von); }
  if (bis) { bedingungen.push('datum <= ?'); werte.push(bis); }
  const [rows] = await getPool().query(
    `SELECT ${schluessel} AS zeitraum,
            COALESCE(SUM(soll_minuten), 0) AS soll,
            COALESCE(SUM(ist_minuten), 0) AS ist,
            COALESCE(SUM(IF(art = 'abbau', minuten, 0)), 0) AS abbau,
            COALESCE(SUM(IF(art = 'korrektur', minuten, 0)), 0) AS korrektur,
            SUM(minuten) AS saldo
       FROM gleitzeit_buchungen
      WHERE ${bedingungen.join(' AND ')}
      GROUP BY zeitraum ORDER BY zeitraum`, werte);
  return rows.map((r) => ({
    zeitraum: r.zeitraum, soll: Number(r.soll), ist: Number(r.ist),
    abbau: Number(r.abbau), korrektur: Number(r.korrektur), saldo: Number(r.saldo),
  }));
}

/**
 * Nach einer Zeitkorrektur oder Fremderfassung für einen vergangenen Tag.
 * Der heutige Tag wird ohnehin vom Tagesabschluss gebucht. Fehler blockieren
 * die Zeiterfassung nicht (analog urlaub.betroffeneUrlaubeNeuberechnen).
 */
async function tagGeaendert(employeeId, tag) {
  if (tag >= heuteLokal()) return null;
  try {
    return await neuberechnen(employeeId, { von: tag, bis: tag, quelle: 'neuberechnung' });
  } catch (e) {
    console.error(`[gleitzeit] Neuberechnung ${employeeId}/${tag} fehlgeschlagen: ${e.message}`);
    return { employeeId, tag, fehler: e.message };
  }
}

/** Nach Genehmigung/Storno eines Urlaubs oder Gleitzeitabbaus. */
async function zeitraumGeaendert(employeeId, von, bis) {
  try {
    return await neuberechnen(employeeId, { von, bis });
  } catch (e) {
    console.error(`[gleitzeit] Neuberechnung ${employeeId} ${von}–${bis} fehlgeschlagen: ${e.message}`);
    return { employeeId, von, bis, fehler: e.message };
  }
}

/**
 * Tagesabschluss für alle aktiven Konten. Rechnet die letzten 7 Tage mit,
 * damit ein ausgefallener Lauf sich selbst heilt. Hat ein Konto noch keine
 * Buchung, wird ab gleitzeit_seit rückwirkend gerechnet.
 */
async function tagesabschluss() {
  const db = getPool();
  const [konten] = await db.query(
    `SELECT e.id,
            (SELECT COUNT(*) FROM gleitzeit_buchungen b WHERE b.employee_id = e.id AND b.art = 'tagessaldo') AS gebucht
       FROM employees e
      WHERE e.is_demo = 0 AND e.gleitzeit_aktiv = 1 AND e.gleitzeit_seit IS NOT NULL AND e.zeiterfassung_quelle = 'portal'`);
  const heute = heuteLokal();
  const ergebnis = [];
  for (const k of konten) {
    try {
      ergebnis.push(await neuberechnen(k.id, {
        von: Number(k.gebucht) ? tagVor(heute, 7) : undefined,
        heuteAbgeschlossen: true,
        quelle: 'tagesabschluss',
      }));
    } catch (e) {
      console.error(`[gleitzeit] Tagesabschluss Mitarbeiter ${k.id}: ${e.message}`);
      ergebnis.push({ employeeId: k.id, fehler: e.message });
    }
  }
  return ergebnis;
}

/**
 * Tage eines Gleitzeitabbaus mit den jeweils abgebuchten Minuten:
 * nur Tage mit Soll > 0 (vereinbarter Arbeitstag, kein Feiertag).
 * zeiten = { von: 'HH:MM', bis: 'HH:MM' } beim stundenweisen Abbau (nur ein Tag):
 * dann die Dauer, höchstens das Tages-Soll.
 */
async function abbauTage(employeeId, von, bis, db = getPool(), zeiten = null) {
  const historie = await ladeHistorie(employeeId, db);
  const dauer = zeiten && zeiten.von ? abbauDauer(zeiten.von, zeiten.bis) : null;
  const tage = [];
  const ende = new Date(bis + 'T12:00:00Z');
  for (let d = new Date(von + 'T12:00:00Z'); d <= ende; d = new Date(+d + 86400000)) {
    const tag = d.toISOString().slice(0, 10);
    const minuten = abbauAmTag(regelSoll(arbeitszeitAm(historie, tag), tag), dauer);
    if (minuten > 0) tage.push({ tag, minuten });
  }
  return tage;
}

/**
 * Vorschau fürs Antragsformular: aktueller Stand, bereits geplanter Abbau
 * (offene und genehmigte Anträge ab heute, noch nicht gebucht) und Stand danach.
 */
async function abbauVorschau(employeeId, von, bis, zeiten = null) {
  const db = getPool();
  const konto = await ladeKonto(employeeId, db);
  if (!konto.aktiv) return { aktiv: false };
  const heute = heuteLokal();
  const tage = await abbauTage(employeeId, von, bis, db, zeiten);
  const minuten = tage.reduce((s, t) => s + t.minuten, 0);

  const [antraege] = await db.query(
    `SELECT DATE_FORMAT(start_date,'%Y-%m-%d') AS von, DATE_FORMAT(end_date,'%Y-%m-%d') AS bis,
            TIME_FORMAT(abbau_von,'%H:%i') AS zeitVon, TIME_FORMAT(abbau_bis,'%H:%i') AS zeitBis
       FROM vacation_requests
      WHERE employee_id = ? AND art = 'gleitzeitabbau' AND status IN ('pending', 'approved')
        AND cancelled_at IS NULL AND end_date >= ?`, [employeeId, heute]);
  let geplant = 0;
  for (const a of antraege) {
    const z = a.zeitVon ? { von: a.zeitVon, bis: a.zeitBis } : null;
    for (const t of await abbauTage(employeeId, maxTag(a.von, heute), a.bis, db, z)) geplant += t.minuten;
  }
  const stand = await kontostand(employeeId);
  return {
    aktiv: true,
    tage: tage.length,
    minuten,
    stand: stand.minuten,
    geplant,
    danach: stand.minuten - geplant - minuten,
  };
}

// ── Korrekturbuchungen von Hand (Backoffice/GF, hr.zeitauswertung) ──────────
// Bleiben bei jeder Neuberechnung stehen. Notiz ist Pflicht, damit der
// Kontostand nachvollziehbar bleibt.

async function korrekturen(employeeId, { von, bis } = {}) {
  const bedingungen = ["b.employee_id = ?", "b.art = 'korrektur'"];
  const werte = [employeeId];
  if (von) { bedingungen.push('b.datum >= ?'); werte.push(von); }
  if (bis) { bedingungen.push('b.datum <= ?'); werte.push(bis); }
  const [rows] = await getPool().query(
    `SELECT b.id, DATE_FORMAT(b.datum,'%Y-%m-%d') AS datum, b.minuten, b.notiz,
            DATE_FORMAT(b.created_at,'%Y-%m-%d %H:%i') AS erfasst_am,
            COALESCE(e.display_name, e.full_name, e.username) AS erfasst_von
       FROM gleitzeit_buchungen b
       LEFT JOIN employees e ON e.id = b.erstellt_von
      WHERE ${bedingungen.join(' AND ')}
      ORDER BY b.datum DESC, b.id DESC`, werte);
  return rows;
}

async function korrekturBuchen(employeeId, { datum, minuten, notiz }, erstelltVon) {
  const konto = await ladeKonto(employeeId);
  if (!konto.aktiv) throw new Error('Gleitzeitkonto nicht aktiv');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(datum || '')) throw new Error('Datum ungültig');
  if (!Number.isInteger(minuten) || minuten === 0 || Math.abs(minuten) > 500 * 60) {
    throw new Error('Korrektur ungültig (ganze Minuten, nicht 0, höchstens ±500 Stunden)');
  }
  const text = String(notiz || '').trim();
  if (!text) throw new Error('Bitte einen Grund angeben');
  const [r] = await getPool().execute(
    `INSERT INTO gleitzeit_buchungen (employee_id, datum, art, minuten, quelle, notiz, erstellt_von)
     VALUES (?, ?, 'korrektur', ?, 'hand', ?, ?)`,
    [employeeId, datum, minuten, text.slice(0, 255), erstelltVon || null]);
  console.log(`[gleitzeit] Korrektur ${r.insertId}: Mitarbeiter ${employeeId}, ${datum}, ${formatMinuten(minuten)} von ${erstelltVon}`);
  return { id: r.insertId };
}

async function korrekturLoeschen(employeeId, korrekturId, geloeschtVon) {
  const [r] = await getPool().execute(
    "DELETE FROM gleitzeit_buchungen WHERE id = ? AND employee_id = ? AND art = 'korrektur'",
    [korrekturId, employeeId]);
  if (!r.affectedRows) throw new Error('Korrektur nicht gefunden');
  console.log(`[gleitzeit] Korrektur ${korrekturId} von Mitarbeiter ${employeeId} gelöscht durch ${geloeschtVon}`);
  return { ok: true };
}

module.exports = {
  ladeKonto, neuberechnen, kontostand, verlauf,
  tagGeaendert, zeitraumGeaendert, tagesabschluss,
  abbauTage, abbauVorschau,
  korrekturen, korrekturBuchen, korrekturLoeschen,
};

// ── CLI ───────────────────────────────────────────────────────────────────────
if (require.main === module) {
  require('dotenv').config({ override: true });
  const [, , befehl, arg] = process.argv;
  (async () => {
    try {
      if (befehl === 'abschluss') console.dir(await tagesabschluss(), { depth: null });
      else if (befehl === 'neuberechnen' && arg) console.dir(await neuberechnen(Number(arg)), { depth: null });
      else if (befehl === 'stand' && arg) console.dir(await kontostand(Number(arg)), { depth: null });
      else console.log('Aufruf: abschluss | neuberechnen <id> | stand <id>');
    } catch (e) {
      console.error('FEHLER:', e.message);
      process.exitCode = 1;
    }
    process.exit();
  })();
}
