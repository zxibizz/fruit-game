// The shape of a level: how big each of its waves should be for every wave to ask its share of the best garden.
//   node balance/shape.mjs --levels 6,8-9 [--secs 60] [--iters 3] [--out DIR] [--jobs N]
// The studio (sim/src/studio.rs) says how well the best garden of every wave holds it (its margin). Left to the draw,
// the margins of a level are all over the place — the best garden holds one wave eight times over and another barely —
// so one or two waves are all the difficulty of the level. Here every wave but the boss waves and the first two is
// swelled or shrunk (the level's `swell`, public/data.js: a multiplier of the wave's budget) until its margin stands
// in its place over the hardest boss wave of the level (B, the least margin of the boss waves; where the bosses are
// easier than the waves, the middle wave as the first pass found it):
//   a big wave (every fifth)   1.15 B        an ordinary wave   1.3 B        a breather (after a big one)   1.6 B
// The engine keeps what it found from pass to pass (the gardens are played again on the new waves), so each pass
// starts where the last one stood. A wave's margin answers its size a little less than in proportion; the step is
// damped and a pass changes a wave by no more than 1.6 times. What it prints is the line for public/data.js.
// The health of the bugs of the level (hp) is not touched here: balance/campaign.mjs --clean sets it by a whole party.
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { Engine, sleep, INF } from './studio-engine.mjs';

const args = process.argv.slice(2), opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const SECS = Number(opt('--secs', 60)), ITERS = Number(opt('--iters', 3)), dir = opt('--out', join(homedir(), 'tmp', 'balance', 'shape'));
const ranges = (s) => s.split(',').flatMap((p) => { const [a, b] = p.split('-').map(Number); return Array.from({ length: (b || a) - a + 1 }, (_, k) => a + k - 1); });
export const PLACE = { boss: 1, big: 1.15, usual: 1.3, breather: 1.6 };
// a wave is swelled 2.5 times at most and to no more than 220 bugs (a crowd bigger than the game ever had before the
// waves were shaped; a wave that asks for more is left easier than its place, and said so in what is printed)
export const MAX_SWELL = 2.5, MAX_BUGS = 220;
const kindOf = (lv, w) => (lv.boss.some(([at]) => at === w) ? 'boss' : w <= 2 ? 'first' : w % 5 === 0 ? 'big' : w % 5 === 1 ? 'breather' : 'usual');
const fm = (m) => (m >= INF ? '∞' : m.toFixed(2));

const eng = new Engine({ jobs: opt('--jobs') ? Number(opt('--jobs')) : undefined });
mkdirSync(dir, { recursive: true });
for (const L of ranges(opt('--levels', '6'))) {
  let d = await eng.load({}); const lv = d.ui.levels[L], n = lv.waves.length;
  let swell = (lv.swell || Array(n).fill(1)).slice(); const set = {};
  let prof = null, B = null, mid = null;
  for (let it = 0; it <= ITERS; it++) {
    eng.caps(1e9, 0); eng.focus(L, null); await sleep(SECS * 1000);
    const rs = eng.level(L); prof = rs.map((r) => Math.min(INF, r.top[0]?.m ?? 0));
    B = Math.min(...rs.filter((r) => kindOf(lv, r.wave) === 'boss').map((r) => prof[r.wave - 1]));
    // boss waves far easier than the waves around them are no measure of the level (a lone hornet over a grown garden):
    // then the waves themselves are, by the middle one of them
    { const xs = rs.filter((r) => PLACE[kindOf(lv, r.wave)] && kindOf(lv, r.wave) !== 'boss').map((r) => prof[r.wave - 1] / PLACE[kindOf(lv, r.wave)]).sort((a, b) => a - b); if (xs.length && it === 0) mid = xs[xs.length >> 1]; if (mid != null && mid < B) B = mid; }
    const off = rs.map((r) => { const k = kindOf(lv, r.wave); return k === 'boss' || k === 'first' ? 0 : Math.log(prof[r.wave - 1] / (PLACE[k] * B)); });
    process.stderr.write(`L${L + 1} pass ${it}: B ${fm(B)}; off its place by more than a quarter: ${off.filter((x) => Math.abs(x) > Math.log(1.25)).length} of ${n} waves; ${prof.map(fm).join(' ')}\n`);
    if (it === ITERS) break;
    swell = swell.map((s, k) => { const x = off[k]; if (Math.abs(x) < 0.1) return s; const f = Math.max(1 / 1.6, Math.min(1.6, Math.exp(0.8 * x))); return Math.round(Math.max(0.3, Math.min(MAX_SWELL, s * f)) * 20) / 20; });
    // no wave above MAX_BUGS bugs: its swell is cut back to that (the waves are put together again to count them)
    for (let again = 0; again < 20; again++) { const ws = (await eng.load({ set: { ...set, [`L${L + 1}.swell`]: swell } })).ui.levels[L].waves; let any = false;
      ws.forEach((w, k) => { const c = w.reduce((t, g) => t + g[1], 0); if (c > MAX_BUGS && swell[k] > 0.3) { swell[k] = Math.max(0.3, Math.floor(swell[k] * MAX_BUGS / c * 20) / 20); any = true; } }); if (!any) break; }
    set[`L${L + 1}.swell`] = swell; d = await eng.load({ set });
  }
  console.log(`L${L + 1} ${lv.name}: B ${fm(B)}\n    swell: [${swell.join(', ')}],`);
  { const capped = swell.map((x, k) => (x >= MAX_SWELL && prof[k] / B > PLACE[kindOf(lv, k + 1)] * 1.25 ? k + 1 : 0)).filter(Boolean); if (capped.length) console.log(`    at the most a wave may be swelled and still easier than its place: waves ${capped.join(', ')}`); }
  console.log('    ' + prof.map((m, k) => `${k + 1}:${fm(m / B)}${{ boss: 'B', big: '!', breather: '~', first: '', usual: '' }[kindOf(lv, k + 1)]}`).join(' '));
  writeFileSync(join(dir, `L${L + 1}.json`), JSON.stringify({ level: L + 1, swell, B, profile: prof }));
}
eng.stop();
