/** #617 Schritt C: Lexware-Artikel an die Artikeldatei anpassen. Ohne echte Anfragen. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createClient, LexwareError } = require('../src/services/lexware');
const { planeLexwareAenderung } = require('../src/utils/artikelDateiAbgleich');

function clientMit(antworten) {
  const calls = [];
  const fetchImpl = async (url, opt) => {
    calls.push({ url, method: opt.method, body: opt.body ? JSON.parse(opt.body) : undefined });
    const a = antworten.shift();
    if (!a) throw new Error('keine Antwort mehr vorgesehen');
    return { status: a.status || 200, ok: (a.status || 200) < 300, headers: { get: () => undefined }, text: async () => JSON.stringify(a.body ?? {}) };
  };
  return { c: createClient({ apiKey: 'k', fetchImpl, abstandMs: 0, warte: async () => {} }), calls };
}
const lexArt = (extra = {}) => ({ id: 'a1', organizationId: 'o', createdDate: 'x', updatedDate: 'y', archived: false, version: 3, title: 'Alt', type: 'PRODUCT', articleNumber: 'PFAND-5900000', unitName: 'Füllung', note: 'HEIZUNG', price: { netPrice: 2.1, taxRate: 19 }, ...extra });

test('updateArticle: überlagert nur die Felder, lässt Preis und Notiz, entfernt Nur-Lesen-Felder', async () => {
  const { c, calls } = clientMit([{ body: lexArt() }, { body: { version: 4 } }]);
  const r = await c.updateArticle('a1', { title: 'Neu', articleNumber: 'GZ-5900000' });
  assert.equal(r.geaendert, true);
  assert.equal(r.vorher.title, 'Alt');
  const put = calls[1];
  assert.equal(put.method, 'PUT');
  assert.match(put.url, /\/articles\/a1$/);
  assert.equal(put.body.title, 'Neu');
  assert.equal(put.body.articleNumber, 'GZ-5900000');
  assert.equal(put.body.unitName, 'Füllung');
  assert.equal(put.body.note, 'HEIZUNG');
  assert.deepEqual(put.body.price, { netPrice: 2.1, taxRate: 19 });
  assert.equal(put.body.version, 3);
  for (const f of ['id', 'organizationId', 'archived', 'createdDate', 'updatedDate']) assert.equal(f in put.body, false, f);
});

test('updateArticle: nichts zu ändern → kein PUT', async () => {
  const { c, calls } = clientMit([{ body: lexArt() }]);
  const r = await c.updateArticle('a1', { title: 'Alt' });
  assert.equal(r.geaendert, false);
  assert.equal(calls.length, 1);
});

test('updateArticle: bei 409 einmal neu lesen und erneut schreiben', async () => {
  const { c, calls } = clientMit([{ body: lexArt() }, { status: 409, body: { message: 'Version' } }, { body: lexArt({ version: 4 }) }, { body: { version: 5 } }]);
  const r = await c.updateArticle('a1', { title: 'Neu' });
  assert.equal(r.geaendert, true);
  assert.equal(calls.length, 4);
  assert.equal(calls[3].body.version, 4);
});

test('updateArticle: anderer Fehler wird weitergereicht', async () => {
  const { c } = clientMit([{ body: lexArt() }, { status: 400, body: { message: 'kaputt' } }]);
  await assert.rejects(c.updateArticle('a1', { title: 'Neu' }), (e) => e instanceof LexwareError && e.status === 400);
});

test('Plan: Präfix PFAND- → GZ-, Name und Einheit; gleiche Artikel bleiben unberührt', () => {
  const datei = [
    { Artikelnummer: 'GZ-5900000', Bezeichnung: 'Lecksuchspray 125ml', Einheit: 'Stück' },
    { Artikelnummer: 'RG-1', Bezeichnung: 'Propan', Einheit: 'Füllung' },
    { Artikelnummer: 'RG-9', Bezeichnung: 'Neu', Einheit: 'Füllung' },
  ];
  const lex = [
    { id: 'a1', articleNumber: 'PFAND-5900000', title: 'Lecksuchspray 125ml', unitName: 'Füllung' },
    { id: 'a2', articleNumber: 'RG-1', title: 'Propan', unitName: 'Füllung' },
  ];
  const p = planeLexwareAenderung(datei, lex);
  assert.equal(p.aenderungen.length, 1);
  assert.deepEqual(p.aenderungen[0].neu, { articleNumber: 'GZ-5900000', unitName: 'Stück' });
  assert.equal(p.unveraendert, 1);
  assert.deepEqual(p.fehlenInLexware, ['RG-9']);
});

test('Plan: mehrdeutige Zuordnung und Artikel, die die Datei selbst schon führt, werden nicht angefasst', () => {
  const datei = [{ Artikelnummer: 'GZ-7', Bezeichnung: 'X', Einheit: 'Stück' }, { Artikelnummer: 'PFAND-8', Bezeichnung: 'Y', Einheit: 'Stück' }, { Artikelnummer: 'GZ-8', Bezeichnung: 'Z', Einheit: 'Stück' }];
  const lex = [
    { id: '1', articleNumber: 'PFAND-7', title: 'X', unitName: 'Stück' }, { id: '2', articleNumber: 'NRG-7', title: 'X', unitName: 'Stück' },
    { id: '3', articleNumber: 'PFAND-8', title: 'Y', unitName: 'Stück' },
  ];
  const p = planeLexwareAenderung(datei, lex);
  assert.deepEqual(p.mehrdeutig, ['GZ-7']);
  assert.deepEqual(p.fehlenInLexware, ['GZ-8']);
  assert.equal(p.aenderungen.length, 0);
});
