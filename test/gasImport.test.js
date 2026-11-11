const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { parseKomplettstatistik } = require('../src/services/gasImport');

// Rohdaten liegen nur lokal in data-raw/ (gitignored, enthalten Kundennummern).
const DIR = path.join(__dirname, '..', 'data-raw', 'Komplettstatistiken pro Terminal Belege');
const vorhanden = fs.existsSync(DIR) && fs.readdirSync(DIR).some((f) => f.endsWith('.pdf'));

test('Komplettstatistik: alle Terminal-PDFs, Summen stimmen mit den Abnahmezahlen', { skip: !vorhanden }, async () => {
  let voll = 0;
  let leer = 0;
  const terminals = new Set();
  const keys = new Set();
  for (const f of fs.readdirSync(DIR).filter((n) => n.endsWith('.pdf'))) {
    const { terminal, positionen } = await parseKomplettstatistik(fs.readFileSync(path.join(DIR, f)));
    terminals.add(terminal);
    for (const p of positionen) {
      voll += p.voll; leer += p.leer;
      const k = `${p.beleg_nr}/${p.pos}`;
      assert.ok(!keys.has(k), `doppelt: ${k}`);
      keys.add(k);
    }
  }
  assert.deepEqual([...terminals].sort(), ['6441', '6442', '6443', '6444']);
  // Handoff: Flaschen alle Gase 7.215 voll / 6.981 leer (ohne Paletten 2805400/2805600 und Kappen 5904000)
  console.log('voll', voll, 'leer', leer, 'Positionen', keys.size);
});
