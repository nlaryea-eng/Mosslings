'use strict';
/**
 * MOSSLINGS — local persistence.
 *
 * A thin, defensive wrapper over localStorage (it swallows private-mode and
 * quota errors so the game never hard-fails on a blocked store). Extracted
 * from game.js so the simulation engine no longer owns persistence concerns.
 *
 * Depends on daily.js (compareDailyResults) and daily-ghost.js
 * (DAILY_GHOST_HISTORY_LIMIT, compareDailyGhostRecords, pruneDailyGhostHistory,
 * dailyGhostOutcome), so it must load after both and before game.js.
 */
class StorageManager {
    constructor() { this.prefix = 'mosslings_'; }
    save(key, val) { try { localStorage.setItem(this.prefix + key, JSON.stringify(val)); } catch (e) { /* private mode */ } }
    load(key, def) {
        try {
            const val = localStorage.getItem(this.prefix + key);
            return val ? JSON.parse(val) : def;
        } catch (e) { return def; }
    }
    getUnlocked() { return this.load('unlocked', 0); }
    setUnlocked(idx) { if (idx > this.getUnlocked()) this.save('unlocked', idx); }
    getBest(idx) { return this.load('best', {})[idx] ?? null; }
    setBest(idx, pct) {
        const best = this.load('best', {});
        if (pct > (best[idx] ?? -1)) { best[idx] = pct; this.save('best', best); }
    }
    getMedals(idx) { return this.load('medals', {})[idx] ?? { time: 0, skills: 0, saved: 0 }; }
    setMedals(idx, m) {
        const all = this.load('medals', {});
        const cur = all[idx] || { time: 0, skills: 0, saved: 0 };
        all[idx] = {
            time: Math.max(cur.time, m.time),
            skills: Math.max(cur.skills, m.skills),
            saved: Math.max(cur.saved, m.saved)
        };
        this.save('medals', all);
    }
    getDailyResult(key) { return this.load('daily', {})[key] ?? null; }
    setDailyResult(key, result) {
        const all = this.load('daily', {});
        const cur = all[key] || null;
        const attempts = (cur && cur.attempts ? cur.attempts : 0) + 1;
        const next = { ...result, attempts };
        const best = compareDailyResults(next, cur) > 0 ? next : { ...cur, attempts };
        all[key] = best;
        this.save('daily', all);
        return best;
    }
    getDailyGhosts() { return this.load('dailyGhosts', {}) || {}; }
    getDailyGhost(key) { return this.getDailyGhosts()[key] || null; }
    setDailyGhost(key, record, limit = DAILY_GHOST_HISTORY_LIMIT) {
        const all = this.getDailyGhosts();
        const previous = all[key] || null;
        const stored = compareDailyGhostRecords(record, previous) > 0;
        if (stored) all[key] = { ...record, key };
        const pruned = pruneDailyGhostHistory(all, limit);
        this.save('dailyGhosts', pruned);
        return dailyGhostOutcome(record, previous, stored);
    }
    getRunStreak() {
        const s = this.load('streak', { current: 0, best: 0 }) || {};
        const current = Math.max(0, Number(s.current) | 0);
        const best = Math.max(0, Number(s.best) | 0, current);
        return { current, best };
    }
    // Onboarding tenure: the first time the menu is built we stamp a wall-clock
    // date so feature pacing can reward returning over days (menu-only — never
    // read by the simulation).
    getFirstSeenAt() { return this.load('firstSeenAt', null); }
    markFirstSeen(nowIso) {
        let v = this.getFirstSeenAt();
        if (!v) { v = nowIso || new Date().toISOString(); this.save('firstSeenAt', v); }
        return v;
    }
    // Which newly-unlocked menu surfaces the player has already acknowledged, so
    // a "NEW" reveal badge shows once and then stops nagging.
    getMenuRevealSeen() { return this.load('menuRevealSeen', {}); }
    hasMenuRevealSeen(name) { return !!this.getMenuRevealSeen()[name]; }
    markMenuRevealSeen(name) {
        const seen = this.getMenuRevealSeen();
        if (!seen[name]) { seen[name] = 1; this.save('menuRevealSeen', seen); }
    }
    getChapterRewardSeen() { return this.load('chapterRewardSeen', {}); }
    hasChapterRewardSeen(chapter) { return !!this.getChapterRewardSeen()[chapter]; }
    markChapterRewardSeen(chapter) {
        const seen = this.getChapterRewardSeen();
        if (!seen[chapter]) { seen[chapter] = 1; this.save('chapterRewardSeen', seen); }
    }
    recordRunOutcome(win) {
        const prev = this.getRunStreak();
        const current = win ? prev.current + 1 : 0;
        const next = { current, best: Math.max(prev.best, current) };
        this.save('streak', next);
        return { ...next, previous: prev.current, win: !!win };
    }
    // First-encounter coaching: which campaign levels the player has already
    // started once (so the new-mechanic nudge fires only the first time).
    getSeen() { return this.load('seen', {}); }
    isSeen(idx) { return !!this.getSeen()[idx]; }
    markSeen(idx) { const s = this.getSeen(); if (!s[idx]) { s[idx] = 1; this.save('seen', s); } }
    getCustomLevels() { return this.load('custom', []); }
    saveCustomLevel(level) {
        const list = this.getCustomLevels();
        // Overwrite if name matches, else push
        const idx = list.findIndex(l => l.name === level.name);
        if (idx !== -1) list[idx] = level;
        else list.push(level);
        this.save('custom', list);
    }
    deleteCustomLevel(name) {
        const list = this.getCustomLevels().filter(l => l.name !== name);
        this.save('custom', list);
    }
}
const storage = new StorageManager();

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { StorageManager, storage };
}
