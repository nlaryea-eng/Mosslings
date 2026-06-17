'use strict';
/**
 * MOSSLINGS — revised procedural background loop.
 *
 * Goals of this pass:
 * - keep the existing public API compatible
 * - preserve deterministic isolation (never tied to gameplay update path)
 * - reduce CPU waste by caching noise buffers
 * - add longer-horizon variation so loops feel less wallpaper-like
 * - improve theme/world identity without becoming intrusive
 * - add optional state reactivity hooks that remain safe if unused
 */

const MUSIC_THEMES = {
    FOREST: {
        bpm: 122,
        root: 57,
        scale: [0, 2, 4, 5, 7, 9, 11],
        prog: [0, 3, 4, 5],
        pattern: 'FOREST',
        cutoff: 2100,
        chordWave: 'triangle',
        bassWave: 'triangle',
        motifWave: 'sine',
        padVol: 0.022,
        chordVol: 0.036,
        bassVol: 0.064,
        motifVol: 0.028,
        droneVol: 0.012,
    },
    CAVE: {
        bpm: 118,
        root: 53,
        scale: [0, 2, 4, 5, 7, 9, 10],
        prog: [0, 4, 5, 3],
        pattern: 'CAVE',
        cutoff: 1450,
        chordWave: 'sine',
        bassWave: 'triangle',
        motifWave: 'triangle',
        padVol: 0.024,
        chordVol: 0.03,
        bassVol: 0.058,
        motifVol: 0.021,
        droneVol: 0.015,
    },
    VOLCANO: {
        bpm: 126,
        root: 55,
        scale: [0, 2, 3, 5, 7, 9, 10],
        prog: [0, 4, 5, 3],
        pattern: 'VOLCANO',
        cutoff: 1780,
        chordWave: 'triangle',
        bassWave: 'sawtooth',
        motifWave: 'square',
        padVol: 0.016,
        chordVol: 0.03,
        bassVol: 0.068,
        motifVol: 0.02,
        droneVol: 0.01,
    },
};

const MUSIC_LOOP = {
    // 16th-note grid, 4 bars.
    kick:   [1,0,0,0, 1,0,0,0, 1,0,0,0, 1,0,0,0],
    clap:   [0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0],
    hats:   [0,0.7,0,0.42, 0,0.78,0,0.45, 0,0.68,0,0.42, 0,0.82,0,0.5],
    perc:   [0,0,0.35,0, 0,0.28,0,0.25, 0,0,0.4,0, 0.3,0,0,0.28],
    bass:   [0,null,0,null, 4,null,0,null, 5,null,4,null, 2,null,5,null],
    chords: [0,null,null,null, null,2,null,null, null,null,4,null, null,5,null,null],
    motif:  [null,null,7,null, 9,null,null,10, null,null,11,null, 9,null,7,null],
};

const MUSIC_PATTERNS = {
    FOREST: MUSIC_LOOP,
    CAVE: {
        kick:   [1,0,0,0, 0,0,0,0, 1,0,0,0, 0,0,0,0],
        clap:   [0,0,0,0, 0,0,0,0.45, 0,0,0,0, 0,0,0,0.55],
        hats:   [0,0.35,0,0, 0.5,0,0.24,0, 0,0.42,0,0, 0.55,0,0.28,0],
        perc:   [0,0,0.22,0, 0,0,0,0.34, 0,0,0.26,0, 0.2,0,0,0.38],
        bass:   [0,null,null,null, 3,null,null,null, 5,null,null,null, 4,null,2,null],
        chords: [0,null,null,null, null,null,3,null, null,null,null,null, 4,null,null,null],
        motif:  [null,null,null,7, null,5,null,null, null,null,3,null, null,7,null,10],
    },
    VOLCANO: {
        kick:   [1,0,0,0.6, 1,0,0,0, 1,0,0.45,0, 1,0,0,0],
        clap:   [0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0],
        hats:   [0.25,0.72,0.2,0.62, 0.3,0.78,0.22,0.55, 0.28,0.68,0.22,0.58, 0.35,0.86,0.24,0.64],
        perc:   [0,0.35,0,0.25, 0,0.22,0.4,0, 0,0.3,0,0.24, 0.42,0,0.35,0.26],
        bass:   [0,null,0,null, 5,null,3,null, 0,null,7,null, 5,null,3,null],
        chords: [0,null,null,2, null,4,null,null, 0,null,null,5, null,4,null,null],
        motif:  [7,null,10,null, 12,null,10,7, null,9,null,12, 14,null,12,10],
    },
};

class MusicEngine {
    constructor(audioEngine) {
        this.audio = audioEngine;
        this.playing = false;
        this.theme = 'FOREST';
        this.cfg = MUSIC_THEMES.FOREST;

        this.volume = 0.28;
        this.ducked = false;
        this.intensity = 1;
        this.state = 'play'; // menu | play | tense | race | celebration

        this.bus = null;
        this.filter = null;
        this.masterComp = null;
        this.timer = null;

        this.nextStepTime = 0;
        this.step = 0;
        this.loopSteps = 64;

        this._macroCycle = 0;      // increments every 64-step loop
        this._noiseCache = null;   // lazily built white noise buffer
        this._brownNoiseCache = null;
    }

    _pattern() {
        return MUSIC_PATTERNS[this.cfg.pattern] || MUSIC_LOOP;
    }

    _hz(note) {
        return 440 * Math.pow(2, (note - 69) / 12);
    }

    _chordRootForBar(bar) {
        return this.cfg.prog[bar % this.cfg.prog.length];
    }

    _scaleNote(degree, octaveBase = 0) {
        const s = this.cfg.scale;
        const len = s.length;
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

        this.masterComp = ctx.createDynamicsCompressor();
        this.masterComp.threshold.value = -18;
        this.masterComp.knee.value = 18;
        this.masterComp.ratio.value = 2.5;
        this.masterComp.attack.value = 0.01;
        this.masterComp.release.value = 0.18;

        this.bus = ctx.createGain();
        this.bus.gain.value = 0;

        this.filter.connect(this.masterComp).connect(this.bus).connect(this.audio.master);
    }

    _ensureNoiseBuffers() {
        if (!this.audio.ctx) return;
        const ctx = this.audio.ctx;
        if (!this._noiseCache) {
            const len = Math.floor(ctx.sampleRate * 0.35);
            const buf = ctx.createBuffer(1, len, ctx.sampleRate);
            const data = buf.getChannelData(0);
            let seed = 22222;
            for (let i = 0; i < len; i++) {
                seed = (seed * 1664525 + 1013904223) >>> 0;
                data[i] = (seed / 0xffffffff) * 2 - 1;
            }
            this._noiseCache = buf;
        }
        if (!this._brownNoiseCache) {
            const len = Math.floor(ctx.sampleRate * 0.6);
            const buf = ctx.createBuffer(1, len, ctx.sampleRate);
            const data = buf.getChannelData(0);
            let last = 0;
            let seed = 12345;
            for (let i = 0; i < len; i++) {
                seed = (seed * 1103515245 + 12345) >>> 0;
                const white = (seed / 0xffffffff) * 2 - 1;
                last = (last + 0.02 * white) / 1.02;
                data[i] = last * 3.5;
            }
            this._brownNoiseCache = buf;
        }
    }

    start(theme) {
        if (!this.audio.ctx || !this.audio.available) return;
        if (this.audio.muted) return;
        if (this.audio.ctx.state === 'suspended' && this.audio.ctx.resume) this.audio.ctx.resume();

        this.theme = theme && MUSIC_THEMES[theme] ? theme : 'FOREST';
        this.cfg = MUSIC_THEMES[this.theme];

        this._buildBus();
        this._ensureNoiseBuffers();
        if (!this.bus || !this.filter) return;

        const now = this.audio.ctx.currentTime;
        this._applyStateToFilter(now, 0.35);
        this._setBusTarget(this.ducked ? this.volume * 0.42 : this.volume, now, 1.1);

        if (this.playing) return;

        this.playing = true;
        this.step = 0;
        this._macroCycle = 0;
        this.nextStepTime = now + 0.08;
        this.timer = setInterval(() => this._scheduler(), 25);
    }

    stop(fade = 0.9) {
        if (!this.playing && !this.timer) return;
        this.playing = false;
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }
        if (this.audio.ctx && this.bus) {
            this._setBusTarget(0, this.audio.ctx.currentTime, fade);
        }
    }

    setIntensity(v) {
        this.intensity = Math.max(0.6, Math.min(1.6, v));
        if (this.audio.ctx && this.filter) {
            this._applyStateToFilter(this.audio.ctx.currentTime, 0.25);
        }
    }

    duck(on) {
        this.ducked = !!on;
        if (!this.audio.ctx || !this.bus) return;
        this._setBusTarget(this.ducked ? this.volume * 0.42 : this.volume, this.audio.ctx.currentTime, 0.45);
    }

    /**
     * Optional new hook: safe if never called.
     * States subtly reshape filter + phrasing, but do not break existing use.
     */
    setState(state) {
        const allowed = { menu: 1, play: 1, tense: 1, race: 1, celebration: 1 };
        this.state = allowed[state] ? state : 'play';
        if (this.audio.ctx && this.filter) {
            this._applyStateToFilter(this.audio.ctx.currentTime, 0.22);
        }
    }

    _applyStateToFilter(now, timeConstant) {
        if (!this.filter) return;
        let mult = this.intensity;
        if (this.state === 'menu') mult *= 0.82;
        else if (this.state === 'tense') mult *= 1.18;
        else if (this.state === 'race') mult *= 1.12;
        else if (this.state === 'celebration') mult *= 1.24;
        this.filter.frequency.setTargetAtTime(this.cfg.cutoff * mult, now, timeConstant);
    }

    _setBusTarget(value, now, fade) {
        if (!this.bus) return;
        this.bus.gain.cancelScheduledValues(now);
        this.bus.gain.setValueAtTime(Math.max(0.0001, this.bus.gain.value || 0.0001), now);
        this.bus.gain.linearRampToValueAtTime(value, now + fade);
    }

    _scheduler() {
        if (!this.playing || !this.audio.ctx || this.audio.muted) return;
        const stepDur = 60 / this.cfg.bpm / 4;
        const horizon = this.audio.ctx.currentTime + 0.14;

        while (this.nextStepTime < horizon) {
            const step = this.step % this.loopSteps;
            this._scheduleStep(step, this.nextStepTime, stepDur);

            this.nextStepTime += stepDur;
            this.step = (this.step + 1) % this.loopSteps;

            if (this.step === 0) {
                this._macroCycle++;
            }
        }
    }

    _scheduleStep(step, when, stepDur) {
        const loop = this._pattern();
        const inBar = step % 16;
        const bar = Math.floor(step / 16);
        const root = this._chordRootForBar(bar);

        const macro = this._macroVariant();
        const isTurnaround = (bar === 3 && inBar >= 12);
        const thinDrums = macro.drumThin && bar === 1;
        const thinMotif = macro.motifThin && (bar === 1 || bar === 3);

        if (loop.kick[inBar] && !thinDrums) this._kick(when, macro.kickLift);
        if (loop.clap[inBar] && !macro.noClap) {
            this._noiseHit(when, 0.08, 0.032 * loop.clap[inBar], 1800, 0.012, 'white');
        }
        if (loop.hats[inBar] && !thinDrums) {
            const hatVol = 0.0175 * loop.hats[inBar] * (this.state === 'race' ? 1.08 : 1);
            this._noiseHit(when, 0.026, hatVol, 6600, 0.004, 'white');
        }
        if (loop.perc[inBar] && !macro.noPerc) {
            this._noiseHit(when, 0.042, 0.014 * loop.perc[inBar], 3000, 0.006, 'brown');
        }

        const bass = loop.bass[inBar];
        if (bass !== null && !macro.noBass) {
            const freq = this._scaleNote(root + bass, -2);
            const dur = stepDur * (macro.bassShort ? 1.2 : 1.7);
            const vol = this.cfg.bassVol * (this.state === 'tense' ? 1.06 : 1);
            this._note(freq, when, dur, vol, this.cfg.bassWave, 0.01, 0.07);
        }

        const chord = loop.chords[inBar];
        if (chord !== null && !macro.noChord) {
            this._chord(root + chord, when, stepDur * (macro.chordShort ? 2.1 : 2.6), macro);
        }

        if (inBar === 0) {
            const padLen = macro.padShort ? stepDur * 10 : stepDur * 14;
            this._pad(root, when, padLen, macro);
            if (bar === 0 || (bar === 2 && this.state === 'menu')) {
                this._drone(root, when, stepDur * 16, macro);
            }
        }

        const motif = loop.motif[inBar];
        const motifAllowed =
            motif !== null &&
            !thinMotif &&
            (bar % 2 === 0 || inBar >= 8 || this.state === 'race');

        if (motifAllowed) {
            const motifDegree = macro.motifShift ? motif + macro.motifShift : motif;
            const vol =
                this.cfg.motifVol *
                (this.state === 'menu' ? 0.8 : this.state === 'celebration' ? 1.18 : 1);

            this._note(
                this._scaleNote(root + motifDegree, 0),
                when,
                stepDur * (macro.motifShort ? 1.05 : 1.35),
                vol,
                this.cfg.motifWave,
                0.012,
                0.08
            );
        }

        if (isTurnaround && macro.turnaroundFill) {
            this._noiseHit(when, 0.03, 0.013, 5500, 0.003, 'white');
        }
    }

    _macroVariant() {
        // 8-loop super-cycle with subtle phrase changes.
        // Important: small changes only; puzzle music must remain non-intrusive.
        const m = this._macroCycle % 8;
        return {
            noBass: m === 3,
            noChord: false,
            noClap: this.state === 'menu' && (m === 1 || m === 5),
            noPerc: this.state === 'menu' && (m === 2 || m === 6),
            drumThin: m === 2 || (this.state === 'menu' && m === 4),
            motifThin: m === 1 || m === 5,
            motifShort: m === 4,
            motifShift: this.state === 'celebration' ? 2 : 0,
            bassShort: this.state === 'tense',
            chordShort: this.state === 'race',
            padShort: this.state === 'tense' || this.state === 'race',
            turnaroundFill: m === 7 || this.state === 'race',
            kickLift: this.state === 'race' ? 1.08 : this.state === 'celebration' ? 0.96 : 1,
        };
    }

    _kick(when, lift = 1) {
        const ctx = this.audio.ctx;
        const osc = ctx.createOscillator();
        const g = ctx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(92 * lift, when);
        osc.frequency.exponentialRampToValueAtTime(42, when + 0.12);

        g.gain.setValueAtTime(0.0001, when);
        g.gain.exponentialRampToValueAtTime(0.11, when + 0.006);
        g.gain.exponentialRampToValueAtTime(0.0001, when + 0.18);

        osc.connect(g).connect(this.filter);
        osc.start(when);
        osc.stop(when + 0.22);
    }

    _noiseHit(when, dur, vol, cutoff, attack, type = 'white') {
        const ctx = this.audio.ctx;
        const src = ctx.createBufferSource();
        src.buffer = type === 'brown' ? this._brownNoiseCache : this._noiseCache;

        const f = ctx.createBiquadFilter();
        f.type = cutoff >= 4000 ? 'highpass' : 'bandpass';
        f.frequency.value = cutoff;
        f.Q.value = type === 'brown' ? 0.7 : 0.9;

        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, when);
        g.gain.exponentialRampToValueAtTime(vol, when + attack);
        g.gain.exponentialRampToValueAtTime(0.0001, when + dur);

        src.connect(f).connect(g).connect(this.filter);
        src.start(when);
        src.stop(when + dur + 0.02);
    }

    _note(freq, when, dur, vol, wave, attack = 0.012, release = 0.08) {
        const ctx = this.audio.ctx;
        const osc = ctx.createOscillator();
        const g = ctx.createGain();

        osc.type = wave;
        osc.frequency.setValueAtTime(freq, when);

        // mild movement to stop long sessions feeling static
        if (wave === 'triangle' || wave === 'sawtooth') {
            osc.detune.setValueAtTime(0, when);
            osc.detune.linearRampToValueAtTime(2.5, when + Math.min(0.06, dur * 0.3));
            osc.detune.linearRampToValueAtTime(0, when + Math.min(dur, 0.18));
        }

        g.gain.setValueAtTime(0.0001, when);
        g.gain.exponentialRampToValueAtTime(vol, when + attack);
        g.gain.exponentialRampToValueAtTime(0.0001, when + Math.max(attack + release, dur));

        osc.connect(g).connect(this.filter);
        osc.start(when);
        osc.stop(when + dur + 0.04);
    }

    _chord(degree, when, dur, macro) {
        // Use three-note chord most of the time; open to four notes on celebration.
        const offsets = this.state === 'celebration' ? [0, 2, 4, 6] : [0, 2, 4];
        for (const offset of offsets) {
            const octave = offset >= 4 ? 0 : -1;
            this._note(
                this._scaleNote(degree + offset, octave),
                when,
                dur,
                this.cfg.chordVol * (macro && macro.chordShort ? 0.94 : 1),
                this.cfg.chordWave,
                0.018,
                0.16
            );
        }
    }

    _pad(degree, when, dur, macro) {
        const offsets = this.state === 'menu' ? [0, 4] : [0, 4, 6];
        for (const offset of offsets) {
            this._note(
                this._scaleNote(degree + offset, -1),
                when,
                dur,
                this.cfg.padVol * (macro && macro.padShort ? 0.9 : 1),
                'sine',
                0.16,
                0.8
            );
        }
    }

    _drone(degree, when, dur, macro) {
        const freq = this._scaleNote(degree, -2);
        const ctx = this.audio.ctx;
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        const lfo = ctx.createOscillator();
        const lfoGain = ctx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, when);

        lfo.type = 'sine';
        lfo.frequency.setValueAtTime(this.theme === 'CAVE' ? 0.18 : 0.24, when);
        lfoGain.gain.setValueAtTime(4, when);
        lfo.connect(lfoGain).connect(osc.detune);

        g.gain.setValueAtTime(0.0001, when);
        g.gain.exponentialRampToValueAtTime(this.cfg.droneVol * (macro && macro.padShort ? 0.8 : 1), when + 0.25);
        g.gain.exponentialRampToValueAtTime(0.0001, when + dur);

        osc.connect(g).connect(this.filter);
        osc.start(when);
        lfo.start(when);
        osc.stop(when + dur + 0.05);
        lfo.stop(when + dur + 0.05);
    }
}

const music = typeof audio !== 'undefined' ? new MusicEngine(audio) : null;

// Stop the score the instant the player mutes (from the button OR the `M` key);
// the start() guard above keeps it from coming back until unmute re-arms it.
if (music && typeof audio !== 'undefined' && audio) {
    audio.onMuteChange = (muted) => {
        if (muted) music.stop(0);
    };
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { MusicEngine, MUSIC_THEMES, MUSIC_LOOP, MUSIC_PATTERNS };
}
