const test = require('node:test');
const assert = require('node:assert');

// Datenbank vor dem Laden von urlaub.js ersetzen, damit kein Zugriff nötig ist (#491).
const dbPfad = require.resolve('../src/db');
const zustand = { antrag: null, eintraege: [], vertrag: [], schreibend: [], abfragen: [] };

const abfrage = async (sql, werte) => {
  zustand.abfragen.push({ sql, werte });
  if (/FROM vacation_requests vr/.test(sql)) return [[zustand.antrag]];
  if (/FROM time_entries/.test(sql)) return [zustand.eintraege];
  if (/FROM gleitzeit_arbeitszeit/.test(sql)) return [zustand.vertrag];
  throw new Error('unerwartete Abfrage: ' + sql.slice(0, 60));
};
const verbindung = {
  beginTransaction: async () => zustand.schreibend.push('BEGIN'),
  commit: async () => zustand.schreibend.push('COMMIT'),
  rollback: async () => zustand.schreibend.push('ROLLBACK'),
  release: () => {},
  execute: async (sql, werte) => { zustand.schreibend.push({ sql, werte }); return [{}]; },
  query: async (sql, werte) => { zustand.schreibend.push({ sql, werte }); return [{}]; },
};
require.cache[dbPfad] = {
  id: dbPfad, filename: dbPfad, loaded: true,
  exports: { getPool: () => ({ query: abfrage, getConnection: async () => verbindung }) },
};
const urlaub = require('../src/services/urlaub');

const portalMa = { employee_id: 7, zeiterfassung_quelle: 'portal', rentman_id: null };
const zuruecksetzen = () => { zustand.schreibend = []; zustand.abfragen = []; zustand.vertrag = []; zustand.eintraege = []; };
const antrag = (extra = {}) => ({
  id: 1, employee_id: 7, status: 'approved', days_count: 2, art: 'urlaub', lrId: null,
  von: '2026-11-16', bis: '2026-11-17', zeitVon: null, zeitBis: null,
  rentman_id: null, full_name: 'Test Person', zeiterfassung_quelle: 'portal', pruefer: null, ...extra,
});

test('Portal-Mitarbeiter: Schnitt aus time_entries, Nenner sind Kalendertage', async () => {
  zuruecksetzen();
  // Tag 1: 8 h; Tag 2: zwei Einträge à 4 h (8 h gesamt); Tag 3: 6 h
  zustand.eintraege = [
    { tag: '2026-10-01', pause_sekunden: 0, spanne: 8 * 3600 },
    { tag: '2026-10-02', pause_sekunden: 0, spanne: 4 * 3600 },
    { tag: '2026-10-02', pause_sekunden: 0, spanne: 4 * 3600 },
    { tag: '2026-10-05', pause_sekunden: 0, spanne: 6 * 3600 },
  ];
  const b = await urlaub.bemessung(portalMa, '2026-11-02');
  assert.strictEqual(b.tage, 3);
  assert.strictEqual(b.sekunden, 22 * 3600);
  assert.strictEqual(b.schnitt, Math.round(22 * 3600 / 3));
  assert.strictEqual(b.bis, '2026-11-01');
  assert.strictEqual(b.quelle, 'portal');
  const sql = zustand.abfragen.find((x) => /time_entries/.test(x.sql));
  assert.match(sql.sql, /eintrag_typ = 'arbeitszeit'/);
  assert.deepStrictEqual(sql.werte, [7, b.von, '2026-11-02']);
});

test('Pause wird abgezogen', async () => {
  zuruecksetzen();
  zustand.eintraege = [{ tag: '2026-10-01', pause_sekunden: 1800, spanne: 8.5 * 3600 }];
  const b = await urlaub.bemessung(portalMa, '2026-11-02');
  assert.strictEqual(b.sekunden, 8 * 3600);
});

test('Rentman-Quelle ohne rentman_id wirft', async () => {
  await assert.rejects(
    urlaub.bemessung({ employee_id: 8, zeiterfassung_quelle: 'rentman', rentman_id: null }, '2026-11-02'),
    /keine rentman_id/);
});

test('urlaubBerechnen ohne Rentman: Snapshot und Tage landen im Portal', async () => {
  zuruecksetzen();
  zustand.antrag = antrag();
  zustand.eintraege = [{ tag: '2026-10-01', pause_sekunden: 0, spanne: 8 * 3600 }];
  const r = await urlaub.urlaubBerechnen(1);
  assert.strictEqual(r.schnitt, 8 * 3600);
  assert.strictEqual(r.tage, 2);
  assert.strictEqual(r.bemessung.quelle, 'portal');
  const sqls = zustand.schreibend.filter((x) => typeof x === 'object').map((x) => x.sql);
  assert.strictEqual(sqls.filter((q) => /INSERT INTO vacation_request_days/.test(q)).length, 2);
  const update = zustand.schreibend.find((x) => typeof x === 'object' && /UPDATE vacation_requests/.test(x.sql));
  assert.strictEqual(update.werte[0], 8 * 3600);
  assert.strictEqual(update.werte[6], 'portal'); // bemessung_quelle
  assert.strictEqual(zustand.schreibend.at(-1), 'COMMIT');
});

test('Ohne Arbeitszeit im Fenster: vereinbarte Tagesarbeitszeit, als "vertrag" vermerkt', async () => {
  zuruecksetzen();
  zustand.antrag = antrag();
  zustand.vertrag = [{ gueltig_ab: '2026-01-01', wochenstunden: '30.00', arbeitstage: '1,2,3,4,5' }];
  const r = await urlaub.urlaubBerechnen(1);
  assert.strictEqual(r.schnitt, 6 * 3600);
  assert.strictEqual(r.bemessung.quelle, 'vertrag');
});

test('Ohne Arbeitszeit und ohne Vertragsangabe: Fehler, nichts wird geschrieben', async () => {
  zuruecksetzen();
  zustand.antrag = antrag();
  await assert.rejects(urlaub.urlaubBerechnen(1), /Schnitt nicht berechenbar/);
  assert.deepStrictEqual(zustand.schreibend, []);
});

test('Nicht genehmigter Antrag wird nicht berechnet', async () => {
  zuruecksetzen();
  zustand.antrag = antrag({ status: 'pending' });
  await assert.rejects(urlaub.urlaubBerechnen(1), /nicht approved/);
});

test('urlaubVerbuchen ohne rentman_id: kein Rentman-Aufruf', async () => {
  zuruecksetzen();
  zustand.antrag = antrag();
  zustand.eintraege = [{ tag: '2026-10-01', pause_sekunden: 0, spanne: 8 * 3600 }];
  const echterFetch = global.fetch;
  global.fetch = () => { throw new Error('Rentman darf nicht aufgerufen werden'); };
  try {
    const r = await urlaub.urlaubVerbuchen(1);
    assert.deepStrictEqual(r.rentman, { uebersprungen: true });
    assert.strictEqual(r.schnitt, 8 * 3600);
  } finally {
    global.fetch = echterFetch;
  }
});

test('Gleitzeitabbau ohne rentman_id: übersprungen statt Fehler', async () => {
  zuruecksetzen();
  zustand.antrag = antrag({ art: 'gleitzeitabbau' });
  const r = await urlaub.nachRentman(1);
  assert.deepStrictEqual(r.rentman, { uebersprungen: true });
});
