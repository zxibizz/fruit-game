// The simulation: public/game.js rule for rule. It must walk the same way to the last bit (sim/js/verify.mjs has
// game.js replay the parties played here), so the arithmetic keeps the order of the JS expressions and every list
// keeps the JS order. A rule changed there is changed here, and the other way round.
// What only the screen needs (hit flashes, events of shots, names of shots) is left out.
use crate::data::*;
use std::collections::VecDeque;

pub const INF: f64 = 1e9;
pub const DIRS: [(i32, i32); 4] = [(-1, 0), (0, -1), (0, 1), (1, 0)]; // tie order: towards the fruit side first
const THAW: f64 = 2.5;

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
pub struct Plant { pub id: u32, pub kind: usize, pub i: i32, pub j: i32, pub lvl: usize, pub hp: f64, pub max_hp: f64, pub cd: f64, pub spent: f64, pub web: f64, pub buff: f64, pub guard: f64, pub born: i32 }
#[derive(Clone, Debug)]
pub struct Stub { pub id: u32, pub kind: usize, pub lvl: usize, pub spent: f64, pub i: i32, pub j: i32, pub grow: f64 }
#[derive(Clone, Debug)]
pub struct Bug {
    pub id: u32, pub kind: usize, pub hp: f64, pub max_hp: f64, pub speed: f64, pub fly: bool, pub armor: f64,
    pub x: f64, pub y: f64, pub slow: f64, pub frozen: f64, pub burn: f64, pub burn_dps: f64, pub chew: f64, pub thaw: f64, pub chew_cd: f64,
    pub chew_target: Option<u32>, pub gnaw: Option<u32>, pub gnaw_t: f64, pub dir: (i32, i32), pub has_t: bool, pub ti: i32, pub tj: i32,
    pub skill: f64, pub rush: f64, pub brood: bool, pub e: usize, pub mark: f64, pub mark_v: f64, pub coming: f64, pub gone: bool,
}
#[derive(Clone, Debug)]
pub struct Shot { pub id: u32, pub x: f64, pub y: f64, pub target: u32, pub tx: f64, pub ty: f64, pub speed: f64, pub dmg: f64, pub est: f64, pub splash: f64, pub hits: usize, pub mark: f64, pub stun: f64, pub done: bool }
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
    pub regrow: f64, pub refund: f64, pub dist: [f64; N], pub dig: [f64; N], pub stats: Stats,
    seen: Vec<(f64, usize)>,
}

impl<'a> Game<'a> {
    // meta: the tiers of the perks bought, by name
    pub fn new(d: &'a Data, level: usize, seed: u32, meta: &[(String, usize)]) -> Game<'a> {
        let lv = &d.levels[level];
        let tier_of = |k: &str| meta.iter().find(|(n, _)| n == k).map_or(0, |(_, t)| *t);
        let tier = |k: &str| { let t = tier_of(k); if t > 0 { d.perk(k).unwrap_or_else(|| panic!("no perk {}", k)).v[t - 1] } else { 0.0 } };
        let hp = d.fruit_hp + tier("heart"); let clouds = tier("clouds");
        let roots = tier("roots"); let refund = tier("refund");
        let mut g = Game {
            d, lv, level, seed, meta: d.plants.iter().map(|p| tier_of(&p.name)).collect(),
            grid: [Cell::Empty; N], tiles: [Tile::None; N], entries: lv.entries.iter().map(|&j| (COLS - 1, j)).collect(), fruit: lv.fruit,
            dew: lv.dew + tier("dew"), hp, max_hp: hp, wave: 0, waves: lv.waves.len(), phase: Phase::Build, next_in: None,
            bugs: Vec::new(), shots: Vec::new(), plants: Vec::new(), stubs: Vec::new(), events: Vec::new(), queue: VecDeque::new(),
            time: 0.0, wave_time: 0.0, frost: 1.0 + clouds, rain: 1.0 + clouds, power_max: d.power_max + clouds, next_id: 1, rng: seed,
            regrow: d.regrow * (if roots != 0.0 { roots } else { 1.0 }), refund: if refund != 0.0 { refund } else { d.refund },
            dist: [INF; N], dig: [INF; N], stats: Stats::default(), seen: Vec::new(),
        };
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
    pub fn compute_dist(&self, extra: i32) -> [f64; N] { dist_over(&self.grid, self.fruit, extra) }
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
                if matches!(self.grid[nk], Cell::Rock | Cell::Weed) { continue; } // rocks, stumps and logs stay in the way
                if d[u] + enter < d[nk] { d[nk] = d[u] + enter; }
            }
        }
        d
    }
    fn next_dig(&self, i: i32, j: i32, dir: (i32, i32)) -> Option<(i32, i32)> {
        let mut best = None; let mut bd = INF;
        let mut try_cell = |di: i32, dj: i32| {
            let (ni, nj) = (i + di, j + dj); if !inside(ni, nj) { return; }
            let c = self.grid[key(ni, nj)]; if matches!(c, Cell::Rock | Cell::Weed) { return; }
            let v = self.dig[key(ni, nj)] + 1.0 + self.dig_steps(c); if v < bd - 1e-6 { bd = v; best = Some((ni, nj)); }
        };
        try_cell(dir.0, dir.1);
        for (di, dj) in DIRS { try_cell(di, dj); }
        best
    }
    pub fn refresh(&mut self) { self.dist = self.compute_dist(-1); self.dig = self.compute_dig(); self.auras(); }
    // What the plants give to the plants around them: a bell makes them shoot more often, a grown aloe guards them.
    pub fn auras(&mut self) {
        for p in self.plants.iter_mut() { p.buff = 0.0; p.guard = 0.0; }
        for k in 0..self.plants.len() {
            let (kind, lvl, i, j, web) = { let p = &self.plants[k]; (p.kind, p.lvl, p.i, p.j, p.web) };
            if web > 0.0 { continue; } // a webbed plant gives nothing
            let buff = self.pstat(kind, lvl, i, j, Stat::Buff); let guard = self.pstat(kind, lvl, i, j, Stat::Guard);
            if buff == 0.0 && guard == 0.0 { continue; }
            let r = self.pstat(kind, lvl, i, j, Stat::Range);
            for (n, q) in self.plants.iter_mut().enumerate() {
                if n != k && within((q.i - i) as f64, (q.j - j) as f64, r) { q.buff = q.buff.max(buff); q.guard = q.guard.max(guard); }
            }
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

    // True when a plant cannot go to (i, j). A plant may grow on a cell with bugs on it: they step out of it, so they
    // only need a way on from a cell next to it.
    pub fn place_problem(&self, i: i32, j: i32) -> bool {
        if !inside(i, j) { return true; }
        if self.grid[key(i, j)] != Cell::Empty { return true; }
        if self.entries.iter().any(|&e| e == (i, j)) || (i, j) == self.fruit { return true; }
        if self.tiles[key(i, j)] == Tile::Nettle { return true; }
        let d = self.compute_dist(key(i, j) as i32);
        if self.entries.iter().any(|&(a, b)| d[key(a, b)] >= INF) { return true; }
        let open = |ci: i32, cj: i32| inside(ci, cj) && d[key(ci, cj)] < INF;
        for b in &self.bugs {
            if b.fly || !b.has_t || self.d.bugs[b.kind].dig != 0.0 || !inside(b.ti, b.tj) { continue; }
            let stuck = if b.ti == i && b.tj == j { !DIRS.iter().any(|&(di, dj)| open(i + di, j + dj)) } else { !open(b.ti, b.tj) };
            if stuck { return true; }
        }
        false
    }

    // A stat of a plant as it stands: its level, the player's perk for this plant and the soil under it (i < 0: no cell yet).
    #[inline]
    pub fn pstat(&self, kind: usize, lvl: usize, i: i32, j: i32, s: Stat) -> f64 {
        let d = self.d; let p = &d.plants[kind];
        if !p.has[s as usize] { return 0.0; }
        let mut v = p.st[s as usize][lvl - 1];
        if v == 0.0 { return v; }
        let tier = self.meta[kind];
        if tier > 0 { if let Some(pk) = &p.perk { if pk.stat == Some(s) { v = if pk.mul { v * pk.v[tier - 1] } else { v + pk.v[tier - 1] }; } } }
        if inside(i, j) && self.tiles[key(i, j)] == Tile::Fertile {
            match s { Stat::Dmg | Stat::Burn | Stat::Heal | Stat::Chomp | Stat::Hp => v *= d.fertile, Stat::Slow | Stat::Buff => v += d.fertile_add, Stat::Eat => v /= d.fertile, _ => {} }
        }
        if s == Stat::Slow { v = v.min(0.6); }
        if s == Stat::Hp { round(v) } else { v }
    }
    #[inline] fn ps(&self, pi: usize, s: Stat) -> f64 { let p = &self.plants[pi]; self.pstat(p.kind, p.lvl, p.i, p.j, s) }

    fn grow(&mut self, kind: usize, i: i32, j: i32, lvl: usize, spent: f64) -> usize {
        if let Some(k) = self.stub_at(i, j) { self.stubs.remove(k); }
        let id = self.next_id; self.next_id += 1;
        let hp = self.pstat(kind, lvl, i, j, Stat::Hp);
        self.plants.push(Plant { id, kind, i, j, lvl, hp, max_hp: hp, cd: 0.3, spent, web: 0.0, buff: 0.0, guard: 0.0, born: -1 });
        self.grid[key(i, j)] = Cell::Plant(id); self.refresh();
        self.plants.len() - 1
    }
    pub fn place(&mut self, kind: usize, i: i32, j: i32) -> bool {
        let cost = self.d.plants[kind].cost;
        if !self.lv.plants.contains(&kind) || self.dew < cost || self.place_problem(i, j) || self.over() { return false; }
        self.dew -= cost;
        let k = self.grow(kind, i, j, 1, cost); if self.phase == Phase::Build { self.plants[k].born = self.wave as i32; } // sold before the wave starts, it gives all its dew back
        true
    }
    // Repairs. The roots of an eaten plant grow back into the same plant of the same level for a part of its price
    // (for nothing when an aloe or the rain does it).
    pub fn regrow_cost(&self, k: usize) -> f64 { (self.stubs[k].spent * self.d.repair).ceil() }
    pub fn regrow_stub(&mut self, id: u32, free: bool) -> bool {
        let Some(k) = self.stubs.iter().position(|s| s.id == id) else { return false };
        let (i, j) = (self.stubs[k].i, self.stubs[k].j); let cost = self.regrow_cost(k);
        if self.over() || (!free && self.dew < cost) || self.place_problem(i, j) { return false; }
        if !free { self.dew -= cost; }
        let (kind, lvl, spent) = (self.stubs[k].kind, self.stubs[k].lvl, self.stubs[k].spent);
        self.grow(kind, i, j, lvl, spent);
        true
    }
    pub fn upgrade_cost(&self, pi: usize) -> Option<f64> { let p = &self.plants[pi]; if p.lvl < 3 { Some(self.d.plants[p.kind].up[p.lvl - 1]) } else { None } }
    pub fn upgrade(&mut self, pi: usize) -> bool {
        let Some(c) = self.upgrade_cost(pi) else { return false };
        if self.dew < c || self.over() { return false; }
        self.dew -= c; self.plants[pi].spent += c; self.plants[pi].lvl += 1;
        let mh = self.ps(pi, Stat::Hp); let p = &mut self.plants[pi]; p.hp += mh - p.max_hp; p.max_hp = mh;
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
            self.stubs.push(Stub { id: sid, kind: p.kind, lvl: p.lvl, spent: p.spent, i: p.i, j: p.j, grow: 0.0 });
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
        round(b.hp * self.lv.hp * (if b.fly { 1.0 + (self.hp_mul(wave) - 1.0) * self.d.fly_hp } else { self.hp_mul(wave) }))
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
                self.rain -= 1.0;
                for p in self.plants.iter_mut() { p.hp = p.max_hp; p.web = 0.0; }
                self.auras();
                let ids: Vec<u32> = self.stubs.iter().map(|s| s.id).collect();
                for id in ids { self.regrow_stub(id, true); }
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
    }
    // Health lost for any reason other than a hit (fire, nettles, thorns): no armor, no floor.
    fn lose(&mut self, bi: usize, amount: f64) {
        let b = &mut self.bugs[bi]; if b.hp <= 0.0 { return; }
        b.hp -= amount * marked(b);
        if b.hp <= 0.0 { self.kill(bi); }
    }
    fn damage(&mut self, bi: usize, amount: f64) {
        let b = &mut self.bugs[bi]; if b.hp <= 0.0 { return; }
        let dmg = (amount - b.armor).max(1.0) * marked(b);
        b.hp -= dmg;
        if b.hp <= 0.0 { self.kill(bi); }
    }
    // A bug bites a plant: a guarded plant takes less, a thorny one bites back. k: the part of a bite or a second.
    fn hurt_plant(&mut self, pid: u32, amount: f64, bi: usize, k: f64) {
        let Some(pi) = self.pidx(pid) else { return };
        { let p = &mut self.plants[pi]; p.hp -= amount * (1.0 - p.guard); }
        let th = self.ps(pi, Stat::Thorns);
        if th != 0.0 { let b = &self.bugs[bi]; let a = b.max_hp * th * k * (if self.d.bugs[b.kind].boss { 0.3 } else { 1.0 }); self.lose(bi, a); }
        if self.plants[pi].hp <= 0.0 { self.remove_plant(pid, false); }
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
        if self.bugs[bi].burn > 0.0 { self.bugs[bi].burn -= dt; let a = self.bugs[bi].burn_dps * dt; self.lose(bi, a); if self.bugs[bi].hp <= 0.0 { return; } } // burn ignores armor and has no 1-damage floor
        let (ci, cj) = (self.bugs[bi].x.floor() as i32, self.bugs[bi].y.floor() as i32);
        let tile = if self.bugs[bi].fly || !inside(ci, cj) { Tile::None } else { self.tiles[key(ci, cj)] };
        if tile == Tile::Nettle { let a = self.bugs[bi].max_hp * (if bd.boss { d.nettle_boss } else { d.nettle }) * dt; self.lose(bi, a); if self.bugs[bi].hp <= 0.0 { return; } }
        {
            let b = &mut self.bugs[bi];
            if b.thaw > 0.0 { b.thaw -= dt; }
            if b.frozen > 0.0 { b.frozen -= dt; if b.frozen <= 0.0 { b.thaw = THAW; } return; }
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
        if self.bugs[bi].fly {
            let (tx, ty) = (self.fruit.0 as f64 + 0.5, self.fruit.1 as f64 + 0.5);
            let b = &self.bugs[bi]; let (dx, dy) = (tx - b.x, ty - b.y); let dd = hyp(dx, dy);
            if dd < 0.45 { self.bite(bi); return; }
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

    fn update_plant(&mut self, pi: usize, dt: f64) {
        let d = self.d; let (kind, lvl, i, j) = { let p = &self.plants[pi]; (p.kind, p.lvl, p.i, p.j) };
        let pd = &d.plants[kind]; let (px, py) = (i as f64 + 0.5, j as f64 + 0.5);
        if self.plants[pi].web > 0.0 { self.plants[pi].web -= dt; if self.plants[pi].web <= 0.0 { self.auras(); } return; } // caught in a spider's web: does nothing
        if !pd.has[Stat::Range as usize] || pd.has[Stat::Buff as usize] { return; }
        let st = |g: &Self, s: Stat| g.pstat(kind, lvl, i, j, s);
        let range = st(self, Stat::Range);
        if pd.has[Stat::Heal as usize] {
            let heal = st(self, Stat::Heal);
            for q in self.plants.iter_mut() { if q.hp < q.max_hp && within((q.i - i) as f64, (q.j - j) as f64, range) { q.hp = q.max_hp.min(q.hp + heal * dt); } }
            let rg = st(self, Stat::Regrow);
            for s in self.stubs.iter_mut() { if within((s.i - i) as f64, (s.j - j) as f64, range) { s.grow = (s.grow + dt / rg).min(1.0); } }
            return;
        }
        let gr = pd.ground_range;
        let in_range = |b: &Bug, air: bool| b.hp > 0.0 && (air || !b.fly) && b.x < COLS as f64 + 0.2 && within(b.x - px, b.y - py, if gr != 0.0 && !b.fly { range.min(gr) } else { range });
        let n = self.bugs.len(); // the bugs there are when it looks round: what is born of its hits is not among them
        if pd.has[Stat::Slow as usize] {
            let s = 1.0 - st(self, Stat::Slow); let mut any = false;
            for b in self.bugs.iter_mut() { if in_range(b, pd.air) { b.slow = b.slow.min(s); any = true; } }
            let chill = st(self, Stat::Chill); if chill == 0.0 { return; }
            let p = &mut self.plants[pi]; p.cd -= dt; if p.cd > 0.0 || !any { return; }
            p.cd = chill;
            for b in self.bugs.iter_mut() { if in_range(b, pd.air) { let t = if d.bugs[b.kind].boss { 0.4 } else { 1.0 }; freeze(b, t, false); } }
            return;
        }
        { let p = &mut self.plants[pi]; p.cd -= dt; if p.cd > 0.0 { return; } }
        let quick = 1.0 + self.plants[pi].buff;
        if pd.has[Stat::Eat as usize] { // bites the strongest bug it reaches, through any armor; what is left with no health is swallowed
            let air = st(self, Stat::EatAir) != 0.0; let chomp = st(self, Stat::Chomp); let gulp = st(self, Stat::Gulp);
            let mut best: Option<usize> = None; let mut meal: Option<usize> = None;
            for k in 0..n {
                let b = &self.bugs[k]; if !in_range(b, air) { continue; }
                if best.map_or(true, |q| b.hp > self.bugs[q].hp) { best = Some(k); }
                if !d.bugs[b.kind].boss && (b.hp <= chomp || b.hp <= gulp * b.max_hp) && meal.map_or(true, |q| b.hp > self.bugs[q].hp) { meal = Some(k); }
            }
            let Some(mut best) = best else { return };
            let whole = meal.is_some(); if let Some(m) = meal { best = m; } // the biggest bug it can swallow, else a bite of the strongest
            self.plants[pi].cd = st(self, Stat::Eat) / quick;
            let b = &self.bugs[best]; let a = (if whole { chomp.max(b.hp) } else { chomp }) + b.armor;
            self.damage(best, a);
            return;
        }
        if kind == d.pepper {
            let hit: Vec<usize> = (0..n).filter(|&k| in_range(&self.bugs[k], pd.air)).collect(); if hit.is_empty() { return; }
            self.plants[pi].cd = 1.0 / (st(self, Stat::Rate) * quick);
            let dmg = st(self, Stat::Dmg); let burn = st(self, Stat::Burn); let burn_t = st(self, Stat::BurnT);
            for k in hit { self.damage(k, dmg); let b = &mut self.bugs[k]; b.burn = burn_t; b.burn_dps = burn; }
            return;
        }
        // the bugs nearest to the fruit first; a grown rose shoots at two of them; a plant that is weak against walkers
        // (the dandelion) takes the flyers first; and not at a bug the shots already on their way will finish
        let multi = { let m = st(self, Stat::Multi); if m != 0.0 { m as usize } else { 1 } };
        let splash = st(self, Stat::Splash); let mark = st(self, Stat::Mark);
        let mut seen = std::mem::take(&mut self.seen); seen.clear();
        for k in 0..n {
            let b = &self.bugs[k];
            if in_range(b, pd.air) && (splash != 0.0 || b.coming < b.hp) {
                seen.push((self.progress(b) + (if pd.ground != 0.0 && !b.fly { 1e3 } else { 0.0 }) + (if mark != 0.0 && b.mark > 0.5 { 500.0 } else { 0.0 }), k));
            }
        }
        if seen.is_empty() { self.seen = seen; return; }
        seen.sort_by(|a, b| a.0.partial_cmp(&b.0).unwrap());
        self.plants[pi].cd = 1.0 / (st(self, Stat::Rate) * quick);
        for &(_, k) in seen.iter().take(multi) {
            let weak = pd.ground != 0.0 && !self.bugs[k].fly;
            let dmg = st(self, Stat::Dmg) * (if weak { pd.ground } else { 1.0 });
            let b = &mut self.bugs[k];
            let est = if splash != 0.0 { 0.0 } else { (dmg - b.armor).max(1.0) * marked(b) }; b.coming += est; // what it will take
            let (target, tx, ty) = (b.id, b.x, b.y);
            let id = self.next_id; self.next_id += 1;
            self.shots.push(Shot { id, x: px, y: py - 0.25, target, tx, ty, speed: pd.speed, dmg, est, splash,
                hits: if pd.has[Stat::Hits as usize] { pd.st[Stat::Hits as usize][lvl - 1] as usize } else { 0 }, mark, stun: if weak { 0.0 } else { st(self, Stat::Stun) }, done: false });
        }
        self.seen = seen;
    }
    fn update_shot(&mut self, si: usize, dt: f64) {
        let d = self.d; let ti = self.bidx(self.shots[si].target);
        let alive = ti.map_or(false, |k| self.bugs[k].hp > 0.0 && !self.bugs[k].gone);
        if alive { let b = &self.bugs[ti.unwrap()]; let (bx, by) = (b.x, b.y); let s = &mut self.shots[si]; s.tx = bx; s.ty = by; }
        let s = &mut self.shots[si];
        let (dx, dy) = (s.tx - s.x, s.ty - s.y); let dd = hyp(dx, dy); let v = s.speed * dt;
        if dd <= v {
            s.done = true; let s = s.clone();
            if s.est != 0.0 { if let Some(k) = ti { self.bugs[k].coming -= s.est; } }
            if s.splash != 0.0 { // the kernels hit the bugs closest to where the cob lands, s.hits of them at most
                let mut near: Vec<(f64, usize)> = self.bugs.iter().enumerate().filter(|(_, b)| !b.fly && b.hp > 0.0 && within(b.x - s.tx, b.y - s.ty, s.splash))
                    .map(|(k, b)| (hyp(b.x - s.tx, b.y - s.ty), k)).collect();
                near.sort_by(|a, b| a.0.partial_cmp(&b.0).unwrap());
                if s.hits != 0 { near.truncate(s.hits); }
                for (_, k) in near { self.damage(k, s.dmg); }
            } else if alive {
                let k = ti.unwrap(); self.damage(k, s.dmg);
                let b = &mut self.bugs[k];
                if s.mark != 0.0 && b.hp > 0.0 { let old = if b.mark > 0.0 { b.mark_v } else { 0.0 }; b.mark = d.mark_t; b.mark_v = s.mark.max(old); } // a mark run out leaves nothing
                if s.stun != 0.0 && b.hp > 0.0 { let t = s.stun * (if d.bugs[b.kind].boss { 0.3 } else { 1.0 }); freeze(b, t, false); }
            }
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
        for b in self.bugs.iter_mut() { b.slow = 1.0; }
        // roots grow back by themselves (aloes add to it in update_plant); where that would close the way, they wait
        if !self.stubs.is_empty() {
            let ids: Vec<u32> = self.stubs.iter().map(|s| s.id).collect();
            for id in ids {
                let Some(k) = self.stubs.iter().position(|s| s.id == id) else { continue };
                let g = (self.stubs[k].grow + dt / self.regrow).min(1.0); self.stubs[k].grow = g;
                if g >= 1.0 { self.regrow_stub(id, true); }
            }
        }
        for pi in 0..self.plants.len() { self.update_plant(pi, dt); }
        for bi in 0..self.bugs.len() { { let b = &mut self.bugs[bi]; if b.mark > 0.0 { b.mark -= dt; } } if self.bugs[bi].hp > 0.0 { self.update_bug(bi, dt); } }
        for si in 0..self.shots.len() { self.update_shot(si, dt); }
        self.shots.retain(|s| !s.done);
        self.bugs.retain(|b| b.hp > 0.0);
        if self.phase == Phase::Lost { return; }
        if self.phase == Phase::Wave && self.queue.is_empty() && self.bugs.is_empty() {
            if self.wave >= self.waves { self.phase = Phase::Won; }
            else {
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
        for b in &self.bugs { out.extend_from_slice(&[b.id as f64, b.hp, b.x, b.y, b.slow, b.frozen, b.burn, b.chew, b.thaw, b.chew_cd, b.skill, b.rush, b.mark, b.coming, if b.has_t { b.ti as f64 } else { -1.0 }, if b.has_t { b.tj as f64 } else { -1.0 }]); }
        out.push(self.plants.len() as f64);
        for p in &self.plants { out.extend_from_slice(&[p.id as f64, p.lvl as f64, p.i as f64, p.j as f64, p.hp, p.cd, p.web, p.buff, p.guard]); }
        out.push(self.stubs.len() as f64);
        for s in &self.stubs { out.extend_from_slice(&[s.id as f64, s.i as f64, s.j as f64, s.grow]); }
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

pub fn dist_over(grid: &[Cell; N], fruit: (i32, i32), extra: i32) -> [f64; N] {
    let mut d = [INF; N]; let mut q = [(0i32, 0i32); N]; let mut qn = 1; q[0] = fruit;
    d[key(fruit.0, fruit.1)] = 0.0;
    let mut h = 0;
    while h < qn {
        let (i, j) = q[h]; h += 1; let k = d[key(i, j)];
        for (di, dj) in DIRS {
            let (ni, nj) = (i + di, j + dj);
            if !inside(ni, nj) { continue; }
            let nk = key(ni, nj);
            if d[nk] != INF || grid[nk] != Cell::Empty || nk as i32 == extra { continue; }
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
