'use strict';
const test   = require('node:test');
const assert = require('node:assert/strict');
const { validateBanner, isActive } = require('../src/services/siteBanner');

const ok = { enabled: true, text: 'Betriebsurlaub', style: 'rot' };

test('gültige Minimalkonfiguration', () => {
  const r = validateBanner(ok);
  assert.equal(r.ok, true);
  assert.equal(r.value.version, 1);
  assert.equal(r.value.startAt, null);
});

test('Text ist Pflicht wenn aktiv, nicht wenn aus', () => {
  assert.equal(validateBanner({ enabled: true, text: '  ' }).ok, false);
  assert.equal(validateBanner({ enabled: false, text: '' }).ok, true);
});

test('Längenlimits', () => {
  assert.equal(validateBanner({ ...ok, text: 'x'.repeat(161) }).ok, false);
  assert.equal(validateBanner({ ...ok, text: 'x'.repeat(160) }).ok, true);
  assert.equal(validateBanner({ ...ok, badge: 'x'.repeat(21) }).ok, false);
  assert.equal(validateBanner({ ...ok, linkUrl: '/a', linkLabel: 'x'.repeat(41) }).ok, false);
});

test('HTML wird abgewiesen', () => {
  assert.equal(validateBanner({ ...ok, text: '<b>Hi</b>' }).ok, false);
  assert.equal(validateBanner({ ...ok, badge: '<i>' }).ok, false);
});

test('URL-Regeln', () => {
  for (const u of ['/#messe', '/zelt/', 'https://example.com/x']) {
    assert.equal(validateBanner({ ...ok, linkUrl: u }).ok, true, u);
  }
  for (const u of ['javascript:alert(1)', 'JaVaScript:1', 'http://example.com', '//evil.com',
    'data:text/html,x', 'mailto:a@b.de', '/a b', '/<x>', 'zelt/']) {
    assert.equal(validateBanner({ ...ok, linkUrl: u }).ok, false, u);
  }
});

test('Stil nur rot/dunkel/hell', () => {
  assert.equal(validateBanner({ ...ok, style: 'dunkel' }).ok, true);
  assert.equal(validateBanner({ ...ok, style: 'pink' }).ok, false);
});

test('Datumsvalidierung', () => {
  assert.equal(validateBanner({ ...ok, endAt: 'kein datum' }).ok, false);
  assert.equal(validateBanner({ ...ok, startAt: '2026-12-01T00:00:00+01:00', endAt: '2026-11-01T00:00:00+01:00' }).ok, false);
  const r = validateBanner({ ...ok, endAt: '2026-11-29T18:00:00+01:00' });
  assert.equal(r.value.endAt, '2026-11-29T17:00:00.000Z');
});

test('isActive: Zeitraum und enabled', () => {
  const cfg = { enabled: true, text: 'x', startAt: '2026-11-20T00:00:00Z', endAt: '2026-11-29T17:00:00Z' };
  assert.equal(isActive(cfg, new Date('2026-11-19T12:00:00Z')), false);
  assert.equal(isActive(cfg, new Date('2026-11-25T12:00:00Z')), true);
  assert.equal(isActive(cfg, new Date('2026-11-29T17:00:00Z')), false);
  assert.equal(isActive({ ...cfg, enabled: false }, new Date('2026-11-25T12:00:00Z')), false);
  assert.equal(isActive({ enabled: true, text: 'x', startAt: null, endAt: null }, new Date()), true);
  assert.equal(isActive(null, new Date()), false);
});
