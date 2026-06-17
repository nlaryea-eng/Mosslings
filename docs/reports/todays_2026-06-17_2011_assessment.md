# Mosslings Ruthless Repository Assessment

Generated: 2026-06-17 20:11 Europe/Berlin

Audit stance: implementation first, README and existing reports after. I treated existing documentation as untrusted until the code supported it.

Verification run:

- `npm test` passed: 175 unit tests, 0 failures.
- `npm run test:e2e` passed: 17 Chromium smoke tests, 0 failures.

Worktree note: `js/levels.js` was already modified and `docs/reports/2026-06-17_1953_assessment.md` was already untracked before this assessment. I did not modify either.

## Executive Assessment Summary

Mosslings is a strong technical prototype with real systems: fixed-step simulation, action-log replay, rewind, daily selection, custom level serialization, share cards, editor, procedural audio, mobile-aware CSS, and a much better test suite than most browser puzzle prototypes. Those are real.

The uncomfortable truth is that the repo has built a lot of product-shaped infrastructure before proving the player-shaped value. The code can replay a run, generate a result card, validate a custom level structurally, play music, show mastery medals, and render a polished campaign menu. It cannot yet prove that fresh players understand the puzzles, want another attempt, trust shared levels, or come back tomorrow for reasons stronger than local completion.

The biggest risk is false confidence. The tests are green, the systems are impressive, and the UI looks feature-rich, but several core product claims are thinner than they appear:

- The daily loop is a deterministic campaign-level picker plus local best tracking, not a social or competitive retention loop.
- The ghost/replay system is technically real, but mostly watch-only; it is not yet a strong learning, rivalry, or sharing mechanic.
- The UGC validator is correctly described in code as heuristic, but the share flow still risks implying more certainty than it has.
- The menu presents a game-service dashboard, while the actual product is a 21-level local browser puzzle game.
- The architecture is still dominated by `Game` and broad UI modules, so future systems will compound coupling unless boundaries are enforced soon.

Overall verdict: strong foundation with scaling problems. It is closer to an impressive prototype and product candidate than a polished indie game or sticky puzzle service.

## 1. Gameplay Systems Lens

### Findings

The core loop is real and legible at the code level: spawn mosslings, assign limited skills, edit terrain through skills, route enough survivors to the exit, rewind/replay when needed. `js/game.js`, `js/mossling.js`, `js/terrain.js`, and `js/levels.js` support a coherent Lemmings-like game rather than a fake UI shell.

The strongest gameplay asset is the fixed skill vocabulary. Builder, Digger, Basher, Blocker, Floater, Climber, Athlete, and Nuke create understandable verbs, and the terrain-mask approach makes the world physically responsive. The best levels are likely the ones that force a specific route idea with limited tools.

The campaign is currently 21 levels across forest, cave, and volcano themes. That is enough to show systems, but not enough to justify the weight of the mastery, world, reward, daily, replay, and share scaffolding around it. Progression currently feels more like a content stack and mechanics sampler than a fully authored journey.

The difficulty ramp is partial. Early levels introduce basics, one-way tiles appear around the middle, athlete gates and objects arrive later, and objects such as switches/ferries/bridges mostly appear in the final third. That sequencing is plausible, but the code does not prove that the levels become clearer as they become harder. Several later systems increase coordination load without a corresponding guarantee of readability.

Failure feedback is better than nothing but still mostly diagnostic, not instructional. Danger overlays and loss messages can show where things are going wrong, but the game does not yet deeply explain why the player's plan failed or what concept they should reconsider.

Replay and medals create a real mastery hook. However, the ghost/replay system currently looks more useful as proof that a run happened than as a tool that pulls players into one more attempt. A watch-only replay is weaker than an in-level ghost race, delta display, route comparison, or friend challenge.

The daily challenge loop is real in implementation but thin in product value. `js/daily.js` deterministically selects a campaign level by UTC date and stores local results. That is a daily prompt, not yet a sticky daily ritual.

Inference: the game is probably more impressive than fun right now. The systems demonstrate capability, but the repo does not contain enough evidence that fresh players experience the "aha, I can solve this" rhythm reliably.

### MUST FIX

- Prove the first-session fun loop with human play, not only scripted solves.
- Retune Levels 1-7 around player comprehension, not just mechanical introduction.
- Make failure feedback point to route decisions, not only death counts or danger zones.
- Make daily challenges feel intentionally authored or socially meaningful, not just recycled campaign selection.
- Make replay/ghost useful during mastery attempts, not just after the fact.

### NICE TO HAVE

- In-level personal-best ghost racing.
- Medal delta hints such as "one fewer builder" or "save one more".
- More authored world identity per chapter once the early loop is proven.
- Optional route preview or post-run route heatmap.

### Immediate next step

Run a no-new-features playability pass on Levels 1-7 and record where fresh players first stall, misread terrain, waste skills, or stop wanting another attempt.

## 2. UI / Interaction Architecture Lens

### Findings

The UI is ambitious and mostly functional. `index.html`, `style.css`, `js/ui.js`, `js/menu-ui.js`, and `js/result-ui.js` create start screens, campaign navigation, daily UI, editor panels, HUD, toolbar, result overlays, share flows, and gallery flows. This is not a bare canvas toy.

The HUD and toolbar are reasonably direct during play: survivor counts, timer, rate, selected skill, pause/rewind/restart, and a skill strip are visible. Touch confirmation in `js/game.js` is a good mobile-specific choice because skill assignment errors are expensive.

The menu model is the weak point. `js/menu-ui.js` uses world cards, medals, mastery chips, next targets, reward cards, level rails, and stat summaries. That makes the interface look complete, but it also makes it feel like a dashboard. The player-facing question should be "what should I play next?", not "how do I parse this status system?"

Scalability is questionable. The code can group worlds, but the model is built around a 7-level world size and detail panels. For 3 worlds and 21 levels it works. For 100+ worlds it becomes cognitively expensive unless navigation becomes a real journey map, search/filter system, or compact campaign browser.

Icon recognizability is partially handled through labels and titles, but many skill icons are custom pixel SVGs in `js/icons.js`. They are charming, but recognizability in real play is unproven. On mobile, small toolbar targets and dense result/menu panels are likely to be "fine on desktop" risks.

Accessibility is present but basic. CSS includes focus and reduced-motion handling, and the DOM uses real buttons in many places. But the game still relies heavily on color, tiny labels, canvas interpretation, custom icons, and dense visual hierarchy. There is no strong evidence of screen-reader or colorblind usability.

Progressive disclosure is inconsistent. First launch has a clear path, but the menu/result/editor surfaces expose many systems before the core journey has earned that complexity.

### MUST FIX

- Simplify the continue path so the UI helps the player resume, not inspect a dashboard.
- Test toolbar, icons, and touch assignment on actual phone-sized devices.
- Rework world navigation before adding many more worlds; the current detail model will not scale cleanly.
- Reduce result/menu density in the first session.

### NICE TO HAVE

- A campaign journey map with clear next-level focus.
- Better colorblind-safe state encoding.
- Optional expanded stats hidden behind deliberate player intent.
- More explicit skill icon training during early levels.

### Immediate next step

Prototype a simplified campaign screen whose default state has one obvious next action, then compare it against the current menu in a fresh-player session.

## 3. Code Architecture / Refactorability Lens

### Findings

The repo has some strong boundaries. `js/constants.js` centralizes gameplay constants, `js/terrain.js` owns terrain masks and drawing layers, `js/mossling.js` owns creature state, `js/storage.js` owns local persistence, and `js/utils.js` owns serialization, validation, medals, and helper logic. The no-build plain-JS setup also makes the app easy to run and inspect.

The dangerous center of gravity is `js/game.js`. It owns lifecycle, simulation, input targeting, replay, rewind, object updates, drawing, HUD decisions, audio side effects, particle side effects, onboarding state, and parts of persistence coordination. At roughly 1,250 lines, it has already become harder to reason about than the underlying game needs to be.

`js/ui.js` is the second gravity well. It binds most DOM controls, editor behavior, import/share flows, gallery behavior, save/load wiring, keyboard/pointer integration, and menu/result delegation. It is functional, but future features will keep landing there unless ownership is reduced.

Boot order and global coupling are real debt. Scripts are loaded directly in `index.html`, and modules communicate through globals such as `window.*`, `storage`, `ui`, and classes attached to the global scope. That is acceptable for a prototype, but it is not a strong long-term boundary.

`js/result-ui.js` attaches behavior via `Object.assign(ui, {...})`, which works but hides ownership. The codebase is not yet large enough to demand a framework, but it is large enough to need clearer boundaries between simulation, presentation, storage, and product flows.

The deterministic simulation is not isolated as a pure core. `Mossling.update()` and `Game.update()` call audio and particle hooks while changing simulation state. Tests show this works today, but the architecture depends on discipline rather than enforcement.

Naming is generally clear. The risk is not cryptic code; it is too much code with too many responsibilities in a few files.

### MUST FIX

- Establish a harder boundary around deterministic simulation state and side effects.
- Reduce `Game` as the owner of unrelated concerns before adding more systems.
- Reduce `ui.js` as the owner of editor, gallery, share, import, and navigation workflows.
- Add replay/version integrity data before campaign or physics changes accumulate.
- Harden rewind/replay side-effect silencing with `try/finally` style cleanup.

### NICE TO HAVE

- ES modules once the current globals become a clear daily cost.
- A small state/event interface between simulation and presentation.
- Separate editor controller from general UI binding.
- Separate replay service from `Game`.

### Immediate next step

Extract replay/rewind integrity and side-effect handling into a narrow service or helper before adding another gameplay system.

## 4. Determinism / Simulation Integrity Lens

### Findings

The determinism story is one of the repo's real strengths. The game uses a fixed timestep, action logs, replay mode, rewind by resetting and replaying actions, and tests that compare replay outcomes. This is meaningful engineering, not marketing.

However, the integrity boundary is softer than the feature deserves. Determinism is maintained by convention across mutable objects, global state, update order, and side-effect calls. Audio, particles, visual randomness, and UI state are not cleanly separated from update paths everywhere.

`js/terrain.js`, `js/particles.js`, `js/audio.js`, and drawing code use `Math.random()` for visual or sound variation. That does not appear to affect simulation state today, but it means visual replay fidelity is not guaranteed unless the same loaded visual buffers persist. For competitive or shareable replays, that difference matters less than physics, but it weakens any broad "deterministic replay" claim.

Replay serialization is useful but under-specified for long-term integrity. Campaign and daily replays are vulnerable to silent drift if the referenced level changes, physics constants change, or skill behavior changes. Custom replays can include level data, which is stronger. Campaign replays need a level fingerprint and app/schema version check.

Daily challenges are also drift-sensitive. If `LEVELS` changes, the same historical date may no longer map to the same experience unless the selected level identity and hash are preserved.

Mutation hazards exist around objects, mossling state, terrain, particles, and side-effect flags. `rewind()` silences audio/particles during replay, but cleanup needs to be exception-safe.

What currently benefits from determinism: tests, rewind, watch replay, local mastery, share cards, and future competitive loops. That is valuable enough to protect deliberately.

### MUST FIX

- Add level fingerprints and app/schema versions to replay records.
- Warn or refuse replay playback when the stored fingerprint does not match the current level.
- Make replay/rewind cleanup exception-safe.
- Keep future features from adding time-dependent or random simulation inputs without a seeded/recorded source.

### NICE TO HAVE

- Seeded visual randomness for perfectly repeatable replay presentation.
- Deterministic replay fixtures for every campaign level.
- A small "simulation input only" API that tests can enforce.

### Immediate next step

Add a level hash to saved replays and display a clear mismatch warning instead of silently replaying against changed content.

## 5. Growth / Retention / Product Lens

### Findings

The repo has retention-shaped mechanics: campaign progress, medals, daily challenges, streaks, local bests, replays, result cards, custom levels, and share links. Those are real systems in code.

The strongest retention loop that is actually real today is local mastery: finish a level, improve survivor count/time/skill usage, earn medals, and maybe replay. The daily loop is second, but much weaker because it is a local repeatable prompt rather than a social event or authored daily puzzle.

The share loop is visually better than its product value. Result cards and replay payloads can be shared, but there is no strong recipient loop, no leaderboard, no verified friend challenge contract, and no evidence that a player seeing a card knows why they should play.

The creator/share loop is promising but trust-limited. A custom level can be encoded and imported, but "someone made a level" is not sticky unless the recipient can trust that it is solvable and worth their time.

Reasons to return tomorrow are currently thin: daily local challenge, completion, and self-improvement. Reasons to share today are also thin: a result card, a replay, or a custom level. Those are starts, not yet retention engines.

The repo is not an emerging puzzle service yet. It has some service-shaped surfaces without service-grade trust, discovery, competition, or content operations.

Classification: strong foundation with scaling problems. It is also an impressive prototype. It is not yet a polished indie game, and not yet a sticky emerging product.

### MUST FIX

- Decide whether the next product bet is mastery, daily competition, or UGC, then make that loop genuinely valuable.
- Stop treating local daily selection as sufficient retention evidence.
- Make sharing produce a recipient experience, not just an artifact.
- Capture human evidence about why players return or stop.

### NICE TO HAVE

- Friend challenge links that open the exact same level/replay context.
- Lightweight leaderboards or local household boards.
- Save export/import before cloud accounts.
- Curated custom level packs once UGC trust is stronger.

### Immediate next step

Pick one retention loop to validate next; the most practical candidate is daily challenge plus replay/friend challenge, not more new mechanics.

## 6. UGC / Trust Lens

### Findings

The editor creates real value, but also real trust risk. It allows terrain painting, object placement, validation, save/load, import/export, gallery display, and sharing. That is a lot of capability for a small browser game.

The editor is still primitive as a creation tool. Object placement mostly uses defaults, object editing is limited, and authoring feedback is not deep. It is enough to make levels, but not enough to make reliably good levels.

The validator is stronger than nothing and refreshingly honest in code. `js/utils.js` distinguishes structural validation from heuristic solvability analysis. The comments explicitly say the analyzer is not a full proof and does not model every route, resource, or timing constraint.

The product surface needs to be equally honest. A shared level that is structurally valid but practically broken can damage trust quickly. Bad UGC has a higher trust cost in puzzle games because players may blame themselves before blaming the level.

The current protections are not strong enough if shared custom levels are positioned as trustworthy. The right distinction is:

- structurally valid
- heuristically plausible
- creator-cleared with attached replay
- curated/official

Only the last two should feel trustable to players.

Inference: UGC is currently more complexity than value unless the repo adds a creator-clear requirement or clearly labels unverified levels.

### MUST FIX

- Require a creator clear or attached replay before a custom level can be labeled verified.
- Make unverified imported levels visibly unverified.
- Preserve and check level fingerprints for shared replay validation.
- Improve editor failure modes so bad levels fail honestly, not mysteriously.

### NICE TO HAVE

- Object property editing and deletion UX.
- A custom-level test-play checklist.
- Curated gallery categories.
- Solvability analyzer reporting "what was checked" and "what was not checked".

### Immediate next step

Add a verified/unverified distinction to custom levels and only grant verified status after a successful creator clear is recorded.

## 7. Performance / Browser Runtime Lens

### Findings

The runtime has several good choices. It avoids framework overhead, uses one main canvas, caches terrain drawing layers, stores terrain in a `Uint8Array`, caps particles, and keeps the actual canvas at a fixed 960x540 simulation size. This is pragmatic browser-game engineering.

The expensive-looking parts are mostly visual polish: procedural mossling rendering, particles, spores, danger overlays, canvas effects, lava/ember drawing, result-card rendering, and procedural music. They are elegant, but they add risk on weaker devices.

The likely weak-device problems are not obvious from desktop tests. Mobile Safari/Chrome audio behavior, setInterval-based music scheduling, long-session audio node churn, dense CSS overlays, touch target sizing, and canvas redraw cost all need real device profiling.

`js/music.js` schedules music with a 25ms interval. That may be fine, but audio scheduling is one of the first places browser games get weird on throttled tabs, mobile browsers, or low-power mode.

`js/particles.js` has a cap, which is good. Spore attraction and danger overlays are controlled, but worst-case custom levels and many mosslings could still stress the frame budget.

The code is probably fine on modern desktop. That is not enough for a browser-hosted puzzle game where mobile and low-end laptops matter.

### MUST FIX

- Profile on at least one real phone and one weaker laptop before trusting performance.
- Stress custom levels with high object/terrain/particle/mossling counts.
- Verify audio behavior after suspend/resume, tab backgrounding, and repeated restarts.
- Add lightweight runtime counters for frame time and entity counts during debug.

### NICE TO HAVE

- Perf budget tests for worst-case levels.
- Optional reduced-effects mode beyond CSS reduced motion.
- Seeded/cached visual effects for stable replay screenshots.

### Immediate next step

Run a 10-minute mobile performance and audio soak on a particle-heavy level with music enabled, repeated rewinds, and tab suspend/resume.

## 8. QA / Test Strategy Lens

### Findings

The test suite is genuinely strong for a no-build browser game. `tests/run-tests.js` covers constants, serialization, validation, terrain, mossling state, replay, daily logic, storage behavior, result cards, editor helpers, and regression cases. `tests/e2e/smoke.spec.js` covers browser launch, layout, campaign flow, daily, replay modal behavior, editor invalid save, mobile viewport, and result overlay behavior.

Green tests mean the implementation is more stable than a typical prototype. They do not mean the game is fun, clear, trusted, accessible, or retention-ready.

The biggest false-confidence area is that tests heavily validate code contracts, not player comprehension. A scripted or unit-level pass can certify that a level is mechanically possible while a human still finds it arbitrary.

There is a mismatch between product ambition and e2e depth. Editor/share/import, mobile touch assignment, result-card sharing, audio unlock, replay compatibility after content changes, and custom level verification are not covered deeply enough for the claims those systems imply.

Some tests and comments appear to carry historical naming drift. That is minor technically but important culturally: stale labels in tests/docs make it easier to believe old structure still exists.

Brittle selectors are not the main issue. The main issue is that QA is anchored to implementation stability while the biggest risks are experiential and trust-based.

### MUST FIX

- Add replay compatibility tests with level fingerprints and mismatch handling.
- Add e2e coverage for custom level create, verify, share/import, and play.
- Add mobile touch assignment e2e tests for the actual toolbar/canvas path.
- Add visual regression screenshots for menu, game, result, and editor.
- Add human playtest evidence as a QA artifact, not just informal notes.

### NICE TO HAVE

- Property-based replay fuzzing across more random action streams.
- Golden-path solves for every campaign level after level tuning stabilizes.
- Audio smoke tests for unlock/suspend/resume where feasible.
- Accessibility checks with automated contrast/focus assertions.

### Immediate next step

Add one browser e2e test that creates a custom level, saves it, imports it, plays it, and verifies the trust label shown to the player.

## Final Synthesis

### 1. Overall repo verdict

Strong foundation with scaling problems.

Mosslings is an impressive technical prototype and a credible product candidate. It is not yet a polished indie game because the campaign journey and first-session fun are not proven. It is not yet a sticky emerging product because the daily, sharing, replay, and UGC loops are local/thin compared with the UI weight they carry.

The strongest thing in the repo is the real simulation/replay/editor foundation. The weakest thing is the gap between product-shaped systems and validated player value.

### 2. Top 10 risks

1. First-session fun is unproven. The code proves mechanics and tests, not whether fresh players understand the route, feel agency, and want one more attempt.
2. The menu overstates product maturity. Mastery chips, world cards, rewards, and daily panels make the game feel deeper than the current 21-level local campaign may support.
3. Replay integrity can silently drift. Campaign and daily replays need level hashes and version checks before content changes accumulate.
4. UGC can damage trust. Heuristic solvability and structural validation are not enough if shared levels feel endorsed.
5. `Game` is becoming a monolith. Simulation, rendering, replay, input, objects, audio hooks, onboarding, and persistence coordination are too concentrated.
6. `ui.js` is becoming the other monolith. Editor, gallery, import/share, menu delegation, and DOM wiring need clearer ownership.
7. Daily retention is thin. A deterministic campaign picker with local bests is a prompt, not a strong reason to return.
8. Mobile quality is not proven. CSS responsiveness and e2e viewports are useful, but real touch/audio/performance behavior remains a risk.
9. Tests create partial false confidence. The suite is good, but it mostly protects code behavior rather than player comprehension or trust.
10. Documentation optimism can become self-deception. Existing docs and reports can read more product-complete than the code-supported player value warrants.

### 3. Top 10 opportunities

1. Turn Levels 1-7 into a truly strong first-session arc. That would raise quality more than adding another system.
2. Make verified custom levels require creator clears. This would turn UGC from risky complexity into a trustable sharing loop.
3. Add replay fingerprints. This is a small technical move with large long-term integrity value.
4. Make daily challenges shareable as friend challenges. The daily system is close to being useful if recipient context becomes strong.
5. Simplify the campaign menu into a journey-first UI. A clearer next action would improve continuation and reduce cognitive load.
6. Extract replay/simulation side-effect boundaries. This would protect future velocity without a full rewrite.
7. Add real-device performance and touch QA. Browser games live or die on this more than desktop smoke tests admit.
8. Add visual regression coverage. The UI is dense enough that screenshots will catch problems unit tests miss.
9. Improve failure feedback into plan feedback. Showing why a route failed would make difficulty feel earned.
10. Keep the no-build architecture while it remains cheap. The repo's simplicity is still a strength; do not throw it away prematurely.

### 4. MUST FIX now

- Validate and retune first-session play around Levels 1-7.
- Add level fingerprint/version checks to replay records.
- Add verified/unverified states for custom levels.
- Simplify the continue path in the campaign menu.
- Put a harder boundary around deterministic simulation and side effects.
- Run real mobile performance, touch, and audio checks.

### 5. NICE TO HAVE later

- Friend challenge and leaderboard systems.
- More worlds and mechanics.
- ES module migration.
- Cloud save or accounts.
- In-level ghost racing.
- Richer editor object properties.
- Colorblind/accessibility polish beyond basics.

### 6. Immediate next step

Run a no-new-features playability audit of Levels 1-7 on desktop and phone with five fresh players or fresh-player-equivalent sessions, logging first confusion, first death, first mis-tap, time-to-understand, and voluntary replay, then retune only those levels and immediate UI prompts from the results.

### 7. If you had to cut ruthlessly

Stop building: new mechanics, new world systems, new reward surfaces, and new editor object types until the first-session arc is proven.

Postpone: backend leaderboards, cloud save, account systems, large campaign expansion, and polished social virality.

Simplify: campaign menu density, result overlay choices, daily framing, and any stats that do not directly help the player choose the next run.

Refactor immediately: replay integrity, rewind cleanup, and the side-effect boundary around deterministic simulation. Do not start with a broad framework rewrite.

### 8. 30-day priority stack

Week 1: Playability audit Levels 1-7, then retune level layout, intro prompts, failure messaging, and menu continue flow based on observed confusion.

Week 2: Add replay level fingerprints, mismatch handling, creator-clear verification for custom levels, and e2e coverage for custom share/import/play.

Week 3: Run mobile/touch/audio/performance profiling, add visual regression screenshots, and fix the most visible weak-device issues.

Week 4: Strengthen one retention loop only: daily plus replay/friend challenge is the best candidate. Do not add broad new systems unless the first three weeks show the core loop is retaining attention.

### 9. One blunt conclusion

Right now Mosslings is more impressive than it is proven fun; the repo has built product-shaped systems faster than it has proven that strangers will understand the puzzles, trust the content, and want one more run.
