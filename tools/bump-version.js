#!/usr/bin/env node
'use strict';
/**
 * MOSSLINGS — release/cache-bust coherence helper.
 *
 * `package.json` "version" is the single source of truth for a release. Static
 * hosting (and the GitHub Pages deploy) caches assets aggressively, so every
 * `<script>`/`<link>`/@font-face URL carries a `?v=` query string. This script
 * keeps three things consistent off that one version:
 *
 *   1. the `?v=` cache-bust label in index.html / style.css
 *   2. the APP_VERSION constant in js/constants.js (what the app reports)
 *   3. (optionally) the package.json version itself, if you pass a new semver
 *
 * Usage:
 *     node tools/bump-version.js                # label = <pkgVersion>-<YYYYMMDD>
 *     node tools/bump-version.js 1.2.0          # set package.json to 1.2.0 first
 *     node tools/bump-version.js 20260617-foo   # explicit raw cache label
 *
 * A bare semver (x.y.z) updates package.json + APP_VERSION and derives the
 * dated cache label from it. Any other label is used verbatim as the cache key.
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const pkgPath = path.join(root, 'package.json');
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));

const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
const arg = process.argv[2];
const isSemver = (s) => /^\d+\.\d+\.\d+$/.test(s);

let cacheLabel;
if (arg && isSemver(arg)) {
    // Promote package.json to the new release, then derive the dated cache key.
    pkg.version = arg;
    fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
    cacheLabel = `${arg}-${stamp}`;
    console.log(`  package.json: version -> ${arg}`);
} else if (arg) {
    cacheLabel = arg;                              // explicit raw label
} else {
    cacheLabel = `${pkg.version}-${stamp}`;        // default: track package version
}

// Keep the in-app version constant equal to package.json (source of truth).
const constPath = path.join(root, 'js', 'constants.js');
const constSrc = fs.readFileSync(constPath, 'utf8');
const nextConst = constSrc.replace(/const APP_VERSION = '[^']*';/, `const APP_VERSION = '${pkg.version}';`);
if (nextConst !== constSrc) {
    fs.writeFileSync(constPath, nextConst);
    console.log(`  js/constants.js: APP_VERSION -> ${pkg.version}`);
}

let total = 0;
for (const f of ['index.html', 'style.css']) {
    const p = path.join(root, f);
    const src = fs.readFileSync(p, 'utf8');
    const refs = (src.match(/\?v=[\w.-]+/g) || []).length;
    fs.writeFileSync(p, src.replace(/\?v=[\w.-]+/g, `?v=${cacheLabel}`));
    total += refs;
    console.log(`  ${f}: ${refs} refs`);
}
console.log(`Cache version -> ${cacheLabel}  (${total} refs; app v${pkg.version})`);
