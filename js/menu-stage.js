'use strict';
/**
 * MOSSLINGS — menu onboarding stage model.
 *
 * Backward-compatible wrapper around the stretched journey model. Older menu
 * code/tests call `menuFeatureState`; the newer product language is owned by
 * `player-journey.js`:
 *
 *   Grove 1: Save   — campaign only, one obvious path.
 *   Grove 2: Race   — daily + personal ghost become the improvement loop.
 *   Grove 3: Create — editor/gallery/custom level tools arrive after fluency.
 *
 * Tenure no longer unlocks the editor: creation is a Grove 3 reward, not a
 * calendar surprise. This keeps returning Grove 2 players focused on improving
 * before asking them to author levels.
 */
const CAROUSEL_WINDOW_RADIUS = 3; // render at most 2*r+1 grove cards regardless of count
const EDITOR_TENURE_DAYS = Infinity; // legacy export; no longer used for unlocks

function menuFeatureState({
    unlocked = 0,
    customLevelCount = 0,
    groveSize = 7,
} = {}) {
    const features = typeof journeyFeatureFlags === 'function'
        ? journeyFeatureFlags({ unlocked, customLevelCount, groveSize })
        : fallbackMenuFeatureState({ unlocked, customLevelCount, groveSize });
    const legacyStage = features.stage === 'newcomer'
        ? 'newcomer'
        : features.stage === 'save'
            ? 'learning'
            : features.stage === 'race'
                ? 'explorer'
                : 'veteran';
    return {
        ...features,
        stage: legacyStage,
        journeyStage: features.stage,
        journeyGrove: features.grove,
    };
}

function fallbackMenuFeatureState({ unlocked = 0, customLevelCount = 0, groveSize = 7 } = {}) {
    const u = Math.max(0, unlocked | 0);
    const customs = Math.max(0, customLevelCount | 0);
    const size = Math.max(1, groveSize | 0);
    const savePlus = u >= 1;
    const racePlus = u >= size;
    const create = u >= size * 2;
    return {
        stage: create ? 'create' : racePlus ? 'race' : savePlus ? 'save' : 'newcomer',
        grove: create ? 3 : racePlus ? 2 : 1,
        groveMenu: savePlus,
        controls: savePlus,
        medals: savePlus,
        daily: racePlus,
        ghost: racePlus,
        editor: create,
        gallery: create && customs > 0,
        customLevels: create,
    };
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
