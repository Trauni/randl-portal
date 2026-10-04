const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');
const fs = require('fs');

const PAGE_H = 841.92;
const toY = (topOffset) => PAGE_H - topOffset;
const MARGIN_L = 79.2;
const COL_RIGHT_X = 390;

const TABLE = {
  posX: MARGIN_L, stkX: MARGIN_L + 35, artX: MARGIN_L + 85, notizX: MARGIN_L + 300,
  headerTop: 380, firstRowTop: 398, rowHeight: 16, maxTop: 660,
};
const SIG = { fahrerTop: 705, lieferantTop: 775, lineLength: 260 };

function wrapText(text, font, size, maxWidth) {
  const lines = [];
  for (const paragraph of text.split('\n')) {
    let current = '';
    for (const word of paragraph.split(' ')) {
      const test = current ? current + ' ' + word : word;
      if (font.widthOfTextAtSize(test, size) > maxWidth && current) {
        lines.push(current); current = word;
      } else { current = test; }
    }
    lines.push(current);
  }
  return lines;
}

async function generateLieferantenauftrag({ auftrag, positionen, templatePath }) {
  const templateBytes = fs.readFileSync(templatePath);
  const src = await PDFDocument.load(templateBytes);
  const out = await PDFDocument.create();
  const font = await out.embedFont(StandardFonts.Helvetica);
  const fontBold = await out.embedFont(StandardFonts.HelveticaBold);

  const ausfertigungen = [{ label: 'Exemplar 1 – für Lieferant' }, { label: 'Exemplar 2 – für Randl' }];

  for (const ausf of ausfertigungen) {
    const [page] = await out.copyPages(src, [0]);
    out.addPage(page);

    page.drawText(ausf.label, { x: 24.5, y: toY(165), size: 8, font, color: rgb(0.35, 0.35, 0.35) });

    let y = toY(215);
    for (const line of auftrag.empfaengerZeilen) {
      page.drawText(line, { x: MARGIN_L, y, size: 10, font });
      y -= 13;
    }
    page.drawText(`Auftragsnummer: ${auftrag.auftragsnummer}`, { x: COL_RIGHT_X, y: toY(215), size: 9, font });
    page.drawText(`Datum: ${auftrag.datum}`, { x: COL_RIGHT_X, y: toY(228), size: 9, font });

    page.drawText('Lieferantenauftrag', { x: MARGIN_L, y: toY(295), size: 13, font: fontBold });

    let ky = toY(315);
    for (const line of wrapText(auftrag.kopfhinweis || '', font, 10, 460)) {
      page.drawText(line, { x: MARGIN_L, y: ky, size: 10, font });
      ky -= 12;
    }

    page.drawText('Pos', { x: TABLE.posX, y: toY(TABLE.headerTop), size: 9, font: fontBold });
    page.drawText('Stk', { x: TABLE.stkX, y: toY(TABLE.headerTop), size: 9, font: fontBold });
    page.drawText('Artikel', { x: TABLE.artX, y: toY(TABLE.headerTop), size: 9, font: fontBold });
    page.drawText('Notiz', { x: TABLE.notizX, y: toY(TABLE.headerTop), size: 9, font: fontBold });

    let rowTop = TABLE.firstRowTop;
    positionen.forEach((pos, i) => {
      const rowY = toY(rowTop);
      page.drawText(String(i + 1), { x: TABLE.posX, y: rowY, size: 9, font });
      page.drawText(String(pos.stueckzahl), { x: TABLE.stkX, y: rowY, size: 9, font });
      page.drawText(pos.bezeichnung, { x: TABLE.artX, y: rowY, size: 9, font });
      if (pos.notiz) page.drawText(pos.notiz, { x: TABLE.notizX, y: rowY, size: 8, font });
      rowTop += TABLE.rowHeight;
    });

    page.drawLine({ start: { x: MARGIN_L, y: toY(SIG.fahrerTop) }, end: { x: MARGIN_L + SIG.lineLength, y: toY(SIG.fahrerTop) }, thickness: 0.75 });
    page.drawText('Unterschrift Fahrer, Datum', { x: MARGIN_L, y: toY(SIG.fahrerTop) - 10, size: 8, font });

    page.drawLine({ start: { x: MARGIN_L, y: toY(SIG.lieferantTop) }, end: { x: MARGIN_L + SIG.lineLength, y: toY(SIG.lieferantTop) }, thickness: 0.75 });
    page.drawText('Unterschrift Lieferant, Datum', { x: MARGIN_L, y: toY(SIG.lieferantTop) - 10, size: 8, font });
  }

  return out.save();
}

module.exports = { generateLieferantenauftrag };
