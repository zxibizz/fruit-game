// What the balance must hold, read off the results of a plan. Each finding: { level, rule, severity, text }.
// fail: the balance is broken; warn: on the edge or the bot unsure; info: worth a look.
import { BUGS } from '../public/data.js';
import { show } from './margin.mjs';
const med = (a) => { const s = [...a].sort((x, y) => x - y); return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : null; };
const fmt = (r) => (r.won ? `W ${r.hp}/${r.maxHp}` : `L w${r.wave}`);
export const SOFT = [7, 9]; // levels (1-based) where the most perks of their time may still carry a lazy garden through
export const PLACE = .12; // how much of the fruit (or of the level, when lost) a plant must be worth where it has its place
export const LEAK = .75; // a lazy garden on the first levels lets the first bug through by this share of the waves
export const ROUTE = ['straight', 'min', 'mid', 'above', 'max']; // the lengths of the trail, shortest first (sim/src/routes.rs)
export const SHAPE = .5; // mazes of one length may differ by this much of the scale (a fruit left whole to a level lost at once: 2)
export const PAYS = 1.05; // a shorter trail may hold bugs this much healthier than a longer one before it is a finding (margins)
export const WINDS = 1.25; // mazes of one length may differ this much in the health of the bugs they hold (margins)
export const IDLE = 400; // dew left at the end of a level with nothing more to buy: a couple of upgrades at most

export function check(results, { soft = SOFT } = {}) {
  const out = [], by = new Map();
  for (const r of results) { if (!by.has(r.level)) by.set(r.level, []); by.get(r.level).push(r); }
  for (const [n, rs] of [...by].sort((a, b) => a[0] - b[0])) {
    const L = n + 1, add = (rule, severity, text) => out.push({ level: L, rule, severity, text });
    const g = (group) => rs.filter((r) => r.group === group), one = (name) => rs.find((r) => r.name === name);
    const smart = g('smart'); if (!smart.length) continue;
    const sm = med(smart.map((r) => r.res.score));
    // the smart bot wins, and not on the edge; the same everywhere (else the bot, not the level, decides)
    const lost = smart.filter((r) => !r.res.won);
    if (lost.length) add('smart wins', lost.length * 2 >= smart.length ? 'fail' : 'warn', `${lost.length}/${smart.length} lost: ${lost.map((r) => `${r.name} ${fmt(r.res)}`).join(', ')}`);
    else if (sm < .2) add('smart margin', 'warn', `median ${Math.round(sm * 100)}% of the fruit left`);
    const spread = Math.max(...smart.map((r) => r.res.score)) - Math.min(...smart.map((r) => r.res.score));
    if (spread > .6) add('bot steady', 'warn', `smart runs differ by ${spread.toFixed(2)}: ${smart.map((r) => `${r.name} ${fmt(r.res)}`).join(', ')}`);
    // every boss dies: a boss that only the fruit's health outlasts is a loss for a player with less of it
    for (const r of smart) if (r.res.bossBites) add('bosses die', r.waveSeed == null ? 'fail' : 'warn', `${r.name}: ${r.res.bossBites} boss(es) reached the fruit (${Object.entries(r.res.byKind).filter(([k]) => BUGS[k.replace('*', '')]?.boss).map(([k, d]) => `${k} −${d}`).join(', ')})`);
    // no idle dew: a garden grown to the full with dew still piling up means the level pays more than it can use
    const idle = smart.filter((r) => r.waveSeed == null && r.res.won && r.res.spare != null && r.res.plants > 0 && r.res.maxed >= r.res.plants * .95);
    if (idle.length && med(idle.map((r) => r.res.spare)) > IDLE) add('no idle dew', 'fail', `the garden is grown to the full and ${Math.round(med(idle.map((r) => r.res.spare)))} dew is left (${idle.map((r) => r.res.spare).join(', ')})`);
    // one wave doing most of the damage: a spike
    for (const r of smart) if (r.res.biteCount - r.res.bossBites >= 4 && r.res.worstShare > .6) add('no spikes', 'warn', `${r.name}: wave ${r.res.worstWave} took ${Math.round(r.res.worstShare * 100)}% of the ${r.res.bites} fruit health lost (${Object.entries(r.res.byKind).map(([k, c]) => `${k} −${c}`).join(', ')})`);
    // the best lazy garden must lose
    const ex = g('exploit').sort((a, b) => b.res.score - a.res.score);
    // all the dew of the level at once is more than any player has: a win there is a warning, not a break
    if (ex.length && ex[0].res.won) add('exploits lose', 'warn', `${ex.filter((r) => r.res.won).map((r) => `${r.name} ${fmt(r.res)}`).join(', ')}`);
    for (const r of g('lazy')) {
      // every perk at once is a replay after the whole game; the soft levels may give in to the most perks of their time
      if (r.res.won) add('lazy loses', r.opts.meta === 'full' || (soft.includes(L) && r.opts.meta === 'exp3') ? 'warn' : 'fail', `${r.name} ${fmt(r.res)}`);
      else if (L <= 3 && r.res.firstBite > r.res.waves * LEAK) add('lazy leaks early', 'warn', `${r.name}: first bite at wave ${r.res.firstBite}/${r.res.waves}`);
    }
    // a skill taken away must not help; alternatives that beat the bot's own way are worth knowing
    for (const r of g('skill')) {
      const alt = ['eager powers', 'grow first', 'spread'].includes(r.name), d = r.res.score - sm;
      if (!alt && d > .1) add('skills pay', d > .3 ? 'fail' : 'warn', `${r.name} ${fmt(r.res)} beats smart (median ${sm.toFixed(2)})`);
      if (alt && d > .15) add('bot could do better', 'info', `${r.name} ${fmt(r.res)} beats smart`);
    }
    // the players the levels are for (plans.mjs PLAYERS; the median over the mazes each plays on): the ordinary one
    // wins with one or two stars, the expert (the strategy of balance/strategy.json, or the smart bot without it) with three, the novice loses, but not before the last
    // third of the waves
    const stars = (res) => (!res.won ? 0 : res.hp >= res.maxHp * .8 ? 3 : res.hp >= res.maxHp * .4 ? 2 : 1), told = (list) => list.map((r) => `${r.shape || r.name} ${fmt(r.res)}`).join(', ');
    const ord = g('player').filter((r) => r.who === 'ordinary'), nov = g('player').filter((r) => r.who === 'novice');
    if (ord.length) { const st = med(ord.map((r) => stars(r.res)));
      if (st < 1) add('players', 'warn', `the ordinary player loses on most of its mazes: ${told(ord)}`);
      else if (st > 2) add('players', 'warn', `the ordinary player takes three stars: ${told(ord)}`); }
    if (nov.length) { const st = med(nov.map((r) => stars(r.res))), lost = nov.filter((r) => !r.res.won);
      if (st >= 1) add('players', 'warn', `the novice wins on most of its mazes: ${told(nov)}`);
      else if (med(lost.map((r) => r.res.wave / r.res.waves)) < 2 / 3) add('players', 'warn', `the novice is out before the last third of the waves: ${told(nov)}`); }
    const expert = g('expert').length ? g('expert') : smart;
    if (g('player').length && med(expert.map((r) => stars(r.res))) < 3) add('players', 'warn', `the expert takes fewer than three stars: ${expert.map((r) => `${r.name} ${fmt(r.res)}`).join(', ')}`);
    // the strategy found must not play worse than the smart bot it grew from
    if (g('expert').length) { const xm = med(g('expert').map((r) => r.res.score)); if (xm < sm - .1) add('expert beats smart', 'warn', `the expert's median ${xm.toFixed(2)}, the smart bot's ${sm.toFixed(2)}: ${told(g('expert'))}`); }
    // more perks, a longer route: never worse (beyond noise)
    const chain = (names, rule) => { const xs = names.map((x) => (x === 'smart' ? { name: 'smart', res: { score: sm, won: sm > 0, hp: '', maxHp: '', wave: '' } } : one(x))).filter(Boolean);
      for (let k = 1; k < xs.length; k++) if (xs[k - 1].res.score > xs[k].res.score + .2) add(rule, 'warn', `${xs[k - 1].name} (${xs[k - 1].res.score.toFixed(2)}) > ${xs[k].name} (${xs[k].res.score.toFixed(2)})`); };
    chain(['meta none', 'meta exp1', 'smart', 'meta full'], 'perks pay');
    // the route, by the length of the trail and by its shape (the median over the shapes speaks for a length): a longer
    // trail is never worse; mazes of one length do about as well however they wind; the longest wins in every shape
    const route = ROUTE.map((c) => ({ c, rs: g('route').filter((r) => r.cls === c) })).filter((x) => x.rs.length).map((x) => ({ ...x, m: med(x.rs.map((r) => r.res.score)), len: [...new Set(x.rs.map((r) => r.len))].sort((a, b) => a - b) }));
    const cells = (x) => (x.len.length > 1 ? `${x.len[0]}–${x.len.at(-1)}` : x.len[0]), list = (x) => x.rs.map((r) => `${r.shape || r.cls} ${fmt(r.res)}`).join(', ');
    // with the margins looked for (run.mjs routes, --margin), the same is read off them: how much healthier the bugs
    // may be before a maze stops winning is a number with no cliff in it, where a win or a loss on a level tuned to
    // its edge flips with every small thing
    const byMargin = route.length > 0 && route.every((x) => x.rs.every((r) => r.margin));
    if (byMargin) {
      const pc = (v) => `${Math.round(v * 100)}%`, ms = (x) => x.rs.map((r) => r.margin.at), mm = (x) => med(ms(x)), names = (x) => x.rs.map((r) => `${r.shape || r.cls} ${show(r.margin)}`).join(', ');
      for (let k = 1; k < route.length; k++) if (mm(route[k - 1]) > mm(route[k]) * PAYS) add('longer route pays', 'warn', `${route[k - 1].c} (${cells(route[k - 1])} cells) holds bugs of ${pc(mm(route[k - 1]))}, ${route[k].c} (${cells(route[k])} cells) of ${pc(mm(route[k]))}: ${names(route[k - 1])} | ${names(route[k])}`);
      for (const x of route) {
        const weak = x.rs.filter((r) => r.margin.at < 1);
        if (x.c === 'max' && weak.length) add('the longest route wins', 'warn', `${weak.length}/${x.rs.length} mazes of ${cells(x)} cells hold less than the bugs as they are: ${names(x)}`);
        if (Math.max(...ms(x)) > Math.min(...ms(x)) * WINDS) add('the shape of the route', x.c === 'max' ? 'warn' : 'info', `${x.c} (${cells(x)} cells): ${names(x)}`);
        const shaky = x.rs.filter((r) => !r.margin.steady); if (shaky.length) add('route margin unsteady', 'info', `${x.c}: ${shaky.map((r) => `${r.shape || r.cls} ${show(r.margin)} (wins at ${r.margin.lo}, loses at ${r.margin.hi}, and not so a step further)`).join(', ')}`);
      }
      // what the trail is worth: the health of the bugs a maze holds, from the straight trail to the longest, and per ten cells
      const a = route[0], b = route.at(-1), la = med(a.rs.map((r) => r.len)), lb = med(b.rs.map((r) => r.len));
      add('route margin', 'info', `${route.map((x) => `${x.c} ${pc(mm(x))}${x.rs.length > 1 ? ` (${pc(Math.min(...ms(x)))}–${pc(Math.max(...ms(x)))})` : ''}`).join(', ')}${lb > la ? `; ten cells of trail are worth ${((mm(b) / mm(a) - 1) / (lb - la) * 1000).toFixed(1)}% of the bugs' health` : ''}`);
    }
    for (let k = 1; !byMargin && k < route.length; k++) if (route[k - 1].m > route[k].m + .2) add('longer route pays', 'warn', `${route[k - 1].c} (${cells(route[k - 1])} cells, median ${route[k - 1].m.toFixed(2)}) > ${route[k].c} (${cells(route[k])} cells, ${route[k].m.toFixed(2)}): ${list(route[k - 1])} | ${list(route[k])}`);
    for (const x of byMargin ? [] : route) {
      const ss = x.rs.map((r) => r.res.score), lost = x.rs.filter((r) => !r.res.won);
      if (x.c === 'max' && lost.length) add('the longest route wins', 'warn', `${lost.length}/${x.rs.length} mazes of ${cells(x)} cells lost: ${list(x)}`);
      else if (Math.max(...ss) - Math.min(...ss) > SHAPE) add('the shape of the route', x.c === 'max' ? 'warn' : 'info', `${x.c} (${cells(x)} cells): ${list(x)}`);
    }
    if (route.length && !byMargin) { const from = route.findIndex((_, k) => route.slice(k).every((x) => x.rs.every((r) => r.res.won)));
      add('route', 'info', `${from < 0 ? 'no length wins in every shape' : `wins in every shape from ${route[from].c} (${cells(route[from])} cells)`}: ${route.map((x) => `${x.c} ${x.rs.filter((r) => r.res.won).length}/${x.rs.length}`).join(', ')}`); }
    // a plant whose loss helps: misused by the bot, or not worth its dew
    for (const r of g('plant')) if (r.res.score > sm + .15) add('every plant helps', 'info', `${r.name} ${fmt(r.res)} beats smart`);
  }
  // every plant has a place: over the levels that have it, the smart bot plants it on most of them, and without it
  // some level goes clearly worse (PLACE below the bot's median) while hardly any goes better; read only off a plan
  // that plays without each plant (full) on three levels or more
  const kinds = new Map();
  for (const [n, rs] of by) {
    const smart = rs.filter((r) => r.group === 'smart'); if (!smart.length) continue;
    const sm = med(smart.map((r) => r.res.score)), base = smart.find((r) => r.waveSeed == null) || smart[0];
    for (const r of rs.filter((q) => q.group === 'plant')) { const k = r.name.replace(/^no /, ''); if (!kinds.has(k)) kinds.set(k, []);
      kinds.get(k).push({ level: n + 1, drop: sm - r.res.score, used: base.res.kinds?.[k] || 0 }); }
  }
  for (const [k, ls] of kinds) {
    if (ls.length < 3) continue;
    const used = ls.filter((x) => x.used > 0), worse = ls.filter((x) => x.drop >= PLACE), better = ls.filter((x) => x.drop <= -PLACE);
    const text = `${k}: planted on ${used.length}/${ls.length} levels (${ls.map((x) => `L${x.level} ×${x.used}`).join(', ')}); without it worse on ${worse.map((x) => `L${x.level}`).join(', ') || 'none'}, better on ${better.map((x) => `L${x.level}`).join(', ') || 'none'}`;
    const bad = used.length * 2 < ls.length || !worse.length || better.length > worse.length;
    out.push({ level: ls[0].level, rule: 'every plant has a place', severity: bad ? 'fail' : 'info', text });
  }
  return out;
}

// The margins of a level side by side (run.mjs routes, --margin): the health of the bugs, against what it is now, that
// the smart bot holds (the median over its seeds), the expert (balance/strategy.json), the best lazy garden with the perks of its time, the novice
// and the ordinary player (the median over their mazes), and the trail at every length (the median
// over its shapes, and the least and the most). Rows: [{ level, smart, lazy, route: { straight: { m, lo, hi, n }, ... } }].
export function marginTable(results) {
  const by = new Map(); for (const r of results) if (r.margin) { if (!by.has(r.level)) by.set(r.level, []); by.get(r.level).push(r); }
  return [...by].sort((a, b) => a[0] - b[0]).map(([n, rs]) => {
    const at = (list) => list.map((r) => r.margin.at), g = (group) => rs.filter((r) => r.group === group);
    const route = {}; for (const c of ROUTE) { const xs = at(g('route').filter((r) => r.cls === c)); if (xs.length) route[c] = { m: med(xs), lo: Math.min(...xs), hi: Math.max(...xs), n: xs.length }; }
    const lazy = g('lazy').filter((r) => r.opts.meta !== 'full'); // every perk at once is a replay after the whole game, not a lazy player of the level's time
    const who = (w) => med(at(g('player').filter((r) => r.who === w)));
    return { level: n + 1, smart: med(at(g('smart'))), expert: med(at(g('expert'))), lazy: lazy.length ? Math.max(...at(lazy)) : null, novice: who('novice'), ordinary: who('ordinary'), route };
  });
}
