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

        $('btn-gallery').onclick = () => this.openGallery();
        $('btn-gallery-back').onclick = () => { $('gallery-screen').classList.add('hidden'); this.backToMenu(); };
        $('btn-gallery-editor').onclick = () => { $('gallery-screen').classList.add('hidden'); this.startEditor(); };

        $('btn-editor').onclick = () => { audio.init(); this.startEditor(); };
        $('btn-start').onclick = () => { audio.init(); game.loadLevel(game.levelIdx); };
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
            $('btn-mute').innerText = audio.toggleMute() ? '🔇' : '🔊';
        };
        $('msg-btn-primary').onclick = () => {
            if (game.state === 'VICTORY') this.backToMenu();
            else if (this.lastWin && game.levelIdx >= 0) game.loadLevel(game.levelIdx + 1);
            else if (game.levelIdx === -2) this.backToMenu();
            else game.loadLevel(game.levelIdx);
        };
        $('msg-btn-menu').onclick = () => this.backToMenu();

        document.querySelectorAll('.skill-btn').forEach(btn => {
            btn.onclick = () => game.selectSkill(parseInt(btn.dataset.skill, 10));
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
            setPointer(e);
            if (game.state === 'EDITOR') { this.applyEdit(); return; }
            if (game.state === 'PLAY' || game.state === 'PAUSE') { game.tryAssign(); e.preventDefault(); }
        };
        game.canvas.oncontextmenu = e => { e.preventDefault(); game.selectSkill(null); };

        window.onkeydown = e => {
            if (e.target.tagName === 'INPUT') return;
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
        audio.init();
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
        game.level.name = document.getElementById('edit-name').value.trim() || 'Custom Level';
        game.level.commands = this.editCommands;
        const code = serializeLevel(game.level);
        if (!code) { this.toast('Level is too large or invalid to share.', true); return; }
        const url = location.origin + location.pathname + '?level=' + code;
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(url)
                .then(() => this.toast('🔗 Share link copied to clipboard!'))
                .catch(() => this.promptCopy(url));
        } else {
            this.promptCopy(url);
        }
    },
    /** Clipboard API is unavailable on file:// in some browsers — fall back to a prompt. */
    promptCopy(url) {
        window.prompt('Copy this share link:', url);
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
        for (let i = 0; i < LEVELS.length; i++) {
            const b = document.createElement('button');
            b.className = 'lvl-btn' + (i === this.game.levelIdx ? ' selected' : '');
            b.disabled = i > unlocked;
            const best = storage.getBest(i);
            const medals = storage.getMedals(i);
            let medalHtml = '<div class="lvl-medals">';
            if (medals.saved) medalHtml += '<span class="medal medal-gold" title="Rescue Medal (100% saved)">🏆</span>';
            if (medals.skills) medalHtml += '<span class="medal medal-silver" title="Efficiency Medal (low skills)">🥈</span>';
            if (medals.time) medalHtml += '<span class="medal medal-bronze" title="Speed Medal (fast completion)">🥉</span>';
            medalHtml += '</div>';

            b.innerHTML = `<span class="lvl-num">${i + 1}</span>` +
                (best !== null ? `<span class="lvl-best">${best}%</span>` : '') +
                medalHtml;
            b.title = i <= unlocked ? LEVELS[i].name : 'Locked';
            b.onclick = () => { this.game.levelIdx = i; this.buildMenu(); };
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
            const best = storage.getBest(lvl.name) || 0;
            const medals = storage.getMedals(lvl.name);
            let medalHtml = '<div class="lvl-medals">';
            if (medals.saved) medalHtml += '<span class="medal medal-gold" title="Rescue Gold">🏆</span>';
            if (medals.skills) medalHtml += '<span class="medal medal-silver" title="Efficiency Silver">🥈</span>';
            if (medals.time) medalHtml += '<span class="medal medal-bronze" title="Speed Bronze">🥉</span>';
            medalHtml += '</div>';

            const card = document.createElement('div');
            card.className = 'gallery-card';
            card.innerHTML = `
                <h4>${lvl.name} ${medalHtml}</h4>
                <div class="card-meta">
                    <span>${lvl.totalSpawn} mosslings</span>
                    <span>${lvl.reqSaved} req</span>
                    <span>${lvl.time}s</span>
                </div>
                <div class="card-btns">
                    <button class="btn-play">▶ Play</button>
                    <button class="btn-edit">✎ Edit</button>
                    <button class="btn-share">🔗 Share</button>
                    <button class="btn-delete">✖ Delete</button>
                </div>
            `;
            card.querySelector('.btn-play').onclick = () => {
                document.getElementById('gallery-screen').classList.add('hidden');
                audio.init();
                this.game.loadLevel(lvl, true);
            };
            card.querySelector('.btn-edit').onclick = () => {
                document.getElementById('gallery-screen').classList.add('hidden');
                this.editCustomLevel(lvl);
            };
            card.querySelector('.btn-share').onclick = () => {
                this.game.level = lvl; // temporary swap for share
                this.shareCustomLevel();
            };
            card.querySelector('.btn-delete').onclick = () => {
                if (confirm(`Delete "${lvl.name}"?`)) {
                    storage.deleteCustomLevel(lvl.name);
                    this.buildGallery();
                    this.buildMenu();
                }
            };
            list.appendChild(card);
        });
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
        this.updateToolbar(game);
    },

    refreshButtons(game) {
        document.getElementById('btn-pause').innerText = game.state === 'PAUSE' ? '▶' : '⏸';
        document.getElementById('btn-ffwd').classList.toggle('active', game.ffwd);
    },

    flashNuke(armed) {
        const b = document.getElementById('btn-nuke');
        b.classList.toggle('armed', armed);
        b.innerText = armed ? 'SURE?' : '☢';
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
        const o = document.getElementById('message-overlay');
        o.classList.remove('hidden');
        document.getElementById('msg-title').innerText = title;
        document.getElementById('msg-title').className = win ? 'win' : 'fail';
        document.getElementById('msg-text').innerText = text;

        const mWrap = document.getElementById('msg-medals-wrap');
        mWrap.innerHTML = '';
        if (win && this.game.level.par) {
            const timeTaken = (this.game.level.time * 60 - this.game.time) / 60;
            const m = computeMedals(this.game.level.par, {
                saved: this.game.savedCount,
                skills: this.game.skillsUsed,
                time: timeTaken,
            });
            const key = this.game.levelIdx >= 0 ? this.game.levelIdx : this.game.level.name;
            storage.setMedals(key, m);

            if (m.saved || m.skills || m.time) {
                let html = '<div class="msg-medals">';
                const slot = (label, earned, icon, color) => earned ? `
                    <div class="msg-medal-slot">
                        <span class="medal ${color}">${icon}</span>
                        <span class="msg-medal-label">${label}</span>
                    </div>` : '';
                html += slot('Rescue', m.saved, '🏆', 'medal-gold');
                html += slot('Efficiency', m.skills, '🥈', 'medal-silver');
                html += slot('Speed', m.time, '🥉', 'medal-bronze');
                html += '</div>';
                mWrap.innerHTML = html;
            }
        }

        document.getElementById('msg-btn-primary').innerText =
            this.game.state === 'VICTORY' ? 'The End' : (win ? 'Next Level ▸' : 'Retry');
        if (win) audio.sfxWin(); else audio.sfxLose();
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
