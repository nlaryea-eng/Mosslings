'use strict';
/**
 * MOSSLINGS — particle engine.
 * Supports gravity, additive glow, shrink-over-life, and drifting ambient
 * spores. Pooled-free design: arrays of plain objects, swap-remove deletes.
 */
class Particles {
    constructor() { this.list = []; }
    static MAX = 1400; // active-particle ceiling (see spawn)
    /**
     * spawn(x, y, color, count, opts)
     * opts: { speed, gravity, life, size, glow, vx, vy, spread }
     *
     * Hard-capped at MAX active particles: a custom level plus repeated
     * nukes/explosions could otherwise spike unbounded. When full, the oldest
     * particles are dropped from the front so new bursts still read clearly.
     */
    spawn(x, y, color, count, opts = {}) {
        const speed = opts.speed ?? 2;
        // A single burst can't exceed the ceiling either — clamp the count, then
        // evict oldest to make room. Guarantees list.length <= MAX afterward.
        count = Math.min(count, Particles.MAX);
        const overflow = (this.list.length + count) - Particles.MAX;
        if (overflow > 0) this.list.splice(0, overflow);
        for (let i = 0; i < count; i++) {
            const ang = Math.random() * Math.PI * 2;
            const mag = Math.random() * speed;
            this.list.push({
                x, y,
                vx: Math.cos(ang) * mag + (opts.vx ?? 0),
                vy: Math.sin(ang) * mag * (opts.spread ?? 1) + (opts.vy ?? 0),
                gravity: opts.gravity ?? 0,
                life: 1.0,
                decay: 1 / ((opts.life ?? 40) * (0.7 + Math.random() * 0.6)),
                color,
                size: (opts.size ?? 2) * (0.5 + Math.random()),
                glow: opts.glow ?? false,
            });
        }
    }
    update() {
        const l = this.list;
        for (let i = l.length - 1; i >= 0; i--) {
            const p = l[i];
            p.x += p.vx; p.y += p.vy;
            p.vy += p.gravity;
            p.life -= p.decay;
            if (p.life <= 0) { l[i] = l[l.length - 1]; l.pop(); }
        }
    }
    draw(ctx) {
        for (const p of this.list) {
            ctx.globalAlpha = Math.min(1, p.life);
            if (p.glow) ctx.globalCompositeOperation = 'lighter';
            ctx.fillStyle = p.color;
            const s = p.size * (0.4 + 0.6 * p.life);
            ctx.fillRect(p.x - s / 2, p.y - s / 2, s, s);
            if (p.glow) ctx.globalCompositeOperation = 'source-over';
        }
        ctx.globalAlpha = 1.0;
    }
}

/**
 * Ambient drifting spores — pure decoration, drawn behind the action.
 * They wrap around the screen and sway on a per-particle sine phase.
 * React to nearby mosslings with a gentle wake nudge.
 */
class Spores {
    constructor(count = 26) {
        this.list = [];
        for (let i = 0; i < count; i++) {
            this.list.push({
                x: Math.random() * W,
                y: Math.random() * H,
                vx: 0,
                phase: Math.random() * Math.PI * 2,
                speed: 0.1 + Math.random() * 0.25,
                size: 1 + Math.random() * 1.6,
            });
        }
        this.t = 0;
    }
    update(mosslings) {
        this.t += 0.01;
        for (const s of this.list) {
            s.y -= s.speed;
            s.x += Math.sin(this.t * 2 + s.phase) * 0.3;

            // React to nearby mosslings: push away in a gentle wake.
            if (mosslings && mosslings.length > 0) {
                const radius = 22;
                for (const m of mosslings) {
                    if (!m.alive()) continue;
                    const dx = s.x - m.x;
                    const dy = s.y - m.y;
                    const dist = Math.hypot(dx, dy);
                    if (dist < radius) {
                        const nudge = (radius - dist) / radius;
                        const angle = Math.atan2(dy, dx);
                        s.vx += Math.cos(angle) * nudge * 0.4;
                        s.y -= nudge * 0.15;
                    }
                }
            }

            // Apply and damp horizontal velocity.
            s.x += s.vx;
            s.vx *= 0.9;

            // Wrap around screen edges.
            if (s.y < -4) { s.y = H + 4; s.x = Math.random() * W; }
            if (s.x < -4) s.x = W + 4;
            if (s.x > W + 4) s.x = -4;
        }
    }
    draw(ctx) {
        ctx.save();
        for (const s of this.list) {
            const tw = 0.18 + 0.14 * Math.sin(this.t * 3 + s.phase * 2);
            ctx.globalAlpha = tw;
            ctx.fillStyle = '#b8e986';
            ctx.fillRect(s.x, s.y, s.size, s.size);
        }
        ctx.restore();
    }
}
