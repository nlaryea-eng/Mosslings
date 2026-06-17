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

test('landscape-phone board reclaims chrome height (bigger than the old 457x257 cap)', async ({ page }) => {
    await page.setViewportSize({ width: 667, height: 375 });
    await page.addInitScript(seedProgress);
    await page.goto('/');
    await page.locator('#btn-start').click();
    await expect(page.locator('#gameCanvas')).toBeVisible();
    // The board grows when the landscape chrome budget shrinks. Guard the win so
    // a future regression that re-bloats the HUD/toolbar is caught.
    const box = await page.locator('#gameCanvas').boundingBox();
    expect(box.width, `canvas only ${Math.round(box.width)}px wide`).toBeGreaterThan(457);
    expect(box.height, `canvas only ${Math.round(box.height)}px tall`).toBeGreaterThan(257);
    // ...and the toolbar must still be fully on-screen (the cap exists to protect it).
    const toolbarFits = await page.locator('#toolbar').evaluate(
        (el) => el.getBoundingClientRect().bottom <= window.innerHeight + 1);
    expect(toolbarFits, 'toolbar pushed below the viewport').toBeTruthy();
});

test('first run shows only Play, then the full menu returns once Level 1 is cleared', async ({ page }) => {
    // No seedProgress: a brand-new player (unlocked === 0) gets the stripped menu.
    await page.goto('/');
    await expect(page.locator('#start-screen')).toHaveClass(/first-run/);
    await expect(page.locator('#btn-start')).toHaveText(/start playing/i);
    await expect(page.locator('#level-select-container')).toBeHidden();
    await expect(page.locator('#daily-card')).toBeHidden();
    await expect(page.locator('#btn-editor')).toBeHidden();
    await expect(page.locator('.controls-disc')).toBeHidden();

    // Clearing Level 1 persists the unlock the same way game.js does on a win;
    // reload so the whole app boots fresh in the unlocked state.
    await page.evaluate(() => storage.setUnlocked(1));
    await page.reload();
    await expect(page.locator('#start-screen')).not.toHaveClass(/first-run/);
    await expect(page.locator('#btn-start')).toHaveText(/^play$/i);
    await expect(page.locator('#level-select-container')).toBeVisible();
    await expect(page.locator('#daily-card')).toBeVisible();
    await expect(page.locator('#btn-editor')).toBeVisible();
    await expect(page.locator('.controls-disc')).toBeVisible();
});

test('mute preference persists across reload', async ({ page }) => {
    await page.addInitScript(seedProgress);
    await page.goto('/');
    await page.locator('#btn-start').click();             // user gesture arms audio
    await page.locator('#btn-mute').click();              // mute
    expect(await page.evaluate(() => localStorage.getItem('mosslings.audioMuted'))).toBe('1');

    await page.reload();
    expect(await page.evaluate(() => localStorage.getItem('mosslings.audioMuted'))).toBe('1');
    // The audio engine should boot already-muted, not just remember the string.
    expect(await page.evaluate(() => audio.muted)).toBe(true);
});

test('daily challenge card starts today\'s deterministic level', async ({ page }) => {
    await page.addInitScript(seedProgress);
    await page.goto('/');
    await expect(page.locator('#daily-card')).toBeVisible();
    await expect(page.locator('#daily-title')).toContainText(/^\d{4}-\d{2}-\d{2}/);
    await page.locator('#btn-daily').click();
    await expect(page.locator('#gameCanvas')).toBeVisible();

    const daily = await page.evaluate(() => ({
        state: ui.game.state,
        mode: ui.game.runMode,
        key: ui.game.dailyChallenge && ui.game.dailyChallenge.key,
        label: document.getElementById('lbl-level').innerText,
    }));
    expect(daily.state).toBe('PLAY');
    expect(daily.mode).toBe('daily');
    expect(daily.key).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(daily.label).toContain(`Daily ${daily.key}`);
});

test('daily deep link opens the requested challenge directly', async ({ page }) => {
    await page.goto('/?daily=2026-06-17');
    await expect(page.locator('#gameCanvas')).toBeVisible();
    const daily = await page.evaluate(() => ({
        mode: ui.game.runMode,
        key: ui.game.dailyChallenge && ui.game.dailyChallenge.key,
        idx: ui.game.levelIdx,
        expected: dailyChallengeForDate('2026-06-17').levelIdx,
    }));
    expect(daily.mode).toBe('daily');
    expect(daily.key).toBe('2026-06-17');
    expect(daily.idx).toBe(daily.expected);
});
