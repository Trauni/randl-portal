const { test } = require('node:test');
const assert = require('node:assert/strict');
const m = require('../src/services/metallVorgang');

// Nachgebaute Verbindung: merkt sich die Statements, liefert nr als LAST_INSERT_ID()
function fakeConn(nr) {
  const calls = [];
  return {
    calls,
    execute: async (sql, params) => { calls.push({ sql, params }); return [{}]; },
    query: async () => [[{ nr }]],
  };
}

test('formatVorgangsnummer: zweistelliges Jahr, vierstellige Nummer', () => {
  assert.equal(m.formatVorgangsnummer(2026, 12), 'V-26-0012');
  assert.equal(m.formatVorgangsnummer(2030, 1), 'V-30-0001');
  assert.equal(m.formatVorgangsnummer(2026, 12345), 'V-26-12345');
});

test('naechsteVorgangsnummer: zählt im Jahr von "jetzt" und formatiert', async () => {
  const conn = fakeConn(7);
  assert.equal(await m.naechsteVorgangsnummer(conn, new Date(2027, 0, 1)), 'V-27-0007');
  assert.deepEqual(conn.calls[0].params, [2027]);
  assert.match(conn.calls[0].sql, /LAST_INSERT_ID\(letzte_nr \+ 1\)/);
});

test('naechsteVorgangsnummer: lehnt einen Pool ab', async () => {
  await assert.rejects(() => m.naechsteVorgangsnummer({ getConnection() {} }), /keinen Pool/);
  await assert.rejects(() => m.naechsteVorgangsnummer(null), /keinen Pool/);
});

test('normalisiereBestellnr: Leerraum zusammenfassen, leer → null, zu lang → Fehler', () => {
  assert.equal(m.normalisiereBestellnr('  47 \n 11 '), '47 11');
  assert.equal(m.normalisiereBestellnr(''), null);
  assert.equal(m.normalisiereBestellnr('   '), null);
  assert.equal(m.normalisiereBestellnr(null), null);
  assert.equal(m.normalisiereBestellnr(4711), '4711');
  assert.equal(m.normalisiereBestellnr('x'.repeat(100)).length, 100);
  assert.throws(() => m.normalisiereBestellnr('x'.repeat(101)), /zu lang/);
});

test('einleitungZeile: mit und ohne Bestellnr.', () => {
  assert.equal(
    m.einleitungZeile({ vorgangsnummer: 'V-26-0012', kundenBestellnr: '4711' }),
    'Ihre Bestellnr. 4711 · Vorgang V-26-0012'
  );
  assert.equal(m.einleitungZeile({ vorgangsnummer: 'V-26-0012' }), 'Vorgang V-26-0012');
  assert.equal(m.einleitungZeile({ vorgangsnummer: 'V-26-0012', kundenBestellnr: ' \n ' }), 'Vorgang V-26-0012');
});

test('einleitungZeile: ungültige Vorgangsnummer → Fehler', () => {
  assert.throws(() => m.einleitungZeile({ vorgangsnummer: 'V-TEST-0001' }), /Ungueltige/);
  assert.throws(() => m.einleitungZeile({}), /Ungueltige/);
});

test('leseEinleitung: genaue erste Zeile', () => {
  assert.deepEqual(
    m.leseEinleitung('Ihre Bestellnr. 4711 · Vorgang V-26-0012\nSehr geehrte Damen und Herren,'),
    { vorgangsnummer: 'V-26-0012', kundenBestellnr: '4711', exakt: true }
  );
  assert.deepEqual(
    m.leseEinleitung('Vorgang V-26-0012\r\nText'),
    { vorgangsnummer: 'V-26-0012', kundenBestellnr: null, exakt: true }
  );
});

test('leseEinleitung: "·" in der Bestellnr., Leerzeilen davor, Groß-/Kleinschreibung', () => {
  assert.equal(m.leseEinleitung('Ihre Bestellnr. A·7 · Vorgang V-26-0012').kundenBestellnr, 'A·7');
  assert.equal(m.leseEinleitung('\n\n  Vorgang V-26-0012  \nText').exakt, true);
  assert.equal(m.leseEinleitung('ihre bestellnr. 4711 · vorgang v-26-0012').vorgangsnummer, 'V-26-0012');
});

test('leseEinleitung: V-Nummer irgendwo im Text → nicht exakt, ohne Bestellnr.', () => {
  assert.deepEqual(
    m.leseEinleitung('Sehr geehrte Damen und Herren,\nzu Vorgang V-26-0003 ...'),
    { vorgangsnummer: 'V-26-0003', kundenBestellnr: null, exakt: false }
  );
});

test('leseEinleitung: keine V-Nummer → null', () => {
  assert.equal(m.leseEinleitung('Vielen Dank für Ihre Anfrage.'), null);
  assert.equal(m.leseEinleitung(''), null);
  assert.equal(m.leseEinleitung(null), null);
  assert.equal(m.leseEinleitung('Angebot · V-TEST-0001'), null);
});

test('setzeEinleitung: vorhandene Vorgangszeile ersetzen, sonst voranstellen', () => {
  const neu = 'Vorgang V-26-0019';
  assert.equal(m.setzeEinleitung('Ihre Bestellnr. 4711 · Vorgang V-26-0012\nText', neu), 'Vorgang V-26-0019\nText');
  assert.equal(m.setzeEinleitung('Text\nZeile 2', neu), 'Vorgang V-26-0019\nText\nZeile 2');
  assert.equal(m.setzeEinleitung('', neu), neu);
  assert.equal(m.setzeEinleitung(null, neu), neu);
  assert.equal(m.setzeEinleitung('Vorgang V-26-0012', neu), neu);
});

test('Rundlauf: einleitungZeile → setzeEinleitung → leseEinleitung', () => {
  const zeile = m.einleitungZeile({ vorgangsnummer: 'V-26-0042', kundenBestellnr: 'PO-2026/77' });
  const text = m.setzeEinleitung('Vielen Dank für Ihren Auftrag.', zeile);
  assert.deepEqual(m.leseEinleitung(text), { vorgangsnummer: 'V-26-0042', kundenBestellnr: 'PO-2026/77', exakt: true });
});
