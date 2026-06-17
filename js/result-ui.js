'use strict';
/**
 * MOSSLINGS — result overlay, run summary, sharing, and the next-level pull.
 *
 * Extracted from the ui.js monolith as a focused module. These methods are
 * mixed onto the shared `ui` object (defined in js/ui.js) via Object.assign, so
 * every existing call site (`ui.showMsg`, `ui.shareResult`, …) and every
 * `this.*` cross-reference into the menu/core layers keeps working unchanged.
 * Load order: after ui.js, before the main.js bootstrap.
 */
Object.assign(ui, {
    medalStorageKey(game) {
        if (game.runMode === 'daily' && game.dailyChallenge) return `daily:${game.dailyChallenge.key}`;
        return game.levelIdx >= 0 ? game.levelIdx : game.level.name;
    },

    nextMedalGoal(level, medals) {
        if (!level || !level.par) return null;
        const m = medals || {};
        const p = level.par;
        if (!m.saved) {
            const all = p.saved >= level.totalSpawn;
            return {
                key: 'saved',
                short: `SAVE ${p.saved}`,
                label: all ? `Next target: save all ${p.saved}` : `Next target: save ${p.saved}`,
            };
        }
        if (!m.skills) {
            return {
                key: 'skills',
                short: `SK<=${p.skills}`,
                label: `Next target: use ${p.skills} or fewer skills`,
            };
        }
        if (!m.time) {
            return {
                key: 'time',
                short: `T<${ResultView.fmtTime(p.time)}`,
                label: `Next target: beat ${ResultView.fmtTime(p.time)}`,
            };
        }
        return null;
    },

    runStreakHtml(streak) {
        if (!streak) return '';
        if (streak.win && streak.current >= 2) {
            return `<span class="msg-progress-chip msg-streak">STREAK ${streak.current} · best ${streak.best}</span>`;
        }
        if (!streak.win && streak.previous >= 2) {
            return `<span class="msg-progress-chip msg-streak ended">Streak ended at ${streak.previous} · best ${streak.best}</span>`;
        }
        if (streak.best >= 2) {
            return `<span class="msg-progress-chip msg-streak">Best streak ${streak.best}</span>`;
        }
        return '';
    },

    resultTargetHtml(target, allMedals) {
        if (target) return `<span class="msg-progress-chip msg-target">${target.label}</span>`;
        if (allMedals) return '<span class="msg-progress-chip msg-target complete">All medal targets cleared</span>';
        return '';
    },

    clearNextLevelCountdown() {
        if (this.nextLevelCountdown) {
            clearInterval(this.nextLevelCountdown);
            this.nextLevelCountdown = null;
        }
    },

    scheduleNextLevelAdvance(nextIdx) {
        this.clearNextLevelCountdown();
        const node = document.getElementById('msg-next-teaser');
        if (!node || nextIdx < 0 || nextIdx >= LEVELS.length) return;
        let remaining = this.isGroveCompleteLevel(nextIdx - 1) ? 5 : 3;
        const tick = () => {
            const el = document.getElementById('msg-autoadvance');
            if (el) el.innerText = remaining <= 0 ? 'Opening…' : `Continuing in ${remaining}…`;
            if (remaining <= 0) {
                this.clearNextLevelCountdown();
                if (!document.getElementById('message-overlay').classList.contains('hidden')) this.game.loadLevel(nextIdx);
                return;
            }
            remaining--;
        };
        tick();
        this.nextLevelCountdown = setInterval(tick, 1000);
    },

    renderNextTeaser(game, win) {
        const node = document.getElementById('msg-next-teaser');
        if (!node) return;
        this.clearNextLevelCountdown();
        node.classList.add('hidden');
        node.innerHTML = '';
        if (!win || game.runMode !== 'campaign' || game.levelIdx < 0 || game.levelIdx + 1 >= LEVELS.length) return;
        const nextIdx = game.levelIdx + 1;
        const next = LEVELS[nextIdx];
        const grove = this.groveMeta(nextIdx);
        const hook = next.headlineSkill != null ? `${SKILL_NAMES[next.headlineSkill]} leads here` : 'Fresh route ahead';
        const groveLead = this.isGroveCompleteLevel(game.levelIdx)
            ? `<span class="teaser-kicker grove-kicker">${grove.title} unlocked</span>`
            : `<span class="teaser-kicker">Next puzzle</span>`;
        node.innerHTML = `${groveLead}<strong>${nextIdx + 1}. ${next.name}</strong><span>${hook}</span><span id="msg-autoadvance" class="teaser-autoadvance"></span>`;
        node.classList.remove('hidden');
        this.scheduleNextLevelAdvance(nextIdx);
    },

    showMsg(title, text, win) {
        this.lastWin = win;
        const game = this.game;
        const o = document.getElementById('message-overlay');
        o.classList.remove('hidden');
        // The big shareable result card is a celebration — show it on a win only.
        // A loss leads with the compact stats + a one-tap Retry so the next
        // attempt is immediate, not gated behind a "FAILED RUN" brag card.
        o.classList.toggle('has-result-card', win);
        if (typeof music !== 'undefined' && music) music.duck(true);
        if (typeof music !== 'undefined' && music && music.setState) music.setState(win ? 'celebration' : 'tense');
        document.getElementById('msg-title').innerText = title;
        document.getElementById('msg-title').className = win ? 'win' : 'fail';
        document.getElementById('msg-text').innerText = text;

        // P0 Failure Diagnosis: one actionable reason on a loss, and arm the
        // Retry Ghost Hint for the next attempt. Reasons are derived from
        // recorded counts (no user input) so innerHTML is safe. Win clears both.
        const diag = document.getElementById('msg-diagnosis');
        if (diag) {
            if (!win) {
                const dg = game.diagnoseFailure();
                diag.innerHTML = `<b>${dg.label}</b>` + (dg.detail ? `<span>${dg.detail}</span>` : '');
                diag.classList.remove('hidden');
                game.retryHint = dg.zone
                    ? { key: game.levelKey(), x: dg.zone.x, y: dg.zone.y, kind: dg.zone.kind }
                    : null;
            } else {
                diag.classList.add('hidden');
                game.retryHint = null;
            }
        }

        // Watching a shared replay must never mutate the viewer's own save
        // (streak, medals, unlocks, daily best). Read current streak for display
        // only; skip the record.
        const streak = game.ghostMode
            ? { ...storage.getRunStreak(), previous: storage.getRunStreak().current, win }
            : game.resultRecorded
                ? { ...storage.getRunStreak(), previous: storage.getRunStreak().current, win }
                : storage.recordRunOutcome(win);
        game.resultRecorded = true;

        const result = ResultView.buildRunResult(game, win);
        result.url = this.resultUrlFor(result);
        document.getElementById('msg-stats').innerHTML = ResultView.statsHtml(result);

        const mWrap = document.getElementById('msg-medals-wrap');
        if (win && game.level.par && !game.ghostMode) {
            storage.setMedals(this.medalStorageKey(game), result.medals);
        }
        const storedMedals = win && game.level.par ? storage.getMedals(this.medalStorageKey(game)) : result.medals;
        const allMedals = !!(win && game.level.par && storedMedals.saved && storedMedals.skills && storedMedals.time);
        const target = win && game.level.par ? this.nextMedalGoal(game.level, storedMedals) : null;

        const progress = document.getElementById('msg-progress');
        if (progress) {
            const groveBits = win && game.runMode === 'campaign' && game.levelIdx >= 0 ? this.groveSummaryHtml(game.levelIdx) : '';
            progress.innerHTML = this.runStreakHtml(streak) + this.resultTargetHtml(target, allMedals) + groveBits;
            progress.classList.toggle('hidden', progress.innerHTML === '');
        }
        const showLegend = !!(win && game.level.par && !storage.load('medalLegendSeen', false));
        mWrap.innerHTML = ResultView.medalsHtml(result, { showLegend });
        if (showLegend) storage.save('medalLegendSeen', true);

        if (result.isDaily && !game.ghostMode) {
            const dailyPayload = {
                key: result.dailyKey,
                levelIdx: game.levelIdx,
                levelName: game.level.name,
                win,
                saved: result.saved,
                total: result.total,
                pct: result.pct,
                timeSeconds: result.timeSeconds,
                skills: result.skills,
                medalCount: result.medalCount,
                medals: result.medals,
            };
            const prev = storage.getDailyResult(result.dailyKey);
            const isNewBest = compareDailyResults(dailyPayload, prev) > 0;
            const best = storage.setDailyResult(result.dailyKey, dailyPayload);
            result.dailyBest = best;
            result.dailyBestIsNew = isNewBest;
            mWrap.innerHTML += ResultView.dailyBestHtml(result);
            const replayCode = serializeReplay(game.buildReplay());
            const fingerprint = typeof levelFingerprint === 'function' ? levelFingerprint(game.level) : null;
            const candidate = makeDailyGhostRecord({
                key: result.dailyKey,
                levelIdx: game.levelIdx,
                levelName: game.level.name,
                result,
                replayCode,
                fingerprint,
            });
            if (candidate) {
                const previousGhost = storage.getDailyGhost(result.dailyKey);
                const ghostOutcome = win
                    ? storage.setDailyGhost(result.dailyKey, candidate)
                    : (previousGhost ? dailyGhostOutcome(candidate, previousGhost, false) : null);
                result.dailyGhostOutcome = ghostOutcome;
                mWrap.innerHTML += dailyGhostResultHtml(ghostOutcome);
            }
        }

        this.lastResult = result;
        const preview = document.getElementById('result-card-preview');
        if (win) ResultView.drawResultCardPreview(preview, result);
        else if (preview && preview.classList) preview.classList.add('hidden');

        const hasNext = win && game.runMode === 'campaign' && game.levelIdx >= 0 && game.levelIdx + 1 < LEVELS.length;
        const journey = typeof journeyResultModel === 'function'
            ? journeyResultModel({
                win,
                runMode: game.runMode,
                levelIdx: game.levelIdx,
                unlocked: storage.getUnlocked(),
                hasNext,
                target,
                allMedals,
                victory: game.state === 'VICTORY',
                dailyBestIsNew: !!result.dailyBestIsNew,
                groveSize: this.groveSize || 7,
            })
            : null;
        this.lastJourneyPrimary = journey && journey.primary ? journey.primary : null;
        const journeyNode = document.getElementById('msg-journey');
        if (journeyNode) {
            if (journey && journey.coaching) {
                journeyNode.innerHTML = `<b>${journey.primary.label}</b><span>${journey.coaching}</span>`;
                journeyNode.classList.remove('hidden');
            } else journeyNode.classList.add('hidden');
        }

        // "Retry for medals" appears on a win that didn't sweep all three.
        const medals = result.medals;
        const showRetry = journey ? journey.showRetryMedal : (win && game.level.par && !allMedals && game.state !== 'VICTORY');
        const retry = document.getElementById('msg-btn-retry');
        retry.innerText = journey && journey.retryLabel ? journey.retryLabel : (target ? `Retry: ${target.short}` : 'Retry for medals');
        retry.classList.toggle('hidden', !showRetry);

        const allowShare = journey ? journey.showShare : win;
        document.getElementById('msg-btn-card').classList.toggle('hidden', !win || !allowShare);
        const shareTextBtn = document.getElementById('msg-btn-share');
        if (shareTextBtn) shareTextBtn.classList.toggle('hidden', !win || !allowShare);
        // Beat-my-run is intentionally a Grove 2+ promise: do not name ghosts
        // before the player reaches the improvement grove.
        const replayBtn = document.getElementById('msg-btn-replay');
        if (replayBtn) {
            replayBtn.innerText = win ? 'Beat my run' : 'Copy replay';
            replayBtn.classList.toggle('hidden', !!game.ghostMode || !(journey ? journey.showReplay : true));
        }

        // Forward pull: on a campaign win, name the reward you're heading to.
        const primary = document.getElementById('msg-btn-primary');
        let label;
        if (journey && journey.primary && (game.runMode === 'daily' || !win || game.state === 'VICTORY')) label = journey.primary.label;
        else if (game.state === 'VICTORY') label = 'The End';
        else if (!win) label = 'Try Again';
        else if (game.runMode === 'daily') label = 'Done';
        else if (hasNext) {
            const nm = LEVELS[game.levelIdx + 1].name;
            label = this.isGroveCompleteLevel(game.levelIdx)
                ? `Open ${this.groveMeta(game.levelIdx + 1).title}`
                : `Next ▸ ${game.levelIdx + 2}. ${nm.length > 16 ? nm.slice(0, 15) + '…' : nm}`;
        } else label = 'Next Level';
        primary.innerText = label;
        primary.classList.toggle('primary-next', hasNext);
        // Autofocus the most likely next action (Next on a win, Retry on a loss)
        // so a keyboard/controller press continues without hunting.
        if (typeof primary.focus === 'function') { try { primary.focus(); } catch (e) {} }

        if (win && game.runMode === 'campaign' && game.levelIdx >= 0) {
            if (this.isGroveCompleteLevel(game.levelIdx)) {
                const meta = this.groveMeta(game.levelIdx);
                const nextMeta = this.groveMeta(Math.min(LEVELS.length - 1, game.levelIdx + 1));
                document.getElementById('msg-title').innerText = `GROVE ${meta.grove + 1} CLEAR!`;
                document.getElementById('msg-text').innerText = `${meta.title} complete. ${nextMeta.title} is now open.`;
            }
            this.renderNextTeaser(game, win);
        } else this.renderNextTeaser(game, win);

        if (win) audio.sfxWin(); else audio.sfxLose();
        if (typeof haptics !== 'undefined') { if (win) haptics.win(); else haptics.fail(); }

        // Fire a stamp sting as each earned medal slams in (matches the CSS
        // .msg-medal-slot stagger: 0.30s / 0.55s / 0.80s).
        if (win) {
            const earned = [medals.saved, medals.skills, medals.time].filter(Boolean);
            earned.forEach((_, i) => setTimeout(() => audio.sfxMedal(i), 300 + i * 250));
        }
    },
    fmtTime(seconds) {
        return ResultView.fmtTime(seconds);
    },
    /**
     * Copy a compact, brag-worthy summary of the run — the game's main viral
     * hook. Campaign runs link back to the hosted game; custom levels embed a
     * playable ?level= code so a friend can attempt the exact same puzzle.
     */
    shareResult() {
        const r = this.lastResult;
        if (!r) return;
        let levelCode = null;
        if (location.protocol === 'file:') {
            if (r.isCustom) levelCode = serializeLevel(r.level);
            this.copyText(ResultView.buildShareText(r, { levelCode }), 'Result copied. Host the game to add a play link.');
            return;
        }
        this.copyText(ResultView.buildShareText(r, { url: this.resultUrlFor(r) }), 'Result text copied to clipboard!');
    },
    /**
     * Share the deterministic replay of the just-finished run. Reuses the game's
     * existing action log — no extra recording — so a friend can watch the exact
     * run reproduce step-for-step (the sticky "beat my run" loop).
     */
    shareReplay() {
        const code = serializeReplay(this.game.buildReplay());
        if (!code) { this.toast('This run is too long to share as a replay.', true); return; }
        if (location.protocol === 'file:') {
            this.promptCopy(code);
            this.toast('Copied replay code. Host the game to share a clickable link.');
            return;
        }
        const url = this.currentShareUrl();
        url.searchParams.set('replay', code);
        this.copyText(url.toString(), 'Beat-my-run link copied!');
    },
    resultUrlFor(r) {
        if (!r || location.protocol === 'file:') return null;
        if (r.isDaily) {
            return this.dailyUrlFor(r.dailyKey);
        }
        if (r.isCampaign) {
            return this.currentShareUrl().toString();
        }
        const code = serializeLevel(r.level);
        return code ? this.shareUrlFor(code) : null;
    },
    async shareResultCard() {
        const r = this.lastResult;
        if (!r) return;
        try {
            r.url = this.resultUrlFor(r);
            const blob = await ResultView.createPngBlob(r);
            const filename = ResultView.cardFilename(r);
            const file = typeof File !== 'undefined'
                ? new File([blob], filename, { type: 'image/png' })
                : null;
            if (file && navigator.canShare && navigator.canShare({ files: [file] }) && navigator.share) {
                await navigator.share({
                    files: [file],
                    title: 'Mosslings result',
                    text: ResultView.buildShareText(r, { url: r.url }),
                });
                this.toast('Result card shared!');
                return;
            }
            if (navigator.clipboard && navigator.clipboard.write && typeof ClipboardItem !== 'undefined') {
                await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
                this.toast('Result card copied as PNG!');
                return;
            }
            const href = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = href;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            a.remove();
            setTimeout(() => URL.revokeObjectURL(href), 1000);
            this.toast('Downloaded result card PNG.');
        } catch (e) {
            this.copyText(ResultView.buildShareText(r, { url: this.resultUrlFor(r) }), 'Card failed. Copied result text instead.');
        }
    },
});
