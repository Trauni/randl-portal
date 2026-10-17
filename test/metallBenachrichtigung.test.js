const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const b = require('../src/services/metallBenachrichtigung');

beforeEach(() => { process.env.METALL_KUNDENMAILS_AKTIV = '1'; });
afterEach(() => { delete process.env.METALL_KUNDENMAILS_AKTIV; });

function fakePool({ faellig = [], affected = 0, neueDateien = 0 } = {}) {
  const calls = [];
  const antwort = async (sql, params) => {
    calls.push({ sql: sql.replace(/\s+/g, ' ').trim(), params });
    if (/FROM metall_benachrichtigung n/.test(sql)) return [faellig];
    if (/COUNT\(\*\) AS anzahl FROM metall_datei/.test(sql)) return [[{ anzahl: neueDateien }]];
    if (/^UPDATE metall_benachrichtigung SET faellig_ab/.test(sql.trim())) return [{ affectedRows: affected }];
    return [{ affectedRows: 1 }];
  };
  return { calls, execute: antwort, query: antwort };
}

const V = { vorgangsnummer: 'V-26-0012', bezeichnung: 'Geländer', kunden_bestellnr: null, fertigung_begonnen_am: new Date(), fertigung_am: null, abgebrochen_am: null,
  lexware_kontakt_id: 'lex', kundenmails: 1, aktiv: 1, versuche: 0, erstellt_am: new Date() };

// ── Vormerken ──

test('vormerkeFertigung: ersetzt offene Fertigungs-Mails, „geplant“ löscht nur', async () => {
  let pool = fakePool();
  await b.vormerkeFertigung(pool, 5, 'in_arbeit');
  assert.match(pool.calls[0].sql, /^DELETE FROM metall_benachrichtigung WHERE vorgang_id = \? AND art IN/);
  assert.match(pool.calls[1].sql, /INSERT INTO metall_benachrichtigung .* INTERVAL 10 MINUTE/);
  assert.deepEqual(pool.calls[1].params, [5, 'fertigung_beginn']);
  pool = fakePool();
  await b.vormerkeFertigung(pool, 5, 'geplant');
  assert.equal(pool.calls.length, 1);
});

test('vormerkeDateien: offene Mail verschieben, sonst neu', async () => {
  let pool = fakePool({ affected: 1 });
  await b.vormerkeDateien(pool, 5);
  assert.equal(pool.calls.length, 1);
  pool = fakePool({ affected: 0 });
  await b.vormerkeDateien(pool, 5);
  assert.match(pool.calls[1].sql, /INSERT INTO metall_benachrichtigung .*'dateien'/);
});

test('ohne METALL_KUNDENMAILS_AKTIV wird nichts vorgemerkt', async () => {
  delete process.env.METALL_KUNDENMAILS_AKTIV;
  const pool = fakePool();
  await b.vormerkeFertigung(pool, 5, 'fertig');
  await b.vormerkeDateien(pool, 5);
  assert.equal(pool.calls.length, 0);
});

// ── Inhalt ──

test('inhalt: Fertigung nur, wenn die Stufe noch stimmt; Bestellnr. im Text', () => {
  const i = b.inhalt({ art: 'fertigung_beginn' }, { ...V, kunden_bestellnr: 'BE-1' });
  assert.match(i.betreff, /in Fertigung – Geländer/);
  assert.match(i.text, /Ihre Bestellnr\. BE-1 · Vorgang V-26-0012/);
  assert.equal(b.inhalt({ art: 'fertigung_fertig' }, V), null);
  assert.match(b.inhalt({ art: 'fertigung_fertig' }, { ...V, fertigung_am: new Date() }).text, /Lieferung bzw\. Abholung/);
  assert.equal(b.inhalt({ art: 'dateien' }, V, 0), null);
  assert.match(b.inhalt({ art: 'dateien' }, V, 3).text, /3 neue Fotos bzw\. Dateien/);
});

// ── Verarbeiten ──

test('verarbeite: sendet fällige Mail und vermerkt das Ergebnis', async () => {
  const pool = fakePool({ faellig: [{ ...V, id: 1, vorgang_id: 5, art: 'fertigung_beginn' }] });
  const gesendet = [];
  const r = await b.verarbeite({ pool, senden: async n => { gesendet.push(n); return { gesendet: true }; } });
  assert.deepEqual(r, { gesendet: 1 });
  assert.equal(gesendet[0].lexware_id, 'lex');
  assert.equal(gesendet[0].vorgangsnummer, 'V-26-0012');
  assert.deepEqual(pool.calls.at(-1).params, ['gesendet', null, 1]);
});

test('verarbeite: abgeschaltet, veraltet, kein Zugang', async () => {
  const pool = fakePool({ faellig: [
    { ...V, id: 1, art: 'fertigung_beginn', kundenmails: 0 },
    { ...V, id: 2, art: 'fertigung_fertig' },
    { ...V, id: 3, art: 'fertigung_beginn' },
  ] });
  const r = await b.verarbeite({ pool, senden: async () => ({ gesendet: false, grund: 'kein_zugang' }) });
  assert.deepEqual(r, { abgeschaltet: 1, veraltet: 1, kein_zugang: 1 });
});

test('verarbeite: Dateien zählt nur neue Freigaben aus dem Büro', async () => {
  const pool = fakePool({ faellig: [{ ...V, id: 4, vorgang_id: 5, art: 'dateien' }], neueDateien: 2 });
  let text;
  await b.verarbeite({ pool, senden: async n => { text = n.text; return { gesendet: true }; } });
  assert.match(text, /2 neue Fotos/);
  const q = pool.calls.find(c => /FROM metall_datei/.test(c.sql));
  assert.match(q.sql, /quelle = 'mitarbeiter'/);
});

test('verarbeite: Fehler → später erneut, nach 5 Versuchen aufgeben', async () => {
  let pool = fakePool({ faellig: [{ ...V, id: 1, art: 'fertigung_beginn', versuche: 0 }] });
  await b.verarbeite({ pool, senden: async () => { throw new Error('down'); } });
  assert.match(pool.calls.at(-1).sql, /SET versuche = \?, fehler = \?, faellig_ab = NOW\(\) \+ INTERVAL 15 MINUTE/);
  pool = fakePool({ faellig: [{ ...V, id: 1, art: 'fertigung_beginn', versuche: 4 }] });
  await b.verarbeite({ pool, senden: async () => { throw new Error('down'); } });
  assert.deepEqual(pool.calls.at(-1).params, ['fehler', 'down', 1]);
});
