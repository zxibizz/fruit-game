// The margin of a scenario: how many times healthier every bug may be before the garden stops winning. 1.15: it
// still wins against bugs 15% healthier than they are; 0.9: it loses now and would win against bugs 10% weaker. A
// win or a loss on the data as it is says on which side of the edge a scenario stands; the margin says how far from
// it, in the unit the levels are tuned in. Looked for by halving between a scale it wins at and one it loses at
// (LO..HI, to STEP), every scenario of a round in one go; then one more party a little below and one a little above
// (PROBE): a loss below the edge or a win above it means the outcome jumps about there, and the margin is unsteady.
export const LO = .5, HI = 2, STEP = 1.05, PROBE = 1.08;
const LOW = LO, HIGH = HI;
const r3 = (x) => Math.round(x * 1000) / 1000;
// items: [{ task, won }] (won: on the data as it is); playAll(tasks) → [res | null] plays tasks with opts.hp.
// Gives for each { at, lo, hi, bound: 'above' | 'below' | null, steady } or null (a party gave no result).
// lo, hi: the far ends looked at (a scenario that wins at hi is said to hold hi or more)
export async function margins(items, playAll, { lo: LO = LOW, hi: HI = HIGH } = {}) {
  const st = items.map(({ won }) => (won ? { lo: 1, hi: null } : { lo: null, hi: 1 }));
  const round = async (pick, take) => {
    const ask = []; st.forEach((s, k) => { if (s.broken) return; const hp = pick(s); if (hp != null) ask.push([k, hp]); });
    if (!ask.length) return false;
    const res = await playAll(ask.map(([k, hp]) => ({ ...items[k].task, opts: { ...items[k].task.opts, hp } })));
    ask.forEach(([k, hp], i) => { if (!res[i]) st[k].broken = true; else take(st[k], hp, res[i].won); });
    return true;
  };
  // the far ends: a win at HI or a loss at LO is all that is asked of it
  await round((s) => (s.lo == null ? LO : HI), (s, hp, won) => { if (won) { s.lo = hp; if (hp === HI) s.bound = 'above'; } else { s.hi = hp; if (hp === LO) s.bound = 'below'; } });
  while (await round((s) => (!s.bound && s.hi / s.lo > STEP ? r3(Math.sqrt(s.lo * s.hi)) : null), (s, hp, won) => { if (won) s.lo = hp; else s.hi = hp; }));
  st.forEach((s) => { s.steady = true; });
  await round((s) => (s.bound ? null : r3(s.lo / PROBE)), (s, hp, won) => { if (!won) s.steady = false; });
  await round((s) => (s.bound ? null : r3(s.hi * PROBE)), (s, hp, won) => { if (won) s.steady = false; });
  return st.map((s) => (s.broken ? null : { at: s.bound === 'above' ? HI : s.bound === 'below' ? LO : r3(Math.sqrt(s.lo * s.hi)), lo: s.lo, hi: s.hi, bound: s.bound || null, steady: s.steady }));
}
// as it is printed: 115%, ≥200%, ≤50%; ~ after an unsteady one
export const show = (m) => (!m ? '?' : m.bound === 'above' ? `≥${Math.round(m.at * 100)}%` : m.bound === 'below' ? `≤${Math.round(m.at * 100)}%` : `${Math.round(m.at * 100)}%${m.steady ? '' : '~'}`);
