// Game server: serves the static files from public/ (the game itself runs entirely in the browser) and keeps the
// party analytics the game sends (public/telemetry.js):
//   POST /api/telemetry  — a JSON list of records ({ v: 1, type, id, dev, ... }), appended one per line to
//                          $TELEMETRY_DIR/<day>.jsonl. The page is open to anyone, so: a record must look like one,
//                          a request is at most 256 KB and 100 records, an address may send 600 records a minute,
//                          a day's file stops growing at 50 MB. No TELEMETRY_DIR: the endpoint is off (404).
//   GET /api/telemetry?from=YYYY-MM-DD&to=YYYY-MM-DD — those days' records as they were kept (all of them without
//                          from/to), for balance/players.mjs; only with the header Authorization: Bearer
//                          $TELEMETRY_TOKEN (no token set: no reading at all).
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const PUBLIC = path.resolve(fileURLToPath(new URL('../public/', import.meta.url)));
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.webmanifest': 'application/manifest+json', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml',
  '.glb': 'model/gltf-binary', '.woff2': 'font/woff2', '.mp3': 'audio/mpeg',
};
const log = (...a) => console.log(new Date().toISOString(), ...a);
const TYPES_T = new Set(['start', 'wave', 'end', 'quit']), BODY = 256 * 1024, BATCH = 100, PER_MIN = 600, DAY_CAP = 50 * 1024 * 1024;
const day = (t = Date.now()) => new Date(t).toISOString().slice(0, 10);
const okRecord = (r) => r && typeof r === 'object' && !Array.isArray(r) && r.v === 1 && TYPES_T.has(r.type) && typeof r.id === 'string' && r.id.length <= 64
  && typeof r.dev === 'string' && r.dev.length <= 64 && Number.isInteger(r.level) && r.level >= 0 && r.level < 100;
function body(req, max) {
  // past max the rest is read and dropped (so that the 413 reaches the sender), and past ten times max cut off
  return new Promise((ok, fail) => { let n = 0; const parts = [];
    req.on('data', (c) => { n += c.length; if (n <= max) parts.push(c); else if (n > max * 10) { req.destroy(); fail(Object.assign(new Error('too big'), { code: 413 })); } });
    req.on('end', () => (n > max ? fail(Object.assign(new Error('too big'), { code: 413 })) : ok(Buffer.concat(parts).toString('utf8')))); req.on('error', fail); });
}

export function createServer({ telemetryDir = process.env.TELEMETRY_DIR, token = process.env.TELEMETRY_TOKEN } = {}) {
  const seen = new Map(), sizes = new Map(); // address → [minute, records]; day → bytes written
  const reply = (res, code, obj) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(obj ? JSON.stringify(obj) : ''); };
  async function telemetry(req, res, url) {
    if (!telemetryDir) return reply(res, 404);
    if (req.method === 'POST') {
      let list;
      try { list = JSON.parse(await body(req, BODY)); } catch (e) { return reply(res, e.code === 413 ? 413 : 400); }
      if (!Array.isArray(list) || list.length > BATCH || !list.every(okRecord)) return reply(res, 400);
      // the address the proxy in front saw (the last one it added; a sender can put anything before it)
      const ip = String(req.headers['x-forwarded-for'] || '').split(',').map((x) => x.trim()).filter(Boolean).at(-1) || req.socket.remoteAddress || '', minute = Math.floor(Date.now() / 60000);
      const s = seen.get(ip); const n = s && s[0] === minute ? s[1] + list.length : list.length;
      if (n > PER_MIN) return reply(res, 429); seen.set(ip, [minute, n]);
      if (seen.size > 5000) for (const [k, v] of seen) if (v[0] !== minute) seen.delete(k); // old minutes go, this one's counts stay
      const d = day(), file = path.join(telemetryDir, `${d}.jsonl`), got = Date.now(), text = list.map((r) => JSON.stringify({ ...r, got })).join('\n') + '\n';
      if (!sizes.has(d)) { sizes.clear(); let was = 0; try { was = (await fs.stat(file)).size; } catch { /* a new day */ } if (!sizes.has(d)) sizes.set(d, was); }
      // counted before the write, in one step with the check: requests at the same time cannot all slip under the cap
      if (sizes.get(d) + text.length > DAY_CAP) return reply(res, 507); sizes.set(d, sizes.get(d) + text.length);
      await fs.mkdir(telemetryDir, { recursive: true });
      await fs.appendFile(file, text);
      return reply(res, 200, { ok: true, n: list.length });
    }
    if (req.method !== 'GET') return reply(res, 405);
    if (!token || req.headers.authorization !== `Bearer ${token}`) return reply(res, 401);
    const from = url.searchParams.get('from') || '0000-00-00', to = url.searchParams.get('to') || '9999-99-99';
    let days = []; try { days = (await fs.readdir(telemetryDir)).filter((f) => /^\d{4}-\d\d-\d\d\.jsonl$/.test(f) && f.slice(0, 10) >= from && f.slice(0, 10) <= to).sort(); } catch { /* nothing yet */ }
    res.writeHead(200, { 'content-type': 'application/x-ndjson', 'cache-control': 'no-store' });
    for (const f of days) res.write(await fs.readFile(path.join(telemetryDir, f)));
    res.end();
  }
  return http.createServer(async (req, res) => {
    let url;
    try { url = new URL(req.url, 'http://localhost'); } catch { res.writeHead(400); res.end(); return; }
    if (url.pathname === '/api/telemetry') { try { await telemetry(req, res, url); } catch (e) { log('telemetry', e.message); if (!res.headersSent) reply(res, 500); else res.end(); } return; }
    if (url.pathname === '/healthz') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end('{"ok":true}');
      return;
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); res.end(); return; }
    let p;
    try { p = decodeURIComponent(url.pathname); } catch { res.writeHead(400); res.end(); return; }
    if (p.endsWith('/')) p += 'index.html';
    const file = path.resolve(PUBLIC, '.' + p);
    if (!file.startsWith(PUBLIC + path.sep)) { res.writeHead(404); res.end(); return; }
    try {
      const data = await fs.readFile(file);
      res.writeHead(200, {
        'content-type': TYPES[path.extname(file)] || 'application/octet-stream',
        'cache-control': 'no-cache',
        'x-content-type-options': 'nosniff',
      });
      res.end(req.method === 'HEAD' ? undefined : data);
    } catch {
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
      res.end('not found');
    }
  });
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const PORT = Number(process.env.PORT) || 8080;
  const server = createServer();
  server.listen(PORT, () => log(`fruit-game on :${PORT}`));
  for (const sig of ['SIGTERM', 'SIGINT']) {
    process.on(sig, () => { log(`${sig}, exit`); server.close(); process.exit(0); });
  }
}
