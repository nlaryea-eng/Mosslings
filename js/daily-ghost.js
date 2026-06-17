'use strict';
/**
 * Local Daily Ghost helpers.
 *
 * The ghost is a personal-best replay for a UTC daily key. It stays local-only
 * and bounded so static hosting does not grow unbounded storage.
 */
const DAILY_GHOST_HISTORY_LIMIT = 14;

function dailyGhostTimestampMs(value) {
    const t = Date.parse(value || '');
    return Number.isFinite(t) ? t : Number.POSITIVE_INFINITY;
}

function compareDailyGhostRecords(a, b) {
    if (!a) return b ? -1 : 0;
    if (!b) return 1;
    const savedA = Number(a.saved ?? (a.summary && a.summary.saved) ?? 0);
    const savedB = Number(b.saved ?? (b.summary && b.summary.saved) ?? 0);
    if (savedA !== savedB) return savedA - savedB;
    const timeA = Number(a.timeSeconds ?? (a.summary && a.summary.timeSeconds) ?? Number.POSITIVE_INFINITY);
    const timeB = Number(b.timeSeconds ?? (b.summary && b.summary.timeSeconds) ?? Number.POSITIVE_INFINITY);
    if (timeA !== timeB) return timeB - timeA; // lower time is better
    const skillsA = Number(a.skills ?? (a.summary && a.summary.skills) ?? Number.POSITIVE_INFINITY);
    const skillsB = Number(b.skills ?? (b.summary && b.summary.skills) ?? Number.POSITIVE_INFINITY);
    if (skillsA !== skillsB) return skillsB - skillsA; // fewer skills is better
    return dailyGhostTimestampMs(b.completedAt) - dailyGhostTimestampMs(a.completedAt); // earlier is better
}

function pruneDailyGhostHistory(records, limit = DAILY_GHOST_HISTORY_LIMIT) {
    const all = records && typeof records === 'object' ? records : {};
    const entries = Object.entries(all).sort((a, b) => {
        if (a[0] !== b[0]) return a[0] < b[0] ? 1 : -1;
        return 0;
    });
    return Object.fromEntries(entries.slice(0, Math.max(1, limit | 0)));
}

function fmtGhostTime(seconds) {
    const s = Math.max(0, Math.round(Number(seconds) || 0));
    return Math.floor(s / 60) + ':' + (s % 60).toString().padStart(2, '0');
}

function dailyGhostSummaryText(record) {
    if (!record) return '';
    const saved = Number(record.saved ?? (record.summary && record.summary.saved) ?? 0);
    const total = Number(record.total ?? (record.summary && record.summary.total) ?? 0);
    const pct = total ? Math.round(saved / total * 100) : Number(record.pct ?? (record.summary && record.summary.pct) ?? 0);
    const time = Number(record.timeSeconds ?? (record.summary && record.summary.timeSeconds) ?? 0);
    const skills = Number(record.skills ?? (record.summary && record.summary.skills) ?? 0);
    return `Best ${pct}% · ${fmtGhostTime(time)} · ${skills} skill${skills === 1 ? '' : 's'}`;
}

function dailyGhostDelta(candidate, previous) {
    if (!candidate || !previous) return null;
    const saved = Number(candidate.saved || 0) - Number(previous.saved || 0);
    const time = Number(candidate.timeSeconds || 0) - Number(previous.timeSeconds || 0);
    const skills = Number(candidate.skills || 0) - Number(previous.skills || 0);
    const signed = (n) => n > 0 ? `+${n}` : `${n}`;
    const timeAbs = fmtGhostTime(Math.abs(time));
    return {
        saved,
        time,
        skills,
        text: `Saved ${signed(saved)} · Time ${time <= 0 ? '-' : '+'}${timeAbs} · Skills ${signed(skills)}`,
    };
}

function makeDailyGhostRecord({ key, levelIdx, levelName, result, replayCode, fingerprint, completedAt = new Date().toISOString() }) {
    if (!result || !replayCode || !fingerprint) return null;
    const saved = Number(result.saved || 0);
    const total = Number(result.total || 0);
    const timeSeconds = Number(result.timeSeconds || 0);
    const skills = Number(result.skills || 0);
    const pct = total ? Math.round(saved / total * 100) : Number(result.pct || 0);
    return {
        key,
        levelIdx,
        levelName,
        fingerprint,
        alg: typeof LEVEL_FINGERPRINT_ALG !== 'undefined' ? LEVEL_FINGERPRINT_ALG : 'unknown',
        app: typeof APP_VERSION !== 'undefined' ? APP_VERSION : 'dev',
        replay: {
            schema: typeof REPLAY_FORMAT_VERSION !== 'undefined' ? REPLAY_FORMAT_VERSION : 2,
            kind: 'daily',
            code: replayCode,
            fingerprint,
        },
        summary: { saved, total, pct, timeSeconds, skills, completedAt },
        saved,
        total,
        pct,
        timeSeconds,
        skills,
        completedAt,
    };
}

function dailyGhostOutcome(candidate, previous, stored) {
    const state = !previous && stored ? 'set' : (stored ? 'beat' : 'behind');
    return {
        state,
        candidate,
        previous,
        stored: !!stored,
        delta: previous ? dailyGhostDelta(candidate, previous) : null,
    };
}

function dailyGhostResultHtml(outcome) {
    if (!outcome || !outcome.candidate) return '';
    const title = outcome.state === 'set'
        ? 'New daily ghost set.'
        : outcome.state === 'beat'
            ? 'You beat your ghost.'
            : 'Ghost still ahead.';
    const delta = outcome.delta ? `<span>${outcome.delta.text}</span>` : `<span>${dailyGhostSummaryText(outcome.candidate)}</span>`;
    return `<div class="msg-daily msg-daily-ghost"><b>${title}</b>${delta}</div>`;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        DAILY_GHOST_HISTORY_LIMIT,
        compareDailyGhostRecords,
        pruneDailyGhostHistory,
        fmtGhostTime,
        dailyGhostSummaryText,
        dailyGhostDelta,
        makeDailyGhostRecord,
        dailyGhostOutcome,
        dailyGhostResultHtml,
    };
}
