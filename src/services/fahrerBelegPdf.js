/**
 * PDF der Fahrer-App-Belege (#516): Tagesliste der Lagerverkäufe und die Belege selbst, für die Sammelmail an die
 * Buchhaltung und den Download im Büro. A4 hoch, Helvetica (WinAnsi: Umlaute und € gehen, Zeichen außerhalb werden
 * ersetzt). Die Rechnung der Summen ist dieselbe wie in der App (fahrer-app/www/speicher.js belegSummen).
 */
const zlib = require('zlib');
const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');

// ── PNG vorab prüfen ─────────────────────────────────────────────────────────
// pdf-lib (embedPng) hängt bei einem beschädigten PNG in einer Endlosschleife und blockiert damit den ganzen Prozess
// (getestet 24.11.2026). Darum kommt nur ein vollständig geprüftes Bild ins PDF: Signatur, Prüfsumme jedes Blocks,
// IHDR, und die entpackten Bilddaten müssen genau so groß sein, wie Breite × Höhe es verlangen.
const CRC_TABELLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABELLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
const KANAELE = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };
const MAX_PNG_BYTES = 512 * 1024, MAX_KANTE = 4000;

/** true, wenn buf ein vollständiges, nicht verschachteltes PNG ist, das pdf-lib sicher einbetten kann. */
function pngGueltig(buf) {
  try {
    if (!Buffer.isBuffer(buf) || buf.length < 57 || buf.length > MAX_PNG_BYTES) return false;
    if (!buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return false;
    let pos = 8, ihdr = null, ende = false;
    const idat = [];
    while (pos + 12 <= buf.length) {
      const laenge = buf.readUInt32BE(pos), typ = buf.toString('latin1', pos + 4, pos + 8);
      if (pos + 12 + laenge > buf.length) return false;
      const daten = buf.subarray(pos + 8, pos + 8 + laenge);
      if (crc32(buf.subarray(pos + 4, pos + 8 + laenge)) !== buf.readUInt32BE(pos + 8 + laenge)) return false;
      if (typ === 'IHDR') ihdr = daten;
      else if (typ === 'IDAT') idat.push(daten);
      else if (typ === 'IEND') { ende = true; break; }
      pos += 12 + laenge;
    }
    if (!ihdr || ihdr.length !== 13 || !idat.length || !ende) return false;
    const breite = ihdr.readUInt32BE(0), hoehe = ihdr.readUInt32BE(4), tiefe = ihdr[8], farbe = ihdr[9], interlace = ihdr[12];
    if (!breite || !hoehe || breite > MAX_KANTE || hoehe > MAX_KANTE || interlace !== 0 || !KANAELE[farbe] || ![1, 2, 4, 8, 16].includes(tiefe)) return false;
    const roh = zlib.inflateSync(Buffer.concat(idat), { maxOutputLength: 64 * 1024 * 1024 });
    return roh.length === hoehe * (1 + Math.ceil((breite * KANAELE[farbe] * tiefe) / 8));
  } catch {
    return false;
  }
}

const BREITE = 595.28, HOEHE = 841.89, RAND = 42;
const GRAU = rgb(0.4, 0.4, 0.4), LINIE = rgb(0.8, 0.8, 0.8), ROT = rgb(0.7, 0.1, 0.1);

/** Summen eines Barverkaufs aus den Positionen: Netto, MwSt je Satz (auf die Satzsumme gerundet), Brutto. */
function summen(positionen) {
  const saetze = new Map();
  let nettoCent = 0;
  for (const p of positionen || []) {
    const menge = Number(p.geliefert) || 0;
    if (!menge || p.preis_netto_cent == null) continue;
    const netto = Math.round(menge * Number(p.preis_netto_cent)), satz = Number(p.mwst_satz) || 0;
    nettoCent += netto;
    saetze.set(satz, (saetze.get(satz) || 0) + netto);
  }
  const liste = [...saetze.entries()].sort((a, b) => b[0] - a[0]).map(([satz, netto]) => ({ satz, nettoCent: netto, mwstCent: Math.round(netto * satz / 100) }));
  const mwstCent = liste.reduce((s, x) => s + x.mwstCent, 0);
  return { nettoCent, saetze: liste, mwstCent, bruttoCent: nettoCent + mwstCent };
}

const euro = (cent) => {
  const n = Math.round(Number(cent) || 0), a = Math.abs(n);
  return `${n < 0 ? '-' : ''}${String(Math.floor(a / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, '.')},${String(a % 100).padStart(2, '0')} €`;
};
const zahl = (v) => { const x = Number(v) || 0; return Number.isInteger(x) ? String(x) : String(x).replace('.', ','); };
const zeitDe = (d, mitDatum = true) => new Date(d).toLocaleString('de-DE', {
  timeZone: 'Europe/Berlin', ...(mitDatum ? { day: '2-digit', month: '2-digit', year: 'numeric' } : {}), hour: '2-digit', minute: '2-digit',
});
/** Kurz für die Übersicht: „24.11., 09:05“ */
const zeitKurz = (d) => new Date(d).toLocaleString('de-DE', { timeZone: 'Europe/Berlin', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
const artName = (b) => (b.belegart === 'BV' ? 'Barverkauf' : 'Lieferschein');
const kundeText = (b) => b.kunde_name || b.kundeName || (b.kunde_nr ? `Kunde ${b.kunde_nr}` : (b.belegart === 'BV' ? 'ohne Kunde' : '–'));

/**
 * @param {object} o
 * @param {string} o.titel        z. B. „Lagerbelege 24.11.2026“
 * @param {string} [o.untertitel]
 * @param {object[]} o.belege     Zeilen aus fahrerBelege (mit positionen, optional kundeName, unterschrift_png)
 * @param {boolean} [o.tagesliste] Übersicht mit Summen vorneweg
 * @param {Date} [o.erstellt]
 * @returns {Promise<Uint8Array>}
 */
async function belegePdf({ titel, untertitel, belege, tagesliste = true, erstellt = new Date() }) {
  const doc = await PDFDocument.create();
  doc.setTitle(titel);
  doc.setAuthor('Randl Mitarbeiterportal');
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const fett = await doc.embedFont(StandardFonts.HelveticaBold);

  // Zeichen, die WinAnsi nicht kennt, durch „?“ ersetzen statt am Ende zu scheitern.
  const geht = new Map();
  const sauber = (t) => [...String(t ?? '')].map((c) => {
    if (!geht.has(c)) { try { font.encodeText(c); geht.set(c, true); } catch { geht.set(c, false); } }
    return geht.get(c) ? c : '?';
  }).join('');
  const kuerzen = (t, f, gr, max) => {
    let s = sauber(t);
    if (f.widthOfTextAtSize(s, gr) <= max) return s;
    while (s.length > 1 && f.widthOfTextAtSize(`${s}…`, gr) > max) s = s.slice(0, -1);
    return `${s}…`;
  };

  let seite, y;
  const neueSeite = () => {
    seite = doc.addPage([BREITE, HOEHE]);
    y = HOEHE - RAND;
    seite.drawText(sauber('Dominik Randl Gashandel · Grünweg 1 · 83370 Seeon'), { x: RAND, y: HOEHE - 24, size: 8, font, color: GRAU });
    seite.drawText(sauber(titel), { x: BREITE - RAND - font.widthOfTextAtSize(sauber(titel), 8), y: HOEHE - 24, size: 8, font, color: GRAU });
  };
  const platz = (h) => { if (y - h < RAND + 20) neueSeite(); };
  const text = (t, x, { gr = 10, f = font, farbe, rechts } = {}) => {
    const s = sauber(t);
    seite.drawText(s, { x: rechts ? x - f.widthOfTextAtSize(s, gr) : x, y, size: gr, font: f, color: farbe });
  };
  const linie = (dicke = 0.5) => { seite.drawLine({ start: { x: RAND, y: y + 4 }, end: { x: BREITE - RAND, y: y + 4 }, thickness: dicke, color: LINIE }); };
  // Trennlinie in einer Tabelle, direkt nach zeile(): mittig zwischen der Unterlänge der Zeile darüber (y + 12) und der
  // Oberkante der nächsten (y + 6,5), dann etwas Luft. Mit linie() lief sie durch den Text der nächsten Zeile.
  const trenner = () => {
    seite.drawLine({ start: { x: RAND, y: y + 9.5 }, end: { x: BREITE - RAND, y: y + 9.5 }, thickness: 0.5, color: LINIE });
    y -= 3;
  };
  /** Tabellenzeile: spalten = [{ t, x, b (Breite), rechts }] */
  const zeile = (spalten, { gr = 9, f = font, farbe } = {}) => {
    platz(gr + 5);
    for (const s of spalten) {
      const t = kuerzen(s.t, f, gr, s.b);
      seite.drawText(t, { x: s.rechts ? s.x + s.b - f.widthOfTextAtSize(t, gr) : s.x, y, size: gr, font: f, color: farbe });
    }
    y -= gr + 5;
  };

  neueSeite();
  text(titel, RAND, { gr: 18, f: fett }); y -= 20;
  if (untertitel) { text(untertitel, RAND, { gr: 10, farbe: GRAU }); y -= 14; }
  text(`Erstellt ${zeitDe(erstellt)} · ${belege.length} Beleg${belege.length === 1 ? '' : 'e'}`, RAND, { gr: 9, farbe: GRAU }); y -= 22;

  if (tagesliste && belege.length) {
    const bv = belege.filter((b) => b.belegart === 'BV');
    const gueltig = bv.filter((b) => !b.storniert_am);
    const s = summen(gueltig.flatMap((b) => b.positionen || []));
    text('Übersicht', RAND, { gr: 12, f: fett }); y -= 16;
    const sp = [{ x: RAND, b: 86 }, { x: RAND + 88, b: 62 }, { x: RAND + 152, b: 58 }, { x: RAND + 212, b: 150 }, { x: RAND + 364, b: 70 }, { x: RAND + 436, b: 75, rechts: true }];
    zeile(['Nummer', 'Zeit', 'Art', 'Kunde', 'Verkäufer', 'Betrag'].map((t, i) => ({ ...sp[i], t })), { f: fett });
    trenner();
    for (const b of belege) {
      const betrag = b.belegart === 'BV' ? euro(summen(b.positionen).bruttoCent) : '–';
      zeile([b.ls_nummer, zeitKurz(b.erstellt_am), artName(b), kundeText(b), b.verkaeufer || b.fahrer_name || '', b.storniert_am ? `${betrag} storniert` : betrag]
        .map((t, i) => ({ ...sp[i], t })), { farbe: b.storniert_am ? ROT : undefined });
    }
    trenner(); y -= 2;
    const summe = (l, w, f = font) => { platz(14); text(l, RAND + 212, { gr: 10, f }); text(w, BREITE - RAND, { gr: 10, f, rechts: true }); y -= 14; };
    summe(`Barverkäufe (${gueltig.length}${bv.length > gueltig.length ? `, ${bv.length - gueltig.length} storniert` : ''}) netto`, euro(s.nettoCent));
    for (const x of s.saetze) summe(`MwSt. ${zahl(x.satz)} %`, euro(x.mwstCent));
    summe('Bar eingenommen', euro(s.bruttoCent), fett);
    y -= 16;
  }

  for (const b of belege) {
    const pos = b.positionen || [];
    platz(90);
    linie(1); y -= 8;
    text(`${artName(b)} ${b.ls_nummer}`, RAND, { gr: 12, f: fett });
    text(zeitDe(b.erstellt_am), BREITE - RAND, { gr: 10, rechts: true }); y -= 15;
    const info = [`Gerät ${b.geraet_kennung || '?'}`, b.verkaeufer ? `Verkäufer ${b.verkaeufer}` : b.fahrer_name ? `Fahrer ${b.fahrer_name}` : null,
      b.tour_name ? `Tour ${b.tour_name}` : null, b.zahlart === 'bar' ? 'Zahlart bar' : null].filter(Boolean).join(' · ');
    text(info, RAND, { gr: 9, farbe: GRAU }); y -= 13;
    text(`Kunde: ${kundeText(b)}${b.kunde_nr && !kundeText(b).includes(b.kunde_nr) ? ` (${b.kunde_nr})` : ''}`, RAND, { gr: 10 }); y -= 14;
    if (b.storniert_am) {
      text(`STORNIERT am ${zeitDe(b.storniert_am)}${b.storno_verkaeufer ? ` von ${b.storno_verkaeufer}` : ''}: ${b.storno_grund || ''}`, RAND, { gr: 10, f: fett, farbe: ROT }); y -= 14;
    }
    y -= 2;
    const bvB = b.belegart === 'BV';
    // „Bestellt“ nur, wenn es eine Bestellung gab (Tour). Am Lager gibt es keine.
    const mitSoll = !bvB && pos.some((p) => p.soll != null);
    const sp = bvB
      ? [{ x: RAND, b: 240 }, { x: RAND + 245, b: 50, rechts: true }, { x: RAND + 300, b: 45, rechts: true }, { x: RAND + 350, b: 80, rechts: true }, { x: RAND + 436, b: 75, rechts: true }]
      : mitSoll
        ? [{ x: RAND, b: 300 }, { x: RAND + 305, b: 60, rechts: true }, { x: RAND + 370, b: 70, rechts: true }, { x: RAND + 446, b: 65, rechts: true }]
        : [{ x: RAND, b: 360 }, { x: RAND + 370, b: 70, rechts: true }, { x: RAND + 446, b: 65, rechts: true }];
    const kopf = bvB ? ['Artikel', 'Menge', 'Leer', 'Einzel netto', 'Gesamt netto'] : mitSoll ? ['Artikel', 'Bestellt', 'Geliefert', 'Leer'] : ['Artikel', 'Menge', 'Leer'];
    zeile(kopf.map((t, i) => ({ ...sp[i], t })), { f: fett });
    trenner();
    for (const p of pos) {
      const name = `${p.bezeichnung}${p.artikel_nr ? ` (${p.artikel_nr})` : ''}`;
      const werte = bvB
        ? [name, zahl(p.geliefert), zahl(p.leergut), p.preis_netto_cent == null ? '–' : euro(p.preis_netto_cent),
          p.preis_netto_cent == null ? '–' : euro(Math.round(Number(p.geliefert) * Number(p.preis_netto_cent)))]
        : mitSoll ? [name, p.soll == null ? '' : zahl(p.soll), zahl(p.geliefert), zahl(p.leergut)] : [name, zahl(p.geliefert), zahl(p.leergut)];
      zeile(werte.map((t, i) => ({ ...sp[i], t })));
    }
    if (bvB) {
      const s = summen(pos);
      y -= 2;
      const z = (l, w, f = font) => { platz(13); text(l, RAND + 300, { gr: 9, f }); text(w, BREITE - RAND, { gr: 9, f, rechts: true }); y -= 13; };
      z('Summe netto', euro(s.nettoCent));
      for (const x of s.saetze) z(`zzgl. MwSt. ${zahl(x.satz)} %`, euro(x.mwstCent));
      z(b.storniert_am ? 'Betrag (storniert)' : 'Bar bezahlt', euro(s.bruttoCent), fett);
    }
    if (b.unterzeichner || b.unterschrift_png) {
      y -= 4;
      const pngDaten = b.unterschrift_png ? Buffer.from(b.unterschrift_png, 'base64') : null;
      if (pngDaten && pngGueltig(pngDaten)) {
        try {
          const bild = await doc.embedPng(pngDaten);
          const w = 150, h = Math.min(60, (bild.height / bild.width) * w);
          platz(h + 16);
          seite.drawImage(bild, { x: RAND, y: y - h + 8, width: w, height: h });
          y -= h;
        } catch { /* Unterschrift nicht lesbar: nur der Name */ }
      }
      platz(14);
      text(`Unterschrift: ${b.unterzeichner || '–'}`, RAND, { gr: 9, farbe: GRAU }); y -= 14;
    }
    y -= 10;
  }
  if (!belege.length) text('Keine Belege.', RAND, { gr: 11, farbe: GRAU });
  return doc.save();
}

module.exports = { belegePdf, summen, euro, pngGueltig };
