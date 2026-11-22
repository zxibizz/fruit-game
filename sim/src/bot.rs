// The bot that plays a level the way it is meant to be played, and worse on purpose: the balance matrix (balance/)
// runs it. The smart bot builds a serpentine maze over the whole field, leads the trail through mud and nettles, puts
// its best plants on fertile beds and where they see the most of the trail, mixes in mint and bells, upgrades what
// pays most, mends holes, calls the waves early and uses frost and rain. Options switch its skills off:
//   route — the share of the maze walls it builds (0: the trail as it is), or maze — one of the mazes of routes.rs
//   by name ("mid/fruit": a length of the trail and the way it winds); terrain: false — blind to the ground;
//   plan — a garden laid out beforehand (balance/design.mjs): plants to put and to grow, cell by cell, in that
//   order, each as soon as there is dew for it; the bot mends it, calls the waves and uses its powers as ever, and
//   spends what is left its own way once the plan is done;
//   policy — a strategy (balance/strategy.mjs finds its weights): the bot weighs its steps as ever, and every
//   planting is worth exp(w·f) times more, f being what the player sees in the cell for that kind of plant (feat()),
//   every growing exp(u) times more, by the kind; the maze is the one of routes::pool with the most m·f;
//   hp — every bug that many times healthier (the batch plays it on data scaled so: main.rs);
//   powers — on, off or eager (frost and rain at the first chance); bank — that much dew in hand from the start (an
//   upper bound for a lazy garden); meta — the perks bought; max_plants — a cap on the garden; place — where the
//   shooters go: best (most damage for the dew), end / start (only by the last / first part of the trail), spread
//   (any useful cell, picked at random); plants — the kinds it may plant; upgrades — greedy, none or first (grows
//   what it has before planting more); early — calls every wave at once (else waits for the countdown); repair —
//   closes holes for dew at once.
use crate::data::*;
use crate::game::*;
use crate::jsmath;
use crate::routes::{Wall, SERPENTINES, NM};

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Powers { Off, On, Eager }
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Where { Best, End, Start, Spread }
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Upgrades { Greedy, None, First }
#[derive(Clone, Debug)]
pub struct Opts {
    pub seed: u32, pub max_plants: f64, pub route: f64, pub maze: Option<String>, pub hp: f64, pub plan: Option<Vec<(Option<usize>, i32, i32)>>, pub policy: Option<Policy>, pub terrain: bool, pub powers: Powers, pub bank: Option<f64>, pub meta: Vec<(String, usize)>,
    pub place: Where, pub plants: Option<Vec<usize>>, pub upgrades: Upgrades, pub early: bool, pub repair: bool, pub reserve: f64,
    pub steps: usize, // the party stops after so many steps of the game (for the parity check: a part of a level is enough there)
}
// The share of the pay for a wave that the bot keeps for repairs once the diggers come.
pub const RESERVE: f64 = 0.6;
impl Default for Opts {
    fn default() -> Opts { Opts { seed: 7, max_plants: f64::INFINITY, route: 1.0, maze: None, hp: 1.0, plan: None, policy: None, terrain: true, powers: Powers::On, bank: None, meta: Vec::new(), place: Where::Best, plants: None, upgrades: Upgrades::Greedy, early: true, repair: true, reserve: RESERVE, steps: usize::MAX } }
}
// the garden as it stood when a wave began (Bot::gauge)
#[derive(Clone, Copy, Debug)]
pub struct Gauge { pub wave: usize, pub ground: f64, pub air: f64, pub towers: usize, pub dew: f64, pub cover: f64, pub trail: usize, pub pepper: f64, pub slowed: f64, pub hot: f64 }
#[derive(Clone, Debug, Default)]
pub struct Res {
    pub worth: f64, pub trail: usize, pub won: bool, pub hp: f64, pub max_hp: f64, pub wave: usize, pub waves: usize, pub plants: usize, pub grown: usize, pub maxed: usize,
    pub dew: f64, pub eaten: usize, pub income: f64, pub kinds: Vec<(usize, usize)>, pub bites: Vec<((usize, usize, bool), usize)>, pub powers_used: usize, pub time: f64,
    pub gauge: Vec<Gauge>,
}
// what the bot did, for a replay by the JS simulation (sim/js/replay.mjs)
#[derive(Clone, Debug)]
pub enum Op { Step(u32), Place(usize, i32, i32), Up(i32, i32), Wave, Regrow(i32, i32), Sell(i32, i32), Power(Power), Dew(f64) }

// A strategy: the weights of what a player sees in a cell (NF numbers, feat()) for every kind of plant, the weight
// of growing every kind, and the weights of what is seen in a maze (routes::pool), if it picks its own.
pub const NF: usize = 9;
#[derive(Clone, Debug)]
pub struct Policy { pub place: Vec<[f64; NF]>, pub up: Vec<f64>, pub maze: Option<[f64; NM]> }
fn hurts(d: &Data, kind: usize) -> bool { let p = &d.plants[kind]; p.has[Stat::Dmg as usize] || p.has[Stat::Eat as usize] }
// For every cell of the trail: how many plants that deal damage reach it, and whether a mint slows it.
fn heat_map(g: &Game, s: &Study, tr: &Tr) -> (Vec<f64>, Vec<bool>) {
    let d = g.d; let mut hits = vec![0.0; tr.len()]; let mut slow = vec![false; tr.len()];
    for p in &s.plants {
        let pd = &d.plants[p.kind]; let r = g.pstat(p.kind, p.lvl, p.i, p.j, Stat::Range); if r == 0.0 { continue; }
        let rg = if pd.ground_range != 0.0 { r.min(pd.ground_range) } else { r };
        for (k, &(a, b, _)) in tr.iter().enumerate() {
            if hurts(d, p.kind) && within((a - p.i) as f64, (b - p.j) as f64, rg) { hits[k] += 1.0; }
            if pd.has[Stat::Slow as usize] && within((a - p.i) as f64, (b - p.j) as f64, r) { slow[k] = true; }
        }
    }
    (hits, slow)
}
// What a player sees in cell (i, j) for a plant of this kind:
//   0 1 (the weight of the kind itself)
//   1 the cells of the trail in its reach, over 8
//   2 the times the trail comes into its reach (a trail winding round it comes in more than once), over 3
//   3 the plants that deal damage reaching those cells, the mean over them, over 4 (where the damage is)
//   4 the share of those cells a mint slows
//   5 the plants that deal damage within its reach of the cell, over 4 (for a bell)
//   6 how far along the trail those cells lie, the mean (0: by the anthill, 1: by the fruit)
//   7 1 on fertile ground
//   8 1 on the trail or in a wall of the maze (the plant changes the trail)
fn feat(g: &Game, s: &Study, tr: &Tr, heat: &(Vec<f64>, Vec<bool>), far: f64, kind: usize, i: i32, j: i32, wall: bool) -> [f64; NF] {
    let d = g.d; let pd = &d.plants[kind]; let r = pd.st[Stat::Range as usize][0]; let rg = if pd.ground_range != 0.0 { r.min(pd.ground_range) } else { r };
    let (mut n, mut runs, mut hot, mut sl, mut prog, mut prev) = (0.0, 0.0, 0.0, 0.0, 0.0, false);
    if r > 0.0 {
        for (k, &(a, b, step)) in tr.iter().enumerate() {
            let inn = within((a - i) as f64, (b - j) as f64, rg);
            if inn { n += 1.0; if !prev { runs += 1.0; } hot += heat.0[k]; if heat.1[k] { sl += 1.0; } prog += step as f64 / far; }
            prev = inn;
        }
    }
    let nn = if n > 0.0 { n } else { 1.0 };
    let near = if r > 0.0 { s.plants.iter().filter(|p| (p.i, p.j) != (i, j) && hurts(d, p.kind) && within((p.i - i) as f64, (p.j - j) as f64, r)).count() as f64 } else { 0.0 };
    [1.0, n / 8.0, runs / 3.0, hot / nn / 4.0, sl / nn, near / 4.0, prog / nn, if g.tiles[key(i, j)] == Tile::Fertile { 1.0 } else { 0.0 }, if wall { 1.0 } else { 0.0 }]
}
fn bias(p: &[f64; NF], f: &[f64; NF]) -> f64 { let z: f64 = (0..NF).map(|k| p[k] * f[k]).sum(); z.max(-8.0).min(8.0).exp() }

// a plant as the bot weighs it: one that stands, or one it thinks of planting or growing
#[derive(Clone, Copy, Debug)]
struct BP { kind: usize, lvl: usize, i: i32, j: i32 }
// the coming waves as the bot sees them
#[derive(Clone, Copy, Default)]
struct Soon { set: bool, armor: f64, crowd: f64, n_g: f64, n_a: f64, hp_g: f64, hp_a: f64 }
type Tr = Vec<(i32, i32, usize)>;

fn js_rng(s: &mut i32) -> f64 { *s = s.wrapping_mul(1103515245).wrapping_add(12345) & 0x7fffffff; *s as f64 / 2147483647.0 }

// every cell some trail runs over (a level may have two anthills), each once
// (the third number: how many cells a bug has walked when it gets there)
fn trail_of(g: &Game, dist: &[f64; N]) -> Tr {
    let mut seen = [false; N]; let mut out = Vec::new();
    for e in 0..g.entries.len() { for (n, &(i, j)) in g.trail(dist, e).iter().enumerate() { if !seen[key(i, j)] { seen[key(i, j)] = true; out.push((i, j, n + 1)); } } }
    out
}

// The maze: full-height walls of plants two columns apart, each with one gap, the gaps at opposite ends in turn.
// The wall columns and the gap rows are searched for the best trail: the longest, and (seeing the ground) with mud
// and nettles on it.
pub fn layout(d: &Data, level: usize, terrain: bool) -> Vec<(i32, i32)> {
    let base = Game::new(d, level, 1, &[]);
    let value = |walls: &[(i32, i32)]| -> f64 {
        let mut g = base.clone();
        for &(col, gap) in walls { for j in 0..ROWS { if j != gap && g.grid[key(col, j)] == Cell::Empty && g.tiles[key(col, j)] != Tile::Nettle && (col, j) != g.fruit { g.grid[key(col, j)] = Cell::Rock; } } }
        let dist = g.compute_dist(-1); let mut min = f64::INFINITY;
        for e in 0..g.entries.len() {
            let tr = g.trail(&dist, e);
            if *tr.last().unwrap() != g.fruit { return -1.0; }
            let mut s = 0.0;
            for &(i, j) in &tr { s = s + 1.0 + (if terrain { match g.tiles[key(i, j)] { Tile::Mud => 0.8, Tile::Nettle => 1.5, _ => 0.0 } } else { 0.0 }); }
            if s < min { min = s; }
        }
        min
    };
    let mut best: Vec<(i32, i32)> = Vec::new(); let mut best_v = -1.0;
    for cols in SERPENTINES {
        let mut walls: Vec<(i32, i32)> = Vec::new();
        let tune = |walls: &mut Vec<(i32, i32)>, k: usize| {
            let mut at = walls[k].1; let mut top = -1.0;
            for j in 0..ROWS { walls[k].1 = j; let v = value(walls); if v > top { top = v; at = j; } }
            walls[k].1 = at;
        };
        for &col in cols { walls.push((col, 0)); let k = walls.len() - 1; tune(&mut walls, k); } // wall by wall, then two more rounds
        for _ in 0..2 { for k in 0..walls.len() { tune(&mut walls, k); } }
        let v = value(&walls); if v > best_v { best_v = v; best = walls.clone(); }
    }
    best
}

// What a garden is worth: the damage a bug takes on its way. For every cell of the trail, the damage per second of
// the plants that reach it, times the time a bug spends there (longer by a mint, longer in mud).
// study() does the part shared by all plants (the time in every cell); term() is one plant's share. A candidate that
// changes neither the trail nor the time or the buff of others (not a mint, not a bell) adds only its own share.
struct Study { plants: Vec<BP>, time: Vec<f64>, bells: Vec<(i32, i32, f64, f64)> }

#[inline] fn st(g: &Game, _o: &Soon, terrain: bool, p: &BP, s: Stat) -> f64 { if terrain { g.pstat(p.kind, p.lvl, p.i, p.j, s) } else { g.pstat(p.kind, p.lvl, -1, -1, s) } }

// ovr: a plant taken as standing on its cell (in place of what stands there, if anything)
fn study(g: &Game, tr: &Tr, o: &Soon, terrain: bool, ovr: Option<BP>) -> Study {
    let d = g.d;
    let mut cells: [Option<BP>; N] = [None; N];
    for p in &g.plants { cells[key(p.i, p.j)] = Some(BP { kind: p.kind, lvl: p.lvl, i: p.i, j: p.j }); }
    if let Some(q) = ovr { cells[key(q.i, q.j)] = Some(q); }
    let plants: Vec<BP> = cells.iter().filter_map(|c| *c).collect();
    let s = |p: &BP, name: Stat| st(g, o, terrain, p, name);
    let has = |p: &BP, name: Stat| d.plants[p.kind].has[name as usize];
    let mints: Vec<(i32, i32, f64, f64)> = plants.iter().filter(|p| has(p, Stat::Slow)).map(|p| (p.i, p.j, s(p, Stat::Range), s(p, Stat::Slow) + (if s(p, Stat::Chill) != 0.0 { 0.06 } else { 0.0 }))).collect();
    let bells: Vec<(i32, i32, f64, f64)> = plants.iter().filter(|p| has(p, Stat::Buff)).map(|p| (p.i, p.j, s(p, Stat::Range), s(p, Stat::Buff))).collect();
    // a rose marks the bugs it pricks: all the damage they take on the cells it reaches is that much more, for the
    // share of the crowd it keeps marked (what it pricks in MARK_T seconds over the walkers in its reach)
    let roses: Vec<(i32, i32, f64, f64)> = plants.iter().filter(|p| has(p, Stat::Mark)).map(|p| {
        let r = s(p, Stat::Range); let n = tr.iter().filter(|&&(a, b, _)| within((a - p.i) as f64, (b - p.j) as f64, r)).count();
        let multi = s(p, Stat::Multi);
        (p.i, p.j, r, s(p, Stat::Mark) * (1.0f64).min((if multi != 0.0 { multi } else { 1.0 }) * s(p, Stat::Rate) * d.mark_t / (1.0f64).max(o.crowd * n as f64)))
    }).collect();
    let time: Vec<f64> = tr.iter().map(|&(a, b, _)| {
        let mut slow = 0.0f64; for &(i, j, r, v) in &mints { if within((a - i) as f64, (b - j) as f64, r) { slow = slow.max(v); } }
        let mut mark = 0.0f64; for &(i, j, r, v) in &roses { if within((a - i) as f64, (b - j) as f64, r) { mark = mark.max(v); } }
        let free = g.grid[key(a, b)] == Cell::Empty && ovr.map_or(true, |q| (q.i, q.j) != (a, b));
        (1.0 + mark) / ((1.0 - slow) * (if terrain && g.tiles[key(a, b)] == Tile::Mud && free { d.mud } else { 1.0 }))
    }).collect();
    Study { plants, time, bells }
}
// cells a flyer spends in reach of plant p: the chord of its circle along its straight way to the fruit. Flyers set
// off from any row past the right edge (game.rs spawn), so the chord is averaged over a few starting rows.
const FLY_ROWS: [f64; 5] = [1.0, 2.5, 4.0, 5.5, 7.0];
fn fly_time(g: &Game, p: &BP, r: f64) -> f64 {
    let (fx, fy, sx) = (g.fruit.0 as f64 + 0.5, g.fruit.1 as f64 + 0.5, COLS as f64 + 0.6); let mut sum = 0.0;
    for sy in FLY_ROWS {
        let (dx, dy) = (fx - sx, fy - sy); let len = { let l = hyp(dx, dy); if l != 0.0 { l } else { 1.0 } };
        let (ux, uy) = (dx / len, dy / len); let (px, py) = (p.i as f64 + 0.5 - sx, p.j as f64 + 0.5 - sy);
        let along = px * ux + py * uy; let off = (px * uy - py * ux).abs(); if off >= r { continue; }
        let h = (r * r - off * off).sqrt(); sum += (0.0f64).max((len + 0.5).min(along + h) - (0.0f64).max(along - h));
    }
    sum / FLY_ROWS.len() as f64 * 1.5 // the fruit end matters most: every flyer passes there
}
// One plant's share: the damage it deals to the bugs passing, per bug (walkers, flyers). A bug crowd shares a
// single-target plant's shots, while corn's splash and pepper's fire hit many at once: o.crowd is how many walkers
// stand on one cell of the trail in the coming waves. Flyers cross the field in a straight line from the anthill to
// the fruit.
fn term(g: &Game, s_: &Study, tr: &Tr, o: &Soon, terrain: bool, p: &BP) -> (f64, f64) {
    let d = g.d; let pd = &d.plants[p.kind];
    let s = |name: Stat| st(g, o, terrain, p, name);
    let hit = |x: f64| (x - o.armor).max(1.0);
    let dps = if pd.has[Stat::Eat as usize] { (if o.hp_g != 0.0 { o.hp_g } else { f64::INFINITY }).min(s(Stat::Chomp) + s(Stat::Gulp) * o.hp_g) / s(Stat::Eat) } // a bite, or a worn bug swallowed
        else if p.kind == d.pepper { hit(s(Stat::Dmg)) * s(Stat::Rate) + s(Stat::Burn) * (1.0f64).min(s(Stat::BurnT) * s(Stat::Rate)) } // to every bug in its reach
        else if pd.has[Stat::Dmg as usize] { hit(s(Stat::Dmg)) * s(Stat::Rate) * (if s(Stat::Stun) != 0.0 { 1.1 } else { 1.0 }) }
        else { 0.0 };
    if dps == 0.0 { return (0.0, 0.0); }
    let mut buff = 0.0f64; for &(qi, qj, r, v) in &s_.bells { if (qi, qj) != (p.i, p.j) && within((qi - p.i) as f64, (qj - p.j) as f64, r) { buff = buff.max(v); } }
    let r = s(Stat::Range); let rg = if pd.ground_range != 0.0 { r.min(pd.ground_range) } else { r }; // the dandelion: walkers only next to it, and weaker
    let mut n = 0.0; let mut cells = 0usize;
    for (k, &(a, b, _)) in tr.iter().enumerate() { if within((a - p.i) as f64, (b - p.j) as f64, rg) { n += s_.time[k]; cells += 1; } }
    let crowd = o.crowd; let in_reach = (1.0f64).max(crowd * cells as f64); // walkers in its reach at once
    let per = if p.kind == d.pepper { 1.0 } // fire hits all of them
        else {
            let multi = { let m = s(Stat::Multi); if m != 0.0 { m } else { 1.0 } };
            let many = if pd.has[Stat::Splash as usize] { let h = s(Stat::Hits); (if h != 0.0 { h } else { f64::INFINITY }).min(1.0 + 2.0 * s(Stat::Splash) * crowd) } else { 1.0 };
            (1.0f64).min((multi * many) / in_reach) // a shot's bugs (a cob hits so many at most) over the bugs to share
        };
    let k = dps * (1.0 + buff); let gr = k * n * per * (if pd.ground != 0.0 { pd.ground } else { 1.0 });
    let air = if pd.air || (pd.has[Stat::Eat as usize] && s(Stat::EatAir) != 0.0) { k * fly_time(g, p, r) * (if pd.ground != 0.0 { 1.0 } else { 0.6 }) } else { 0.0 }; // a ground plant has other targets too
    (gr, air)
}
// What the garden is worth for the coming waves: the bugs it stops. A bug that gets through bites, so walkers and
// flyers count by their number, each kind by the damage it takes against its health: once one side is safe, more of
// it adds little and the bot builds up what falls short. r: how many times over a bug's health the garden deals on
// its way; exp(-r) is about the share of them that get through. A small log term keeps the bot building for later
// waves when the coming ones look safe.
fn kept(n: f64, r: f64) -> f64 { n * (1.0 - jsmath::exp(-r)) + 0.05 * n * jsmath::log(1.0 + r) }
fn value(o: &Soon, g_: f64, a: f64) -> f64 { kept(o.n_g, g_ / o.hp_g) + kept(o.n_a, a / o.hp_a) }
fn sums(g: &Game, s: &Study, tr: &Tr, o: &Soon, terrain: bool) -> (f64, f64) { let (mut gs, mut a) = (0.0, 0.0); for p in &s.plants { let (gr, ar) = term(g, s, tr, o, terrain, p); gs += gr; a += ar; } (gs, a) }
fn worth(g: &Game, tr: &Tr, o: &Soon, terrain: bool, ovr: Option<BP>) -> f64 { let s = study(g, tr, o, terrain, ovr); let (gs, a) = sums(g, &s, tr, o, terrain); value(o, gs, a) }
// plants that change the others' share: their worth is counted over the whole garden
fn wide(d: &Data, kind: usize) -> bool { let p = &d.plants[kind]; p.has[Stat::Slow as usize] || p.has[Stat::Buff as usize] || p.has[Stat::Mark as usize] }

#[derive(Clone, Copy)]
enum Act { Place(usize, i32, i32), Up(u32), Swap(u32, usize) }
#[derive(Clone, Copy)]
struct Offer { gain: f64, cost: f64, act: Act }

struct Bot<'a, 'o> {
    g: Game<'a>, d: &'a Data, lv: &'a Level, opt: &'o Opts, o: Soon, r: i32,
    walls: Vec<Wall>, planned: Vec<(i32, i32)>, keep: [bool; N], kinds: Vec<usize>, others: Vec<usize>, reach: f64, first_digger: i32,
    aloe: bool, eaten_at: Vec<(i32, i32)>, seen: Option<(usize, Phase, usize, f64)>, need: f64,
    ops: Option<Vec<Op>>, dew_seen: f64, buf: Vec<f64>,
    done: Vec<bool>, // the steps of the plan that are done with
}

impl<'a, 'o> Bot<'a, 'o> {
    // the recorder: every action on the game goes to the list (the bot also sets the dew by hand: that is an action too)
    fn sync(&mut self) { if let Some(ops) = self.ops.as_mut() { if self.g.dew != self.dew_seen { ops.push(Op::Dew(self.g.dew)); } } }
    fn rec(&mut self, op: Op) { self.sync(); if let Some(ops) = self.ops.as_mut() { ops.push(op); } }
    fn step(&mut self, dt: f64) { self.sync(); self.g.step(dt); if self.ops.is_some() { let h = self.g.hash(&mut self.buf); self.ops.as_mut().unwrap().push(Op::Step(h)); } self.dew_seen = self.g.dew; }
    fn place(&mut self, kind: usize, i: i32, j: i32) -> bool { self.rec(Op::Place(kind, i, j)); let r = self.g.place(kind, i, j); self.dew_seen = self.g.dew; r }
    fn upgrade(&mut self, pi: usize) -> bool { let (i, j) = (self.g.plants[pi].i, self.g.plants[pi].j); self.rec(Op::Up(i, j)); let r = self.g.upgrade(pi); self.dew_seen = self.g.dew; r }
    fn start_wave(&mut self) { self.rec(Op::Wave); self.g.start_wave(); self.dew_seen = self.g.dew; }
    fn regrow(&mut self, k: usize) { let s = &self.g.stubs[k]; let (id, i, j) = (s.id, s.i, s.j); self.rec(Op::Regrow(i, j)); self.g.regrow_stub(id, false); self.dew_seen = self.g.dew; }
    fn sell(&mut self, pi: usize) { let p = &self.g.plants[pi]; let (id, i, j) = (p.id, p.i, p.j); self.rec(Op::Sell(i, j)); self.g.remove_plant(id, true); self.dew_seen = self.g.dew; }
    fn use_power(&mut self, kind: Power) { self.rec(Op::Power(kind)); self.g.use_power(kind); self.dew_seen = self.g.dew; }

    fn room(&self) -> bool { ((self.g.plants.len() + self.g.stubs.len()) as f64) < self.opt.max_plants }

    // the coming waves: how many walkers stand on a cell of the trail (from their pace: speed and gap), weighed by
    // health; the bites at stake (what gets through bites by its kind's bite); the health of one bug; and the armor
    // a hit meets, weighed by the health that wears it
    fn look_ahead(&mut self) { self.o = self.soon_at(self.g.wave); }
    // the same for the three waves after wave `from`
    fn soon_at(&self, from: usize) -> Soon {
        let (g, d, lv) = (&self.g, self.d, self.lv);
        let (mut dd, mut w, mut n_g, mut n_a, mut c_g, mut c_a, mut h_g, mut h_a) = (0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0);
        let (mut sum, mut all) = (0.0, 0.0);
        for (k, wave) in lv.waves.iter().skip(from).take(3).enumerate() {
            for gr in wave {
                let b = &d.bugs[gr.kind]; let n = gr.count as f64; let hp = g.bug_hp(gr.kind, from + 1 + k); let bites = n * b.bite;
                if b.fly { n_a += bites; c_a += n; h_a += n * hp; continue; }
                n_g += bites; c_g += n; h_g += n * hp; dd += n * hp * (6.0f64).min(1.0 / (0.15f64).max(b.speed * gr.gap)); w += n * hp;
            }
        }
        for wave in lv.waves.iter().skip(from).take(3) { for gr in wave { let b = &d.bugs[gr.kind]; let q = gr.count as f64 * b.hp * (if b.fly { 0.0 } else { 1.0 }); sum += q * b.armor; all += q; } }
        Soon { set: true, armor: if all != 0.0 { sum / all } else { 0.0 }, crowd: if w != 0.0 { dd / w } else { 1.0 }, n_g: if n_g != 0.0 { n_g } else { 0.1 }, n_a,
            hp_g: if c_g != 0.0 { h_g / c_g } else { 50.0 }, hp_a: if c_a != 0.0 { h_a / c_a } else { 50.0 } }
    }
    // The garden against the wave that has just begun and the two after it, in the bot's own count of the damage a
    // bug takes on its way (study, term): how many times over their health the walkers lose on one pass of the trail
    // at their own pace (1: the garden kills a bug of the mean health once; the pace is weighed by health), the same
    // for the flyers, and what that is made of: the plants that are not pumpkins, the dew in them, how many plants
    // that deal damage reach a cell of the trail (the mean over its cells), and the cells of the trail.
    fn gauge(&self) -> Gauge {
        let (g, d) = (&self.g, self.d); let from = g.wave.max(1) - 1; let o = self.soon_at(from);
        let (mut sp, mut w) = (0.0, 0.0);
        for (k, wave) in self.lv.waves.iter().skip(from).take(3).enumerate() { for gr in wave { let b = &d.bugs[gr.kind]; if b.fly { continue; } let q = gr.count as f64 * g.bug_hp(gr.kind, from + 1 + k); sp += q * b.speed; w += q; } }
        let speed = if w != 0.0 { sp / w } else { 1.0 };
        let tr = trail_of(g, &g.dist); let s = study(g, &tr, &o, true, None); let (gs, a) = sums(g, &s, &tr, &o, true);
        // how the plants stand by the trail: the cells of it a pepper burns (the mean over the peppers: a trail led
        // round a pepper gives it more), the share of the plants' reach that lies under a mint, and how many plants
        // reach a cell a mint slows against a cell of the trail at large (over 1: the mints stand where the damage is)
        let mut hits = vec![0usize; tr.len()]; let mut slow = vec![false; tr.len()];
        let (mut reach, mut peppers, mut burnt) = (0usize, 0usize, 0usize);
        for p in &s.plants { let pd = &d.plants[p.kind]; let r = g.pstat(p.kind, p.lvl, p.i, p.j, Stat::Range);
            if pd.has[Stat::Slow as usize] { for (k, &(x, y, _)) in tr.iter().enumerate() { if within((x - p.i) as f64, (y - p.j) as f64, r) { slow[k] = true; } } }
            if !(pd.has[Stat::Dmg as usize] || pd.has[Stat::Eat as usize]) { continue; }
            let rg = if pd.ground_range != 0.0 { r.min(pd.ground_range) } else { r }; let mut n = 0;
            for (k, &(x, y, _)) in tr.iter().enumerate() { if within((x - p.i) as f64, (y - p.j) as f64, rg) { hits[k] += 1; n += 1; } }
            reach += n; if p.kind == d.pepper { peppers += 1; burnt += n; } }
        let under: usize = (0..tr.len()).filter(|&k| slow[k]).map(|k| hits[k]).sum(); let cells = slow.iter().filter(|&&x| x).count();
        let towers: Vec<&Plant> = g.plants.iter().filter(|p| p.kind != d.pumpkin).collect();
        Gauge { wave: g.wave, ground: gs / (o.hp_g * speed), air: if o.n_a != 0.0 { a / o.hp_a } else { -1.0 }, towers: towers.len(), dew: towers.iter().map(|p| p.spent).sum(), cover: reach as f64 / tr.len().max(1) as f64, trail: tr.len(),
            pepper: if peppers != 0 { burnt as f64 / peppers as f64 } else { -1.0 }, slowed: if reach != 0 { under as f64 / reach as f64 } else { 0.0 },
            hot: if cells != 0 && reach != 0 { (under as f64 / cells as f64) / (reach as f64 / tr.len() as f64) } else { -1.0 } }
    }

    // the step that pays most for its dew
    fn best(&mut self) -> Option<Offer> {
        self.look_ahead();
        let d = self.d; let o = self.o; let terrain = self.opt.terrain; let wh = self.opt.place; let upgrades = self.opt.upgrades;
        let g = &self.g;
        let tr = trail_of(g, &g.dist); let s = study(g, &tr, &o, terrain, None); let (g0, a0) = sums(g, &s, &tr, &o, terrain); let now = value(&o, g0, a0);
        let add = |t: (f64, f64), t0: (f64, f64)| value(&o, g0 + t.0 - t0.0, a0 + t.1 - t0.1) - now;
        let mut on = [false; N]; for &(i, j, _) in &tr { on[key(i, j)] = true; }
        let mut top: Option<Offer> = None; let mut offers: Vec<Offer> = Vec::new();
        // 'spread' takes any useful step at random instead of the best one; 'first' prefers growing to planting
        let mut offer = |mut gain: f64, cost: f64, act: Act, up: bool| {
            if gain <= 1e-6 { return; } if up && upgrades == Upgrades::First { gain *= 3.0; }
            offers.push(Offer { gain, cost, act });
            if top.map_or(true, |t| gain / cost > t.gain / t.cost) { top = Some(Offer { gain, cost, act }); }
        };
        // the part of the trail a placement policy allows shooters by
        // (by the steps walked to get there: with two anthills the trail cells of both count, not their sum)
        let part = match wh { Where::End => (0.6, 1.0), Where::Start => (0.0, 0.4), _ => (0.0, 1.0) };
        let far = tr.iter().fold(1.0f64, |m, &(_, _, n)| m.max(n as f64));
        let seg: Vec<(i32, i32)> = tr.iter().filter(|&&(_, _, n)| n as f64 >= part.0 * far && n as f64 <= part.1 * far + 1.0).map(|&(a, b, _)| (a, b)).collect();
        // a strategy's say in it (Policy): how much more a step is worth for where it puts what
        let pol = self.opt.policy.as_ref(); let heat = if pol.is_some() { heat_map(g, &s, &tr) } else { (Vec::new(), Vec::new()) };
        let planned = &self.planned;
        let lean = |kind: usize, i: i32, j: i32| -> f64 { match pol { None => 1.0, Some(p) => bias(&p.place[kind], &feat(g, &s, &tr, &heat, far, kind, i, j, on[key(i, j)] || planned.contains(&(i, j)))) } };
        let lean_up = |kind: usize| -> f64 { pol.map_or(1.0, |p| p.up[kind].max(-8.0).min(8.0).exp()) };
        let allowed_at = |i: i32, j: i32, kind: usize| kind == d.pumpkin || wh == Where::Best || wh == Where::Spread || seg.iter().any(|&(a, b)| hyp((a - i) as f64, (b - j) as f64) <= d.plants[kind].st[Stat::Range as usize][0] + 0.01);
        let try_cell = |i: i32, j: i32, kinds: &[usize], offer: &mut dyn FnMut(f64, f64, Act, bool)| {
            if g.grid[key(i, j)] != Cell::Empty || g.stub_at(i, j).is_some() || g.place_problem(i, j) { return; }
            for &kind in kinds {
                if !allowed_at(i, j, kind) { continue; }
                let q = BP { kind, lvl: 1, i, j };
                let gain = if on[key(i, j)] {
                    let mut grid = g.grid; grid[key(i, j)] = Cell::Rock;
                    let tr2 = trail_of(g, &compute_dist(&grid, g.fruit, -1));
                    worth(g, &tr2, &o, terrain, Some(q)) - now + (tr2.len() as f64 - tr.len() as f64) * 1e-3 * o.n_g
                } else if wide(d, kind) { worth(g, &tr, &o, terrain, Some(q)) - now }
                else { add(term(g, &s, &tr, &o, terrain, &q), (0.0, 0.0)) }; // only its own share: the others do not change
                offer(gain * lean(kind, i, j), d.plants[kind].cost, Act::Place(kind, i, j), false);
            }
        };
        if self.room() {
            for &(i, j) in &self.planned { try_cell(i, j, &self.kinds, &mut offer); }
            for i in 0..COLS { for j in 0..ROWS {
                if !self.keep[key(i, j)] && !on[key(i, j)] && tr.iter().any(|&(a, b, _)| hyp((a - i) as f64, (b - j) as f64) <= self.reach) { try_cell(i, j, &self.others, &mut offer); }
            } }
        }
        for p in &g.plants {
            let bp = BP { kind: p.kind, lvl: p.lvl, i: p.i, j: p.j };
            let c = if upgrades == Upgrades::None || p.lvl >= 3 { None } else { Some(d.plants[p.kind].up[p.lvl - 1]) };
            if let Some(c) = c {
                let up = BP { lvl: p.lvl + 1, ..bp };
                let gain = if wide(d, p.kind) { worth(g, &tr, &o, terrain, Some(up)) - now } else { let was = term(g, &s, &tr, &o, terrain, &bp); add(term(g, &s, &tr, &o, terrain, &up), was) };
                let gain = if gain != 0.0 { gain } else if p.kind == d.pumpkin && g.wave as i32 >= self.first_digger - 2 { 1e-3 * o.n_g } else { 0.0 };
                offer(gain * lean_up(p.kind), c, Act::Up(p.id), true);
            }
            if p.kind == d.pumpkin && p.lvl == 1 && g.phase == Phase::Build {
                for &kind in &self.others {
                    if !allowed_at(p.i, p.j, kind) { continue; }
                    let q = BP { kind, ..bp };
                    let gain = if wide(d, kind) { worth(g, &tr, &o, terrain, Some(q)) - now } else { add(term(g, &s, &tr, &o, terrain, &q), (0.0, 0.0)) };
                    offer(gain * lean(kind, p.i, p.j), d.plants[kind].cost - g.refund_of(p) + 0.01, Act::Swap(p.id, kind), false);
                }
            }
        }
        if wh == Where::Spread && !offers.is_empty() {
            let ok: Vec<Offer> = offers.iter().filter(|q| q.cost <= g.dew).cloned().collect();
            return if !ok.is_empty() { let k = (js_rng(&mut self.r) * ok.len() as f64).floor() as usize; ok.get(k).cloned() } else { top };
        }
        top
    }
    fn run(&mut self, a: Act) {
        match a {
            Act::Place(kind, i, j) => { self.place(kind, i, j); }
            Act::Up(id) => { if let Some(pi) = self.g.pidx(id) { self.upgrade(pi); } }
            Act::Swap(id, kind) => { if let Some(pi) = self.g.pidx(id) { let (i, j) = (self.g.plants[pi].i, self.g.plants[pi].j); self.sell(pi); self.place(kind, i, j); } }
        }
    }

    // from the first diggers on, some dew is always kept to close a hole at once
    // (a share of the pay for the last wave: little dew comes in while a wave is on, and the upgrades are the dear
    // part; in the last wave only a hole's worth: what is kept there is left over, and the matrix reads it as idle dew)
    fn keep_dew(&self) -> f64 {
        if (!self.walls.is_empty() || self.opt.plan.is_some()) && self.g.wave as i32 >= self.first_digger - 1 { if self.g.wave >= self.g.waves { 50.0 } else { (50.0f64).max(round(self.opt.reserve * self.lv.wave_pay(self.g.wave))) } } else { 0.0 }
    }
    fn try_build(&mut self) {
        let d = self.d;
        // repairs first: a hole the bugs run through is closed at once for dew; other roots grow back by themselves
        let mut tr = [false; N]; for &(i, j, _) in &trail_of(&self.g, &self.g.dist) { tr[key(i, j)] = true; }
        if self.opt.repair {
            let ids: Vec<u32> = self.g.stubs.iter().map(|s| s.id).collect();
            for id in ids {
                let Some(k) = self.g.stubs.iter().position(|s| s.id == id) else { continue };
                let s = &self.g.stubs[k];
                if self.g.phase == Phase::Wave && tr[key(s.i, s.j)] && self.g.dew >= self.g.regrow_cost(k) { self.regrow(k); }
            }
        }
        // a garden laid out beforehand: its steps in their order, each when there is dew for it (with the dew for a
        // hole kept, as the bot keeps it). A step that cannot be taken for good (the cell is taken, the plant is
        // grown) is done with; a plant of another kind in the cell is sold for the one of the plan; one that cannot be taken now (the plant is eaten and growing back, bugs would be shut
        // in) is left for later and the steps after it go on; the first step there is no dew for stops the rest
        let opt = self.opt;
        if let Some(plan) = &opt.plan {
            let keep_dew = self.keep_dew();
            let mut left = false;
            for n in 0..plan.len() {
                if self.done[n] { continue; }
                let (kind, i, j) = plan[n];
                if self.g.stub_at(i, j).is_some() { left = true; continue; }
                match kind {
                    Some(k) => {
                        // another plant stands there (a pumpkin of the wall, as a rule): it is sold for this one
                        if let Some(pi) = self.g.plant_at(i, j) {
                            if self.g.plants[pi].kind == k { self.done[n] = true; continue; }
                            let back = if self.g.phase == Phase::Build && self.g.plants[pi].born == self.g.wave as i32 { self.g.plants[pi].spent } else { (self.g.plants[pi].spent * self.g.refund).floor() };
                            if self.g.dew + back < d.plants[k].cost + keep_dew { left = true; break; }
                            self.sell(pi); self.place(k, i, j); self.done[n] = true; continue;
                        }
                        if self.g.grid[key(i, j)] != Cell::Empty { self.done[n] = true; continue; }
                        if self.g.place_problem(i, j) { if self.g.phase == Phase::Build { self.done[n] = true; } else { left = true; } continue; }
                        if self.g.dew < d.plants[k].cost + keep_dew { left = true; break; }
                        self.place(k, i, j); self.done[n] = true;
                    }
                    None => {
                        // a plant not there yet: its own step is still to come (left for later), or it never will
                        let Some(pi) = self.g.plant_at(i, j) else { if (0..n).any(|m| !self.done[m] && plan[m].0.is_some() && (plan[m].1, plan[m].2) == (i, j)) { left = true; } else { self.done[n] = true; } continue };
                        let Some(c) = self.g.upgrade_cost(pi) else { self.done[n] = true; continue };
                        if self.g.dew < c + keep_dew { left = true; break; }
                        self.upgrade(pi); self.done[n] = true;
                    }
                }
            }
            if left { return; }
        }
        // an aloe where the plants keep being eaten: by two eaten ones that no aloe reaches yet, as near to all of them
        // as a free cell off the trail gets; an aloe with much to mend around it is grown
        if self.aloe {
            let g = &self.g;
            let cover = |q: &(i32, i32)| g.plants.iter().any(|p| p.kind == d.aloe && within((p.i - q.0) as f64, (p.j - q.1) as f64, g.pstat(p.kind, p.lvl, p.i, p.j, Stat::Range)));
            let bare: Vec<(i32, i32)> = self.eaten_at.iter().filter(|q| !cover(q)).cloned().collect(); let r0 = d.plants[d.aloe].st[Stat::Range as usize][0];
            if bare.len() >= 2 && self.room() && g.plants.iter().filter(|p| p.kind == d.aloe).count() < 6 && g.dew >= d.plants[d.aloe].cost + 50.0 { // with a hole's worth of dew kept
                let mut top = None; let mut top_n = 1;
                for i in 0..COLS { for j in 0..ROWS {
                    if g.grid[key(i, j)] != Cell::Empty || g.stub_at(i, j).is_some() || self.keep[key(i, j)] || tr[key(i, j)] || self.planned.iter().any(|&c| c == (i, j)) { continue; }
                    let n = bare.iter().filter(|q| within((q.0 - i) as f64, (q.1 - j) as f64, r0)).count();
                    if n > top_n && !g.place_problem(i, j) { top_n = n; top = Some((i, j)); }
                } }
                if let Some((i, j)) = top { self.place(d.aloe, i, j); }
            }
            if self.opt.upgrades != Upgrades::None {
                for pi in 0..self.g.plants.len() {
                    let p = &self.g.plants[pi]; if p.kind != d.aloe { continue; }
                    let r = self.g.pstat(p.kind, p.lvl, p.i, p.j, Stat::Range);
                    let n = self.eaten_at.iter().filter(|q| within((p.i - q.0) as f64, (p.j - q.1) as f64, r)).count();
                    if let Some(c) = self.g.upgrade_cost(pi) { if n >= 4 * p.lvl && self.g.dew >= c + 50.0 { self.upgrade(pi); } }
                }
            }
        }
        // the maze grows with the level: two walls at once and one more every wave: first-level pumpkins are cheap, and
        // a long trail keeps a pack under the plants longer, with pumpkins where nothing stands yet
        let due = self.walls.len().min(2 + self.g.wave);
        for w in 0..due {
            for c in 0..self.walls[w].len() {
                let (i, j) = self.walls[w][c];
                if self.g.grid[key(i, j)] != Cell::Empty || self.g.stub_at(i, j).is_some() || !self.room() || self.g.place_problem(i, j) { continue; }
                if !self.place(d.pumpkin, i, j) { return; }
            }
        }
        let keep_dew = self.keep_dew();
        // the best step is looked for again only when the field changed or the dew for the last one found is there
        for _ in 0..60 {
            let sig = (self.g.wave, self.g.phase, self.g.stubs.len(), self.g.plants.iter().fold(0.0, |t, p| t + p.id as f64 * 7.0 + p.lvl as f64));
            if Some(sig) == self.seen && self.g.dew < self.need { return; }
            let a = self.best(); self.seen = Some(sig); self.need = a.map_or(f64::INFINITY, |a| a.cost + keep_dew);
            let Some(a) = a else { return };
            if self.g.dew < self.need { return; }
            self.run(a.act);
        }
    }
    // frost when bugs are about to bite, rain when the fruit or the garden is hurt
    fn use_powers(&mut self) {
        let d = self.d;
        match self.opt.powers {
            Powers::Off => {}
            Powers::Eager => {
                if self.g.phase == Phase::Wave && !self.g.bugs.is_empty() {
                    if self.g.frost != 0.0 { self.use_power(Power::Frost); }
                    if self.g.rain != 0.0 && (!self.g.stubs.is_empty() || self.g.hp < self.g.max_hp) { self.use_power(Power::Rain); }
                }
            }
            Powers::On => {
                let g = &self.g;
                let (mut near, mut boss) = (0, false);
                for b in &g.bugs { if hyp(b.x - g.fruit.0 as f64 - 0.5, b.y - g.fruit.1 as f64 - 0.5) < 2.5 { near += 1; if d.bugs[b.kind].boss { boss = true; } } }
                if g.frost != 0.0 && (near >= 3 || boss) { self.use_power(Power::Frost); }
                let g = &self.g;
                if g.rain != 0.0 && (g.hp <= g.max_hp - 3.0 || g.stubs.len() >= 3 || g.plants.iter().filter(|p| p.web > 0.0).count() >= 2) { self.use_power(Power::Rain); }
            }
        }
    }
}

// the free function behind Game::compute_dist, for a field the bot only imagines
fn compute_dist(grid: &[Cell; N], fruit: (i32, i32), extra: i32) -> [f64; N] { crate::game::dist_over(grid, fruit, extra) }

pub fn play_level<'a>(d: &'a Data, level: usize, opt: &Opts, layouts: &dyn Fn(usize, bool) -> Vec<(i32, i32)>, mazes: &dyn Fn(usize, &str) -> Option<Vec<Wall>>, pool: &dyn Fn(usize) -> std::sync::Arc<Vec<(Vec<Wall>, [f64; NM])>>, record: bool) -> (Res, Option<Vec<Op>>) {
    let g = Game::new(d, level, opt.seed, &opt.meta); let lv = &d.levels[level];
    let pick = opt.policy.as_ref().and_then(|p| p.maze);
    let walls: Vec<Wall> = if opt.plan.is_some() { Vec::new() } else if let (Some(m), None) = (pick, &opt.maze) {
        // the strategy's own maze: the one it sees the most in
        let all = pool(level); let score = |f: &[f64; NM]| (0..NM).map(|k| m[k] * f[k]).sum::<f64>();
        all.iter().fold(None::<&(Vec<Wall>, [f64; NM])>, |top, x| if top.map_or(true, |t| score(&x.1) > score(&t.1)) { Some(x) } else { top }).map_or(Vec::new(), |x| x.0.clone())
    } else if let Some(name) = &opt.maze { mazes(level, name).unwrap_or_else(|| panic!("no maze {} on level {}", name, level + 1)) } else {
        let all = if opt.route > 0.0 { layouts(level, opt.terrain) } else { Vec::new() };
        all[..round(all.len() as f64 * opt.route) as usize].iter().map(|&(col, gap)| (0..ROWS).filter(|&j| j != gap).map(|j| (col, j)).collect()).collect()
    };
    let kinds: Vec<usize> = lv.plants.iter().cloned().filter(|&k| k != d.aloe && opt.plants.as_ref().map_or(true, |a| a.contains(&k))).collect();
    let others: Vec<usize> = kinds.iter().cloned().filter(|&k| k != d.pumpkin).collect();
    let reach = others.iter().fold(f64::NEG_INFINITY, |m, &k| m.max(d.plants[k].st[Stat::Range as usize][2])) + 0.6;
    let planned: Vec<(i32, i32)> = if let Some(plan) = &opt.plan { plan.iter().filter(|s| s.0.is_some()).map(|s| (s.1, s.2)).collect() } else { walls.iter().flatten().cloned().collect() };
    let first_digger = lv.waves.iter().position(|w| w.iter().any(|gr| d.bugs[gr.kind].dig != 0.0)).map_or(0, |k| k as i32 + 1);
    // where the trail will run when the walls stand: nothing but the walls is planted on it; without a maze, the trail as it is
    let mut keep = [false; N];
    {
        let f = Game::new(d, level, 1, &[]); let mut grid = f.grid;
        for &(i, j) in &planned { if grid[key(i, j)] == Cell::Empty && f.tiles[key(i, j)] != Tile::Nettle { grid[key(i, j)] = Cell::Rock; } }
        for (i, j, _) in trail_of(&f, &compute_dist(&grid, f.fruit, -1)) { keep[key(i, j)] = true; }
    }
    let aloe = lv.plants.contains(&d.aloe) && opt.plants.as_ref().map_or(true, |a| a.contains(&d.aloe));
    let dew0 = g.dew;
    let mut b = Bot { g, d, lv, opt, o: Soon::default(), r: (opt.seed as i32).wrapping_mul(7919).wrapping_add(13), walls, planned, keep, kinds, others, reach, first_digger,
        aloe, eaten_at: Vec::new(), seen: None, need: 0.0, ops: if record { Some(Vec::new()) } else { None }, dew_seen: dew0, buf: Vec::new(), done: vec![false; opt.plan.as_ref().map_or(0, |p| p.len())] };
    if let Some(bank) = opt.bank { b.g.dew = bank; }
    let (mut t, mut income, mut eaten, mut powers_used) = (0.0, 0.0, 0usize, 0usize);
    let mut bites: Vec<((usize, usize, bool), usize)> = Vec::new();
    let bank = opt.bank.is_some();
    let mut steps = 0; let mut gauge: Vec<Gauge> = Vec::new();
    while b.g.phase != Phase::Won && b.g.phase != Phase::Lost && t < 3600.0 && steps < opt.steps {
        // it builds, then calls the wave at once (for the dew of an early start)
        if b.g.phase == Phase::Build && (opt.early || b.g.wave == 0) { b.try_build(); let dew = b.g.dew; b.start_wave(); if bank { b.g.dew = dew; } }
        for _ in 0..15 { b.step(1.0 / 30.0); }
        if b.g.wave > gauge.len() && b.g.phase == Phase::Wave { gauge.push(b.gauge()); }
        t += 0.5; steps += 15; b.use_powers();
        let events = std::mem::take(&mut b.g.events);
        for e in &events {
            match *e {
                Event::Kill { reward } => { income += reward; if bank { b.g.dew -= reward; } }
                Event::WaveDone { bonus } => { income += bonus; if bank { b.g.dew -= bonus; } }
                Event::PlantDead { i, j } => { eaten += 1; b.eaten_at.push((i, j)); }
                Event::Bite { kind, brood } => { let k = (b.g.wave, kind, brood); if let Some(x) = bites.iter_mut().find(|x| x.0 == k) { x.1 += 1; } else { bites.push((k, 1)); } }
                Event::Power => powers_used += 1,
            }
        }
        b.try_build();
        b.g.events.clear();
    }
    let g = &b.g; let tr = trail_of(g, &g.dist);
    let mut kinds: Vec<(usize, usize)> = Vec::new();
    for k in g.plants.iter().map(|p| p.kind).chain(g.stubs.iter().map(|s| s.kind)) { if let Some(x) = kinds.iter_mut().find(|x| x.0 == k) { x.1 += 1; } else { kinds.push((k, 1)); } }
    let res = Res {
        worth: if b.o.set { round(worth(g, &tr, &b.o, opt.terrain, None) * 100.0) / 100.0 } else { 0.0 }, trail: tr.len(), won: g.phase == Phase::Won, hp: g.hp, max_hp: g.max_hp, wave: g.wave, waves: g.waves,
        plants: g.plants.len(), grown: g.plants.iter().filter(|p| p.lvl > 1).count(), maxed: g.plants.iter().filter(|p| p.lvl == 3).count(), dew: g.dew, eaten, income, kinds, bites, powers_used, time: round(t), gauge,
    };
    (res, b.ops)
}

// A player with no plan at all, for the parity check (sim/js/verify.mjs): it plants, grows, sells, mends, calls waves and
// spends frost and rain at random, often where it cannot, so the two copies of the rules meet states no bot gets
// into. What it did goes to the list like a bot's party.
pub fn play_random<'a>(d: &'a Data, level: usize, opt: &Opts) -> Vec<Op> {
    let g = Game::new(d, level, opt.seed, &opt.meta); let lv = &d.levels[level]; let dew0 = g.dew;
    let mut b = Bot { g, d, lv, opt, o: Soon::default(), r: (opt.seed as i32).wrapping_mul(7919).wrapping_add(13), walls: Vec::new(), planned: Vec::new(), keep: [false; N], kinds: Vec::new(), others: Vec::new(), reach: 0.0, first_digger: 0,
        aloe: false, eaten_at: Vec::new(), seen: None, need: 0.0, ops: Some(Vec::new()), dew_seen: dew0, buf: Vec::new(), done: vec![false; opt.plan.as_ref().map_or(0, |p| p.len())] };
    let mut r = b.r; let mut rnd = move |n: usize| -> usize { ((js_rng(&mut r) * n as f64).floor() as usize).min(n.saturating_sub(1)) };
    let rich = rnd(3) != 0; // most of these players have dew to burn: more gets planted
    let mut steps = 0;
    while !b.g.over() && steps < opt.steps.min(9000) {
        if rich && rnd(4) == 0 { b.g.dew += 150.0; }
        for _ in 0..rnd(4) {
            match rnd(12) {
                0..=5 => { let kind = if rnd(8) == 0 { rnd(d.plants.len()) } else { lv.plants[rnd(lv.plants.len())] }; let (i, j) = (rnd(COLS as usize + 1) as i32, rnd(ROWS as usize + 1) as i32); if inside(i, j) || rnd(2) == 0 { b.place(kind, i.min(COLS), j.min(ROWS)); } }
                6 | 7 => { if !b.g.plants.is_empty() { let k = rnd(b.g.plants.len()); b.upgrade(k); } }
                8 => { if !b.g.plants.is_empty() && rnd(3) == 0 { let k = rnd(b.g.plants.len()); b.sell(k); } }
                9 => { if !b.g.stubs.is_empty() { let k = rnd(b.g.stubs.len()); b.regrow(k); } }
                10 => { if rnd(6) == 0 { b.use_power(if rnd(2) == 0 { Power::Frost } else { Power::Rain }); } }
                _ => { if rnd(3) == 0 { b.start_wave(); } }
            }
        }
        let n = 1 + rnd(25); for _ in 0..n { b.step(1.0 / 30.0); } steps += n;
        b.g.events.clear();
    }
    b.ops.unwrap()
}
