/**
 * #617 Schritt A1: Migration für interne Artikel-ID, Lexware-Verknüpfung, Einheit und Artikelgruppen.
 * Ohne echte Datenbank: Der Test liest die SQL-Datei und prüft die Zusagen aus dem Kopf der Migration
 * (nur additiv, wiederholbar, Primärschlüssel unverändert). Die Probe gegen MariaDB macht der Probelauf von scripts/deploy.sh.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const DATEI = 'migration_artikel_id_617.sql';
const roh = fs.readFileSync(path.join(__dirname, '..', DATEI), 'utf8');
// Kommentare weg, Rest zu einer Zeile pro Anweisung
const sql = roh.split('\n').filter((z) => !z.trim().startsWith('--')).join('\n');
const anweisungen = sql.split(';').map((s) => s.trim()).filter(Boolean);

test('Migration ändert und löscht keine Daten und keine bestehenden Spalten', () => {
  for (const roh of anweisungen) {
    // "ON DELETE …" / "ON UPDATE …" gehören zu Fremdschlüsseln und Zeitstempeln, sind keine Datenänderung
    const a = roh.replace(/\bON (DELETE|UPDATE)\b/gi, 'ON _');
    assert.doesNotMatch(a, /\b(DROP|DELETE|TRUNCATE|UPDATE|RENAME|MODIFY|CHANGE)\b/i, `unerwartet in: ${a.slice(0, 60)}`);
    assert.doesNotMatch(a, /^\s*INSERT\b/i, `keine Vorbelegung: ${a.slice(0, 60)}`);
  }
});

test('Migration ist wiederholbar: jede Anlage mit IF NOT EXISTS', () => {
  const tabellen = anweisungen.filter((a) => /^CREATE TABLE/i.test(a));
  assert.equal(tabellen.length, 1);
  assert.match(tabellen[0], /^CREATE TABLE IF NOT EXISTS artikel_gruppe\b/i);

  const alter = anweisungen.find((a) => /^ALTER TABLE gas_artikel\b/i.test(a));
  assert.ok(alter, 'ALTER TABLE gas_artikel fehlt');
  const teile = alter.replace(/^ALTER TABLE gas_artikel\s+/i, '').split(/,\s*\n/).map((t) => t.trim()).filter((t) => /^ADD\b/i.test(t));
  assert.equal(teile.length, 8);
  for (const t of teile) assert.match(t, /\bIF NOT EXISTS\b/i, `ohne IF NOT EXISTS: ${t.slice(0, 60)}`);
});

test('gas_artikel bekommt id, lexware_id, einheit und gruppe_id, artikel_nr bleibt Primärschlüssel', () => {
  const alter = anweisungen.find((a) => /^ALTER TABLE gas_artikel\b/i.test(a));
  assert.match(alter, /ADD COLUMN IF NOT EXISTS id\s+INT\s+NOT NULL AUTO_INCREMENT/i);
  assert.match(alter, /ADD COLUMN IF NOT EXISTS lexware_id\s+CHAR\(36\)\s+NULL/i);
  assert.match(alter, /ADD COLUMN IF NOT EXISTS einheit\s+VARCHAR\(40\)\s+NULL/i);
  assert.match(alter, /ADD COLUMN IF NOT EXISTS gruppe_id\s+INT\s+NULL/i);
  assert.doesNotMatch(alter, /PRIMARY KEY/i, 'der Primärschlüssel bleibt in diesem Schritt unberührt');
  // AUTO_INCREMENT braucht in derselben Anweisung einen Schlüssel auf id
  assert.match(alter, /ADD UNIQUE INDEX IF NOT EXISTS uq_gas_artikel_id \(id\)/i);
  // Die Lexware-ID darf nur einmal vorkommen; mehrere leere Werte sind erlaubt
  assert.match(alter, /ADD UNIQUE INDEX IF NOT EXISTS uq_gas_artikel_lexware_id \(lexware_id\)/i);
});

test('Artikelgruppen sind ein Baum: Sparte oben, Gruppe löschbar nur ohne Untergruppen, Artikel verlieren nur die Zuordnung', () => {
  const tabelle = anweisungen.find((a) => /^CREATE TABLE/i.test(a));
  assert.match(tabelle, /parent_id\s+INT\s+NULL/i);
  assert.match(tabelle, /FOREIGN KEY \(parent_id\) REFERENCES artikel_gruppe\(id\) ON DELETE RESTRICT/i);
  const alter = anweisungen.find((a) => /^ALTER TABLE gas_artikel\b/i.test(a));
  assert.match(alter, /FOREIGN KEY IF NOT EXISTS \(gruppe_id\) REFERENCES artikel_gruppe\(id\) ON DELETE SET NULL/i);
});
