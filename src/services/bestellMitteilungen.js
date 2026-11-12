/**
 * Meldet neue Bestellungen als Mitteilung, egal auf welchem Weg sie entstanden sind.
 *
 * Bestellungen liegen im admin-backend des Gas-Shops (webshop_orders). Dort schreiben der Shop,
 * das Backoffice und die Mobile-Erfassung hinein, im Portal sieht man sie nur über die Shop-API.
 * Darum fragt ein Zeitplan die jüngsten Bestellungen ab und merkt sich in
 * mitteilung_quelle_gesehen, welche schon gemeldet wurden. So ist es unabhängig vom Weg und von
 * der Art der ID. Der erste Durchlauf füllt nur die Merkliste und meldet nichts (kein Alarm für den
 * ganzen Altbestand).
 */
const QUELLE = 'bestellung';
const LIMIT = 100;
const EINZELN_BIS = 3; // ab mehr neuen Bestellungen je Durchlauf geht nur ein Sammel-Push raus

const eur = (n) => Number(n).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });

function herkunft(o) {
  const note = String(o.delivery_note || '');
  if (note.startsWith('[Mobile]')) return 'Mobile-Erfassung';
  return 'Shop/Backoffice';
}

function inhalt(o) {
  const name = o.customer_name || o.customer_number || 'Unbekannter Kunde';
  const pos = Array.isArray(o.items) ? o.items.length : null;
  const teile = [herkunft(o)];
  if (pos !== null) teile.push(`${pos} ${pos === 1 ? 'Position' : 'Positionen'}`);
  if (o.total_gross != null && !Number.isNaN(Number(o.total_gross))) teile.push(eur(o.total_gross));
  return { titel: `Neue Bestellung: ${name}`, text: teile.join(' · ') };
}

/**
 * Ein Durchlauf. holeBestellungen() liefert das Array der jüngsten Bestellungen.
 * Gibt { neu, erstlauf } zurück.
 */
async function pruefe({ pool, holeBestellungen, mitteilungen }) {
  const bestellungen = (await holeBestellungen()).filter((o) => o && o.id != null);
  const [[{ anzahl }]] = await pool.execute('SELECT COUNT(*) AS anzahl FROM mitteilung_quelle_gesehen WHERE quelle = ?', [QUELLE]);
  const erstlauf = anzahl === 0;
  const neue = [];
  for (const o of bestellungen) {
    const [res] = await pool.execute('INSERT IGNORE INTO mitteilung_quelle_gesehen (quelle, ref) VALUES (?, ?)', [QUELLE, String(o.id)]);
    if (res.affectedRows === 1 && !erstlauf) neue.push(o);
  }
  if (!neue.length) return { neu: 0, erstlauf };

  const einzeln = neue.length <= EINZELN_BIS;
  for (const o of neue.reverse()) {
    const { titel, text } = inhalt(o);
    await mitteilungen.notify(pool, { art: 'bestellung_neu', area: 'gashandel', titel, text, link: '/mobile/#/mitteilungen', push: einzeln });
  }
  if (!einzeln) {
    await mitteilungen.pushNur(pool, { art: 'bestellung_neu', area: 'gashandel', titel: `${neue.length} neue Bestellungen`, link: '/mobile/#/mitteilungen' });
  }
  return { neu: neue.length, erstlauf };
}

function starteZeitplan() {
  if (process.env.BESTELL_MITTEILUNGEN_AKTIV === '0') return;
  const cron = require('node-cron');
  const db = require('../db');
  const mitteilungen = require('./mitteilungen');
  const { shopFetch } = require('../routes/api/finance/shopClient');
  const holeBestellungen = async () => {
    const res = await shopFetch(`/admin/webshop-orders?limit=${LIMIT}`);
    if (!res.ok) throw new Error(`Shop-API ${res.status}`);
    const data = await res.json();
    return data.orders || [];
  };
  let laeuft = false;
  cron.schedule('* * * * *', async () => {
    if (laeuft) return;
    laeuft = true;
    try {
      const r = await pruefe({ pool: db.getPool(), holeBestellungen, mitteilungen });
      if (r.neu) console.log('[Bestell-Mitteilungen]', JSON.stringify(r));
    } catch (err) {
      console.error('[Bestell-Mitteilungen] Durchgang fehlgeschlagen:', err.message);
    } finally { laeuft = false; }
  });
  console.log('[Bestell-Mitteilungen] Zeitplan aktiv (jede Minute)');
}

module.exports = { QUELLE, herkunft, inhalt, pruefe, starteZeitplan };
