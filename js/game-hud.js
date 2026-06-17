'use strict';
/** HUD/chrome sync helpers that bridge Game state to the UI singleton. */
Object.assign(Game.prototype, {
    updateHud() {
        if (!this.level || this.state === 'MENU') return;
        this.el['lbl-saved'].innerText = this.savedCount;
        this.el['lbl-alive'].innerText = this.aliveCount();
        this.el['lbl-skills'].innerText = this.skillsUsed;
        const s = Math.max(0, Math.ceil(this.time / 60));
        this.el['lbl-time'].innerText = Math.floor(s / 60) + ':' + (s % 60).toString().padStart(2, '0');
        this.el['lbl-time'].classList.toggle('time-low', s <= 20 && this.state === 'PLAY');
        if (typeof music !== 'undefined' && music && music.playing) {
            music.setIntensity(s <= 30 ? 1.4 : (s <= 60 ? 1.15 : 1));
            if (music.setState) music.setState(this.ghostRace ? 'race' : (s <= 20 ? 'tense' : 'play'));
        }

        // medal pace tracking
        if (this.level.par) {
            const par = this.level.par;
            const maxPossibleSaved = this.savedCount + this.aliveCount() + (this.level.totalSpawn - this.spawnCounter);
            const timeTaken = (this.level.time * 60 - this.time) / 60;

            const gold = document.getElementById('hud-medal-gold');
            const silver = document.getElementById('hud-medal-silver');
            const bronze = document.getElementById('hud-medal-bronze');

            gold.classList.toggle('failed', maxPossibleSaved < par.saved);
            silver.classList.toggle('failed', this.skillsUsed > par.skills);
            bronze.classList.toggle('failed', timeTaken > par.time);
        }

        // user-facing rate: 1 (slow) … 99 (fast)
        this.el['lbl-rate'].innerText = Math.round((RATE_MAX - this.spawnRate) / (RATE_MAX - RATE_MIN) * 98 + 1);
    },

    adjustRate(delta) {
        this.spawnRate = Math.max(RATE_MIN, Math.min(RATE_MAX, this.spawnRate - delta * 15));
        audio.sfxSelect();
        this.actionLog.push({ step: this.simStep, type: 'rate', value: this.spawnRate });
    },
});
