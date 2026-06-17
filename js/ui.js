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

        $('btn-editor').onclick = () => { audio.init(); this.startEditor(); };
        $('btn-start').onclick = () => { this.armAudioForPlay(); game.loadLevel(game.levelIdx); };
        $('continue-hero').onclick = () => this.startRecommendedLevel();
        $('btn-daily').onclick = () => { audio.init(); game.loadDailyChallenge(); };
        $('btn-chapter-open').onclick = () => this.openPendingChapterReward();
        $('btn-chapter-dismiss').onclick = () => this.dismissPendingChapterReward();
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
            if (game.state === 'VICTORY') this.backToMenu();
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
            if (this.handleWorldKey(e)) return;
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

    // --- Level sharing ------------------------------------------------------
    /** On load, a ?level=… (or #level=…) param plays a shared level straight away. */
    tryImportSharedLevel() {
        const params = new URLSearchParams(location.search);
        if (this.tryImportReplay(params)) return;
        let code = params.get('level');
        if (!code && location.hash.startsWith('#level=')) code = location.hash.slice(7);
        if (!code && this.tryImportDaily(params)) return;
        if (!code) return;
        const level = this.parseSharedLevel(code);
        if (!level) {
            this.toast('That shared level link is invalid or corrupted.', true);
            history.replaceState(null, '', location.pathname);
            return;
        }
        
        const err = validateLevelStructure(level);
        if (err) {
            this.toast(`Shared level is invalid: ${err}`, true);
            history.replaceState(null, '', location.pathname);
            return;
        }

        // Skip the menu — drop the player straight into the shared puzzle.
        // Audio waits for the player's first input so shared links do not trip
        // autoplay restrictions.
        this.game.loadLevel(level, true);
        this.toast(`Playing shared level: ${level.name}`);
        history.replaceState(null, '', location.pathname);
    },
    /** Validate + decode a shared level string; returns a level object or null. */
    parseSharedLevel(code) {
        const level = deserializeLevel(code);
        if (!level || !level.name || !Array.isArray(level.commands)) return null;
        return level;
    },
    /** A ?replay=… (or #replay=…) link plays the recorded run back as a ghost. */
    tryImportReplay(params) {
        let code = params.get('replay');
        if (!code && location.hash.startsWith('#replay=')) code = location.hash.slice(8);
        if (!code) return false;
        const replay = deserializeReplay(code);
        history.replaceState(null, '', location.pathname);
        if (!replay) { this.toast('That replay link is invalid or corrupted.', true); return true; }
        this.armAudioForPlay();
        if (this.game.loadReplay(replay)) {
            this.setTutorial('▶ Watching a shared replay — press Esc or Menu to take over.');
            this.toast('Playing shared replay');
        } else {
            this.toast('Could not load that replay.', true);
        }
        return true;
    },
    tryImportDaily(params) {
        let key = params.get('daily');
        if (!key && location.hash.startsWith('#daily=')) key = location.hash.slice(7);
        if (!key) return false;

        const challenge = dailyChallengeForDate(key);
        if (!challenge) {
            this.toast('That daily challenge link is invalid.', true);
            history.replaceState(null, '', location.pathname);
            return true;
        }
        this.game.loadDailyChallenge(challenge);
        this.toast(`${challenge.label}: ${challenge.levelName}`);
        history.replaceState(null, '', location.pathname);
        return true;
    },
    shareCustomLevel() {
        const game = this.game;
        // The #edit-name input and this.editCommands belong to the editor and are
        // ALWAYS present in the DOM — even with a stale value when sharing from a
        // gallery card. Only sync from them while actually editing; otherwise the
        // gallery level (already on game.level) is the source of truth.
        if (game.state === 'EDITOR') {
            const nameInput = document.getElementById('edit-name');
            game.level.name = (nameInput.value || '').trim() || 'Custom Level';
            game.level.commands = this.editCommands;
            game.level.objects = this.editObjects;
        }
        const code = serializeLevel(game.level);
        if (!code) { this.toast('Level is too large or invalid to share.', true); return; }

        // Generous solvability smoke check (advisory, not a proof). Don't block
        // the share, but warn so a likely-broken level isn't sent out blind.
        const solve = analyzeSolvability(game.level);
        const warn = solve.status === 'fail' ? ` (warning: ${solve.reason})` : '';

        // On file:// there is no public origin to hand out, so a "link" would be
        // a dead local path on anyone else's machine. Share the level CODE
        // instead and tell the player to host the game for real links.
        if (location.protocol === 'file:') {
            this.promptCopy(code);
            this.toast(`Copied level code. Host the game to share a clickable link.${warn}`, !!warn);
            return;
        }
        const url = this.shareUrlFor(code);
        this.copyText(url, `Share link copied to clipboard!${warn}`);
    },
    /** Build a clean share URL from the current hosted location or test stub. */
    currentShareUrl() {
        const href = location.href || `${location.origin || 'http://localhost'}${location.pathname || '/'}`;
        const url = new URL(href);
        url.search = '';
        url.hash = '';
        return url;
    },
    /** Build a clean ?level= share URL from the current hosted location. */
    shareUrlFor(code) {
        const url = this.currentShareUrl();
        url.searchParams.set('level', code);
        return url.toString();
    },
    dailyUrlFor(key) {
        const url = this.currentShareUrl();
        url.searchParams.set('daily', key);
        return url.toString();
    },
    /** Copy text via the async Clipboard API, falling back to a manual prompt. */
    copyText(text, successMsg) {
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text)
                .then(() => this.toast(successMsg))
                .catch(() => this.promptCopy(text));
        } else {
            this.promptCopy(text);
        }
    },
    /** Clipboard API is unavailable on file:// in some browsers — fall back to a prompt. */
    promptCopy(text) {
        window.prompt('Copy this:', text);
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
    worldMeta(idx) { return this._ensureMenu().worldMeta(idx); },
    worldMetaByWorld(world) { return this._ensureMenu().worldMetaByWorld(world); },
    isWorldCompleteLevel(idx) { return this._ensureMenu().isWorldCompleteLevel(idx); },
    worldSummaryHtml(idx) { return this._ensureMenu().worldSummaryHtml(idx); },
    worldMasteryData(meta, unlocked = storage.getUnlocked()) { return this._ensureMenu().worldMasteryData(meta, unlocked); },
    worldCompletionStats(meta, unlocked = storage.getUnlocked()) { return this._ensureMenu().worldCompletionStats(meta, unlocked); },
    worldCompletionRibbonHtml(meta, unlocked = storage.getUnlocked()) { return this._ensureMenu().worldCompletionRibbonHtml(meta, unlocked); },
    worldMasterySummaryHtml(meta, unlocked = storage.getUnlocked()) { return this._ensureMenu().worldMasterySummaryHtml(meta, unlocked); },
    recommendedLevelIdx() { return this._ensureMenu().recommendedLevelIdx(); },
    startRecommendedLevel() { return this._ensureMenu().startRecommendedLevel(); },
    renderContinueHero() { return this._ensureMenu().renderContinueHero(); },
    buildMenu() { return this._ensureMenu().buildMenu(); },
    refreshDailyCard(firstRun) { return this._ensureMenu().refreshDailyCard(firstRun); },
    handleWorldKey(e) { return this._ensureMenu() ? this._ensureMenu().handleWorldKey(e) : false; },

    // Compatibility wrappers for result-ui and older storage naming.
    chapterMeta(idx) { return this.worldMeta(idx); },
    isChapterCompleteLevel(idx) { return this.isWorldCompleteLevel(idx); },
    chapterSummaryHtml(idx) { return this.worldSummaryHtml(idx); },
    chapterMasteryData(meta, unlocked = storage.getUnlocked()) { return this.worldMasteryData(meta, unlocked); },
    chapterCompletionStats(meta, unlocked = storage.getUnlocked()) { return this.worldCompletionStats(meta, unlocked); },
    chapterCompletionRibbonHtml(meta, unlocked = storage.getUnlocked()) { return this.worldCompletionRibbonHtml(meta, unlocked); },
    chapterMasteryRowHtml(meta, unlocked = storage.getUnlocked()) { return this.worldMasterySummaryHtml(meta, unlocked); },
    renderChapterReward(unlocked) { return this._ensureMenu().renderWorldReward(unlocked); },
    dismissPendingChapterReward() { return this._ensureMenu().dismissPendingWorldReward(); },
    openPendingChapterReward() { return this._ensureMenu().openPendingWorldReward(); },

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

    // --- Level editor -------------------------------------------------------
    startEditor() {
        const game = this.game;
        if (typeof music !== 'undefined' && music) music.stop();
        this.setMenuMode(false);
        game.state = 'EDITOR';
        game.levelIdx = -1;
        game.level = {
            name: 'Custom Level', reqSaved: 5, totalSpawn: 10, time: 180, spawnRate: 60,
            spawn: { x: 100, y: 100 }, exit: { x: 800, y: 400 },
            inventory: { [SKILLS.BLOCK]: 5, [SKILLS.BUILD]: 10, [SKILLS.BASH]: 5, [SKILLS.MINE]: 5, [SKILLS.DIG]: 5, [SKILLS.FLOAT]: 5, [SKILLS.CLIMB]: 5, [SKILLS.EXPLODE]: 5 },
            commands: [], objects: [],
        };
        this.editCommands = [];
        this.editObjects = [];
        game.objects = [];
        game.terrain.clear();
        document.getElementById('start-screen').classList.add('hidden');
        document.getElementById('message-overlay').classList.add('hidden');
        document.getElementById('tutorial-bar').classList.add('hidden');
        document.getElementById('editor-ui').classList.remove('hidden');
        // The editor has its own top toolbar; hide the gameplay chrome so the
        // board is fully editable and nothing is duplicated.
        document.getElementById('hud-top').classList.add('hidden');
        document.getElementById('toolbar').classList.add('hidden');
    },
    applyEdit() {
        // Don't paint terrain behind the (backdrop-less) Settings modal.
        if (!document.getElementById('editor-settings').classList.contains('hidden')) return;
        const game = this.game;
        let x = game.mouseX | 0, y = game.mouseY | 0;
        
        if (this.snapToGrid) {
            x = Math.round(x / 20) * 20;
            y = Math.round(y / 20) * 20;
        }

        if (this.editTool === 'SPAWN') { game.level.spawn = { x, y }; return; }
        if (this.editTool === 'EXIT') { game.level.exit = { x, y, athlete: game.level.exit.athlete }; return; }
        if (this.editTool === 'OBJ_PLATFORM' || this.editTool === 'OBJ_SWITCH' || this.editTool === 'OBJ_GATE') {
            const obj = this.makeEditorObject(this.editTool, x, y);
            const last = this.editObjects[this.editObjects.length - 1];
            if (last && last.type === obj.type && last.x === obj.x && last.y === obj.y && last.w === obj.w && last.h === obj.h) return;
            this.pushEditHistory();
            this.editObjects.push(obj);
            game.level.objects = this.editObjects;
            game.objects = game.buildRuntimeObjects(this.editObjects);
            game.updateObjects(true);
            return;
        }
        
        const type = { T_AIR, T_DIRT, T_METAL, T_HAZARD, T_ONEWAY_R, T_ONEWAY_L }[this.editTool];
        const { w, h } = this.brushSize;
        const cmd = { type, x: x - w / 2, y: y - h / 2, w, h };
        
        // Only push history if something changed (avoid duplicates during drag)
        const last = this.editCommands[this.editCommands.length - 1];
        if (last && last.type === cmd.type && last.x === cmd.x && last.y === cmd.y && last.w === cmd.w && last.h === cmd.h) return;

        this.pushEditHistory();
        this.editCommands.push(cmd);
        game.terrain.drawRect(cmd.x, cmd.y, cmd.w, cmd.h, type);
    },
    makeEditorObject(tool, x, y) {
        if (tool === 'OBJ_PLATFORM') {
            return { type: OBJ_PLATFORM, x: x - 55, y: y - 5, w: 110, h: 10, dx: 220, dy: 0, period: 300, phase: 0, target: 0, flags: 0 };
        }
        if (tool === 'OBJ_SWITCH') {
            return { type: OBJ_SWITCH, x: x - 14, y: y - 4, w: 28, h: 8, dx: 0, dy: 0, period: 240, phase: 0, target: 0, flags: 0 };
        }
        return { type: OBJ_GATE, x: x - 7, y: y - 80, w: 14, h: 80, dx: 0, dy: 0, period: 240, phase: 0, target: 0, flags: 0 };
    },
    pushEditHistory() {
        this.editHistory.push({
            commands: [...this.editCommands.map(c => ({ ...c }))],
            objects: [...this.editObjects.map(o => ({ ...o }))],
        });
        if (this.editHistory.length > 50) this.editHistory.shift();
    },
    undoEdit() {
        if (!this.editHistory.length) return;
        const snap = this.editHistory.pop();
        this.editCommands = Array.isArray(snap) ? snap : snap.commands;
        this.editObjects = Array.isArray(snap) ? [] : snap.objects;
        this.game.level.objects = this.editObjects;
        this.game.objects = this.game.buildRuntimeObjects(this.editObjects);
        this.game.updateObjects(true);
        this.game.terrain.clear(this.game.level.theme || 'FOREST');
        for (const c of this.editCommands) this.game.terrain.drawRect(c.x, c.y, c.w, c.h, c.type);
        this.game.terrain.finalize();
    },
    saveCustomLevel() {
        const game = this.game;
        game.level.name = document.getElementById('edit-name').value || 'Custom Level';
        game.level.commands = this.editCommands;
        game.level.objects = this.editObjects;
        // Validate before persisting — the same structural check shared levels
        // pass on import — so the editor can't quietly save an unsolvable level
        // (e.g. spawn over a pit or an exit in mid-air) that fails only later.
        const err = validateLevelStructure(game.level);
        if (err) { this.toast(`Can't save: ${err}`, true); return; }
        storage.saveCustomLevel(game.level);
        // Advisory only — a generous reachability smoke check, not a proof. We
        // still save (the heuristic must never lock a creator out of a clever
        // level), but flag a likely dead end so it isn't shared blind.
        const solve = analyzeSolvability(game.level);
        if (solve.status === 'fail') this.toast(`Saved "${game.level.name}" — heads up: ${solve.reason}.`, true);
        else this.toast(`Level "${game.level.name}" saved to LocalStorage.`);
        this.backToMenu();
    },
    openEditorSettings() {
        const game = this.game;
        const $ = (id) => document.getElementById(id);
        $('edit-spawn-total').value = game.level.totalSpawn;
        $('edit-req-saved').value = game.level.reqSaved;
        $('edit-time').value = game.level.time;
        $('edit-spawn-rate').value = game.level.spawnRate;
        $('edit-athlete-exit').checked = !!(game.level.exit && game.level.exit.athlete);

        const invGrid = $('settings-inventory-grid');
        invGrid.innerHTML = '';
        for (let i = 0; i < 8; i++) {
            const div = document.createElement('div');
            div.className = 'inv-entry';
            div.innerHTML = `
                <span>${SKILL_NAMES[i]}</span>
                <input type="number" class="edit-inv" data-skill="${i}" value="${game.level.inventory[i] || 0}" min="0" max="99">
            `;
            invGrid.appendChild(div);
        }
        $('editor-settings').classList.remove('hidden');
    },
    closeEditorSettings() {
        const game = this.game;
        const $ = (id) => document.getElementById(id);
        const clamp = (v, lo, hi, def) => Math.max(lo, Math.min(hi, parseInt(v, 10) || def));
        game.level.totalSpawn = clamp($('edit-spawn-total').value, 1, 255, 10);
        // required-saved can never exceed the number that actually spawn (else unwinnable)
        game.level.reqSaved = clamp($('edit-req-saved').value, 0, game.level.totalSpawn, 5);
        game.level.time = clamp($('edit-time').value, 10, 999, 180);
        game.level.spawnRate = clamp($('edit-spawn-rate').value, RATE_MIN, RATE_MAX, 60);
        if (game.level.exit) game.level.exit.athlete = $('edit-athlete-exit').checked;

        document.querySelectorAll('.edit-inv').forEach(input => {
            game.level.inventory[parseInt(input.dataset.skill, 10)] = parseInt(input.value, 10) || 0;
        });
        $('editor-settings').classList.add('hidden');
    },
    drawEditorOverlay(game, ctx) {
        const { w, h } = this.brushSize;
        let x = game.mouseX, y = game.mouseY;
        if (this.snapToGrid) {
            x = Math.round(x / 20) * 20;
            y = Math.round(y / 20) * 20;
            ctx.strokeStyle = 'rgba(255,255,255,0.08)';
            ctx.lineWidth = 1;
            for (let gx = 0; gx <= W; gx += 20) { ctx.beginPath(); ctx.moveTo(gx, 0); ctx.lineTo(gx, H); ctx.stroke(); }
            for (let gy = 0; gy <= H; gy += 20) { ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(W, gy); ctx.stroke(); }
        }
        ctx.strokeStyle = 'rgba(255,255,255,0.35)';
        ctx.lineWidth = 1;
        ctx.strokeRect(x - w / 2, y - h / 2, w, h);
        if (this.editTool === 'OBJ_PLATFORM' || this.editTool === 'OBJ_SWITCH' || this.editTool === 'OBJ_GATE') {
            this.drawEditorObjectPreview(ctx, this.makeEditorObject(this.editTool, x, y));
        }
        game.drawHatch(ctx);
        game.drawExit(ctx);
    },
    drawEditorObjectPreview(ctx, o) {
        ctx.save();
        ctx.globalAlpha = 0.7;
        ctx.strokeStyle = o.type === OBJ_PLATFORM ? '#4dd0e1' : (o.type === OBJ_SWITCH ? '#ffd54f' : '#90a4ae');
        ctx.fillStyle = o.type === OBJ_PLATFORM ? 'rgba(77,208,225,0.18)' : (o.type === OBJ_SWITCH ? 'rgba(255,213,79,0.18)' : 'rgba(144,164,174,0.2)');
        ctx.fillRect(o.x, o.y, o.w, o.h);
        ctx.strokeRect(o.x + 0.5, o.y + 0.5, o.w - 1, o.h - 1);
        if (o.type === OBJ_PLATFORM) {
            ctx.setLineDash([6, 4]);
            ctx.beginPath();
            ctx.moveTo(o.x + o.w / 2, o.y + o.h + 10);
            ctx.lineTo(o.x + o.dx + o.w / 2, o.y + o.h + 10);
            ctx.stroke();
            ctx.setLineDash([]);
        }
        ctx.restore();
    },
};
