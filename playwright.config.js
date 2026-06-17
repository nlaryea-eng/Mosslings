'use strict';
// Playwright drives a real Chromium against the static site (served exactly as
// it ships — no build). CI-only tooling; the game itself stays dependency-free.
const { defineConfig, devices } = require('@playwright/test');

const PORT = 8799;

module.exports = defineConfig({
    testDir: './tests/e2e',
    timeout: 30000,
    expect: { timeout: 5000 },
    forbidOnly: !!process.env.CI,
    reporter: process.env.CI ? 'line' : 'list',
    use: {
        baseURL: `http://127.0.0.1:${PORT}`,
        trace: 'on-first-retry',
    },
    webServer: {
        command: `python3 -m http.server ${PORT}`,
        url: `http://127.0.0.1:${PORT}`,
        reuseExistingServer: !process.env.CI,
        timeout: 30000,
    },
    projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
