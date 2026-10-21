const { test } = require('node:test');
const assert = require('node:assert/strict');
const u = require('../src/services/containerUpdates');

test('parseImageRef: Docker Hub, offizielle Images und fremde Registries', () => {
  assert.deepEqual(u.parseImageRef('postgres:16-alpine'), { registry: 'docker.io', repo: 'library/postgres', tag: '16-alpine' });
  assert.deepEqual(u.parseImageRef('containrrr/watchtower'), { registry: 'docker.io', repo: 'containrrr/watchtower', tag: 'latest' });
  assert.deepEqual(u.parseImageRef('ghcr.io/goauthentik/server:2025.2.4'), { registry: 'ghcr.io', repo: 'goauthentik/server', tag: '2025.2.4' });
  assert.deepEqual(u.parseImageRef('lscr.io/linuxserver/bookstack'), { registry: 'lscr.io', repo: 'linuxserver/bookstack', tag: 'latest' });
  assert.deepEqual(u.parseImageRef('localhost:5000/app:1.0'), { registry: 'localhost:5000', repo: 'app', tag: '1.0' });
  assert.equal(u.parseImageRef('sha256:abc'), null);
  assert.equal(u.parseImageRef(''), null);
});

test('newerTag: nur gleiche Bauart, nur neuer', () => {
  const authentik = ['2025.2.4', '2025.2.3', '2025.10.1', '2025.10.0', '2026.2.0-rc1', 'gh-main', 'latest'];
  assert.equal(u.newerTag('2025.2.4', authentik), '2025.10.1');
  assert.equal(u.newerTag('2025.10.1', authentik), null);
  assert.equal(u.newerTag('1.25-alpine', ['1.25', '1.27-alpine', '1.26-alpine', '1.27.1-alpine']), '1.27-alpine');
  assert.equal(u.newerTag('v1.2.0', ['1.3.0', 'v1.2.1']), 'v1.2.1');
  assert.equal(u.newerTag('latest', ['1.0.0']), null);
  assert.equal(u.newerTag('16-alpine', ['17-alpine']), null);
  // Major-Spruenge nur bei Jahres-Versionen
  assert.equal(u.newerTag('8.4', ['8.4', '9.1', '26.7']), null);
  assert.equal(u.newerTag('8.13.4', ['8.19.2', '9.0.1']), '8.19.2');
  assert.equal(u.newerTag('2025.2.4', ['2026.8.4', '2025.12.1']), '2026.8.4');
});

test('parseAuthHeader: Bearer-Challenge der Registry', () => {
  assert.deepEqual(
    u.parseAuthHeader('Bearer realm="https://ghcr.io/token",service="ghcr.io",scope="repository:goauthentik/server:pull"'),
    { realm: 'https://ghcr.io/token', service: 'ghcr.io', scope: 'repository:goauthentik/server:pull' });
  assert.equal(u.parseAuthHeader('Basic realm="x"'), null);
});

test('zusammenfassen: Laeufe, gefundene Updates und Fehler aus dem Watchtower-Log', () => {
  const log = [
    'time="2026-10-19T10:15:02Z" level=info msg="Found new lscr.io/linuxserver/bookstack:latest image (sha256:1234)"',
    'time="2026-10-19T10:15:20Z" level=info msg="Stopping /bookstack (abc) with SIGTERM"',
    'time="2026-10-19T10:15:40Z" level=info msg="Session done" Failed=0 Scanned=6 Updated=1 notify=no',
    'time="2026-10-20T10:15:05Z" level=error msg="Could not do a head request" container=netbird-server',
    'time="2026-10-20T10:15:30Z" level=info msg="Session done" Failed=1 Scanned=6 Updated=0 notify=no',
    'Unstrukturierte Zeile',
  ];
  const z = u.zusammenfassen(log);
  assert.deepEqual(z.laeufe, [
    { time: '2026-10-20T10:15:30Z', gescannt: 6, aktualisiert: 0, fehler: 1 },
    { time: '2026-10-19T10:15:40Z', gescannt: 6, aktualisiert: 1, fehler: 0 },
  ]);
  assert.deepEqual(z.updates, [{ time: '2026-10-19T10:15:02Z', image: 'lscr.io/linuxserver/bookstack:latest' }]);
  assert.deepEqual(z.fehler, [{ time: '2026-10-20T10:15:05Z', msg: 'Could not do a head request' }]);
});

test('argOf: Watchtower-Argumente mit und ohne Wert', () => {
  const args = ['--schedule', '0 15 10 * * *', '--cleanup', '--interval=300'];
  assert.equal(u.argOf(args, '--schedule'), '0 15 10 * * *');
  assert.equal(u.argOf(args, '--cleanup'), 'true');
  assert.equal(u.argOf(args, '--interval'), '300');
  assert.equal(u.argOf(args, '--monitor-only'), null);
});

test('mitFrist: haengende Abfrage wird nach der Frist abgebrochen', async () => {
  await assert.rejects(u.mitFrist(new Promise(() => {}), 20, 'test:1'), /Zeitüberschreitung .* test:1/);
  assert.equal(await u.mitFrist(Promise.resolve(7), 1000, 'x'), 7);
});
