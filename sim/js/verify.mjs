// The two copies of the rules against each other: the native bot plays parties and writes down every action and the
// hash of the state after every step (fruit-sim run … record), and public/game.js replays them: every hash must be
// the one written down. There is no bot on the JS side: a party costs the JS simulation alone.
//   node sim/js/verify.mjs [fast|full] [--levels 1,5-7] [--jobs N] [--keep DIR] [--coverage]
// fast (default, some seconds): parts of a few scenarios of the balance matrix, picked to touch every rule, and
//   players with no plan at all (random actions, often impossible ones) on every level;
// full (minutes; CI runs it): every scenario of the full matrix, other draws of the waves too, and more random players.
// --coverage lists the lines of public/game.js that no party of the run got to; --keep leaves the parties in DIR.
import { Worker } from 'node:worker_threads';
import { execFileSync, spawn } from 'node:child_process';
import { writeFileSync, mkdtempSync, mkdirSync, rmSync, readdirSync, readFileSync } from 'node:fs';
import { availableParallelism, tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { LEVELS } from '../../public/data.js';
import { plan } from '../../balance/plans.mjs';

const here = dirname(fileURLToPath(import.meta.url)), root = join(here, '..', '..'), bin = join(root, 'sim', 'target', 'release', 'fruit-sim');
const args = process.argv.slice(2), opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const kind = args.find((a) => a === 'fast' || a === 'full') || 'fast', jobs = Number(opt('--jobs', Math.max(1, Math.floor(availableParallelism() / 2))));
const range = (s) => s.split(',').flatMap((p) => { const [a, b] = p.split('-').map(Number); return b ? Array.from({ length: b - a + 1 }, (_, k) => a + k) : [a]; });
const levels = (opt('--levels') ? range(opt('--levels')) : LEVELS.map((_, n) => n + 1)).map((n) => n - 1);
// the fast set: parts of a few levels chosen so that between them every bug, boss, plant and kind of ground comes
// up, played three ways — the smart bot (mazes, repairs, powers at the right time), the bot that leaves holes to grow
// back by themselves and the one that spends frost and rain at once, a garden with all the dew at once (crowds of
// plants, every upgrade) — and stopped after STEPS steps of the game (the bosses of the middle of a level are in)
const STEPS = 26000, FAST = [[2, 'no repair'], [3, 'exploit spread'], [4, 'smart s7'], [5, 'smart s7'], [7, 'eager powers']];
const all = plan('full', LEVELS.map((_, n) => n));
const tasks = (kind === 'full' ? all.filter((t) => levels.includes(t.level)) : FAST.filter(([n]) => levels.includes(n)).map(([n, name]) => {
  const t = all.find((x) => x.level === n && x.name === name); if (!t) throw new Error(`verify: no scenario '${name}' in balance/plans.mjs any more: pick another for the fast set`);
  return { ...t, opts: { ...t.opts, steps: STEPS } }; }))
  .map((t) => ({ ...t, set: {} }));
// players with no plan: a few on every level, with no perks and with all of them
for (const n of levels) for (let k = 0; k < (kind === 'full' ? 12 : 2); k++) tasks.push({ level: n, name: `random ${k}`, random: true, opts: { seed: 100 + k * 7 + n, meta: k % 2 ? 'full' : 'none', steps: kind === 'full' ? 9000 : 6000 }, set: {} });

const t0 = Date.now();
execFileSync('cargo', ['build', '--release', '--quiet'], { cwd: join(root, 'sim'), stdio: ['ignore', 'inherit', 'inherit'] });
const dir = opt('--keep') || mkdtempSync(join(tmpdir(), 'fruit-verify-')); mkdirSync(dir, { recursive: true });
for (const f of readdirSync(dir)) if (/^(\d{4}(\.ops)?|data-\d+)\.json$/.test(f)) rmSync(join(dir, f)); // what an earlier run left in --keep
// one batch per draw of the waves (the overrides change the data for good: a worker each). A party is three files:
// NNNN.json (what it is), NNNN.ops.json (the actions and the hashes, written by fruit-sim) and the data of its batch
const groups = new Map(); for (const t of tasks) { const k = String(t.waveSeed ?? null); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(t); }
let n = 0, gi = 0;
for (const list of groups.values()) {
  const ids = list.map(() => String(n++).padStart(4, '0'));
  const m = await new Promise((res) => { const w = new Worker(join(root, 'balance', 'native.mjs'), { workerData: { bin, jobs, tasks: list, record: ids.map((id) => join(dir, `${id}.ops.json`)) } }); w.once('message', res); w.once('error', (e) => res({ ok: false, err: String(e) })); });
  const broke = m.ok ? m.out.map((x, k) => x.err && `L${list[k].level + 1} ${list[k].name}: ${x.err}`).filter(Boolean) : [m.err];
  if (broke.length) { console.error(broke.join('\n')); process.exit(1); }
  writeFileSync(join(dir, `data-${gi}.json`), JSON.stringify(m.data));
  list.forEach((t, k) => writeFileSync(join(dir, `${ids[k]}.json`), JSON.stringify({ name: `L${t.level + 1} ${t.name}`, data: `data-${gi}.json`, level: t.level, seed: m.opts[k].seed ?? 7, meta: m.opts[k].meta, ops: `${ids[k]}.ops.json` })));
  gi++;
}
const tPlay = Date.now() - t0;
// the replays: `jobs` Node processes, each with its share of the parties
const files = readdirSync(dir).filter((f) => /^\d{4}\.json$/.test(f)).sort().map((f) => join(dir, f));
const cov = args.includes('--coverage') ? mkdtempSync(join(tmpdir(), 'fruit-cov-')) : null;
const outs = await Promise.all(Array.from({ length: jobs }, (_, j) => new Promise((res) => {
  const mine = files.filter((_, k) => k % jobs === j); if (!mine.length) return res({ code: 0, out: '' });
  const p = spawn(process.execPath, [join(here, 'replay.mjs'), '--check-only', ...mine], { env: cov ? { ...process.env, NODE_V8_COVERAGE: cov } : process.env }); let out = '';
  p.stdout.on('data', (d) => { out += d; }); p.stderr.on('data', (d) => { out += d; }); p.on('close', (code) => res({ code, out }));
})));
const bad = outs.flatMap((o) => o.out.split('\n').filter((l) => /MISMATCH|Error/.test(l)));
const opsOf = (f) => readFileSync(f.replace(/\.json$/, '.ops.json'), 'utf8'), steps = files.reduce((s, f) => s + (opsOf(f).match(/\["s",/g) || []).length, 0);
for (const l of bad) console.log(l);
if (cov) {
  // the lines of game.js nothing ran: by the ranges V8 counted as never entered, over all the replay processes
  const src = readFileSync(join(root, 'public', 'game.js'), 'utf8'), hit = new Uint8Array(src.length).fill(1), seen = new Uint8Array(src.length);
  for (const f of readdirSync(cov)) for (const r of JSON.parse(readFileSync(join(cov, f), 'utf8')).result) {
    if (!r.url.endsWith('/public/game.js')) continue;
    // a process's own picture first (inner ranges refine outer ones), then a line counts as run if any process ran it
    const own = new Uint8Array(src.length).fill(1);
    for (const fn of r.functions) for (const g of fn.ranges) own.fill(g.count > 0 ? 1 : 0, g.startOffset, g.endOffset);
    for (let k = 0; k < src.length; k++) if (own[k]) seen[k] = 1;
  }
  for (let k = 0; k < src.length; k++) hit[k] = seen[k];
  let pos = 0; const dead = [];
  src.split('\n').forEach((line, k) => { const text = line.trim(); if (text && !text.startsWith('//') && !hit.subarray(pos, pos + line.length).some((x) => x)) dead.push(`  ${k + 1}: ${text.slice(0, 110)}`); pos += line.length + 1; });
  console.log(`lines of public/game.js no party ran (${dead.length}):\n${dead.join('\n')}`);
  rmSync(cov, { recursive: true });
}
const failed = bad.length || outs.some((o) => o.code);
if (failed && !bad.length) console.log(outs.map((o) => o.out).join('\n'));
// where the first of them parts: the state after that step in both copies, the numbers that differ
const first = bad.map((l) => l.match(/^(.*): MISMATCH at op (\d+)/)).find(Boolean);
if (first) {
  const file = files.find((f) => JSON.parse(readFileSync(f, 'utf8')).name === first[1]), at = first[2], lines = (cmd, a) => execFileSync(cmd, a, { maxBuffer: 1 << 28 }).toString().trim().split('\n');
  const js = lines(process.execPath, [join(here, 'replay.mjs'), file, '--no-check', '--dump-at', at]), rs = lines(bin, ['replay', file, '--no-check', '--dump-at', at]);
  const ops = JSON.parse(opsOf(file)), before = ops.slice(0, Number(at)).filter((o) => o[0] !== 's').slice(-3).map((o) => o.join(' ')).join('; ');
  console.log(`\n${first[1]}, step ${ops.slice(0, Number(at) + 1).filter((o) => o[0] === 's').length} (the last actions before it: ${before || '-'}). The state after it, game.js against game.rs:`);
  let shown = 0; for (let k = 0; k < Math.max(js.length, rs.length) && shown < 12; k++) {
    const [, a, av, ...name] = (js[k] || '').split(' '), [, b, bv] = (rs[k] || '').split(' ');
    if (a !== b) { shown++; console.log(`  ${name.join(' ') || `number ${k}`}: ${av ?? 'none'} in game.js, ${bv ?? 'none'} in game.rs`); }
  }
  // the party stays for a closer look: one file with everything in it
  const kept = join(opt('--keep') || tmpdir(), 'fruit-verify-failed.json'), tr = JSON.parse(readFileSync(file, 'utf8'));
  writeFileSync(kept, JSON.stringify({ ...tr, data: JSON.parse(readFileSync(join(dir, tr.data), 'utf8')), ops }));
  console.log(`  the party: ${kept} (the whole state after action K: node sim/js/replay.mjs <party> --dump-at K; sim/target/release/fruit-sim replay <party> --no-check --dump-at K)`);
}
if (!opt('--keep')) rmSync(dir, { recursive: true });
console.log(`${kind}: ${files.length} parties, ${steps} steps, ${failed ? `${bad.length} DIFFER` : 'all the same in both'}; played in ${(tPlay / 1000).toFixed(1)} s, replayed in ${((Date.now() - t0 - tPlay) / 1000).toFixed(1)} s`);
process.exit(failed ? 1 : 0);
