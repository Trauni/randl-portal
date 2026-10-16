const { test } = require('node:test');
const assert = require('node:assert/strict');
const a = require('../src/services/metallAuftraege');
const d = require('../src/services/metallDetail');
const { bestimmeZuordnung } = require('../src/services/metallSync');

const beleg = (id, belegart, belegstatus, extra = {}) =>
  ({ id, belegart, belegstatus, belegnummer: `${belegart.slice(0, 2).toUpperCase()}${id}`, archiviert: 0, belegdatum: new Date(2026, 9, id), ...extra });

// ── Status in drei Stufen ──

test('berechneStatus: AB → Auftrag bestätigt, begonnen → In Fertigung, fertig → Bereit zur Lieferung', () => {
  const k = a.baueKette(null, [beleg(2, 'orderconfirmation', 'open')]);
  assert.equal(a.berechneStatus({}, k).code, 'geplant');
  assert.equal(a.berechneStatus({ fertigung_begonnen_am: new Date() }, k).code, 'fertigung');
  assert.equal(a.berechneStatus({ fertigung_begonnen_am: new Date(), fertigung_am: new Date() }, k).code, 'lieferung');
  assert.equal(a.fertigungsStufe({}), 'geplant');
  assert.equal(a.fertigungsStufe({ fertigung_begonnen_am: 1 }), 'in_arbeit');
  assert.equal(a.fertigungsStufe({ fertigung_am: 1 }), 'fertig');
});

// ── Statusleiste ──

const leiste = (v, an, belege) => a.statusleiste(v, a.baueKette(an, belege)).map(s => `${s.schritt}:${s.zustand}`).join(' ');

test('statusleiste: neuer Vorgang → Angebot ist aktuell', () => {
  assert.equal(leiste({}), 'Anfrage:done Angebot:current Auftrag:todo Fertigung:todo Lieferung:todo Rechnung:todo');
});

test('statusleiste: Nachbestellung ohne Angebot → Angebot entfällt', () => {
  const s = a.statusleiste({ vorlage_vorgang_id: 1 }, a.baueKette(null, []));
  assert.equal(s[1].zustand, 'skip');
  assert.equal(s[1].info, 'entfällt');
  assert.equal(s[2].zustand, 'current');
  assert.equal(s[0].info, 'Nachbestellung');
});

test('statusleiste: AB und Fertigung in Arbeit', () => {
  const s = a.statusleiste({ fertigung_begonnen_am: new Date() }, a.baueKette(beleg(1, 'quotation', 'accepted'), [beleg(2, 'orderconfirmation', 'open')]));
  assert.deepEqual(s.map(x => x.zustand), ['done', 'done', 'done', 'current', 'todo', 'todo']);
  assert.equal(s[3].info, 'in Arbeit');
  assert.equal(s[2].info, 'OR2');
});

test('statusleiste: Rechnung offen ist aktuell, bezahlt → alles erledigt; abgebrochen ohne aktuellen Schritt', () => {
  const belege = [beleg(2, 'orderconfirmation', 'open'), beleg(3, 'deliverynote', 'open'), beleg(4, 'invoice', 'overdue')];
  const offen = a.statusleiste({}, a.baueKette(null, belege));
  assert.equal(offen[5].zustand, 'current');
  assert.match(offen[5].info, /überfällig/);
  assert.equal(offen[3].info, 'fertig'); // LS da → Fertigung gilt als fertig
  assert.deepEqual([offen[1].zustand, offen[1].info], ['skip', 'ohne Angebot']);
  const bezahlt = a.statusleiste({}, a.baueKette(beleg(1, 'quotation', 'accepted'), [...belege.slice(0, 2), beleg(4, 'invoice', 'paid')]));
  assert.ok(bezahlt.every(x => x.zustand === 'done'));
  assert.ok(a.statusleiste({ abgebrochen_am: new Date() }, a.baueKette(null, [])).every(x => x.zustand !== 'current'));
});

// ── Sync: geloester Beleg geht nicht zurueck an denselben Vorgang ──

test('bestimmeZuordnung: gesperrter Vorgang wird weder zugeordnet noch vorgeschlagen', () => {
  const ab = { belegart: 'orderconfirmation', zuordnung: 'offen', gesperrt_vorgang_id: 5 };
  const nachbarn = [{ belegart: 'quotation', id: 1 }];
  // ohne Sperre: auto an 5
  assert.equal(bestimmeZuordnung({ beleg: { ...ab, gesperrt_vorgang_id: null }, nachbarn, kandidaten: [5] }).zuordnung, 'auto');
  const z = bestimmeZuordnung({ beleg: ab, nachbarn, kandidaten: [5] });
  assert.deepEqual([z.zuordnung, z.vorgang_id, z.vorschlag_vorgang_id], ['offen', null, null]);
  // Verknuepfung auf 5 ebenfalls gesperrt, auf 6 nicht
  const re = { belegart: 'invoice', zuordnung: 'offen', gesperrt_vorgang_id: 5 };
  assert.equal(bestimmeZuordnung({ beleg: re, nachbarn: [{ belegart: 'deliverynote', vorgang_id: 5 }] }).zuordnung, 'offen');
  assert.equal(bestimmeZuordnung({ beleg: re, nachbarn: [{ belegart: 'deliverynote', vorgang_id: 6 }] }).vorgang_id, 6);
  // Angebot per Einleitung an 5 gesperrt
  const an = { belegart: 'quotation', zuordnung: 'offen', gesperrt_vorgang_id: 5 };
  const ein = { vorgang_id: 5, exakt: true, kunde_passt: true, angebot_beleg_id: null };
  assert.equal(bestimmeZuordnung({ beleg: an, einleitung: ein }).angebot_fuer_vorgang_id, null);
  // nur Vorschlag 5 → Vorschlag faellt weg
  assert.equal(bestimmeZuordnung({ beleg: re, einleitung: { ...ein, exakt: false } }).vorschlag_vorgang_id, null);
});

// ── Aktionen mit nachgebautem Pool ──

function fakePool({ vorgang, belege = [], ab = 1, andere = 0, affected = 1 } = {}) {
  const calls = [];
  return {
    calls,
    async execute(sql, params) {
      calls.push({ sql, params });
      if (/FROM metall_vorgang v\s+JOIN metall_kunde/.test(sql)) return [[vorgang]];
      if (/FROM metall_beleg WHERE vorgang_id = \? OR id = \?/.test(sql)) return [belege];
      if (/SELECT id, belegart, belegnummer, vorgang_id FROM metall_beleg WHERE id = \?/.test(sql)) return [[belege.find(b => b.id === params[0])]];
      if (/COUNT\(\*\) AS ab/.test(sql)) return [[{ ab }]];
      if (/COUNT\(\*\) AS andere/.test(sql)) return [[{ andere }]];
      if (/COUNT\(\*\) AS vorschlaege/.test(sql)) return [[{ vorschlaege: 2 }]];
      if (/SELECT id, vorgangsnummer/.test(sql)) return [[]];
      if (/^UPDATE metall_beleg/.test(sql.trim())) return [{ affectedRows: affected }];
      return [{ affectedRows: 1 }];
    },
  };
}

const V = { id: 5, vorgangsnummer: 'V-26-0005', angebot_beleg_id: 10, abgebrochen_am: null, erstellt_am: new Date(2026, 9, 1) };

test('ladeDetail: Kette ohne stornierte, Belegliste mit allen, Vorschläge gezählt', async () => {
  const pool = fakePool({ vorgang: V, belege: [
    beleg(10, 'quotation', 'accepted', { vorgang_id: null }),
    beleg(11, 'orderconfirmation', 'voided', { vorgang_id: 5 }),
    beleg(12, 'orderconfirmation', 'open', { vorgang_id: 5 }),
  ] });
  const r = await d.ladeDetail(pool, '5');
  assert.deepEqual(r.kette.AB.map(b => b.id), [12]);
  assert.equal(r.belege.length, 3);
  assert.equal(r.belege.find(b => b.id === 11).zaehlt, false);
  assert.equal(r.belege.find(b => b.id === 10).ist_angebot, true);
  assert.equal(r.ab_nr, 'OR12');
  assert.equal(r.status.code, 'geplant');
  assert.equal(r.fertigung, 'geplant');
  assert.equal(r.vorschlaege, 2);
  assert.equal(r.statusleiste.length, 6);
});

test('ladeDetail: unbekannte oder ungültige ID → 404', async () => {
  await assert.rejects(d.ladeDetail(fakePool({}), 5), e => e.status === 404);
  await assert.rejects(d.ladeDetail(fakePool({ vorgang: V }), 'abc'), e => e.status === 404);
});

test('setzeFertigung: Stufen setzen die richtigen Spalten', async () => {
  for (const [stufe, muster] of [
    ['geplant', /fertigung_begonnen_am = NULL, fertigung_am = NULL/],
    ['in_arbeit', /fertigung_begonnen_am = COALESCE\(fertigung_begonnen_am, NOW\(\)\), fertigung_am = NULL/],
    ['fertig', /fertigung_am = COALESCE\(fertigung_am, NOW\(\)\)/],
  ]) {
    const pool = fakePool({ vorgang: V });
    await d.setzeFertigung(pool, 5, stufe, { employeeId: 7 });
    const upd = pool.calls.find(c => /^UPDATE metall_vorgang/.test(c.sql.trim()));
    assert.match(upd.sql, muster);
    assert.deepEqual(upd.params, [7, 5]);
  }
});

test('setzeFertigung: Sperren', async () => {
  await assert.rejects(d.setzeFertigung(fakePool({ vorgang: V }), 5, 'kaputt'), e => e.status === 400);
  await assert.rejects(d.setzeFertigung(fakePool({ vorgang: { ...V, abgebrochen_am: new Date() } }), 5, 'fertig'), e => e.status === 409);
  await assert.rejects(d.setzeFertigung(fakePool({ vorgang: V, ab: 0 }), 5, 'in_arbeit'), e => /Auftragsbestätigung/.test(e.message));
  // Zuruecksetzen auf geplant geht auch ohne AB
  await d.setzeFertigung(fakePool({ vorgang: V, ab: 0 }), 5, 'geplant');
});

test('loeseBeleg: AB zurück in den Eingang, mit Sperre auf den Vorgang', async () => {
  const pool = fakePool({ vorgang: V, belege: [beleg(12, 'orderconfirmation', 'open', { vorgang_id: 5 })] });
  const r = await d.loeseBeleg(pool, 5, '12', { employeeId: 7 });
  assert.deepEqual(r, { geloest: 'OR12', angebot: false, zurueck_in_eingang: true });
  const upd = pool.calls.find(c => /^UPDATE metall_beleg/.test(c.sql.trim()));
  assert.match(upd.sql, /zuordnung = 'offen', vorgang_id = NULL[\s\S]*gesperrt_vorgang_id = \?[\s\S]*AND vorgang_id = \?/);
  assert.deepEqual(upd.params, [5, 7, 12, 5]);
});

test('loeseBeleg: fremder Beleg → 409, gleichzeitig geändert → 409', async () => {
  const fremd = fakePool({ vorgang: V, belege: [beleg(12, 'invoice', 'open', { vorgang_id: 6 })] });
  await assert.rejects(d.loeseBeleg(fremd, 5, 12), e => e.status === 409);
  const weg = fakePool({ vorgang: V, belege: [beleg(12, 'invoice', 'open', { vorgang_id: 5 })], affected: 0 });
  await assert.rejects(d.loeseBeleg(weg, 5, 12), e => e.status === 409);
  await assert.rejects(d.loeseBeleg(fakePool({ vorgang: V }), 5, 99), e => e.status === 404);
});

test('loeseBeleg: Angebot nur in den Eingang, wenn kein anderer Vorgang es nutzt', async () => {
  const an = [beleg(10, 'quotation', 'accepted', { vorgang_id: null })];
  const allein = fakePool({ vorgang: V, belege: an });
  assert.equal((await d.loeseBeleg(allein, 5, 10)).zurueck_in_eingang, true);
  assert.ok(allein.calls.some(c => /SET angebot_beleg_id = NULL/.test(c.sql)));
  assert.ok(allein.calls.some(c => /^UPDATE metall_beleg/.test(c.sql.trim())));

  const geteilt = fakePool({ vorgang: V, belege: an, andere: 1 });
  assert.equal((await d.loeseBeleg(geteilt, 5, 10)).zurueck_in_eingang, false);
  assert.ok(!geteilt.calls.some(c => /^UPDATE metall_beleg/.test(c.sql.trim())));
});

test('brecheAb und setzeFort', async () => {
  await assert.rejects(d.brecheAb(fakePool({ vorgang: V }), 5, '  '), e => e.status === 400);
  await assert.rejects(d.brecheAb(fakePool({ vorgang: V }), 5, 'x'.repeat(256)), e => e.status === 400);
  await assert.rejects(d.brecheAb(fakePool({ vorgang: { ...V, abgebrochen_am: new Date() } }), 5, 'Kunde storniert'), e => e.status === 409);
  const pool = fakePool({ vorgang: V });
  await d.brecheAb(pool, 5, ' Kunde\n storniert ');
  assert.deepEqual(pool.calls.find(c => /SET abgebrochen_am = NOW/.test(c.sql)).params, ['Kunde storniert', 5]);

  await assert.rejects(d.setzeFort(fakePool({ vorgang: V }), 5), e => e.status === 409);
  const fort = fakePool({ vorgang: { ...V, abgebrochen_am: new Date() } });
  await d.setzeFort(fort, 5);
  assert.ok(fort.calls.some(c => /SET abgebrochen_am = NULL, abbruch_grund = NULL/.test(c.sql)));
});

// ── Jetzt abgleichen (#386) ──

test('gleicheAb: gleicht den Kunden des Vorgangs ab und liefert das neue Detail', async () => {
  const aufrufe = [];
  const r = await d.gleicheAb(fakePool({ vorgang: { ...V, kunde_id: 3 } }), 5, async k => { aufrufe.push(k); return { geholt: 2, neu: 1 }; });
  assert.deepEqual(aufrufe, [3]);
  assert.deepEqual(r.abgleich, { geholt: 2, neu: 1 });
  assert.equal(r.detail.vorgangsnummer, 'V-26-0005');
  await assert.rejects(d.gleicheAb(fakePool({ vorgang: V }), 5, async () => ({ uebersprungen: true })), e => e.status === 409);
  await assert.rejects(d.gleicheAb(fakePool({}), 5, async () => ({})), e => e.status === 404);
});

test('syncEinKunde: teilt die Sperre mit syncAlle, inaktiver Kunde → 409', async () => {
  const { syncEinKunde, syncAlle } = require('../src/services/metallSync');
  let freigeben;
  const warte = new Promise(r => { freigeben = r; });
  const kunde = { id: 3, aktiv: 1, lexware_kontakt_id: 'k1' };
  const deps = {
    pool: {
      async execute(sql) {
        if (/FROM metall_kunde WHERE id = \?/.test(sql)) return [[kunde]];
        return [[]];
      },
      async query() { return [[]]; },
    },
    lexware: { async listVouchers() { await warte; return []; } },
  };
  const erster = syncEinKunde(deps, 3);
  assert.deepEqual(await syncEinKunde(deps, 3), { uebersprungen: true });
  assert.deepEqual(await syncAlle(deps), { uebersprungen: true });
  freigeben();
  const s = await erster;
  assert.equal(s.gelistet, 0);
  // danach wieder frei; ohne aktiven Kunden 409
  const ohne = { ...deps, pool: { ...deps.pool, async execute() { return [[]]; } } };
  await assert.rejects(syncEinKunde(ohne, 3), e => e.status === 409);
});
