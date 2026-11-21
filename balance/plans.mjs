// Plans: the scenarios to run for each level. A scenario: { level, name, group, opts, waveSeed?, set? }.
// Groups (what the rules read): smart — the bot playing well with the perks expected by this level, on several game
// seeds and on other draws of the waves; lazy — gardens beside the untouched trail with real dew and every perk, planted
// four ways (they must lose); exploit — the same with all the dew of the level at once,
// an upper bound no player reaches (only a warning when it wins); skill — the smart bot with one skill taken away (it must do worse); meta — the
// smart bot with fewer or more perks (more must not be worse); route — a part of the maze only; plant — the smart bot
// without one kind of plant (a plant whose loss helps is misused or useless).
import { LEVELS } from '../public/data.js';

const SMART = { route: 1, place: 'best', upgrades: 'greedy', meta: 'exp2', terrain: true, powers: true, early: true, repair: true };
const smart = (o = {}) => ({ ...SMART, ...o });
// a lazy garden as strong as it can be: every perk, and all the dew the level gives (bugs, waves, early calls) in hand from
// the first wave — more than any player ever has at once, but not more than the level holds
const EXPLOIT = { route: 0, bank: 'level', meta: 'full' }; // every perk at once: a replay after the whole game

function forLevel(n, kind) {
  const out = [], add = (group, name, opts, extra = {}) => out.push({ level: n, group, name, opts, ...extra });
  for (const seed of kind === 'quick' ? [7, 8] : [7, 8, 9]) add('smart', `smart s${seed}`, smart({ seed }));
  if (kind !== 'quick') for (const ws of [1, 2, 3]) add('smart', `smart waves${ws}`, smart(), { waveSeed: ws });
  for (const place of ['best', 'end', 'start', 'spread'])
    for (const upgrades of kind === 'quick' ? ['greedy'] : ['greedy', 'first']) add('exploit', `exploit ${place}${upgrades === 'first' ? ' grow' : ''}`, { ...EXPLOIT, place, upgrades });
  // what a player without a maze really has: the dew as it comes, and the most perks there can be by this level (three
  // stars on every level before it), planted any way
  for (const place of ['best', 'end', 'start', 'spread']) add('lazy', `lazy ${place}`, { route: 0, meta: 'exp3', place });
  if (kind === 'quick') return out;
  add('lazy', 'lazy usual perks', { route: 0, meta: 'exp2' });
  add('lazy', 'lazy every perk', { route: 0, meta: 'full' }); // a replay after the whole game: a warning only
  add('skill', 'half', smart({ maxPlants: 30 })); // half a garden: must do worse than a full one
  for (const r of [.25, .5, .75]) add('route', `route ${r}`, smart({ route: r }));
  for (const m of ['none', 'exp1', 'full']) add('meta', `meta ${m}`, smart({ meta: m }));
  add('skill', 'blind', smart({ terrain: false }));
  add('skill', 'no powers', smart({ powers: false }));
  add('skill', 'eager powers', smart({ powers: 'eager' }));
  add('skill', 'no early', smart({ early: false }));
  add('skill', 'no repair', smart({ repair: false }));
  add('skill', 'no upgrades', smart({ upgrades: 'none' }));
  add('skill', 'grow first', smart({ upgrades: 'first' }));
  add('skill', 'spread', smart({ place: 'spread' }));
  for (const k of LEVELS[n].plants) if (k !== 'pumpkin') add('plant', `no ${k}`, smart({ plants: `no:${k}` }));
  return out;
}
export function plan(kind, levels) {
  if (!['quick', 'full'].includes(kind)) throw new Error(`plan: quick | full, not ${kind}`);
  return levels.flatMap((n) => forLevel(n, kind));
}
