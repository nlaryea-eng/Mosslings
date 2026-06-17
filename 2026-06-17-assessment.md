# Assessment: MOSSLINGS

Date: 2026-06-17

## Executive Summary

Mosslings is now a credible browser puzzle game prototype with a real campaign, a coherent retro presentation layer, procedural music, custom pixel icons, a first-run onboarding path, mobile tap-to-confirm targeting, result sharing, and meaningful regression coverage. It is materially stronger than the previous assessment baseline: all campaign levels have scripted 0-death solves, the first-run funnel is simpler, skill buttons no longer depend on platform emoji, and both Node and Playwright smoke tests are green.

The project is still not at polished viral-hit quality. The largest remaining gap is product sharpness on small screens: at a 667 x 375 landscape-phone viewport, the playable canvas measured only 457 x 257 CSS pixels, and the tutorial card can cover a large portion of the board. The second gap is retention: share cards exist, but there is no daily challenge, leaderboard, ghost/replay, social image generation, or competitive loop beyond copied text. The third gap is maintainability: `js/ui.js` and `js/game.js` still carry too many responsibilities, even though the codebase is small enough that a large rewrite would be the wrong move.

I also applied the DietrichGebert/ponytail lens: delete and simplify before adding more system. That audit found only a few immediate cuts, which is a good sign: runtime dependencies are effectively absent, browser tooling is lean, and most current complexity is feature complexity rather than framework bloat. The clearest deletion is duplicated README limitation text. The clearest simplification opportunity is to extract only the hottest UI paths when they are next touched, not to preemptively modularize everything.

Validation performed for this assessment:

- `npm test` -> 90 passed, 0 failed.
- `npm run test:e2e` -> 4 passed, 0 failed.
- `node --check js/game.js js/overlays.js js/ui.js` -> passed.
- Browser screenshot pass covered first-run menu, progressed menu, gameplay toolbar, and landscape-phone layout.
- No browser console errors were observed during the screenshot pass.

Ponytail sources used:

- <https://github.com/DietrichGebert/ponytail>
- <https://raw.githubusercontent.com/DietrichGebert/ponytail/main/AGENTS.md>
- <https://raw.githubusercontent.com/DietrichGebert/ponytail/main/skills/ponytail-audit/SKILL.md>
- <https://raw.githubusercontent.com/DietrichGebert/ponytail/main/skills/ponytail-review/SKILL.md>

## Overall Score

**8.0 / 10**

Score breakdown:

| Area | Score | Evidence |
| --- | ---: | --- |
| Code quality | 8.0 | Small dependency surface, 90 passing tests, robust serializer guards, but `game.js` and `ui.js` remain broad modules. |
| Gameplay | 7.7 | Full campaign solvability is now proven, onboarding is stronger, but phone readability and early tutorial density still hurt flow. |
| Retro appeal | 7.8 | Pixel font, richer icons, CRT polish, custom SFX/music, and stronger map art; some UI overlays remain text-heavy. |
| Virality and retention | 6.8 | Share result flow and OG card exist, but there is no daily/leaderboard/replay/social image loop. |
| Browser/mobile readiness | 7.4 | Playwright smoke is green and phone overflow is fixed; the actual play area is still small on landscape phones. |

This is no longer a fragile prototype. It is also not yet a polished arcade product. The next gains should come from cutting friction and proving fun with players, not from adding more systems.

## Biggest Issues

1. **Phone-scale play is technically functional but visually cramped.** The 667 x 375 browser check had no horizontal overflow, but the canvas was only 457 x 257 CSS pixels. That is small for tracking tiny mosslings, reading skill state, and making quick decisions. The mobile targeting magnifier helps assignment precision, but it does not solve overall scene readability.

2. **Tutorial and overlay text still compete with the game board.** The first-run funnel is much improved, but the in-level tutorial card can dominate the small viewport. This is most visible on phone-scale checks, where the board is already constrained.

3. **The viral loop is still mostly a copied text result.** Result sharing now exists and is honest, but it does not yet create a compelling artifact. There is no daily seed, streak, leaderboard, replay, friend challenge page, or generated share image.

4. **`js/ui.js` is still the main product-risk module.** It handles menu building, gallery cards, editor state, result cards, sharing, settings, input hooks, local storage, and modal behavior. The current code works, but every new UX feature increases the chance of regressions in unrelated UI paths.

5. **`js/game.js` still mixes simulation, render orchestration, UI callbacks, tutorial flow, input mode handling, and rewind plumbing.** The separation has improved with `overlays.js`, `icons.js`, `music.js`, and `utils.js`, but the main class still has too many reasons to change.

6. **Browser automation is only a smoke layer.** The Playwright suite catches boot, card overflow, level start, and landscape toolbar overflow. It does not yet verify first-run completion, result sharing, touch confirm assignment, editor save/import, mute persistence, or custom level import in a browser.

7. **README has duplicated limitation bullets.** The Known Limitations section repeats music/icon caveats. This is minor but it is exactly the kind of stale-doc friction Ponytail flags: delete it instead of explaining around it.

## Highest-Impact Improvements

1. **Make phone play bigger before adding more mechanics.** Use the available viewport more aggressively in landscape, reduce inactive chrome, and collapse tutorial text into shorter staged prompts. Success criterion: the canvas should occupy meaningfully more than 457 x 257 CSS pixels on a 667 x 375 viewport.

2. **Add a daily challenge and shareable result identity.** A daily level seed, one-attempt badge, and compact result URL would do more for replay and sharing than more campaign levels.

3. **Turn result sharing into a visual artifact.** Generate a small local canvas/PNG result card or a deterministic SVG result card. Include saved %, time, skill count, medal status, and level code. Text-only sharing is not enough for a browser game trying to spread.

4. **Extract the result-card UI next, not the whole UI layer.** `showMsg` and result sharing are the highest-leverage `ui.js` pieces because they touch retention and social loops. Pulling those into a small module would reduce risk without pretending the whole UI needs a framework.

5. **Add browser tests for the current product promises.** Start with first-run unlock, mute persistence, result card contents, and custom level share/import. These are user-facing and historically fragile.

## Code Quality Assessment

The codebase is still intentionally simple: plain HTML, CSS, and JavaScript with Playwright as the only visible dev dependency. That is the right base for a retro HTML5 browser game. The absence of runtime framework dependencies keeps load behavior predictable and makes GitHub Pages deployment straightforward.

Strong points:

- `js/utils.js` has robust level serialization/deserialization with versioning, length limits, validation, and fail-closed parsing.
- `tests/run-tests.js` now covers all campaign levels with scripted solves. That is unusually valuable for this genre because map edits can silently break solvability.
- The gallery XSS fix uses DOM construction and `textContent`, which is the correct pattern for user-controlled level names.
- Procedural music lives in `js/music.js`, not scattered through gameplay code.
- `js/overlays.js` isolates danger-assist rendering and has tests proving it does not affect core simulation state.
- `tools/bump-version.js` is a small, repo-appropriate answer to asset-cache friction.
- `tools/render-og.js` reuses Playwright instead of adding a second graphics stack.

Weak points:

- `js/ui.js` is too broad. It now contains multiple mini-products: campaign menu, editor, local gallery, import/share flow, result screen, settings, and DOM event binding.
- `js/game.js` is still the god object for simulation, rendering orchestration, input, onboarding, rewind, result handling, and UI callbacks.
- Some UI still uses string-built trusted markup. This is currently acceptable for generated icons and internal data, but the safer DOM-builder pattern is already present in the gallery and should be used whenever user data could enter the path.
- Browser tests do not yet cover enough of the user journey to catch regressions in the first 60 seconds, share flow, or editor flow.
- Render-only caches still live on the `Game` object. That is fine for now, but the boundary between simulation state and presentation state should stay explicit.

Performance assessment:

- The game is small enough that performance risk is currently low.
- Particle caps and muted-music scheduler shutdown are the right fixes for the most obvious CPU risks.
- The canvas resolution and responsive scaling are more likely to cause product issues than raw frame-rate issues.
- CRT and overlay effects should remain under reduced-motion and user-toggle controls. The current CSS has reduced-motion handling, which is the correct baseline.

Browser compatibility:

- Web Audio autoplay restrictions are respected by starting music only after interaction.
- The project is safe for static hosting on GitHub Pages.
- The local font and SVG/PNG assets are self-hosted.
- The Safari/mobile surface still needs real-device checks. Desktop browser emulation cannot prove touch ergonomics, audio output balance, or phone font readability.

## Gameplay Assessment

The core loop is clear: mosslings spawn, walk blindly, and the player assigns limited skills to convert the map into a survivable path. That loop remains strong because it creates quick tactical decisions and visible consequences.

What works:

- The first-run path now gives a new player one obvious action instead of presenting the whole tool.
- Level 1 onboarding preselects Builder and pauses at the relevant moment, which removes a common first-session failure point.
- The two-stage touch assignment solves the worst mobile input problem: accidental skill use on tiny moving targets.
- Campaign levels now have golden-path solves with 0 deaths, which is strong evidence that the campaign is not accidentally broken.
- Near-miss medal deltas make failure more actionable than a binary win/lose screen.

What still weakens the loop:

- The first few minutes still rely heavily on explanatory text. The game should teach more through staged board geometry and fewer words.
- The toolbar contains eight skills early, even when progressive disclosure hides some advanced controls. The UI is readable, but the decision surface is still dense for a brand-new player.
- Tiny in-world role state is improved but remains a phone-risk area. The map and toolbar art now have more detail than the mosslings themselves, so the characters can feel under-rendered against the richer environment.
- Failure recovery is better than before, but a faster "try the last 10 seconds again" loop would fit this genre well.

Difficulty and pacing:

- Shortened early levels are a good direction.
- Full campaign solve coverage means difficulty changes can now be made with confidence.
- The later campaign still needs human playtesting for perceived fairness. A scripted solve proves possibility, not fun.

Controls:

- Desktop hover/assign behavior is responsive.
- Touch confirm is the correct mobile model for this game.
- Keyboard shortcuts are useful, but the visible hint is still too small to be valuable for many players.

## Retro Appeal Assessment

The project now reads more like a designed retro game and less like a browser demo. The self-hosted pixel font, 24 x 24 skill badges, medal glyphs, CRT treatment, procedural SFX, and procedural music all push in the same direction.

What works:

- Skill badges are now cohesive and readable without relying on emoji.
- The map art has texture and atmosphere without becoming noisy.
- The CRT pass adds arcade flavor while remaining optional.
- Music and SFX are code-generated, avoiding large audio files and preserving the lightweight static-site model.
- The absolute raster OG image is more deploy-realistic than the previous placeholder.

What still needs work:

- Mosslings should match the detail level of the terrain and buttons. Their silhouette is functional, but the richer UI art now exposes how simple the character sprites are.
- The top HUD icons are consistent enough to use, but they are not as expressive as the skill badges.
- Text overlays still feel closer to debug/tutorial UI than arcade signage in some states.
- Audio quality cannot be fully validated from code. The sequencing is solid, but final mix judgment requires human listening on laptop speakers and phone speakers.

## Virality & Retention Assessment

Current sharing is honest and functional, but not yet inherently viral.

Existing strengths:

- Result cards contain useful stats.
- Custom level links are playable.
- Open Graph metadata and an absolute image URL exist.
- Medals and near-miss deltas create replay reasons.
- The game is static-hostable, which lowers sharing friction.

Missing hooks:

- No daily challenge.
- No leaderboard or score comparison.
- No replay/ghost export.
- No share image generated from the actual run.
- No streak, unlock track, or cosmetic reward loop.
- No "beat my result" route that lands a friend directly into the same challenge with the previous result visible.

The highest-return retention feature is a daily challenge. It is small enough to fit the project and strong enough to give players a reason to return without adding a service backend.

## Technical Risks

1. **UI regressions from `js/ui.js` growth.** Every new menu, modal, share, or editor change touches a broad file.

2. **Simulation/render boundary drift.** The project has a determinism goal. Render helpers must stay read-only with respect to simulation state. Current tests help, but this should remain a hard rule.

3. **Phone readability debt.** Passing overflow tests does not prove playability. Small canvas area, tiny characters, and tutorial overlays still need device-level validation.

4. **Audio taste and compatibility.** Web Audio behavior is technically correct, but perceived loudness and mix balance still require real listening checks.

5. **Docs drift.** The README already has duplicated Known Limitations bullets. That is small, but it shows the documentation can become stale as fast as features land.

6. **Result/share regressions.** Share links, custom level import, and result copy have had correctness fixes before. They need browser-level regression tests.

## Ponytail Audit

Ponytail lens used: delete, shrink, use native/simple paths, and avoid adding abstractions until they remove real complexity.

Ranked findings:

1. **delete: duplicated README Known Limitations bullets.** The music/icon limitations are repeated. Delete the duplicate copy. This is the one immediate cleanup with no design debate.

2. **shrink: extract only result-card code from `js/ui.js` when next touched.** Do not split the whole UI layer just to split it. The result card is the right first extraction because it is retention-critical, markup-heavy, and likely to change.

3. **shrink: extract editor serialization/import UI only if the editor gets another feature.** The editor code is bulky, but stable. Premature extraction would add ceremony without lowering current risk.

4. **native: keep procedural Web Audio.** Do not add audio files or a music library. The current music engine is tunable and small.

5. **native: keep Playwright as the only browser automation dependency.** It already supports smoke tests and OG rendering. Do not add a screenshot framework until image regression becomes a real workflow.

6. **yagni: avoid account systems, backend leaderboards, and hosted storage for now.** Daily challenge and deterministic share links can be static. A backend would be premature.

7. **delete: remove stale assessment/report clutter only if the repo intends docs as living product docs.** Current historical assessment files are useful context. Do not delete them unless the project explicitly changes documentation policy.

Net Ponytail result: there is little dependency bloat to remove. The project should mostly delete duplicated docs, resist new infrastructure, and simplify UI hot paths only as they change.

## Recommended Refactors

1. **Create `js/result-view.js`.**
   Move result card DOM construction, near-miss rows, medal display, and share-result copy into one small module. Keep it dependency-free. The goal is not architecture purity; the goal is to reduce risk in the most frequently tuned product surface.

2. **Create a replay-silencing helper in `Game`.**
   Rewind currently silences particles/audio with direct state toggles. Wrap that in `try/finally` so any future exception cannot leave the game in a muted or replaying state.

3. **Move menu card DOM creation toward the gallery-card pattern.**
   The current menu card strings use trusted data, so this is not a security emergency. But the gallery already has the safer pattern; use it when menu cards next change.

4. **Separate render-only caches from simulation state.**
   If overlays keep growing, store render caches under a dedicated presentation object instead of on `Game` directly.

5. **Add browser journey tests.**
   Add tests for first-run unlock, touch confirm assignment, mute preference persistence, result card rendering, and custom level import/share.

## Quick Wins

1. Delete the duplicated Known Limitations bullets in `README.md`.

2. Shorten the in-level tutorial card copy by roughly 40 percent.

3. Increase effective canvas area on landscape phones by reducing menu/HUD vertical chrome during play.

4. Add a Playwright test that clears local storage, verifies first-run advanced menu items are hidden, completes Level 1, and verifies the full menu returns.

5. Add a Playwright test for mute persistence across reload.

6. Add a "Copy daily challenge" result line even before building a leaderboard.

7. Replace the tiny controls hint with a focused "press H for keys" or a help button. The current always-visible hint is too small to carry its content.

8. Add a real-device checklist to the README: phone landscape, phone portrait rotate prompt, laptop speakers, phone speakers, Safari, Chrome.

## Suggested Next Development Steps

1. **Phone readability sprint.**
   Target the 667 x 375 viewport and a real phone. Increase board area, shrink tutorial overlays, and tune mossling silhouettes. Do not add mechanics during this sprint.

2. **Daily challenge sprint.**
   Add deterministic daily seed selection, a visible daily card, and a result share string that includes date, level, saved %, time, skills, and medals. Keep it static-hostable.

3. **Result artifact sprint.**
   Generate a local share image using canvas or deterministic SVG. This should reuse existing icons and medal glyphs rather than adding a new art pipeline.

4. **UI risk reduction sprint.**
   Extract result-card rendering from `js/ui.js`, add browser tests around it, and leave the rest of the file alone.

5. **Human playtest pass.**
   Run at least five fresh-player sessions for Levels 1-3. Track time to first successful skill use, first death cause, whether players understand medals, and whether they replay voluntarily.

## Example Code Improvements

### 1. Defensive replay silencing

This reduces the risk that rewind leaves audio or particles disabled if future code throws during replay.

```js
withSilentReplay(fn) {
  const realSpawn = this.particles.spawn;
  const wasSilent = audio._silent;

  this.replaying = true;
  this.particles.spawn = () => {};
  audio._silent = true;

  try {
    return fn();
  } finally {
    this.particles.spawn = realSpawn;
    audio._silent = wasSilent;
    this.replaying = false;
  }
}
```

Use it around the existing rewind replay loop instead of manually toggling replay state inline.

### 2. DOM-built result stat chip

This follows the safer gallery-card pattern and makes result card markup easier to test.

```js
function buildStatChip(label, value) {
  const chip = document.createElement("div");
  chip.className = "result-stat";

  const key = document.createElement("span");
  key.className = "result-stat__label";
  key.textContent = label;

  const val = document.createElement("strong");
  val.className = "result-stat__value";
  val.textContent = value;

  chip.append(key, val);
  return chip;
}
```

This is worth doing for result UI because the result/share surface will likely change often.

### 3. Browser regression for mute persistence

This covers a real product promise that unit tests cannot fully prove.

```js
test("mute preference persists across reload", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /start playing/i }).click();
  await page.getByRole("button", { name: /mute/i }).click();
  await page.reload();

  const muted = await page.evaluate(() => localStorage.getItem("mosslingsMute"));
  expect(muted).toBe("1");
});
```

Adjust selectors to match the final accessible labels.

## Validation Notes

Commands run:

```bash
npm test
npm run test:e2e
node --check js/game.js
node --check js/overlays.js
node --check js/ui.js
git diff --check
```

Results:

- `npm test`: 90 passed, 0 failed.
- `npm run test:e2e`: 4 passed, 0 failed.
- `node --check`: passed for checked JavaScript files.
- Browser screenshot checks: first-run menu, progressed menu, gameplay toolbar, and landscape-phone layout captured with no console errors.

Observed browser measurements:

- First-run state: only the first-run menu path was visible; advanced menu options were hidden.
- Progressed menu: 9 level cards rendered with no detected card overflow.
- Gameplay desktop: canvas measured 958 x 539 CSS pixels; toolbar buttons measured 76 x 62 with 24 x 24 skill icons.
- Landscape-phone check: no horizontal overflow, but canvas measured only 457 x 257 CSS pixels.

## Final Judgment

Mosslings has crossed from "interesting prototype" into "real browser game candidate." The strongest evidence is not visual polish; it is the combination of full campaign solve coverage, working first-run onboarding, mobile targeting, dependency restraint, and green browser smoke tests.

The next level is not another layer of effects. It is phone readability, a stronger replay/share hook, and selective deletion/simplification. A daily challenge plus a visual result artifact would likely outperform almost any new mechanic.
