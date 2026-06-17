'use strict';
/**
 * MOSSLINGS — live "Beat the Ghost" phantom race for the daily.
 *
 * The stored daily ghost is a recorded action log, not a path. To race it live
 * we re-simulate that log ONCE, headless and muted, snapshotting every step's
 * mossling positions into a trajectory buffer. During the player's own run we
 * draw those positions as translucent phantoms and show a live rescue delta.
 *
 * Determinism contract: the precompute mutates the Game to run the ghost, then
 * the caller reloads the level clean, so the player's actual run is byte-for-byte
 * what it would be with no ghost at all. The phantom is render-only — it never
 * reads or writes the player's simulation. (Guarded by a unit test.)
 */
const GHOST_RACE_MAX_STEPS = 9000; // ~150s @60Hz — caps trajectory memory

/** Snapshot the alive ghost mosslings for one simulation step (positions only). */
function snapshotGhostFrame(game) {
    const poses = [];
    for (const m of game.mosslings) {
        if (m.alive && !m.alive()) continue;
        poses.push({ x: m.x, y: m.y, dir: m.dir });
    }
    return { saved: game.savedCount, poses };
}

/**
 * Re-simulate the ghost's recorded `actions` on `game`, muted, recording a pose
 * frame per simStep. Leaves `game` at the ghost's run-end — the CALLER MUST
 * reload the level afterwards. Returns { steps, length, finalSaved, total }.
 */
function buildGhostTrajectory(game, actions, maxSteps = GHOST_RACE_MAX_STEPS) {
    // Clean, silent start at step 0 (silent = no DOM/overlay churn).
    game.loadLevel(game.dailyChallenge.levelIdx, false, true, { mode: 'daily', daily: game.dailyChallenge });
    const steps = [];
    const ghostActions = actions.slice();
    let ai = 0;
    const realSpawn = game.particles.spawn;
    const wasSilent = audio._silent;
    game.replaying = true;            // mutes assign SFX/particles + onSave side effects
    game.particles.spawn = () => {};
    audio._silent = true;
    // Swallow endLevel so the muted pass records no result and the loop stops.
    const realEnd = game.endLevel;
    game.endLevel = function () { this.state = 'GHOST_DONE'; };
    try {
        while (game.state === 'PLAY' && game.simStep < maxSteps) {
            while (ai < ghostActions.length && ghostActions[ai].step === game.simStep) {
                game.applyAction(ghostActions[ai++]);
            }
            steps[game.simStep] = snapshotGhostFrame(game);
            game.update();
        }
    } finally {
        game.particles.spawn = realSpawn;
        audio._silent = wasSilent;
        delete game.endLevel;         // restore the prototype method
        game.replaying = false;
    }
    return { steps, length: steps.length, finalSaved: game.savedCount, total: game.level ? game.level.totalSpawn : 0 };
}

/**
 * If the current daily has a fingerprint-matched personal ghost, precompute its
 * trajectory and arm the race. No-ops (returns false) for watch mode, a missing
 * or stale ghost, or an undecodable replay — the daily then plays normally.
 */
function armGhostRace(game) {
    game.ghostRace = null;
    if (game.runMode !== 'daily' || !game.dailyChallenge || game.ghostMode) return false;
    if (typeof storage === 'undefined' || typeof deserializeReplay !== 'function') return false;
    const ghost = storage.getDailyGhost(game.dailyChallenge.key);
    if (!ghost || !ghost.replay || !ghost.replay.code) return false;
    const fp = (typeof levelFingerprint === 'function') ? levelFingerprint(game.level) : null;
    if (!fp || ghost.fingerprint !== fp) return false; // stale ghost — no race
    let decoded;
    try { decoded = deserializeReplay(ghost.replay.code); } catch (e) { return false; }
    if (!decoded || !Array.isArray(decoded.actions)) return false;
    const trajectory = buildGhostTrajectory(game, decoded.actions);
    // Reload the level clean so the player races from step 0.
    game.loadDailyChallenge(game.dailyChallenge);
    game.ghostRace = {
        trajectory,
        finalSaved: trajectory.finalSaved,
        total: trajectory.total,
    };
    return true;
}

/** Draw the ghost phantoms + a live rescue delta for the current simStep. */
function drawGhostRace(game, ctx) {
    const race = game.ghostRace;
    if (!race || game.state === 'MENU' || game.runMode !== 'daily') return;
    const traj = race.trajectory;
    const frame = traj.steps[Math.min(game.simStep, traj.length - 1)];
    ctx.save();
    if (frame && frame.poses.length) {
        ctx.globalAlpha = 0.34;
        for (const p of frame.poses) {
            ctx.fillStyle = '#86d9ff';
            ctx.beginPath();
            ctx.ellipse(p.x, p.y - 4, 3.4, 4.4, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = 'rgba(255,255,255,0.6)';
            ctx.fillRect(p.x + p.dir * 2 - 0.5, p.y - 6, 1, 1); // facing nub
        }
    }
    // Live rescue delta banner (render-only).
    const ghostSaved = frame ? frame.saved : race.finalSaved;
    const you = game.savedCount;
    const lead = you - ghostSaved;
    const label = `GHOST RACE   You ${you} · Ghost ${ghostSaved}`;
    ctx.globalAlpha = 0.9;
    ctx.font = '8px "Press Start 2P", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    const w = Math.max(190, ctx.measureText(label).width + 18);
    const x = game.canvas ? game.canvas.width / 2 : 480;
    ctx.fillStyle = 'rgba(8, 14, 18, 0.7)';
    if (ctx.fillRect) ctx.fillRect(x - w / 2, 6, w, 16);
    ctx.fillStyle = lead > 0 ? '#a6f0a0' : (lead < 0 ? '#ffd086' : '#bfe6ff');
    ctx.fillText(label, x, 9);
    ctx.restore();
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        GHOST_RACE_MAX_STEPS,
        snapshotGhostFrame,
        buildGhostTrajectory,
        armGhostRace,
        drawGhostRace,
    };
}
