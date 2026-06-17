'use strict';
/**
 * MOSSLINGS — level serialization for sharing (see DESIGN_META.md §1).
 *
 * A custom level is packed into a compact versioned binary buffer and then
 * encoded as URL-safe base64 so it survives a query string intact. No build
 * step, no dependencies — runs from file://.
 *
 * Refinements over the original design note:
 *  - URL-SAFE base64 ('+/=' → '-_' + stripped padding); raw btoa output would
 *    corrupt inside a ?level= parameter (`+` decodes to a space).
 *  - the reserved metadata byte now carries exit flags (bit 0 = athlete portal).
 *  - command `type` accepts the full tile range incl. one-way membranes (0..6).
 *  - v03 appends optional editor/gameplay objects (platforms, switches, gates).
 */
const LEVEL_FORMAT_VERSION = 0x03;
const SHARE_MAX_CHARS = 1500; // reject absurd payloads early (well under URL limits)
const SHARE_MAX_OBJECTS = 80;

function _b64encode(bin) {
    return (typeof btoa !== 'undefined' ? btoa(bin) : Buffer.from(bin, 'binary').toString('base64'));
}
function _b64decode(b64) {
    return (typeof atob !== 'undefined' ? atob(b64) : Buffer.from(b64, 'base64').toString('binary'));
}
function _toBase64Url(bytes) {
    let bin = '';
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return _b64encode(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function _fromBase64Url(str) {
    let b64 = str.replace(/-/g, '+').replace(/_/g, '/');
    while (b64.length % 4) b64 += '=';
    const bin = _b64decode(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
}

/**
 * Serialize a level object to a URL-safe base64 string.
 * @returns {string|null} encoded level, or null if the level is invalid/too big.
 */
function serializeLevel(level) {
    if (!level || typeof level.name !== 'string' || !level.name || level.name.length > 64) return null;
    if (!Array.isArray(level.commands) || level.commands.length > 255) return null;
    const objects = normalizeLevelObjects(level.objects || []);
    if (objects.length > SHARE_MAX_OBJECTS) return null;

    const buf = [];
    const u16 = (v) => { v = Math.max(0, Math.min(65535, v | 0)); buf.push((v >> 8) & 0xFF, v & 0xFF); };
    const i16 = (v) => {
        v = Math.max(-32768, Math.min(32767, v | 0));
        if (v < 0) v += 65536;
        u16(v);
    };
    const u8 = (v) => buf.push(Math.max(0, Math.min(255, v | 0)));

    buf.push(LEVEL_FORMAT_VERSION);
    for (const b of new TextEncoder().encode(level.name.slice(0, 64))) buf.push(b);
    buf.push(0x00); // name terminator

    u8(level.totalSpawn ?? 0);
    u8(level.reqSaved ?? 0);
    u16(level.time ?? 0);
    buf.push(Math.min(RATE_MAX, Math.max(RATE_MIN, level.spawnRate ?? 60)));
    
    // flags: bit 0 = athlete portal, bit 1 = has par data, bit 2 = has objects
    let flags = (level.exit && level.exit.athlete) ? 0x01 : 0x00;
    if (level.par) flags |= 0x02;
    if (objects.length) flags |= 0x04;
    buf.push(flags);

    const spawn = level.spawn || { x: 0, y: 0 };
    const exit = level.exit || { x: W - 1, y: H - 1 };
    u16(spawn.x); u16(spawn.y); u16(exit.x); u16(exit.y);

    for (let s = 0; s < 8; s++) u8((level.inventory && level.inventory[s]) || 0);

    // v02: optional par data
    if (level.par) {
        u16(level.par.time || 0);
        u8(level.par.skills || 0);
        u8(level.par.saved || 0);
    }

    u8(level.commands.length);
    for (const c of level.commands) { u8(c.type ?? T_AIR); u16(c.x); u16(c.y); u16(c.w); u16(c.h); }

    // v03: optional fixed-width object block. Fixed records keep the decoder
    // simple and make future extension possible via the flags byte.
    if (objects.length) {
        u8(objects.length);
        for (const o of objects) {
            u8(o.type); u16(o.x); u16(o.y); u16(o.w); u16(o.h);
            i16(o.dx || 0); i16(o.dy || 0);
            u16(o.period || 240); u16(o.phase || 0);
            u8(o.target || 0); u8(o.flags || 0);
        }
    }

    const encoded = _toBase64Url(Uint8Array.from(buf));
    return encoded.length > SHARE_MAX_CHARS ? null : encoded;
}

/**
 * Deserialize a base64 level string back into a level object.
 * @returns {Object|null} level, or null if malformed / unsupported / out of bounds.
 */
function deserializeLevel(encoded) {
    try {
        if (typeof encoded !== 'string' || !encoded || encoded.length > SHARE_MAX_CHARS) return null;
        const buf = _fromBase64Url(encoded);
        let o = 0;
        const need = (n) => { if (o + n > buf.length) throw new Error('truncated'); };
        const u16 = () => { need(2); const v = (buf[o] << 8) | buf[o + 1]; o += 2; return v; };
        const i16 = () => { const v = u16(); return v & 0x8000 ? v - 0x10000 : v; };

        need(1);
        const version = buf[o++];
        if (version !== 0x01 && version !== 0x02 && version !== 0x03) return null; // unknown version

        let nameEnd = o;
        while (nameEnd < buf.length && buf[nameEnd] !== 0x00) nameEnd++;
        if (nameEnd >= buf.length) return null;
        const name = new TextDecoder().decode(buf.slice(o, nameEnd));
        o = nameEnd + 1;

        need(2);
        const totalSpawn = buf[o++];
        const reqSaved = buf[o++];
        const time = u16();
        need(2);
        const spawnRate = Math.min(RATE_MAX, Math.max(RATE_MIN, buf[o++]));
        const flags = buf[o++];

        const spawn = { x: u16(), y: u16() };
        const exit = { x: u16(), y: u16() };
        if (flags & 0x01) exit.athlete = true;

        need(8);
        const inventory = {};
        for (let s = 0; s < 8; s++) inventory[s] = buf[o++];

        let par = null;
        if ((version === 0x02 || version === 0x03) && (flags & 0x02)) {
            need(4);
            par = { time: u16(), skills: buf[o++], saved: buf[o++] };
        }

        need(1);
        const cmdCount = buf[o++];
        const commands = [];
        for (let i = 0; i < cmdCount; i++) {
            need(9);
            const type = buf[o++];
            if (type > T_ONEWAY_L) return null; // unknown tile type
            commands.push({ type, x: u16(), y: u16(), w: u16(), h: u16() });
        }

        let objects = [];
        if (version === 0x03 && (flags & 0x04)) {
            need(1);
            const objCount = buf[o++];
            if (objCount > SHARE_MAX_OBJECTS) return null;
            for (let i = 0; i < objCount; i++) {
                need(19);
                const type = buf[o++];
                if (type > OBJ_GATE) return null;
                objects.push({
                    type,
                    x: u16(), y: u16(), w: u16(), h: u16(),
                    dx: i16(), dy: i16(),
                    period: u16(), phase: u16(),
                    target: buf[o++],
                    flags: buf[o++],
                });
            }
            objects = normalizeLevelObjects(objects);
        }

        // geometry sanity — spawn & exit must sit inside the play field
        if (spawn.x < 0 || spawn.x > W || spawn.y < 0 || spawn.y > H ||
            exit.x < 0 || exit.x > W || exit.y < 0 || exit.y > H) return null;

        return { name, totalSpawn, reqSaved, time, spawnRate, spawn, exit, inventory, commands, par, objects };
    } catch (e) {
        return null;
    }
}

function clampRectObject(o) {
    const type = o.type | 0;
    if (type < OBJ_PLATFORM || type > OBJ_GATE) return null;
    const x = Math.max(-W, Math.min(W * 2, Math.round(o.x || 0)));
    const y = Math.max(-H, Math.min(H * 2, Math.round(o.y || 0)));
    const w = Math.max(4, Math.min(W, Math.round(o.w || (type === OBJ_GATE ? 14 : 80))));
    const h = Math.max(4, Math.min(H, Math.round(o.h || (type === OBJ_GATE ? 90 : 10))));
    const period = Math.max(30, Math.min(3600, Math.round(o.period || 240)));
    return {
        type, x, y, w, h,
        dx: Math.max(-W, Math.min(W, Math.round(o.dx || 0))),
        dy: Math.max(-H, Math.min(H, Math.round(o.dy || 0))),
        period,
        phase: Math.max(0, Math.min(3600, Math.round(o.phase || 0))),
        target: Math.max(0, Math.min(255, Math.round(o.target || 0))),
        flags: Math.max(0, Math.min(255, Math.round(o.flags || 0))),
    };
}

function normalizeLevelObjects(objects) {
    if (!Array.isArray(objects)) return [];
    const out = [];
    for (const raw of objects) {
        const o = clampRectObject(raw || {});
        if (o) out.push(o);
    }
    return out;
}

function objectRectAt(o, step = 0) {
    if (!o) return null;
    const bx = o.baseX ?? o.x;
    const by = o.baseY ?? o.y;
    if (o.type !== OBJ_PLATFORM || (!(o.dx || 0) && !(o.dy || 0))) return { x: bx, y: by, w: o.w, h: o.h };
    const period = Math.max(1, o.period || 240);
    const t = ((step + (o.phase || 0)) % period + period) % period;
    const p = t / period;
    const tri = p < 0.5 ? p * 2 : (1 - p) * 2;
    return {
        x: Math.round(bx + (o.dx || 0) * tri),
        y: Math.round(by + (o.dy || 0) * tri),
        w: o.w,
        h: o.h,
    };
}

function pointInRect(x, y, r, pad = 0) {
    return !!r && x >= r.x - pad && x < r.x + r.w + pad && y >= r.y - pad && y < r.y + r.h + pad;
}

function objectSolidAt(objects, x, y, step = 0, switchState = {}) {
    for (const o of normalizeLevelObjects(objects)) {
        if (o.type === OBJ_SWITCH) continue;
        if (o.type === OBJ_GATE && switchState[o.target]) continue;
        if (pointInRect(x, y, objectRectAt(o, step))) return T_METAL;
    }
    return T_AIR;
}

/**
 * Structural validation logic — identifies obviously broken levels.
 * Returns null if valid, or a specific string error message if invalid.
 */
function validateLevelStructure(lvl) {
    if (!lvl || !lvl.spawn || !lvl.exit) return 'Level data is damaged.';
    
    // We need a temporary terrain to check drops
    const terrain = new Terrain(W, H);
    terrain.clear();
    for (const c of (lvl.commands || [])) terrain.drawRect(c.x, c.y, c.w, c.h, c.type);
    const objects = normalizeLevelObjects(lvl.objects || []);
    
    // Helper: find drop distance below a point
    const dropBelow = (x, y) => {
        for (let yy = Math.floor(y); yy < H; yy++) {
            const t = terrain.get(x, yy + 1);
            if (t === T_DIRT || t === T_METAL || t === T_BRIDGE || objectSolidAt(objects, x, yy + 1)) return yy - y;
        }
        return Infinity;
    };

    const drop = dropBelow(lvl.spawn.x, lvl.spawn.y);
    if (drop === Infinity) return 'No solid ground under the spawn.';
    if (drop >= PHYS.FATAL_FALL) return 'Spawn is too high above the ground.';
    
    const exitDrop = dropBelow(lvl.exit.x, lvl.exit.y - 4);
    if (exitDrop > 6) return 'Exit needs to be placed on solid ground.';
    
    if (lvl.reqSaved > lvl.totalSpawn) return 'Required saved exceeds total mosslings.';

    return null;
}

/**
 * Pure medal evaluation — kept out of the DOM so it is unit-testable.
 * Gold/Rescue = saved target met; Silver/Efficiency = skills at or under par;
 * Bronze/Speed = finished at or under the par time. Each is independent.
 * @param {Object|undefined} par   { saved, skills, time } targets (campaign only)
 * @param {Object} stats           { saved, skills, time } achieved this run
 * @returns {{saved:boolean, skills:boolean, time:boolean}}
 */
function computeMedals(par, stats) {
    if (!par) return { saved: false, skills: false, time: false };
    return {
        saved: stats.saved >= par.saved,
        skills: stats.skills <= par.skills,
        time: stats.time <= par.time,
    };
}

// Exposed for the Node test harness (browser uses the globals directly).
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        serializeLevel,
        deserializeLevel,
        computeMedals,
        normalizeLevelObjects,
        objectRectAt,
        objectSolidAt,
        LEVEL_FORMAT_VERSION,
    };
}
