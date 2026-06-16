# Opus Prompt: Replace Skill Buttons With Real Retro Pixel Art

You are Opus working in the existing Mosslings HTML/JS/CSS browser-game repo.
Your goal is to fix the skill toolbar art. Be direct and critical: the current
skill buttons have a retro-looking surface, but the glyphs themselves are not
credible retro game implementation.

## Context

Mosslings is a dependency-free canvas game. The current skill toolbar uses
inline SVG glyph strings from `js/icons.js`, installed into buttons by `js/ui.js`
and styled by `style.css`.

The latest rendered check shows the skill buttons are technically consistent but
visually weak:

- The glyphs are abstract silhouettes, not readable job badges or tiny game-art
  objects.
- Disabled buttons collapse into low-contrast smudges.
- Several icons are differentiated mostly by label text, not by image.
- The style reads like crude UI symbols placed inside a retro skin, rather than
  like purpose-built arcade assets.
- The 16x16 grid is too cramped for several metaphors as currently drawn.

Do not solve this by returning to emoji. Do not add a remote icon set. Do not
turn the toolbar into a modern flat-icon bar.

## Required Outcome

Replace the skill-button visuals with cohesive hand-authored pixel art that
reads at desktop and landscape-phone toolbar sizes.

Required skill icons:

- Block
- Build
- Bash
- Mine
- Dig
- Float
- Climb
- Boom

The buttons should feel like late-90s/early-2000s browser/arcade job badges:
chunky, clear, color-coded, with silhouette and internal contrast doing most of
the work. They should still be small and restrained enough to fit the existing
toolbar.

## Constraints

- Keep the game dependency-free.
- Keep `js/icons.js` as the central icon source unless you have a strong reason
  and document it.
- Keep all critical UI free of platform emoji.
- Preserve existing controls, hotkeys, tests, campaign solves, and P1-P4 flows.
- Do not change gameplay rules, physics, level geometry, serialization, or the
  music system.
- Do not ship a large raster sprite sheet unless the final file is tiny and the
  reason is documented. Inline SVG or CSS-pixel blocks are preferred.
- The solution must work from `file://` and static hosting.

## Recommended Direction

Use a larger authored art grid internally, such as 24x24 or 32x32, then render
inside the existing button icon slot. The current 16x16 approach is part of the
readability problem.

Each icon should have:

- A dark 1px outline or equivalent contrast boundary.
- One dominant object/pose, not a collection of tiny marks.
- A distinct silhouette before color is considered.
- A small, consistent palette: outline, shadow, main fill, highlight/accent.
- Disabled-state readability after grayscale/opacity.

Suggested metaphors:

- Block: planted mossling or red stop stance with broad feet and arms.
- Build: stair/bridge segment plus hammer, with the stair silhouette dominant.
- Bash: forward fist/ram with motion block, clearly horizontal.
- Mine: diagonal pick and diagonal tunnel wedge.
- Dig: vertical shovel/scoop or downward shaft silhouette.
- Float: umbrella canopy with dangling mossling/strap.
- Climb: ladder/handholds with upward body/hand shape.
- Boom: fuse bomb or blast mark with strong warning outline.

## Delegation Plan

Use Sonnet for implementation work:

- Own `js/icons.js` and any required `style.css` icon sizing/state changes.
- Produce the replacement icon set and keep the existing `SKILL_ICONS[skill]`
  API stable.
- Preserve the current tests unless updating them is necessary for the new grid.
- Avoid unrelated UI or gameplay edits.

Use Haiku for focused QA and inventory:

- Compare each new icon against the old one at desktop toolbar size and
  landscape-phone width.
- Check disabled, active, and empty-count states.
- Run an emoji sweep over runtime UI.
- Verify `node tests/run-tests.js`, syntax checks, and a browser screenshot pass.
- Report which icons remain ambiguous at phone scale.

Opus should coordinate the work:

- First, inspect the current implementation and rendered toolbar before editing.
- Decide whether to stay SVG-only or use a tiny local raster/sprite asset.
- Give Sonnet a concrete art-spec table with grid size, palette, and per-icon
  silhouette requirements.
- Give Haiku a precise verification checklist and screenshots to inspect.
- Review their outputs critically and make final integration decisions.

## Verification Requirements

Run:

```sh
node tests/run-tests.js
node --check js/icons.js
node --check js/ui.js
git diff --check
```

Perform browser checks for:

- First-run menu.
- Level 1 guided onboarding.
- Toolbar icons at desktop width.
- Toolbar icons at landscape-phone width around 667x375.
- Active, disabled, and zero-count button states.
- Touch magnifier/pending target still renders.
- Result card medals still use the shared icon system.
- No visible emoji in normal gameplay UI.
- No console errors.

## Acceptance Criteria

This work is not done until a human can identify all 8 skills from the icon
shape plus color before reading the label, at phone toolbar size. If two icons
are still only distinguishable by text, the pass failed.

Document the final art system briefly in the repo: grid size, palette, files
changed, and how to add a ninth skill icon later.
