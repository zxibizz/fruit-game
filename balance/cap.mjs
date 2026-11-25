// The smart bot with a cap on its plants: node balance/cap.mjs [--levels 1,4,8] [--caps 6,10,14,20,30,0]
// How much a garden made to grow tall (at most so many plants, pumpkins counted; 0: no cap) loses, with no perks and
// with those of three stars a level. Margins of balance/scan.mjs, won and clean. The bot's own growing is not the best
// there is (it is weak in 0.31: no cap, it wins «Развилка» only against bugs ×0.82), so this is a lower bound.
import { LEVELS } from '../public/data.js';
import { resolve } from './scenario.mjs';
import { scan } from './scan.mjs';

const args = process.argv.slice(2), opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const SMART = { route: 1, place: 'best', upgrades: 'greedy', terrain: true, powers: true, early: true };
const levels = opt('--levels', '1,4,8').split(',').map((x) => Number(x) - 1), caps = opt('--caps', '6,10,14,20,30,0').split(',').map(Number), tasks = [];
for (const n of levels) for (const meta of ['none', 'exp3']) for (const c of caps) tasks.push({ n, c, meta, level: n, opts: { ...resolve({ level: n, opts: { ...SMART, meta } }), ...(c ? { maxPlants: c } : {}) } });
const won = scan(tasks, { what: 'won', from: -14, to: 14, quiet: true }), clean = scan(tasks, { from: -14, to: 14, quiet: true });
for (const n of levels) for (const meta of ['none', 'exp3']) console.log(`L${n + 1} ${LEVELS[n].name}, perks ${meta}: ` + caps.map((c) => { const q = tasks.findIndex((t) => t.n === n && t.c === c && t.meta === meta); return `${c || '∞'}: won ×${won[q].margin.toFixed(2)} clean ×${clean[q].margin.toFixed(2)}`; }).join(' | '));
