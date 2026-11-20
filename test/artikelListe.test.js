/** #606: eine Artikelliste aus Stamm, Lexware und SER. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { verbinde, zusammenfassung, luecken, stammNr } = require('../src/utils/artikelListe');

const stammFuellung = (o = {}) => ({
  artikel_nr: '7801100', bezeichnung: 'Propan 11 kg Füllung', typ: 'F', aktiv: 1, gasart: 'Propan',
  un_nr: '1965', gefahrklasse: '2.1', befoerderungskategorie: 2, ggvs_faktor: 3, fuellgewicht_kg: 11,
  pfand_artikel_nr: '7801200', preis_netto_cent: 3080, ...o,
});
const lex = (o = {}) => ({ id: 'L1', articleNumber: 'RG-7801100', name: 'Propan 11 kg Füllung', netPrice: 30.8, tags: ['Gas'], content: { value: 11, unit: 'kg' }, ...o });
const ser = (o = {}) => ({ prodnr: '7801100', name: 'Propan 11 kg Füllung', preis_cent: 3080, ...o });

test('Nummern ohne Präfix', () => {
  assert.equal(stammNr('RG-7801200'), '7801200');
  assert.equal(stammNr('NRG-2802012'), '2802012');
  assert.equal(stammNr(' 7801200 '), '7801200');
});

test('alles stimmt: Lexware ok, SER ok, Fahrer-App aktiv, nichts zu tun', () => {
  const [z] = verbinde({ stamm: [stammFuellung()], lexware: [lex()], ser: [ser()] });
  assert.deepEqual([z.lexware_status, z.ser_status, z.fahrer_app, z.luecken], ['ok', 'ok', 'aktiv', []]);
  assert.equal(z.lexware.shop, 'sichtbar');
  assert.equal(z.preis_netto_cent, 3080);
});

test('Preise: Stamm führt; abweichender Lexware- oder SER-Preis wird markiert', () => {
  const [z] = verbinde({ stamm: [stammFuellung()], lexware: [lex({ netPrice: 29.26 })], ser: [ser({ preis_cent: 2926 })] });
  assert.equal(z.lexware_status, 'abweichend');
  assert.equal(z.ser_status, 'abweichend');
  assert.equal(z.ser.preis_cent, 2926);
});

test('SER: anderer Name ist keine Abweichung mehr (#617), fehlt (nur bei im Shop sichtbaren Füllungen), NRG läuft nicht über SER', () => {
  const nameAnders = verbinde({ stamm: [stammFuellung()], lexware: [lex()], ser: [ser({ name: 'Treibgas 11kg' })] })[0];
  assert.equal(nameAnders.ser_status, 'ok');
  const fehlt = verbinde({ stamm: [stammFuellung()], lexware: [lex()], ser: [] })[0];
  assert.equal(fehlt.ser_status, 'fehlt');
  const nrg = verbinde({ stamm: [stammFuellung({ artikel_nr: '7802500' })], lexware: [lex({ articleNumber: 'NRG-7802500' })], ser: [] })[0];
  assert.equal(nrg.lexware.shop, 'ausgeblendet');
  assert.equal(nrg.ser_status, 'nicht verglichen');
});

test('Artikel nur im Stamm oder nur in Lexware', () => {
  const zeilen = verbinde({ stamm: [stammFuellung({ artikel_nr: 'T039', bezeichnung: 'Neu', preis_netto_cent: null, un_nr: null })], lexware: [lex({ id: 'L9', articleNumber: 'RG-9999999', name: 'Nur Lexware' })], ser: [] });
  const t039 = zeilen.find((z) => z.artikel_nr === 'T039');
  assert.equal(t039.lexware_status, 'fehlt');
  assert.equal(t039.lexware, null);
  const nurLex = zeilen.find((z) => z.artikel_nr === '9999999');
  assert.equal(nurLex.im_stamm, false);
  assert.equal(nurLex.bezeichnung, 'Nur Lexware');
  assert.equal(nurLex.preis_netto_cent, 3080);
  assert.equal(zusammenfassung(zeilen).nicht_im_stamm[0], '9999999');
});

test('Lücken für die Fahrer-App: nur Füllungen, benannt', () => {
  assert.deepEqual(luecken(stammFuellung()), []);
  assert.deepEqual(luecken(stammFuellung({ un_nr: null, fuellgewicht_kg: null, pfand_artikel_nr: null })), ['UN-Nr.', 'Gewicht', 'Pfand- oder Kaufflasche']);
  assert.deepEqual(luecken(stammFuellung({ befoerderungskategorie: null, ggvs_faktor: 50 })), []);
  assert.deepEqual(luecken({ typ: 'P', un_nr: null }), []);
});

test('Zusammenfassung zählt unvollständige und abweichende Artikel', () => {
  const zeilen = verbinde({
    stamm: [stammFuellung(), stammFuellung({ artikel_nr: '7801000', un_nr: null }), stammFuellung({ artikel_nr: '7801300' })],
    lexware: [lex(), lex({ id: 'L2', articleNumber: 'RG-7801000' }), lex({ id: 'L3', articleNumber: 'RG-7801300', netPrice: 1 })],
    ser: [ser(), ser({ prodnr: '7801000' }), ser({ prodnr: '7801300' })],
  });
  const z = zusammenfassung(zeilen);
  assert.deepEqual(z.unvollstaendig, ['7801000']);
  assert.deepEqual(z.abweichungen, ['7801300']);
  assert.equal(z.gesamt, 3);
});

test('ohne Stamm-Recht: nur Lexware, nichts wird als "SER fehlt" gemeldet; Lexware-Ausfall wird nicht als fehlend gemeldet', () => {
  const [z] = verbinde({ stamm: null, lexware: [lex()], ser: [] });
  assert.equal(z.im_stamm, false);
  assert.equal(z.ser_status, 'nicht verglichen');
  assert.equal(z.fahrer_app, null);
  const [y] = verbinde({ stamm: [stammFuellung()], lexware: [], ser: [], lexwareVerfuegbar: false });
  assert.equal(y.lexware_status, 'nicht verglichen');
});

const { laeuftSchon } = require('../src/utils/artikelListe');

test('Detailseite "Wo läuft der Artikel schon": Stelle, Zustand und Text', () => {
  const ok = verbinde({ stamm: [stammFuellung({ ek_gruppe: 'propan' })], lexware: [lex()], ser: [ser()] })[0];
  assert.deepEqual(ok.laeuft.map((p) => [p.stelle, p.ok]), [['Lexware', 'ok'], ['SER', 'ok'], ['Tourplanung', 'ok'], ['Fahrer-App', 'ok'], ['Auswertung', 'ok']]);
  assert.equal(ok.ek_gruppe, 'propan');

  const t039 = verbinde({ stamm: [stammFuellung({ artikel_nr: 'T039', preis_netto_cent: null, gasart: null, aktiv: 0 })], lexware: [], ser: [] })[0];
  const nach = Object.fromEntries(t039.laeuft.map((p) => [p.stelle, p]));
  assert.equal(nach['Fahrer-App'].ok, 'warn');
  assert.match(nach.Auswertung.text, /ohne Gasart und Preis/);
  assert.equal(nach.Lexware.ok, 'warn');
});

test('Detailseite: Artikel nur in Lexware wird von der Tourplanung abgelehnt', () => {
  const nurLex = verbinde({ stamm: [], lexware: [lex({ articleNumber: 'RG-1234567' })], ser: [] })[0];
  const tour = laeuftSchon(nurLex).find((p) => p.stelle === 'Tourplanung');
  assert.equal(tour.ok, 'warn');
  assert.ok(!laeuftSchon(nurLex).some((p) => p.stelle === 'Fahrer-App'));
});

test('Lücken: Pfandflasche ODER Kaufflasche genügt, beide fehlen = Lücke', () => {
  const voll = { typ: 'F', un_nr: '1965', gefahrklasse: '2.1', befoerderungskategorie: 2, fuellgewicht_kg: 11 };
  assert.deepEqual(luecken({ ...voll, pfand_artikel_nr: '7801200' }), []);
  assert.deepEqual(luecken({ ...voll, kaufflasche_artikel_nr: '7801300' }), []);
  assert.deepEqual(luecken({ ...voll }), ['Pfand- oder Kaufflasche']);
  assert.deepEqual(luecken({ ...voll, pfand_artikel_nr: '', kaufflasche_artikel_nr: null }), ['Pfand- oder Kaufflasche']);
});
