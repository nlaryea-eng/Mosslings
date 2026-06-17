'use strict';
/**
 * MOSSLINGS — DOM bindings, menu, message overlays, and the level editor.
 * Everything that touches the document lives here; the engine (js/game.js)
 * calls back through the `ui` object.
 */
const ui = {
    game: null,
    lastWin: false,
    editTool: 'T_DIRT',
    editCommands: [],
    editHistory: [], // command array snapshots
    brushSize: { w: 40, h: 40 },
    snapToGrid: false,

    init(game) {
        this.game = game;
        const $ = (id) => document.getElementById(id);
        this.installIcons();
        this.refreshMuteButton();
        this.applyCrt(this._crtOn());
        $('btn-crt').onclick = () => this.toggleCrt();

        $('btn-gallery').onclick = () => this.openGallery();
        $('btn-gallery-back').onclick = () => { $('gallery-screen').classList.add('hidden'); this.backToMenu(); };
        $('btn-gallery-editor').onclick = () => { $('gallery-screen').classList.add('hidden'); this.startEditor(); };

        $('btn-editor').onclick = () => { audio.init(); this.startEditor(); };
        $('btn-start').onclick = () => { this.armAudioForPlay(); game.loadLevel(game.levelIdx); };
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
        $('msg-btn-primary').onclick = () => {
            if (game.state === 'VICTORY') this.backToMenu();
            else if (this.lastWin && game.levelIdx >= 0) game.loadLevel(game.levelIdx + 1);
            else if (game.levelIdx === -2) this.backToMenu();
            else game.loadLevel(game.levelIdx);
        };
        $('msg-btn-retry').onclick = () => this.restartLevel();
        $('msg-btn-share').onclick = () => this.shareResult();
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
        game.canvas.oncontextmenu = e => { e.preventDefault(); game.selectSkill(null); };

        window.onkeydown = e => {
            if (e.target.tagName === 'INPUT') return;
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
            else if (e.key === 'Escape') game.selectSkill(null);
            else if (e.key === 'Backspace') { game.rewind(); e.preventDefault(); }
            else if (k === 'd') game.debug = !game.debug;
            else if (k === 't') this.toggleTutorial();
        };

        this.buildMenu();
        this.tryImportSharedLevel();
    },

    installIcons() {
        document.querySelectorAll('.skill-btn').forEach(btn => {
            const s = parseInt(btn.dataset.skill, 10);
            setIconHtml(btn.querySelector('.icon'), SKILL_ICONS[s], SKILL_NAMES[s]);
        });
        setIconHtml(document.getElementById('btn-ffwd'), UI_ICONS.fastForward, 'Fast forward');
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
    armAudioForPlay() {
        audio.init();
        if (!this.game || (this.game.state !== 'PLAY' && this.game.state !== 'PAUSE')) return;
        if (typeof music !== 'undefined' && music) music.start(this.game.level.theme || 'FOREST');
    },

    // --- Level sharing ------------------------------------------------------
    /** On load, a ?level=… (or #level=…) param plays a shared level straight away. */
    tryImportSharedLevel() {
        const params = new URLSearchParams(location.search);
        let code = params.get('level');
        if (!code && location.hash.startsWith('#level=')) code = location.hash.slice(7);
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
        }
        const code = serializeLevel(game.level);
        if (!code) { this.toast('Level is too large or invalid to share.', true); return; }

        // On file:// there is no public origin to hand out, so a "link" would be
        // a dead local path on anyone else's machine. Share the level CODE
        // instead and tell the player to host the game for real links.
        if (location.protocol === 'file:') {
            this.promptCopy(code);
            this.toast('Copied level code. Host the game to share a clickable link.');
            return;
        }
        const url = this.shareUrlFor(code);
        this.copyText(url, 'Share link copied to clipboard!');
    },
    /** Build a clean ?level= share URL from the current hosted location. */
    shareUrlFor(code) {
        const url = new URL(location.href);
        url.search = '';
        url.hash = '';
        url.searchParams.set('level', code);
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
        if (g.levelIdx === -2) g.loadLevel(g.level, true);
        else g.loadLevel(g.levelIdx);
    },

    buildMenu() {
        const c = document.getElementById('level-select-container');
        c.innerHTML = '';
        const unlocked = storage.getUnlocked();
        // First run = Level 1 not yet cleared. Collapse the menu to a single
        // dominant Play button (see #start-screen.first-run CSS) so a new player
        // has exactly one obvious action. Level select + Editor return after L1.
        const firstRun = unlocked === 0;
        document.getElementById('start-screen').classList.toggle('first-run', firstRun);
        document.getElementById('btn-start').innerText = firstRun ? 'Start Playing' : 'Play';
        for (let i = 0; i < LEVELS.length; i++) {
            const b = document.createElement('button');
            const locked = i > unlocked;
            const best = storage.getBest(i);
            const medals = storage.getMedals(i);
            const medalBits = [];
            const medalNames = [];
            if (!locked && medals.saved) {
                medalBits.push(`<span class="medal medal-gold" title="Rescue Medal (100% saved)">${UI_ICONS.trophy}</span>`);
                medalNames.push('rescue medal');
            }
            if (!locked && medals.skills) {
                medalBits.push(`<span class="medal medal-silver" title="Efficiency Medal (low skills)">${UI_ICONS.medalSilver}</span>`);
                medalNames.push('efficiency medal');
            }
            if (!locked && medals.time) {
                medalBits.push(`<span class="medal medal-bronze" title="Speed Medal (fast completion)">${UI_ICONS.medalBronze}</span>`);
                medalNames.push('speed medal');
            }
            b.className = [
                'lvl-btn',
                i === this.game.levelIdx ? 'selected' : '',
                locked ? 'is-locked' : '',
                !locked && best !== null ? 'has-best' : '',
                medalBits.length ? 'has-medals' : ''
            ].filter(Boolean).join(' ');
            if (b.setAttribute) b.setAttribute('aria-disabled', locked ? 'true' : 'false');
            else b.ariaDisabled = locked ? 'true' : 'false';

            b.innerHTML = `<span class="lvl-num">${i + 1}</span>` +
                `<span class="lvl-best${locked || best === null ? ' empty' : ''}">${!locked && best !== null ? `${best}%` : ''}</span>` +
                (locked
                    ? `<span class="lvl-lock">${UI_ICONS.lock}</span>`
                    : `<span class="lvl-medals">${medalBits.join('')}</span>`);
            b.title = i <= unlocked ? LEVELS[i].name : 'Locked';
            const progress = locked
                ? 'Locked'
                : [
                    best !== null ? `best ${best}% rescued` : 'not yet cleared',
                    medalNames.length ? `earned ${medalNames.join(', ')}` : 'no medals earned'
                ].join(', ');
            const selected = i === this.game.levelIdx ? ', selected' : '';
            const aria = `Level ${i + 1}: ${LEVELS[i].name}, ${progress}${selected}`;
            if (b.setAttribute) b.setAttribute('aria-label', aria);
            else b.ariaLabel = aria;
            b.onclick = () => {
                if (locked) return;
                this.game.levelIdx = i;
                this.buildMenu();
            };
            c.appendChild(b);
        }
        document.getElementById('btn-gallery').classList.toggle('hidden', storage.getCustomLevels().length === 0);
    },

    openGallery() {
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
        document.getElementById('edit-name').value = lvl.name;
        this.game.terrain.clear(lvl.theme || 'FOREST');
        for (const c of this.editCommands) this.game.terrain.drawRect(c.x, c.y, c.w, c.h, c.type);
        this.game.terrain.finalize();
    },

    backToMenu() {
        if (typeof music !== 'undefined' && music) music.stop();
        this.game.state = 'MENU';
        if (this.game.levelIdx < 0) this.game.levelIdx = 0;
        document.getElementById('start-screen').classList.remove('hidden');
        document.getElementById('message-overlay').classList.add('hidden');
        document.getElementById('gallery-screen').classList.add('hidden');
        document.getElementById('tutorial-bar').classList.add('hidden');
        document.getElementById('editor-ui').classList.add('hidden');
        document.getElementById('editor-settings').classList.add('hidden');
        // Keep the frame a consistent height (chrome is only hidden in the editor).
        document.getElementById('hud-top').classList.remove('hidden');
        document.getElementById('toolbar').classList.remove('hidden');
        this.game.canvas.style.cursor = 'default';
        this.buildMenu();
    },

    onLevelStart(game, isCustom) {
        document.getElementById('start-screen').classList.add('hidden');
        document.getElementById('message-overlay').classList.add('hidden');
        document.getElementById('gallery-screen').classList.add('hidden');
        document.getElementById('editor-ui').classList.add('hidden');
        document.getElementById('lbl-level').innerText =
            isCustom ? game.level.name : `${game.levelIdx + 1}. ${game.level.name}`;
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
        }
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

    showMsg(title, text, win) {
        this.lastWin = win;
        const game = this.game;
        const o = document.getElementById('message-overlay');
        o.classList.remove('hidden');
        if (typeof music !== 'undefined' && music) music.duck(true);
        document.getElementById('msg-title').innerText = title;
        document.getElementById('msg-title').className = win ? 'win' : 'fail';
        document.getElementById('msg-text').innerText = text;

        const total = game.level.totalSpawn;
        const pct = Math.round(game.savedCount / total * 100);
        const timeTaken = (game.level.time * 60 - game.time) / 60;
        let medals = { saved: false, skills: false, time: false };

        // Visual stat row — the in-game version of the shareable result.
        const stat = (label, value) => `<div class="stat"><b>${value}</b><span>${label}</span></div>`;
        document.getElementById('msg-stats').innerHTML =
            stat('Saved', `${game.savedCount}/${total}`) +
            stat('Rescued', `${pct}%`) +
            stat('Time', this.fmtTime(timeTaken)) +
            stat('Skills', game.skillsUsed);

        const mWrap = document.getElementById('msg-medals-wrap');
        mWrap.innerHTML = '';
        if (win && game.level.par) {
            medals = computeMedals(game.level.par, {
                saved: game.savedCount,
                skills: game.skillsUsed,
                time: timeTaken,
            });
            const key = game.levelIdx >= 0 ? game.levelIdx : game.level.name;
            storage.setMedals(key, medals);

            let html = '';
            if (medals.saved || medals.skills || medals.time) {
                html += '<div class="msg-medals">';
                const slot = (label, earned, icon, color) => earned ? `
                    <div class="msg-medal-slot">
                        <span class="medal ${color}">${icon}</span>
                        <span class="msg-medal-label">${label}</span>
                    </div>` : '';
                html += slot('Rescue', medals.saved, UI_ICONS.trophy, 'medal-gold');
                html += slot('Efficiency', medals.skills, UI_ICONS.medalSilver, 'medal-silver');
                html += slot('Speed', medals.time, UI_ICONS.medalBronze, 'medal-bronze');
                html += '</div>';
            }
            // Near-miss deltas — the concrete "why replay" hook.
            const par = game.level.par;
            const misses = [];
            if (!medals.saved) misses.push(`Rescue missed by ${par.saved - game.savedCount}`);
            if (!medals.skills) misses.push(`Efficiency missed by ${game.skillsUsed - par.skills} skill${game.skillsUsed - par.skills === 1 ? '' : 's'}`);
            if (!medals.time) misses.push(`Speed missed by ${Math.max(1, Math.ceil(timeTaken - par.time))}s`);
            if (misses.length) {
                html += '<div class="msg-misses">' +
                    misses.map(m => `<span>${m}</span>`).join('') + '</div>';
            }
            if (!storage.load('medalLegendSeen', false)) {
                html += '<div class="msg-medal-legend" aria-label="Medal guide">' +
                    `<span>${UI_ICONS.trophy}<b>Rescue</b> all saved</span>` +
                    `<span>${UI_ICONS.medalSilver}<b>Efficiency</b> low skills</span>` +
                    `<span>${UI_ICONS.medalBronze}<b>Speed</b> fast clear</span>` +
                    '</div>';
                storage.save('medalLegendSeen', true);
            }
            mWrap.innerHTML = html;
        }

        // Stash a compact run summary for the "Share result" button.
        this.lastResult = {
            name: game.level.name,
            isCampaign: game.levelIdx >= 0,
            campaignNum: game.levelIdx + 1,
            saved: game.savedCount, total, pct,
            timeStr: this.fmtTime(timeTaken),
            skills: game.skillsUsed,
            medalCount: [medals.saved, medals.skills, medals.time].filter(Boolean).length,
            medalStr: [
                medals.saved ? 'Rescue' : '',
                medals.skills ? 'Efficiency' : '',
                medals.time ? 'Speed' : '',
            ].filter(Boolean).join('+'),
            win,
            level: game.level,
        };

        // "Retry for medals" appears on a win that didn't sweep all three.
        const allMedals = medals.saved && medals.skills && medals.time;
        const showRetry = win && game.level.par && !allMedals && game.state !== 'VICTORY';
        document.getElementById('msg-btn-retry').classList.toggle('hidden', !showRetry);

        document.getElementById('msg-btn-primary').innerText =
            game.state === 'VICTORY' ? 'The End' : (win ? 'Next Level' : 'Retry');
        if (win) audio.sfxWin(); else audio.sfxLose();

        // Fire a stamp sting as each earned medal slams in (matches the CSS
        // .msg-medal-slot stagger: 0.30s / 0.55s / 0.80s).
        if (win) {
            const earned = [medals.saved, medals.skills, medals.time].filter(Boolean);
            earned.forEach((_, i) => setTimeout(() => audio.sfxMedal(i), 300 + i * 250));
        }
    },
    fmtTime(seconds) {
        const s = Math.max(0, Math.round(seconds));
        return Math.floor(s / 60) + ':' + (s % 60).toString().padStart(2, '0');
    },
    /**
     * Copy a compact, brag-worthy summary of the run — the game's main viral
     * hook. Campaign runs link back to the hosted game; custom levels embed a
     * playable ?level= code so a friend can attempt the exact same puzzle.
     */
    shareResult() {
        const r = this.lastResult;
        if (!r) return;
        const label = r.isCampaign ? `Level ${r.campaignNum} "${r.name}"` : `"${r.name}"`;
        const medalTail = r.medalStr ? ` medals: ${r.medalStr}` : '';
        const verb = r.win ? 'rescued' : 'reached';
        // "Challenge a friend" framing — strongest on a clean win, still inviting
        // on a near miss (so close losses also become share moments).
        const challenge = r.win
            ? (r.medalCount >= 3 ? 'Swept all 3 medals. Can you?' : 'Think you can beat my run?')
            : `So close: ${r.saved}/${r.total} saved. Can you do better?`;
        let text = `MOSSLINGS — ${label}: ${verb} ${r.saved}/${r.total} (${r.pct}%) in ${r.timeStr}, ${r.skills} skills${medalTail}. ${challenge}`;

        // Append a link the recipient can actually open.
        if (location.protocol === 'file:') {
            if (!r.isCampaign) {
                const code = serializeLevel(r.level);
                if (code) text += `\nLevel code: ${code}`;
            }
            this.copyText(text, 'Result copied. Host the game to add a play link.');
            return;
        }
        let url = null;
        if (r.isCampaign) {
            const u = new URL(location.href); u.search = ''; u.hash = '';
            url = u.toString();
        } else {
            const code = serializeLevel(r.level);
            url = code ? this.shareUrlFor(code) : null;
        }
        if (url) text += `\n${url}`;
        this.copyText(text, 'Result + link copied to clipboard!');
    },

    // --- Level editor -------------------------------------------------------
    startEditor() {
        const game = this.game;
        if (typeof music !== 'undefined' && music) music.stop();
        game.state = 'EDITOR';
        game.levelIdx = -1;
        game.level = {
            name: 'Custom Level', reqSaved: 5, totalSpawn: 10, time: 180, spawnRate: 60,
            spawn: { x: 100, y: 100 }, exit: { x: 800, y: 400 },
            inventory: { [SKILLS.BLOCK]: 5, [SKILLS.BUILD]: 10, [SKILLS.BASH]: 5, [SKILLS.MINE]: 5, [SKILLS.DIG]: 5, [SKILLS.FLOAT]: 5, [SKILLS.CLIMB]: 5, [SKILLS.EXPLODE]: 5 },
            commands: [],
        };
        this.editCommands = [];
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
    pushEditHistory() {
        this.editHistory.push([...this.editCommands.map(c => ({ ...c }))]);
        if (this.editHistory.length > 50) this.editHistory.shift();
    },
    undoEdit() {
        if (!this.editHistory.length) return;
        this.editCommands = this.editHistory.pop();
        this.game.terrain.clear(this.game.level.theme || 'FOREST');
        for (const c of this.editCommands) this.game.terrain.drawRect(c.x, c.y, c.w, c.h, c.type);
        this.game.terrain.finalize();
    },
    saveCustomLevel() {
        const game = this.game;
        game.level.name = document.getElementById('edit-name').value || 'Custom Level';
        game.level.commands = this.editCommands;
        storage.saveCustomLevel(game.level);
        this.toast(`Level "${game.level.name}" saved to LocalStorage.`);
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
        game.drawHatch(ctx);
        game.drawExit(ctx);
    },
};

// --- Bootstrap (skipped under the Node test harness) ---
if (typeof document !== 'undefined' && document.getElementById('gameCanvas')) {
    const game = new Game();
    ui.init(game);
    game.loop(0);
}
