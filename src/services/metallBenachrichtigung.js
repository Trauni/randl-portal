/**
 * Kundenmails nur mit Link (#377, Entscheidung 8): „Ihr Auftrag ist in Fertigung“, „… ist fertig“
 * und „Neue Fotos/Dateien“. Belege verschickt Lexware selbst („Speichern und senden“), dafür keine
 * Mail aus dem Portal (Entscheidung Klaus 17.10.2026); die Lieferung meldet der Lieferschein.
 *
 * Ablauf:
 *   - Fertigung setzen (metallDetail.setzeFertigung) bzw. Datei freigeben (metallDatei.setzeSichtbar)
 *     merken eine Mail in metall_benachrichtigung vor, fällig 10 Minuten später. Ein Fehlklick lässt
 *     sich so korrigieren (zurück auf „Geplant“ löscht vorgemerkte Fertigungs-Mails), mehrere
 *     Freigaben desselben Vorgangs ergeben eine Mail.
 *   - Der Zeitplan (alle 5 Minuten) verschickt fällige Mails über das admin-backend des
 *     Kundenportals (POST /admin/metall/kunden-mail). Das prüft Metall-Freigabe, Sperre und
 *     E-Mail-Adresse und antwortet { gesendet } oder { gesendet: false, grund }.
 *   - Nur mit METALL_KUNDENMAILS_AKTIV=1 (.env) wird vorgemerkt und verschickt; pro Metallkunde
 *     abschaltbar (metall_kunde.kundenmails).
 */

const VERZOEGERUNG_MIN = 10;
const MAX_VERSUCHE = 5;
const STUFE_ART = { in_arbeit: 'fertigung_beginn', fertig: 'fertigung_fertig' };

const aktiv = () => process.env.METALL_KUNDENMAILS_AKTIV === '1';

/**
 * Fertigungs-Mail vormerken: die neue Stufe ersetzt noch nicht verschickte Fertigungs-Mails des
 * Vorgangs; „geplant“ (zurückgesetzt) löscht sie nur.
 */
async function vormerkeFertigung(pool, vorgangId, stufe) {
  if (!aktiv()) return;
  await pool.execute(
    "DELETE FROM metall_benachrichtigung WHERE vorgang_id = ? AND art IN ('fertigung_beginn', 'fertigung_fertig') AND erledigt_am IS NULL",
    [vorgangId]
  );
  const art = STUFE_ART[stufe];
  if (!art) return;
  await pool.execute(
    `INSERT INTO metall_benachrichtigung (vorgang_id, art, faellig_ab) VALUES (?, ?, NOW() + INTERVAL ${VERZOEGERUNG_MIN} MINUTE)`,
    [vorgangId, art]
  );
}

/** Freigabe einer Datei: offene Dateien-Mail des Vorgangs verschieben, sonst neu vormerken */
async function vormerkeDateien(pool, vorgangId) {
  if (!aktiv()) return;
  const [res] = await pool.execute(
    `UPDATE metall_benachrichtigung SET faellig_ab = NOW() + INTERVAL ${VERZOEGERUNG_MIN} MINUTE
     WHERE vorgang_id = ? AND art = 'dateien' AND erledigt_am IS NULL`,
    [vorgangId]
  );
  if (res.affectedRows) return;
  await pool.execute(
    `INSERT INTO metall_benachrichtigung (vorgang_id, art, faellig_ab) VALUES (?, 'dateien', NOW() + INTERVAL ${VERZOEGERUNG_MIN} MINUTE)`,
    [vorgangId]
  );
}

const fertigungsStufe = v => (v.fertigung_am ? 'fertig' : v.fertigung_begonnen_am ? 'in_arbeit' : 'geplant');

/** Inhalt der Mail; null, wenn es (nicht mehr) etwas zu melden gibt */
function inhalt(n, v, neueDateien = 0) {
  const nr = v.kunden_bestellnr ? `Ihre Bestellnr. ${v.kunden_bestellnr} · Vorgang ${v.vorgangsnummer}` : `Vorgang ${v.vorgangsnummer}`;
  if (n.art === 'fertigung_beginn') {
    if (fertigungsStufe(v) !== 'in_arbeit') return null;
    return { betreff: `Ihr Auftrag ist in Fertigung – ${v.bezeichnung}`, ueberschrift: 'Ihr Auftrag ist in Fertigung',
      text: `Wir haben mit der Fertigung von „${v.bezeichnung}“ begonnen (${nr}).` };
  }
  if (n.art === 'fertigung_fertig') {
    if (fertigungsStufe(v) !== 'fertig') return null;
    return { betreff: `Ihr Auftrag ist fertig – ${v.bezeichnung}`, ueberschrift: 'Ihr Auftrag ist fertig',
      text: `„${v.bezeichnung}“ ist fertig (${nr}). Wir melden uns zur Lieferung bzw. Abholung.` };
  }
  if (n.art === 'dateien') {
    if (!neueDateien) return null;
    const was = neueDateien === 1 ? 'eine neue Datei' : `${neueDateien} neue Fotos bzw. Dateien`;
    return { betreff: `Neue Fotos zu Ihrem Auftrag – ${v.bezeichnung}`, ueberschrift: 'Neue Fotos und Dateien',
      text: `Zu Ihrem Auftrag „${v.bezeichnung}“ (${nr}) haben wir ${was} für Sie freigegeben.` };
  }
  return null;
}

async function erledige(pool, id, ergebnis, fehler = null) {
  await pool.execute('UPDATE metall_benachrichtigung SET erledigt_am = NOW(), ergebnis = ?, fehler = ? WHERE id = ?', [ergebnis, fehler, id]);
}

/**
 * Fällige Mails verschicken. senden(nutzlast) → { gesendet, grund? } (admin-backend).
 * Ergebnis: Zähler je Ergebnis, z. B. { gesendet: 2, veraltet: 1 }.
 */
async function verarbeite({ pool, senden }) {
  const [faellig] = await pool.query(
    `SELECT n.id, n.vorgang_id, n.art, n.erstellt_am, n.versuche,
            v.vorgangsnummer, v.bezeichnung, v.kunden_bestellnr, v.fertigung_begonnen_am, v.fertigung_am, v.abgebrochen_am,
            k.lexware_kontakt_id, k.kundenmails, k.aktiv
     FROM metall_benachrichtigung n
     JOIN metall_vorgang v ON v.id = n.vorgang_id
     JOIN metall_kunde k ON k.id = v.kunde_id
     WHERE n.erledigt_am IS NULL AND n.faellig_ab <= NOW()
     ORDER BY n.id LIMIT 50`
  );
  const zaehler = {};
  const zaehle = e => { zaehler[e] = (zaehler[e] || 0) + 1; };
  for (const n of faellig) {
    try {
      if (!n.aktiv || !n.kundenmails) { await erledige(pool, n.id, 'abgeschaltet'); zaehle('abgeschaltet'); continue; }
      if (n.abgebrochen_am) { await erledige(pool, n.id, 'veraltet'); zaehle('veraltet'); continue; }
      let neue = 0;
      if (n.art === 'dateien') {
        const [[{ anzahl }]] = await pool.execute(
          `SELECT COUNT(*) AS anzahl FROM metall_datei
           WHERE vorgang_id = ? AND fuer_kunde_sichtbar = 1 AND geloescht_am IS NULL AND quelle = 'mitarbeiter'
             AND sichtbar_geaendert_am >= ?`,
          [n.vorgang_id, n.erstellt_am]
        );
        neue = Number(anzahl);
      }
      const i = inhalt(n, n, neue);
      if (!i) { await erledige(pool, n.id, n.art === 'dateien' ? 'nichts_neu' : 'veraltet'); zaehle('veraltet'); continue; }
      const r = await senden({ lexware_id: n.lexware_kontakt_id, vorgangsnummer: n.vorgangsnummer, ...i });
      const ergebnis = r && r.gesendet ? 'gesendet' : (r && r.grund) || 'fehler';
      await erledige(pool, n.id, ergebnis);
      zaehle(ergebnis);
    } catch (err) {
      const versuche = n.versuche + 1;
      if (versuche >= MAX_VERSUCHE) await erledige(pool, n.id, 'fehler', String(err.message).slice(0, 500));
      else await pool.execute('UPDATE metall_benachrichtigung SET versuche = ?, fehler = ?, faellig_ab = NOW() + INTERVAL 15 MINUTE WHERE id = ?', [versuche, String(err.message).slice(0, 500), n.id]);
      console.error(`[Metall-Kundenmail] ${n.art} ${n.vorgangsnummer}:`, err.message);
      zaehle('fehler');
    }
  }
  return zaehler;
}

/** Versand über das admin-backend des Kundenportals (shopFetch) */
function sendenUeber(fetcher) {
  return async nutzlast => {
    const res = await fetcher('/admin/metall/kunden-mail', { method: 'POST', body: JSON.stringify(nutzlast) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `Kundenportal antwortet mit ${res.status}`);
    return data;
  };
}

/** Zeitplan im Portal-Prozess, nur mit METALL_KUNDENMAILS_AKTIV=1 */
function starteZeitplan() {
  if (!aktiv()) return;
  const cron = require('node-cron');
  const db = require('../db');
  const { shopFetch } = require('../routes/api/finance/shopClient');
  cron.schedule('*/5 * * * *', async () => {
    try {
      const r = await verarbeite({ pool: db.getPool(), senden: sendenUeber(shopFetch) });
      if (Object.keys(r).length) console.log('[Metall-Kundenmail]', JSON.stringify(r));
    } catch (err) {
      console.error('[Metall-Kundenmail] Durchgang fehlgeschlagen:', err.message);
    }
  });
  console.log('[Metall-Kundenmail] Zeitplan aktiv (alle 5 Minuten)');
}

module.exports = { VERZOEGERUNG_MIN, vormerkeFertigung, vormerkeDateien, inhalt, verarbeite, sendenUeber, starteZeitplan };
