const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const d = require('../src/services/metallDatei');

let basis;
beforeEach(() => {
  basis = fs.mkdtempSync(path.join(os.tmpdir(), 'metall-dateien-'));
  process.env.METALL_UPLOAD_DIR = basis;
  fs.mkdirSync(path.join(basis, '.tmp'));
});

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46]);
const PDF = Buffer.from('%PDF-1.7\n%test\n');

// multer-Ergebnis nachbauen: Datei in .tmp
function tmpDatei(name, inhalt) {
  const p = path.join(basis, '.tmp', Math.random().toString(16).slice(2));
  fs.writeFileSync(p, inhalt);
  return { path: p, originalname: name, size: inhalt.length };
}

function fakePool({ vorgang = { id: 5, vorgangsnummer: 'V-26-0012' }, datei, kundeDatei } = {}) {
  const calls = [];
  let nextId = 100;
  return {
    calls,
    async execute(sql, params) {
      calls.push({ sql, params });
      if (/FROM metall_vorgang WHERE id/.test(sql)) return [[vorgang]];
      if (/^INSERT INTO metall_datei/.test(sql.trim())) return [{ insertId: nextId++ }];
      if (/JOIN metall_kunde k/.test(sql)) return [[kundeDatei]];
      if (/SELECT \* FROM metall_datei WHERE id/.test(sql)) return [[datei]];
      if (/^UPDATE metall_datei/.test(sql.trim())) return [{ affectedRows: 1 }];
      return [[]];
    },
  };
}

// ── Reine Funktionen ──

test('typAus: erlaubte Endungen, MIME aus der Endung', () => {
  assert.equal(d.typAus('Foto.JPG').art, 'foto');
  assert.equal(d.typAus('x.jpeg').mime, 'image/jpeg');
  assert.equal(d.typAus('plan.pdf').art, 'pdf');
  assert.equal(d.typAus('teil.STEP').art, 'cad');
  assert.equal(d.typAus('teil.stp').mime, 'model/step');
  assert.equal(d.typAus('zeichnung.dxf').art, 'cad');
  assert.equal(d.typAus('bild.svg'), null);
  assert.equal(d.typAus('skript.html'), null);
  assert.equal(d.typAus('ohne'), null);
});

test('sichererName: Zeitstempel, Umlaute bleiben, Pfadzeichen weg', () => {
  const jetzt = new Date(2026, 9, 17, 14, 30, 12);
  assert.equal(d.sichererName('Geländer Süd.JPG', jetzt), '2026-10-17_143012_Geländer Süd.jpg');
  assert.equal(d.sichererName('../../etc/passwd.pdf', jetzt), '2026-10-17_143012_passwd.pdf');
  assert.equal(d.sichererName('C:\\Users\\x\\Plan:1*?.pdf', jetzt), '2026-10-17_143012_Plan_1__.pdf');
  assert.equal(d.sichererName('.pdf', jetzt), '2026-10-17_143012_Datei.pdf');
});

test('disposition: ASCII-Ersatz und UTF-8-Name', () => {
  assert.equal(d.disposition('Geländer "A".pdf', true), `inline; filename="Gel_nder _A_.pdf"; filename*=UTF-8''Gel%C3%A4nder%20%22A%22.pdf`);
  assert.match(d.disposition('a.step', false), /^attachment;/);
});

test('absolut: nie ausserhalb des Ablageordners', () => {
  assert.equal(d.absolut('V-26-0012/a.jpg'), path.join(basis, 'V-26-0012', 'a.jpg'));
  assert.throws(() => d.absolut('../x'), err => err.status === 404);
  assert.throws(() => d.absolut(''), err => err.status === 404);
});

test('basisOrdner: ohne METALL_UPLOAD_DIR → 503', () => {
  delete process.env.METALL_UPLOAD_DIR;
  assert.throws(() => d.basisOrdner(), err => err.status === 503);
  process.env.METALL_UPLOAD_DIR = 'relativ/pfad';
  assert.throws(() => d.basisOrdner(), err => err.status === 503);
});

// ── Speichern ──

test('speichere: legt Unterordner mit Vorgangsnummer an, Standard nur intern', async () => {
  const pool = fakePool();
  const jetzt = new Date(2026, 9, 17, 14, 30, 12);
  const r = await d.speichere(pool, 5, [tmpDatei('Geländer.jpg', JPEG), tmpDatei('Plan.pdf', PDF)], { employeeId: 7, jetzt });
  assert.deepEqual(r.gespeichert.map(x => x.dateiname), ['Geländer.jpg', 'Plan.pdf']);
  assert.deepEqual(r.abgelehnt, []);
  assert.ok(fs.existsSync(path.join(basis, 'V-26-0012', '2026-10-17_143012_Geländer.jpg')));
  assert.ok(fs.existsSync(path.join(basis, 'V-26-0012', '2026-10-17_143012_Plan.pdf')));
  const ins = pool.calls.filter(c => /INSERT/.test(c.sql));
  assert.deepEqual(ins[1].params, [5, 'pdf', 'Plan.pdf', 'V-26-0012/2026-10-17_143012_Plan.pdf', null, 'application/pdf', PDF.length, 0, 'mitarbeiter', 7]);
  assert.equal(ins[0].params[1], 'foto');
  assert.deepEqual(fs.readdirSync(path.join(basis, '.tmp')), [], 'tmp aufgeraeumt');
});

test('speichere: gleicher Name in derselben Sekunde → -2', async () => {
  const jetzt = new Date(2026, 9, 17, 14, 30, 12);
  await d.speichere(fakePool(), 5, [tmpDatei('a.pdf', PDF), tmpDatei('a.pdf', PDF)], { jetzt });
  assert.deepEqual(fs.readdirSync(path.join(basis, 'V-26-0012')).sort(), ['2026-10-17_143012_a-2.pdf', '2026-10-17_143012_a.pdf']);
});

test('speichere: falscher Typ, falscher Inhalt, leer → abgelehnt, Rest gespeichert', async () => {
  const pool = fakePool();
  const r = await d.speichere(pool, 5, [
    tmpDatei('virus.exe', Buffer.from('MZ')),
    tmpDatei('fake.jpg', PDF),
    tmpDatei('leer.pdf', Buffer.alloc(0)),
    tmpDatei('ok.dxf', Buffer.from('0\nSECTION\n')),
  ]);
  assert.deepEqual(r.abgelehnt.map(x => x.grund), ['Dateityp nicht erlaubt', 'Inhalt passt nicht zur Endung', 'Datei ist leer']);
  assert.deepEqual(r.gespeichert.map(x => x.dateiname), ['ok.dxf']);
  assert.deepEqual(fs.readdirSync(path.join(basis, '.tmp')), []);
});

test('speichere: Kunden-Upload ist fuer den Kunden sichtbar, ohne Mitarbeiter', async () => {
  const pool = fakePool();
  await d.speichere(pool, 5, [tmpDatei('z.pdf', PDF)], { quelle: 'kunde', employeeId: 7 });
  const p = pool.calls.find(c => /INSERT/.test(c.sql)).params;
  assert.deepEqual(p.slice(7), [1, 'kunde', null]);
});

test('speichere: unbekannter Vorgang → 404, tmp trotzdem weg', async () => {
  const f = tmpDatei('a.pdf', PDF);
  await assert.rejects(d.speichere(fakePool({ vorgang: null }), 5, [f]), err => err.status === 404);
  assert.equal(fs.existsSync(f.path), false);
  await assert.rejects(d.speichere(fakePool(), 5, []), err => err.status === 400);
});

// ── Freigabe, Loeschen, Ausliefern ──

const DATEI = { id: 9, vorgang_id: 5, dateiname: 'Plan.pdf', pfad: 'V-26-0012/x_Plan.pdf', vorschau_pfad: null, mime_typ: 'application/pdf' };

test('setzeSichtbar: nur true/false', async () => {
  const pool = fakePool({ datei: DATEI });
  assert.deepEqual(await d.setzeSichtbar(pool, 9, true, { employeeId: 7 }), { id: 9, fuer_kunde_sichtbar: true });
  assert.deepEqual(pool.calls.at(-1).params, [1, 7, 9]);
  await assert.rejects(d.setzeSichtbar(pool, 9, 'ja'), err => err.status === 400);
  await assert.rejects(d.setzeSichtbar(fakePool({ datei: null }), 9, true), err => err.status === 404);
});

test('loesche: verschiebt nach _geloescht und nimmt die Freigabe zurueck', async () => {
  fs.mkdirSync(path.join(basis, 'V-26-0012'));
  fs.writeFileSync(path.join(basis, DATEI.pfad), PDF);
  const pool = fakePool({ datei: DATEI });
  await d.loesche(pool, 9, { employeeId: 7 });
  assert.ok(fs.existsSync(path.join(basis, 'V-26-0012', '_geloescht', 'x_Plan.pdf')));
  assert.match(pool.calls.find(c => /geloescht_am = NOW/.test(c.sql)).sql, /fuer_kunde_sichtbar = 0/);
  assert.deepEqual(pool.calls.at(-1).params, ['V-26-0012/_geloescht/x_Plan.pdf', 9]);
});

test('oeffne: PDF inline, CAD als Download, Vorschau nur wenn vorhanden', async () => {
  const a = await d.oeffne(fakePool({ datei: DATEI }), 9);
  assert.equal(a.inline, true);
  assert.equal(a.abs, path.join(basis, DATEI.pfad));
  const cad = await d.oeffne(fakePool({ datei: { ...DATEI, dateiname: 't.step', mime_typ: 'model/step' } }), 9);
  assert.equal(cad.inline, false);
  await assert.rejects(d.oeffne(fakePool({ datei: DATEI }), 9, { vorschau: true }), err => err.status === 404);
});

test('oeffneFuerKunde: nur ueber Kunde + Freigabe, sonst 404', async () => {
  const pool = fakePool({ kundeDatei: DATEI });
  const a = await d.oeffneFuerKunde(pool, 'lex-1', 9);
  assert.equal(a.mime, 'application/pdf');
  const q = pool.calls[0];
  assert.match(q.sql, /fuer_kunde_sichtbar = 1 AND d\.geloescht_am IS NULL/);
  assert.match(q.sql, /k\.aktiv = 1/);
  assert.deepEqual(q.params, [9, 'lex-1']);
  await assert.rejects(d.oeffneFuerKunde(fakePool({ kundeDatei: null }), 'lex-2', 9), err => err.status === 404);
  await assert.rejects(d.oeffneFuerKunde(pool, '', 9), err => err.status === 404);
  await assert.rejects(d.oeffneFuerKunde(pool, 'lex-1', 'abc'), err => err.status === 404);
});
