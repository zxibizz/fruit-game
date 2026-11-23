// fruit-sim: the native simulation of Fruit Defense and the bot that plays it, for the balance matrix.
// Every command takes a JSON file written by the JS side (sim/js/play.mjs, sim/js/verify.mjs):
//   fruit-sim run <batch.json> [--jobs N]
//     plays the scenarios of a batch { data, scenarios: [{ level, opts, record?, random? }] } on N threads and prints
//     a JSON list of what came of each, in their order ({ res, ms }, or { err } for a party that broke); record: a
//     file to write the party to (every action and the hash of the state after every step); random: a player with
//     no plan instead of the bot
//   fruit-sim layout <{ data, level, terrain }.json>
//     prints the maze the bot builds on a level: [[column, row of the gap], ...]
//   fruit-sim routes <{ data, levels: [n, ...] }.json>
//     prints the mazes of the balance matrix on those levels (routes.rs): the trail as it is and the longest found, and
//     for every length and shape { name, class, shape, len, walls: [[[column, row], ...], ...], trail }
//   fruit-sim replay <party.json ...> [--no-check] [--repeat N] [--dump-at K]
//     replays parties { data, level, seed, meta, ops } (data and ops may be names of files beside the party, as
//     sim/js/verify.mjs writes them): the hash of the state after every step must be the one
//     written down. --dump-at K prints the state after action K number by number, in the lines of
//     sim/js/replay.mjs --dump-at: the way to see where the two copies of the rules part
mod bot;
mod data;
mod game;
mod jsmath;
mod json;
mod routes;

use bot::{Op, Opts, Powers, Res, Upgrades, Where};
use data::Data;
use game::{Cell, Game, Power};
use json::J;
use std::collections::HashMap;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Mutex;
use std::time::Instant;

const DT: f64 = 1.0 / 30.0;

struct Party { name: String, data: Data, level: usize, seed: u32, meta: Vec<(String, usize)>, ops: Vec<Op> }

fn meta_of(j: &J) -> Vec<(String, usize)> { j.obj().iter().map(|(k, v)| (k.clone(), v.num() as usize)).collect() }
fn load(file: &str) -> Party {
    let text = std::fs::read_to_string(file).unwrap_or_else(|e| panic!("{}: {}", file, e));
    let j = J::parse(&text).unwrap_or_else(|e| panic!("{}: {}", file, e));
    // data and ops: there, or the names of files beside the party
    let beside = |v: &J| -> Option<J> { if let J::Str(name) = v { let f = std::path::Path::new(file).with_file_name(name); let t = std::fs::read_to_string(&f).unwrap_or_else(|e| panic!("{}: {}", f.display(), e)); Some(J::parse(&t).unwrap_or_else(|e| panic!("{}: {}", f.display(), e))) } else { None } };
    let (data_j, ops_j) = (beside(j.at("data")), beside(j.at("ops")));
    let data = Data::read(data_j.as_ref().unwrap_or_else(|| j.at("data")));
    let ops = ops_j.as_ref().unwrap_or_else(|| j.at("ops")).arr().iter().map(|o| {
        let a = o.arr(); let n = |k: usize| a[k].num() as i32;
        match a[0].str() {
            "s" => Op::Step(a[1].num() as u32),
            "place" => Op::Place(data.plant(a[1].str()), n(2), n(3)),
            "up" => Op::Up(n(1), n(2), if a.len() > 3 { a[3].num() as u8 } else { 0 }),
            "wave" => Op::Wave,
            "sell" => Op::Sell(n(1), n(2)),
            "power" => Op::Power(if a[1].str() == "frost" { Power::Frost } else { Power::Rain }),
            "dew" => Op::Dew(a[1].num()),
            x => panic!("unknown op {}", x),
        }
    }).collect();
    Party { name: j.at("name").str().to_string(), level: j.at("level").num() as usize, seed: j.at("seed").num() as u32, meta: meta_of(j.at("meta")), ops, data }
}

// the op the hashes part at, if any
fn replay(p: &Party, check: bool, dump_at: Option<usize>) -> Option<usize> {
    let mut g = Game::new(&p.data, p.level, p.seed, &p.meta); let mut buf = Vec::new();
    for (k, op) in p.ops.iter().enumerate() {
        match *op {
            Op::Step(h) => { g.step(DT); if check && g.hash(&mut buf) != h { return Some(k); } }
            Op::Place(kind, i, j) => { g.place(kind, i, j); }
            Op::Up(i, j, br) => { if let Some(pi) = g.plant_at(i, j) { g.upgrade(pi, br); } }
            Op::Wave => { g.start_wave(); }
            Op::Sell(i, j) => { if let Cell::Plant(id) = g.grid[game::key(i, j)] { g.remove_plant(id, true); } }
            Op::Power(kind) => { g.use_power(kind); }
            Op::Dew(v) => g.dew = v,
        }
        g.events.clear();
        if dump_at == Some(k) { println!("{}", g.dump()); std::process::exit(0); }
    }
    None
}

fn num(v: f64) -> String { if v.is_finite() { format!("{}", v) } else { "null".to_string() } }
fn opts_of(d: &Data, j: &J) -> Opts {
    let mut o = Opts::default();
    for (k, v) in j.obj() {
        match k.as_str() {
            "seed" => o.seed = v.num() as u32,
            "maxPlants" => o.max_plants = if *v == J::Null { f64::INFINITY } else { v.num() },
            "route" => o.route = v.num(),
            "hp" => o.hp = v.num(),
            "policy" => o.policy = if *v == J::Null { None } else {
                let row = |a: &J| -> Vec<f64> { a.arr().iter().map(|x| x.num()).collect() };
                let mut place = vec![[0.0; bot::NF]; d.plants.len()]; let mut up = vec![0.0; d.plants.len()];
                for (k, w) in v.at("place").obj() { let r = row(w); if r.len() != bot::NF { panic!("policy: {} weights for {}, not {}", r.len(), k, bot::NF); } place[d.plant(k)].copy_from_slice(&r); }
                for (k, w) in v.at("up").obj() { up[d.plant(k)] = w.num(); }
                let maze = v.get("maze").filter(|m| **m != J::Null).map(|m| { let r = row(m); if r.len() != routes::NM { panic!("policy: {} maze weights, not {}", r.len(), routes::NM); } let mut a = [0.0; routes::NM]; a.copy_from_slice(&r); a });
                Some(bot::Policy { place, up, maze })
            },
            "plan" => o.plan = if *v == J::Null { None } else { Some(v.arr().iter().map(|s| { let a = s.arr(); (if a[0].str() == "up" { None } else { Some(d.plant(a[0].str())) }, a[1].num() as i32, a[2].num() as i32) }).collect()) },
            "maze" => o.maze = if *v == J::Null { None } else { Some(v.str().to_string()) },
            "terrain" => o.terrain = v.truthy(),
            "powers" => o.powers = match v { J::Str(s) if s == "eager" => Powers::Eager, x => if x.truthy() { Powers::On } else { Powers::Off } },
            "bank" => o.bank = if v.truthy() { Some(v.num()) } else { None },
            "meta" => o.meta = meta_of(v),
            "place" => o.place = match v.str() { "best" => Where::Best, "end" => Where::End, "start" => Where::Start, "spread" => Where::Spread, x => panic!("place: {}", x) },
            "plants" => o.plants = if *v == J::Null { None } else { Some(v.arr().iter().map(|p| d.plant(p.str())).collect()) },
            "upgrades" => o.upgrades = match v.str() { "greedy" => Upgrades::Greedy, "none" => Upgrades::None, "first" => Upgrades::First, x => panic!("upgrades: {}", x) },
            "early" => o.early = v.truthy(),
            "steps" => o.steps = v.num() as usize,
            x => panic!("unknown option {}", x),
        }
    }
    o
}
fn res_json(d: &Data, level: usize, r: &Res) -> String {
    let kinds: Vec<String> = r.kinds.iter().map(|(k, n)| format!("\"{}\":{}", d.plants[*k].name, n)).collect();
    let bites: Vec<String> = r.bites.iter().map(|((w, k, brood), n)| format!("\"{}:{}{}\":{}", w, d.bugs[*k].name, if *brood { "*" } else { "" }, n)).collect();
    format!("{{\"worth\":{},\"trail\":{},\"level\":{},\"won\":{},\"hp\":{},\"maxHp\":{},\"wave\":{},\"waves\":{},\"plants\":{},\"grown\":{},\"maxed\":{},\"dew\":{},\"eaten\":{},\"income\":{},\"kinds\":{{{}}},\"bites\":{{{}}},\"powersUsed\":{},\"time\":{},\"gauge\":[{}]}}",
        num(r.worth), r.trail, level, r.won, num(r.hp), num(r.max_hp), r.wave, r.waves, r.plants, r.grown, r.maxed, num(r.dew), r.eaten, num(r.income), kinds.join(","), bites.join(","), r.powers_used, num(r.time),
        r.gauge.iter().map(|x| format!("[{},{},{},{},{},{},{},{},{},{}]", x.wave, num((x.ground * 1000.0).round() / 1000.0), num((x.air * 1000.0).round() / 1000.0), x.towers, num(x.dew), num((x.cover * 100.0).round() / 100.0), x.trail, num((x.pepper * 100.0).round() / 100.0), num((x.slowed * 100.0).round() / 100.0), num((x.hot * 100.0).round() / 100.0))).collect::<Vec<_>>().join(","))
}
fn ops_json(d: &Data, ops: &[Op]) -> String {
    let mut s = String::with_capacity(ops.len() * 16); s.push('[');
    for (k, op) in ops.iter().enumerate() {
        if k > 0 { s.push(','); }
        match op {
            Op::Step(h) => s.push_str(&format!("[\"s\",{}]", h)),
            Op::Place(kind, i, j) => s.push_str(&format!("[\"place\",\"{}\",{},{}]", d.plants[*kind].name, i, j)),
            Op::Up(i, j, br) => s.push_str(&format!("[\"up\",{},{},{}]", i, j, br)),
            Op::Wave => s.push_str("[\"wave\"]"),
            Op::Sell(i, j) => s.push_str(&format!("[\"sell\",{},{}]", i, j)),
            Op::Power(p) => s.push_str(if *p == Power::Frost { "[\"power\",\"frost\"]" } else { "[\"power\",\"rain\"]" }),
            Op::Dew(v) => s.push_str(&format!("[\"dew\",{}]", num(*v))),
        }
    }
    s.push(']'); s
}

fn run(file: &str, jobs: usize) {
    let text = std::fs::read_to_string(file).unwrap_or_else(|e| panic!("{}: {}", file, e));
    let j = J::parse(&text).unwrap_or_else(|e| panic!("{}: {}", file, e));
    let d = Data::read(j.at("data"));
    // random: a player with no plan (bot::play_random), for the parity check; its party is all there is to it
    let scs: Vec<(usize, Opts, Option<String>, bool)> = j.at("scenarios").arr().iter().map(|s| (s.at("level").num() as usize, opts_of(&d, s.at("opts")),
        s.get("record").and_then(|r| if let J::Str(f) = r { Some(f.clone()) } else { None }), s.get("random").map_or(false, |r| r.truthy()))).collect();
    // a scenario with hp plays on the same data with every bug that many times healthier: the rules are the same, so
    // the party is one the game itself would play on such data (the balance matrix looks for the health a garden
    // stops holding at)
    let mut scaled: Vec<(u64, Data)> = Vec::new();
    for s in &scs { let k = s.1.hp.to_bits(); if s.1.hp != 1.0 && !scaled.iter().any(|x| x.0 == k) { if s.2.is_some() { panic!("a party with hp is not recorded: the data written beside it would not be its own"); }
        let mut x = Data::read(j.at("data")); for b in x.bugs.iter_mut() { b.hp *= s.1.hp; } scaled.push((k, x)); } }
    let data_of = |opt: &Opts| -> &Data { if opt.hp == 1.0 { &d } else { &scaled.iter().find(|x| x.0 == opt.hp.to_bits()).unwrap().1 } };
    // the maze of a level is the same for every scenario on it
    let mazes: Mutex<HashMap<(usize, bool), Vec<(i32, i32)>>> = Mutex::new(HashMap::new());
    let layouts = |level: usize, terrain: bool| -> Vec<(i32, i32)> {
        if let Some(w) = mazes.lock().unwrap().get(&(level, terrain)) { return w.clone(); }
        let w = bot::layout(&d, level, terrain); mazes.lock().unwrap().insert((level, terrain), w.clone()); w
    };
    // and so are the mazes of the matrix (routes.rs), by name
    let routes: Mutex<HashMap<usize, std::sync::Arc<routes::Routes>>> = Mutex::new(HashMap::new());
    let named = |level: usize, name: &str| -> Option<Vec<routes::Wall>> {
        let known = routes.lock().unwrap().get(&level).cloned();
        let rs = known.unwrap_or_else(|| { let r = std::sync::Arc::new(routes::routes(&d, level)); routes.lock().unwrap().insert(level, r.clone()); r });
        rs.list.iter().find(|r| format!("{}/{}", r.class, r.shape) == name).map(|r| r.walls.clone())
    };
    // the mazes a strategy picks from (routes::pool), by level
    let pools: Mutex<HashMap<usize, std::sync::Arc<Vec<(Vec<routes::Wall>, [f64; routes::NM])>>>> = Mutex::new(HashMap::new());
    let pool = |level: usize| -> std::sync::Arc<Vec<(Vec<routes::Wall>, [f64; routes::NM])>> {
        if let Some(p) = pools.lock().unwrap().get(&level) { return p.clone(); }
        let p = std::sync::Arc::new(routes::pool(&d, level)); pools.lock().unwrap().insert(level, p.clone()); p
    };
    let next = AtomicUsize::new(0); let out: Vec<Mutex<String>> = scs.iter().map(|_| Mutex::new(String::new())).collect();
    std::thread::scope(|sc| {
        for _ in 0..jobs.max(1).min(scs.len().max(1)) {
            sc.spawn(|| loop {
                let k = next.fetch_add(1, Ordering::SeqCst); if k >= scs.len() { break; }
                let (level, opt, record, random) = &scs[k]; let t = Instant::now();
                // a party that panics is its own failure: the others of the batch are played and reported
                let played = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| if *random { (Res::default(), Some(bot::play_random(data_of(opt), *level, opt))) } else { bot::play_level(data_of(opt), *level, opt, &layouts, &named, &pool, record.is_some()) }));
                let ms = t.elapsed().as_secs_f64() * 1000.0;
                *out[k].lock().unwrap() = match played {
                    Err(e) => format!("{{\"err\":{:?}}}", e.downcast_ref::<String>().cloned().or_else(|| e.downcast_ref::<&str>().map(|s| s.to_string())).unwrap_or_else(|| "panic".to_string())),
                    Ok((r, ops)) => {
                        // the party goes to a file of its own (half a megabyte of JSON each: too much to pass along in one piece)
                        if let (Some(file), Some(o)) = (record, ops) { std::fs::write(file, ops_json(&d, &o)).unwrap_or_else(|e| panic!("{}: {}", file, e)); }
                        format!("{{\"res\":{},\"ms\":{:.2}}}", res_json(&d, *level, &r), ms)
                    }
                };
            });
        }
    });
    let lines: Vec<String> = out.into_iter().map(|m| m.into_inner().unwrap()).collect();
    println!("[{}]", lines.join(",\n"));
}

fn main() {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let opt = |k: &str| args.iter().position(|a| a == k).and_then(|i| args.get(i + 1)).cloned();
    let valued = ["--repeat", "--dump-at", "--jobs"];
    let files: Vec<&String> = args.iter().enumerate().skip(1).filter(|(k, a)| !a.starts_with("--") && !valued.contains(&args[*k - 1].as_str())).map(|(_, a)| a).collect();
    match args.first().map(|s| s.as_str()) {
        Some("layout") if files.len() == 1 => {
            let text = std::fs::read_to_string(files[0]).unwrap_or_else(|e| panic!("{}: {}", files[0], e));
            let j = J::parse(&text).unwrap_or_else(|e| panic!("{}: {}", files[0], e));
            let d = Data::read(j.at("data"));
            let walls = bot::layout(&d, j.at("level").num() as usize, j.at("terrain").truthy());
            println!("[{}]", walls.iter().map(|(c, g)| format!("[{},{}]", c, g)).collect::<Vec<_>>().join(","));
        }
        Some("routes") if files.len() == 1 => {
            let text = std::fs::read_to_string(files[0]).unwrap_or_else(|e| panic!("{}: {}", files[0], e));
            let j = J::parse(&text).unwrap_or_else(|e| panic!("{}: {}", files[0], e));
            let d = Data::read(j.at("data"));
            let cells = |cs: &[(i32, i32)]| format!("[{}]", cs.iter().map(|(i, j)| format!("[{},{}]", i, j)).collect::<Vec<_>>().join(","));
            let levels: Vec<String> = j.at("levels").arr().iter().map(|n| {
                let rs = routes::routes(&d, n.num() as usize);
                let list: Vec<String> = rs.list.iter().map(|r| format!("{{\"name\":\"{}/{}\",\"class\":\"{}\",\"shape\":\"{}\",\"len\":{},\"walls\":[{}],\"trail\":{}}}", r.class, r.shape, r.class, r.shape, r.len,
                    r.walls.iter().map(|w| cells(w)).collect::<Vec<_>>().join(","), cells(&r.trail))).collect();
                format!("{{\"level\":{},\"base\":{},\"max\":{},\"routes\":[{}]}}", n.num(), rs.base, rs.max, list.join(","))
            }).collect();
            println!("[{}]", levels.join(",\n"));
        }
        Some("run") if files.len() == 1 => {
            let jobs = opt("--jobs").map_or_else(|| std::thread::available_parallelism().map_or(1, |n| n.get()), |v| v.parse().unwrap());
            run(files[0], jobs);
        }
        Some("replay") => {
            let check = !args.iter().any(|a| a == "--no-check");
            let repeat: usize = opt("--repeat").map_or(1, |v| v.parse().unwrap());
            let dump_at: Option<usize> = opt("--dump-at").map(|v| v.parse().unwrap());
            let (mut bad, mut total) = (0, 0.0);
            for f in &files {
                let p = load(f);
                if let Some(at) = replay(&p, check, dump_at) { bad += 1; println!("{}: MISMATCH at op {}", p.name, at); continue; }
                let t = Instant::now(); for _ in 0..repeat { replay(&p, false, None); }
                let ms = t.elapsed().as_secs_f64() * 1000.0 / repeat as f64; total += ms;
                println!("{}: ok, {} ops, {:.1} ms", p.name, p.ops.len(), ms);
            }
            println!("native total {:.1} ms over {} parties{}", total, files.len(), if bad > 0 { format!(", {} MISMATCHED", bad) } else { String::new() });
            std::process::exit(if bad > 0 { 1 } else { 0 });
        }
        _ => { eprintln!("usage: fruit-sim run <batch.json> [--jobs N] | layout <request.json> | routes <request.json> | replay <party.json ...> [--no-check] [--repeat N] [--dump-at K]"); std::process::exit(2); }
    }
}
