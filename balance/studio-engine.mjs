// The studio's engine (fruit-sim studio, sim/src/studio.rs) for scripts: balance/meta.mjs, balance/campaign.mjs and
// the checks of the studio itself. One engine process; the data comes from balance/studio-data.mjs (overrides as in
// balance/run.mjs --set, the field of a level as L<n>.map).
import { spawn, execFileSync } from 'node:child_process';
import { createInterface } from 'node:readline';
import { availableParallelism } from 'node:os';
import { fileURLToPath } from 'node:url';
import { build } from '../sim/js/play.mjs';

const DATA = fileURLToPath(new URL('./studio-data.mjs', import.meta.url));
// the data of the game with the overrides `set`, the perks `meta` of every level: { data, meta, ui, errors }
export function gameData(set = {}, meta = 'exp3') {
  const d = JSON.parse(execFileSync(process.execPath, [DATA], { input: JSON.stringify({ set, meta }), maxBuffer: 1 << 28 }));
  if (d.errors?.length) throw new Error('overrides: ' + d.errors.join('; '));
  return d;
}

export class Engine {
  constructor({ jobs = Math.max(1, availableParallelism() - 1), nice = false } = {}) {
    const bin = build(), argv = ['studio', '--jobs', String(jobs)];
    this.p = nice ? spawn('nice', ['-n', '19', bin, ...argv]) : spawn(bin, argv);
    this.waves = new Map(); this.gen = 0; this.waiting = new Map(); this.asked = 0; this.listeners = new Set(); this.rate = 0;
    this.p.stderr.on('data', (d) => process.stderr.write(d));
    createInterface({ input: this.p.stdout }).on('line', (line) => {
      let j; try { j = JSON.parse(line); } catch { return; }
      if (j.t === 'wave') this.waves.set(`${j.level}:${j.wave}`, j);
      else if (j.t === 'ready') this.gen = j.gen;
      else if (j.t === 'status') this.rate = j.rate;
      else if ((j.t === 'explain' || j.t === 'verify') && this.waiting.has(j.id)) { this.waiting.get(j.id)(j); this.waiting.delete(j.id); }
      else if (j.t === 'error') process.stderr.write(`engine: ${j.msg}\n`);
      for (const f of this.listeners) f(j);
    });
  }
  send(o) { this.p.stdin.write(JSON.stringify(o) + '\n'); }
  // a new game: { set, meta, tol, early }; resolves once the engine has it (gen)
  load({ set = {}, meta = 'exp3', tol = 0, early = false } = {}) {
    const d = gameData(set, meta); this.ui = d.ui;
    const gen = this.gen + 1; this.send({ cmd: 'data', data: d.data, meta: d.meta, tol, early });
    return this.until((j) => j.t === 'ready' && j.gen >= gen).then(() => d);
  }
  focus(level, wave = null) { this.send({ cmd: 'focus', level, wave }); }
  caps(focus, other) { this.send({ cmd: 'cap', focus, other }); }
  seed(level, wave, gardens) { this.send({ cmd: 'seed', level, wave, gardens }); }
  until(pred) { return new Promise((ok) => { const f = (j) => { if (pred(j)) { this.listeners.delete(f); ok(j); } }; this.listeners.add(f); }); }
  ask(cmd, body) { const id = ++this.asked; const got = new Promise((ok) => this.waiting.set(id, ok)); this.send({ cmd, id, ...body }); return got; }
  explain(level, wave, garden) { return this.ask('explain', { level, wave, garden }); }
  verify(level, wave, garden, seeds) { return this.ask('verify', { level, wave, garden, seeds }); }
  report(level, wave) { return this.waves.get(`${level}:${wave}`); }
  // the reports of every wave of a level on the current game (none stale)
  level(level) { return [...this.waves.values()].filter((r) => r.level === level && r.gen === this.gen).sort((a, b) => a.wave - b.wave); }
  stop() { this.p.kill(); }
}
export const sleep = (ms) => new Promise((ok) => setTimeout(ok, ms));
// the dew shares of the families over the first k gardens of a report
export function pickOf(r, k = 5) { const pick = {}, top = (r.top || []).slice(0, k); for (const g of top) for (const [f, x] of Object.entries(g.mix)) pick[f] = (pick[f] || 0) + x / top.length; return pick; }
export const INF = 30;
