'use strict';
/**
 * MOSSLINGS — shared constants.
 * Plain script (no modules) so the game runs from file:// with zero build step.
 */

const W = 960, H = 540;

// Terrain tile types (stored in the per-pixel collision mask)
// One-way membranes are indestructible vertical gates: a mossling can push
// through them only when travelling in the allowed direction, and falls
// straight through them (they are never a floor) — see Mossling.isSolid().
const T_AIR = 0, T_DIRT = 1, T_METAL = 2, T_HAZARD = 3, T_BRIDGE = 4, T_ONEWAY_R = 5, T_ONEWAY_L = 6;
const TILE_NAMES = ['Air', 'Dirt', 'Metal', 'Lava', 'Bridge', 'One-way →', 'One-way ←'];

// Editor/gameplay objects. These sit above terrain: moving platforms are solid,
// pressure switches are triggers, and gates are solid until a matching switch is held.
const OBJ_PLATFORM = 0, OBJ_SWITCH = 1, OBJ_GATE = 2;
const OBJECT_NAMES = ['Moving Platform', 'Pressure Switch', 'Switch Gate'];

// Skills the player can assign (index = toolbar slot & hotkey-1)
const SKILLS = { BLOCK: 0, BUILD: 1, BASH: 2, MINE: 3, DIG: 4, FLOAT: 5, CLIMB: 6, EXPLODE: 7 };
const SKILL_NAMES = ['Blocker', 'Builder', 'Basher', 'Miner', 'Digger', 'Floater', 'Climber', 'Exploder'];

// Mossling state machine
const STATE = { WALK: 0, FALL: 1, BLOCK: 2, BUILD: 3, BASH: 4, MINE: 5, DIG: 6, CLIMB: 7, DEAD: 8, SAVED: 9, SHRUG: 10 };
const STATE_NAMES = ['Walker', 'Falling', 'Blocker', 'Builder', 'Basher', 'Miner', 'Digger', 'Climber', 'Dead', 'Saved', 'Shrug'];

// Physics tuning — every level's geometry is validated against these in tests/run-tests.js
const PHYS = {
    GRAVITY: 0.18,        // px/frame^2
    MAX_FALL: 4.0,        // terminal velocity, px/frame
    FLOAT_FALL: 1.1,      // terminal velocity with umbrella
    FATAL_FALL: 130,      // px fallen beyond which landing kills (without floater)
    WALK_INTERVAL: 2,     // walkers advance 1px every N frames
    STEP_UP: 3,           // max pixels a walker can step up
    BUILD_BRICKS: 12,     // bricks per builder before shrugging
    BUILD_PERIOD: 30,     // frames per brick
    BASH_PERIOD: 12,      // frames per bash swing
    MINE_PERIOD: 16,      // frames per mine swing
    DIG_PERIOD: 14,       // frames per dig scoop
    EXPLODE_FUSE: 300,    // frames (5s) from assignment to boom
    EXPLODE_RADIUS: 35,
    SIM_STEP: 1000 / 60,  // fixed timestep (ms) — simulation is frame-rate independent
};

const RATE_MIN = 15, RATE_MAX = 120; // spawn-rate clamp (frames between spawns)
