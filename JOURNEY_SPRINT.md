# Journey Sprint — Stretched Player Path

## Intent

Mosslings had enough systems. This sprint simplifies *when* the player meets
those systems so the game unfolds as one clear journey rather than a dashboard.

## Three-grove promise

| Grove | Player question | Systems promoted | Systems held back |
|---|---|---|---|
| Grove 1: Save | Can I get them home? | campaign, retry, simple results, core skills | daily, ghost, editor, gallery |
| Grove 2: Race | Can I do better than my last run? | medals, daily, Race Yourself / ghost, replay sharing | editor, gallery |
| Grove 3: Create | Can I make a challenge for someone else? | Create Levels, My Levels, custom sharing | — |

The implementation keeps every existing feature. It gates, renames, and
re-prioritizes them so they appear only when useful.

## Product decisions

- Ghost/daily is now a Grove 2 improvement loop, framed as **Race Yourself**.
- Editor/gallery is now a Grove 3 creation loop, framed as **Create Levels**.
- Tenure no longer unlocks the editor early. Creation should follow fluency, not
  wall-clock age.
- Result screens now produce one short next-action card: Try Again, Next, Retry
  for a medal target, or return/share after daily.
- Journey logic is pure and UI-only. It never touches physics, replay,
  fingerprints, or serialization.

## Implementation notes

- `js/player-journey.js` owns the pure stage/action/feature model.
- `js/menu-stage.js` is now a compatibility wrapper around the journey model.
- `js/menu-ui.js` consumes the journey state for menu labels and staged surfaces.
- `js/result-ui.js` consumes the journey state for next-action copy and for
  hiding ghost/replay language before Grove 2.
- `index.html` loads the journey module before menu staging and includes a small
  result journey card slot.

## Validation

Unit tests cover:

- brand-new player hides all meta systems
- Grove 1 hides ghost/daily/editor/gallery
- Grove 2 exposes Race Yourself and keeps Create hidden
- Grove 3 exposes Create Levels and gallery when a custom exists
- failed result pushes Try Again
- first clear pushes Next
- medal miss offers focused retry
- daily/ghost language waits until Grove 2
