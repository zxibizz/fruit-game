// The simulation: public/game.js rule for rule. It must walk the same way to the last bit (sim/js/verify.mjs has
// game.js replay the parties played here), so the arithmetic keeps the order of the JS expressions and every list
// keeps the JS order. A rule changed there is changed here, and the other way round.
// What only the screen needs (hit flashes, events of shots, names of shots) is left out.
use crate::data::*;
use std::collections::VecDeque;

pub const INF: f64 = 1e9;
pub const DIRS: [(i32, i32); 4] = [(-1, 0), (0, -1), (0, 1), (1, 0)]; // tie order: towards the fruit side first
const THAW: f64 = 3.0;

#[inline] pub fn key(i: i32, j: i32) -> usize { (j * COLS + i) as usize }
#[inline] pub fn inside(i: i32, j: i32) -> bool { i >= 0 && j >= 0 && i < COLS && j < ROWS }
#[inline] pub fn within(dx: f64, dy: f64, r: f64) -> bool { dx * dx + dy * dy <= r * r }
#[inline] pub fn hyp(dx: f64, dy: f64) -> f64 { (dx * dx + dy * dy).sqrt() }
// Math.round
#[inline] pub fn round(x: f64) -> f64 { (x + 0.5).floor() }

#[derive(Clone, Copy, PartialEq, Debug)]
pub enum Cell { Empty, Rock, Weed, Plant(u32) }
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Phase { Build, Wave, Won, Lost }
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Power { Frost, Rain }

#[derive(Clone, Debug)]
// br: the branch at levels 3 and 4 (1: a, 2: b, 0 below); ward: the shell pumpkin that saves it once a wave; tgt, stk: the
// bug an icicle mint hit last and how many times in a row
pub struct Plant { pub id: u32, pub kind: usize, pub i: i32, pub j: i32, pub lvl: usize, pub br: u8, pub hp: f64, pub max_hp: f64, pub cd: f64, pub spent: f64, pub web: f64, pub guard: f64, pub spikes: f64, pub ward: Option<u32>, pub warded: bool, pub born: i32, pub tgt: u32, pub stk: f64 }
#[derive(Clone, Debug)]
pub struct Stub { pub id: u32, pub kind: usize, pub lvl: usize, pub br: u8, pub spent: f64, pub i: i32, pub j: i32, pub warded: bool }
#[derive(Clone, Debug)]
pub struct Bug {
    pub id: u32, pub kind: usize, pub hp: f64, pub max_hp: f64, pub speed: f64, pub fly: bool, pub armor: f64,
    pub x: f64, pub y: f64, pub slow: f64, pub frozen: f64, pub burn: f64, pub burn_dps: f64, pub chew: f64, pub thaw: f64, pub chew_cd: f64,
    pub chew_target: Option<u32>, pub gnaw: Option<u32>, pub gnaw_t: f64, pub dir: (i32, i32), pub has_t: bool, pub ti: i32, pub tj: i32,
    pub skill: f64, pub rush: f64, pub brood: bool, pub e: usize, pub mark: f64, pub mark_v: f64, pub coming: f64, pub gone: bool,
    pub slow_t: f64, pub slow_v: f64, pub melt: f64, pub spread: bool, pub chain: f64, pub lured: bool, pub lure: Option<u32>, pub sniff: f64, pub fall: f64, pub pricked: f64,
}
#[derive(Clone, Debug)]
pub struct Shot { pub id: u32, pub x: f64, pub y: f64, pub target: u32, pub tx: f64, pub ty: f64, pub speed: f64, pub dmg: f64, pub est: f64, pub splash: f64, pub hits: usize, pub mark: f64, pub chain: f64,
    pub frost: f64, pub frost_t: f64, pub burn: f64, pub burn_t: f64, pub melt: bool, pub crack: bool, pub down: f64, pub done: bool }
#[derive(Clone, Debug)]
pub struct Queued { pub kind: usize, pub at: f64, pub e: usize }
// what the bot reads of the events of the game
#[derive(Clone, Debug)]
pub enum Event { Kill { reward: f64 }, WaveDone { bonus: f64 }, PlantDead { i: i32, j: i32 }, Bite { kind: usize, brood: bool }, Power }
#[derive(Clone, Debug, Default)]
pub struct Stats { pub kills: f64, pub bites: f64, pub eaten: f64, pub earned: f64 }

#[derive(Clone)]
pub struct Game<'a> {
    pub d: &'a Data, pub lv: &'a Level, pub level: usize, pub seed: u32,
    pub meta: Vec<usize>, // the tier of the perk of every plant kind
    pub grid: [Cell; N], pub tiles: [Tile; N], pub entries: Vec<(i32, i32)>, pub fruit: (i32, i32),
    pub dew: f64, pub hp: f64, pub max_hp: f64, pub wave: usize, pub waves: usize, pub phase: Phase, pub next_in: Option<f64>,
    pub bugs: Vec<Bug>, pub shots: Vec<Shot>, pub plants: Vec<Plant>, pub stubs: Vec<Stub>, pub events: Vec<Event>, pub queue: VecDeque<Queued>,
    pub time: f64, pub wave_time: f64, pub frost: f64, pub rain: f64, pub power_max: f64, pub next_id: u32, rng: u32,
    pub refund: f64, pub dist: [f64; N], pub dig: [f64; N], pub stats: Stats,
    pub thorn: [f64; N], pub thorn_air: [f64; N], // the thorns of the pumpkins on every cell
    seen: Vec<(f64, usize)>,
    // the balance studio's knob (studio.rs): every bug that many times healthier; 1 everywhere else, and a product
    // with 1 is the number itself, so parties stay those of game.js to the bit
    pub hp_scale: f64,
    stat_tab: std::sync::Arc<Vec<f64>>,
    // the bugs by the cell they are on, counted at the start of the plants' turn of a step (bugs do not move in it):
    // a plant looks only at the bugs of the cells around it, in the order of the list as before (bk_n: how many bugs
    // there were then; the ones born since are looked at too)
    bk_start: Vec<u32>, bk_list: Vec<u32>, bk_n: usize, near_buf: Vec<usize>,
}

impl<'a> Game<'a> {
    // meta: the tiers of the perks bought, by name
    pub fn new(d: &'a Data, level: usize, seed: u32, meta: &[(String, usize)]) -> Game<'a> {
        let lv = &d.levels[level];
        let tier_of = |k: &str| meta.iter().find(|(n, _)| n == k).map_or(0, |(_, t)| *t);
        let tier = |k: &str| { let t = tier_of(k); if t > 0 { d.perk(k).unwrap_or_else(|| panic!("no perk {}", k)).v[t - 1] } else { 0.0 } };
        let hp = d.fruit_hp + tier("heart"); let clouds = tier("clouds");
        let refund = tier("refund");
        let mut g = Game {
            d, lv, level, seed, meta: d.plants.iter().map(|p| tier_of(&p.name)).collect(),
            grid: [Cell::Empty; N], tiles: [Tile::None; N], entries: lv.entries.iter().map(|&j| (COLS - 1, j)).collect(), fruit: lv.fruit,
            dew: lv.dew + tier("dew"), hp, max_hp: hp, wave: 0, waves: lv.waves.len(), phase: Phase::Build, next_in: None,
            bugs: Vec::new(), shots: Vec::new(), plants: Vec::new(), stubs: Vec::new(), events: Vec::new(), queue: VecDeque::new(),
            time: 0.0, wave_time: 0.0, frost: 1.0 + clouds, rain: 1.0 + clouds, power_max: d.power_max + clouds, next_id: 1, rng: seed,
            refund: if refund != 0.0 { refund } else { d.refund },
            dist: [INF; N], dig: [INF; N], stats: Stats::default(), seen: Vec::new(), thorn: [0.0; N], thorn_air: [0.0; N], hp_scale: 1.0, stat_tab: std::sync::Arc::new(Vec::new()),
            bk_start: vec![0; BK_W * BK_H + 1], bk_list: Vec::new(), bk_n: 0, near_buf: Vec::new(),
        };
        g.stat_tab = std::sync::Arc::new(Self::stat_table(d, &g.meta));
        for &(i, j, weed) in &lv.obstacles { g.grid[key(i, j)] = if weed { Cell::Weed } else { Cell::Rock }; }
        for &(i, j, t) in &lv.tiles { g.tiles[key(i, j)] = t; }
        g.refresh();
        g
    }

    // mulberry32
    fn rand(&mut self) -> f64 {
        self.rng = self.rng.wrapping_add(0x6D2B79F5); let a = self.rng;
        let mut t = (a ^ (a >> 15)).wrapping_mul(1 | a);
        t = t.wrapping_add((t ^ (t >> 7)).wrapping_mul(61 | t)) ^ t;
        ((t ^ (t >> 14)) as f64) / 4294967296.0
    }

    #[inline] pub fn over(&self) -> bool { self.phase == Phase::Won || self.phase == Phase::Lost }
    #[inline] pub fn pidx(&self, id: u32) -> Option<usize> { self.plants.iter().position(|p| p.id == id) }
    #[inline] pub fn plant_at(&self, i: i32, j: i32) -> Option<usize> { if !inside(i, j) { return None; } if let Cell::Plant(id) = self.grid[key(i, j)] { self.pidx(id) } else { None } }
    // bugs are added in the order of their ids and never reordered
    #[inline] fn bidx(&self, id: u32) -> Option<usize> { self.bugs.binary_search_by(|b| b.id.cmp(&id)).ok() }
    pub fn stub_at(&self, i: i32, j: i32) -> Option<usize> { self.stubs.iter().position(|s| s.i == i && s.j == j) }

    // Distance (in steps) from every free cell to the fruit; `extra`: a cell taken as closed.
    pub fn compute_dist(&self, extra: i32) -> [f64; N] { dist_over(&self.grid, &self.tiles, self.fruit, extra) }
    // the same with the roots of the eaten plants closed too (they grow back after the wave)
    fn dist_with_roots(&self, extra: i32) -> [f64; N] {
        let mut grid = self.grid; for s in &self.stubs { grid[key(s.i, s.j)] = Cell::Rock; }
        dist_over(&grid, &self.tiles, self.fruit, extra)
    }
    // Diggers eat through plants: a plant is a cell that takes as many steps as they would walk while eating it.
    fn dig_steps(&self, c: Cell) -> f64 {
        if let Cell::Plant(id) = c { let b = &self.d.bugs[self.d.cricket]; self.pidx(id).map_or(0.0, |k| self.plants[k].max_hp / b.dig * b.speed) } else { 0.0 }
    }
    pub fn compute_dig(&self) -> [f64; N] {
        let mut d = [INF; N]; let mut done = [false; N];
        let mut steps = [0.0f64; N]; for k in 0..N { steps[k] = self.dig_steps(self.grid[k]); }
        d[key(self.fruit.0, self.fruit.1)] = 0.0;
        loop {
            let mut u = N; for k in 0..N { if !done[k] && d[k] < INF && (u == N || d[k] < d[u]) { u = k; } }
            if u == N { break; }
            done[u] = true; let i = (u as i32) % COLS; let j = (u as i32 - i) / COLS; let enter = 1.0 + steps[u];
            for (di, dj) in DIRS {
                let (ni, nj) = (i + di, j + dj); if !inside(ni, nj) { continue; }
                let nk = key(ni, nj);
                if matches!(self.grid[nk], Cell::Rock | Cell::Weed) || self.tiles[nk] == Tile::Bed { continue; } // rocks, stumps, logs and beds stay in the way
                if d[u] + enter < d[nk] { d[nk] = d[u] + enter; }
            }
        }
        d
    }
    fn next_dig(&self, i: i32, j: i32, dir: (i32, i32)) -> Option<(i32, i32)> {
        let mut best = None; let mut bd = INF;
        let mut try_cell = |di: i32, dj: i32| {
            let (ni, nj) = (i + di, j + dj); if !inside(ni, nj) { return; }
            let c = self.grid[key(ni, nj)]; if matches!(c, Cell::Rock | Cell::Weed) || self.tiles[key(ni, nj)] == Tile::Bed { return; }
            let v = self.dig[key(ni, nj)] + 1.0 + self.dig_steps(c); if v < bd - 1e-6 { bd = v; best = Some((ni, nj)); }
        };
        try_cell(dir.0, dir.1);
        for (di, dj) in DIRS { try_cell(di, dj); }
        best
    }
    pub fn refresh(&mut self) { self.dist = self.compute_dist(-1); self.dig = self.compute_dig(); self.auras(); }
    // What the pumpkins give: a guard (and the spikes of a shell, and its ward) to the plants around them, thorns to the
    // free cells around them. Neither adds up: the strongest counts. A webbed pumpkin gives nothing.
    pub fn auras(&mut self) {
        for p in self.plants.iter_mut() { p.guard = 0.0; p.spikes = 0.0; p.ward = None; }
        self.thorn = [0.0; N]; self.thorn_air = [0.0; N];
        let gr = self.d.guard_r;
        for k in 0..self.plants.len() {
            let (kind, lvl, br, i, j, web, id, warded) = { let p = &self.plants[k]; (p.kind, p.lvl, p.br, p.i, p.j, p.web, p.id, p.warded) };
            if web > 0.0 { continue; }
            let st = |g: &Self, s: Stat| g.pstat(kind, lvl, br, i, j, s);
            let guard = st(self, Stat::Guard); if guard == 0.0 { continue; }
            let spikes = st(self, Stat::Spikes); let ward = st(self, Stat::Ward) != 0.0 && !warded;
            for (n, q) in self.plants.iter_mut().enumerate() {
                if !within((q.i - i) as f64, (q.j - j) as f64, gr) { continue; }
                q.spikes = q.spikes.max(spikes); if n == k { continue; }
                q.guard = q.guard.max(guard); if ward && q.ward.is_none() { q.ward = Some(id); }
            }
            let th = st(self, Stat::Thorns); let air = st(self, Stat::ThornAir) != 0.0; let r = st(self, Stat::Range); let nn = r.ceil() as i32;
            for jj in j - nn..=j + nn { for ii in i - nn..=i + nn {
                if !inside(ii, jj) || self.grid[key(ii, jj)] != Cell::Empty || !within((ii - i) as f64, (jj - j) as f64, r) { continue; }
                let kk = key(ii, jj); self.thorn[kk] = self.thorn[kk].max(th); if air { self.thorn_air[kk] = self.thorn_air[kk].max(th); }
            } }
        }
    }

    // Next cell from (i, j) towards the fruit; keeps going straight when that is as short.
    pub fn next_cell(dist: &[f64; N], i: i32, j: i32, dir: (i32, i32)) -> Option<(i32, i32)> {
        let here = dist[key(i, j)];
        if here >= INF { // a plant grew on this cell under the bug: it steps out to the neighbour nearest to the fruit
            let mut best = None; let mut bd = INF;
            for (di, dj) in DIRS { let (ni, nj) = (i + di, j + dj); if inside(ni, nj) && dist[key(ni, nj)] < bd { bd = dist[key(ni, nj)]; best = Some((ni, nj)); } }
            return best;
        }
        { let (ni, nj) = (i + dir.0, j + dir.1); if inside(ni, nj) && dist[key(ni, nj)] == here - 1.0 { return Some((ni, nj)); } }
        for (di, dj) in DIRS { let (ni, nj) = (i + di, j + dj); if inside(ni, nj) && dist[key(ni, nj)] == here - 1.0 { return Some((ni, nj)); } }
        None
    }
    // The trail bugs take from anthill e (list of cells, the anthill first).
    pub fn trail(&self, dist: &[f64; N], e: usize) -> Vec<(i32, i32)> {
        let (mut i, mut j) = self.entries[e]; let mut out = vec![(i, j)]; let mut dir = (-1, 0);
        if dist[key(i, j)] >= INF { return out; }
        for _ in 0..N {
            if (i, j) == self.fruit { break; }
            let Some(nx) = Self::next_cell(dist, i, j, dir) else { break };
            dir = (nx.0 - i, nx.1 - j); i = nx.0; j = nx.1; out.push(nx);
        }
        out
    }

    // True when a plant cannot go to (i, j). Not on roots: the eaten plant grows back there after the wave.
    pub fn place_problem(&self, i: i32, j: i32) -> bool {
        if !inside(i, j) { return true; }
        if self.grid[key(i, j)] != Cell::Empty { return true; }
        if self.entries.iter().any(|&e| e == (i, j)) || (i, j) == self.fruit { return true; }
        if matches!(self.tiles[key(i, j)], Tile::Nettle | Tile::Stone) { return true; }
        if self.stub_at(i, j).is_some() { return true; }
        self.blocks(i, j)
    }
    // Whether a plant on (i, j) would shut the bugs in. The way from every anthill has to stay open with all the roots
    // grown back too, as they will be after the wave. A plant may grow on a cell with bugs on it: they step out of it,
    // so they only need a way on from a cell next to it (with the roots as they are now: open).
    fn blocks(&self, i: i32, j: i32) -> bool {
        let d = self.compute_dist(key(i, j) as i32);
        if !self.stubs.is_empty() { let all = self.dist_with_roots(key(i, j) as i32); if self.entries.iter().any(|&(a, b)| all[key(a, b)] >= INF) { return true; } }
        else if self.entries.iter().any(|&(a, b)| d[key(a, b)] >= INF) { return true; }
        let open = |ci: i32, cj: i32| inside(ci, cj) && d[key(ci, cj)] < INF;
        for b in &self.bugs {
            if b.fly || !b.has_t || self.d.bugs[b.kind].dig != 0.0 || !inside(b.ti, b.tj) { continue; }
            let stuck = if b.ti == i && b.tj == j { !DIRS.iter().any(|&(di, dj)| open(i + di, j + dj)) } else { !open(b.ti, b.tj) };
            if stuck { return true; }
        }
        false
    }

    // A stat of a plant as it stands: its level and branch, the player's perk for this plant and the soil under it
    // (i < 0: no cell yet). 0 when it has no such stat.
    #[inline]
    pub fn pstat(&self, kind: usize, lvl: usize, br: u8, i: i32, j: i32, s: Stat) -> f64 {
        let fert = inside(i, j) && self.tiles[key(i, j)] == Tile::Fertile;
        self.stat_tab[((kind * 6 + slot(lvl, br)) * 2 + fert as usize) * NSTAT + s as usize]
    }
    // every stat of every plant on every tier, on plain ground and on fertile, with the perks of the party: they never
    // change in a party, and the rules ask for them every step (counted once here, by the same arithmetic)
    fn stat_table(d: &Data, meta: &[usize]) -> Vec<f64> {
        let mut t = vec![0.0; d.plants.len() * 6 * 2 * NSTAT];
        for kind in 0..d.plants.len() { for sl in 0..6 { for fert in 0..2 { for s in 0..NSTAT {
            t[((kind * 6 + sl) * 2 + fert) * NSTAT + s] = Self::stat_of(d, meta, kind, sl, fert == 1, STATS[s]);
        } } } }
        t
    }
    fn stat_of(d: &Data, meta: &[usize], kind: usize, sl: usize, fert: bool, s: Stat) -> f64 {
        let p = &d.plants[kind];
        let mut v = p.st[s as usize][sl];
        if v == 0.0 { return v; }
        let tier = meta[kind];
        if tier > 0 { if let Some(pk) = &p.perk { if pk.stat.contains(&s) { v = if pk.mul { v * pk.v[tier - 1] } else { v + pk.v[tier - 1] }; } } }
        if fert {
            match s { Stat::Dmg | Stat::Burn | Stat::Hp | Stat::Thorns => v *= d.fertile, Stat::Slow | Stat::Frost | Stat::Guard => v += d.fertile_add, Stat::Eat => v /= d.fertile, _ => {} }
        }
        if s == Stat::Slow || s == Stat::Frost { v = v.min(0.6); }
        if s == Stat::Hp { round(v) } else { v }
    }
    #[inline] fn ps(&self, pi: usize, s: Stat) -> f64 { let p = &self.plants[pi]; self.pstat(p.kind, p.lvl, p.br, p.i, p.j, s) }

    fn grow(&mut self, kind: usize, i: i32, j: i32, lvl: usize, spent: f64, br: u8) -> usize {
        if let Some(k) = self.stub_at(i, j) { self.stubs.remove(k); }
        let id = self.next_id; self.next_id += 1;
        let hp = self.pstat(kind, lvl, br, i, j, Stat::Hp);
        self.plants.push(Plant { id, kind, i, j, lvl, br, hp, max_hp: hp, cd: 0.3, spent, web: 0.0, guard: 0.0, spikes: 0.0, ward: None, warded: false, born: -1, tgt: 0, stk: 0.0 });
        self.grid[key(i, j)] = Cell::Plant(id); self.refresh();
        self.plants.len() - 1
    }
    pub fn place(&mut self, kind: usize, i: i32, j: i32) -> bool {
        let cost = self.d.plants[kind].cost;
        if !self.lv.plants.contains(&kind) || self.dew < cost || self.place_problem(i, j) || self.over() { return false; }
        self.dew -= cost;
        let k = self.grow(kind, i, j, 1, cost, 0); if self.phase == Phase::Build { self.plants[k].born = self.wave as i32; } // sold before the wave starts, it gives all its dew back
        true
    }
    // The roots of an eaten plant grow back into the same plant of the same level, for nothing: after the wave, or at
    // once by the rain. In a wave they wait while a bug would be shut in by them.
    fn regrow_stub(&mut self, id: u32) -> bool {
        let Some(k) = self.stubs.iter().position(|s| s.id == id) else { return false };
        let (i, j) = (self.stubs[k].i, self.stubs[k].j);
        if self.grid[key(i, j)] != Cell::Empty || self.blocks(i, j) { return false; }
        let (kind, lvl, spent, br, warded) = (self.stubs[k].kind, self.stubs[k].lvl, self.stubs[k].spent, self.stubs[k].br, self.stubs[k].warded);
        let pi = self.grow(kind, i, j, lvl, spent, br);
        if warded { self.plants[pi].warded = true; self.auras(); } // a ward used stays used for the wave
        true
    }
    // Growing a plant: to level 3 it takes branch br (1: a, 2: b; one open on this level), after that it keeps its own.
    pub fn branch_open(&self, kind: usize, br: u8) -> bool { (br == 1 || br == 2) && self.level as f64 + 1.0 >= self.d.plants[kind].from[br as usize - 1] }
    pub fn upgrade_cost(&self, pi: usize, br: u8) -> Option<f64> {
        let p = &self.plants[pi]; let up = &self.d.plants[p.kind].up;
        match p.lvl { 1 => Some(up[0]), 2 => match br { 1 => Some(up[1]), 2 => Some(up[3]), _ => None }, 3 => Some(if p.br == 1 { up[2] } else { up[4] }), _ => None }
    }
    pub fn upgrade(&mut self, pi: usize, br: u8) -> bool {
        let br = if self.plants[pi].lvl != 2 { self.plants[pi].br } else if !self.branch_open(self.plants[pi].kind, br) { return false; } else { br };
        let Some(c) = self.upgrade_cost(pi, br) else { return false };
        if self.dew < c || self.over() { return false; }
        self.dew -= c; { let p = &mut self.plants[pi]; p.spent += c; p.lvl += 1; p.br = br; p.cd = p.cd.max(0.3); }
        let mh = self.ps(pi, Stat::Hp); let p = &mut self.plants[pi]; p.hp = (p.hp + mh - p.max_hp).max(1.0); p.max_hp = mh;
        self.dig = self.compute_dig(); self.auras();
        true
    }
    pub fn is_fresh(&self, p: &Plant) -> bool { self.phase == Phase::Build && p.born == self.wave as i32 }
    pub fn refund_of(&self, p: &Plant) -> f64 { if self.is_fresh(p) { p.spent } else { (p.spent * self.refund).floor() } }
    pub fn remove_plant(&mut self, id: u32, sold: bool) {
        let Some(k) = self.pidx(id) else { return };
        if sold && self.over() { return; }
        let p = self.plants.remove(k); self.grid[key(p.i, p.j)] = Cell::Empty; self.refresh();
        if sold { self.dew += self.refund_of(&p); }
        else {
            self.stats.eaten += 1.0; let sid = self.next_id; self.next_id += 1;
            self.stubs.push(Stub { id: sid, kind: p.kind, lvl: p.lvl, br: p.br, spent: p.spent, i: p.i, j: p.j, warded: p.warded });
            self.events.push(Event::PlantDead { i: p.i, j: p.j });
        }
    }

    // Dew for calling the next wave now instead of waiting for it.
    pub fn early_bonus(&self) -> f64 { match self.next_in { Some(n) if self.phase == Phase::Build && n > 0.0 => round(n * self.d.early_dew), _ => 0.0 } }
    pub fn start_wave(&mut self) -> bool {
        if self.phase != Phase::Build || self.wave >= self.waves { return false; }
        let bonus = self.early_bonus(); self.next_in = None;
        if bonus != 0.0 { self.gain(bonus); }
        let lv = self.lv; let spec = &lv.waves[self.wave]; self.wave += 1; self.phase = Phase::Wave; self.wave_time = 0.0;
        // with two anthills the groups of a wave come out of them in turn
        // (a group starts when half the one before is out, but diggers only once all the others are)
        let mut q: Vec<Queued> = Vec::new(); let mut t0 = 0.0; let mut e = self.wave; let mut last = 0.0f64;
        for g in spec {
            t0 += g.delay; e += 1;
            let boss = self.d.bugs[g.kind].boss;
            if self.d.bugs[g.kind].dig != 0.0 { t0 = f64::max(t0, last + g.delay); }
            for n in 0..g.count { q.push(Queued { kind: g.kind, at: t0 + n as f64 * g.gap, e: (if boss { e + n } else { e }) % self.entries.len() }); }
            last = f64::max(last, t0 + (g.count as f64 - 1.0) * g.gap);
            t0 += g.count as f64 * g.gap * 0.5;
        }
        q.sort_by(|a, b| a.at.partial_cmp(&b.at).unwrap());
        self.queue = q.into();
        true
    }
    fn gain(&mut self, n: f64) { self.dew += n; self.stats.earned += n; }

    // How much stronger the bugs of a wave are than in the first one, and how much harder they bite the plants.
    pub fn hp_mul(&self, wave: usize) -> f64 { 1.0 + self.d.hp_growth * (wave as f64 - 1.0) }
    pub fn bug_hp(&self, kind: usize, wave: usize) -> f64 {
        let b = &self.d.bugs[kind];
        round(b.hp * self.lv.hp * (if b.fly { 1.0 + (self.hp_mul(wave) - 1.0) * self.d.fly_hp } else { self.hp_mul(wave) }) * self.hp_scale)
    }
    fn chew_mul(&self) -> f64 { 1.0 + self.d.chew_growth * (self.wave as f64 - 1.0) }

    // A bug comes out of anthill e, or (from: a boss) appears where its boss is.
    fn spawn(&mut self, kind: usize, e: usize, from: Option<usize>) {
        let d = self.d; let bd = &d.bugs[kind];
        let hp = round(self.bug_hp(kind, self.wave) * (if from.is_some() { 0.4 } else { 1.0 }));
        let en = *self.entries.get(e).unwrap_or(&self.entries[0]);
        let id = self.next_id; self.next_id += 1;
        let mut b = Bug {
            id, kind, hp, max_hp: hp, speed: bd.speed, fly: bd.fly, armor: bd.armor, x: COLS as f64 + 0.6, y: en.1 as f64 + 0.5,
            slow: 1.0, frozen: 0.0, burn: 0.0, burn_dps: 0.0, chew: 0.0, thaw: 0.0, chew_cd: 2.0, chew_target: None, gnaw: None, gnaw_t: 0.0,
            dir: (-1, 0), has_t: true, ti: en.0, tj: en.1, skill: 0.0, rush: 0.0, brood: from.is_some(), e, mark: 0.0, mark_v: 0.0, coming: 0.0, gone: false,
            slow_t: 0.0, slow_v: 1.0, melt: 0.0, spread: false, chain: 0.0, lured: false, lure: None, sniff: 0.0, fall: 0.0, pricked: 0.0,
        };
        if let Some(c) = bd.charge { b.skill = c[0] * 0.6; }
        if let Some(br) = bd.brood { b.skill = br.2; }
        if let Some(w) = bd.web { b.skill = w[0] * 0.6; }
        let fr = from.map(|k| { let f = &self.bugs[k]; (f.x, f.y, f.has_t, f.ti, f.tj, f.dir) });
        if b.fly { b.y = match fr { Some(f) => f.1, None => 0.6 + self.rand() * (ROWS as f64 - 1.2) }; b.has_t = false; }
        if let Some((fx, fy, fht, fti, ftj, fdir)) = fr {
            b.x = fx + (self.rand() - 0.5) * 0.5; b.y = fy + (self.rand() - 0.5) * 0.5;
            if !b.fly {
                b.x = (COLS as f64 - 0.05).min(b.x.max(0.05)); b.y = (ROWS as f64 - 0.05).min(b.y.max(0.05));
                b.has_t = fht; b.ti = fti; b.tj = ftj; b.dir = fdir;
                if !b.has_t { b.has_t = true; b.ti = b.x.floor() as i32; b.tj = b.y.floor() as i32; }
            }
        }
        self.bugs.push(b);
    }

    pub fn use_power(&mut self, kind: Power) -> bool {
        let have = match kind { Power::Frost => self.frost, Power::Rain => self.rain };
        if have == 0.0 || self.over() || (kind == Power::Frost && self.phase != Phase::Wave) { return false; } // frost on an empty field is lost
        match kind {
            Power::Frost => {
                self.frost -= 1.0; let d = self.d;
                for b in self.bugs.iter_mut() { let t = if d.bugs[b.kind].boss { 2.0 } else { 4.0 }; freeze(b, t, true); }
            }
            Power::Rain => {
                // the roots grow back at once and the webs are washed off; it heals no bitten plant
                self.rain -= 1.0;
                for p in self.plants.iter_mut() { p.web = 0.0; }
                self.auras();
                let ids: Vec<u32> = self.stubs.iter().map(|s| s.id).collect();
                for id in ids { self.regrow_stub(id); }
                self.hp = self.max_hp.min(self.hp + 3.0);
            }
        }
        self.events.push(Event::Power);
        true
    }
    fn kill(&mut self, bi: usize) {
        let d = self.d; let (kind, brood, fly, e) = { let b = &self.bugs[bi]; (b.kind, b.brood, b.fly, b.e) };
        let bd = &d.bugs[kind];
        let reward = round(bd.reward * (if brood { d.brood_reward } else { 1.0 })).max(1.0);
        self.bugs[bi].hp = 0.0; self.gain(reward); self.stats.kills += 1.0;
        self.events.push(Event::Kill { reward });
        if let Some((k, n)) = bd.split { if !fly { for _ in 0..n { self.spawn(k, e, Some(bi)); } } }
        // a mark of a grown hunter rose goes on to the nearest bugs not marked yet
        let (mark, chain, mv, bx, by) = { let b = &self.bugs[bi]; (b.mark, b.chain, b.mark_v, b.x, b.y) };
        if mark > 0.0 && chain != 0.0 {
            let mut next: Vec<(f64, usize)> = self.bugs.iter().enumerate().filter(|&(k, o)| k != bi && o.hp > 0.0 && !(o.mark > 0.0) && within(o.x - bx, o.y - by, 1.5)).map(|(k, o)| (hyp(o.x - bx, o.y - by), k)).collect();
            next.sort_by(|a, b| a.0.partial_cmp(&b.0).unwrap()); next.truncate(chain as usize);
            for (_, k) in next { let o = &mut self.bugs[k]; o.mark = d.mark_t; o.mark_v = mv; o.chain = chain; }
        }
    }
    // Health lost for any reason other than a hit (fire, nettles, thorns): no armor, no floor.
    fn lose(&mut self, bi: usize, amount: f64) {
        let b = &mut self.bugs[bi]; if b.hp <= 0.0 { return; }
        b.hp -= amount * marked(b);
        if b.hp <= 0.0 { self.kill(bi); }
    }
    // Thorns and nettles: a share of a bug's health, the two together no more than prick_cap of it (the spikes of a shell
    // are apart: only a bug that bites is pricked by them).
    fn prick(&mut self, bi: usize, share: f64) {
        let b = &mut self.bugs[bi]; let s = share.min(self.d.prick_cap - b.pricked); if !(s > 0.0) || b.hp <= 0.0 { return; }
        b.pricked += s; let a = b.max_hp * s; self.lose(bi, a);
    }
    fn damage(&mut self, bi: usize, amount: f64) {
        let b = &mut self.bugs[bi]; if b.hp <= 0.0 { return; }
        let dmg = (amount - armor_of(b)).max(1.0) * marked(b);
        b.hp -= dmg;
        if b.hp <= 0.0 { self.kill(bi); }
    }
    // A bug bites a plant: a guarded plant takes less, one by a shell pumpkin bites back, and a shell with a ward saves
    // one plant a wave from being eaten. k: the part of a bite or a second.
    fn hurt_plant(&mut self, pid: u32, amount: f64, bi: usize, k: f64) {
        let Some(pi) = self.pidx(pid) else { return };
        { let p = &mut self.plants[pi]; p.hp -= amount * (1.0 - p.guard); }
        let sp = self.plants[pi].spikes;
        if sp != 0.0 { let b = &self.bugs[bi]; let a = b.max_hp * (sp * k * (if self.d.bugs[b.kind].boss { self.d.thorn_boss } else { 1.0 })); self.lose(bi, a); }
        if self.plants[pi].hp > 0.0 { return; }
        if let Some(w) = self.plants[pi].ward { if let Some(wi) = self.pidx(w) { if !self.plants[wi].warded { self.plants[pi].hp = 1.0; self.plants[wi].warded = true; self.auras(); return; } } }
        self.remove_plant(pid, false);
    }
    // A flyer shot down falls onto the cell of the trail nearest to it (not the fruit's) and walks on.
    fn fall(&mut self, k: usize) {
        let mut on = [false; N];
        for e in 0..self.entries.len() { for (i, j) in self.trail(&self.dist, e) { if inside(i, j) { on[key(i, j)] = true; } } }
        let (bx, by) = (self.bugs[k].x, self.bugs[k].y); let mut best: i32 = -1; let mut bd = INF;
        for kk in 0..N {
            if !on[kk] { continue; } let (i, j) = ((kk % COLS as usize) as i32, (kk / COLS as usize) as i32);
            if self.grid[kk] != Cell::Empty || (i, j) == self.fruit { continue; }
            let dd = hyp(i as f64 + 0.5 - bx, j as f64 + 0.5 - by); if dd < bd { bd = dd; best = kk as i32; }
        }
        if best < 0 { return; }
        let (i, j) = (best % COLS, best / COLS); let ft = self.d.fall_t;
        let b = &mut self.bugs[k]; b.fly = false; b.x = i as f64 + 0.5; b.y = j as f64 + 0.5; b.has_t = true; b.ti = i; b.tj = j; b.dir = (-1, 0); b.fall = ft; b.lure = None; b.sniff = 0.0;
    }
    fn progress(&self, b: &Bug) -> f64 {
        if b.fly { return hyp(b.x - self.fruit.0 as f64 - 0.5, b.y - self.fruit.1 as f64 - 0.5); }
        if !b.has_t || !inside(b.ti, b.tj) { return 100.0; }
        (if self.d.bugs[b.kind].dig != 0.0 { &self.dig } else { &self.dist })[key(b.ti, b.tj)] + hyp(b.x - b.ti as f64 - 0.5, b.y - b.tj as f64 - 0.5)
    }

    // What a boss does on its way.
    fn boss_skill(&mut self, bi: usize, dt: f64) {
        let d = self.d; let bd = &d.bugs[self.bugs[bi].kind];
        { let b = &mut self.bugs[bi]; if b.rush > 0.0 { b.rush -= dt; } b.skill -= dt; if b.skill > 0.0 { return; } }
        if let Some(c) = bd.charge { let b = &mut self.bugs[bi]; b.skill = c[0]; b.rush = c[1]; }
        else if let Some((kind, n, every)) = bd.brood {
            self.bugs[bi].skill = every;
            if self.bugs[bi].x < COLS as f64 - 0.5 { let e = self.bugs[bi].e; for _ in 0..n { self.spawn(kind, e, Some(bi)); } }
        }
        else if let Some([every, r, n, life]) = bd.web {
            let (bx, by) = (self.bugs[bi].x, self.bugs[bi].y); self.bugs[bi].skill = every;
            // a plant caught once stays out of reach of the next webs until the rain washes it (its web counts below zero)
            let mut near: Vec<(f64, usize)> = self.plants.iter().enumerate()
                .filter(|(_, p)| p.web == 0.0 && d.plants[p.kind].has[Stat::Range as usize] && within(p.i as f64 + 0.5 - bx, p.j as f64 + 0.5 - by, r))
                .map(|(k, p)| (hyp(p.i as f64 + 0.5 - bx, p.j as f64 + 0.5 - by), k)).collect();
            near.sort_by(|a, b| a.0.partial_cmp(&b.0).unwrap());
            near.truncate(n as usize);
            if near.is_empty() { self.bugs[bi].skill = 1.0; return; }
            for &(_, k) in &near { self.plants[k].web = life; }
            self.auras();
        }
    }

    fn update_bug(&mut self, bi: usize, dt: f64) {
        let d = self.d; let kind = self.bugs[bi].kind; let bd = &d.bugs[kind];
        // fire is weak against armor: it comes off the burn every second; there is no 1-damage floor
        if self.bugs[bi].burn > 0.0 {
            self.bugs[bi].burn -= dt; let a = (self.bugs[bi].burn_dps - armor_of(&self.bugs[bi])).max(0.0) * dt; self.lose(bi, a); if self.bugs[bi].hp <= 0.0 { return; }
            if self.bugs[bi].burn <= 0.0 { self.bugs[bi].spread = false; } // a fire out passes nothing on
            if self.bugs[bi].spread {
                let (bx, by, burn, dps) = { let b = &self.bugs[bi]; (b.x, b.y, b.burn, b.burn_dps) };
                for k in 0..self.bugs.len() {
                    let o = &self.bugs[k];
                    if k != bi && !o.fly && o.hp > 0.0 && !(o.burn > 0.0) && within(o.x - bx, o.y - by, 0.6) { let o = &mut self.bugs[k]; o.burn = burn; o.burn_dps = dps; self.bugs[bi].spread = false; break; }
                }
            }
        }
        if self.bugs[bi].melt > 0.0 { self.bugs[bi].melt -= dt; }
        let (ci, cj) = (self.bugs[bi].x.floor() as i32, self.bugs[bi].y.floor() as i32);
        let tile = if self.bugs[bi].fly || !inside(ci, cj) { Tile::None } else { self.tiles[key(ci, cj)] };
        if tile == Tile::Nettle { let a = (if bd.boss { d.nettle_boss } else { d.nettle }) * dt; self.prick(bi, a); if self.bugs[bi].hp <= 0.0 { return; } }
        if inside(ci, cj) {
            let th = if self.bugs[bi].fly { self.thorn_air[key(ci, cj)] } else { self.thorn[key(ci, cj)] };
            if th != 0.0 { let a = th * (if bd.boss { d.thorn_boss } else { 1.0 }) * dt; self.prick(bi, a); if self.bugs[bi].hp <= 0.0 { return; } }
        }
        {
            let b = &mut self.bugs[bi];
            if b.thaw > 0.0 { b.thaw -= dt; }
            if b.frozen > 0.0 { b.frozen -= dt; if b.frozen <= 0.0 { b.thaw = THAW; } return; }
            if b.fall > 0.0 { b.fall -= dt; return; } // a flyer shot down, on its way to the ground
        }
        if bd.mend != 0.0 {
            let (bx, by) = (self.bugs[bi].x, self.bugs[bi].y);
            for (k, o) in self.bugs.iter_mut().enumerate() {
                let od = &d.bugs[o.kind];
                if k != bi && o.hp > 0.0 && o.hp < o.max_hp && !od.boss && od.mend == 0.0 && within(o.x - bx, o.y - by, 1.6) { o.hp = o.max_hp.min(o.hp + o.max_hp * bd.mend * dt); }
            }
        }
        if bd.boss { self.boss_skill(bi, dt); }
        if self.bugs[bi].chew > 0.0 {
            self.bugs[bi].chew -= dt;
            if self.bugs[bi].chew <= 0.0 {
                let p = self.bugs[bi].chew_target; self.bugs[bi].chew_cd = 5.0;
                if let Some(pid) = p { if self.pidx(pid).is_some() { let a = bd.chew * self.chew_mul(); self.hurt_plant(pid, a, bi, 1.0); } }
            }
            return;
        }
        if let Some(pid) = self.bugs[bi].gnaw { // a digger eating the plant in its way
            if self.pidx(pid).is_none() { self.bugs[bi].gnaw = None; }
            else {
                { let b = &mut self.bugs[bi]; b.gnaw_t -= dt; if b.gnaw_t <= 0.0 { b.gnaw_t = 0.45; } }
                let a = bd.dig * self.chew_mul() * dt; self.hurt_plant(pid, a, bi, dt);
                if self.pidx(pid).is_none() { self.bugs[bi].gnaw = None; }
                return;
            }
        }
        self.bugs[bi].chew_cd -= dt;
        let rush = if self.bugs[bi].rush > 0.0 { bd.charge.map_or(1.0, |c| c[2]) } else { 1.0 };
        let v = { let b = &self.bugs[bi]; b.speed * (if bd.no_slow || rush > 1.0 { 1.0 } else { b.slow }) * (if tile == Tile::Mud { d.mud } else { 1.0 }) * rush * dt };
        if self.bugs[bi].fly { // straight to the fruit, or first to the nectar of a lure flytrap, where it hangs a moment
            if self.bugs[bi].sniff > 0.0 { let b = &mut self.bugs[bi]; b.sniff -= dt; if b.sniff <= 0.0 { b.lure = None; } return; }
            if let Some(l) = self.bugs[bi].lure { let keep = self.pidx(l).map_or(false, |li| !(self.plants[li].web > 0.0)); if !keep { self.bugs[bi].lure = None; } }
            let lure = self.bugs[bi].lure.map(|l| { let p = &self.plants[self.pidx(l).unwrap()]; (p.i as f64 + 0.5, p.j as f64 + 0.5) });
            let (tx, ty) = lure.unwrap_or((self.fruit.0 as f64 + 0.5, self.fruit.1 as f64 + 0.5));
            let b = &self.bugs[bi]; let (dx, dy) = (tx - b.x, ty - b.y); let dd = hyp(dx, dy);
            if lure.is_some() { if dd < 0.4 { self.bugs[bi].sniff = d.sniff; return; } } else if dd < 0.45 { self.bite(bi); return; }
            let b = &mut self.bugs[bi]; b.x += dx / dd * v; b.y += dy / dd * v; return;
        }
        let (ti, tj) = (self.bugs[bi].ti, self.bugs[bi].tj);
        let (tx, ty) = (ti as f64 + 0.5, tj as f64 + 0.5);
        let (dx, dy) = (tx - self.bugs[bi].x, ty - self.bugs[bi].y); let dd = hyp(dx, dy);
        if dd <= v.max(0.1) {
            if (ti, tj) == self.fruit { self.bite(bi); return; }
            if bd.chew != 0.0 && self.bugs[bi].chew_cd <= 0.0 {
                for (di, dj) in DIRS {
                    if !inside(ti + di, tj + dj) { continue; }
                    if let Cell::Plant(pid) = self.grid[key(ti + di, tj + dj)] { let b = &mut self.bugs[bi]; b.chew = 1.6; b.chew_target = Some(pid); return; }
                }
            }
            let dir = self.bugs[bi].dir;
            let nx = if bd.dig != 0.0 { self.next_dig(ti, tj, dir) } else { Self::next_cell(&self.dist, ti, tj, dir) };
            if let Some((ni, nj)) = nx {
                if bd.dig != 0.0 { if let Cell::Plant(pid) = self.grid[key(ni, nj)] { let b = &mut self.bugs[bi]; b.gnaw = Some(pid); b.gnaw_t = 0.0; b.x = tx; b.y = ty; return; } }
            }
            let Some((ni, nj)) = nx else { let b = &mut self.bugs[bi]; b.x += dx * 0.5; b.y += dy * 0.5; return; };
            let b = &mut self.bugs[bi];
            b.dir = (ni - ti, nj - tj); b.ti = ni; b.tj = nj;
            let rest = v - dd; b.x = tx; b.y = ty;
            if rest > 0.0 { b.x += b.dir.0 as f64 * rest; b.y += b.dir.1 as f64 * rest; }
            return;
        }
        let b = &mut self.bugs[bi]; b.x += dx / dd * v; b.y += dy / dd * v;
    }
    fn bite(&mut self, bi: usize) {
        let (kind, brood) = (self.bugs[bi].kind, self.bugs[bi].brood);
        self.hp -= self.d.bugs[kind].bite; self.stats.bites += 1.0; self.bugs[bi].hp = 0.0; self.bugs[bi].gone = true;
        self.events.push(Event::Bite { kind, brood });
        if self.hp <= 0.0 { self.hp = 0.0; self.phase = Phase::Lost; }
    }

    #[inline] fn bk_cell(x: f64, y: f64) -> usize {
        // (a cast cuts towards zero: for a number not below zero that is its floor, and it is no call)
        let cx = (x.max(0.0) as usize).min(BK_W - 1); let cy = (y.max(0.0) as usize).min(BK_H - 1); cy * BK_W + cx
    }
    fn bucket_bugs(&mut self) {
        let nb = BK_W * BK_H; let start = &mut self.bk_start; for v in start.iter_mut() { *v = 0; }
        for b in &self.bugs { start[Self::bk_cell(b.x, b.y) + 1] += 1; }
        for c in 0..nb { start[c + 1] += start[c]; }
        self.bk_list.clear(); self.bk_list.resize(self.bugs.len(), 0);
        let mut fill: Vec<u32> = start[..nb].to_vec();
        for (k, b) in self.bugs.iter().enumerate() { let c = Self::bk_cell(b.x, b.y); self.bk_list[fill[c] as usize] = k as u32; fill[c] += 1; }
        self.bk_n = self.bugs.len();
    }
    // every bug that may be within r of (px, py) (a few more than that is no harm: the caller asks each one as it did of
    // every bug), in no order: a caller to whom the order of the list matters puts the few it takes in that order itself
    fn near(&self, px: f64, py: f64, r: f64, out: &mut Vec<usize>) {
        out.clear();
        // (a little wider than the reach: a bug at 0.9999999999999999 is in the row above the one its distance, rounded,
        // puts it within reach of — verify.mjs caught a flytrap not seeing such a bug)
        let r = r + 1e-6;
        let (cx0, cy0) = (((px - r).max(0.0) as usize).min(BK_W - 1), ((py - r).max(0.0) as usize).min(BK_H - 1));
        let (cx1, cy1) = (((px + r).max(0.0) as usize).min(BK_W - 1), ((py + r).max(0.0) as usize).min(BK_H - 1));
        for cy in cy0..=cy1 { let a = self.bk_start[cy * BK_W + cx0] as usize; let b = self.bk_start[cy * BK_W + cx1 + 1] as usize; out.extend(self.bk_list[a..b].iter().map(|&k| k as usize)); }
        out.extend(self.bk_n..self.bugs.len());
    }

    fn update_plant(&mut self, pi: usize, dt: f64) {
        let d = self.d; let (kind, lvl, br, i, j) = { let p = &self.plants[pi]; (p.kind, p.lvl, p.br, p.i, p.j) };
        let (px, py) = (i as f64 + 0.5, j as f64 + 0.5);
        if self.plants[pi].web > 0.0 { self.plants[pi].web -= dt; if self.plants[pi].web <= 0.0 { self.auras(); } return; } // caught in a spider's web: does nothing
        let st = |g: &Self, s: Stat| g.pstat(kind, lvl, br, i, j, s);
        let range = st(self, Stat::Range); if range == 0.0 || st(self, Stat::Guard) != 0.0 { return; } // a pumpkin works through auras
        let air = st(self, Stat::Air) != 0.0; let gr = st(self, Stat::GroundRange);
        let in_range = |b: &Bug, a: bool| b.hp > 0.0 && (a || !b.fly) && b.x < COLS as f64 + 0.2 && within(b.x - px, b.y - py, if gr != 0.0 && !b.fly { range.min(gr) } else { range });
        let slow = st(self, Stat::Slow);
        if slow != 0.0 { // the cold mint: every bug around slower, and with rime frozen now and then
            let mut any = false;
            let mut near = std::mem::take(&mut self.near_buf); self.near(px, py, range, &mut near);
            for &k in &near { let b = &mut self.bugs[k]; if in_range(b, air) { b.slow = b.slow.min(1.0 - slow); any = true; } }
            let rime = st(self, Stat::Rime);
            if rime == 0.0 { self.near_buf = near; return; }
            let p = &mut self.plants[pi]; p.cd -= dt; if p.cd > 0.0 || !any { self.near_buf = near; return; }
            p.cd = rime;
            for &k in &near { let b = &mut self.bugs[k]; if in_range(b, air) { let t = if d.bugs[b.kind].boss { 0.5 } else { 1.0 }; freeze(b, t, false); } }
            self.near_buf = near; return;
        }
        let lure = st(self, Stat::Lure);
        if lure != 0.0 { // the nectar of a lure flytrap: a flyer near turns to it, once
            let boss = st(self, Stat::LureBoss) != 0.0; let pid = self.plants[pi].id;
            for b in self.bugs.iter_mut() { if b.fly && b.hp > 0.0 && !b.lured && b.x < COLS as f64 + 0.2 && (boss || !d.bugs[b.kind].boss) && within(b.x - px, b.y - py, lure) { b.lured = true; b.lure = Some(pid); } }
        }
        { let p = &mut self.plants[pi]; p.cd -= dt; if p.cd > 0.0 { return; } }
        // the bugs there are when it looks round (what is born of its hits is not among them), those near it
        let mut near = std::mem::take(&mut self.near_buf); self.near(px, py, range, &mut near);
        let r = self.aim(pi, dt, &near, in_range, kind, lvl, br, i, j, air); self.near_buf = near; r
    }
    #[inline(always)]
    fn aim(&mut self, pi: usize, _dt: f64, near: &[usize], in_range: impl Fn(&Bug, bool) -> bool, kind: usize, lvl: usize, br: u8, i: i32, j: i32, air: bool) {
        let d = self.d; let (px, py) = (i as f64 + 0.5, j as f64 + 0.5);
        let st = |g: &Self, s: Stat| g.pstat(kind, lvl, br, i, j, s);
        let eat = st(self, Stat::Eat);
        if eat != 0.0 { // swallows the worn bugs whole, the biggest it can first; a healthier bug it leaves alone
            let eat_air = st(self, Stat::EatAir) != 0.0; let gulp = st(self, Stat::Gulp); let heads = { let h = st(self, Stat::Heads); if h != 0.0 { h as usize } else { 1 } };
            let mut meals: Vec<usize> = near.iter().cloned().filter(|&k| { let b = &self.bugs[k]; in_range(b, eat_air) && !d.bugs[b.kind].boss && b.hp <= gulp * b.max_hp }).collect();
            meals.sort_unstable(); // (the order of the list, as game.js has them before its own sort)
            meals.sort_by(|&a, &b| self.bugs[b].hp.partial_cmp(&self.bugs[a].hp).unwrap()); meals.truncate(heads);
            if meals.is_empty() { return; }
            self.plants[pi].cd = eat;
            for k in meals { if self.bugs[k].hp > 0.0 { self.kill(k); } } // whole: no sum of health and armor to round
            return;
        }
        if st(self, Stat::Blaze) != 0.0 { // the heat chili: every walker around, a little each
            let mut hit: Vec<usize> = near.iter().cloned().filter(|&k| in_range(&self.bugs[k], air)).collect(); if hit.is_empty() { return; } hit.sort_unstable();
            self.plants[pi].cd = 1.0 / st(self, Stat::Rate);
            let dmg = st(self, Stat::Dmg); let burn = st(self, Stat::Burn); let burn_t = st(self, Stat::BurnT); let spread = st(self, Stat::Spread) != 0.0;
            for k in hit { self.damage(k, dmg); let b = &mut self.bugs[k]; if b.hp > 0.0 && ignite(b, burn, burn_t) && spread { b.spread = true; } }
            return;
        }
        // a shooter: the bugs nearest to the fruit first, and not a bug the shots already on their way will finish. A
        // hunter rose pricks the bugs not marked yet first, a far shot takes the flyers first, an icicle mint the
        // thickest walker, a burn-through chili the armored and the thick.
        let multi = { let m = st(self, Stat::Multi); if m != 0.0 { m as usize } else { 1 } };
        let splash = st(self, Stat::Splash); let mark = st(self, Stat::Mark); let ground = st(self, Stat::Ground);
        let heavy = st(self, Stat::Heavy) != 0.0; let melt = st(self, Stat::Melt) != 0.0;
        let mut seen = std::mem::take(&mut self.seen); seen.clear();
        for &k in near {
            let b = &self.bugs[k];
            if in_range(b, air) && (splash != 0.0 || b.coming < b.hp) {
                seen.push((if heavy { -b.hp } else if melt { -(b.armor * 1e6 + b.hp) } else { self.progress(b) + (if ground != 0.0 && !b.fly { 1e3 } else { 0.0 }) + (if mark != 0.0 && b.mark > 0.5 { 500.0 } else { 0.0 }) }, k));
            }
        }
        if seen.is_empty() { self.seen = seen; return; }
        seen.sort_by(|a, b| a.0.partial_cmp(&b.0).unwrap().then(a.1.cmp(&b.1))); // (of two as near, the one earlier in the list: game.js sorts the list as it stands)
        self.plants[pi].cd = 1.0 / st(self, Stat::Rate);
        let stack = st(self, Stat::Stack);
        for &(_, k) in seen.iter().take(multi) {
            let weak = ground != 0.0 && !self.bugs[k].fly;
            let mut dmg = st(self, Stat::Dmg) * (if weak { ground } else { 1.0 });
            if stack != 0.0 {
                let bid = self.bugs[k].id; let p = &mut self.plants[pi];
                if p.tgt == bid { p.stk = (p.stk + 1.0).min(round(1.0 / stack)); } else { p.tgt = bid; p.stk = 0.0; }
                dmg *= 1.0 + stack * p.stk;
            }
            let b = &mut self.bugs[k];
            let est = if splash != 0.0 { 0.0 } else { (dmg - armor_of(b)).max(1.0) * marked(b) }; b.coming += est; // what it will take
            let (target, tx, ty) = (b.id, b.x, b.y);
            let id = self.next_id; self.next_id += 1;
            let shot = Shot { id, x: px, y: py - 0.25, target, tx, ty, speed: st(self, Stat::Speed), dmg, est, splash, hits: st(self, Stat::Hits) as usize, mark, chain: st(self, Stat::Chain),
                frost: st(self, Stat::Frost), frost_t: st(self, Stat::FrostT), burn: st(self, Stat::Burn), burn_t: st(self, Stat::BurnT), melt, crack: st(self, Stat::Crack) != 0.0,
                down: if weak { 0.0 } else { st(self, Stat::Down) }, done: false };
            self.shots.push(shot);
        }
        self.seen = seen;
    }
    // What a shot does to a bug it hits.
    fn strike(&mut self, k: usize, s: &Shot) {
        let d = self.d;
        self.damage(k, s.dmg);
        if s.crack && self.bugs[k].armor > 0.0 { self.bugs[k].armor -= 1.0; } // the burn-through top: armor off for good
        if self.bugs[k].hp <= 0.0 { return; }
        { let b = &mut self.bugs[k];
          if s.burn != 0.0 { ignite(b, s.burn, s.burn_t); if s.melt { b.melt = b.melt.max(s.burn_t); } }
          if s.mark != 0.0 { let on = b.mark > 0.0; b.mark_v = s.mark.max(if on { b.mark_v } else { 0.0 }); b.chain = if on { b.chain.max(s.chain) } else { s.chain }; b.mark = d.mark_t; } // a mark run out leaves nothing
          if s.frost != 0.0 { chill(b, 1.0 - s.frost, s.frost_t); } }
        if s.down != 0.0 && self.bugs[k].fly {
            if d.bugs[self.bugs[k].kind].boss { freeze(&mut self.bugs[k], 0.5, false); } else if self.bugs[k].hp <= s.down * self.bugs[k].max_hp { self.fall(k); }
        }
    }
    fn update_shot(&mut self, si: usize, dt: f64) {
        let ti = self.bidx(self.shots[si].target);
        let alive = ti.map_or(false, |k| self.bugs[k].hp > 0.0 && !self.bugs[k].gone);
        if alive { let b = &self.bugs[ti.unwrap()]; let (bx, by) = (b.x, b.y); let s = &mut self.shots[si]; s.tx = bx; s.ty = by; }
        let s = &mut self.shots[si];
        let (dx, dy) = (s.tx - s.x, s.ty - s.y); let dd = hyp(dx, dy); let v = s.speed * dt;
        if dd <= v {
            s.done = true; let s = s.clone();
            if s.est != 0.0 { if let Some(k) = ti { self.bugs[k].coming -= s.est; } }
            if s.splash != 0.0 { // a pepper bursts: the walkers closest to where it lands, s.hits of them at most
                let mut near: Vec<(f64, usize)> = self.bugs.iter().enumerate().filter(|(_, b)| !b.fly && b.hp > 0.0 && within(b.x - s.tx, b.y - s.ty, s.splash))
                    .map(|(k, b)| (hyp(b.x - s.tx, b.y - s.ty), k)).collect();
                near.sort_by(|a, b| a.0.partial_cmp(&b.0).unwrap());
                if s.hits != 0 { near.truncate(s.hits); }
                for (_, k) in near { self.strike(k, &s); }
            } else if alive { self.strike(ti.unwrap(), &s); }
            return;
        }
        s.x += dx / dd * v; s.y += dy / dd * v;
    }

    pub fn step(&mut self, dt: f64) {
        if self.over() { return; }
        self.time += dt;
        if self.phase == Phase::Build { if let Some(n) = self.next_in { let n = n - dt; if n <= 0.0 { self.next_in = Some(0.0); self.start_wave(); } else { self.next_in = Some(n); } } }
        if self.phase == Phase::Wave {
            self.wave_time += dt;
            while self.queue.front().map_or(false, |q| q.at <= self.wave_time) { let q = self.queue.pop_front().unwrap(); self.spawn(q.kind, q.e, None); }
        }
        for b in self.bugs.iter_mut() { b.slow = 1.0; if b.slow_t > 0.0 { b.slow = b.slow_v; b.slow_t -= dt; } }
        self.bucket_bugs();
        for pi in 0..self.plants.len() { self.update_plant(pi, dt); }
        for bi in 0..self.bugs.len() { { let b = &mut self.bugs[bi]; if b.mark > 0.0 { b.mark -= dt; } } if self.bugs[bi].hp > 0.0 { self.update_bug(bi, dt); } }
        for si in 0..self.shots.len() { self.update_shot(si, dt); }
        self.shots.retain(|s| !s.done);
        self.bugs.retain(|b| b.hp > 0.0);
        if self.phase == Phase::Lost { return; }
        if self.phase == Phase::Wave && self.queue.is_empty() && self.bugs.is_empty() {
            if self.wave >= self.waves { self.phase = Phase::Won; }
            else {
                // the garden grows back: the eaten plants out of their roots, the bitten ones to full health
                let ids: Vec<u32> = self.stubs.iter().map(|s| s.id).collect();
                for id in ids { self.regrow_stub(id); }
                for p in self.plants.iter_mut() { p.hp = p.max_hp; p.warded = false; }
                self.auras();
                let bonus = self.lv.pay_at[self.wave - 1]; self.phase = Phase::Build; self.next_in = Some(self.d.brk); self.gain(bonus);
                if (self.wave as f64) % self.d.power_every == 0.0 { self.frost = self.power_max.min(self.frost + 1.0); self.rain = self.power_max.min(self.rain + 1.0); }
                self.events.push(Event::WaveDone { bonus });
            }
        }
    }

    // The numbers of the state in a fixed order: sim/js/hash.mjs `fields` lists the same.
    pub fn fields(&self, out: &mut Vec<f64>) {
        out.clear();
        let ph = match self.phase { Phase::Build => 0.0, Phase::Wave => 1.0, Phase::Won => 2.0, Phase::Lost => 3.0 };
        out.extend_from_slice(&[self.dew, self.hp, self.wave as f64, ph, self.time, self.wave_time, self.next_in.unwrap_or(-1.0), self.frost, self.rain, self.next_id as f64, self.queue.len() as f64, self.stats.kills, self.stats.bites, self.stats.eaten, self.stats.earned]);
        out.push(self.bugs.len() as f64);
        for b in &self.bugs { out.extend_from_slice(&[b.id as f64, b.hp, b.x, b.y, b.slow, b.frozen, b.burn, b.chew, b.thaw, b.chew_cd, b.skill, b.rush, b.mark, b.coming, if b.has_t { b.ti as f64 } else { -1.0 }, if b.has_t { b.tj as f64 } else { -1.0 },
            b.slow_t, b.melt, b.armor, if b.fly { 1.0 } else { 0.0 }, b.sniff, b.fall, if b.lured { 1.0 } else { 0.0 }, b.pricked]); }
        out.push(self.plants.len() as f64);
        for p in &self.plants { out.extend_from_slice(&[p.id as f64, p.lvl as f64, p.i as f64, p.j as f64, p.hp, p.cd, p.web, p.br as f64, p.guard, p.spikes, if p.warded { 1.0 } else { 0.0 }, p.stk]); }
        out.push(self.stubs.len() as f64);
        for s in &self.stubs { out.extend_from_slice(&[s.id as f64, s.i as f64, s.j as f64]); }
        out.push(self.shots.len() as f64);
        for s in &self.shots { out.extend_from_slice(&[s.id as f64, s.x, s.y]); }
    }
    pub fn hash(&self, buf: &mut Vec<f64>) -> u32 {
        self.fields(buf); let mut h: u32 = 2166136261;
        for v in buf.iter() { let b = (*v + 0.0).to_bits(); h = (h ^ (b as u32)).wrapping_mul(16777619); h = (h ^ ((b >> 32) as u32)).wrapping_mul(16777619); }
        h
    }
    pub fn dump(&self) -> String {
        let mut buf = Vec::new(); self.fields(&mut buf);
        buf.iter().enumerate().map(|(k, v)| format!("{} {:016x} {}", k, (*v + 0.0).to_bits(), *v + 0.0)).collect::<Vec<_>>().join("\n")
    }
}

// the cells of the buckets of bugs: the field and the column the bugs come out of beyond it
const BK_W: usize = COLS as usize + 2; const BK_H: usize = ROWS as usize;

pub fn dist_over(grid: &[Cell; N], tiles: &[Tile; N], fruit: (i32, i32), extra: i32) -> [f64; N] {
    let mut d = [INF; N]; let mut q = [(0i32, 0i32); N]; let mut qn = 1; q[0] = fruit;
    d[key(fruit.0, fruit.1)] = 0.0;
    let mut h = 0;
    while h < qn {
        let (i, j) = q[h]; h += 1; let k = d[key(i, j)];
        for (di, dj) in DIRS {
            let (ni, nj) = (i + di, j + dj);
            if !inside(ni, nj) { continue; }
            let nk = key(ni, nj);
            if d[nk] != INF || grid[nk] != Cell::Empty || tiles[nk] == Tile::Bed || nk as i32 == extra { continue; }
            d[nk] = k + 1.0; q[qn] = (ni, nj); qn += 1;
        }
    }
    d
}
// A bug marked by a rose takes more of everything.
#[inline] fn marked(b: &Bug) -> f64 { if b.mark > 0.0 { 1.0 + b.mark_v } else { 1.0 } }
// Stops a bug for t seconds. Stops do not chain: when one ends, the bug cannot be stopped again for THAW seconds
// (frost, the player's power, always works).
#[inline] fn freeze(b: &mut Bug, t: f64, force: bool) { if !force && (b.thaw > 0.0 || b.frozen > 0.0) { return; } b.frozen = b.frozen.max(t); }
// Slows a bug to v of its speed for t seconds; slows do not add up: a weaker one does nothing while a stronger is on.
#[inline] fn chill(b: &mut Bug, v: f64, t: f64) { if b.slow_t <= 0.0 || v <= b.slow_v { b.slow_v = v; b.slow_t = t; } }
// Sets a bug burning; burns do not add up: a weaker one does nothing while a stronger is on.
#[inline] fn ignite(b: &mut Bug, dps: f64, t: f64) -> bool { if b.burn <= 0.0 || dps >= b.burn_dps { b.burn = t; b.burn_dps = dps; b.spread = false; true } else { false } }
// A bug burning by a burn-through chili has no armor.
#[inline] fn armor_of(b: &Bug) -> f64 { if b.melt > 0.0 { 0.0 } else { b.armor } }
