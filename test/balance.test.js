import test from 'node:test';
import assert from 'node:assert/strict';
import { margins, show, LO, HI, STEP } from '../balance/margin.mjs';

// The margin of a scenario (balance/margin.mjs) is found by halving between a health of the bugs it wins at and one
// it loses at. Here the parties are made up: a garden that wins up to a known health and loses above it.
test('the margin of a scenario: found to a step, bounded at the far ends, marked when the outcome jumps about', async () => {
  let played = 0;
  const edge = (at, flip = () => false) => ({ task: { opts: { at, flip } }, won: at >= 1 });
  const playAll = async (ts) => ts.map((t) => { played++; const won = t.opts.hp <= t.opts.at; return { won: t.opts.flip(t.opts.hp) ? !won : won }; });
  const items = [edge(1.17), edge(.83), edge(3), edge(.2), edge(1.3, (hp) => hp > 1.36 && hp < 1.45)];
  const [a, b, far, near, shaky] = await margins(items, playAll);
  for (const [m, at] of [[a, 1.17], [b, .83]]) { assert.ok(m.lo <= at && at < m.hi && m.hi / m.lo <= STEP, `${at}: between ${m.lo} and ${m.hi}`); assert.equal(m.bound, null); assert.equal(m.steady, true); }
  assert.deepEqual([far.bound, far.at, show(far)], ['above', HI, '≥200%']);
  assert.deepEqual([near.bound, near.at, show(near)], ['below', LO, '≤50%']);
  assert.equal(shaky.steady, false, 'a win above the edge'); assert.match(show(shaky), /~$/);
  assert.match(show(a), /^11[5-9]%$/);
  assert.ok(played <= items.length * 8, `${played} parties for ${items.length} scenarios`);
});
