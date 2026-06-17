'use strict';
/**
 * MOSSLINGS — stretched player journey model.
 *
 * Pure, DOM-free product logic for the main funnel. The game already owns many
 * strong systems; this model decides *when* they are emotionally useful:
 *
 *   Grove 1: Save   — one obvious campaign path.
 *   Grove 2: Race   — medals, daily, and the personal ghost become meaningful.
 *   Grove 3: Create — editor/gallery/custom sharing arrive after fluency.
 *
 * Nothing here enters simulation, replay, physics, fingerprints, or saves beyond
 * reading progression. It is UI-only by design.
 */
const JOURNEY_GROVE_SIZE = 7;

function journeyClampInt(v, fallback = 0) {
    const n = Number(v);
    if (!Number.isFinite(n)) return fallback;
    return Math.max(0, Math.floor(n));
}

function journeyStageForUnlocked(unlocked = 0, groveSize = JOURNEY_GROVE_SIZE) {
    const u = journeyClampInt(unlocked);
    const size = Math.max(1, journeyClampInt(groveSize, JOURNEY_GROVE_SIZE));
    if (u >= size * 2) return 'create'; // Grove 3: Learn to Create
    if (u >= size) return 'race';       // Grove 2: Learn to Improve / Race Yourself
    if (u >= 1) return 'save';          // Grove 1 after the first clear
    return 'newcomer';
}

function journeyGroveNumberForUnlocked(unlocked = 0, groveSize = JOURNEY_GROVE_SIZE) {
    const stage = journeyStageForUnlocked(unlocked, groveSize);
    if (stage === 'create') return 3;
    if (stage === 'race') return 2;
    return 1;
}

function journeyFeatureFlags({ unlocked = 0, customLevelCount = 0, groveSize = JOURNEY_GROVE_SIZE } = {}) {
    const stage = journeyStageForUnlocked(unlocked, groveSize);
    const customs = journeyClampInt(customLevelCount);
    const savePlus = stage !== 'newcomer';
    const racePlus = stage === 'race' || stage === 'create';
    const create = stage === 'create';
    return {
        stage,
        grove: journeyGroveNumberForUnlocked(unlocked, groveSize),
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

function journeyStageCopy(stage) {
    switch (stage) {
        case 'create':
            return {
                title: 'Grove 3: Create',
                promise: 'Make a challenge for someone else.',
                question: 'Can you make a clever route?',
                primaryVerb: 'Create Levels',
            };
        case 'race':
            return {
                title: 'Grove 2: Race',
                promise: 'Beat your best run.',
                question: 'Can you save them better?',
                primaryVerb: 'Race Yourself',
            };
        case 'save':
            return {
                title: 'Grove 1: Save',
                promise: 'Get the moss folk home.',
                question: 'Can you get them home?',
                primaryVerb: 'Continue',
            };
        default:
            return {
                title: 'Grove 1: Save',
                promise: 'Guide the moss folk to the portal.',
                question: 'Can you get them home?',
                primaryVerb: 'Start',
            };
    }
}

function journeyMenuModel({ unlocked = 0, customLevelCount = 0, groveSize = JOURNEY_GROVE_SIZE, recommendedLevel = 0 } = {}) {
    const features = journeyFeatureFlags({ unlocked, customLevelCount, groveSize });
    const stageCopy = journeyStageCopy(features.stage);
    const rec = journeyClampInt(recommendedLevel);
    const primaryAction = features.stage === 'newcomer'
        ? { id: 'start', label: 'Start' }
        : { id: 'continue', label: rec > 0 ? `Continue P${rec + 1}` : 'Continue' };
    const secondaryActions = [];
    if (features.daily) secondaryActions.push({ id: 'daily', label: 'Race Yourself' });
    if (features.editor) secondaryActions.push({ id: 'editor', label: 'Create Levels' });
    if (features.gallery) secondaryActions.push({ id: 'gallery', label: 'My Levels' });
    return {
        stage: features.stage,
        grove: features.grove,
        features,
        copy: stageCopy,
        primaryAction,
        secondaryActions,
        coaching: features.stage === 'newcomer'
            ? 'Build before the first gap.'
            : stageCopy.promise,
    };
}

function journeyResultModel({
    win = false,
    runMode = 'campaign',
    levelIdx = 0,
    unlocked = 0,
    hasNext = false,
    target = null,
    allMedals = false,
    victory = false,
    dailyBestIsNew = false,
    groveSize = JOURNEY_GROVE_SIZE,
} = {}) {
    const features = journeyFeatureFlags({ unlocked, groveSize });
    const stageCopy = journeyStageCopy(features.stage);
    if (!win) {
        return {
            stage: features.stage,
            primary: { id: 'retry', label: 'Try Again' },
            coaching: 'Change one assignment, then run it again.',
            showShare: false,
            showReplay: features.ghost,
            showRetryMedal: false,
        };
    }
    if (runMode === 'daily') {
        return {
            stage: features.stage,
            primary: { id: dailyBestIsNew ? 'share' : 'done', label: dailyBestIsNew ? 'Share Run' : 'Done' },
            coaching: features.ghost ? 'Race your best run tomorrow.' : 'Daily opens in Grove 2.',
            showShare: true,
            showReplay: features.ghost,
            showRetryMedal: false,
        };
    }
    if (victory) {
        return {
            stage: features.stage,
            primary: { id: 'menu', label: 'The End' },
            coaching: 'You cleared every grove.',
            showShare: true,
            showReplay: features.ghost,
            showRetryMedal: false,
        };
    }
    const missedMedal = !!(target && !allMedals);
    if (missedMedal) {
        return {
            stage: features.stage,
            primary: { id: hasNext ? 'next' : 'menu', label: hasNext ? `Next P${journeyClampInt(levelIdx) + 2}` : 'Menu' },
            coaching: `Optional: retry for ${target.short || 'Gold'}.`,
            showShare: features.stage !== 'newcomer',
            showReplay: features.ghost,
            showRetryMedal: true,
            retryLabel: target.short ? `Retry: ${target.short}` : 'Retry for Gold',
        };
    }
    return {
        stage: features.stage,
        primary: { id: hasNext ? 'next' : 'menu', label: hasNext ? `Next P${journeyClampInt(levelIdx) + 2}` : 'Menu' },
        coaching: stageCopy.promise,
        showShare: features.stage !== 'newcomer',
        showReplay: features.ghost,
        showRetryMedal: false,
    };
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        JOURNEY_GROVE_SIZE,
        journeyStageForUnlocked,
        journeyGroveNumberForUnlocked,
        journeyFeatureFlags,
        journeyStageCopy,
        journeyMenuModel,
        journeyResultModel,
    };
}
