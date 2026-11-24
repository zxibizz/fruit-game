// The balance studio: node balance/studio.mjs [--port 8737] [--jobs N] [--nice]  →  http://localhost:8737
// For every level and every wave, the gardens that hold the wave best for the dew a player has by then (the native
// engine, `fruit-sim studio`, sim/src/studio.rs: a search on the real rules, one best garden kept for every
// composition), shown as they are found: the margin of the best garden and of the best garden of one plant, which
// plants and branches the best gardens are made of, their mazes. Change the numbers on the page (the overrides of
// balance/run.mjs --set, the field of a level) or the files (public/data.js; the rules in sim/src, rebuilt by cargo),
// and everything found is played again on the new game first — seconds — and the search goes on from there.
// What it finds is kept in balance/.studio/ between runs. POST /api/campaign {level} plays the whole level from the
// studio's gardens (balance/campaign.mjs, minutes) against the expert of the matrix; POST /api/verify {level, wave, rank}
// plays a garden on 8 seeds of the game. POST /api/explain {level, wave, rank} tells what each family
// of plants of a garden does for it (its margin with that family taken out).
import { createServer } from 'node:http';
import { spawn, execFile } from 'node:child_process';
import { createInterface } from 'node:readline';
import { readFileSync, writeFileSync, mkdirSync, existsSync, watch } from 'node:fs';
import { availableParallelism } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url)), ROOT = join(HERE, '..'), SIM = join(ROOT, 'sim');
const BIN = join(SIM, 'target', 'release', 'fruit-sim'), CACHE_DIR = join(HERE, '.studio'), CACHE = join(CACHE_DIR, 'state.json');
const args = process.argv.slice(2), opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const PORT = Number(opt('--port', 8737)), JOBS = Number(opt('--jobs', Math.max(1, availableParallelism() - 1))), NICE = args.includes('--nice');

// ---- state ----
const S = {
  overrides: {}, config: { meta: 'exp2', tol: 0, early: false }, focus: { level: 5, wave: null }, caps: { focus: 20000, other: 1500 },
  ui: null, errors: [], engine: 'starting', buildLog: '', status: null, gen: 0,
  waves: {}, // "level:wave" → the engine's last report of that wave
  baseline: null, // { label, at, overrides, waves: { "level:wave": summary } }
};
if (existsSync(CACHE)) {
  try { const c = JSON.parse(readFileSync(CACHE, 'utf8')); Object.assign(S, { overrides: c.overrides || {}, config: { ...S.config, ...c.config }, focus: c.focus || S.focus, waves: c.waves || {}, baseline: c.baseline || null }); }
  catch (e) { console.error('studio: the cache is unreadable, starting afresh:', e.message); }
}
let dirtyCache = false;
function saveCache() {
  if (!dirtyCache) return; dirtyCache = false;
  mkdirSync(CACHE_DIR, { recursive: true });
  writeFileSync(CACHE, JSON.stringify({ overrides: S.overrides, config: S.config, focus: S.focus, waves: S.waves, baseline: S.baseline }));
}
setInterval(saveCache, 15000).unref();

// what the page needs of a wave to draw the overview: no gardens, only what they come to
function summary(r) {
  const top = r.top || [], fresh = top.filter((g) => !g.stale), mono = Object.fromEntries(Object.entries(r.mono || {}).map(([k, g]) => [k, { m: g.m, stale: g.stale }]));
  const pick = {}, k = Math.min(5, top.length);
  for (const g of top.slice(0, k)) for (const [f, x] of Object.entries(g.mix)) pick[f] = (pick[f] || 0) + x / k;
  const monoBest = Math.max(0, ...Object.values(mono).map((g) => g.m));
  return { level: r.level, wave: r.wave, gen: r.gen, budget: r.budget, tried: r.tried, plays: r.plays, stale: r.stale, niches: r.niches,
    best: top[0]?.m ?? 0, bestStale: !!top[0]?.stale, fresh: fresh.length, mono, monoBest, pick, mix: top[0]?.mix || {}, len: top[0]?.len ?? null };
}

// ---- the page's live feed ----
const clients = new Set();
function send(res, ev, data) { res.write(`event: ${ev}\ndata: ${JSON.stringify(data)}\n\n`); }
function broadcast(ev, data, pred = () => true) { for (const c of clients) if (pred(c)) send(c.res, ev, data); }
const initOf = () => ({ ui: S.ui, overrides: S.overrides, config: S.config, focus: S.focus, caps: S.caps, errors: S.errors, engine: S.engine, buildLog: S.buildLog, status: S.status, baseline: S.baseline,
  summaries: Object.values(S.waves).map(summary), jobs: JOBS, campaign: campaignOf() });

// ---- the game data ----
function makeData() {
  return new Promise((ok) => {
    const p = execFile(process.execPath, [join(HERE, 'studio-data.mjs')], { maxBuffer: 1 << 28 }, (err, out, errOut) => {
      if (err) { ok({ errors: [String(errOut || err.message)] }); return; }
      try { ok(JSON.parse(out)); } catch (e) { ok({ errors: ['studio-data: ' + e.message] }); }
    });
    p.stdin.end(JSON.stringify({ set: S.overrides, meta: S.config.meta }));
  });
}
let pushing = null;
async function pushData() {
  if (pushing) { pushing.again = true; return; }
  pushing = { again: false };
  try {
    const d = await makeData(); S.errors = d.errors || [];
    if (d.ui) S.ui = d.ui;
    broadcast('data', { ui: S.ui, errors: S.errors, overrides: S.overrides, config: S.config });
    if (d.data && engine) {
      engine.write({ cmd: 'data', data: d.data, meta: d.meta, tol: S.config.tol, early: S.config.early });
      engine.write({ cmd: 'cap', ...S.caps }); engine.write({ cmd: 'focus', ...S.focus });
      if (engine.fresh) { engine.fresh = false; seedAll(); }
    }
  } finally { const again = pushing.again; pushing = null; if (again) pushData(); }
}
// what was found before goes to a new engine to start from (it is played again on the game as it is)
function seedAll() {
  for (const r of Object.values(S.waves)) {
    const gardens = [...(r.top || []).map((g) => ({ walls: g.walls, cells: g.cells, m: g.m })), ...Object.values(r.mono || {}).map((g) => ({ walls: g.walls, cells: g.cells, m: g.m, mono: true }))];
    if (gardens.length) engine.write({ cmd: 'seed', level: r.level, wave: r.wave, gardens });
  }
}

// ---- the engine ----
let engine = null; const waiting = new Map(); let asked = 0;
let campaign = null; const campaignOf = () => (campaign ? { level: campaign.level, running: campaign.running, log: campaign.log.slice(-30), result: campaign.result && { margins: campaign.result.margins, plan: campaign.result.plan?.length }, error: campaign.error || null, at: campaign.at } : null);
function setEngine(state, log) { S.engine = state; if (log != null) S.buildLog = log; broadcast('engine', { engine: S.engine, buildLog: S.buildLog }); }
function build() {
  return new Promise((ok) => {
    setEngine('building');
    execFile('cargo', ['build', '--release', '--quiet', '--color', 'never'], { cwd: SIM, maxBuffer: 1 << 24 }, (err, out, errOut) => {
      if (err) { setEngine('build failed', String(errOut || err.message)); ok(false); } else { S.buildLog = String(errOut || ''); ok(true); }
    });
  });
}
function startEngine() {
  const argv = ['studio', '--jobs', String(JOBS)];
  const p = NICE ? spawn('nice', ['-n', '19', BIN, ...argv]) : spawn(BIN, argv);
  const me = { p, fresh: true, write: (o) => { if (!p.killed && p.stdin.writable) p.stdin.write(JSON.stringify(o) + '\n'); } };
  engine = me;
  p.stdin.on('error', () => {});
  createInterface({ input: p.stdout }).on('line', (line) => {
    let j; try { j = JSON.parse(line); } catch { return; }
    if (j.t === 'wave') {
      const key = `${j.level}:${j.wave}`; S.waves[key] = j; dirtyCache = true;
      broadcast('summary', summary(j));
      if (j.level === S.focus.level) broadcast('wave', j); // the gardens in full only of the level looked at
    } else if (j.t === 'status') { S.status = j; broadcast('status', j); }
    else if (j.t === 'explain') { const w = waiting.get(j.id); if (w) { waiting.delete(j.id); w(j); } }
    else if (j.t === 'ready') { S.gen = j.gen; setEngine('running'); }
    else if (j.t === 'error') { S.errors = [...S.errors, 'engine: ' + j.msg]; broadcast('data', { ui: S.ui, errors: S.errors, overrides: S.overrides, config: S.config }); }
  });
  let errTail = '';
  p.stderr.on('data', (d) => { errTail = (errTail + d).slice(-4000); });
  p.on('exit', (code, sig) => {
    if (engine !== me) return; // replaced on purpose
    engine = null; setEngine('crashed', errTail || `exit ${code ?? sig}`);
    setTimeout(() => { if (!engine) { startEngine(); pushData(); } }, 2000);
  });
}
async function restartEngine() {
  if (!(await build())) return; // the old engine (if any) goes on with the old rules
  const old = engine; engine = null; if (old) old.p.kill();
  startEngine(); setEngine('loading'); await pushData();
}

// ---- files: the data and the rules ----
let timer = null, what = new Set();
function changed(kind) { what.add(kind); clearTimeout(timer); timer = setTimeout(() => { const w = what; what = new Set(); if (w.has('rules')) restartEngine(); else if (w.has('data')) pushData(); }, 400); }
watch(join(ROOT, 'public'), (ev, f) => { if (f === 'data.js') changed('data'); });
watch(HERE, (ev, f) => { if (f === 'scenario.mjs' || f === 'studio-data.mjs') changed('data'); });
watch(join(SIM, 'src'), (ev, f) => { if (f && f.endsWith('.rs')) changed('rules'); });

// ---- http ----
const body = (req) => new Promise((ok, no) => { let s = ''; req.on('data', (d) => { s += d; if (s.length > 1 << 22) no(new Error('too big')); }); req.on('end', () => { try { ok(s ? JSON.parse(s) : {}); } catch (e) { no(e); } }); });
const json = (res, code, o) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(o)); };
createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  try {
    if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html')) { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); res.end(readFileSync(join(HERE, 'studio.html'))); return; }
    if (req.method === 'GET' && url.pathname === '/events') {
      res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive' });
      const c = { res }; clients.add(c);
      send(res, 'init', initOf());
      for (const r of Object.values(S.waves)) if (r.level === S.focus.level) send(res, 'wave', r);
      const ping = setInterval(() => res.write(': ping\n\n'), 20000);
      req.on('close', () => { clearInterval(ping); clients.delete(c); });
      return;
    }
    if (req.method === 'GET' && url.pathname === '/api/wave') { const r = S.waves[`${url.searchParams.get('level')}:${url.searchParams.get('wave')}`]; return json(res, r ? 200 : 404, r || { error: 'not found yet' }); }
    if (req.method !== 'POST') return json(res, 404, { error: 'no such page' });
    const b = await body(req);
    if (url.pathname === '/api/focus') {
      S.focus = { level: b.level ?? null, wave: b.wave ?? null }; dirtyCache = true; engine?.write({ cmd: 'focus', ...S.focus });
      // the page that asked gets every wave of the level it looks at now
      return json(res, 200, { ok: true, waves: Object.values(S.waves).filter((r) => r.level === S.focus.level) });
    }
    // what each family of a garden does: {level, wave, rank} (a garden of the top, 0 the best) or {level, wave, mono: plant}
    if (url.pathname === '/api/explain') {
      const r = S.waves[`${b.level}:${b.wave}`]; const g = r && (b.mono ? r.mono?.[b.mono] : r.top?.[b.rank ?? 0]);
      if (!g || !engine) return json(res, 404, { error: 'no such garden yet' });
      const id = ++asked; const got = new Promise((ok) => { waiting.set(id, ok); setTimeout(() => { if (waiting.delete(id)) ok({ error: 'timed out' }); }, 60000); });
      engine.write({ cmd: 'explain', id, level: b.level, wave: b.wave, garden: { walls: g.walls, cells: g.cells, m: g.m } });
      return json(res, 200, await got);
    }
    // the garden on 8 seeds of the game: {level, wave, rank} or {level, wave, mono}
    if (url.pathname === '/api/verify') {
      const r = S.waves[`${b.level}:${b.wave}`]; const g = r && (b.mono ? r.mono?.[b.mono] : r.top?.[b.rank ?? 0]);
      if (!g || !engine) return json(res, 404, { error: 'no such garden yet' });
      const id = ++asked; const got = new Promise((ok) => { waiting.set(id, ok); setTimeout(() => { if (waiting.delete(id)) ok({ error: 'timed out' }); }, 120000); });
      engine.write({ cmd: 'verify', id, level: b.level, wave: b.wave, garden: { walls: g.walls, cells: g.cells, m: g.m } });
      return json(res, 200, await got);
    }
    // the slow check: a whole level played from the studio's gardens (balance/campaign.mjs), one at a time
    if (url.pathname === '/api/campaign') {
      if (b.action === 'stop') { campaign?.p?.kill(); return json(res, 200, { ok: true }); }
      if (campaign?.running) return json(res, 409, { error: 'a campaign is running' });
      dirtyCache = true; saveCache();
      const L = Number(b.level), file = join(CACHE_DIR, `campaign-L${L + 1}.json`);
      const p = spawn(process.execPath, [join(HERE, 'campaign.mjs'), '--level', String(L + 1), '--from', CACHE, '--rounds', String(b.rounds ?? 30), '--jobs', String(Math.max(1, JOBS - 1)), '--out', file]);
      campaign = { level: L, running: true, log: [], result: null, p, at: Date.now() };
      const line = (s) => { for (const x of String(s).split('\n').filter((t) => t.trim() && !/^(warning|\s+[|=-]|\s*-->|\s*\d+ \|)/.test(t))) { campaign.log.push(x); if (campaign.log.length > 200) campaign.log.shift(); } broadcast('campaign', campaignOf()); };
      p.stdout.on('data', line); p.stderr.on('data', line);
      p.on('exit', (code) => { campaign.running = false; delete campaign.p; try { campaign.result = JSON.parse(readFileSync(file, 'utf8')); } catch { campaign.error = `exit ${code}`; } broadcast('campaign', campaignOf()); });
      broadcast('campaign', campaignOf()); return json(res, 200, { ok: true });
    }
    if (url.pathname === '/api/overrides') { S.overrides = b.set || {}; dirtyCache = true; pushData(); return json(res, 200, { ok: true }); }
    if (url.pathname === '/api/config') { S.config = { ...S.config, ...b }; dirtyCache = true; pushData(); return json(res, 200, { ok: true }); }
    if (url.pathname === '/api/caps') { S.caps = { ...S.caps, ...b }; engine?.write({ cmd: 'cap', ...S.caps }); return json(res, 200, { ok: true }); }
    if (url.pathname === '/api/baseline') {
      S.baseline = b.action === 'clear' ? null : { label: b.label || new Date().toLocaleString(), at: Date.now(), overrides: { ...S.overrides }, config: { ...S.config },
        waves: Object.fromEntries(Object.entries(S.waves).map(([k, r]) => [k, { ...summary(r), top: (r.top || []).slice(0, 3).map((g) => ({ m: g.m, mix: g.mix })) }])) };
      dirtyCache = true; broadcast('baseline', S.baseline); return json(res, 200, { ok: true });
    }
    return json(res, 404, { error: 'no such api' });
  } catch (e) { json(res, 400, { error: String(e.message || e) }); }
}).listen(PORT, () => console.log(`studio: http://localhost:${PORT}  (${JOBS} threads${NICE ? ', nice' : ''})`));

for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { dirtyCache = true; saveCache(); engine?.p.kill(); process.exit(0); });
restartEngine();
