'use strict';

/**
 * MOSSLINGS — revised icon set
 *
 * Drop-in replacement for the existing icons.js.
 * Public API preserved:
 * - SKILL_ICONS
 * - UI_ICONS
 * - iconHtml(name, cls)
 * - setIconHtml(el, svg, label)
 * - CommonJS export for tests/node
 *
 * Design rule:
 * silhouette first, shading second.
 * These icons are deliberately simpler and chunkier so they survive phone-sized HUD rendering.
 */

const pixelSvg = (body, cls = '') =>
    `<svg class="pixel-icon ${cls}" viewBox="0 0 16 16" aria-hidden="true" focusable="false" shape-rendering="crispEdges">${body}</svg>`;

const pixelSvg24 = (body, cls = '') =>
    `<svg class="pixel-icon ${cls}" viewBox="0 0 24 24" aria-hidden="true" focusable="false" shape-rendering="crispEdges">${body}</svg>`;

const r = (x, y, w, h, fill = 'currentColor') =>
    `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}"/>`;

const uiSvg = (...rects) => pixelSvg24(rects.join(''), 'ui-icon ui-art');

const skillSvg = (body, cls = '') =>
    `<svg class="pixel-icon skill-icon ${cls}" viewBox="0 0 24 24" aria-hidden="true" focusable="false" shape-rendering="crispEdges">${body}</svg>`;

const _skill = (cls, ...rects) => skillSvg(rects.join(''), cls);

/* -------------------------------------------------------------------------- */
/* UI ICONS                                                                    */
/* -------------------------------------------------------------------------- */

const UI_ICONS = {
    play: uiSvg(
        r(6, 4, 3, 16, '#153015'),
        r(9, 6, 3, 12, '#153015'),
        r(12, 8, 3, 8, '#153015'),
        r(15, 10, 3, 4, '#153015'),

        r(7, 5, 2, 14, '#7fd35a'),
        r(10, 7, 2, 10, '#7fd35a'),
        r(13, 9, 2, 6, '#7fd35a'),
        r(16, 11, 1, 2, '#7fd35a'),

        r(7, 5, 1, 4, '#d5f59a'),
        r(10, 7, 1, 3, '#d5f59a')
    ),

    pause: uiSvg(
        r(5, 4, 5, 16, '#153015'),
        r(14, 4, 5, 16, '#153015'),
        r(6, 5, 3, 14, '#7fd35a'),
        r(15, 5, 3, 14, '#7fd35a'),
        r(6, 5, 1, 6, '#d5f59a'),
        r(15, 5, 1, 6, '#d5f59a')
    ),

    fastForward: uiSvg(
        r(2, 5, 4, 14, '#153015'),
        r(5, 7, 4, 10, '#153015'),
        r(8, 9, 3, 6, '#153015'),

        r(11, 5, 4, 14, '#153015'),
        r(14, 7, 4, 10, '#153015'),
        r(17, 9, 3, 6, '#153015'),

        r(3, 6, 2, 12, '#7fd35a'),
        r(6, 8, 2, 8, '#7fd35a'),
        r(9, 10, 1, 4, '#7fd35a'),

        r(12, 6, 2, 12, '#7fd35a'),
        r(15, 8, 2, 8, '#7fd35a'),
        r(18, 10, 1, 4, '#7fd35a'),

        r(3, 6, 1, 3, '#d5f59a'),
        r(12, 6, 1, 3, '#d5f59a')
    ),

    reset: uiSvg(
        r(7, 3, 10, 3, '#153015'),
        r(5, 6, 3, 10, '#153015'),
        r(7, 16, 9, 3, '#153015'),
        r(15, 12, 3, 4, '#153015'),

        r(3, 7, 4, 4, '#153015'),
        r(2, 8, 2, 2, '#153015'),

        r(8, 4, 7, 1, '#7fd35a'),
        r(6, 7, 1, 7, '#7fd35a'),
        r(8, 17, 7, 1, '#7fd35a'),
        r(16, 12, 1, 3, '#7fd35a'),

        r(3, 8, 3, 1, '#7fd35a'),
        r(4, 7, 1, 3, '#7fd35a'),

        r(8, 4, 3, 1, '#d5f59a'),
        r(6, 7, 1, 3, '#d5f59a')
    ),

    hazard: uiSvg(
        r(10, 2, 4, 5, '#5e1e0a'),
        r(8, 6, 8, 4, '#5e1e0a'),
        r(6, 10, 12, 7, '#5e1e0a'),
        r(8, 17, 8, 3, '#5e1e0a'),

        r(11, 3, 2, 4, '#ffd166'),
        r(9, 7, 6, 2, '#ff7043'),
        r(7, 11, 10, 4, '#ff7043'),
        r(9, 17, 6, 1, '#ff7043'),

        r(9, 10, 3, 2, '#ffcc80'),
        r(11, 5, 1, 1, '#fff3b0')
    ),

    lock: uiSvg(
        r(7, 3, 10, 3, '#263325'),
        r(5, 6, 3, 6, '#263325'),
        r(16, 6, 3, 6, '#263325'),
        r(4, 10, 16, 11, '#263325'),

        r(8, 4, 8, 1, '#c8d6bd'),
        r(6, 7, 1, 4, '#c8d6bd'),
        r(17, 7, 1, 4, '#73836d'),

        r(5, 11, 14, 9, '#8fa285'),
        r(6, 11, 5, 2, '#dcebd2'),
        r(15, 13, 3, 6, '#5d6a58'),

        r(11, 14, 2, 4, '#182118'),
        r(10, 13, 4, 2, '#182118')
    ),

    soundOn: uiSvg(
        r(3, 9, 4, 6, '#153015'),
        r(7, 6, 4, 12, '#153015'),
        r(10, 4, 3, 16, '#153015'),

        r(4, 10, 3, 4, '#7fd35a'),
        r(8, 7, 2, 10, '#7fd35a'),
        r(10, 6, 2, 12, '#7fd35a'),

        r(15, 8, 2, 8, '#153015'),
        r(18, 6, 2, 12, '#153015'),
        r(21, 4, 1, 16, '#153015'),

        r(15, 9, 1, 6, '#7fd35a'),
        r(18, 7, 1, 10, '#7fd35a'),
        r(21, 6, 1, 12, '#7fd35a')
    ),

    soundOff: uiSvg(
        r(3, 9, 4, 6, '#153015'),
        r(7, 6, 4, 12, '#153015'),
        r(10, 4, 3, 16, '#153015'),

        r(4, 10, 3, 4, '#7fd35a'),
        r(8, 7, 2, 10, '#7fd35a'),
        r(10, 6, 2, 12, '#7fd35a'),

        r(15, 6, 3, 3, '#5e1410'),
        r(18, 9, 3, 3, '#5e1410'),
        r(15, 15, 3, 3, '#5e1410'),
        r(18, 12, 3, 3, '#5e1410'),

        r(16, 7, 2, 2, '#ef5350'),
        r(19, 10, 1, 1, '#ffb3a7'),
        r(16, 16, 2, 1, '#ef5350'),
        r(19, 13, 1, 1, '#ffb3a7')
    ),

    trophy: pixelSvg24(
        r(6, 3, 12, 2, '#5e4a0a') +
        r(7, 5, 10, 5, '#ffd23f') +
        r(8, 6, 3, 2, '#fff3b0') +
        r(4, 5, 2, 4, '#5e4a0a') +
        r(18, 5, 2, 4, '#5e4a0a') +
        r(9, 10, 6, 2, '#5e4a0a') +
        r(10, 12, 4, 3, '#d4a017') +
        r(8, 15, 8, 3, '#5e4a0a') +
        r(9, 16, 6, 1, '#ffd23f') +
        r(6, 18, 12, 3, '#5e4a0a') +
        r(7, 19, 10, 1, '#ffd23f'),
        'ui-icon medal-art'
    ),

    medalSilver: pixelSvg24(
        r(7, 1, 3, 8, '#2a3a66') +
        r(14, 1, 3, 8, '#2a3a66') +
        r(8, 2, 1, 6, '#5b7fd6') +
        r(15, 2, 1, 6, '#5b7fd6') +
        r(6, 10, 12, 10, '#3a3f46') +
        r(7, 11, 10, 8, '#c9d2d8') +
        r(8, 12, 3, 2, '#ffffff') +
        r(11, 12, 2, 2, '#5a5f66') +
        r(13, 12, 3, 2, '#ffffff') +
        r(10, 15, 4, 1, '#5a5f66') +
        r(11, 16, 2, 2, '#5a5f66'),
        'ui-icon medal-art'
    ),

    medalBronze: pixelSvg24(
        r(7, 1, 3, 8, '#1b4d1f') +
        r(14, 1, 3, 8, '#1b4d1f') +
        r(8, 2, 1, 6, '#4caf50') +
        r(15, 2, 1, 6, '#4caf50') +
        r(6, 10, 12, 10, '#5e3210') +
        r(7, 11, 10, 8, '#cd7f32') +
        r(8, 12, 2, 2, '#f0b072') +
        r(14, 12, 2, 2, '#f0b072') +
        r(11, 12, 2, 2, '#ffe0bf') +
        r(10, 15, 1, 2, '#ffe0bf') +
        r(13, 15, 1, 2, '#ffe0bf'),
        'ui-icon medal-art'
    ),

    plus: uiSvg(
        r(10, 4, 4, 16, '#153015'),
        r(4, 10, 16, 4, '#153015'),
        r(11, 5, 2, 14, '#7fd35a'),
        r(5, 11, 14, 2, '#7fd35a'),
        r(11, 5, 1, 5, '#d5f59a'),
        r(5, 11, 5, 1, '#d5f59a')
    ),

    minus: uiSvg(
        r(4, 10, 16, 4, '#153015'),
        r(5, 11, 14, 2, '#7fd35a'),
        r(5, 11, 5, 1, '#d5f59a')
    ),

    share: uiSvg(
        r(4, 8, 8, 9, '#153015'),
        r(5, 9, 6, 7, '#7fd35a'),
        r(5, 9, 3, 1, '#d5f59a'),

        r(10, 5, 10, 3, '#153015'),
        r(15, 2, 3, 3, '#153015'),
        r(17, 4, 3, 3, '#153015'),

        r(11, 6, 7, 1, '#7fd35a'),
        r(16, 3, 1, 3, '#7fd35a'),
        r(18, 5, 1, 1, '#7fd35a')
    ),

    edit: uiSvg(
        r(4, 17, 5, 3, '#5e3a10'),
        r(7, 14, 3, 3, '#5e3a10'),
        r(10, 11, 3, 3, '#5e3a10'),
        r(13, 8, 3, 3, '#5e3a10'),
        r(16, 5, 4, 3, '#5e3a10'),

        r(5, 17, 3, 2, '#ffd166'),
        r(8, 14, 2, 2, '#ffd166'),
        r(11, 11, 2, 2, '#ffd166'),
        r(14, 8, 2, 2, '#ffd166'),
        r(17, 5, 2, 2, '#cfd8dc'),

        r(5, 19, 5, 2, '#263325'),
        r(4, 20, 7, 1, '#7fd35a')
    ),

    close: uiSvg(
        r(5, 5, 4, 4, '#5e1410'),
        r(9, 9, 3, 3, '#5e1410'),
        r(12, 12, 3, 3, '#5e1410'),
        r(15, 15, 4, 4, '#5e1410'),

        r(15, 5, 4, 4, '#5e1410'),
        r(12, 9, 3, 3, '#5e1410'),
        r(9, 12, 3, 3, '#5e1410'),
        r(5, 15, 4, 4, '#5e1410'),

        r(6, 6, 2, 2, '#ef5350'),
        r(10, 10, 1, 1, '#ef5350'),
        r(16, 6, 2, 2, '#ffb3a7'),
        r(6, 16, 2, 2, '#ffb3a7')
    ),

    settings: uiSvg(
        r(4, 6, 16, 2, '#263325'),
        r(4, 16, 16, 2, '#263325'),

        r(8, 4, 4, 6, '#263325'),
        r(14, 14, 4, 6, '#263325'),

        r(9, 5, 2, 4, '#8fa285'),
        r(15, 15, 2, 4, '#8fa285'),

        r(5, 7, 14, 1, '#dcebd2'),
        r(5, 17, 14, 1, '#dcebd2')
    ),

    undo: uiSvg(
        r(6, 5, 10, 3, '#153015'),
        r(4, 8, 3, 3, '#153015'),
        r(3, 11, 12, 3, '#153015'),
        r(14, 14, 3, 3, '#153015'),
        r(11, 17, 6, 3, '#153015'),

        r(7, 6, 8, 1, '#7fd35a'),
        r(5, 9, 1, 1, '#7fd35a'),
        r(4, 12, 10, 1, '#7fd35a'),
        r(15, 15, 1, 1, '#7fd35a'),
        r(12, 18, 4, 1, '#7fd35a'),

        r(6, 5, 1, 2, '#d5f59a'),
        r(4, 8, 1, 2, '#d5f59a')
    )
};

/* -------------------------------------------------------------------------- */
/* SKILL ICONS                                                                 */
/* -------------------------------------------------------------------------- */

const SKILL_ICONS = {
    /**
     * BLOCK — stop-sign / planted blocker silhouette.
     * Wide stance, arms out, red family so it reads as halt/stop.
     */
    [SKILLS.BLOCK]: _skill('skill-block',
        r(7, 2, 10, 8, '#5e1410'),
        r(8, 3, 8, 6, '#e8503e'),
        r(8, 3, 4, 1, '#ffb3a7'),

        r(4, 10, 16, 3, '#5e1410'),
        r(5, 11, 14, 1, '#e8503e'),

        r(5, 13, 5, 7, '#5e1410'),
        r(14, 13, 5, 7, '#5e1410'),
        r(6, 14, 3, 5, '#e8503e'),
        r(15, 14, 3, 5, '#e8503e'),

        r(4, 20, 7, 3, '#5e1410'),
        r(13, 20, 7, 3, '#5e1410'),
        r(5, 21, 5, 1, '#ffb3a7'),
        r(14, 21, 5, 1, '#ffb3a7'),

        r(10, 5, 2, 2, '#ffffff'),
        r(13, 5, 2, 2, '#ffffff'),
        r(11, 6, 1, 1, '#1a1a1a'),
        r(14, 6, 1, 1, '#1a1a1a')
    ),

    /**
     * BUILD — bold staircase only.
     * No hammer. The staircase silhouette is enough.
     */
    [SKILLS.BUILD]: _skill('skill-build',
        r(2, 16, 7, 6, '#5e3a10'),
        r(3, 17, 5, 4, '#f0a93a'),
        r(3, 17, 4, 1, '#ffe39a'),

        r(8, 11, 7, 11, '#5e3a10'),
        r(9, 12, 5, 9, '#f0a93a'),
        r(9, 12, 4, 1, '#ffe39a'),

        r(14, 6, 7, 16, '#5e3a10'),
        r(15, 7, 5, 14, '#f0a93a'),
        r(15, 7, 4, 1, '#ffe39a'),

        r(6, 19, 2, 2, '#c8842a'),
        r(12, 17, 2, 4, '#c8842a'),
        r(18, 13, 2, 8, '#c8842a')
    ),

    /**
     * BASH — chunky forward fist / wedge.
     * One strong directional read.
     */
    [SKILLS.BASH]: _skill('skill-bash',
        r(1, 10, 4, 2, '#ffc6ad'),
        r(2, 13, 4, 2, '#ef8a5f'),

        r(6, 8, 8, 10, '#5e2a14'),
        r(7, 9, 6, 8, '#ef8a5f'),
        r(7, 9, 4, 1, '#ffc6ad'),

        r(13, 7, 7, 12, '#5e2a14'),
        r(14, 8, 5, 10, '#ef8a5f'),
        r(14, 8, 3, 1, '#ffc6ad'),

        r(15, 10, 1, 6, '#5e2a14'),
        r(17, 10, 1, 6, '#5e2a14'),
        r(15, 10, 1, 1, '#ffc6ad'),
        r(17, 10, 1, 1, '#ffc6ad')
    ),

    /**
     * MINE — angled pickaxe.
     * Clear diagonal handle + broad head.
     */
    [SKILLS.MINE]: _skill('skill-mine',
        r(4, 5, 16, 3, '#1a2a52'),
        r(3, 6, 3, 2, '#1a2a52'),
        r(18, 6, 3, 2, '#1a2a52'),
        r(5, 5, 14, 2, '#6f9be8'),
        r(5, 5, 5, 1, '#cfe0ff'),

        r(10, 7, 4, 3, '#1a2a52'),
        r(11, 8, 2, 2, '#3f63b0'),

        r(11, 9, 3, 3, '#3a2410'),
        r(13, 11, 3, 3, '#3a2410'),
        r(15, 13, 3, 3, '#3a2410'),
        r(17, 15, 3, 5, '#3a2410'),

        r(12, 10, 1, 2, '#a87a44'),
        r(14, 12, 1, 2, '#a87a44'),
        r(16, 14, 1, 2, '#a87a44'),

        r(2, 8, 2, 2, '#ffeb3b'),
        r(1, 10, 1, 1, '#fff3b0')
    ),

    /**
     * DIG — unmistakably vertical shovel.
     * Bottom-heavy spade silhouette.
     */
    [SKILLS.DIG]: _skill('skill-dig',
        r(8, 2, 8, 3, '#3a2c1a'),
        r(9, 3, 6, 1, '#c89b5a'),

        r(10, 5, 4, 8, '#3a2c1a'),
        r(11, 6, 2, 7, '#9c6b3a'),
        r(11, 6, 1, 5, '#c89b5a'),

        r(8, 13, 8, 2, '#44505a'),
        r(7, 15, 10, 5, '#44505a'),
        r(8, 16, 8, 3, '#aeb9c0'),
        r(8, 16, 3, 1, '#eef3f5'),

        r(9, 20, 6, 2, '#44505a'),
        r(10, 21, 4, 1, '#aeb9c0')
    ),

    /**
     * FLOAT — umbrella canopy above a mossling.
     * Strong top-heavy silhouette.
     */
    [SKILLS.FLOAT]: _skill('skill-float',
        r(4, 4, 16, 2, '#0d4750'),
        r(2, 6, 20, 2, '#0d4750'),
        r(3, 8, 18, 2, '#0d4750'),

        r(5, 5, 14, 1, '#34c0d4'),
        r(3, 7, 18, 1, '#34c0d4'),
        r(4, 9, 16, 1, '#1f97a8'),

        r(6, 5, 5, 1, '#b3eef5'),
        r(11, 3, 2, 2, '#0d4750'),

        r(11, 10, 2, 6, '#0d4750'),
        r(11, 10, 1, 5, '#b0bec5'),

        r(8, 15, 8, 6, '#1b4d1f'),
        r(9, 16, 6, 4, '#66bb6a'),
        r(9, 16, 3, 1, '#a5d6a7'),

        r(10, 17, 2, 2, '#ffffff'),
        r(13, 17, 2, 2, '#ffffff'),
        r(11, 18, 1, 1, '#1a1a1a'),
        r(14, 18, 1, 1, '#1a1a1a')
    ),

    /**
     * CLIMB — ladder.
     * This was already one of the better silhouettes.
     */
    [SKILLS.CLIMB]: _skill('skill-climb',
        r(4, 2, 4, 20, '#1b4d1f'),
        r(5, 3, 2, 18, '#66bb6a'),
        r(5, 3, 1, 18, '#c8e6c9'),

        r(16, 2, 4, 20, '#1b4d1f'),
        r(17, 3, 2, 18, '#66bb6a'),
        r(17, 3, 1, 18, '#c8e6c9'),

        r(7, 4, 10, 2, '#1b4d1f'),
        r(8, 4, 8, 1, '#66bb6a'),
        r(9, 4, 5, 1, '#c8e6c9'),

        r(7, 9, 10, 2, '#1b4d1f'),
        r(8, 9, 8, 1, '#66bb6a'),
        r(9, 9, 5, 1, '#c8e6c9'),

        r(7, 14, 10, 2, '#1b4d1f'),
        r(8, 14, 8, 1, '#66bb6a'),
        r(9, 14, 5, 1, '#c8e6c9'),

        r(7, 19, 10, 2, '#1b4d1f'),
        r(8, 19, 8, 1, '#66bb6a'),
        r(9, 19, 5, 1, '#c8e6c9')
    ),

    /**
     * BOOM — simple round bomb + fuse spark.
     * Strong circular silhouette.
     */
    [SKILLS.EXPLODE]: _skill('skill-boom',
        r(8, 8, 8, 2, '#5e1e0a'),
        r(6, 10, 12, 7, '#5e1e0a'),
        r(8, 17, 8, 2, '#5e1e0a'),
        r(10, 19, 4, 1, '#5e1e0a'),

        r(9, 9, 6, 1, '#f4511e'),
        r(7, 11, 10, 5, '#f4511e'),
        r(8, 16, 8, 1, '#c23a14'),

        r(8, 11, 3, 3, '#ffab91'),
        r(8, 14, 2, 2, '#ffffff'),

        r(11, 4, 3, 4, '#5e1e0a'),
        r(12, 5, 1, 2, '#9aa0a6'),

        r(13, 2, 2, 2, '#5e1e0a'),
        r(15, 1, 2, 2, '#5e1e0a'),
        r(17, 0, 2, 2, '#ffeb3b'),
        r(18, 2, 1, 1, '#fff3b0')
    )
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
