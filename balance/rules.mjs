// What the balance must hold, read off the results of a plan. Each finding: { level, rule, severity, text }.
// fail: the balance is broken; warn: on the edge or the bot unsure; info: worth a look.
import { BUGS } from '../public/data.js';
const med = (a) => { const s = [...a].sort((x, y) => x - y); return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : null; };
const fmt = (r) => (r.won ? `W ${r.hp}/${r.maxHp}` : `L w${r.wave}`);
export const SOFT = [7, 9]; // levels (1-based) where the most perks of their time may still carry a lazy garden through
export const PLACE = .12; // how much of the fruit (or of the level, when lost) a plant must be worth where it has its place
export const LEAK = .75; // a lazy garden on the first levels lets the first bug through by this share of the waves
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
    // more perks, a longer route: never worse (beyond noise)
    const chain = (names, rule) => { const xs = names.map((x) => (x === 'smart' ? { name: 'smart', res: { score: sm, won: sm > 0, hp: '', maxHp: '', wave: '' } } : one(x))).filter(Boolean);
      for (let k = 1; k < xs.length; k++) if (xs[k - 1].res.score > xs[k].res.score + .2) add(rule, 'warn', `${xs[k - 1].name} (${xs[k - 1].res.score.toFixed(2)}) > ${xs[k].name} (${xs[k].res.score.toFixed(2)})`); };
    chain(['meta none', 'meta exp1', 'smart', 'meta full'], 'perks pay');
    chain(['route 0.25', 'route 0.5', 'route 0.75', 'smart'], 'longer route pays');
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
