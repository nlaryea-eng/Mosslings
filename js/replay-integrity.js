'use strict';
/**
 * Replay identity and validation helpers.
 *
 * This file deliberately stays pure: it does not start playback or mutate
 * storage. Callers get a validation object and decide how to present it.
 */
const LEVEL_FINGERPRINT_ALG = 'level-fnv1a32-v1';

function stableCanonicalString(value) {
    if (value === null || typeof value !== 'object') return JSON.stringify(value);
    if (Array.isArray(value)) return '[' + value.map(stableCanonicalString).join(',') + ']';
    const keys = Object.keys(value).sort();
    return '{' + keys.map(k => JSON.stringify(k) + ':' + stableCanonicalString(value[k])).join(',') + '}';
}

function fnv1a32Hex(text) {
    let h = 2166136261;
    for (let i = 0; i < text.length; i++) {
        h ^= text.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    return (h >>> 0).toString(16).padStart(8, '0');
}

function canonicalLevelGameplay(level) {
    if (!level) return null;
    const num = (v, d = 0) => Number.isFinite(Number(v)) ? Number(v) : d;
    const inv = [];
    for (let i = 0; i < 8; i++) inv.push(num(level.inventory && level.inventory[i]));
    return {
        constants: {
            levelFormat: typeof LEVEL_FORMAT_VERSION !== 'undefined' ? LEVEL_FORMAT_VERSION : 0,
            w: W,
            h: H,
            rateMin: RATE_MIN,
            rateMax: RATE_MAX,
        },
        totalSpawn: num(level.totalSpawn),
        reqSaved: num(level.reqSaved),
        time: num(level.time),
        spawnRate: num(level.spawnRate),
        spawn: { x: num(level.spawn && level.spawn.x), y: num(level.spawn && level.spawn.y) },
        exit: {
            x: num(level.exit && level.exit.x),
            y: num(level.exit && level.exit.y),
            athlete: !!(level.exit && level.exit.athlete),
        },
        inventory: inv,
        par: level.par ? {
            saved: num(level.par.saved),
            skills: num(level.par.skills),
            time: num(level.par.time),
        } : null,
        commands: (level.commands || []).map(c => ({
            type: num(c.type),
            x: num(c.x),
            y: num(c.y),
            w: num(c.w),
            h: num(c.h),
        })),
        objects: normalizeLevelObjects(level.objects || []).map(o => ({
            type: num(o.type),
            x: num(o.x),
            y: num(o.y),
            w: num(o.w),
            h: num(o.h),
            dx: num(o.dx),
            dy: num(o.dy),
            period: num(o.period),
            phase: num(o.phase),
            target: num(o.target),
            flags: num(o.flags),
        })),
    };
}

function levelFingerprint(level) {
    const canonical = canonicalLevelGameplay(level);
    return canonical ? fnv1a32Hex(stableCanonicalString(canonical)) : null;
}

function currentReplayLevel(replay) {
    if (!replay) return null;
    if (replay.kind === 'campaign') {
        const idx = replay.levelIdx | 0;
        return idx >= 0 && typeof LEVELS !== 'undefined' && idx < LEVELS.length ? LEVELS[idx] : null;
    }
    if (replay.kind === 'daily') {
        const challenge = dailyChallengeForDate(replay.dailyKey);
        return challenge ? LEVELS[challenge.levelIdx] : null;
    }
    if (replay.kind === 'custom') {
        if (replay.level) return replay.level;
        if (replay.levelCode) return deserializeLevel(replay.levelCode);
    }
    return null;
}

function fingerprintForReplay(replay) {
    return levelFingerprint(currentReplayLevel(replay));
}

function replayValidation(status, severity, message, replay = null, expectedFingerprint = null, actualFingerprint = null) {
    return {
        ok: severity !== 'refuse',
        status,
        severity,
        message,
        replay,
        expectedFingerprint,
        actualFingerprint,
    };
}

function validateReplayForPlayback(input) {
    let replay = null;
    let rawStatus = null;
    if (typeof input === 'string') {
        if (typeof parseReplayPayload !== 'function' || typeof replayFromPayload !== 'function') {
            return replayValidation('malformed', 'refuse', 'Replay support is unavailable.');
        }
        const parsed = parseReplayPayload(input);
        if (!parsed.ok) {
            const status = parsed.status || 'malformed';
            const msg = status === 'unsupported_schema'
                ? 'This replay was recorded with an unsupported replay format.'
                : 'That replay link is invalid or corrupted.';
            return replayValidation(status, 'refuse', msg);
        }
        rawStatus = parsed.status;
        replay = replayFromPayload(parsed.payload);
        if (!replay) {
            if (parsed.payload && parsed.payload.k === 'custom' && !parsed.payload.c) {
                return replayValidation('custom_level_unavailable', 'refuse', 'This custom replay does not include its level data.');
            }
            return replayValidation('malformed', 'refuse', 'That replay link is invalid or corrupted.');
        }
    } else if (input && typeof input === 'object') {
        replay = input;
    } else {
        return replayValidation('malformed', 'refuse', 'That replay link is invalid or corrupted.');
    }

    if (!replay || !Array.isArray(replay.actions)) {
        return replayValidation('malformed', 'refuse', 'That replay link is invalid or corrupted.');
    }
    if (replay.kind !== 'campaign' && replay.kind !== 'daily' && replay.kind !== 'custom') {
        return replayValidation('malformed', 'refuse', 'That replay link is invalid or corrupted.');
    }
    if (replay.kind === 'custom' && !replay.level && !replay.levelCode) {
        return replayValidation('custom_level_unavailable', 'refuse', 'This custom replay does not include its level data.', replay);
    }

    const level = currentReplayLevel(replay);
    if (!level) {
        const status = replay.kind === 'custom' ? 'custom_level_unavailable' : 'missing_level';
        const msg = replay.kind === 'custom'
            ? 'This custom replay does not include a playable level.'
            : 'This replay points at a level that is not available.';
        return replayValidation(status, 'refuse', msg, replay);
    }
    const actual = levelFingerprint(level);
    const expected = replay.fingerprint || null;
    const version = replay.schemaVersion || replay.v || null;

    if (version === 1 || replay.legacy || (!version && !expected)) {
        return replayValidation('legacy', 'warn', 'Legacy replay: level identity was not fingerprinted, so playback may drift.', replay, expected, actual);
    }
    if (rawStatus === 'missing_fingerprint' || version === 2 && !expected) {
        return replayValidation('missing_fingerprint', 'refuse', 'This replay is missing its level fingerprint.', replay, expected, actual);
    }
    if (expected !== actual) {
        return replayValidation('fingerprint_mismatch', 'refuse', 'Replay refused: the level changed since this run was recorded.', replay, expected, actual);
    }
    return replayValidation('valid', 'allow', 'Replay verified for this level version.', replay, expected, actual);
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        LEVEL_FINGERPRINT_ALG,
        stableCanonicalString,
        canonicalLevelGameplay,
        levelFingerprint,
        fingerprintForReplay,
        validateReplayForPlayback,
    };
}
