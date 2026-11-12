const { test } = require('node:test');
const assert = require('node:assert/strict');
const m = require('../src/services/mitteilungen');
const b = require('../src/services/bestellMitteilungen');

const GF = JSON.stringify(['Geschäftsführung']);
const MA = JSON.stringify([]);

function fakePool({ mitarbeiter = [], einst = [], subs = [], gesehen = [] } = {}) {
  const calls = [];
  const gesehenSet = new Set(gesehen);
  const exec = async (sql, params = []) => {
    const q = sql.replace(/\s+/g, ' ').trim();
    calls.push({ q, params });
    if (/FROM employees WHERE status/.test(q)) return [mitarbeiter];
    if (/FROM employees WHERE id IN/.test(q)) return [mitarbeiter.filter((e) => params.includes(e.id))];
    if (/FROM mitteilung_einstellung/.test(q)) return [einst.filter((e) => e.employee_id === params[0])];
    if (/FROM push_subscription/.test(q)) return [subs.filter((s) => s.employee_id === params[0])];
    if (/COUNT\(\*\) AS anzahl FROM mitteilung_quelle_gesehen/.test(q)) return [[{ anzahl: gesehenSet.size }]];
    if (/INSERT IGNORE INTO mitteilung_quelle_gesehen/.test(q)) {
      const neu = !gesehenSet.has(params[1]); gesehenSet.add(params[1]); return [{ affectedRows: neu ? 1 : 0 }];
    }
    return [{ affectedRows: 1 }];
  };
  return { calls, execute: exec, query: exec };
}
const inserts = (p) => p.calls.filter((c) => /^INSERT INTO mitteilung \(/.test(c.q));

test('notify: Bereich bestimmt Empfänger, Standard-Inbox an', async () => {
  const pool = fakePool({ mitarbeiter: [{ id: 1, authentik_groups: GF }, { id: 2, authentik_groups: MA }] });
  const n = await m.notify(pool, { art: 'urlaub_antrag', area: 'hr.urlaubskalender', titel: 'T', sender: async () => {} });
  assert.equal(n, 1);
  assert.equal(inserts(pool)[0].params[0], 1);
});

test('notify: Gruppen als bereits geparstes Array (JSON-Spalte) werden erkannt', async () => {
  const pool = fakePool({ mitarbeiter: [{ id: 1, authentik_groups: ['Geschäftsführung'] }] });
  assert.equal(await m.notify(pool, { art: 'bestellung_neu', area: 'gashandel', titel: 'T' }), 1);
});

test('notify: nichtAn schließt die auslösende Person aus', async () => {
  const pool = fakePool({ mitarbeiter: [{ id: 1, authentik_groups: GF }] });
  assert.equal(await m.notify(pool, { art: 'urlaub_antrag', area: 'hr.urlaubskalender', titel: 'T', nichtAn: [1] }), 0);
});

test('notify: Einstellung inbox=0 unterdrückt die Zeile', async () => {
  const pool = fakePool({ mitarbeiter: [{ id: 1, authentik_groups: GF }], einst: [{ employee_id: 1, art: 'urlaub_antrag', inbox: 0, push: 0 }] });
  assert.equal(await m.notify(pool, { art: 'urlaub_antrag', area: 'hr.urlaubskalender', titel: 'T' }), 0);
});

test('Bestellungen: Push standardmäßig für alle mit Bereich gashandel', async () => {
  const subs = [{ id: 1, employee_id: 1, endpoint: 'e1', p256dh: 'p', auth: 'a' }, { id: 2, employee_id: 2, endpoint: 'e2', p256dh: 'p', auth: 'a' }];
  const pool = fakePool({ mitarbeiter: [{ id: 1, authentik_groups: GF }, { id: 2, authentik_groups: JSON.stringify(['Gashandel']) }], subs });
  const gesendet = [];
  await m.notify(pool, { art: 'bestellung_neu', area: 'gashandel', titel: 'B', sender: async (s) => { gesendet.push(s.endpoint); } });
  assert.deepEqual(gesendet.sort(), ['e1', 'e2']);
  assert.equal(inserts(pool).length, 2);
});

test('Push: abgelaufene Anmeldung (410) wird gelöscht', async () => {
  const pool = fakePool({ subs: [{ id: 9, employee_id: 1, endpoint: 'e', p256dh: 'p', auth: 'a' }] });
  const ok = await m.sendePush(pool, 1, {}, async () => { const e = new Error('gone'); e.statusCode = 410; throw e; });
  assert.equal(ok, 0);
  assert.ok(pool.calls.some((c) => /^DELETE FROM push_subscription/.test(c.q)));
});

test('Bestell-Poller: Erstlauf meldet nichts, danach nur neue', async () => {
  const pool = fakePool({ mitarbeiter: [{ id: 1, authentik_groups: GF }] });
  const notified = [];
  const mit = { notify: async (_p, a) => { notified.push(a); }, pushNur: async () => {} };
  const o = (id) => ({ id, customer_name: 'K' + id, items: [{}], total_gross: 10 });
  let r = await b.pruefe({ pool, holeBestellungen: async () => [o(1), o(2)], mitteilungen: mit });
  assert.deepEqual(r, { neu: 0, erstlauf: true });
  r = await b.pruefe({ pool, holeBestellungen: async () => [o(3), o(2), o(1)], mitteilungen: mit });
  assert.equal(r.neu, 1);
  assert.match(notified[0].titel, /K3/);
});

test('Bestell-Poller: viele neue → Einzel-Inbox ohne Push, ein Sammel-Push', async () => {
  const pool = fakePool({ gesehen: ['0'] });
  const notified = []; let sammel = null;
  const mit = { notify: async (_p, a) => { notified.push(a); }, pushNur: async (_p, a) => { sammel = a; } };
  await b.pruefe({ pool, holeBestellungen: async () => [1, 2, 3, 4, 5].map((id) => ({ id })), mitteilungen: mit });
  assert.equal(notified.length, 5);
  assert.ok(notified.every((n) => n.push === false));
  assert.match(sammel.titel, /5 neue Bestellungen/);
});

test('Herkunft: Mobile-Vermerk im Lieferhinweis', () => {
  assert.equal(b.herkunft({ delivery_note: '[Mobile] erfasst von X' }), 'Mobile-Erfassung');
  assert.equal(b.herkunft({}), 'Shop/Backoffice');
});
