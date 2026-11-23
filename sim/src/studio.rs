// The balance studio's engine (balance/studio.mjs drives it, `fruit-sim studio`): for every level and every wave, the
// gardens that hold that wave best for the dew a player has by then, found by search on the real rules (game.rs). The
// best of many different kinds of garden are kept side by side (MAP-Elites: one elite per composition, the families of
// plants the dew went to), so that the best mixed garden and the best garden of one plant are both there to compare.
//
// A garden is a maze (one of the pool of routes.rs, or its first walls: what stands before the rest is built) and a
// plant of some tier on every cell of its walls and on any other free cells off its trail. Its worth on a wave is its
// margin: how many times healthier every bug of that wave may be (bosses, their brood and a slug king's snails too) and
// the garden still lets no more than `tol` fruit health be bitten. The wave is played alone on a fresh garden (after
// every wave the garden grows back whole, so a wave never inherits damage), with none of the player's powers.
//
// The dew of wave W: the start of the level (and the perk), the pay of every wave before it and the reward of every bug
// in them (a player who got here killed them), all of it standing in the garden: the meta of that wave, an upper bound
// of what a party has then, not a plan of the party.
//
// The process reads commands from stdin, a JSON object a line, and writes what it found to stdout, a JSON object a line:
//   {cmd:"data", data, meta: [[[perk, tier], ...] per level], tol, early, seeds}  (seeds: how many seeds of the game a
//       wave with something drawn in it — flyers, a boss's brood — is judged on, 3 if not said)  the game as it is now (sim/js/export.mjs):
//       every elite found so far is played again on it first (their old margins stay shown, marked stale, till then),
//       then the search goes on from them
//   {cmd:"focus", level, wave}    what is looked at: searched first and longest (wave null: the whole level)
//   {cmd:"seed", level, wave, gardens: [{walls: [cell], cells: [[cell, plant, tier]]}]}  gardens to start from (a
//       restart keeps what was found)
//   {cmd:"cap", focus, other}     how many gardens are tried for a wave of the focused level, of the others
//   {cmd:"verify", id, level, wave, garden, seeds}  → {t:"verify", id, seeds, margins}: the garden on other seeds
//   {cmd:"explain", id, level, wave, garden}  → {t:"explain", id, base, without: {family: margin}}: what each family does
//   out: {t:"wave", gen, level, wave, trailBase, trailMax (the trail as it is and the longest maze), budget, tried, plays, stale, top: [garden], mono: {plant: garden}}
//        garden: {m, cost, len, walls, trail, cells: [[cell, plant, tier]], mix: {family: share}, stale}
//        {t:"status", gen, plays, rate, idle}  {t:"ready", gen}  {t:"error", msg}
use crate::data::*;
use crate::game::*;
use crate::json::J;
use crate::routes::{self, Wall};
use std::io::{BufRead, Write};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex, RwLock};
use std::time::{Duration, Instant};

// The tiers a plant can stand at: (level, branch) — 1, 2, 3a, 4a, 3b, 4b.
pub const TIERS: [(usize, u8); 6] = [(1, 0), (2, 0), (3, 1), (4, 1), (3, 2), (4, 2)];
#[derive(Clone, Copy, PartialEq, Eq, Hash, Debug)]
pub struct Spec { pub kind: u8, pub tier: u8 }
impl Spec {
    pub fn br(&self) -> u8 { TIERS[self.tier as usize].1 }
    // the family: the plant (levels 1-2) or the plant on a branch (3-4)
    pub fn family(&self) -> usize { self.kind as usize * 3 + self.br() as usize }
}
pub fn tier_cost(d: &Data, s: Spec) -> f64 {
    let p = &d.plants[s.kind as usize]; let u = &p.up;
    p.cost + match s.tier { 0 => 0.0, 1 => u[0], 2 => u[0] + u[1], 3 => u[0] + u[1] + u[2], 4 => u[0] + u[3], _ => u[0] + u[3] + u[4] }
}
fn family_name(d: &Data, f: usize) -> String { let k = &d.plants[f / 3].name; match f % 3 { 0 => k.clone(), 1 => format!("{}.a", k), _ => format!("{}.b", k) } }
#[inline] fn ij(k: usize) -> (i32, i32) { ((k % COLS as usize) as i32, (k / COLS as usize) as i32) }

// A maze: the cells of its walls, the trail with them standing, its length, and the cells a plant may stand on beside
// it with how much each is worth looking at (the trail it sees, the fruit near it for the flyers).
pub struct Maze { pub walls: Vec<usize>, pub trail: Vec<usize>, pub len: usize, pub wall: Vec<bool>, pub slots: Vec<(usize, f64)>, pub slot_sum: f64 }
pub struct LevelInfo { pub mazes: Vec<Maze>, pub base: usize, pub max: usize, pub specs: Vec<Spec>, pub kinds: Vec<u8> }
fn free_cell(g: &Game, k: usize) -> bool {
    let (i, j) = ij(k);
    g.grid[k] == Cell::Empty && !matches!(g.tiles[k], Tile::Nettle | Tile::Stone) && (i, j) != g.fruit && !g.entries.iter().any(|&e| e == (i, j))
}
pub fn level_info(d: &Data, level: usize) -> LevelInfo {
    let g = Game::new(d, level, 1, &[]);
    let free: Vec<bool> = (0..N).map(|k| free_cell(&g, k)).collect();
    // walls stand on grass only: a bed shuts nothing, nothing grows on stone
    let grass = |k: usize| free[k] && g.tiles[k] != Tile::Bed;
    let mut raw: Vec<(Vec<usize>, usize, Vec<usize>)> = Vec::new();
    let add = |walls: &[Wall], raw: &mut Vec<(Vec<usize>, usize, Vec<usize>)>| {
        let mut cells: Vec<usize> = walls.iter().flatten().map(|&(i, j)| key(i, j)).filter(|&k| grass(k)).collect(); cells.sort(); cells.dedup();
        if raw.iter().any(|r| r.0 == cells) { return; }
        let ws: Vec<Wall> = vec![cells.iter().map(|&k| ij(k)).collect()];
        let Some((len, trail)) = routes::walk(&g, &ws) else { return };
        raw.push((cells, len, trail.iter().map(|&(i, j)| key(i, j)).collect()));
    };
    add(&[], &mut raw);
    for (walls, _) in routes::pool(d, level).iter() { for n in 1..=walls.len() { add(&walls[..n], &mut raw); } }
    // a maze with a wall that makes the trail no longer is dew spent on nothing: its shorter self is there
    raw.sort_by(|a, b| a.0.len().cmp(&b.0.len()).then(b.1.cmp(&a.1)));
    let mut keep: Vec<(Vec<usize>, usize, Vec<usize>)> = Vec::new();
    for m in raw { if keep.iter().any(|k| k.1 >= m.1 && k.0.len() < m.0.len() && k.0.iter().all(|c| m.0.contains(c))) { continue; } keep.push(m); }
    let fruit = g.fruit;
    let mazes: Vec<Maze> = keep.into_iter().map(|(walls, len, trail)| {
        let mut wall = vec![false; N]; for &k in &walls { wall[k] = true; }
        let mut on = vec![false; N]; for &k in &trail { on[k] = true; }
        let slots: Vec<(usize, f64)> = (0..N).filter(|&k| free[k] && !wall[k] && !on[k]).map(|k| {
            let (i, j) = ij(k);
            let sees = trail.iter().filter(|&&t| { let (a, b) = ij(t); within((a - i) as f64, (b - j) as f64, 1.5) }).count() as f64;
            let near_fruit = within((fruit.0 - i) as f64, (fruit.1 - j) as f64, 3.6);
            (k, 0.2 + sees + if near_fruit { 3.0 } else { 0.0 })
        }).collect();
        let slot_sum = slots.iter().map(|s| s.1).sum();
        Maze { walls, trail, len, wall, slots, slot_sum }
    }).collect();
    let base = mazes[0].len; let max = mazes.iter().map(|m| m.len).max().unwrap_or(base);
    let lv = &d.levels[level]; let mut specs = Vec::new();
    for &k in &lv.plants { for t in 0..6u8 { let br = TIERS[t as usize].1; if br == 0 || g.branch_open(k, br) { specs.push(Spec { kind: k as u8, tier: t }); } } }
    LevelInfo { mazes, base, max, specs, kinds: lv.plants.iter().map(|&k| k as u8).collect() }
}

// The dew a player has standing by the start of wave `wave` (1-based), with the perks `meta`.
pub fn budget(d: &Data, level: usize, wave: usize, meta: &[(String, usize)], early: bool) -> f64 {
    let g = Game::new(d, level, 1, meta); let lv = &d.levels[level];
    let mut dew = g.dew;
    for w in 1..wave { dew += lv.pay_at[w - 1]; for gr in &lv.waves[w - 1] { dew += d.bugs[gr.kind].reward * gr.count as f64; } if early { dew += d.brk * d.early_dew; } }
    dew
}

#[derive(Clone, Debug, PartialEq)]
pub struct Garden { pub maze: usize, pub cells: Vec<(usize, Spec)> } // by cell
impl Garden {
    pub fn cost(&self, d: &Data) -> f64 { self.cells.iter().map(|&(_, s)| tier_cost(d, s)).sum() }
    fn norm(&mut self) { self.cells.sort_by_key(|c| c.0); self.cells.dedup_by_key(|c| c.0); }
}

// Plays wave `wave` of the level on the garden with every bug `scale` times healthier; the fruit health bitten. Once more
// than `stop` is bitten the party is not played on (whether it holds is known).
pub fn play_wave(d: &Data, level: usize, wave: usize, meta: &[(String, usize)], info: &LevelInfo, gd: &Garden, scale: f64, seed: u32, stop: f64) -> f64 {
    let mut g = Game::new(d, level, seed, meta);
    let maze = &info.mazes[gd.maze];
    // the walls go in as they are (their gaps keep the way open); any other plant only where it shuts nobody in
    for &(k, s) in &gd.cells {
        let (i, j) = ij(k);
        if g.grid[k] != Cell::Empty { continue; }
        if !maze.wall[k] {
            let dd = dist_over(&g.grid, &g.tiles, g.fruit, k as i32);
            if g.entries.iter().any(|&(a, b)| dd[key(a, b)] >= INF) { continue; }
        }
        let (lvl, br) = TIERS[s.tier as usize]; let kind = s.kind as usize;
        let hp = g.pstat(kind, lvl, br, i, j, Stat::Hp);
        let id = g.next_id; g.next_id += 1;
        g.plants.push(Plant { id, kind, i, j, lvl, br, hp, max_hp: hp, cd: 0.3, spent: tier_cost(d, s), web: 0.0, guard: 0.0, spikes: 0.0, ward: None, warded: false, born: -1, tgt: 0, stk: 0.0 });
        g.grid[k] = Cell::Plant(id);
    }
    g.refresh();
    g.hp_scale = scale; g.hp = 1e9; g.max_hp = 1e9; g.wave = wave - 1;
    g.start_wave();
    let dt = 1.0 / 30.0; let mut n = 0;
    while g.phase == Phase::Wave && n < 30 * 900 { g.step(dt); g.events.clear(); n += 1; if 1e9 - g.hp > stop { break; } }
    1e9 - g.hp
}

// The margin of a garden on a wave: the most `scale` it holds at, to 2%. A garden that kills by shares of the bugs'
// health (thorns, spikes, nettles, a flytrap swallowing the worn) may hold at any health: its margin is MAX, shown as
// such (no health of the bugs beats it, only more bugs or other bugs do).
pub const MAX: f64 = 30.0;
// seeds: the seeds of the game a garden has to hold on, every one (where the flyers come from and where a boss's brood
// lands are drawn by the game: one seed alone, the search finds the gardens that suit its draw, and their margin on
// other seeds is lower)
pub struct Judge<'a> { pub d: &'a Data, pub level: usize, pub wave: usize, pub meta: &'a [(String, usize)], pub info: &'a LevelInfo, pub tol: f64, pub seeds: Vec<u32> }
// the seeds a wave is judged on: n of them when something in it is drawn (flyers, a boss's brood or split), else one
pub fn seeds_of(d: &Data, level: usize, wave: usize, n: usize) -> Vec<u32> {
    let drawn = d.levels[level].waves[wave - 1].iter().any(|g| { let b = &d.bugs[g.kind]; b.fly || b.brood.is_some() || b.split.is_some() });
    (1..=if drawn { n.max(1) } else { 1 } as u32).collect()
}
impl<'a> Judge<'a> {
    pub fn holds(&self, gd: &Garden, s: f64, plays: &mut usize) -> bool {
        self.seeds.iter().all(|&seed| { *plays += 1; play_wave(self.d, self.level, self.wave, self.meta, self.info, gd, s, seed, self.tol + 1e-9) <= self.tol + 1e-9 })
    }
    // guess: where to look first; floor: below that the margin is not worth knowing (None comes back: one party)
    pub fn margin(&self, gd: &Garden, guess: f64, floor: Option<f64>, plays: &mut usize) -> Option<f64> {
        const STEP: f64 = 1.6; const MIN: f64 = 0.02; const PREC: f64 = 1.02;
        let guess = guess.max(MIN * STEP).min(MAX / STEP);
        let (mut lo, mut hi);
        // (a margin of 0 is a garden that holds nothing: a floor below MIN would look for its margin at no health at all)
        if let Some(f) = floor { let f = f.max(MIN); if !self.holds(gd, f, plays) { return None; } lo = f; hi = f64::NAN; }
        else if self.holds(gd, guess, plays) { lo = guess; hi = f64::NAN; } else { lo = f64::NAN; hi = guess; }
        if lo.is_nan() { // it fails there: down till it holds
            let mut s = hi / STEP; while s > MIN && !self.holds(gd, s, plays) { hi = s; s /= STEP; }
            if s <= MIN { return Some(0.0); } lo = s;
        }
        if hi.is_nan() { let mut s = lo * STEP; while s < MAX && self.holds(gd, s, plays) { lo = s; s *= STEP; } if s >= MAX { return Some(MAX); } hi = s; }
        while hi / lo > PREC { let m = (lo * hi).sqrt(); if self.holds(gd, m, plays) { lo = m; } else { hi = m; } }
        Some(lo)
    }
}

// ---- the search ----

pub struct Rng(u64);
impl Rng {
    pub fn new(s: u64) -> Rng { Rng(s.wrapping_mul(0x9E3779B97F4A7C15) | 1) }
    fn next(&mut self) -> u64 { let mut x = self.0; x ^= x >> 12; x ^= x << 25; x ^= x >> 27; self.0 = x; x.wrapping_mul(0x2545F4914F6CDD1D) }
    fn f(&mut self) -> f64 { (self.next() >> 11) as f64 / (1u64 << 53) as f64 }
    fn n(&mut self, n: usize) -> usize { if n == 0 { 0 } else { (self.next() % n as u64) as usize } }
    fn pick<T: Copy>(&mut self, v: &[T]) -> T { v[self.n(v.len())] }
}

// What the search of one wave works with: the level, the dew, the plants it may use (one kind only for a garden of one plant).
struct Ctx<'a> { d: &'a Data, info: &'a LevelInfo, budget: f64, specs: Vec<Spec> }
impl<'a> Ctx<'a> {
    fn new(d: &'a Data, info: &'a LevelInfo, budget: f64, only: Option<u8>) -> Ctx<'a> { Ctx { d, info, budget, specs: info.specs.iter().cloned().filter(|s| only.map_or(true, |k| s.kind == k)).collect() } }
    fn cheapest(&self) -> Spec { *self.specs.iter().filter(|s| s.tier == 0).min_by(|a, b| tier_cost(self.d, **a).partial_cmp(&tier_cost(self.d, **b)).unwrap()).unwrap() }
    fn open(&self, s: Spec) -> bool { self.specs.contains(&s) }
    fn feasible(&self) -> Vec<usize> { let c = tier_cost(self.d, self.cheapest()); (0..self.info.mazes.len()).filter(|&m| self.info.mazes[m].walls.len() as f64 * c <= self.budget).collect() }
    fn up(&self, s: Spec, r: &mut Rng) -> Option<Spec> {
        let next: &[u8] = match s.tier { 0 => &[1], 1 => &[2, 4], 2 => &[3], 4 => &[5], _ => &[] };
        let open: Vec<u8> = next.iter().cloned().filter(|&t| self.open(Spec { kind: s.kind, tier: t })).collect();
        if open.is_empty() { None } else { Some(Spec { kind: s.kind, tier: r.pick(&open) }) }
    }
    fn down(&self, s: Spec) -> Option<Spec> { let t = match s.tier { 1 => 0, 2 | 4 => 1, 3 => 2, 5 => 4, _ => return None }; Some(Spec { kind: s.kind, tier: t }) }
    fn slot(&self, gd: &Garden, r: &mut Rng) -> Option<usize> {
        let m = &self.info.mazes[gd.maze];
        for _ in 0..12 { let mut x = r.f() * m.slot_sum; for &(k, w) in &m.slots { x -= w; if x <= 0.0 { if !gd.cells.iter().any(|c| c.0 == k) { return Some(k); } break; } } }
        None
    }
    // a spec like the ones the garden has (most of the time), at level 1
    fn kin(&self, gd: &Garden, r: &mut Rng) -> Spec {
        if !gd.cells.is_empty() && r.f() < 0.75 { let k = gd.cells[r.n(gd.cells.len())].1.kind; return Spec { kind: k, tier: 0 }; }
        Spec { kind: r.pick(&self.info.kinds.iter().cloned().filter(|&k| self.specs.iter().any(|s| s.kind == k)).collect::<Vec<u8>>()), tier: 0 }
    }
    // the dew spent to the last that buys something: plants grown and planted beside the trail
    fn fill(&self, gd: &mut Garden, r: &mut Rng) {
        let mut left = self.budget - gd.cost(self.d); let mut misses = 0;
        while misses < 14 {
            if r.f() < 0.55 && !gd.cells.is_empty() {
                let c = r.n(gd.cells.len()); let s = gd.cells[c].1;
                if let Some(u) = self.up(s, r) { let dc = tier_cost(self.d, u) - tier_cost(self.d, s); if dc <= left { gd.cells[c].1 = u; left -= dc; misses = 0; continue; } }
            } else if let Some(k) = self.slot(gd, r) {
                let s = self.kin(gd, r); let c = tier_cost(self.d, s); if c <= left { gd.cells.push((k, s)); left -= c; misses = 0; continue; }
            }
            misses += 1;
        }
        gd.norm();
    }
    // back within the dew: plants cut down a level, the ones off the walls taken out, walls made the cheapest
    fn repair(&self, gd: &mut Garden, r: &mut Rng) -> bool {
        let cheap = self.cheapest(); let mut cost; let mut tries = 0;
        let m = &self.info.mazes[gd.maze];
        // a plant of a kind not open here is not a plant of this garden
        for c in gd.cells.iter_mut() { if !self.open(c.1) { c.1 = Spec { kind: if self.specs.iter().any(|s| s.kind == c.1.kind) { c.1.kind } else { cheap.kind }, tier: 0 }; } }
        gd.cells.retain(|c| m.wall[c.0] || m.slots.iter().any(|s| s.0 == c.0));
        for &w in &m.walls { if !gd.cells.iter().any(|c| c.0 == w) { gd.cells.push((w, cheap)); } }
        gd.norm(); cost = gd.cost(self.d);
        while cost > self.budget + 1e-9 && tries < 4000 {
            tries += 1; let c = r.n(gd.cells.len()); let (k, s) = gd.cells[c];
            if let Some(dn) = self.down(s) { gd.cells[c].1 = dn; }
            else if !m.wall[k] { gd.cells.remove(c); }
            else if s != cheap { gd.cells[c].1 = cheap; }
            cost = gd.cost(self.d);
        }
        cost <= self.budget + 1e-9
    }
    fn random(&self, r: &mut Rng) -> Option<Garden> {
        let ms = self.feasible(); if ms.is_empty() { return None; }
        // long mazes more often: most of the dew of a wave goes beyond its walls
        let mut by_len = ms.clone(); by_len.sort_by_key(|&m| self.info.mazes[m].len);
        let maze = if r.f() < 0.6 { by_len[by_len.len() - 1 - r.n((by_len.len() + 3) / 4)] } else { r.pick(&ms) };
        let kinds: Vec<u8> = self.info.kinds.iter().cloned().filter(|&k| self.specs.iter().any(|s| s.kind == k)).collect();
        let pal: Vec<u8> = (0..1 + r.n(3)).map(|_| r.pick(&kinds)).collect();
        let mut gd = Garden { maze, cells: self.info.mazes[maze].walls.iter().map(|&w| (w, Spec { kind: r.pick(&pal), tier: 0 })).collect() };
        gd.norm(); if !self.repair(&mut gd, r) { return None; }
        self.fill(&mut gd, r); Some(gd)
    }
    // a family put into a garden: k of its cells (the best placed off the walls first, now and then any) become that
    // family, at the top of it the dew allows (a branch at 4, else 3; a plant at 2), and the rest is cut back to the dew
    fn inject(&self, gd: &mut Garden, fam: usize, k: usize, r: &mut Rng) {
        let kind = (fam / 3) as u8; let br = (fam % 3) as u8;
        let tiers: &[u8] = match br { 0 => &[1, 0], 1 => &[3, 2], _ => &[5, 4] };
        let Some(&t) = tiers.iter().find(|&&t| self.open(Spec { kind, tier: t })) else { return };
        let m = &self.info.mazes[gd.maze];
        let value = |c: usize| m.slots.iter().find(|s| s.0 == c).map_or(0.5, |s| s.1);
        let mut ix: Vec<usize> = (0..gd.cells.len()).collect();
        if r.f() < 0.7 { ix.sort_by(|&a, &b| value(gd.cells[b].0).partial_cmp(&value(gd.cells[a].0)).unwrap()); } else { for q in (1..ix.len()).rev() { ix.swap(q, r.n(q + 1)); } }
        for &c in ix.iter().take(k) { gd.cells[c].1 = Spec { kind, tier: t }; }
    }
    fn families(&self) -> Vec<usize> { let mut f: Vec<usize> = self.specs.iter().map(|s| s.family()).collect(); f.sort(); f.dedup(); f }
    // two gardens cut along a column or a row: one side of the first, the other of the second (on the first's maze)
    fn cross(&self, a: &Garden, b: &Garden, r: &mut Rng) -> Option<Garden> {
        let m = &self.info.mazes[a.maze]; let rows = r.f() < 0.4;
        let cut = if rows { 1 + r.n(ROWS as usize - 1) } else { 1 + r.n(COLS as usize - 1) } as i32; let first = r.f() < 0.5;
        let side = |k: usize| { let (i, j) = ij(k); (if rows { j } else { i } < cut) == first };
        let mut cells: Vec<(usize, Spec)> = a.cells.iter().cloned().filter(|c| side(c.0)).collect();
        cells.extend(b.cells.iter().cloned().filter(|c| !side(c.0) && (m.wall[c.0] || m.slots.iter().any(|s| s.0 == c.0))));
        for &(k, s) in &a.cells { if m.wall[k] && !cells.iter().any(|c| c.0 == k) { cells.push((k, s)); } }
        let mut gd = Garden { maze: a.maze, cells }; gd.norm();
        if !self.repair(&mut gd, r) { return None; } self.fill(&mut gd, r);
        if gd == *a || gd == *b { None } else { Some(gd) }
    }
    fn mutate(&self, src: &Garden, r: &mut Rng) -> Option<Garden> {
        let mut gd = src.clone(); let only = self.specs.iter().all(|s| s.kind == self.specs[0].kind);
        for _ in 0..1 + r.n(3) {
            if gd.cells.is_empty() { break; }
            let m = &self.info.mazes[gd.maze];
            match r.n(100) {
                0..=21 => { let c = r.n(gd.cells.len()); gd.cells[c].1 = r.pick(&self.specs); }
                22..=41 => { let c = r.n(gd.cells.len()); let s = gd.cells[c].1; if let Some(x) = if r.f() < 0.5 { self.up(s, r) } else { self.down(s) } { gd.cells[c].1 = x; } }
                42..=55 => { let (a, b) = (r.n(gd.cells.len()), r.n(gd.cells.len())); let t = gd.cells[a].1; gd.cells[a].1 = gd.cells[b].1; gd.cells[b].1 = t; }
                56..=67 => { let ex: Vec<usize> = (0..gd.cells.len()).filter(|&c| !m.wall[gd.cells[c].0]).collect(); if !ex.is_empty() { if let Some(k) = self.slot(&gd, r) { let c = r.pick(&ex); gd.cells[c].0 = k; } } }
                68..=75 => { let ex: Vec<usize> = (0..gd.cells.len()).filter(|&c| !m.wall[gd.cells[c].0]).collect(); if !ex.is_empty() { gd.cells.remove(r.pick(&ex)); } }
                76..=81 => if !only { let fs = self.families(); let f = r.pick(&fs); let k = 1 + r.n(4); self.inject(&mut gd, f, k, r); },
                82..=87 => if !only { // every plant of one family becomes another
                    let from = gd.cells[r.n(gd.cells.len())].1; let to = r.pick(&self.specs);
                    for c in gd.cells.iter_mut() { if c.1.family() == from.family() { let t = if to.br() == 0 { c.1.tier.min(1) } else if c.1.tier < 2 { c.1.tier } else { (if to.br() == 1 { 2 } else { 4 }) + (c.1.tier % 2 == 1) as u8 }; let x = Spec { kind: to.kind, tier: t }; if self.open(x) { c.1 = x; } } }
                },
                _ => { // another maze: the walls they share keep their plants, the new ones take plants like the old walls had
                    let ms = self.feasible(); if ms.is_empty() { continue; }
                    let len = m.len as i64;
                    let near: Vec<usize> = ms.iter().cloned().filter(|&x| x != gd.maze && (self.info.mazes[x].len as i64 - len).abs() <= 4).collect();
                    let nm = if !near.is_empty() && r.f() < 0.7 { r.pick(&near) } else { r.pick(&ms) };
                    let old_walls: Vec<Spec> = gd.cells.iter().filter(|c| m.wall[c.0]).map(|c| c.1).collect();
                    let to = &self.info.mazes[nm];
                    let mut cells: Vec<(usize, Spec)> = gd.cells.iter().cloned().filter(|c| to.wall[c.0] || to.slots.iter().any(|s| s.0 == c.0)).collect();
                    for &w in &to.walls { if !cells.iter().any(|c| c.0 == w) { cells.push((w, if old_walls.is_empty() { self.cheapest() } else { r.pick(&old_walls) })); } }
                    gd = Garden { maze: nm, cells }; gd.norm();
                }
            }
        }
        gd.norm(); if !self.repair(&mut gd, r) { return None; }
        self.fill(&mut gd, r);
        if gd == *src { return None; }
        Some(gd)
    }
}

// The niche of a garden: the families of plants that take at least SHARE of its dew (bits of family), or its two
// biggest when none does.
const SHARE: f64 = 0.15;
fn mix_of(d: &Data, gd: &Garden) -> Vec<f64> {
    let mut v = vec![0.0; d.plants.len() * 3]; let mut t = 0.0;
    for &(_, s) in &gd.cells { let c = tier_cost(d, s); v[s.family()] += c; t += c; }
    if t > 0.0 { for x in v.iter_mut() { *x /= t; } } v
}
fn niche(mix: &[f64]) -> u64 {
    let mut m = 0u64; for (f, &x) in mix.iter().enumerate() { if x >= SHARE { m |= 1 << f; } }
    if m == 0 { let mut ix: Vec<usize> = (0..mix.len()).collect(); ix.sort_by(|&a, &b| mix[b].partial_cmp(&mix[a]).unwrap()); m = (1 << ix[0]) | (1 << ix[1]); }
    m
}

#[derive(Clone)]
pub struct Elite { pub gd: Garden, pub margin: f64, pub niche: u64, pub gen: u64, pub busy: bool, pub id: u64 }
static IDS: AtomicU64 = AtomicU64::new(1);
fn new_id() -> u64 { IDS.fetch_add(1, Ordering::Relaxed) }
pub struct Problem {
    pub level: usize, pub wave: usize, pub budget: f64, pub gen: u64,
    pub arch: Vec<Elite>,        // one elite a niche, the best first
    pub mono: Vec<Option<Elite>>, // the best garden of one plant only, by plant
    pub tried: usize, pub plays: usize, pub dirty: bool,
}
const KEEP: usize = 48;
impl Problem {
    fn best(&self) -> f64 { self.arch.iter().filter(|e| e.gen == self.gen).map(|e| e.margin).fold(0.0, f64::max) }
    // a garden found to hold at margin m: it takes its niche if it does better there
    fn offer(&mut self, e: Elite) -> bool {
        let mut took = false;
        if let Some(x) = self.arch.iter_mut().find(|x| x.niche == e.niche) { if x.gen != e.gen || e.margin >= x.margin { if !x.busy { *x = e.clone(); took = true; } } }
        else { self.arch.push(e.clone()); took = true; }
        if took { self.arch.sort_by(|a, b| b.margin.partial_cmp(&a.margin).unwrap()); if self.arch.len() > KEEP { self.arch.truncate(KEEP); } self.dirty = true; }
        took
    }
    fn offer_mono(&mut self, kind: usize, e: Elite) {
        let better = self.mono[kind].as_ref().map_or(true, |x| x.gen != e.gen || e.margin >= x.margin);
        if better { self.mono[kind] = Some(e); self.dirty = true; }
    }
}

// What every worker reads: the game, the levels, the perks; a new one comes with every `data`.
pub struct World { pub gen: u64, pub d: Data, pub infos: Vec<LevelInfo>, pub metas: Vec<Vec<(String, usize)>>, pub tol: f64, pub seeds: usize }
struct Engine {
    world: RwLock<Option<Arc<World>>>,
    problems: RwLock<Vec<Arc<Mutex<Problem>>>>,
    focus: Mutex<(i64, i64)>, caps: Mutex<(usize, usize)>,
    plays: AtomicU64, gen: AtomicU64, idle: AtomicBool, out: Mutex<()>,
}
impl Engine {
    fn say(&self, line: &str) { let _l = self.out.lock().unwrap(); let mut o = std::io::stdout().lock(); let _ = o.write_all(line.as_bytes()); let _ = o.write_all(b"\n"); let _ = o.flush(); }
}

fn garden_json(w: &World, level: usize, e: &Elite, stale: bool) -> String {
    let d = &w.d; let m = &w.infos[level].mazes[e.gd.maze];
    let list = |v: &[usize]| v.iter().map(|k| k.to_string()).collect::<Vec<_>>().join(",");
    let cells: Vec<String> = e.gd.cells.iter().map(|&(k, s)| format!("[{},\"{}\",{}]", k, d.plants[s.kind as usize].name, s.tier)).collect();
    let mix = mix_of(d, &e.gd);
    let mixs: Vec<String> = mix.iter().enumerate().filter(|x| *x.1 > 0.0).map(|(f, x)| format!("\"{}\":{:.3}", family_name(d, f), x)).collect();
    format!("{{\"m\":{:.4},\"cost\":{},\"len\":{},\"walls\":[{}],\"trail\":[{}],\"cells\":[{}],\"mix\":{{{}}},\"stale\":{}}}",
        e.margin, e.gd.cost(d), m.len, list(&m.walls), list(&m.trail), cells.join(","), mixs.join(","), stale)
}
fn report(eng: &Engine, w: &World, p: &Problem) {
    let top: Vec<String> = p.arch.iter().take(12).map(|e| garden_json(w, p.level, e, e.gen != p.gen)).collect();
    let mono: Vec<String> = p.mono.iter().enumerate().filter_map(|(k, e)| e.as_ref().map(|e| format!("\"{}\":{}", w.d.plants[k].name, garden_json(w, p.level, e, e.gen != p.gen)))).collect();
    let stale = p.arch.iter().filter(|e| e.gen != p.gen).count() + p.mono.iter().flatten().filter(|e| e.gen != p.gen).count();
    let info = &w.infos[p.level];
    eng.say(&format!("{{\"t\":\"wave\",\"gen\":{},\"level\":{},\"wave\":{},\"trailBase\":{},\"trailMax\":{},\"budget\":{},\"tried\":{},\"plays\":{},\"stale\":{},\"niches\":{},\"top\":[{}],\"mono\":{{{}}}}}",
        p.gen, p.level, p.wave, info.base, info.max, p.budget, p.tried, p.plays, stale, p.arch.len(), top.join(","), mono.join(",")));
}

// One piece of work: an elite to play again on new data, or a new garden to try.
enum Job { Again { mono: Option<usize>, id: u64, gd: Garden, guess: f64 }, Try { gd: Garden, floor: Option<f64>, guess: f64, mono: Option<usize> } }

fn pick_problem(eng: &Engine, w: &World) -> Option<Arc<Mutex<Problem>>> {
    let ps = eng.problems.read().unwrap(); let (fl, fw) = *eng.focus.lock().unwrap(); let (cap_f, cap_o) = *eng.caps.lock().unwrap();
    let weight = |p: &Problem| -> f64 { if p.level as i64 == fl { if p.wave as i64 == fw { 60.0 } else { 8.0 } } else { 1.0 } };
    let mut best: Option<(f64, Arc<Mutex<Problem>>)> = None;
    for pm in ps.iter() {
        let p = pm.lock().unwrap(); if p.gen != w.gen { continue; }
        let stale = p.arch.iter().any(|e| e.gen != p.gen && !e.busy) || p.mono.iter().flatten().any(|e| e.gen != p.gen && !e.busy);
        let cap = if p.level as i64 == fl { cap_f } else { cap_o };
        // work goes by weight: the wave looked at most, its level next, the rest a little; on a wave, what was found
        // before is played again first (that is work too, and counts as such)
        if !stale && p.tried >= cap { continue; }
        let score = (p.tried as f64 + 1.0) / weight(&p);
        if best.as_ref().map_or(true, |b| score < b.0) { best = Some((score, pm.clone())); }
    }
    best.map(|b| b.1)
}

fn job_of(w: &World, p: &mut Problem, r: &mut Rng, migrant: Option<(Garden, Option<usize>)>) -> Option<Job> {
    let info = &w.infos[p.level];
    if let Some(ix) = p.arch.iter().position(|e| e.gen != p.gen && !e.busy) { p.tried += 1; p.arch[ix].busy = true; let e = &p.arch[ix]; return Some(Job::Again { mono: None, id: e.id, gd: e.gd.clone(), guess: e.margin }); }
    if let Some(k) = (0..p.mono.len()).find(|&k| p.mono[k].as_ref().map_or(false, |e| e.gen != p.gen && !e.busy)) { p.tried += 1; let e = p.mono[k].as_mut().unwrap(); e.busy = true; return Some(Job::Again { mono: Some(k), id: 0, gd: e.gd.clone(), guess: e.margin }); }
    let best = p.best(); p.tried += 1;
    // a garden of the wave before or after, grown to the dew of this one or cut back to it: neighbouring waves want
    // much the same garden, and what one found the others start from
    if let Some((mut gd, mono)) = migrant {
        let cx = Ctx::new(&w.d, info, p.budget, mono.map(|k| k as u8));
        if cx.repair(&mut gd, r) { cx.fill(&mut gd, r); if r.f() < 0.5 { if let Some(x) = cx.mutate(&gd, r) { gd = x; } }
            let (floor, guess) = match mono { Some(k) => { let f = p.mono[k].as_ref().map(|e| e.margin); (f, f.unwrap_or(1.0)) } None => { let nk = niche(&mix_of(&w.d, &gd)); let f = p.arch.iter().find(|e| e.niche == nk).map(|e| e.margin).or(if best > 0.0 { Some(best * 0.5) } else { None }); (f, f.unwrap_or(1.0)) } };
            return Some(Job::Try { gd, floor, guess, mono });
        }
    }
    // at the start of a wave, a garden built round every family in turn (a few of each): every family gets looked at,
    // not only the ones a random start happens on
    { let cx = Ctx::new(&w.d, info, p.budget, None); let fs = cx.families();
      if p.tried <= fs.len() * 3 { let f = fs[p.tried % fs.len()];
        if let Some(mut gd) = cx.random(r) { let k = (gd.cells.len() as f64 * (0.3 + 0.3 * r.f())).ceil() as usize; cx.inject(&mut gd, f, k, r);
          if cx.repair(&mut gd, r) { cx.fill(&mut gd, r); let nk = niche(&mix_of(&w.d, &gd)); let floor = p.arch.iter().find(|e| e.niche == nk).map(|e| e.margin).or(if best > 0.0 { Some(best * 0.5) } else { None });
            return Some(Job::Try { guess: floor.unwrap_or(1.0), floor, gd, mono: None }); } } } }
    // a garden of one plant now and then: the measure the mixed ones are held against
    if r.f() < 0.18 {
        let k = r.pick(&info.kinds) as usize; let cx = Ctx::new(&w.d, info, p.budget, Some(k as u8));
        let gd = match &p.mono[k] { Some(e) if r.f() < 0.85 => cx.mutate(&e.gd, r)?, _ => cx.random(r)? };
        let floor = p.mono[k].as_ref().map(|e| e.margin);
        return Some(Job::Try { guess: floor.unwrap_or(best.max(0.3) * 0.6), floor, gd, mono: Some(k) });
    }
    let cx = Ctx::new(&w.d, info, p.budget, None);
    let gd = if p.arch.len() < 6 || r.f() < 0.08 { cx.random(r)? } else {
        // parents: the best few most of the time, any niche the rest
        let ix = if r.f() < 0.5 { r.n(p.arch.len().min(5)) } else { r.n(p.arch.len()) };
        if r.f() < 0.2 { let jx = r.n(p.arch.len().min(8)); cx.cross(&p.arch[ix].gd, &p.arch[jx].gd, r)? } else { cx.mutate(&p.arch[ix].gd, r)? }
    };
    let nk = niche(&mix_of(&w.d, &gd));
    let floor = match p.arch.iter().find(|e| e.niche == nk) { Some(e) => Some(e.margin), None => if p.arch.len() >= KEEP { Some(p.arch.last().unwrap().margin) } else if best > 0.0 { Some(best * 0.5) } else { None } };
    Some(Job::Try { guess: floor.unwrap_or(1.0), floor, gd, mono: None })
}

// a good garden of a wave next to this one (one of its best few, or its best of one plant)
fn neighbour(eng: &Engine, gen: u64, level: usize, wave: usize, r: &mut Rng) -> Option<(Garden, Option<usize>)> {
    let to = if r.f() < 0.5 { wave.wrapping_sub(1) } else { wave + 1 };
    let pm = eng.problems.read().unwrap().iter().find(|p| { let p = p.lock().unwrap(); p.level == level && p.wave == to }).cloned()?;
    let p = pm.lock().unwrap(); if p.gen != gen { return None; } // a garden of another game: its maze is another's
    if r.f() < 0.2 { let ks: Vec<usize> = (0..p.mono.len()).filter(|&k| p.mono[k].is_some()).collect(); if ks.is_empty() { return None; } let k = r.pick(&ks); return Some((p.mono[k].as_ref().unwrap().gd.clone(), Some(k))); }
    if p.arch.is_empty() { return None; }
    Some((p.arch[r.n(p.arch.len().min(5))].gd.clone(), None))
}

fn work(eng: &Engine, seed: u64) {
    let mut r = Rng::new(seed);
    // a piece of work that breaks is said and dropped; the worker goes on
    loop {
        let res = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| work_once(eng, &mut r)));
        if let Err(e) = res { let msg = e.downcast_ref::<String>().cloned().or_else(|| e.downcast_ref::<&str>().map(|s| s.to_string())).unwrap_or_else(|| "panic".into()); eng.say(&format!("{{\"t\":\"error\",\"msg\":{:?}}}", format!("worker: {}", msg))); }
    }
}
fn work_once(eng: &Engine, r: &mut Rng) {
    {
        let Some(w) = eng.world.read().unwrap().clone() else { std::thread::sleep(Duration::from_millis(50)); return };
        let Some(pm) = pick_problem(eng, &w) else { eng.idle.store(true, Ordering::Relaxed); std::thread::sleep(Duration::from_millis(60)); return };
        eng.idle.store(false, Ordering::Relaxed);
        let (level, wave) = { let p = pm.lock().unwrap(); (p.level, p.wave) };
        let migrant = if r.f() < 0.3 { neighbour(eng, w.gen, level, wave, r) } else { None };
        let (job, budget) = { let mut p = pm.lock().unwrap(); let j = job_of(&w, &mut p, r, migrant); (j, p.budget) };
        let Some(job) = job else { return };
        let judge = Judge { d: &w.d, level, wave, meta: &w.metas[level], info: &w.infos[level], tol: w.tol, seeds: seeds_of(&w.d, level, wave, w.seeds) };
        let mut plays = 0;
        match job {
            Job::Again { mono, id, mut gd, guess } => {
                // on new data the dew may be less: the garden is cut back to it (or grown to it) first
                let cx = Ctx::new(&w.d, &w.infos[level], budget, mono.map(|k| k as u8));
                if gd.cost(&w.d) > budget || gd.cost(&w.d) < budget * 0.9 { let _ = cx.repair(&mut gd, r); cx.fill(&mut gd, r); }
                let m = judge.margin(&gd, guess, None, &mut plays).unwrap_or(0.0);
                eng.plays.fetch_add(plays as u64, Ordering::Relaxed);
                let mut p = pm.lock().unwrap(); if p.gen != w.gen { return; } p.plays += plays;
                let e = Elite { niche: niche(&mix_of(&w.d, &gd)), gd, margin: m, gen: w.gen, busy: false, id: new_id() };
                match mono {
                    Some(k) => { p.mono[k] = None; p.offer_mono(k, e); }
                    None => { p.arch.retain(|x| x.id != id); p.offer(e); }
                }
                p.dirty = true;
            }
            Job::Try { gd, floor, guess, mono } => {
                let m = judge.margin(&gd, guess, floor, &mut plays);
                eng.plays.fetch_add(plays as u64, Ordering::Relaxed);
                let mut p = pm.lock().unwrap(); if p.gen != w.gen { return; } p.plays += plays;
                if let Some(m) = m {
                    let e = Elite { niche: niche(&mix_of(&w.d, &gd)), gd, margin: m, gen: w.gen, busy: false, id: new_id() };
                    if let Some(k) = mono { p.offer_mono(k, e.clone()); }
                    p.offer(e);
                }
            }
        }
    }
}

fn kind_ix(d: &Data, name: &str) -> Option<usize> { d.plants.iter().position(|p| p.name == name) }

// a new game: the levels counted again, the problems kept where their level and wave still are, everything found marked
// to be played again
fn load(eng: &Engine, j: &J) {
    let d = Data::read(j.at("data"));
    let metas: Vec<Vec<(String, usize)>> = (0..d.levels.len()).map(|n| j.get("meta").and_then(|m| m.arr().get(n)).map_or(Vec::new(), |m| m.arr().iter().map(|x| { let a = x.arr(); (a[0].str().to_string(), a[1].num() as usize) }).collect())).collect();
    let tol = j.get("tol").map_or(0.0, |v| v.num()); let early = j.get("early").map_or(false, |v| v.truthy());
    let infos: Vec<LevelInfo> = std::thread::scope(|s| { let hs: Vec<_> = (0..d.levels.len()).map(|n| { let d = &d; s.spawn(move || level_info(d, n)) }).collect(); hs.into_iter().map(|h| h.join().unwrap()).collect() });
    let gen = eng.gen.fetch_add(1, Ordering::SeqCst) + 1;
    let old = eng.world.read().unwrap().clone();
    let seeds = j.get("seeds").map_or(3, |v| v.num() as usize);
    let w = Arc::new(World { gen, d, infos, metas, tol, seeds });
    let mut ps = eng.problems.write().unwrap();
    let mut next: Vec<Arc<Mutex<Problem>>> = Vec::new();
    for (n, lv) in w.d.levels.iter().enumerate() {
        for wave in 1..=lv.waves.len() {
            let budget = budget(&w.d, n, wave, &w.metas[n], early);
            let pm = ps.iter().find(|p| { let p = p.lock().unwrap(); p.level == n && p.wave == wave }).cloned()
                .unwrap_or_else(|| Arc::new(Mutex::new(Problem { level: n, wave, budget, gen, arch: Vec::new(), mono: vec![None; w.d.plants.len()], tried: 0, plays: 0, dirty: true })));
            {
                let mut p = pm.lock().unwrap();
                // a garden goes over by its walls: the same maze, found again in the new pool by its walls
                let remap = |e: &mut Elite| -> bool {
                    let Some(o) = &old else { return true };
                    let Some(om) = o.infos.get(n).and_then(|i| i.mazes.get(e.gd.maze)) else { return false };
                    match w.infos[n].mazes.iter().position(|m| m.walls == om.walls) { Some(x) => { e.gd.maze = x; true } None => false }
                };
                let mut arch = std::mem::take(&mut p.arch); arch.retain_mut(|e| { e.busy = false; remap(e) }); p.arch = arch;
                let mut mono = std::mem::take(&mut p.mono); mono.resize(w.d.plants.len(), None);
                for e in mono.iter_mut() { if let Some(x) = e { x.busy = false; if !remap(x) { *e = None; } } }
                p.mono = mono; p.budget = budget; p.gen = gen; p.tried = 0; p.dirty = true;
            }
            next.push(pm);
        }
    }
    *ps = next; drop(ps);
    *eng.world.write().unwrap() = Some(w);
    eng.say(&format!("{{\"t\":\"ready\",\"gen\":{}}}", gen));
}

fn seed(eng: &Engine, j: &J) {
    let Some(w) = eng.world.read().unwrap().clone() else { return };
    let (level, wave) = (j.at("level").num() as usize, j.at("wave").num() as usize);
    let Some(pm) = eng.problems.read().unwrap().iter().find(|p| { let p = p.lock().unwrap(); p.level == level && p.wave == wave }).cloned() else { return };
    let info = &w.infos[level];
    for g in j.at("gardens").arr() {
        let mut walls: Vec<usize> = g.at("walls").arr().iter().map(|x| x.num() as usize).collect(); walls.sort();
        let Some(maze) = info.mazes.iter().position(|m| m.walls == walls) else { continue };
        let cells: Option<Vec<(usize, Spec)>> = g.at("cells").arr().iter().map(|c| { let a = c.arr(); kind_ix(&w.d, a[1].str()).map(|k| (a[0].num() as usize, Spec { kind: k as u8, tier: a[2].num() as u8 })) }).collect();
        let Some(cells) = cells else { continue };
        let mut gd = Garden { maze, cells }; gd.norm();
        let guess = g.get("m").map_or(1.0, |m| m.num());
        let mut p = pm.lock().unwrap();
        let e = Elite { niche: niche(&mix_of(&w.d, &gd)), gd: gd.clone(), margin: guess, gen: 0, busy: false, id: new_id() }; // gen 0: to be played on this game
        let kinds: Vec<u8> = gd.cells.iter().map(|c| c.1.kind).collect();
        if g.get("mono").map_or(false, |x| x.truthy()) && kinds.iter().all(|&k| k == kinds[0]) { let k = kinds[0] as usize; if p.mono[k].is_none() { p.mono[k] = Some(e); } }
        else if !p.arch.iter().any(|x| x.niche == e.niche) { p.arch.push(e); }
    }
}

// What every family of a garden does for it: the margin with that family taken out (its walls left as the cheapest
// plant, the rest of its plants gone, the dew not spent again), against the margin of the garden as it is.
fn explain(eng: &Engine, j: &J) {
    let Some(w) = eng.world.read().unwrap().clone() else { return };
    let (level, wave) = (j.at("level").num() as usize, j.at("wave").num() as usize); let id = j.get("id").map_or(0.0, |v| v.num());
    let info = &w.infos[level]; let g = j.at("garden");
    let mut walls: Vec<usize> = g.at("walls").arr().iter().map(|x| x.num() as usize).collect(); walls.sort();
    let Some(maze) = info.mazes.iter().position(|m| m.walls == walls) else { eng.say(&format!("{{\"t\":\"explain\",\"id\":{},\"error\":\"no such maze\"}}", id)); return };
    let cells: Vec<(usize, Spec)> = g.at("cells").arr().iter().filter_map(|c| { let a = c.arr(); kind_ix(&w.d, a[1].str()).map(|k| (a[0].num() as usize, Spec { kind: k as u8, tier: a[2].num() as u8 })) }).collect();
    let gd = Garden { maze, cells };
    let judge = Judge { d: &w.d, level, wave, meta: &w.metas[level], info, tol: w.tol, seeds: seeds_of(&w.d, level, wave, w.seeds) };
    let mut plays = 0; let base = judge.margin(&gd, g.get("m").map_or(1.0, |m| m.num()), None, &mut plays).unwrap_or(0.0);
    let cheap = Ctx::new(&w.d, info, f64::INFINITY, None).cheapest(); let m = &info.mazes[maze];
    let mut fams: Vec<usize> = gd.cells.iter().map(|c| c.1.family()).collect(); fams.sort(); fams.dedup();
    let out: Vec<String> = fams.iter().map(|&f| {
        let cells: Vec<(usize, Spec)> = gd.cells.iter().filter_map(|&(k, s)| if s.family() != f { Some((k, s)) } else if m.wall[k] { Some((k, if cheap.family() == f { s } else { cheap })) } else { None }).collect();
        let x = judge.margin(&Garden { maze, cells }, base, None, &mut plays).unwrap_or(0.0);
        format!("\"{}\":{:.4}", family_name(&w.d, f), x)
    }).collect();
    eng.plays.fetch_add(plays as u64, Ordering::Relaxed);
    eng.say(&format!("{{\"t\":\"explain\",\"id\":{},\"level\":{},\"wave\":{},\"base\":{:.4},\"without\":{{{}}},\"plays\":{}}}", id, level, wave, base, out.join(","), plays));
}

// A garden played again on other seeds of the game (where the flyers come from, where a boss's brood lands): its
// margin on each, for how far one seed's margin can be trusted.
fn verify(eng: &Engine, j: &J) {
    let Some(w) = eng.world.read().unwrap().clone() else { return };
    let (level, wave) = (j.at("level").num() as usize, j.at("wave").num() as usize); let id = j.get("id").map_or(0.0, |v| v.num());
    let info = &w.infos[level]; let g = j.at("garden");
    let mut walls: Vec<usize> = g.at("walls").arr().iter().map(|x| x.num() as usize).collect(); walls.sort();
    let Some(maze) = info.mazes.iter().position(|m| m.walls == walls) else { eng.say(&format!("{{\"t\":\"verify\",\"id\":{},\"error\":\"no such maze\"}}", id)); return };
    let cells: Vec<(usize, Spec)> = g.at("cells").arr().iter().filter_map(|c| { let a = c.arr(); kind_ix(&w.d, a[1].str()).map(|k| (a[0].num() as usize, Spec { kind: k as u8, tier: a[2].num() as u8 })) }).collect();
    let gd = Garden { maze, cells }; let guess = g.get("m").map_or(1.0, |m| m.num());
    let seeds: Vec<u32> = j.get("seeds").map_or((1..=8).collect(), |s| s.arr().iter().map(|x| x.num() as u32).collect());
    let ms: Vec<f64> = std::thread::scope(|sc| { let hs: Vec<_> = seeds.iter().map(|&seed| { let (w, gd, info) = (&w, &gd, info); sc.spawn(move || {
        let judge = Judge { d: &w.d, level, wave, meta: &w.metas[level], info, tol: w.tol, seeds: vec![seed] }; let mut plays = 0; judge.margin(gd, guess, None, &mut plays).unwrap_or(0.0) }) }).collect();
        hs.into_iter().map(|h| h.join().unwrap()).collect() });
    eng.say(&format!("{{\"t\":\"verify\",\"id\":{},\"level\":{},\"wave\":{},\"seeds\":[{}],\"margins\":[{}]}}", id, level, wave,
        seeds.iter().map(|s| s.to_string()).collect::<Vec<_>>().join(","), ms.iter().map(|m| format!("{:.4}", m)).collect::<Vec<_>>().join(",")));
}

pub fn serve(jobs: usize) {
    let eng = Arc::new(Engine { world: RwLock::new(None), problems: RwLock::new(Vec::new()), focus: Mutex::new((-1, -1)), caps: Mutex::new((6000, 600)),
        plays: AtomicU64::new(0), gen: AtomicU64::new(0), idle: AtomicBool::new(true), out: Mutex::new(()) });
    for t in 0..jobs.max(1) { let e = eng.clone(); std::thread::spawn(move || work(&e, 1 + t as u64)); }
    // the reporter: what changed, a few times a second, and how fast it goes
    { let e = eng.clone(); std::thread::spawn(move || { let mut last = (Instant::now(), 0u64); loop {
        std::thread::sleep(Duration::from_millis(250));
        let Some(w) = e.world.read().unwrap().clone() else { continue };
        let ps: Vec<Arc<Mutex<Problem>>> = e.problems.read().unwrap().clone();
        for pm in ps { let mut p = pm.lock().unwrap(); if p.dirty && p.gen == w.gen { p.dirty = false; report(&e, &w, &p); } }
        let now = (Instant::now(), e.plays.load(Ordering::Relaxed));
        let rate = (now.1 - last.1) as f64 / now.0.duration_since(last.0).as_secs_f64().max(1e-3);
        e.say(&format!("{{\"t\":\"status\",\"gen\":{},\"plays\":{},\"rate\":{:.0},\"idle\":{}}}", w.gen, now.1, rate, e.idle.load(Ordering::Relaxed))); last = now;
    } }); }
    let stdin = std::io::stdin();
    for line in stdin.lock().lines() {
        let Ok(line) = line else { break }; if line.trim().is_empty() { continue; }
        let j = match J::parse(&line) { Ok(j) => j, Err(e) => { eng.say(&format!("{{\"t\":\"error\",\"msg\":{:?}}}", e)); continue } };
        let res = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| match j.at("cmd").str() {
            "data" => load(&eng, &j),
            "focus" => { *eng.focus.lock().unwrap() = (j.get("level").map_or(-1, |v| if *v == J::Null { -1 } else { v.num() as i64 }), j.get("wave").map_or(-1, |v| if *v == J::Null { -1 } else { v.num() as i64 })); }
            "cap" => { let mut c = eng.caps.lock().unwrap(); if let Some(v) = j.get("focus") { c.0 = v.num() as usize; } if let Some(v) = j.get("other") { c.1 = v.num() as usize; } }
            "seed" => seed(&eng, &j),
            "verify" => { let e = eng.clone(); let j = j.clone(); std::thread::spawn(move || { let r = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| verify(&e, &j))); if r.is_err() { e.say("{\"t\":\"verify\",\"error\":\"failed\"}"); } }); }
            "explain" => { let e = eng.clone(); let j = j.clone(); std::thread::spawn(move || { let r = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| explain(&e, &j))); if r.is_err() { e.say("{\"t\":\"explain\",\"error\":\"failed\"}"); } }); }
            x => eng.say(&format!("{{\"t\":\"error\",\"msg\":\"unknown command {}\"}}", x)),
        }));
        if let Err(e) = res { let msg = e.downcast_ref::<String>().cloned().or_else(|| e.downcast_ref::<&str>().map(|s| s.to_string())).unwrap_or_else(|| "panic".into()); eng.say(&format!("{{\"t\":\"error\",\"msg\":{:?}}}", msg)); }
    }
}
