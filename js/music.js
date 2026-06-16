'use strict';
/**
 * MOSSLINGS — original procedural background loop.
 *
 * Web Audio only, no audio files. A small look-ahead sequencer schedules a
 * 64-step loop on the AudioContext clock so timing does not drift and never
 * touches the deterministic game update path.
 */
const MUSIC_THEMES = {
    FOREST: {
        bpm: 122, root: 57, scale: [0, 2, 3, 5, 7, 9, 10], prog: [0, 3, 5, 4],
        cutoff: 1650, chordWave: 'triangle', bassWave: 'sawtooth', motifWave: 'sine',
        padVol: 0.022, chordVol: 0.035, bassVol: 0.065, motifVol: 0.026,
    },
    CAVE: {
        bpm: 120, root: 53, scale: [0, 2, 3, 5, 7, 8, 10], prog: [0, 5, 3, 4],
        cutoff: 1250, chordWave: 'sine', bassWave: 'triangle', motifWave: 'triangle',
        padVol: 0.026, chordVol: 0.032, bassVol: 0.06, motifVol: 0.02,
    },
    VOLCANO: {
        bpm: 124, root: 55, scale: [0, 1, 3, 5, 7, 8, 10], prog: [0, 4, 5, 1],
        cutoff: 1450, chordWave: 'triangle', bassWave: 'sawtooth', motifWave: 'square',
        padVol: 0.02, chordVol: 0.03, bassVol: 0.068, motifVol: 0.018,
    },
};

const MUSIC_LOOP = {
    // 16th-note grid, 4 bars. Values are deliberately simple to stay non-
    // intrusive under puzzle play and easy to retune.
    kick:   [1,0,0,0, 1,0,0,0, 1,0,0,0, 1,0,0,0],
    clap:   [0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0],
    hats:   [0,0.55,0,0.35, 0,0.65,0,0.35, 0,0.55,0,0.35, 0,0.7,0,0.4],
    perc:   [0,0,0.35,0, 0,0,0,0.25, 0,0,0.35,0, 0.25,0,0,0],
    bass:   [0,null,0,null, 3,null,0,null, 5,null,4,null, 3,null,5,null],
    chords: [0,null,null,null, null,null,2,null, null,null,null,null, 4,null,null,5],
    motif:  [null,null,7,null, null,9,null,null, null,null,10,null, 9,null,7,null],
};

class MusicEngine {
    constructor(audioEngine) {
        this.audio = audioEngine;
        this.playing = false;
        this.theme = 'FOREST';
        this.cfg = MUSIC_THEMES.FOREST;
        this.volume = 0.28;      // music bus; SFX still hit the master directly
        this.ducked = false;
        this.intensity = 1;
        this.bus = null;
        this.filter = null;
        this.timer = null;
        this.nextStepTime = 0;
        this.step = 0;
        this.loopSteps = 64;
    }

    _hz(note) { return 440 * Math.pow(2, (note - 69) / 12); }
    _chordRootForBar(bar) { return this.cfg.prog[bar % this.cfg.prog.length]; }
    _scaleNote(degree, octaveBase = 0) {
        const s = this.cfg.scale, len = s.length;
        const oct = Math.floor(degree / len) + octaveBase;
        return this._hz(this.cfg.root + s[((degree % len) + len) % len] + 12 * oct);
    }

    _buildBus() {
        if (this.bus || !this.audio.ctx) return;
        const ctx = this.audio.ctx;
        this.filter = ctx.createBiquadFilter();
        this.filter.type = 'lowpass';
        this.filter.frequency.value = this.cfg.cutoff;
        this.filter.Q.value = 0.9;
        this.bus = ctx.createGain();
        this.bus.gain.value = 0;
        this.filter.connect(this.bus).connect(this.audio.master);
    }

    /** Start is idempotent: repeated calls never create overlapping loops. */
    start(theme) {
        if (!this.audio.ctx || !this.audio.available) return;
        if (this.audio.ctx.state === 'suspended' && this.audio.ctx.resume) this.audio.ctx.resume();
        this.theme = theme && MUSIC_THEMES[theme] ? theme : 'FOREST';
        this.cfg = MUSIC_THEMES[this.theme];
        this._buildBus();
        if (!this.bus || !this.filter) return;

        const now = this.audio.ctx.currentTime;
        this.filter.frequency.setTargetAtTime(this.cfg.cutoff * this.intensity, now, 0.35);
        this._setBusTarget(this.ducked ? this.volume * 0.42 : this.volume, now, 1.2);
        if (this.playing) return;

        this.playing = true;
        this.step = 0;
        this.nextStepTime = now + 0.08;
        this.timer = setInterval(() => this._scheduler(), 25);
    }

    stop(fade = 0.9) {
        if (!this.playing) return;
        this.playing = false;
        if (this.timer) { clearInterval(this.timer); this.timer = null; }
        if (this.audio.ctx && this.bus) this._setBusTarget(0, this.audio.ctx.currentTime, fade);
    }

    setIntensity(v) {
        this.intensity = Math.max(0.6, Math.min(1.5, v));
        if (this.audio.ctx && this.filter) {
            this.filter.frequency.setTargetAtTime(this.cfg.cutoff * this.intensity, this.audio.ctx.currentTime, 0.3);
        }
    }

    duck(on) {
        this.ducked = !!on;
        if (!this.audio.ctx || !this.bus) return;
        this._setBusTarget(this.ducked ? this.volume * 0.42 : this.volume, this.audio.ctx.currentTime, 0.5);
    }

    _setBusTarget(value, now, fade) {
        this.bus.gain.cancelScheduledValues(now);
        this.bus.gain.setValueAtTime(Math.max(0.0001, this.bus.gain.value), now);
        this.bus.gain.linearRampToValueAtTime(value, now + fade);
    }

    _scheduler() {
        if (!this.playing || !this.audio.ctx) return;
        const stepDur = 60 / this.cfg.bpm / 4;
        const horizon = this.audio.ctx.currentTime + 0.14;
        while (this.nextStepTime < horizon) {
            this._scheduleStep(this.step % this.loopSteps, this.nextStepTime, stepDur);
            this.nextStepTime += stepDur;
            this.step = (this.step + 1) % this.loopSteps;
        }
    }

    _scheduleStep(step, when, stepDur) {
        const inBar = step % 16;
        const bar = Math.floor(step / 16);
        const root = this._chordRootForBar(bar);

        if (MUSIC_LOOP.kick[inBar]) this._kick(when);
        if (MUSIC_LOOP.clap[inBar]) this._noiseHit(when, 0.08, 0.034, 1800, 0.012);
        if (MUSIC_LOOP.hats[inBar]) this._noiseHit(when, 0.028, 0.018 * MUSIC_LOOP.hats[inBar], 6500, 0.004);
        if (MUSIC_LOOP.perc[inBar]) this._noiseHit(when, 0.045, 0.014 * MUSIC_LOOP.perc[inBar], 3200, 0.006);

        const bass = MUSIC_LOOP.bass[inBar];
        if (bass !== null) this._note(this._scaleNote(root + bass, -2), when, stepDur * 1.7, this.cfg.bassVol, this.cfg.bassWave, 0.01, 0.07);

        const chord = MUSIC_LOOP.chords[inBar];
        if (chord !== null) this._chord(root + chord, when, stepDur * 2.6);
        if (inBar === 0) this._pad(root, when, stepDur * 14);

        const motif = MUSIC_LOOP.motif[inBar];
        if (motif !== null && (bar % 2 === 0 || inBar >= 8)) {
            this._note(this._scaleNote(root + motif, 0), when, stepDur * 1.4, this.cfg.motifVol, this.cfg.motifWave, 0.012, 0.08);
        }
    }

    _kick(when) {
        const ctx = this.audio.ctx;
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(92, when);
        osc.frequency.exponentialRampToValueAtTime(42, when + 0.12);
        g.gain.setValueAtTime(0.0001, when);
        g.gain.exponentialRampToValueAtTime(0.11, when + 0.006);
        g.gain.exponentialRampToValueAtTime(0.0001, when + 0.18);
        osc.connect(g).connect(this.filter);
        osc.start(when); osc.stop(when + 0.22);
    }

    _noiseHit(when, dur, vol, cutoff, attack) {
        const ctx = this.audio.ctx;
        const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
        const buf = ctx.createBuffer(1, len, ctx.sampleRate);
        const data = buf.getChannelData(0);
        for (let i = 0; i < len; i++) data[i] = ((i * 1103515245 + 12345) >>> 16) / 32768 - 1;
        const src = ctx.createBufferSource();
        src.buffer = buf;
        const f = ctx.createBiquadFilter();
        f.type = 'highpass';
        f.frequency.value = cutoff;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, when);
        g.gain.exponentialRampToValueAtTime(vol, when + attack);
        g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
        src.connect(f).connect(g).connect(this.filter);
        src.start(when); src.stop(when + dur + 0.02);
    }

    _note(freq, when, dur, vol, wave, attack = 0.012, release = 0.08) {
        const ctx = this.audio.ctx;
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = wave;
        osc.frequency.setValueAtTime(freq, when);
        g.gain.setValueAtTime(0.0001, when);
        g.gain.exponentialRampToValueAtTime(vol, when + attack);
        g.gain.exponentialRampToValueAtTime(0.0001, when + Math.max(attack + release, dur));
        osc.connect(g).connect(this.filter);
        osc.start(when); osc.stop(when + dur + 0.04);
    }

    _chord(degree, when, dur) {
        for (const offset of [0, 2, 4, 6]) {
            this._note(this._scaleNote(degree + offset, -1), when, dur, this.cfg.chordVol, this.cfg.chordWave, 0.018, 0.16);
        }
    }

    _pad(degree, when, dur) {
        for (const offset of [0, 4, 6]) {
            this._note(this._scaleNote(degree + offset, -1), when, dur, this.cfg.padVol, 'sine', 0.16, 0.8);
        }
    }
}

const music = typeof audio !== 'undefined' ? new MusicEngine(audio) : null;

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { MusicEngine, MUSIC_THEMES, MUSIC_LOOP };
}
