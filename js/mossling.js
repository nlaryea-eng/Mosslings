'use strict';
/**
 * MOSSLINGS — the creature: physics state machine + fully procedural
 * animated rendering (no sprite assets — the original shipped a reference
 * to a sprites.png that never existed, leaving characters invisible).
 *
 * Coordinate convention: (x, y) is the center of the feet. All terrain
 * queries go through game.terrain.get() against the collision mask.
 */
class Mossling {
    constructor(x, y, id = 0) {
        this.x = x; this.y = y;
        this.vy = 0;
        this.dir = 1;
        this.state = STATE.FALL;
        // Per-spawn id (the level's spawn index). Stable and reproducible, so
        // deterministic replay can re-target the same creature, and so every
        // derived value below is identical run-to-run (no Math.random in sim).
        this.id = id;
        this.frame = (id * 17) % 60;          // desync animations, deterministically
        this.variant = id % 5;                 // procedural look (hue + accessory)
        this.hueShift = ((id * 47) % 60) - 30; // ±30° body-hue rotation
        this.fallStart = y;
        this.hasFloater = false;
        this.hasClimber = false;
        this.bricksLeft = 0;
        this.shrugTimer = 0;
        this.landTimer = 0;       // landing squash animation
        this.explodeTimer = 0;
        this.isExploding = false;
        this.blink = 0;
        this.cosmeticFrame = id * 13; // render-only clock for blink (see updateCosmetics)
        // Deterministic flag: this creature has already been tallied as turned
        // away by an athlete-only gate (so the rejection counts once, not once
        // per frame it lingers in the gate zone). Never read by physics.
        this.rejectedAtGate = false;
    }
    alive() { return this.state !== STATE.DEAD && this.state !== STATE.SAVED; }
    /**
     * Render-only cosmetic tick (blink). Driven from draw(), NOT update(), so it
     * never touches the deterministic sim — no Math.random in the update() path,
     * and rewind catch-up (which runs update() but not draw()) stays exact.
     * The blink cadence is derived deterministically from id + a render counter.
     */
    updateCosmetics() {
        this.cosmeticFrame++;
        if (this.blink > 0) { this.blink--; return; }
        // ~1-in-167 chance per rendered frame, hashed from id+frame (no RNG).
        const n = (((this.id + 1) * 2654435761) + this.cosmeticFrame * 40503) >>> 0;
        if (n % 167 === 0) this.blink = 6;
    }
    update(game) {
        if (!this.alive()) return;
        this.frame++;
        if (this.landTimer > 0) this.landTimer--;

        if (this.isExploding) {
            this.explodeTimer--;
            if (this.explodeTimer === 60) audio.sfxOhNo();
            if (this.explodeTimer <= 0) {
                game.terrain.drawCircle(this.x, this.y - 5, PHYS.EXPLODE_RADIUS, T_AIR);
                game.particles.spawn(this.x, this.y - 5, '#ff9800', 30, { speed: 4, gravity: 0.08, life: 50, glow: true });
                game.particles.spawn(this.x, this.y - 5, '#ffd54f', 16, { speed: 5, life: 30, glow: true });
                game.particles.spawn(this.x, this.y - 5, '#5d4037', 14, { speed: 3, gravity: 0.15, life: 60 });
                audio.sfxExplode();
                game.juice({ flash: 0.5, color: '#ffd166', hitStop: 4, shake: 12 });
                this.die(game, true, 'explode');
                return;
            }
        }

        // Exit check — any live mossling near the portal is saved. Athlete-only
        // portals demand a true all-rounder: both Floater AND Climber. Others
        // simply walk over the golden gate unharmed (it is never solid).
        const exit = game.level.exit;
        const ex = exit.x, ey = exit.y;
        if (Math.abs(this.x - ex) < 14 && this.y > ey - 28 && this.y < ey + 6) {
            if (!exit.athlete || (this.hasFloater && this.hasClimber)) {
                this.state = STATE.SAVED;
                game.onSave(this); // savedCount, streak chime + sparkle burst
                return;
            }
            // Athlete-only gate refused entry — this one lacks Floater and/or
            // Climber. Tally the first contact per creature so a post-loss
            // diagnosis can explain *why* the colony never qualified, instead of
            // a misleading "ran out of time". Deterministic; no sim coupling.
            if (!this.rejectedAtGate && game.recordGateRejection) {
                this.rejectedAtGate = true;
                game.recordGateRejection(this, exit);
            }
        }

        // Hazard contact (lava is non-solid but lethal)
        for (let ox = -2; ox <= 2; ox += 2) {
            for (let oy = -6; oy <= 0; oy += 2) {
                if (game.terrain.get(this.x + ox, this.y + oy) === T_HAZARD) {
                    game.particles.spawn(this.x, this.y - 4, '#ff7043', 16, { speed: 3, gravity: -0.02, life: 40, glow: true });
                    this.die(game, true, 'lava');
                    return;
                }
            }
        }

        switch (this.state) {
            case STATE.FALL: this.updateFall(game); break;
            case STATE.WALK: this.updateWalk(game); break;
            case STATE.BLOCK: this.updateBlock(game); break;
            case STATE.BUILD: this.updateBuild(game); break;
            case STATE.BASH: this.updateBash(game); break;
            case STATE.MINE: this.updateMine(game); break;
            case STATE.DIG: this.updateDig(game); break;
            case STATE.CLIMB: this.updateClimb(game); break;
            case STATE.SHRUG:
                if (--this.shrugTimer <= 0) this.state = STATE.WALK;
                break;
        }

        if (this.y > H + 30 || this.x < -20 || this.x > W + 20) this.die(game, true, 'void');
    }
    die(game, silentPuff = false, cause = '') {
        this.state = STATE.DEAD;
        // Tally the cause for the post-failure diagnosis. Pure deterministic
        // bookkeeping (integer counters + a rounded position) — no Math.random,
        // no wall-clock, never read back by the sim, reset each loadLevel, so it
        // reconstructs identically on replay/rewind.
        if (cause && game.recordDeath) game.recordDeath(cause, this.x, this.y);
        game.particles.spawn(this.x, this.y - 4, '#81c784', 12, { speed: 2.5, gravity: 0.06, life: 45 });
        if (!silentPuff) audio.sfxDie();
    }
    isSolid(g, dx, dy) {
        const px = this.x + dx, py = this.y + dy;
        if (g.solidObjectAt && g.solidObjectAt(px, py)) return true;
        const t = g.terrain.get(px, py);
        if (t === T_DIRT || t === T_METAL || t === T_BRIDGE) return true;
        // One-way membranes block only the probe direction they forbid, and are
        // intangible to vertical probes (dx === 0) so mosslings fall through them.
        if (t === T_ONEWAY_R) return dx < 0; // passable rightward, wall leftward
        if (t === T_ONEWAY_L) return dx > 0; // passable leftward, wall rightward
        return false;
    }
    startFall() { this.state = STATE.FALL; this.fallStart = this.y; this.vy = 0; }
    updateFall(game) {
        this.vy = Math.min(this.vy + PHYS.GRAVITY, this.hasFloater ? PHYS.FLOAT_FALL : PHYS.MAX_FALL);
        const steps = Math.ceil(this.vy);
        for (let i = 0; i < steps; i++) {
            if (this.isSolid(game, 0, 1)) {
                const fell = this.y - this.fallStart;
                if (fell > PHYS.FATAL_FALL && !this.hasFloater) {
                    game.particles.spawn(this.x, this.y, '#a5d6a7', 18, { speed: 3, gravity: 0.1, life: 40 });
                    audio.sfxSplat();
                    this.die(game, true, 'cliff');
                    return;
                }
                if (fell > 40) {
                    this.landTimer = 8;
                    // kick up a little dust on a real landing
                    game.particles.spawn(this.x, this.y, '#9b8b6a', 5, { speed: 1.3, vy: -0.4, gravity: 0.05, life: 22, size: 2 });
                }
                this.state = STATE.WALK;
                this.vy = 0;
                return;
            }
            this.y++;
        }
    }
    updateWalk(game) {
        if (!this.isSolid(game, 0, 1)) { this.startFall(); return; }
        if (this.frame % PHYS.WALK_INTERVAL !== 0) return;
        const nx = this.x + this.dir;
        // blockers form invisible walls
        for (const o of game.mosslings) {
            if (o !== this && o.state === STATE.BLOCK && Math.abs(o.x - nx) < 6 && Math.abs(o.y - this.y) < 9) {
                this.dir *= -1;
                return;
            }
        }
        if (this.isSolid(game, this.dir, 0)) {
            for (let up = 1; up <= PHYS.STEP_UP; up++) {
                if (!this.isSolid(game, this.dir, -up)) { this.x += this.dir; this.y -= up; return; }
            }
            if (this.hasClimber) this.state = STATE.CLIMB;
            else this.dir *= -1;
        } else {
            this.x += this.dir;
        }
    }
    updateBlock(game) {
        if (!this.isSolid(game, 0, 1)) this.startFall();
    }
    updateBuild(game) {
        if (this.frame % PHYS.BUILD_PERIOD !== 0) return;
        if (this.isSolid(game, this.dir * 4, -2)) { this.state = STATE.WALK; return; } // bumped a wall
        game.terrain.drawRect(this.x + (this.dir === 1 ? 0 : -8), this.y - 1, 8, 2, T_BRIDGE);
        this.x += this.dir * 5;
        this.y -= 1;
        this.bricksLeft--;
        if (this.bricksLeft <= 3 && this.bricksLeft > 0) audio.sfxShrug(); // running-out warning ticks
        else audio.sfxBuild();
        if (this.bricksLeft <= 0) { this.state = STATE.SHRUG; this.shrugTimer = 40; }
    }
    /**
     * Bash / mine / dig all carve rectangles sized exactly to their stride,
     * never below the surface the mossling stands on (the original carved
     * oversized circles: diggers and miners fell through their own holes
     * after one swing, and bashers chewed up any bridge they crossed).
     */
    updateBash(game) {
        if (this.frame % PHYS.BASH_PERIOD !== 0) return;
        const ahead = game.terrain.get(this.x + this.dir * 6, this.y - 4);
        if (ahead === T_METAL || ahead === T_ONEWAY_R || ahead === T_ONEWAY_L) {
            this.state = STATE.WALK; this.dir *= -1; return;
        }
        let hit = false;
        for (let d = 1; d <= 10 && !hit; d++) {
            if (game.terrain.get(this.x + this.dir * d, this.y - 4) !== T_AIR) hit = true;
        }
        if (!hit) { this.state = STATE.WALK; return; }
        // tunnel: 10 wide ahead, 12 tall, floor untouched
        game.terrain.drawRect(this.dir === 1 ? this.x + 1 : this.x - 10, this.y - 12, 10, 12, T_AIR);
        game.particles.spawn(this.x + this.dir * 8, this.y - 6, '#6d4c41', 5, { speed: 2, gravity: 0.1, life: 30 });
        audio.sfxDig();
        this.x += this.dir * 2;
        if (!this.isSolid(game, 0, 1)) this.startFall();
    }
    updateMine(game) {
        if (this.frame % PHYS.MINE_PERIOD !== 0) return;
        if (game.terrain.get(this.x + this.dir * 6, this.y) === T_METAL ||
            game.terrain.get(this.x, this.y + 3) === T_METAL) {
            this.state = STATE.WALK; this.dir *= -1; return;
        }
        let hit = false;
        for (let d = 2; d <= 10 && !hit; d++) {
            if (game.terrain.get(this.x + this.dir * d, this.y + 1) !== T_AIR) hit = true;
        }
        if (!hit) { this.state = STATE.WALK; return; } // popped out of a face
        // diagonal step: clears the body channel and 2px below the feet → 1:1 slope
        game.terrain.drawRect(this.dir === 1 ? this.x + 2 : this.x - 10, this.y - 10, 9, 13, T_AIR);
        game.particles.spawn(this.x + this.dir * 6, this.y, '#6d4c41', 5, { speed: 2, gravity: 0.1, life: 30 });
        audio.sfxDig();
        this.x += this.dir * 2;
        this.y += 2;
        if (!this.isSolid(game, 0, 1)) this.startFall();
    }
    updateDig(game) {
        if (this.frame % PHYS.DIG_PERIOD !== 0) return;
        if (game.terrain.get(this.x, this.y + 3) === T_METAL) { this.state = STATE.WALK; return; }
        // shaft: 13 wide, advances 2px per scoop, scoop reaches 2px below feet
        game.terrain.drawRect(this.x - 6, this.y - 1, 13, 4, T_AIR);
        game.particles.spawn(this.x, this.y + 2, '#6d4c41', 6, { speed: 2, gravity: 0.1, life: 30 });
        audio.sfxDig();
        this.y += 2;
        let ground = false;
        for (let oy = 1; oy <= 3 && !ground; oy++) {
            for (let ox = -5; ox <= 5 && !ground; ox++) {
                if (game.terrain.get(this.x + ox, this.y + oy) !== T_AIR) ground = true;
            }
        }
        if (!ground) this.startFall(); // pierced through — drop out of the shaft
    }
    updateClimb(game) {
        if (this.frame % 3 !== 0) return;
        if (!this.isSolid(game, this.dir, -1)) {       // crested the top — hop over
            this.y -= 2; this.x += this.dir * 4;
            this.state = STATE.WALK;
            return;
        }
        if (this.isSolid(game, 0, -3)) {               // hit a ceiling — peel off
            this.dir *= -1;
            this.startFall();
            return;
        }
        this.y -= 1;
    }

    // ------------------------------------------------------------------
    // Procedural sprite. Anchored at the feet; flipped via ctx.scale for
    // left-facing. Squash & stretch on landing, blinking, per-state poses.
    // ------------------------------------------------------------------
    draw(ctx) {
        if (!this.alive()) return;
        this.updateCosmetics(); // render-only blink tick (kept out of the sim)
        const f = this.frame;
        // Contact shadow — grounds the creature. Drawn in world space (before
        // the flip/squash transform) and skipped while airborne.
        if (this.state !== STATE.FALL && this.state !== STATE.CLIMB) {
            ctx.save();
            ctx.globalAlpha = 0.22;
            ctx.fillStyle = '#000';
            ctx.beginPath();
            ctx.ellipse(this.x, this.y + 1.5, 5.5, 2, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }
        ctx.save();
        ctx.translate(Math.round(this.x), Math.round(this.y));
        if (this.dir === -1) ctx.scale(-1, 1);

        // squash & stretch (anchored at feet)
        let sy = 1, sx = 1;
        if (this.landTimer > 0) { const t = this.landTimer / 8; sy = 1 - 0.3 * t; sx = 1 + 0.3 * t; }
        else if (this.state === STATE.FALL) { sy = 1.12; sx = 0.9; }
        ctx.scale(sx, sy);
        // Per-creature hue variety. Set inside the save()/restore() pair so it
        // tints only the body and is reset before the overlays below; achromatic
        // eyes (white/near-black) ride through hue-rotate unchanged.
        if (this.hueShift) ctx.filter = `hue-rotate(${this.hueShift}deg)`;

        const walkBob = (this.state === STATE.WALK) ? -((f >> 3) & 1) : 0;
        const blockBob = (this.state === STATE.BLOCK) ? Math.sin(f * 0.1) * 0.5 : 0;
        const digBob = (this.state === STATE.DIG) ? ((f >> 2) & 1) : 0;
        const bob = walkBob + blockBob + digBob;

        const outline = '#09280d';
        const deep = '#1f5b22';
        const shadow = '#4f8f32';
        const fill = '#7cb342';
        const light = '#b7e37c';

        // legs and feet: outlined first, then colored pixels so they read at phone scale.
        ctx.fillStyle = outline;
        if (this.state === STATE.WALK) {
            const step = (f >> 3) & 1;
            ctx.fillRect(-4, -3, 3, 4 + (step ? 0 : -1));
            ctx.fillRect(1, -3, 3, 4 + (step ? -1 : 0));
            ctx.fillStyle = shadow;
            ctx.fillRect(-3, -2, 2, 2 + (step ? 0 : -1));
            ctx.fillRect(2, -2, 1, 2 + (step ? -1 : 0));
        } else if (this.state === STATE.BLOCK) {
            ctx.fillRect(-6, -3, 4, 3); ctx.fillRect(2, -3, 4, 3); // wide stance
            ctx.fillStyle = shadow;
            ctx.fillRect(-5, -2, 2, 1); ctx.fillRect(3, -2, 2, 1);
        } else {
            ctx.fillRect(-4, -3, 3, 3); ctx.fillRect(1, -3, 3, 3);
            ctx.fillStyle = shadow;
            ctx.fillRect(-3, -2, 1, 1); ctx.fillRect(2, -2, 1, 1);
        }

        // Body: small, but built like the newer button glyphs: outline, shadow,
        // fill, and highlight. The right edge is deliberately darker so the
        // creature has volume instead of a flat green smudge.
        const by = -10 + bob; // body top
        ctx.fillStyle = outline;
        ctx.fillRect(-4, by - 2, 8, 2);
        ctx.fillRect(-5, by, 10, 8);
        ctx.fillRect(-4, by + 8, 8, 2);
        ctx.fillStyle = shadow;
        ctx.fillRect(-3, by - 1, 7, 2);
        ctx.fillRect(-4, by + 1, 8, 7);
        ctx.fillStyle = fill;
        ctx.fillRect(-3, by, 6, 8);
        ctx.fillRect(-4, by + 2, 6, 4);
        ctx.fillStyle = deep;
        ctx.fillRect(2, by + 1, 2, 7);
        ctx.fillRect(-3, by + 7, 6, 1);
        ctx.fillStyle = light;
        ctx.fillRect(-3, by + 1, 3, 1);
        ctx.fillRect(-2, by + 3, 3, 3);
        ctx.fillRect(-1, by + 6, 2, 1);

        // moss tuft hair
        ctx.fillStyle = outline;
        ctx.fillRect(-4, by - 3, 2, 2); ctx.fillRect(-1, by - 4, 3, 3); ctx.fillRect(2, by - 3, 2, 2);
        ctx.fillStyle = deep;
        ctx.fillRect(-3, by - 3, 1, 1); ctx.fillRect(0, by - 4, 1, 2); ctx.fillRect(3, by - 3, 1, 1);
        ctx.fillStyle = light;
        ctx.fillRect(0, by - 4, 1, 1);

        // procedural accessory — a tiny deterministic flourish per variant
        switch (this.variant) {
            case 1: // leaf sprig
                ctx.fillStyle = outline; ctx.fillRect(1, by - 6, 1, 3); ctx.fillRect(2, by - 7, 3, 2);
                ctx.fillStyle = '#aed581'; ctx.fillRect(2, by - 6, 1, 2); ctx.fillRect(3, by - 7, 1, 1);
                break;
            case 2: // little mushroom-cap hat
                ctx.fillStyle = outline; ctx.fillRect(-2, by - 5, 4, 2); ctx.fillRect(-4, by - 7, 8, 3);
                ctx.fillStyle = '#8d6e63'; ctx.fillRect(-1, by - 5, 2, 2);
                ctx.fillStyle = '#e57373'; ctx.fillRect(-3, by - 6, 6, 2);
                ctx.fillStyle = '#ffcdd2'; ctx.fillRect(-2, by - 5, 1, 1); ctx.fillRect(1, by - 5, 1, 1);
                break;
            case 3: // red berry
                ctx.fillStyle = outline; ctx.fillRect(-3, by - 6, 4, 4);
                ctx.fillStyle = '#ef5350'; ctx.fillRect(-2, by - 5, 2, 2);
                ctx.fillStyle = '#ffb3a7'; ctx.fillRect(-2, by - 5, 1, 1);
                break;
            case 4: // pale flower
                ctx.fillStyle = outline; ctx.fillRect(-1, by - 6, 4, 4);
                ctx.fillStyle = '#fff59d'; ctx.fillRect(0, by - 5, 2, 2);
                ctx.fillStyle = '#fbc02d'; ctx.fillRect(0, by - 5, 1, 1);
                break;
        }

        // Face: larger white pixels, dark brow, and a leading-side cheek.
        if (this.blink > 0) {
            ctx.fillStyle = outline;
            ctx.fillRect(-1, by + 2, 2, 1); ctx.fillRect(2, by + 2, 2, 1);
        } else {
            ctx.fillStyle = outline;
            ctx.fillRect(-2, by + 1, 3, 3); ctx.fillRect(2, by + 1, 3, 3);
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(-1, by + 1, 2, 2); ctx.fillRect(3, by + 1, 1, 2);
            ctx.fillStyle = '#000000';
            ctx.fillRect(0, by + 2, 1, 1); ctx.fillRect(3, by + 2, 1, 1);
            ctx.fillStyle = 'rgba(255,138,128,0.55)';
            ctx.fillRect(4, by + 3, 1, 1);
        }

        this.drawPose(ctx, by, f);
        ctx.restore();

        // overlays that must not be mirrored/squashed
        if (this.hasFloater && this.state === STATE.FALL) {
            const x = Math.round(this.x), y = Math.round(this.y);
            ctx.fillStyle = '#0d4750';
            ctx.fillRect(x - 10, y - 20, 20, 2);
            ctx.fillRect(x - 8, y - 22, 16, 2);
            ctx.fillRect(x - 5, y - 24, 10, 2);
            ctx.fillRect(x - 1, y - 20, 2, 12);
            ctx.fillStyle = '#34c0d4';
            ctx.fillRect(x - 9, y - 19, 18, 1);
            ctx.fillRect(x - 7, y - 21, 14, 1);
            ctx.fillRect(x - 4, y - 23, 8, 1);
            ctx.fillStyle = '#b3eef5';
            ctx.fillRect(x - 7, y - 21, 4, 1);
            ctx.fillRect(x - 3, y - 23, 3, 1);
        }
        if (this.hasClimber && this.state !== STATE.CLIMB) {
            const x = Math.round(this.x), y = Math.round(this.y);
            ctx.fillStyle = '#5e3a10'; // tiny helmet marks permanent climbers
            ctx.fillRect(x - 3, y - 15, 6, 2);
            ctx.fillStyle = '#ffd166';
            ctx.fillRect(x - 2, y - 15, 4, 1);
        }
        // Permanent Floater pip — readable at a glance even on a phone, so a
        // grounded floater (and especially a two-trait "athlete") is never a
        // guess. The full umbrella already renders during a fall, so only show
        // the pip otherwise. Sits just above the climber helmet; both together
        // unmistakably mark an athlete. Render-only — no sim coupling.
        if (this.hasFloater && this.state !== STATE.FALL) {
            const x = Math.round(this.x), y = Math.round(this.y);
            ctx.fillStyle = '#0d4750';
            ctx.fillRect(x - 4, y - 19, 8, 1);     // canopy underside
            ctx.fillStyle = '#34c0d4';
            ctx.fillRect(x - 3, y - 20, 6, 1);     // canopy
            ctx.fillStyle = '#b3eef5';
            ctx.fillRect(x - 1, y - 22, 2, 2);     // finial highlight
        }
        if (this.isExploding) {
            const sec = Math.ceil(this.explodeTimer / 60);
            ctx.fillStyle = this.explodeTimer % 20 < 10 ? '#ffeb3b' : '#ff5722';
            ctx.font = 'bold 9px "Moss Pixel", "Courier New", monospace';
            ctx.textAlign = 'center';
            ctx.fillText(String(sec), Math.round(this.x), Math.round(this.y) - 16);
            ctx.textAlign = 'left';
            if (this.explodeTimer < 60 && this.explodeTimer % 8 < 4) {
                ctx.globalAlpha = 0.6;
                ctx.fillStyle = '#fff';
                ctx.fillRect(this.x - 4, this.y - 12, 9, 12);
                ctx.globalAlpha = 1;
            }
        }
    }
    /** Per-state accessories, drawn in mirrored local space (feet at origin). */
    drawPose(ctx, by, f) {
        const outline = '#09280d';
        const fill = '#7cb342';
        const light = '#b7e37c';
        switch (this.state) {
            case STATE.BLOCK: {
                ctx.fillStyle = outline;                    // arms out with fists
                ctx.fillRect(-8, by + 1, 4, 4); ctx.fillRect(4, by + 1, 4, 4);
                ctx.fillStyle = '#ef5350';
                ctx.fillRect(-7, by + 2, 2, 2); ctx.fillRect(5, by + 2, 2, 2);
                ctx.fillStyle = '#e53935';                  // headband
                ctx.fillRect(-4, by - 1, 8, 1);
                ctx.fillStyle = '#ffcdd2';
                ctx.fillRect(-3, by - 1, 2, 1);
                break;
            }
            case STATE.BUILD: {
                const swing = (f % PHYS.BUILD_PERIOD) < PHYS.BUILD_PERIOD / 2;
                // Oversized hammer + brick stair reads at 10-14px phone scale.
                ctx.fillStyle = outline;
                ctx.fillRect(2, by + (swing ? 0 : 3), 6, 4);
                ctx.fillRect(7, swing ? by - 5 : by + 1, 2, 8);
                ctx.fillRect(6, swing ? by - 6 : by, 6, 3);
                ctx.fillStyle = light;
                ctx.fillRect(3, by + (swing ? 1 : 4), 4, 2);
                ctx.fillStyle = '#d7a13a';
                ctx.fillRect(7, swing ? by - 5 : by + 1, 4, 2);
                ctx.fillStyle = outline;
                ctx.fillRect(4, by + 6, 9, 4);
                ctx.fillRect(9, by + 3, 5, 4);
                ctx.fillStyle = '#ffd166';
                ctx.fillRect(5, by + 7, 7, 2);
                ctx.fillRect(10, by + 4, 3, 2);
                ctx.fillStyle = '#9f6a20';
                ctx.fillRect(8, by + 7, 1, 2);
                ctx.fillRect(10, by + 5, 3, 1);
                break;
            }
            case STATE.BASH: {
                const punch = (f >> 2) & 1;
                // Big outlined glove creates a distinct "punching forward" silhouette.
                ctx.fillStyle = outline;
                ctx.fillRect(2, by + punch, punch ? 10 : 7, 6);
                ctx.fillStyle = light;
                ctx.fillRect(3, by + 1 + punch, punch ? 5 : 3, 2);
                ctx.fillStyle = '#ff7043';
                ctx.fillRect(punch ? 8 : 6, by + 1 + punch, 4, 4);
                ctx.fillStyle = '#5e2a14';
                ctx.fillRect(punch ? 11 : 9, by + 2 + punch, 2, 2);
                ctx.fillStyle = '#ffc6ad';
                ctx.fillRect(punch ? 8 : 6, by + 1 + punch, 2, 1);
                break;
            }
            case STATE.MINE: {
                const up = (f % PHYS.MINE_PERIOD) < PHYS.MINE_PERIOD / 2;
                ctx.fillStyle = '#3a2410';                   // chunky handle
                if (up) {
                    ctx.fillRect(2, by + 2, 2, 3);
                    ctx.fillRect(4, by, 2, 3);
                    ctx.fillRect(6, by - 2, 2, 3);
                    ctx.fillStyle = '#1a2a52';
                    ctx.fillRect(5, by - 5, 7, 3);
                    ctx.fillStyle = '#9fc3ff';
                    ctx.fillRect(6, by - 4, 5, 1);
                } else {
                    ctx.fillRect(2, by + 2, 2, 3);
                    ctx.fillRect(4, by + 4, 2, 3);
                    ctx.fillRect(6, by + 6, 2, 3);
                    ctx.fillStyle = '#1a2a52';
                    ctx.fillRect(6, by + 6, 7, 3);
                    ctx.fillStyle = '#9fc3ff';
                    ctx.fillRect(7, by + 7, 5, 1);
                }
                break;
            }
            case STATE.DIG: {
                ctx.fillStyle = outline;                     // broad spade silhouette
                ctx.fillRect(-5, by + 4, 2, 4); ctx.fillRect(3, by + 4, 2, 4);
                ctx.fillRect(-2, by + 5, 4, 5);
                ctx.fillStyle = fill;
                ctx.fillRect(-4, by + 5, 1, 2); ctx.fillRect(4, by + 5, 1, 2);
                ctx.fillStyle = '#aeb9c0';
                ctx.fillRect(-1, by + 6, 2, 3);
                ctx.fillStyle = '#44505a';
                ctx.fillRect(-2, by + 8, 4, 2);
                break;
            }
            case STATE.CLIMB: {
                const reach = (f >> 2) & 1;
                ctx.fillStyle = outline;
                ctx.fillRect(4, by - 4, 2, 13);              // wall-side dark limb line
                ctx.fillStyle = light;
                ctx.fillRect(3, by - (reach ? 3 : 0), 2, 4); // alternating grip
                ctx.fillRect(3, by + (reach ? 5 : 3), 2, 4);
                ctx.fillStyle = '#66bb6a';
                ctx.fillRect(5, by - 2, 1, 10);
                break;
            }
            case STATE.FALL: {
                ctx.fillStyle = outline;                     // arms flailing up
                ctx.fillRect(-7, by - 2, 3, 4); ctx.fillRect(4, by - 2, 3, 4);
                ctx.fillStyle = light;
                ctx.fillRect(-6, by - 1, 1, 2); ctx.fillRect(5, by - 1, 1, 2);
                break;
            }
            case STATE.SHRUG: {
                ctx.fillStyle = outline;
                ctx.fillRect(-7, by, 3, 3); ctx.fillRect(4, by, 3, 3);
                ctx.fillStyle = light;
                ctx.fillRect(-6, by + 1, 1, 1); ctx.fillRect(5, by + 1, 1, 1);
                ctx.fillStyle = '#fff';
                ctx.font = '8px "Moss Pixel", "Courier New", monospace';
                ctx.fillText('?', 4, by - 4);
                break;
            }
        }
    }
}
