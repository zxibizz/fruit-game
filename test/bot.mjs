// A bot that plays a level the way it is meant to be played, and worse on purpose. The tests use it as the balance
// check. The smart bot builds a serpentine maze over the whole field, leads the trail through mud and nettles, puts
// its best plants on fertile beds and where they see the most of the trail, mixes in mint and bells, upgrades what
// pays most, mends holes, calls the waves early and uses frost and rain. Options switch its skills off:
//   maze: false — plants only beside the trail as it is; terrain: false — blind to the ground; powers: false — no
//   frost and rain; bank: true — all the dew of the level in hand from the start (an upper bound for a lazy garden);
//   meta — the perks bought; maxPlants — a cap on the garden.
// More axes for the balance matrix (balance/): route — the share of the maze walls it builds (0: the trail as it is,
//   like maze: false); place — where the shooters go: 'best' (most damage for the dew), 'end' / 'start' (only by the
//   last / first part of the trail), 'spread' (any useful cell, picked at random); plants — the kinds it may plant;
//   upgrades — 'greedy', 'none' or 'first' (grows what it has before planting more); powers — true, false or 'eager'
//   (frost and rain at the first chance); early — calls every wave at once (else waits for the countdown); repair —
//   closes holes for dew at once.
// Run directly to see how it did: node test/bot.mjs [level ...]
import { createGame, bugHp, computeDist, step, place, upgrade, upgradeCost, startWave, placeProblem, trails, regrow, regrowCost, removePlant, refund, stubAt, usePower, pstat, COLS, ROWS } from '../public/game.js';
import { LEVELS, BUGS, PLANTS, PERKS, PERK_ORDER, MUD, EARLY_DEW, BREAK, FATIGUE, wavePay } from '../public/data.js';
const rng = (s) => () => ((s = (Math.imul(s, 1103515245) + 12345) & 0x7fffffff) / 0x7fffffff);
const show = process.env.MAP ? (await import(process.env.MAP)).show : null;
const kOf = (i, j) => i + ',' + j, within = (dx, dy, r) => dx * dx + dy * dy <= r * r;
// every cell some trail runs over (a level may have two anthills), each once
// (the third number: how many cells a bug has walked when it gets there)
const trailOf = (g, dist) => { const seen = new Set(), out = []; for (const tr of trails(g, dist)) tr.forEach((c, n) => { const k = kOf(c[0], c[1]); if (!seen.has(k)) { seen.add(k); out.push([c[0], c[1], n + 1]); } }); return out; };

// The perks a player has by level n who took two stars on every level before it, and all of them.
const BUY = ['dew', 'rose', 'heart', 'corn', 'pumpkin', 'mint', 'dew', 'roots', 'pepper', 'rose', 'clouds', 'corn', 'dandelion', 'heart', 'aloe', 'flytrap', 'bell', 'mint', 'pepper', 'dew'];
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

// The maze: full-height walls of plants two columns apart, each with one gap, the gaps at opposite ends in turn.
// The wall columns and the gap rows are searched for the best trail: the longest, and (seeing the ground) with mud
// and nettles on it.
function layout(level, terrain) {
  const value = (walls) => {
    const g = createGame(level);
    for (const [col, gap] of walls) for (let j = 0; j < ROWS; j++) if (j !== gap && !g.grid[j][col] && g.tiles[j][col] !== 'nettle' && !(col === g.fruit[0] && j === g.fruit[1])) g.grid[j][col] = { type: 'pumpkin' };
    const all = trails(g, computeDist(g));
    if (!all.every((tr) => { const last = tr[tr.length - 1]; return last[0] === g.fruit[0] && last[1] === g.fruit[1]; })) return -1;
    return Math.min(...all.map((tr) => tr.reduce((s, [i, j]) => s + 1 + (terrain ? (g.tiles[j][i] === 'mud' ? .8 : g.tiles[j][i] === 'nettle' ? 1.5 : 0) : 0), 0)));
  };
  let best = null, bestV = -1;
  for (const cols of [[11, 9, 7, 5, 3], [10, 8, 6, 4, 2], [11, 9, 7, 5, 2], [12, 10, 8, 6, 4, 2], [11, 8, 6, 4, 2], [12, 10, 8, 6, 4]]) {
    const walls = [], tune = (w) => {
      let at = w[1], top = -1;
      for (let j = 0; j < ROWS; j++) { w[1] = j; const v = value(walls); if (v > top) { top = v; at = j; } }
      w[1] = at;
    };
    for (const col of cols) { const w = [col, 0]; walls.push(w); tune(w); } // wall by wall, then two more rounds
    for (let pass = 0; pass < 2; pass++) walls.forEach(tune);
    const v = value(walls); if (v > bestV) { bestV = v; best = walls.map((w) => w.slice()); }
  }
  return best;
}

// What a garden is worth: the damage a bug takes on its way. For every cell of the trail, the damage per second of
// the plants that reach it, times the time a bug spends there (longer by a mint, longer in mud).
// study() does the part shared by all plants (the time in every cell); term() is one plant's share. A candidate that
// changes neither the trail nor the time or the buff of others (not a mint, not a bell) adds only its own share —
// the bot's search costs one term() per candidate instead of the whole garden (three quarters of its time before).
function study(g, tr, o) {
  const armor = o.armor || 0, at = (p) => (o.terrain ? p : { type: p.type, lvl: p.lvl, i: -1, j: -1 }), st = (p, name) => pstat(g, at(p), name);
  const plants = []; for (let j = 0; j < ROWS; j++) for (let i = 0; i < COLS; i++) { const p = g.grid[j][i]; if (p && p.type) plants.push(p); }
  const mints = plants.filter((p) => PLANTS[p.type].slow).map((p) => [p.i, p.j, st(p, 'range'), st(p, 'slow') + (st(p, 'chill') ? .06 : 0)]);
  const bells = plants.filter((p) => PLANTS[p.type].buff).map((p) => [p, st(p, 'range'), st(p, 'buff')]);
  const time = tr.map(([a, b], k) => {
    let slow = 0; for (const [i, j, r, v] of mints) if (within(a - i, b - j, r)) slow = Math.max(slow, v);
    return (1 + FATIGUE * tr[k][2]) / ((1 - slow) * (o.terrain && g.tiles[b][a] === 'mud' && !g.grid[b][a] ? MUD : 1));
  });
  return { g, tr, o, armor, st, plants, time, bells };
}
// One plant's share: the damage it deals to the bugs passing, per bug. A bug crowd shares a single-target plant's
// shots (a rose in a stream of ants hits one of the several in its reach), while corn's splash and pepper's fire hit
// many at once: o.crowd is how many walkers stand on one cell of the trail in the coming waves. Flyers (o.air: their
// share of the coming health) cross the field in a straight line from the anthill to the fruit.
function term(S, p) {
  const { g, tr, o, st, time, bells } = S, P = PLANTS[p.type], hit = (d) => Math.max(1, d - S.armor); let dps = 0; S.air = 0;
  if (P.eat) dps = st(p, 'chomp') / st(p, 'eat');
  else if (p.type === 'pepper') dps = 2 * hit(st(p, 'dmg')) * st(p, 'rate') + 2 * st(p, 'burn') * Math.min(1.5, st(p, 'burnT') / 2);
  else if (P.dmg) dps = hit(st(p, 'dmg')) * st(p, 'rate') * (st(p, 'stun') ? 1.1 : 1);
  if (!dps) return 0;
  let buff = 0; for (const [q, r, v] of bells) if (q !== p && within(q.i - p.i, q.j - p.j, r)) buff = Math.max(buff, v);
  const r = st(p, 'range'), rg = P.groundRange ? Math.min(r, P.groundRange) : r; // the dandelion: walkers only next to it, and weaker
  let n = 0, cells = 0;
  for (let k = 0; k < tr.length; k++) if (within(tr[k][0] - p.i, tr[k][1] - p.j, rg)) { n += time[k]; cells++; }
  const crowd = o.crowd ?? 1, inReach = Math.max(1, crowd * cells); // walkers in its reach at once
  const per = p.type === 'pepper' ? 1 // fire hits all of them
    : Math.min(1, ((st(p, 'multi') || 1) * (P.splash ? 1 + 2 * st(p, 'splash') * crowd : 1)) / inReach); // a shot's bugs over the bugs to share
  const k = dps * (1 + buff), gr = k * n * per * (P.ground ?? 1);
  const air = P.air || (P.eat && st(p, 'eatAir')) ? k * flyTime(g, p, r) * (P.ground ? 1 : .6) : 0; // a ground plant has other targets too
  S.air = air; return gr; // the walkers' part is returned, the flyers' part left in S.air (no array per call)
}
const term2 = (S, p) => { const gr = term(S, p); return [gr, S.air]; };
// What the garden is worth for the coming waves: the bugs it stops. A bug that gets through bites, so walkers and
// flyers count by their number, each kind by the damage it takes against its health: once one side is safe, more of
// it adds little and the bot builds up what falls short (flyers skip the maze: only plants on their way answer them).
// r: how many times over a bug's health the garden deals on its way; exp(-r) is about the share of them that get
// through. A small log term keeps the bot building for later waves when the coming ones look safe.
const kept = (n, r) => n * (1 - Math.exp(-r)) + .05 * n * Math.log(1 + r);
const value = (o, G, A) => kept(o.nG, G / o.hpG) + kept(o.nA, A / o.hpA);
function sums(S) { let G = 0, A = 0; for (const p of S.plants) { const [gr, a] = term2(S, p); G += gr; A += a; } return [G, A];
}
// cells a flyer spends in reach of plant p: the chord of its circle along its straight way to the fruit. Flyers set
// off from any row past the right edge (game.js spawn), so the chord is averaged over a few starting rows.
const FLY_ROWS = [1, 2.5, 4, 5.5, 7];
function flyTime(g, p, r) {
  const fx = g.fruit[0] + .5, fy = g.fruit[1] + .5, sx = COLS + .6; let sum = 0;
  for (const sy of FLY_ROWS) {
    const dx = fx - sx, dy = fy - sy, len = Math.hypot(dx, dy) || 1, ux = dx / len, uy = dy / len, px = p.i + .5 - sx, py = p.j + .5 - sy;
    const along = px * ux + py * uy, off = Math.abs(px * uy - py * ux); if (off >= r) continue;
    const h = Math.sqrt(r * r - off * off); sum += Math.max(0, Math.min(len + .5, along + h) - Math.max(0, along - h));
  }
  return sum / FLY_ROWS.length * 1.5; // the fruit end matters most: every flyer passes there
}
export { study, term, trailOf };
function worth(g, tr, o) { const [G, A] = sums(study(g, tr, o)); return value(o, G, A); }
// plants that change the others' share: their worth is counted over the whole garden
const wide = (type) => !!(PLANTS[type].slow || PLANTS[type].buff);

// The share of the pay for a wave that the bot keeps for repairs once the diggers come.
export const RESERVE = .6;
export function playLevel(level, { seed = 7, verbose = false, maxPlants = Infinity, maze = true, route = maze ? 1 : 0, terrain = true, powers = true, bank = false, meta = {}, place: where = 'best', plants: allowed = null, upgrades = 'greedy', early = true, repair = true, reserve = RESERVE, watch = null } = {}) {
  const g = createGame(level, seed, meta), L = LEVELS[level], all = route > 0 ? layout(level, terrain) : [], walls = all.slice(0, Math.round(all.length * route));
  const R = rng(seed * 7919 + 13);
  const o = { terrain };
  if (bank) g.dew = bank === true ? levelDew(level, meta) : bank;
  const kinds = L.plants.filter((k) => k !== 'aloe' && (!allowed || allowed.includes(k))), others = kinds.filter((k) => k !== 'pumpkin');
  const reach = Math.max(...others.map((k) => PLANTS[k].range[2])) + .6;
  const planned = []; for (const [col, gap] of walls) for (let j = 0; j < ROWS; j++) if (j !== gap) planned.push([col, j]);
  const room = () => g.plants.length + g.stubs.length < maxPlants;
  const firstDigger = L.waves.findIndex((w) => w.some(([kind]) => BUGS[kind].dig)) + 1;
  // where the trail will run when the walls stand: nothing but the walls is planted on it; without a maze, the trail as it is
  const keep = new Set();
  { const f = createGame(level); for (const [i, j] of planned) if (!f.grid[j][i] && f.tiles[j][i] !== 'nettle') f.grid[j][i] = { type: 'pumpkin' }; for (const [i, j] of trailOf(f, computeDist(f))) keep.add(kOf(i, j)); }
  // the armor a hit meets in the next waves, weighed by the health that wears it
  // the coming waves: how many walkers stand on a cell of the trail (from their pace: speed and gap), weighed by health;
  // and the share of the health that flies
  // nG, nA: the bites at stake (what gets through bites by its kind's bite); hpG, hpA: the health of one bug
  const crowdSoon = () => { let d = 0, w = 0, nG = 0, nA = 0, cG = 0, cA = 0, hG = 0, hA = 0;
    L.waves.slice(g.wave, g.wave + 3).forEach((wave, k) => { for (const [kind, n, gap] of wave) {
      const B = BUGS[kind], hp = bugHp(g, kind, g.wave + 1 + k), bites = n * B.bite;
      if (B.fly) { nA += bites; cA += n; hA += n * hp; continue; }
      nG += bites; cG += n; hG += n * hp; d += n * hp * Math.min(6, 1 / Math.max(.15, B.speed * gap)); w += n * hp; } });
    return { crowd: w ? d / w : 1, nG: nG || .1, nA, hpG: cG ? hG / cG : 50, hpA: cA ? hA / cA : 50 }; };
  const armorSoon = () => { let sum = 0, all = 0; for (const w of L.waves.slice(g.wave, g.wave + 3)) for (const [kind, n] of w) { const B = BUGS[kind], q = n * B.hp * (B.fly ? 0 : 1); sum += q * (B.armor || 0); all += q; } return all ? sum / all : 0; };
  const best = () => {
    o.armor = armorSoon(); Object.assign(o, crowdSoon());
    const tr = trailOf(g), S = study(g, tr, o), [G0, A0] = sums(S), now = value(o, G0, A0), add = ([gr, a], [gr0, a0] = [0, 0]) => value(o, G0 + gr - gr0, A0 + a - a0) - now;
    const on = new Set(tr.map(([i, j]) => kOf(i, j)));
    let top = null; const offers = [];
    // 'spread' takes any useful step at random instead of the best one; 'first' prefers growing to planting
    const offer = (gain, cost, run, up = false) => { if (gain <= 1e-6) return; if (up && upgrades === 'first') gain *= 3; offers.push({ gain, cost, run }); if (!top || gain / cost > top.gain / top.cost) top = { gain, cost, run }; };
    // the part of the trail a placement policy allows shooters by
    // (by the steps walked to get there: with two anthills the trail cells of both count, not their sum)
    const part = where === 'end' ? [.6, 1] : where === 'start' ? [0, .4] : [0, 1], far = Math.max(1, ...tr.map(([, , n]) => n)), seg = tr.filter(([, , n]) => n >= part[0] * far && n <= part[1] * far + 1);
    const allowedAt = (i, j, type) => type === 'pumpkin' || where === 'best' || where === 'spread' || seg.some(([a, b]) => Math.hypot(a - i, b - j) <= PLANTS[type].range[0] + .01);
    const tryCell = (i, j, types) => {
      if (g.grid[j][i] || stubAt(g, i, j) || placeProblem(g, i, j)) return;
      types = types.filter((t) => allowedAt(i, j, t));
      for (const type of types) {
        const q = { type, lvl: 1, i, j }; g.grid[j][i] = q; let gain;
        if (on.has(kOf(i, j))) { const tr2 = trailOf(g, computeDist(g)); gain = worth(g, tr2, o) - now + (tr2.length - tr.length) * 1e-3 * o.nG; }
        else if (wide(type)) gain = worth(g, tr, o) - now;
        else gain = add(term2(S, q)); // only its own share: the others do not change
        g.grid[j][i] = null;
        offer(gain, PLANTS[type].cost, () => place(g, type, i, j));
      }
    };
    if (room()) {
      for (const [i, j] of planned) tryCell(i, j, kinds);
      for (let i = 0; i < COLS; i++) for (let j = 0; j < ROWS; j++) if (!keep.has(kOf(i, j)) && !on.has(kOf(i, j)) && tr.some(([a, b]) => Math.hypot(a - i, b - j) <= reach)) tryCell(i, j, others);
    }
    for (const p of g.plants) {
      const c = upgrades === 'none' ? null : upgradeCost(p);
      if (c != null) { const was = wide(p.type) ? null : term2(S, p); p.lvl++; const gain = wide(p.type) ? worth(g, tr, o) - now : add(term2(S, p), was); p.lvl--; offer(gain || (p.type === 'pumpkin' && g.wave >= firstDigger - 2 ? 1e-3 * o.nG : 0), c, () => upgrade(g, p), true); }
      if (p.type === 'pumpkin' && p.lvl === 1 && g.phase === 'build') for (const type of others.filter((t) => allowedAt(p.i, p.j, t))) {
        p.type = type; const gain = wide(type) ? worth(g, tr, o) - now : add(term2(S, p)); p.type = 'pumpkin';
        offer(gain, PLANTS[type].cost - refund(g, p) + .01, () => { removePlant(g, p); place(g, type, p.i, p.j); });
      }
    }
    if (where === 'spread' && offers.length) { const ok = offers.filter((q) => q.cost <= g.dew); return ok.length ? ok[Math.floor(R() * ok.length)] : top; }
    return top;
  };
  let seen = '', need = 0;
  const tryBuild = () => {
    // repairs first: a hole the bugs run through is closed at once for dew; other roots grow back by themselves
    const tr = new Set(trailOf(g).map(([i, j]) => kOf(i, j))), on = (s) => tr.has(kOf(s.i, s.j));
    if (repair) for (const s of g.stubs.slice()) if (g.phase === 'wave' && on(s) && g.dew >= regrowCost(s)) regrow(g, s);
    // the maze grows with the level: two walls at once and one more every wave: first-level pumpkins are cheap, and a long trail tires the bugs, with pumpkins where nothing stands yet
    const due = Math.min(walls.length, 2 + g.wave);
    for (const [col, gap] of walls.slice(0, due)) for (let j = 0; j < ROWS; j++) {
      if (j === gap || g.grid[j][col] || stubAt(g, col, j) || !room() || placeProblem(g, col, j)) continue;
      if (!place(g, 'pumpkin', col, j)) return;
    }
    // from the first diggers on, some dew is always kept to close a hole at once
    // (a share of the pay for the last wave: little dew comes in while a wave is on, and the upgrades are the dear part;
    // in the last wave only a hole's worth: what is kept there is left over, and the matrix reads it as idle dew)
    const keepDew = walls.length && g.wave >= firstDigger - 1 ? (g.wave >= g.waves ? 50 : Math.max(50, Math.round(reserve * wavePay(L, g.wave)))) : 0;
    // the best step is looked for again only when the field changed or the dew for the last one found is there
    for (let n = 0; n < 60; n++) {
      const sig = `${g.wave},${g.phase},${g.stubs.length},${g.plants.reduce((t, p) => t + p.id * 7 + p.lvl, 0)}`;
      if (sig === seen && g.dew < need) return;
      const a = best(); seen = sig; need = a ? a.cost + keepDew : Infinity;
      if (!a || g.dew < need) return;
      a.run();
    }
  };
  // frost when bugs are about to bite, rain when the fruit or the garden is hurt
  const usePowers = () => {
    if (!powers) return;
    if (powers === 'eager') { if (g.phase === 'wave' && g.bugs.length) { if (g.powers.frost) usePower(g, 'frost'); if (g.powers.rain && (g.stubs.length || g.hp < g.maxHp)) usePower(g, 'rain'); } return; }
    const near = g.bugs.filter((b) => Math.hypot(b.x - g.fruit[0] - .5, b.y - g.fruit[1] - .5) < 2.5);
    if (g.powers.frost && (near.length >= 3 || near.some((b) => BUGS[b.kind].boss))) usePower(g, 'frost');
    if (g.powers.rain && (g.hp <= g.maxHp - 3 || g.stubs.length >= 3 || g.plants.filter((p) => p.web > 0).length >= 2)) usePower(g, 'rain');
  };
  let t = 0, income = 0, eaten = 0, powersUsed = 0; const log = [], bites = {}, hpAt = [];
  while (g.phase !== 'won' && g.phase !== 'lost' && t < 3600) {
    // it builds, then calls the wave at once (for the dew of an early start)
    if (g.phase === 'build' && (early || g.wave === 0)) { tryBuild(); const dew = g.dew; startWave(g); if (bank) g.dew = dew; }
    for (let n = 0; n < 15; n++) step(g, 1 / 30);
    t += .5; usePowers();
    for (const e of g.events) { if (e.t === 'kill') { income += e.reward; if (bank) g.dew -= e.reward; } if (e.t === 'waveDone') { income += e.bonus; if (bank) g.dew -= e.bonus; } if (e.t === 'plantDead') eaten++; if (e.t === 'bite') bites[`${g.wave}:${e.b.kind}${e.b.brood ? '*' : ''}`] = (bites[`${g.wave}:${e.b.kind}${e.b.brood ? '*' : ''}`] || 0) + 1; }
    if (g.events.some((e) => e.t === 'waveDone') && g.wave % 5 === 0) log.push(`${g.wave}:${g.hp}hp/${g.plants.length}p`);
    powersUsed += g.events.filter((e) => e.t === 'power').length; if (watch) watch(g, o);
    if (verbose && g.events.some((e) => e.t === 'waveDone')) console.log(`  after wave ${g.wave}: hp ${g.hp} dew ${g.dew} plants ${g.plants.length} (${g.plants.filter((p) => p.lvl > 1).length} grown) eaten ${eaten} t ${Math.round(t)}s`);
    g.events.length = 0; tryBuild();
  }
  const res = { worth: o.nG ? Math.round(worth(g, trailOf(g), o) * 100) / 100 : 0, trail: trailOf(g).length, level, won: g.phase === 'won', hp: g.hp, maxHp: g.maxHp, wave: g.wave, waves: g.waves, plants: g.plants.length, grown: g.plants.filter((p) => p.lvl > 1).length, maxed: g.plants.filter((p) => p.lvl === 3).length, dew: g.dew, eaten, income, log, bites, powersUsed, time: Math.round(t) };
  if (show) show(g);
  if (verbose) console.log(`level ${level + 1} ${L.name}: ${res.won ? 'won' : 'LOST'} hp ${res.hp}/${g.maxHp} wave ${res.wave}/${g.waves} plants ${res.plants} (${res.grown} grown) dew left ${g.dew} eaten ${eaten} income ${income} time ${res.time}s bites ${JSON.stringify(bites)}`);
  return res;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const levels = process.argv.slice(2).filter((a) => /^\d+$/.test(a)).map((n) => Number(n) - 1);
  for (const n of levels.length ? levels : LEVELS.map((_, k) => k)) playLevel(n, { verbose: true, meta: expectedMeta(n) });
}
