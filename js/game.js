'use strict';
/**
 * MOSSLINGS — game engine.
 *
 * Fixed-timestep simulation (60Hz regardless of monitor refresh — the
 * original stepped once per requestAnimationFrame, so a 144Hz display ran
 * the game 2.4x too fast). Rendering is decoupled and runs every frame.
 *
 * DOM bindings, the menu, and the level editor live in js/ui.js.
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
    getRunStreak() {
        const s = this.load('streak', { current: 0, best: 0 }) || {};
        const current = Math.max(0, Number(s.current) | 0);
        const best = Math.max(0, Number(s.best) | 0, current);
        return { current, best };
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

class Game {
    constructor() {
        this.canvas = document.getElementById('gameCanvas');
        this.ctx = this.canvas.getContext('2d');
        this.terrain = new Terrain(W, H);
        this.objects = [];
        this.switchState = {};
        this.particles = new Particles();
        this.spores = new Spores();
        this.levelIdx = 0; this.level = null; this.state = 'MENU';
        this.runMode = 'campaign'; this.dailyChallenge = null;
        this.lastCampaignLevelIdx = 0;
        this.mosslings = []; this.inventory = {}; this.selectedSkill = null;
        this.savedCount = 0; this.deadCount = 0; this.skillsUsed = 0;
        this.time = 0; this.spawnCounter = 0; this.spawnTimer = 0; this.spawnRate = 60;
        this.mouseX = -100; this.mouseY = -100;
        this.lastPointerTouch = false; // widens tap targeting for fat fingers
        this.hoverM = null;
        // Touch targeting: first tap freezes time + previews the nearest valid
        // mossling (pendingTarget); a second tap confirms. Render-only state —
        // never logged, so rewind/replay are untouched.
        this.pendingTarget = null; this.pausedForTouch = false;
        this.ffwd = false; this.nukeArmedAt = 0; this.nuked = false;
        this.shake = 0; this.hatchFlash = 0; this.tick = 0;
        // --- Game-feel ("juice") — all render-loop state, never read by the
        // deterministic sim. flash = full-screen tint that decays; hitStop =
        // freeze-frame count consumed by loop(); save streak escalates the
        // rescue chime + sparkle when rescues land in quick succession.
        this.flash = 0; this.flashColor = '#ffffff'; this.hitStop = 0;
        this.exitFlash = 0; // portal brightens briefly on each rescue
        this.deniedAt = -999; // render: tick of the last failed assignment (red ring)
        this.saveStreak = 0; this.lastSaveStep = -999;
        this.resultRecorded = false;
        // Failure diagnosis: deterministic per-cause death tally (set by die()
        // during the sim, read by the UI after a loss). retryHint carries the
        // last failure zone across a Retry; failHint is the render-only marker
        // shown at the start of the next attempt. None are read by the sim.
        this.deaths = this.freshDeaths();
        this.gateRejects = 0; this.gateRejectPos = null;
        this.gateRejectMissing = { floater: 0, climber: 0, both: 0 };
        this.retryHint = null; this.failHint = null;
        // Deterministic-replay backbone (Backspace rewind). `simStep` counts
        // actual simulation steps (one per update()), independent of render
        // frames and fast-forward — unlike `tick`, which advances once per
        // rendered frame and runs update() up to 4x under FFWD. Every
        // state-altering input is recorded against simStep so the run can be
        // re-simulated exactly. See rewind().
        this.simStep = 0; this.actionLog = []; this.replaying = false;
        // Ghost playback: when watching a shared replay, the recorded action log
        // drives the sim deterministically and player input is locked out. Set
        // by loadReplay(), cleared on every fresh loadLevel(). Render-only badge.
        this.ghostMode = false; this.ghostActions = null; this.ghostAI = 0;
        // First-run onboarding (Level 1 only, until cleared). Render-driven
        // coaching: pre-selects Builder, auto-pauses once when a mossling nears
        // the gap, and arrows the player to the right tap. No sim coupling.
        this.onboarding = false; this.onboardDone = false; this.onboardPausedOnce = false;
        // Accessibility: when the OS asks for reduced motion, the render-only
        // juice (full-screen flash, shake, freeze-frame) is suppressed. Read
        // once at startup and kept live; never consulted by the sim.
        this.reduceMotion = false;
        try {
            if (typeof matchMedia === 'function') {
                const mq = matchMedia('(prefers-reduced-motion: reduce)');
                this.reduceMotion = mq.matches;
                const onChange = (e) => {
                    this.reduceMotion = e.matches;
                    if (typeof haptics !== 'undefined') haptics.setReducedMotion(e.matches);
                };
                if (mq.addEventListener) mq.addEventListener('change', onChange);
                else if (mq.addListener) mq.addListener(onChange);
            }
        } catch (e) { /* matchMedia unavailable */ }
        this.debug = false;
        this.fps = 0; this.lastFpsUpdate = 0; this.frameCount = 0;
        this.lastT = 0; this.acc = 0;
        this.glowSprite = this.makeGlowSprite();
        // cached HUD elements
        this.el = {};
        for (const id of ['lbl-level', 'lbl-saved', 'lbl-req', 'lbl-alive', 'lbl-skills', 'lbl-time', 'lbl-rate']) {
            this.el[id] = document.getElementById(id);
        }
    }
    makeGlowSprite() {
        const c = document.createElement('canvas');
        c.width = c.height = 48;
        const ctx = c.getContext('2d');
        if (ctx.createRadialGradient) {
            const g = ctx.createRadialGradient(24, 24, 2, 24, 24, 24);
            g.addColorStop(0, 'rgba(255,160,60,0.55)');
            g.addColorStop(1, 'rgba(255,80,0,0)');
            ctx.fillStyle = g;
            ctx.fillRect(0, 0, 48, 48);
        }
        return c;
    }
    aliveCount() {
        let n = 0;
        for (const m of this.mosslings) if (m.alive()) n++;
        return n;
    }
    /**
     * Fire a feedback pulse. flash/hitStop/shake are render-only and consumed
     * by loop()/draw() — never by update() — so this can't perturb the
     * deterministic sim. Suppressed entirely during rewind catch-up.
     */
    juice({ flash = 0, color = '#ffffff', hitStop = 0, shake = 0 } = {}) {
        if (this.replaying) return;
        if (this.reduceMotion) return; // honor prefers-reduced-motion (render-only)
        if (flash > this.flash) { this.flash = flash; this.flashColor = color; }
        this.hitStop = Math.max(this.hitStop, hitStop);
        this.shake = Math.max(this.shake, shake);
    }
    /**
     * A mossling reached the portal. Bookkeeping (savedCount, streak) is
     * deterministic — streak keys off simStep, not wall-clock — so rewind
     * reconstructs it exactly. Audio/particles are gated by `replaying`.
     */
    onSave(m) {
        this.savedCount++;
        const gap = this.simStep - this.lastSaveStep;
        this.saveStreak = gap <= 45 ? this.saveStreak + 1 : 1;
        this.lastSaveStep = this.simStep;
        if (this.replaying) return;
        this.exitFlash = 1; // portal swells as the mossling enters
        if (typeof haptics !== 'undefined') haptics.save();
        const tier = Math.min(this.saveStreak, 8);
        const athlete = !!this.level.exit.athlete;
        audio.sfxSave(1 + (tier - 1) * 0.09); // chime climbs with the streak
        this.particles.spawn(m.x, m.y - 12, athlete ? '#ffd54f' : '#4dd0e1', 12 + tier * 2,
            { speed: 3 + tier * 0.3, life: 50, glow: true, size: 2 });
        this.particles.spawn(m.x, m.y - 12, '#ffffff', 6, { speed: 2, life: 28, glow: true });
        if (tier >= 4) this.juice({ flash: 0.10, color: athlete ? '#ffe082' : '#80deea' });
    }
    // --- Failure diagnosis (render/UI-only consumers; sim only writes the tally) ---
    freshDeaths() {
        return { cliff: 0, lava: 0, void: 0, explode: 0, lastPos: { cliff: null, lava: null, void: null, explode: null } };
    }
    /** Called from Mossling.die() during the sim. Deterministic bookkeeping only. */
    recordDeath(cause, x, y) {
        if (!(cause in this.deaths)) return;
        this.deaths[cause]++;
        this.deaths.lastPos[cause] = { x: Math.round(x), y: Math.round(y) };
    }
    /**
     * Called from Mossling.update() when an athlete-only gate turns a creature
     * away. Pure deterministic bookkeeping (counts + the missing trait + the
     * gate position) — read only by diagnoseFailure() after a loss.
     */
    recordGateRejection(m, exit) {
        this.gateRejects++;
        this.gateRejectPos = { x: Math.round(exit.x), y: Math.round(exit.y) };
        if (!m.hasFloater && !m.hasClimber) this.gateRejectMissing.both++;
        else if (!m.hasFloater) this.gateRejectMissing.floater++;
        else if (!m.hasClimber) this.gateRejectMissing.climber++;
    }
    /** Stable identity for the current level so a Retry hint only re-shows on the SAME puzzle. */
    levelKey() {
        if (this.runMode === 'daily' && this.dailyChallenge) return 'daily:' + this.dailyChallenge.key;
        if (this.levelIdx >= 0) return 'c' + this.levelIdx;
        return 'custom:' + (this.level && this.level.name);
    }
    /**
     * Read-only failure analysis derived entirely from already-recorded state
     * (death tally, counts, remaining inventory, clock). Returns the single most
     * actionable reason plus an optional zone for the retry marker. Never mutates
     * sim state — safe to call from the UI after a loss.
     */
    diagnoseFailure() {
        const total = this.level.totalSpawn, req = this.level.reqSaved;
        const saved = this.savedCount, missed = Math.max(0, req - saved);
        const d = this.deaths, alive = this.aliveCount();
        const anySkillLeft = Object.keys(this.inventory).some(k => (this.inventory[k] || 0) > 0);
        const zone = (kind) => d.lastPos[kind] ? { x: d.lastPos[kind].x, y: d.lastPos[kind].y, kind } : null;
        // Location-based lethal causes first (most actionable), then time, then
        // resource shortfall, then a generic "how close" line.
        if (d.lava > 0 && d.lava >= d.cliff && d.lava >= d.void)
            return { key: 'lava', label: 'Lost to lava', detail: `${d.lava} fell in`, zone: zone('lava') };
        if (d.cliff > 0 && d.cliff >= d.void)
            return { key: 'cliff', label: 'Fatal fall', detail: `${d.cliff} dropped too far`, zone: zone('cliff') };
        if (d.void > 0)
            return { key: 'void', label: 'Walked off the map', detail: `${d.void} lost`, zone: zone('void') };
        // Athlete gate turned the colony away: the single most actionable reason
        // on the gold-portal levels, where a bare "ran out of time" hides the
        // real fix (give them BOTH Floater and Climber before the gate).
        if (this.level.exit && this.level.exit.athlete && this.gateRejects > 0) {
            const gm = this.gateRejectMissing;
            const need = (gm.floater && !gm.climber && !gm.both) ? 'a Floater'
                : (gm.climber && !gm.floater && !gm.both) ? 'a Climber'
                : 'Floater + Climber';
            return {
                key: 'athlete',
                label: 'Reached the gate, not athletes',
                detail: `${this.gateRejects} arrived needing ${need}`,
                zone: this.gateRejectPos ? { x: this.gateRejectPos.x, y: this.gateRejectPos.y, kind: 'gate' } : null,
            };
        }
        if (this.time <= 0 && alive > 0)
            return { key: 'time', label: alive >= Math.ceil(total * 0.3) ? 'Colony never reached the exit' : 'Ran out of time', detail: `${alive} still wandering`, zone: null };
        if (!anySkillLeft && missed > 0)
            return { key: 'skills', label: 'Ran out of skills', detail: `needed ${missed} more`, zone: null };
        return { key: 'short', label: `Saved ${missed} short`, detail: `${saved}/${total}, needed ${req}`, zone: null };
    }
    /** Retry marker at last attempt's failure zone. Render-only; fades and self-clears. */
    drawFailHint(ctx) {
        const h = this.failHint;
        if (!h) return;
        const TTL = 240; // ~4s of render frames
        const age = this.tick - h.born;
        if (age > TTL || age < 0) { this.failHint = null; return; }
        const fade = 1 - age / TTL;
        const t = this.tick * 0.15;
        const col = h.kind === 'lava' ? '#ff7043' : '#ffb300';
        ctx.save();
        ctx.translate(h.x, h.y);
        ctx.globalAlpha = fade * (0.55 + 0.45 * Math.sin(t));
        ctx.strokeStyle = col;
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(0, 0, 13 + Math.sin(t) * 3, 0, Math.PI * 2); ctx.stroke();
        // a small caution chevron inside the ring
        ctx.fillStyle = col;
        ctx.beginPath(); ctx.moveTo(-5, -3); ctx.lineTo(5, -3); ctx.lineTo(0, 5); ctx.closePath(); ctx.fill();
        ctx.globalAlpha = fade;
        ctx.fillStyle = col;
        ctx.font = 'bold 9px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('LAST TIME', 0, -19);
        ctx.restore();
    }
    // --- Level lifecycle ---------------------------------------------------
    loadDailyChallenge(challenge = dailyChallengeForDate()) {
        if (!challenge) { ui.toast('Daily challenge is unavailable.', true); return; }
        if (this.runMode !== 'daily' && this.levelIdx >= 0) this.lastCampaignLevelIdx = this.levelIdx;
        this.loadLevel(challenge.levelIdx, false, false, { mode: 'daily', daily: challenge });
    }
    loadLevel(idx, isCustom = false, silent = false, opts = {}) {
        if (!isCustom && idx >= LEVELS.length) {
            this.state = 'VICTORY';
            ui.showMsg('LEGENDARY!', 'Every Mossling colony is safe. You are the Moss Master!', true);
            return;
        }
        this.levelIdx = isCustom ? -2 : idx;
        this.level = isCustom ? idx : LEVELS[idx];
        this.runMode = opts.mode || (isCustom ? 'custom' : 'campaign');
        this.dailyChallenge = this.runMode === 'daily' ? opts.daily : null;

        if (isCustom) {
            const err = validateLevelStructure(this.level);
            if (err) {
                ui.toast(`Custom level invalid: ${err}`, true);
                if (this.state === 'MENU') ui.buildMenu();
                return;
            }
        }

        this.mosslings = []; this.particles.list = [];
        this.savedCount = 0; this.deadCount = 0; this.spawnCounter = 0; this.skillsUsed = 0;
        this.spawnTimer = 50;
        this.spawnRate = this.level.spawnRate;
        this.time = this.level.time * 60;
        this.inventory = { ...this.level.inventory };
        this.selectedSkill = null;
        this.pendingTarget = null; this.pausedForTouch = false;
        this.ffwd = false; this.nukeArmedAt = 0; this.nuked = false;
        this.shake = 0; this.flash = 0; this.hitStop = 0; this.exitFlash = 0;
        this.saveStreak = 0; this.lastSaveStep = -999;
        this.resultRecorded = false;
        this.deaths = this.freshDeaths(); // fresh diagnosis tally per attempt
        this.gateRejects = 0; this.gateRejectPos = null;
        this.gateRejectMissing = { floater: 0, climber: 0, both: 0 };
        this.simStep = 0; this.actionLog = [];   // fresh input history per attempt
        this.ghostMode = false; this.ghostActions = null; this.ghostAI = 0; // cleared unless loadReplay re-arms
        // Onboard a brand-new player on (and only on) campaign Level 1.
        this.onboarding = !isCustom && idx === 0 && storage.getUnlocked() === 0;
        this.onboardDone = false; this.onboardPausedOnce = false;
        this.terrain.clear(this.level.theme || 'FOREST');
        for (const c of (this.level.commands || [])) this.terrain.drawRect(c.x, c.y, c.w, c.h, c.type);
        this.terrain.finalize();
        this.objects = this.buildRuntimeObjects(this.level.objects || []);
        this.switchState = {};
        this.updateObjects(true);
        // Always PLAY: `silent` only suppresses the DOM/overlay refresh. The
        // rewind catch-up loop re-simulates via update(), which no-ops unless
        // the state is PLAY — a PAUSE here would dead-loop the rewind.
        this.state = 'PLAY';
        if (!silent) {
            // Retry Ghost Hint: when reloading the SAME level we just failed, mark
            // the failure zone for a few seconds. Render-only, never logged, so
            // replay/rewind are untouched. A fresh/different level clears it.
            this.failHint = (this.retryHint && this.retryHint.key === this.levelKey())
                ? { x: this.retryHint.x, y: this.retryHint.y, kind: this.retryHint.kind, born: this.tick }
                : null;
            this.retryHint = null;
            if (typeof music !== 'undefined' && music) {
                music.duck(false);
                music.start(this.level.theme || 'FOREST');
            }
            ui.onLevelStart(this, isCustom);
        }
    }
    buildRuntimeObjects(objects) {
        return normalizeLevelObjects(objects).map((o, idx) => {
            const base = { ...o, baseX: o.x, baseY: o.y };
            const r = objectRectAt(base, this.simStep);
            return { ...base, id: idx, x: r.x, y: r.y, prevX: r.x, prevY: r.y, active: false, open: false };
        });
    }
    solidObjectAt(x, y) {
        for (const o of this.objects) {
            if (o.type === OBJ_SWITCH) continue;
            if (o.type === OBJ_GATE && o.open) continue;
            if (x >= o.x && x < o.x + o.w && y >= o.y && y < o.y + o.h) return T_METAL;
        }
        return T_AIR;
    }
    mosslingPressesSwitch(m, o) {
        if (!m.alive()) return false;
        return m.x >= o.x - 3 && m.x < o.x + o.w + 3 && m.y >= o.y - 3 && m.y < o.y + o.h + 6;
    }
    updateObjects(initial = false) {
        if (!this.objects.length) return;
        const nextSwitchState = {};
        for (const o of this.objects) {
            o.prevX = initial ? o.x : (o.x ?? o.prevX ?? o.x);
            o.prevY = initial ? o.y : (o.y ?? o.prevY ?? o.y);
            if (o.type === OBJ_PLATFORM) {
                const r = objectRectAt(o, this.simStep);
                o.x = r.x; o.y = r.y; o.w = r.w; o.h = r.h;
            } else {
                o.x = o.x ?? o.prevX;
                o.y = o.y ?? o.prevY;
            }
        }
        if (!initial) this.carryPlatformRiders();
        for (const o of this.objects) {
            if (o.type !== OBJ_SWITCH) continue;
            o.active = this.mosslings.some(m => this.mosslingPressesSwitch(m, o));
            if (o.active) nextSwitchState[o.target] = true;
        }
        this.switchState = nextSwitchState;
        for (const o of this.objects) {
            if (o.type === OBJ_GATE) o.open = !!this.switchState[o.target];
        }
    }
    carryPlatformRiders() {
        for (const o of this.objects) {
            if (o.type !== OBJ_PLATFORM) continue;
            const dx = o.x - o.prevX, dy = o.y - o.prevY;
            if (!dx && !dy) continue;
            for (const m of this.mosslings) {
                if (!m.alive()) continue;
                const onPrevTop = m.x >= o.prevX - 2 && m.x < o.prevX + o.w + 2 &&
                    m.y >= o.prevY - 2 && m.y <= o.prevY + 3;
                if (!onPrevTop) continue;
                m.x += dx;
                m.y += dy;
            }
        }
    }
    endLevel() {
        this.state = 'OVER';
        const total = this.level.totalSpawn;
        const pct = Math.round(this.savedCount / total * 100);
        if (this.savedCount >= this.level.reqSaved) {
            if (this.runMode === 'campaign' && this.levelIdx >= 0 && !this.ghostMode) {
                storage.setUnlocked(this.levelIdx + 1);
                storage.setBest(this.levelIdx, pct);
            }
            ui.showMsg(this.savedCount === total ? 'PERFECT!' : 'Level Clear!',
                `Saved ${this.savedCount}/${total} (${pct}%) — needed ${this.level.reqSaved}.`, true);
        } else {
            ui.showMsg('Level Failed', `Needed ${this.level.reqSaved}, saved ${this.savedCount}/${total}. The moss remembers...`, false);
        }
    }
    togglePause() {
        if (this.state === 'PLAY') this.state = 'PAUSE';
        else if (this.state === 'PAUSE') this.state = 'PLAY';
        ui.refreshButtons(this);
    }
    /**
     * Progressive disclosure: the "advanced" HUD controls (spawn-rate ± and the
     * Nuke button) stay hidden for a new player's first two campaign levels so
     * the early toolbar reads as calm and learnable, then return on Level 3.
     * Custom/shared/editor levels always show the full set. The keyboard
     * shortcuts (N, +/-) keep working regardless — power users lose nothing.
     */
    advancedControlsVisible() {
        if (this.runMode === 'daily') return true;       // daily is opt-in challenge play
        if (this.levelIdx < 0) return true;          // custom (-2) / editor (-1)
        return storage.getUnlocked() >= 2;           // campaign: revealed after clearing L2
    }
    // --- Skills --------------------------------------------------------------
    canAssign(m, s) {
        if (!m.alive()) return false;
        switch (s) {
            case SKILLS.BLOCK: return m.state === STATE.WALK || m.state === STATE.SHRUG || m.state === STATE.BLOCK;
            case SKILLS.FLOAT: return !m.hasFloater;
            case SKILLS.CLIMB: return !m.hasClimber;
            case SKILLS.EXPLODE: return !m.isExploding;
            default: return m.state === STATE.WALK || m.state === STATE.SHRUG;
        }
    }
    selectSkill(s) {
        if (s !== null && (this.inventory[s] || 0) <= 0) { audio.sfxDeny(); return; }
        if (s !== this.selectedSkill) this.clearPending(); // switching skills drops a pending touch target
        this.selectedSkill = s;
        if (s !== null) audio.sfxSelect();
        ui.updateToolbar(this);
    }
    /** Find the best assignment target near the cursor (prefers valid targets). */
    findTarget() {
        if (this.selectedSkill === null) return null;
        let target = null, minDist = this.lastPointerTouch ? 34 : 22; // fatter for touch
        for (const m of this.mosslings) {
            if (!this.canAssign(m, this.selectedSkill)) continue;
            const d = Math.hypot(m.x - this.mouseX, (m.y - 6) - this.mouseY);
            if (d < minDist) { minDist = d; target = m; }
        }
        return target;
    }
    tryAssign() {
        if (this.ghostMode) return; // hands off — the replay is driving
        if (this.selectedSkill === null) return;
        if ((this.inventory[this.selectedSkill] || 0) <= 0) { this.denyFeedback(); return; }
        const m = this.findTarget();
        // Touch: two-stage tap-to-pause confirm (precise on phones). Desktop has
        // live hover targeting, so it commits immediately.
        if (this.lastPointerTouch) {
            if (m && m === this.pendingTarget) { this.commitAssign(m); this.clearPending(); }
            else if (m) { this.setPending(m); } // (re)select + preview, freeze time
            else { this.clearPending(); this.denyFeedback(); }
            return;
        }
        if (!m) { this.denyFeedback(); return; } // tapped empty space / invalid target
        this.commitAssign(m);
    }
    commitAssign(m) {
        const s = this.selectedSkill;
        this.assignSkill(m, s);
        this.actionLog.push({ step: this.simStep, type: 'assign', id: m.id, skill: s });
    }
    /** Touch: arm a pending target and freeze time so a moving cluster holds still. */
    setPending(m) {
        this.pendingTarget = m;
        if (this.state === 'PLAY') { this.pausedForTouch = true; this.state = 'PAUSE'; ui.refreshButtons(this); }
        audio.sfxSelect();
    }
    /** Drop the pending target and resume if we paused for it. */
    clearPending() {
        this.pendingTarget = null;
        if (this.pausedForTouch) { this.pausedForTouch = false; if (this.state === 'PAUSE') { this.state = 'PLAY'; ui.refreshButtons(this); } }
    }
    /**
     * Tap landed on nothing assignable. Render-only feedback (deny chirp + a
     * brief red cursor ring) so the player learns the tap was registered but
     * found no valid target — never silent. Not logged; doesn't touch the sim.
     */
    denyFeedback() {
        audio.sfxDeny();
        if (typeof haptics !== 'undefined') haptics.deny();
        this.deniedAt = this.tick;
        this.particles.spawn(this.mouseX, this.mouseY, '#ff5252', 5, { speed: 1.3, life: 16 });
    }
    /** Replay entry point — re-target by stable id (cursor isn't available). */
    assignSkillById(id, s) {
        const m = this.mosslings.find(mo => mo.id === id);
        if (m && this.canAssign(m, s)) this.assignSkill(m, s);
    }
    assignSkill(m, s) {
        switch (s) {
            case SKILLS.BLOCK: m.state = (m.state === STATE.BLOCK ? STATE.WALK : STATE.BLOCK); break;
            case SKILLS.BUILD: m.state = STATE.BUILD; m.bricksLeft = PHYS.BUILD_BRICKS; break;
            case SKILLS.BASH: m.state = STATE.BASH; break;
            case SKILLS.MINE: m.state = STATE.MINE; break;
            case SKILLS.DIG: m.state = STATE.DIG; break;
            case SKILLS.FLOAT: m.hasFloater = true; break;
            case SKILLS.CLIMB: m.hasClimber = true; break;
            case SKILLS.EXPLODE: m.isExploding = true; m.explodeTimer = PHYS.EXPLODE_FUSE; break;
        }
        this.inventory[s]--;
        this.skillsUsed++;
        if (this.replaying) return; // muted catch-up: no SFX, particles or toolbar churn
        audio.sfxAssign();
        if (typeof haptics !== 'undefined') haptics.tap();
        this.particles.spawn(m.x, m.y - 8, '#ffeb3b', 6, { speed: 1.5, life: 25, glow: true });
        // Onboarding success beat: first Builder assign clears the coaching,
        // unpauses, and celebrates — then gets out of the way.
        if (this.onboarding && !this.onboardDone && s === SKILLS.BUILD) {
            this.onboardDone = true;
            this.onboarding = false;
            if (this.state === 'PAUSE') { this.state = 'PLAY'; ui.refreshButtons(this); }
            this.juice({ flash: 0.18, color: '#9ccc65' });
            ui.toast('Bridge going up! Now guide the rest of the colony home.');
            audio.sfxSave(1.2);
        }
        ui.toggleTutorial(false); // they've made their first move — clear the coaching card
        ui.updateToolbar(this, s);
        if (this.inventory[s] <= 0) this.selectSkill(null);
    }
    /** Double-press safety: first call arms, second within 2s detonates everyone. */
    nuke() {
        if (this.state !== 'PLAY' && this.state !== 'PAUSE') return;
        const now = performance.now();
        if (now - this.nukeArmedAt > 2000) {
            this.nukeArmedAt = now;
            audio.sfxOhNo();
            ui.flashNuke(true);
            return;
        }
        this.nukeArmedAt = 0;
        this.actionLog.push({ step: this.simStep, type: 'nuke' });
        this.doNuke();
        ui.flashNuke(false);
    }
    /** Pure detonation — replayable (no arming/timing/DOM). */
    doNuke() {
        this.nuked = true;
        let delay = 0;
        for (const m of this.mosslings) {
            if (m.alive() && !m.isExploding) {
                m.isExploding = true;
                m.explodeTimer = PHYS.EXPLODE_FUSE + delay;
                delay += 10;
            }
        }
    }
    // --- Deterministic rewind (Backspace) ----------------------------------
    /** Apply one logged input during a replay catch-up. */
    applyAction(a) {
        switch (a.type) {
            case 'assign': this.assignSkillById(a.id, a.skill); break;
            case 'rate': this.spawnRate = a.value; break;
            case 'nuke': this.doNuke(); break;
        }
    }
    /**
     * Jump 5s (300 steps) back in time by re-simulating from a clean level
     * load and re-injecting every input that occurred before the target step.
     * Costs ~zero memory: the entire world is reconstructed from the action
     * log. Audio and particle spawning are muted during the catch-up.
     */
    rewind() {
        if (this.state !== 'PLAY' && this.state !== 'PAUSE') return;
        if (this.simStep === 0) return;
        const targetStep = Math.max(0, this.simStep - 300);
        const kept = this.actionLog.filter(a => a.step < targetStep);
        const wasPaused = this.state === 'PAUSE';
        const isCustom = this.levelIdx === -2;
        const opts = this.runMode === 'daily'
            ? { mode: 'daily', daily: this.dailyChallenge }
            : {};
        this.loadLevel(isCustom ? this.level : this.levelIdx, isCustom, true, opts);
        this.actionLog = kept;
        // Mute the catch-up: noop particle spawns and silence audio.
        this.replaying = true;
        const realSpawn = this.particles.spawn;
        this.particles.spawn = () => {};
        audio._silent = true;
        let ai = 0;
        while (this.simStep < targetStep) {
            while (ai < kept.length && kept[ai].step === this.simStep) this.applyAction(kept[ai++]);
            this.update();
        }
        this.particles.spawn = realSpawn;
        audio._silent = false;
        this.replaying = false;
        this.selectedSkill = null;
        this.state = wasPaused ? 'PAUSE' : 'PLAY';
        ui.updateToolbar(this);
        ui.refreshButtons(this);
    }
    // --- Ghost / replay ----------------------------------------------------
    /** Snapshot the current run as a shareable replay payload (level id + log). */
    buildReplay() {
        const actions = this.actionLog.map(a => ({ ...a }));
        if (this.runMode === 'daily' && this.dailyChallenge) return { kind: 'daily', dailyKey: this.dailyChallenge.key, actions };
        if (this.levelIdx >= 0) return { kind: 'campaign', levelIdx: this.levelIdx, actions };
        return { kind: 'custom', levelCode: serializeLevel(this.level), actions };
    }
    /**
     * Load a decoded replay and play it back deterministically: the level is
     * reconstructed exactly as in rewind, then the recorded inputs are injected
     * at their simStep while the sim runs live (audio/particles on, so it looks
     * like a real run). Player assignment is locked out for the duration.
     */
    loadReplay(replay) {
        if (!replay || !Array.isArray(replay.actions)) return false;
        if (replay.kind === 'campaign') this.loadLevel(replay.levelIdx);
        else if (replay.kind === 'daily') this.loadDailyChallenge(dailyChallengeForDate(replay.dailyKey));
        else if (replay.kind === 'custom') this.loadLevel(replay.level, true);
        else return false;
        if (this.state !== 'PLAY') return false; // load failed (invalid level / unavailable daily)
        this.ghostMode = true;
        this.ghostActions = replay.actions.slice();
        this.ghostAI = 0;
        return true;
    }

    // --- Simulation ----------------------------------------------------------
    update() {
        if (this.state !== 'PLAY') return;
        // Ghost playback injects the recorded inputs at their recorded step.
        if (this.ghostActions) {
            while (this.ghostAI < this.ghostActions.length && this.ghostActions[this.ghostAI].step === this.simStep) {
                this.applyAction(this.ghostActions[this.ghostAI++]);
            }
        }
        this.updateObjects();
        this.time--;
        if (!this.nuked && this.spawnCounter < this.level.totalSpawn) {
            if (--this.spawnTimer <= 0) {
                this.mosslings.push(new Mossling(this.level.spawn.x, this.level.spawn.y, this.spawnCounter));
                this.spawnCounter++;
                this.spawnTimer = this.spawnRate;
                this.hatchFlash = 18;
                audio.sfxSpawn();
            }
        }
        let alive = 0, dead = 0;
        for (const m of this.mosslings) {
            m.update(this);
            if (m.alive()) alive++;
            else if (m.state === STATE.DEAD) dead++;
        }
        this.deadCount = dead;
        this.particles.update();
        if (this.shake > 0) this.shake--;
        if (this.hatchFlash > 0) this.hatchFlash--;
        const doneSpawning = this.nuked || this.spawnCounter >= this.level.totalSpawn;
        if (this.time <= 0 || (doneSpawning && alive === 0)) this.endLevel();
        this.simStep++; // one completed simulation step
    }
    // --- Rendering -----------------------------------------------------------
    draw() {
        const ctx = this.ctx;
        ctx.save();
        if (this.shake > 0) ctx.translate((Math.random() - 0.5) * this.shake, (Math.random() - 0.5) * this.shake);
        ctx.drawImage(this.terrain.bgC.c, 0, 0);
        this.spores.update(this.mosslings); // spores scatter in the wake of passing mosslings
        this.spores.draw(ctx);
        ctx.drawImage(this.terrain.dirtC.c, 0, 0);
        ctx.drawImage(this.terrain.fixedC.c, 0, 0);
        this.drawObjects(ctx);

        if (this.level && this.state !== 'MENU') {
            this.drawLavaGlow(ctx);
            if (this.state === 'PLAY') this.emitLavaEmbers();
            this.drawHatch(ctx);
            this.drawExit(ctx);
            this.drawFailHint(ctx);   // "last time" retry marker (render-only, fades out)
            this.drawDangerHints(ctx);
            for (const m of this.mosslings) m.draw(ctx);
            this.particles.draw(ctx);
            this.drawOnboarding(ctx);
            this.drawPendingTarget(ctx);
            this.drawCursor(ctx);
        }
        if (this.state === 'EDITOR') {
            ui.drawEditorOverlay(this, ctx);
        }
        if (this.debug) this.drawDebug(ctx);
        ctx.restore();
        // Full-screen impact flash, drawn outside the shake transform so it
        // always covers the board edge-to-edge.
        if (this.flash > 0) {
            ctx.save();
            ctx.globalAlpha = Math.min(0.6, this.flash);
            ctx.fillStyle = this.flashColor;
            ctx.fillRect(0, 0, W, H);
            ctx.restore();
        }
    }
    drawObjects(ctx) {
        if (!this.objects || !this.objects.length) return;
        ctx.save();
        for (const o of this.objects) {
            if (o.type === OBJ_PLATFORM) {
                const bx = o.baseX ?? o.x, by = o.baseY ?? o.y;
                const railX0 = Math.min(bx, bx + (o.dx || 0));
                const railX1 = Math.max(bx + o.w, bx + o.w + (o.dx || 0));
                const railY0 = Math.min(by, by + (o.dy || 0));
                const railY1 = Math.max(by + o.h, by + o.h + (o.dy || 0));
                ctx.globalAlpha = 0.28;
                ctx.strokeStyle = '#80deea';
                ctx.lineWidth = 2;
                ctx.strokeRect(railX0, railY0 + o.h / 2 - 1, Math.max(2, railX1 - railX0), Math.max(2, railY1 - railY0 || 2));
                ctx.globalAlpha = 1;
                ctx.fillStyle = '#16323a';
                ctx.fillRect(o.x, o.y, o.w, o.h);
                ctx.fillStyle = '#4dd0e1';
                ctx.fillRect(o.x, o.y, o.w, 2);
                ctx.fillStyle = '#0d2025';
                ctx.fillRect(o.x, o.y + o.h - 2, o.w, 2);
                for (let x = o.x + 8; x < o.x + o.w - 6; x += 18) {
                    ctx.fillStyle = '#b2ebf2';
                    ctx.fillRect(x, o.y + 3, 4, 3);
                }
            } else if (o.type === OBJ_SWITCH) {
                ctx.fillStyle = o.active ? '#ffd54f' : '#6d4c41';
                ctx.fillRect(o.x, o.y, o.w, o.h);
                ctx.fillStyle = o.active ? '#fff59d' : '#a1887f';
                ctx.fillRect(o.x + 2, o.y - (o.active ? 1 : 3), o.w - 4, 3);
                ctx.fillStyle = '#3e2723';
                ctx.fillRect(o.x, o.y + o.h - 2, o.w, 2);
            } else if (o.type === OBJ_GATE) {
                ctx.globalAlpha = o.open ? 0.28 : 1;
                ctx.fillStyle = o.open ? '#24464d' : '#546e7a';
                ctx.fillRect(o.x, o.y, o.w, o.h);
                ctx.fillStyle = o.open ? '#80deea' : '#90a4ae';
                for (let y = o.y + 4; y < o.y + o.h; y += 12) ctx.fillRect(o.x + 2, y, o.w - 4, 2);
                ctx.fillStyle = o.open ? '#4dd0e1' : '#263238';
                ctx.fillRect(o.x, o.y, 2, o.h);
                ctx.fillRect(o.x + o.w - 2, o.y, 2, o.h);
                ctx.globalAlpha = 1;
            }
        }
        ctx.restore();
    }
    /**
     * Lava embers & bubbles — purely decorative, emitted on the render clock
     * (this.tick) so the Math.random here never enters the deterministic sim
     * update() path. Skipped during rewind catch-up (draw() doesn't run then).
     */
    emitLavaEmbers() {
        const hp = this.terrain.hazardPoints;
        if (!hp.length) return;
        if (this.tick % 4 === 0) {
            const p = hp[(Math.random() * hp.length) | 0];
            this.particles.spawn(p.x, p.y - 1, Math.random() < 0.5 ? '#ffab40' : '#ff7043', 1,
                { speed: 0.5, vy: -0.8, life: 80, size: 2, glow: true });
        }
        if (this.tick % 30 === 0) { // large bubble
            const p = hp[(Math.random() * hp.length) | 0];
            this.particles.spawn(p.x, p.y - 1, '#ffc107', 1,
                { speed: 0.2, vy: -0.4, life: 100, size: 4, glow: true });
        }
    }
    drawLavaGlow(ctx) {
        const hp = this.terrain.hazardPoints;
        if (!hp.length) return;
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        const t = this.tick * 0.05;
        for (const p of hp) {
            ctx.globalAlpha = 0.22 + 0.13 * Math.sin(t + p.phase);
            ctx.drawImage(this.glowSprite, p.x - 24, p.y - 30);
        }
        ctx.restore();
    }
    drawHatch(ctx) {
        const { x, y } = this.level.spawn;
        ctx.fillStyle = '#3e2723';
        ctx.fillRect(x - 17, y - 30, 34, 12);
        ctx.fillStyle = '#5d4037';
        ctx.fillRect(x - 15, y - 28, 30, 8);
        ctx.fillStyle = '#4e342e';
        for (let i = -12; i <= 8; i += 7) ctx.fillRect(x + i, y - 28, 2, 8);
        ctx.fillStyle = '#7cb342'; // moss dripping off the hatch
        ctx.fillRect(x - 15, y - 30, 30, 2);
        ctx.fillRect(x - 11, y - 28, 3, 2); ctx.fillRect(x + 6, y - 28, 4, 3);
        if (this.hatchFlash > 0) { // door swings as a mossling drops out
            ctx.strokeStyle = '#8d6e63'; ctx.lineWidth = 2;
            const ang = (this.hatchFlash / 18) * 0.9;
            ctx.beginPath();
            ctx.moveTo(x - 8, y - 20);
            ctx.lineTo(x - 8 + Math.cos(ang) * 14, y - 20 + Math.sin(ang) * 14);
            ctx.stroke();
        }
    }
    drawExit(ctx) {
        const { x, y } = this.level.exit;
        const t = this.tick * 0.06;
        // Athlete-only portals glow gold; standard portals glow cyan.
        const gold = !!this.level.exit.athlete;
        const C = gold
            ? { glow0: 'rgba(255,206,64,0.55)', glow1: 'rgba(255,206,64,0)', in0: 'rgba(120,70,0,0.85)', in1: 'rgba(255,196,60,0.6)', arch: '#ffe082', spark: '#fff8e1' }
            : { glow0: 'rgba(0,229,255,0.5)', glow1: 'rgba(0,229,255,0)', in0: 'rgba(0,80,110,0.85)', in1: 'rgba(0,229,255,0.55)', arch: '#80deea', spark: '#e0f7fa' };
        // pulsing glow — swells briefly each time a mossling is rescued
        const ef = this.exitFlash;
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = Math.min(1, 0.5 + 0.2 * Math.sin(t) + ef * 0.5);
        const rad = 34 + ef * 22;
        const g = ctx.createRadialGradient(x, y - 13, 2, x, y - 13, rad);
        g.addColorStop(0, C.glow0);
        g.addColorStop(1, C.glow1);
        ctx.fillStyle = g;
        ctx.fillRect(x - rad, y - 13 - rad, rad * 2, rad * 2);
        ctx.restore();
        // portal interior
        const ig = ctx.createLinearGradient(x, y - 26, x, y);
        ig.addColorStop(0, C.in0);
        ig.addColorStop(1, C.in1);
        ctx.fillStyle = ig;
        ctx.beginPath();
        ctx.moveTo(x - 11, y);
        ctx.lineTo(x - 11, y - 18);
        ctx.quadraticCurveTo(x, y - 32 + Math.sin(t * 1.5) * 2, x + 11, y - 18);
        ctx.lineTo(x + 11, y);
        ctx.closePath();
        ctx.fill();
        // swirling vortex effect
        ctx.globalAlpha = 0.3;
        for (let i = 0; i < 2; i++) {
            const rot = t * (1 + i * 0.5) * (i ? -1 : 1);
            ctx.save();
            ctx.translate(x, y - 13);
            ctx.rotate(rot);
            ctx.strokeStyle = C.spark;
            ctx.lineWidth = 1;
            ctx.beginPath(); ctx.ellipse(0, 0, 8, 12, 0, 0, Math.PI * 2); ctx.stroke();
            ctx.restore();
        }
        ctx.globalAlpha = 1.0;
        // stone arch
        ctx.strokeStyle = C.arch;
        ctx.lineWidth = 2.5;
        ctx.stroke();
        // Athlete badge: tiny pixel umbrella + pick marks above the arch.
        if (gold) {
            ctx.shadowColor = C.spark; ctx.shadowBlur = 4;
            ctx.strokeStyle = C.spark;
            ctx.fillStyle = C.spark;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(x - 10, y - 34); ctx.lineTo(x - 5, y - 39); ctx.lineTo(x, y - 34);
            ctx.stroke();
            ctx.fillRect(x - 6, y - 34, 1, 5);
            ctx.fillRect(x + 4, y - 39, 7, 1);
            ctx.fillRect(x + 7, y - 38, 1, 6);
            ctx.fillRect(x + 9, y - 35, 3, 1);
            ctx.shadowBlur = 0;
        }
        // orbiting sparks
        ctx.fillStyle = C.spark;
        for (let i = 0; i < 4; i++) {
            const a = t * 1.4 + i * (Math.PI * 2 / 4);
            ctx.globalAlpha = 0.6 + 0.3 * Math.sin(t + i);
            ctx.fillRect(x + Math.cos(a) * 15 - 1, y - 13 + Math.sin(a * 0.7) * 18 - 1, 2, 2);
        }
        ctx.globalAlpha = 1;
    }

    // Render-only danger readability lives in js/overlays.js; these thin wrappers
    // keep the call sites (and tests) on the Game object while the implementation
    // sits in its own module. They read terrain/mosslings and draw only — no sim
    // state is touched, so determinism/replay are untouched.
    dangerProbe(m) { return probeDangerFor(this, m); }
    drawDangerHints(ctx) { return drawDangerOverlay(this, ctx); }
    /** The mossling the onboarding flow should point at: a rightward walker in
     *  the build-here window just before Level 1's gap (~x450). */
    onboardTarget() {
        let best = null, bestD = Infinity;
        for (const m of this.mosslings) {
            if (m.state !== STATE.WALK || m.dir !== 1) continue;
            if (m.x < 426 || m.x > 452) continue;
            const d = 452 - m.x;
            if (d < bestD) { bestD = d; best = m; }
        }
        return best;
    }
    /**
     * Render-only onboarding overlay (Level 1, new players). The first time a
     * mossling reaches the build window we auto-pause — teaching assign-while-
     * paused — and arrow the player to it. Cleared on the first Builder assign.
     */
    drawOnboarding(ctx) {
        if (!this.onboarding || this.onboardDone) return;
        const m = this.onboardTarget();
        if (m && !this.onboardPausedOnce && this.state === 'PLAY') {
            this.state = 'PAUSE';
            this.onboardPausedOnce = true;
            ui.refreshButtons(this);
            ui.setTutorial('Builder is ready (paused). Tap the glowing mossling to bridge the gap.');
        }
        if (!m) return;
        const t = this.tick * 0.15;
        ctx.save();
        ctx.strokeStyle = '#ffeb3b';
        ctx.lineWidth = 2.5;
        ctx.globalAlpha = 0.6 + 0.4 * Math.sin(t);
        ctx.beginPath();
        ctx.arc(m.x, m.y - 6, 16, 0, Math.PI * 2);
        ctx.stroke();
        // bouncing downward arrow above the target
        const ay = m.y - 42 + Math.sin(t) * 4;
        ctx.globalAlpha = 1;
        ctx.fillStyle = '#ffeb3b';
        ctx.beginPath();
        ctx.moveTo(m.x, ay + 13);
        ctx.lineTo(m.x - 8, ay);
        ctx.lineTo(m.x + 8, ay);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
    }
    /**
     * Touch targeting preview: a bold double-ring + skill ghost + magnifier
     * bubble over the armed mossling, with a "tap to confirm" prompt. Makes the
     * intended creature unmistakable on a small phone screen before committing.
     */
    drawPendingTarget(ctx) {
        const m = this.pendingTarget;
        if (!m || !m.alive()) { if (m) this.clearPending(); return; }
        this.drawSkillGhost(ctx, m);
        const t = this.tick * 0.2;
        ctx.save();
        ctx.strokeStyle = '#ffeb3b';
        ctx.lineWidth = 2.5;
        ctx.globalAlpha = 0.9;
        ctx.beginPath(); ctx.arc(m.x, m.y - 6, 14 + Math.sin(t) * 2, 0, Math.PI * 2); ctx.stroke();
        ctx.globalAlpha = 0.35;
        ctx.beginPath(); ctx.arc(m.x, m.y - 6, 23 + Math.sin(t) * 3, 0, Math.PI * 2); ctx.stroke();
        // Magnifier bubble — a 3x zoom of the creature, floated just above it so
        // a fingertip never hides the thing it is selecting.
        const mr = 26, mx = Math.max(mr + 2, Math.min(W - mr - 2, m.x)), my = m.y - 64;
        if (my > mr) {
            ctx.globalAlpha = 1;
            ctx.save();
            ctx.beginPath(); ctx.arc(mx, my, mr, 0, Math.PI * 2); ctx.closePath();
            ctx.fillStyle = 'rgba(8,12,9,0.92)'; ctx.fill();
            ctx.clip();
            const zoom = 3;
            ctx.translate(mx, my);
            ctx.scale(zoom, zoom);
            ctx.translate(-m.x, -(m.y - 6));
            m.draw(ctx);
            ctx.restore();
            ctx.strokeStyle = '#ffeb3b'; ctx.lineWidth = 2;
            ctx.beginPath(); ctx.arc(mx, my, mr, 0, Math.PI * 2); ctx.stroke();
        }
        // confirm prompt
        ctx.globalAlpha = 1;
        ctx.font = 'bold 10px monospace';
        const label = 'TAP TO CONFIRM';
        const tw = ctx.measureText(label).width;
        ctx.fillStyle = 'rgba(0,0,0,0.8)';
        ctx.fillRect(m.x - tw / 2 - 4, m.y + 12, tw + 8, 14);
        ctx.fillStyle = '#ffeb3b';
        ctx.fillText(label, m.x - tw / 2, m.y + 22);
        ctx.restore();
    }
    drawCursor(ctx) {
        if (this.state !== 'PLAY' && this.state !== 'PAUSE') return;
        // Failed-assignment pulse: a red ring that expands and fades over ~15
        // render frames at the spot the player tapped.
        const dt = this.tick - this.deniedAt;
        if (dt >= 0 && dt < 15) {
            ctx.save();
            ctx.globalAlpha = 1 - dt / 15;
            ctx.strokeStyle = '#ff5252';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(this.mouseX, this.mouseY, 6 + dt, 0, Math.PI * 2);
            ctx.stroke();
            ctx.restore();
        }
        this.hoverM = this.findTarget();
        this.canvas.style.cursor = this.hoverM ? 'pointer' : 'crosshair';
        if (this.hoverM) {
            const m = this.hoverM;
            this.drawSkillGhost(ctx, m); // preview the selected skill's footprint
            ctx.strokeStyle = '#ffeb3b';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.arc(m.x, m.y - 6, 10 + Math.sin(this.tick * 0.2), 0, Math.PI * 2);
            ctx.stroke();
            ctx.fillStyle = 'rgba(0,0,0,0.7)';
            const tags = (m.hasClimber ? ' CLIMB' : '') + (m.hasFloater ? ' FLOAT' : '');
            const label = STATE_NAMES[m.state] + tags;
            ctx.font = '9px monospace';
            const tw = ctx.measureText(label).width;
            ctx.fillRect(m.x - tw / 2 - 3, m.y - 32, tw + 6, 11);
            ctx.fillStyle = '#ffeb3b';
            ctx.fillText(label, m.x - tw / 2, m.y - 24);
        } else if (this.selectedSkill !== null) {
            ctx.strokeStyle = 'rgba(255,235,59,0.5)';
            ctx.lineWidth = 1;
            ctx.strokeRect(this.mouseX - 11, this.mouseY - 11, 22, 22);
        }
    }
    drawIntentLabel(ctx, text, x, y) {
        ctx.font = 'bold 10px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const w = ctx.measureText(text).width;
        ctx.fillStyle = 'rgba(0,0,0,0.86)';
        ctx.fillRect(x - w / 2 - 4, y - 7, w + 8, 13);
        ctx.fillStyle = '#d5f59a';
        ctx.fillText(text, x, y - 1);
    }
    /**
     * Semi-transparent preview of what the selected skill will do, drawn
     * relative to the hovered mossling's position and facing. It is intentionally
     * render-only: no terrain, mossling, inventory, or action-log state changes.
     */
    drawSkillGhost(ctx, m) {
        const s = this.selectedSkill, d = m.dir;
        if (s === null) return;
        ctx.save();
        ctx.globalAlpha = 0.56;
        ctx.lineWidth = 1;
        if (s === SKILLS.BLOCK) {            // stop post + turnback wall
            const x = m.x + d * 9;
            ctx.fillStyle = '#ef5350';
            ctx.strokeStyle = 'rgba(239,83,80,0.9)';
            ctx.fillRect(x - 3, m.y - 21, 6, 24);
            ctx.fillRect(x - 9, m.y - 18, 18, 4);
            ctx.strokeRect(x - 7.5, m.y - 20.5, 15, 22);
            ctx.globalAlpha = 0.85;
            this.drawIntentLabel(ctx, 'HOLD', x, m.y - 27);
        } else if (s === SKILLS.BUILD) {     // rising staircase, roughly one builder
            ctx.fillStyle = '#ffeb3b';
            ctx.strokeStyle = 'rgba(255,235,59,0.85)';
            let bx = m.x, by = m.y - 1;
            for (let i = 0; i < PHYS.BUILD_BRICKS; i++) { ctx.fillRect(d === 1 ? bx : bx - 8, by, 8, 2); bx += d * 5; by -= 1; }
            ctx.globalAlpha = 0.75;
            ctx.beginPath(); ctx.moveTo(m.x, m.y - 4); ctx.lineTo(bx, by - 2); ctx.stroke();
            this.drawIntentLabel(ctx, 'BRIDGE', m.x + d * 30, m.y - 22);
        } else if (s === SKILLS.BASH) {      // horizontal tunnel ahead
            ctx.fillStyle = '#ff8a3d';
            ctx.strokeStyle = 'rgba(255,138,61,0.9)';
            const x0 = d === 1 ? m.x + 1 : m.x - 40;
            ctx.fillRect(x0, m.y - 12, 40, 12); ctx.strokeRect(x0 + 0.5, m.y - 11.5, 39, 11);
            ctx.globalAlpha = 0.85;
            ctx.fillRect(m.x + d * 34, m.y - 8, 6, 4);
            this.drawIntentLabel(ctx, 'TUNNEL', m.x + d * 24, m.y - 20);
        } else if (s === SKILLS.MINE) {      // diagonal shaft, down-forward
            ctx.fillStyle = '#4fa3d9';
            ctx.strokeStyle = 'rgba(79,163,217,0.9)';
            let mx = m.x, my = m.y;
            for (let i = 0; i < 7; i++) { ctx.fillRect(d === 1 ? mx + 2 : mx - 10, my - 10, 9, 13); mx += d * 2; my += 2; }
            ctx.globalAlpha = 0.85;
            this.drawIntentLabel(ctx, 'SLOPE', m.x + d * 16, m.y + 17);
        } else if (s === SKILLS.DIG) {       // vertical shaft below
            ctx.fillStyle = '#b0bec5';
            ctx.strokeStyle = 'rgba(176,190,197,0.9)';
            ctx.fillRect(m.x - 6, m.y - 1, 13, 34); ctx.strokeRect(m.x - 5.5, m.y - 0.5, 12, 33);
            ctx.globalAlpha = 0.85;
            this.drawIntentLabel(ctx, 'DOWN', m.x, m.y + 45);
        } else if (s === SKILLS.FLOAT) {     // permanent safe-fall umbrella
            ctx.fillStyle = '#34c0d4';
            ctx.strokeStyle = 'rgba(52,192,212,0.95)';
            ctx.beginPath();
            ctx.moveTo(m.x - 14, m.y - 24);
            ctx.lineTo(m.x - 7, m.y - 34);
            ctx.lineTo(m.x, m.y - 38);
            ctx.lineTo(m.x + 7, m.y - 34);
            ctx.lineTo(m.x + 14, m.y - 24);
            ctx.closePath();
            ctx.fill(); ctx.stroke();
            ctx.fillRect(m.x - 1, m.y - 24, 2, 24);
            ctx.globalAlpha = 0.42;
            for (let i = 0; i < 3; i++) ctx.fillRect(m.x - 14 + i * 12, m.y + 9 + i * 10, 6, 2);
            ctx.globalAlpha = 0.85;
            this.drawIntentLabel(ctx, 'SAFE FALL', m.x, m.y - 43);
        } else if (s === SKILLS.CLIMB) {     // permanent wall-scaling arrow
            ctx.fillStyle = '#9ccc65';
            ctx.strokeStyle = 'rgba(156,204,101,0.95)';
            const x = m.x + d * 12;
            ctx.fillRect(x - 2, m.y - 35, 4, 34);
            ctx.fillRect(x - 8, m.y - 30, 16, 3);
            ctx.fillRect(x - 8, m.y - 20, 16, 3);
            ctx.fillRect(x - 8, m.y - 10, 16, 3);
            ctx.beginPath();
            ctx.moveTo(x, m.y - 45);
            ctx.lineTo(x - 8, m.y - 33);
            ctx.lineTo(x + 8, m.y - 33);
            ctx.closePath();
            ctx.fill(); ctx.stroke();
            ctx.globalAlpha = 0.85;
            this.drawIntentLabel(ctx, 'CLIMB', x, m.y - 51);
        } else if (s === SKILLS.EXPLODE) {   // blast radius
            ctx.fillStyle = '#ff7043';
            ctx.beginPath(); ctx.arc(m.x, m.y - 5, PHYS.EXPLODE_RADIUS, 0, Math.PI * 2);
            ctx.globalAlpha = 0.16; ctx.fillStyle = '#ff7043'; ctx.fill();
            ctx.globalAlpha = 0.6; ctx.strokeStyle = 'rgba(255,112,67,0.9)'; ctx.stroke();
            ctx.globalAlpha = 0.85;
            this.drawIntentLabel(ctx, 'BOOM', m.x, m.y - PHYS.EXPLODE_RADIUS - 9);
        }
        ctx.restore();
    }
    drawDebug(ctx) {
        ctx.fillStyle = 'rgba(0,0,0,0.85)'; ctx.fillRect(10, 64, 230, 250);
        ctx.fillStyle = '#0f0'; ctx.font = '12px monospace';
        let ly = 82;
        const line = (s) => { ctx.fillText(s, 20, ly); ly += 15; };
        line(`FPS: ${this.fps}  tick: ${this.tick}`);
        line(`Mouse: ${this.mouseX | 0}, ${this.mouseY | 0}`);
        line(`Terrain: ${TILE_NAMES[this.terrain.get(this.mouseX, this.mouseY)]}`);
        line(`Particles: ${this.particles.list.length}`);
        line(`SpawnRate: ${this.spawnRate}f  FF: ${this.ffwd}`);
        const counts = {};
        for (const m of this.mosslings) counts[m.state] = (counts[m.state] || 0) + 1;
        line('--- States ---');
        for (let i = 0; i < STATE_NAMES.length; i++) {
            if (counts[i]) line(`${STATE_NAMES[i]}: ${counts[i]}`);
        }
    }
    // --- HUD -------------------------------------------------------------
    updateHud() {
        if (!this.level || this.state === 'MENU') return;
        this.el['lbl-saved'].innerText = this.savedCount;
        this.el['lbl-alive'].innerText = this.aliveCount();
        this.el['lbl-skills'].innerText = this.skillsUsed;
        const s = Math.max(0, Math.ceil(this.time / 60));
        this.el['lbl-time'].innerText = Math.floor(s / 60) + ':' + (s % 60).toString().padStart(2, '0');
        this.el['lbl-time'].classList.toggle('time-low', s <= 20 && this.state === 'PLAY');
        if (typeof music !== 'undefined' && music && music.playing) music.setIntensity(s <= 30 ? 1.4 : (s <= 60 ? 1.15 : 1));
        
        // medal pace tracking
        if (this.level.par) {
            const par = this.level.par;
            const maxPossibleSaved = this.savedCount + this.aliveCount() + (this.level.totalSpawn - this.spawnCounter);
            const timeTaken = (this.level.time * 60 - this.time) / 60;

            const gold = document.getElementById('hud-medal-gold');
            const silver = document.getElementById('hud-medal-silver');
            const bronze = document.getElementById('hud-medal-bronze');

            gold.classList.toggle('failed', maxPossibleSaved < par.saved);
            silver.classList.toggle('failed', this.skillsUsed > par.skills);
            bronze.classList.toggle('failed', timeTaken > par.time);
        }

        // user-facing rate: 1 (slow) … 99 (fast)
        this.el['lbl-rate'].innerText = Math.round((RATE_MAX - this.spawnRate) / (RATE_MAX - RATE_MIN) * 98 + 1);
    }
    adjustRate(delta) {
        this.spawnRate = Math.max(RATE_MIN, Math.min(RATE_MAX, this.spawnRate - delta * 15));
        audio.sfxSelect();
        this.actionLog.push({ step: this.simStep, type: 'rate', value: this.spawnRate });
    }
    // --- Main loop ---------------------------------------------------------
    loop(t) {
        this.frameCount++;
        if (t - this.lastFpsUpdate > 1000) {
            this.fps = this.frameCount;
            this.frameCount = 0;
            this.lastFpsUpdate = t;
        }
        const dt = Math.min(100, t - this.lastT);
        this.lastT = t;
        // Hit-stop: a brief freeze-frame for impact. Purely a render-loop
        // device — it drops accumulated time so the sim genuinely pauses
        // (no catch-up burst) without ever touching simStep or rewind.
        if (this.hitStop > 0 && this.state === 'PLAY') {
            this.hitStop--;
            this.acc = 0;
        } else {
            this.acc += dt;
            while (this.acc >= PHYS.SIM_STEP) {
                const mult = this.ffwd && this.state === 'PLAY' ? 4 : 1;
                for (let i = 0; i < mult; i++) this.update();
                this.tick++;
                this.acc -= PHYS.SIM_STEP;
            }
        }
        if (this.flash > 0) this.flash = Math.max(0, this.flash - 0.06);
        if (this.exitFlash > 0) this.exitFlash = Math.max(0, this.exitFlash - 0.05);
        this.updateHud();
        this.draw();
        requestAnimationFrame(tt => this.loop(tt));
    }
}
