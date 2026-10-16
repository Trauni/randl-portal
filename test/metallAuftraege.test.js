const { test } = require('node:test');
const assert = require('node:assert/strict');
const a = require('../src/services/metallAuftraege');

const beleg = (id, belegart, belegstatus, extra = {}) =>
  ({ id, belegart, belegstatus, belegnummer: `${belegart.slice(0, 2).toUpperCase()}${id}`, archiviert: 0, belegdatum: new Date(2026, 9, id), ...extra });

// ── Belegkette ──

test('baueKette: sortiert pro Art, ohne storniert/archiviert', () => {
  const k = a.baueKette(beleg(1, 'quotation', 'accepted'), [
    beleg(5, 'invoice', 'open'),
    beleg(3, 'orderconfirmation', 'open'),
    beleg(4, 'deliverynote', 'open'),
    beleg(2, 'deliverynote', 'open'),
    beleg(6, 'invoice', 'voided'),
    beleg(7, 'orderconfirmation', 'open', { archiviert: 1 }),
  ]);
  assert.deepEqual(k.AN.map(b => b.id), [1]);
  assert.deepEqual(k.AB.map(b => b.id), [3]);
  assert.deepEqual(k.LS.map(b => b.id), [2, 4]);
  assert.deepEqual(k.RE.map(b => b.id), [5]);
});

test('baueKette: storniertes Angebot fehlt in der Kette', () => {
  assert.equal(a.baueKette(beleg(1, 'quotation', 'voided'), []).AN.length, 0);
  assert.equal(a.baueKette(undefined, []).AN.length, 0);
});

// ── Status ──

const st = (v, angebot, belege) => a.berechneStatus(v, a.baueKette(angebot, belege));

test('berechneStatus: Weg Anfrage → Abgeschlossen', () => {
  const v = {};
  assert.equal(st(v).code, 'anfrage');
  assert.equal(st({ vorlage_vorgang_id: 3 }).code, 'nachbestellung');
  assert.equal(st(v, beleg(1, 'quotation', 'draft')).code, 'angebot_entwurf');
  assert.equal(st(v, beleg(1, 'quotation', 'open')).code, 'angebot');
  assert.equal(st(v, beleg(1, 'quotation', 'accepted')).code, 'auftrag');
  assert.equal(st(v, beleg(1, 'quotation', 'rejected')).code, 'angebot_abgelehnt');
  const ab = beleg(2, 'orderconfirmation', 'open');
  assert.equal(st(v, null, [ab]).code, 'fertigung');
  assert.equal(st({ fertigung_am: new Date() }, null, [ab]).code, 'lieferung');
  const ls = beleg(3, 'deliverynote', 'open');
  assert.equal(st(v, null, [ab, ls]).code, 'abrechnung');
  assert.equal(st(v, null, [ab, ls, beleg(4, 'invoice', 'draft')]).text, 'Rechnung in Arbeit');
  assert.equal(st(v, null, [ab, ls, beleg(4, 'invoice', 'open')]).code, 'rechnung_offen');
  assert.equal(st(v, null, [ab, ls, beleg(4, 'invoice', 'overdue')]).code, 'rechnung_ueberfaellig');
  const fertig = st(v, null, [ab, ls, beleg(4, 'invoice', 'paid')]);
  assert.deepEqual([fertig.code, fertig.gruppe, fertig.ton], ['abgeschlossen', 'abgeschlossen', 'ok']);
});

test('berechneStatus: Teilrechnung offen → nicht abgeschlossen, Abbruch geht vor', () => {
  const re = [beleg(4, 'invoice', 'paid'), beleg(5, 'invoice', 'open')];
  assert.equal(st({}, null, re).code, 'rechnung_offen');
  assert.equal(st({}, null, [beleg(4, 'invoice', 'paidoff')]).gruppe, 'abgeschlossen');
  const ab = st({ abgebrochen_am: new Date() }, null, re);
  assert.deepEqual([ab.code, ab.gruppe], ['abgebrochen', 'abgebrochen']);
});

// ── Filter und SQL ──

test('pruefeFilter: unbekannte Werte → alle, Suche bereinigt', () => {
  assert.deepEqual(a.pruefeFilter({ q: '  AB0107 \n ', art: 'XX', status: 'kaputt' }), { q: 'AB0107', art: 'alle', status: 'alle' });
  assert.deepEqual(a.pruefeFilter({ art: 'RE', status: 'laufend' }), { q: '', art: 'RE', status: 'laufend' });
  assert.equal(a.pruefeFilter({ q: 'x'.repeat(500) }).q.length, 100);
  assert.deepEqual(a.pruefeFilter(), { q: '', art: 'alle', status: 'alle' });
});

test('sucheSql: ohne Suche kein WHERE, mit Suche sechs Platzhalter und maskierte Wildcards', () => {
  assert.doesNotMatch(a.sucheSql('').sql, /WHERE/);
  assert.equal(a.sucheSql('').params.length, 0);
  const { sql, params } = a.sucheSql('50%_x');
  assert.match(sql, /b\.belegnummer LIKE \?/);
  assert.match(sql, /k\.kdnr LIKE \?/);
  assert.equal(params.length, 6);
  assert.equal(params[0], '%50\\%\\_x%');
});

// ── Suche mit nachgebautem Pool ──

function fakePool(vorgaenge, belege) {
  const calls = [];
  return {
    calls,
    async query(sql, params) {
      calls.push({ sql, params });
      if (/FROM metall_vorgang v/.test(sql)) return [vorgaenge];
      if (/FROM metall_beleg WHERE vorgang_id IN/.test(sql)) return [belege];
      throw new Error(`unerwartet: ${sql}`);
    },
  };
}

const V = (id, extra = {}) => ({ id, vorgangsnummer: `V-26-000${id}`, bezeichnung: `Test ${id}`, erstellt_am: new Date(2026, 9, 1), angebot_beleg_id: null, vorlage_vorgang_id: null, ...extra });

test('sucheVorgaenge: Kette, Status, Felder für die Buttons, Sortierung nach letzter Änderung', async () => {
  const pool = fakePool(
    [V(1, { angebot_beleg_id: 10 }), V(2), V(3, { vorlage_vorgang_id: 1 })],
    [
      beleg(10, 'quotation', 'accepted', { vorgang_id: null, belegdatum: new Date(2026, 9, 2) }),
      beleg(11, 'orderconfirmation', 'draft', { vorgang_id: 1, belegnummer: null, belegdatum: new Date(2026, 9, 12) }),
      beleg(12, 'invoice', 'paid', { vorgang_id: 2, belegdatum: new Date(2026, 9, 5) }),
    ]
  );
  const r = await a.sucheVorgaenge(pool, {});
  assert.deepEqual(r.treffer.map(v => v.id), [1, 2, 3]);
  const [v1, v2, v3] = r.treffer;
  assert.equal(v1.angebot_nr, 'QU10');
  assert.equal(v1.angebot_status, 'accepted');
  assert.equal(v1.ab_nr, 'Entwurf');
  assert.equal(v1.status.code, 'fertigung');
  assert.equal(v2.status.gruppe, 'abgeschlossen');
  assert.equal(v3.an_entfaellt, true);
  assert.equal(v3.ab_nr, null);
  assert.equal(r.gesamt, 3);
  assert.equal(r.mehr, false);
  // Angebote werden zusaetzlich ueber ihre ID geladen
  assert.deepEqual(pool.calls[1].params, [[1, 2, 3], [10]]);
});

test('sucheVorgaenge: Filter Status und Belegart', async () => {
  const daten = () => fakePool(
    [V(1), V(2), V(3, { abgebrochen_am: new Date(2026, 9, 3) })],
    [beleg(12, 'invoice', 'paid', { vorgang_id: 2 }), beleg(13, 'deliverynote', 'open', { vorgang_id: 2 })]
  );
  const ids = async f => (await a.sucheVorgaenge(daten(), f)).treffer.map(v => v.id);
  assert.deepEqual(await ids({ status: 'laufend' }), [1]);
  assert.deepEqual(await ids({ status: 'abgeschlossen' }), [2]);
  assert.deepEqual(await ids({ status: 'abgebrochen' }), [3]);
  assert.deepEqual(await ids({ art: 'LS' }), [2]);
  assert.deepEqual(await ids({ art: 'AB' }), []);
});

test('sucheVorgaenge: ohne Treffer keine zweite Abfrage; ohne Angebote kein OR id IN', async () => {
  const leer = fakePool([], []);
  assert.deepEqual((await a.sucheVorgaenge(leer, { q: 'nix' })).treffer, []);
  assert.equal(leer.calls.length, 1);
  assert.equal(leer.calls[0].params.length, 6);

  const ohneAn = fakePool([V(1)], []);
  await a.sucheVorgaenge(ohneAn, {});
  assert.doesNotMatch(ohneAn.calls[1].sql, /OR id IN/);
  assert.deepEqual(ohneAn.calls[1].params, [[1]]);
});

test('letzteAenderung: jüngstes Datum aus Vorgang und Belegen', () => {
  const d = a.letzteAenderung({ erstellt_am: new Date(2026, 9, 1) }, [{ belegdatum: new Date(2026, 9, 3), lexware_geaendert_am: new Date(2026, 9, 9) }]);
  assert.equal(d.getDate(), 9);
  assert.equal(a.letzteAenderung({}, []), null);
});
