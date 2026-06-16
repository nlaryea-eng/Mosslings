# Assessment: MOSSLINGS

Date: 2026-06-16

## Executive Summary

MOSSLINGS is a real playable browser puzzle game, not just a prototype. The strongest evidence is the breadth of the mechanics already implemented: per-pixel terrain, eight Lemmings-style skills, fixed-step simulation, rewind, level serialization, a level editor, medals, procedural sprites, procedural audio, and a 53-test Node harness that passed during this review.

As a polished, shareable browser hit, it is not there yet. The code is more mature than the product experience. The first-play experience is dense, the mobile play surface is small, the scoring hooks are mostly local-only, and the game lacks a clear viral output such as a result card, daily challenge, replay, leaderboard, or one-click challenge link. The retro feel is coherent in motion, but system emoji icons, Courier-as-pixel-font typography, and the moody modern palette keep it from feeling like a sharp arcade artifact.

Review evidence:

- `node tests/run-tests.js`: 53 passed, 0 failed.
- `node --check js/game.js`, `node --check js/ui.js`, `node --check tests/run-tests.js`: passed.
- Headless Chrome/CDP smoke test at `http://127.0.0.1:5173/`: page loaded, Level 1 started, Builder assigned by canvas click while paused, `skillsUsed` became `1`, target state became `Builder`.
- Mobile layout smoke checks: portrait `390x844` had no horizontal scroll and showed rotate hint; landscape `844x390` had no page scroll, but the playable board was only `484x272` CSS pixels.
- Browser console: no app error observed. One Canvas readback warning was caused by the smoke script sampling canvas pixels with `getImageData`, not by normal play.

## Overall Score

Overall: 6.5 / 10

- Code quality: 7.2 / 10
- Gameplay design: 6.2 / 10
- Retro appeal: 6.0 / 10
- Virality and retention: 4.8 / 10
- Browser/mobile readiness: 6.0 / 10

The score is held back less by missing mechanics and more by onboarding, phone usability, shareability, and product framing.

## Biggest Issues

1. The product has no strong viral loop. Custom level links exist, but there is no shareable completion result, daily seed, leaderboard, replay, or challenge card.
2. Mobile play is technically supported but not yet comfortable. The landscape phone board measured `484x272` CSS pixels at `844x390`, making tiny creatures and precise assignments a likely pain point.
3. The first screen is too dense for a shareable browser game. It shows level select, editor entry, controls text, underlying HUD/toolbar through the translucent overlay, and a large logo before the player understands the action.
4. Determinism and presentation isolation are overstated in the docs. `README.md:71-75` says no `Math.random` in `update()`, but `js/mossling.js:34-39` and `js/game.js:336-368` use presentation randomness during simulation updates.
5. Custom level gallery rendering uses `innerHTML` with level names from storage at `js/ui.js:268-281`, creating a local XSS/injection risk.
6. Campaign test coverage proves physics and map geometry, but only Level 1 and Level 9 have scripted solve coverage (`tests/run-tests.js:327-345`, `tests/run-tests.js:589-615`). Levels 2-8 can still drift into technically valid but unfun or unsolvable states.

## Highest-Impact Improvements

1. Replace the start screen with an instant Level 1 playable tutorial path. Keep level select and editor secondary.
2. Add a shareable result card: level, saved count, time, skills used, medals, and a compact challenge link.
3. Add full-campaign scripted solve tests or at least golden-path smoke scripts for every campaign level.
4. Rework mobile interaction around pause-and-assign, zoomed targeting, or a magnifier/selection lane. The current touch radius helps, but the sprites are still very small on landscape phones.
5. Remove HTML string interpolation for user/custom level content.
6. Move cosmetic randomness out of simulation updates or make it deterministic from `id` and `frame`.
7. Replace emoji toolbar icons with drawn pixel icons or canvas/SVG sprites for consistent retro presentation across platforms.

## Code Quality Assessment

The architecture is simple and readable. The dependency-ordered plain scripts are deliberate, and for a zero-build HTML5 game that is defensible. The module boundaries mostly match the actual systems: `terrain`, `mossling`, `game`, `ui`, `levels`, `audio`, `music`, `particles`, and `utils`.

The strongest technical choice is the per-pixel `Uint8Array` terrain mask (`js/terrain.js:17-24`) with canvas layers derived from it. That is the right model for a Lemmings-like game. It prevents the common problem where collision and rendering disagree. The tests also directly cover terrain rules, one-way membranes, destructibility, skill physics, fall limits, lava, serialization, medals, rewind, and some scripted solves.

The fixed-timestep loop in `js/game.js:626-646` is appropriate for browser refresh-rate independence. Fast-forward is implemented by running extra simulation updates per accumulated frame, which is simpler than changing delta time and reduces physics drift.

Maintainability risks:

- The global-script architecture will become harder to scale. There is no import graph, no bundler, and no lint/type tooling. That is acceptable for the current size, but the editor, sharing, campaign, audio, and UI systems are already large enough that accidental globals and load-order bugs are realistic.
- `Game.update()` mixes simulation with presentation. It decrements timers, spawns creatures, updates mosslings, updates particles, emits audio, manages shake, hatch flash, and lava bubbles in one path (`js/game.js:336-374`). Rewind compensates by muting particles/audio, but the architecture is more fragile than the README claims.
- `Mossling.update()` mutates blink state using `Math.random()` (`js/mossling.js:34-39`). It does not appear to affect physics, but it violates the stated invariant and makes exact visual replay impossible.
- Gallery cards interpolate custom level names into `innerHTML` (`js/ui.js:268-281`). Local-only games still need to avoid this. Shared/editor content should be treated as untrusted.
- Share links use `location.origin + location.pathname` (`js/ui.js:161`). This works when hosted, but conflicts with the "open from file://" promise. On `file://`, generated links are not meaningful share URLs.
- `DESIGN_META.md` is partially stale. It says par medals remain forward-looking, while `utils.js`, `levels.js`, `game.js`, and `ui.js` contain implemented medal behavior.

Performance assessment:

- Current terrain operations are acceptable for a `960x540` board. `drawRect()` and `drawCircle()` write directly into the mask (`js/terrain.js:128-155`), and the expensive `finalize()` pass scans the full mask only on level load/editor undo (`js/terrain.js:158-213`).
- The particle system has no hard cap. Current campaign counts are small, so this is not urgent, but a custom level plus repeated explosions/nukes could produce transient spikes.
- The CSS layout uses `100dvh` (`style.css:47`), which is correct for modern mobile browsers. Older browsers may treat it inconsistently; add fallback sizing if broad compatibility matters.

Browser compatibility concerns:

- Pointer Events are used directly (`js/ui.js:84-93`). Modern Safari/Chrome/Firefox are fine. Very old mobile Safari will not work.
- Clipboard sharing requires a secure context; the code has a prompt fallback, but the URL itself is weak in file mode.
- Emoji UI icons render differently by OS and browser, which is both a retro-authenticity and layout consistency issue.

## Gameplay Assessment

The core loop is sound: observe mindless walkers, choose a limited skill, assign it to the right creature at the right moment, and rescue a target number before time runs out. This is a proven loop, and the implementation has the necessary mechanics: blockers, builders, bashers, miners, diggers, floaters, climbers, exploders, hazards, metal, one-way gates, athlete-only exits, and terrain carving.

The best design choice is assign-while-paused. The browser smoke test verified that a Builder assignment worked while paused. For a timing-heavy puzzle game with tiny targets, this is not optional; it is a major usability feature.

The difficulty curve is plausible but under-validated. Level 1 asks for Builder use near a gap and allows blockers. Later levels introduce vertical digging, lethal falls, climbers, miners, metal, lava, athlete exits, and one-way gates. That sequence makes sense on paper. The problem is that the test suite only scripts complete solutions for Level 1 and Level 9. The rest are geometry-checked, not play-checked.

Controls are responsive on desktop. Hover targeting, state labels, skill ghosts, hotkeys, pause, rewind, fast-forward, spawn-rate controls, restart, and nuke are genre-appropriate. The issue is discoverability: the player is presented with many controls before the first successful action. Viral games need a shorter path to "I get it."

Moment-to-moment feedback is above prototype level. The game has particles, landing dust, exit glow, hit-stop, flash, hover rings, active toolbar state, and save-streak audio hooks. The feedback still needs clearer failure communication. When a mossling fails to assign, the current response can be silent if no target is found. A small denied-target pulse or "no valid target" cursor state would reduce confusion.

Pacing is the main gameplay risk. Level durations are long for a browser hit, and the win condition waits until time expires or all spawned mosslings are gone (`js/game.js:372-373`). If the player has already met the rescue target, the remaining cleanup can feel like waiting rather than playing. Fast-forward helps, but it is a secondary control.

Replayability exists through medals, best-save percentage, local progress, and the level editor. The "one more try" factor is not yet strong because the result screen does not aggressively frame a near miss: no par delta, no "beat by 3 seconds", no one-click restart for a medal target, no shareable fail/win summary.

## Retro Appeal Assessment

The project has a retro base: pixelated canvas rendering, tiny procedural characters, tile-like terrain, limited-color UI, synthesized audio, and arcade-style controls. The procedural sprites have state poses and deterministic variants, which is a practical solution for a zero-asset game.

The retro aesthetic is not fully authentic. The toolbar relies heavily on emoji, and emoji are anti-retro in practice: they render as platform-native color glyphs, vary by OS, and clash with canvas pixel art. The "pixel font" is `Courier New` (`style.css:11-12`), which reads more terminal than arcade. The moody forest background is attractive but more modern ambient than classic arcade.

Audio potential is good but likely mispositioned. The generative ambient score is technically interesting, but viral retro games usually benefit from immediately memorable jingles, crisp UI bleeps, strong fail/win stingers, and a recognizable short loop. Ambient music can support longer puzzle play, but it will not help short-session memorability as much as a bold theme.

Polish opportunities:

- Replace emoji skill icons with custom pixel glyphs.
- Give each skill a stronger animation silhouette. Builder and Basher should be readable at phone scale.
- Add a short, punchy rescue jingle and a distinct "bad assignment" sound.
- Add arcade screen transitions: level title card, countdown, medal stamp, par breakdown.
- Use a real bitmap font asset or carefully drawn canvas text for core game UI.

## Virality & Retention Assessment

The project has one viral-capable feature: custom level serialization. URL-safe level codes are a good foundation. The editor and share button are valuable, but they are not enough by themselves.

Missing viral hooks:

- No shareable completion card.
- No daily challenge.
- No leaderboard or friend challenge.
- No replay/GIF export.
- No "copy my solution" or "can you save more than me?" link.
- No embedded level code preview for social posts.
- No immediate result comparison such as saved percent, par time delta, skill delta, and medal delta in one compact view.

Retention systems are present but local and quiet. Best-save percentage and medals are stored locally, but they are not turned into goals strongly enough. The menu shows icons, yet the result screen should tell the player exactly what they missed and offer a focused retry: "Gold rescue achieved, speed missed by 12s, retry for speed."

Mobile/browser accessibility is partially there. The CSS avoids horizontal scroll in tested portrait and landscape viewports, and the rotate hint appears in portrait. The practical issue is interaction scale. In landscape phone mode, the board was `484x272` CSS pixels. At that scale, a 10-14 pixel world-space creature becomes very small visually. The touch targeting radius (`js/game.js:223-229`) compensates mathematically, but the player still has to understand which creature will receive the skill.

## Technical Risks

1. Local XSS/injection through gallery card HTML. `lvl.name` is interpolated into `innerHTML` at `js/ui.js:268-281`.
2. Architecture drift around determinism. Docs promise no randomness in `update()`, but code uses it in update paths.
3. File-mode sharing mismatch. The project advertises direct `file://` play, but share URLs depend on hosted URL semantics.
4. Incomplete campaign solvability automation. Level geometry can pass while player experience fails.
5. Browser global namespace/load-order fragility. Plain scripts are fine now, but future expansion will magnify this risk.
6. Mobile precision risk. The game can fit on phone screens, but fitting is not the same as comfortable play.
7. Stale documentation. `DESIGN_META.md` no longer reflects medal implementation status.

## Recommended Refactors

1. Split simulation and presentation updates.
   Keep physics, state transitions, terrain mutation, spawn logic, and win/loss checks in `update()`. Move blink, particle ticking, lava embers, hatch flash visuals, shake decay, and audio scheduling into a presentation layer or deterministic event queue.

2. Introduce a small DOM builder for UI cards.
   Avoid `innerHTML` for any user/custom/shared content. Build elements and use `textContent`.

3. Add a `RunStats` object.
   Track saved, deaths, time elapsed, skill count, medals, rewind count, fast-forward usage, and optional per-level par deltas. Use it for result screens and share cards.

4. Add campaign solution scripts.
   Extend the current Level 1 and Level 9 scripted solves to all nine levels. These should run without DOM and verify at least `reqSaved`, preferably par paths for medals.

5. Normalize share-link generation.
   Use `new URL(location.href)` when hosted, but detect `file:` and provide a code-only fallback or configured production base URL.

6. Move level/editor persistence behind a versioned schema.
   Local storage already works, but future changes to level shape, medals, and custom metadata need migration handling.

7. Create a small icon system.
   Replace emoji skill icons with local pixel glyphs drawn by CSS sprites, canvas, or inline SVG. This reduces cross-platform layout drift and improves retro consistency.

## Quick Wins

- Hide HUD/toolbar behind an opaque start overlay or start directly into Level 1.
- Add "Retry for medal" buttons to result screens.
- Add a clear failed-assignment pulse when click/tap does not hit a valid target.
- Make fast-forward visually prominent after the player has solved the key action but is waiting.
- Add a "share result" button on win and fail overlays.
- Add a phone targeting aid: when a skill is selected, tapping near a cluster pauses and enlarges a local selection bubble.
- Fix `DESIGN_META.md` to match implemented medals and version `0x02`.
- Replace emoji icons with consistent pixel icons.
- Cap particles or pool them with a maximum active count.
- Add a smoke test that opens the game in a real browser and starts Level 1.

## Suggested Next Development Steps

1. Product pass: redesign the first 60 seconds.
   Start Level 1 immediately or reduce the menu to Play, Editor, and a quiet level selector. The first action should be "select Builder, assign it, see bridge success" with minimal text.

2. Technical hardening pass.
   Fix gallery HTML injection, clean up determinism boundaries, update stale docs, and add full-campaign solve tests.

3. Mobile play pass.
   Test actual touch interaction on a phone. Do not stop at viewport fit. Measure whether players can reliably assign the intended mossling in a moving cluster.

4. Retention pass.
   Add result cards, par deltas, shareable challenge links, and a daily level seed.

5. Retro polish pass.
   Replace emoji, tighten typography, add stronger arcade stingers, and make skill animations readable at phone scale.

6. Release packaging pass.
   Host the game at a stable URL, set canonical share base, add Open Graph/Twitter card metadata, and make shared level/result links unfurl cleanly.

## Example Code Improvements

### 1. Avoid `innerHTML` for custom level cards

Current risk: `js/ui.js:268-281` interpolates `lvl.name` into HTML. Use element creation for user-controlled content.

```javascript
function button(className, text, onClick) {
    const b = document.createElement('button');
    b.className = className;
    b.textContent = text;
    b.onclick = onClick;
    return b;
}

function buildGalleryCard(lvl) {
    const card = document.createElement('div');
    card.className = 'gallery-card';

    const title = document.createElement('h4');
    title.textContent = lvl.name;
    card.appendChild(title);

    const meta = document.createElement('div');
    meta.className = 'card-meta';
    for (const text of [`${lvl.totalSpawn} mosslings`, `${lvl.reqSaved} req`, `${lvl.time}s`]) {
        const span = document.createElement('span');
        span.textContent = text;
        meta.appendChild(span);
    }
    card.appendChild(meta);

    const actions = document.createElement('div');
    actions.className = 'card-btns';
    actions.append(
        button('btn-play', 'Play', () => this.playCustomLevel(lvl)),
        button('btn-edit', 'Edit', () => this.editCustomLevel(lvl)),
        button('btn-share', 'Share', () => this.shareLevel(lvl)),
        button('btn-delete', 'Delete', () => this.deleteLevel(lvl.name))
    );
    card.appendChild(actions);

    return card;
}
```

### 2. Make share links robust when hosted and honest in file mode

Current issue: `location.origin + location.pathname` is not a real public share URL in `file://` mode.

```javascript
shareCustomLevel() {
    const game = this.game;
    game.level.name = document.getElementById('edit-name').value.trim() || 'Custom Level';
    game.level.commands = this.editCommands;

    const code = serializeLevel(game.level);
    if (!code) {
        this.toast('Level is too large or invalid to share.', true);
        return;
    }

    if (location.protocol === 'file:') {
        this.promptCopy(code);
        this.toast('Copied level code. Host the game to create a public link.');
        return;
    }

    const url = new URL(location.href);
    url.search = '';
    url.hash = '';
    url.searchParams.set('level', code);
    this.copyShareText(url.toString());
}
```

### 3. Keep cosmetic blink deterministic or outside simulation

Current issue: `Mossling.update()` uses `Math.random()` for blink. If blink remains inside the mossling object, derive it from stable state.

```javascript
function cosmeticPulse(id, frame, period, salt) {
    const n = ((id + 1) * 1103515245 + (frame + salt) * 12345) >>> 0;
    return n % period === 0;
}

updateCosmetics() {
    if (this.blink > 0) {
        this.blink--;
    } else if (cosmeticPulse(this.id, this.frame, 997, 17)) {
        this.blink = 6;
    }
}
```

Better: call `updateCosmetics()` from a render/presentation tick, not from the physics update.

### 4. End waiting once the target is saved

Current behavior waits until time expires or all spawned/alive mosslings are resolved. Consider offering an early clear once the required count is saved.

```javascript
update() {
    if (this.state !== 'PLAY') return;

    // existing simulation...

    if (!this.clearOffered && this.savedCount >= this.level.reqSaved) {
        this.clearOffered = true;
        ui.showClearChoice({
            saved: this.savedCount,
            total: this.level.totalSpawn,
            continuePlay: () => { this.state = 'PLAY'; },
            finishNow: () => this.endLevel()
        });
        this.state = 'PAUSE';
        return;
    }

    const doneSpawning = this.nuked || this.spawnCounter >= this.level.totalSpawn;
    if (this.time <= 0 || (doneSpawning && this.aliveCount() === 0)) this.endLevel();
}
```

This should be play-tested. Some Lemmings players like chasing perfect saves after meeting the target, so the choice is better than an automatic cutoff.

### 5. Add a full-campaign scripted solve scaffold

The existing tests already prove this approach works. Expand it so every campaign level has at least one maintained golden path.

```javascript
const CAMPAIGN_SOLVES = {
    'The First March': [
        { when: g => findWalker(g, m => m.x >= 435 && m.dir === 1), skill: SKILLS.BUILD },
    ],
    'Going Down': [
        // add blocker/digger timing here
    ],
};

for (const [name, script] of Object.entries(CAMPAIGN_SOLVES)) {
    test(`${name}: scripted route saves the target`, () => {
        const idx = LEVELS.findIndex(l => l.name === name);
        const g = new Game();
        g.loadLevel(idx);
        runScriptedSolve(g, script, 60 * LEVELS[idx].time);
        assert(g.savedCount >= g.level.reqSaved, `${name}: saved ${g.savedCount}/${g.level.reqSaved}`);
    });
}
```

This is the fastest way to prevent future level tweaks from silently damaging the campaign.
