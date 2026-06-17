'use strict';
/**
 * MOSSLINGS — browser smoke + layout-regression guard.
 *
 * The Node suite (tests/run-tests.js) covers logic against a stubbed DOM; this
 * is the first *real-browser* net. It directly guards the world-carousel menu
 * contract and confirms the game boots clean, starts, and stays usable at
 * landscape-phone size.
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

function stubPngClipboard() {
    window.__cardWrites = 0;
    window.__cardTypes = [];
    window.ClipboardItem = class {
        constructor(items) { this.items = items; }
    };
    Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: {
            write: async (items) => {
                window.__cardWrites += items.length;
                window.__cardTypes = Object.keys(items[0].items || {});
            },
            writeText: async () => {},
        },
    });
}

async function startFromContinue(page) {
    await expect(page.locator('#continue-hero')).toBeVisible();
    await page.locator('#continue-hero').click();
    await expect(page.locator('#gameCanvas')).toBeVisible();
}

async function startLevelFromRail(page, levelIdx) {
    const world = Math.floor(levelIdx / 7);
    await page.locator(`.world-card[data-world="${world}"]`).click();
    await page.locator(`.level-node[data-level="${levelIdx}"]`).click();
    await expect(page.locator('#gameCanvas')).toBeVisible();
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

test('world carousel cards and selected detail do not overflow their borders', async ({ page }) => {
    await page.addInitScript(seedProgress);
    await page.goto('/');
    const cards = page.locator('#world-carousel .world-card');
    await expect(cards.first()).toBeVisible();
    const count = await cards.count();
    expect(count).toBeGreaterThan(2);
    for (let i = 0; i < count; i++) {
        // scrollHeight/Width report full content size even under overflow:hidden,
        // so this catches clipped overflow too — the exact regression we hit.
        const fits = await cards.nth(i).evaluate((el) =>
            el.scrollHeight <= el.clientHeight + 1 && el.scrollWidth <= el.clientWidth + 1);
        expect(fits, `world card ${i + 1} content overflows the card`).toBeTruthy();
    }
    await expect(page.locator('#world-carousel .world-card.is-selected')).toBeVisible();
    await expect(page.locator('#world-carousel .world-card.is-locked')).toBeVisible();
    await expect(page.locator('#world-detail')).toBeVisible();
    await expect(page.locator('#world-detail .level-node')).toHaveCount(7);
});

test('world navigation surfaces a recommended level and one missing medal target', async ({ page }) => {
    await page.addInitScript(seedProgress);
    await page.goto('/');
    await expect(page.locator('#continue-hero')).toBeVisible();
    await expect(page.locator('#world-detail .world-next-callout')).toContainText(/Recommended next/i);
    await page.locator('.world-card[data-world="0"]').click();
    const goal = page.locator('#world-detail .level-node.has-goal .level-meta').first();
    await expect(goal).toBeVisible();
    await expect(goal).toHaveText(/^(SAVE \d+|SK<=\d+|T<\d+:\d{2})$/);
    const aria = await page.locator('#world-detail .level-node.has-goal').first().getAttribute('aria-label');
    expect(aria).toContain('next target:');

    await page.locator('#world-carousel').focus();
    await page.keyboard.press('ArrowRight');
    await expect(page.locator('#world-carousel .world-card.is-selected')).toContainText('Trial Hollows');
});

test('starting a level shows the board and the full 8-skill toolbar', async ({ page }) => {
    await page.addInitScript(seedProgress);
    await page.goto('/');
    await startFromContinue(page);
    await expect(page.locator('#gameCanvas')).toBeVisible();
    await expect(page.locator('#toolbar')).toBeVisible();
    await expect(page.locator('.skill-btn')).toHaveCount(8);
});

test('landscape-phone keeps the toolbar usable with no horizontal overflow', async ({ page }) => {
    await page.setViewportSize({ width: 667, height: 375 });
    await page.addInitScript(seedProgress);
    await page.goto('/');
    await startFromContinue(page);
    await expect(page.locator('#toolbar')).toBeVisible();
    const overflows = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    expect(overflows, 'page overflows horizontally on a landscape phone').toBeFalsy();
});

test('landscape-phone board reclaims chrome height (bigger than the old 457x257 cap)', async ({ page }) => {
    await page.setViewportSize({ width: 667, height: 375 });
    await page.addInitScript(seedProgress);
    await page.goto('/');
    await startFromContinue(page);
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
    await expect(page.locator('#world-menu')).toBeHidden();
    await expect(page.locator('#menu-secondary-actions')).toBeHidden();
    await expect(page.locator('#btn-editor')).toBeHidden();
    await expect(page.locator('.controls-disc')).toBeHidden();

    // Clearing Level 1 persists the unlock the same way game.js does on a win;
    // reload so the whole app boots fresh in the unlocked state.
    await page.evaluate(() => storage.setUnlocked(1));
    await page.reload();
    await expect(page.locator('#start-screen')).not.toHaveClass(/first-run/);
    await expect(page.locator('#btn-start')).toBeHidden();
    await expect(page.locator('#continue-hero')).toBeVisible();
    await expect(page.locator('#world-menu')).toBeVisible();
    await expect(page.locator('#world-carousel .world-card')).toHaveCount(3);
    await expect(page.locator('#daily-card')).toBeVisible();
    await expect(page.locator('#btn-editor')).toBeVisible();
    await expect(page.locator('.controls-disc')).toBeVisible();
});

test('mute preference persists across reload', async ({ page }) => {
    await page.addInitScript(seedProgress);
    await page.goto('/');
    await startFromContinue(page);                        // user gesture arms audio
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

test('result overlay renders and copies a PNG share card', async ({ page }) => {
    const errors = [];
    page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()); });
    page.on('pageerror', (err) => errors.push(String(err)));
    await page.addInitScript(seedProgress);
    await page.addInitScript(stubPngClipboard);
    await page.goto('/');
    await startFromContinue(page);
    await page.evaluate(() => {
        ui.game.savedCount = ui.game.level.reqSaved;
        ui.game.skillsUsed = 3;
        ui.game.time = (ui.game.level.time - 42) * 60;
        ui.game.deadCount = 0;
        ui.game.spawnCounter = ui.game.level.totalSpawn;
        ui.game.mosslings = [];
        ui.game.endLevel();
    });
    await expect(page.locator('#message-overlay')).toBeVisible();
    await expect(page.locator('#result-card-preview')).toBeVisible();
    const card = await page.locator('#result-card-preview').evaluate((canvas) => ({
        w: canvas.width,
        h: canvas.height,
        isPng: canvas.toDataURL('image/png').startsWith('data:image/png;base64,'),
        cssWidth: canvas.getBoundingClientRect().width,
    }));
    expect(card.w).toBe(1200);
    expect(card.h).toBe(630);
    expect(card.isPng).toBe(true);
    expect(card.cssWidth).toBeGreaterThan(200);

    await page.locator('#msg-btn-card').click();
    await expect(page.locator('#toast')).toContainText('Result card copied as PNG!');
    const writes = await page.evaluate(() => ({ count: window.__cardWrites, types: window.__cardTypes }));
    expect(writes.count).toBe(1);
    expect(writes.types).toContain('image/png');
    expect(errors, `console/page errors:\n${errors.join('\n')}`).toEqual([]);
});

test('result overlay shows win-streak momentum and a specific medal retry target', async ({ page }) => {
    await page.addInitScript(() => {
        localStorage.setItem('mosslings_unlocked', '8');
        localStorage.setItem('mosslings_best', JSON.stringify({ 0: 100 }));
        localStorage.setItem('mosslings_medals', JSON.stringify({ 0: { saved: 1, skills: 0, time: 0 } }));
        localStorage.setItem('mosslings_streak', JSON.stringify({ current: 1, best: 1 }));
    });
    await page.goto('/');
    await startLevelFromRail(page, 0);
    await page.evaluate(() => {
        const g = ui.game;
        g.savedCount = g.level.totalSpawn;
        g.skillsUsed = g.level.par.skills + 2; // miss efficiency, keep rescue
        g.time = (g.level.time - g.level.par.time - 10) * 60; // also miss speed, but skills is first target
        g.endLevel();
    });
    await expect(page.locator('#msg-progress')).toBeVisible();
    await expect(page.locator('#msg-progress')).toContainText('STREAK 2');
    await expect(page.locator('#msg-progress')).toContainText('Next target: use 3 or fewer skills');
    await expect(page.locator('#msg-btn-retry')).toHaveText('Retry: SK<=3');
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('mosslings_streak')).current)).toBe(2);
});

test('on-screen Rewind button is available in play and steps the sim back', async ({ page }) => {
    await page.addInitScript(seedProgress);
    await page.goto('/');
    await startFromContinue(page);
    await expect(page.locator('#btn-rewind')).toBeVisible();
    // Advance past the 5s rewind window, then PAUSE so the live RAF loop can't
    // advance simStep between this read and the button click (rewind works while
    // paused). That makes the step-count assertion deterministic.
    const before = await page.evaluate(() => {
        const g = ui.game;
        for (let i = 0; i < 360; i++) g.update();
        if (g.state === 'PLAY') g.togglePause();
        return g.simStep;
    });
    expect(before).toBeGreaterThanOrEqual(300);
    await page.locator('#btn-rewind').click();
    const after = await page.evaluate(() => ui.game.simStep);
    expect(after, 'rewind steps the sim ~5s (300 steps) back').toBe(before - 300);
});

test('a loss leads with Retry (no brag card); a win shows the next-level pull', async ({ page }) => {
    await page.addInitScript(seedProgress);
    await page.goto('/');
    await startFromContinue(page);
    // Force a loss: time out with nobody saved.
    await page.evaluate(() => {
        const g = ui.game;
        g.savedCount = 0; g.time = 0; g.spawnCounter = g.level.totalSpawn; g.mosslings = []; g.update();
    });
    await expect(page.locator('#message-overlay')).toBeVisible();
    await expect(page.locator('#result-card-preview')).toBeHidden();      // no brag card on a loss
    await expect(page.locator('#msg-btn-card')).toBeHidden();
    await expect(page.locator('#msg-btn-primary')).toHaveText(/^retry$/i);
    expect(await page.evaluate(() => document.getElementById('message-overlay').classList.contains('has-result-card'))).toBe(false);

    // A campaign win names the next level and emphasizes the button.
    await page.locator('#msg-btn-primary').click();                       // retry → back into the level
    await page.evaluate(() => { const g = ui.game; g.savedCount = g.level.totalSpawn; g.endLevel(); });
    await expect(page.locator('#result-card-preview')).toBeVisible();     // brag card returns on a win
    await expect(page.locator('#msg-btn-primary')).toContainText('Next');
    expect(await page.evaluate(() => document.getElementById('msg-btn-primary').classList.contains('primary-next'))).toBe(true);
});

test('a loss shows a failure diagnosis chip and arms a render-only retry hint', async ({ page }) => {
    await page.addInitScript(seedProgress);
    await page.goto('/');
    await startFromContinue(page);
    // Record a deterministic fatal-fall, then end the level as a loss.
    await page.evaluate(() => {
        const g = ui.game;
        g.recordDeath('cliff', 300, 250);
        g.savedCount = 0; g.time = 0; g.spawnCounter = g.level.totalSpawn; g.mosslings = []; g.update();
    });
    await expect(page.locator('#message-overlay')).toBeVisible();
    await expect(page.locator('#msg-diagnosis')).toBeVisible();
    await expect(page.locator('#msg-diagnosis')).toContainText(/fatal fall/i);
    expect(await page.evaluate(() => !!(ui.game.retryHint && ui.game.retryHint.key))).toBe(true);

    // Retry arms a render-only marker that is NEVER written to the action log.
    await page.locator('#msg-btn-primary').click();
    const hint = await page.evaluate(() => ({
        has: !!ui.game.failHint,
        kind: ui.game.failHint && ui.game.failHint.kind,
        logged: ui.game.actionLog.some(a => a.type === 'hint'),
    }));
    expect(hint.has).toBe(true);
    expect(hint.kind).toBe('cliff');
    expect(hint.logged).toBe(false);
});

test('landscape-phone result makes the primary action visually dominant', async ({ page }) => {
    await page.setViewportSize({ width: 667, height: 375 });
    await page.addInitScript(seedProgress);
    await page.goto('/');
    await startFromContinue(page);
    await page.evaluate(() => { const g = ui.game; g.savedCount = g.level.totalSpawn; g.endLevel(); });
    await expect(page.locator('#message-overlay')).toBeVisible();
    const m = await page.evaluate(() => {
        const fs = (id) => parseFloat(getComputedStyle(document.getElementById(id)).fontSize);
        const menu = document.getElementById('msg-btn-menu');
        const primary = document.getElementById('msg-btn-primary');
        return {
            primaryFs: fs('msg-btn-primary'), menuFs: fs('msg-btn-menu'),
            menuFits: menu.getBoundingClientRect().bottom <= window.innerHeight + 1,
            primaryFits: primary.getBoundingClientRect().right <= window.innerWidth + 1,
        };
    });
    expect(m.primaryFs).toBeGreaterThan(m.menuFs);   // Next/Retry dominant over Menu
    expect(m.menuFits).toBeTruthy();                 // everything still on-screen
    expect(m.primaryFits).toBeTruthy();
});

test('editor refuses to save a structurally invalid level', async ({ page }) => {
    await page.addInitScript(seedProgress);
    await page.goto('/');
    await page.locator('#btn-editor').click();   // opens with empty terrain (spawn over a pit)
    await expect(page.locator('#editor-ui')).toBeVisible();

    const before = await page.evaluate(() => storage.getCustomLevels().length);
    await page.locator('#btn-edit-save').click();

    // A specific error toast, no save, and the editor stays open (not back at menu).
    await expect(page.locator('#toast')).toBeVisible();
    await expect(page.locator('#toast')).toContainText(/can.?t save/i);
    await expect(page.locator('#editor-ui')).toBeVisible();
    await expect(page.locator('#start-screen')).toBeHidden();
    const after = await page.evaluate(() => storage.getCustomLevels().length);
    expect(after).toBe(before);
});
