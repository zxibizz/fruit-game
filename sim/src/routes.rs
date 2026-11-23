// Routes: the mazes the balance matrix walks a level over, by the length of the trail and by the way it winds.
// The lengths are classes between the trail as it is (straight) and the longest maze found on the level: min (the
// least lengthening worth the name: a fifth of the way), mid (half), above (three quarters), max. Every class is
// built in several shapes, so that a finding is about the length and not about one maze:
//   best    — the smart bot's own maze (max only)
//   alt     — a serpentine over the whole field on other columns than the bot's
//   anthill — upright walls, the bends bunched by the anthill
//   fruit   — upright walls, the bends bunched by the fruit
//   wide    — upright walls over the whole field with wide corridors between them
//   rows    — a door by the anthill and walls along the field: the trail runs left and right, not up and down
// A shape is in a class when it gets within a tenth of the way of the class's length; the others are left out. The
// bot's own maze is always there, in the class it is nearest to. A length fewer than three shapes reach is filled up
// with other mazes of the same shapes ("rows2"), as unlike those taken as there are.
use crate::bot::layout;
use crate::data::*;
use crate::game::*;

pub type Wall = Vec<(i32, i32)>; // the cells of a wall, in the order they are planted
pub struct Route { pub class: &'static str, pub shape: String, pub len: usize, pub walls: Vec<Wall>, pub trail: Vec<(i32, i32)> }
pub struct Routes { pub base: usize, pub max: usize, pub list: Vec<Route> }
pub const CLASSES: [(&str, f64); 4] = [("min", 0.2), ("mid", 0.5), ("above", 0.75), ("max", 1.0)];
const SHAPES: [&str; 6] = ["best", "alt", "anthill", "fruit", "wide", "rows"];
// the columns of a full serpentine, from the anthill to the fruit (the bot's maze is picked from these)
pub const SERPENTINES: [&[i32]; 6] = [&[11, 9, 7, 5, 3], &[10, 8, 6, 4, 2], &[11, 9, 7, 5, 2], &[12, 10, 8, 6, 4, 2], &[11, 8, 6, 4, 2], &[12, 10, 8, 6, 4]];
const WIDE: [&[i32]; 14] = [&[11, 8, 5, 2], &[12, 9, 6, 3], &[10, 7, 4], &[11, 7, 3], &[12, 8, 4], &[10, 6, 2], &[9, 5], &[10, 5], &[11, 6], &[9, 4], &[12, 7, 2], &[7], &[6], &[8]];

// a straight wall with one gap: upright (in column `at`, over the rows lo..=hi) or along the field (in row `at`)
#[derive(Clone, Copy)]
struct Line { up: bool, at: i32, lo: i32, hi: i32, gap: i32 }
impl Line {
    fn cells(&self) -> Wall { (self.lo..=self.hi).filter(|&k| k != self.gap).map(|k| if self.up { (self.at, k) } else { (k, self.at) }).collect() }
}
fn free(g: &Game, i: i32, j: i32) -> bool { g.grid[key(i, j)] == Cell::Empty && !matches!(g.tiles[key(i, j)], Tile::Nettle | Tile::Stone | Tile::Bed) && (i, j) != g.fruit && !g.entries.iter().any(|&e| e == (i, j)) }
// every cell some trail runs over with the walls standing, and the length of the shortest trail (None: no way through)
pub fn walk(g: &Game, walls: &[Wall]) -> Option<(usize, Vec<(i32, i32)>)> {
    let mut grid = g.grid;
    for w in walls { for &(i, j) in w { if free(g, i, j) { grid[key(i, j)] = Cell::Rock; } } }
    let dist = dist_over(&grid, &g.tiles, g.fruit, -1); let (mut min, mut seen, mut all) = (usize::MAX, [false; N], Vec::new());
    for e in 0..g.entries.len() {
        let tr = g.trail(&dist, e);
        if *tr.last().unwrap() != g.fruit { return None; }
        min = min.min(tr.len());
        for &(i, j) in &tr { if !seen[key(i, j)] { seen[key(i, j)] = true; all.push((i, j)); } }
    }
    Some((min, all))
}
fn len_of(g: &Game, lines: &[Line]) -> i32 { let walls: Vec<Wall> = lines.iter().map(|l| l.cells()).collect(); walk(g, &walls).map_or(-1, |x| x.0 as i32) }
// the gaps that give the longest trail: wall by wall, then two more rounds (a gap moves only for a longer trail)
fn tune(g: &Game, lines: &mut Vec<Line>, from: usize) {
    let one = |ls: &mut Vec<Line>, k: usize| { let (mut at, mut top) = (ls[k].gap, len_of(g, ls)); for x in ls[k].lo..=ls[k].hi { ls[k].gap = x; let v = len_of(g, ls); if v > top { top = v; at = x; } } ls[k].gap = at; };
    for k in from..lines.len() { let mut part = lines[..=k].to_vec(); one(&mut part, k); lines[k].gap = part[k].gap; }
    for _ in 0..2 { for k in from..lines.len() { one(lines, k); } }
}
struct Cand { shape: &'static str, lines: Vec<Line>, len: usize, cells: Vec<usize> }
fn cand(g: &Game, shape: &'static str, lines: Vec<Line>, out: &mut Vec<Cand>) {
    let v = len_of(g, &lines); if v < 0 { return; }
    let mut cells: Vec<usize> = lines.iter().flat_map(|l| l.cells()).filter(|&(i, j)| free(g, i, j)).map(|(i, j)| key(i, j)).collect(); cells.sort(); cells.dedup();
    out.push(Cand { shape, lines, len: v as usize, cells });
}
// a maze and the same with one gap moved: the lengths between those the whole walls give
fn with_gaps(g: &Game, shape: &'static str, lines: &[Line], from: usize, out: &mut Vec<Cand>) {
    cand(g, shape, lines.to_vec(), out);
    for k in from..lines.len() { for x in lines[k].lo..=lines[k].hi { if x != lines[k].gap { let mut ls = lines.to_vec(); ls[k].gap = x; cand(g, shape, ls, out); } } }
}
fn upright(cols: &[i32]) -> Vec<Line> { cols.iter().map(|&c| Line { up: true, at: c, lo: 0, hi: ROWS - 1, gap: 0 }).collect() }

// every maze the generator builds on a level (the shapes above, and every gap moved by one), with the trail as it is
fn candidates<'a>(d: &'a Data, level: usize) -> (Game<'a>, usize, Vec<Cand>) {
    let g = Game::new(d, level, 1, &[]); let base = walk(&g, &[]).expect("a level with no way to the fruit").0;
    let mut cs: Vec<Cand> = Vec::new();
    let own = layout(d, level, true); let mut own_cols: Vec<i32> = own.iter().map(|w| w.0).collect(); own_cols.sort();
    cand(&g, "best", own.iter().map(|&(c, gap)| Line { up: true, at: c, lo: 0, hi: ROWS - 1, gap }).collect(), &mut cs);
    for cols in SERPENTINES {
        let n = cols.len(); let mut sorted = cols.to_vec(); sorted.sort();
        for k in 1..n {
            let mut a = upright(&cols[..k]); tune(&g, &mut a, 0); with_gaps(&g, "anthill", &a, 0, &mut cs);
            let mut f = upright(&cols[n - k..]); tune(&g, &mut f, 0); with_gaps(&g, "fruit", &f, 0, &mut cs);
        }
    }
    // every serpentine over the whole field with walls two or three columns apart, but the bot's own
    for mask in 1u32..(1 << (COLS - 3)) {
        let cols: Vec<i32> = (2..COLS - 1).rev().filter(|c| mask & (1 << (c - 2)) != 0).collect();
        if cols.len() < 4 || cols[0] < COLS - 4 || *cols.last().unwrap() > 4 || cols.windows(2).any(|w| w[0] - w[1] < 2 || w[0] - w[1] > 3) { continue; }
        let mut sorted = cols.clone(); sorted.sort(); if sorted == own_cols { continue; }
        let mut ls = upright(&cols); tune(&g, &mut ls, 0); cand(&g, "alt", ls, &mut cs);
    }
    for cols in WIDE { let mut ls = upright(cols); tune(&g, &mut ls, 0); with_gaps(&g, "wide", &ls, 0, &mut cs); }
    // walls along the field: a door in the last column but one sends the bugs to the top or to the bottom, and from
    // there every wall turns them back across the field
    let door = COLS - 2;
    for mask in 1u32..(1 << (ROWS - 2)) {
        let rows: Vec<i32> = (1..ROWS - 1).filter(|r| mask & (1 << (r - 1)) != 0).collect();
        if rows.windows(2).any(|w| w[1] - w[0] < 2) { continue; }
        for down in [true, false] {
            let mut ls = vec![Line { up: true, at: door, lo: 0, hi: ROWS - 1, gap: if down { 0 } else { ROWS - 1 } }];
            let order: Vec<i32> = if down { rows.clone() } else { rows.iter().rev().cloned().collect() };
            for (k, &r) in order.iter().enumerate() { ls.push(Line { up: false, at: r, lo: 0, hi: door - 1, gap: if k % 2 == 0 { 0 } else { door - 1 } }); }
            tune(&g, &mut ls, 1); with_gaps(&g, "rows", &ls, 1, &mut cs);
        }
    }
    (g, base, cs)
}

// The mazes a strategy (bot.rs, Policy) picks its own from: every maze of the generator (each set of wall cells
// once) and the trail as it is, each with what a player sees in it — NM numbers:
//   0 how much longer than the trail as it is (0) the trail is, against the longest maze of the pool (1)
//   1 the cells of its walls, over 40 (the dew they cost)
//   2 the best cell for a pepper: the most cells of the trail a plant of reach 1.5 sees from a cell off it, over 8
//   3 the same, the mean over the eight best cells
//   4 the turns of the trail over its length
//   5 1 for the smart bot's own maze
pub const NM: usize = 6;
pub fn pool(d: &Data, level: usize) -> Vec<(Vec<Wall>, [f64; NM])> {
    let (g, base, cs) = candidates(d, level);
    let max = cs.iter().map(|c| c.len).max().unwrap_or(base).max(base + 1);
    let mut seen: Vec<&Vec<usize>> = Vec::new(); let mut out = Vec::new();
    let empty = Vec::new();
    let mut all: Vec<(&'static str, Vec<Wall>, &Vec<usize>)> = vec![("", Vec::new(), &empty)];
    for c in &cs { if c.shape != "best" && seen.contains(&&c.cells) { continue; } seen.push(&c.cells); all.push((c.shape, c.lines.iter().map(|l| l.cells()).collect(), &c.cells)); }
    for (shape, walls, cells) in all {
        let mut grid = g.grid; for w in &walls { for &(i, j) in w { if free(&g, i, j) { grid[key(i, j)] = Cell::Rock; } } }
        let dist = dist_over(&grid, &g.tiles, g.fruit, -1); let tr = g.trail(&dist, 0); if *tr.last().unwrap() != g.fruit { continue; }
        let len = walk(&g, &walls).map_or(tr.len(), |x| x.0);
        let mut on = [false; N]; for &(i, j) in &tr { on[key(i, j)] = true; }
        let mut wraps: Vec<usize> = Vec::new();
        for i in 0..COLS { for j in 0..ROWS { if grid[key(i, j)] != Cell::Empty || on[key(i, j)] { continue; } wraps.push(tr.iter().filter(|&&(a, b)| within((a - i) as f64, (b - j) as f64, 1.5)).count()); } }
        wraps.sort_by(|a, b| b.cmp(a)); let top = &wraps[..wraps.len().min(8)];
        let turns = tr.windows(3).filter(|w| (w[1].0 - w[0].0, w[1].1 - w[0].1) != (w[2].0 - w[1].0, w[2].1 - w[1].1)).count();
        out.push((walls, [(len as f64 - base as f64) / (max - base) as f64, cells.len() as f64 / 40.0, *top.first().unwrap_or(&0) as f64 / 8.0,
            top.iter().sum::<usize>() as f64 / top.len().max(1) as f64 / 8.0, turns as f64 / tr.len() as f64, if shape == "best" { 1.0 } else { 0.0 }]));
    }
    out
}

pub fn routes(d: &Data, level: usize) -> Routes {
    let (g, base, cs) = candidates(d, level);
    // a wall the trail is no shorter without is dew spent on nothing: not a maze a player builds
    let idle = |c: &Cand| (0..c.lines.len()).any(|k| { let mut rest = c.lines.clone(); rest.remove(k); len_of(&g, &rest) >= c.len as i32 });
    // the longest maze with no such wall (looked for from the longest down), or the bot's own
    let mut by_len: Vec<&Cand> = cs.iter().collect(); by_len.sort_by(|a, b| b.len.cmp(&a.len));
    let max = by_len.iter().find(|c| c.shape == "best" || !idle(c)).map_or(base, |c| c.len).max(base); let span = (max - base) as f64;
    let tol = (span * 0.1).round().max(2.0);
    let home = |c: &Cand| { let off = |m: usize| (c.len as f64 - base as f64 - span * CLASSES[m].1).abs(); (0..CLASSES.len()).fold(0, |top, m| if off(m) < off(top) { m } else { top }) };
    let mut list = Vec::new();
    for (n, &(class, share)) in CLASSES.iter().enumerate() {
        let target = base as f64 + span * share; let mut taken: Vec<&Vec<usize>> = Vec::new();
        for shape in SHAPES {
            // the nearest to the class's length; of two as near, the one of fewer cells
            let off = |c: &Cand| (c.len as f64 - target).abs();
            let mut fit: Vec<&Cand> = cs.iter().filter(|c| c.shape == shape && c.len > base && off(c) <= tol).collect();
            // the bot's own maze goes as it is to the class it is nearest to, whatever its length
            if shape == "best" { fit = cs.iter().filter(|c| c.shape == shape && home(c) == n).collect(); }
            fit.sort_by(|a, b| off(a).partial_cmp(&off(b)).unwrap().then(a.cells.len().cmp(&b.cells.len())));
            let Some(c) = fit.into_iter().find(|c| !taken.contains(&&c.cells) && (shape == "best" || !idle(c))) else { continue };
            taken.push(&c.cells);
            let walls: Vec<Wall> = c.lines.iter().map(|l| l.cells()).collect(); let trail = walk(&g, &walls).unwrap().1;
            list.push(Route { class, shape: shape.to_string(), len: c.len, walls, trail });
        }
        // a length that came out in fewer than three shapes gets more mazes of the shapes there are, the ones least
        // like those taken (by the cells of their walls): "rows2" is another maze of walls along the field
        while taken.len() < 3 {
            let apart = |c: &Cand| taken.iter().map(|t| c.cells.iter().filter(|k| !t.contains(k)).count() + t.iter().filter(|k| !c.cells.contains(k)).count()).min().unwrap_or(usize::MAX);
            let mut fit: Vec<&Cand> = cs.iter().filter(|c| c.shape != "best" && c.len > base && (c.len as f64 - target).abs() <= tol && apart(c) >= 6).collect();
            fit.sort_by(|a, b| apart(b).cmp(&apart(a)).then((a.len as f64 - target).abs().partial_cmp(&(b.len as f64 - target).abs()).unwrap()));
            let Some(c) = fit.into_iter().take(40).find(|c| !idle(c)) else { break };
            taken.push(&c.cells);
            let n = 1 + list.iter().filter(|r: &&Route| r.class == class && r.shape.trim_end_matches(char::is_numeric) == c.shape).count();
            let walls: Vec<Wall> = c.lines.iter().map(|l| l.cells()).collect(); let trail = walk(&g, &walls).unwrap().1;
            list.push(Route { class, shape: format!("{}{}", c.shape, n), len: c.len, walls, trail });
        }
    }
    Routes { base, max, list }
}
