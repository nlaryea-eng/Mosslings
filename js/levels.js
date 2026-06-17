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
            headlineSkill: SKILLS.BUILD,
            theme: 'FOREST',
            tut: 'Mosslings march mindlessly! Use BUILDER [2] to bridge the gap. BLOCKER [1] holds the rest back.',
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
            headlineSkill: SKILLS.DIG,
            theme: 'FOREST',
            tut: 'DIGGER [5] tunnels straight down. Only dig where a floor waits below!',
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
            headlineSkill: SKILLS.FLOAT,
            theme: 'FOREST',
            tut: 'Fatal drop ahead. FLOATER [6] gives a Mossling an umbrella for life. Float them all down!',
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
            headlineSkill: SKILLS.CLIMB,
            theme: 'CAVE',
            tut: 'CLIMBER [7] scales any vertical face and keeps the skill forever. Send them up and over.',
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
            headlineSkill: SKILLS.MINE,
            theme: 'CAVE',
            tut: 'MINER [4] digs a diagonal stairway. Cliff drops are fatal — tunnel down instead. Block the edge first!',
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
            headlineSkill: SKILLS.BUILD,
            theme: 'CAVE',
            tut: 'METAL is indestructible — no bashing or digging. Start FAR back and BUILD a ramp up and over the steel wall. Chain builders!',
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
            headlineSkill: SKILLS.BUILD,
            theme: 'VOLCANO',
            tut: 'Orange is LAVA — instant death. Start FAR back and BUILD a bridge up over the ridge and the lava moat to the far shore.',
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
            name: 'One-Way Out', totalSpawn: 12, reqSaved: 6, time: 220, spawnRate: 60,
            par: { time: 150, skills: 6, saved: 12 },
            headlineSkill: SKILLS.BASH,
            theme: 'CAVE',
            tut: 'TEAL GATES are one-way: walkers pass right but never return — pacing safely instead of marching off the cliff. BASH [3] the pillar to reach the exit.',
            inventory: { [SKILLS.BASH]: 4, [SKILLS.BLOCK]: 3, [SKILLS.BUILD]: 4, [SKILLS.FLOAT]: 2 },
            spawn: { x: 120, y: 210 }, exit: { x: 820, y: 300 },
            commands: [
                { type: T_DIRT, x: 100, y: 300, w: 820, h: 240 },   // main floor x[100..920]; left of x100 is a fatal drop
                { type: T_DIRT, x: 560, y: 150, w: 60, h: 150 },    // bashable pillar between the colony and the exit
                { type: T_ONEWAY_R, x: 160, y: 150, w: 6, h: 150 }, // one-way gate: pass right, walled going left
            ],
        },
    {
            name: 'Bridge Tax', totalSpawn: 20, reqSaved: 12, time: 250, spawnRate: 48,
            par: { time: 165, skills: 10, saved: 20 },
            headlineSkill: SKILLS.BUILD,
            theme: 'FOREST',
            tut: 'The rescue lines get longer here. Chain builders early: the gaps are wider, but every drop between shelves is survivable.',
            inventory: { [SKILLS.BLOCK]: 4, [SKILLS.BUILD]: 18, [SKILLS.FLOAT]: 4 },
            spawn: { x: 80, y: 100 }, exit: { x: 870, y: 320 },
            commands: [
                { type: T_DIRT, x: 0, y: 220, w: 240, h: 320 },
                { type: T_DIRT, x: 370, y: 270, w: 180, h: 270 },
                { type: T_DIRT, x: 670, y: 320, w: 290, h: 220 },
            ],
        },
    {
            name: 'Basher\'s Hollow', totalSpawn: 18, reqSaved: 12, time: 240, spawnRate: 50,
            par: { time: 160, skills: 6, saved: 18 },
            headlineSkill: SKILLS.BASH,
            theme: 'CAVE',
            tut: 'Two soft walls, no shortcuts. BASH [3] through dirt, but keep the floor intact.',
            inventory: { [SKILLS.BASH]: 10, [SKILLS.BLOCK]: 4, [SKILLS.DIG]: 2 },
            spawn: { x: 80, y: 300 }, exit: { x: 860, y: 420 },
            commands: [
                { type: T_DIRT, x: 0, y: 420, w: 960, h: 120 },
                { type: T_DIRT, x: 250, y: 310, w: 70, h: 110 },
                { type: T_DIRT, x: 520, y: 300, w: 75, h: 120 },
            ],
        },
    {
            name: 'Needle Mines', totalSpawn: 18, reqSaved: 10, time: 270, spawnRate: 52,
            par: { time: 185, skills: 7, saved: 18 },
            headlineSkill: SKILLS.MINE,
            theme: 'CAVE',
            tut: 'Mine before the cliff lip. The shelves are too far apart for safe walking, but a clean diagonal reaches each ledge.',
            inventory: { [SKILLS.MINE]: 8, [SKILLS.BLOCK]: 4, [SKILLS.FLOAT]: 4 },
            spawn: { x: 80, y: 50 }, exit: { x: 850, y: 440 },
            commands: [
                { type: T_DIRT, x: 0, y: 160, w: 240, h: 380 },
                { type: T_DIRT, x: 240, y: 300, w: 360, h: 240 },
                { type: T_DIRT, x: 600, y: 440, w: 360, h: 100 },
            ],
        },
    {
            name: 'Athlete Trial', totalSpawn: 14, reqSaved: 10, time: 255, spawnRate: 48,
            par: { time: 175, skills: 20, saved: 14 },
            headlineSkill: SKILLS.CLIMB,
            theme: 'CAVE',
            tut: 'The gold portal admits ATHLETES only. Give a mossling both CLIMBER [7] and FLOATER [6] before the wall.',
            inventory: { [SKILLS.CLIMB]: 16, [SKILLS.FLOAT]: 16, [SKILLS.BLOCK]: 3 },
            spawn: { x: 80, y: 330 }, exit: { x: 850, y: 430, athlete: true },
            commands: [
                { type: T_DIRT, x: 0, y: 430, w: 360, h: 110 },
                { type: T_METAL, x: 360, y: 160, w: 36, h: 270 },
                { type: T_DIRT, x: 420, y: 430, w: 540, h: 110 },
            ],
        },
    {
            name: 'Twin Lava Leap', totalSpawn: 20, reqSaved: 12, time: 310, spawnRate: 50,
            par: { time: 200, skills: 15, saved: 20 },
            headlineSkill: SKILLS.BUILD,
            theme: 'VOLCANO',
            tut: 'Two lava cuts, one colony. Build from the back of each shore so the bridge arc clears the heat.',
            inventory: { [SKILLS.BUILD]: 24, [SKILLS.BLOCK]: 4, [SKILLS.FLOAT]: 4, [SKILLS.EXPLODE]: 2 },
            spawn: { x: 80, y: 220 }, exit: { x: 870, y: 330 },
            commands: [
                { type: T_DIRT, x: 0, y: 320, w: 230, h: 220 },
                { type: T_HAZARD, x: 230, y: 340, w: 130, h: 200 },
                { type: T_DIRT, x: 360, y: 310, w: 200, h: 230 },
                { type: T_HAZARD, x: 560, y: 340, w: 150, h: 200 },
                { type: T_DIRT, x: 710, y: 330, w: 250, h: 210 },
            ],
        },
    {
            name: 'Spiral Quarry', totalSpawn: 20, reqSaved: 12, time: 320, spawnRate: 48,
            par: { time: 215, skills: 10, saved: 20 },
            headlineSkill: SKILLS.DIG,
            theme: 'CAVE',
            tut: 'Dig to drop the route, bash to open the turn. The right shelf is safe only if you shape the quarry first.',
            inventory: { [SKILLS.DIG]: 6, [SKILLS.BASH]: 6, [SKILLS.BLOCK]: 4, [SKILLS.FLOAT]: 4 },
            spawn: { x: 80, y: 60 }, exit: { x: 850, y: 430 },
            commands: [
                { type: T_DIRT, x: 0, y: 180, w: 320, h: 360 },
                { type: T_DIRT, x: 260, y: 300, w: 440, h: 240 },
                { type: T_DIRT, x: 600, y: 430, w: 360, h: 110 },
                { type: T_DIRT, x: 500, y: 180, w: 45, h: 120 },
            ],
        },
    {
            name: 'Gatekeeper', totalSpawn: 16, reqSaved: 11, time: 235, spawnRate: 48,
            par: { time: 165, skills: 3, saved: 16 },
            headlineSkill: SKILLS.BLOCK,
            theme: 'FOREST',
            tut: 'Machine chapter begins. Turn one mossling into a BLOCKER [1] on the switch to hold the gate open.',
            inventory: { [SKILLS.BLOCK]: 4, [SKILLS.BUILD]: 2 },
            spawn: { x: 80, y: 320 }, exit: { x: 850, y: 420 },
            commands: [
                { type: T_DIRT, x: 0, y: 420, w: 960, h: 120 },
            ],
            objects: [
                { type: OBJ_SWITCH, x: 235, y: 417, w: 32, h: 8, target: 0 },
                { type: OBJ_GATE, x: 500, y: 320, w: 16, h: 100, target: 0 },
            ],
        },
    {
            name: 'Platform Ferry', totalSpawn: 14, reqSaved: 8, time: 250, spawnRate: 55,
            par: { time: 170, skills: 4, saved: 14 },
            headlineSkill: SKILLS.BLOCK,
            theme: 'CAVE',
            tut: 'New object: MOVING PLATFORM. Hold the colony back, then let a few ride the ferry across.',
            inventory: { [SKILLS.BLOCK]: 4, [SKILLS.BUILD]: 3, [SKILLS.FLOAT]: 4 },
            spawn: { x: 80, y: 250 }, exit: { x: 840, y: 350 },
            commands: [
                { type: T_DIRT, x: 0, y: 350, w: 220, h: 190 },
                { type: T_DIRT, x: 700, y: 350, w: 260, h: 190 },
            ],
            objects: [
                { type: OBJ_PLATFORM, x: 220, y: 350, w: 120, h: 10, dx: 360, dy: 0, period: 420, phase: 0 },
            ],
        },
    {
            name: 'No Way Back', totalSpawn: 18, reqSaved: 12, time: 255, spawnRate: 50,
            par: { time: 170, skills: 7, saved: 18 },
            headlineSkill: SKILLS.BASH,
            theme: 'CAVE',
            tut: 'One-way membranes can be safety valves. Once the crowd crosses the teal gate, they cannot drift back into the pit.',
            inventory: { [SKILLS.BASH]: 6, [SKILLS.BLOCK]: 4, [SKILLS.BUILD]: 4, [SKILLS.FLOAT]: 3 },
            spawn: { x: 120, y: 250 }, exit: { x: 840, y: 350 },
            commands: [
                { type: T_DIRT, x: 110, y: 350, w: 800, h: 190 },
                { type: T_DIRT, x: 580, y: 240, w: 70, h: 110 },
                { type: T_ONEWAY_R, x: 170, y: 230, w: 6, h: 120 },
                { type: T_HAZARD, x: 0, y: 470, w: 110, h: 70 },
            ],
        },
    {
            name: 'Furnace Ferry', totalSpawn: 16, reqSaved: 10, time: 295, spawnRate: 54,
            par: { time: 200, skills: 4, saved: 16 },
            headlineSkill: SKILLS.BLOCK,
            theme: 'VOLCANO',
            tut: 'The ferry crosses lava. One blocker buys time; release the crowd only when the platform returns.',
            inventory: { [SKILLS.BLOCK]: 4, [SKILLS.FLOAT]: 6, [SKILLS.BUILD]: 3 },
            spawn: { x: 80, y: 230 }, exit: { x: 840, y: 330 },
            commands: [
                { type: T_DIRT, x: 0, y: 330, w: 210, h: 210 },
                { type: T_HAZARD, x: 210, y: 350, w: 510, h: 190 },
                { type: T_DIRT, x: 720, y: 330, w: 240, h: 210 },
            ],
            objects: [
                { type: OBJ_PLATFORM, x: 210, y: 330, w: 120, h: 10, dx: 390, dy: 0, period: 440, phase: 0 },
            ],
        },
    {
            name: 'Switch Lift', totalSpawn: 14, reqSaved: 8, time: 300, spawnRate: 56,
            par: { time: 205, skills: 4, saved: 14 },
            headlineSkill: SKILLS.BLOCK,
            theme: 'FOREST',
            tut: 'Switch plus platform: park a blocker on the switch, then ferry the rest through the gate.',
            inventory: { [SKILLS.BLOCK]: 4, [SKILLS.BUILD]: 3, [SKILLS.FLOAT]: 4 },
            spawn: { x: 80, y: 330 }, exit: { x: 840, y: 430 },
            commands: [
                { type: T_DIRT, x: 0, y: 430, w: 240, h: 110 },
                { type: T_DIRT, x: 680, y: 430, w: 280, h: 110 },
            ],
            objects: [
                { type: OBJ_SWITCH, x: 178, y: 427, w: 32, h: 8, target: 0 },
                { type: OBJ_PLATFORM, x: 250, y: 430, w: 100, h: 10, dx: 330, dy: 0, period: 420, phase: 0 },
                { type: OBJ_GATE, x: 680, y: 330, w: 16, h: 100, target: 0 },
            ],
        },
    {
            name: 'Mossling Master', totalSpawn: 16, reqSaved: 11, time: 280, spawnRate: 45,
            par: { time: 185, skills: 24, saved: 16 },
            headlineSkill: SKILLS.CLIMB,
            theme: 'VOLCANO',
            tut: 'Tower ascent. Only ATHLETES pass: give each Mossling BOTH a CLIMBER [7] to scale the steel tower AND a FLOATER [6] to survive the drop beyond.',
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
            name: 'Moss Gauntlet', totalSpawn: 16, reqSaved: 12, time: 330, spawnRate: 48,
            par: { time: 230, skills: 24, saved: 16 },
            headlineSkill: SKILLS.CLIMB,
            theme: 'VOLCANO',
            tut: 'Final hard-mode mix: make athletes, scale the wall, then hold the switch gate for the whole march.',
            inventory: { [SKILLS.CLIMB]: 18, [SKILLS.FLOAT]: 18, [SKILLS.BLOCK]: 4, [SKILLS.BUILD]: 4, [SKILLS.EXPLODE]: 2 },
            spawn: { x: 80, y: 340 }, exit: { x: 860, y: 440, athlete: true },
            commands: [
                { type: T_DIRT, x: 0, y: 440, w: 300, h: 100 },
                { type: T_METAL, x: 300, y: 230, w: 34, h: 210 },
                { type: T_DIRT, x: 360, y: 440, w: 600, h: 100 },
                { type: T_HAZARD, x: 334, y: 500, w: 26, h: 40 },
            ],
            objects: [
                { type: OBJ_SWITCH, x: 500, y: 437, w: 34, h: 8, target: 0 },
                { type: OBJ_GATE, x: 700, y: 340, w: 16, h: 100, target: 0 },
            ],
        }
];
