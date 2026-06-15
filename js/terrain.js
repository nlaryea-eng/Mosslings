'use strict';
/**
 * MOSSLINGS — terrain system.
 *
 * Authoritative collision lives in a per-pixel Uint8Array mask; visuals live
 * in three offscreen canvas layers (background art, destructible dirt,
 * indestructible fixed). Gameplay code only ever consults the mask, so the
 * pretty rendering can never desync from physics.
 *
 * Visual upgrades over the original flat fills:
 *  - procedural texture patterns for dirt / metal / lava / bridge
 *  - a painted parallax forest-night background
 *  - finalize() pass that grows grass + flowers on every exposed dirt top
 *    and records lava surface points for the in-game ember/glow effects
 */
class Terrain {
    constructor(w, h) {
        this.w = w; this.h = h;
        this.mask = new Uint8Array(w * h);
        this.bgC = this.createCanvas();
        this.dirtC = this.createCanvas();
        this.fixedC = this.createCanvas();
        this.hazardPoints = []; // lava surface sample points, filled by finalize()
        this.patterns = this.makePatterns();
    }
    createCanvas() {
        const c = document.createElement('canvas');
        c.width = this.w; c.height = this.h;
        return { c, ctx: c.getContext('2d', { willReadFrequently: true }) };
    }
    // --- Procedural texture patterns -------------------------------------
    makePatterns() {
        const make = (size, painter) => {
            const c = document.createElement('canvas');
            c.width = c.height = size;
            const ctx = c.getContext('2d');
            painter(ctx, size);
            return this.dirtC.ctx.createPattern ? this.dirtC.ctx.createPattern(c, 'repeat') : null;
        };
        const speckle = (ctx, size, colors, n, s = 2) => {
            for (let i = 0; i < n; i++) {
                ctx.fillStyle = colors[(Math.random() * colors.length) | 0];
                ctx.fillRect(Math.random() * size, Math.random() * size, s, s);
            }
        };
        return {
            dirt: make(32, (ctx, s) => {
                ctx.fillStyle = '#4e342e'; ctx.fillRect(0, 0, s, s);
                speckle(ctx, s, ['#5d4037', '#43302b', '#6d4c41', '#3e2b26'], 90, 2);
                speckle(ctx, s, ['#33691e', '#2e5d1c'], 6, 2); // buried moss flecks
            }),
            metal: make(24, (ctx, s) => {
                ctx.fillStyle = '#546e7a'; ctx.fillRect(0, 0, s, s);
                ctx.fillStyle = '#607d8b'; ctx.fillRect(1, 1, s - 2, 10);
                ctx.fillStyle = '#455a64'; ctx.fillRect(0, 11, s, 2); ctx.fillRect(0, 23, s, 1);
                ctx.fillStyle = '#90a4ae'; // rivets
                ctx.fillRect(3, 3, 2, 2); ctx.fillRect(19, 3, 2, 2);
                ctx.fillRect(3, 15, 2, 2); ctx.fillRect(19, 15, 2, 2);
            }),
            hazard: make(32, (ctx, s) => {
                ctx.fillStyle = '#bf360c'; ctx.fillRect(0, 0, s, s);
                speckle(ctx, s, ['#e64a19', '#d84315', '#ff5722'], 50, 3);
                speckle(ctx, s, ['#ff9800', '#ffc107'], 14, 2); // hot veins
            }),
            bridge: make(16, (ctx, s) => {
                ctx.fillStyle = '#c9a227'; ctx.fillRect(0, 0, s, s);
                ctx.fillStyle = '#e0c068'; ctx.fillRect(0, 0, s, 1);
                ctx.fillStyle = '#9c7a1c'; ctx.fillRect(0, s - 1, s, 1);
                ctx.fillStyle = '#b08d22'; ctx.fillRect(7, 0, 1, s);
            }),
            // One-way membranes: translucent teal with leaning chevrons whose
            // slant signals the allowed travel direction ("/" → right, "\" → left).
            onewayR: make(16, (ctx, s) => this.paintOneway(ctx, s, 1)),
            onewayL: make(16, (ctx, s) => this.paintOneway(ctx, s, -1)),
        };
    }
    paintOneway(ctx, s, dir) {
        ctx.fillStyle = 'rgba(38,166,154,0.28)'; ctx.fillRect(0, 0, s, s);
        ctx.strokeStyle = 'rgba(178,235,242,0.75)'; ctx.lineWidth = 2;
        for (let o = -s; o < s * 2; o += 6) {
            ctx.beginPath();
            if (dir === 1) { ctx.moveTo(o, s); ctx.lineTo(o + s, 0); }      // "/"
            else { ctx.moveTo(o, 0); ctx.lineTo(o + s, s); }               // "\"
            ctx.stroke();
        }
    }
    fillFor(type) {
        switch (type) {
            case T_DIRT: return this.patterns.dirt || '#5d4037';
            case T_METAL: return this.patterns.metal || '#78909c';
            case T_HAZARD: return this.patterns.hazard || '#e64a19';
            case T_BRIDGE: return this.patterns.bridge || '#cddc39';
            case T_ONEWAY_R: return this.patterns.onewayR || 'rgba(38,166,154,0.5)';
            case T_ONEWAY_L: return this.patterns.onewayL || 'rgba(38,166,154,0.5)';
            default: return 'transparent';
        }
    }
    /** Types painted on the indestructible fixed layer (never erased by skills). */
    isFixed(type) {
        return type === T_METAL || type === T_HAZARD || type === T_ONEWAY_R || type === T_ONEWAY_L;
    }
    // --- Collision mask ----------------------------------------------------
    clear(theme = 'FOREST') {
        this.mask.fill(T_AIR);
        this.hazardPoints.length = 0;
        this.dirtC.ctx.clearRect(0, 0, this.w, this.h);
        this.fixedC.ctx.clearRect(0, 0, this.w, this.h);
        this.paintBackground(theme);
    }
    get(x, y) {
        x |= 0; y |= 0;
        if (x < 0 || x >= this.w || y < 0 || y >= this.h) return T_METAL; // world edges are walls
        return this.mask[y * this.w + x];
    }
    set(x, y, type) {
        x |= 0; y |= 0;
        if (x >= 0 && x < this.w && y >= 0 && y < this.h) this.mask[y * this.w + x] = type;
    }
    /** Dirt/bridge yield to erasure; metal, hazard & one-way are indestructible. */
    maskWrite(x, y, type) {
        const cur = this.get(x, y);
        if (type === T_AIR) {
            if (cur === T_DIRT || cur === T_BRIDGE) this.set(x, y, T_AIR);
        } else if (!this.isFixed(cur)) {
            this.set(x, y, type);
        }
    }
    drawRect(x, y, w, h, type) {
        for (let iy = y; iy < y + h; iy++)
            for (let ix = x; ix < x + w; ix++) this.maskWrite(ix, iy, type);
        const ctx = this.isFixed(type) ? this.fixedC.ctx : this.dirtC.ctx;
        if (type === T_AIR) {
            this.dirtC.ctx.save();
            this.dirtC.ctx.globalCompositeOperation = 'destination-out';
            this.dirtC.ctx.fillRect(x, y, w, h);
            this.dirtC.ctx.restore();
        } else {
            ctx.fillStyle = this.fillFor(type);
            ctx.fillRect(x, y, w, h);
        }
    }
    drawCircle(cx, cy, r, type) {
        cx |= 0; cy |= 0;
        const rSq = r * r;
        for (let y = cy - r; y <= cy + r; y++)
            for (let x = cx - r; x <= cx + r; x++)
                if ((x - cx) * (x - cx) + (y - cy) * (y - cy) <= rSq) this.maskWrite(x, y, type);
        const ctx = this.isFixed(type) ? this.fixedC.ctx : this.dirtC.ctx;
        ctx.save();
        if (type === T_AIR) ctx.globalCompositeOperation = 'destination-out';
        else ctx.fillStyle = this.fillFor(type);
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }
    // --- Decoration pass (run once after a level's geometry is placed) ----
    finalize() {
        const ctx = this.dirtC.ctx;
        this.hazardPoints.length = 0;
        for (let x = 0; x < this.w; x++) {
            for (let y = 1; y < this.h; y++) {
                const t = this.mask[y * this.w + x];
                const above = this.mask[(y - 1) * this.w + x];
                if (t === T_DIRT && above === T_AIR) {
                    // mossy edge: 3px gradient + occasional blade or flower
                    ctx.fillStyle = '#8bc34a'; ctx.fillRect(x, y, 1, 1);
                    ctx.fillStyle = '#689f38'; ctx.fillRect(x, y + 1, 1, 1);
                    ctx.fillStyle = '#33691e'; ctx.fillRect(x, y + 2, 1, 1);
                    const roll = Math.random();
                    if (roll < 0.05) { // grass blade
                        ctx.fillStyle = '#9ccc65'; ctx.fillRect(x, y - 1 - (Math.random()*2|0), 1, 2);
                    }
                    else if (roll < 0.062) { // tiny flower
                        ctx.fillStyle = ['#f8bbd0', '#fff59d', '#b39ddb'][(Math.random() * 3) | 0]; 
                        ctx.fillRect(x, y - 2, 2, 2);
                    }
                    else if (roll < 0.07) { // tiny mushroom
                        ctx.fillStyle = '#efebe9'; ctx.fillRect(x, y - 2, 1, 2);
                        ctx.fillStyle = '#e57373'; ctx.fillRect(x - 1, y - 3, 3, 1);
                    }
                    // subtle rim highlight
                    if (x % 4 === 0) {
                        ctx.fillStyle = 'rgba(255,255,255,0.15)';
                        ctx.fillRect(x, y, 2, 1);
                    }
                } else if (t === T_METAL && above === T_AIR) {
                    // rusted/worn edge on metal
                    ctx.fillStyle = '#455a64'; ctx.fillRect(x, y, 1, 1);
                    if (Math.random() < 0.1) { ctx.fillStyle = '#78909c'; ctx.fillRect(x, y, 1, 2); }
                } else if (t === T_HAZARD && above === T_AIR) {
                    if (x % 6 === 0) this.hazardPoints.push({ x, y, phase: Math.random() * Math.PI * 2 });
                }
            }
        }
        // soft ambient occlusion/shadow pass
        ctx.save();
        ctx.globalCompositeOperation = 'source-atop';
        ctx.fillStyle = 'rgba(0,0,0,0.12)';
        for (let x = 0; x < this.w; x += 4) {
            for (let y = 0; y < this.h; y += 4) {
                if (this.mask[y * this.w + x] !== T_AIR) {
                    // check neighbors for air to apply shadow
                    let hasAir = false;
                    if (x > 0 && this.mask[y * this.w + x - 1] === T_AIR) hasAir = true;
                    else if (x < this.w - 1 && this.mask[y * this.w + x + 1] === T_AIR) hasAir = true;
                    else if (y > 0 && this.mask[(y - 1) * this.w + x] === T_AIR) hasAir = true;
                    else if (y < this.h - 1 && this.mask[(y + 1) * this.w + x] === T_AIR) hasAir = true;
                    if (hasAir) ctx.fillRect(x, y, 4, 4);
                }
            }
        }
        ctx.restore();
    }
    // --- Painted background ------------------------------------------------
    paintBackground(theme = 'FOREST') {
        const ctx = this.bgC.ctx, w = this.w, h = this.h;
        if (!ctx.createLinearGradient) { ctx.fillStyle = '#0d1b2a'; ctx.fillRect(0, 0, w, h); return; }
        
        let sky, hills;
        if (theme === 'VOLCANO') {
            sky = ['#1a0a05', '#3d120a', '#5a1a0a'];
            hills = ['#1f0c08', '#260e0a', '#30100c'];
        } else if (theme === 'CAVE') {
            sky = ['#0a051a', '#100a26', '#140c30'];
            hills = ['#0c081f', '#0e0a26', '#100c30'];
        } else { // FOREST
            sky = ['#0a1228', '#10243a', '#142e30'];
            hills = ['#0c1f26', '#0e2620', '#103024'];
        }

        const skyG = ctx.createLinearGradient(0, 0, 0, h);
        skyG.addColorStop(0, sky[0]);
        skyG.addColorStop(0.55, sky[1]);
        skyG.addColorStop(1, sky[2]);
        ctx.fillStyle = skyG;
        ctx.fillRect(0, 0, w, h);

        // stars
        for (let i = 0; i < 90; i++) {
            ctx.globalAlpha = 0.25 + Math.random() * 0.55;
            ctx.fillStyle = theme === 'VOLCANO' ? '#ffccbc' : (Math.random() < 0.15 ? '#bfe3ff' : '#ffffff');
            ctx.fillRect(Math.random() * w, Math.random() * h * 0.6, Math.random() < 0.2 ? 2 : 1, 1);
        }
        ctx.globalAlpha = 1;
        
        if (theme !== 'CAVE') {
            // moon/sun
            const mx = w - 150, my = 80;
            const color = theme === 'VOLCANO' ? '255,100,50' : '220,235,255';
            const halo = ctx.createRadialGradient(mx, my, 18, mx, my, 80);
            halo.addColorStop(0, `rgba(${color},0.25)`);
            halo.addColorStop(1, `rgba(${color},0)`);
            ctx.fillStyle = halo; ctx.fillRect(mx - 80, my - 80, 160, 160);
            ctx.fillStyle = theme === 'VOLCANO' ? '#ff7043' : '#dce9f5'; 
            ctx.beginPath(); ctx.arc(mx, my, 26, 0, Math.PI * 2); ctx.fill();
        }

        // three layers of forest silhouettes, back to front
        this.paintHills(ctx, h * 0.62, 60, hills[0], 11);
        this.paintHills(ctx, h * 0.74, 80, hills[1], 7);
        this.paintHills(ctx, h * 0.88, 70, hills[2], 5);
        
        // ground mist
        const mist = ctx.createLinearGradient(0, h - 110, 0, h);
        mist.addColorStop(0, 'rgba(140,180,170,0)');
        mist.addColorStop(1, theme === 'VOLCANO' ? 'rgba(255,100,50,0.08)' : 'rgba(140,180,170,0.10)');
        ctx.fillStyle = mist; ctx.fillRect(0, h - 110, w, 110);
        
        // vignette
        const vig = ctx.createRadialGradient(w / 2, h / 2, h * 0.45, w / 2, h / 2, h * 0.95);
        vig.addColorStop(0, 'rgba(0,0,0,0)');
        vig.addColorStop(1, 'rgba(0,0,0,0.4)');
        ctx.fillStyle = vig; ctx.fillRect(0, 0, w, h);
    }
    paintHills(ctx, baseY, amp, color, treeStep) {
        const w = this.w, h = this.h;
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.moveTo(0, h);
        const seed = baseY * 0.013;
        for (let x = 0; x <= w; x += 8) {
            const y = baseY + Math.sin(x * 0.008 + seed) * amp * 0.5 + Math.sin(x * 0.021 + seed * 3) * amp * 0.25;
            ctx.lineTo(x, y);
        }
        ctx.lineTo(w, h);
        ctx.closePath();
        ctx.fill();
        // pine silhouettes riding the ridge line
        for (let x = 10; x < w; x += treeStep * 8) {
            const y = baseY + Math.sin(x * 0.008 + seed) * amp * 0.5 + Math.sin(x * 0.021 + seed * 3) * amp * 0.25;
            const th = 14 + ((x * 7919) % 17);
            ctx.beginPath();
            ctx.moveTo(x, y - th);
            ctx.lineTo(x - th * 0.38, y + 2);
            ctx.lineTo(x + th * 0.38, y + 2);
            ctx.closePath();
            ctx.fill();
        }
    }
}
