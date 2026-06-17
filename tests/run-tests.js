'use strict';
/**
 * MOSSLINGS test suite — run with:  node tests/run-tests.js
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

// --- Browser stubs ----------------------------------------------------------
function makeCtx() {
    const grad = () => ({ addColorStop() {} });
    const base = {
        createPattern: () => null,
        createLinearGradient: grad,
        createRadialGradient: grad,
        measureText: () => ({ width: 0 }),
    };
    return new Proxy(base, {
        get(t, k) {
            if (k in t) return t[k];
            t[k] = () => {};
            return t[k];
        },
        set(t, k, v) { t[k] = v; return true; },
    });
}
const makeEl = () => ({
    style: {},
    classList: { add() {}, remove() {}, toggle() {}, contains: () => true },
    querySelector: () => makeEl(),
    querySelectorAll: () => [],
    appendChild: () => {},
    remove: () => {},
    addEventListener: () => {},
    innerHTML: '',
    innerText: '',
    value: '',
    dataset: {}
});
const fakeCanvas = {
    width: 960, height: 540, style: {},
    getContext: () => makeCtx(),
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 960, height: 540 }),
    addEventListener() {},
};
global.document = {
    createElement: () => ({ ...makeEl(), width: 0, height: 0, getContext: () => makeCtx() }),
    getElementById: (id) => (id === 'gameCanvas' ? fakeCanvas : makeEl()),
    querySelector: () => makeEl(),
    querySelectorAll: () => [makeEl()],
};
global.window = global;
try { global.navigator = { clipboard: { writeText: () => Promise.resolve() } }; } catch(e) {}
global.URLSearchParams = class { get() { return null; } };
global.history = { replaceState() {} };
global.location = { origin: 'http://localhost', pathname: '/', search: '', hash: '' };
global.performance = global.performance || { now: () => Date.now() };
global.requestAnimationFrame = () => 0;
global.localStorage = (() => {
    const m = new Map();
    return { getItem: k => (m.get(k) || null), setItem: (k, v) => m.set(k, v), removeItem: k => m.delete(k) };
})();
// Delete existing global.ui before loading ui.js to avoid collisions
delete global.ui;

for (const f of ['constants.js', 'icons.js', 'audio.js', 'haptics.js', 'music.js', 'particles.js', 'terrain.js', 'mossling.js', 'levels.js', 'daily.js', 'utils.js', 'replay-integrity.js', 'daily-ghost.js', 'storage.js', 'ugc-trust.js', 'result-card.js', 'overlays.js', 'game.js', 'ui.js', 'menu-ui.js', 'result-ui.js']) {
    const file = path.join(__dirname, '..', 'js', f);
    vm.runInThisContext(fs.readFileSync(file, 'utf8'), { filename: file });
}

// --- Tiny test harness -------------------------------------------------------
let passed = 0, failed = 0;
function test(name, fn) {
    try { fn(); passed++; console.log(`  ✓ ${name}`); }
    catch (e) { failed++; console.error(`  ✗ ${name}\n      ${e.message}`); }
}
function assert(cond, msg) { if (!cond) throw new Error(msg || 'assertion failed'); }
function eq(a, b, msg) { assert(a === b, `${msg || 'expected equal'}: got ${a}, want ${b}`); }
function replayCodeFromPayload(payload) {
    return _toBase64Url(new TextEncoder().encode(JSON.stringify(payload)));
}

// --- Fixtures ----------------------------------------------------------------
function makeGame() {
    const terrain = new Terrain(W, H);
    terrain.clear();
    return {
        terrain,
        particles: new Particles(),
        mosslings: [],
        savedCount: 0,
        shake: 0, flash: 0, hitStop: 0, saveStreak: 0, lastSaveStep: -999, simStep: 0,
        level: { exit: { x: -9999, y: -9999 }, spawn: { x: 0, y: 0 } },
        deaths: { cliff: 0, lava: 0, void: 0, explode: 0, lastPos: { cliff: null, lava: null, void: null, explode: null } },
        juice() {},
        onSave(m) { this.savedCount++; },
        recordDeath(cause, x, y) { if (cause in this.deaths) { this.deaths[cause]++; this.deaths.lastPos[cause] = { x: Math.round(x), y: Math.round(y) }; } },
    };
}
function step(game, m, frames) {
    for (let i = 0; i < frames && m.alive(); i++) m.update(game);
}
function dropBelow(terrain, x, y) {
    for (let yy = Math.floor(y); yy < H; yy++) {
        const t = terrain.get(x, yy + 1);
        if (t === T_DIRT || t === T_METAL || t === T_BRIDGE) return yy - y;
    }
    return Infinity;
}

// ==============================================================
console.log('\n— Terrain mask —');
// ==============================================================
test('drawRect writes dirt into the mask', () => {
    const g = makeGame();
    g.terrain.drawRect(10, 10, 5, 5, T_DIRT);
    eq(g.terrain.get(12, 12), T_DIRT);
    eq(g.terrain.get(16, 12), T_AIR);
});
test('out-of-bounds reads as metal (world edges are walls)', () => {
    const g = makeGame();
    eq(g.terrain.get(-1, 10), T_METAL);
    eq(g.terrain.get(W, 10), T_METAL);
    eq(g.terrain.get(10, H), T_METAL);
});
test('erasing removes dirt and bridge but never metal or lava', () => {
    const g = makeGame();
    g.terrain.drawRect(0, 0, 10, 10, T_DIRT);
    g.terrain.drawRect(10, 0, 10, 10, T_METAL);
    g.terrain.drawRect(20, 0, 10, 10, T_HAZARD);
    g.terrain.drawRect(30, 0, 10, 10, T_BRIDGE);
    g.terrain.drawCircle(20, 5, 60, T_AIR);
    eq(g.terrain.get(5, 5), T_AIR, 'dirt erased');
    eq(g.terrain.get(15, 5), T_METAL, 'metal survives');
    eq(g.terrain.get(25, 5), T_HAZARD, 'lava survives');
    eq(g.terrain.get(35, 5), T_AIR, 'bridge erased');
});
test('dirt cannot overwrite metal', () => {
    const g = makeGame();
    g.terrain.drawRect(10, 10, 5, 5, T_METAL);
    g.terrain.drawRect(10, 10, 5, 5, T_DIRT);
    eq(g.terrain.get(12, 12), T_METAL);
});

// ==============================================================
console.log('\n— Mossling physics —');
// ==============================================================
test('walker advances along flat ground', () => {
    const g = makeGame();
    g.terrain.drawRect(0, 300, 900, 20, T_DIRT);
    const m = new Mossling(100, 300);
    step(g, m, 120);
    eq(m.state, STATE.WALK);
    assert(m.x > 140, `should have advanced, x=${m.x}`);
});
test('walker turns around at a metal wall', () => {
    const g = makeGame();
    g.terrain.drawRect(0, 300, 200, 20, T_DIRT);
    g.terrain.drawRect(150, 200, 20, 100, T_METAL);
    const m = new Mossling(120, 300);
    step(g, m, 200);
    eq(m.dir, -1, 'should be walking left after bouncing');
    assert(m.alive(), 'should survive');
});
test(`walker steps up ${PHYS.STEP_UP}px but not ${PHYS.STEP_UP + 1}px`, () => {
    const g = makeGame();
    g.terrain.drawRect(0, 300, 200, 20, T_DIRT);
    g.terrain.drawRect(150, 300 - PHYS.STEP_UP, 50, 20, T_DIRT); // low step
    const m = new Mossling(120, 300);
    step(g, m, 120);
    eq(m.y, 300 - PHYS.STEP_UP - 1, 'climbed the low step');
    const g2 = makeGame();
    g2.terrain.drawRect(0, 300, 200, 20, T_DIRT);
    g2.terrain.drawRect(150, 300 - PHYS.STEP_UP - 1, 50, 40, T_DIRT); // too tall
    const m2 = new Mossling(120, 300);
    step(g2, m2, 120);
    eq(m2.dir, -1, 'turned around at the tall step');
});
test('safe fall lands, walking resumes', () => {
    const g = makeGame();
    const dist = PHYS.FATAL_FALL - 20;
    g.terrain.drawRect(0, 100 + dist, 300, 20, T_DIRT);
    const m = new Mossling(100, 100);
    step(g, m, 400);
    eq(m.state, STATE.WALK);
});
test('fall beyond FATAL_FALL kills', () => {
    const g = makeGame();
    g.terrain.drawRect(0, 100 + PHYS.FATAL_FALL + 25, 300, 20, T_DIRT);
    const m = new Mossling(100, 100);
    step(g, m, 600);
    eq(m.state, STATE.DEAD);
});
test('floater survives any fall', () => {
    const g = makeGame();
    g.terrain.drawRect(0, 500, 300, 20, T_DIRT);
    const m = new Mossling(100, 50);
    m.hasFloater = true;
    step(g, m, 1200);
    eq(m.state, STATE.WALK, 'floated down 450px safely');
});
test('blocker stops and turns walkers', () => {
    const g = makeGame();
    g.terrain.drawRect(0, 300, 900, 20, T_DIRT);
    const blocker = new Mossling(200, 300);
    blocker.state = STATE.BLOCK;
    const walker = new Mossling(120, 300);
    walker.state = STATE.WALK;
    g.mosslings.push(blocker, walker);
    for (let i = 0; i < 400; i++) { blocker.update(g); walker.update(g); }
    assert(walker.x < 200, `walker passed the blocker: x=${walker.x}`);
    eq(walker.dir, -1, 'walker bounced');
});
test('digger tunnels through a floor and falls out the bottom', () => {
    const g = makeGame();
    g.terrain.drawRect(0, 300, 300, 20, T_DIRT);   // floor to pierce
    g.terrain.drawRect(0, 380, 900, 20, T_DIRT);   // landing 60px below
    const m = new Mossling(150, 290);
    step(g, m, 30); // land on the floor first
    const sx = m.x; // it may have wandered a few px while settling
    m.state = STATE.DIG;
    step(g, m, 800);
    eq(m.state, STATE.WALK, 'landed below');
    assert(m.y >= 377 && m.y <= 382, `should stand on lower floor, y=${m.y}`);
    eq(g.terrain.get(sx, 310), T_AIR, 'shaft was carved');
});
test('basher carves through dirt and stops at metal', () => {
    const g = makeGame();
    g.terrain.drawRect(0, 320, 500, 20, T_DIRT);     // ground
    g.terrain.drawRect(200, 220, 60, 100, T_DIRT);   // dirt wall
    g.terrain.drawRect(290, 220, 20, 100, T_METAL);  // metal behind it
    const m = new Mossling(150, 310);
    step(g, m, 30);                                  // settle onto the ground
    m.x = 192; m.dir = 1;                            // stand adjacent to the wall, facing it
    m.state = STATE.BASH;
    step(g, m, 1500);
    assert(m.alive(), 'survived');
    eq(g.terrain.get(230, 315), T_AIR, 'tunnel carved through the dirt wall');
    eq(g.terrain.get(295, 315), T_METAL, 'metal untouched');
    eq(g.terrain.get(230, 321), T_DIRT, 'floor under the tunnel preserved');
});
test('miner digs a diagonal stairway down at a 1:1 slope', () => {
    const g = makeGame();
    g.terrain.drawRect(0, 200, 400, 340, T_DIRT);
    const m = new Mossling(100, 190);
    step(g, m, 30); // land on the surface
    const x0 = m.x, y0 = m.y;
    m.state = STATE.MINE;
    step(g, m, 600);
    assert(m.state === STATE.MINE, `still mining, state=${STATE_NAMES[m.state]}`);
    const dx = m.x - x0, dy = m.y - y0;
    assert(dy > 40, `descended, dy=${dy}`);
    eq(dx, dy, 'slope is exactly 1:1');
    eq(g.terrain.get(x0 + 10, y0 - 2), T_AIR, 'tunnel behind the miner is open');
});
test('builder lays a rising bridge then shrugs back to walking', () => {
    const g = makeGame();
    g.terrain.drawRect(0, 300, 900, 20, T_DIRT);
    const m = new Mossling(100, 290);
    step(g, m, 30); // land
    m.state = STATE.BUILD;
    m.bricksLeft = PHYS.BUILD_BRICKS;
    step(g, m, PHYS.BUILD_BRICKS * PHYS.BUILD_PERIOD + 100);
    assert(m.alive(), 'survived');
    assert(m.x >= 100 + (PHYS.BUILD_BRICKS - 1) * 5, `advanced along bridge, x=${m.x}`);
    eq(g.terrain.get(152, 290), T_BRIDGE, 'elevated bridge tiles exist');
    eq(m.bricksLeft, 0, 'used all bricks');
});
test('climber scales a wall, crests, and survives', () => {
    const g = makeGame();
    g.terrain.drawRect(0, 300, 200, 240, T_DIRT);    // floor
    g.terrain.drawRect(200, 180, 760, 360, T_DIRT);  // 120px cliff to the right edge
    const m = new Mossling(150, 290);
    m.hasClimber = true;
    let minY = Infinity;
    for (let i = 0; i < 1500 && m.alive(); i++) { m.update(g); minY = Math.min(minY, m.y); }
    assert(m.alive(), 'survived');
    assert(minY <= 182, `reached the cliff top, highest y=${minY}`);
});
test('exploder counts down, carves terrain, and dies', () => {
    const g = makeGame();
    g.terrain.drawRect(0, 300, 300, 100, T_DIRT);
    const m = new Mossling(150, 290);
    step(g, m, 30); // land
    m.state = STATE.BLOCK;            // blocker + exploder combo (frees blockers)
    m.isExploding = true;
    m.explodeTimer = PHYS.EXPLODE_FUSE;
    step(g, m, PHYS.EXPLODE_FUSE + 10);
    eq(m.state, STATE.DEAD);
    eq(g.terrain.get(150, 310), T_AIR, 'crater carved below');
});
test('reaching the exit saves the mossling', () => {
    const g = makeGame();
    g.terrain.drawRect(0, 300, 900, 20, T_DIRT);
    g.level.exit = { x: 200, y: 300 };
    const m = new Mossling(150, 300);
    step(g, m, 400);
    eq(m.state, STATE.SAVED);
    eq(g.savedCount, 1);
});
test('lava kills on contact', () => {
    const g = makeGame();
    g.terrain.drawRect(0, 300, 100, 20, T_DIRT);
    g.terrain.drawRect(100, 318, 200, 2, T_HAZARD);
    const m = new Mossling(80, 300);
    step(g, m, 400);
    eq(m.state, STATE.DEAD, 'walked off into lava and died');
});

// ==============================================================
console.log('\n— Level integrity (all campaign maps) —');
// ==============================================================
test('campaign now ships a 20+ level hard-mode arc', () => {
    assert(LEVELS.length >= 20, `expected at least 20 campaign levels, got ${LEVELS.length}`);
    assert(LEVELS.some(l => (l.objects || []).some(o => o.type === OBJ_PLATFORM)), 'campaign demonstrates moving platforms');
    assert(LEVELS.some(l => (l.objects || []).some(o => o.type === OBJ_SWITCH)), 'campaign demonstrates pressure switches');
    assert(LEVELS.some(l => (l.objects || []).some(o => o.type === OBJ_GATE)), 'campaign demonstrates switch gates');
});
LEVELS.forEach((lvl, i) => {
    test(`L${i + 1} "${lvl.name}": geometry invariants hold`, () => {
        const terrain = new Terrain(W, H);
        terrain.clear();
        for (const c of lvl.commands) terrain.drawRect(c.x, c.y, c.w, c.h, c.type);
        eq(terrain.get(lvl.spawn.x, lvl.spawn.y), T_AIR, 'spawn buried in terrain');
        const drop = dropBelow(terrain, lvl.spawn.x, lvl.spawn.y);
        assert(drop < PHYS.FATAL_FALL, `spawn drop ${drop}px >= fatal ${PHYS.FATAL_FALL}px`);
        assert(drop !== Infinity, 'nothing under the spawn');
        eq(terrain.get(lvl.exit.x, lvl.exit.y - 10), T_AIR, 'exit mouth blocked');
        const exitDrop = dropBelow(terrain, lvl.exit.x, lvl.exit.y - 4);
        assert(exitDrop <= 6, `exit floats ${exitDrop}px above ground`);
        assert(lvl.reqSaved <= lvl.totalSpawn, 'requires more saves than spawns');
        assert(Object.values(lvl.inventory).some(v => v > 0), 'empty inventory');
        assert(lvl.time > 0 && lvl.spawnRate >= RATE_MIN, 'bad timing values');
    });
});

// ==============================================================
console.log('\n— Solvability smoke check (must not false-flag real levels) —');
// ==============================================================
// The cardinal rule: the GENEROUS reachability check must never flag a shipped,
// hand-authored level as broken (a false positive would block legit sharing).
LEVELS.forEach((lvl, i) => {
    test(`L${i + 1} "${lvl.name}": solvability smoke check passes`, () => {
        const r = analyzeSolvability(lvl);
        eq(r.status, 'ok', `false positive: ${r.reason}`);
    });
});
test('solvability flags a metal wall with no Climber/Builder/carver', () => {
    const lvl = {
        name: 'Sealed', totalSpawn: 5, reqSaved: 5, time: 120, spawnRate: 60,
        spawn: { x: 80, y: 360 }, exit: { x: 880, y: 420 },
        inventory: { [SKILLS.BLOCK]: 5 }, // no way through/over a full-height steel wall
        commands: [
            { type: T_DIRT, x: 0, y: 420, w: 960, h: 120 },
            { type: T_METAL, x: 460, y: 0, w: 40, h: 420 }, // floor-to-ceiling barrier
        ],
    };
    eq(analyzeSolvability(lvl).status, 'fail');
});
test('solvability flags a lava moat with no Builder or platform', () => {
    const lvl = {
        name: 'Moat', totalSpawn: 5, reqSaved: 5, time: 120, spawnRate: 60,
        spawn: { x: 80, y: 360 }, exit: { x: 880, y: 420 },
        inventory: { [SKILLS.FLOAT]: 9, [SKILLS.CLIMB]: 9 }, // float/climb can't cross a wide lava floor
        commands: [
            { type: T_DIRT, x: 0, y: 420, w: 300, h: 120 },
            { type: T_HAZARD, x: 300, y: 420, w: 360, h: 120 },
            { type: T_DIRT, x: 660, y: 420, w: 300, h: 120 },
        ],
    };
    eq(analyzeSolvability(lvl).status, 'fail');
});
test('solvability flags a gate with no matching switch', () => {
    const lvl = {
        name: 'Locked Gate', totalSpawn: 5, reqSaved: 5, time: 120, spawnRate: 60,
        spawn: { x: 80, y: 360 }, exit: { x: 880, y: 420 },
        inventory: { [SKILLS.BLOCK]: 5 },
        commands: [{ type: T_DIRT, x: 0, y: 420, w: 960, h: 120 }],
        objects: [{ type: OBJ_GATE, x: 470, y: 320, w: 16, h: 100, target: 0 }], // no OBJ_SWITCH targets it
    };
    eq(analyzeSolvability(lvl).status, 'fail');
});
test('solvability clears the same gate once a matching switch exists', () => {
    const lvl = {
        name: 'Open-able Gate', totalSpawn: 5, reqSaved: 5, time: 120, spawnRate: 60,
        spawn: { x: 80, y: 360 }, exit: { x: 880, y: 420 },
        inventory: { [SKILLS.BLOCK]: 5 },
        commands: [{ type: T_DIRT, x: 0, y: 420, w: 960, h: 120 }],
        objects: [
            { type: OBJ_SWITCH, x: 235, y: 417, w: 32, h: 8, target: 0 },
            { type: OBJ_GATE, x: 470, y: 320, w: 16, h: 100, target: 0 },
        ],
    };
    eq(analyzeSolvability(lvl).status, 'ok');
});

// ==============================================================
console.log('\n— UGC trust-state language —');
// ==============================================================
function trustLevelFixture() {
    return {
        name: 'Trust Fixture', totalSpawn: 5, reqSaved: 3, time: 120, spawnRate: 60,
        spawn: { x: 80, y: 360 }, exit: { x: 880, y: 420 },
        inventory: { [SKILLS.BUILD]: 5 },
        commands: [{ type: T_DIRT, x: 0, y: 420, w: 960, h: 120 }],
    };
}
test('UGC trust display rules use exactly one prioritized primary badge', () => {
    eq(ugcTrustBadge(null).message, 'This level has not been checked.');
    const lvl = trustLevelFixture();
    eq(ugcTrustBadge(lvl, { solvability: { status: 'fail', reason: 'blocked' } }).label, 'Structurally Valid');
    eq(ugcTrustBadge(lvl, { solvability: { status: 'fail', reason: 'blocked' } }).message, 'Required objects exist. Solvability is unknown.');
    const heuristic = ugcTrustBadge(lvl, { solvability: { status: 'ok', reason: 'route exists' } });
    eq(heuristic.label, 'No Obvious Dead End Found');
    eq(heuristic.message, 'Basic checks passed. This is not a proof.');
    assert(!/verified/i.test(heuristic.label + heuristic.message), 'heuristic-only state must not claim verification');

    const fp = levelFingerprint(lvl);
    const creator = { ...lvl, ugcTrust: { creatorClear: { fingerprint: fp, replayCode: 'abc' } } };
    eq(ugcTrustBadge(creator).label, 'Creator Cleared');
    eq(ugcTrustBadge(creator).message, 'The creator attached a clear replay for this exact version.');
    const verified = { ...lvl, ugcTrust: { creatorClear: { fingerprint: fp }, replayVerified: { fingerprint: fp, replayCode: 'abc' } } };
    eq(ugcTrustBadge(verified).label, 'Replay Verified', 'replay verification outranks creator clear');
    eq(ugcTrustBadge(verified).message, 'A clear replay was validated locally for this exact version.');
    const official = { ...verified, officialCurated: true };
    eq(ugcTrustBadge(official).label, 'Official', 'official outranks all other trust states');
    eq(ugcTrustBadge(official).message, 'Included or curated by the Mosslings team.');
});

// ==============================================================
console.log('\n— End-to-end: scripted solve of Level 1 —');
// ==============================================================
test('a builder assigned at the gap edge carries a mossling to the exit', () => {
    const lvl = LEVELS[0];
    const g = makeGame();
    for (const c of lvl.commands) g.terrain.drawRect(c.x, c.y, c.w, c.h, c.type);
    g.level.exit = lvl.exit;
    const m = new Mossling(lvl.spawn.x, lvl.spawn.y);
    g.mosslings.push(m);
    let assigned = false;
    for (let i = 0; i < 60 * 90 && m.alive() && m.state !== STATE.SAVED; i++) {
        if (!assigned && m.state === STATE.WALK && m.x >= 435 && m.dir === 1) {
            m.state = STATE.BUILD;
            m.bricksLeft = PHYS.BUILD_BRICKS;
            assigned = true;
        }
        m.update(g);
    }
    assert(assigned, 'never reached the gap edge');
    eq(m.state, STATE.SAVED, `mossling did not reach the exit (state=${STATE_NAMES[m.state]}, x=${m.x | 0}, y=${m.y | 0})`);
});

// ==============================================================
console.log('\n— One-way membranes —');
// ==============================================================
test('one-way isSolid is probe-direction aware, not a floor', () => {
    const g = makeGame();
    g.terrain.drawRect(200, 260, 6, 40, T_ONEWAY_R); // membrane x∈[200,205], y∈[260,299]
    const m = new Mossling(204, 290);
    eq(m.isSolid(g, 1, 0), false, 'passable for a rightward probe');
    eq(new Mossling(206, 290).isSolid(g, -1, 0), true, 'wall for a leftward probe');
    eq(new Mossling(202, 290).isSolid(g, 0, 1), false, 'falls straight through (never a floor)');
});
test('one-way membrane is indestructible', () => {
    const g = makeGame();
    g.terrain.drawRect(100, 100, 10, 10, T_ONEWAY_R);
    g.terrain.drawCircle(105, 105, 40, T_AIR);
    eq(g.terrain.get(105, 105), T_ONEWAY_R, 'survives erasure');
});

// ==============================================================
console.log('\n— Athlete portals —');
// ==============================================================
test('athlete portal saves only Floater+Climber mosslings', () => {
    const g = makeGame();
    g.terrain.drawRect(0, 300, 900, 20, T_DIRT);
    g.level.exit = { x: 200, y: 300, athlete: true };
    const plain = new Mossling(150, 300); plain.state = STATE.WALK;
    step(g, plain, 300);
    assert(plain.state !== STATE.SAVED, 'plain mossling not saved');
    const athlete = new Mossling(150, 300); athlete.state = STATE.WALK;
    athlete.hasFloater = true; athlete.hasClimber = true;
    step(g, athlete, 300);
    eq(athlete.state, STATE.SAVED, 'athlete saved');
});

// ==============================================================
console.log('\n— Deterministic simulation & rewind —');
// ==============================================================
test('two clean runs of identical input produce identical state', () => {
    const a = new Game(); a.loadLevel(1);
    const b = new Game(); b.loadLevel(1);
    for (let i = 0; i < 600; i++) { a.update(); b.update(); }
    function digest(g) {
        const ms = g.mosslings.map(m => `${m.id}:${m.x | 0},${m.y | 0},${m.state}`).sort().join('|');
        return `s${g.simStep};sv${g.savedCount};${ms}`;
    }
    eq(digest(a), digest(b), 'deterministic runs diverged');
});
test('mossling frame derives deterministically from id (no Math.random in sim)', () => {
    for (const id of [0, 1, 5, 13, 59, 60, 61]) eq(new Mossling(0, 0, id).frame, (id * 17) % 60, `id=${id}`);
});
/** Whole-sim fingerprint incl. skill flags and skillsUsed — guards the rewind path. */
function simDigest(g) {
    const ms = g.mosslings
        .map(m => `${m.id}:${m.x | 0},${m.y | 0},${m.state},${m.dir},${m.hasFloater ? 1 : 0}${m.hasClimber ? 1 : 0}`)
        .sort().join('|');
    return `s${g.simStep};sv${g.savedCount};sk${g.skillsUsed};sc${g.spawnCounter};${ms}`;
}
test('rewind reconstructs the exact earlier state from the action log', () => {
    const ref = new Game(); ref.loadLevel(1);
    for (let i = 0; i < 250; i++) ref.update();
    const want = simDigest(ref);
    const g = new Game(); g.loadLevel(1);
    for (let i = 0; i < 550; i++) g.update();
    eq(g.simStep, 550, 'reached step 550');
    g.rewind();                                  // 550 − 300 = 250
    eq(g.simStep, 250, 'rewound to the target step');
    eq(simDigest(g), want, 'rewound state must match a fresh run to the same step');
});
test('rewind replays a logged skill assignment (and keeps skillsUsed in sync)', () => {
    const g = new Game(); g.loadLevel(1);
    for (let i = 0; i < 150; i++) g.update();
    const m = g.mosslings.find(x => x.alive());
    g.assignSkill(m, SKILLS.FLOAT);
    g.actionLog.push({ step: g.simStep, type: 'assign', id: m.id, skill: SKILLS.FLOAT });
    for (let i = 0; i < 400; i++) g.update();
    g.rewind();                                  // target ~250, assignment at 150 is kept
    const replayed = g.mosslings.find(x => x.id === m.id);
    assert(replayed && replayed.hasFloater, 'floater assignment survived the rewind replay');
    eq(g.skillsUsed, 1, 'skillsUsed reconstructed deterministically');
});
test('rewind discards inputs that occurred after the target step', () => {
    const g = new Game(); g.loadLevel(1);
    for (let i = 0; i < 550; i++) g.update();
    const m = g.mosslings.find(x => x.alive());
    g.assignSkill(m, SKILLS.FLOAT);              // step 550 — inside the 300-step window
    g.actionLog.push({ step: g.simStep, type: 'assign', id: m.id, skill: SKILLS.FLOAT });
    g.rewind();                                  // back to 250: this assignment is in the future
    const replayed = g.mosslings.find(x => x.id === m.id);
    assert(replayed && !replayed.hasFloater, 'a post-target assignment must not persist');
    assert(g.actionLog.every(a => a.step < 250), 'action log trimmed to the horizon');
});
test('rewind restores muted side effects after a replay catch-up throw', () => {
    const g = new Game(); g.loadLevel(1);
    for (let i = 0; i < 550; i++) g.update();
    g.actionLog = [{ step: 0, type: 'nuke' }];
    const realSpawn = g.particles.spawn;
    const realApply = g.applyAction;
    audio._silent = false;
    g.applyAction = () => { throw new Error('forced replay failure'); };
    let threw = false;
    try {
        g.rewind();
    } catch (e) {
        threw = true;
    } finally {
        g.applyAction = realApply;
    }
    assert(threw, 'fixture must throw during replay catch-up');
    eq(g.particles.spawn, realSpawn, 'particle spawn restored after throw');
    eq(audio._silent, false, 'audio silence flag restored after throw');
    eq(g.replaying, false, 'replaying flag restored after throw');
});

// ==============================================================
console.log('\n— Level serialization (sharing) —');
// ==============================================================
test('serialize → deserialize round-trips a full custom level', () => {
    const lvl = {
        name: 'Test ⛏ 42', totalSpawn: 20, reqSaved: 12, time: 180, spawnRate: 55,
        spawn: { x: 100, y: 90 }, exit: { x: 850, y: 260, athlete: true },
        inventory: { [SKILLS.BLOCK]: 2, [SKILLS.BUILD]: 10 },
        commands: [{ type: T_DIRT, x: 0, y: 200, w: 450, h: 25 }],
    };
    const enc = serializeLevel(lvl);
    const dec = deserializeLevel(enc);
    assert(dec);
    eq(dec.name, lvl.name);
    eq(dec.totalSpawn, 20);
    eq(dec.exit.athlete, true);
});

// ==============================================================
console.log('\n— Replay / ghost sharing —');
// ==============================================================
test('serializeReplay → deserializeReplay round-trips a campaign run', () => {
    const replay = { kind: 'campaign', levelIdx: 3, actions: [
        { step: 100, type: 'rate', value: 90 },
        { step: 250, type: 'assign', id: 2, skill: SKILLS.BUILD },
        { step: 400, type: 'nuke' },
    ] };
    const code = serializeReplay(replay);
    assert(code, 'replay encodes');
    const back = deserializeReplay(code);
    assert(back, 'replay decodes');
    eq(back.kind, 'campaign');
    eq(back.levelIdx, 3);
    eq(back.actions.length, 3);
    eq(back.actions[0].type, 'rate'); eq(back.actions[0].value, 90);
    eq(back.actions[1].type, 'assign'); eq(back.actions[1].id, 2); eq(back.actions[1].skill, SKILLS.BUILD);
    eq(back.actions[2].type, 'nuke');
});
test('v2 replay payload includes app version, algorithm, and level fingerprint', () => {
    const code = serializeReplay({ kind: 'campaign', levelIdx: 0, actions: [] });
    assert(code, 'v2 replay encodes');
    const back = deserializeReplay(code);
    assert(back, 'v2 replay decodes');
    eq(back.schemaVersion, 2);
    eq(back.appVersion, APP_VERSION);
    eq(back.alg, LEVEL_FINGERPRINT_ALG);
    eq(back.fingerprint, levelFingerprint(LEVELS[0]));
    const check = validateReplayForPlayback(code);
    eq(check.status, 'valid');
    eq(check.severity, 'allow');
    eq(check.expectedFingerprint, check.actualFingerprint);
});
test('level fingerprint is stable across key order and ignores cosmetic copy', () => {
    const a = {
        name: 'A', theme: 'FOREST', tut: 'Teach me',
        totalSpawn: 5, reqSaved: 3, time: 120, spawnRate: 60,
        spawn: { x: 80, y: 360 }, exit: { x: 880, y: 420 },
        inventory: { [SKILLS.BUILD]: 5 },
        commands: [{ type: T_DIRT, x: 0, y: 420, w: 960, h: 120 }],
    };
    const b = {
        tut: 'Different words', theme: 'VOLCANO', name: 'B',
        spawnRate: 60, time: 120, reqSaved: 3, totalSpawn: 5,
        exit: { y: 420, x: 880 }, spawn: { y: 360, x: 80 },
        commands: [{ h: 120, w: 960, y: 420, x: 0, type: T_DIRT }],
        inventory: { [SKILLS.BUILD]: 5 },
    };
    eq(levelFingerprint(a), levelFingerprint(b), 'cosmetic/key-order changes do not affect identity');
    const c = { ...b, commands: [{ h: 120, w: 960, y: 421, x: 0, type: T_DIRT }] };
    assert(levelFingerprint(a) !== levelFingerprint(c), 'gameplay geometry changes affect identity');
});
test('v1 legacy replay decodes and validates as warn-but-allow', () => {
    const code = replayCodeFromPayload({ v: 1, k: 'campaign', l: 0, a: [{ s: 10, t: 'nuke' }] });
    const back = deserializeReplay(code);
    assert(back && back.legacy, 'legacy replay decodes');
    const check = validateReplayForPlayback(code);
    eq(check.status, 'legacy');
    eq(check.severity, 'warn');
    assert(check.ok, 'legacy replay is allowed');
});
test('deserializeReplay rejects garbage and out-of-order steps', () => {
    eq(deserializeReplay('!!!not-base64-json'), null, 'garbage → null');
    eq(deserializeReplay(''), null, 'empty → null');
    // steps must be non-decreasing
    const bad = serializeReplay({ kind: 'campaign', levelIdx: 0, actions: [{ step: 300, type: 'nuke' }] });
    // hand-build an out-of-order payload via the public encoder path
    const outOfOrder = serializeReplay({ kind: 'campaign', levelIdx: 0, actions: [
        { step: 200, type: 'rate', value: 50 }, { step: 100, type: 'nuke' },
    ] });
    eq(deserializeReplay(outOfOrder), null, 'descending steps → null');
});
test('campaign replay fingerprint mismatch refuses playback', () => {
    const code = serializeReplay({ kind: 'campaign', levelIdx: 0, fingerprint: '00000000', actions: [] });
    const check = validateReplayForPlayback(code);
    eq(check.status, 'fingerprint_mismatch');
    eq(check.severity, 'refuse');
    assert(!check.ok, 'mismatch is not playable');
});
test('daily replay fingerprint mismatch refuses playback', () => {
    const code = serializeReplay({ kind: 'daily', dailyKey: '2026-06-17', fingerprint: '00000000', actions: [] });
    const check = validateReplayForPlayback(code);
    eq(check.status, 'fingerprint_mismatch');
    eq(check.severity, 'refuse');
});
test('custom replay carries and validates the embedded level fingerprint', () => {
    const lvl = {
        name: 'Replay Custom', totalSpawn: 5, reqSaved: 3, time: 90, spawnRate: 60,
        spawn: { x: 100, y: 100 }, exit: { x: 820, y: 400 },
        inventory: { [SKILLS.BUILD]: 5 },
        commands: [{ type: T_DIRT, x: 0, y: 200, w: 960, h: 20 }, { type: T_DIRT, x: 0, y: 400, w: 960, h: 40 }],
    };
    const code = serializeReplay({ kind: 'custom', level: lvl, levelCode: serializeLevel(lvl), actions: [] });
    const back = deserializeReplay(code);
    assert(back && back.level, 'custom replay decodes with a level');
    eq(back.fingerprint, levelFingerprint(lvl));
    eq(validateReplayForPlayback(code).status, 'valid');
});
test('malformed and unsupported replay payloads refuse playback', () => {
    eq(validateReplayForPlayback('!!!not-base64-json').status, 'malformed');
    const unsupported = replayCodeFromPayload({ v: 99, k: 'campaign', l: 0, a: [] });
    const check = validateReplayForPlayback(unsupported);
    eq(check.status, 'unsupported_schema');
    eq(check.severity, 'refuse');
});
test('v2 replay missing a fingerprint refuses playback', () => {
    const missing = replayCodeFromPayload({ v: 2, app: APP_VERSION, alg: LEVEL_FINGERPRINT_ALG, k: 'campaign', l: 0, a: [] });
    const check = validateReplayForPlayback(missing);
    eq(check.status, 'missing_fingerprint');
    eq(check.severity, 'refuse');
});
test('a replay plays back deterministically (same payload → identical end state)', () => {
    const code = serializeReplay({ kind: 'campaign', levelIdx: 0, actions: [
        { step: 80, type: 'rate', value: 90 }, { step: 500, type: 'nuke' },
    ] });
    const run = () => {
        const g = new Game();
        ui.game = g; // endLevel routes through ui.showMsg, which reads ui.game
        assert(g.loadReplay(deserializeReplay(code)), 'replay loads');
        assert(g.ghostMode, 'ghost mode armed');
        let i = 0;
        while (g.state === 'PLAY' && i < 60 * 180) { g.update(); i++; }
        return { saved: g.savedCount, dead: g.deadCount, step: g.simStep, state: g.state };
    };
    const a = run(), b = run();
    eq(JSON.stringify(a), JSON.stringify(b), 'replay playback diverged');
    assert(a.step > 80, 'sim actually advanced through the log');
});
test('watching a replay never mutates the viewer save', () => {
    const before = storage.getUnlocked();
    const g = new Game();
    ui.game = g; // endLevel routes through ui.showMsg, which reads ui.game
    g.loadReplay({ kind: 'campaign', levelIdx: 0, actions: [] });
    // Force a ghost "win" and end the level the way the sim would.
    g.savedCount = g.level.reqSaved;
    g.spawnCounter = g.level.totalSpawn;
    g.mosslings = [];
    g.endLevel();
    eq(storage.getUnlocked(), before, 'ghost playback must not unlock progress');
});
test('player assignment is locked out during ghost playback', () => {
    const g = new Game();
    g.loadReplay({ kind: 'campaign', levelIdx: 0, actions: [] });
    g.selectedSkill = SKILLS.BUILD;
    const usedBefore = g.skillsUsed;
    g.mouseX = g.level.spawn.x; g.mouseY = g.level.spawn.y;
    g.tryAssign();
    eq(g.skillsUsed, usedBefore, 'tryAssign is a no-op while a ghost is driving');
});

// ==============================================================
console.log('\n— Phase 0: Ecosystem Audit & Baseline —');
// ==============================================================

const TEST_PACK = {
    EASY: {
        name: 'Easy Test', totalSpawn: 5, reqSaved: 1, time: 100, spawnRate: 60,
        spawn: { x: 100, y: 100 }, exit: { x: 100, y: 400 },
        inventory: { [SKILLS.BUILD]: 10 },
        commands: [{ type: T_DIRT, x: 0, y: 200, w: 200, h: 20 }, { type: T_DIRT, x: 0, y: 400, w: 960, h: 20 }]
    },
    FATAL_SPAWN: {
        name: 'Fatal Spawn', totalSpawn: 5, reqSaved: 1, time: 100, spawnRate: 60,
        spawn: { x: 100, y: 50 }, exit: { x: 200, y: 400 },
        inventory: { [SKILLS.FLOAT]: 1 },
        commands: [{ type: T_DIRT, x: 0, y: 400, w: 960, h: 20 }]
    },
    FLOATING_EXIT: {
        name: 'Floating Exit', totalSpawn: 5, reqSaved: 1, time: 100, spawnRate: 60,
        spawn: { x: 100, y: 300 }, exit: { x: 200, y: 200 },
        inventory: { [SKILLS.BUILD]: 5 },
        commands: [{ type: T_DIRT, x: 0, y: 400, w: 960, h: 20 }]
    },
    V01_CODE: 'AQpUZXN0IExldmVsAQUFAWQAOAAKAAEAZADQAGQA8AAEBAQEBAQEBAQEBAUAF0AAZADQAKAAKAA'
};

function validateLevelStructure(lvl) {
    if (!lvl.spawn || !lvl.exit) return 'Spawn or Exit missing';
    const terrain = new Terrain(W, H);
    terrain.clear();
    for (const c of lvl.commands) terrain.drawRect(c.x, c.y, c.w, c.h, c.type);
    const objects = normalizeLevelObjects(lvl.objects || []);
    
    const drop = dropBelow(terrain, lvl.spawn.x, lvl.spawn.y);
    const objectDrop = (() => {
        for (let yy = Math.floor(lvl.spawn.y); yy < H; yy++) {
            if (objectSolidAt(objects, lvl.spawn.x, yy + 1)) return yy - lvl.spawn.y;
        }
        return Infinity;
    })();
    const bestDrop = Math.min(drop, objectDrop);
    if (bestDrop === Infinity) return 'Nothing under the spawn';
    if (bestDrop >= PHYS.FATAL_FALL) return 'Spawn drop is too high';
    
    const exitDrop = dropBelow(terrain, lvl.exit.x, lvl.exit.y - 4);
    if (exitDrop > 6) return 'Exit must be placed on solid ground';
    
    return null;
}

test('validateLevelStructure identifies easy level as valid', () => {
    eq(validateLevelStructure(TEST_PACK.EASY), null);
});
test('validateLevelStructure identifies fatal spawn drop', () => {
    eq(validateLevelStructure(TEST_PACK.FATAL_SPAWN), 'Spawn drop is too high');
});
test('validateLevelStructure identifies floating exit', () => {
    eq(validateLevelStructure(TEST_PACK.FLOATING_EXIT), 'Exit must be placed on solid ground');
});
test('v0x01 shared links continue to decode correctly', () => {
    const lvl = {
        name: 'Test Level', totalSpawn: 5, reqSaved: 5, time: 100, spawnRate: 60,
        spawn: { x: 100, y: 100 }, exit: { x: 400, y: 400 },
        inventory: { 0: 1, 1: 1, 2: 1, 3: 1, 4: 1, 5: 1, 6: 1, 7: 1 },
        commands: [{ type: T_DIRT, x: 100, y: 400, w: 40, h: 40 }]
    };
    const code = serializeLevel(lvl);
    const dec = deserializeLevel(code);
    assert(dec, 'decodes');
    if (dec) {
        eq(dec.name, 'Test Level');
        eq(dec.totalSpawn, 5);
        eq(dec.inventory[SKILLS.BLOCK], 1);
    }
});

// ==============================================================
console.log('\n— Daily challenge —');
// ==============================================================
test('dailyDateKey uses the UTC YYYY-MM-DD key', () => {
    eq(dailyDateKey(new Date('2026-06-17T23:59:59.000Z')), '2026-06-17');
});
test('dailyChallengeForDate is deterministic and maps to a campaign level', () => {
    const a = dailyChallengeForDate('2026-06-17');
    const b = dailyChallengeForDate('2026-06-17');
    assert(a && b, 'daily challenge exists');
    eq(a.key, '2026-06-17');
    eq(a.levelIdx, b.levelIdx);
    assert(a.levelIdx >= 0 && a.levelIdx < LEVELS.length, 'level index is in campaign range');
    eq(a.levelName, LEVELS[a.levelIdx].name);
});
test('dailyChallengeForDate rejects malformed dates', () => {
    eq(dailyChallengeForDate('2026-02-31'), null);
    eq(dailyChallengeForDate('not-a-date'), null);
});
test('compareDailyResults ranks win, saved percent, medals, skills, then time', () => {
    const base = { win: false, pct: 80, medalCount: 0, skills: 4, timeSeconds: 80 };
    assert(compareDailyResults({ ...base, win: true, pct: 70 }, base) > 0, 'win beats higher failed percent');
    assert(compareDailyResults({ ...base, pct: 90 }, base) > 0, 'higher pct wins');
    assert(compareDailyResults({ ...base, medalCount: 2 }, base) > 0, 'more medals win');
    assert(compareDailyResults({ ...base, skills: 3 }, base) > 0, 'fewer skills win');
    assert(compareDailyResults({ ...base, timeSeconds: 70 }, base) > 0, 'faster time wins');
});
test('daily best storage keeps the stronger run while counting attempts', () => {
    storage.save('daily', {});
    const key = '2030-01-02';
    const first = storage.setDailyResult(key, {
        win: false, saved: 4, total: 8, pct: 50, medalCount: 0, skills: 4, timeSeconds: 80,
    });
    eq(first.pct, 50);
    eq(first.attempts, 1);

    const worse = storage.setDailyResult(key, {
        win: false, saved: 3, total: 8, pct: 38, medalCount: 0, skills: 5, timeSeconds: 90,
    });
    eq(worse.pct, 50, 'keeps previous best');
    eq(worse.attempts, 2, 'attempt count still advances');

    const better = storage.setDailyResult(key, {
        win: true, saved: 5, total: 8, pct: 63, medalCount: 1, skills: 3, timeSeconds: 70,
    });
    eq(better.pct, 63, 'stores stronger run');
    eq(better.attempts, 3);
});
test('daily ghost comparator ranks saved, time, skills, then earlier timestamp', () => {
    const base = { saved: 8, total: 10, timeSeconds: 80, skills: 4, completedAt: '2030-01-01T00:00:10.000Z' };
    assert(compareDailyGhostRecords({ ...base, saved: 9 }, base) > 0, 'higher saved wins');
    assert(compareDailyGhostRecords({ ...base, timeSeconds: 70 }, base) > 0, 'lower time wins');
    assert(compareDailyGhostRecords({ ...base, skills: 3 }, base) > 0, 'fewer skills wins');
    assert(compareDailyGhostRecords({ ...base, completedAt: '2030-01-01T00:00:01.000Z' }, base) > 0, 'earlier completion wins ties');
});
test('daily ghost storage replaces only better records and prunes history', () => {
    storage.save('dailyGhosts', {});
    const key = '2030-01-15';
    const first = { key, saved: 5, total: 10, pct: 50, timeSeconds: 90, skills: 5, completedAt: '2030-01-15T00:00:05.000Z', fingerprint: 'aaaa', replay: { code: 'x' } };
    const worse = { ...first, saved: 4, timeSeconds: 60, completedAt: '2030-01-15T00:00:01.000Z' };
    const better = { ...first, saved: 6, timeSeconds: 95, completedAt: '2030-01-15T00:00:10.000Z' };
    eq(storage.setDailyGhost(key, first).state, 'set');
    eq(storage.setDailyGhost(key, worse).state, 'behind');
    eq(storage.getDailyGhost(key).saved, 5, 'worse run did not replace the ghost');
    eq(storage.setDailyGhost(key, better).state, 'beat');
    eq(storage.getDailyGhost(key).saved, 6, 'better run replaced the ghost');

    const many = {};
    for (let i = 1; i <= 20; i++) {
        const d = `2030-02-${String(i).padStart(2, '0')}`;
        many[d] = { key: d, saved: i, total: 20, timeSeconds: 100, skills: 4, completedAt: `${d}T00:00:00.000Z` };
    }
    const pruned = pruneDailyGhostHistory(many, 14);
    eq(Object.keys(pruned).length, 14, 'history is bounded');
    assert(pruned['2030-02-20'], 'latest ghost kept');
    assert(!pruned['2030-02-01'], 'oldest ghost pruned');
});
test('daily wins do not unlock campaign progress', () => {
    storage.save('unlocked', 0);
    storage.save('daily', {});
    const g = new Game();
    const challenge = dailyChallengeForDate('2026-06-17');
    ui.game = g;
    g.loadDailyChallenge(challenge);
    eq(g.runMode, 'daily');
    eq(g.levelIdx, challenge.levelIdx);

    g.savedCount = g.level.reqSaved;
    g.deadCount = 0;
    g.spawnCounter = g.level.totalSpawn;
    g.mosslings = [];
    g.endLevel();
    eq(storage.getUnlocked(), 0, 'campaign unlock remains untouched');
    assert(storage.getDailyResult(challenge.key), 'daily result was stored');
});
test('returning from daily restores the previous unlocked campaign selection', () => {
    storage.save('unlocked', 1);
    const g = new Game();
    ui.game = g;
    g.levelIdx = 0;
    const challenge = dailyChallengeForDate('2026-06-17');
    g.loadDailyChallenge(challenge);
    assert(g.levelIdx !== 0 || challenge.levelIdx === 0, 'daily may point at another campaign index');
    ui.backToMenu();
    eq(g.runMode, 'campaign');
    eq(g.levelIdx, 0, 'Play returns to the prior campaign selection, not the daily level');
});

// ==============================================================
console.log('\n— Result share card —');
// ==============================================================
test('ResultView builds a compact run summary from game state', () => {
    const g = new Game();
    g.loadLevel(0, false, true);
    g.savedCount = 8;
    g.skillsUsed = 3;
    g.time = (g.level.time - 42) * 60;
    const r = ResultView.buildRunResult(g, true);
    eq(r.name, 'The First March');
    eq(r.campaignNum, 1);
    eq(r.pct, 100);
    eq(r.timeStr, '0:42');
    assert(r.medals.saved && r.medals.skills && r.medals.time, 'all L1 medals earned by the test run');
});
test('ResultView share text preserves campaign, daily, and URL framing', () => {
    const g = new Game();
    const challenge = dailyChallengeForDate('2026-06-17');
    g.loadDailyChallenge(challenge);
    g.savedCount = g.level.reqSaved;
    g.skillsUsed = 4;
    g.time = (g.level.time - 70) * 60;
    const r = ResultView.buildRunResult(g, true);
    const text = ResultView.buildShareText(r, { url: 'https://example.test/Mosslings/?daily=2026-06-17' });
    assert(text.includes('MOSSLINGS - Daily 2026-06-17'), 'daily share text names the daily');
    assert(text.includes('https://example.test/Mosslings/?daily=2026-06-17'), 'daily share text includes the link');
    assert(text.includes('Can you beat my run?'), 'daily share text carries the challenge copy');
});
test('ResultView parses existing medal SVG rects for canvas reuse', () => {
    const parsed = ResultView.parseSvgRects(UI_ICONS.trophy);
    eq(parsed.viewBox.w, 24);
    eq(parsed.viewBox.h, 24);
    // The revised icon set is deliberately chunkier (silhouette-first), so the
    // trophy is built from fewer, larger rects — still multi-rect art the canvas
    // share-card parser must handle.
    assert(parsed.rects.length > 8, 'trophy rect art parsed');
    assert(parsed.rects.some(r => r.fill === '#ffd23f'), 'trophy fill colors preserved');
});
test('ResultView creates a 1200x630 share-card canvas without throwing', () => {
    const g = new Game();
    g.loadLevel(0, false, true);
    g.savedCount = 8;
    g.skillsUsed = 3;
    g.time = (g.level.time - 42) * 60;
    const r = ResultView.buildRunResult(g, true);
    r.url = 'https://example.test/Mosslings/';
    const canvas = ResultView.createResultCardCanvas(r);
    eq(canvas.width, 1200);
    eq(canvas.height, 630);
    assert(ResultView.cardFilename(r).startsWith('mosslings-level-1'), 'campaign filename is stable');
});
test('drawResultCardPreview ignores fake/non-canvas stubs, draws into a real one', () => {
    // The preview must never assume the element it is handed is a real canvas.
    eq(ResultView.drawResultCardPreview(null, {}), null, 'null element → null');
    eq(ResultView.drawResultCardPreview({}, {}), null, 'no getContext → null');
    eq(ResultView.drawResultCardPreview({ getContext: () => null }, {}), null, 'null context → null');
    eq(ResultView.drawResultCardPreview({ getContext: () => ({}) }, {}), null, 'context without fillRect → null');

    // A canvas-shaped element with a real-looking 2D context draws and unhides.
    const g = new Game();
    g.loadLevel(0, false, true);
    g.savedCount = 8; g.skillsUsed = 3; g.time = (g.level.time - 42) * 60;
    const r = ResultView.buildRunResult(g, true);
    const removed = [];
    const fake = {
        width: 0, height: 0,
        getContext: () => global.document.createElement('canvas').getContext('2d'),
        classList: { remove: (c) => removed.push(c) },
    };
    const out = ResultView.drawResultCardPreview(fake, r);
    eq(out, fake, 'returns the canvas when the context is real');
    eq(fake.width, ResultView.CARD_W, 'sizes the canvas');
    eq(fake.height, ResultView.CARD_H);
    assert(removed.includes('hidden'), 'unhides the preview canvas');
});

// ==============================================================
console.log('\n— Par medals & skill tracking —');
// ==============================================================
test('computeMedals returns nothing when the level has no par', () => {
    const m = computeMedals(undefined, { saved: 10, skills: 0, time: 5 });
    assert(!m.saved && !m.skills && !m.time, 'no par → no medals');
});
test('computeMedals awards each tier independently', () => {
    const par = { saved: 10, skills: 3, time: 90 };
    let m = computeMedals(par, { saved: 10, skills: 3, time: 90 });
    assert(m.saved && m.skills && m.time);
});
test('skillsUsed counts assignments and resets on load', () => {
    const g = new Game(); g.loadLevel(1);
    eq(g.skillsUsed, 0);
    for (let i = 0; i < 150; i++) g.update();
    const m = g.mosslings.find(x => x.alive());
    g.assignSkill(m, SKILLS.FLOAT);
    eq(g.skillsUsed, 1);
});

test('v02 serialization with par data survives round-trip', () => {
    const lvl = {
        name: 'Par Test', totalSpawn: 10, reqSaved: 5, time: 100, spawnRate: 60,
        spawn: { x: 100, y: 100 }, exit: { x: 400, y: 400 },
        inventory: { 0: 5, 1: 5 },
        commands: [{ type: T_DIRT, x: 100, y: 400, w: 40, h: 40 }],
        par: { time: 80, skills: 3, saved: 10 }
    };
    const enc = serializeLevel(lvl);
    const dec = deserializeLevel(enc);
    assert(dec, 'decodes');
    assert(dec.par, 'par data exists');
    eq(dec.par.time, 80);
    eq(dec.par.skills, 3);
    eq(dec.par.saved, 10);
});
test('v03 serialization with editor objects survives round-trip', () => {
    const lvl = {
        name: 'Object Test', totalSpawn: 10, reqSaved: 5, time: 120, spawnRate: 60,
        spawn: { x: 100, y: 100 }, exit: { x: 800, y: 400 },
        inventory: { [SKILLS.BLOCK]: 2, [SKILLS.BUILD]: 5 },
        commands: [{ type: T_DIRT, x: 0, y: 400, w: 960, h: 40 }],
        objects: [
            { type: OBJ_PLATFORM, x: 160, y: 360, w: 96, h: 10, dx: 220, dy: 0, period: 300, phase: 12 },
            { type: OBJ_SWITCH, x: 320, y: 397, w: 28, h: 8, target: 2 },
            { type: OBJ_GATE, x: 620, y: 310, w: 14, h: 90, target: 2 },
        ],
    };
    const dec = deserializeLevel(serializeLevel(lvl));
    assert(dec && dec.objects, 'decodes with objects');
    eq(dec.objects.length, 3);
    eq(dec.objects[0].type, OBJ_PLATFORM);
    eq(dec.objects[0].dx, 220);
    eq(dec.objects[1].target, 2);
    eq(dec.objects[2].h, 90);
});
test('moving platform objects are solid and carry riders deterministically', () => {
    const g = new Game();
    g.objects = g.buildRuntimeObjects([{ type: OBJ_PLATFORM, x: 100, y: 300, w: 80, h: 10, dx: 60, dy: 0, period: 120, phase: 0 }]);
    const m = new Mossling(120, 300, 0);
    m.state = STATE.WALK;
    g.mosslings = [m];
    g.updateObjects(true);
    g.simStep = 30;
    g.updateObjects();
    assert(g.solidObjectAt(g.objects[0].x + 4, g.objects[0].y + 1), 'platform is solid');
    assert(m.x > 140, `rider should have been carried horizontally, x=${m.x}`);
    eq(m.y, 300, 'horizontal ferry keeps rider on the same height');
});
test('pressure switches open matching gates only while held', () => {
    const g = new Game();
    g.objects = g.buildRuntimeObjects([
        { type: OBJ_SWITCH, x: 100, y: 297, w: 30, h: 8, target: 4 },
        { type: OBJ_GATE, x: 200, y: 220, w: 14, h: 80, target: 4 },
    ]);
    const m = new Mossling(112, 300, 0);
    m.state = STATE.BLOCK;
    g.mosslings = [m];
    g.updateObjects(true);
    const gate = g.objects.find(o => o.type === OBJ_GATE);
    assert(gate.open, 'gate opens while switch is held');
    m.x = 20;
    g.updateObjects();
    assert(!gate.open, 'gate closes when the switch is released');
});
test('editor undo history snapshots work', () => {
    const game = new Game();
    ui.init(game);
    ui.startEditor();
    ui.editTool = 'T_DIRT';
    ui.brushSize = { w: 40, h: 40 };
    
    // Simulate drawing
    game.mouseX = 100; game.mouseY = 100;
    ui.applyEdit();
    eq(ui.editCommands.length, 1, 'one command added');
    eq(ui.editHistory.length, 1, 'one history snapshot pushed');
    
    game.mouseX = 200; game.mouseY = 200;
    ui.applyEdit();
    eq(ui.editCommands.length, 2);
    eq(ui.editHistory.length, 2);
    
    ui.undoEdit();
    eq(ui.editCommands.length, 1, 'one command remains after undo');
    eq(ui.editHistory.length, 1, 'one history snapshot remains');
    eq(ui.editCommands[0].x, 100 - 20, 'original command preserved');

    ui.editTool = 'OBJ_PLATFORM';
    game.mouseX = 250; game.mouseY = 250;
    ui.applyEdit();
    eq(ui.editObjects.length, 1, 'one object added');
    ui.undoEdit();
    eq(ui.editObjects.length, 0, 'object placement also undoes');
});

// ==============================================================
console.log('\n— One-way membrane campaign level (L9) —');
// ==============================================================
test('L9 "One-Way Out": the gate halts the leftward retreat (nobody dies pacing)', () => {
    const g = new Game();
    const idx = LEVELS.findIndex(l => l.name === 'One-Way Out');
    assert(idx >= 0, 'level present');
    g.loadLevel(idx);
    for (let i = 0; i < 1000; i++) g.update();   // full spawn (~720) + settle into pacing
    eq(g.deadCount, 0, 'one-way gate kept everyone off the left cliff');
    const xs = g.mosslings.filter(m => m.alive()).map(m => m.x);
    eq(g.aliveCount(), g.level.totalSpawn, 'every mossling survived the pacing phase');
    assert(Math.min(...xs) >= 160, 'all have crossed the gate and none slipped back left of it');
});
test('L9 "One-Way Out": bashing the pillar rescues the required colony', () => {
    const g = new Game();
    const idx = LEVELS.findIndex(l => l.name === 'One-Way Out');
    g.loadLevel(idx);
    let bashed = 0;
    for (let i = 0; i < 5000 && g.savedCount < g.level.reqSaved; i++) {
        // a basher must be assigned ADJACENT to the pillar face (x≈554) — too far
        // and it finds nothing to dig and reverts to walking.
        if ((g.inventory[SKILLS.BASH] || 0) > 0 && bashed < 3) {
            const m = g.mosslings.find(mo => mo.state === STATE.WALK && mo.dir === 1 && mo.x >= 550 && mo.x <= 559);
            if (m) { g.assignSkill(m, SKILLS.BASH); bashed++; }
        }
        g.update();
    }
    assert(g.savedCount >= g.level.reqSaved, `solvable: saved ${g.savedCount}/${g.level.reqSaved}`);
});

// ==============================================================
console.log('\n— Full-campaign golden-path solves —');
// ==============================================================
/**
 * Run a campaign level under a per-step strategy until it ends (or a frame
 * cap). The strategy is called every step with the live Game and may assign
 * skills via g.assignSkill / g.findTarget-free direct picks. Returns the Game.
 * This is the maintained "golden path" guard: if a level tweak makes the
 * intended route unsolvable, the matching test fails loudly.
 */
function solveCampaign(name, strategy, maxFrames) {
    const idx = LEVELS.findIndex(l => l.name === name);
    assert(idx >= 0, `level "${name}" present`);
    const g = new Game();
    g.loadLevel(idx);
    const cap = maxFrames || 60 * (LEVELS[idx].time + 10);
    for (let i = 0; i < cap && g.state === 'PLAY'; i++) {
        strategy(g);
        g.update();
        if (g.savedCount >= g.level.reqSaved) break; // target met — no need to run out the clock
    }
    return g;
}
const onShelf = (m, yy) => Math.abs(m.y - yy) < 6;
const invHas = (g, s) => (g.inventory[s] || 0) > 0;
/** Assign a skill to every alive WALK-state mossling that can still take it. */
function assignToAllWalkers(g, skill, predicate) {
    if ((g.inventory[skill] || 0) <= 0) return;
    for (const m of g.mosslings) {
        if ((g.inventory[skill] || 0) <= 0) break;
        if (m.state !== STATE.WALK) continue;
        if (predicate && !predicate(m)) continue;
        if (!g.canAssign(m, skill)) continue;
        g.assignSkill(m, skill);
    }
}

test('L3 "Sky High": floating every walker off the perch saves the colony', () => {
    // The 350px drop is fatal unaided; a Floater (permanent) makes it survivable.
    const g = solveCampaign('Sky High', (g) => {
        assignToAllWalkers(g, SKILLS.FLOAT, m => !m.hasFloater);
    });
    assert(g.savedCount >= g.level.reqSaved, `saved ${g.savedCount}/${g.level.reqSaved}`);
});

test('L4 "The Wall": giving every walker a Climber scales the sheer face to the exit', () => {
    const g = solveCampaign('The Wall', (g) => {
        assignToAllWalkers(g, SKILLS.CLIMB, m => !m.hasClimber);
    });
    assert(g.savedCount >= g.level.reqSaved, `saved ${g.savedCount}/${g.level.reqSaved}`);
});

test('L2 "Going Down": staggered dig-holes form a stair the colony reuses', () => {
    const g = solveCampaign('Going Down', (g) => {
        for (const m of g.mosslings) {
            if (m.state !== STATE.WALK || m.dir !== 1 || !invHas(g, SKILLS.DIG)) continue;
            if (onShelf(m, 150) && m.x >= 346 && m.x <= 356) g.assignSkill(m, SKILLS.DIG);
            else if (onShelf(m, 260) && m.x >= 446 && m.x <= 456) g.assignSkill(m, SKILLS.DIG);
            else if (onShelf(m, 370) && m.x >= 546 && m.x <= 556) g.assignSkill(m, SKILLS.DIG);
        }
    });
    assert(g.savedCount >= g.level.reqSaved, `saved ${g.savedCount}/${g.level.reqSaved}, dead ${g.deadCount}`);
});

test('L5 "Diagonal Dig": two mined ramps (one each) carry the colony down the cliffs', () => {
    let r1 = false, r2 = false;
    const g = solveCampaign('Diagonal Dig', (g) => {
        for (const m of g.mosslings) {
            if (m.state !== STATE.WALK || m.dir !== 1) continue;
            if (!r1 && onShelf(m, 150) && m.x >= 198 && m.x <= 208) { g.assignSkill(m, SKILLS.MINE); r1 = true; }
            else if (!r2 && onShelf(m, 310) && m.x >= 498 && m.x <= 508) { g.assignSkill(m, SKILLS.MINE); r2 = true; }
        }
    });
    assert(g.savedCount >= g.level.reqSaved, `saved ${g.savedCount}/${g.level.reqSaved}, dead ${g.deadCount}`);
    eq(g.deadCount, 0, 'mined ramps keep everyone off the fatal cliffs');
});

test('L6 "Hard Rock": one pioneer chain-builds a ramp over the steel wall', () => {
    let pid = null;
    const g = solveCampaign('Hard Rock', (g) => {
        if (pid === null) {
            const lead = g.mosslings.find(m => m.state === STATE.WALK && m.dir === 1 && m.x >= 416);
            if (lead) pid = lead.id;
        }
        const p = g.mosslings.find(m => m.id === pid);
        if (!p) return;
        if ((p.state === STATE.WALK || p.state === STATE.SHRUG) && p.x < 615 && p.y > 104 && invHas(g, SKILLS.BUILD)) {
            if (p.state === STATE.WALK && p.dir !== 1) return;
            g.assignSkill(p, SKILLS.BUILD);
        }
    });
    assert(g.savedCount >= g.level.reqSaved, `saved ${g.savedCount}/${g.level.reqSaved}, dead ${g.deadCount}`);
});

test('L7 "Lava Leap": one pioneer arcs a bridge over the ridge and lava moat', () => {
    let pid = null;
    const g = solveCampaign('Lava Leap', (g) => {
        if (pid === null) {
            const lead = g.mosslings.find(m => m.state === STATE.WALK && m.dir === 1 && m.x >= 196 && m.x <= 210);
            if (lead) pid = lead.id;
        }
        const p = g.mosslings.find(m => m.id === pid);
        if (!p) return;
        if ((p.state === STATE.WALK || p.state === STATE.SHRUG) && p.x < 665 && p.dir === 1 && invHas(g, SKILLS.BUILD)) g.assignSkill(p, SKILLS.BUILD);
    });
    assert(g.savedCount >= g.level.reqSaved, `saved ${g.savedCount}/${g.level.reqSaved}, dead ${g.deadCount}`);
    eq(g.deadCount, 0, 'nobody touched the lava');
});

test('L8 "Mossling Master": athletes (Climber+Floater) scale the tower to the golden gate', () => {
    const g = solveCampaign('Mossling Master', (g) => {
        for (const m of g.mosslings) {
            if (m.state !== STATE.WALK) continue;
            if (!m.hasClimber && invHas(g, SKILLS.CLIMB)) g.assignSkill(m, SKILLS.CLIMB);
            if (!m.hasFloater && invHas(g, SKILLS.FLOAT)) g.assignSkill(m, SKILLS.FLOAT);
        }
    });
    assert(g.savedCount >= g.level.reqSaved, `saved ${g.savedCount}/${g.level.reqSaved}, dead ${g.deadCount}`);
});

// ==============================================================
console.log('\n— First-run onboarding —');
// ==============================================================
test('onboarding arms only on a fresh campaign Level 1', () => {
    global.localStorage.removeItem('mosslings_unlocked');
    const g = new Game(); g.loadLevel(0);
    assert(g.onboarding, 'should onboard a new player on L1');
    g.loadLevel(1);
    assert(!g.onboarding, 'never onboards on later levels');
    storage.setUnlocked(1);
    const h = new Game(); h.loadLevel(0);
    assert(!h.onboarding, 'no onboarding once L1 is cleared');
    global.localStorage.removeItem('mosslings_unlocked'); // reset for other tests
});
test('onboardTarget picks a rightward walker in the build window, and Builder clears the beat', () => {
    global.localStorage.removeItem('mosslings_unlocked');
    const g = new Game(); g.loadLevel(0);
    g.mosslings = [
        Object.assign(new Mossling(440, 200, 0), { state: STATE.WALK, dir: 1 }),
        Object.assign(new Mossling(440, 200, 1), { state: STATE.WALK, dir: -1 }), // wrong way
        Object.assign(new Mossling(100, 200, 2), { state: STATE.WALK, dir: 1 }),  // too far
    ];
    const t = g.onboardTarget();
    assert(t && t.id === 0, 'picked the rightward walker at the gap edge');
    g.assignSkill(t, SKILLS.BUILD);
    assert(g.onboardDone && !g.onboarding, 'first Builder assign ends onboarding');
    global.localStorage.removeItem('mosslings_unlocked');
});

// ==============================================================
console.log('\n— Touch targeting (two-stage tap confirm) —');
// ==============================================================
test('touch: first tap arms+pauses a pending target, second tap commits it', () => {
    const g = new Game(); g.loadLevel(1);
    for (let i = 0; i < 120; i++) g.update();      // let a mossling spawn and walk
    const m = g.mosslings.find(x => x.state === STATE.WALK);
    assert(m, 'a walker exists');
    g.lastPointerTouch = true;
    g.selectSkill(SKILLS.FLOAT);
    g.mouseX = m.x; g.mouseY = m.y - 6;
    g.tryAssign();                                  // first tap → arm + pause
    eq(g.pendingTarget, m, 'first tap armed the pending target');
    eq(g.state, 'PAUSE', 'first touch tap freezes time');
    eq(g.skillsUsed, 0, 'nothing committed on the first tap');
    g.tryAssign();                                  // second tap → commit
    eq(g.skillsUsed, 1, 'second tap committed the assignment');
    assert(m.hasFloater, 'the floater landed on the armed mossling');
    assert(g.pendingTarget === null && g.state === 'PLAY', 'commit clears pending and resumes');
});
test('touch: tapping empty space clears the pending target and resumes', () => {
    const g = new Game(); g.loadLevel(1);
    for (let i = 0; i < 120; i++) g.update();
    const m = g.mosslings.find(x => x.state === STATE.WALK);
    g.lastPointerTouch = true;
    g.selectSkill(SKILLS.FLOAT);
    g.mouseX = m.x; g.mouseY = m.y - 6; g.tryAssign(); // arm
    eq(g.state, 'PAUSE');
    g.mouseX = -50; g.mouseY = -50; g.tryAssign();     // tap far away → cancel
    assert(g.pendingTarget === null && g.state === 'PLAY', 'empty tap cancels and resumes');
    eq(g.skillsUsed, 0, 'nothing was committed');
});
test('drawPendingTarget (magnifier + confirm prompt) renders without throwing', () => {
    const g = new Game(); g.loadLevel(1);
    for (let i = 0; i < 120; i++) g.update();
    const m = g.mosslings.find(x => x.state === STATE.WALK);
    g.lastPointerTouch = true; g.selectSkill(SKILLS.BUILD);
    g.mouseX = m.x; g.mouseY = m.y - 6; g.tryAssign();   // arm
    assert(g.pendingTarget === m, 'armed');
    g.draw();                                            // exercises drawPendingTarget (clip/scale/zoom)
    assert(true, 'no throw');
});
test('desktop (mouse) still commits on the first click — no confirm step', () => {
    const g = new Game(); g.loadLevel(1);
    for (let i = 0; i < 120; i++) g.update();
    const m = g.mosslings.find(x => x.state === STATE.WALK);
    g.lastPointerTouch = false;
    g.selectSkill(SKILLS.FLOAT);
    g.mouseX = m.x; g.mouseY = m.y - 6; g.tryAssign();
    eq(g.skillsUsed, 1, 'mouse click commits immediately');
    assert(g.pendingTarget === null, 'no pending target on desktop');
});

// ==============================================================
console.log('\n— Retro UI assets —');
// ==============================================================
test('skill icon map covers every toolbar skill with inline 24px SVG art', () => {
    for (let i = 0; i < SKILL_NAMES.length; i++) {
        const svg = SKILL_ICONS[i];
        assert(typeof svg === 'string' && svg.includes('<svg'), `${SKILL_NAMES[i]} icon missing`);
        assert(svg.includes('viewBox="0 0 24 24"'), `${SKILL_NAMES[i]} icon not on the 24x24 art grid`);
        assert(!/\p{Extended_Pictographic}/u.test(svg), `${SKILL_NAMES[i]} icon leaked emoji`);
        // 3-tone recipe: must carry more than one fill so the silhouette keeps
        // internal contrast through the disabled grayscale pass (not a flat blob).
        const fills = new Set((svg.match(/fill="[^"]+"/g) || []));
        assert(fills.size >= 3, `${SKILL_NAMES[i]} icon is too flat (${fills.size} fills) — needs outline/fill/highlight`);
    }
});
test('control and medal icon map covers non-emoji gameplay UI', () => {
    for (const key of ['play', 'pause', 'fastForward', 'reset', 'hazard', 'lock', 'soundOn', 'soundOff', 'plus', 'minus', 'trophy', 'medalSilver', 'medalBronze']) {
        const svg = UI_ICONS[key];
        assert(typeof svg === 'string' && svg.includes('<svg'), `${key} icon missing`);
        assert(!/\p{Extended_Pictographic}/u.test(svg), `${key} icon leaked emoji`);
    }
});
test('top-bar control icons use the 24x24 multi-tone pixel-art recipe', () => {
    for (const key of ['play', 'pause', 'fastForward', 'reset', 'hazard', 'lock', 'soundOn', 'soundOff', 'plus', 'minus']) {
        const svg = UI_ICONS[key];
        assert(svg.includes('viewBox="0 0 24 24"'), `${key} control icon not on the 24x24 art grid`);
        assert(svg.includes('ui-art'), `${key} control icon missing ui-art sizing class`);
        const fills = new Set(svg.match(/fill="[^"]+"/g) || []);
        const minFills = key === 'soundOn' ? 2 : 3;
        assert(fills.size >= minFills, `${key} control icon is too flat (${fills.size} fills)`);
    }
});
test('medal icons use the 24x24 3-tone pixel-art recipe (like skill badges)', () => {
    for (const key of ['trophy', 'medalSilver', 'medalBronze']) {
        const svg = UI_ICONS[key];
        assert(svg.includes('viewBox="0 0 24 24"'), `${key} not on the 24x24 art grid`);
        const fills = new Set(svg.match(/fill="[^"]+"/g) || []);
        assert(fills.size >= 3, `${key} medal is too flat (${fills.size} fills) — needs outline/fill/highlight`);
    }
});
test('world detail level rail has class selectors and miniature SVG sizing', () => {
    const uiSrc = fs.readFileSync(path.join(__dirname, '..', 'js', 'ui.js'), 'utf8');
    const menuSrc = fs.readFileSync(path.join(__dirname, '..', 'js', 'menu-ui.js'), 'utf8');
    const css = fs.readFileSync(path.join(__dirname, '..', 'style.css'), 'utf8');
    const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
    assert(html.includes('js/menu-ui.js'), 'menu-ui.js must be loaded as the menu boundary');
    assert(html.includes('id="world-menu"'), 'menu shell must expose id="world-menu"');
    assert(menuSrc.includes('class="world-carousel"'), 'world carousel markup must emit class="world-carousel"');
    assert(menuSrc.includes('class="level-medals"'), 'world detail markup must emit class="level-medals"');
    assert(!/\.lvl-btn\b/.test(css), 'new menu CSS must not keep styling the old .lvl-btn grid');
    assert(/\.level-medals\s*\{[^}]*display:\s*flex/.test(css), 'level medal strip needs its own flex layout');
    assert(/\.level-medals \.pixel-icon\s*\{[^}]*width:\s*10px;[^}]*height:\s*10px;/.test(css), 'level medals must be miniaturized inside the rail');
    assert(menuSrc.includes('aria-disabled'), 'locked level cards need an aria-disabled state');
    assert(uiSrc.includes('gallery-medals'), 'gallery cards need a separate medal sizing contract');
    assert(css.includes('button:focus-visible'), 'keyboard focus must be visible');
    assert(!html.includes('user-scalable=no'), 'page-level zoom must not be globally disabled');
});

// ==============================================================

console.log('\n— Readability assist overlay —');
test('dangerProbe flags a fatal cliff for ordinary walkers', () => {
    const g = new Game();
    g.terrain.clear();
    g.terrain.drawRect(0, 300, 120, 20, T_DIRT);
    const m = new Mossling(92, 299, 1);
    m.state = STATE.WALK;
    m.dir = 1;
    g.mosslings = [m];
    const h = g.dangerProbe(m);
    assert(h && h.kind === 'cliff', `expected cliff hint, got ${h && h.kind}`);
});
test('dangerProbe suppresses fatal-cliff warnings for floaters', () => {
    const g = new Game();
    g.terrain.clear();
    g.terrain.drawRect(0, 300, 120, 20, T_DIRT);
    const m = new Mossling(92, 299, 1);
    m.state = STATE.WALK;
    m.dir = 1; m.hasFloater = true;
    const h = g.dangerProbe(m);
    assert(!h || h.kind !== 'cliff', `floater should not get fatal cliff hint, got ${h && h.kind}`);
});
test('dangerProbe flags lava before contact', () => {
    const g = new Game();
    g.terrain.clear();
    g.terrain.drawRect(0, 300, 220, 20, T_DIRT);
    g.terrain.drawRect(128, 292, 24, 8, T_HAZARD);
    const m = new Mossling(100, 299, 1);
    m.state = STATE.WALK;
    m.dir = 1;
    const h = g.dangerProbe(m);
    assert(h && h.kind === 'lava', `expected lava hint, got ${h && h.kind}`);
});
test('drawDangerHints places warning at the probed danger point', () => {
    const g = new Game();
    g.state = 'PLAY';
    g.tick = 20;
    g.terrain.clear();
    g.terrain.drawRect(0, 300, 120, 20, T_DIRT);
    const m = new Mossling(92, 299, 1);
    m.state = STATE.WALK;
    m.dir = 1;
    g.mosslings = [m];
    const h = g.dangerProbe(m);
    const arcs = [];
    const ctx = makeCtx();
    ctx.arc = (x, y, r) => arcs.push({ x, y, r });
    g.drawDangerHints(ctx);
    assert(arcs.some(a => Math.abs(a.x - h.x) < 0.1 && Math.abs(a.y - h.y) < 0.1),
        `warning marker should use danger point ${h.x},${h.y}, got ${JSON.stringify(arcs)}`);
});
test('drawDangerHints renders without mutating simulation state', () => {
    const g = new Game();
    g.loadLevel(0, false, true);
    g.state = 'PLAY';
    g.terrain.drawRect(0, 300, 120, 20, T_DIRT);
    const m = new Mossling(92, 299, 1);
    m.state = STATE.WALK;
    m.dir = 1;
    g.mosslings = [m];
    const before = `${m.x},${m.y},${m.state},${g.simStep},${g.particles.list.length}`;
    g.drawDangerHints(makeCtx());
    const after = `${m.x},${m.y},${m.state},${g.simStep},${g.particles.list.length}`;
    eq(after, before, 'render assist must not touch sim state');
});
test('a full draw() pass (overlays included) never perturbs the deterministic sim', () => {
    // Guard for the whole render path, not just the danger helper: one run only
    // updates; the other renders a full frame between every sim step. The
    // mosslings must end in byte-identical state — any sim coupling in draw()
    // (danger overlay, lava embers, spores, cursor, juice) would diverge them.
    const a = new Game(); a.loadLevel(0);
    const b = new Game(); b.loadLevel(0);
    for (let i = 0; i < 220; i++) {
        a.update();
        b.update();
        b.tick++;        // advance the render clock so the throttled overlay runs
        b.draw();        // full frame: overlays, glow, spores, cursor
    }
    const sig = (g) => g.mosslings.map(m => `${m.id}:${m.x},${m.y},${m.state},${m.dir}`).join('|');
    eq(b.simStep, a.simStep, 'draw() advanced simStep');
    eq(sig(b), sig(a), 'mossling sim state diverged when a full frame rendered each step');
});
test('storage survives a throwing localStorage (quota / private mode)', () => {
    const real = global.localStorage;
    global.localStorage = {
        getItem() { throw new Error('blocked'); },
        setItem() { throw new Error('quota exceeded'); },
        removeItem() { throw new Error('blocked'); },
    };
    try {
        const s = new StorageManager();
        let threw = false;
        try {
            s.save('best', { 0: 50 });
            s.setUnlocked(3);
            s.setMedals(0, { saved: 1, skills: 1, time: 1 });
            eq(s.getUnlocked(), 0, 'read failure falls back to the default');
            eq(s.getBest(0), null, 'best read failure returns null');
        } catch (e) { threw = true; }
        assert(!threw, 'StorageManager must swallow localStorage exceptions, not crash the game');
    } finally {
        global.localStorage = real;
    }
});

console.log('\n— Music & game-feel —');
// ==============================================================
function makeAudioParam(v = 0) {
    return {
        value: v,
        setValueAtTime(x) { this.value = x; },
        linearRampToValueAtTime(x) { this.value = x; },
        exponentialRampToValueAtTime(x) { this.value = x; },
        setTargetAtTime(x) { this.value = x; },
        cancelScheduledValues() {},
    };
}
function makeAudioNode() {
    const node = {
        gain: makeAudioParam(),
        frequency: makeAudioParam(440),
        Q: makeAudioParam(0),
        detune: makeAudioParam(0),
        threshold: makeAudioParam(0),
        knee: makeAudioParam(0),
        ratio: makeAudioParam(1),
        attack: makeAudioParam(0),
        release: makeAudioParam(0),
        type: 'sine',
        connect(dest) { return dest || node; },
        start() {},
        stop() {},
    };
    return node;
}
function makeFakeAudioContext() {
    return {
        currentTime: 10,
        sampleRate: 8000,
        state: 'running',
        destination: makeAudioNode(),
        resume() {},
        createGain: makeAudioNode,
        createBiquadFilter: makeAudioNode,
        createDynamicsCompressor: makeAudioNode,
        createOscillator: makeAudioNode,
        createBufferSource: makeAudioNode,
        createBuffer(channels, len) {
            return { getChannelData: () => new Float32Array(len) };
        },
    };
}
test('music engine constructs and no-ops safely without an AudioContext', () => {
    const m = new MusicEngine(audio);                 // audio has no real ctx in Node
    eq(m.playing, false, 'starts idle');
    m.start('VOLCANO');                                // must not throw
    eq(m.playing, false, 'cannot play without an AudioContext (graceful)');
    m.setIntensity(99); eq(m.intensity, 1.6, 'intensity clamps to max');
    m.setIntensity(0);  eq(m.intensity, 0.6, 'intensity clamps to min');
    m.stop();                                          // must not throw
    assert(MUSIC_THEMES.FOREST && MUSIC_THEMES.CAVE && MUSIC_THEMES.VOLCANO, 'all three themes defined');
});
test('every theme maps a chord root to an in-tune frequency', () => {
    const m = new MusicEngine(audio);
    for (const name of Object.keys(MUSIC_THEMES)) {
        m.cfg = MUSIC_THEMES[name];
        const f = m._scaleNote(m._chordRootForBar(0), 0);
        assert(f > 20 && f < 4000, `${name}: ${f}Hz out of audible musical range`);
    }
});
test('theme music uses distinct arrangement profiles', () => {
    eq(MUSIC_THEMES.FOREST.pattern, 'FOREST');
    eq(MUSIC_THEMES.CAVE.pattern, 'CAVE');
    eq(MUSIC_THEMES.VOLCANO.pattern, 'VOLCANO');
    assert(MUSIC_PATTERNS.CAVE.bass.join('|') !== MUSIC_PATTERNS.FOREST.bass.join('|'), 'cave bass pattern differs from forest');
    assert(MUSIC_PATTERNS.VOLCANO.kick.join('|') !== MUSIC_PATTERNS.FOREST.kick.join('|'), 'volcano drum pattern differs from forest');
});
test('mute preference persists through AudioEngine instances', () => {
    localStorage.removeItem('mosslings.audioMuted');
    const a = new AudioEngine();
    eq(a.muted, false, 'fresh engine starts unmuted');
    a.setMuted(true);
    eq(localStorage.getItem('mosslings.audioMuted'), '1', 'mute flag written');
    const b = new AudioEngine();
    eq(b.muted, true, 'new engine reads stored mute flag');
    b.setMuted(false);
    eq(localStorage.getItem('mosslings.audioMuted'), '0', 'unmute flag written');
});
test('music start is autoplay-safe and waits for an existing AudioContext', () => {
    const fakeAudio = { ctx: null, available: true, master: null, initCalls: 0, init() { this.initCalls++; } };
    const m = new MusicEngine(fakeAudio);
    m.start('FOREST');
    eq(fakeAudio.initCalls, 0, 'music.start must not create AudioContext by itself');
    eq(m.playing, false, 'music does not play without a user-armed context');
});
test('music start is idempotent and does not stack scheduler loops', () => {
    const fakeAudio = { ctx: makeFakeAudioContext(), available: true, master: makeAudioNode(), init() {} };
    const m = new MusicEngine(fakeAudio);
    const oldSet = global.setInterval;
    const oldClear = global.clearInterval;
    let intervals = 0, clears = 0;
    global.setInterval = () => { intervals++; return 77; };
    global.clearInterval = () => { clears++; };
    try {
        m.start('FOREST');
        m.start('VOLCANO');
        eq(intervals, 1, 'second start created a duplicate scheduler');
        eq(m.theme, 'VOLCANO', 'second start may retheme the existing loop');
        m.stop(0);
        eq(clears, 1, 'stop clears the one scheduler');
    } finally {
        global.setInterval = oldSet;
        global.clearInterval = oldClear;
    }
});
test('save streak is deterministic and rebuilds exactly on rewind', () => {
    // Two identical runs must agree on streak state (no wall-clock, no Math.random).
    const a = new Game(); a.loadLevel(0);
    const b = new Game(); b.loadLevel(0);
    for (let i = 0; i < 400; i++) { a.update(); b.update(); }
    eq(a.saveStreak, b.saveStreak, 'streak diverged between identical runs');
    eq(a.lastSaveStep, b.lastSaveStep, 'lastSaveStep diverged');
});
test('blink is render-only: update() never touches it, updateCosmetics() drives it deterministically', () => {
    const m = new Mossling(100, 100, 7);
    const g = makeGame();
    g.terrain.drawRect(0, 110, 200, 20, T_DIRT); // floor so it doesn't fall away
    for (let i = 0; i < 500; i++) m.update(g);
    eq(m.blink, 0, 'update() must never set blink (it left the sim path)');
    // updateCosmetics is a pure function of id + its own render counter.
    const a = new Mossling(0, 0, 3), b = new Mossling(0, 0, 3);
    for (let i = 0; i < 2000; i++) { a.updateCosmetics(); b.updateCosmetics(); }
    eq(a.blink, b.blink, 'cosmetic blink diverged for identical id');
    assert(a.cosmeticFrame === 2000 + 3 * 13, 'cosmetic clock advanced once per call');
});
test('lava embers no longer spawn from update() (no Math.random in the sim path)', () => {
    const g = new Game();
    const idx = LEVELS.findIndex(l => l.name === 'Lava Leap'); // has T_HAZARD
    g.loadLevel(idx);
    g.particles.list = [];
    for (let i = 0; i < 120; i++) g.update();
    eq(g.particles.list.length, 0, 'update() emitted decorative embers it should not');
});
test('Particles caps the active list to avoid unbounded growth', () => {
    const p = new Particles();
    for (let i = 0; i < 40; i++) p.spawn(0, 0, '#fff', 100); // 4000 requested across many bursts
    assert(p.list.length <= Particles.MAX, `over cap: ${p.list.length} > ${Particles.MAX}`);
    // A single oversized burst must not bypass the ceiling either.
    p.spawn(0, 0, '#fff', Particles.MAX + 600);
    assert(p.list.length <= Particles.MAX, `one big burst broke the cap: ${p.list.length} > ${Particles.MAX}`);
});
test('hit-stop and flash never advance or stall the deterministic sim', () => {
    // juice() touches only render fields; update() must ignore them entirely.
    const g = new Game(); g.loadLevel(1);
    g.juice({ flash: 0.5, hitStop: 10, shake: 9 });
    const before = g.simStep;
    g.update();
    eq(g.simStep, before + 1, 'update() advanced exactly one step regardless of hitStop');
    assert(g.hitStop === 10, 'update() did not consume hitStop (that is loop()’s job)');
});

console.log('\n— Muting & progressive disclosure —');
// ==============================================================
test('muted music never builds a bus or starts the scheduler', () => {
    const fakeAudio = { ctx: makeFakeAudioContext(), available: true, master: makeAudioNode(), muted: true, init() {} };
    const m = new MusicEngine(fakeAudio);
    const oldSet = global.setInterval;
    let intervals = 0;
    global.setInterval = () => { intervals++; return 88; };
    try {
        m.start('FOREST');
        eq(m.playing, false, 'start() must bail while muted');
        eq(intervals, 0, 'muted start() must not spin up a scheduler');
        eq(m.bus, null, 'muted start() must not build the audio bus');
        // Unmuting and re-starting brings it back cleanly.
        fakeAudio.muted = false;
        m.start('FOREST');
        eq(m.playing, true, 'unmuted start() runs');
        eq(intervals, 1, 'exactly one scheduler after unmute');
    } finally { global.setInterval = oldSet; m.playing = false; }
});
test('a running score stops the instant the audio engine is muted', () => {
    const a = new AudioEngine();
    a.muted = false;
    let stopped = false;
    a.onMuteChange = (muted) => { if (muted) stopped = true; };  // mirrors music.js wiring
    a.setMuted(true);
    assert(stopped, 'setMuted(true) must notify the music engine to stop');
});
test('advanced controls (rate/nuke) are gated for the first two campaign levels', () => {
    const g = new Game();
    localStorage.setItem('mosslings_unlocked', '0');
    g.levelIdx = 0;  assert(!g.advancedControlsVisible(), 'Level 1 (fresh) hides advanced controls');
    g.levelIdx = 1;  assert(!g.advancedControlsVisible(), 'Level 2 (fresh) still hides them');
    g.levelIdx = -2; assert(g.advancedControlsVisible(), 'custom/shared levels keep full controls');
    g.levelIdx = -1; assert(g.advancedControlsVisible(), 'editor keeps full controls');
    localStorage.setItem('mosslings_unlocked', '2');
    g.levelIdx = 2;  assert(g.advancedControlsVisible(), 'controls return once Level 2 is cleared');
    localStorage.removeItem('mosslings_unlocked'); // leave storage clean for later tests
});

console.log('\n— Shared-level import robustness (fuzz) —');
// ==============================================================
test('deserializeLevel rejects non-string / oversized input without throwing', () => {
    const bad = ['', '!', null, undefined, 12345, {}, [], 'x'.repeat(SHARE_MAX_CHARS + 1)];
    for (const b of bad) {
        let r, threw = false;
        try { r = deserializeLevel(b); } catch (e) { threw = true; }
        assert(!threw, `threw on input ${String(b).slice(0, 12)}`);
        eq(r, null, `expected null for ${String(b).slice(0, 12)}`);
    }
});
test('deserializeLevel survives 6000 random base64url payloads (never throws)', () => {
    const alpha = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
    let seed = 0x1234567;
    const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
    for (let i = 0; i < 6000; i++) {
        const len = 1 + (rnd() * 200 | 0);
        let s = '';
        for (let j = 0; j < len; j++) s += alpha[(rnd() * alpha.length) | 0];
        let out, threw = false;
        try { out = deserializeLevel(s); } catch (e) { threw = true; }
        assert(!threw, `threw on random payload "${s.slice(0, 16)}…"`);
        assert(out === null || (out && typeof out.name === 'string' && Array.isArray(out.commands)),
            `returned a malformed object for "${s.slice(0, 16)}…"`);
    }
});
test('deserializeLevel rejects a header that lies about its command count', () => {
    // Hand-build a valid v2 header, then claim 255 commands with no payload.
    const buf = [LEVEL_FORMAT_VERSION, 0x68, 0x69, 0x00]; // "hi" + terminator
    buf.push(10, 5);                 // totalSpawn, reqSaved
    buf.push(0, 60);                 // time (u16)
    buf.push(60);                    // spawnRate
    buf.push(0);                     // flags (no par)
    for (let i = 0; i < 8; i++) buf.push(0, 0); // spawn.x/y, exit.x/y (u16 each)
    for (let i = 0; i < 8; i++) buf.push(3);    // inventory ×8
    buf.push(255);                   // cmdCount = 255, but zero commands follow
    let bin = '';
    for (const b of buf) bin += String.fromCharCode(b);
    const code = (typeof btoa !== 'undefined' ? btoa(bin) : Buffer.from(bin, 'binary').toString('base64'))
        .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    let r, threw = false;
    try { r = deserializeLevel(code); } catch (e) { threw = true; }
    assert(!threw, 'truncated-command header must not throw');
    eq(r, null, 'a command count exceeding the buffer must be rejected');
});

// ==============================================================
console.log('\n— Sprint: phone-first repeat-play —');
// ==============================================================

// A canvas recorder that captures fillRect calls with the active fillStyle, so
// we can assert specific pixels were drawn without a real canvas.
function recordingCtx() {
    const calls = [];
    let fillStyle = '';
    const noop = () => {};
    const ctx = {
        save: noop, restore: noop, translate: noop, scale: noop, rotate: noop,
        beginPath: noop, closePath: noop, moveTo: noop, lineTo: noop, arc: noop,
        ellipse: noop, quadraticCurveTo: noop, fill: noop, stroke: noop,
        strokeRect: noop, drawImage: noop, fillText: noop, clip: noop,
        measureText: () => ({ width: 0 }),
        createRadialGradient: () => ({ addColorStop: noop }),
        createLinearGradient: () => ({ addColorStop: noop }),
        fillRect(x, y, w, h) { calls.push({ x, y, w, h, fill: fillStyle }); },
        set fillStyle(v) { fillStyle = v; }, get fillStyle() { return fillStyle; },
        set strokeStyle(v) {}, set lineWidth(v) {}, set globalAlpha(v) {}, get globalAlpha() { return 1; },
        set globalCompositeOperation(v) {}, set filter(v) {}, get filter() { return ''; },
        set font(v) {}, set textAlign(v) {}, set shadowColor(v) {}, set shadowBlur(v) {},
    };
    return { ctx, calls };
}

// Item 4 — always-on permanent-skill pips.
test('grounded Floater renders an always-on canopy pip', () => {
    const m = new Mossling(100, 100, 0); m.state = STATE.WALK; m.hasFloater = true;
    const rec = recordingCtx(); m.draw(rec.ctx);
    assert(rec.calls.some(c => c.fill === '#34c0d4'), 'cyan floater pip drawn while grounded');
});
test('a non-floater draws no floater pip', () => {
    const m = new Mossling(100, 100, 1); m.state = STATE.WALK;
    const rec = recordingCtx(); m.draw(rec.ctx);
    assert(!rec.calls.some(c => c.fill === '#34c0d4'), 'no cyan pip without the trait');
});

// Item 5 — reduced motion suppresses canvas juice, never the sim.
test('reduced motion suppresses flash/shake/hit-stop but the sim still advances', () => {
    const g = new Game(); g.loadLevel(0);
    g.reduceMotion = true;
    g.flash = 0; g.shake = 0; g.hitStop = 0;
    g.juice({ flash: 0.6, shake: 9, hitStop: 6 });
    eq(g.flash, 0, 'flash suppressed');
    eq(g.shake, 0, 'shake suppressed');
    eq(g.hitStop, 0, 'hit-stop suppressed');
    const before = g.simStep; g.update(); eq(g.simStep, before + 1, 'update() still advances one step');
});
test('without reduced motion, juice still fires', () => {
    const g = new Game(); g.loadLevel(0);
    g.reduceMotion = false; g.flash = 0;
    g.juice({ flash: 0.5 });
    assert(g.flash > 0, 'flash applied when motion is allowed');
});

// Item 3 — haptics: opt-out, reduced-motion aware, never during replay.
test('haptics fires when enabled and stays silent when off or reduced', () => {
    const prev = navigator.vibrate; let calls = 0;
    navigator.vibrate = () => { calls++; return true; };
    haptics.setReducedMotion(false); haptics.setEnabled(true);
    haptics.save(); assert(calls > 0, 'vibrates when enabled');
    calls = 0; haptics.setEnabled(false); haptics.save(); eq(calls, 0, 'silent when disabled');
    haptics.setEnabled(true); haptics.setReducedMotion(true); calls = 0; haptics.save();
    eq(calls, 0, 'silent under reduced motion');
    haptics.setReducedMotion(false);
    navigator.vibrate = prev;
});
test('haptics never fires during deterministic replay catch-up', () => {
    const prev = navigator.vibrate; let calls = 0;
    navigator.vibrate = () => { calls++; };
    haptics.setEnabled(true); haptics.setReducedMotion(false);
    const g = new Game(); g.loadLevel(0);
    g.replaying = true; g.onSave({ x: 0, y: 0 }); g.replaying = false;
    eq(calls, 0, 'onSave during replay does not buzz');
    navigator.vibrate = prev;
});

// Item 6 — first-encounter coaching data + seen-tracking.
test('every campaign level grants its headline skill', () => {
    for (let i = 0; i < LEVELS.length; i++) {
        const hs = LEVELS[i].headlineSkill;
        assert(hs != null && hs >= 0 && hs <= 7, `L${i + 1} headlineSkill in range`);
        assert((LEVELS[i].inventory[hs] || 0) > 0, `L${i + 1} inventory includes its headline skill`);
    }
});
test('starting a later campaign level marks it seen exactly once', () => {
    storage.save('seen', {});
    assert(!storage.isSeen(3), 'unseen before first play');
    const g = new Game(); g.loadLevel(3);
    assert(storage.isSeen(3), 'seen after onLevelStart');
});

// ==============================================================
console.log('\n— Sprint: readable mastery loop —');
// ==============================================================

// Item P0-1 — failure diagnosis (derived from recorded state; no sim mutation).
test('recordDeath tallies a cause and its rounded position', () => {
    const g = new Game(); g.loadLevel(0);
    g.recordDeath('cliff', 123.6, 200.2);
    eq(g.deaths.cliff, 1, 'cliff counted');
    eq(g.deaths.lastPos.cliff.x, 124, 'x rounded');
    eq(g.deaths.lastPos.cliff.y, 200, 'y rounded');
    g.recordDeath('bogus', 1, 1);          // unknown cause ignored
    eq(g.deaths.cliff, 1, 'unknown cause does not corrupt the tally');
});
test('death tally is deterministic across identical runs', () => {
    const a = new Game(); a.loadLevel(0);
    const b = new Game(); b.loadLevel(0);
    // Long enough for unguided marchers to reach L1's gap and fall to their death.
    for (let i = 0; i < 1600; i++) { a.update(); b.update(); }
    eq(JSON.stringify(a.deaths), JSON.stringify(b.deaths), 'death tallies diverged');
    assert(a.deaths.void + a.deaths.cliff > 0, 'unguided L1 marchers should die (tally non-empty)');
});
test('diagnoseFailure picks the most actionable reason and never mutates the sim', () => {
    const mk = () => { const g = new Game(); g.loadLevel(0); return g; };
    const before = (() => { const g = mk(); const s = g.simStep; g.diagnoseFailure(); return g.simStep === s; })();
    assert(before, 'diagnoseFailure must not advance simStep');

    let g = mk(); g.deaths.lava = 3; g.deaths.cliff = 1; g.deaths.lastPos.lava = { x: 400, y: 300 };
    let d = g.diagnoseFailure(); eq(d.key, 'lava', 'lava dominates'); assert(d.zone && d.zone.kind === 'lava', 'lava zone set');

    g = mk(); g.deaths.cliff = 2; g.deaths.lastPos.cliff = { x: 200, y: 250 };
    d = g.diagnoseFailure(); eq(d.key, 'cliff'); eq(d.zone.x, 200);

    g = mk(); g.deaths.void = 1; g.deaths.lastPos.void = { x: 10, y: 500 };
    eq(g.diagnoseFailure().key, 'void');

    g = mk(); g.time = 0; g.mosslings = [new Mossling(0, 0, 0)]; // one still wandering
    eq(g.diagnoseFailure().key, 'time');

    g = mk(); g.time = 100; for (const k of Object.keys(g.inventory)) g.inventory[k] = 0; g.savedCount = 0;
    eq(g.diagnoseFailure().key, 'skills');

    g = mk(); g.time = 100; g.savedCount = Math.max(0, g.level.reqSaved - 1);
    eq(g.diagnoseFailure().key, 'short');
});
test('diagnoseFailure names athlete-gate rejection over a generic timeout', () => {
    // Athlete Trial is a gold-portal level (exit.athlete).
    const athleteIdx = LEVELS.findIndex(l => l.exit && l.exit.athlete);
    const g = new Game(); g.loadLevel(athleteIdx);
    assert(g.level.exit.athlete, 'fixture must be an athlete level');
    // No rejections recorded → a timeout still reads as time/colony, not athlete.
    g.time = 0; g.mosslings = [new Mossling(0, 0, 0)];
    assert(g.diagnoseFailure().key !== 'athlete', 'no rejection must not key athlete');
    // Two creatures reach the gate lacking only a Climber → diagnosis attributes it.
    g.recordGateRejection({ hasFloater: true, hasClimber: false }, g.level.exit);
    g.recordGateRejection({ hasFloater: true, hasClimber: false }, g.level.exit);
    const d = g.diagnoseFailure();
    eq(d.key, 'athlete', 'gate rejection attributed');
    assert(/Climber/.test(d.detail), `should name the missing Climber, got "${d.detail}"`);
    assert(d.zone && d.zone.kind === 'gate', 'gate retry-hint zone set');
    // Lethal hazards still take precedence (fix the dying first).
    g.deaths.lava = 4; g.deaths.lastPos.lava = { x: 100, y: 100 };
    eq(g.diagnoseFailure().key, 'lava', 'lava deaths outrank gate rejection');
});
test('gate rejection bookkeeping is deterministic and reset per attempt', () => {
    const g = new Game(); g.loadLevel(LEVELS.findIndex(l => l.exit && l.exit.athlete));
    g.recordGateRejection({ hasFloater: false, hasClimber: false }, g.level.exit);
    eq(g.gateRejects, 1, 'counted once');
    eq(g.gateRejectMissing.both, 1, 'missing-both tallied');
    g.loadLevel(LEVELS.findIndex(l => l.exit && l.exit.athlete)); // reload clears it
    eq(g.gateRejects, 0, 'reset on reload');
    eq(g.gateRejectMissing.both, 0, 'missing tally reset');
});

// Item P0-2 — retry ghost hint (render-only, never logged).
test('a matching retry hint is consumed into a render-only failHint; a different level clears it', () => {
    const g = new Game(); g.loadLevel(0);
    g.retryHint = { key: g.levelKey(), x: 100, y: 200, kind: 'cliff' };
    g.loadLevel(0);                                  // same level → hint shown
    assert(g.failHint && g.failHint.x === 100 && g.failHint.kind === 'cliff', 'failHint armed on retry');
    eq(g.retryHint, null, 'retryHint consumed');

    g.retryHint = { key: 'c0', x: 1, y: 2, kind: 'lava' };
    g.loadLevel(1);                                  // different level → cleared
    eq(g.failHint, null, 'hint cleared on a different level');
});
test('failHint is render-only: the sim ignores it, and it self-clears when stale', () => {
    const rec = recordingCtx();
    const g = new Game(); g.loadLevel(0);
    g.failHint = { x: 100, y: 200, kind: 'cliff', born: g.tick };
    const s = g.simStep; g.update(); eq(g.simStep, s + 1, 'update advances regardless of failHint');
    assert(g.failHint, 'update does not touch the hint');
    g.drawFailHint(rec.ctx); assert(g.failHint, 'a fresh hint keeps drawing');
    g.failHint = { x: 1, y: 1, kind: 'cliff', born: g.tick - 999 };
    g.drawFailHint(rec.ctx); eq(g.failHint, null, 'an expired hint self-clears');
});

// Item P1-1 — skill-intent previews (render-only, every skill represented).
test('skill intent preview draws a cue for every skill without mutating sim state', () => {
    const g = new Game(); g.loadLevel(0);
    const m = new Mossling(180, 220, 99); m.state = STATE.WALK; m.dir = 1;
    const before = () => JSON.stringify({
        simStep: g.simStep,
        actionLog: g.actionLog.length,
        inventory: g.inventory,
        mossling: { state: m.state, x: m.x, y: m.y, dir: m.dir, floater: m.hasFloater, climber: m.hasClimber },
    });
    for (let s = 0; s < SKILL_NAMES.length; s++) {
        g.selectedSkill = s;
        const pre = before();
        const rec = recordingCtx();
        g.drawSkillGhost(rec.ctx, m);
        assert(rec.calls.length > 0, `${SKILL_NAMES[s]} preview drew nothing`);
        eq(before(), pre, `${SKILL_NAMES[s]} preview mutated game or mossling state`);
    }
});
test('skill intent preview uses distinct permanent-skill cues for Floater and Climber', () => {
    const g = new Game(); g.loadLevel(0);
    const m = new Mossling(180, 220, 100); m.state = STATE.WALK; m.dir = 1;
    g.selectedSkill = SKILLS.FLOAT;
    let rec = recordingCtx(); g.drawSkillGhost(rec.ctx, m);
    assert(rec.calls.some(c => c.fill === '#34c0d4'), 'Floater preview needs cyan umbrella/fall cue');
    g.selectedSkill = SKILLS.CLIMB;
    rec = recordingCtx(); g.drawSkillGhost(rec.ctx, m);
    assert(rec.calls.some(c => c.fill === '#9ccc65'), 'Climber preview needs green ladder/arrow cue');
});
test('Builder intent preview shows the full builder span, not only a vague cursor mark', () => {
    const g = new Game(); g.loadLevel(0);
    const m = new Mossling(180, 220, 101); m.state = STATE.WALK; m.dir = 1;
    g.selectedSkill = SKILLS.BUILD;
    const rec = recordingCtx(); g.drawSkillGhost(rec.ctx, m);
    const bricks = rec.calls.filter(c => c.fill === '#ffeb3b' && c.w === 8 && c.h === 2);
    assert(bricks.length >= PHYS.BUILD_BRICKS, 'Builder preview should show a full staircase footprint');
});

// Item P1-2 — one missing medal target on replayable level cards.
test('nextMedalGoal exposes the first missing mastery target in priority order', () => {
    let goal = ui.nextMedalGoal(LEVELS[0], { saved: 0, skills: 0, time: 0 });
    eq(goal.key, 'saved');
    assert(goal.short.includes('SAVE'), 'rescue target short label');
    assert(goal.label.includes('save all'), 'rescue target full label');
    goal = ui.nextMedalGoal(LEVELS[0], { saved: 1, skills: 0, time: 0 });
    eq(goal.key, 'skills');
    eq(goal.short, 'SK<=3');
    goal = ui.nextMedalGoal(LEVELS[0], { saved: 1, skills: 1, time: 0 });
    eq(goal.key, 'time');
    eq(goal.short, 'T<0:55');
    eq(ui.nextMedalGoal(LEVELS[0], { saved: 1, skills: 1, time: 1 }), null, 'all medals cleared');
});

// Item P2 — visible local win-streak momentum (localStorage only, not sim).
test('run streak storage increments wins, tracks best, and resets on a loss', () => {
    storage.save('streak', { current: 0, best: 0 });
    let s = storage.recordRunOutcome(true);
    eq(s.current, 1, 'first win starts the streak');
    eq(s.best, 1, 'first win sets best');
    s = storage.recordRunOutcome(true);
    eq(s.current, 2, 'second consecutive win increments');
    eq(s.best, 2, 'best follows the high-water mark');
    s = storage.recordRunOutcome(false);
    eq(s.current, 0, 'loss resets current streak');
    eq(s.previous, 2, 'loss reports the streak that ended');
    eq(s.best, 2, 'loss preserves best streak');
    eq(storage.getRunStreak().best, 2, 'best streak persisted');
});

// Item P3 — result overlay can name the next mastery target without emoji/UI drift.
test('result progress helpers render streak and mastery target chips', () => {
    const streak = ui.runStreakHtml({ win: true, current: 3, best: 4 });
    assert(streak.includes('STREAK 3'), 'win streak chip names the current streak');
    assert(!/[🔥🥇🥈🥉]/u.test(streak), 'streak chip must not depend on platform emoji');
    const target = ui.resultTargetHtml({ label: 'Next target: use 3 or fewer skills' }, false);
    assert(target.includes('Next target: use 3 or fewer skills'), 'target chip carries the full mastery prompt');
    assert(ui.resultTargetHtml(null, true).includes('All medal targets cleared'), 'complete chip renders');
});

// ==============================================================
console.log('\n— Menu progression —');
// ==============================================================
test('world reward seen flags persist through the compatible storage key', () => {
    assert(storage.hasChapterRewardSeen(1) === false, 'world 2 reward should start unseen');
    storage.markChapterRewardSeen(1);
    assert(storage.hasChapterRewardSeen(1) === true, 'world reward should persist once marked');
    assert(storage.hasChapterRewardSeen(2) === false, 'other worlds stay unseen');
});
test('world mastery summary counts medals and exposes the next focus', () => {
    storage.save('best', {});
    storage.save('medals', {});
    storage.setBest(0, 100);
    storage.setMedals(0, { saved: 1, skills: 1, time: 1 });
    storage.setBest(1, 100);
    storage.setMedals(1, { saved: 1, skills: 0, time: 0 });
    storage.setBest(2, 83);
    storage.setMedals(2, { saved: 0, skills: 0, time: 0 });
    const meta = ui.worldMeta(0);
    const data = ui.worldMasteryData(meta, 6);
    eq(data.rescue, 2, 'rescue medals counted across the world');
    eq(data.efficiency, 1, 'efficiency medals counted across the world');
    eq(data.speed, 1, 'speed medals counted across the world');
    eq(data.mastered, 1, 'fully mastered levels counted');
    eq(data.masteryComplete, false, 'partial world is not flagged complete');
    eq(data.nextGoal.level, 2, 'next focus points at the first incomplete unlocked level');
    const html = ui.worldMasterySummaryHtml(meta, 6);
    assert(html.includes('Rescue 2/7'), 'row prints rescue progress');
    assert(html.includes('Mastered 1/7'), 'row prints mastered progress');
    assert(html.includes('Next: L2'), 'row prints the next focus chip');
});

test('world mastery summary exposes completion state when every level is mastered', () => {
    storage.save('best', {});
    storage.save('medals', {});
    for (let i = 0; i < 7; i++) {
        storage.setBest(i, 100);
        storage.setMedals(i, { saved: 1, skills: 1, time: 1 });
    }
    const meta = ui.worldMeta(0);
    const data = ui.worldMasteryData(meta, 6);
    eq(data.mastered, 7, 'all levels count as mastered');
    eq(data.masteryComplete, true, 'world mastery completion is detected');
    eq(data.nextGoal, null, 'no next goal remains when world is complete');
    const html = ui.worldMasterySummaryHtml(meta, 6);
    assert(html.includes('world-mastery is-complete'), 'row adds a completion class');
    assert(html.includes('World 1 mastery complete'), 'row prints the completion banner');
    assert(html.includes('World mastered'), 'row switches the next chip to completion copy');
    assert(html.includes('world-mastery-node'), 'mastered nodes use the world mastery contract');
});


test('world reward ribbon summarizes world-complete stats and mastery state', () => {
    storage.save('best', {});
    storage.save('medals', {});
    for (let i = 0; i < 7; i++) {
        storage.setBest(i, 100);
        storage.setMedals(i, { saved: 1, skills: 1, time: 1 });
    }
    const html = ui.worldCompletionRibbonHtml(ui.worldMeta(0), 6);
    assert(html.includes('World mastered'), 'reward ribbon distinguishes mastery from a plain unlock');
    assert(html.includes('21/21 medals'), 'reward ribbon surfaces aggregate medal totals');
    assert(html.includes('Mastery complete'), 'reward ribbon prints the mastery pill');
});

test('late-campaign ordering now ramps world 2 and 3 more steadily', () => {
    const names = LEVELS.slice(7).map(l => l.name);
    eq(names[0], 'One-Way Out', 'world 2 now opens with a route-control remix');
    eq(names[2], "Basher's Hollow", 'level 10 should sit in the middle of the advanced route world');
    eq(names[7], 'Gatekeeper', 'world 3 now begins with the switch intro');
    eq(names[12], 'Mossling Master', 'tower ascent now lands near the endgame');
    eq(names[13], 'Moss Gauntlet', 'the gauntlet remains the campaign finale');
});

// ------------------------------------------------------------------
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
