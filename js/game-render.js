'use strict';
/** Render-only helpers and readability overlays. These must not mutate deterministic sim state. */
Game.prototype.drawObjects = function(ctx) {
        if (!this.objects || !this.objects.length) return;
        ctx.save();
        for (const o of this.objects) {
            if (o.type === OBJ_PLATFORM) {
                const bx = o.baseX ?? o.x, by = o.baseY ?? o.y;
                const railX0 = Math.min(bx, bx + (o.dx || 0));
                const railX1 = Math.max(bx + o.w, bx + o.w + (o.dx || 0));
                const railY0 = Math.min(by, by + (o.dy || 0));
                const railY1 = Math.max(by + o.h, by + o.h + (o.dy || 0));
                ctx.globalAlpha = 0.34;
                ctx.strokeStyle = 'rgba(128,222,234,0.9)';
                ctx.lineWidth = 2;
                ctx.setLineDash([8, 6]);
                ctx.strokeRect(railX0, railY0 + o.h / 2 - 1, Math.max(2, railX1 - railX0), Math.max(2, railY1 - railY0 || 2));
                ctx.setLineDash([]);
                ctx.globalAlpha = 1;
                ctx.fillStyle = 'rgba(2,7,8,0.72)';
                ctx.fillRect(o.x - 3, o.y + o.h + 1, o.w + 6, 3);
                ctx.fillStyle = '#0c2027';
                ctx.fillRect(o.x - 2, o.y - 1, o.w + 4, o.h + 2);
                ctx.fillStyle = '#183942';
                ctx.fillRect(o.x, o.y, o.w, o.h);
                ctx.fillStyle = '#63e6f5';
                ctx.fillRect(o.x, o.y, o.w, 2);
                ctx.fillStyle = '#2b6874';
                ctx.fillRect(o.x, o.y + 2, o.w, 2);
                ctx.fillStyle = '#0d2025';
                ctx.fillRect(o.x, o.y + o.h - 2, o.w, 2);
                for (let x = o.x + 7; x < o.x + o.w - 6; x += 18) {
                    ctx.fillStyle = '#b2ebf2';
                    ctx.fillRect(x, o.y + 3, 4, 2);
                    ctx.fillStyle = '#071317';
                    ctx.fillRect(x + 1, o.y + o.h - 4, 3, 1);
                }
            } else if (o.type === OBJ_SWITCH) {
                const press = o.active ? 1 : 0;
                if (o.active) {
                    ctx.globalAlpha = 0.45 + 0.2 * Math.sin(this.tick * 0.18);
                    ctx.fillStyle = '#ffd54f';
                    ctx.fillRect(o.x - 4, o.y - 5, o.w + 8, o.h + 8);
                    ctx.globalAlpha = 1;
                }
                ctx.fillStyle = '#2a1711';
                ctx.fillRect(o.x - 2, o.y + o.h - 1, o.w + 4, 3);
                ctx.fillStyle = o.active ? '#d99a18' : '#6d4c41';
                ctx.fillRect(o.x, o.y + press, o.w, o.h - press);
                ctx.fillStyle = o.active ? '#fff59d' : '#b08a73';
                ctx.fillRect(o.x + 2, o.y - (o.active ? 1 : 4), o.w - 4, 3);
                ctx.fillStyle = o.active ? '#ffcc40' : '#3e2723';
                ctx.fillRect(o.x + 4, o.y + o.h - 3, o.w - 8, 2);
            } else if (o.type === OBJ_GATE) {
                ctx.globalAlpha = o.open ? 0.30 : 1;
                ctx.fillStyle = o.open ? '#17343a' : '#31434a';
                ctx.fillRect(o.x - 1, o.y, o.w + 2, o.h);
                ctx.fillStyle = o.open ? '#4dd0e1' : '#90a4ae';
                for (let y = o.y + 3; y < o.y + o.h; y += 12) {
                    ctx.fillRect(o.x + 2, y, o.w - 4, 2);
                    if (!o.open) {
                        ctx.fillStyle = '#ffb300';
                        ctx.fillRect(o.x + 3, y + 4, Math.max(2, o.w - 6), 2);
                        ctx.fillStyle = '#90a4ae';
                    }
                }
                ctx.fillStyle = o.open ? '#4dd0e1' : '#172329';
                ctx.fillRect(o.x, o.y, 2, o.h);
                ctx.fillRect(o.x + o.w - 2, o.y, 2, o.h);
                ctx.globalAlpha = 1;
                if (o.open) {
                    ctx.fillStyle = 'rgba(128,222,234,0.45)';
                    ctx.fillRect(o.x - 3, o.y + 2, 2, o.h - 4);
                    ctx.fillRect(o.x + o.w + 1, o.y + 2, 2, o.h - 4);
                }
            }
        }
        ctx.restore();
};

Game.prototype.emitLavaEmbers = function() {
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
};

Game.prototype.drawLavaGlow = function(ctx) {
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
};

Game.prototype.drawHatch = function(ctx) {
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
};

Game.prototype.drawExit = function(ctx) {
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
};

Game.prototype.spawnSavePopup = function(m, tier, athlete) {
        const text = tier >= 2 ? `SAVE x${tier}` : 'SAVED';
        this.savePopups.push({
            x: m.x,
            y: m.y - 24,
            born: this.tick,
            text,
            color: athlete ? '#ffe082' : '#9fe2ff',
        });
        if (this.savePopups.length > 7) this.savePopups.shift();
};

Game.prototype.drawSavePopups = function(ctx) {
        if (!this.savePopups || !this.savePopups.length) return;
        const TTL = 72;
        ctx.save();
        ctx.font = 'bold 11px "Moss Pixel", "Courier New", monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        this.savePopups = this.savePopups.filter((p) => {
            const age = this.tick - p.born;
            if (age < 0 || age > TTL) return false;
            const t = age / TTL;
            const y = p.y - t * 28;
            const alpha = 1 - t;
            const bob = Math.sin((this.tick + p.x) * 0.18) * 1.5;
            ctx.globalAlpha = Math.min(1, alpha * 1.15);
            ctx.fillStyle = 'rgba(2,5,4,0.88)';
            const w = ctx.measureText(p.text).width + 10;
            ctx.fillRect(p.x - w / 2, y + bob - 8, w, 14);
            ctx.fillStyle = p.color;
            ctx.fillText(p.text, p.x, y + bob - 1);
            ctx.globalAlpha = alpha * 0.55;
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(p.x - w / 2 + 2, y + bob - 6, Math.max(4, w * (1 - t) - 4), 1);
            return true;
        });
        ctx.restore();
};

Game.prototype.dangerProbe = function(m) { return probeDangerFor(this, m); };

Game.prototype.drawDangerHints = function(ctx) { return drawDangerOverlay(this, ctx); };

Game.prototype.onboardTarget = function() {
        let best = null, bestD = Infinity;
        for (const m of this.mosslings) {
            if (m.state !== STATE.WALK || m.dir !== 1) continue;
            if (m.x < 426 || m.x > 452) continue;
            const d = 452 - m.x;
            if (d < bestD) { bestD = d; best = m; }
        }
        return best;
};

Game.prototype.drawOnboarding = function(ctx) {
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
};

Game.prototype.drawPendingTarget = function(ctx) {
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
        ctx.font = 'bold 10px "Moss Pixel", "Courier New", monospace';
        const label = 'TAP TO CONFIRM';
        const tw = ctx.measureText(label).width;
        ctx.fillStyle = 'rgba(0,0,0,0.8)';
        ctx.fillRect(m.x - tw / 2 - 4, m.y + 12, tw + 8, 14);
        ctx.fillStyle = '#ffeb3b';
        ctx.fillText(label, m.x - tw / 2, m.y + 22);
        ctx.restore();
};

Game.prototype.drawCursor = function(ctx) {
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
            ctx.font = '9px "Moss Pixel", "Courier New", monospace';
            const tw = ctx.measureText(label).width;
            ctx.fillRect(m.x - tw / 2 - 3, m.y - 32, tw + 6, 11);
            ctx.fillStyle = '#ffeb3b';
            ctx.fillText(label, m.x - tw / 2, m.y - 24);
        } else if (this.selectedSkill !== null) {
            ctx.strokeStyle = 'rgba(255,235,59,0.5)';
            ctx.lineWidth = 1;
            ctx.strokeRect(this.mouseX - 11, this.mouseY - 11, 22, 22);
        }
};

Game.prototype.drawIntentLabel = function(ctx, text, x, y) {
        ctx.font = 'bold 10px "Moss Pixel", "Courier New", monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const w = ctx.measureText(text).width;
        ctx.fillStyle = 'rgba(0,0,0,0.86)';
        ctx.fillRect(x - w / 2 - 4, y - 7, w + 8, 13);
        ctx.fillStyle = '#d5f59a';
        ctx.fillText(text, x, y - 1);
};

Game.prototype.drawSkillGhost = function(ctx, m) {
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
};

Game.prototype.drawDebug = function(ctx) {
        ctx.fillStyle = 'rgba(0,0,0,0.85)'; ctx.fillRect(10, 64, 230, 250);
        ctx.fillStyle = '#0f0'; ctx.font = '12px "Moss Pixel", "Courier New", monospace';
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
};
