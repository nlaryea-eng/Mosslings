'use strict';
/**
 * Static-hostable daily challenge helpers.
 *
 * The daily is deliberately just a deterministic campaign-level selection:
 * no backend, no clock writes, and no Math.random. UTC keeps a shared link
 * pointing at the same challenge worldwide.
 */

const DAILY_SALT = 'mosslings-daily-v1';
const DAILY_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

function dailyDateKey(now = new Date()) {
    return now.toISOString().slice(0, 10);
}

function hashDailyKey(key) {
    let h = 2166136261;
    const text = `${DAILY_SALT}:${key}`;
    for (let i = 0; i < text.length; i++) {
        h ^= text.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    return h >>> 0;
}

function isValidDailyKey(key) {
    if (typeof key !== 'string' || !DAILY_KEY_RE.test(key)) return false;
    const d = new Date(`${key}T00:00:00.000Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === key;
}

function dailyChallengeForDate(key = dailyDateKey()) {
    if (!isValidDailyKey(key) || typeof LEVELS === 'undefined' || !LEVELS.length) return null;
    const levelIdx = hashDailyKey(key) % LEVELS.length;
    return {
        key,
        levelIdx,
        levelName: LEVELS[levelIdx].name,
        label: `Daily ${key}`,
    };
}

function compareDailyResults(a, b) {
    if (!a) return b ? -1 : 0;
    if (!b) return 1;
    const aWin = a.win ? 1 : 0;
    const bWin = b.win ? 1 : 0;
    if (aWin !== bWin) return aWin - bWin;
    if (a.pct !== b.pct) return a.pct - b.pct;
    if (a.medalCount !== b.medalCount) return a.medalCount - b.medalCount;
    if (a.skills !== b.skills) return b.skills - a.skills; // fewer skills is better
    if (a.timeSeconds !== b.timeSeconds) return b.timeSeconds - a.timeSeconds; // faster is better
    return 0;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        dailyDateKey,
        hashDailyKey,
        isValidDailyKey,
        dailyChallengeForDate,
        compareDailyResults,
    };
}
