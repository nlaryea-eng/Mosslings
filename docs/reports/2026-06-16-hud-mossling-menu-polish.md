# HUD, Mossling, and Menu Consistency Polish - 2026-06-16

## Scope

Presentation-layer pass following the level-select redesign. No gameplay rules,
campaign layouts, serialization, deterministic update paths, or golden-path
solve logic were changed.

## Implemented

- Rebuilt top HUD/control icons as 24x24 multi-tone pixel SVGs:
  - play
  - pause
  - fast-forward
  - reset
  - nuke/hazard
  - mute/unmute
  - spawn-rate plus/minus
  - lock/share/edit/close/settings/undo utility icons
- Wired spawn-rate `+/-` buttons through the shared icon system instead of plain
  text symbols.
- Tuned HUD icon sizing so rate icons fit inside 24px buttons and header icons
  fit inside 34x32px buttons.
- Reworked mossling rendering to use the same pixel-art recipe as the newer UI:
  dark outline, shadow, fill, highlight, stronger eyes, clearer feet, and more
  readable role poses.
- Converted floater and climber overlays from smooth/simple marks into pixel
  markers.
- Fixed the editor toolbar so it wraps inside the frame instead of clipping off
  the left and right edges.
- Widened the editor level-name field so the default `Custom Level` text reads.
- Styled all editor-settings number inputs, including inventory fields, to match
  the dark panel UI.

## Verification

- `node tests/run-tests.js` - 83 passed, 0 failed.
- `node --check js/icons.js` - passed.
- `node --check js/ui.js` - passed.
- `node --check js/mossling.js` - passed.
- `node --check tests/run-tests.js` - passed.
- `git diff --check` - clean.
- Browser QA via local Chrome/CDP at `http://127.0.0.1:4173/`:
  - Progressed start menu rendered with 9 level cards and no framework overlay.
  - Gallery rendered 1 custom card with scoped medal sizing and subdued delete button.
  - Editor rendered 8 edit tools and 13 toolbar buttons without clipping.
  - Editor settings rendered 8 inventory entries with dark styled number inputs.
  - Gameplay rendered 5 header icons, 2 rate icons, 8 skill icons, nonblank canvas,
    and live mosslings.
  - Result overlay rendered 4 stat chips, 3 medal slots, and 3 medal legend items.
  - Phone menu rendered 9 level cards with 0 clipped card children.
  - First-run menu still hides advanced controls and shows `Start Playing`.
  - Browser error/warning event collection was empty.

## Evidence Paths

- `/private/tmp/mosslings-qa-start-menu.png`
- `/private/tmp/mosslings-qa-gallery.png`
- `/private/tmp/mosslings-qa-editor.png`
- `/private/tmp/mosslings-qa-editor-settings.png`
- `/private/tmp/mosslings-qa-gameplay-hud.png`
- `/private/tmp/mosslings-qa-result.png`
- `/private/tmp/mosslings-qa-phone-menu.png`
- `/private/tmp/mosslings-qa-first-run.png`
