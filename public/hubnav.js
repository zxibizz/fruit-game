// The phone's "back" (the gesture or the button) inside a game, the same in every game of the hub:
//   in the game          → the game's pause menu, the game is not lost;
//   in the pause menu    → nothing (leave by its buttons);
//   on the game's home   → the hub (the page before this one);
//   in the hub           → never back into a game; and "forward" leads nowhere.
// The game only says whether it is "inside" (playing or paused — anywhere but its home screen) and what "back" does
// there (pause):   initNav({ inside: () => mode !== 'home', back: () => pause() });   its hub button calls toHub().
// step() — optional, called after every history step that stayed in the page (a game that keeps something in the
// address puts it right there: each entry has its own address).
//
// How: while the game is inside, extra history entries ("traps", up to two) lie on top of the page's own. Back takes
// one away, the page stays, and popstate tells us. When the game goes home the traps are taken off (history.go), so
// that back on the home screen leaves the page. A forward step onto a trap the game is no longer in is undone.
// - Browsers skip, on back, entries a page added without the player's say (their guard against pages that trap the
//   back button). Chromium: a page that adds an entry without a user activation gets ALL its entries skipped — back
//   then goes straight to the page before, the hub; and after a back step it wants a new activation before another
//   entry. WebKit: an entry added more than 10 s after the last activation is skipped together with the one before
//   it. So traps are added only on the browser's own word that the player has just acted (navigator.userActivation)
//   and only after a real tap since the last history step (a click event — the end of a swipe or some keys are
//   not an activation everywhere). One tap is enough for both traps. In play: the first back pauses, the second does
//   nothing; a third in a row, with no tap between, does leave the paused game for the hub — no page can prevent
//   that. Any tap (the pause menu's own buttons) puts the traps back.
// - The game's state is looked at on a timer, not at the game's calls: the game needs no change beyond the two
//   functions above. A trap added a moment after the tap that started the game still counts as the player's.
// - The page of a game is never a place to come back to: the hub is the only page before it and nothing is after.
//   So when the page is shown by a history step while the hub was the page on the screen (`hub.here` in the tab's
//   storage: the hub sets it when shown, a game clears it when loaded), it was "forward" out of the hub: the page,
//   which hid itself when it was left, steps straight back.
const TRAP = 'hubnav', MAX = 2;
const HUB = typeof location === 'undefined' ? null : new URL('..', location.href);
export const IN_HUB = !!HUB && HUB.pathname !== new URL('.', location.href).pathname;
const FROM_KEY = typeof location === 'undefined' ? '' : 'hubnav.from:' + location.pathname;
const ss = {
  get(k) { try { return sessionStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { sessionStorage.setItem(k, v); } catch { /* */ } },
};
const root = () => document.documentElement;

let inside = () => false, back = () => {}, step = () => {};
let armed = false;       // the player tapped (a click) since the last history step
let ours = 0;            // when a history step of ours was asked for (0 — none on its way): no second one meanwhile
let depth = 0;           // the traps under the current entry, as last seen
const depthNow = () => (history.state && history.state[TRAP]) | 0;
const pending = () => ours && performance.now() - ours < 1500;

// the browser's own word that the player has just acted (where it does not tell, the tap we saw has to do)
const active = () => { const ua = navigator.userActivation; return ua ? ua.isActive : true; };

function sync() {
  if (pending()) return;
  ours = 0;
  let d = depthNow();
  const is = !!inside();
  if (is && d < MAX && armed && active()) {
    try { while (d < MAX) history.pushState({ [TRAP]: ++d }, ''); } catch { /* */ }
    depth = depthNow();
  } else if (!is && d > 0) {
    ours = performance.now();
    history.go(-d);
  }
}

// forward out of the hub into this page: no (see the top)
function bounced(byHistory) {
  if (!IN_HUB || !byHistory || ss.get('hub.here') !== '1') return false;
  root().style.visibility = 'hidden';
  history.back();
  setTimeout(() => { if (document.visibilityState === 'visible') root().style.visibility = ''; }, 1500);   // nowhere to step back to
  return true;
}

export function initNav(game = {}) {
  if (game.inside) inside = game.inside;
  if (game.back) back = game.back;
  if (game.step) step = game.step;
  if (typeof history === 'undefined' || !history.pushState) return;
  depth = depthNow();
  addEventListener('popstate', () => {
    const was = depth, mine = pending();
    depth = depthNow(); ours = 0; armed = false;
    if (depth > was) { if (!inside()) sync(); }   // forward onto a trap: fine in the game, undone at home
    else if (!mine && inside()) back();           // the player's back: pause (in the pause menu it changes nothing)
    step();
  });
  addEventListener('click', (e) => { if (e.isTrusted) { armed = true; sync(); } }, true);   // (Enter on a button is a click too)
  setInterval(sync, 150);
  addEventListener('pagehide', () => { if (IN_HUB) root().style.visibility = 'hidden'; });
  addEventListener('pageshow', (e) => { if (!bounced(e.persisted)) root().style.visibility = ''; });

  const nav = performance.getEntriesByType && performance.getEntriesByType('navigation')[0];
  const type = nav ? nav.type : 'navigate';
  if (type === 'back_forward') { bounced(true); return; }
  if (!IN_HUB) return;
  ss.set('hub.here', '0');   // a game is on the screen now
  // Was the hub the page before this one? (For the hub button.) A reload and the page replacing itself (a new
  // language) keep the answer; any other way in decides it anew.
  try {
    const ref = document.referrer ? new URL(document.referrer) : null, same = ref && ref.origin === location.origin;
    if (type === 'navigate' && !(same && ref.pathname === location.pathname)) ss.set(FROM_KEY, same && ref.pathname === HUB.pathname ? '1' : '0');
  } catch { /* */ }
}

// The game's button to the hub: steps back when the hub is the page before this one (then the hub has nothing
// "before" it to fall back into), otherwise puts the hub's page in place of this one.
export function toHub() {
  if (!IN_HUB) return;
  if (pending()) { setTimeout(toHub, 150); return; }   // a step of ours is on its way: after it
  const d = depthNow(), go = () => location.replace(HUB.href);
  if (ss.get(FROM_KEY) !== '1' || history.length < d + 2) { go(); return; }
  ours = performance.now();
  history.go(-(d + 1));
  const t = setTimeout(() => { if (document.visibilityState === 'visible') go(); }, 2500);   // the step led nowhere
  addEventListener('pagehide', () => clearTimeout(t), { once: true });
}
