// Tall against wide on the cells of the kept perfect party: node balance/tall.mjs [--levels 1,4,8] [--n 6,10,14,20]
// wide: the kept party of the level (balance/perfect/L<n>.json) as it is. For every N:
//   tall N        the first N plants of it, then grown round robin to the top (rose → a, chili → b, mint → b,
//                 pumpkin → a, flytrap → a); the bot plants nothing of its own (maxPlants N)
//   maze+tall N   every cell of the wide party taken (the same maze), all but N shooters a pumpkin of level 1, the N
//                 shooters grown to the top
//   maze+flat N   the same maze and N shooters, nothing grown (no upgrades of the bot's own either)
// The margins of balance/scan.mjs (the grid of health, eight seeds): won and clean (the fruit never bitten); ×0.00 —
// it loses even against bugs half as healthy. Beside them, one party at the health as it is (seed 7): plants, grown,
// at the top, the dew in all and the dew left at the end, to tell a garden short of dew from a weak one.
// Caveats (docs/rebalance-tall.md, 2.2): the first N plants of the wide party stand where planting first was handy,
// not where growing is best; a search with a cap on the shooters says more.
import { LEVELS } from '../public/data.js';
import { exportData } from '../sim/js/export.mjs';
import { play, build } from '../sim/js/play.mjs';
import { scan } from './scan.mjs';
import { kept, partyOf } from './perfect.mjs';

const args = process.argv.slice(2), opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const levels = opt('--levels', '1,4,8').split(',').map((x) => Number(x) - 1), NS = opt('--n', '6,10,14,20').split(',').map(Number);
const BR = { rose: 1, pepper: 2, mint: 2, pumpkin: 1, flytrap: 1 };
const grow = (cells) => { const out = []; for (let r = 0; r < 3; r++) for (const [kind, i, j] of cells) out.push(r === 1 ? ['up', i, j, BR[kind]] : ['up', i, j]); return out; };
const tasks = [];
for (const n of levels) {
  const k = kept(n); if (!k) continue;
  const base = partyOf(n, k, 'exp3'), placed = [];
  for (const s of k.plan) if (s[0] !== 'up' && !placed.some((p) => p[1] === s[1] && p[2] === s[2])) placed.push(s);
  tasks.push({ n, who: `wide (${placed.length} plants)`, level: n, opts: base });
  for (const N of NS) {
    const cells = placed.slice(0, N);
    tasks.push({ n, who: `tall ${N}`, level: n, opts: { ...base, plan: [...cells, ...grow(cells)], maxPlants: N } });
    const shooters = placed.filter((p) => p[0] !== 'pumpkin').slice(0, N), maze = placed.map((p) => (shooters.includes(p) ? p : ['pumpkin', p[1], p[2]]));
    tasks.push({ n, who: `maze+tall ${N}`, level: n, opts: { ...base, plan: [...maze, ...grow(shooters)], maxPlants: placed.length } });
    tasks.push({ n, who: `maze+flat ${N}`, level: n, opts: { ...base, plan: maze, maxPlants: placed.length, upgrades: 'none' } });
  }
}
const won = scan(tasks, { what: 'won', from: -14, to: 14, quiet: true }), clean = scan(tasks, { from: -14, to: 14, quiet: true });
const one = play(tasks.map((t) => ({ level: t.level, opts: { ...t.opts, seed: 7 } })), { bin: build(), data: exportData() });
let last = -1;
tasks.forEach((t, q) => {
  if (t.n !== last) { console.log(`L${t.n + 1} ${LEVELS[t.n].name}`); last = t.n; }
  const r = one[q].res, eco = r ? `plants ${r.plants}, grown ${r.grown}, top ${r.maxed}, dew in ${Math.round(LEVELS[t.n].dew + r.income)}, left ${Math.round(r.dew)}` : one[q].err;
  console.log(`  ${t.who.padEnd(18)} won ×${won[q].margin.toFixed(2)}${won[q].open ? '+' : ''}  clean ×${clean[q].margin.toFixed(2)}   ${eco}`);
});
