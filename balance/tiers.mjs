// What every tier of a shooter gives for its dew: node balance/tiers.mjs [--prices FILE] [--lambda 1.1,1.2,1.3] [--set K=V,...]
// A rough damage a second against a crowd of three walkers next to the plant (single-target plants hit one, `multi`
// as many as they have; a hunter's mark counted as +mark of its own damage), the dew spent on the plant in all, and
// what the last step bought per dew. Burns do not stack (ignite in public/game.js: a weaker one does nothing, an equal
// one only lasts longer) and every chili throws again before its burn is out (rate × burnT > 1), so a burn adds at
// most `burn` a second to a bug. The cold mint, the far-shot rose, flytraps and pumpkins are not measured by this:
// they need the simulation.
// --prices FILE (JSON: { rose: { cost, up: [l2], a: [l3, l4], b: [l3, l4] }, ... }): with those prices, the damage
// every tier needs for its dew per damage to be lambda (one per level 2, 3, 4) times that of level 1, against what it
// has now, and the factor its damage has to grow by (the default lambda: tall 10–15% ahead, docs/rebalance-tall.md). Without a file: the prices of docs/rebalance-tall.md (4.A.1–2).
// --sim [--dew 1200] [--wave 14] [--level 9] [--bugs ant,aphid,...]: the same asked of the game itself (criterion 6 of
// docs/rebalance-tall.md, step 1b): in the plant lab (balance/labcore.mjs: a fixed maze of pumpkins, a garden bought for
// the dew along its trail from the fruit end, on the free cells and in the pumpkins' places — every plant is a wall —,
// a pack of one kind of bug too big for it), a garden of every tier against
// a garden of the same plant left at level 1, for the same dew — many cheap plants along the trail against a few grown
// ones, coverage, overkill and armor counted. The number is the share of the pack's health the tier's garden takes per
// dew it spent, over the same of the level-1 garden (1.00: as good for the dew; the owner wants a grown garden
// 10–15% ahead); beside the bug, the share the level-1 garden takes (%), and the dew each garden spent.
import { readFileSync } from 'node:fs';
import { PLANTS, statOf, upCost } from '../public/data.js';
import { makeLab } from './labcore.mjs';
import { applyOverrides } from './scenario.mjs';

const args = process.argv.slice(2), opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const num = (v) => (Number.isNaN(Number(v)) ? v : Number(v));
// --set PLANTS.rose.cost=40,PLANTS.rose.a.dmg.1=20: other numbers, for both tables (as balance/run.mjs --set takes them)
applyOverrides(Object.fromEntries((opt('--set', '') || '').split(',').filter(Boolean).map((kv) => { const [k, v] = kv.split('='); return [k.trim(), num(v.trim())]; })));
const SHOOTERS = ['rose', 'pepper', 'mint'];
const s = (P, n, l, b) => statOf(P, n, l, b) ?? 0;
export function dps(k, l, b) {
  const P = PLANTS[k], rate = s(P, 'rate', l, b), dmg = s(P, 'dmg', l, b);
  if (k === 'pepper') { const burn = s(P, 'burn', l, b) * Math.min(1, rate * s(P, 'burnT', l, b)); return (rate * dmg + burn) * (s(P, 'blaze', l, b) ? 3 : Math.min(3, s(P, 'hits', l, b))); }
  if (k === 'rose') return rate * dmg * Math.min(s(P, 'multi', l, b) || 1, 3) * (b === 'a' ? 1 + s(P, 'mark', l, b) : 1) * (b === 'b' ? s(P, 'ground', l, b) : 1);
  if (k === 'mint') return s(P, 'slow', l, b) ? NaN : rate * dmg;
  return NaN;
}
const tiers = (k) => [[1, null], [2, null], [3, 'a'], [4, 'a'], [3, 'b'], [4, 'b']].filter(([, b]) => !b || PLANTS[k][b]);
const name = (k, l, b) => `${k}${b ? '.' + b : ''}${l}`;
const f = (x, n = 3) => (Number.isFinite(x) ? x.toFixed(n) : '-');

console.log('tier          dew   dps     dps/dew  last step: dew → +dps (per dew)   range  hp');
for (const k of SHOOTERS) {
  const P = PLANTS[k];
  for (const [l, b] of tiers(k)) {
    let total = P.cost; for (let x = 1; x < l; x++) total += upCost(P, x, b || 'a');
    const step = l === 1 ? P.cost : upCost(P, l - 1, b), prev = l === 1 ? 0 : l === 3 ? dps(k, 2, null) : dps(k, l - 1, b), d = dps(k, l, b);
    console.log(`${name(k, l, b).padEnd(12)}${String(total).padStart(5)}  ${f(d, 1).padStart(6)}  ${f(d / total).padStart(7)}  ${String(step).padStart(4)} → +${f(d - prev, 1)} (${f((d - prev) / step)})`.padEnd(70) + `${s(P, 'range', l, b)}`.padEnd(7) + s(P, 'hp', l, b));
  }
}

const lambda = opt('--lambda', '1.1,1.2,1.3').split(',').map(Number), L = { 2: lambda[0], 3: lambda[1], 4: lambda[2] };
const prices = opt('--prices') ? JSON.parse(readFileSync(opt('--prices'), 'utf8')) : {
  rose: { cost: 40, up: [40], a: [90, 150], b: [90, 150] }, pepper: { cost: 55, up: [55], a: [120, 190], b: [120, 190] }, mint: { cost: 50, up: [50], a: [100, 160], b: [100, 160] },
};
console.log(`\nwith the prices ${opt('--prices') || 'of docs/rebalance-tall.md'}, lambda ${lambda.join(' / ')}: the damage a tier needs, what it has, the factor`);
for (const [k, N] of Object.entries(prices)) {
  if (!SHOOTERS.includes(k)) continue;
  const base = dps(k, 1, null) / N.cost;
  console.log(`${k}: level 1 for ${N.cost} → ${f(base)} dps/dew (now ${f(dps(k, 1, null) / PLANTS[k].cost)})`);
  for (const b of [null, 'a', 'b']) for (const l of b ? [3, 4] : [2]) {
    if (b && !PLANTS[k][b]) continue;
    const total = N.cost + N.up[0] + (l >= 3 ? N[b][0] : 0) + (l >= 4 ? N[b][1] : 0), need = total * base * L[l], has = dps(k, l, b);
    console.log(`  ${name(k, l, b).padEnd(10)} dew ${String(total).padStart(4)}: needs ${f(need, 1)}, has ${f(has, 1)} → ×${f(need / has, 2)}`);
  }
}

if (args.includes('--sim')) {
  const dew = Number(opt('--dew', 1200)), wave = Number(opt('--wave', 14)), level = Number(opt('--level', 9)) - 1;
  const bugs = opt('--bugs', 'ant,aphid,grasshopper,beetle,pillbug,snail,butterfly,wasp').split(',');
  const lab = makeLab({ level, wave, dew, weight: 100 * dew / 1000, walls: true, best: true });
  const kinds = (k) => [`${k}:1`, k, ...['a', 'b'].filter((b) => PLANTS[k][b]).flatMap((b) => [`${k}.${b}3`, `${k}.${b}`])];
  console.log(`\nthe lab (level ${level + 1}, wave ${wave}, ${dew} dew, a pack of weight ${100 * dew / 1000}): the share of the pack a tier's garden takes per dew, over the level-1 garden's`);
  console.log(''.padEnd(12) + bugs.map((b) => b.slice(0, 7).padEnd(8)).join('') + 'dew spent, plants');
  for (const k of [...SHOOTERS, ...(opt('--more') ? opt('--more').split(',') : [])]) {
    const one = Object.fromEntries(bugs.map((b) => [b, lab.dealt([[`${k}:1`, 1]], b)]));
    console.log(`${(k + ':1').padEnd(12)}` + bugs.map((b) => `${Math.round(one[b].share * 100)}%`.padEnd(8)).join('') + `${Math.round(one[bugs[0]].spent)}, ${one[bugs[0]].plants}`);
    for (const t of kinds(k).slice(1)) {
      const r = Object.fromEntries(bugs.map((b) => [b, lab.dealt([[t, 1]], b)]));
      const q = (b) => (one[b].share > 0 ? (r[b].share / r[b].spent) / (one[b].share / one[b].spent) : NaN);
      console.log(`  ${t.padEnd(10)}` + bugs.map((b) => `${f(q(b), 2)}${r[b].share > .97 ? '+' : ''}`.padEnd(8)).join('') + `${Math.round(r[bugs[0]].spent)}, ${r[bugs[0]].plants}`);
    }
  }
}
