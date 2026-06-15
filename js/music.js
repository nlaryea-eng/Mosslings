'use strict';
/**
 * MOSSLINGS — generative ambient music.
 *
 * Zero assets: every note is synthesized on the shared AudioContext and routed
 * through AudioEngine's master gain, so the existing mute toggle covers music
 * too. Nothing here runs inside the simulation — notes are scheduled on the
 * audio clock with a look-ahead scheduler (the standard Web Audio pattern), so
 * music never perturbs the deterministic 60Hz update()/rewind path.
 *
 * Each theme is a small generative grammar — a slow chord progression drives a
 * detuned pad drone, a soft bass pulse on the downbeat, and a sparse,
 * probabilistic pentatonic melody. The result evolves rather than loops, which
 * reads as "composed" without a single audio file.
 */
const MUSIC_THEMES = {
    // root = MIDI-ish base; scale = semitone offsets (pentatonic = no wrong notes);
    // prog = chord roots (scale degrees) cycled one per bar.
    FOREST: {
        bpm: 70, wave: 'triangle', bassWave: 'sine', cutoff: 1500,
        root: 57, scale: [0, 2, 4, 7, 9], prog: [0, 4, 5, 2], // A major pentatonic, gentle
        padVol: 0.05, bassVol: 0.07, leadVol: 0.06, leadChance: 0.5,
    },
    CAVE: {
        bpm: 56, wave: 'sine', bassWave: 'sine', cutoff: 900,
        root: 48, scale: [0, 3, 5, 7, 10], prog: [0, 5, 3, 0], // C minor pentatonic, low & spacious
        padVol: 0.055, bassVol: 0.06, leadVol: 0.045, leadChance: 0.34,
    },
    VOLCANO: {
        bpm: 92, wave: 'sawtooth', bassWave: 'triangle', cutoff: 1100,
        root: 50, scale: [0, 1, 5, 7, 8], prog: [0, 7, 5, 1], // D phrygian-ish, tense
        padVol: 0.04, bassVol: 0.075, leadVol: 0.05, leadChance: 0.6,
    },
};

class MusicEngine {
    constructor(audioEngine) {
        this.audio = audioEngine;
        this.playing = false;
        this.theme = 'FOREST';
        this.cfg = MUSIC_THEMES.FOREST;
        this.bus = null;        // music sub-mix (lets us fade independently of SFX)
        this.filter = null;
        this.pads = [];         // long-lived detuned drone oscillators
        this.timer = null;
        this.nextStepTime = 0;
        this.step = 0;          // 16th-note counter
        this.intensity = 1;     // 0.6 (calm) … 1.4 (tense), nudged by gameplay
    }

    // freq for a MIDI-ish note number (A4=69=440)
    _hz(note) { return 440 * Math.pow(2, (note - 69) / 12); }

    _buildBus() {
        if (this.bus || !this.audio.ctx) return;
        const ctx = this.audio.ctx;
        this.filter = ctx.createBiquadFilter();
        this.filter.type = 'lowpass';
        this.filter.frequency.value = this.cfg.cutoff;
        this.filter.Q.value = 0.6;
        this.bus = ctx.createGain();
        this.bus.gain.value = 0;
        this.filter.connect(this.bus).connect(this.audio.master);
    }

    /** Start (or smoothly re-theme) the score. Safe to call repeatedly. */
    start(theme) {
        this.audio.init();
        if (!this.audio.ctx || !this.audio.available) return;
        if (this.audio.ctx.state === 'suspended') this.audio.ctx.resume();
        this._buildBus();
        const newTheme = theme && MUSIC_THEMES[theme] ? theme : 'FOREST';
        this.theme = newTheme;
        this.cfg = MUSIC_THEMES[newTheme];
        const ctx = this.audio.ctx, now = ctx.currentTime;
        this.filter.frequency.setTargetAtTime(this.cfg.cutoff, now, 0.5);

        if (this.playing) { this._startPads(); return; } // already running: just refresh pads
        this.playing = true;
        this.step = 0;
        this.nextStepTime = now + 0.08;
        this._startPads();
        this.bus.gain.cancelScheduledValues(now);
        this.bus.gain.setValueAtTime(Math.max(0.0001, this.bus.gain.value), now);
        this.bus.gain.linearRampToValueAtTime(1, now + 2.5); // gentle fade-in
        this.timer = setInterval(() => this._scheduler(), 25);
    }

    /** Fade out and tear down. */
    stop(fade = 1.2) {
        if (!this.playing) return;
        this.playing = false;
        if (this.timer) { clearInterval(this.timer); this.timer = null; }
        if (!this.audio.ctx) return;
        const now = this.audio.ctx.currentTime;
        if (this.bus) {
            this.bus.gain.cancelScheduledValues(now);
            this.bus.gain.setValueAtTime(this.bus.gain.value, now);
            this.bus.gain.linearRampToValueAtTime(0, now + fade);
        }
        for (const p of this.pads) { try { p.osc.stop(now + fade + 0.1); } catch (e) {} }
        this.pads = [];
    }

    /** Gameplay can tilt the mood: e.g. low time → more tense (brighter, busier). */
    setIntensity(v) { this.intensity = Math.max(0.6, Math.min(1.5, v)); }

    _startPads() {
        const ctx = this.audio.ctx, now = ctx.currentTime;
        for (const p of this.pads) { try { p.osc.stop(now + 0.3); } catch (e) {} }
        this.pads = [];
        // three detuned voices form a soft, breathing drone
        const detunes = [-6, 0, 7];
        for (const d of detunes) {
            const osc = ctx.createOscillator();
            const g = ctx.createGain();
            osc.type = this.cfg.wave;
            osc.detune.value = d;
            g.gain.value = 0.0001;
            osc.connect(g).connect(this.filter);
            osc.start(now);
            g.gain.linearRampToValueAtTime(this.cfg.padVol, now + 2.5);
            this.pads.push({ osc, gain: g, detune: d });
        }
    }

    _chordRootForBar(bar) {
        return this.cfg.prog[bar % this.cfg.prog.length];
    }

    /** Map a scale degree (can exceed the scale length) to an absolute frequency. */
    _scaleNote(degree, octaveBase = 0) {
        const s = this.cfg.scale, len = s.length;
        const oct = Math.floor(degree / len) + octaveBase;
        return this._hz(this.cfg.root + s[((degree % len) + len) % len] + 12 * oct);
    }

    _scheduler() {
        if (!this.playing || !this.audio.ctx) return;
        const ctx = this.audio.ctx;
        const stepDur = 60 / this.cfg.bpm / 4; // 16th note
        while (this.nextStepTime < ctx.currentTime + 0.12) {
            this._scheduleStep(this.step, this.nextStepTime, stepDur);
            this.nextStepTime += stepDur;
            this.step++;
        }
    }

    _scheduleStep(step, when, stepDur) {
        const inBar = step % 16;           // 16 sixteenths per bar
        const bar = Math.floor(step / 16);
        const degree = this._chordRootForBar(bar);

        // Pad: glide the drone to the new chord at the top of each bar.
        if (inBar === 0) {
            const tones = [this._scaleNote(degree, 0), this._scaleNote(degree + 2, 0), this._scaleNote(degree + 4, 0)];
            this.pads.forEach((p, i) => {
                p.osc.frequency.setTargetAtTime(tones[i % tones.length], when, 0.25);
            });
        }

        // Bass: soft pulse on beats 1 and 3.
        if (inBar === 0 || inBar === 8) {
            this._pluck(this._scaleNote(degree, -1), when, stepDur * 6,
                this.cfg.bassVol, this.cfg.bassWave, 0.02);
        }

        // Lead: sparse pentatonic motif on the off-eighths, probability-gated.
        const leadSlot = (inBar % 2 === 0);
        if (leadSlot && Math.random() < this.cfg.leadChance * this.intensity) {
            const motif = [degree + 4, degree + 5, degree + 7, degree + 9, degree + 11];
            const note = motif[(Math.random() * motif.length) | 0];
            this._pluck(this._scaleNote(note, 0), when, stepDur * (2 + (Math.random() * 2 | 0)),
                this.cfg.leadVol, this.cfg.wave, 0.005);
        }
    }

    /** One enveloped note straight to the music filter (never the SFX path). */
    _pluck(freq, when, dur, vol, wave, attack) {
        const ctx = this.audio.ctx;
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = wave;
        osc.frequency.value = freq;
        g.gain.setValueAtTime(0.0001, when);
        g.gain.exponentialRampToValueAtTime(vol, when + attack);
        g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
        osc.connect(g).connect(this.filter);
        osc.start(when);
        osc.stop(when + dur + 0.05);
    }
}

// Shares the single AudioContext/master gain with the SFX engine (loaded first).
const music = typeof audio !== 'undefined' ? new MusicEngine(audio) : null;

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { MusicEngine, MUSIC_THEMES };
}
