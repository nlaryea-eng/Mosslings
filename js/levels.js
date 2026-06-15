'use strict';
/**
 * MOSSLINGS — campaign levels.
 *
 * Geometry rules (enforced by tests/run-tests.js):
 *  - every spawn drop onto the first floor is < PHYS.FATAL_FALL
 *  - spawn and exit sit in open air, exit on a walkable surface
 *  - drops the player is REQUIRED to take are survivable; drops that
 *    punish mistakes are deliberately lethal
 *
 * The original level set had several unwinnable layouts (level 1's spawn
 * drop alone exceeded the fatal-fall limit, killing every mossling on
 * arrival). All eight maps below were re-derived from the movement math:
 * builders gain 1px height per 5px run with 12 bricks per builder, miners
 * descend at 1:1 slope, climbers scale any solid face.
 */
const LEVELS = [
    {
        name: 'The First March', totalSpawn: 10, reqSaved: 4, time: 150, spawnRate: 80,
        par: { time: 90, skills: 3, saved: 10 },
        theme: 'FOREST',
        tut: 'Mosslings march mindlessly! Select BUILDER [2] and click one near the gap to bridge it. BLOCKERS [1] hold the others back.',
        inventory: { [SKILLS.BLOCK]: 2, [SKILLS.BUILD]: 10 },
        spawn: { x: 100, y: 90 }, exit: { x: 850, y: 260 },
        commands: [
            { type: T_DIRT, x: 0, y: 200, w: 450, h: 25 },    // start plateau (drop 110 — safe)
            { type: T_DIRT, x: 480, y: 260, w: 480, h: 80 },  // exit plateau; the 30px gap is bottomless
        ],
    },
    {
        name: 'Going Down', totalSpawn: 15, reqSaved: 8, time: 200, spawnRate: 60,
        par: { time: 120, skills: 5, saved: 15 },
        theme: 'FOREST',
        tut: 'DIGGER [5] tunnels straight down. Look before you dig — only dig where a floor waits below!',
        inventory: { [SKILLS.DIG]: 8, [SKILLS.BLOCK]: 3, [SKILLS.BUILD]: 3, [SKILLS.FLOAT]: 2 },
        spawn: { x: 150, y: 40 }, exit: { x: 700, y: 480 },
        commands: [
            { type: T_DIRT, x: 0, y: 150, w: 960, h: 20 },    // top shelf
            { type: T_DIRT, x: 300, y: 260, w: 660, h: 20 },  // each safe dig drops ~90px
            { type: T_DIRT, x: 0, y: 370, w: 660, h: 20 },
            { type: T_DIRT, x: 0, y: 480, w: 960, h: 60 },    // floor with the exit
        ],
    },
    {
        name: 'Sky High', totalSpawn: 10, reqSaved: 6, time: 150, spawnRate: 70,
        par: { time: 80, skills: 10, saved: 10 },
        theme: 'FOREST',
        tut: 'That drop is LETHAL. FLOATER [6] gives a Mossling an umbrella — for life. Float everyone down!',
        inventory: { [SKILLS.FLOAT]: 12, [SKILLS.BLOCK]: 2 },
        spawn: { x: 100, y: 40 }, exit: { x: 820, y: 450 },
        commands: [
            { type: T_DIRT, x: 50, y: 100, w: 200, h: 20 },   // sky perch
            { type: T_DIRT, x: 0, y: 450, w: 960, h: 90 },    // ground, 350px below — fatal unaided
        ],
    },
    {
        name: 'The Wall', totalSpawn: 12, reqSaved: 6, time: 180, spawnRate: 60,
        par: { time: 100, skills: 4, saved: 12 },
        theme: 'CAVE',
        tut: 'CLIMBER [7] scales any vertical face — and keeps the skill forever. Send them up and over.',
        inventory: { [SKILLS.CLIMB]: 10, [SKILLS.BLOCK]: 2, [SKILLS.FLOAT]: 2 },
        spawn: { x: 100, y: 330 }, exit: { x: 850, y: 200 },
        commands: [
            { type: T_DIRT, x: 0, y: 400, w: 400, h: 140 },   // valley floor (drop 70 — safe)
            { type: T_DIRT, x: 400, y: 200, w: 560, h: 340 }, // the wall: 200px sheer face
        ],
    },
    {
        name: 'Diagonal Dig', totalSpawn: 20, reqSaved: 10, time: 240, spawnRate: 50,
        par: { time: 180, skills: 8, saved: 20 },
        theme: 'CAVE',
        tut: 'MINER [4] digs a diagonal stairway. Each cliff drop is fatal — tunnel down instead. Block the edge first!',
        inventory: { [SKILLS.MINE]: 5, [SKILLS.BLOCK]: 3, [SKILLS.FLOAT]: 3, [SKILLS.BASH]: 2 },
        spawn: { x: 100, y: 50 }, exit: { x: 850, y: 470 },
        commands: [
            { type: T_DIRT, x: 0, y: 150, w: 250, h: 390 },   // three giant steps, each 160px down
            { type: T_DIRT, x: 250, y: 310, w: 300, h: 230 }, // (lethal to walk off, safe to mine into)
            { type: T_DIRT, x: 550, y: 470, w: 410, h: 70 },
        ],
    },
    {
        name: 'Hard Rock', totalSpawn: 15, reqSaved: 8, time: 240, spawnRate: 60,
        par: { time: 180, skills: 10, saved: 15 },
        theme: 'CAVE',
        tut: 'METAL is indestructible. Build a long ramp over the steel wall — start FAR back — then dig to the hidden grotto.',
        inventory: { [SKILLS.BUILD]: 12, [SKILLS.DIG]: 4, [SKILLS.BLOCK]: 3, [SKILLS.FLOAT]: 2 },
        spawn: { x: 100, y: 50 }, exit: { x: 830, y: 500 },
        commands: [
            { type: T_DIRT, x: 0, y: 150, w: 960, h: 390 },   // solid earth
            { type: T_AIR, x: 760, y: 380, w: 140, h: 120 },  // hidden grotto holding the exit
            { type: T_METAL, x: 50, y: 300, w: 650, h: 25 },  // slab blocks digging on the left
            { type: T_METAL, x: 585, y: 100, w: 30, h: 200 }, // steel wall, 50px above the surface
        ],
    },
    {
        name: 'Lava Leap', totalSpawn: 20, reqSaved: 10, time: 300, spawnRate: 55,
        par: { time: 200, skills: 12, saved: 20 },
        theme: 'VOLCANO',
        tut: 'Orange is LAVA — instant death. Bridge to the pillar, BASH [3] through it, bridge again. EXPLODER [8] can free a blocker.',
        inventory: { [SKILLS.BUILD]: 9, [SKILLS.BASH]: 3, [SKILLS.BLOCK]: 3, [SKILLS.FLOAT]: 3, [SKILLS.EXPLODE]: 2 },
        spawn: { x: 100, y: 150 }, exit: { x: 850, y: 250 },
        commands: [
            { type: T_DIRT, x: 0, y: 250, w: 250, h: 290 },   // west cliff (drop 100 — safe)
            { type: T_DIRT, x: 755, y: 250, w: 205, h: 290 }, // east cliff with the exit
            { type: T_DIRT, x: 460, y: 200, w: 60, h: 340 },  // mid pillar — bash through it
            { type: T_HAZARD, x: 250, y: 520, w: 505, h: 20 },// the lava lake
        ],
    },
    {
        name: 'Mossling Master', totalSpawn: 25, reqSaved: 12, time: 360, spawnRate: 50,
        par: { time: 240, skills: 15, saved: 25 },
        theme: 'VOLCANO',
        tut: 'The final ascent: block the ledge, bridge to the steel tower, then send ATHLETES — Climber AND Floater on the same Mossling!',
        inventory: {
            [SKILLS.BLOCK]: 3, [SKILLS.BUILD]: 5, [SKILLS.BASH]: 2, [SKILLS.MINE]: 2,
            [SKILLS.DIG]: 2, [SKILLS.FLOAT]: 16, [SKILLS.CLIMB]: 16, [SKILLS.EXPLODE]: 3,
        },
        spawn: { x: 80, y: 40 }, exit: { x: 870, y: 460, athlete: true },
        commands: [
            { type: T_DIRT, x: 0, y: 150, w: 300, h: 30 },    // spawn ledge (drop to mid is 80 — safe)
            { type: T_DIRT, x: 300, y: 230, w: 320, h: 30 },  // mid shelf above the lava
            { type: T_METAL, x: 700, y: 100, w: 30, h: 440 }, // steel tower: climb 130px, fall 360 (floater!)
            { type: T_HAZARD, x: 260, y: 520, w: 440, h: 20 },// lava pit under everything
            { type: T_DIRT, x: 730, y: 460, w: 230, h: 80 },  // sanctuary floor with the exit
        ],
    },
];
