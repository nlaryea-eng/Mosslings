'use strict';
/** Runtime object helpers: platforms, switches, gates, and rider carry logic. */
Object.assign(Game.prototype, {
    buildRuntimeObjects(objects) {
        return normalizeLevelObjects(objects).map((o, idx) => {
            const base = { ...o, baseX: o.x, baseY: o.y };
            const r = objectRectAt(base, this.simStep);
            return { ...base, id: idx, x: r.x, y: r.y, prevX: r.x, prevY: r.y, active: false, open: false };
        });
    },

    solidObjectAt(x, y) {
        for (const o of this.objects) {
            if (o.type === OBJ_SWITCH) continue;
            if (o.type === OBJ_GATE && o.open) continue;
            if (x >= o.x && x < o.x + o.w && y >= o.y && y < o.y + o.h) return T_METAL;
        }
        return T_AIR;
    },

    mosslingPressesSwitch(m, o) {
        if (!m.alive()) return false;
        return m.x >= o.x - 3 && m.x < o.x + o.w + 3 && m.y >= o.y - 3 && m.y < o.y + o.h + 6;
    },

    updateObjects(initial = false) {
        if (!this.objects.length) return;
        const nextSwitchState = {};
        for (const o of this.objects) {
            o.prevX = initial ? o.x : (o.x ?? o.prevX ?? o.x);
            o.prevY = initial ? o.y : (o.y ?? o.prevY ?? o.y);
            if (o.type === OBJ_PLATFORM) {
                const r = objectRectAt(o, this.simStep);
                o.x = r.x; o.y = r.y; o.w = r.w; o.h = r.h;
            } else {
                o.x = o.x ?? o.prevX;
                o.y = o.y ?? o.prevY;
            }
        }
        if (!initial) this.carryPlatformRiders();
        for (const o of this.objects) {
            if (o.type !== OBJ_SWITCH) continue;
            o.active = this.mosslings.some(m => this.mosslingPressesSwitch(m, o));
            if (o.active) nextSwitchState[o.target] = true;
        }
        this.switchState = nextSwitchState;
        for (const o of this.objects) {
            if (o.type === OBJ_GATE) o.open = !!this.switchState[o.target];
        }
    },

    carryPlatformRiders() {
        for (const o of this.objects) {
            if (o.type !== OBJ_PLATFORM) continue;
            const dx = o.x - o.prevX, dy = o.y - o.prevY;
            if (!dx && !dy) continue;
            for (const m of this.mosslings) {
                if (!m.alive()) continue;
                const onPrevTop = m.x >= o.prevX - 2 && m.x < o.prevX + o.w + 2 &&
                    m.y >= o.prevY - 2 && m.y <= o.prevY + 3;
                if (!onPrevTop) continue;
                m.x += dx;
                m.y += dy;
            }
        }
    },
});
