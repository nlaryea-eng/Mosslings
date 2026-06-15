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
 */
const LEVEL_FORMAT_VERSION = 0x02;
const SHARE_MAX_CHARS = 1500; // reject absurd payloads early (well under URL limits)

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

    const buf = [];
    const u16 = (v) => { v = Math.max(0, Math.min(65535, v | 0)); buf.push((v >> 8) & 0xFF, v & 0xFF); };
    const u8 = (v) => buf.push(Math.max(0, Math.min(255, v | 0)));

    buf.push(LEVEL_FORMAT_VERSION);
    for (const b of new TextEncoder().encode(level.name.slice(0, 64))) buf.push(b);
    buf.push(0x00); // name terminator

    u8(level.totalSpawn ?? 0);
    u8(level.reqSaved ?? 0);
    u16(level.time ?? 0);
    buf.push(Math.min(RATE_MAX, Math.max(RATE_MIN, level.spawnRate ?? 60)));
    
    // flags: bit 0 = athlete portal, bit 1 = has par data
    let flags = (level.exit && level.exit.athlete) ? 0x01 : 0x00;
    if (level.par) flags |= 0x02;
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

        need(1);
        const version = buf[o++];
        if (version !== 0x01 && version !== 0x02) return null; // unknown version

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
        if (version === 0x02 && (flags & 0x02)) {
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

        // geometry sanity — spawn & exit must sit inside the play field
        if (spawn.x < 0 || spawn.x > W || spawn.y < 0 || spawn.y > H ||
            exit.x < 0 || exit.x > W || exit.y < 0 || exit.y > H) return null;

        return { name, totalSpawn, reqSaved, time, spawnRate, spawn, exit, inventory, commands, par };
    } catch (e) {
        return null;
    }
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
    
    // Helper: find drop distance below a point
    const dropBelow = (x, y) => {
        for (let yy = Math.floor(y); yy < H; yy++) {
            const t = terrain.get(x, yy + 1);
            if (t === T_DIRT || t === T_METAL || t === T_BRIDGE) return yy - y;
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
    module.exports = { serializeLevel, deserializeLevel, computeMedals, LEVEL_FORMAT_VERSION };
}
