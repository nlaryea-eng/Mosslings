'use strict';
/**
 * MOSSLINGS — DOM bindings, menu, message overlays, and the level editor.
 * Everything that touches the document lives here; the engine (js/game.js)
 * calls back through the `ui` object.
 */
const ui = {
    game: null,
    menu: null,
    lastWin: false,
    editTool: 'T_DIRT',
    editCommands: [],
    editObjects: [],
    editHistory: [], // command array snapshots
    brushSize: { w: 40, h: 40 },
    snapToGrid: false,
    nextLevelCountdown: null,

    init(game) {
        this.game = game;
        this.menu = typeof MenuUI !== 'undefined' ? new MenuUI(this) : null;
        const $ = (id) => document.getElementById(id);
        this.setMenuMode(true);
        this.installIcons();
        this.refreshMuteButton();
        this.applyCrt(this._crtOn());
        $('btn-crt').onclick = () => this.toggleCrt();
        this.refreshHapticsButton();
        $('btn-haptics').onclick = () => this.toggleHaptics();

        $('btn-gallery').onclick = () => this.openGallery();
        $('btn-gallery-back').onclick = () => { $('gallery-screen').classList.add('hidden'); this.backToMenu(); };
        $('btn-gallery-editor').onclick = () => { $('gallery-screen').classList.add('hidden'); this.startEditor(); };

        $('btn-editor').onclick = () => { storage.markMenuRevealSeen('editor'); audio.init(); this.startEditor(); };
        $('btn-start').onclick = () => { this.armAudioForPlay(); game.loadLevel(game.levelIdx); };
        $('continue-hero').onclick = () => this.startRecommendedLevel();
        $('btn-daily').onclick = () => { storage.markMenuRevealSeen('daily'); audio.init(); game.loadDailyChallenge(); game.armGhostRace(); };
        $('btn-grove-open').onclick = () => this.openPendingGroveReward();
        $('btn-grove-dismiss').onclick = () => this.dismissPendingGroveReward();
        $('btn-edit-save').onclick = () => this.saveCustomLevel();
        $('btn-edit-settings').onclick = () => this.openEditorSettings();
        $('btn-edit-share').onclick = () => this.shareCustomLevel();
        $('btn-edit-undo').onclick = () => this.undoEdit();
        $('btn-edit-cancel').onclick = () => this.backToMenu();
        $('btn-settings-done').onclick = () => this.closeEditorSettings();
        
        $('edit-brush-size').onchange = (e) => {
            const sizes = { small: { w: 20, h: 20 }, medium: { w: 40, h: 40 }, large: { w: 80, h: 40 } };
            this.brushSize = sizes[e.target.value] || sizes.medium;
        };
        $('edit-snap').onchange = (e) => { this.snapToGrid = e.target.checked; };

        document.querySelectorAll('.edit-tool').forEach(btn => {
            btn.onclick = () => {
                document.querySelectorAll('.edit-tool').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.editTool = btn.dataset.tool;
            };
        });

        $('btn-pause').onclick = () => game.togglePause();
        $('btn-restart').onclick = () => this.restartLevel();
        $('btn-rewind').onclick = () => game.rewind(); // on-screen access to the deterministic 5s undo (phone-friendly)
        $('btn-ffwd').onclick = () => { game.ffwd = !game.ffwd; this.refreshButtons(game); };
        $('btn-nuke').onclick = () => game.nuke();
        $('btn-rate-up').onclick = () => game.adjustRate(1);
        $('btn-rate-down').onclick = () => game.adjustRate(-1);
        $('btn-mute').onclick = () => {
            audio.init();
            audio.toggleMute();
            if (!audio.muted) this.armAudioForPlay();
            this.refreshMuteButton();
        };
        $('btn-menu-home').onclick = () => this.backToMenu();
        $('msg-btn-primary').onclick = () => {
            this.clearNextLevelCountdown();
            const journeyPrimaryId = this.lastJourneyPrimary && this.lastJourneyPrimary.id;
            if (journeyPrimaryId === 'share') this.shareResult();
            else if (game.state === 'VICTORY') this.backToMenu();
            else if (game.runMode === 'daily') {
                if (this.lastWin) this.backToMenu();
                else this.restartLevel();
            }
            else if (this.lastWin && game.levelIdx >= 0) game.loadLevel(game.levelIdx + 1);
            else if (game.levelIdx === -2) this.backToMenu();
            else game.loadLevel(game.levelIdx);
        };
        $('msg-btn-retry').onclick = () => this.restartLevel();
        $('msg-btn-share').onclick = () => this.shareResult();
        $('msg-btn-card').onclick = () => this.shareResultCard();
        $('msg-btn-replay').onclick = () => this.shareReplay();
        $('msg-btn-menu').onclick = () => this.backToMenu();

        document.querySelectorAll('.skill-btn').forEach(btn => {
            btn.onclick = () => { this.armAudioForPlay(); game.selectSkill(parseInt(btn.dataset.skill, 10)); };
        });

        // Tutorial card is dismissible (tap it, or press T) and pointer-enabled.
        const tutBar = $('tutorial-bar');
        tutBar.style.pointerEvents = 'auto';
        tutBar.style.cursor = 'pointer';
        tutBar.onclick = () => this.toggleTutorial(false);

        // Pointer Events unify mouse, touch and pen. Touch taps carry no prior
        // hover, so we sync the cursor position on every down before assigning,
        // and widen the assist radius for fingers (see game.findTarget).
        const setPointer = (e) => {
            const r = game.canvas.getBoundingClientRect();
            game.mouseX = (e.clientX - r.left) * (W / r.width);
            game.mouseY = (e.clientY - r.top) * (H / r.height);
            game.lastPointerTouch = (e.pointerType === 'touch');
        };
        game.canvas.onpointermove = e => {
            setPointer(e);
            if (game.state === 'EDITOR' && (e.buttons & 1)) this.applyEdit();
        };
        game.canvas.onpointerdown = e => {
            if (e.button === 2) return;
            this.armAudioForPlay();
            setPointer(e);
            if (game.state === 'EDITOR') { this.applyEdit(); return; }
            if (game.state === 'PLAY' || game.state === 'PAUSE') { game.tryAssign(); e.preventDefault(); }
        };
        game.canvas.oncontextmenu = e => {
            e.preventDefault();
            // Right-click deselects on desktop. On touch, a long-press also raises
            // contextmenu — suppress the menu but DON'T silently drop the skill the
            // player was lining up to place (the last pointer tells us which).
            if (!game.lastPointerTouch) game.selectSkill(null);
        };

        window.onkeydown = e => {
            if (e.target.tagName === 'INPUT') return;
            if (this.handleGroveKey(e)) return;
            this.armAudioForPlay();
            const k = e.key.toLowerCase();
            if (e.key >= '1' && e.key <= '8') game.selectSkill(parseInt(e.key, 10) - 1);
            else if (k === 'z' && (e.ctrlKey || e.metaKey)) {
                if (game.state === 'EDITOR') this.undoEdit();
                else game.rewind();
                e.preventDefault();
            }
            else if (k === 'r' && (game.state === 'PLAY' || game.state === 'PAUSE')) this.restartLevel();
            else if (e.key === ' ' || k === 'p') { game.togglePause(); e.preventDefault(); }
            else if (k === 'm') $('btn-mute').click();
            else if (k === 'c' && !e.ctrlKey && !e.metaKey) this.toggleCrt();
            else if (k === 'f') { game.ffwd = !game.ffwd; this.refreshButtons(game); }
            else if (k === 'n') game.nuke();
            else if (e.key === '+' || e.key === '=') game.adjustRate(1);
            else if (e.key === '-') game.adjustRate(-1);
            else if (e.key === 'Escape') {
                if (game.state === 'PLAY' || game.state === 'PAUSE') {
                    if (game.selectedSkill !== null) game.selectSkill(null);
                    else this.backToMenu();
                } else game.selectSkill(null);
            }
            else if (e.key === 'Backspace') { game.rewind(); e.preventDefault(); }
            else if (k === 'd') game.debug = !game.debug;
            else if (k === 't') this.toggleTutorial();
        };

        const ver = document.getElementById('app-version');
        if (ver && typeof APP_VERSION !== 'undefined') ver.textContent = `v${APP_VERSION}`;

        this.buildMenu();
        this.tryImportSharedLevel();
    },

    installIcons() {
        document.querySelectorAll('.skill-btn').forEach(btn => {
            const s = parseInt(btn.dataset.skill, 10);
            setIconHtml(btn.querySelector('.icon'), SKILL_ICONS[s], SKILL_NAMES[s]);
        });
        setIconHtml(document.getElementById('btn-ffwd'), UI_ICONS.fastForward, 'Fast forward');
        setIconHtml(document.getElementById('btn-rewind'), UI_ICONS.undo, 'Rewind 5 seconds');
        setIconHtml(document.getElementById('btn-restart'), UI_ICONS.reset, 'Restart level');
        setIconHtml(document.getElementById('btn-nuke'), UI_ICONS.hazard, 'Nuke');
        setIconHtml(document.getElementById('btn-rate-down'), UI_ICONS.minus, 'Slower spawns');
        setIconHtml(document.getElementById('btn-rate-up'), UI_ICONS.plus, 'Faster spawns');
        setIconHtml(document.getElementById('hud-medal-gold'), UI_ICONS.trophy, 'Rescue medal pace');
        setIconHtml(document.getElementById('hud-medal-silver'), UI_ICONS.medalSilver, 'Efficiency medal pace');
        setIconHtml(document.getElementById('hud-medal-bronze'), UI_ICONS.medalBronze, 'Speed medal pace');
        this.refreshPauseIcon();
    },
    refreshPauseIcon() {
        const paused = this.game && this.game.state === 'PAUSE';
        setIconHtml(document.getElementById('btn-pause'), paused ? UI_ICONS.play : UI_ICONS.pause, paused ? 'Resume' : 'Pause');
    },
    refreshMuteButton() {
        setIconHtml(document.getElementById('btn-mute'), audio.muted ? UI_ICONS.soundOff : UI_ICONS.soundOn, audio.muted ? 'Unmute' : 'Mute');
        setIconHtml(document.getElementById('btn-menu-home'), UI_ICONS.close, 'Back to menu');
    },
    // --- CRT scanline/vignette toggle (persisted display preference) ---------
    _crtOn() { try { return localStorage.getItem('mosslings.crt') !== '0'; } catch (e) { return true; } },
    applyCrt(on) {
        const c = document.getElementById('game-container');
        if (c) c.classList.toggle('crt-off', !on);
        const b = document.getElementById('btn-crt');
        if (b) {
            b.innerText = 'CRT effect: ' + (on ? 'On' : 'Off');
            if (b.setAttribute) b.setAttribute('aria-pressed', on ? 'true' : 'false');
        }
    },
    toggleCrt() {
        const on = !this._crtOn();
        try { localStorage.setItem('mosslings.crt', on ? '1' : '0'); } catch (e) {}
        this.applyCrt(on);
    },
    // --- Haptics toggle (only surfaced on devices with a vibration motor) ---
    refreshHapticsButton() {
        const b = document.getElementById('btn-haptics');
        if (!b) return;
        const supported = typeof haptics !== 'undefined' && haptics.supported();
        b.classList.toggle('hidden', !supported);
        if (!supported) return;
        const on = haptics.enabled();
        b.innerText = 'Vibrate: ' + (on ? 'On' : 'Off');
        if (b.setAttribute) b.setAttribute('aria-pressed', on ? 'true' : 'false');
    },
    setMenuMode(on) {
        const c = document.getElementById('game-container');
        if (c) c.classList.toggle('menu-mode', !!on);
    },
    toggleHaptics() {
        if (typeof haptics === 'undefined') return;
        const on = !haptics.enabled();
        haptics.setEnabled(on);
        if (on) haptics.tap(); // confirm the new setting with a buzz
        this.refreshHapticsButton();
    },
    armAudioForPlay() {
        audio.init();
        if (!this.game || (this.game.state !== 'PLAY' && this.game.state !== 'PAUSE')) return;
        if (typeof music !== 'undefined' && music) music.start(this.game.level.theme || 'FOREST');
    },

    toast(msg, isError = false) {
        const el = document.getElementById('toast');
        if (!el) return;
        el.innerText = msg;
        el.classList.toggle('toast-error', isError);
        el.classList.remove('hidden');
        // force reflow so the transition replays on rapid repeat toasts
        void el.offsetWidth;
        el.classList.add('show');
        clearTimeout(this._toastTimer);
        this._toastTimer = setTimeout(() => {
            el.classList.remove('show');
            setTimeout(() => el.classList.add('hidden'), 300);
        }, 3200);
    },

    /**
     * Show/hide the tutorial card. `force` toggles when undefined; pass `false`
     * to force-hide (used by the tap handler and the first-assignment auto-hide).
     * Only re-shows when the current level actually has tutorial text.
     */
    toggleTutorial(force) {
        const bar = document.getElementById('tutorial-bar');
        if (!bar) return;
        const wantHidden = force === false ? true : (force === true ? false : !bar.classList.contains('hidden'));
        if (!wantHidden && !(this.game.level && this.game.level.tut)) return;
        bar.classList.toggle('hidden', wantHidden);
    },

    /** Reload the current level — campaign by index, custom/shared by object. */
    restartLevel() {
        const g = this.game;
        if (g.runMode === 'daily') g.loadDailyChallenge(g.dailyChallenge);
        else if (g.levelIdx === -2) g.loadLevel(g.level, true);
        else g.loadLevel(g.levelIdx);
    },

    _ensureMenu() {
        if (!this.menu && typeof MenuUI !== 'undefined') this.menu = new MenuUI(this);
        return this.menu;
    },
    groveMeta(idx) { return this._ensureMenu().groveMeta(idx); },
    groveMetaByGrove(grove) { return this._ensureMenu().groveMetaByGrove(grove); },
    isGroveCompleteLevel(idx) { return this._ensureMenu().isGroveCompleteLevel(idx); },
    groveSummaryHtml(idx) { return this._ensureMenu().groveSummaryHtml(idx); },
    groveMasteryData(meta, unlocked = storage.getUnlocked()) { return this._ensureMenu().groveMasteryData(meta, unlocked); },
    groveCompletionStats(meta, unlocked = storage.getUnlocked()) { return this._ensureMenu().groveCompletionStats(meta, unlocked); },
    groveCompletionRibbonHtml(meta, unlocked = storage.getUnlocked()) { return this._ensureMenu().groveCompletionRibbonHtml(meta, unlocked); },
    groveMasterySummaryHtml(meta, unlocked = storage.getUnlocked()) { return this._ensureMenu().groveMasterySummaryHtml(meta, unlocked); },
    recommendedLevelIdx() { return this._ensureMenu().recommendedLevelIdx(); },
    startRecommendedLevel() { return this._ensureMenu().startRecommendedLevel(); },
    renderContinueHero() { return this._ensureMenu().renderContinueHero(); },
    buildMenu() { return this._ensureMenu().buildMenu(); },
    refreshDailyCard(firstRun) { return this._ensureMenu().refreshDailyCard(firstRun); },
    handleGroveKey(e) { return this._ensureMenu() ? this._ensureMenu().handleGroveKey(e) : false; },

    renderGroveReward(unlocked) { return this._ensureMenu().renderGroveReward(unlocked); },
    dismissPendingGroveReward() { return this._ensureMenu().dismissPendingGroveReward(); },
    openPendingGroveReward() { return this._ensureMenu().openPendingGroveReward(); },

    openGallery() {
        this.setMenuMode(true);
        document.getElementById('start-screen').classList.add('hidden');
        document.getElementById('gallery-screen').classList.remove('hidden');
        this.buildGallery();
    },

    buildGallery() {
        const list = document.getElementById('gallery-list');
        const empty = document.getElementById('gallery-empty');
        list.innerHTML = '';
        const levels = storage.getCustomLevels();
        
        if (levels.length === 0) {
            empty.classList.remove('hidden');
            list.classList.add('hidden');
            return;
        }
        
        empty.classList.add('hidden');
        list.classList.remove('hidden');
        
        levels.forEach(lvl => {
            list.appendChild(this.buildGalleryCard(lvl));
        });
    },

    /**
     * Build one gallery card with the DOM API. Custom level names are
     * user-controlled (and travel through shared links/LocalStorage), so they
     * MUST go through textContent — never string-interpolated into innerHTML —
     * to close the local XSS/injection vector.
     */
    buildGalleryCard(lvl) {
        const el = (tag, cls) => { const e = document.createElement(tag); if (cls) e.className = cls; return e; };
        const card = el('div', 'gallery-card');

        const title = el('h4');
        title.textContent = lvl.name;             // untrusted → textContent
        const medals = storage.getMedals(lvl.name);
        const mWrap = el('span', 'gallery-medals');
        const medal = (on, cls, svg, title) => {
            if (!on) return;
            const s = el('span', 'medal ' + cls);
            s.innerHTML = svg; s.title = title;
            mWrap.appendChild(s);
        };
        medal(medals.saved, 'medal-gold', UI_ICONS.trophy, 'Rescue Gold');
        medal(medals.skills, 'medal-silver', UI_ICONS.medalSilver, 'Efficiency Silver');
        medal(medals.time, 'medal-bronze', UI_ICONS.medalBronze, 'Speed Bronze');
        title.appendChild(document.createTextNode(' '));
        title.appendChild(mWrap);
        card.appendChild(title);

        const meta = el('div', 'card-meta');
        for (const text of [`${lvl.totalSpawn} mosslings`, `${lvl.reqSaved} req`, `${lvl.time}s`]) {
            const span = el('span');
            span.textContent = text;
            meta.appendChild(span);
        }
        card.appendChild(meta);
        if (typeof ugcTrustBadge === 'function') {
            const badge = ugcTrustBadge(lvl);
            const b = el('span', `ugc-badge ugc-${badge.state}`);
            b.textContent = badge.label;
            b.title = badge.message;
            card.appendChild(b);
        }

        const actions = el('div', 'card-btns');
        const btn = (cls, label, onClick) => {
            const b = el('button', cls);
            b.textContent = label;
            b.onclick = onClick;
            actions.appendChild(b);
        };
        btn('btn-play', 'Play', () => {
            document.getElementById('gallery-screen').classList.add('hidden');
            audio.init();
            this.game.loadLevel(lvl, true);
        });
        btn('btn-edit', 'Edit', () => {
            document.getElementById('gallery-screen').classList.add('hidden');
            this.editCustomLevel(lvl);
        });
        btn('btn-share', 'Share', () => {
            this.game.level = lvl; // temporary swap for share
            this.shareCustomLevel();
        });
        btn('btn-delete', 'Delete', () => {
            if (confirm(`Delete "${lvl.name}"?`)) {
                storage.deleteCustomLevel(lvl.name);
                this.buildGallery();
                this.buildMenu();
            }
        });
        card.appendChild(actions);
        return card;
    },

    editCustomLevel(lvl) {
        this.startEditor();
        this.game.level = { ...lvl };
        this.editCommands = [...lvl.commands.map(c => ({ ...c }))];
        this.editObjects = normalizeLevelObjects(lvl.objects || []).map(o => ({ ...o }));
        document.getElementById('edit-name').value = lvl.name;
        this.game.terrain.clear(lvl.theme || 'FOREST');
        for (const c of this.editCommands) this.game.terrain.drawRect(c.x, c.y, c.w, c.h, c.type);
        this.game.terrain.finalize();
        this.game.objects = this.game.buildRuntimeObjects(this.editObjects);
        this.game.updateObjects(true);
    },

    backToMenu() {
        this.clearNextLevelCountdown();
        if (typeof music !== 'undefined' && music) music.stop();
        this.setMenuMode(true);
        const returningFromDaily = this.game.runMode === 'daily';
        this.game.state = 'MENU';
        if (this.game.levelIdx < 0) this.game.levelIdx = 0;
        if (returningFromDaily) {
            const maxUnlocked = storage.getUnlocked();
            this.game.levelIdx = Math.min(this.game.lastCampaignLevelIdx || 0, maxUnlocked);
        }
        document.getElementById('start-screen').classList.remove('hidden');
        document.getElementById('message-overlay').classList.add('hidden');
        document.getElementById('message-overlay').classList.remove('has-result-card');
        document.getElementById('msg-next-teaser').classList.add('hidden');
        document.getElementById('gallery-screen').classList.add('hidden');
        document.getElementById('tutorial-bar').classList.add('hidden');
        document.getElementById('editor-ui').classList.add('hidden');
        document.getElementById('editor-settings').classList.add('hidden');
        // Keep the frame a consistent height (chrome is only hidden in the editor).
        document.getElementById('hud-top').classList.remove('hidden');
        document.getElementById('toolbar').classList.remove('hidden');
        this.game.runMode = 'campaign';
        this.game.dailyChallenge = null;
        this.game.canvas.style.cursor = 'default';
        this.buildMenu();
    },

    onLevelStart(game, isCustom) {
        this.clearNextLevelCountdown();
        this.setMenuMode(false);
        document.getElementById('start-screen').classList.add('hidden');
        document.getElementById('message-overlay').classList.add('hidden');
        document.getElementById('message-overlay').classList.remove('has-result-card');
        document.getElementById('msg-next-teaser').classList.add('hidden');
        document.getElementById('gallery-screen').classList.add('hidden');
        document.getElementById('editor-ui').classList.add('hidden');
        document.getElementById('lbl-level').innerText =
            game.runMode === 'daily' && game.dailyChallenge
                ? `${game.dailyChallenge.label} · ${game.levelIdx + 1}. ${game.level.name}`
                : (isCustom ? game.level.name : `${game.levelIdx + 1}. ${game.level.name}`);
        document.getElementById('lbl-req').innerText = game.level.reqSaved;
        const tut = document.getElementById('tutorial-bar');
        if (game.level.tut) {
            tut.classList.remove('hidden');
            document.getElementById('lbl-tutorial').innerText = game.level.tut;
        } else {
            tut.classList.add('hidden');
        }
        document.getElementById('hud-medals').classList.toggle('hidden', !game.level.par);
        // Show the gameplay chrome (it is hidden during the editor).
        document.getElementById('hud-top').classList.remove('hidden');
        document.getElementById('toolbar').classList.remove('hidden');
        this.flashNuke(false);
        this.refreshButtons(game);
        this.refreshMuteButton();
        this.applyControlVisibility(game);
        this.updateToolbar(game);
        // First-run onboarding: pre-arm Builder and lead with one action.
        if (game.onboarding) {
            game.selectSkill(SKILLS.BUILD);
            this.setTutorial('Mosslings march on their own. We picked BUILDER for you — watch for the glowing one.');
        } else if (game.runMode === 'campaign' && game.levelIdx >= 1 && !storage.isSeen(game.levelIdx)) {
            // First encounter with a later campaign level: pulse its headline
            // skill a few times so the new mechanic draws the eye (the tutorial
            // card, shown above, names it). UI/storage only — no sim coupling.
            const hs = game.level.headlineSkill;
            if (hs != null && (game.inventory[hs] || 0) > 0) {
                let n = 0;
                const pulse = () => { this.updateToolbar(game, hs); if (++n < 3) setTimeout(pulse, 520); };
                pulse();
            }
        }
        if (game.runMode === 'campaign' && game.levelIdx >= 1) storage.markSeen(game.levelIdx);
    },
    /** Show the coaching card with explicit text (onboarding + guidance). */
    setTutorial(text) {
        const bar = document.getElementById('tutorial-bar');
        if (!bar) return;
        document.getElementById('lbl-tutorial').innerText = text;
        bar.classList.remove('hidden');
    },

    refreshButtons(game) {
        this.refreshPauseIcon();
        document.getElementById('btn-ffwd').classList.toggle('active', game.ffwd);
    },

    /** Hide/show the advanced HUD controls (spawn-rate, nuke) per the game's
     *  progressive-disclosure rule. See Game.advancedControlsVisible(). */
    applyControlVisibility(game) {
        const show = game.advancedControlsVisible();
        const rate = document.querySelector('.rate-ctl');
        if (rate) rate.classList.toggle('hidden', !show);
        const nuke = document.getElementById('btn-nuke');
        if (nuke) nuke.classList.toggle('hidden', !show);
    },

    flashNuke(armed) {
        const b = document.getElementById('btn-nuke');
        b.classList.toggle('armed', armed);
        if (armed) b.innerText = 'SURE?';
        else setIconHtml(b, UI_ICONS.hazard, 'Nuke');
    },

    updateToolbar(game, pulsedSkill = null) {
        document.querySelectorAll('.skill-btn').forEach(btn => {
            const s = parseInt(btn.dataset.skill, 10);
            const c = game.inventory[s] || 0;
            btn.querySelector('.count').innerText = c;
            btn.disabled = c <= 0;
            btn.classList.toggle('active', s === game.selectedSkill);
            if (s === pulsedSkill) {
                btn.classList.add('pulse');
                setTimeout(() => btn.classList.remove('pulse'), 200);
            }
        });
    },


};
