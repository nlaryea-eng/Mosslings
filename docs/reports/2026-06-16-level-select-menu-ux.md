# Level Select Menu UX Sprint - 2026-06-16

## Scope

Presentation-layer pass for the start menu and level-select cards. No engine,
level, serialization, determinism, or campaign-solve logic was changed.

## Implemented

- Rebuilt level-select card markup into fixed zones: level number, best percent,
  and a footer strip for medals or a lock icon.
- Fixed the `.lvl-medals` selector mismatch that let medal SVGs render without
  their intended level-card layout.
- Added a non-emoji `UI_ICONS.lock` glyph and locked-card state at `opacity: 0.45`.
- Added ARIA labels for level cards with level name, best percent, earned medals,
  selected state, and lock state.
- Added a global `button:focus-visible` ring.
- Kept level-card data progressive: locked levels show only number plus lock;
  unlocked uncleared levels show only the number; best percent and medals appear
  only after the player has earned them.
- Added a one-time medal legend to the first par-level win result card.
- Split gallery medals onto `.gallery-medals` so gallery title badges have their
  own size contract.
- Reduced visual density in controls hints and centered the first-run hint on
  narrow screens.
- Removed global `user-scalable=no`; in-game touch behavior remains scoped to the
  game frame and canvas.
- Added a `prefers-reduced-motion: reduce` guard for UI animation and transition
  effects.

## Verification

- `node tests/run-tests.js` - 83 passed, 0 failed.
- `node --check js/ui.js` - passed.
- `node --check js/icons.js` - passed.
- `node --check tests/run-tests.js` - passed.
- `git diff --check` - clean.
- Browser QA via local Chrome/CDP at `http://127.0.0.1:4173/`:
  - Desktop 1280x760: 9 cards rendered, no clipped card children, no browser errors.
  - Landscape phone 667x375: 9 cards rendered, no clipped card children, no browser errors.
  - Narrow phone 440x520: 9 cards rendered, cards wrapped cleanly, no clipped card children, no browser errors.
  - Mixed state covered completed levels, partial medals, an unlocked uncleared level, and locked levels.
  - Locked cards measured at `opacity: 0.45` with lock SVGs at 10-11px.
  - First-run state still hides level select, editor, gallery, and controls hint; primary button remains `Start Playing`.

## Evidence Paths

- `/private/tmp/mosslings-menu-desktop.png`
- `/private/tmp/mosslings-menu-667x375.png`
- `/private/tmp/mosslings-menu-440.png`
- `/private/tmp/mosslings-first-run.png`

## Remaining Risk

- The medal legend was code-reviewed and covered by the result-card CSS path, but
  not exercised through a full live win flow in Chrome during this sprint.
