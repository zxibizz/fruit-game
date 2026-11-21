// One scenario of the balance matrix: a level, the overrides of the game data, and how the bot plays it.
// Runs in a worker of its own (run.mjs), so overrides never leak into the next scenario.
import { LEVELS, PLANTS, BUGS, PERKS, TUNE, makeWaves } from '../public/data.js';
import { playLevel, expectedMeta, fullMeta } from '../test/bot.mjs';

// meta: 'none' | 'exp1' | 'exp2' (two stars a level before this one) | 'full' | 'perk:<key>' (that perk only, maxed)
export function metaOf(name, level) {
  if (!name || name === 'none') return {};
  if (name === 'full') return fullMeta();
  if (name.startsWith('exp')) return expectedMeta(level, Number(name.slice(3)) || 2);
  if (name.startsWith('perk:')) { const k = name.slice(5); return { [k]: PERKS[k].cost.length }; }
  throw new Error(`unknown meta ${name}`);
}
// plants: null (all of the level) | 'no:<kind>' | 'only:<kind>' (with pumpkins for walls) | [kinds]
const plantsOf = (spec, level) => {
  if (!spec) return null; if (Array.isArray(spec)) return spec;
  const [op, k] = spec.split(':'), all = LEVELS[level].plants;
  return op === 'no' ? all.filter((x) => x !== k) : ['pumpkin', k];
};
// Overrides: { 'L5.dew': 500, 'L5.pay': '150/270', 'TUNE.hpGrowth': 1.2, 'PLANTS.dandelion.ground': .3, 'BUGS.butterfly.hp': 12, FLY_SHARE: .2 }.
const WAVE_KEYS = new Set(['count', 'budget', 'roster', 'boss']);
export function applyOverrides(set = {}, waveSeed = null) {
  const regen = new Set(); let flyShare;
  for (const [key, v] of Object.entries(set)) {
    const m = key.match(/^L(\d+)\.(.+)$/);
    // L3.budget=11/5.4: the weight of the first wave / added per wave
    if (m && m[2] === 'budget') {
      const L = LEVELS[Number(m[1]) - 1], parts = String(v).split('/'), xs = parts.map(Number);
      if (!L || parts.length !== 2 || xs.some((x) => !(x > 0))) throw new Error(`${key}=${v}: ${L ? 'first/added per wave' : `no level ${m[1]}`}`);
      L.budget = xs; regen.add(Number(m[1]) - 1); continue;
    }
    // L3.pay=300/700: the dew for a wave got through, after the first wave / after the last but one
    if (m && m[2] === 'pay') {
      const L = LEVELS[Number(m[1]) - 1], parts = String(v).split('/'), xs = parts.map(Number);
      if (!L || parts.length !== 2 || parts.some((p) => !p.trim()) || xs.some((x) => !(x >= 0))) throw new Error(`${key}=${v}: ${L ? 'first/last' : `no level ${m[1]}`}`);
      L.pay = xs; continue;
    }
    if (m && !(m[2] in (LEVELS[Number(m[1]) - 1] || {}))) throw new Error(`unknown override ${key}`);
    if (m) { const n = Number(m[1]) - 1; LEVELS[n][m[2]] = v; if (WAVE_KEYS.has(m[2])) regen.add(n); continue; }
    if (key === 'FLY_SHARE') { flyShare = v; LEVELS.forEach((_, n) => regen.add(n)); continue; }
    const [root, ...path] = key.split('.'), obj = { PLANTS, BUGS, PERKS, TUNE }[root];
    if (key === 'TUNE.bossEscort' || key === 'TUNE.gap') LEVELS.forEach((_, n) => regen.add(n)); if (!obj) throw new Error(`unknown override ${key}`);
    let o = obj; for (const p of path.slice(0, -1)) o = o?.[p];
    if (o == null || (root === 'TUNE' && !(path.at(-1) in o))) throw new Error(`unknown override ${key}`);
    o[path.at(-1)] = v;
  }
  if (waveSeed != null) LEVELS.forEach((_, n) => regen.add(n));
  for (const n of regen) LEVELS[n].waves = makeWaves(LEVELS[n], waveSeed != null ? waveSeed * 1000 + n : 101 + n, flyShare != null ? { flyShare } : {});
}
export function runScenario(sc) {
  applyOverrides(sc.set, sc.waveSeed ?? null);
  const o = { ...sc.opts }, n = sc.level;
  o.meta = metaOf(o.meta ?? 'exp2', n); o.plants = plantsOf(o.plants, n);
  if (o.bank === 'all') o.bank = 1e6; else if (o.bank === 'level') o.bank = true; // true: levelDew() in the bot
  const t = Date.now(), r = playLevel(n, o), L = LEVELS[n];
  // where the damage came from: the worst wave's share of all bites, and bites by kind
  // (by the fruit health they took: a boss bites far harder than an ant)
  const byWave = {}, byKind = {}; let bites = 0, biteCount = 0, bossBites = 0;
  for (const [k, c] of Object.entries(r.bites)) { const [w, kind0] = k.split(':'), kind = kind0.replace('*', ''), d = c * BUGS[kind].bite; byWave[w] = (byWave[w] || 0) + d; byKind[kind0] = (byKind[kind0] || 0) + d; bites += d; biteCount += c; if (BUGS[kind].boss) bossBites += c; }
  const worst = Object.entries(byWave).sort((a, b) => b[1] - a[1])[0] || [null, 0];
  const first = Object.keys(byWave).length ? Math.min(...Object.keys(byWave).map(Number)) : null;
  return { won: r.won, hp: r.hp, maxHp: r.maxHp, wave: r.wave, waves: L.count, score: r.won ? r.hp / r.maxHp : -(1 - (r.wave - 1) / L.count),
    firstBite: first, bites, biteCount, bossBites, worstWave: worst[0] && Number(worst[0]), worstShare: bites ? worst[1] / bites : 0, byKind, plants: r.plants, kinds: r.kinds, eaten: r.eaten, grown: r.grown, maxed: r.maxed, trail: r.trail,
    spare: o.bank ? null : r.dew, income: r.income, powersUsed: r.powersUsed, ms: Date.now() - t };
}
