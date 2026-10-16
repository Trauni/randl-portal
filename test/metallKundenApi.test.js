const { test } = require('node:test');
const assert = require('node:assert/strict');
const api = require('../src/services/metallKundenApi');

const beleg = (id, belegart, belegstatus, extra = {}) =>
  ({ id, belegart, belegstatus, belegnummer: `${belegart.slice(0, 2).toUpperCase()}${id}`, archiviert: 0, belegdatum: new Date(2026, 9, id), betrag_brutto: '119.00', betrag_netto: '100.00', ...extra });

const V = (id, extra = {}) => ({ id, vorgangsnummer: `V-26-000${id}`, bezeichnung: `Teil ${id}`, kunden_bestellnr: null, herkunft: 'buero',
  erstellt_am: new Date(2026, 9, 1), angebot_beleg_id: null, vorlage_vorgang_id: null, fertigung_begonnen_am: null, fertigung_am: null, abgebrochen_am: null, ...extra });

function fakePool({ kunde = { id: 3, name: 'Testfirma', kdnr: '10827' }, vorgaenge = [], belege = [], dateien = [], pdfBeleg } = {}) {
  const calls = [];
  return {
    calls,
    async execute(sql, params) {
      calls.push({ sql, params });
      if (/FROM metall_kunde WHERE lexware_kontakt_id/.test(sql)) return [[kunde].filter(Boolean)];
      if (/FROM metall_datei/.test(sql)) return [dateien];
      if (/FROM metall_beleg b\s+WHERE b.id = \?/.test(sql)) return [[pdfBeleg].filter(Boolean)];
      throw new Error(`unerwartet: ${sql}`);
    },
    async query(sql, params) {
      calls.push({ sql, params });
      if (/FROM metall_vorgang v LEFT JOIN/.test(sql)) {
        const nr = params[1];
        return [nr ? vorgaenge.filter(v => v.vorgangsnummer === nr) : vorgaenge];
      }
      if (/FROM metall_beleg WHERE vorgang_id IN/.test(sql)) return [belege];
      throw new Error(`unerwartet: ${sql}`);
    },
  };
}

test('sichtbar: nur fertige, nicht stornierte, nicht archivierte Belege mit Nummer', () => {
  assert.equal(api.sichtbar(beleg(1, 'invoice', 'open')), true);
  assert.equal(api.sichtbar(beleg(1, 'invoice', 'paid')), true);
  assert.equal(api.sichtbar(beleg(1, 'invoice', 'draft')), false);
  assert.equal(api.sichtbar(beleg(1, 'invoice', 'voided')), false);
  assert.equal(api.sichtbar(beleg(1, 'invoice', 'open', { archiviert: 1 })), false);
  assert.equal(api.sichtbar(beleg(1, 'invoice', 'open', { belegnummer: null })), false);
});

test('liste: Kette ohne Entwurf/Storno, Status aus sichtbaren Belegen, abgebrochen = Storniert', async () => {
  const pool = fakePool({
    vorgaenge: [V(1, { angebot_beleg_id: 10 }), V(2, { abgebrochen_am: new Date(2026, 9, 3) })],
    belege: [
      beleg(10, 'quotation', 'accepted', { vorgang_id: null }),
      beleg(11, 'orderconfirmation', 'draft', { vorgang_id: 1, belegnummer: null }),
      beleg(12, 'orderconfirmation', 'voided', { vorgang_id: 1 }),
    ],
  });
  const r = await api.liste(pool, 'L1');
  assert.deepEqual(r.kunde, { name: 'Testfirma', kdnr: '10827' });
  const v1 = r.vorgaenge.find(v => v.vorgangsnummer === 'V-26-0001');
  assert.deepEqual(v1.kette.AN.map(d => d.nr), ['QU10']);
  assert.equal(v1.kette.AB.length, 0); // Entwurf und Storno unsichtbar
  assert.equal(v1.status.code, 'auftrag'); // Angebot angenommen, AB folgt
  const v2 = r.vorgaenge.find(v => v.vorgangsnummer === 'V-26-0002');
  assert.deepEqual([v2.status.code, v2.status.text, v2.status.gruppe], ['storniert', 'Storniert', 'abgeschlossen']);
  // keine internen Felder
  const json = JSON.stringify(r);
  for (const feld of ['zuordnung', 'lexware_id', 'angebot_beleg_id', 'kunde_id', 'erstellt_von']) assert.ok(!json.includes(feld), feld);
});

test('liste: unbekannter oder inaktiver Kunde → 404, ungültige ID ohne Abfrage', async () => {
  await assert.rejects(api.liste(fakePool({ kunde: null }), 'L1'), e => e.status === 404);
  const pool = fakePool();
  await assert.rejects(api.liste(pool, ''), e => e.status === 404);
  await assert.rejects(api.liste(pool, 'x'.repeat(65)), e => e.status === 404);
  assert.equal(pool.calls.length, 0);
});

test('liste: Kunde ohne Vorgänge → leere Liste ohne Belegabfrage', async () => {
  const pool = fakePool();
  const r = await api.liste(pool, 'L1');
  assert.deepEqual(r.vorgaenge, []);
  assert.ok(!pool.calls.some(c => /FROM metall_beleg/.test(c.sql)));
});

test('detail: Belege sortiert AN→RE, nur sichtbare, Dateien nur freigegebene (per SQL), Beträge als Zahl', async () => {
  const pool = fakePool({
    vorgaenge: [V(1, { angebot_beleg_id: 10, fertigung_am: new Date() })],
    belege: [
      beleg(13, 'invoice', 'open', { vorgang_id: 1 }),
      beleg(12, 'orderconfirmation', 'open', { vorgang_id: 1 }),
      beleg(10, 'quotation', 'accepted', { vorgang_id: null }),
      beleg(14, 'invoice', 'voided', { vorgang_id: 1 }),
    ],
    dateien: [{ id: 5, art: 'foto', dateiname: 'a.jpg' }],
  });
  const d = await api.detail(pool, 'L1', 'V-26-0001');
  assert.deepEqual(d.belege.map(b => b.art + b.id), ['AN10', 'AB12', 'RE13']);
  assert.equal(d.belege[0].betrag_brutto, 119);
  assert.equal(d.dateien.length, 1);
  assert.match(pool.calls.find(c => /FROM metall_datei/.test(c.sql)).sql, /fuer_kunde_sichtbar = 1 AND geloescht_am IS NULL/);
  assert.equal(d.status.code, 'rechnung_offen');
  assert.equal(d.statusleiste.length, 6);
});

test('detail: falsches Format oder fremder Vorgang → 404', async () => {
  await assert.rejects(api.detail(fakePool(), 'L1', '1 OR 1=1'), e => e.status === 404);
  await assert.rejects(api.detail(fakePool({ vorgaenge: [V(1)] }), 'L1', 'V-26-0099'), e => e.status === 404);
});

test('belegPdf: nur eigener, sichtbarer Beleg; Besitz wird per SQL mit kunde_id geprüft', async () => {
  const lexware = { calls: [], async getVoucherFile(typ, id) { this.calls.push([typ, id]); return Buffer.from('%PDF'); } };
  const pool = fakePool({ pdfBeleg: { id: 12, lexware_id: 'lx12', belegart: 'invoice', belegnummer: 'RE-12/3', belegstatus: 'open', archiviert: 0 } });
  const r = await api.belegPdf({ pool, lexware }, 'L1', '12');
  assert.deepEqual(lexware.calls, [['invoice', 'lx12']]);
  assert.equal(r.dateiname, 'RE-123.pdf');
  const q = pool.calls.find(c => /FROM metall_beleg b/.test(c.sql));
  assert.deepEqual(q.params, [12, 3]);
  assert.match(q.sql, /v\.kunde_id = \?/);

  const nichtSichtbar = fakePool({ pdfBeleg: { id: 12, belegart: 'invoice', belegnummer: null, belegstatus: 'draft', archiviert: 0 } });
  await assert.rejects(api.belegPdf({ pool: nichtSichtbar, lexware }, 'L1', 12), e => e.status === 404);
  await assert.rejects(api.belegPdf({ pool: fakePool(), lexware }, 'L1', 12), e => e.status === 404); // fremd
  await assert.rejects(api.belegPdf({ pool: fakePool(), lexware }, 'L1', 'abc'), e => e.status === 404);
  assert.equal(lexware.calls.length, 1);
});
