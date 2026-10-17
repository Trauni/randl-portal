const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const a = require('../src/services/metallKundenAktion');

const KONTO = { konto_id: 'bac8-1', kdnr: '10827', name: 'Testfirma', email: 'test@example.org' };

// ── Formular pruefen ──

test('pruefeAnfrage: Anfrage mit Feldern, Datum deutsch, Lieferart als Text', () => {
  const r = a.pruefeAnfrage({ art: 'anfrage', bezeichnung: ' Halterung  Förderband ', kunden_bestellnr: 'BE-4512', menge: '24 Stk', wunschtermin: '2026-11-03', lieferart: 'abholung', beschreibung: 'S235\r\nverzinkt' });
  assert.equal(r.bezeichnung, 'Halterung Förderband');
  assert.equal(r.wunschtermin, '03.11.2026');
  assert.equal(r.lieferart, 'Abholung in Obing');
  assert.equal(r.beschreibung, 'S235\nverzinkt');
  assert.equal(r.vorlageNr, null);
});

test('pruefeAnfrage: Pflichtfelder und Fehler', () => {
  assert.throws(() => a.pruefeAnfrage({ art: 'x', bezeichnung: 'a' }), /Unbekannte Art/);
  assert.throws(() => a.pruefeAnfrage({ art: 'anfrage' }), /Bezeichnung/);
  assert.throws(() => a.pruefeAnfrage({ art: 'nachbestellung', bezeichnung: 'a' }), /früheren Auftrag/);
  assert.throws(() => a.pruefeAnfrage({ art: 'anfrage', bezeichnung: 'a', wunschtermin: '3.11.' }), /Wunschtermin/);
  assert.throws(() => a.pruefeAnfrage({ art: 'anfrage', bezeichnung: 'a', lieferart: 'mond' }), /Lieferart/);
  assert.equal(a.pruefeAnfrage({ art: 'nachbestellung', bezeichnung: 'a', vorlage_nr: 'V-26-0001' }).vorlageNr, 'V-26-0001');
});

test('anfrageText: Zeilen fuer den Eingang', () => {
  const r = a.pruefeAnfrage({ art: 'nachbestellung', bezeichnung: 'a', vorlage_nr: 'V-26-0001', menge: '10', lieferart: 'lieferung', beschreibung: 'wie letztes Mal' });
  assert.equal(a.anfrageText(r, { vorlageBez: 'Geländer', dateienAnzahl: 2 }),
    'Nachbestellung von V-26-0001 (Geländer)\nMenge: 10\nLieferung: Lieferung an Rechnungsadresse\nDateien: 2\n\nwie letztes Mal');
  assert.equal(a.anfrageText(a.pruefeAnfrage({ art: 'anfrage', bezeichnung: 'a' })), null);
});

// ── Nachgebauter Pool (inkl. Verbindung fuer legeVorgangAn) ──

function fakePool({ heute = 0, vorgang, vorlage, angebot, ab = 0, schonAngenommen = false } = {}) {
  const calls = [];
  let vorgangId = 50;
  let eingangVorgang = null;
  const antwort = async (sql, params) => {
    calls.push({ sql, params });
    if (/FROM metall_kunde WHERE lexware_kontakt_id/.test(sql)) return [[{ id: 3, name: 'Testfirma GmbH', kdnr: '10827' }]];
    if (/FROM metall_eingang\s+WHERE kunden_konto_id/.test(sql)) return [[{ n: heute }]];
    if (/SELECT id, bezeichnung FROM metall_vorgang WHERE vorgangsnummer/.test(sql)) return [[vorlage].filter(Boolean)];
    if (/FROM metall_vorgang WHERE vorgangsnummer = \? AND kunde_id/.test(sql)) return [[vorgang].filter(Boolean)];
    if (/FROM metall_beleg WHERE id = \? AND belegart = 'quotation'/.test(sql)) return [[angebot].filter(Boolean)];
    if (/belegart = 'orderconfirmation'/.test(sql)) return [[{ n: ab }]];
    if (/FROM metall_annahme WHERE vorgang_id = \? LIMIT 1/.test(sql)) return [[schonAngenommen ? { id: 1 } : undefined].filter(Boolean)];
    if (/^INSERT INTO metall_annahme/.test(sql.trim())) return [{ insertId: 77 }];
    // legeVorgangAn (auf der Verbindung)
    if (/FROM metall_kunde WHERE id = \?/.test(sql)) return [[{ id: 3, lexware_kontakt_id: 'lex', aktiv: 1 }]];
    if (/FROM metall_beleg WHERE id = \?$/.test(sql.trim())) return [[{ id: 11, belegart: 'quotation', lexware_kontakt_id: 'lex' }]];
    if (/SELECT id, kunde_id FROM metall_vorgang WHERE id/.test(sql)) return [[{ id: 9, kunde_id: 3 }]];
    if (/INSERT INTO metall_vorgang_zaehler/.test(sql)) return [{}];
    if (/LAST_INSERT_ID\(\) AS nr/.test(sql)) return [[{ nr: 12 }]];
    if (/^INSERT INTO metall_vorgang /.test(sql.trim())) return [{ insertId: ++vorgangId }];
    if (/SELECT \* FROM metall_vorgang WHERE id/.test(sql)) return [[{ id: vorgangId, vorgangsnummer: 'V-26-0012', kunden_bestellnr: null }]];
    // Eingang
    if (/SELECT v.id, k.name FROM metall_vorgang v JOIN metall_kunde/.test(sql)) {
      eingangVorgang = params[0] === vorgang?.vorgangsnummer ? vorgang.id : vorgangId;
      return [[{ id: eingangVorgang, name: 'Testfirma GmbH' }]];
    }
    if (/SELECT vorgang_id FROM metall_annahme WHERE id/.test(sql)) return [[{ vorgang_id: eingangVorgang }]];
    if (/^INSERT INTO metall_eingang/.test(sql.trim())) return [{ insertId: 88 }];
    return [{ affectedRows: 1 }];
  };
  const conn = { execute: antwort, query: antwort, beginTransaction: async () => {}, commit: async () => {}, rollback: async () => {}, release() {} };
  return { calls, execute: antwort, query: antwort, getConnection: async () => conn };
}

test('anfrage: legt Vorgang an und meldet in den Eingang', async () => {
  const pool = fakePool();
  const r = await a.anfrage(pool, 'lex', { art: 'anfrage', bezeichnung: 'Halterung', menge: '24 Stk' }, [], KONTO);
  assert.deepEqual(r, { vorgangsnummer: 'V-26-0012', eingang_id: 88, art: 'anfrage', bezeichnung: 'Halterung', nachricht: 'Menge: 24 Stk', dateien: { gespeichert: [], abgelehnt: [] } });
  const ins = pool.calls.find(c => /^INSERT INTO metall_vorgang /.test(c.sql.trim()));
  assert.equal(ins.params[4], 'anfrage');
  const ein = pool.calls.find(c => /^INSERT INTO metall_eingang/.test(c.sql.trim()));
  assert.deepEqual(ein.params.slice(0, 2), ['anfrage', 51]);
  assert.equal(ein.params.at(-1), 'Menge: 24 Stk');
  assert.equal(ein.params[5], 'bac8-1');
});

test('anfrage: ab 5 am Tag → 429 mit Hinweis, kein Vorgang', async () => {
  const pool = fakePool({ heute: 5 });
  await assert.rejects(a.anfrage(pool, 'lex', { art: 'anfrage', bezeichnung: 'x' }, [], KONTO), err => err.status === 429 && /kontaktieren Sie uns/.test(err.message));
  assert.ok(!pool.calls.some(c => /INSERT INTO metall_vorgang /.test(c.sql)));
});

test('anfrage: Nachbestellung nur zu eigenem frueheren Auftrag', async () => {
  await assert.rejects(a.anfrage(fakePool({ vorlage: null }), 'lex', { art: 'nachbestellung', bezeichnung: 'x', vorlage_nr: 'V-26-0001' }, [], KONTO), err => err.status === 404);
  const pool = fakePool({ vorlage: { id: 9, bezeichnung: 'Geländer' } });
  await a.anfrage(pool, 'lex', { art: 'nachbestellung', bezeichnung: 'Geländer', vorlage_nr: 'V-26-0001' }, [], KONTO);
  const ins = pool.calls.find(c => /^INSERT INTO metall_vorgang /.test(c.sql.trim()));
  assert.deepEqual([ins.params[4], ins.params[6]], ['nachbestellung', 9]);
});

test('anfrage: ohne Konto → 400', async () => {
  await assert.rejects(a.anfrage(fakePool(), 'lex', { art: 'anfrage', bezeichnung: 'x' }, [], {}), err => err.status === 400);
});

// ── Annahme ──

const VORGANG = { id: 5, vorgangsnummer: 'V-26-0005', bezeichnung: 'Geländer', kunden_bestellnr: null, angebot_beleg_id: 11, abgebrochen_am: null };
const ANGEBOT = { id: 11, lexware_id: 'q-1', belegnummer: 'AG0083', belegstatus: 'open', archiviert: 0, lexware_version: 3, betrag_brutto: '1190.00' };
const PDF = Buffer.from('%PDF-1.7 angebot');
const lexware = { getVoucherFile: async () => PDF };

test('annahme: protokolliert mit PDF-Pruefsumme und meldet in den Eingang', async () => {
  const pool = fakePool({ vorgang: VORGANG, angebot: ANGEBOT });
  const r = await a.annahme({ pool, lexware }, 'lex', 'V-26-0005', { angebot_id: 11, kunden_bestellnr: 'BE-1', ip: '1.2.3.4', user_agent: 'UA' }, KONTO);
  assert.equal(r.vorgangsnummer, 'V-26-0005');
  assert.equal(r.neuer_vorgang, false);
  const prot = pool.calls.find(c => /^INSERT INTO metall_annahme/.test(c.sql.trim())).params;
  assert.equal(prot[0], 5);
  assert.equal(prot[2], 'AG0083');
  assert.equal(prot[5], crypto.createHash('sha256').update(PDF).digest('hex'));
  assert.deepEqual(prot.slice(6), ['bac8-1', '10827', 'BE-1', '1.2.3.4', 'UA']);
  assert.ok(pool.calls.some(c => /UPDATE metall_vorgang SET kunden_bestellnr/.test(c.sql)));
  const ein = pool.calls.find(c => /^INSERT INTO metall_eingang/.test(c.sql.trim())).params;
  assert.deepEqual(ein.slice(0, 3), ['annahme', 5, 77]);
  assert.match(ein.at(-1), /AG0083 über 1\.190,00\s€ brutto online angenommen/);
});

test('annahme: schon angenommen ohne AB → 409', async () => {
  await assert.rejects(a.annahme({ pool: fakePool({ vorgang: VORGANG, angebot: ANGEBOT, schonAngenommen: true }), lexware }, 'lex', 'V-26-0005', { angebot_id: 11 }, KONTO),
    err => err.status === 409 && /bereits angenommen/.test(err.message));
});

test('annahme: Vorgang hat schon eine AB → neuer Vorgang mit herkunft annahme', async () => {
  const pool = fakePool({ vorgang: VORGANG, angebot: { ...ANGEBOT, belegstatus: 'accepted' }, ab: 1 });
  const r = await a.annahme({ pool, lexware }, 'lex', 'V-26-0005', { angebot_id: 11 }, KONTO);
  assert.equal(r.neuer_vorgang, true);
  assert.equal(r.vorgangsnummer, 'V-26-0012');
  const ins = pool.calls.find(c => /^INSERT INTO metall_vorgang /.test(c.sql.trim()));
  assert.deepEqual([ins.params[4], ins.params[5]], ['annahme', 11]);
});

test('annahme: falsches Angebot, Entwurf, storniert, Lexware weg', async () => {
  await assert.rejects(a.annahme({ pool: fakePool({ vorgang: VORGANG, angebot: ANGEBOT }), lexware }, 'lex', 'V-26-0005', { angebot_id: 12 }, KONTO), err => err.status === 404);
  await assert.rejects(a.annahme({ pool: fakePool({ vorgang: VORGANG, angebot: { ...ANGEBOT, belegstatus: 'draft' } }), lexware }, 'lex', 'V-26-0005', { angebot_id: 11 }, KONTO), err => err.status === 409);
  await assert.rejects(a.annahme({ pool: fakePool({ vorgang: { ...VORGANG, abgebrochen_am: new Date() }, angebot: ANGEBOT }), lexware }, 'lex', 'V-26-0005', { angebot_id: 11 }, KONTO), err => err.status === 409);
  const pool = fakePool({ vorgang: VORGANG, angebot: ANGEBOT });
  await a.annahme({ pool, lexware: { getVoucherFile: async () => { throw new Error('down'); } } }, 'lex', 'V-26-0005', { angebot_id: 11 }, KONTO);
  assert.equal(pool.calls.find(c => /^INSERT INTO metall_annahme/.test(c.sql.trim())).params[5], null);
  assert.match(pool.calls.find(c => /^INSERT INTO metall_eingang/.test(c.sql.trim())).params.at(-1), /Prüfsumme des PDFs fehlt/);
});
