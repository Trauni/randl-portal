#!/usr/bin/env node
/**
 * patchnotes-import.js
 * Importiert patchnotes.json aus dem alten webadmin in die Portal-Datenbank.
 *
 * Verwendung:
 *   cd /home/radmin/web/randlweb.de/public_html/portal
 *   node patchnotes-import.js /home/radmin/web/webadmin.randlweb.de/public_html/system-admin/patchnotes.json
 */

'use strict';
const fs      = require('fs');
const path    = require('path');
const mysql   = require('mysql2/promise');
require('dotenv').config();

const file = process.argv[2];
if (!file) {
  console.error('Verwendung: node patchnotes-import.js <pfad/zu/patchnotes.json>');
  process.exit(1);
}

const notes = JSON.parse(fs.readFileSync(file, 'utf8'));
console.log(`${notes.length} Patchnotes gefunden.`);

(async () => {
  const pool = await mysql.createPool({
    host:     process.env.DB_HOST     || '127.0.0.1',
    port:     parseInt(process.env.DB_PORT || '3306'),
    database: process.env.DB_NAME,
    user:     process.env.DB_USER,
    password: process.env.DB_PASS,
    waitForConnections: true,
    connectionLimit: 2,
  });

  let inserted = 0, skipped = 0, errors = 0;

  for (const note of notes) {
    try {
      const date = new Date(note.date);
      if (isNaN(date.getTime())) {
        console.warn(`  ⚠ Ungültiges Datum bei "${note.title}" — übersprungen`);
        skipped++;
        continue;
      }
      await pool.execute(
        `INSERT IGNORE INTO patchnotes (id, title, category, content, author, date)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          note.id,
          note.title || 'Ohne Titel',
          note.category || 'Allgemein',
          (note.content || '').replace(/\r\n/g, '\n'),
          note.author || 'KP',
          date.toISOString().slice(0, 19).replace('T', ' ')
        ]
      );
      inserted++;
      process.stdout.write(`  ✓ [${note.category}] ${note.title}\n`);
    } catch (e) {
      console.error(`  ✗ Fehler bei "${note.title}": ${e.message}`);
      errors++;
    }
  }

  await pool.end();
  console.log(`\nFertig: ${inserted} importiert, ${skipped} übersprungen, ${errors} Fehler.`);
})();
