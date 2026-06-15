'use strict';
/**
 * MOSSLINGS — procedural Web Audio engine.
 * All SFX are synthesized; no audio assets. A master gain node provides
 * clean muting and headroom. Multi-note jingles are scheduled on the
 * AudioContext clock (sample-accurate), not setTimeout.
 */
class AudioEngine {
    constructor() {
        this.ctx = null;
        this.master = null;
        this.muted = false;
        this.available = true;
        this._silent = false; // hard-muted during deterministic rewind catch-up
    }
    init() {
        if (this.ctx || !this.available) return;
        try {
            const AC = window.AudioContext || window.webkitAudioContext;
            if (!AC) { this.available = false; return; }
            this.ctx = new AC();
            this.master = this.ctx.createGain();
            this.master.gain.value = 0.9;
            this.master.connect(this.ctx.destination);
        } catch (e) {
            console.warn('Web Audio not available', e);
            this.available = false;
        }
    }
    toggleMute() {
        this.muted = !this.muted;
        if (this.master) this.master.gain.value = this.muted ? 0 : 0.9;
        return this.muted;
    }
    ready() {
        if (!this.ctx || this.muted || this._silent) return false;
        if (this.ctx.state === 'suspended') this.ctx.resume();
        return true;
    }
    /** Schedule one enveloped oscillator note. `when` is seconds from now. */
    tone(freq, type, dur, vol = 0.1, sweep = 0, when = 0) {
        if (!this.ready()) return;
        const t0 = this.ctx.currentTime + when;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, t0);
        if (sweep !== 0) osc.frequency.exponentialRampToValueAtTime(Math.max(20, freq + sweep), t0 + dur);
        gain.gain.setValueAtTime(0.0001, t0);
        gain.gain.exponentialRampToValueAtTime(vol, t0 + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
        osc.connect(gain).connect(this.master);
        osc.start(t0);
        osc.stop(t0 + dur + 0.05);
    }
    /** White-noise burst through a lowpass — used for digging, crumbling, explosions. */
    noise(dur, vol, cutoff = 4000) {
        if (!this.ready()) return;
        const t0 = this.ctx.currentTime;
        const len = Math.max(1, Math.floor(this.ctx.sampleRate * dur));
        const buffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
        const src = this.ctx.createBufferSource();
        src.buffer = buffer;
        const filter = this.ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = cutoff;
        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(vol, t0);
        gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
        src.connect(filter).connect(gain).connect(this.master);
        src.start(t0);
    }
    // --- Named SFX ---
    sfxSelect()  { this.tone(620, 'sine', 0.08, 0.07); }
    sfxAssign()  { this.tone(760, 'square', 0.09, 0.05, 240); }
    sfxDeny()    { this.tone(180, 'square', 0.1, 0.05, -40); }
    sfxDig()     { this.noise(0.06, 0.12, 1800); }
    sfxBuild()   { this.tone(420 + Math.random() * 60, 'triangle', 0.06, 0.06); }
    sfxShrug()   { this.tone(330, 'triangle', 0.12, 0.06, -80); }
    sfxSpawn()   { this.tone(500, 'sine', 0.07, 0.05, 300); }
    sfxOhNo()    { this.tone(540, 'square', 0.1, 0.06, -180); }
    sfxExplode() { this.noise(0.45, 0.3, 900); this.tone(90, 'sawtooth', 0.45, 0.25, -50); }
    sfxSave(pitch = 1) { this.tone(880 * pitch, 'sine', 0.18, 0.09, 440 * pitch); }
    sfxDie()     { this.tone(220, 'sawtooth', 0.25, 0.08, -120); }
    sfxSplat()   { this.noise(0.12, 0.15, 700); }
    sfxWin() {
        const seq = [523, 659, 784, 1047];
        seq.forEach((f, i) => this.tone(f, 'sine', i === seq.length - 1 ? 0.4 : 0.12, 0.1, 0, i * 0.12));
    }
    sfxLose() {
        const seq = [392, 330, 262];
        seq.forEach((f, i) => this.tone(f, 'triangle', 0.2, 0.09, 0, i * 0.18));
    }
}
const audio = new AudioEngine();
