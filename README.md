# MOSSLINGS 🌿

A Lemmings-inspired puzzle platformer for the browser. The moss folk march
mindlessly off cliffs and into lava — assign them skills and guide enough of
them to the portal before time runs out.

**Zero runtime dependencies, zero build step.** Open `index.html` in any browser
(or serve the folder statically). All graphics are drawn procedurally on canvas
and all audio — including the generative ambient score — is synthesized with Web
Audio; the only bundled assets are one local pixel font (`assets/fonts/`) and an
Open Graph share card (`assets/og-card.svg`, rasterized to `og-card.png`). The
shipped game pulls in nothing — the `devDependencies` in `package.json`
(Playwright) are for the browser smoke tests / CI only. Plays with mouse **or**
touch, on desktop **or** phone.

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
| `C` | Toggle the CRT scanline/vignette effect (also on the menu) |
| `D` | Debug overlay (FPS, terrain probe, state census) |

**Touch & mobile:** input is unified through Pointer Events — tap a mossling to
assign (with a wider assist radius for fingers). The HUD and toolbar reflow for
phones, and the board is bounded by the viewport height so the toolbar is never
pushed off-screen. Best played in landscape.

**Daily Challenge:** once Level 1 is cleared, the menu shows a UTC daily puzzle.
It is deterministic and static-hostable (`?daily=YYYY-MM-DD`), with a local best
stored per date. There is no hosted leaderboard.

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
js/icons.js       inline pixel-SVG glyphs for the toolbar/HUD (no emoji fonts)
js/audio.js       synthesized SFX, master gain, AudioContext-clock scheduling
js/music.js       generative ambient score (per-theme pad/bass/melody)
js/particles.js   particle engine + ambient spore drift
js/terrain.js     per-pixel collision mask + layered canvas rendering
js/mossling.js    creature state machine + procedural animated sprite
js/levels.js      the 9 campaign maps (geometry derived from movement math)
js/daily.js       deterministic UTC daily challenge selection + scoring helper
js/result-card.js result overlay snippets + deterministic PNG share-card export
js/overlays.js    render-only readability overlays (danger probe + hints)
js/game.js        engine: fixed-timestep loop, skills, HUD, juice, effects
js/ui.js          DOM bindings, menu, overlays, level editor, pointer input
js/utils.js       level (de)serialization for sharing + pure medal logic
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
node tests/run-tests.js          # 121 unit tests, no framework (stubbed DOM)
npm install && npm run test:e2e  # 17 Playwright browser smoke tests (dev-only)
```

The unit suite (121 tests, no test framework needed) loads the real game scripts
into Node with stubbed canvas/DOM. A separate **Playwright** smoke suite
(`tests/e2e/`) drives a real Chromium against the static site to catch
boot/layout regressions (e.g. level-select card overflow) and is gated in CI
before deploy. The unit suite covers:

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
7. **Muting & progressive disclosure** — a muted score never builds a bus or
   spins up its scheduler (no wasted CPU into a silent bus), and unmuting
   restarts it cleanly; advanced HUD controls are gated for the first two
   campaign levels
8. **Daily challenge determinism** — UTC daily keys map to one campaign level,
   malformed dates fail closed, local bests keep the stronger run, and daily
   clears do not unlock campaign progress
9. **Result share card** — run summaries, text share copy, medal SVG parsing,
   and the 1200×630 deterministic PNG card renderer are covered without adding
   an image dependency
10. **Readability assist overlay** — danger probes flag fatal cliffs/lava,
   suppress false alarms for floaters, and prove the rendering helper does not
   mutate deterministic sim state
11. **Readable mastery loop** — failure diagnosis, retry ghost hints,
   full-skill intent previews, local win-streak momentum, and missing-medal
   target prompts are guarded as render/UI systems that do not mutate
   simulation state
12. **Shared-level import robustness** — `deserializeLevel` is fuzzed with
   thousands of random/truncated/oversized payloads and must always return
   `null` or a well-formed level — never throw

## Level editor

Built in: paint dirt/metal/lava, erase, place spawn & exit, save to
`localStorage`. Custom levels get a full skill loadout. Progress and per-level
best-save percentages are also stored locally. Saving runs the same structural
check shared levels pass on import, so the editor can't persist an unsolvable
level (e.g. spawn over a pit or an exit in mid-air) — it explains what's wrong
instead.

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
- **Readability assist** (`js/overlays.js`) — walkers get render-only danger
  pips before lava, fatal cliffs, and hard turns, plus a chunky ground-edge
  caution marker planted on the cliff lip so the warning reads at phone size.
  The probe is throttled (recomputed a few times a second, animated every frame)
  and never touches simulation, pathing, or replay determinism — guarded by a
  full-`draw()` determinism test.
- **CRT scanline/vignette** — a lightweight, **toggleable** (menu or `C` key,
  persisted) scanline/vignette pass that makes the procedural canvas art feel
  more cohesive while keeping the collision mask untouched.
- **Touch & responsive** — Pointer-Events input with finger-friendly targeting;
  HUD/toolbar reflow for phones; the board can never overflow the viewport.
- **Result artifact** — the result overlay draws a 1200×630 PNG share card from
  the run summary and existing medal SVG rectangles; browsers share it via Web
  Share, PNG clipboard, or a download fallback.
- **Readable mastery loop** — losses name the likely cause, Retry can mark the
  last failure zone, selected skills preview their intent on the target, and
  cleared level cards/result overlays expose the next missing medal target.
  Consecutive wins also build a local streak chip and best-streak memory.
- **Onboarding** — dismissible/auto-hiding tutorial card, portrait rotate hint.
- **New level** — "One-Way Out" introduces the one-way membrane to the campaign.

## Progressive disclosure

The toolbar is intentionally calm for a new player: on a brand-new save the menu
collapses to a single **Start Playing** button, and the **advanced HUD controls
(spawn-rate ± and Nuke) stay hidden until Level 3** — they return automatically
once Level 2 is cleared, and are always present on custom/shared/editor levels.
The keyboard shortcuts (`N`, `+`/`−`) keep working throughout, so power users
lose nothing.

## Known limitations

Honest gaps, not bugs — most need a human, not more code:

- **Music mix is unverified by ear.** The score is technically isolated and
  in-tune (and now never runs while muted), but it has not had a long-loop
  listening pass on real laptop/phone speakers. It may need simplifying.
- **Icon/glyph readability is unproven on real devices.** Tests check the icon
  map is *complete*, not that 16px glyphs are *distinguishable* on a phone.
- **No hosted leaderboard.** Progress, best-%, and daily bests are local-only.

### Real-device check (do before each release)

Browser emulation proves layout, not feel. Walk this list on actual hardware:

- [ ] **Phone landscape** — board fills the screen; toolbar fully visible; tutorial card does not cover the action.
- [ ] **Phone portrait** — rotate nudge appears; rotating into landscape clears it.
- [ ] **Touch assignment** — tapping a moving mossling assigns the right skill (no mis-taps, no double-tap zoom).
- [ ] **Laptop speakers** — music loop is pleasant over several minutes, not fatiguing.
- [ ] **Phone speakers** — mix is audible and balanced (no harsh highs / lost bass).
- [ ] **Safari (iOS) & Chrome (Android)** — audio starts after first tap; no console errors; fonts/glyphs render.

## Tooling

Free, build-free helpers (run from the repo root):

- `node tools/bump-version.js [label]` — bump every `?v=` cache-busting query in
  `index.html`/`style.css` in one shot (single source of truth, no missed tags).
- `node tools/render-og.js` — rasterize `assets/og-card.svg` → `og-card.png`
  (1200×630) using the Chromium that Playwright already installs.

## Ideas for later

More campaign worlds · level-complete confetti · a colourblind-friendly palette
toggle · ghost/replay export (the deterministic action log already supports it)
· extracting the editor code out of `ui.js` as it grows.
