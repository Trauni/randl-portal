/**
 * Testdaten Metallarbeiten aufraeumen (#380, vor dem Pilot).
 *
 * Fuer die angegebenen Test-Metallkunden (KdNr):
 *   - alle Vorgaenge loeschen, mit Dateien (Ordner <METALL_UPLOAD_DIR>/<Vorgangsnummer>),
 *     Annahme-Protokoll, Eingang und Kundenmail-Warteschlange
 *   - Eingang ohne Vorgang (Freischaltungs-Anfragen) dieser KdNr/Lexware-Kontakte loeschen
 *   - Belege bleiben als 'ignoriert' stehen: Lexware loescht die Test-Belege nicht, und der
 *     Sync ordnet nur 'offen' neu zu – so tauchen sie nicht wieder unter „Belege zuordnen“ auf
 *   - mit --loeschen <KdNr>: Merker und Belege des Kunden ganz entfernen (z. B. Testfirma 2)
 *
 * Schutz: nur Metallkunden mit „test“ im Namen. Die Kundenkonten im Kundenportal (gas-db)
 * und die Kontakte/Belege in Lexware fasst das Skript nicht an.
 *
 * CLI (im Portal-Ordner, liest die .env):
 *   node src/services/metallAufraeumen.js                       Uebersicht aller Metallkunden
 *   node src/services/metallAufraeumen.js 126007 --loeschen 126008   Probe: was wuerde geloescht
 *   … --jetzt                                                    wirklich ausfuehren
 *   … --zaehler-zuruecksetzen                                    Vorgangsnummern des Jahres neu ab 0001
 *                                                                (nur wenn danach kein Vorgang mehr da ist)
 */

const fs = require('fs/promises');
const path = require('path');

const NUMMER_RE = /^V-\d{2}-\d{4,}$/;
const TEST_NAME_RE = /test/i;

/** Aufruf zerlegen: KdNr (behalten + aufraeumen), --loeschen KdNr, --jetzt, --zaehler-zuruecksetzen */
function leseArgumente(argv) {
  const a = { behalten: [], loeschen: [], jetzt: false, zaehler: false };
  for (let i = 0; i < argv.length; i++) {
    const x = String(argv[i]).trim();
    if (x === '--jetzt') a.jetzt = true;
    else if (x === '--zaehler-zuruecksetzen') a.zaehler = true;
    else if (x === '--loeschen') {
      const nr = String(argv[++i] ?? '').trim();
      if (!nr || nr.startsWith('--')) throw new Error('--loeschen braucht eine KdNr');
      a.loeschen.push(nr);
    } else if (x.startsWith('--')) throw new Error(`Unbekannte Option ${x}`);
    else if (x) a.behalten.push(x);
  }
  a.behalten = a.behalten.filter(nr => !a.loeschen.includes(nr));
  return a;
}

/** Metallkunden zu den KdNr laden und pruefen (gibt es, genau einer, „test“ im Namen) */
async function ladeKunden(db, kdnrs) {
  if (!kdnrs.length) return [];
  const [rows] = await db.query('SELECT * FROM metall_kunde WHERE TRIM(kdnr) IN (?)', [kdnrs]);
  for (const nr of kdnrs) {
    const treffer = rows.filter(k => String(k.kdnr).trim() === nr);
    if (!treffer.length) throw new Error(`KdNr ${nr} ist kein Metallkunde`);
    if (treffer.length > 1) throw new Error(`KdNr ${nr} gibt es ${treffer.length}-mal als Metallkunde`);
    if (!TEST_NAME_RE.test(treffer[0].name)) {
      throw new Error(`KdNr ${nr} („${treffer[0].name}“) ist kein Testkunde – abgebrochen`);
    }
  }
  return rows;
}

/** Was wuerde geloescht? Liest nur. */
async function plane(db, args) {
  const behalten = await ladeKunden(db, args.behalten);
  const loeschen = await ladeKunden(db, args.loeschen);
  const kunden = [...behalten, ...loeschen];
  const kundeIds = kunden.map(k => k.id);
  const kontakte = kunden.map(k => k.lexware_kontakt_id);
  const kdnrs = kunden.map(k => String(k.kdnr).trim());
  const plan = { behalten, loeschen, vorgaenge: [], zaehl: {} };
  if (!kunden.length) return plan;

  const [vorgaenge] = await db.query(
    'SELECT id, vorgangsnummer, kunde_id FROM metall_vorgang WHERE kunde_id IN (?) ORDER BY id', [kundeIds]);
  plan.vorgaenge = vorgaenge;
  const vIds = vorgaenge.length ? vorgaenge.map(v => v.id) : [0];

  const zaehle = async (sql, params) => (await db.query(sql, params))[0][0].n;
  plan.zaehl = {
    dateien: await zaehle('SELECT COUNT(*) AS n FROM metall_datei WHERE vorgang_id IN (?)', [vIds]),
    annahmen: await zaehle('SELECT COUNT(*) AS n FROM metall_annahme WHERE vorgang_id IN (?)', [vIds]),
    eingang: await zaehle(
      `SELECT COUNT(*) AS n FROM metall_eingang
       WHERE vorgang_id IN (?) OR TRIM(kdnr) IN (?) OR lexware_kontakt_id IN (?)`, [vIds, kdnrs, kontakte]),
    benachrichtigungen: await zaehle('SELECT COUNT(*) AS n FROM metall_benachrichtigung WHERE vorgang_id IN (?)', [vIds]),
    belege_ignorieren: behalten.length
      ? await zaehle(`SELECT COUNT(*) AS n FROM metall_beleg WHERE lexware_kontakt_id IN (?) AND zuordnung <> 'ignoriert'`,
        [behalten.map(k => k.lexware_kontakt_id)])
      : 0,
    belege_loeschen: loeschen.length
      ? await zaehle('SELECT COUNT(*) AS n FROM metall_beleg WHERE lexware_kontakt_id IN (?)',
        [loeschen.map(k => k.lexware_kontakt_id)])
      : 0,
  };
  return plan;
}

/** Plan in einer Transaktion ausfuehren; Ordner danach loeschen. deps: { pool, uploadDir, rm } */
async function fuehreAus(deps, plan, { zaehler = false } = {}) {
  const kunden = [...plan.behalten, ...plan.loeschen];
  if (!kunden.length) throw new Error('Keine KdNr angegeben');
  const vIds = plan.vorgaenge.length ? plan.vorgaenge.map(v => v.id) : [0];
  const kontakte = kunden.map(k => k.lexware_kontakt_id);
  const kdnrs = kunden.map(k => String(k.kdnr).trim());
  const ergebnis = { zaehler_zurueckgesetzt: false, ordner: [] };

  const conn = await deps.pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.query('DELETE FROM metall_benachrichtigung WHERE vorgang_id IN (?)', [vIds]);
    await conn.query(
      'DELETE FROM metall_eingang WHERE vorgang_id IN (?) OR TRIM(kdnr) IN (?) OR lexware_kontakt_id IN (?)',
      [vIds, kdnrs, kontakte]);
    await conn.query('DELETE FROM metall_annahme WHERE vorgang_id IN (?)', [vIds]);
    await conn.query('DELETE FROM metall_datei WHERE vorgang_id IN (?)', [vIds]);
    if (plan.behalten.length) {
      await conn.query(
        `UPDATE metall_beleg SET vorgang_id = NULL, vorschlag_vorgang_id = NULL, gesperrt_vorgang_id = NULL,
                zuordnung = 'ignoriert', zugeordnet_von = NULL, zugeordnet_am = NOW()
         WHERE lexware_kontakt_id IN (?)`, [plan.behalten.map(k => k.lexware_kontakt_id)]);
    }
    // Verweise anderer Vorgaenge/Belege auf die Test-Vorgaenge (ohne Fremdschluessel) loesen
    await conn.query('UPDATE metall_beleg SET gesperrt_vorgang_id = NULL WHERE gesperrt_vorgang_id IN (?)', [vIds]);
    await conn.query('UPDATE metall_vorgang SET angebot_beleg_id = NULL, vorlage_vorgang_id = NULL WHERE id IN (?)', [vIds]);
    await conn.query('DELETE FROM metall_vorgang WHERE id IN (?)', [vIds]);
    if (plan.loeschen.length) {
      await conn.query('DELETE FROM metall_beleg WHERE lexware_kontakt_id IN (?)', [plan.loeschen.map(k => k.lexware_kontakt_id)]);
      await conn.query('DELETE FROM metall_kunde WHERE id IN (?)', [plan.loeschen.map(k => k.id)]);
    }
    if (zaehler) {
      const [[rest]] = await conn.query('SELECT COUNT(*) AS n FROM metall_vorgang');
      if (rest.n === 0) {
        await conn.query('DELETE FROM metall_vorgang_zaehler WHERE jahr = ?', [new Date().getFullYear()]);
        ergebnis.zaehler_zurueckgesetzt = true;
      }
    }
    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }

  // Dateien erst nach dem Commit; nur gueltige Nummern direkt unter dem Ablageordner
  if (deps.uploadDir) {
    const basis = path.resolve(deps.uploadDir);
    for (const v of plan.vorgaenge) {
      if (!NUMMER_RE.test(v.vorgangsnummer)) continue;
      const ordner = path.join(basis, v.vorgangsnummer);
      await deps.rm(ordner, { recursive: true, force: true });
      ergebnis.ordner.push(ordner);
    }
  }
  return ergebnis;
}

module.exports = { leseArgumente, ladeKunden, plane, fuehreAus };

if (require.main === module) {
  require('dotenv').config();
  (async () => {
    const pool = require('../db').getPool();
    try {
      const args = leseArgumente(process.argv.slice(2));
      const [alle] = await pool.query(
        `SELECT k.id, k.kdnr, k.name, k.aktiv,
                (SELECT COUNT(*) FROM metall_vorgang v WHERE v.kunde_id = k.id) AS vorgaenge,
                (SELECT COUNT(*) FROM metall_beleg b WHERE b.lexware_kontakt_id = k.lexware_kontakt_id) AS belege
         FROM metall_kunde k ORDER BY k.id`);
      console.log('Metallkunden:');
      console.table(alle);
      if (!args.behalten.length && !args.loeschen.length) {
        console.log('Aufruf: <KdNr …> [--loeschen <KdNr>] [--zaehler-zuruecksetzen] [--jetzt]');
        process.exit(0);
      }
      const plan = await plane(pool, args);
      console.log('Aufraeumen (Vorgaenge loeschen, Belege ignorieren):', plan.behalten.map(k => `${k.kdnr} ${k.name}`).join(', ') || '–');
      console.log('Ganz loeschen (Merker + Belege):', plan.loeschen.map(k => `${k.kdnr} ${k.name}`).join(', ') || '–');
      console.log('Vorgaenge:', plan.vorgaenge.map(v => v.vorgangsnummer).join(', ') || '–');
      console.table([plan.zaehl]);
      if (!args.jetzt) {
        console.log('PROBE – nichts geaendert. Zum Ausfuehren denselben Befehl mit --jetzt.');
        process.exit(0);
      }
      const erg = await fuehreAus({ pool, uploadDir: process.env.METALL_UPLOAD_DIR, rm: fs.rm }, plan, { zaehler: args.zaehler });
      console.log('ERLEDIGT.', erg.ordner.length, 'Ordner entfernt.',
        args.zaehler ? (erg.zaehler_zurueckgesetzt ? 'Zaehler zurueckgesetzt.' : 'Zaehler NICHT zurueckgesetzt (es gibt noch Vorgaenge).') : '');
      process.exit(0);
    } catch (err) {
      console.error('FEHLER:', err.message);
      process.exit(1);
    }
  })();
}
