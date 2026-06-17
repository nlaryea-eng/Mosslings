'use strict';
/**
 * MOSSLINGS — browser smoke + layout-regression guard.
 *
 * The Node suite (tests/run-tests.js) covers logic against a stubbed DOM; this
 * is the first *real-browser* net. It directly guards the grove-carousel menu
 * contract and confirms the game boots clean, starts, and stays usable at
 * landscape-phone size.
 */
const { test, expect } = require('@playwright/test');

// Seed a progressed *and tenured* save: into Grove 2 with a full medal stack,
// plus a first-play date weeks ago — i.e. a returning player for whom every
// staged surface (carousel, daily, editor, gallery) has unlocked. This is the
// menu's worst case for layout and the common case for feature visibility.
function seedProgress() {
    localStorage.setItem('mosslings_unlocked', '8');
    localStorage.setItem('mosslings_firstSeenAt', JSON.stringify('2026-01-01T00:00:00.000Z'));
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
    const grove = Math.floor(levelIdx / 7);
    await page.locator(`.grove-card[data-grove="${grove}"]`).click();
    await page.locator(`.patch-node[data-patch="${levelIdx}"]`).click();
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

test('grove carousel cards and selected detail do not overflow their borders', async ({ page }) => {
    await page.addInitScript(seedProgress);
    await page.goto('/');
    const cards = page.locator('#grove-carousel .grove-card');
    await expect(cards.first()).toBeVisible();
    const count = await cards.count();
    expect(count).toBeGreaterThan(2);
    for (let i = 0; i < count; i++) {
        // scrollHeight/Width report full content size even under overflow:hidden,
        // so this catches clipped overflow too — the exact regression we hit.
        const fits = await cards.nth(i).evaluate((el) =>
            el.scrollHeight <= el.clientHeight + 1 && el.scrollWidth <= el.clientWidth + 1);
        expect(fits, `grove card ${i + 1} content overflows the card`).toBeTruthy();
    }
    await expect(page.locator('#grove-carousel .grove-card.is-selected')).toBeVisible();
    await expect(page.locator('#grove-carousel .grove-card.is-locked')).toBeVisible();
    await expect(page.locator('#grove-detail')).toBeVisible();
    await expect(page.locator('#grove-detail .patch-node')).toHaveCount(7);
});

test('grove navigation surfaces a recommended level and one missing medal target', async ({ page }) => {
    await page.addInitScript(seedProgress);
    await page.goto('/');
    await expect(page.locator('#continue-hero')).toBeVisible();
    await expect(page.locator('#grove-detail .grove-next-callout')).toContainText(/Recommended next/i);
    await page.locator('.grove-card[data-grove="0"]').click();
    const goal = page.locator('#grove-detail .patch-node.has-goal .patch-meta').first();
    await expect(goal).toBeVisible();
    await expect(goal).toHaveText(/^(SAVE \d+|SK<=\d+|T<\d+:\d{2})$/);
    const aria = await page.locator('#grove-detail .patch-node.has-goal').first().getAttribute('aria-label');
    expect(aria).toContain('next target:');

    await page.locator('#grove-carousel').focus();
    await page.keyboard.press('ArrowRight');
    await expect(page.locator('#grove-carousel .grove-card.is-selected')).toContainText('Trial Hollows');
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

test('portrait phone keeps Daily Ghost card readable without horizontal overflow', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.addInitScript(seedProgress);
    await page.goto('/');
    await expect(page.locator('#daily-card')).toBeVisible();
    await expect(page.locator('#btn-daily')).toHaveText('Play Today\'s Puzzle');
    const overflows = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    expect(overflows, 'page overflows horizontally on a portrait phone').toBeFalsy();
});

test('onboarding paces feature reveals by progression instead of dumping them at once', async ({ page }) => {
    // Newcomer (unlocked === 0): exactly one obvious thing to do.
    await page.goto('/');
    await expect(page.locator('#start-screen')).toHaveClass(/first-run/);
    await expect(page.locator('#btn-start')).toHaveText(/start playing/i);
    await expect(page.locator('#grove-menu')).toBeHidden();
    await expect(page.locator('#menu-secondary-actions')).toBeHidden();
    await expect(page.locator('#btn-editor')).toBeHidden();
    await expect(page.locator('.controls-disc')).toBeHidden();

    // Learning (cleared Level 1, still inside Grove 1): the carousel and controls
    // arrive, but the daily and editor are deliberately still withheld.
    await page.evaluate(() => storage.setUnlocked(1));
    await page.reload();
    await expect(page.locator('#start-screen')).not.toHaveClass(/first-run/);
    await expect(page.locator('#btn-start')).toBeHidden();
    await expect(page.locator('#continue-hero')).toBeVisible();
    await expect(page.locator('#grove-menu')).toBeVisible();
    await expect(page.locator('#grove-carousel .grove-card')).toHaveCount(3);
    await expect(page.locator('.controls-disc')).toBeVisible();
    await expect(page.locator('#daily-card')).toBeHidden();
    await expect(page.locator('#btn-editor')).toBeHidden();
    await expect(page.locator('#menu-secondary-actions')).toBeHidden();

    // Explorer (reached Grove 2): the daily/ghost loop unlocks with a NEW badge;
    // the editor stays gated for a same-day sprinter.
    await page.evaluate(() => storage.setUnlocked(7));
    await page.reload();
    await expect(page.locator('#daily-card')).toBeVisible();
    await expect(page.locator('#daily-card')).toHaveClass(/menu-new/);
    await expect(page.locator('#btn-editor')).toBeHidden();

    // Veteran (reached Grove 3): the editor finally unlocks, also flagged NEW.
    await page.evaluate(() => storage.setUnlocked(14));
    await page.reload();
    await expect(page.locator('#btn-editor')).toBeVisible();
    await expect(page.locator('#btn-editor')).toHaveClass(/menu-new/);
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

test('daily card presents first-run ghost setup clearly', async ({ page }) => {
    await page.addInitScript(seedProgress);
    await page.goto('/');
    await expect(page.locator('#daily-card')).toBeVisible();
    await expect(page.locator('#btn-daily')).toHaveText('Play Today\'s Puzzle');
    await expect(page.locator('#daily-meta')).toHaveText('Your first clear becomes today\'s ghost.');
});

test('daily card presents returning ghost target clearly', async ({ page }) => {
    await page.addInitScript(seedProgress);
    await page.goto('/');
    await page.evaluate(() => {
        const c = dailyChallengeForDate();
        const fp = levelFingerprint(LEVELS[c.levelIdx]);
        storage.save('dailyGhosts', {
            [c.key]: {
                key: c.key,
                saved: 5,
                total: 10,
                pct: 50,
                timeSeconds: 72,
                skills: 4,
                completedAt: `${c.key}T00:00:00.000Z`,
                fingerprint: fp,
                replay: { code: 'seed', fingerprint: fp },
            },
        });
        ui.buildMenu();
    });
    // A live, fingerprint-matched ghost flips the card into an explicit race:
    // gold "Beat the Ghost" framing, a single target chip carrying the numbers,
    // and a short motivator instead of a duplicate stat line.
    await expect(page.locator('#daily-card')).toHaveClass(/is-race/);
    await expect(page.locator('#daily-kicker')).toHaveText('Beat the Ghost');
    await expect(page.locator('#btn-daily')).toHaveText('Beat Your Ghost');
    await expect(page.locator('#daily-target')).toContainText(/Beat 50%.*1:12.*4 skills/);
    await expect(page.locator('#daily-meta')).toHaveText('Your run is on the clock.');
    // The race must still defer to the Continue hero as the primary CTA.
    await expect(page.locator('#continue-hero')).toBeVisible();
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

test('daily result shows ghost delta state after beating a stored ghost', async ({ page }) => {
    await page.addInitScript(seedProgress);
    await page.goto('/');
    await page.evaluate(() => {
        const c = dailyChallengeForDate();
        const fp = levelFingerprint(LEVELS[c.levelIdx]);
        storage.save('dailyGhosts', {
            [c.key]: {
                key: c.key,
                saved: 1,
                total: LEVELS[c.levelIdx].totalSpawn,
                pct: 10,
                timeSeconds: 120,
                skills: 8,
                completedAt: `${c.key}T00:00:00.000Z`,
                fingerprint: fp,
                replay: { code: 'seed', fingerprint: fp },
            },
        });
        ui.buildMenu();
    });
    await page.locator('#btn-daily').click();
    await page.evaluate(() => {
        const g = ui.game;
        g.savedCount = g.level.totalSpawn;
        g.skillsUsed = 2;
        g.time = Math.max(0, (g.level.time - 60) * 60);
        g.deadCount = 0;
        g.spawnCounter = g.level.totalSpawn;
        g.mosslings = [];
        g.endLevel();
    });
    await expect(page.locator('#message-overlay')).toBeVisible();
    await expect(page.locator('.msg-daily-ghost')).toContainText('You beat your ghost.');
    await expect(page.locator('.msg-daily-ghost')).toContainText(/Saved \+\d+ · Time -\d+:\d{2} · Skills -\d+/);
});

test('replay fingerprint mismatch refuses playback with clear copy', async ({ page }) => {
    await page.goto('/');
    const code = await page.evaluate(() => serializeReplay({ kind: 'campaign', levelIdx: 0, fingerprint: '00000000', actions: [] }));
    await page.goto(`/?replay=${code}`);
    await expect(page.locator('#toast')).toContainText('Replay refused: the level changed since this run was recorded.');
    expect(await page.evaluate(() => ui.game.ghostMode)).toBe(false);
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

test('custom level import announces heuristic trust copy', async ({ page }) => {
    await page.goto('/');
    const code = await page.evaluate(() => serializeLevel({
        name: 'Trust Import',
        totalSpawn: 5,
        reqSaved: 3,
        time: 120,
        spawnRate: 60,
        spawn: { x: 80, y: 360 },
        exit: { x: 880, y: 420 },
        inventory: { [SKILLS.BUILD]: 5 },
        commands: [{ type: T_DIRT, x: 0, y: 420, w: 960, h: 120 }],
    }));
    await page.goto(`/?level=${code}`);
    await expect(page.locator('#toast')).toContainText('Basic checks passed. This is not a proof.');
});

test('custom gallery shows creator clear trust badge for exact fingerprint', async ({ page }) => {
    await page.addInitScript(seedProgress);
    await page.goto('/');
    await page.evaluate(() => {
        const lvl = {
            name: 'Creator Clear',
            totalSpawn: 5,
            reqSaved: 3,
            time: 120,
            spawnRate: 60,
            spawn: { x: 80, y: 360 },
            exit: { x: 880, y: 420 },
            inventory: { [SKILLS.BUILD]: 5 },
            commands: [{ type: T_DIRT, x: 0, y: 420, w: 960, h: 120 }],
        };
        const fp = levelFingerprint(lvl);
        lvl.ugcTrust = { creatorClear: { fingerprint: fp, replayCode: 'seed' } };
        storage.saveCustomLevel(lvl);
        ui.buildMenu();
    });
    await page.locator('#btn-gallery').click();
    await expect(page.locator('.ugc-badge')).toContainText('Creator Cleared');
});
