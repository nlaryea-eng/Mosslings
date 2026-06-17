# Retro Polish and Worktree Cleanup - 2026-06-17

## Scope

Cleaned up the existing modularization worktree, reviewed the current game as a
retro browser puzzler, and shipped a focused play-feel and presentation pass. The
simulation rules, level layouts, replay format, and deterministic update path
were kept intact.

## Review Inputs

- Gameplay review: keep the next run obvious, avoid dumping secondary loops
  ahead of campaign progress on mobile, and make shared replays read like a
  challenge.
- Visual review: remove menu bleed-through, improve short landscape toolbar
  legibility, and add richer in-level scene detail without stock art.
- Code review: stage the extracted modules, guard script load order, align
  package metadata, and close editor-validation drift.

## Implemented

- Staged the extracted `Game` and `ui` modules into the runtime load order:
  `game-objects.js`, `game-render.js`, `game-hud.js`, `share-ui.js`, and
  `editor-ui.js`.
- Updated the test harness to load runtime scripts from `index.html` and assert
  the critical script ordering contract.
- Fixed package-lock version drift and pinned the Playwright dependency to match
  the installed lockfile.
- Aligned editor required-save controls with validation by enforcing a minimum
  of 1 mossling.
- Added render-only rescue popups near the portal and covered them with a
  determinism-oriented unit test.
- Upgraded in-game object rendering for platforms, rails, switches, gates, and
  world backdrops while keeping the changes draw-only.
- Tuned music state transitions for tense runs and result moments.
- Reworked replay result copy from a passive export into a "Beat my run" call to
  action.
- Made the main menu shell opaque enough to hide HUD bleed-through.
- Reordered mobile progressed-menu sections so campaign/grove progress appears
  before Daily Challenge and editor actions.
- Removed geometry scaling from the pulsing continue button and collapsed skill
  labels on very short landscape viewports.
- Updated README architecture notes for the split runtime modules and current
  Daily Challenge unlock behavior.

## Verification

- `npm test` - 200 passed, 0 failed.
- `npm run test:e2e` - 25 passed.
- Browser QA with Playwright against `http://127.0.0.1:4173/`:
  - progressed desktop menu rendered without HUD bleed-through.
  - game canvas sampled nonblank.
  - rescue popup rendered without writing gameplay input.
  - mobile menu had no horizontal overflow and campaign content appeared before
    secondary loops.
  - short landscape toolbar hid text labels and stayed inside the viewport.
  - browser console/page error collection was empty.

## Evidence Paths

- `/private/tmp/mosslings-final-menu-desktop.png`
- `/private/tmp/mosslings-final-game-desktop.png`
- `/private/tmp/mosslings-final-save-popup.png`
- `/private/tmp/mosslings-final-menu-mobile.png`
- `/private/tmp/mosslings-final-game-landscape.png`

## Follow-Up

- Continue the larger onboarding-stage work in a separate sprint: pure
  progression/tenure model, staged feature unlocks, and portrait e2e coverage
  for each stage.
