// The perfect party of a level, looked for as a whole party: `fruit-sim perfect` and `fruit-sim scan`
// (balance/party.mjs, balance/scan.mjs drive them).
//
// A party is a plan (bot.rs, the option plan): the plants to put and to grow, cell by cell, in order, a branch named for
// each; the smart bot plays it (the dew as it comes, eaten plants, frost and rain, early calls) and spends what is left
// its own way. A party is perfect when the level is won and the fruit never bitten.
//
// What a party is worth. Whether the fruit is bitten does not turn on one health of the bugs: a party may be clean
// against bugs 10% healthier, bitten against 20%, clean again against 40% (one bug a cell further on decides). So the
// worth of a party is not found by halving. It is read off a grid: the health of the bugs in steps of 5% (rung k:
// 1.05^k times what it is), every rung on every seed of the game asked for (where the flyers come from is drawn by the
// game); the margin of a party is the last rung before the first one it is bitten on, on any seed. A party clean by
// luck above a rung it fails on gets no credit for it.
//
// The search. The maze is not taken from a library: a plant may go on any cell, a wall is built and broken a cell at a
// time, and a cell of the trail is offered the more often the longer the trail gets with it shut. From the parties
// given (the bots' own, the one kept before, any other) it keeps an archive: the best party of every make (the families
// of plants its garden ends as), each with the rung it holds, and tries changes on them, each against the rung above its
// parent's: a step earlier or later, all the steps of a plant moved, another branch, a plant grown
// once more or less, another kind on a cell, two cells trading plants, a plant put on a free cell (by the trail, or on
// it: a wall), taken out, moved, and two parties crossed along a column or a row. A change that is not clean is still
// told from a worse one: by the seeds it is clean on, then by the fruit health bitten (a party is not played on past
// a few bites). Thousands of parties a minute on a few threads; what it tried and when the champion rose is given back,
// so that two runs can be set side by side: where they agree, the search has likely found what there is to find.
use crate::bot::{self, Op, Opts, Res};
use crate::data::*;
use crate::game::*;
use crate::json::J;
use crate::routes;
use std::collections::{HashMap, HashSet};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Instant;

pub type Step = (Option<usize>, i32, i32, u8);
pub const STEP: f64 = 1.05;
pub const K_MIN: i32 = -14; // 0.505
pub const K_MAX: i32 = 28; // 3.92
// the health of the bugs on rung k, to three places (the same number the JS side hands over as hp)
pub fn rung(k: i32) -> f64 { (STEP.powi(k) * 1000.0).round() / 1000.0 }
const CAP: f64 = 6.0; // a party is not played on once more fruit health than this is bitten

struct Rng(u64);
impl Rng {
    fn new(s: u64) -> Rng { Rng(s.wrapping_mul(0x9E3779B97F4A7C15) | 1) }
    fn next(&mut self) -> u64 { let mut x = self.0; x ^= x >> 12; x ^= x << 25; x ^= x >> 27; self.0 = x; x.wrapping_mul(0x2545F4914F6CDD1D) }
    fn f(&mut self) -> f64 { (self.next() >> 11) as f64 / (1u64 << 53) as f64 }
    fn n(&mut self, n: usize) -> usize { if n == 0 { 0 } else { (self.next() % n as u64) as usize } }
    fn pick<T: Copy>(&mut self, v: &[T]) -> T { v[self.n(v.len())] }
}

// The build phases of a party as it was played (bot::Saved), for the parties of changed plans to go on from.
pub type Snaps = Vec<Arc<bot::Saved<'static>>>;
// What a plan did on a rung: how well (see fitness), and its build phases on every seed it was played on there.
#[derive(Clone)]
// fail: the seed (its place in the list) it was bitten on; mix: when it was clean on all of them, the share of the dew of
// its garden on every family (plant * 3 + branch)
pub struct Runs { pub at: i32, pub fit: f64, per_seed: Vec<Option<Arc<Snaps>>>, fail: Option<usize>, pub mix: Option<Vec<f64>> }

pub struct Ctx<'a> {
    j_data: &'a J, pub d: &'static Data, pub level: usize, pub base: Opts, pub seeds: Vec<u32>,
    datas: Mutex<HashMap<i32, &'static Data>>, pub kinds: Vec<usize>, pub parties: AtomicU64, pub saved: AtomicU64, pub check: bool,
}
// whether anything in the level is drawn by the seed of the game: where a flyer comes from, where a boss's brood or the
// snails of a slug king land. Where nothing is, every seed plays the same party, and one is played.
fn drawn(d: &Data, level: usize) -> bool { d.levels[level].waves.iter().any(|w| w.iter().any(|g| { let b = &d.bugs[g.kind]; b.fly || b.brood.is_some() || b.split.is_some() })) }
impl<'a> Ctx<'a> {
    pub fn new(j_data: &'a J, level: usize, base: Opts, seeds: Vec<u32>, only: Option<usize>) -> Ctx<'a> {
        // (the data of every rung lives as long as the process: the build phases kept hold on to it)
        let d: &'static Data = Box::leak(Box::new(Data::read(j_data)));
        let kinds: Vec<usize> = d.levels[level].plants.iter().cloned().filter(|&k| only.map_or(true, |o| o == k)).collect();
        let seeds = if drawn(d, level) { seeds } else { seeds.into_iter().take(1).collect() };
        Ctx { j_data, d, level, base, seeds, datas: Mutex::new(HashMap::new()), kinds, parties: AtomicU64::new(0), saved: AtomicU64::new(0), check: false }
    }
    // the game with every bug rung(k) times healthier: the data as `fruit-sim run` scales it for a scenario with hp
    fn data_at(&self, k: i32) -> &'static Data {
        if let Some(d) = self.datas.lock().unwrap().get(&k) { return d; }
        let mut x = Data::read(self.j_data); let s = rung(k); if s != 1.0 { for b in x.bugs.iter_mut() { b.hp *= s; } }
        let x: &'static Data = Box::leak(Box::new(x)); self.datas.lock().unwrap().insert(k, x); x
    }
    pub fn party_from(&self, plan: Option<&[Step]>, o: &Opts, k: i32, seed: u32, stop: f64, record: bool, from: Option<&bot::Saved<'static>>, snaps: Option<&mut Snaps>) -> (Res, Option<Vec<Op>>) {
        let dd = self.data_at(k); let mut opt = o.clone(); opt.seed = seed; opt.stop_bitten = stop; if let Some(p) = plan { opt.plan = Some(p.to_vec()); }
        self.parties.fetch_add(1, Ordering::Relaxed);
        let level = self.level;
        let layouts = |l: usize, t: bool| bot::layout(dd, l, t);
        let mazes = |l: usize, name: &str| routes::routes(dd, l).list.iter().find(|r| format!("{}/{}", r.class, r.shape) == name).map(|r| r.walls.clone());
        let pool = |l: usize| Arc::new(routes::pool(dd, l));
        bot::play_level_from(dd, level, &opt, &layouts, &mazes, &pool, record, from, snaps)
    }
    pub fn party(&self, plan: Option<&[Step]>, o: &Opts, k: i32, seed: u32, stop: f64, record: bool) -> (Res, Option<Vec<Op>>) { self.party_from(plan, o, k, seed, stop, record, None, None) }
    fn clean(r: &Res) -> bool { r.won && r.bitten == 0.0 }
    // How a plan does on rung k: the seeds it is clean on before the first it is not, and on that one a part of one, the
    // greater the later it was bitten (a party stops at its first bite: a variation that fails is not played out; the
    // seeds in their order, none played after the first failure); all of them: clean.
    // parent: the plan it was made from and what that did on this rung — where the two plans are the same up to a step the
    // parent's party had not looked at by some build phase, the party goes on from that build phase.
    pub fn fitness(&self, plan: &[Step], k: i32, parent: Option<(&[Step], &Runs)>) -> Runs {
        let same = parent.map_or(0, |(pp, _)| pp.iter().zip(plan.iter()).take_while(|(a, b)| a == b).count());
        let mut runs = Runs { at: k, fit: 0.0, per_seed: vec![None; self.seeds.len()], fail: None, mix: None }; let mut spent: Option<Vec<f64>> = None;
        // The seed the parent was bitten on comes first: a change that does no better is bitten there too, and is told so
        // by one party cut short, not after whole parties on the seeds the parent was clean on. Those seeds, not played
        // then, are taken as clean still (the count is of the seeds believed clean); once it gets past the parent's
        // seed, they are played like the rest.
        let first = parent.and_then(|(_, pr)| if pr.at == k { pr.fail } else { None });
        let order: Vec<usize> = first.into_iter().chain((0..self.seeds.len()).filter(|&n| Some(n) != first)).collect();
        let believed = parent.map_or(0, |(_, pr)| (pr.fit.floor() as usize).min(self.seeds.len() - 1));
        for (done, &n) in order.iter().enumerate() {
            let seed = self.seeds[n];
            let mut mine: Snaps = Vec::new(); let mut from: Option<Arc<bot::Saved<'static>>> = None;
            if let Some((_, pr)) = parent { if pr.at == k { if let Some(ps) = &pr.per_seed[n] {
                if let Some(ix) = (0..ps.len()).rev().find(|&i| ps[i].seen_to <= same) { mine.extend(ps[..ix].iter().cloned()); from = Some(ps[ix].clone()); self.saved.fetch_add(ix as u64, Ordering::Relaxed); }
            } } }
            let (r, _) = self.party_from(Some(plan), &self.base, k, seed, 0.0, false, from.as_deref(), Some(&mut mine));
            if self.check && from.is_some() { let (q, _) = self.party(Some(plan), &self.base, k, seed, 0.0, false);
                if (q.won, q.bitten, q.wave, q.time) != (r.won, r.bitten, r.wave, r.time) { eprintln!("  CHECK: a party gone on from a build phase differs from the same played whole: won {} {}, bitten {} {}, wave {} {}, time {} {}", r.won, q.won, r.bitten, q.bitten, r.wave, q.wave, r.time, q.time); } }
            runs.per_seed[n] = Some(Arc::new(mine));
            if Self::clean(&r) { spent = Some(r.spent); continue; }
            // bitten in wave r.wave of r.waves, r.time seconds in: the later, the nearer to clean
            let clean_so_far = if done == 0 && first.is_some() { believed } else { done };
            runs.fit = clean_so_far as f64 + 0.98 * (r.time / (r.time + 60.0 * (r.waves as f64 - r.wave as f64 + 1.0))).min(1.0); runs.fail = Some(n);
            return runs;
        }
        runs.fit = self.seeds.len() as f64;
        runs.mix = spent.map(|v| { let t: f64 = v.iter().sum(); v.iter().map(|x| if t > 0.0 { x / t } else { 0.0 }).collect() }); runs
    }
    pub fn clean_on(&self, plan: &[Step], k: i32, seeds: &[u32]) -> bool { seeds.iter().all(|&seed| Self::clean(&self.party(Some(plan), &self.base, k, seed, 0.0, false).0)) }
    pub fn all_clean(&self, plan: &[Step], k: i32) -> bool { self.clean_on(plan, k, &self.seeds) }
}

// ---- a plan and its garden ----
fn steps_of_ops(ops: &[Op]) -> Vec<Step> {
    let mut out: Vec<Step> = Vec::new();
    for op in ops { match *op {
        Op::Place(kind, i, j) => out.push((Some(kind), i, j, 0)),
        Op::Up(i, j, br) => out.push((None, i, j, br)),
        Op::Sell(i, j) => out.retain(|s| (s.1, s.2) != (i, j)),
        _ => {}
    } }
    out
}
// A plan put in order, the party staying the one it was: a plant put again on its own cell is no step (another kind
// there is one: the bot sells the old plant for it), no plant is grown before it is put (such a step goes right after
// its plant) nor more than three times, steps on no plant go; a branch is named on the step to level 3 (the second of a
// plant) or nowhere (named on another step it was never read: dropped, not moved).
fn tidy(plan: &mut Vec<Step>) {
    let mut at: HashMap<(i32, i32), (usize, usize)> = HashMap::new(); // the kind standing on a cell and how many times it is grown
    let mut pending: HashMap<(i32, i32), Vec<Step>> = HashMap::new(); let mut out: Vec<Step> = Vec::with_capacity(plan.len());
    let mut up = |out: &mut Vec<Step>, at: &mut HashMap<(i32, i32), (usize, usize)>, mut s: Step| { let e = at.get_mut(&(s.1, s.2)).unwrap(); if e.1 < 3 { e.1 += 1; if e.1 != 2 { s.3 = 0; } out.push(s); } };
    for &s in plan.iter() { let c = (s.1, s.2);
        match s.0 {
            Some(k) => { if at.get(&c).map_or(false, |e| e.0 == k) { continue; } at.insert(c, (k, 0)); out.push((s.0, s.1, s.2, 0));
                if let Some(p) = pending.remove(&c) { for u in p { up(&mut out, &mut at, u); } } }
            None => { if at.contains_key(&c) { up(&mut out, &mut at, s); } else { pending.entry(c).or_default().push(s); } }
        }
    }
    *plan = out;
}
fn hash_of(plan: &[Step]) -> u64 { let mut h: u64 = 0xcbf29ce484222325; for s in plan { for v in [s.0.map_or(99, |k| k as i64), s.1 as i64, s.2 as i64, s.3 as i64] { h = (h ^ v as u64).wrapping_mul(0x100000001b3); } } h }

// the garden a plan ends in, as far as it can be told without playing: its plants, the trail, the cells a plant may
// still go on — beside the trail (with how much of it they see) and on it (with how long the trail gets)
struct Garden { cells: Vec<(i32, i32)>, len: f64, near: Vec<((i32, i32), f64)>, walls: Vec<((i32, i32), f64)> }
fn garden(cx: &Ctx, plan: &[Step]) -> Garden {
    let mut g = Game::new(&cx.d, cx.level, 1, &cx.base.meta); let mut cells = Vec::new();
    for s in plan { if let Some(kind) = s.0 { g.dew = 1e9; if g.place(kind, s.1, s.2) { cells.push((s.1, s.2)); } } }
    let mut on = [false; N]; let mut trail: Vec<(i32, i32)> = Vec::new();
    for e in 0..g.entries.len() { for c in g.trail(&g.dist, e) { if inside(c.0, c.1) && !on[key(c.0, c.1)] { on[key(c.0, c.1)] = true; trail.push(c); } } }
    let way = |dist: &[f64; N]| g.entries.iter().map(|&(a, b)| dist[key(a, b)]).sum::<f64>();
    let len = way(&g.dist); let (mut near, mut walls) = (Vec::new(), Vec::new());
    for j in 0..ROWS { for i in 0..COLS {
        if g.place_problem(i, j) { continue; }
        if on[key(i, j)] { let dd = dist_over(&g.grid, &g.tiles, g.fruit, key(i, j) as i32); walls.push(((i, j), way(&dd))); }
        else { let sees = trail.iter().filter(|&&(a, b)| within((a - i) as f64, (b - j) as f64, 1.5)).count() as f64;
            let by_fruit = within((g.fruit.0 - i) as f64, (g.fruit.1 - j) as f64, 3.6);
            near.push(((i, j), 0.15 + sees + if by_fruit { 2.0 } else { 0.0 })); }
    } }
    Garden { cells, len, near, walls }
}
fn weighted<T: Copy>(v: &[(T, f64)], r: &mut Rng) -> Option<T> {
    let sum: f64 = v.iter().map(|x| x.1.max(0.0)).sum(); if v.is_empty() || sum <= 0.0 { return None; }
    let mut x = r.f() * sum; for &(c, w) in v { x -= w.max(0.0); if x <= 0.0 { return Some(c); } } Some(v[v.len() - 1].0)
}

// one change of a plan (None: nothing came of it)
fn mutate(cx: &Ctx, plan: &[Step], other: Option<&[Step]>, r: &mut Rng) -> Option<Vec<Step>> {
    let mut p = plan.to_vec(); let gd = garden(cx, plan);
    let kind_of = |p: &[Step], c: (i32, i32)| p.iter().find(|s| s.0.is_some() && (s.1, s.2) == c).and_then(|s| s.0);
    let branch = |r: &mut Rng| 1 + r.n(2) as u8;
    let t = r.n(100);
    match t {
        0..=11 => { // a whole family goes: every plant of a kind becomes another kind, or every plant on a branch takes the other one
            // (a party of another make: the archive keeps the best of every make, and this is how the search gets from one to another)
            if gd.cells.is_empty() { return None; } let was = kind_of(&p, r.pick(&gd.cells))?;
            if cx.kinds.len() > 1 && r.f() < 0.5 { let ks: Vec<usize> = cx.kinds.iter().cloned().filter(|&k| k != was).collect(); let k = r.pick(&ks); for s in p.iter_mut() { if s.0 == Some(was) { s.0 = Some(k); } } }
            else { let cells: Vec<(i32, i32)> = p.iter().filter(|s| s.0 == Some(was)).map(|s| (s.1, s.2)).collect(); let b = branch(r);
                for s in p.iter_mut() { if s.0.is_none() && s.3 == b && cells.contains(&(s.1, s.2)) { s.3 = 3 - b; } } }
        }
        12..=17 => { // a step earlier or later
            if p.is_empty() { return None; } let n = r.n(p.len()); let s = p.remove(n);
            let d = ((r.f() - 0.55) * 30.0).round() as i64; let at = (n as i64 + d).max(0).min(p.len() as i64) as usize; p.insert(at, s);
        }
        14..=23 => { // all the steps of a plant earlier or later, together
            if gd.cells.is_empty() { return None; } let c = r.pick(&gd.cells);
            let mine: Vec<Step> = p.iter().cloned().filter(|s| (s.1, s.2) == c).collect(); let first = p.iter().position(|s| (s.1, s.2) == c)?;
            p.retain(|s| (s.1, s.2) != c); let d = ((r.f() - 0.55) * 40.0).round() as i64; let at = (first as i64 + d).max(0).min(p.len() as i64) as usize;
            for (q, s) in mine.into_iter().enumerate() { p.insert((at + q).min(p.len()), s); }
        }
        24..=31 => { // the other branch
            let ups: Vec<usize> = (0..p.len()).filter(|&q| p[q].0.is_none() && p[q].3 != 0).collect(); if ups.is_empty() { return None; }
            let q = r.pick(&ups); p[q].3 = 3 - p[q].3;
        }
        32..=43 => { // a plant grown once more (anywhere after it is put), or once less
            if gd.cells.is_empty() { return None; } let c = r.pick(&gd.cells);
            let ups: Vec<usize> = (0..p.len()).filter(|&q| p[q].0.is_none() && (p[q].1, p[q].2) == c).collect();
            if r.f() < 0.6 && ups.len() < 3 { let after = ups.last().cloned().or(p.iter().position(|s| s.0.is_some() && (s.1, s.2) == c))? + 1;
                let at = after + r.n(p.len() - after + 1); p.insert(at, (None, c.0, c.1, if ups.len() == 1 { branch(r) } else { 0 })); }
            else if let Some(&q) = ups.last() { p.remove(q); } else { return None; }
        }
        44..=52 => { // another kind on a cell
            if gd.cells.is_empty() || cx.kinds.len() < 2 { return None; } let c = r.pick(&gd.cells); let was = kind_of(&p, c)?;
            let ks: Vec<usize> = cx.kinds.iter().cloned().filter(|&k| k != was).collect(); let k = r.pick(&ks);
            for s in p.iter_mut() { if s.0.is_some() && (s.1, s.2) == c { s.0 = Some(k); } }
        }
        53..=59 => { // two cells trade plants, and how far they are grown
            if gd.cells.len() < 2 { return None; } let (a, b) = (r.pick(&gd.cells), r.pick(&gd.cells)); if a == b { return None; }
            for s in p.iter_mut() { if (s.1, s.2) == a { s.1 = b.0; s.2 = b.1; } else if (s.1, s.2) == b { s.1 = a.0; s.2 = a.1; } }
        }
        60..=70 => { // a plant on a free cell beside the trail, grown at once now and then
            let c = weighted(&gd.near, r)?; let k = if !gd.cells.is_empty() && r.f() < 0.6 { kind_of(&p, r.pick(&gd.cells)).filter(|k| cx.kinds.contains(k)).unwrap_or(r.pick(&cx.kinds)) } else { r.pick(&cx.kinds) };
            let at = r.n(p.len() + 1); p.insert(at, (Some(k), c.0, c.1, 0));
            let grown = r.n(4); for q in 0..grown.min(3) { p.insert((at + 1 + q + r.n(6)).min(p.len()), (None, c.0, c.1, if q == 1 { branch(r) } else { 0 })); }
        }
        71..=80 => { // a wall: a plant on the trail, where the trail gets longest (the cheaper the plant the better: it comes early)
            let ws: Vec<((i32, i32), f64)> = gd.walls.iter().map(|&(c, l)| (c, { let g = (l - gd.len).max(0.0); 0.3 + g * g })).collect();
            let c = weighted(&ws, r)?; let cheap = *cx.kinds.iter().min_by(|a, b| cx.d.plants[**a].cost.partial_cmp(&cx.d.plants[**b].cost).unwrap()).unwrap();
            let k = if r.f() < 0.6 { cheap } else { r.pick(&cx.kinds) };
            let at = if r.f() < 0.7 { r.n(p.len() * 2 / 5 + 1) } else { r.n(p.len() + 1) }; p.insert(at, (Some(k), c.0, c.1, 0));
        }
        81..=86 => { // a plant taken out
            if gd.cells.is_empty() { return None; } let c = r.pick(&gd.cells); p.retain(|s| (s.1, s.2) != c);
        }
        87..=93 => { // a plant moved: beside the trail, or onto it
            if gd.cells.is_empty() { return None; } let c = r.pick(&gd.cells);
            let to = if r.f() < 0.3 { weighted(&gd.walls, r) } else { weighted(&gd.near, r) }?;
            for s in p.iter_mut() { if (s.1, s.2) == c { s.1 = to.0; s.2 = to.1; } }
        }
        _ => { // two parties crossed along a column or a row: this side of the cut from the one, the other from the other
            let o = other?; let rows = r.f() < 0.4; let cut = if rows { 1 + r.n(ROWS as usize - 1) } else { 1 + r.n(COLS as usize - 1) } as i32; let first = r.f() < 0.5;
            let side = |s: &Step| ((if rows { s.2 } else { s.1 }) < cut) == first;
            // the steps of both in the order they stand in their own plans, by how far along each is
            let mut both: Vec<(f64, Step)> = p.iter().enumerate().filter(|(_, s)| side(s)).map(|(q, s)| (q as f64 / p.len().max(1) as f64, *s)).collect();
            both.extend(o.iter().enumerate().filter(|(_, s)| !side(s)).map(|(q, s)| (q as f64 / o.len().max(1) as f64, *s)));
            both.sort_by(|a, b| a.0.partial_cmp(&b.0).unwrap()); p = both.into_iter().map(|x| x.1).collect();
        }
    }
    tidy(&mut p);
    if p == plan { None } else { Some(p) }
}

// ---- the search ----
// The archive: the best party found of every make. The make of a party is what its garden ends as: the families (a plant
// at levels 1-2, a plant on a branch) that hold 3% of its dew or more. Kept side by side they are the different ways to
// play the level, each with how well it does, and "the best party with no hunter rose in it" is read off the archive
// with no search of its own.
pub struct Elite { pub plan: Vec<Step>, pub k: i32, runs: Runs, pub mix: Vec<f64>, pub niche: u64, stat: u64 }
// The make of a plan as far as it can be read off the plan itself, before any party (what the bot adds on its own is
// not in it): the families its steps put 3% of their dew on. A changed plan of a make the archive has is tried against
// that make's best; one of a make it has not is looked for where it stands.
fn make_of(cx: &Ctx, plan: &[Step]) -> u64 {
    let mut at: HashMap<(i32, i32), (usize, usize, u8)> = HashMap::new(); // kind, times grown, branch
    for s in plan { let c = (s.1, s.2); match s.0 { Some(k) => { at.insert(c, (k, 0, 0)); } None => if let Some(e) = at.get_mut(&c) { e.1 += 1; if e.1 == 2 { e.2 = if s.3 != 0 { s.3 } else { 1 }; } } } }
    let mut dew = vec![0.0; cx.d.plants.len() * 3]; let mut all = 0.0;
    for &(k, ups, br) in at.values() { let p = &cx.d.plants[k]; let b = if br == 2 { 3 } else { 1 };
        let c = p.cost + if ups >= 1 { p.up[0] } else { 0.0 } + if ups >= 2 { p.up[b] } else { 0.0 } + if ups >= 3 { p.up[b + 1] } else { 0.0 };
        dew[k * 3 + if ups >= 2 { br as usize } else { 0 }] += c; all += c; }
    dew.iter().enumerate().fold(0, |m, (f, &x)| if all > 0.0 && x / all >= PRESENT { m | (1 << f) } else { m })
}
struct State { arch: Vec<Elite>, seen: HashSet<u64>, tried: u64, history: Vec<(f64, i32)>, last: f64 }
const PRESENT: f64 = 0.03; const ARCH: usize = 400;
pub fn niche_of(mix: &[f64]) -> u64 { mix.iter().enumerate().fold(0, |m, (f, &x)| if x >= PRESENT { m | (1 << f) } else { m }) }

// The rung a plan holds: the last before the first it is bitten on (on any seed), counted from the floor up — every rung
// from the floor to it is clean. A plan bitten on the floor itself holds the first rung below it that it is clean on.
pub const K_FLOOR: i32 = -6; // 0.75
fn level_of(cx: &Ctx, plan: &[Step]) -> i32 {
    let ok = |k: i32| cx.all_clean(plan, k);
    let mut k = K_FLOOR;
    if ok(k) { while k < K_MAX && ok(k + 1) { k += 1; } k } else { loop { k -= 1; if k < K_MIN { return K_MIN - 1; } if ok(k) { return k; } } }
}
// Clean on the rungs from the floor up to `top`: the four highest on every seed (a failure is likeliest there), the ones
// below on one seed each, another for every rung. (Every rung on every seed is what balance/scan.mjs asks in the end: a
// party with a hole this did not see is said so there, and its margin is the rung below the hole.)
fn holds_below(cx: &Ctx, plan: &[Step], top: i32) -> bool {
    (K_FLOOR..=top).rev().all(|k| if k > top - 4 { cx.all_clean(plan, k) } else { let s = cx.seeds[(k - K_MIN) as usize % cx.seeds.len()]; cx.clean_on(plan, k, &[s]) })
}

// secs: the most it runs; stall: it stops once neither the best party nor the best of any make within six rungs of it has
// risen for so long; goal: and once the best holds that rung (the question was whether a party as good as that is there)
pub fn search(cx: &Ctx, seeds_plans: Vec<Vec<Step>>, secs: f64, stall: f64, goal: i32, jobs: usize, rng_seed: u64, log: &(dyn Fn(String) + Sync)) -> (Vec<Elite>, Vec<(f64, i32)>, u64) {
    // where every party given stands, and what its garden is made of
    let elite = |plan: Vec<Step>, k: i32| -> Option<Elite> { if k < K_MIN { return None; }
        let mix = cx.fitness(&plan, k, None).mix?; let runs = cx.fitness(&plan, (k + 1).min(K_MAX), None); Some(Elite { niche: niche_of(&mix), stat: make_of(cx, &plan), plan, k, runs, mix }) };
    let starts: Vec<Option<Elite>> = std::thread::scope(|sc| {
        let hs: Vec<_> = seeds_plans.into_iter().map(|mut p| sc.spawn(move || { tidy(&mut p); let k = level_of(cx, &p); elite(p, k) })).collect();
        hs.into_iter().map(|h| h.join().unwrap()).collect() });
    log(format!("the parties given hold: {}", starts.iter().map(|s| s.as_ref().map_or("nothing".to_string(), |e| format!("×{:.2}", rung(e.k)))).collect::<Vec<_>>().join(", ")));
    let t0 = Instant::now(); // (the time of the search is counted from here: placing the parties given is not it)
    let mut arch: Vec<Elite> = Vec::new();
    for e in starts.into_iter().flatten() { match arch.iter().position(|x| x.niche == e.niche) { Some(q) => if e.k > arch[q].k { arch[q] = e; }, None => arch.push(e) } }
    if arch.is_empty() { return (arch, Vec::new(), 0); }
    let best0 = arch.iter().map(|e| e.k).max().unwrap();
    let st = Mutex::new(State { arch, seen: HashSet::new(), tried: 0, history: vec![(0.0, best0)], last: 0.0 });
    std::thread::scope(|sc| { for t in 0..jobs.max(1) { let st = &st; sc.spawn(move || {
        let mut r = Rng::new(rng_seed.wrapping_mul(1000).wrapping_add(t as u64 + 1));
        loop {
            let el = t0.elapsed().as_secs_f64(); if el >= secs { break; }
            let (parent, pruns, pk, other, best) = { let s = st.lock().unwrap();
                let best = s.arch.iter().map(|e| e.k).max().unwrap();
                if best >= goal || (el - s.last >= stall && el >= (secs / 5.0).min(stall)) { break; }
                // a parent: the best party most of the time, else the better of two taken at random (every make gets its turn)
                let n = s.arch.len(); let top: Vec<usize> = (0..n).filter(|&q| s.arch[q].k == best).collect();
                let q = if r.f() < 0.45 { r.pick(&top) } else { let (a, b) = (r.n(n), r.n(n)); if s.arch[a].k >= s.arch[b].k { a } else { b } };
                let e = &s.arch[q]; (e.plan.clone(), e.runs.clone(), e.k, s.arch[r.n(n)].plan.clone(), best) };
            // one change (now and then two or three on top of each other)
            let mut child = parent.clone(); let mut changed = false;
            for _ in 0..1 + (r.f() < 0.4) as usize + (r.f() < 0.15) as usize { if let Some(c) = mutate(cx, &child, Some(&other), &mut r) { child = c; changed = true; } }
            if !changed { continue; }
            let stat = make_of(cx, &child);
            let rival = { let mut s = st.lock().unwrap(); if !s.seen.insert(hash_of(&child)) { continue; } s.tried += 1; s.arch.iter().filter(|e| e.stat == stat).map(|e| e.k).max() };
            // The rungs it is tried on. Of a make the archive has: the rung above that make's best (it has to do better). Of a
            // make it has not: from the rung above its parent's down in widening steps, the first it is clean on — a party of
            // another make a little below the best is worth keeping as the best of its own make.
            let rungs: Vec<i32> = match rival { Some(k) => vec![(k + 1).min(K_MAX)], None => [1, -1, -3, -6, -10, -15].iter().map(|d| pk + d).filter(|&k| k >= K_FLOOR - 4 && k <= K_MAX).collect() };
            let mut found: Option<(i32, Runs)> = None;
            for &t in &rungs { let runs = cx.fitness(&child, t, if t == pk + 1 { Some((&parent, &pruns)) } else { None }); if runs.fit >= cx.seeds.len() as f64 { found = Some((t, runs)); break; } }
            let Some((target, runs)) = found else { continue };
            // Every party kept is clean on the rungs below its own too, down to the floor (holds_below). One with a hole
            // lower down stands on the rung under the hole, and is kept there if that is still the best of its make.
            let n = cx.seeds.len() as f64; let (mut k, mut mix, mut next);
            if holds_below(cx, &child, target - 1) {
                // as far up as it goes before the first rung it is bitten on (it was bitten on the rung tried before this one, if any)
                let top = rungs.iter().cloned().filter(|&t| t > target).min().map_or(K_MAX, |t| t - 1);
                k = target; mix = runs.mix.clone().unwrap(); next = cx.fitness(&child, (k + 1).min(K_MAX), None);
                while k < top && k + 1 < K_MAX && next.fit >= n { k += 1; mix = next.mix.clone().unwrap(); next = cx.fitness(&child, k + 1, None); }
            } else {
                k = level_of(cx, &child); if k < K_MIN || k > best || rival.map_or(false, |rk| k <= rk) { continue; }
                let at = cx.fitness(&child, k, None); let Some(m) = at.mix.clone() else { continue }; mix = m; next = cx.fitness(&child, k + 1, None);
            }
            let e = Elite { niche: niche_of(&mix), stat, plan: child, k, runs: next, mix };
            let mut s = st.lock().unwrap(); let el = t0.elapsed().as_secs_f64(); let now = s.arch.iter().map(|x| x.k).max().unwrap();
            let took = match s.arch.iter().position(|x| x.niche == e.niche) { Some(q) => if e.k > s.arch[q].k { s.arch[q] = e; true } else { false }, None => { s.arch.push(e); true } };
            if !took { continue; }
            if k > now { s.history.push((el, k)); s.last = el; log(format!("{:>5.0} s: clean against bugs ×{:.2} ({} tried, {} makes)", el, rung(k), s.tried, s.arch.len())); }
            else if k >= now - 6 { s.last = el; }
            if s.arch.len() > ARCH { s.arch.sort_by(|a, b| b.k.cmp(&a.k)); s.arch.truncate(ARCH * 3 / 4); }
        }
    }); } });
    let mut s = st.into_inner().unwrap(); s.arch.sort_by(|a, b| b.k.cmp(&a.k));
    (s.arch, s.history, s.tried)
}

// ---- the commands ----
fn plan_of(d: &Data, j: &J) -> Vec<Step> {
    j.arr().iter().map(|s| { let a = s.arr(); (if a[0].str() == "up" { None } else { Some(d.plant(a[0].str())) }, a[1].num() as i32, a[2].num() as i32, if a[0].str() == "up" && a.len() > 3 { a[3].num() as u8 } else { 0 }) }).collect()
}
fn plan_json(d: &Data, plan: &[Step]) -> String {
    format!("[{}]", plan.iter().map(|s| match s.0 { Some(k) => format!("[\"{}\",{},{}]", d.plants[k].name, s.1, s.2), None => if s.3 != 0 { format!("[\"up\",{},{},{}]", s.1, s.2, s.3) } else { format!("[\"up\",{},{}]", s.1, s.2) } }).collect::<Vec<_>>().join(","))
}
// fruit-sim perfect: { data, level, opts (the bot's, as in a scenario of `run`: the perks, the powers, ...), seeds, secs,
//   plans: [plan], bots: [opts] (players whose own parties are starts too: the smart bot, the expert), only: plant | null,
//   stall (seconds with no rise of the champion after which it stops), rng, check (every party gone on from a build phase is
//   played whole too and the two compared) } → { plan, k, margin, history: [[secs, margin]], tried, parties, waves_saved, seeds,
//   makes, archive: [{ margin, mix: { family: share of the dew }, plan }] — the best party of every make, the best first }
pub fn perfect(j: &J, jobs: usize) {
    let d0 = Data::read(j.at("data")); let level = j.at("level").num() as usize;
    let only = j.get("only").filter(|v| **v != J::Null).map(|v| d0.plant(v.str()));
    let mut base = crate::opts_of(&d0, j.at("opts")); if let Some(k) = only { base.plants = Some(vec![k]); }
    let seeds: Vec<u32> = j.get("seeds").map_or(vec![7, 11, 13, 17, 19], |s| s.arr().iter().map(|x| x.num() as u32).collect());
    let mut cx = Ctx::new(j.at("data"), level, base, seeds, only); cx.check = j.get("check").map_or(false, |v| v.truthy());
    let mut plans: Vec<Vec<Step>> = j.get("plans").map_or(Vec::new(), |p| p.arr().iter().map(|x| plan_of(&cx.d, x)).collect());
    if let Some(bots) = j.get("bots") { for b in bots.arr() { let mut o = crate::opts_of(&cx.d, b); if let Some(k) = only { o.plants = Some(vec![k]); }
        let (_, ops) = cx.party(None, &o, 0, cx.seeds[0], f64::INFINITY, true); plans.push(steps_of_ops(&ops.unwrap())); } }
    if let Some(k) = only { for p in plans.iter_mut() { p.retain(|s| s.0.map_or(true, |x| x == k)); } }
    plans.retain(|p| !p.is_empty()); if plans.is_empty() { plans.push(Vec::new()); }
    let secs = j.get("secs").map_or(60.0, |v| v.num()); let stall = j.get("stall").map_or(f64::INFINITY, |v| v.num()); let goal = j.get("goal").filter(|v| **v != J::Null).map_or(i32::MAX, |v| (v.num().max(0.01).ln() / STEP.ln()).round() as i32); let rng = j.get("rng").map_or(1.0, |v| v.num()) as u64;
    let log = |s: String| eprintln!("  {}", s);
    let (arch, history, tried) = search(&cx, plans, secs, stall, goal, jobs, rng, &log);
    let fam = |f: usize| { let k = &cx.d.plants[f / 3].name; match f % 3 { 0 => k.clone(), 1 => format!("{}.a", k), _ => format!("{}.b", k) } };
    let m = |k: i32| if k < K_MIN { 0.0 } else { rung(k) };
    let elites: Vec<String> = arch.iter().take(120).map(|e| format!("{{\"margin\":{},\"mix\":{{{}}},\"plan\":{}}}", m(e.k),
        e.mix.iter().enumerate().filter(|x| *x.1 > 0.0).map(|(f, x)| format!("\"{}\":{:.3}", fam(f), x)).collect::<Vec<_>>().join(","), plan_json(&cx.d, &e.plan))).collect();
    let (plan, k) = arch.first().map_or((Vec::new(), K_MIN - 1), |e| (e.plan.clone(), e.k));
    println!("{{\"plan\":{},\"k\":{},\"margin\":{},\"history\":[{}],\"tried\":{},\"parties\":{},\"waves_saved\":{},\"seeds\":{},\"makes\":{},\"archive\":[{}]}}", plan_json(&cx.d, &plan), k, m(k),
        history.iter().map(|h| format!("[{:.0},{}]", h.0, m(h.1))).collect::<Vec<_>>().join(","), tried, cx.parties.load(Ordering::Relaxed), cx.saved.load(Ordering::Relaxed), cx.seeds.len(), arch.len(), elites.join(","));
}
// fruit-sim scan: { data, tasks: [{ level, opts }], seeds, from, to, what, full } → for every task the seeds it holds on
// (what: clean — the fruit never bitten; stars — won with 80% of the fruit left; won) on every rung from..=to:
// { margin, open, seeds, grid: [[k, health, seeds held], ...] }; its margin: the last rung before the first it fails on
// (0: it fails on the lowest rung asked; open: it never fails up to the highest). Without `full` the rungs above the
// first failure are not played (the grid ends there). Where nothing in a level is drawn by the seed, one seed is played.
pub fn scan(j: &J, jobs: usize) {
    let d0 = Data::read(j.at("data"));
    let seeds: Vec<u32> = j.get("seeds").map_or(vec![7, 11, 13, 17, 19], |s| s.arr().iter().map(|x| x.num() as u32).collect());
    let (from, to) = (j.get("from").map_or(-6, |v| v.num() as i32).max(K_MIN), j.get("to").map_or(14, |v| v.num() as i32).min(K_MAX));
    let what = j.get("what").map_or("clean", |v| v.str()).to_string(); let full = j.get("full").map_or(false, |v| v.truthy());
    let tasks: Vec<(usize, Opts)> = j.at("tasks").arr().iter().map(|t| (t.at("level").num() as usize, crate::opts_of(&d0, t.at("opts")))).collect();
    let mut levels: Vec<usize> = tasks.iter().map(|t| t.0).collect(); levels.sort(); levels.dedup();
    let cxs: HashMap<usize, Ctx> = levels.into_iter().map(|l| (l, Ctx::new(j.at("data"), l, Opts::default(), seeds.clone(), None))).collect();
    let rows: Vec<String> = tasks.iter().map(|(level, o)| {
        let cx = &cxs[level]; let ns = cx.seeds.len();
        // the parties of the task, the lowest rung first; once a rung has failed, the rungs above it are not played
        let list: Vec<(i32, u32)> = (from..=to).flat_map(|k| cx.seeds.iter().map(move |&s| (k, s))).collect();
        let next = std::sync::atomic::AtomicUsize::new(0); let failed = std::sync::atomic::AtomicI32::new(i32::MAX); let held: Vec<Mutex<Option<bool>>> = list.iter().map(|_| Mutex::new(None)).collect();
        std::thread::scope(|sc| { for _ in 0..jobs.max(1) { sc.spawn(|| loop {
            let n = next.fetch_add(1, Ordering::SeqCst); if n >= list.len() { break; }
            let (k, seed) = list[n]; if !full && k > failed.load(Ordering::SeqCst) { continue; }
            let (r, _) = cx.party(None, o, k, seed, if what == "clean" { 0.0 } else { f64::INFINITY }, false);
            let ok = match what.as_str() { "won" => r.won, "stars" => r.won && r.hp >= 0.8 * r.max_hp, _ => Ctx::clean(&r) };
            if !ok { failed.fetch_min(k, Ordering::SeqCst); }
            *held[n].lock().unwrap() = Some(ok);
        }); } });
        let fail = failed.load(Ordering::SeqCst); let top = if full { to } else { to.min(fail) };
        let grid: Vec<(i32, usize)> = (from..=top).map(|k| (k, (0..ns).filter(|&s| held[(k - from) as usize * ns + s].lock().unwrap().unwrap_or(false)).count())).collect();
        let margin = if fail == i32::MAX { rung(to) } else if fail == from { 0.0 } else { rung(fail - 1) };
        format!("{{\"margin\":{},\"open\":{},\"seeds\":{},\"grid\":[{}]}}", margin, fail == i32::MAX, ns, grid.iter().map(|g| format!("[{},{},{}]", g.0, rung(g.0), g.1)).collect::<Vec<_>>().join(","))
    }).collect();
    println!("[{}]", rows.join(",\n"));
}
