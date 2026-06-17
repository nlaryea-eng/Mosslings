'use strict';
/**
 * MOSSLINGS — browser smoke + layout-regression guard.
 *
 * The Node suite (tests/run-tests.js) covers logic against a stubbed DOM; this
 * is the first *real-browser* net. It directly guards the class of bug that hit
 * the level-select cards (medal art overflowing the card) and confirms the game
 * boots clean, starts, and stays usable at landscape-phone size.
 */
const { test, expect } = require('@playwright/test');

// Seed a progressed save so the menu renders the worst case: every level
// unlocked, with best-% and a full medal stack on each card.
function seedProgress() {
    localStorage.setItem('mosslings_unlocked', '8');
    localStorage.setItem('mosslings_best', JSON.stringify({ 0: 100, 1: 83, 2: 91, 3: 67, 4: 100, 5: 45, 6: 78, 7: 88, 8: 100 }));
    const m = (s, k, t) => ({ saved: s, skills: k, time: t });
    localStorage.setItem('mosslings_medals', JSON.stringify({
        0: m(1, 1, 1), 1: m(1, 0, 1), 2: m(1, 1, 0), 3: m(1, 0, 0), 4: m(1, 1, 1), 5: m(0, 0, 0), 6: m(1, 1, 0), 7: m(1, 0, 1), 8: m(1, 1, 1),
    }));
}

test('boots with no console/page errors and shows the menu', async ({ page }) => {
    const errors = [];
    page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()); });
    page.on('pageerror', (err) => errors.push(String(err)));
    await page.addInitScript(seedProgress);
    await page.goto('/');
    await expect(page.locator('#start-screen .logo')).toContainText('MOSSLINGS');
    await expect(page.locator('#start-screen')).toBeVisible();
    expect(errors, `console/page errors:\n${errors.join('\n')}`).toEqual([]);
});

test('level-select cards do not overflow their borders', async ({ page }) => {
    await page.addInitScript(seedProgress);
    await page.goto('/');
    const cards = page.locator('#level-select-container .lvl-btn');
    await expect(cards.first()).toBeVisible();
    const count = await cards.count();
    expect(count).toBeGreaterThan(0);
    for (let i = 0; i < count; i++) {
        // scrollHeight/Width report full content size even under overflow:hidden,
        // so this catches clipped overflow too — the exact regression we hit.
        const fits = await cards.nth(i).evaluate((el) =>
            el.scrollHeight <= el.clientHeight + 1 && el.scrollWidth <= el.clientWidth + 1);
        expect(fits, `level card ${i + 1} content overflows the card`).toBeTruthy();
    }
});

test('starting a level shows the board and the full 8-skill toolbar', async ({ page }) => {
    await page.addInitScript(seedProgress);
    await page.goto('/');
    await page.locator('#btn-start').click();
    await expect(page.locator('#gameCanvas')).toBeVisible();
    await expect(page.locator('#toolbar')).toBeVisible();
    await expect(page.locator('.skill-btn')).toHaveCount(8);
});

test('landscape-phone keeps the toolbar usable with no horizontal overflow', async ({ page }) => {
    await page.setViewportSize({ width: 667, height: 375 });
    await page.addInitScript(seedProgress);
    await page.goto('/');
    await page.locator('#btn-start').click();
    await expect(page.locator('#toolbar')).toBeVisible();
    const overflows = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    expect(overflows, 'page overflows horizontally on a landscape phone').toBeFalsy();
});
