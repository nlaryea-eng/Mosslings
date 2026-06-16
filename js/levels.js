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
        name: 'The First March', totalSpawn: 8, reqSaved: 4, time: 90, spawnRate: 55,
        par: { time: 55, skills: 3, saved: 8 },
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
        name: 'Going Down', totalSpawn: 12, reqSaved: 7, time: 150, spawnRate: 50,
        par: { time: 100, skills: 6, saved: 12 },
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
        name: 'Sky High', totalSpawn: 10, reqSaved: 6, time: 110, spawnRate: 55,
        par: { time: 70, skills: 10, saved: 10 },
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
        name: 'Diagonal Dig', totalSpawn: 16, reqSaved: 9, time: 200, spawnRate: 50,
        par: { time: 110, skills: 5, saved: 16 },
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
        name: 'Hard Rock', totalSpawn: 15, reqSaved: 8, time: 200, spawnRate: 55,
        par: { time: 110, skills: 6, saved: 15 },
        theme: 'CAVE',
        tut: 'METAL is indestructible — you cannot bash or dig it. Start FAR back and BUILD a long ramp (chain builders!) up and over the steel wall to the exit.',
        inventory: { [SKILLS.BUILD]: 14, [SKILLS.BLOCK]: 3, [SKILLS.FLOAT]: 2 },
        spawn: { x: 100, y: 50 }, exit: { x: 880, y: 150 },
        commands: [
            { type: T_DIRT, x: 0, y: 150, w: 960, h: 390 },   // solid earth, exit on the surface (drop 100 — safe)
            { type: T_METAL, x: 585, y: 120, w: 30, h: 180 }, // steel wall, 30px above the surface — must be ramped over
        ],
    },
    {
        name: 'Lava Leap', totalSpawn: 18, reqSaved: 10, time: 260, spawnRate: 55,
        par: { time: 120, skills: 8, saved: 18 },
        theme: 'VOLCANO',
        tut: 'Orange is LAVA — instant death. The colony paces safely against the rock ridge. Start FAR back and BUILD an arcing bridge up over the ridge and the lava moat to the far shore.',
        inventory: { [SKILLS.BUILD]: 12, [SKILLS.BASH]: 3, [SKILLS.BLOCK]: 3, [SKILLS.FLOAT]: 3, [SKILLS.EXPLODE]: 2 },
        spawn: { x: 100, y: 150 }, exit: { x: 870, y: 250 },
        commands: [
            { type: T_DIRT, x: 0, y: 250, w: 500, h: 290 },   // west shore — bounded by the ridge, so the colony paces safely
            { type: T_DIRT, x: 500, y: 190, w: 40, h: 350 },  // rock ridge, 60px proud of the shore — bridge arcs over it
            { type: T_HAZARD, x: 540, y: 260, w: 120, h: 280 },// lava moat, spanned by the bridge's arc
            { type: T_DIRT, x: 660, y: 250, w: 300, h: 290 }, // far shore with the exit (bridge overshoots, drops ~80px — safe)
        ],
    },
    {
        name: 'Mossling Master', totalSpawn: 16, reqSaved: 10, time: 240, spawnRate: 45,
        par: { time: 160, skills: 24, saved: 16 },
        theme: 'VOLCANO',
        tut: 'The final ascent. The colony paces at the foot of a sheer steel tower. Only true ATHLETES pass the golden gate: give each Mossling BOTH a CLIMBER [7] (to scale the tower) AND a FLOATER [6] (to survive the long drop beyond).',
        inventory: {
            [SKILLS.CLIMB]: 16, [SKILLS.FLOAT]: 16, [SKILLS.BLOCK]: 3, [SKILLS.BUILD]: 5, [SKILLS.EXPLODE]: 3,
        },
        spawn: { x: 80, y: 360 }, exit: { x: 870, y: 450, athlete: true },
        commands: [
            { type: T_DIRT, x: 0, y: 450, w: 700, h: 90 },    // west ground (spawn drop 90 — safe); colony paces against the tower
            { type: T_METAL, x: 700, y: 110, w: 40, h: 340 }, // sheer steel tower, top y110 — climb 340px, then a 340px drop beyond (floater!)
            { type: T_DIRT, x: 740, y: 450, w: 220, h: 90 },  // far sanctuary with the golden athlete gate
        ],
    },
    {
        name: 'One-Way Out', totalSpawn: 12, reqSaved: 6, time: 220, spawnRate: 60,
        par: { time: 150, skills: 6, saved: 12 },
        theme: 'CAVE',
        tut: 'TEAL GATES are one-way: walkers pass rightward but can never return — so they pace safely instead of marching off the left cliff. BASH [3] the pillar to reach the exit.',
        inventory: { [SKILLS.BASH]: 4, [SKILLS.BLOCK]: 3, [SKILLS.BUILD]: 4, [SKILLS.FLOAT]: 2 },
        spawn: { x: 120, y: 210 }, exit: { x: 820, y: 300 },
        commands: [
            { type: T_DIRT, x: 100, y: 300, w: 820, h: 240 },   // main floor x[100..920]; left of x100 is a fatal drop
            { type: T_DIRT, x: 560, y: 150, w: 60, h: 150 },    // bashable pillar between the colony and the exit
            { type: T_ONEWAY_R, x: 160, y: 150, w: 6, h: 150 }, // one-way gate: pass right, walled going left
        ],
    },
];
