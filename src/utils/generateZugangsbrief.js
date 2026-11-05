// Zugangsbrief fuer das Kundenkonto (#369): Briefpapier src/assets/briefpapier.pdf,
// Anschrift im Fenster, Kundennummer, Anleitung zur Erstanmeldung und QR-Code
// (KdNr und PLZ vorausgefuellt). Kein Passwort im Brief – die Erstanmeldung laeuft
// mit Kundennummer + PLZ, danach vergibt der Kunde sein eigenes Passwort.
const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');
const fs = require('fs');

const PAGE_H = 841.92;
const toY = top => PAGE_H - top;
const MARGIN_L = 79.2;
const COL_RIGHT_X = 390;
const BREITE = 440;

function wrapText(text, font, size, maxWidth) {
  const lines = [];
  for (const paragraph of String(text).split('\n')) {
    let current = '';
    for (const word of paragraph.split(' ')) {
      const test = current ? `${current} ${word}` : word;
      if (font.widthOfTextAtSize(test, size) > maxWidth && current) { lines.push(current); current = word; } else current = test;
    }
    lines.push(current);
  }
  return lines;
}

/** Anschriftzeilen fuer das Fenster */
function anschrift(d) {
  return [d.name, d.zusatz, d.strasse, [d.plz, d.ort].filter(Boolean).join(' ')].filter(Boolean);
}

/**
 * daten: { kundennummer, name, zusatz, strasse, plz, ort, login_url, qr_png (data:image/png;base64,…),
 *          passwort_gesetzt }
 * Ergebnis: PDF als Uint8Array
 */
async function generateZugangsbrief({ daten, templatePath, datum = new Date() }) {
  const src = await PDFDocument.load(fs.readFileSync(templatePath));
  const out = await PDFDocument.create();
  const font = await out.embedFont(StandardFonts.Helvetica);
  const bold = await out.embedFont(StandardFonts.HelveticaBold);
  const [page] = await out.copyPages(src, [0]);
  out.addPage(page);

  let y = toY(215);
  for (const z of anschrift(daten)) { page.drawText(z, { x: MARGIN_L, y, size: 10, font }); y -= 13; }

  const tag = datum.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
  page.drawText(`Kundennummer: ${daten.kundennummer}`, { x: COL_RIGHT_X, y: toY(215), size: 9, font });
  page.drawText(`Datum: ${tag}`, { x: COL_RIGHT_X, y: toY(228), size: 9, font });

  page.drawText('Ihr Zugang zum Randl-Kundenportal', { x: MARGIN_L, y: toY(295), size: 13, font: bold });

  const host = String(daten.login_url || '').replace(/^https?:\/\//, '');
  const absaetze = [
    'Guten Tag,',
    'im Randl-Kundenportal sehen Sie Ihre Aufträge im Maschinenbau mit Angeboten, Auftragsbestätigungen, Lieferscheinen und Rechnungen. Dort können Sie auch nachbestellen und neue Anfragen stellen.',
    daten.passwort_gesetzt
      ? `Sie haben bereits ein Passwort für Ihr Kundenkonto. Melden Sie sich unter ${host} mit Ihrer Kundennummer und diesem Passwort an. Haben Sie es vergessen, nutzen Sie dort „Passwort vergessen“.`
      : 'So melden Sie sich zum ersten Mal an:',
  ];
  let ty = toY(322);
  for (const a of absaetze) {
    for (const z of wrapText(a, font, 10, BREITE)) { page.drawText(z, { x: MARGIN_L, y: ty, size: 10, font }); ty -= 13; }
    ty -= 7;
  }

  if (!daten.passwort_gesetzt) {
    const schritte = [
      `Öffnen Sie ${host} oder scannen Sie den QR-Code.`,
      `Geben Sie Ihre Kundennummer ${daten.kundennummer} und die Postleitzahl Ihrer Rechnungsanschrift ein.`,
      'Legen Sie ein eigenes Passwort fest (mindestens 8 Zeichen). Danach melden Sie sich nur noch mit Kundennummer und Passwort an.',
    ];
    schritte.forEach((s, i) => {
      const zeilen = wrapText(s, font, 10, BREITE - 150);
      page.drawText(`${i + 1}.`, { x: MARGIN_L, y: ty, size: 10, font: bold });
      for (const z of zeilen) { page.drawText(z, { x: MARGIN_L + 16, y: ty, size: 10, font }); ty -= 13; }
      ty -= 5;
    });
  }

  // QR-Code rechts neben der Anleitung
  if (daten.qr_png && /^data:image\/png;base64,/.test(daten.qr_png)) {
    const png = await out.embedPng(Buffer.from(daten.qr_png.split(',')[1], 'base64'));
    const groesse = 110;
    // Neben der Anleitung (Erstanmeldung), sonst unter dem Text – nie darueber
    const qrTop = daten.passwort_gesetzt ? (PAGE_H - ty) + 4 : 400;
    page.drawImage(png, { x: MARGIN_L + BREITE - groesse, y: toY(qrTop + groesse), width: groesse, height: groesse });
    page.drawText('Anmelden per QR-Code', { x: MARGIN_L + BREITE - groesse + 10, y: toY(qrTop + groesse + 12), size: 8, font, color: rgb(0.35, 0.35, 0.35) });
    ty = Math.min(ty, toY(qrTop + groesse + 30));
  }

  ty -= 10;
  const schluss = [
    'Bitte bewahren Sie diesen Brief sorgfältig auf und geben Sie Ihre Zugangsdaten nicht weiter. Bei Fragen erreichen Sie uns gern telefonisch oder per E-Mail.',
    'Mit freundlichen Grüßen\nIhr Team der Randl GmbH',
  ];
  for (const a of schluss) {
    for (const z of wrapText(a, font, 10, BREITE)) { page.drawText(z, { x: MARGIN_L, y: ty, size: 10, font }); ty -= 13; }
    ty -= 7;
  }
  return out.save();
}

module.exports = { generateZugangsbrief, anschrift };
