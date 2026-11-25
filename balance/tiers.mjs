// What every tier of a shooter gives for its dew: node balance/tiers.mjs [--prices FILE] [--lambda 1,1.1,1.2]
// A rough damage a second against a crowd of three walkers next to the plant (single-target plants hit one, `multi`
// as many as they have; a hunter's mark counted as +mark of its own damage), the dew spent on the plant in all, and
// what the last step bought per dew. Burns do not stack (ignite in public/game.js: a weaker one does nothing, an equal
// one only lasts longer) and every chili throws again before its burn is out (rate × burnT > 1), so a burn adds at
// most `burn` a second to a bug. The cold mint, the far-shot rose, flytraps and pumpkins are not measured by this:
// they need the simulation.
// --prices FILE (JSON: { rose: { cost, up: [l2], a: [l3, l4], b: [l3, l4] }, ... }): with those prices, the damage
// every tier needs for its dew per damage to be lambda (one per level 2, 3, 4) times that of level 1, against what it
// has now, and the factor its damage has to grow by. Without a file: the prices of docs/rebalance-tall.md (4.A.1–2).
import { readFileSync } from 'node:fs';
import { PLANTS, statOf, upCost } from '../public/data.js';

const args = process.argv.slice(2), opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
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

const lambda = opt('--lambda', '1,1.1,1.2').split(',').map(Number), L = { 2: lambda[0], 3: lambda[1], 4: lambda[2] };
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
