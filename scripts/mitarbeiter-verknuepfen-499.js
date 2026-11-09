/**
 * #499: Portal-User einmalig mit Authentik und Rentman verknüpfen (nur Trefferliste, schreibt nichts).
 * Aufruf im Portal-Ordner:  node scripts/mitarbeiter-verknuepfen-499.js
 * Zeigt User ohne authentik_uid / rentman_id und doppelte E-Mail-Adressen zur manuellen Prüfung.
 */
require('dotenv').config({ override: true });
const { getPool } = require('../src/db');

(async () => {
  const db = getPool();
  const [rows] = await db.query(
    `SELECT id, COALESCE(full_name, displayname, username) AS name, email, authentik_uid, rentman_id
       FROM employees ORDER BY name`);
  const ohne = (f) => rows.filter(r => !r[f]);
  const zeige = (titel, liste) => {
    console.log(`\n== ${titel} (${liste.length}) ==`);
    liste.forEach(r => console.log(`#${r.id}  ${r.name}  <${r.email || '-'}>`));
  };
  zeige('Ohne authentik_uid', ohne('authentik_uid'));
  zeige('Ohne rentman_id', ohne('rentman_id'));
  const nachMail = {};
  rows.forEach(r => { const k = (r.email || '').trim().toLowerCase(); if (k) (nachMail[k] ||= []).push(r); });
  const doppelt = Object.values(nachMail).filter(l => l.length > 1).flat();
  zeige('Doppelte E-Mail (Dubletten prüfen)', doppelt);
  process.exit(0);
})().catch(e => { console.error(e.message); process.exit(1); });
