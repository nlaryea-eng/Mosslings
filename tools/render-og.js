#!/usr/bin/env node
'use strict';
/**
 * MOSSLINGS — rasterize the Open Graph card.
 *
 * assets/og-card.svg is the editable source; some social scrapers prefer a raster
 * (and a fixed 1200x630). This renders the SVG to assets/og-card.png with the
 * Chromium that Playwright already installs for the e2e tests — no new dep. Run
 * after editing the SVG:  node tools/render-og.js
 */
const fs = require('fs');
const path = require('path');
const { chromium } = require('@playwright/test');

(async () => {
    const root = path.join(__dirname, '..');
    const svg = fs.readFileSync(path.join(root, 'assets', 'og-card.svg'), 'utf8');
    const out = path.join(root, 'assets', 'og-card.png');

    const browser = await chromium.launch();
    const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
    await page.setContent(`<!doctype html><html><body style="margin:0;padding:0;width:1200px;height:630px">${svg}</body></html>`,
        { waitUntil: 'networkidle' });
    await page.screenshot({ path: out, clip: { x: 0, y: 0, width: 1200, height: 630 } });
    await browser.close();

    const kb = (fs.statSync(out).size / 1024).toFixed(0);
    console.log(`wrote assets/og-card.png (${kb} KB, 1200x630)`);
})();
