/**
 * Lagerverkauf (#516, Konzept #513 Abschnitt 11), Büro: Session + requireArea('fahrer.geraete').
 *
 *   GET  /api/fahrer-lager             { pin: { gesetzt, gesetztAm, gesetztVon }, sammelmail: { an, uhrzeit } }
 *   POST /api/fahrer-lager/pin         neue Sonder-PIN fürs Storno → { pin, gesetztAm } (Klartext nur in dieser Antwort)
 *   PUT  /api/fahrer-lager/sammelmail  { an, uhrzeit } → wie GET
 *
 * Die PIN gilt für alle Lager-Geräte (Entscheidung Klaus 23.11.2026). Gespeichert wird nur der PBKDF2-Hash, den die
 * App mit /api/fahrer/heute bekommt und offline prüft. Eine neue PIN ersetzt die alte, sobald das Gerät synct.
 */
const crypto = require('crypto');
const express = require('express');
const { FahrerFehler } = require('../../../services/fahrerKrypto');
const { sicher } = require('./index');

const PIN_RUNDEN = 100000;
const PIN_STELLEN = 5;
const EMAIL = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/;
const UHRZEIT = /^([01]\d|2[0-3]):[0-5]\d$/;
const SAMMELMAIL_STANDARD = { an: [], uhrzeit: '18:00' };

/** PBKDF2-SHA256 wie in der App (fahrer-app/www/speicher.js pinHash). */
function pinHash(pin, salzHex, runden) {
  return crypto.pbkdf2Sync(String(pin), Buffer.from(salzHex, 'hex'), runden, 32, 'sha256').toString('hex');
}

function neuePin() {
  return String(crypto.randomInt(0, 10 ** PIN_STELLEN)).padStart(PIN_STELLEN, '0');
}

const json = (roh, ersatz) => {
  if (!roh) return ersatz;
  try { return JSON.parse(roh); } catch { return ersatz; }
};

/** Empfänger aus Text oder Liste: durch Komma, Semikolon oder Zeilenumbruch getrennt, höchstens 5. */
function empfaenger(wert) {
  const liste = (Array.isArray(wert) ? wert : String(wert || '').split(/[,;\n]/)).map((x) => String(x).trim()).filter(Boolean);
  const falsch = liste.filter((x) => !EMAIL.test(x));
  if (falsch.length) throw new FahrerFehler(400, 'mail_ungueltig', `Keine gültige Mail-Adresse: ${falsch.join(', ')}`);
  if (liste.length > 5) throw new FahrerFehler(400, 'mail_zu_viele', 'Höchstens 5 Empfänger');
  return [...new Set(liste)];
}

/**
 * @param {object} deps
 * @param {object} deps.store  { lesen(schluessel), setzen(schluessel, wert, von) } – services/fahrerEinstellungen.js
 * @param {() => number} [deps.uhr]
 */
function erstelleLagerRouter({ store, uhr = Date.now }) {
  const router = express.Router();

  async function stand() {
    const pin = json(await store.lesen('storno_pin'), null);
    const mail = { ...SAMMELMAIL_STANDARD, ...json(await store.lesen('sammelmail'), {}) };
    return {
      pin: { gesetzt: Boolean(pin && pin.hash), gesetztAm: pin?.gesetztAm || null, gesetztVon: pin?.gesetztVon || null },
      sammelmail: { an: mail.an || [], uhrzeit: mail.uhrzeit || SAMMELMAIL_STANDARD.uhrzeit },
    };
  }

  router.get('/', sicher(async (req, res) => res.json(await stand())));

  router.post('/pin', sicher(async (req, res) => {
    const pin = neuePin();
    const salz = crypto.randomBytes(16).toString('hex');
    const gesetztAm = new Date(uhr()).toISOString();
    const gesetztVon = req.session?.user?.name || req.session?.user?.username || null;
    await store.setzen('storno_pin', JSON.stringify({ verfahren: 'pbkdf2-sha256', runden: PIN_RUNDEN, salz, hash: pinHash(pin, salz, PIN_RUNDEN), gesetztAm, gesetztVon }),
      req.session?.user?.id);
    console.log(`[Fahrer] Neue Sonder-PIN fürs Storno von ${req.session?.user?.username}`);
    res.set('Cache-Control', 'no-store').json({ pin, gesetztAm });
  }));

  router.put('/sammelmail', sicher(async (req, res) => {
    const an = empfaenger(req.body?.an);
    const uhrzeit = String(req.body?.uhrzeit || '').trim() || SAMMELMAIL_STANDARD.uhrzeit;
    if (!UHRZEIT.test(uhrzeit)) throw new FahrerFehler(400, 'uhrzeit_ungueltig', 'Uhrzeit im Format HH:MM, z. B. 18:00');
    await store.setzen('sammelmail', JSON.stringify({ an, uhrzeit }), req.session?.user?.id);
    res.json(await stand());
  }));

  return router;
}

module.exports = { erstelleLagerRouter, pinHash, empfaenger, PIN_RUNDEN };
