'use strict';
/**
 * MOSSLINGS — tiny hand-drawn pixel glyphs.
 * Inline SVG keeps every platform on the same 16x16 art instead of relying on
 * emoji fonts. Keep shapes coarse: these are tuned for phone toolbar size.
 */
const pixelSvg = (body, cls = '') =>
    `<svg class="pixel-icon ${cls}" viewBox="0 0 16 16" aria-hidden="true" focusable="false" shape-rendering="crispEdges">${body}</svg>`;
// Roomier 24x24 grid for art that needs internal detail (skill badges, medals).
const pixelSvg24 = (body, cls = '') =>
    `<svg class="pixel-icon ${cls}" viewBox="0 0 24 24" aria-hidden="true" focusable="false" shape-rendering="crispEdges">${body}</svg>`;

const r = (x, y, w, h, fill = 'currentColor') =>
    `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}"/>`;

const UI_ICONS = {
    play: pixelSvg(r(5, 3, 2, 10) + r(7, 4, 2, 8) + r(9, 5, 2, 6) + r(11, 6, 2, 4), 'ui-icon'),
    pause: pixelSvg(r(4, 3, 3, 10) + r(9, 3, 3, 10), 'ui-icon'),
    fastForward: pixelSvg(r(2, 3, 2, 10) + r(4, 4, 2, 8) + r(6, 5, 2, 6) + r(8, 3, 2, 10) + r(10, 4, 2, 8) + r(12, 5, 2, 6), 'ui-icon'),
    reset: pixelSvg(r(4, 3, 7, 2) + r(3, 5, 2, 5) + r(5, 10, 7, 2) + r(11, 8, 2, 2) + r(9, 6, 2, 2) + r(10, 2, 2, 2), 'ui-icon'),
    hazard: pixelSvg(r(7, 1, 2, 3) + r(4, 4, 8, 2) + r(3, 6, 10, 3) + r(5, 9, 6, 2) + r(7, 11, 2, 4), 'ui-icon'),
    soundOn: pixelSvg(r(2, 6, 3, 4) + r(5, 4, 2, 8) + r(8, 5, 2, 6) + r(11, 4, 1, 8) + r(13, 3, 1, 10), 'ui-icon'),
    soundOff: pixelSvg(r(2, 6, 3, 4) + r(5, 4, 2, 8) + r(9, 5, 2, 2, '#ef5350') + r(11, 7, 2, 2, '#ef5350') + r(9, 9, 2, 2, '#ef5350') + r(13, 3, 1, 10, '#ef5350'), 'ui-icon'),
    // Medals share the skill-badge recipe (dark outline / metal fill / highlight)
    // on the 24x24 grid. They differ by SHAPE + ribbon colour, not metal alone:
    // Rescue = a gold trophy cup; Efficiency = blue-ribbon silver star; Speed =
    // green-ribbon bronze chevron. Baked colours survive the .failed grayscale.
    trophy: pixelSvg24(
        r(6, 3, 12, 2, '#5e4a0a') + r(6, 5, 12, 5, '#5e4a0a') + r(8, 10, 8, 2, '#5e4a0a') + r(10, 12, 4, 1, '#5e4a0a') +
        r(3, 4, 3, 2, '#5e4a0a') + r(3, 6, 2, 3, '#5e4a0a') + r(3, 8, 3, 2, '#5e4a0a') +
        r(18, 4, 3, 2, '#5e4a0a') + r(19, 6, 2, 3, '#5e4a0a') + r(18, 8, 3, 2, '#5e4a0a') +
        r(10, 13, 4, 2, '#5e4a0a') + r(8, 15, 8, 2, '#5e4a0a') + r(6, 18, 12, 3, '#5e4a0a') +
        r(7, 5, 10, 4, '#ffd23f') + r(9, 9, 6, 2, '#ffd23f') + r(11, 11, 2, 1, '#ffd23f') +
        r(4, 5, 1, 4, '#ffd23f') + r(19, 5, 1, 4, '#ffd23f') + r(11, 13, 2, 2, '#d4a017') +
        r(9, 16, 6, 1, '#ffd23f') + r(8, 19, 8, 1, '#d4a017') +
        r(7, 5, 7, 1, '#fff3b0') + r(8, 6, 2, 3, '#fff3b0') + r(8, 19, 3, 1, '#fff3b0'), 'ui-icon medal-art'),
    medalSilver: pixelSvg24(
        r(7, 2, 3, 8, '#2a3a66') + r(8, 3, 1, 7, '#5b7fd6') + r(14, 2, 3, 8, '#2a3a66') + r(15, 3, 1, 7, '#5b7fd6') +
        r(9, 9, 6, 1, '#5a5f66') + r(7, 10, 10, 1, '#5a5f66') + r(6, 11, 12, 8, '#5a5f66') + r(7, 19, 10, 1, '#5a5f66') + r(9, 20, 6, 1, '#5a5f66') +
        r(10, 10, 4, 1, '#c9d2d8') + r(8, 11, 8, 1, '#c9d2d8') + r(7, 12, 10, 6, '#c9d2d8') + r(8, 18, 8, 1, '#c9d2d8') + r(10, 19, 4, 1, '#c9d2d8') +
        r(8, 12, 3, 2, '#ffffff') + r(11, 11, 2, 6, '#7a828a') + r(9, 13, 6, 2, '#7a828a') + r(11, 13, 2, 2, '#ffffff'), 'ui-icon medal-art'),
    medalBronze: pixelSvg24(
        r(7, 2, 3, 8, '#1b4d1f') + r(8, 3, 1, 7, '#4caf50') + r(14, 2, 3, 8, '#1b4d1f') + r(15, 3, 1, 7, '#4caf50') +
        r(9, 9, 6, 1, '#5e3210') + r(7, 10, 10, 1, '#5e3210') + r(6, 11, 12, 8, '#5e3210') + r(7, 19, 10, 1, '#5e3210') + r(9, 20, 6, 1, '#5e3210') +
        r(10, 10, 4, 1, '#cd7f32') + r(8, 11, 8, 1, '#cd7f32') + r(7, 12, 10, 6, '#cd7f32') + r(8, 18, 8, 1, '#cd7f32') + r(10, 19, 4, 1, '#cd7f32') +
        r(8, 12, 3, 2, '#f0b072') +
        r(11, 12, 2, 2, '#ffe0bf') + r(9, 14, 2, 2, '#ffe0bf') + r(13, 14, 2, 2, '#ffe0bf') + r(7, 16, 2, 2, '#ffe0bf') + r(15, 16, 2, 2, '#ffe0bf'), 'ui-icon medal-art'),
    share: pixelSvg(r(3, 3, 4, 4) + r(10, 2, 4, 4) + r(10, 10, 4, 4) + r(7, 5, 3, 2) + r(7, 9, 3, 2), 'ui-icon'),
    edit: pixelSvg(r(3, 11, 3, 2) + r(5, 9, 2, 2) + r(7, 7, 2, 2) + r(9, 5, 2, 2) + r(11, 3, 2, 2), 'ui-icon'),
    close: pixelSvg(r(3, 3, 2, 2) + r(5, 5, 2, 2) + r(7, 7, 2, 2) + r(9, 9, 2, 2) + r(11, 11, 2, 2) + r(11, 3, 2, 2) + r(9, 5, 2, 2) + r(5, 9, 2, 2) + r(3, 11, 2, 2), 'ui-icon'),
    settings: pixelSvg(r(7, 1, 2, 3) + r(7, 12, 2, 3) + r(1, 7, 3, 2) + r(12, 7, 3, 2) + r(5, 5, 6, 6) + r(7, 7, 2, 2, '#0a0f0b'), 'ui-icon'),
    undo: pixelSvg(r(4, 3, 6, 2) + r(3, 5, 2, 2) + r(2, 7, 8, 2) + r(10, 9, 2, 2) + r(8, 11, 4, 2), 'ui-icon'),
};

/**
 * Skill badges are authored on a roomier 24x24 grid — the old 16x16 glyphs were
 * too cramped for these metaphors and collapsed into low-contrast smudges when
 * disabled. Each badge uses a 3-tone recipe (dark OUTLINE + mid FILL + light
 * HIGHLIGHT) so the silhouette keeps internal luminance contrast even after the
 * disabled grayscale/opacity pass. Color-coding then does the rest: a player
 * should read the SHAPE first, color second, label last. To add a 9th skill,
 * copy one block, pick an outline/fill/highlight triple in a new hue, and keep
 * one dominant object so the silhouette stays unique at phone toolbar size.
 */
const skillSvg = (body, cls) =>
    `<svg class="pixel-icon skill-icon ${cls}" viewBox="0 0 24 24" aria-hidden="true" focusable="false" shape-rendering="crispEdges">${body}</svg>`;
const _skill = (cls, ...rects) => skillSvg(rects.join(''), cls);

const SKILL_ICONS = {
    // BLOCK — a planted figure, arms thrown wide, broad feet: "I am not moving."
    [SKILLS.BLOCK]: _skill('skill-block',
        r(2, 9, 20, 5, '#5e1410'), r(3, 10, 18, 3, '#e8503e'), r(3, 10, 3, 1, '#ffb3a7'), r(18, 10, 3, 1, '#ffb3a7'),
        r(8, 2, 8, 8, '#5e1410'), r(9, 3, 6, 5, '#e8503e'), r(9, 3, 6, 1, '#ffb3a7'),
        r(10, 5, 2, 2, '#ffffff'), r(13, 5, 2, 2, '#ffffff'), r(10, 5, 1, 1, '#1a1a1a'), r(13, 5, 1, 1, '#1a1a1a'),
        r(7, 13, 10, 6, '#5e1410'), r(8, 14, 8, 4, '#e8503e'),
        r(4, 18, 7, 4, '#5e1410'), r(5, 19, 5, 2, '#e8503e'), r(13, 18, 7, 4, '#5e1410'), r(14, 19, 5, 2, '#e8503e')),
    // BUILD — a rising staircase (the dominant shape) with a small hammer above.
    [SKILLS.BUILD]: _skill('skill-build',
        r(2, 2, 7, 3, '#5e3a10'), r(3, 3, 5, 1, '#cfd8dc'), r(5, 4, 2, 7, '#5e3a10'), r(5, 4, 1, 7, '#8a6a3a'),
        r(2, 15, 7, 7, '#5e3a10'), r(3, 16, 5, 6, '#f0a93a'), r(3, 16, 5, 1, '#ffe39a'),
        r(7, 11, 7, 11, '#5e3a10'), r(8, 12, 5, 10, '#f0a93a'), r(8, 12, 5, 1, '#ffe39a'),
        r(12, 7, 7, 15, '#5e3a10'), r(13, 8, 5, 14, '#f0a93a'), r(13, 8, 5, 1, '#ffe39a'),
        r(17, 4, 6, 18, '#5e3a10'), r(18, 5, 4, 17, '#f0a93a'), r(18, 5, 4, 1, '#ffe39a')),
    // BASH — a forward fist with motion streaks behind it: clearly horizontal.
    [SKILLS.BASH]: _skill('skill-bash',
        r(1, 9, 3, 2, '#ffc6ad'), r(1, 13, 3, 2, '#ffc6ad'), r(2, 11, 3, 2, '#ef8a5f'),
        r(6, 8, 9, 9, '#5e2a14'), r(7, 9, 8, 7, '#ef8a5f'), r(7, 9, 5, 1, '#ffc6ad'),
        r(13, 6, 8, 12, '#5e2a14'), r(14, 7, 7, 10, '#ef8a5f'),
        r(19, 8, 2, 2, '#ffc6ad'), r(19, 11, 2, 2, '#ffc6ad'), r(19, 14, 2, 2, '#ffc6ad'),
        r(13, 15, 4, 4, '#5e2a14'), r(14, 16, 2, 2, '#ef8a5f')),
    // MINE — a pickaxe: arched blue head, diagonal wooden handle. Diagonal motif.
    [SKILLS.MINE]: _skill('skill-mine',
        r(4, 7, 16, 2, '#1a2a52'), r(4, 5, 3, 2, '#1a2a52'), r(17, 5, 3, 2, '#1a2a52'),
        r(5, 8, 14, 1, '#6f9be8'), r(5, 6, 2, 1, '#6f9be8'), r(17, 6, 2, 1, '#6f9be8'), r(6, 8, 5, 1, '#cfe0ff'),
        r(11, 9, 2, 2, '#5a3e22'), r(12, 11, 2, 2, '#5a3e22'), r(13, 13, 2, 2, '#5a3e22'),
        r(14, 15, 2, 2, '#5a3e22'), r(15, 17, 2, 2, '#5a3e22'), r(16, 19, 2, 2, '#5a3e22'),
        r(11, 9, 1, 2, '#8a6a3a'), r(13, 13, 1, 2, '#8a6a3a'), r(15, 17, 1, 2, '#8a6a3a')),
    // DIG — a downward shovel: T-grip, vertical shaft, metal spade. Vertical motif.
    [SKILLS.DIG]: _skill('skill-dig',
        r(7, 2, 10, 3, '#3a2c24'), r(8, 3, 8, 1, '#d8c8bf'),
        r(10, 4, 4, 9, '#3a2c24'), r(11, 5, 2, 8, '#9c8579'), r(11, 5, 1, 8, '#d8c8bf'),
        r(6, 12, 12, 7, '#3a2c24'), r(7, 13, 10, 5, '#c9d2d6'), r(8, 13, 2, 4, '#eef3f5'),
        r(9, 18, 6, 3, '#3a2c24'), r(10, 19, 4, 1, '#c9d2d6'), r(11, 20, 2, 2, '#3a2c24')),
    // FLOAT — an umbrella canopy with a little mossling dangling beneath it.
    [SKILLS.FLOAT]: _skill('skill-float',
        r(5, 3, 14, 2, '#0d4750'), r(3, 5, 18, 2, '#0d4750'), r(2, 7, 20, 2, '#0d4750'),
        r(6, 4, 12, 1, '#34c0d4'), r(4, 6, 16, 1, '#34c0d4'), r(3, 8, 18, 1, '#34c0d4'),
        r(6, 4, 5, 1, '#b3eef5'), r(4, 6, 4, 1, '#b3eef5'),
        r(6, 8, 1, 1, '#0d4750'), r(10, 8, 1, 1, '#0d4750'), r(14, 8, 1, 1, '#0d4750'), r(18, 8, 1, 1, '#0d4750'),
        r(11, 9, 2, 7, '#0d4750'), r(11, 9, 1, 6, '#b0bec5'),
        r(9, 15, 6, 6, '#0d4750'), r(10, 16, 4, 4, '#66bb6a'), r(10, 16, 4, 1, '#a5d6a7'),
        r(11, 17, 1, 2, '#ffffff'), r(13, 17, 1, 2, '#ffffff')),
    // CLIMB — a ladder: two rails with evenly-spaced rungs. Unique parallel verticals.
    [SKILLS.CLIMB]: _skill('skill-climb',
        r(5, 2, 3, 20, '#1b4d1f'), r(6, 3, 1, 18, '#66bb6a'), r(16, 2, 3, 20, '#1b4d1f'), r(17, 3, 1, 18, '#66bb6a'),
        r(8, 5, 8, 2, '#1b4d1f'), r(8, 5, 8, 1, '#66bb6a'), r(9, 5, 4, 1, '#c8e6c9'),
        r(8, 9, 8, 2, '#1b4d1f'), r(8, 9, 8, 1, '#66bb6a'),
        r(8, 13, 8, 2, '#1b4d1f'), r(8, 13, 8, 1, '#66bb6a'),
        r(8, 17, 8, 2, '#1b4d1f'), r(8, 17, 8, 1, '#66bb6a')),
    // BOOM — a round bomb with a sparking fuse and a strong warning outline.
    [SKILLS.EXPLODE]: _skill('skill-boom',
        r(9, 6, 6, 2, '#5e1e0a'), r(7, 8, 10, 2, '#5e1e0a'), r(6, 10, 12, 8, '#5e1e0a'), r(7, 18, 10, 2, '#5e1e0a'), r(9, 20, 6, 2, '#5e1e0a'),
        r(10, 7, 4, 1, '#f4511e'), r(8, 9, 8, 1, '#f4511e'), r(7, 11, 10, 6, '#f4511e'), r(8, 17, 8, 1, '#f4511e'), r(10, 19, 4, 1, '#f4511e'),
        r(8, 11, 3, 3, '#ffab91'),
        r(11, 4, 4, 2, '#5e1e0a'), r(12, 4, 2, 1, '#9aa0a6'),
        r(13, 2, 2, 2, '#5e1e0a'), r(15, 1, 2, 2, '#5e1e0a'),
        r(16, 0, 2, 2, '#ffeb3b'), r(18, 1, 2, 2, '#ffd166')),
};

const iconHtml = (name, cls = '') => {
    const svg = UI_ICONS[name] || SKILL_ICONS[name] || '';
    return cls ? svg.replace('pixel-icon ', `pixel-icon ${cls} `) : svg;
};

const setIconHtml = (el, svg, label) => {
    if (!el) return;
    el.innerHTML = svg || '';
    if (label && el.setAttribute) el.setAttribute('aria-label', label);
    else if (label) el.ariaLabel = label;
};

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { SKILL_ICONS, UI_ICONS, iconHtml };
}
