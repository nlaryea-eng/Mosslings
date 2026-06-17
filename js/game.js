'use strict';
/**
 * MOSSLINGS — game engine.
 *
 * Fixed-timestep simulation (60Hz regardless of monitor refresh — the
 * original stepped once per requestAnimationFrame, so a 144Hz display ran
 * the game 2.4x too fast). Rendering is decoupled and runs every frame.
 *
 * DOM bindings, the menu, and the level editor live in js/ui.js.
 * Local persistence (StorageManager / the `storage` singleton) lives in
 * js/storage.js and loads before this file.
 */

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
        this.savePopups = []; // render-only rescue callouts near the portal
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
        // Live "Beat the Ghost" race: a precomputed render-only phantom trajectory
        // of the stored daily ghost (see js/ghost-race.js). Never read by the sim.
        this.ghostRace = null;
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
        if (this.spawnSavePopup) this.spawnSavePopup(m, tier, athlete);
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
        ctx.font = 'bold 9px "Moss Pixel", "Courier New", monospace';
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
    /** Arm the live phantom race if today's daily has a matching personal ghost. */
    armGhostRace() { return armGhostRace(this); }
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
        this.savePopups = [];
        this.saveStreak = 0; this.lastSaveStep = -999;
        this.resultRecorded = false;
        this.deaths = this.freshDeaths(); // fresh diagnosis tally per attempt
        this.gateRejects = 0; this.gateRejectPos = null;
        this.gateRejectMissing = { floater: 0, climber: 0, both: 0 };
        this.simStep = 0; this.actionLog = [];   // fresh input history per attempt
        this.ghostMode = false; this.ghostActions = null; this.ghostAI = 0; // cleared unless loadReplay re-arms
        if (!silent) this.ghostRace = null; // a rewind (silent) keeps the phantom; a fresh load drops it
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
        const wasSilent = audio._silent;
        this.particles.spawn = () => {};
        audio._silent = true;
        try {
            let ai = 0;
            while (this.simStep < targetStep) {
                while (ai < kept.length && kept[ai].step === this.simStep) this.applyAction(kept[ai++]);
                this.update();
            }
        } finally {
            this.particles.spawn = realSpawn;
            audio._silent = wasSilent;
            this.replaying = false;
        }
        this.selectedSkill = null;
        this.state = wasPaused ? 'PAUSE' : 'PLAY';
        ui.updateToolbar(this);
        ui.refreshButtons(this);
    }
    // --- Ghost / replay ----------------------------------------------------
    /** Snapshot the current run as a shareable replay payload (level id + log). */
    buildReplay() {
        const actions = this.actionLog.map(a => ({ ...a }));
        const fingerprint = typeof levelFingerprint === 'function' ? levelFingerprint(this.level) : null;
        if (this.runMode === 'daily' && this.dailyChallenge) return { kind: 'daily', dailyKey: this.dailyChallenge.key, fingerprint, actions };
        if (this.levelIdx >= 0) return { kind: 'campaign', levelIdx: this.levelIdx, fingerprint, actions };
        return { kind: 'custom', level: this.level, levelCode: serializeLevel(this.level), fingerprint, actions };
    }
    /**
     * Load a decoded replay and play it back deterministically: the level is
     * reconstructed exactly as in rewind, then the recorded inputs are injected
     * at their simStep while the sim runs live (audio/particles on, so it looks
     * like a real run). Player assignment is locked out for the duration.
     */
    loadReplay(replay, validation = null) {
        const check = validation || (typeof validateReplayForPlayback === 'function'
            ? validateReplayForPlayback(replay)
            : { ok: true, severity: 'allow', replay });
        this.lastReplayValidation = check;
        if (!check || check.severity === 'refuse' || !check.replay) return false;
        replay = check.replay;
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
            if (this.ghostRace) drawGhostRace(this, ctx); // translucent phantoms behind the live colony
            for (const m of this.mosslings) m.draw(ctx);
            this.particles.draw(ctx);
            this.drawSavePopups(ctx);
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
