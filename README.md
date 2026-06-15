# MOSSLINGS 🌿

A Lemmings-inspired puzzle platformer for the browser. The moss folk march
mindlessly off cliffs and into lava — assign them skills and guide enough of
them to the portal before time runs out.

**Zero dependencies, zero build step, zero assets.** Open `index.html` in any
browser (or serve the folder statically). All graphics are drawn procedurally
on canvas; all audio is synthesized with Web Audio.

## Play

| Input | Action |
|---|---|
| `1`–`8` | Select a skill |
| Click | Assign the selected skill to the highlighted mossling (works while paused) |
| Right-click / `Esc` | Deselect skill |
| `F` | Fast-forward (4×) |
| `+` / `−` | Spawn rate up / down |
| `N` ×2 | Nuke — detonate every mossling (ends a stuck level) |
| `Space` / `P` | Pause |
| `R` | Restart level |
| `M` | Mute |
| `D` | Debug overlay (FPS, terrain probe, state census) |

**Skills:** Blocker · Builder (12 rising bricks) · Basher (horizontal tunnel) ·
Miner (1:1 diagonal stairway) · Digger (vertical shaft) · Floater (permanent
umbrella) · Climber (permanent) · Exploder (5s fuse — also the only way to
free a Blocker). Floater + Climber on one mossling makes an *athlete* —
required for the final level.

## Architecture

Plain `<script>` tags in dependency order (no ES modules, so `file://`
double-click play keeps working — a deliberate trade-off for a zero-install
browser game):

```
js/constants.js   shared enums + PHYS tuning table (single source of truth)
js/audio.js       synthesized SFX, master gain, AudioContext-clock scheduling
js/particles.js   particle engine + ambient spore drift
js/terrain.js     per-pixel collision mask + layered canvas rendering
js/mossling.js    creature state machine + procedural animated sprite
js/levels.js      the 8 campaign maps (geometry derived from movement math)
js/game.js        engine: fixed-timestep loop, skills, HUD, effects
js/ui.js          DOM bindings, menu, message overlays, level editor, bootstrap
```

Design principles:

- **Collision is authoritative in a `Uint8Array` mask**; the pretty canvas
  layers are derived from it and can never desync from physics.
- **Fixed 60Hz timestep with an accumulator** — simulation speed is identical
  on 60/120/144Hz displays. Fast-forward just runs extra sim steps per frame.
- **Carving tools are stride-exact.** Bashers/miners/diggers remove rectangles
  sized to their movement step and never cut below the supporting surface, so
  a digger can't fall through its own hole and a basher can't destroy the
  bridge it stands on.
- **Levels are math, not vibes.** Builders rise 1px per 5px run × 12 bricks;
  the fatal-fall limit is 130px; miners descend 1:1. Every required drop in
  `js/levels.js` is derived from those numbers and asserted in CI-style tests.

## Tests

```
node tests/run-tests.js
```

28 tests, no test framework needed. The suite loads the real game scripts
into Node with stubbed canvas/DOM and covers:

1. **Terrain semantics** — destructibility rules, world-edge walls
2. **Every skill's physics** — walking, step-up limits, fatal falls, floating,
   blocking, digging, bashing (incl. metal stop + floor preservation), mining
   slope, building, climbing/cresting, exploding, saving, lava
3. **Level-integrity invariants for all 8 maps** — spawn drop survivable,
   spawn/exit in open air, exit on a walkable surface, sane metadata
4. **End-to-end scripted solve of Level 1** — a builder assigned at the gap
   edge carries a mossling all the way to the exit

## Level editor

Built in: paint dirt/metal/lava, erase, place spawn & exit, save to
`localStorage`. Custom levels get a full skill loadout. Progress and per-level
best-save percentages are also stored locally.

## Notable fixes vs. the original prototype

- Characters referenced a `sprites.png` that didn't exist → invisible game.
  Replaced with procedural animated sprites (blinking, squash & stretch,
  per-skill poses).
- Level 1's spawn drop (100px) exceeded the old fatal-fall limit (90px):
  every mossling died on arrival. All 8 maps rebuilt and verified.
- Diggers/miners fell through their own oversized carve holes after one swing
  and silently stopped; bashers ate 4px of floor (and any bridge) they crossed.
- Simulation was tied to `requestAnimationFrame` rate (2.4× speed on 144Hz).
- Added the genre-essential controls: fast-forward, spawn-rate ±, nuke,
  hover-targeting with state labels, assign-while-paused.

## Ideas for later

Ambient music loop · more campaign worlds · shareable custom-level codes ·
touch controls for mobile · per-level par times.
