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

const uiSvg = (...rects) => pixelSvg24(rects.join(''), 'ui-icon ui-art');

const UI_ICONS = {
    play: uiSvg(
        r(7, 4, 4, 16, '#153015'), r(10, 5, 4, 14, '#153015'), r(13, 7, 4, 10, '#153015'), r(16, 9, 3, 6, '#153015'),
        r(8, 5, 3, 14, '#7fd35a'), r(11, 6, 3, 12, '#7fd35a'), r(14, 8, 3, 8, '#7fd35a'), r(17, 10, 1, 4, '#7fd35a'),
        r(8, 5, 2, 3, '#d5f59a'), r(11, 7, 2, 3, '#d5f59a'), r(14, 9, 1, 2, '#d5f59a'), r(16, 13, 1, 2, '#4a8a33')),
    pause: uiSvg(
        r(5, 4, 6, 16, '#153015'), r(13, 4, 6, 16, '#153015'),
        r(6, 5, 4, 14, '#7fd35a'), r(14, 5, 4, 14, '#7fd35a'),
        r(6, 5, 2, 12, '#d5f59a'), r(14, 5, 2, 12, '#d5f59a'), r(9, 15, 1, 4, '#4a8a33'), r(17, 15, 1, 4, '#4a8a33')),
    fastForward: uiSvg(
        r(2, 5, 4, 14, '#153015'), r(5, 6, 4, 12, '#153015'), r(8, 8, 3, 8, '#153015'), r(10, 10, 2, 4, '#153015'),
        r(11, 5, 4, 14, '#153015'), r(14, 6, 4, 12, '#153015'), r(17, 8, 3, 8, '#153015'), r(19, 10, 2, 4, '#153015'),
        r(3, 6, 3, 12, '#7fd35a'), r(6, 7, 3, 10, '#7fd35a'), r(9, 9, 2, 6, '#7fd35a'), r(12, 6, 3, 12, '#7fd35a'), r(15, 7, 3, 10, '#7fd35a'), r(18, 9, 2, 6, '#7fd35a'),
        r(3, 6, 2, 3, '#d5f59a'), r(12, 6, 2, 3, '#d5f59a'), r(9, 13, 1, 2, '#4a8a33'), r(18, 13, 1, 2, '#4a8a33')),
    reset: uiSvg(
        r(6, 4, 10, 3, '#153015'), r(4, 7, 3, 8, '#153015'), r(6, 15, 11, 3, '#153015'), r(16, 12, 3, 4, '#153015'),
        r(15, 3, 3, 3, '#153015'), r(18, 5, 2, 3, '#153015'), r(13, 6, 5, 2, '#153015'),
        r(7, 5, 8, 1, '#7fd35a'), r(5, 8, 1, 6, '#7fd35a'), r(7, 16, 9, 1, '#7fd35a'), r(17, 12, 1, 3, '#7fd35a'),
        r(7, 5, 5, 1, '#d5f59a'), r(5, 8, 1, 3, '#d5f59a'), r(15, 4, 2, 2, '#d5f59a'), r(16, 15, 1, 2, '#4a8a33')),
    hazard: uiSvg(
        r(11, 2, 2, 5, '#5e1e0a'), r(7, 6, 10, 3, '#5e1e0a'), r(5, 9, 14, 5, '#5e1e0a'), r(7, 14, 10, 3, '#5e1e0a'), r(10, 17, 4, 5, '#5e1e0a'),
        r(12, 3, 1, 4, '#ffd166'), r(8, 7, 8, 1, '#ff7043'), r(6, 10, 12, 3, '#ff7043'), r(8, 14, 8, 1, '#ff7043'), r(11, 17, 2, 3, '#ff7043'),
        r(7, 9, 4, 2, '#ffcc80'), r(10, 5, 2, 2, '#fff3b0'), r(13, 13, 3, 1, '#c23a14'), r(10, 10, 4, 4, '#2a1208')),
    lock: uiSvg(
        r(7, 3, 10, 3, '#263325'), r(5, 6, 3, 6, '#263325'), r(16, 6, 3, 6, '#263325'), r(4, 10, 16, 11, '#263325'),
        r(8, 4, 8, 1, '#c8d6bd'), r(6, 7, 1, 4, '#c8d6bd'), r(17, 7, 1, 4, '#73836d'), r(5, 11, 14, 9, '#8fa285'),
        r(6, 11, 5, 2, '#dcebd2'), r(15, 13, 3, 6, '#5d6a58'), r(11, 14, 2, 4, '#182118'), r(10, 13, 4, 2, '#182118')),
    soundOn: uiSvg(
        r(3, 9, 4, 6, '#153015'), r(7, 6, 4, 12, '#153015'), r(10, 4, 3, 16, '#153015'),
        r(4, 10, 3, 4, '#7fd35a'), r(8, 7, 2, 10, '#7fd35a'), r(10, 6, 2, 12, '#7fd35a'), r(7, 10, 1, 2, '#d5f59a'),
        r(15, 7, 2, 10, '#153015'), r(18, 5, 2, 14, '#153015'), r(21, 3, 1, 18, '#153015'),
        r(15, 8, 1, 8, '#7fd35a'), r(18, 6, 1, 12, '#7fd35a'), r(21, 5, 1, 14, '#7fd35a')),
    soundOff: uiSvg(
        r(3, 9, 4, 6, '#153015'), r(7, 6, 4, 12, '#153015'), r(10, 4, 3, 16, '#153015'),
        r(4, 10, 3, 4, '#7fd35a'), r(8, 7, 2, 10, '#7fd35a'), r(10, 6, 2, 12, '#7fd35a'),
        r(15, 6, 3, 3, '#5e1410'), r(18, 9, 3, 3, '#5e1410'), r(15, 15, 3, 3, '#5e1410'), r(18, 12, 3, 3, '#5e1410'),
        r(16, 7, 2, 2, '#ef5350'), r(19, 10, 1, 1, '#ffb3a7'), r(16, 16, 2, 1, '#ef5350'), r(19, 13, 1, 1, '#ffb3a7')),
    // Medals share the skill-badge recipe (dark outline / metal fill / highlight)
    // on the 24x24 grid. They differ by SHAPE + ribbon colour, not metal alone:
    // Rescue = a gold trophy cup; Efficiency = blue-ribbon silver star; Speed =
    // green-ribbon bronze chevron. Baked colours survive the .failed grayscale.
    trophy: pixelSvg24(
        r(6, 3, 12, 2, '#5e4a0a') + r(7, 3, 10, 1, '#ffd23f') + r(7, 3, 8, 1, '#fff3b0') +
        r(6, 5, 12, 5, '#5e4a0a') + r(7, 5, 10, 4, '#ffd23f') + r(13, 6, 4, 3, '#d4a017') + r(7, 5, 2, 4, '#fff3b0') +
        r(8, 10, 8, 2, '#5e4a0a') + r(9, 10, 6, 1, '#ffd23f') + r(12, 10, 3, 1, '#d4a017') + r(11, 6, 2, 2, '#5e4a0a') +
        r(3, 4, 3, 2, '#5e4a0a') + r(2, 6, 2, 3, '#5e4a0a') + r(3, 9, 3, 2, '#5e4a0a') + r(4, 5, 1, 4, '#ffd23f') +
        r(18, 4, 3, 2, '#5e4a0a') + r(20, 6, 2, 3, '#5e4a0a') + r(18, 9, 3, 2, '#5e4a0a') + r(19, 5, 1, 4, '#ffd23f') +
        r(10, 12, 4, 3, '#5e4a0a') + r(11, 12, 2, 3, '#d4a017') + r(11, 12, 1, 2, '#ffd23f') +
        r(8, 15, 8, 2, '#5e4a0a') + r(9, 15, 6, 1, '#ffd23f') +
        r(6, 18, 12, 3, '#5e4a0a') + r(7, 18, 10, 1, '#ffd23f') + r(7, 19, 10, 1, '#d4a017') + r(8, 18, 3, 1, '#fff3b0'), 'ui-icon medal-art'),
    medalSilver: pixelSvg24(
        r(7, 1, 3, 9, '#2a3a66') + r(8, 2, 1, 7, '#5b7fd6') + r(8, 2, 1, 2, '#9ab0ec') +
        r(14, 1, 3, 9, '#2a3a66') + r(15, 2, 1, 7, '#5b7fd6') + r(15, 5, 1, 4, '#3a4f8a') +
        r(9, 9, 6, 1, '#3a3f46') + r(7, 10, 10, 1, '#3a3f46') + r(6, 11, 12, 8, '#3a3f46') + r(7, 19, 10, 1, '#3a3f46') + r(9, 20, 6, 1, '#3a3f46') +
        r(10, 10, 4, 1, '#c9d2d8') + r(8, 11, 8, 1, '#c9d2d8') + r(7, 12, 10, 6, '#c9d2d8') + r(8, 18, 8, 1, '#c9d2d8') + r(10, 19, 4, 1, '#c9d2d8') +
        r(8, 11, 4, 1, '#ffffff') + r(8, 12, 1, 3, '#ffffff') + r(14, 13, 1, 4, '#9aa3ab') + r(11, 17, 4, 1, '#9aa3ab') +
        r(11, 10, 2, 2, '#5a5f66') + r(9, 12, 6, 2, '#5a5f66') + r(10, 14, 1, 2, '#5a5f66') + r(13, 14, 1, 2, '#5a5f66') + r(11, 11, 2, 1, '#7a828a'), 'ui-icon medal-art'),
    medalBronze: pixelSvg24(
        r(7, 1, 3, 9, '#1b4d1f') + r(8, 2, 1, 7, '#4caf50') + r(8, 2, 1, 2, '#80e884') +
        r(14, 1, 3, 9, '#1b4d1f') + r(15, 2, 1, 7, '#4caf50') + r(15, 5, 1, 4, '#2e6b32') +
        r(9, 9, 6, 1, '#5e3210') + r(7, 10, 10, 1, '#5e3210') + r(6, 11, 12, 8, '#5e3210') + r(7, 19, 10, 1, '#5e3210') + r(9, 20, 6, 1, '#5e3210') +
        r(10, 10, 4, 1, '#cd7f32') + r(8, 11, 8, 1, '#cd7f32') + r(7, 12, 10, 6, '#cd7f32') + r(8, 18, 8, 1, '#cd7f32') + r(10, 19, 4, 1, '#cd7f32') +
        r(8, 11, 4, 1, '#f0b072') + r(8, 12, 1, 3, '#f0b072') + r(14, 13, 1, 4, '#8a4f1a') + r(11, 17, 4, 1, '#8a4f1a') +
        r(11, 11, 2, 2, '#ffe0bf') + r(9, 13, 2, 2, '#ffe0bf') + r(13, 13, 2, 2, '#ffe0bf') +
        r(11, 14, 2, 2, '#ffe0bf') + r(9, 16, 2, 2, '#ffe0bf') + r(13, 16, 2, 2, '#ffe0bf'), 'ui-icon medal-art'),
    plus: uiSvg(
        r(10, 4, 4, 16, '#153015'), r(4, 10, 16, 4, '#153015'),
        r(11, 5, 2, 14, '#7fd35a'), r(5, 11, 14, 2, '#7fd35a'), r(11, 5, 1, 5, '#d5f59a'), r(5, 11, 5, 1, '#d5f59a')),
    minus: uiSvg(
        r(4, 10, 16, 4, '#153015'), r(5, 11, 14, 2, '#7fd35a'), r(5, 11, 5, 1, '#d5f59a'), r(16, 12, 2, 1, '#4a8a33')),
    share: uiSvg(
        r(3, 4, 7, 7, '#153015'), r(14, 2, 7, 7, '#153015'), r(14, 15, 7, 7, '#153015'), r(9, 7, 6, 3, '#153015'), r(9, 14, 6, 3, '#153015'),
        r(4, 5, 5, 5, '#7fd35a'), r(15, 3, 5, 5, '#7fd35a'), r(15, 16, 5, 5, '#7fd35a'), r(9, 8, 6, 1, '#7fd35a'), r(9, 15, 6, 1, '#7fd35a'),
        r(4, 5, 3, 1, '#d5f59a'), r(15, 3, 3, 1, '#d5f59a'), r(15, 16, 3, 1, '#d5f59a')),
    edit: uiSvg(
        r(4, 17, 5, 3, '#5e3a10'), r(7, 14, 3, 3, '#5e3a10'), r(10, 11, 3, 3, '#5e3a10'), r(13, 8, 3, 3, '#5e3a10'), r(16, 5, 4, 3, '#5e3a10'),
        r(5, 17, 3, 2, '#ffd166'), r(8, 14, 2, 2, '#ffd166'), r(11, 11, 2, 2, '#ffd166'), r(14, 8, 2, 2, '#ffd166'), r(17, 5, 2, 2, '#cfd8dc'),
        r(5, 19, 5, 2, '#263325'), r(4, 20, 7, 1, '#7fd35a')),
    close: uiSvg(
        r(4, 4, 4, 4, '#5e1410'), r(8, 8, 3, 3, '#5e1410'), r(11, 11, 3, 3, '#5e1410'), r(14, 14, 5, 5, '#5e1410'),
        r(16, 4, 4, 4, '#5e1410'), r(13, 8, 3, 3, '#5e1410'), r(8, 13, 3, 3, '#5e1410'), r(4, 16, 4, 4, '#5e1410'),
        r(5, 5, 2, 2, '#ef5350'), r(9, 9, 2, 2, '#ef5350'), r(12, 12, 2, 2, '#ef5350'), r(15, 15, 3, 3, '#ef5350'),
        r(17, 5, 2, 2, '#ffb3a7'), r(14, 8, 2, 2, '#ffb3a7'), r(9, 13, 2, 2, '#ffb3a7'), r(5, 17, 2, 2, '#ffb3a7')),
    settings: uiSvg(
        r(10, 2, 4, 5, '#263325'), r(10, 17, 4, 5, '#263325'), r(2, 10, 5, 4, '#263325'), r(17, 10, 5, 4, '#263325'),
        r(6, 6, 12, 12, '#263325'), r(8, 8, 8, 8, '#8fa285'), r(10, 10, 4, 4, '#0a0f0b'),
        r(8, 8, 4, 1, '#dcebd2'), r(8, 9, 1, 4, '#dcebd2'), r(14, 13, 2, 2, '#5d6a58'), r(11, 3, 2, 3, '#c8d6bd')),
    undo: uiSvg(
        r(5, 5, 12, 3, '#153015'), r(3, 8, 3, 3, '#153015'), r(2, 11, 13, 3, '#153015'), r(15, 14, 3, 3, '#153015'), r(12, 17, 6, 3, '#153015'),
        r(6, 6, 10, 1, '#7fd35a'), r(4, 9, 2, 1, '#7fd35a'), r(4, 12, 10, 1, '#7fd35a'), r(16, 14, 1, 2, '#7fd35a'), r(13, 18, 4, 1, '#7fd35a'),
        r(5, 5, 2, 2, '#d5f59a'), r(3, 8, 2, 2, '#d5f59a'), r(13, 18, 2, 1, '#d5f59a')),
};

/**
 * Skill badges are authored on a roomier 24x24 grid — the old 16x16 glyphs were
 * too cramped for these metaphors and collapsed into low-contrast smudges when
 * disabled. Each badge uses a 4-tone recipe (dark OUTLINE + SHADOW + mid FILL +
 * light HIGHLIGHT) so the silhouette keeps internal luminance contrast and a
 * sense of volume even after the disabled grayscale/opacity pass. Color-coding
 * then does the rest: a player should read the SHAPE first, color second, label
 * last. To add a 9th skill, copy one block, pick an outline/shadow/fill/
 * highlight ramp in a new hue, and keep one dominant object so the silhouette
 * stays unique at phone toolbar size.
 */
const skillSvg = (body, cls) =>
    `<svg class="pixel-icon skill-icon ${cls}" viewBox="0 0 24 24" aria-hidden="true" focusable="false" shape-rendering="crispEdges">${body}</svg>`;
const _skill = (cls, ...rects) => skillSvg(rects.join(''), cls);

const SKILL_ICONS = {
    // BLOCK — a planted figure: wide arms, fists, broad feet, determined face.
    [SKILLS.BLOCK]: _skill('skill-block',
        r(1, 10, 22, 5, '#5e1410'), r(2, 11, 20, 3, '#e8503e'), r(2, 13, 20, 1, '#b8392a'), r(3, 11, 18, 1, '#ffb3a7'),
        r(1, 9, 4, 7, '#5e1410'), r(2, 10, 2, 5, '#e8503e'), r(2, 10, 2, 1, '#ffb3a7'),
        r(19, 9, 4, 7, '#5e1410'), r(20, 10, 2, 5, '#e8503e'), r(20, 10, 2, 1, '#ffb3a7'),
        r(7, 14, 10, 6, '#5e1410'), r(8, 15, 8, 4, '#e8503e'), r(13, 15, 3, 4, '#b8392a'), r(8, 15, 2, 3, '#ffb3a7'), r(8, 18, 8, 1, '#5e1410'),
        r(8, 2, 8, 8, '#5e1410'), r(9, 3, 6, 5, '#e8503e'), r(13, 3, 2, 5, '#b8392a'), r(9, 3, 4, 1, '#ffb3a7'),
        r(9, 4, 3, 1, '#5e1410'), r(13, 4, 3, 1, '#5e1410'),
        r(10, 5, 2, 2, '#ffffff'), r(13, 5, 2, 2, '#ffffff'), r(11, 6, 1, 1, '#1a1a1a'), r(14, 6, 1, 1, '#1a1a1a'), r(11, 7, 3, 1, '#5e1410'),
        r(4, 19, 7, 4, '#5e1410'), r(5, 20, 5, 2, '#e8503e'), r(5, 20, 5, 1, '#ffb3a7'),
        r(13, 19, 7, 4, '#5e1410'), r(14, 20, 5, 2, '#e8503e'), r(14, 20, 5, 1, '#ffb3a7')),
    // BUILD — a rising BRICK staircase (mortar lines + step shadow) with a hammer.
    [SKILLS.BUILD]: _skill('skill-build',
        r(2, 3, 7, 3, '#5e3a10'), r(3, 4, 5, 1, '#cfd8dc'), r(7, 4, 1, 1, '#8a97a0'), r(2, 5, 2, 2, '#5e3a10'),
        r(4, 6, 2, 7, '#5e3a10'), r(4, 7, 1, 5, '#a87a44'),
        r(2, 16, 8, 6, '#5e3a10'), r(3, 17, 6, 5, '#f0a93a'), r(7, 17, 2, 5, '#c8842a'), r(3, 17, 5, 1, '#ffe39a'), r(3, 19, 5, 1, '#5e3a10'),
        r(8, 11, 8, 11, '#5e3a10'), r(9, 12, 6, 10, '#f0a93a'), r(13, 12, 2, 10, '#c8842a'), r(9, 12, 5, 1, '#ffe39a'), r(9, 16, 5, 1, '#5e3a10'), r(9, 19, 5, 1, '#5e3a10'),
        r(14, 6, 8, 16, '#5e3a10'), r(15, 7, 6, 15, '#f0a93a'), r(19, 7, 2, 15, '#c8842a'), r(15, 7, 5, 1, '#ffe39a'), r(15, 11, 5, 1, '#5e3a10'), r(15, 16, 5, 1, '#5e3a10')),
    // BASH — a chunky four-finger fist with knuckles + motion streaks: horizontal.
    [SKILLS.BASH]: _skill('skill-bash',
        r(0, 9, 3, 2, '#ffc6ad'), r(0, 13, 3, 2, '#ffc6ad'), r(1, 11, 3, 2, '#ef8a5f'),
        r(5, 8, 7, 9, '#5e2a14'), r(6, 9, 6, 7, '#ef8a5f'), r(6, 14, 6, 2, '#c96a3a'), r(6, 9, 5, 1, '#ffc6ad'),
        r(11, 6, 9, 12, '#5e2a14'), r(12, 7, 7, 10, '#ef8a5f'), r(12, 14, 7, 3, '#c96a3a'), r(12, 7, 6, 1, '#ffc6ad'),
        r(14, 8, 1, 6, '#5e2a14'), r(16, 8, 1, 6, '#5e2a14'), r(18, 8, 1, 6, '#5e2a14'),
        r(13, 8, 1, 1, '#ffc6ad'), r(15, 8, 1, 1, '#ffc6ad'), r(17, 8, 1, 1, '#ffc6ad'),
        r(11, 15, 4, 4, '#5e2a14'), r(12, 16, 2, 2, '#ef8a5f')),
    // MINE — a CHUNKY double-bladed pickaxe + thick diagonal handle + strike spark.
    [SKILLS.MINE]: _skill('skill-mine',
        r(3, 5, 18, 3, '#1a2a52'), r(3, 4, 5, 2, '#1a2a52'), r(16, 4, 5, 2, '#1a2a52'), r(2, 6, 2, 2, '#1a2a52'), r(20, 6, 2, 2, '#1a2a52'),
        r(4, 5, 16, 2, '#6f9be8'), r(4, 7, 16, 1, '#3f63b0'), r(5, 5, 6, 1, '#cfe0ff'), r(13, 5, 5, 1, '#cfe0ff'),
        r(2, 6, 2, 1, '#cfe0ff'), r(20, 6, 2, 1, '#cfe0ff'),
        r(10, 6, 4, 3, '#1a2a52'), r(11, 7, 2, 2, '#3f63b0'),
        r(11, 9, 4, 3, '#3a2410'), r(13, 11, 4, 3, '#3a2410'), r(15, 14, 4, 3, '#3a2410'), r(16, 17, 4, 4, '#3a2410'),
        r(12, 9, 2, 3, '#7a5230'), r(14, 11, 2, 3, '#7a5230'), r(16, 14, 2, 3, '#7a5230'), r(17, 17, 2, 3, '#7a5230'),
        r(12, 9, 1, 3, '#a87a44'), r(14, 11, 1, 2, '#a87a44'), r(16, 14, 1, 2, '#a87a44'),
        r(1, 7, 2, 2, '#ffeb3b'), r(0, 9, 1, 1, '#fff3b0')),
    // DIG — a BROAD spade: fat T-grip, thick shaft, wide bottom-weighted blade + dirt.
    [SKILLS.DIG]: _skill('skill-dig',
        r(6, 2, 12, 3, '#3a2c1a'), r(7, 3, 10, 1, '#c89b5a'), r(6, 2, 2, 4, '#3a2c1a'), r(16, 2, 2, 4, '#3a2c1a'),
        r(10, 5, 5, 7, '#3a2c1a'), r(11, 6, 3, 6, '#9c6b3a'), r(11, 6, 1, 6, '#c89b5a'),
        r(9, 11, 7, 2, '#44505a'), r(10, 12, 5, 1, '#aeb9c0'),
        r(6, 12, 12, 6, '#44505a'), r(7, 13, 10, 4, '#aeb9c0'), r(7, 16, 10, 1, '#7a8a95'), r(8, 13, 3, 3, '#eef3f5'),
        r(8, 18, 8, 3, '#44505a'), r(9, 19, 6, 1, '#aeb9c0'), r(10, 21, 4, 2, '#44505a'), r(11, 21, 2, 1, '#aeb9c0'),
        r(11, 13, 2, 7, '#7a8a95'),
        r(7, 17, 2, 1, '#7a5230'), r(15, 17, 2, 1, '#7a5230'), r(11, 20, 2, 1, '#5e3a10')),
    // FLOAT — a ribbed umbrella canopy + finial, with a mossling gripping the pole.
    [SKILLS.FLOAT]: _skill('skill-float',
        r(11, 1, 2, 2, '#0d4750'), r(11, 1, 1, 1, '#b3eef5'),
        r(4, 3, 16, 2, '#0d4750'), r(2, 5, 20, 2, '#0d4750'), r(2, 7, 20, 2, '#0d4750'),
        r(5, 4, 14, 1, '#34c0d4'), r(3, 6, 18, 1, '#34c0d4'), r(3, 8, 18, 1, '#34c0d4'),
        r(5, 4, 6, 1, '#b3eef5'), r(3, 6, 5, 1, '#b3eef5'), r(3, 9, 18, 1, '#1f97a8'),
        r(7, 4, 1, 5, '#0d4750'), r(12, 3, 1, 6, '#0d4750'), r(16, 4, 1, 5, '#0d4750'),
        r(4, 9, 2, 1, '#0d4750'), r(8, 9, 2, 1, '#0d4750'), r(12, 9, 2, 1, '#0d4750'), r(16, 9, 2, 1, '#0d4750'),
        r(11, 9, 2, 7, '#0d4750'), r(11, 10, 1, 5, '#b0bec5'),
        r(8, 15, 8, 6, '#1b4d1f'), r(9, 16, 6, 4, '#66bb6a'), r(9, 16, 4, 1, '#a5d6a7'),
        r(9, 15, 1, 2, '#1b4d1f'), r(14, 15, 1, 2, '#1b4d1f'),
        r(10, 17, 2, 2, '#ffffff'), r(13, 17, 2, 2, '#ffffff'), r(11, 18, 1, 1, '#1a1a1a'), r(14, 18, 1, 1, '#1a1a1a')),
    // CLIMB — a bevelled ladder: two shaded rails with evenly-spaced shaded rungs.
    [SKILLS.CLIMB]: _skill('skill-climb',
        r(4, 2, 4, 20, '#1b4d1f'), r(5, 3, 2, 18, '#66bb6a'), r(6, 3, 1, 18, '#3f8a45'), r(5, 3, 1, 18, '#c8e6c9'),
        r(16, 2, 4, 20, '#1b4d1f'), r(17, 3, 2, 18, '#66bb6a'), r(18, 3, 1, 18, '#3f8a45'), r(17, 3, 1, 18, '#c8e6c9'),
        r(7, 4, 10, 2, '#1b4d1f'), r(8, 4, 8, 1, '#66bb6a'), r(9, 4, 5, 1, '#c8e6c9'),
        r(7, 9, 10, 2, '#1b4d1f'), r(8, 9, 8, 1, '#66bb6a'), r(9, 9, 5, 1, '#c8e6c9'),
        r(7, 14, 10, 2, '#1b4d1f'), r(8, 14, 8, 1, '#66bb6a'), r(9, 14, 5, 1, '#c8e6c9'),
        r(7, 19, 10, 2, '#1b4d1f'), r(8, 19, 8, 1, '#66bb6a'), r(9, 19, 5, 1, '#c8e6c9')),
    // BOOM — a round bomb with shine + shaded belly, a sparking fuse, warning outline.
    [SKILLS.EXPLODE]: _skill('skill-boom',
        r(9, 7, 6, 2, '#5e1e0a'), r(7, 9, 10, 2, '#5e1e0a'), r(6, 11, 12, 7, '#5e1e0a'), r(7, 18, 10, 2, '#5e1e0a'), r(9, 20, 6, 1, '#5e1e0a'),
        r(10, 8, 4, 1, '#f4511e'), r(8, 9, 8, 1, '#f4511e'), r(7, 11, 10, 6, '#f4511e'), r(8, 17, 8, 1, '#f4511e'), r(10, 19, 4, 1, '#f4511e'),
        r(13, 13, 4, 4, '#c23a14'), r(11, 17, 5, 1, '#c23a14'),
        r(8, 10, 3, 3, '#ffab91'), r(8, 13, 2, 2, '#ffffff'),
        r(11, 4, 4, 3, '#5e1e0a'), r(12, 5, 2, 1, '#9aa0a6'),
        r(13, 2, 2, 2, '#5e1e0a'), r(15, 1, 2, 2, '#5e1e0a'),
        r(16, 0, 3, 3, '#ffeb3b'), r(18, 0, 2, 2, '#ffd166'), r(15, 0, 1, 1, '#ffffff'), r(19, 2, 1, 1, '#ffffff')),
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
