'use strict';
/** Level-editor state, input application, settings, and editor-only drawing. */
Object.assign(ui, {
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
        // Advisory only — a generous reachability smoke check, not a proof. We
        // still save (the heuristic must never lock a creator out of a clever
        // level), but flag a likely dead end so it isn't shared blind.
        const solve = analyzeSolvability(game.level);
        if (typeof ugcTrustMeta === 'function') game.level.ugcTrust = ugcTrustMeta(game.level, { solvability: solve });
        storage.saveCustomLevel(game.level);
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
        game.level.reqSaved = clamp($('edit-req-saved').value, 1, game.level.totalSpawn, 5);
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
});
