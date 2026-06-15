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

for (const f of ['constants.js', 'audio.js', 'particles.js', 'terrain.js', 'mossling.js', 'levels.js', 'game.js', 'utils.js', 'ui.js']) {
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
        shake: 0,
        level: { exit: { x: -9999, y: -9999 }, spawn: { x: 0, y: 0 } },
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

// ------------------------------------------------------------------
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
