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

// ── Vorgang anlegen (#384) ──

test('pruefeNeuenVorgang: bereinigt und prüft', () => {
  assert.deepEqual(m.pruefeNeuenVorgang({ kundeId: '3', bezeichnung: '  Geländer\n Terrasse ', kundenBestellnr: ' 4711 ' }), {
    kundeId: 3, bezeichnung: 'Geländer Terrasse', kundenBestellnr: '4711', angebotBelegId: null, vorlageVorgangId: null, herkunft: 'buero',
  });
  assert.throws(() => m.pruefeNeuenVorgang({ bezeichnung: 'x' }), e => e.status === 400 && /Metallkunden/.test(e.message));
  assert.throws(() => m.pruefeNeuenVorgang({ kundeId: 3, bezeichnung: '  ' }), /Bezeichnung fehlt/);
  assert.throws(() => m.pruefeNeuenVorgang({ kundeId: 3, bezeichnung: 'x'.repeat(256) }), /zu lang/);
  assert.throws(() => m.pruefeNeuenVorgang({ kundeId: 3, bezeichnung: 'x', angebotBelegId: 1, vorlageVorgangId: 2 }), /nicht beides/);
  assert.throws(() => m.pruefeNeuenVorgang({ kundeId: 3, bezeichnung: 'x', kundenBestellnr: 'y'.repeat(101) }), e => e.status === 400);
  assert.throws(() => m.pruefeNeuenVorgang({ kundeId: 3, bezeichnung: 'x', herkunft: 'irgendwo' }), /Herkunft/);
});

// Nachgebauter Pool mit einer Verbindung: Antworten je nach SQL, merkt Transaktionsschritte
function fakePool({ kunde = { id: 3, lexware_kontakt_id: 'k1', aktiv: 1 }, angebot, vorlage, nr = 12, fehlerBeimInsert } = {}) {
  const schritte = [];
  const calls = [];
  const conn = {
    async beginTransaction() { schritte.push('begin'); },
    async commit() { schritte.push('commit'); },
    async rollback() { schritte.push('rollback'); },
    release() { schritte.push('release'); },
    async query() { return [[{ nr }]]; },
    async execute(sql, params) {
      calls.push({ sql, params });
      if (/FROM metall_kunde/.test(sql)) return [[kunde]];
      if (/FROM metall_beleg WHERE id/.test(sql)) return [[angebot]];
      if (/SELECT id, kunde_id FROM metall_vorgang/.test(sql)) return [[vorlage]];
      if (/^INSERT INTO metall_vorgang /.test(sql.trim())) {
        const f = fehlerBeimInsert?.();
        if (f) throw f;
        return [{ insertId: 99 }];
      }
      if (/SELECT \* FROM metall_vorgang/.test(sql)) return [[{ id: 99, vorgangsnummer: params && 'V-26-0012' }]];
      return [{}];
    },
  };
  return { pool: { getConnection: async () => conn }, schritte, calls };
}

const JETZT = new Date(2026, 9, 16);

test('legeVorgangAn: Nummer und INSERT in einer Transaktion', async () => {
  const { pool, schritte, calls } = fakePool();
  const v = await m.legeVorgangAn(pool, { kundeId: 3, bezeichnung: 'Tor', kundenBestellnr: '4711' }, { employeeId: 7, jetzt: JETZT });
  assert.equal(v.id, 99);
  assert.deepEqual(schritte, ['begin', 'commit', 'release']);
  const ins = calls.find(c => /^INSERT INTO metall_vorgang /.test(c.sql.trim()));
  assert.deepEqual(ins.params, ['V-26-0012', 3, '4711', 'Tor', 'buero', null, null, 7]);
  // Zaehler auf derselben Verbindung vor dem INSERT
  assert.ok(calls.findIndex(c => /metall_vorgang_zaehler/.test(c.sql)) < calls.indexOf(ins));
});

test('legeVorgangAn: Angebot desselben Kunden wird verknüpft und gilt als zugeordnet', async () => {
  const { pool, calls } = fakePool({ angebot: { id: 40, belegart: 'quotation', lexware_kontakt_id: 'k1' } });
  await m.legeVorgangAn(pool, { kundeId: 3, bezeichnung: 'Tor', angebotBelegId: 40 }, { employeeId: 7, jetzt: JETZT });
  assert.equal(calls.find(c => /^INSERT INTO metall_vorgang /.test(c.sql.trim())).params[5], 40);
  const upd = calls.find(c => /SET zuordnung = 'manuell'/.test(c.sql));
  assert.deepEqual(upd.params, [7, 40]);
  assert.match(upd.sql, /zuordnung = 'offen'/);
});

test('legeVorgangAn: falscher Kunde, inaktiver Kunde, kein Angebot → 400 und Rollback', async () => {
  const faelle = [
    [{ kunde: { id: 3, lexware_kontakt_id: 'k1', aktiv: 0 } }, {}, /nicht aktiv/],
    [{ kunde: null }, {}, /nicht gefunden/],
    [{ angebot: { id: 40, belegart: 'quotation', lexware_kontakt_id: 'k2' } }, { angebotBelegId: 40 }, /anderen Kunden/],
    [{ angebot: { id: 40, belegart: 'invoice', lexware_kontakt_id: 'k1' } }, { angebotBelegId: 40 }, /Angebot nicht gefunden/],
    [{ vorlage: { id: 8, kunde_id: 4 } }, { vorlageVorgangId: 8 }, /anderen Kunden/],
    [{ vorlage: null }, { vorlageVorgangId: 8 }, /Vorlage-Vorgang nicht gefunden/],
  ];
  for (const [opt, extra, re] of faelle) {
    const { pool, schritte, calls } = fakePool(opt);
    await assert.rejects(m.legeVorgangAn(pool, { kundeId: 3, bezeichnung: 'Tor', ...extra }, { jetzt: JETZT }), e => e.status === 400 && re.test(e.message));
    assert.deepEqual(schritte, ['begin', 'rollback', 'release']);
    assert.equal(calls.some(c => /metall_vorgang_zaehler/.test(c.sql)), false);
  }
});

test('legeVorgangAn: Deadlock wird bis zu dreimal versucht', async () => {
  let n = 0;
  const deadlock = () => Object.assign(new Error('Deadlock'), { errno: 1213 });
  const { pool, schritte } = fakePool({ fehlerBeimInsert: () => (++n < 3 ? deadlock() : null) });
  const v = await m.legeVorgangAn(pool, { kundeId: 3, bezeichnung: 'Tor' }, { jetzt: JETZT });
  assert.equal(n, 3);
  assert.equal(schritte.filter(s => s === 'rollback').length, 2);
  assert.equal(v.id, 99);
});

test('legeVorgangAn: anderer DB-Fehler → kein neuer Versuch', async () => {
  let n = 0;
  const { pool } = fakePool({ fehlerBeimInsert: () => { n++; return Object.assign(new Error('Duplicate'), { errno: 1062 }); } });
  await assert.rejects(m.legeVorgangAn(pool, { kundeId: 3, bezeichnung: 'Tor' }, { jetzt: JETZT }), /Duplicate/);
  assert.equal(n, 1);
});
