// Plans: the scenarios to run for each level. A scenario: { level, name, group, opts, waveSeed?, set? }.
// Groups (what the rules read): smart — the bot playing well with the perks expected by this level, on several game
// seeds and on other draws of the waves; lazy — gardens beside the untouched trail with real dew and every perk, planted
// four ways (they must lose); exploit — the same with all the dew of the level at once,
// an upper bound no player reaches (only a warning when it wins); skill — the smart bot with one skill taken away (it must do worse); meta — the
// smart bot with fewer or more perks (more must not be worse); route — the smart bot on mazes of every length of the
// trail (straight, min, mid, above, max), each length in every shape it can be built in (sim/src/routes.rs; drawn by
// balance/routes.mjs); plant — the smart bot without one kind of plant (a plant whose loss helps is misused or useless).
// player — players less than the smart bot (PLAYERS), each on every maze of the length such a player builds: the
// levels are tuned for the ordinary one; expert — the strategy of balance/strategy.json on several seeds and draws of
// the waves: the strongest play known that is not fitted to one map.
// The plans: quick, full, and routes (the smart bot, the routes and the players alone).
import { existsSync, readFileSync } from 'node:fs';
import { LEVELS } from '../public/data.js';
import { fixedMap, lazyFixed } from './scenario.mjs';

// The expert: the smart bot playing the strategy balance/strategy.mjs found (balance/strategy.json): where to put
// what, what to grow and which maze to build, weighed by what it sees. Without the file there is no expert group.
const STRATEGY = new URL('./strategy.json', import.meta.url);
export const EXPERT = existsSync(STRATEGY) ? JSON.parse(readFileSync(STRATEGY, 'utf8')).policy : null;

const SMART = { route: 1, place: 'best', upgrades: 'greedy', meta: 'exp2', terrain: true, powers: true, early: true };
const smart = (o = {}) => ({ ...SMART, ...o });
// a lazy garden as strong as it can be: every perk, and all the dew the level gives (bugs, waves, early calls) in hand from
// the first wave — more than any player ever has at once, but not more than the level holds
// Players as they are taken to play (a guess until parties of real players are looked at). novice: a short maze, the
// plants where they do most, grown before more are planted, the ground not looked at, no frost or
// rain, waves not called early, holes left to grow back, one star a level behind them. ordinary: half a maze, the
// plants where they do most (as the smart bot puts them), mud and nettles seen (they are the point of some levels:
// blind to them, the ordinary player did no better than a lazy garden on «Старый сад»), frost and rain at the first
// chance, waves not called early, two stars a level. (Plants put at random by the trail, as 'spread' does, made
// both lose to a lazy garden with no maze at all, and the shooters by the fruit alone ('end') put the novice out by
// the middle of every level: no player plays like that.)
// (0.27.0: the ordinary player plays the strategy of the expert, learnt on the plants of now, with the skills of an
// ordinary player taken off: the smart bot's own count could not keep up with the branches, and a lazy garden did as
// well as its mazes; the strategy builds the maze it sees most in, so the ordinary player has one maze, not a class)
export const PLAYERS = {
  novice: { cls: 'min', opts: { place: 'best', upgrades: 'first', meta: 'exp1', terrain: false, powers: false, early: false } },
  ordinary: { cls: 'own', opts: { place: 'best', upgrades: 'greedy', meta: 'exp2', terrain: true, powers: 'eager', early: false, ...(EXPERT ? { route: 1, policy: EXPERT } : {}) } },
};
const EXPLOIT = { route: 0, bank: 'level', meta: 'full' }; // every perk at once: a replay after the whole game

function forLevel(n, kind, routes) {
  const out = [], add = (group, name, opts, extra = {}) => out.push({ level: n, group, name, opts, ...extra });
  for (const seed of kind === 'quick' ? [7, 8] : [7, 8, 9]) add('smart', `smart s${seed}`, smart({ seed }));
  // the trail by its length and its shape: cls and len (cells) are what the rules and the report read
  const byRoute = () => { if (!routes) throw new Error(`plan ${kind}: the mazes of level ${n + 1} are not given`);
    add('route', 'route straight', smart({ route: 0 }), { cls: 'straight', shape: '', len: routes.base });
    for (const r of routes.routes) add('route', `route ${r.name}`, smart({ maze: r.name }), { cls: r.class, shape: r.shape, len: r.len }); };
  const fixed = fixedMap(n);
  const byPlayer = () => { for (const [who, p] of Object.entries(PLAYERS)) { if (fixed || p.cls === 'own') { add('player', `${who} ${fixed ? 'path' : 'own'}`, { ...p.opts, ...(fixed ? { route: 0 } : {}) }, { who, shape: fixed ? 'path' : 'own', len: 0 }); continue; } for (const r of routes.routes.filter((x) => x.class === p.cls && x.shape !== 'best')) add('player', `${who} ${r.name}`, { ...p.opts, maze: r.name }, { who, shape: r.shape, len: r.len }); } };
  if (EXPERT) { for (const seed of kind === 'quick' ? [7, 8] : [7, 8, 9]) add('expert', `expert s${seed}`, smart({ seed, policy: EXPERT }));
    if (kind !== 'quick') for (const ws of [1, 2, 3]) add('expert', `expert waves${ws}`, smart({ policy: EXPERT }), { waveSeed: ws }); }
  if (kind === 'routes') { byRoute(); byPlayer(); return out; }
  if (kind !== 'quick') for (const ws of [1, 2, 3]) add('smart', `smart waves${ws}`, smart(), { waveSeed: ws });
  for (const place of ['best', 'end', 'start', 'spread'])
    for (const upgrades of kind === 'quick' ? ['greedy'] : ['greedy', 'first']) add('exploit', `exploit ${place}${upgrades === 'first' ? ' grow' : ''}`, { ...EXPLOIT, place, upgrades });
  // what a player without a maze really has: the dew as it comes, and the most perks there can be by this level (three
  // stars on every level before it), planted any way
  if (fixed) for (const [name, o] of lazyFixed(n)) add('lazy', name, o);
  else for (const place of ['best', 'end', 'start', 'spread']) add('lazy', `lazy ${place}`, { route: 0, meta: 'exp3', place });
  if (kind === 'quick') return out;
  add('lazy', 'lazy usual perks', { route: 0, meta: 'exp2' });
  add('lazy', 'lazy every perk', { route: 0, meta: 'full' }); // a replay after the whole game: a warning only
  add('skill', 'half', smart({ maxPlants: 30 })); // half a garden: must do worse than a full one
  if (!fixed) byRoute(); byPlayer();
  for (const m of ['none', 'exp1', 'full']) add('meta', `meta ${m}`, smart({ meta: m }));
  add('skill', 'blind', smart({ terrain: false }));
  add('skill', 'no powers', smart({ powers: false }));
  add('skill', 'eager powers', smart({ powers: 'eager' }));
  add('skill', 'no early', smart({ early: false }));
  add('skill', 'no upgrades', smart({ upgrades: 'none' }));
  add('skill', 'grow first', smart({ upgrades: 'first' }));
  add('skill', 'spread', smart({ place: 'spread' }));
  for (const k of LEVELS[n].plants) if (k !== 'pumpkin') add('plant', `no ${k}`, smart({ plants: `no:${k}` }));
  return out;
}
// routes: what sim/js/play.mjs routes() gives for these levels (not needed for quick)
export function plan(kind, levels, routes = []) {
  if (!['quick', 'full', 'routes'].includes(kind)) throw new Error(`plan: quick | full | routes, not ${kind}`);
  return levels.flatMap((n) => forLevel(n, kind, routes.find((r) => r.level === n)));
}
