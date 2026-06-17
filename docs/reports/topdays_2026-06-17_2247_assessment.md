# Mosslings — Ruthless First-Outsider Audit

**Date:** 2026-06-17 22:47 (local)
**Auditor stance:** principal engineer + skeptical external reviewer. Code first, docs second. Nothing trusted until the source supported it.
**Basis:** working tree at `main` (post sprint/opus-8 merge `6cdc633`). 7,300 LOC of dependency-free browser JS, 190 unit + 24 Playwright e2e.

> Method note: I read source directly (`menu-ui.js`, `game.js`, `ui.js`, `style.css`, `daily-ghost.js`, tests, `index.html`). Where I assert behavior I cite the file. Where I extrapolate I write **(inference)**.

---

## 1. Gameplay systems lens

### Findings
- The core loop is genuinely real and fun-shaped: assign skills → rescue ≥ par → chase three independent medals (Rescue/Efficiency/Speed) → retry. Medals are evaluated by `computeMedals` (`js/utils.js`) and persisted per-level — this is honest progression, not a vanity number.
- Difficulty *ordering* is deliberate: the unit test `late-campaign ordering now ramps world 2 and 3 more steadily` pins the intended ramp, and failure diagnosis (`diagnoseFailure`, athlete-gate naming) is a real readability investment most puzzle clones never make.
- **The loop stalls at the menu, not in-level.** Once a level is open the game is tight. The pull to "one more level" depends on the menu making the next action irresistible — and until very recently the menu was a dashboard (last sprint added the Continue hero + Beat-the-Ghost; both help).
- The daily challenge is real (`dailyChallengeForDate`, deterministic UTC selection) and now has a Beat-the-Ghost race surface, but the "race" is still an **end-of-run comparison**, not a live phantom. The ghost data exists; the *felt* race does not.
- Where it gets hardest (world 3: switches, ferries, gauntlet) is where it most risks getting *unclear* — and clarity work (overlays, hints) is render-only and good, but unproven on small screens **(inference)**.

### MUST FIX
- Make the next action unmissable for a returning player on day 2 — the menu must *pull*, not *report*.

### NICE TO HAVE
- A live ghost phantom during daily play (infra is deterministic and already present).
- World-specific mechanical identity beyond theme labels.

### Immediate next step
- Stage the daily/ghost loop so it arrives *when it can land* (after world 1), not buried in a first-clear data dump.

---

## 2. UI / interaction architecture lens

### Findings
- **The single biggest UX defect in the repo: onboarding is binary.** `style.css:393-397` hides `#world-menu`, `#menu-secondary-actions`, `#btn-editor`, `#btn-gallery`, and `.controls-disc` *only* while `#start-screen.first-run`. The first-run flag is `unlocked === 0` (`menu-ui.js:302`). So the instant Level 1 is cleared, the **entire** surface — carousel, daily, editor, gallery, controls — appears in one frame. That is a content dump at the exact moment a new player decides whether to stay.
- The carousel itself is good now (dominant selected world, subdued locked worlds, compressed mastery, keyboard/touch/wheel nav). But `renderWorldMenu` builds **every** world card on every render (`menu-ui.js:329-331` loops `0..worldCount()` and sets `root.innerHTML`). At 3 worlds this is free. **At 100+ worlds this rebuilds and re-binds the whole strip on every selection** — the navigation model does not scale as the prompt's own ambition ("100+ worlds") demands.
- Progressive disclosure exists *within* a world (mastery is collapsed) but not *across the journey* (features). It discloses detail but not capability.
- Phone ergonomics are plausibly OK (flex-wrap secondary actions, a 1252px media query) but **the menu is not modular** — it's one `start-screen` div with sibling blocks toggled by CSS, not composable sections with their own visibility logic. Scaling the reveal logic means more `.first-run #x { display:none }` rules, which is a dead-end pattern.

### MUST FIX
- Replace the binary first-run gate with **staged feature unlocks** driven by progression (and tenure), each revealed with a light "new" affordance.
- Stop rendering all world cards eagerly; window the carousel so render cost is O(visible), not O(worlds).

### NICE TO HAVE
- Real-device pass for HUD/icon legibility at phone DPI.

### Immediate next step
- Introduce a single source of truth for "which menu surfaces are unlocked," computed from progression + tenure, and drive visibility from it instead of `.first-run` CSS.

---

## 3. Code architecture / refactorability lens

### Findings
- Recent extraction work is real and good: `menu-ui.js`, `result-ui.js`, `storage.js` (just split out of `game.js`), `daily-ghost.js`. The `ui` object is genuinely split across files now.
- **`game.js` (1,188 lines) and `ui.js` (865 lines) remain the gravity wells.** They're smaller than before but still where new features will pile up. `ui.js` mixes init/bindings, editor, pointer input, sharing, toasts, and ~22 menu delegation wrappers.
- **Lingering dual-naming debt:** `ui.js:436-443` still exposes legacy `chapter*` aliases (`chapterMeta`, `chapterMasteryRowHtml`, `renderChapterReward`) alongside the `world*` API, and `result-ui.js` calls the `chapter*` names. Two vocabularies for one concept is a tax on every future reader.
- State ownership is mostly clear (sim state on `Game`, persistence on `storage`, menu state on `MenuUI`), but boot order is load-order-fragile by design (script tags, no modules) — adding `storage.js` already required threading it between `daily-ghost.js` and `game.js` in three places (`index.html`, test harness, comment).
- Testability is good where logic is pure (the new `dailyCardModel`, `wheelNavIntent`, mastery helpers). It's poor where logic is tangled into DOM-rebuild methods (`renderWorldMenu`, `buildMenu`).

### MUST FIX
- Decide the menu vocabulary (`world`) and schedule removal of the `chapter*` aliases; every alias kept is a future bug.

### NICE TO HAVE
- Continue carving `ui.js`: editor and pointer-input are the next clean extractions.

### Immediate next step
- When touching the menu next (this sprint), extract menu *feature-gating* into a pure, tested module rather than adding more branches to `buildMenu`.

---

## 4. Determinism / simulation integrity lens

### Findings
- **This is the repo's standout strength, and it holds up under inspection.** `Math.random` appears only in `terrain.js` (decorative canvas fill — `terrain.js:42-243`); there is none in `game.js` or `mossling.js`. Mossling visual variation derives from `id` (test: `mossling frame derives deterministically from id`).
- The update loop is disciplined: `simStep` counts sim steps, input is logged against `simStep`, rewind reconstructs from the action log, and side effects (streaks, audio, haptics) are explicitly gated out of `update()` (`game.js:116-135` comments + tests `haptics never fires during deterministic replay catch-up`, `rewind restores muted side effects after a replay catch-up throw`).
- Replay/ghost correctness is fingerprint-guarded (`levelFingerprint`, `REPLAY_FORMAT_VERSION`) and tests reject mismatched/garbage payloads.

### MUST FIX
- Nothing urgent. Keep the guardrails.

### NICE TO HAVE
- A one-line "determinism contract" doc enumerating what may **not** enter `update()` — the rules live in test names and comments today.

### Immediate next step
- Before building a *live* ghost race, write the test that two parallel sims (player + ghost) cannot cross-mutate, *then* build it.

> Note: the new onboarding tenure logic (time-since-first-play) is menu-only and must **never** touch `update()`. That boundary is the one thing this sprint must not violate.

---

## 5. Growth / retention / product lens

### Findings
- Ingredients of retention exist: daily, medals, local streaks, ghost replays, share cards, editor. But **the strongest *real* return loop today is the daily**, and it only became compelling last sprint.
- **Onboarding actively harms retention.** The binary reveal means a brand-new player's second screen is maximally dense. Behavioral reality: novelty must be *paced* — features introduced after the player has a reason to value them retain better than features dumped up front. Ghost/daily mean nothing to someone who hasn't finished world 1; the editor means nothing to someone who hasn't felt the levels.
- There is no tenure model at all — the repo cannot distinguish a day-1 player from a 3-week veteran, so it cannot reward returning over time.
- Closest descriptor: **sticky emerging puzzle game** — past "polished toy," not yet "service." The daily is the seed of a service; nothing else returns the player tomorrow on its own.

### MUST FIX
- Pace feature introduction: daily/ghost after world 1, editor on tenure/depth — so each unlock is a small reward, not noise.

### NICE TO HAVE
- A "you've been away" / streak-continuation nudge that uses the new tenure data.

### Immediate next step
- Add a first-play timestamp and a progression-stage model; gate menu surfaces on it.

---

## 6. UGC / trust lens

### Findings
- The editor is a real asset, not fluff, and the repo is honest about validation: `analyzeSolvability` is documented and tested as a *heuristic* ("no obvious dead-end" ≠ "proven solvable"), and trust copy distinguishes verified vs heuristic (`UGC trust display rules use exactly one prioritized primary badge`).
- The risk: a brand-new player handed the editor on day 1 (current binary reveal) is the worst-case trust scenario — they can't judge a level's quality and may import/build a broken one as their formative impression.
- **Gating the editor behind tenure/depth is therefore also a trust improvement**, not just an onboarding one.

### MUST FIX
- Do not expose the editor until the player has internalized what a *good* level feels like.

### NICE TO HAVE
- Creator-side metadata (author, validation status) on shared levels.

### Immediate next step
- Fold editor-gating into the onboarding stage model.

---

## 7. Performance / browser runtime lens

### Findings
- Dependency-free, canvas-based, fixed-timestep — fundamentally sound for desktop.
- **Procedural audio/music is the elegant-but-expensive center.** `music.js` (519 lines) + `audio.js` synthesize a per-theme score on the AudioContext clock. This is impressive and probably fine on desktop, but procedural audio is consistently the first thing to stutter on weak Android **(inference — unverified on real hardware)**.
- The carousel's eager full-rebuild (`renderWorldMenu`) is cheap at 3 worlds but is a latent perf cliff at scale (see lens 2).
- No real-device measurement exists anywhere in the repo. "Fine on desktop" is asserted, not proven, for mobile.

### MUST FIX
- Nothing breaks today. The perf debt is *latent* (scale + mobile), not active.

### NICE TO HAVE
- A lightweight frame-time/long-session probe behind a debug flag.

### Immediate next step
- This sprint: make the carousel render cost bounded so the scale cliff never arrives.

---

## 8. QA / test strategy lens

### Findings
- Genuinely strong for this class of project: 190 unit + 24 e2e, and the e2e is a *real* Chromium against the shipped static site (no build), already migrated off the old `.lvl-btn`/`#level-select-container` selectors to the world-carousel contract.
- Pure logic is well-tested (`dailyCardModel`, `wheelNavIntent`, mastery helpers, determinism). DOM-rebuild methods are tested only through e2e, which is appropriate.
- **Blind spots:** (a) no test asserts onboarding *pacing* — only the two endpoints (first-run hidden / post-clear visible); the middle of the journey is untested because it doesn't exist yet. (b) No portrait-phone assertion on feature visibility. (c) Tenure/time logic has no test because there's no tenure logic.
- The suite does not currently anchor the repo to the wrong structure — it was just re-contracted. Good moment to extend it as the menu evolves.

### MUST FIX
- When staged onboarding lands, test the *stages*, not just the two endpoints.

### NICE TO HAVE
- Portrait-viewport e2e for each onboarding stage.

### Immediate next step
- Make stage-gating a pure function so it can be unit-tested across the whole progression curve.

---

# Final synthesis

## 1. Overall repo verdict
**Strong foundation with a scaling-and-onboarding problem.** The simulation core, determinism, and test posture are genuinely excellent — better than most indie puzzle repos. But the product surface lags the engine: onboarding is binary, the menu's render model won't scale to its own stated ambition, and two files still hoard responsibility. This is a sticky *emerging* puzzle game whose biggest risks are now product/UX and scale, not correctness.

## 2. Top 10 risks
1. **Binary onboarding** — the second screen is maximally dense exactly when retention is decided.
2. **Menu render model doesn't scale** — `renderWorldMenu` rebuilds all world cards every interaction.
3. **`game.js`/`ui.js` gravity wells** — future features keep landing in the two biggest files.
4. **No tenure model** — the repo can't tell a new player from a veteran, so it can't pace or reward.
5. **Daily "race" is not a felt race** — strongest loop is still end-of-run comparison.
6. **Editor exposed too early** — worst-case UGC trust scenario for day-1 players.
7. **Unverified mobile/perf** — procedural audio + canvas, no real-device data.
8. **Dual `world`/`chapter` vocabulary** — lingering alias debt across `ui.js`/`result-ui.js`.
9. **Load-order fragility** — script-tag boot order is a growing manual constraint.
10. **Pacing untested** — tests cover endpoints, not the journey, so onboarding regressions would be invisible.

## 3. Top 10 opportunities
1. **Staged onboarding** — pace features (daily@world2, editor@tenure) for a real journey.
2. **Windowed carousel** — bound render cost; unlock the 100-world ambition honestly.
3. **Tenure model** — first-play timestamp opens streak nudges and time-gated rewards.
4. **Live ghost race** — convert latent determinism into the felt return loop.
5. **Menu modularization** — composable, individually-testable menu sections.
6. **Editor-as-reward** — gating it improves both onboarding and trust at once.
7. **Phone-first validation** — portrait e2e per stage closes the biggest QA gap.
8. **Vocabulary cleanup** — retire `chapter*` aliases.
9. **Continue carving `ui.js`** — editor/pointer-input extraction.
10. **Determinism contract doc** — make the invisible rule explicit before the live race.

## 4. MUST FIX now
1. Replace binary reveal with a **progression + tenure stage model** (pure, tested).
2. Make the menu **modular and phone-first**, with each surface gated by the stage model.
3. **Bound carousel render cost** so scale never becomes a cliff.

## 5. NICE TO HAVE later
1. Live ghost phantom race.
2. Retire `chapter*` aliases.
3. Real-device perf probe.
4. Creator metadata on shared levels.

## 6. Immediate next step
Add a first-play timestamp and a single pure `menuStage()` function that maps `{unlocked, daysSinceFirstPlay, customLevels}` → which surfaces are visible — and drive the menu from it instead of `.first-run` CSS.

## 7. If you had to cut ruthlessly
- **Stop building:** new ornamental systems (more audio/icon ambition) until onboarding and scale are fixed.
- **Postpone:** the live ghost race until the stage model and a parallel-sim determinism test exist.
- **Simplify:** the binary `.first-run` CSS gate → one data-driven stage model.
- **Refactor immediately:** menu visibility ownership (out of CSS, into a tested module) and the eager carousel render.

## 8. 30-day priority stack
1. **Week 1:** tenure timestamp + pure `menuStage()` + unit tests across the curve.
2. **Week 1–2:** drive menu visibility from the stage model; stage the daily (world 2) and editor (tenure/depth) reveals with light "new" affordances; modularize menu sections.
3. **Week 2:** windowed carousel render; portrait e2e per stage.
4. **Week 3:** retire `chapter*` aliases; extract editor from `ui.js`.
5. **Week 4:** parallel-sim determinism test → begin live ghost race.

## 9. One blunt conclusion
**The engine is ready for a product the menu can't yet deliver.** You have spent your best engineering on determinism and the simulation — correctly — but the thing that decides whether anyone *stays* is the first 90 seconds after Level 1, and right now those 90 seconds are a wall of buttons. Fix the journey before you build another system.
