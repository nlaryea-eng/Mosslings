'use strict';
/**
 * MOSSLINGS - campaign menu and world carousel.
 *
 * ui.js owns shared orchestration. This module owns campaign menu data,
 * rendering, and menu-only interactions so the main UI surface does not grow
 * around the carousel.
 */
class MenuUI {
    constructor(host) {
        this.host = host;
        this.selectedWorld = null;
        this.pendingRewardWorld = null;
        this.worldSize = 7;
        this.worldThemes = [
            {
                name: 'Foundations',
                theme: 'Forest on-ramp',
                unlock: 'World 1 is your on-ramp.',
                flavor: 'Builders, diggers, floaters, and the first lava leap.',
                badges: ['Core tools', 'Bridge, dig, float', 'Levels 1-7']
            },
            {
                name: 'Trial Hollows',
                theme: 'Caves and lava routes',
                unlock: 'The middle stretch tightens route planning.',
                flavor: 'Bash lines, miner routes, athlete gates, and harsher lava carries.',
                badges: ['Route control', 'Athlete checks', 'Levels 8-14']
            },
            {
                name: 'Machine Grove',
                theme: 'Switches and ferries',
                unlock: 'The endgame region is live.',
                flavor: 'Switches, ferries, remixed gates, the tower ascent, and the gauntlet.',
                badges: ['Switch logic', 'Platform timing', 'Levels 15-21']
            }
        ];
    }

    get game() {
        return this.host.game;
    }

    worldCount() {
        return Math.ceil(LEVELS.length / this.worldSize);
    }

    worldMeta(levelIdx) {
        const clamped = Math.max(0, Math.min(LEVELS.length - 1, levelIdx || 0));
        const world = Math.floor(clamped / this.worldSize);
        const start = world * this.worldSize;
        const end = Math.min(LEVELS.length - 1, start + this.worldSize - 1);
        const theme = this.worldTheme(world);
        return {
            world,
            chapter: world, // compatibility for result-ui/storage naming.
            start,
            end,
            title: `World ${world + 1}`,
            name: theme.name,
            theme: theme.theme,
            region: theme.name,
            label: `${start + 1}-${end + 1}`,
        };
    }

    worldMetaByWorld(world) {
        return this.worldMeta(Math.max(0, Math.min(this.worldCount() - 1, world)) * this.worldSize);
    }

    worldTheme(world) {
        return this.worldThemes[world] || this.worldThemes[this.worldThemes.length - 1];
    }

    isWorldCompleteLevel(idx) {
        return idx >= 0 && idx < LEVELS.length - 1 && ((idx + 1) % this.worldSize === 0);
    }

    worldSummaryHtml(idx) {
        const meta = this.worldMeta(idx);
        const nextMeta = this.worldMeta(Math.min(LEVELS.length - 1, idx + 1));
        if (this.isWorldCompleteLevel(idx)) {
            return `<span class="msg-progress-chip msg-chapter complete">${meta.title} complete - ${meta.name}</span>` +
                `<span class="msg-progress-chip msg-chapter unlock">${nextMeta.title} unlocked</span>`;
        }
        return `<span class="msg-progress-chip msg-chapter">${meta.title} - level ${(idx - meta.start) + 1}/${(meta.end - meta.start) + 1}</span>`;
    }

    worldMasteryData(meta, unlocked = storage.getUnlocked()) {
        const totals = {
            rescue: 0,
            efficiency: 0,
            speed: 0,
            mastered: 0,
            cleared: 0,
            levelCount: (meta.end - meta.start) + 1,
            nextGoal: null,
        };
        const levels = [];
        for (let i = meta.start; i <= meta.end; i++) {
            const locked = i > unlocked;
            const best = storage.getBest(i);
            const medals = storage.getMedals(i);
            const medalCount = (medals.saved ? 1 : 0) + (medals.skills ? 1 : 0) + (medals.time ? 1 : 0);
            const goal = !locked ? this.host.nextMedalGoal(LEVELS[i], medals) : null;
            if (!locked && best !== null) totals.cleared++;
            if (!locked && medals.saved) totals.rescue++;
            if (!locked && medals.skills) totals.efficiency++;
            if (!locked && medals.time) totals.speed++;
            if (!locked && medalCount === 3) totals.mastered++;
            if (!totals.nextGoal && !locked && goal) {
                totals.nextGoal = { level: i + 1, idx: i, short: goal.short, label: goal.label };
            }
            levels.push({ idx: i, level: i + 1, locked, best, medals, medalCount, mastered: medalCount === 3, goal });
        }
        totals.masteryComplete = totals.mastered === totals.levelCount;
        return { ...totals, levels };
    }

    worldCompletionStats(meta, unlocked = storage.getUnlocked()) {
        const levelCount = (meta.end - meta.start) + 1;
        const mastery = this.worldMasteryData(meta, unlocked);
        let cleared = 0;
        let bestSum = 0;
        let bestCount = 0;
        let medalCount = 0;
        for (let i = meta.start; i <= meta.end; i++) {
            const best = storage.getBest(i);
            if (best !== null) {
                cleared++;
                bestSum += best;
                bestCount++;
            }
            const medals = storage.getMedals(i);
            medalCount += (medals.saved ? 1 : 0) + (medals.skills ? 1 : 0) + (medals.time ? 1 : 0);
        }
        return {
            levelCount,
            cleared,
            avg: bestCount ? Math.round(bestSum / bestCount) : null,
            medalCount,
            medalTotal: levelCount * 3,
            masteryComplete: mastery.masteryComplete,
            mastered: mastery.mastered,
        };
    }

    worldCompletionRibbonHtml(meta, unlocked = storage.getUnlocked()) {
        const stats = this.worldCompletionStats(meta, unlocked);
        const cls = ['chapter-reward-ribbon', stats.masteryComplete ? 'mastery-complete' : '', 'hidden'].filter(Boolean).join(' ');
        const kicker = stats.masteryComplete ? 'World mastered' : 'World complete';
        const copy = stats.masteryComplete
            ? `<strong>${meta.title}</strong> wrapped with ${stats.medalCount}/${stats.medalTotal} medals and ${stats.avg !== null ? `${stats.avg}% avg rescue` : 'a clean run'}.`
            : `<strong>${meta.title}</strong> closed at ${stats.cleared}/${stats.levelCount} cleared - ${stats.medalCount}/${stats.medalTotal} medals${stats.avg !== null ? ` - ${stats.avg}% avg rescue` : ''}.`;
        const pill = stats.masteryComplete
            ? `<span class="ribbon-pill">Mastery complete</span>`
            : `<span class="ribbon-pill">${stats.cleared}/${stats.levelCount} clear</span>`;
        return `<div id="chapter-reward-ribbon" class="${cls}" aria-live="polite"><span class="ribbon-kicker">${kicker}</span><span class="ribbon-copy">${copy}</span>${pill}</div>`;
    }

    worldMasterySummaryHtml(meta, unlocked = storage.getUnlocked()) {
        const data = this.worldMasteryData(meta, unlocked);
        const locked = unlocked < meta.start;
        // Progressive disclosure: one compact summary line + the track + a single
        // next-target chip, instead of four competing rescue/efficiency/speed/
        // mastered chips fighting for first-glance attention.
        const medals = data.rescue + data.efficiency + data.speed;
        const summary = locked
            ? `<span class="world-mastery-line">Locked - clear earlier worlds</span>`
            : `<span class="world-mastery-line">Mastered ${data.mastered}/${data.levelCount} · ${medals}/${data.levelCount * 3} medals</span>`;
        const nextChip = locked
            ? ''
            : (data.nextGoal
                ? `<span class="world-mastery-chip next" title="${data.nextGoal.label}">Next: L${data.nextGoal.level} ${data.nextGoal.short}</span>`
                : `<span class="world-mastery-chip next complete">World mastered</span>`);
        const chips = `${summary}${nextChip}`;
        const nodes = data.levels.map((entry) => {
            const cls = ['world-mastery-node', entry.locked ? 'locked' : `m${entry.medalCount}`, entry.mastered ? 'mastered' : ''].filter(Boolean).join(' ');
            const status = entry.locked ? 'Locked' : `${entry.medalCount}/3 mastery`;
            const goal = entry.goal ? ` - ${entry.goal.short}` : (entry.mastered ? ' - mastered' : '');
            return `<span class="${cls}" title="Level ${entry.level}: ${status}${goal}"><span>${entry.level}</span></span>`;
        }).join('');
        const complete = data.masteryComplete
            ? `<div class="world-mastery-complete"><strong>${meta.title} mastery complete</strong><span>All rescue, efficiency, and speed medals secured.</span></div>`
            : '';
        return `<div class="world-mastery ${data.masteryComplete ? 'is-complete' : ''}">` +
            `${complete}` +
            `<div class="world-mastery-track" aria-hidden="true">${nodes}</div>` +
            `<div class="world-mastery-chips">${chips}</div>` +
        `</div>`;
    }

    pendingWorldReward(unlocked) {
        const maxWorld = Math.floor(Math.min(unlocked, LEVELS.length - 1) / this.worldSize);
        for (let world = maxWorld; world >= 1; world--) {
            if (!storage.hasChapterRewardSeen(world)) return world;
        }
        return null;
    }

    renderWorldReward(unlocked) {
        const card = document.getElementById('chapter-reward-card');
        if (!card) return;
        const world = this.pendingWorldReward(unlocked);
        this.pendingRewardWorld = world;
        if (world == null) {
            card.classList.add('hidden');
            return;
        }
        const meta = this.worldMetaByWorld(world);
        const theme = this.worldTheme(world);
        const firstLevel = meta.start;
        const lastLevel = meta.end;
        document.getElementById('chapter-reward-kicker').innerText = `${meta.title} unlocked - ${theme.name}`;
        document.getElementById('chapter-reward-title').innerText = `${firstLevel + 1}. ${LEVELS[firstLevel].name} is ready`;
        document.getElementById('chapter-reward-meta').innerText = `${theme.flavor} ${theme.unlock}`;
        document.getElementById('btn-chapter-open').innerText = `Play ${meta.title}`;
        let ribbon = document.getElementById('chapter-reward-ribbon');
        const prevMeta = world > 0 ? this.worldMetaByWorld(world - 1) : null;
        if (ribbon) {
            if (prevMeta) {
                ribbon.outerHTML = this.worldCompletionRibbonHtml(prevMeta, unlocked);
                ribbon = document.getElementById('chapter-reward-ribbon');
                ribbon.classList.remove('hidden');
            } else {
                ribbon.classList.add('hidden');
                ribbon.innerHTML = '';
            }
        }
        const badges = document.getElementById('chapter-reward-badges');
        badges.innerHTML = '';
        const items = [...theme.badges, `Levels ${firstLevel + 1}-${lastLevel + 1}`];
        items.forEach((label, idx) => {
            const span = document.createElement('span');
            span.className = `chapter-reward-badge badge-${idx % 3}`;
            span.innerText = label;
            badges.appendChild(span);
        });
        card.classList.remove('hidden');
    }

    dismissPendingWorldReward() {
        if (this.pendingRewardWorld == null) return;
        storage.markChapterRewardSeen(this.pendingRewardWorld);
        this.pendingRewardWorld = null;
        const card = document.getElementById('chapter-reward-card');
        if (card) card.classList.add('hidden');
    }

    openPendingWorldReward() {
        if (this.pendingRewardWorld == null) return;
        const world = this.pendingRewardWorld;
        const meta = this.worldMetaByWorld(world);
        storage.markChapterRewardSeen(world);
        this.pendingRewardWorld = null;
        this.selectedWorld = world;
        this.game.levelIdx = meta.start;
        this.buildMenu();
        this.host.armAudioForPlay();
        this.game.loadLevel(meta.start);
    }

    recommendedLevelIdx() {
        const unlockedRaw = storage.getUnlocked();
        const unlocked = Math.min(unlockedRaw, LEVELS.length - 1);
        if (unlockedRaw === 0) return null;
        for (let i = 0; i <= unlocked; i++) {
            if (storage.getBest(i) === null) return i;
        }
        return unlocked;
    }

    syncSelectedWorld(unlocked) {
        const count = this.worldCount();
        if (this.selectedWorld == null || this.selectedWorld < 0 || this.selectedWorld >= count) {
            const rec = this.recommendedLevelIdx();
            const basis = rec == null ? Math.min(this.game.levelIdx || 0, unlocked) : rec;
            this.selectedWorld = this.worldMeta(Math.max(0, basis)).world;
        }
        this.selectedWorld = Math.max(0, Math.min(count - 1, this.selectedWorld));
    }

    renderContinueHero() {
        const hero = document.getElementById('continue-hero');
        if (!hero) return;
        const idx = this.recommendedLevelIdx();
        if (idx == null) {
            hero.classList.add('hidden');
            return;
        }
        const meta = this.worldMeta(idx);
        const lvl = LEVELS[idx];
        const cleared = storage.getBest(idx) !== null;
        const hook = lvl.headlineSkill != null ? `${SKILL_NAMES[lvl.headlineSkill]} leads here` : 'Fresh route ahead';
        document.getElementById('continue-kicker').innerText = `${cleared ? 'Replay' : 'Continue'} - ${meta.title} - ${meta.name}`;
        document.getElementById('continue-title').innerText = `${idx + 1}. ${lvl.name}`;
        document.getElementById('continue-sub').innerText = cleared ? `${hook} - best ${storage.getBest(idx)}%` : hook;
        if (hero.setAttribute) hero.setAttribute('aria-label', `Continue: level ${idx + 1}, ${lvl.name}, ${meta.title}`);
        hero.classList.remove('hidden');
    }

    buildMenu() {
        const unlocked = storage.getUnlocked();
        const firstRun = unlocked === 0;
        const start = document.getElementById('btn-start');
        document.getElementById('start-screen').classList.toggle('first-run', firstRun);
        if (start) {
            start.innerText = firstRun ? 'Start Playing' : 'Play';
            start.classList.toggle('hidden', !firstRun);
        }
        this.renderWorldReward(firstRun ? -1 : unlocked);
        this.renderContinueHero();
        this.renderWorldMenu(firstRun, unlocked);
        this.refreshDailyCard(firstRun);
        const gallery = document.getElementById('btn-gallery');
        if (gallery) gallery.classList.toggle('hidden', storage.getCustomLevels().length === 0);
    }

    renderWorldMenu(firstRun, unlocked) {
        const root = document.getElementById('world-menu');
        if (!root) return;
        if (firstRun) {
            root.classList.add('hidden');
            root.innerHTML = '';
            return;
        }
        root.classList.remove('hidden');
        this.syncSelectedWorld(unlocked);
        const recommended = this.recommendedLevelIdx();
        const cards = [];
        for (let world = 0; world < this.worldCount(); world++) {
            cards.push(this.worldCardHtml(this.worldMetaByWorld(world), unlocked, recommended));
        }
        const detail = this.worldDetailHtml(this.worldMetaByWorld(this.selectedWorld), unlocked, recommended);
        root.innerHTML =
            `<section class="world-carousel-shell" aria-label="Campaign worlds">` +
                `<button id="world-prev" class="world-nav-btn" aria-label="Previous world">${UI_ICONS.undo}</button>` +
                `<div id="world-carousel" class="world-carousel" role="listbox" tabindex="0" aria-label="World carousel">` +
                    cards.join('') +
                `</div>` +
                `<button id="world-next" class="world-nav-btn" aria-label="Next world">${UI_ICONS.play}</button>` +
            `</section>` +
            detail;
        this.bindWorldMenu(root);
    }

    worldCardHtml(meta, unlocked, recommended) {
        const locked = unlocked < meta.start;
        const selected = meta.world === this.selectedWorld;
        const stats = this.worldCompletionStats(meta, unlocked);
        const recInWorld = recommended != null && recommended >= meta.start && recommended <= meta.end;
        const availableEnd = locked ? meta.start - 1 : Math.min(unlocked, meta.end);
        const available = locked ? 0 : Math.max(1, availableEnd - meta.start + 1);
        const progress = locked
            ? 'Locked'
            : `${stats.cleared}/${stats.levelCount} clear - ${stats.medalCount}/${stats.medalTotal} medals`;
        const sub = locked
            ? `Unlock after World ${meta.world}`
            : `${available}/${stats.levelCount} available${stats.avg !== null ? ` - ${stats.avg}% avg` : ''}`;
        const cls = ['world-card', selected ? 'is-selected' : '', locked ? 'is-locked' : '', recInWorld ? 'has-recommended' : ''].filter(Boolean).join(' ');
        return `<button class="${cls}" data-world="${meta.world}" role="option" aria-selected="${selected ? 'true' : 'false'}" aria-label="${meta.title}: ${meta.name}, ${progress}">` +
            `<span class="world-card-num">W${meta.world + 1}</span>` +
            `<strong>${meta.name}</strong>` +
            `<span class="world-card-theme">${meta.theme}</span>` +
            `<span class="world-card-progress">${progress}</span>` +
            `<span class="world-card-sub">${sub}</span>` +
            (recInWorld ? `<span class="world-card-next">Next L${recommended + 1}</span>` : '') +
        `</button>`;
    }

    medalBits(medals) {
        const bits = [];
        if (medals.saved) bits.push(`<span class="medal medal-gold" title="Rescue Medal">${UI_ICONS.trophy}</span>`);
        if (medals.skills) bits.push(`<span class="medal medal-silver" title="Efficiency Medal">${UI_ICONS.medalSilver}</span>`);
        if (medals.time) bits.push(`<span class="medal medal-bronze" title="Speed Medal">${UI_ICONS.medalBronze}</span>`);
        return bits.join('');
    }

    worldDetailHtml(meta, unlocked, recommended) {
        const lockedWorld = unlocked < meta.start;
        const data = this.worldMasteryData(meta, unlocked);
        const stats = this.worldCompletionStats(meta, unlocked);
        const recommendedInWorld = recommended != null && recommended >= meta.start && recommended <= meta.end;
        const recommendedLevel = recommendedInWorld ? LEVELS[recommended] : null;
        const levelButtons = data.levels.map((entry) => this.levelNodeHtml(entry, recommended)).join('');
        const summary = lockedWorld
            ? `Locked - clear World ${meta.world}`
            : `${stats.cleared}/${stats.levelCount} cleared - ${stats.medalCount}/${stats.medalTotal} medals${stats.avg !== null ? ` - ${stats.avg}% avg rescue` : ''}`;
        const reward = lockedWorld
            ? `<div class="world-state is-locked">Locked world - keep clearing the previous route.</div>`
            : stats.masteryComplete
                ? `<div class="world-state is-complete">Reward state: ${meta.title} mastered.</div>`
                : stats.cleared === stats.levelCount
                    ? `<div class="world-state">Completion state: ${meta.title} cleared. Mastery targets remain.</div>`
                    : `<div class="world-state">Completion state: ${stats.cleared}/${stats.levelCount} cleared.</div>`;
        const next = recommendedInWorld
            ? `<button class="world-next-callout" data-level="${recommended}" aria-label="Play recommended level ${recommended + 1}">` +
                `<span>Recommended next</span><strong>L${recommended + 1} ${recommendedLevel.name}</strong>` +
                `<em>${recommendedLevel.headlineSkill != null ? SKILL_NAMES[recommendedLevel.headlineSkill] : 'Route'} focus</em>` +
            `</button>`
            : `<div class="world-next-callout is-muted"><span>Recommended next</span><strong>Choose a level in this world</strong><em>Adjacent worlds stay available in the carousel.</em></div>`;
        return `<section id="world-detail" class="world-detail ${lockedWorld ? 'is-locked' : ''}" aria-label="Selected world detail">` +
            `<div class="world-detail-head">` +
                `<div><span class="world-detail-kicker">${meta.title} - ${meta.theme}</span><h2>${meta.name}</h2></div>` +
                `<div class="world-detail-summary">${summary}</div>` +
            `</div>` +
            `${next}` +
            `<div class="level-rail" aria-label="${meta.title} levels">${levelButtons}</div>` +
            `${this.worldMasterySummaryHtml(meta, unlocked)}` +
            `${reward}` +
        `</section>`;
    }

    levelNodeHtml(entry, recommended) {
        const idx = entry.idx;
        const selected = idx === this.game.levelIdx;
        const rec = idx === recommended;
        const goal = entry.goal;
        const cls = [
            'level-node',
            selected ? 'is-selected' : '',
            rec ? 'is-recommended' : '',
            entry.locked ? 'is-locked' : '',
            entry.best !== null ? 'has-best' : '',
            goal ? 'has-goal' : '',
            entry.medalCount ? 'has-medals' : ''
        ].filter(Boolean).join(' ');
        const progress = entry.locked
            ? 'Locked'
            : [
                entry.best !== null ? `best ${entry.best}% rescued` : 'not yet cleared',
                goal ? goal.label.toLowerCase() : (entry.medalCount === 3 ? 'all medal targets cleared' : 'medal targets available')
            ].join(', ');
        const label = `Level ${idx + 1}: ${LEVELS[idx].name}, ${progress}${selected ? ', selected' : ''}`;
        return `<button class="${cls}" data-level="${idx}" aria-label="${label}" aria-disabled="${entry.locked ? 'true' : 'false'}">` +
            `<span class="level-num">L${idx + 1}</span>` +
            `<span class="level-name">${LEVELS[idx].name}</span>` +
            `<span class="level-meta">${entry.locked ? UI_ICONS.lock : (goal ? goal.short : (entry.best !== null ? `${entry.best}%` : 'New'))}</span>` +
            `<span class="level-medals">${this.medalBits(entry.medals)}</span>` +
        `</button>`;
    }

    bindWorldMenu(root) {
        const prev = root.querySelector('#world-prev');
        const next = root.querySelector('#world-next');
        const carousel = root.querySelector('#world-carousel');
        if (prev) prev.onclick = () => this.moveWorld(-1);
        if (next) next.onclick = () => this.moveWorld(1);
        if (carousel) {
            carousel.onkeydown = (e) => this.handleWorldKey(e);
            // Trackpad/horizontal-wheel intent advances the selected world and lets
            // scrollIntoView re-center it — a calmer snap than free overflow scroll.
            carousel.onwheel = (e) => {
                const now = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
                const dir = this.wheelNavIntent(e.deltaX, e.deltaY, now);
                if (dir) { if (e.preventDefault) e.preventDefault(); this.moveWorld(dir); }
            };
        }
        root.querySelectorAll('.world-card').forEach((card) => {
            card.onclick = () => this.selectWorld(parseInt(card.dataset.world, 10));
        });
        root.querySelectorAll('.level-node, .world-next-callout[data-level]').forEach((btn) => {
            btn.onclick = () => this.pickLevel(parseInt(btn.dataset.level, 10), false);
            btn.ondblclick = () => this.pickLevel(parseInt(btn.dataset.level, 10), true);
        });
        const selected = root.querySelector('.world-card.is-selected');
        if (selected && selected.scrollIntoView) {
            requestAnimationFrame(() => selected.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' }));
        }
    }

    selectWorld(world) {
        this.selectedWorld = Math.max(0, Math.min(this.worldCount() - 1, world));
        this.renderWorldMenu(false, storage.getUnlocked());
    }

    moveWorld(delta) {
        this.selectWorld((this.selectedWorld == null ? 0 : this.selectedWorld) + delta);
    }

    pickLevel(idx, forceStart) {
        const unlocked = storage.getUnlocked();
        if (idx > unlocked) return;
        if (forceStart || this.game.levelIdx === idx) {
            this.host.armAudioForPlay();
            this.game.loadLevel(idx);
            return;
        }
        this.game.levelIdx = idx;
        this.selectedWorld = this.worldMeta(idx).world;
        this.buildMenu();
    }

    startRecommendedLevel() {
        const idx = this.recommendedLevelIdx();
        if (idx == null) return;
        this.game.levelIdx = idx;
        this.host.armAudioForPlay();
        this.game.loadLevel(idx);
    }

    /**
     * Decide whether a wheel/trackpad gesture should step the carousel. Returns
     * -1 (prev), 1 (next), or 0 (ignore). Pure enough to unit-test: a dominantly
     * vertical or tiny gesture is ignored so page scroll still works, and a
     * cooldown stops one flick from skating across every world at once.
     */
    wheelNavIntent(deltaX, deltaY, now) {
        if (Math.abs(deltaX) <= Math.abs(deltaY)) return 0; // vertical → leave page scroll alone
        if (Math.abs(deltaX) < 10) return 0;                // too small to be intentional
        if (this._wheelLock != null && now - this._wheelLock < 260) return 0;
        this._wheelLock = now;
        return deltaX > 0 ? 1 : -1;
    }

    handleWorldKey(e) {
        const start = document.getElementById('start-screen');
        if (!start || start.classList.contains('hidden') || start.classList.contains('first-run')) return false;
        if (e.key === 'ArrowLeft') {
            this.moveWorld(-1);
            e.preventDefault();
            if (e.stopPropagation) e.stopPropagation();
            return true;
        }
        if (e.key === 'ArrowRight') {
            this.moveWorld(1);
            e.preventDefault();
            if (e.stopPropagation) e.stopPropagation();
            return true;
        }
        if (e.key === 'Home') {
            this.selectWorld(0);
            e.preventDefault();
            if (e.stopPropagation) e.stopPropagation();
            return true;
        }
        if (e.key === 'End') {
            this.selectWorld(this.worldCount() - 1);
            e.preventDefault();
            if (e.stopPropagation) e.stopPropagation();
            return true;
        }
        return false;
    }

    refreshDailyCard(firstRun) {
        const card = document.getElementById('daily-card');
        if (!card) return;
        const challenge = dailyChallengeForDate();
        card.classList.toggle('hidden', firstRun || !challenge);
        if (firstRun || !challenge) return;

        const ghost = storage.getDailyGhost(challenge.key);
        const fingerprint = typeof levelFingerprint === 'function' ? levelFingerprint(LEVELS[challenge.levelIdx]) : null;
        const model = dailyCardModel({ challenge, ghost, fingerprint });
        if (!model) { card.classList.add('hidden'); return; }

        // A live ghost turns the card into an explicit race, not just an entry.
        card.classList.toggle('is-race', model.state === 'race');
        const kicker = document.getElementById('daily-kicker');
        if (kicker) kicker.innerText = model.kicker;
        document.getElementById('daily-title').innerText = model.title;
        document.getElementById('daily-meta').innerText = model.meta;
        const target = document.getElementById('daily-target');
        if (target) {
            target.innerText = model.target;
            target.classList.toggle('hidden', !model.target);
        }
        const btn = document.getElementById('btn-daily');
        if (btn) btn.innerText = model.cta;
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { MenuUI };
}
