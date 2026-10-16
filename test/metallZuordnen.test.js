const { test } = require('node:test');
const assert = require('node:assert/strict');
const z = require('../src/services/metallZuordnen');

// ── Grund des Vorschlags ──

test('vorschlagGrund: Vorgangsnummer in der Einleitung', () => {
  assert.equal(z.vorschlagGrund({ belegart: 'invoice', einleitung_zeile: 'Vorgang V-26-0012', vorschlag_nr: 'V-26-0012' }), 'Vorgangsnummer in der Einleitung');
  assert.match(z.vorschlagGrund({ belegart: 'invoice', einleitung_zeile: 'Danke, siehe V-26-0012', vorschlag_nr: 'V-26-0012' }), /nicht in der ersten Zeile/);
});

test('vorschlagGrund: AB aus Angebot', () => {
  const ab = { belegart: 'orderconfirmation', einleitung_zeile: 'Vorgang V-26-0012', vorschlag_nr: 'V-26-0012', aus_angebot_nr: 'AG0083' };
  assert.match(z.vorschlagGrund(ab), /aus AG0083 übernommen/);
  assert.match(z.vorschlagGrund(ab, { mehrfach: true }), /mehrfach in eine AB umgewandelt/);
  assert.equal(z.vorschlagGrund({ ...ab, einleitung_zeile: null, vorschlag_nr: 'V-26-0013', vorschlag_angebot_nr: 'AG0083' }), 'ältester offener Vorgang zu AG0083');
  assert.match(z.vorschlagGrund({ ...ab, vorschlag_nr: null }), /aus AG0083, aber kein offener Vorgang/);
});

test('vorschlagGrund: freie AB → einziger offener Vorgang', () => {
  assert.equal(z.vorschlagGrund({ belegart: 'orderconfirmation', vorschlag_nr: 'V-26-0014' }), 'einziger offener Vorgang des Kunden ohne AB');
});

test('vorschlagGrund: ohne Vorschlag', () => {
  assert.equal(z.vorschlagGrund({ belegart: 'invoice' }), 'weder Verknüpfung noch Vorgangsnummer');
  assert.match(z.vorschlagGrund({ belegart: 'invoice', einleitung_zeile: 'Vorgang V-26-0099' }), /V-26-0099 unbekannt/);
  assert.match(z.vorschlagGrund({ belegart: 'quotation' }), /neuer Vorgang\?/);
  assert.match(z.vorschlagGrund({ belegart: 'quotation', einleitung_zeile: 'Vorgang V-26-0012' }), /schon ein Angebot/);
});

test('bereiteAuf: erkennt mehrfach umgewandelte Angebote nur bei ABs', () => {
  const zeilen = z.bereiteAuf([
    { belegart: 'orderconfirmation', aus_angebot_nr: 'AG0083', vorschlag_nr: 'V-26-0001' },
    { belegart: 'orderconfirmation', aus_angebot_nr: 'AG0083', vorschlag_nr: 'V-26-0001' },
    { belegart: 'invoice', aus_angebot_nr: 'AG0083' },
  ]);
  assert.match(zeilen[0].grund, /mehrfach/);
  assert.equal(zeilen[0].art, 'AB');
  assert.doesNotMatch(zeilen[2].grund, /mehrfach/);
  assert.equal(zeilen[2].art, 'Rechnung');
});

// ── Aktionen mit nachgebautem Pool ──

function fakePool({ beleg, vorgang, affected = 1 } = {}) {
  const calls = [];
  const pool = {
    calls,
    async execute(sql, params) {
      calls.push({ sql, params });
      if (/FROM metall_beleg b LEFT JOIN metall_kunde/.test(sql)) return [[beleg]];
      if (/FROM metall_vorgang v JOIN metall_kunde/.test(sql)) return [[vorgang]];
      if (/^UPDATE metall_beleg/.test(sql.trim())) return [{ affectedRows: affected }];
      return [{ affectedRows: 1 }];
    },
  };
  return pool;
}

const AB = { id: 11, belegart: 'orderconfirmation', belegnummer: 'AB0106', zuordnung: 'offen', lexware_kontakt_id: 'k1', kunde_id: 3, kunde_aktiv: 1 };
const AN = { ...AB, id: 12, belegart: 'quotation', belegnummer: 'AG0085' };
const V = { id: 5, vorgangsnummer: 'V-26-0001', abgebrochen_am: null, angebot_beleg_id: null, lexware_kontakt_id: 'k1' };

test('ordneZu: AB an den Vorgang, manuell, mit Mitarbeiter', async () => {
  const pool = fakePool({ beleg: AB, vorgang: V });
  const r = await z.ordneZu(pool, 11, 5, { employeeId: 7 });
  assert.equal(r.vorgangsnummer, 'V-26-0001');
  const upd = pool.calls.find(c => /^UPDATE metall_beleg/.test(c.sql.trim()));
  assert.deepEqual(upd.params, ['manuell', 5, 7, 11]);
  assert.match(upd.sql, /AND zuordnung = 'offen'/);
});

test('ordneZu: Angebot wird Angebot des Vorgangs, Beleg ohne vorgang_id', async () => {
  const pool = fakePool({ beleg: AN, vorgang: V });
  await z.ordneZu(pool, 12, 5, { employeeId: 7 });
  assert.deepEqual(pool.calls.find(c => /^UPDATE metall_beleg/.test(c.sql.trim())).params, ['manuell', null, 7, 12]);
  assert.deepEqual(pool.calls.find(c => /SET angebot_beleg_id/.test(c.sql)).params, [12, 5]);
});

test('ordneZu: Sperren', async () => {
  const faelle = [
    [{ beleg: undefined, vorgang: V }, 404],
    [{ beleg: { ...AB, zuordnung: 'manuell' }, vorgang: V }, 409],
    [{ beleg: AB, vorgang: undefined }, 404],
    [{ beleg: AB, vorgang: { ...V, abgebrochen_am: new Date() } }, 400],
    [{ beleg: AB, vorgang: { ...V, lexware_kontakt_id: 'k2' } }, 400],
    [{ beleg: AN, vorgang: { ...V, angebot_beleg_id: 40, angebot_nr: 'AG0080' } }, 409],
    [{ beleg: AB, vorgang: V, affected: 0 }, 409], // gleichzeitig von jemand anderem zugeordnet
  ];
  for (const [opt, status] of faelle) {
    await assert.rejects(z.ordneZu(fakePool(opt), 11, 5), e => e.status === status);
  }
});

test('ignoriere und holeZurueck', async () => {
  const pool = fakePool({ beleg: AB });
  await z.ignoriere(pool, 11, { employeeId: 7 });
  assert.deepEqual(pool.calls.find(c => /^UPDATE metall_beleg/.test(c.sql.trim())).params, ['ignoriert', null, 7, 11]);

  const zurueck = fakePool({});
  await z.holeZurueck(zurueck, 11);
  assert.match(zurueck.calls[0].sql, /SET zuordnung = 'offen'[\s\S]*AND zuordnung = 'ignoriert'/);
  await assert.rejects(z.holeZurueck(fakePool({ affected: 0 }), 11), e => e.status === 409);
});

test('neuerVorgangAusBeleg: Beleg ohne aktiven Metallkunden → 400', async () => {
  await assert.rejects(z.neuerVorgangAusBeleg(fakePool({ beleg: { ...AB, kunde_id: null } }), 11, { bezeichnung: 'x' }), e => e.status === 400);
  await assert.rejects(z.neuerVorgangAusBeleg(fakePool({ beleg: { ...AB, kunde_aktiv: 0 } }), 11, { bezeichnung: 'x' }), e => e.status === 400);
});
