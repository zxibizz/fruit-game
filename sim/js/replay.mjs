// Replays parties played by the native bot (fruit-sim run with record; sim/js/verify.mjs writes them down) with
// public/game.js alone: the hash after every step must be the one written down. Also the time of the JS simulation
// by itself, to compare with the native one (fruit-sim replay).
//   node sim/js/replay.mjs <file ...> [--no-check] [--check-only] [--repeat N] [--dump-at K]
// --check-only: no timing run; --dump-at: prints the state after op K
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import * as D from '../../public/data.js';
import { createGame, step, place, upgrade, startWave, removePlant, usePower } from '../../public/game.js';
import { hash, dump } from './hash.mjs';

const args = process.argv.slice(2), opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const VALUED = new Set(['--repeat', '--dump-at']), files = args.filter((a, k) => !a.startsWith('--') && !VALUED.has(args[k - 1]));
const check = !args.includes('--no-check'), timed = !args.includes('--check-only'), repeat = Number(opt('--repeat', 1)), dumpAt = opt('--dump-at') != null ? Number(opt('--dump-at')) : -1;
// the data of the party goes over data.js: the same objects the game reads
function load(data) {
  for (const k of ['PLANTS', 'BUGS', 'PERKS']) for (const name of Object.keys(D[k])) D[k][name] = data[k][name];
  D.TUNE.hpGrowth = data.C.hpGrowth;
  data.LEVELS.forEach((L, n) => Object.assign(D.LEVELS[n], { dew: L.dew, pay: L.pay, count: L.count, plants: L.plants, obstacles: L.obstacles, tiles: L.tiles, entries: L.entries, fruit: L.fruit, waves: L.waves, payAt: L.payAt }));
}
const DT = 1 / 30;
function run(tr, checking) {
  const g = createGame(tr.level, tr.seed, tr.meta);
  for (let k = 0; k < tr.ops.length; k++) {
    const op = tr.ops[k];
    switch (op[0]) {
      case 's': step(g, DT); if (checking && hash(g) !== op[1]) return k; break;
      case 'place': place(g, op[1], op[2], op[3]); break;
      case 'up': upgrade(g, g.grid[op[2]][op[1]]); break;
      case 'wave': startWave(g); break;
      case 'sell': removePlant(g, g.grid[op[2]][op[1]]); break;
      case 'power': usePower(g, op[1]); break;
      case 'dew': g.dew = op[1]; break;
      default: throw new Error(`unknown op ${op[0]}`);
    }
    g.events.length = 0;
    if (k === dumpAt) { console.log(dump(g)); process.exit(0); }
  }
  return -1;
}
let bad = 0, total = 0;
for (const f of files) {
  const tr = JSON.parse(readFileSync(f, 'utf8'));
  for (const k of ['data', 'ops']) if (typeof tr[k] === 'string') tr[k] = JSON.parse(readFileSync(join(dirname(f), tr[k]), 'utf8')); // files beside the party
  load(tr.data);
  // the pay of a wave is counted from the level's recipe; the party has it counted already, and it must agree
  tr.data.LEVELS[tr.level].payAt.forEach((v, k) => { if (D.wavePay(D.LEVELS[tr.level], k + 1) !== v) throw new Error(`${f}: pay of wave ${k + 1}`); });
  const at = run(tr, check); let ms = 0;
  if (at >= 0) { bad++; console.log(`${tr.name}: MISMATCH at op ${at}`); continue; }
  if (!timed) continue;
  const t = performance.now(); for (let n = 0; n < repeat; n++) run(tr, false); ms = (performance.now() - t) / repeat; total += ms;
  console.log(`${tr.name}: ok, ${tr.ops.length} ops, ${ms.toFixed(1)} ms`);
}
if (timed) console.log(`js total ${total.toFixed(1)} ms over ${files.length} parties${bad ? `, ${bad} MISMATCHED` : ''}`);
process.exit(bad ? 1 : 0);
