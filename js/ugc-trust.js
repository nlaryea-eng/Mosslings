'use strict';
/**
 * Custom-level trust language.
 *
 * Heuristic checks are useful, but they must never be presented as proof. The
 * badge priority below ensures only replay-backed states use verified wording.
 */
const UGC_TRUST_COPY = {
    unverified: {
        label: 'Unverified',
        message: 'This level has not been checked.',
        rank: 0,
    },
    structurally_valid: {
        label: 'Structurally Valid',
        message: 'Required objects exist. Solvability is unknown.',
        rank: 1,
    },
    heuristic_plausible: {
        label: 'No Obvious Dead End Found',
        message: 'Basic checks passed. This is not a proof.',
        rank: 2,
    },
    creator_clear_attached: {
        label: 'Creator Cleared',
        message: 'The creator attached a clear replay for this exact version.',
        rank: 3,
    },
    replay_verified: {
        label: 'Replay Verified',
        message: 'A clear replay was validated locally for this exact version.',
        rank: 4,
    },
    official_curated: {
        label: 'Official',
        message: 'Included or curated by the Mosslings team.',
        rank: 5,
    },
};

function ugcTrustFingerprint(level) {
    return typeof levelFingerprint === 'function' ? levelFingerprint(level) : null;
}

function sameTrustFingerprint(entry, fingerprint) {
    return !!entry && !!fingerprint && entry.fingerprint === fingerprint;
}

function ugcTrustState(level, opts = {}) {
    if (!level) return 'unverified';
    const fp = ugcTrustFingerprint(level);
    const trust = level.ugcTrust || {};
    if (opts.official || level.officialCurated || trust.officialCurated) return 'official_curated';
    if (sameTrustFingerprint(trust.replayVerified, fp)) return 'replay_verified';
    if (sameTrustFingerprint(trust.creatorClear, fp)) return 'creator_clear_attached';

    const err = typeof validateLevelStructure === 'function' ? validateLevelStructure(level) : null;
    if (err) return 'unverified';
    const solve = opts.solvability || (typeof analyzeSolvability === 'function' ? analyzeSolvability(level) : null);
    if (solve && solve.status === 'ok') return 'heuristic_plausible';
    return 'structurally_valid';
}

function ugcTrustBadge(level, opts = {}) {
    const state = ugcTrustState(level, opts);
    return { state, ...(UGC_TRUST_COPY[state] || UGC_TRUST_COPY.unverified) };
}

function ugcTrustMeta(level, opts = {}) {
    const fp = ugcTrustFingerprint(level);
    const solve = opts.solvability || (typeof analyzeSolvability === 'function' ? analyzeSolvability(level) : null);
    return {
        ...(level && level.ugcTrust ? level.ugcTrust : {}),
        fingerprint: fp,
        structural: typeof validateLevelStructure === 'function' ? !validateLevelStructure(level) : false,
        heuristic: solve ? { status: solve.status, reason: solve.reason } : null,
    };
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        UGC_TRUST_COPY,
        ugcTrustState,
        ugcTrustBadge,
        ugcTrustMeta,
    };
}
