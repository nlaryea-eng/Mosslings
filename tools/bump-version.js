#!/usr/bin/env node
'use strict';
/**
 * MOSSLINGS — cache-bust helper.
 *
 * Static hosting (and the GitHub Pages deploy) caches assets aggressively, so
 * every `<script>`/`<link>`/@font-face URL carries a `?v=` query string. Rather
 * than hand-edit ~13 of them per ship (error-prone — a missed one serves stale
 * code), bump them all in one go:
 *
 *     node tools/bump-version.js                 # auto: YYYYMMDD-<base36 stamp>
 *     node tools/bump-version.js 20260617-foo    # explicit label
 *
 * The single source of truth is the argument; this script is the "one value".
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
const version = process.argv[2] || `${stamp}-${Date.now().toString(36).slice(-4)}`;
const files = ['index.html', 'style.css'];

let total = 0;
for (const f of files) {
    const p = path.join(root, f);
    const src = fs.readFileSync(p, 'utf8');
    const refs = (src.match(/\?v=[\w.-]+/g) || []).length;
    fs.writeFileSync(p, src.replace(/\?v=[\w.-]+/g, `?v=${version}`));
    total += refs;
    console.log(`  ${f}: ${refs} refs`);
}
console.log(`Cache version -> ${version}  (${total} refs across ${files.length} files)`);
