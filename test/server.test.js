import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from '../server/server.js';

let server, base;
before(async () => {
  server = createServer();
  await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => server.close());

test('healthz', async () => {
  const r = await fetch(base + '/healthz');
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), { ok: true });
});

test('serves the page, modules, models and fonts with the right types', async () => {
  const page = await fetch(base + '/');
  assert.equal(page.status, 200);
  assert.match(page.headers.get('content-type'), /text\/html/);
  assert.match(await page.text(), /view\.js/);
  for (const [p, type] of [['/game.js', /javascript/], ['/manifest.webmanifest', /manifest\+json/],
    ['/vendor/nunito-cyrillic-900-normal.woff2', /font\/woff2/]]) {
    const r = await fetch(base + p);
    assert.equal(r.status, 200, p);
    assert.match(r.headers.get('content-type'), type, p);
  }
});

test('no files outside public/, no writes', async () => {
  assert.equal((await fetch(base + '/%2e%2e/package.json')).status, 404);
  assert.equal((await fetch(base + '/nope.js')).status, 404);
  assert.equal((await fetch(base + '/', { method: 'POST' })).status, 405);
});

// Party analytics (public/telemetry.js → POST /api/telemetry): kept one record per line in a file per day, read back
// only with the token; junk, oversized and too many records are turned away; off when no folder is set.
test('telemetry: records are kept and read back with the token only; junk is refused', async () => {
  const { mkdtempSync, readdirSync, readFileSync, rmSync } = await import('node:fs'), { tmpdir } = await import('node:os'), { join } = await import('node:path');
  const dir = mkdtempSync(join(tmpdir(), 'fruit-t-')), s = createServer({ telemetryDir: dir, token: 'secret' });
  await new Promise((ok) => s.listen(0, '127.0.0.1', ok)); const b = `http://127.0.0.1:${s.address().port}/api/telemetry`;
  const rec = (type, extra = {}) => ({ v: 1, type, id: 'p1', dev: 'd1', ver: '0.23.1', level: 2, at: 1, ...extra });
  const post = (body) => fetch(b, { method: 'POST', headers: { 'content-type': 'application/json' }, body: typeof body === 'string' ? body : JSON.stringify(body) });
  try {
    assert.equal((await post([rec('start'), rec('wave', { n: 1, bites: { ant: 2 } })])).status, 200);
    assert.equal((await post({ not: 'a list' })).status, 400);
    assert.equal((await post([{ ...rec('wave'), v: 2 }])).status, 400);
    assert.equal((await post([rec('nonsense')])).status, 400);
    assert.equal((await post('{broken')).status, 400);
    assert.equal((await post('x'.repeat(300 * 1024))).status, 413);
    assert.equal((await post(Array.from({ length: 101 }, () => rec('wave')))).status, 400);
    const files = readdirSync(dir); assert.equal(files.length, 1); assert.match(files[0], /^\d{4}-\d\d-\d\d\.jsonl$/);
    const lines = readFileSync(join(dir, files[0]), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
    assert.deepEqual(lines.map((l) => l.type), ['start', 'wave']); assert.ok(lines[0].got > 0);
    assert.equal((await fetch(b)).status, 401);
    assert.equal((await fetch(b, { headers: { authorization: 'Bearer wrong' } })).status, 401);
    const r = await fetch(b, { headers: { authorization: 'Bearer secret' } }); assert.equal(r.status, 200);
    assert.deepEqual((await r.text()).trim().split('\n').map((l) => JSON.parse(l).type), ['start', 'wave']);
    const none = await fetch(b + '?from=2999-01-01', { headers: { authorization: 'Bearer secret' } }); assert.equal((await none.text()), '');
  } finally { s.close(); rmSync(dir, { recursive: true }); }
  assert.equal((await fetch(base + '/api/telemetry', { method: 'POST', body: '[]' })).status, 404, 'off without a folder');
});

test('telemetry: the rate limit keys on the address the proxy saw, not on what the sender puts first', async () => {
  const { mkdtempSync, rmSync } = await import('node:fs'), { tmpdir } = await import('node:os'), { join } = await import('node:path');
  const dir = mkdtempSync(join(tmpdir(), 'fruit-t-')), s = createServer({ telemetryDir: dir, token: 't' });
  await new Promise((ok) => s.listen(0, '127.0.0.1', ok)); const b = `http://127.0.0.1:${s.address().port}/api/telemetry`;
  const list = JSON.stringify(Array.from({ length: 100 }, (_, k) => ({ v: 1, type: 'wave', id: `p${k}`, dev: 'd', level: 0 })));
  try {
    const codes = [];
    for (let k = 0; k < 8; k++) codes.push((await fetch(b, { method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': `9.9.9.${k}, 1.2.3.4` }, body: list })).status);
    assert.deepEqual(codes, [200, 200, 200, 200, 200, 200, 429, 429]);
  } finally { s.close(); rmSync(dir, { recursive: true }); }
});
