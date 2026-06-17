'use strict';
/**
 * Result overlay + share-card helpers.
 *
 * This module owns the run summary shape, result markup snippets, share copy,
 * and the deterministic PNG result card. It deliberately replays the existing
 * inline SVG medal rects onto canvas instead of adding a new image pipeline.
 */

const ResultView = (() => {
    const CARD_W = 1200;
    const CARD_H = 630;
    const MEDAL_DEFS = [
        { key: 'saved', label: 'Rescue', icon: 'trophy', cls: 'medal-gold' },
        { key: 'skills', label: 'Efficiency', icon: 'medalSilver', cls: 'medal-silver' },
        { key: 'time', label: 'Speed', icon: 'medalBronze', cls: 'medal-bronze' },
    ];

    const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

    function fmtTime(seconds) {
        const s = Math.max(0, Math.round(seconds));
        return Math.floor(s / 60) + ':' + (s % 60).toString().padStart(2, '0');
    }

    function resultKind(game) {
        if (game.runMode === 'daily' && game.dailyChallenge) return 'daily';
        if (game.levelIdx >= 0) return 'campaign';
        return 'custom';
    }

    function buildRunResult(game, win) {
        const total = game.level.totalSpawn;
        const pct = Math.round(game.savedCount / total * 100);
        const timeSeconds = (game.level.time * 60 - game.time) / 60;
        const medals = win && game.level.par
            ? computeMedals(game.level.par, {
                saved: game.savedCount,
                skills: game.skillsUsed,
                time: timeSeconds,
            })
            : { saved: false, skills: false, time: false };
        const medalCount = MEDAL_DEFS.filter(m => medals[m.key]).length;
        const par = game.level.par || null;
        const misses = [];
        if (win && par) {
            if (!medals.saved) misses.push(`Rescue missed by ${par.saved - game.savedCount}`);
            if (!medals.skills) misses.push(`Efficiency missed by ${game.skillsUsed - par.skills} skill${game.skillsUsed - par.skills === 1 ? '' : 's'}`);
            if (!medals.time) misses.push(`Speed missed by ${Math.max(1, Math.ceil(timeSeconds - par.time))}s`);
        }
        const kind = resultKind(game);
        return {
            name: game.level.name,
            kind,
            isCampaign: kind === 'campaign',
            isDaily: kind === 'daily',
            isCustom: kind === 'custom',
            dailyKey: kind === 'daily' ? game.dailyChallenge.key : null,
            campaignNum: game.levelIdx >= 0 ? game.levelIdx + 1 : null,
            saved: game.savedCount,
            total,
            pct,
            timeSeconds,
            timeStr: fmtTime(timeSeconds),
            skills: game.skillsUsed,
            medals,
            medalCount,
            medalStr: MEDAL_DEFS.filter(m => medals[m.key]).map(m => m.label).join('+'),
            misses,
            win,
            level: game.level,
            url: null,
            dailyBest: null,
            dailyBestIsNew: false,
        };
    }

    function resultLabel(r) {
        if (r.isDaily) return `Daily ${r.dailyKey} - Level ${r.campaignNum} "${r.name}"`;
        if (r.isCampaign) return `Level ${r.campaignNum} "${r.name}"`;
        return `"${r.name}"`;
    }

    function challengeCopy(r) {
        if (r.isDaily) return r.win ? 'Today\'s daily. Can you beat my run?' : 'Today\'s daily beat me. Can you do better?';
        if (r.win) return r.medalCount >= 3 ? 'Swept all 3 medals. Can you?' : 'Think you can beat my run?';
        return `So close: ${r.saved}/${r.total} saved. Can you do better?`;
    }

    function buildShareText(r, { url = null, levelCode = null } = {}) {
        const medalTail = r.medalStr ? ` medals: ${r.medalStr}` : '';
        const verb = r.win ? 'rescued' : 'reached';
        let text = `MOSSLINGS - ${resultLabel(r)}: ${verb} ${r.saved}/${r.total} (${r.pct}%) in ${r.timeStr}, ${r.skills} skills${medalTail}. ${challengeCopy(r)}`;
        if (url) text += `\n${url}`;
        else if (levelCode) text += `\nLevel code: ${levelCode}`;
        return text;
    }

    function statsHtml(r) {
        const stat = (label, value) => `<div class="stat"><b>${value}</b><span>${label}</span></div>`;
        return stat('Saved', `${r.saved}/${r.total}`) +
            stat('Rescued', `${r.pct}%`) +
            stat('Time', r.timeStr) +
            stat('Skills', r.skills);
    }

    function medalsHtml(r, { showLegend = false } = {}) {
        let html = '';
        if (r.win && r.medals && r.medalCount) {
            html += '<div class="msg-medals">';
            for (const m of MEDAL_DEFS) {
                if (!r.medals[m.key]) continue;
                html += `
                    <div class="msg-medal-slot">
                        <span class="medal ${m.cls}">${UI_ICONS[m.icon]}</span>
                        <span class="msg-medal-label">${m.label}</span>
                    </div>`;
            }
            html += '</div>';
        }
        if (r.misses && r.misses.length) {
            html += '<div class="msg-misses">' +
                r.misses.map(m => `<span>${m}</span>`).join('') + '</div>';
        }
        if (showLegend) {
            html += '<div class="msg-medal-legend" aria-label="Medal guide">' +
                `<span>${UI_ICONS.trophy}<b>Rescue</b> all saved</span>` +
                `<span>${UI_ICONS.medalSilver}<b>Efficiency</b> low skills</span>` +
                `<span>${UI_ICONS.medalBronze}<b>Speed</b> fast clear</span>` +
                '</div>';
        }
        return html;
    }

    function dailyBestHtml(r) {
        if (!r.isDaily || !r.dailyBest) return '';
        const best = r.dailyBest;
        return `<div class="msg-daily">${r.dailyKey} daily · ${r.dailyBestIsNew ? 'New local best' : 'Local best'}: ${best.pct}% in ${fmtTime(best.timeSeconds)}, ${best.skills} skills</div>`;
    }

    // Controlled parser for our own inline SVG icon strings. The glyph source is
    // trusted code, not user input, so a tiny rect-only parser is the least
    // fragile way to reuse the exact pixel art on canvas and in DOM.
    function parseSvgRects(svg) {
        const vb = /viewBox="([^"]+)"/.exec(svg || '');
        const parts = vb ? vb[1].trim().split(/\s+/).map(Number) : [0, 0, 24, 24];
        const rects = [];
        const re = /<rect\b([^>]*)>/g;
        let m;
        while ((m = re.exec(svg || ''))) {
            const attrs = {};
            m[1].replace(/([a-zA-Z:-]+)="([^"]*)"/g, (_, k, v) => { attrs[k] = v; return ''; });
            rects.push({
                x: Number(attrs.x || 0),
                y: Number(attrs.y || 0),
                w: Number(attrs.width || 0),
                h: Number(attrs.height || 0),
                fill: attrs.fill || '#ffffff',
            });
        }
        return { viewBox: { x: parts[0], y: parts[1], w: parts[2], h: parts[3] }, rects };
    }

    function drawIcon(ctx, svg, x, y, size, alpha = 1) {
        const parsed = parseSvgRects(svg);
        const scale = size / parsed.viewBox.w;
        const oldAlpha = typeof ctx.globalAlpha === 'number' ? ctx.globalAlpha : 1;
        ctx.globalAlpha = oldAlpha * alpha;
        for (const rct of parsed.rects) {
            ctx.fillStyle = rct.fill === 'currentColor' ? '#dfeecf' : rct.fill;
            ctx.fillRect(
                x + (rct.x - parsed.viewBox.x) * scale,
                y + (rct.y - parsed.viewBox.y) * scale,
                Math.max(1, rct.w * scale),
                Math.max(1, rct.h * scale)
            );
        }
        ctx.globalAlpha = oldAlpha;
    }

    function text(ctx, value, x, y, size, color, align = 'left', weight = '400') {
        ctx.fillStyle = color;
        ctx.textAlign = align;
        ctx.textBaseline = 'top';
        ctx.font = `${weight} ${size}px "Moss Pixel", "Courier New", monospace`;
        ctx.fillText(value, x, y);
    }

    function fitText(ctx, value, x, y, maxW, size, minSize, color, align = 'left', weight = '400') {
        let s = size;
        ctx.font = `${weight} ${s}px "Moss Pixel", "Courier New", monospace`;
        while (s > minSize && ctx.measureText(value).width > maxW) {
            s -= 2;
            ctx.font = `${weight} ${s}px "Moss Pixel", "Courier New", monospace`;
        }
        text(ctx, value, x, y, s, color, align, weight);
        return s;
    }

    function chip(ctx, x, y, w, h, label, value) {
        ctx.fillStyle = '#121b14';
        ctx.fillRect(x, y, w, h);
        ctx.strokeStyle = '#2c3a30';
        ctx.lineWidth = 4;
        ctx.strokeRect(x, y, w, h);
        text(ctx, label.toUpperCase(), x + w / 2, y + 15, 22, '#8ba88b', 'center', '700');
        fitText(ctx, value, x + w / 2, y + 48, w - 20, 38, 24, '#e8f0e8', 'center', '900');
    }

    function drawResultCard(ctx, r) {
        ctx.clearRect(0, 0, CARD_W, CARD_H);
        ctx.fillStyle = '#07090e';
        ctx.fillRect(0, 0, CARD_W, CARD_H);
        if (ctx.createRadialGradient) {
            const g = ctx.createRadialGradient(560, 240, 40, 560, 240, 720);
            g.addColorStop(0, '#1c2b1d');
            g.addColorStop(0.62, '#09100b');
            g.addColorStop(1, '#05070b');
            ctx.fillStyle = g;
            ctx.fillRect(0, 0, CARD_W, CARD_H);
        }

        // Deterministic background ticks: atmosphere without asset files.
        const seed = (r.dailyKey || r.name || 'mosslings').split('').reduce((a, c) => (Math.imul(a, 33) ^ c.charCodeAt(0)) >>> 0, 5381);
        for (let i = 0; i < 90; i++) {
            const px = (Math.imul(seed + i * 97, 2654435761) >>> 0) % CARD_W;
            const py = (Math.imul(seed + i * 53, 1597334677) >>> 0) % CARD_H;
            ctx.fillStyle = i % 3 ? 'rgba(124,179,66,0.10)' : 'rgba(77,208,225,0.12)';
            ctx.fillRect(px, py, i % 4 === 0 ? 4 : 2, 2);
        }

        ctx.fillStyle = 'rgba(10, 17, 12, 0.88)';
        ctx.fillRect(54, 48, 1092, 534);
        ctx.strokeStyle = '#2c3a30';
        ctx.lineWidth = 6;
        ctx.strokeRect(54, 48, 1092, 534);

        text(ctx, 'MOSSLINGS', 90, 84, 54, '#9ccc65', 'left', '900');
        text(ctx, r.isDaily ? `DAILY ${r.dailyKey}` : (r.isCampaign ? `CAMPAIGN LEVEL ${r.campaignNum}` : 'CUSTOM LEVEL'), 90, 150, 24, '#ffeb3b', 'left', '700');
        fitText(ctx, r.name, 90, 186, 650, 42, 24, '#e8f0e8', 'left', '900');

        const outcome = r.win ? (r.saved === r.total ? 'PERFECT CLEAR' : 'LEVEL CLEAR') : 'FAILED RUN';
        text(ctx, outcome, 920, 88, 30, r.win ? '#9ccc65' : '#ef5350', 'center', '900');
        fitText(ctx, `${r.pct}%`, 920, 130, 300, 92, 60, r.win ? '#d5f59a' : '#ff8a80', 'center', '900');
        text(ctx, `${r.saved}/${r.total} SAVED`, 920, 226, 28, '#b9ccb4', 'center', '700');

        const y = 310;
        chip(ctx, 92, y, 220, 104, 'Saved', `${r.saved}/${r.total}`);
        chip(ctx, 336, y, 220, 104, 'Rescued', `${r.pct}%`);
        chip(ctx, 580, y, 220, 104, 'Time', r.timeStr);
        chip(ctx, 824, y, 220, 104, 'Skills', `${r.skills}`);

        const medalY = 444;
        for (let i = 0; i < MEDAL_DEFS.length; i++) {
            const m = MEDAL_DEFS[i];
            const x = 280 + i * 220;
            const earned = !!(r.medals && r.medals[m.key]);
            ctx.fillStyle = earned ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.025)';
            ctx.fillRect(x, medalY, 174, 68);
            ctx.strokeStyle = earned ? 'rgba(124,179,66,0.32)' : 'rgba(255,255,255,0.10)';
            ctx.lineWidth = 3;
            ctx.strokeRect(x, medalY, 174, 68);
            drawIcon(ctx, UI_ICONS[m.icon], x + 14, medalY + 10, 48, earned ? 1 : 0.24);
            text(ctx, m.label.toUpperCase(), x + 76, medalY + 13, 19, earned ? '#e8f0e8' : '#5f6c60', 'left', '700');
            text(ctx, earned ? 'EARNED' : 'MISS', x + 76, medalY + 39, 17, earned ? '#ffeb3b' : '#7e947e', 'left', '700');
        }

        const footer = challengeCopy(r);
        fitText(ctx, footer, 600, 535, 920, 26, 18, '#a8c5a0', 'center', '700');
        if (r.url) fitText(ctx, r.url.replace(/^https?:\/\//, ''), 600, 562, 900, 18, 14, '#6f8f72', 'center', '400');
    }

    function createResultCardCanvas(r) {
        const canvas = document.createElement('canvas');
        canvas.width = CARD_W;
        canvas.height = CARD_H;
        drawResultCard(canvas.getContext('2d'), r);
        return canvas;
    }

    function drawResultCardPreview(canvas, r) {
        // Defend against fake/non-canvas stubs (e.g. a test double or a detached
        // element): require a real 2D context before drawing, and never assume
        // classList exists. Returns null when it cannot draw, the canvas when it can.
        if (!canvas || typeof canvas.getContext !== 'function') return null;
        const ctx = canvas.getContext('2d');
        if (!ctx || typeof ctx.fillRect !== 'function') return null;
        canvas.width = CARD_W;
        canvas.height = CARD_H;
        drawResultCard(ctx, r);
        if (canvas.classList && typeof canvas.classList.remove === 'function') {
            canvas.classList.remove('hidden');
        }
        return canvas;
    }

    async function createPngBlob(r) {
        if (document.fonts && document.fonts.ready) {
            try { await document.fonts.ready; } catch (e) {}
        }
        const canvas = createResultCardCanvas(r);
        return new Promise((resolve, reject) => {
            canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Result card export failed')), 'image/png');
        });
    }

    function cardFilename(r) {
        const slug = (r.isDaily ? `daily-${r.dailyKey}` : (r.isCampaign ? `level-${r.campaignNum}` : r.name))
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-|-$/g, '')
            .slice(0, 48) || 'result';
        return `mosslings-${slug}.png`;
    }

    return {
        CARD_W,
        CARD_H,
        MEDAL_DEFS,
        fmtTime,
        buildRunResult,
        resultLabel,
        challengeCopy,
        buildShareText,
        statsHtml,
        medalsHtml,
        dailyBestHtml,
        parseSvgRects,
        drawIcon,
        drawResultCard,
        createResultCardCanvas,
        drawResultCardPreview,
        createPngBlob,
        cardFilename,
    };
})();

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { ResultView };
}
