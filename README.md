# MOSSLINGS 🌿

A Lemmings-inspired puzzle platformer for the browser. The moss folk march
mindlessly off cliffs and into lava — assign them skills and guide enough of
them to the portal before time runs out.

**Zero dependencies, zero build step, zero assets.** Open `index.html` in any
browser (or serve the folder statically). All graphics are drawn procedurally
on canvas; all audio — including the generative ambient score — is synthesized
with Web Audio. Plays with mouse **or** touch, on desktop **or** phone.

## Play

| Input | Action |
|---|---|
| `1`–`8` | Select a skill |
| Click / **tap** | Assign the selected skill to the highlighted mossling (works while paused) |
| Right-click / `Esc` | Deselect skill |
| `F` | Fast-forward (4×) |
| `+` / `−` | Spawn rate up / down |
| `N` ×2 | Nuke — detonate every mossling (ends a stuck level) |
| `Backspace` / `Ctrl`+`Z` | Rewind 5 seconds (deterministic) |
| `Space` / `P` | Pause |
| `R` | Restart level |
| `T` | Toggle the tutorial card |
| `M` | Mute |
| `D` | Debug overlay (FPS, terrain probe, state census) |

**Touch & mobile:** input is unified through Pointer Events — tap a mossling to
assign (with a wider assist radius for fingers). The HUD and toolbar reflow for
phones, and the board is bounded by the viewport height so the toolbar is never
pushed off-screen. Best played in landscape.

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
js/music.js       generative ambient score (per-theme pad/bass/melody)
js/particles.js   particle engine + ambient spore drift
js/terrain.js     per-pixel collision mask + layered canvas rendering
js/mossling.js    creature state machine + procedural animated sprite
js/levels.js      the 9 campaign maps (geometry derived from movement math)
js/game.js        engine: fixed-timestep loop, skills, HUD, juice, effects
js/ui.js          DOM bindings, menu, overlays, level editor, pointer input
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
- **Presentation is quarantined from the sim.** Music, the "juice" layer
  (screen flash, freeze-frame hit-stop, save-streak chime, exit glow), creature
  blink and lava embers are render-loop or audio-clock state only — emitted from
  `draw()`, never `update()`. The hard rule: no `Math.random` or wall-clock ever
  feeds back into simulation *state*. The only `Math.random` reachable from
  `update()` is the cosmetic particle *burst* fired when a creature explodes or
  dies; it writes nothing the sim reads and is silenced entirely during rewind
  catch-up, so the deterministic 60Hz sim and Backspace rewind replay exactly
  (proven by the rewind + determinism tests).

## Tests

```
node tests/run-tests.js
```

53 tests, no test framework needed. The suite loads the real game scripts
into Node with stubbed canvas/DOM and covers:

1. **Terrain semantics** — destructibility rules, world-edge walls, one-way
   membranes (probe-direction aware, indestructible, never a floor)
2. **Every skill's physics** — walking, step-up limits, fatal falls, floating,
   blocking, digging, bashing (incl. metal stop + floor preservation), mining
   slope, building, climbing/cresting, exploding, saving, lava
3. **Level-integrity invariants for all 9 maps** — spawn drop survivable,
   spawn/exit in open air, exit on a walkable surface, sane metadata
4. **End-to-end scripted solves** — a builder bridges Level 1's gap; the
   one-way gate on Level 9 holds the colony off the cliff and a basher tunnels
   the pillar to rescue the target count
5. **Deterministic sim & rewind** — identical input → identical state; rewind
   reconstructs an exact earlier state from the action log
6. **Presentation isolation** — generative music degrades gracefully with no
   AudioContext and stays in tune; the save streak is deterministic; hit-stop
   and flash never advance or stall a sim step

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

## Enjoyability pass

Layered on top of the mechanically-complete base, all preserving the
determinism invariant (presentation lives outside `update()`):

- **Generative ambient music** (`js/music.js`) — a per-theme score (detuned pad
  drone, soft bass pulse, sparse pentatonic melody) scheduled on the audio
  clock; tension rises as the timer runs low. Covered by the shared mute.
- **Game feel** — full-screen impact flash + freeze-frame hit-stop on
  explosions, landing dust, contact shadows, an exit that swells on each
  rescue, a save-streak chime, and animated win/lose overlays.
- **Touch & responsive** — Pointer-Events input with finger-friendly targeting;
  HUD/toolbar reflow for phones; the board can never overflow the viewport.
- **Onboarding** — dismissible/auto-hiding tutorial card, portrait rotate hint.
- **New level** — "One-Way Out" introduces the one-way membrane to the campaign.

## Ideas for later

More campaign worlds · shareable custom-level codes (live) · per-level par
times (live) · level-complete confetti · a colourblind-friendly palette toggle.
