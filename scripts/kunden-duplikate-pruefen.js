/**
 * Prüft Kunden-Duplikate zwischen Gas-Shop (gas-db) und Lexware. Ohne --ausfuehren nur lesend.
 * In Lexware wird nie etwas geschrieben.
 *
 * Aufruf (als root im Portal-Ordner, braucht LEXWARE_API_KEY und GAS_DB_USER/GAS_DB_PASS aus der .env):
 *   node scripts/kunden-duplikate-pruefen.js                   Übersicht und Listen als Text
 *   node scripts/kunden-duplikate-pruefen.js --name mustermann   zusätzlich alle Einträge zu einem Namen
 *   node scripts/kunden-duplikate-pruefen.js --csv <Ordner>    Listen als CSV-Dateien (für Excel), Ordner wird angelegt
 * Die CSV-Dateien enthalten Kundennamen und Adressen: nicht ins Repo legen.
 *
 * Korrekturen in der gas-db (zeigen erst nur an, was passieren würde; schreiben nur mit --ausfuehren):
 *   --nummern-korrigieren   lexware_customer_number = Nummer des verknüpften Lexware-Kontakts; ausgelassen,
 *                           wenn ein anderer Shop-Kunde die Nummer schon als Lexware- oder SER-Nummer trägt
 *   --geloeschte-loesen     Verknüpfung auf gelöschte Lexware-Kontakte lösen (lexware_id, in_lexware);
 *                           die Nummer bleibt, damit der Login damit weiter geht. Ein späterer Push läuft
 *                           dann über die Duplikat-Rückfrage statt still einen neuen Kontakt anzulegen.
 * Jede Änderung prüft den bisherigen Stand mit; passt eine nicht, wird nichts geändert.
 *
 * Lexware erlaubt 2 Anfragen/s für den ganzen Schlüssel; der Client schickt höchstens 1/s,
 * 250 Kontakte je Seite.
 */
require('dotenv').config({ override: true });
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
const lexware = require('../src/services/lexware');
const { getPool } = require('../src/db');
const { nummernOhneKonflikt, normal, lexwareKontakt, shopKunde, lexwareDuplikate, shopDuplikate, abgleich } = require('../src/utils/kundenDuplikate');

const gasPool = () => new Pool({ host: '127.0.0.1', port: 5433, database: 'gaswebshop', user: process.env.GAS_DB_USER, password: process.env.GAS_DB_PASS });
const arg = (n) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : null; };

async function ladeLexware() {
  const alle = [];
  for (let page = 0; page < 200; page++) {
    const d = await lexware.apiCall('GET', `/contacts?customer=true&page=${page}&size=250`);
    alle.push(...(d.content || []));
    process.stderr.write(`\rLexware: ${alle.length} Kontakte`);
    if (d.last || !(d.content || []).length) break;
  }
  process.stderr.write('\n');
  return alle.map(lexwareKontakt);
}

async function ladeShop() {
  const pool = gasPool();
  try {
    const spalten = `c.id, c.name, c.company_name, c.first_name, c.last_name, c.billing_street, c.billing_zip, c.billing_city,
             c.lexware_id, c.lexware_customer_number, c.in_lexware, c.customer_number, c.source, c.created_at,
             c.datum_letzte_lieferung`;
    let rows;
    try {
      ({ rows } = await pool.query(`SELECT ${spalten},
             (SELECT COUNT(*) FROM webshop_orders o WHERE o.customer_id = c.id) AS bestellungen FROM customers c`));
    } catch (err) {
      // Der Portal-Benutzer darf webshop_orders nicht lesen (#232): dann ohne Bestellzahl
      if (err.code !== '42501') throw err;
      console.error('Hinweis: keine Leserechte auf webshop_orders, Bestellungen werden nicht gezählt');
      ({ rows } = await pool.query(`SELECT ${spalten}, NULL AS bestellungen FROM customers c`));
    }
    return rows.map(shopKunde);
  } finally {
    await pool.end();
  }
}

const lx = (k) => `${k.nummer || '—'}${k.archiviert ? ' (archiviert)' : ''} | ${k.name} | ${k.strasse}, ${k.plz} ${k.ort}`;
const sh = (k) => `${k.ausgeblendet ? '[im Portal ausgeblendet] ' : ''}Lexware-Nr ${k.lexware_nr || '—'}${k.lexware_id ? '' : ' (nicht verknüpft)'} | ${k.name} | ${k.strasse}, ${k.plz} ${k.ort} | SER ${k.ser_nr || '—'} | ${k.bestellungen == null ? '' : k.bestellungen + ' Best. | '}letzte Lief. ${k.letzte_lieferung || '—'} | ${k.quelle || ''} | id ${k.id}`;

function abschnitt(titel, zeilen) {
  console.log(`\n== ${titel} (${zeilen.length}) ==`);
  if (!zeilen.length) console.log('    (keine)');
  for (const z of zeilen) console.log(z);
}

const gruppenText = (gruppen, fmt) => gruppen.map((g) => [`  [${g.art || g.nummer}]`, ...g.eintraege.map((e) => '    ' + fmt(e))].join('\n'));

function csv(datei, kopf, zeilen) {
  const esc = (v) => { const s = String(v ?? ''); return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  fs.writeFileSync(datei, '﻿' + [kopf, ...zeilen].map((z) => z.map(esc).join(';')).join('\n'));
}

// Die Liste enthält nur Kunden-Kontakte. Was dort fehlt, einzeln nachfragen:
// Lieferanten (z. B. IONOS) gibt es, archivierte zählen extra, nur 404 heißt wirklich gelöscht.
async function pruefeEinzeln(ab) {
  const fehlt = [];
  ab.archiviert = [];
  ab.lieferant = [];
  for (const k of ab.kontaktFehlt) {
    try {
      const c = await lexware.getContact(k.lexware_id);
      if (c.archived) ab.archiviert.push(k);
      else if (!c.roles?.customer) ab.lieferant.push(k);
      else fehlt.push(k);
    } catch (err) {
      if (err.status !== 404) throw err;
      fehlt.push(k);
    }
    process.stderr.write(`\rEinzeln geprüft: ${ab.archiviert.length + ab.lieferant.length + fehlt.length}/${ab.kontaktFehlt.length}`);
  }
  if (ab.kontaktFehlt.length) process.stderr.write('\n');
  ab.kontaktFehlt = fehlt;
}

// Im Portal ausgeblendete Kunden (Soft-Delete, customer_exclusions) markieren
async function markiereAusgeblendet(kunden) {
  const [rows] = await getPool().query('SELECT customer_id FROM customer_exclusions');
  const aus = new Set(rows.map((r) => r.customer_id));
  for (const k of kunden) k.ausgeblendet = aus.has(k.id);
}

// Mehrere Änderungen in einer Transaktion; jede muss genau eine Zeile treffen, sonst Rücknahme
async function schreibe(titel, aenderungen) {
  console.log(`\n== ${titel}: ${aenderungen.length} Änderung(en) ==`);
  for (const a of aenderungen) console.log('    ' + a.text);
  if (!aenderungen.length) return;
  if (!process.argv.includes('--ausfuehren')) { console.log('    (nur angezeigt; mit --ausfuehren wird geschrieben)'); return; }
  const pool = gasPool();
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    for (const a of aenderungen) {
      const r = await c.query(a.sql, a.werte);
      if (r.rowCount !== 1) throw new Error(`Stand passt nicht bei: ${a.text} – nichts geändert`);
    }
    await c.query('COMMIT');
    console.log('    ✓ geschrieben');
  } catch (err) {
    await c.query('ROLLBACK');
    throw err;
  } finally {
    c.release();
    await pool.end();
  }
}

async function korrigiere(ab, kunden) {
  if (process.argv.includes('--nummern-korrigieren')) {
    const { ok, konflikt } = nummernOhneKonflikt(ab.nummerFalsch, kunden);
    abschnitt('Nummer NICHT korrigiert: neue Nummer trägt schon ein anderer Shop-Kunde', konflikt.map((k) =>
      `    ${k.name}: ${k.lexware_nr || '—'} → ${k.nummer_lexware} kollidiert mit ` +
      k.mit.map((a) => `${a.name} (Lexware-Nr ${a.lexware_nr || '—'}, SER ${a.ser_nr || '—'})`).join(', ')));
    await schreibe('Lexware-Nummer korrigieren', ok.map((k) => ({
      text: `${k.name}: ${k.lexware_nr || '—'} → ${k.nummer_lexware}`,
      sql: 'UPDATE customers SET lexware_customer_number = $3 WHERE id = $1 AND lexware_id = $2 AND lexware_customer_number IS NOT DISTINCT FROM $4',
      werte: [k.id, k.lexware_id, k.nummer_lexware, k.lexware_nr],
    })));
  }
  if (process.argv.includes('--geloeschte-loesen')) {
    await schreibe('Verknüpfung auf gelöschte Lexware-Kontakte lösen', ab.kontaktFehlt.map((k) => ({
      text: `${k.name} (Lexware-Nr ${k.lexware_nr || '—'} bleibt eingetragen)`,
      sql: 'UPDATE customers SET lexware_id = NULL, in_lexware = false WHERE id = $1 AND lexware_id = $2',
      werte: [k.id, k.lexware_id],
    })));
  }
}

async function main() {
  const [kontakte, kunden] = [await ladeLexware(), await ladeShop()];
  await markiereAusgeblendet(kunden);
  const dupLex = lexwareDuplikate(kontakte);
  const dupShop = shopDuplikate(kunden);
  const ab = abgleich(kunden, kontakte);
  await pruefeEinzeln(ab);

  console.log(`Lexware-Kunden: ${kontakte.length}, Shop-Kunden: ${kunden.length}`);
  abschnitt('Lexware: doppelte Kontakte (gleicher Name+PLZ oder Straße+PLZ)', gruppenText(dupLex, lx));
  abschnitt('Shop: doppelte Kunden (gleicher Name+PLZ)', gruppenText(dupShop, sh));
  abschnitt('Shop: Lexware-Nummer passt nicht zum verknüpften Kontakt', ab.nummerFalsch.map((k) => `    ${sh(k)}  → in Lexware: ${k.nummer_lexware} ${k.name_lexware}`));
  abschnitt('Shop: verknüpfter Lexware-Kontakt existiert nicht mehr (nächster Push legt neu an!)', ab.kontaktFehlt.map((k) => '    ' + sh(k)));
  abschnitt('Shop: verknüpfter Lexware-Kontakt ist archiviert', ab.archiviert.map((k) => '    ' + sh(k)));
  console.log(`\n(${ab.lieferant.length} Shop-Einträge hängen an Lexware-Kontakten ohne Kundenrolle, z. B. Lieferanten; nicht aufgeführt)`);
  abschnitt('Shop: Lexware-Nummer eingetragen, aber nicht verknüpft', ab.verwaist.map((k) => '    ' + sh(k)));
  abschnitt('Shop: mehrere Kunden mit derselben Lexware-Nummer', gruppenText(ab.doppeltVerknuepft, sh));

  const name = arg('--name');
  if (name) {
    const n = normal(name);
    abschnitt(`Lexware: „${name}“`, kontakte.filter((k) => normal(k.name).includes(n)).map((k) => `    ${lx(k)} | id ${k.id}`));
    abschnitt(`Shop: „${name}“`, kunden.filter((k) => normal(k.name).includes(n)).map((k) => '    ' + sh(k) + ` | lexware_id ${k.lexware_id || '—'}`));
  }

  const ordner = arg('--csv');
  if (ordner) {
    fs.mkdirSync(ordner, { recursive: true });
    const kopfLx = ['Gruppe', 'Art', 'Lexware-Nr', 'Archiviert', 'Name', 'Straße', 'PLZ', 'Ort', 'Lexware-ID'];
    csv(path.join(ordner, 'lexware-duplikate.csv'), kopfLx, dupLex.flatMap((g, i) => g.eintraege.map((e) => [i + 1, g.art, e.nummer, e.archiviert ? 'ja' : '', e.name, e.strasse, e.plz, e.ort, e.id])));
    const kopfSh = ['Gruppe', 'Befund', 'Lexware-Nr', 'Lexware-Nr laut Lexware', 'Verknüpft', 'Name', 'Straße', 'PLZ', 'Ort', 'SER-Nr', 'Bestellungen', 'Letzte Lieferung', 'Quelle', 'Shop-ID', 'Lexware-ID', 'Im Portal ausgeblendet'];
    const zeile = (g, befund, e) => [g, befund, e.lexware_nr, e.nummer_lexware || '', e.lexware_id ? 'ja' : 'nein', e.name, e.strasse, e.plz, e.ort, e.ser_nr, e.bestellungen ?? '', e.letzte_lieferung || '', e.quelle, e.id, e.lexware_id, e.ausgeblendet ? 'ja' : ''];
    csv(path.join(ordner, 'shop-befunde.csv'), kopfSh, [
      ...dupShop.flatMap((g, i) => g.eintraege.map((e) => zeile(`D${i + 1}`, 'Shop-Duplikat', e))),
      ...ab.doppeltVerknuepft.flatMap((g, i) => g.eintraege.map((e) => zeile(`N${i + 1}`, 'gleiche Lexware-Nr', e))),
      ...ab.nummerFalsch.map((e) => zeile('', 'Nummer passt nicht', e)),
      ...ab.kontaktFehlt.map((e) => zeile('', 'Kontakt fehlt in Lexware', e)),
      ...ab.archiviert.map((e) => zeile('', 'Kontakt archiviert', e)),
      ...ab.verwaist.map((e) => zeile('', 'nicht verknüpft', e)),
    ]);
    console.log(`\nCSV: ${path.resolve(ordner)}`);
  }

  await korrigiere(ab, kunden);
}

main().then(() => process.exit(0)).catch((err) => { console.error(err.message); process.exit(1); });
