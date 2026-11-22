// The game data as public/data.js has it, read from the JSON that sim/js/export.mjs writes. No numbers of the game
// live here: only the names of the things the rules in game.rs ask for. A key this file does not know is an error,
// so a stat added on the JS side cannot be silently left out of the native one.
use crate::json::J;

pub const COLS: i32 = 14;
pub const ROWS: i32 = 8;
pub const N: usize = (COLS * ROWS) as usize;

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Stat { Range, Rate, Dmg, Mark, Multi, Splash, Hits, Heal, Regrow, Guard, Slow, Chill, Burn, BurnT, Stun, Eat, Chomp, Gulp, EatAir, Buff, Hp, Thorns }
pub const NSTAT: usize = 22;
fn stat_of(name: &str) -> Option<Stat> {
    use Stat::*;
    Some(match name {
        "range" => Range, "rate" => Rate, "dmg" => Dmg, "mark" => Mark, "multi" => Multi, "splash" => Splash, "hits" => Hits, "heal" => Heal,
        "regrow" => Regrow, "guard" => Guard, "slow" => Slow, "chill" => Chill, "burn" => Burn, "burnT" => BurnT, "stun" => Stun, "eat" => Eat,
        "chomp" => Chomp, "gulp" => Gulp, "eatAir" => EatAir, "buff" => Buff, "hp" => Hp, "thorns" => Thorns,
        _ => return None,
    })
}

pub struct Perk { pub stat: Option<Stat>, pub mul: bool, pub v: Vec<f64>, pub cost: Vec<f64> }
pub struct PlantDef {
    pub name: String, pub cost: f64, pub up: [f64; 2],
    pub st: [[f64; 3]; NSTAT], pub has: [bool; NSTAT],
    pub air: bool, pub ground: f64, pub ground_range: f64, pub speed: f64,
    pub perk: Option<Perk>,
}
pub struct BugDef {
    pub name: String, pub hp: f64, pub speed: f64, pub bite: f64, pub reward: f64, pub w: f64, pub armor: f64, pub chew: f64, pub dig: f64, pub mend: f64,
    pub fly: bool, pub boss: bool, pub no_slow: bool,
    pub charge: Option<[f64; 3]>, pub brood: Option<(usize, usize, f64)>, pub web: Option<[f64; 4]>, pub split: Option<(usize, usize)>,
}
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Tile { None, Fertile, Mud, Nettle }
pub struct Group { pub kind: usize, pub count: usize, pub gap: f64, pub delay: f64 }
pub struct Level {
    pub dew: f64, pub hp: f64, pub pay: [f64; 2], pub count: usize, pub pay_at: Vec<f64>, pub plants: Vec<usize>,
    pub obstacles: Vec<(i32, i32, bool)>, // the third: weeds (can be cleared)
    pub tiles: Vec<(i32, i32, Tile)>, pub entries: Vec<i32>, pub fruit: (i32, i32), pub waves: Vec<Vec<Group>>,
}
pub struct Data {
    pub fruit_hp: f64, pub brk: f64, pub early_dew: f64, pub repair: f64, pub regrow: f64, pub refund: f64, pub chew_growth: f64,
    pub power_every: f64, pub power_max: f64, pub fertile: f64, pub fertile_add: f64, pub mud: f64, pub nettle: f64, pub nettle_boss: f64,
    pub weed_cost: f64, pub brood_reward: f64, pub fly_hp: f64, pub mark_t: f64, pub hp_growth: f64,
    pub plants: Vec<PlantDef>, pub bugs: Vec<BugDef>, pub perks: Vec<(String, Perk)>, pub levels: Vec<Level>,
    pub pepper: usize, pub pumpkin: usize, pub aloe: usize, pub cricket: usize,
}

impl Level {
    // wavePay of data.js: the dew for a wave got through. The JS side sends the pay of every wave counted (pay_at);
    // the bot also asks for the pay before the first wave, so the rule is here too, and read() checks one against the other.
    pub fn wave_pay(&self, wave: usize) -> f64 {
        (self.pay[0] + (self.pay[1] - self.pay[0]) * (1.0f64).min((0.0f64).max(wave as f64 - 1.0) / (1.0f64).max(self.count as f64 - 2.0)) + 0.5).floor()
    }
}

fn triple(v: &J) -> [f64; 3] {
    match v { J::Arr(a) => { assert!(a.len() == 3, "a stat has three levels"); [a[0].num(), a[1].num(), a[2].num()] } _ => { let x = v.num(); [x, x, x] } }
}
fn nums(v: &J) -> Vec<f64> { v.arr().iter().map(|x| x.num()).collect() }

impl Data {
    pub fn plant(&self, name: &str) -> usize { self.plants.iter().position(|p| p.name == name).unwrap_or_else(|| panic!("no plant {}", name)) }
    pub fn perk(&self, name: &str) -> Option<&Perk> { self.perks.iter().find(|(n, _)| n == name).map(|(_, p)| p) }

    pub fn read(j: &J) -> Data {
        let c = j.at("C"); let n = |k: &str| c.at(k).num();
        assert!(n("COLS") as i32 == COLS && n("ROWS") as i32 == ROWS, "the field is {}x{} here", COLS, ROWS);
        let perks: Vec<(String, Perk)> = j.at("PERKS").obj().iter().map(|(name, p)| {
            for (k, _) in p.obj() { assert!(matches!(k.as_str(), "cost" | "v" | "stat" | "mul"), "perk {}: unknown key {}", name, k); }
            let stat = p.get("stat").map(|s| stat_of(s.str()).unwrap_or_else(|| panic!("perk {}: unknown stat {}", name, s.str())));
            (name.clone(), Perk { stat, mul: p.get("mul").map_or(false, |m| m.truthy()), v: nums(p.at("v")), cost: nums(p.at("cost")) })
        }).collect();
        let plants: Vec<PlantDef> = j.at("PLANTS").obj().iter().map(|(name, p)| {
            let mut d = PlantDef { name: name.clone(), cost: 0.0, up: [0.0; 2], st: [[0.0; 3]; NSTAT], has: [false; NSTAT], air: false, ground: 0.0, ground_range: 0.0, speed: 0.0, perk: None };
            for (k, v) in p.obj() {
                match k.as_str() {
                    "cost" => d.cost = v.num(),
                    "up" => { let u = nums(v); d.up = [u[0], u[1]]; }
                    "air" => d.air = v.truthy(),
                    "ground" => d.ground = v.num(),
                    "groundRange" => d.ground_range = v.num(),
                    "speed" => d.speed = v.num(),
                    "shot" => {}
                    _ => { let s = stat_of(k).unwrap_or_else(|| panic!("plant {}: unknown key {}", name, k)); d.st[s as usize] = triple(v); d.has[s as usize] = true; }
                }
            }
            d
        }).collect();
        let plants: Vec<PlantDef> = plants.into_iter().map(|mut d| {
            if let Some((_, pk)) = perks.iter().find(|(n, _)| *n == d.name) { d.perk = Some(Perk { stat: pk.stat, mul: pk.mul, v: pk.v.clone(), cost: pk.cost.clone() }); }
            d
        }).collect();
        let names: Vec<String> = j.at("BUGS").obj().iter().map(|(k, _)| k.clone()).collect();
        let bug_ix = |s: &str| names.iter().position(|x| x == s).unwrap_or_else(|| panic!("no bug {}", s));
        let bugs: Vec<BugDef> = j.at("BUGS").obj().iter().map(|(name, b)| {
            let mut d = BugDef { name: name.clone(), hp: 0.0, speed: 0.0, bite: 0.0, reward: 0.0, w: 0.0, armor: 0.0, chew: 0.0, dig: 0.0, mend: 0.0, fly: false, boss: false, no_slow: false, charge: None, brood: None, web: None, split: None };
            for (k, v) in b.obj() {
                match k.as_str() {
                    "hp" => d.hp = v.num(), "speed" => d.speed = v.num(), "bite" => d.bite = v.num(), "reward" => d.reward = v.num(), "w" => d.w = v.num(),
                    "armor" => d.armor = v.num(), "chew" => d.chew = v.num(), "dig" => d.dig = v.num(), "mend" => d.mend = v.num(),
                    "fly" => d.fly = v.truthy(), "boss" => d.boss = v.truthy(), "noSlow" => d.no_slow = v.truthy(),
                    "charge" => { let a = nums(v); d.charge = Some([a[0], a[1], a[2]]); }
                    "brood" => { let a = v.arr(); d.brood = Some((bug_ix(a[0].str()), a[1].num() as usize, a[2].num())); }
                    "web" => { let a = nums(v); d.web = Some([a[0], a[1], a[2], a[3]]); }
                    "split" => { let a = v.arr(); d.split = Some((bug_ix(a[0].str()), a[1].num() as usize)); }
                    _ => panic!("bug {}: unknown key {}", name, k),
                }
            }
            d
        }).collect();
        let plant_ix = |s: &str| plants.iter().position(|p| p.name == s).unwrap_or_else(|| panic!("no plant {}", s));
        let levels: Vec<Level> = j.at("LEVELS").arr().iter().map(|l| {
            let pay = nums(l.at("pay")); let fruit = nums(l.at("fruit"));
            Level {
                dew: l.at("dew").num(), hp: l.get("hp").map_or(1.0, |v| v.num()), pay: [pay[0], pay[1]], count: l.at("count").num() as usize, pay_at: nums(l.at("payAt")),
                plants: l.at("plants").arr().iter().map(|p| plant_ix(p.str())).collect(),
                obstacles: l.at("obstacles").arr().iter().map(|o| { let a = o.arr(); (a[0].num() as i32, a[1].num() as i32, a[2].str() == "weed") }).collect(),
                tiles: l.at("tiles").arr().iter().map(|o| { let a = o.arr(); (a[0].num() as i32, a[1].num() as i32, match a[2].str() { "fertile" => Tile::Fertile, "mud" => Tile::Mud, "nettle" => Tile::Nettle, t => panic!("unknown ground {}", t) }) }).collect(),
                entries: l.at("entries").arr().iter().map(|e| e.num() as i32).collect(),
                fruit: (fruit[0] as i32, fruit[1] as i32),
                waves: l.at("waves").arr().iter().map(|w| w.arr().iter().map(|g| { let a = g.arr(); Group { kind: bug_ix(a[0].str()), count: a[1].num() as usize, gap: a[2].num(), delay: a[3].num() } }).collect()).collect(),
            }
        }).collect();
        for (n, l) in levels.iter().enumerate() { for (k, &p) in l.pay_at.iter().enumerate() { assert!(l.wave_pay(k + 1) == p, "level {}: the pay of wave {} is {} in data.js and {} here", n + 1, k + 1, p, l.wave_pay(k + 1)); } }
        let (pepper, pumpkin, aloe) = (plant_ix("pepper"), plant_ix("pumpkin"), plant_ix("aloe"));
        let cricket = bug_ix("cricket");
        Data {
            fruit_hp: n("FRUIT_HP"), brk: n("BREAK"), early_dew: n("EARLY_DEW"), repair: n("REPAIR"), regrow: n("REGROW"), refund: n("REFUND"), chew_growth: n("CHEW_GROWTH"),
            power_every: n("POWER_EVERY"), power_max: n("POWER_MAX"), fertile: n("FERTILE"), fertile_add: n("FERTILE_ADD"), mud: n("MUD"), nettle: n("NETTLE"), nettle_boss: n("NETTLE_BOSS"),
            weed_cost: n("WEED_COST"), brood_reward: n("BROOD_REWARD"), fly_hp: n("FLY_HP"), mark_t: n("MARK_T"), hp_growth: n("hpGrowth"),
            plants, bugs, perks, levels, pepper, pumpkin, aloe, cricket,
        }
    }
}
