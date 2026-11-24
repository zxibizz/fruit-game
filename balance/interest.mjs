// How interesting a level is to play well: node balance/interest.mjs [--levels 1-12] [--secs 90] [--out DIR] [--jobs N]
// A level tuned by the health of its bugs alone is hard or easy, not interesting. What makes it interesting is asked of
// its best party (balance/perfect/L<n>.json, found by balance/party.mjs), each answer a number:
//   what it is made of      the dew spent on every plant and branch of the garden it ends with;
//   what it cannot do without   the best party found with a plant or a branch taken out of the game (the party kept
//       played without it; where that costs more than a rung, a search from it for --secs), against the best with
//       everything: a branch that costs nothing to lose is not needed on the level, one that costs a third and more is
//       the only way to play it, and the ones between are choices;
//   whether the dew is short    the same with a fifth less dew (at the start and for every wave): where that costs
//       little there is more dew than a garden can use, and nothing to choose between;
//   what the waves ask      the share of the level's bugs (by their weight) that are a crowd, armored, thick, fast,
//       flyers, eaters of plants, diggers, healers, bosses.
// Margins as everywhere (balance/scan.mjs): the fruit never bitten, a grid of health, eight seeds.
import { readFileSync, writeFileSync, existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir, homedir } from 'node:os';
import { join } from 'node:path';
import { LEVELS, PLANTS, BUGS, upCost } from '../public/data.js';
import { exportData } from '../sim/js/export.mjs';
import { play, build } from '../sim/js/play.mjs';
import { resolve } from './scenario.mjs';
import { EXPERT } from './plans.mjs';
import { scan, search } from './scan.mjs';

const args = process.argv.slice(2), opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const SECS = Number(opt('--secs', 90)), dir = opt('--out', join(homedir(), 'tmp', 'balance', 'interest'));
const ranges = (s) => s.split(',').flatMap((p) => { const [a, b] = p.split('-').map(Number); return Array.from({ length: (b || a) - a + 1 }, (_, k) => a + k - 1); });
const how = { bin: build(), quiet: true, ...(opt('--jobs') ? { jobs: Number(opt('--jobs')) } : {}) };
const RU = { pumpkin: 'Тыква', rose: 'Роза', pepper: 'Чили', mint: 'Мята', flytrap: 'Мухоловка' };
const BR = { pumpkin: ['Панцирь', 'Плети'], rose: ['Охотница', 'Дальнобойная'], pepper: ['Жар', 'Прожиг'], mint: ['Холод', 'Сосулька'], flytrap: ['Обжора', 'Ловчая'] };
const SMART = { route: 1, place: 'best', upgrades: 'greedy', terrain: true, powers: true, early: true, meta: 'exp3' };
// what a kind of bug asks of a garden
const ask = (k) => { const b = BUGS[k]; return b.boss ? 'боссы' : b.fly ? 'летающие' : b.dig ? 'копатели' : b.mend ? 'лекари' : b.chew ? 'едоки стен' : (b.armor || 0) >= 2 ? 'броня' : b.hp >= 60 ? 'толстые' : b.speed >= 1.5 ? 'быстрые' : 'толпа'; };
const pc = (x) => `${Math.round(x * 100)}%`, x2 = (m) => `×${m.toFixed(2)}`;
mkdirSync(dir, { recursive: true });

for (const n of ranges(opt('--levels', `1-${LEVELS.length}`))) {
  const L = LEVELS[n], file = new URL(`./perfect/L${n + 1}.json`, import.meta.url); if (!existsSync(file)) continue;
  const kept = JSON.parse(readFileSync(file, 'utf8')), base = resolve({ level: n, opts: SMART }), bots = [base, ...(EXPERT ? [{ ...base, policy: EXPERT }] : [])];
  const party = (plan) => [{ level: n, opts: { ...base, plan } }];
  // the game with something changed (and put back), as the native side reads it
  const game = (change, undo) => { change(); const d = exportData(); undo(); return d; };
  const data0 = exportData(), M = scan(party(kept.plan), { data: data0, ...how })[0].margin, top = Math.max(0, Math.round(Math.log(Math.max(M, .75)) / Math.log(1.05)) + 1);
  // the best party found on a changed game: the kept one as it plays there, and a search from it where that is not enough
  const without = (data) => { const m0 = scan(party(kept.plan), { data, to: top, ...how })[0].margin; if (m0 >= M / 1.06) return { m: Math.min(m0, M), searched: false };
    const r = search({ level: n, opts: base, plans: [kept.plan], bots, secs: SECS, data }, how); return { m: Math.max(m0, scan(party(r.plan), { data, to: top + 2, ...how })[0].margin), searched: true }; };
  // the garden the party ends with: the dew on every family
  const tmp = mkdtempSync(join(tmpdir(), 'interest-')), rec = join(tmp, 'p.json'); play([{ level: n, opts: { ...base, plan: kept.plan, seed: 7 }, record: rec }], { bin: how.bin, data: data0 });
  const cells = new Map();
  for (const o of JSON.parse(readFileSync(rec, 'utf8'))) { const key = (i, j) => i + ',' + j;
    if (o[0] === 'place') cells.set(key(o[2], o[3]), { kind: o[1], lvl: 1, br: 0 });
    else if (o[0] === 'up') { const c = cells.get(key(o[1], o[2])); if (c && c.lvl < 4 && (c.lvl !== 2 || o[3])) { c.lvl++; if (c.lvl === 3) c.br = o[3]; } }
    else if (o[0] === 'sell') cells.delete(key(o[1], o[2])); }
  rmSync(tmp, { recursive: true });
  const dew = {}; let all = 0, maxed = 0;
  for (const c of cells.values()) { const P = PLANTS[c.kind], b = c.br ? 'ab'[c.br - 1] : null; let cost = P.cost; for (let l = 1; l < c.lvl; l++) cost += upCost(P, l, b);
    const f = c.lvl <= 2 ? c.kind : `${c.kind}.${b}`; dew[f] = (dew[f] || 0) + cost; all += cost; if (c.lvl === 4) maxed++; }
  const name = (f) => { const [k, b] = f.split('.'); return b ? BR[k][b === 'a' ? 0 : 1] : RU[k]; };
  console.log(`\nL${n + 1} ${L.name}: лучшая партия ${x2(M)} (hp ${L.hp}); ${cells.size} растений, на вершине ${maxed}`);
  console.log('  состав: ' + Object.entries(dew).sort((a, b) => b[1] - a[1]).map(([f, x]) => `${name(f)} ${pc(x / all)}`).join(', '));
  // every plant and every branch open on the level, taken out
  const rows = [];
  for (const k of L.plants) {
    if (L.plants.length > 1) { const was = L.plants; rows.push({ f: k, whole: true, ...without(game(() => { L.plants = was.filter((x) => x !== k); }, () => { L.plants = was; })) }); }
    for (const b of ['a', 'b']) { if (PLANTS[k][b].from > n + 1) continue; const was = PLANTS[k][b].from;
      rows.push({ f: `${k}.${b}`, ...without(game(() => { PLANTS[k][b].from = 99; }, () => { PLANTS[k][b].from = was; })) }); }
  }
  for (const r of rows) { r.cost = 1 - r.m / M; r.share = r.whole ? Object.entries(dew).filter(([f]) => f.split('.')[0] === r.f).reduce((t, [, x]) => t + x, 0) / all : (dew[r.f] || 0) / all; }
  const show = (r) => `${r.whole ? 'всё растение ' : ''}${name(r.f)} −${pc(Math.max(0, r.cost))}${r.searched ? '' : '°'}`;
  const by = (lo, hi, whole) => rows.filter((r) => !!r.whole === whole && r.cost >= lo && r.cost < hi).sort((a, b) => b.cost - a.cost).map(show).join(', ') || '—';
  console.log(`  без ветки — единственный путь (−30% и больше): ${by(.3, 9, false)}`);
  console.log(`              выбор (−8…−30%): ${by(.08, .3, false)}`);
  console.log(`              не нужна (меньше −8%): ${by(-9, .08, false)}`);
  console.log(`  без растения целиком: ${rows.filter((r) => r.whole).sort((a, b) => b.cost - a.cost).map(show).join(', ')}`);
  const less = without(game(() => { L.dew0 = L.dew; L.pay0 = L.pay; L.dew = Math.round(L.dew * .8); L.pay = L.pay.map((x) => Math.round(x * .8)); }, () => { L.dew = L.dew0; L.pay = L.pay0; delete L.dew0; delete L.pay0; }));
  console.log(`  росы на 20% меньше: ${x2(less.m)} (−${pc(Math.max(0, 1 - less.m / M))})${1 - less.m / M < .08 ? ' — росы больше, чем нужно саду' : ''}`);
  const w = {}; let sum = 0; for (const wave of L.waves) for (const [k, c] of wave) { const v = BUGS[k].w * c; w[ask(k)] = (w[ask(k)] || 0) + v; sum += v; }
  console.log('  волны спрашивают: ' + Object.entries(w).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${pc(v / sum)}`).join(', '));
  writeFileSync(join(dir, `L${n + 1}.json`), JSON.stringify({ level: n + 1, margin: M, dew: Object.fromEntries(Object.entries(dew).map(([f, x]) => [f, x / all])), without: rows, lessDew: less, waves: Object.fromEntries(Object.entries(w).map(([k, v]) => [k, v / sum])) }));
}
