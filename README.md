# Fruit Defense

A browser tower-defense game for the family: ants, beetles, caterpillars and flying bugs crawl along dug trenches
towards a fruit, and you stop them with five kinds of upgradable traps. Bugs always take the shortest way, so traps
placed on the trail send them the long way round (you can never block the way completely); big blue ants walk
over stones. Five super-bonuses charge up during the battle; crystals earned for finished levels buy freeze,
shield, armageddon or coins. Score per level: bugs, waves without bites, fruit life, coins left, ready bonuses.
Works in portrait and landscape (the field turns with the screen). No ads, works offline (PWA), Russian and English.

- `public/data.js` — traps, bugs, bonuses, shop, level maps and the wave generator.
- `public/game.js` — simulation (no DOM), plain JSON state: a level in progress is saved and restored.
- `public/art.js` — every picture is drawn by code (sprites, fruits, the board); `public/view.js` — drawing, input, HUD, menus.
- `server/` — Node 22, no dependencies: static files and `/healthz`.
- `node --test test/*.test.js` — maps, path blocking rules, economy, save/restore, server, offline cache list, and a bot
  that must win every level. `node test/bot.mjs [levels...]` prints how the bot did (fruit left, time, score).

When anything in `public/` changes, bump `VERSION` in both `public/game.js` and `public/sw.js`.
Release: tag `vX.Y.Z` → GitHub Actions builds `ghcr.io/zxibizz/fruit-game:X.Y.Z`.

See [CREDITS.md](CREDITS.md) for third-party assets.
