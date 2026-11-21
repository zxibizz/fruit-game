// The plant lab: node balance/lab.mjs [--wave 14] [--dew 4000] [--weight 100] [--level 8] [--set K=V,...]
//   [--plants rose,corn] [--mix rose,mint] [--bugs ant,snail] [--no-mix]
// What each plant is for, measured apart from the levels: a fixed maze of pumpkins, beside its trail a garden of one
// kind of plant bought for --dew (planted from the fruit end, grown level by level), and one pack of one kind of bug
// with the health of --wave and of --weight (as in the wave budgets). The number is the share of the pack's health
// the garden takes, in percent: 100 is a pack killed to the last bug. Supports (rose marks, mint, bell, flytrap, aloe) are also
// measured as a fifth of the dew of a corn garden: the number there is that garden over an all-corn one.
import { LEVELS, BUGS, PLANTS, PLANT_ORDER, TUNE } from '../public/data.js';
import { createGame, step, place, upgrade, upgradeCost, startWave, placeProblem, bugHp, COLS, ROWS } from '../public/game.js';
import { layout, trailOf } from '../test/bot.mjs';
import { applyOverrides } from './scenario.mjs';

const args = process.argv.slice(2), opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const wave = Number(opt('--wave', 14)), dew = Number(opt('--dew', 4000)), level = Number(opt('--level', 8)) - 1, WEIGHT = Number(opt('--weight', 100));
const num = (v) => (Number.isNaN(Number(v)) ? v : Number(v));
applyOverrides(Object.fromEntries((opt('--set', '') || '').split(',').filter(Boolean).map((kv) => { const [k, v] = kv.split('='); return [k.trim(), num(v.trim())]; })));
const walls = layout(level, true), within = (dx, dy, r) => dx * dx + dy * dy <= r * r + 1e-9;

// a garden: [[kind, share of the dew]], each kind planted in turn along the trail from the fruit end, then grown
function garden(mix) {
  const g = createGame(level, 7, {}); g.dew = 1e9;
  for (const [col, gap] of walls) for (let j = 0; j < ROWS; j++) if (j !== gap && !g.grid[j][col] && !placeProblem(g, col, j)) place(g, 'pumpkin', col, j);
  const tr = trailOf(g), on = new Set(tr.map(([i, j]) => i + ',' + j)), cells = [];
  for (let i = 0; i < COLS; i++) for (let j = 0; j < ROWS; j++) {
    if (on.has(i + ',' + j) || placeProblem(g, i, j)) continue; const at = g.grid[j][i];
    if (at && at.type !== 'pumpkin') continue; // rocks and the like
    let near = -1; tr.forEach(([a, b], k) => { if (within(a - i, b - j, 1.5)) near = k; }); if (near >= 0) cells.push([i, j, near]);
  }
  cells.sort((a, b) => b[2] - a[2]);
  const left = Object.fromEntries(mix.map(([k, s]) => [k, dew * s])), mine = Object.fromEntries(mix.map(([k]) => [k, []]));
  // as many plants of a kind as its dew grows to the full (one at least), the kinds standing mixed along the trail
  const full = (k) => PLANTS[k].cost + PLANTS[k].up[0] + PLANTS[k].up[1], want = mix.map(([k, s]) => [k, Math.max(1, Math.round(dew * s / full(k)))]);
  const total = want.reduce((t, [, n]) => t + n, 0), deal = [];
  for (const [k, n] of want) for (let q = 0; q < n; q++) deal.push([(q + .5) / n, k]);
  deal.sort((a, b) => a[0] - b[0]);
  cells.slice(0, total).forEach(([i, j], q) => {
    const k = deal[q][1]; if (left[k] < PLANTS[k].cost) return;
    const old = g.grid[j][i]; if (old) { const p = g.plants.find((x) => x.i === i && x.j === j); g.plants.splice(g.plants.indexOf(p), 1); g.grid[j][i] = null; }
    if (place(g, k, i, j)) { left[k] -= PLANTS[k].cost; mine[k].push(g.plants[g.plants.length - 1]); } else if (old) { g.grid[j][i] = null; place(g, 'pumpkin', i, j); }
  });
  for (const [k] of mix) for (let lvl = 1; lvl < 3; lvl++) for (const p of mine[k]) { const c = upgradeCost(p); if (p.lvl === lvl && c != null && left[k] >= c) { upgrade(g, p); left[k] -= c; } }
  return g;
}
// the health a garden takes off a pack too big for it (--weight, as in the wave budgets), in thousands
function dealt(mix, kind, weight = WEIGHT) {
  const g = garden(mix), B = BUGS[kind], count = Math.max(1, Math.round(weight / B.w));
  g.wave = wave - 1; startWave(g);
  const gap = Math.max(.05, Math.round(Math.min(2.6, Math.max(.4, 14 / count)) * TUNE.gap * 20) / 20);
  g.queue = Array.from({ length: count }, (_, n) => ({ kind, at: n * gap, e: 0 })); g.hp = g.maxHp = 1e9;
  let left = 0; const full = count * bugHp(g, kind, wave);
  const seen = new Map(); // a bug that bites is gone with no health: what it had a step before is what got through
  for (let n = 0; n < 30 * 600 && (g.queue.length || g.bugs.length); n++) {
    for (const q of g.bugs) seen.set(q.id, q.hp);
    step(g, 1 / 30); for (const e of g.events) if (e.t === 'bite' && !e.b.brood) left += Math.max(0, seen.get(e.b.id) ?? bugHp(g, kind, wave)); g.events.length = 0;
  }
  for (const q of g.bugs) if (!q.brood) left += Math.max(0, q.hp);
  return { dealt: (full - left) / 1000, share: 1 - left / full };
}
const bugs = (opt('--bugs') || 'ant,aphid,grasshopper,beetle,pillbug,caterpillar,snail,cricket,butterfly,wasp').split(',');
const pad = (s, n = 8) => String(s).padEnd(n), row = (name, f) => console.log(pad(name, 16) + bugs.map((k) => pad(f(k))).join(''));
console.log(`wave ${wave}, ${dew} dew, a pack of weight ${WEIGHT}, level ${level + 1}: the share of the pack's health a garden takes, %`);
console.log(pad('', 16) + bugs.map((k) => pad(k.slice(0, 7))).join(''));
const solo = (opt('--plants') || 'rose,corn,pepper,dandelion,flytrap').split(','), pc = (mix, b) => Math.round(dealt(mix, b).share * 100);
for (const k of solo) row(k, (b) => pc([[k, 1]], b));
if (!args.includes('--no-mix')) {
  console.log('a fifth of a corn garden given to it:');
  for (const k of (opt('--mix') || 'rose,mint,bell,flytrap,pepper,aloe').split(',')) row(`corn + ${k}`, (b) => pc([['corn', .8], [k, .2]], b));
}
if (args.includes('--debug')) { const [k, b, w] = opt('--debug').split(':'), g = garden([[k, 1]]); const c = {}; for (const p of g.plants) c[p.type + p.lvl] = (c[p.type + p.lvl] || 0) + 1;
  console.log(c, 'trail', trailOf(g).length, [.5, 1, 2, 4].map((m) => `${w * m}: ${dealt([[k, 1]], b, w * m).share.toFixed(2)}`).join('  ')); }
