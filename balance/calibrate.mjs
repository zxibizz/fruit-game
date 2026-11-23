// The bot's trust in its own count: node balance/calibrate.mjs [--levels 3-14] [--hp 1.3] [--rounds 2] [--jobs 3]
// The smart bot values a garden by a formula (sim/src/bot.rs study, term): the damage of every plant against the
// time a bug spends by it. For a plant or a branch the formula has no exact answer to (thorns, a slow on a hit, the
// nectar, a ward…) it may be far off, and then the bot plants the wrong things: a garden of one plant did better than
// its mix. The trust is a factor on its count for every plant and branch, fitted here on parties: the smart bot plays
// the levels with every bug --hp times healthier (so that it plays at the edge, where a better garden shows), on three
// seeds; a party scores 1 and the fruit left when won, the share of the waves got through when lost; one trust at a
// time is tried at a few factors and the best kept (coordinate descent), round after round. Writes balance/trust.json.
import { writeFileSync, existsSync, readFileSync } from 'node:fs';
import { setPriority } from 'node:os';
import { LEVELS, PLANTS } from '../public/data.js';
import { play } from '../sim/js/play.mjs';
import { exportData } from '../sim/js/export.mjs';
import { applyOverrides, resolve } from './scenario.mjs';

const args = process.argv.slice(2), opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const range = (s) => s.split(',').flatMap((p) => { const [a, b] = p.split('-').map(Number); return b ? Array.from({ length: b - a + 1 }, (_, k) => a + k) : [a]; });
const levels = range(opt('--levels', `3-${LEVELS.length}`)).map((n) => n - 1), H = Number(opt('--hp', 1.3)), ROUNDS = Number(opt('--rounds', 2)), jobs = Number(opt('--jobs', 3));
try { setPriority(19); } catch { /* as it is */ }
const FILE = new URL('./trust.json', import.meta.url);
const kinds = Object.keys(PLANTS), trust = existsSync(FILE) ? JSON.parse(readFileSync(FILE, 'utf8')) : Object.fromEntries(kinds.map((k) => [k, [1, 1, 1]]));
applyOverrides(Object.fromEntries(levels.map((n) => [`L${n + 1}.hp`, LEVELS[n].hp * H])));
const data = exportData(), SMART = { route: 1, place: 'best', upgrades: 'greedy', meta: 'exp2', terrain: true, powers: true, early: true };
const tasks = levels.flatMap((n) => [7, 8, 9].map((seed) => ({ level: n, opts: resolve({ level: n, opts: { ...SMART, seed } }) })));
const score = (t) => { const flat = kinds.flatMap((k) => t[k]);
  const rs = play(tasks.map((x) => ({ ...x, opts: { ...x.opts, trust: flat } })), { jobs, data });
  return rs.reduce((s, x) => s + (x.err ? 0 : x.res.won ? 1 + x.res.hp / x.res.maxHp : (x.res.wave - 1) / x.res.waves), 0) / rs.length; };
let best = score(trust); console.log(`start ${best.toFixed(4)}`, JSON.stringify(trust));
const FACTORS = [.5, .7, 1.4, 2];
for (let r = 0; r < ROUNDS; r++) {
  for (const k of kinds) for (let b = 0; b < 3; b++) {
    let keep = trust[k][b];
    for (const f of FACTORS) {
      const t = structuredClone(trust); t[k][b] = Math.round(keep * f * 100) / 100;
      const s = score(t); if (s > best + 1e-4) { best = s; trust[k][b] = t[k][b]; console.log(`  ${k}${b ? '.' + 'ab'[b - 1] : ''} ×${f} → ${trust[k][b]}: ${s.toFixed(4)}`); }
    }
    keep = trust[k][b];
  }
  console.log(`round ${r + 1}: ${best.toFixed(4)}`, JSON.stringify(trust));
  writeFileSync(FILE, JSON.stringify(trust, null, 1) + '\n');
}
