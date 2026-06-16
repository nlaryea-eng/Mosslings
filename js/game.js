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
        this.particles = new Particles();
        this.spores = new Spores();
        this.levelIdx = 0; this.level = null; this.state = 'MENU';
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
        // Deterministic-replay backbone (Backspace rewind). `simStep` counts
        // actual simulation steps (one per update()), independent of render
        // frames and fast-forward — unlike `tick`, which advances once per
        // rendered frame and runs update() up to 4x under FFWD. Every
        // state-altering input is recorded against simStep so the run can be
        // re-simulated exactly. See rewind().
        this.simStep = 0; this.actionLog = []; this.replaying = false;
        // First-run onboarding (Level 1 only, until cleared). Render-driven
        // coaching: pre-selects Builder, auto-pauses once when a mossling nears
        // the gap, and arrows the player to the right tap. No sim coupling.
        this.onboarding = false; this.onboardDone = false; this.onboardPausedOnce = false;
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
        const tier = Math.min(this.saveStreak, 8);
        const athlete = !!this.level.exit.athlete;
        audio.sfxSave(1 + (tier - 1) * 0.09); // chime climbs with the streak
        this.particles.spawn(m.x, m.y - 12, athlete ? '#ffd54f' : '#4dd0e1', 12 + tier * 2,
            { speed: 3 + tier * 0.3, life: 50, glow: true, size: 2 });
        this.particles.spawn(m.x, m.y - 12, '#ffffff', 6, { speed: 2, life: 28, glow: true });
        if (tier >= 4) this.juice({ flash: 0.10, color: athlete ? '#ffe082' : '#80deea' });
    }
    // --- Level lifecycle ---------------------------------------------------
    loadLevel(idx, isCustom = false, silent = false) {
        if (!isCustom && idx >= LEVELS.length) {
            this.state = 'VICTORY';
            ui.showMsg('LEGENDARY!', 'Every Mossling colony is safe. You are the Moss Master!', true);
            return;
        }
        this.levelIdx = isCustom ? -2 : idx;
        this.level = isCustom ? idx : LEVELS[idx];

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
        this.simStep = 0; this.actionLog = [];   // fresh input history per attempt
        // Onboard a brand-new player on (and only on) campaign Level 1.
        this.onboarding = !isCustom && idx === 0 && storage.getUnlocked() === 0;
        this.onboardDone = false; this.onboardPausedOnce = false;
        this.terrain.clear(this.level.theme || 'FOREST');
        for (const c of (this.level.commands || [])) this.terrain.drawRect(c.x, c.y, c.w, c.h, c.type);
        this.terrain.finalize();
        // Always PLAY: `silent` only suppresses the DOM/overlay refresh. The
        // rewind catch-up loop re-simulates via update(), which no-ops unless
        // the state is PLAY — a PAUSE here would dead-loop the rewind.
        this.state = 'PLAY';
        if (!silent) {
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
            if (this.levelIdx >= 0) {
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
    // --- Skills --------------------------------------------------------------
    canAssign(m, s) {
        if (!m.alive()) return false;
        switch (s) {
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
            case SKILLS.BLOCK: m.state = STATE.BLOCK; break;
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
        this.loadLevel(isCustom ? this.level : this.levelIdx, isCustom, true);
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
    // --- Simulation ----------------------------------------------------------
    update() {
        if (this.state !== 'PLAY') return;
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

        if (this.level && this.state !== 'MENU') {
            this.drawLavaGlow(ctx);
            if (this.state === 'PLAY') this.emitLavaEmbers();
            this.drawHatch(ctx);
            this.drawExit(ctx);
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
    /**
     * Semi-transparent preview of what the selected skill will carve or build,
     * drawn relative to the hovered mossling's position and facing. Mirrors the
     * real strides in Mossling.update* so the ghost matches the outcome.
     */
    drawSkillGhost(ctx, m) {
        const s = this.selectedSkill, d = m.dir;
        if (s === null) return;
        ctx.save();
        ctx.globalAlpha = 0.32;
        ctx.fillStyle = '#ffeb3b';
        ctx.strokeStyle = 'rgba(255,235,59,0.8)';
        ctx.lineWidth = 1;
        if (s === SKILLS.BUILD) {            // rising 6-brick staircase
            let bx = m.x, by = m.y - 1;
            for (let i = 0; i < 6; i++) { ctx.fillRect(d === 1 ? bx : bx - 8, by, 8, 2); bx += d * 5; by -= 1; }
        } else if (s === SKILLS.BASH) {      // horizontal tunnel ahead
            const x0 = d === 1 ? m.x + 1 : m.x - 40;
            ctx.fillRect(x0, m.y - 12, 40, 12); ctx.strokeRect(x0 + 0.5, m.y - 11.5, 39, 11);
        } else if (s === SKILLS.MINE) {      // diagonal shaft, down-forward
            let mx = m.x, my = m.y;
            for (let i = 0; i < 7; i++) { ctx.fillRect(d === 1 ? mx + 2 : mx - 10, my - 10, 9, 13); mx += d * 2; my += 2; }
        } else if (s === SKILLS.DIG) {       // vertical shaft below
            ctx.fillRect(m.x - 6, m.y - 1, 13, 34); ctx.strokeRect(m.x - 5.5, m.y - 0.5, 12, 33);
        } else if (s === SKILLS.EXPLODE) {   // blast radius
            ctx.beginPath(); ctx.arc(m.x, m.y - 5, PHYS.EXPLODE_RADIUS, 0, Math.PI * 2);
            ctx.globalAlpha = 0.16; ctx.fillStyle = '#ff7043'; ctx.fill();
            ctx.globalAlpha = 0.6; ctx.strokeStyle = 'rgba(255,112,67,0.9)'; ctx.stroke();
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
