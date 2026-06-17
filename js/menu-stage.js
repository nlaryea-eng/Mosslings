'use strict';
/**
 * MOSSLINGS — menu onboarding stage model.
 *
 * A pure, DOM-free source of truth for *which menu surfaces are unlocked* and
 * *how much of the carousel to render*. The old menu revealed everything the
 * instant Level 1 was cleared (a content dump); this paces capability by
 * progression and tenure so each surface arrives as a small reward:
 *
 *   - grove carousel + controls : once Level 1 is cleared
 *   - daily / ghost race        : once the player reaches Grove 2
 *   - level editor              : once they reach Grove 3, OR ~week three by tenure
 *   - my levels (gallery)       : once the editor is unlocked and a custom exists
 *
 * Keeping this logic pure means the whole progression curve is unit-testable
 * without a clock or a DOM, and the menu just renders the result.
 *
 * IMPORTANT: tenure is wall-clock and MUST stay menu-only. It must never enter
 * the simulation update() path (see the determinism invariant).
 */
const EDITOR_TENURE_DAYS = 14; // entering "week three" unlocks the editor by tenure
const CAROUSEL_WINDOW_RADIUS = 3; // render at most 2*r+1 grove cards regardless of count

function menuFeatureState({
    unlocked = 0,
    daysSinceFirstPlay = 0,
    customLevelCount = 0,
    groveSize = 7,
    editorTenureDays = EDITOR_TENURE_DAYS,
} = {}) {
    const u = Math.max(0, unlocked | 0);
    const days = Math.max(0, Number(daysSinceFirstPlay) || 0);
    const customs = Math.max(0, customLevelCount | 0);
    const size = Math.max(1, groveSize | 0);

    const groveMenu = u >= 1;                 // cleared Level 1
    const controls = u >= 1;
    const daily = u >= size;                  // reached Grove 2
    const editor = u >= size * 2 || days >= editorTenureDays; // Grove 3 or tenured
    const gallery = editor && customs > 0;

    let stage = 'newcomer';
    if (groveMenu) stage = 'learning';
    if (daily) stage = 'explorer';
    if (editor) stage = 'veteran';

    return { stage, groveMenu, controls, daily, editor, gallery };
}

/**
 * Indices of the groves to actually render, bounded to a small window around the
 * selection so a 100-grove campaign costs the same to render as a 3-grove one.
 * For small campaigns it returns every grove (so nothing visibly changes today).
 */
function carouselWindow(selected, count, radius = CAROUSEL_WINDOW_RADIUS) {
    const c = Math.max(0, count | 0);
    if (c === 0) return [];
    const sel = Math.max(0, Math.min(c - 1, selected | 0));
    const size = Math.min(c, Math.max(1, radius | 0) * 2 + 1);
    let start = sel - ((size - 1) >> 1);
    if (start < 0) start = 0;
    if (start + size > c) start = c - size;
    const out = [];
    for (let i = 0; i < size; i++) out.push(start + i);
    return out;
}

function menuDaysBetween(aIso, bIso) {
    const a = Date.parse(aIso || '');
    const b = Date.parse(bIso || '');
    if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
    return Math.max(0, Math.floor((b - a) / 86400000));
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        EDITOR_TENURE_DAYS,
        CAROUSEL_WINDOW_RADIUS,
        menuFeatureState,
        carouselWindow,
        menuDaysBetween,
    };
}
