'use strict';
/**
 * MOSSLINGS — tiny hand-drawn pixel glyphs.
 * Inline SVG keeps every platform on the same 16x16 art instead of relying on
 * emoji fonts. Keep shapes coarse: these are tuned for phone toolbar size.
 */
const pixelSvg = (body, cls = '') =>
    `<svg class="pixel-icon ${cls}" viewBox="0 0 16 16" aria-hidden="true" focusable="false" shape-rendering="crispEdges">${body}</svg>`;

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
    trophy: pixelSvg(r(5, 2, 6, 2) + r(4, 4, 8, 3) + r(3, 5, 2, 3) + r(11, 5, 2, 3) + r(6, 7, 4, 3) + r(7, 10, 2, 2) + r(5, 12, 6, 2), 'ui-icon'),
    medalSilver: pixelSvg(r(4, 2, 2, 4) + r(10, 2, 2, 4) + r(5, 5, 6, 2) + r(4, 7, 8, 6) + r(6, 9, 4, 2, '#ffffff'), 'ui-icon'),
    medalBronze: pixelSvg(r(3, 2, 3, 4) + r(10, 2, 3, 4) + r(5, 5, 6, 2) + r(4, 7, 8, 6) + r(7, 8, 2, 4, '#ffe0b2'), 'ui-icon'),
    share: pixelSvg(r(3, 3, 4, 4) + r(10, 2, 4, 4) + r(10, 10, 4, 4) + r(7, 5, 3, 2) + r(7, 9, 3, 2), 'ui-icon'),
    edit: pixelSvg(r(3, 11, 3, 2) + r(5, 9, 2, 2) + r(7, 7, 2, 2) + r(9, 5, 2, 2) + r(11, 3, 2, 2), 'ui-icon'),
    close: pixelSvg(r(3, 3, 2, 2) + r(5, 5, 2, 2) + r(7, 7, 2, 2) + r(9, 9, 2, 2) + r(11, 11, 2, 2) + r(11, 3, 2, 2) + r(9, 5, 2, 2) + r(5, 9, 2, 2) + r(3, 11, 2, 2), 'ui-icon'),
    settings: pixelSvg(r(7, 1, 2, 3) + r(7, 12, 2, 3) + r(1, 7, 3, 2) + r(12, 7, 3, 2) + r(5, 5, 6, 6) + r(7, 7, 2, 2, '#0a0f0b'), 'ui-icon'),
    undo: pixelSvg(r(4, 3, 6, 2) + r(3, 5, 2, 2) + r(2, 7, 8, 2) + r(10, 9, 2, 2) + r(8, 11, 4, 2), 'ui-icon'),
};

const SKILL_ICONS = {
    [SKILLS.BLOCK]: pixelSvg(r(6, 2, 4, 10) + r(4, 5, 8, 2) + r(3, 12, 10, 2), 'skill-icon skill-block'),
    [SKILLS.BUILD]: pixelSvg(r(3, 11, 4, 2) + r(7, 9, 4, 2) + r(11, 7, 3, 2) + r(2, 13, 12, 2) + r(10, 2, 2, 5) + r(12, 3, 2, 2), 'skill-icon skill-build'),
    [SKILLS.BASH]: pixelSvg(r(3, 8, 6, 4) + r(8, 6, 5, 5) + r(11, 5, 3, 2) + r(4, 12, 4, 2), 'skill-icon skill-bash'),
    [SKILLS.MINE]: pixelSvg(r(4, 3, 8, 2) + r(8, 5, 2, 3) + r(7, 8, 2, 2) + r(6, 10, 2, 2) + r(5, 12, 2, 2) + r(10, 7, 2, 2), 'skill-icon skill-mine'),
    [SKILLS.DIG]: pixelSvg(r(6, 2, 2, 8) + r(8, 8, 2, 2) + r(4, 10, 8, 3) + r(5, 13, 6, 2), 'skill-icon skill-dig'),
    [SKILLS.FLOAT]: pixelSvg(r(4, 4, 8, 2) + r(3, 6, 10, 2) + r(5, 8, 2, 2) + r(9, 8, 2, 2) + r(7, 8, 2, 6), 'skill-icon skill-float'),
    [SKILLS.CLIMB]: pixelSvg(r(4, 2, 2, 12) + r(10, 2, 2, 12) + r(4, 4, 8, 2) + r(4, 8, 8, 2) + r(7, 6, 2, 2) + r(8, 10, 2, 2), 'skill-icon skill-climb'),
    [SKILLS.EXPLODE]: pixelSvg(r(7, 1, 2, 4) + r(4, 4, 8, 2) + r(2, 7, 12, 3) + r(4, 10, 8, 2) + r(6, 12, 4, 3), 'skill-icon skill-boom'),
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
