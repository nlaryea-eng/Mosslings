# Skill Button Art Redesign — 2026-06-16

Replaced the cramped 16×16 abstract skill glyphs with cohesive hand-authored
pixel badges. Carried out the brief in
`docs/prompts/2026-06-16-opus-skill-button-art-redesign.md`.

## Art system

- **Grid:** 24×24 inline SVG (`viewBox="0 0 24 24"`), rendered 1:1 at 24px on
  desktop, 20px on phones. The old 16×16 grid was too cramped for the
  metaphors and is the main thing that changed.
- **No new dependencies / no raster.** Still inline SVG `<rect>` art built from
  the existing `r(x,y,w,h,fill)` helper in `js/icons.js`; works from `file://`.
- **3-tone recipe per badge:** a dark **outline**, a mid **fill** (the skill's
  hue), and a light **highlight**. The luminance contrast survives the disabled
  `grayscale()` pass, so disabled buttons read as shapes, not grey smudges.
- **One dominant silhouette per badge** — read shape first, color second, label
  last. Silhouettes are deliberately distinct:

  | Skill | Silhouette | Hue (outline / fill / highlight) |
  |---|---|---|
  | Block | planted figure, arms wide, broad feet | `#5e1410 / #e8503e / #ffb3a7` |
  | Build | rising staircase + small hammer | `#5e3a10 / #f0a93a / #ffe39a` |
  | Bash | forward fist + motion streaks (horizontal) | `#5e2a14 / #ef8a5f / #ffc6ad` |
  | Mine | pickaxe, diagonal handle (diagonal) | `#1a2a52 / #6f9be8 / #cfe0ff` |
  | Dig | downward shovel, metal spade (vertical) | `#3a2c24 / #9c8579 / #c9d2d6` |
  | Float | umbrella canopy + dangling mossling | `#0d4750 / #34c0d4 / #b3eef5` |
  | Climb | ladder: two rails + rungs | `#1b4d1f / #66bb6a / #c8e6c9` |
  | Boom | round bomb + sparking fuse | `#5e1e0a / #f4511e / #ffeb3b` |

The three **medals** were brought onto the same system (24×24, 3-tone, baked
colours via `pixelSvg24`). They differ by **shape + ribbon colour**, not metal
alone, so they don't collapse into "same disc, different tint":

  | Medal | Silhouette | Metal / ribbon |
  |---|---|---|
  | Rescue (gold) | trophy cup w/ handles + base | gold, no ribbon |
  | Efficiency (silver) | disc + star emblem | silver, blue ribbon |
  | Speed (bronze) | disc + forward chevron | bronze, green ribbon |

The medals render everywhere they did before (HUD pace, level-select, gallery,
result overlay) — same `UI_ICONS` keys, so all call sites updated at once. The
other control glyphs (`play`, `pause`, `reset`, etc.) stay on the 16×16 grid.

## Files changed

- `js/icons.js` — new `skillSvg`/`_skill`/`pixelSvg24` helpers, the 8 redrawn
  `SKILL_ICONS`, and the 3 redrawn medal icons in `UI_ICONS`.
- `style.css` — skill icons render at 24px (`.skill-btn .skill-icon`); disabled
  state softened to `opacity:0.45; grayscale(0.55)` for legibility.
- `tests/run-tests.js` — skill-icon test now asserts the 24×24 grid, an emoji
  sweep, and a ≥3-fill (3-tone) check so a future flat glyph fails CI; a new
  test enforces the same 24×24 + 3-tone recipe on the three medals.

## Adding a 9th skill icon later

Copy one `_skill('skill-xxx', …)` block in `js/icons.js`, pick a new
outline/fill/highlight triple in a fresh hue, and keep a single dominant object
so the silhouette stays unique at phone toolbar size. No CSS change needed (the
`.skill-icon` sizing rule already covers any new badge).

## Verification

- `node tests/run-tests.js` → 80 passed, 0 failed.
- `node --check js/icons.js`, `node --check js/ui.js`, `git diff --check` → clean.
- Browser (Chrome via preview): desktop + 440px label-free toolbar, active /
  disabled / zero-count states, onboarding, no console errors, no emoji in
  gameplay UI. All 8 skills identifiable by shape + color with labels hidden.
