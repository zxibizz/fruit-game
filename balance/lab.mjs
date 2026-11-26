// The plant lab: node balance/lab.mjs [--wave 14] [--dew 4000] [--weight 100] [--level 8] [--set K=V,...]
//   [--plants rose,rose.a,pepper.b] [--base pepper.b] [--mix mint.a,rose.a] [--bugs ant,snail] [--no-mix]
// What each plant is for, measured apart from the levels: a fixed maze of pumpkins, beside its trail a garden of one
// kind of plant bought for --dew (on the free cells beside the trail from the fruit end, grown level by level), and one pack of one kind of bug
// with the health of --wave and of --weight (as in the wave budgets). A kind is a plant (grown to level 2) or a plant
// and its branch, 'rose.a' (grown to level 4). The number is the share of the pack's health the garden takes, in
// percent: 100 is a pack killed to the last bug. Supports (marks, cold, flytraps, pumpkins) are also measured as a fifth
// of the dew of a --base garden: the number there is that garden over an all-base one.
import { applyOverrides } from './scenario.mjs';
import { makeLab } from './labcore.mjs';

const args = process.argv.slice(2), opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const wave = Number(opt('--wave', 14)), dew = Number(opt('--dew', 4000)), level = Number(opt('--level', 8)) - 1, WEIGHT = Number(opt('--weight', 100));
const num = (v) => (Number.isNaN(Number(v)) ? v : Number(v));
applyOverrides(Object.fromEntries((opt('--set', '') || '').split(',').filter(Boolean).map((kv) => { const [k, v] = kv.split('='); return [k.trim(), num(v.trim())]; })));
const { garden, dealt, trailOf } = makeLab({ level, wave, dew, weight: WEIGHT });
const bugs = (opt('--bugs') || 'ant,aphid,grasshopper,beetle,pillbug,caterpillar,snail,cricket,butterfly,wasp').split(',');
const pad = (s, n = 8) => String(s).padEnd(n), row = (name, f) => console.log(pad(name, 16) + bugs.map((k) => pad(f(k))).join(''));
console.log(`wave ${wave}, ${dew} dew, a pack of weight ${WEIGHT}, level ${level + 1}: the share of the pack's health a garden takes, %`);
console.log(pad('', 16) + bugs.map((k) => pad(k.slice(0, 7))).join(''));
const solo = (opt('--plants') || 'rose,pepper,mint,flytrap,rose.a,rose.b,pepper.a,pepper.b,mint.a,mint.b,flytrap.a,flytrap.b').split(','), pc = (mix, b) => Math.round(dealt(mix, b).share * 100);
for (const k of solo) row(k, (b) => pc([[k, 1]], b));
if (!args.includes('--no-mix')) {
  const base = opt('--base', 'pepper.b');
  console.log(`a fifth of a ${base} garden given to it:`);
  for (const k of (opt('--mix') || 'rose.a,mint.a,mint.b,flytrap.a,pumpkin.a,pumpkin.b').split(',')) row(`${base} + ${k}`, (b) => pc([[base, .8], [k, .2]], b));
}
if (args.includes('--debug')) { const [k, b, w] = opt('--debug').split(':'), g = garden([[k, 1]]); const c = {}; for (const p of g.plants) c[p.type + p.lvl] = (c[p.type + p.lvl] || 0) + 1;
  console.log(c, 'trail', trailOf(g).length, [.5, 1, 2, 4].map((m) => `${w * m}: ${dealt([[k, 1]], b, w * m).share.toFixed(2)}`).join('  ')); }
