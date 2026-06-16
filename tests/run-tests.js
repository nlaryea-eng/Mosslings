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

for (const f of ['constants.js', 'icons.js', 'audio.js', 'music.js', 'particles.js', 'terrain.js', 'mossling.js', 'levels.js', 'game.js', 'utils.js', 'ui.js']) {
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
        juice() {},
        onSave(m) { this.savedCount++; },
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
    
    const drop = dropBelow(terrain, lvl.spawn.x, lvl.spawn.y);
    if (drop === Infinity) return 'Nothing under the spawn';
    if (drop >= PHYS.FATAL_FALL) return 'Spawn drop is too high';
    
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
test('skill icon map covers every toolbar skill with inline 16px SVG', () => {
    for (let i = 0; i < SKILL_NAMES.length; i++) {
        const svg = SKILL_ICONS[i];
        assert(typeof svg === 'string' && svg.includes('<svg'), `${SKILL_NAMES[i]} icon missing`);
        assert(svg.includes('viewBox="0 0 16 16"'), `${SKILL_NAMES[i]} icon not on 16x16 grid`);
    }
});
test('control and medal icon map covers non-emoji gameplay UI', () => {
    for (const key of ['play', 'pause', 'fastForward', 'reset', 'hazard', 'soundOn', 'soundOff', 'trophy', 'medalSilver', 'medalBronze']) {
        const svg = UI_ICONS[key];
        assert(typeof svg === 'string' && svg.includes('<svg'), `${key} icon missing`);
        assert(!/[🏆🥈🥉🔊🔇⏩⏸☢]/u.test(svg), `${key} icon leaked emoji`);
    }
});

// ==============================================================
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
    m.setIntensity(99); eq(m.intensity, 1.5, 'intensity clamps to max');
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

// ------------------------------------------------------------------
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
