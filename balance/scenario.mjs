// A scenario of the balance matrix: a level, the overrides of the game data, and how the bot plays it. This is the
// JS half: the data and the options are made ready here, the party is played by the native bot (sim/src/bot.rs),
// and what came of it is read here again. Overrides change the data for good: run.mjs gives every variant of the
// data a worker of its own (native.mjs).
import { LEVELS, PLANTS, BUGS, PERKS, PERK_ORDER, TUNE, BREAK, EARLY_DEW, wavePay, makeWaves } from '../public/data.js';

// The perks a player has by level n who took two stars on every level before it, and all of them.
const BUY = ['dew', 'rose', 'heart', 'pepper', 'pumpkin', 'mint', 'dew', 'refund', 'pepper', 'rose', 'clouds', 'heart', 'pumpkin', 'flytrap', 'mint', 'flytrap', 'dew'];
export function expectedMeta(level, perLevel = 2) {
  let stars = level * perLevel; const meta = {};
  for (const k of BUY) { const cost = PERKS[k].cost[meta[k] || 0]; if (cost == null || cost > stars) continue; stars -= cost; meta[k] = (meta[k] || 0) + 1; }
  return meta;
}
export const fullMeta = () => Object.fromEntries(PERK_ORDER.map((k) => [k, PERKS[k].cost.length]));
// All the dew a level gives: at the start, for every bug, for every wave, and for calling every wave at once.
export function levelDew(level, meta = {}) {
  const L = LEVELS[level]; let sum = L.dew + (meta.dew ? PERKS.dew.v[meta.dew - 1] : 0) + (L.count - 1) * BREAK * EARLY_DEW;
  L.waves.forEach((w, k) => { if (k < L.count - 1) sum += wavePay(L, k + 1); for (const [kind, n] of w) sum += n * BUGS[kind].reward; });
  return sum;
}

// A level with no maze to build (a stone path; a grass cell or two at most): the players play the path as it is, and
// a lazy garden is one kind of plant on every bed, never grown to a branch.
export const fixedMap = (n) => LEVELS[n].map.join('').split('.').length - 1 < 6;
// (on the first two levels — three plants, two branches — a garden of one plant is a fair way to begin, not a lazy one:
// the rule starts on the third)
export const lazyFixed = (n) => (n >= 2 ? LEVELS[n].plants.map((k) => [`lazy all ${k}`, { route: 0, meta: 'exp3', plants: [k], top: 2 }]) : []);
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
// Overrides: { 'L5.dew': 500, 'L5.pay': '150/270', 'TUNE.hpGrowth': 1.2, 'PLANTS.rose.b.ground': .3, 'BUGS.butterfly.hp': 12, FLY_SHARE: .2 }.
const WAVE_KEYS = new Set(['count', 'budget', 'roster', 'boss', 'swell']);
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
    if (m && m[2] !== 'swell' && !(m[2] in (LEVELS[Number(m[1]) - 1] || {}))) throw new Error(`unknown override ${key}`);
    if (m) { const n = Number(m[1]) - 1; LEVELS[n][m[2]] = v; if (WAVE_KEYS.has(m[2])) regen.add(n); continue; }
    if (key === 'FLY_SHARE') { flyShare = v; LEVELS.forEach((_, n) => regen.add(n)); continue; }
    const [root, ...path] = key.split('.'), obj = { PLANTS, BUGS, PERKS, TUNE }[root];
    if (key === 'TUNE.bossEscort' || key === 'TUNE.gap') LEVELS.forEach((_, n) => regen.add(n)); if (!obj) throw new Error(`unknown override ${key}`);
    let o = obj; for (const p of path.slice(0, -1)) o = o?.[p];
    if (o == null || (root === 'TUNE' && !(path.at(-1) in o))) throw new Error(`unknown override ${key}`);
    o[path.at(-1)] = v;
  }
  if (waveSeed != null) LEVELS.forEach((_, n) => regen.add(n));
  for (const n of regen) LEVELS[n].waves = makeWaves(LEVELS[n], waveSeed != null ? waveSeed * 1000 + n : LEVELS[n].seed, flyShare != null ? { flyShare } : {});
}
// The options of a scenario as the bot takes them (sim/js/play.mjs): the perks and the plants by name, the bank in dew.
export function resolve(sc) {
  applyOverrides(sc.set, sc.waveSeed ?? null);
  const o = { ...sc.opts }, n = sc.level;
  o.meta = metaOf(o.meta ?? 'exp2', n); o.plants = plantsOf(o.plants, n);
  if (o.bank === 'all') o.bank = 1e6; else if (o.bank === 'level') o.bank = levelDew(n, o.meta); // all the dew the level gives
  return o;
}
// What came of a party (the bot's own report r), as the rules and the report of the matrix read it.
export function summarize(r, o, level, ms) {
  const L = LEVELS[level];
  // where the damage came from: the worst wave's share of all bites, and bites by kind
  // (by the fruit health they took: a boss bites far harder than an ant)
  const byWave = {}, byKind = {}; let bites = 0, biteCount = 0, bossBites = 0;
  for (const [k, c] of Object.entries(r.bites)) { const [w, kind0] = k.split(':'), kind = kind0.replace('*', ''), d = c * BUGS[kind].bite; byWave[w] = (byWave[w] || 0) + d; byKind[kind0] = (byKind[kind0] || 0) + d; bites += d; biteCount += c; if (BUGS[kind].boss) bossBites += c; }
  const worst = Object.entries(byWave).sort((a, b) => b[1] - a[1])[0] || [null, 0];
  const first = Object.keys(byWave).length ? Math.min(...Object.keys(byWave).map(Number)) : null;
  return { won: r.won, hp: r.hp, maxHp: r.maxHp, wave: r.wave, waves: L.count, score: r.won ? r.hp / r.maxHp : -(1 - (r.wave - 1) / L.count),
    firstBite: first, bites, biteCount, bossBites, worstWave: worst[0] && Number(worst[0]), worstShare: bites ? worst[1] / bites : 0, byKind, plants: r.plants, kinds: r.kinds, eaten: r.eaten, grown: r.grown, maxed: r.maxed, trail: r.trail,
    spare: o.bank ? null : r.dew, income: r.income, powersUsed: r.powersUsed, ms };
}
