// The economy of the kept perfect party of every level: node balance/econ.mjs [--seed 7]
// The dew of the level (at the start and earned), the dew left at the end, how many plants, grown, at the top.
import { LEVELS } from '../public/data.js';
import { exportData } from '../sim/js/export.mjs';
import { play, build } from '../sim/js/play.mjs';
import { kept, partyOf } from './perfect.mjs';

const args = process.argv.slice(2), opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const seed = Number(opt('--seed', 7)), ns = LEVELS.map((_, n) => n).filter((n) => kept(n));
const res = play(ns.map((n) => ({ level: n, opts: { ...partyOf(n, kept(n), 'exp3'), seed } })), { bin: build(), data: exportData() });
res.forEach((x, q) => { const n = ns[q], r = x.res; if (!r) return console.log(`L${n + 1}: ${x.err}`);
  console.log(`L${n + 1} ${LEVELS[n].name.padEnd(16)} dew ${LEVELS[n].dew} + ${Math.round(r.income)} earned, ${Math.round(r.dew)} left | plants ${r.plants}, grown ${r.grown}, at the top ${r.maxed} | ${r.won ? 'won' : `lost at wave ${r.wave}`}`); });
