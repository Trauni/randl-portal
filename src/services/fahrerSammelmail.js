/**
 * Sammelmail Lagerverkauf an die Buchhaltung (#516, Konzept #513 Abschnitt 11.8).
 * Einmal am Tag ab der eingestellten Uhrzeit: alle Belege der Lager-Tablets des Tages als ein PDF und eine Übersicht
 * der Barverkäufe und Stornos mit Summe als Vorlage fürs Kassenbuch. Versand über das admin-backend des Shops
 * (POST /admin/portal-mail, Microsoft Graph als MAIL_FROM) – das Portal selbst verschickt keine Mails.
 *
 * Einstellungen (fahrer_einstellung):
 *   sammelmail         { an: [..], uhrzeit: 'HH:MM', aktiv: bool }
 *   sammelmail_letzte  { tag, zeit, anzahl, an, uebersprungen? }   – damit jeder Tag nur einmal verschickt wird
 *   sammelmail_fehler  { zeit, meldung }                            – nächster Versuch frühestens nach 30 Minuten
 */
const { belegePdf, summen, euro } = require('./fahrerBelegPdf');

const NEUER_VERSUCH_MS = 30 * 60 * 1000;
const json = (roh, ersatz) => { if (!roh) return ersatz; try { return JSON.parse(roh); } catch { return ersatz; } };
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const datumDe = (tag) => tag.split('-').reverse().join('.');
const uhrDe = (d) => new Date(d).toLocaleTimeString('de-DE', { timeZone: 'Europe/Berlin', hour: '2-digit', minute: '2-digit' });
const uhrBerlin = (ms) => new Intl.DateTimeFormat('de-DE', { timeZone: 'Europe/Berlin', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(ms));

/** Text der Mail: Übersicht als Tabelle, Summe der gültigen Barverkäufe, Hinweis aufs PDF. */
function mailHtml({ tag, belege }) {
  const bv = belege.filter((b) => b.belegart === 'BV');
  const gueltig = bv.filter((b) => !b.storniert_am);
  const s = summen(gueltig.flatMap((b) => b.positionen || []));
  const alt = belege.filter((b) => !b.amTag);
  const zeilen = belege.map((b) => {
    const betrag = b.belegart === 'BV' ? euro(summen(b.positionen).bruttoCent) : '–';
    const status = b.storniert_am ? `storniert ${uhrDe(b.storniert_am)}${b.storno_grund ? `: ${esc(b.storno_grund)}` : ''}` : '';
    return `<tr${b.storniert_am ? ' style="color:#a00"' : ''}><td>${esc(b.ls_nummer)}</td><td>${b.amTag ? uhrDe(b.erstellt_am) : esc(new Date(b.erstellt_am).toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin' }))}</td>`
      + `<td>${b.belegart === 'BV' ? 'Barverkauf' : 'Lieferschein'}</td><td>${esc(b.kundeName || (b.kunde_nr ? `Kunde ${b.kunde_nr}` : 'ohne Kunde'))}</td>`
      + `<td>${esc(b.verkaeufer || '')}</td><td style="text-align:right">${betrag}</td><td>${status}</td></tr>`;
  }).join('');
  return `<p>Guten Abend,</p><p>hier die Belege der Lager-Tablets vom ${datumDe(tag)}. Alle Belege stehen im PDF im Anhang.</p>`
    + `<table cellpadding="4" cellspacing="0" border="1" style="border-collapse:collapse;font-family:Arial,sans-serif;font-size:13px">`
    + '<tr style="background:#eee"><th>Nummer</th><th>Zeit</th><th>Art</th><th>Kunde</th><th>Verkäufer</th><th>Betrag</th><th>Storno</th></tr>'
    + `${zeilen}</table>`
    + `<p><b>Barverkäufe:</b> ${gueltig.length}${bv.length > gueltig.length ? ` (dazu ${bv.length - gueltig.length} storniert)` : ''}, netto ${euro(s.nettoCent)}`
    + `${s.saetze.map((x) => `, MwSt. ${x.satz} % ${euro(x.mwstCent)}`).join('')}, <b>bar eingenommen ${euro(s.bruttoCent)}</b>.</p>`
    + (alt.length ? `<p>Dabei sind ${alt.length} Barverkauf/Barverkäufe von früher, die nach dem letzten Versand storniert wurden.</p>` : '')
    + '<p>Diese Mail kommt automatisch aus dem Mitarbeiterportal (Gashandel → Einstellungen → Lagerverkauf).</p>';
}

/**
 * @param {object} deps
 * @param {object} deps.belege        services/fahrerBelege.js (lagerTag, positionenZu, berlinTagesbeginn, naechsterTag, berlinTag)
 * @param {object} deps.einstellungen services/fahrerEinstellungen.js (lesen, setzen)
 * @param {(nutzlast) => Promise<object>} deps.senden   POST /admin/portal-mail
 * @param {() => Promise<object[]>} [deps.holeKundenstamm]  Kundennamen für Lager-Belege
 * @param {() => number} [deps.uhr]
 */
function erstelleSammelmail({ belege, einstellungen, senden, holeKundenstamm = async () => [], uhr = Date.now }) {
  /** Belege eines Tages samt Positionen und Kundennamen, dazu PDF, Betreff und Text. */
  async function vorbereiten(tag, { stornoSeit } = {}) {
    const von = belege.berlinTagesbeginn(tag), bis = belege.berlinTagesbeginn(belege.naechsterTag(tag));
    const liste = await belege.lagerTag({ von, bis, stornoSeit });
    const positionen = await belege.positionenZu(liste.map((b) => b.ls_nummer));
    let namen = new Map();
    if (liste.some((b) => b.kunde_nr && !b.kunde_name)) {
      try { namen = new Map((await holeKundenstamm()).map((k) => [String(k.id), k.name])); } catch { /* ohne Namen, mit Nummer */ }
    }
    const voll = liste.map((b) => ({
      ...b, positionen: positionen.filter((p) => p.ls_nummer === b.ls_nummer),
      kundeName: b.kunde_name || namen.get(String(b.kunde_nr)) || null, amTag: new Date(b.erstellt_am) >= von,
    }));
    const pdf = await belegePdf({ titel: `Lagerbelege ${datumDe(tag)}`, untertitel: 'Barverkäufe und Lieferscheine der Lager-Tablets', belege: voll, erstellt: new Date(uhr()) });
    const bar = summen(voll.filter((b) => b.belegart === 'BV' && !b.storniert_am).flatMap((b) => b.positionen)).bruttoCent;
    return {
      tag, belege: voll, pdf,
      betreff: `Lagerbelege ${datumDe(tag)}: ${voll.length} Beleg${voll.length === 1 ? '' : 'e'}, bar ${euro(bar)}`,
      html: mailHtml({ tag, belege: voll }),
    };
  }

  async function einstellung() {
    return { an: [], uhrzeit: '18:00', aktiv: false, ...json(await einstellungen.lesen('sammelmail'), {}) };
  }

  /**
   * Mail für einen Tag schicken. manuell = Knopf im Büro: geht auch ohne „aktiv“, ohne Belege und ein zweites Mal,
   * zählt aber nicht als Tagesversand. Ergebnis: { gesendet, an, anzahl } oder { gesendet: false, grund }.
   */
  async function versenden(tag, { manuell = false } = {}) {
    const e = await einstellung();
    if (!e.an.length) return { gesendet: false, grund: 'Keine Empfänger eingetragen' };
    const letzte = json(await einstellungen.lesen('sammelmail_letzte'), null);
    const stornoSeit = letzte && letzte.tag < tag && letzte.zeit ? new Date(letzte.zeit) : undefined;
    const m = await vorbereiten(tag, { stornoSeit });
    if (!m.belege.length && !manuell) {
      await einstellungen.setzen('sammelmail_letzte', JSON.stringify({ tag, zeit: new Date(uhr()).toISOString(), anzahl: 0, an: [], uebersprungen: true }));
      return { gesendet: false, grund: 'Keine Belege an diesem Tag', anzahl: 0 };
    }
    await senden({
      an: e.an, betreff: manuell ? `[Test] ${m.betreff}` : m.betreff, html: m.html,
      anhaenge: [{ name: `Lagerbelege-${tag}.pdf`, contentType: 'application/pdf', base64: Buffer.from(m.pdf).toString('base64') }],
    });
    if (!manuell) {
      await einstellungen.setzen('sammelmail_letzte', JSON.stringify({ tag, zeit: new Date(uhr()).toISOString(), anzahl: m.belege.length, an: e.an }));
      await einstellungen.setzen('sammelmail_fehler', null);
    }
    return { gesendet: true, an: e.an, anzahl: m.belege.length };
  }

  /** Jede Minute aus dem Zeitplan: ab der Uhrzeit einmal pro Tag. Holt einen verpassten Versand nach (Neustart). */
  async function pruefeZeitplan() {
    const e = await einstellung();
    if (!e.aktiv || !e.an.length) return null;
    const jetzt = uhr();
    const tag = belege.berlinTag(jetzt);
    if (uhrBerlin(jetzt) < e.uhrzeit) return null;
    const letzte = json(await einstellungen.lesen('sammelmail_letzte'), null);
    if (letzte && letzte.tag >= tag) return null;
    const fehler = json(await einstellungen.lesen('sammelmail_fehler'), null);
    if (fehler && jetzt - new Date(fehler.zeit).getTime() < NEUER_VERSUCH_MS) return null;
    try {
      return await versenden(tag);
    } catch (err) {
      await einstellungen.setzen('sammelmail_fehler', JSON.stringify({ zeit: new Date(jetzt).toISOString(), meldung: String(err.message).slice(0, 300) }));
      throw err;
    }
  }

  return { vorbereiten, versenden, pruefeZeitplan, einstellung };
}

/** Versand über das admin-backend (shopFetch). Wirft mit der Meldung des Shops. */
const sendenUeber = (shopFetch) => async (nutzlast) => {
  const res = await shopFetch('/admin/portal-mail', { method: 'POST', body: JSON.stringify(nutzlast) });
  const d = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Mailversand: ${d.error || `Shop-API ${res.status}`}`);
  return d;
};

/** Zeitplan im Portal-Prozess: jede Minute prüfen. Ob verschickt wird, entscheidet die Einstellung „aktiv“. */
function starteZeitplan(sammelmail) {
  const cron = require('node-cron');
  cron.schedule('* * * * *', async () => {
    try {
      const r = await sammelmail.pruefeZeitplan();
      if (r) console.log('[Sammelmail]', JSON.stringify(r));
    } catch (err) {
      console.error('[Sammelmail] Versand fehlgeschlagen:', err.message);
    }
  });
  console.log('[Sammelmail] Zeitplan aktiv (prüft jede Minute)');
}

module.exports = { erstelleSammelmail, sendenUeber, starteZeitplan, mailHtml };
