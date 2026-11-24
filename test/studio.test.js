import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import { build } from '../sim/js/play.mjs';

// The balance studio's engine (sim/src/studio.rs, driven by balance/studio.mjs): what it reports of a wave is a garden
// a player could have standing then — within the dew, every wall of its maze planted, nothing on the trail — and new
// data has everything found played again on it.
const data = (set = {}) => JSON.parse(execFileSync(process.execPath, [fileURLToPath(new URL('../balance/studio-data.mjs', import.meta.url))], { input: JSON.stringify({ set, meta: 'exp2' }), maxBuffer: 1 << 28 }));

test('the studio finds gardens within the dew of a wave and plays them again on new data', { timeout: 60000 }, async () => {
  const bin = build(), p = spawn(bin, ['studio', '--jobs', '2']), say = (o) => p.stdin.write(JSON.stringify(o) + '\n');
  const L = 1, W = 6; // «Поляна»: a meadow to build a maze on and a path around it
  try {
    let d = data(); assert.deepEqual(d.errors, []);
    say({ cmd: 'data', data: d.data, meta: d.meta, tol: 0 }); say({ cmd: 'cap', focus: 400, other: 0 }); say({ cmd: 'focus', level: L, wave: W });
    const lines = createInterface({ input: p.stdout });
    const wait = (pred) => new Promise((ok) => { const on = (s) => { const j = JSON.parse(s); if (pred(j)) { lines.off('line', on); ok(j); } }; lines.on('line', on); });
    const r = await wait((j) => j.t === 'wave' && j.level === L && j.wave === W && j.tried >= 150 && j.top.length >= 3);
    const { PLANTS } = await import('../public/data.js');
    const cost = (k, t) => { const P = PLANTS[k], u = [P.up[0], P.a.up[0], P.a.up[1], P.b.up[0], P.b.up[1]]; return P.cost + [0, u[0], u[0] + u[1], u[0] + u[1] + u[2], u[0] + u[3], u[0] + u[3] + u[4]][t]; };
    assert.ok(r.top[0].m > 0.5, `the best garden holds the wave nearly (${r.top[0].m})`); // (one plant alone may hold nothing: a flytrap eats only the worn)
    for (const g of [...r.top, ...Object.values(r.mono)]) {
      const spent = g.cells.reduce((s, [, k, t]) => s + cost(k, t), 0);
      assert.equal(spent, g.cost); assert.ok(spent <= r.budget, `${spent} dew of ${r.budget}`);
      const at = new Set(g.cells.map((c) => c[0]));
      for (const w of g.walls) assert.ok(at.has(w), `wall cell ${w} planted`);
      for (const c of g.trail) assert.ok(!at.has(c), `nothing on the trail (${c})`);
    }
    for (const [k, g] of Object.entries(r.mono)) assert.ok(g.cells.every((c) => c[1] === k), `the garden of ${k} alone`);
    // new data: the elites are played again on it (none stale once they are)
    d = data({ 'PLANTS.rose.dmg': [4, 5] });
    say({ cmd: 'data', data: d.data, meta: d.meta, tol: 0 });
    const r2 = await wait((j) => j.t === 'wave' && j.level === L && j.wave === W && j.gen === 2 && j.stale === 0);
    assert.ok(r2.top.length >= 3);
  } finally { p.kill(); }
});
