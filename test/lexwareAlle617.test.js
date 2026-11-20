/** #617: Alle Lexware-Artikel für die Liste, mit Zwischenspeicher; nur PFAND- und GZ- in die Liste. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { ladeAlleLexware, alsListenArtikel, vergesse } = require('../src/services/lexwareAlle');

test('Zwischenspeicher: zweiter Aufruf innerhalb von 5 Minuten fragt Lexware nicht nochmal, gleichzeitige Aufrufe teilen sich eine Anfrage', async () => {
  vergesse();
  let n = 0;
  const laden = async () => { n++; return [{ id: '1' }]; };
  const [a, b] = await Promise.all([ladeAlleLexware({ jetzt: 1000, laden }), ladeAlleLexware({ jetzt: 1000, laden })]);
  assert.equal(n, 1);
  assert.equal(a, b);
  await ladeAlleLexware({ jetzt: 1000 + 60_000, laden });
  assert.equal(n, 1);
  await ladeAlleLexware({ jetzt: 1000 + 6 * 60_000, laden });
  assert.equal(n, 2);
  vergesse();
});

test('Fehler beim Laden wird nicht gespeichert, der nächste Aufruf versucht es neu', async () => {
  vergesse();
  await assert.rejects(ladeAlleLexware({ jetzt: 1, laden: async () => { throw new Error('Lexware weg'); } }), /Lexware weg/);
  const r = await ladeAlleLexware({ jetzt: 2, laden: async () => [{ id: 'ok' }] });
  assert.deepEqual(r, [{ id: 'ok' }]);
  vergesse();
});

test('Listenform: nur PFAND- und GZ-, keine archivierten, ohne Preis-Tool', () => {
  const l = alsListenArtikel([
    { id: 'a', articleNumber: 'PFAND-1', title: 'Pfand', unitName: 'Stück', price: { netPrice: 80 }, note: 'PFAND\nGAS' },
    { id: 'b', articleNumber: 'GZ-2', title: 'Kappe', price: {} },
    { id: 'c', articleNumber: 'RG-3', title: 'Propan' }, { id: 'd', articleNumber: 'RZ-4', title: 'Zelt' },
    { id: 'e', articleNumber: 'GZ-5', title: 'alt', archived: true },
  ]);
  assert.deepEqual(l.map((x) => x.articleNumber), ['PFAND-1', 'GZ-2']);
  assert.equal(l[0].netPrice, 80);
  assert.deepEqual(l[0].tags, ['PFAND', 'GAS']);
  assert.equal(l[0].preisTool, false);
  assert.equal(l[1].netPrice, null);
});
