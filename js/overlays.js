'use strict';
/**
 * MOSSLINGS — render-only readability overlays, extracted from game.js so the
 * engine file stops absorbing presentation code (the first module boundary in
 * the planned game.js/ui.js de-monolithing).
 *
 * The hard rule mirrors the rest of the presentation layer: everything here
 * READS terrain/mossling state and draws to the canvas, but never MUTATES
 * simulation state. No `Math.random` or wall-clock feeds back into the sim, so
 * deterministic 60Hz replay/rewind is untouched. game.js calls these through
 * thin `Game.dangerProbe` / `Game.drawDangerHints` wrappers, which the tests use.
 */

/**
 * Does a walker face lava, a fatal cliff, or a hard turn just ahead? Returns a
 * hint descriptor (or null). For cliffs/drops it also reports the platform-edge
 * point so the overlay can plant a marker on the ground, not just float a pip.
 */
function probeDangerFor(game, m) {
    if (!m || !m.alive() || (m.state !== STATE.WALK && m.state !== STATE.SHRUG)) return null;
    const terrain = game.terrain;
    const d = m.dir || 1;
    const footY = Math.floor(m.y + 1);
    const isFloor = (t) => t === T_DIRT || t === T_METAL || t === T_BRIDGE;
    const isWall = (t) => t === T_DIRT || t === T_METAL || t === T_BRIDGE || (t === T_ONEWAY_R && d < 0) || (t === T_ONEWAY_L && d > 0);
    for (let ahead = 6; ahead <= 38; ahead += 4) {
        const x = Math.floor(m.x + d * ahead);
        const body = terrain.get(x, Math.floor(m.y - 5));
        const toe = terrain.get(x, footY);
        if (toe === T_HAZARD || body === T_HAZARD) return { kind: 'lava', x, y: m.y - 20, severity: 1 };
        if (isWall(body)) return { kind: 'wall', x, y: m.y - 24, severity: 0.45 };
        if (!isFloor(toe)) {
            let drop = 0;
            while (drop <= PHYS.FATAL_FALL + 36 && !isFloor(terrain.get(x, footY + drop))) drop++;
            // The platform lip sits just behind the first gap column we found.
            const edgeX = Math.floor(m.x + d * Math.max(2, ahead - 3));
            if (drop > PHYS.FATAL_FALL && !m.hasFloater) return { kind: 'cliff', x, y: m.y - 24, severity: 1, edgeX, groundY: footY };
            if (drop > 52 && !m.hasFloater) return { kind: 'drop', x, y: m.y - 24, severity: 0.55, edgeX, groundY: footY };
        }
    }
    return null;
}

/** Recompute the (relatively expensive) hint list for the current colony. */
function computeDangerHints(game) {
    const hints = [];
    for (const m of game.mosslings) {
        if (!m.alive()) continue;
        const h = probeDangerFor(game, m);
        if (h) hints.push({ m, ...h });
        if (hints.length >= 8) break; // keep the overlay helpful, not noisy
    }
    return hints;
}

/**
 * Draw the danger overlay. The terrain scan in probeDangerFor() is the most
 * expensive new per-frame work, so we THROTTLE it: recompute the hint list only
 * a few times a second (or when the colony size changes), and keep animating the
 * markers (pulse) every frame from the cached list. Markers are anchored to
 * fixed terrain points (a cliff edge / lava tile), so a few frames of staleness
 * is invisible. The cache lives on a render-only field; it touches no sim state.
 */
function drawDangerOverlay(game, ctx) {
    if (game.state !== 'PLAY' && game.state !== 'PAUSE') return;
    if (!game.mosslings.length) return;
    const cache = game._dangerCache;
    if (!cache || game.tick - cache.tick >= 6 || cache.count !== game.mosslings.length) {
        game._dangerCache = { tick: game.tick, count: game.mosslings.length, hints: computeDangerHints(game) };
    }
    const hints = game._dangerCache.hints;
    if (!hints.length) return;

    const t = game.tick * 0.13;
    ctx.save();
    ctx.font = 'bold 11px monospace';
    ctx.textAlign = 'center';
    for (const h of hints) {
        if (!h.m.alive()) continue;
        const danger = h.kind !== 'wall';
        const pulse = 0.72 + 0.22 * Math.sin(t + h.m.id * 0.7);
        const floor = h.kind === 'wall' ? 0.38 : 0.58;
        const alpha = Math.max(floor, Math.min(0.95, pulse * h.severity));
        const x = h.x, y = h.y;

        // Ground-edge marker first (cliffs/drops): a chunky caution wedge planted
        // on the platform lip so the warning is obvious at phone size, not just a
        // faint floating pip. This is the readability fix flagged in review.
        if ((h.kind === 'cliff' || h.kind === 'drop') && h.edgeX != null) {
            const gx = h.edgeX, gy = h.groundY;
            ctx.globalAlpha = Math.max(0.6, alpha);
            ctx.fillStyle = h.kind === 'cliff' ? '#ff7043' : '#ffb300';
            ctx.strokeStyle = 'rgba(10,8,6,0.9)';
            ctx.lineWidth = 1;
            // a downward chevron spilling over the edge into the gap
            const bob = Math.sin(t * 1.2) * 1.5;
            ctx.beginPath();
            ctx.moveTo(gx - 6, gy - 5 + bob);
            ctx.lineTo(gx + 6, gy - 5 + bob);
            ctx.lineTo(gx, gy + 4 + bob);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
            // a short caution post on the solid ground
            ctx.fillRect(gx - 1, gy - 12, 2, 6);
        }

        ctx.globalAlpha = alpha;
        ctx.fillStyle = danger ? '#ffeb3b' : '#80deea';
        ctx.strokeStyle = danger ? 'rgba(255,112,67,0.9)' : 'rgba(128,222,234,0.8)';
        ctx.lineWidth = 1.5;
        ctx.shadowColor = danger ? 'rgba(255,235,59,0.65)' : 'rgba(128,222,234,0.65)';
        ctx.shadowBlur = 5;
        ctx.beginPath();
        ctx.arc(x, y, 9 + Math.sin(t) * 1.5, 0, Math.PI * 2);
        ctx.stroke();
        ctx.shadowBlur = 0;
        if (h.kind === 'wall') {
            ctx.fillRect(x - 5, y - 4, 10, 2);
            ctx.fillRect(x - 5, y + 1, 10, 2);
        } else if (h.kind === 'lava') {
            ctx.beginPath();
            ctx.moveTo(x, y - 6); ctx.lineTo(x - 6, y + 5); ctx.lineTo(x + 6, y + 5); ctx.closePath();
            ctx.fill();
            ctx.fillStyle = '#ff7043'; ctx.fillRect(x - 2, y - 1, 4, 4);
        } else {
            ctx.fillText('!', x, y + 4);
        }
    }
    ctx.restore();
}

// Exposed for the Node test harness (browser uses the globals directly).
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { probeDangerFor, drawDangerOverlay, computeDangerHints };
}
