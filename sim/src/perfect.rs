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
// given (the bots' own, the one kept before, any other) it keeps a champion — the party of the highest margin: clean
// on every seed on every rung from ×0.75 up to it — and a few runners-up, and tries changes on them against the
// rung above the champion's: a step earlier or later, all the steps of a plant moved, another branch, a plant grown
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

pub struct Ctx<'a> {
    j_data: &'a J, pub d: Data, pub level: usize, pub base: Opts, pub seeds: Vec<u32>,
    datas: Mutex<HashMap<i32, Arc<Data>>>, pub kinds: Vec<usize>, pub parties: AtomicU64,
}
impl<'a> Ctx<'a> {
    pub fn new(j_data: &'a J, level: usize, base: Opts, seeds: Vec<u32>, only: Option<usize>) -> Ctx<'a> {
        let d = Data::read(j_data);
        let kinds: Vec<usize> = d.levels[level].plants.iter().cloned().filter(|&k| only.map_or(true, |o| o == k)).collect();
        Ctx { j_data, d, level, base, seeds, datas: Mutex::new(HashMap::new()), kinds, parties: AtomicU64::new(0) }
    }
    // the game with every bug rung(k) times healthier: the data as `fruit-sim run` scales it for a scenario with hp
    fn data_at(&self, k: i32) -> Arc<Data> {
        if let Some(d) = self.datas.lock().unwrap().get(&k) { return d.clone(); }
        let mut x = Data::read(self.j_data); let s = rung(k); if s != 1.0 { for b in x.bugs.iter_mut() { b.hp *= s; } }
        let x = Arc::new(x); self.datas.lock().unwrap().insert(k, x.clone()); x
    }
    pub fn party(&self, plan: Option<&[Step]>, o: &Opts, k: i32, seed: u32, stop: f64, record: bool) -> (Res, Option<Vec<Op>>) {
        let d = self.data_at(k); let mut opt = o.clone(); opt.seed = seed; opt.stop_bitten = stop; if let Some(p) = plan { opt.plan = Some(p.to_vec()); }
        self.parties.fetch_add(1, Ordering::Relaxed);
        let (level, dd) = (self.level, &*d);
        let layouts = |l: usize, t: bool| bot::layout(dd, l, t);
        let mazes = |l: usize, name: &str| routes::routes(dd, l).list.iter().find(|r| format!("{}/{}", r.class, r.shape) == name).map(|r| r.walls.clone());
        let pool = |l: usize| Arc::new(routes::pool(dd, l));
        bot::play_level(dd, level, &opt, &layouts, &mazes, &pool, record)
    }
    fn clean(r: &Res) -> bool { r.won && r.bitten == 0.0 }
    // how a plan does on rung k: the seeds it is clean on before the first it is not, and on that one a part of one, the
    // greater the less was bitten (the seeds in their order, none played after the first failure); all of them: clean
    pub fn fitness(&self, plan: &[Step], k: i32) -> f64 {
        for (n, &seed) in self.seeds.iter().enumerate() {
            let (r, _) = self.party(Some(plan), &self.base, k, seed, CAP, false);
            if Self::clean(&r) { continue; }
            let bad = if r.won { r.bitten } else { CAP + (r.waves as f64 - r.wave as f64 + 1.0) * CAP };
            return n as f64 + 1.0 / (1.0 + bad / CAP);
        }
        self.seeds.len() as f64
    }
    pub fn all_clean(&self, plan: &[Step], k: i32) -> bool {
        self.seeds.iter().all(|&seed| Self::clean(&self.party(Some(plan), &self.base, k, seed, 0.0, false).0))
    }
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
        0..=13 => { // a step earlier or later
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
struct Entry { plan: Vec<Step>, fit: f64, at: i32 } // fit: on rung `at`
struct State { champ: Vec<Step>, front: i32, pop: Vec<Entry>, seen: HashSet<u64>, tried: u64, history: Vec<(f64, i32)> }
const POP: usize = 14;

// The rung a plan holds: the last before the first it is bitten on (on any seed), counted from the floor up — every rung
// from the floor to it is clean. A plan bitten on the floor itself holds the first rung below it that it is clean on.
pub const K_FLOOR: i32 = -6; // 0.75
fn level_of(cx: &Ctx, plan: &[Step]) -> i32 {
    let ok = |k: i32| cx.all_clean(plan, k);
    let mut k = K_FLOOR;
    if ok(k) { while k < K_MAX && ok(k + 1) { k += 1; } k } else { loop { k -= 1; if k < K_MIN { return K_MIN - 1; } if ok(k) { return k; } } }
}
// clean on every rung from the floor up to `top` (the highest first: a failure is likeliest there)
fn holds_below(cx: &Ctx, plan: &[Step], top: i32) -> bool { (K_FLOOR..=top).rev().all(|k| cx.all_clean(plan, k)) }

pub fn search(cx: &Ctx, seeds_plans: Vec<Vec<Step>>, secs: f64, jobs: usize, rng_seed: u64, log: &(dyn Fn(String) + Sync)) -> (Vec<Step>, i32, Vec<(f64, i32)>, u64) {
    let t0 = Instant::now();
    // where every party given stands; the best of them is the first champion
    let mut starts: Vec<(Vec<Step>, i32)> = std::thread::scope(|sc| {
        let hs: Vec<_> = seeds_plans.into_iter().map(|mut p| sc.spawn(move || { tidy(&mut p); let k = level_of(cx, &p); (p, k) })).collect();
        hs.into_iter().map(|h| h.join().unwrap()).collect() });
    starts.sort_by(|a, b| b.1.cmp(&a.1));
    log(format!("the parties given hold: {}", starts.iter().map(|s| if s.1 < K_MIN { "nothing".to_string() } else { format!("×{:.2}", rung(s.1)) }).collect::<Vec<_>>().join(", ")));
    let (champ, front) = starts[0].clone();
    let st = Mutex::new(State { champ, front, pop: starts.into_iter().skip(1).take(POP).map(|(plan, k)| Entry { plan, fit: 0.0, at: k }).collect(), seen: HashSet::new(), tried: 0, history: vec![(0.0, front)] });
    std::thread::scope(|sc| { for t in 0..jobs.max(1) { let st = &st; sc.spawn(move || {
        let mut r = Rng::new(rng_seed.wrapping_mul(1000).wrapping_add(t as u64 + 1));
        while t0.elapsed().as_secs_f64() < secs {
            let (parent, other, target) = { let s = st.lock().unwrap();
                let pick = |r: &mut Rng| -> Vec<Step> { if s.pop.is_empty() || r.f() < 0.55 { s.champ.clone() } else { let top = 1 + r.n(s.pop.len()); let q = r.n(top); s.pop[q].plan.clone() } };
                (pick(&mut r), pick(&mut r), (s.front + 1).min(K_MAX)) };
            let mut child = parent.clone(); let mut changed = false;
            for _ in 0..1 + (r.f() < 0.4) as usize + (r.f() < 0.15) as usize { if let Some(c) = mutate(cx, &child, Some(&other), &mut r) { child = c; changed = true; } }
            if !changed { continue; }
            { let mut s = st.lock().unwrap(); if !s.seen.insert(hash_of(&child)) { continue; } s.tried += 1; }
            let fit = cx.fitness(&child, target);
            if fit >= cx.seeds.len() as f64 && holds_below(cx, &child, target - 1) {
                // clean on the rung above the champion's and on every rung below it down to the floor: it is the champion, as
                // far up as it goes before the first rung it is bitten on
                let mut k = target; while k < K_MAX && cx.all_clean(&child, k + 1) { k += 1; }
                let mut s = st.lock().unwrap();
                if k > s.front { let old = std::mem::replace(&mut s.champ, child.clone()); let of = s.front; s.front = k; let el = t0.elapsed().as_secs_f64(); s.history.push((el, k));
                    s.pop.insert(0, Entry { plan: old, fit: 0.0, at: of }); s.pop.truncate(POP);
                    log(format!("{:>5.0} s: clean against bugs ×{:.2} ({} tried)", el, rung(k), s.tried)); }
                continue;
            }
            let mut s = st.lock().unwrap();
            // a runner-up: the better the higher the rung it was tried on, then by how it did there
            let e = Entry { plan: child, fit, at: target };
            let at = s.pop.iter().position(|x| (e.at, e.fit) > (x.at, x.fit)).unwrap_or(s.pop.len());
            if at < POP { s.pop.insert(at, e); s.pop.truncate(POP); }
        }
    }); } });
    let s = st.into_inner().unwrap();
    (s.champ, s.front, s.history, s.tried)
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
//   rng } → { plan, k, margin, history: [[secs, margin]], tried, parties }
pub fn perfect(j: &J, jobs: usize) {
    let d0 = Data::read(j.at("data")); let level = j.at("level").num() as usize;
    let only = j.get("only").filter(|v| **v != J::Null).map(|v| d0.plant(v.str()));
    let mut base = crate::opts_of(&d0, j.at("opts")); if let Some(k) = only { base.plants = Some(vec![k]); }
    let seeds: Vec<u32> = j.get("seeds").map_or(vec![7, 11, 13], |s| s.arr().iter().map(|x| x.num() as u32).collect());
    let cx = Ctx::new(j.at("data"), level, base, seeds, only);
    let mut plans: Vec<Vec<Step>> = j.get("plans").map_or(Vec::new(), |p| p.arr().iter().map(|x| plan_of(&cx.d, x)).collect());
    if let Some(bots) = j.get("bots") { for b in bots.arr() { let mut o = crate::opts_of(&cx.d, b); if let Some(k) = only { o.plants = Some(vec![k]); }
        let (_, ops) = cx.party(None, &o, 0, cx.seeds[0], f64::INFINITY, true); plans.push(steps_of_ops(&ops.unwrap())); } }
    if let Some(k) = only { for p in plans.iter_mut() { p.retain(|s| s.0.map_or(true, |x| x == k)); } }
    plans.retain(|p| !p.is_empty()); if plans.is_empty() { plans.push(Vec::new()); }
    let secs = j.get("secs").map_or(60.0, |v| v.num()); let rng = j.get("rng").map_or(1.0, |v| v.num()) as u64;
    let log = |s: String| eprintln!("  {}", s);
    let (plan, k, history, tried) = search(&cx, plans, secs, jobs, rng, &log);
    println!("{{\"plan\":{},\"k\":{},\"margin\":{},\"history\":[{}],\"tried\":{},\"parties\":{}}}", plan_json(&cx.d, &plan), k, if k < K_MIN { 0.0 } else { rung(k) },
        history.iter().map(|h| format!("[{:.0},{}]", h.0, if h.1 < K_MIN { 0.0 } else { rung(h.1) })).collect::<Vec<_>>().join(","), tried, cx.parties.load(Ordering::Relaxed));
}
// fruit-sim scan: { data, tasks: [{ level, opts }], seeds, from, to } → for every task the seeds it is clean on (the
// fruit never bitten) on every rung from..=to: [[k, health, clean seeds], ...], and its margin: the last rung before the
// first it is bitten on (0: bitten on the lowest rung asked)
pub fn scan(j: &J, jobs: usize) {
    let d0 = Data::read(j.at("data"));
    let seeds: Vec<u32> = j.get("seeds").map_or(vec![7, 11, 13], |s| s.arr().iter().map(|x| x.num() as u32).collect());
    let (from, to) = (j.get("from").map_or(-6, |v| v.num() as i32).max(K_MIN), j.get("to").map_or(14, |v| v.num() as i32).min(K_MAX));
    let what = j.get("what").map_or("clean", |v| v.str()).to_string(); // clean | won | stars (three stars: 80% of the fruit left)
    let tasks: Vec<(usize, Opts)> = j.at("tasks").arr().iter().map(|t| (t.at("level").num() as usize, crate::opts_of(&d0, t.at("opts")))).collect();
    let mut levels: Vec<usize> = tasks.iter().map(|t| t.0).collect(); levels.sort(); levels.dedup();
    let cxs: HashMap<usize, Ctx> = levels.into_iter().map(|l| (l, Ctx::new(j.at("data"), l, Opts::default(), seeds.clone(), None))).collect();
    // every (task, rung, seed) is a party; a rung above one the task is already bitten on is still played: the grid is the answer
    let mut jobs_list: Vec<(usize, i32, u32)> = Vec::new();
    for t in 0..tasks.len() { for k in from..=to { for &sd in &seeds { jobs_list.push((t, k, sd)); } } }
    let next = std::sync::atomic::AtomicUsize::new(0); let out: Vec<Mutex<bool>> = jobs_list.iter().map(|_| Mutex::new(false)).collect();
    std::thread::scope(|sc| { for _ in 0..jobs.max(1) { sc.spawn(|| loop {
        let n = next.fetch_add(1, Ordering::SeqCst); if n >= jobs_list.len() { break; }
        let (t, k, seed) = jobs_list[n]; let (level, o) = &tasks[t]; let cx = &cxs[level];
        let stop = if what == "clean" { 0.0 } else { f64::INFINITY };
        let (r, _) = cx.party(None, o, k, seed, stop, false);
        *out[n].lock().unwrap() = match what.as_str() { "won" => r.won, "stars" => r.won && r.hp >= 0.8 * r.max_hp, _ => Ctx::clean(&r) };
    }); } });
    let ns = seeds.len(); let per = (to - from + 1) as usize * ns;
    let rows: Vec<String> = (0..tasks.len()).map(|t| {
        let grid: Vec<(i32, usize)> = (from..=to).enumerate().map(|(q, k)| (k, (0..ns).filter(|&s| *out[t * per + q * ns + s].lock().unwrap()).count())).collect();
        let fail = grid.iter().position(|g| g.1 < ns); let margin = match fail { Some(0) => 0.0, Some(q) => rung(grid[q - 1].0), None => rung(to) };
        format!("{{\"margin\":{},\"open\":{},\"grid\":[{}]}}", margin, fail.is_none(), grid.iter().map(|g| format!("[{},{},{}]", g.0, rung(g.0), g.1)).collect::<Vec<_>>().join(","))
    }).collect();
    println!("[{}]", rows.join(",\n"));
}
