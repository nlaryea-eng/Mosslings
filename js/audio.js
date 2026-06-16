'use strict';
/**
 * MOSSLINGS — procedural Web Audio engine.
 * All SFX are synthesized; no audio assets. A master gain node provides
 * clean muting and headroom. Multi-note jingles are scheduled on the
 * AudioContext clock (sample-accurate), not setTimeout.
 */
class AudioEngine {
    constructor() {
        this.storageKey = 'mosslings.audioMuted';
        this.ctx = null;
        this.master = null;
        this.muted = this._loadMuted();
        this.available = true;
        this._silent = false; // hard-muted during deterministic rewind catch-up
    }
    _loadMuted() {
        try { return localStorage.getItem('mosslings.audioMuted') === '1'; }
        catch (e) { return false; }
    }
    _storeMuted() {
        try { localStorage.setItem(this.storageKey, this.muted ? '1' : '0'); }
        catch (e) {}
    }
    _applyMasterGain() {
        if (this.master) this.master.gain.value = this.muted ? 0 : 0.9;
    }
    init() {
        if (this.ctx || !this.available) return;
        try {
            const AC = window.AudioContext || window.webkitAudioContext;
            if (!AC) { this.available = false; return; }
            this.ctx = new AC();
            this.master = this.ctx.createGain();
            this._applyMasterGain();
            this.master.connect(this.ctx.destination);
        } catch (e) {
            console.warn('Web Audio not available', e);
            this.available = false;
        }
    }
    setMuted(muted) {
        this.muted = !!muted;
        this._applyMasterGain();
        this._storeMuted();
        // Let the music engine (loaded after this one) react to mute changes
        // from ANY entry point — button, `M` key, etc. — so a muted score never
        // keeps a scheduler alive synthesizing into a silent bus.
        if (typeof this.onMuteChange === 'function') this.onMuteChange(this.muted);
        return this.muted;
    }
    toggleMute() {
        return this.setMuted(!this.muted);
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
    // Crisper arcade "blip" — a square click with a quick upward chirp on top.
    sfxAssign()  { this.tone(660, 'square', 0.05, 0.05, 320); this.tone(1320, 'square', 0.04, 0.025, 0, 0.02); }
    // Harsher, lower "nope" — two detuned square thuds.
    sfxDeny()    { this.tone(150, 'square', 0.09, 0.06, -40); this.tone(112, 'square', 0.1, 0.05, -30, 0.04); }
    sfxDig()     { this.noise(0.06, 0.12, 1800); }
    sfxBuild()   { this.tone(420 + Math.random() * 60, 'triangle', 0.06, 0.06); }
    sfxShrug()   { this.tone(330, 'triangle', 0.12, 0.06, -80); }
    sfxSpawn()   { this.tone(500, 'sine', 0.07, 0.05, 300); }
    sfxOhNo()    { this.tone(540, 'square', 0.1, 0.06, -180); }
    sfxExplode() { this.noise(0.45, 0.3, 900); this.tone(90, 'sawtooth', 0.45, 0.25, -50); }
    // Rescue chime — a bright bell tone plus a sparkle harmonic that climbs with the streak.
    sfxSave(pitch = 1) { this.tone(880 * pitch, 'sine', 0.18, 0.09, 440 * pitch); this.tone(1760 * pitch, 'sine', 0.10, 0.03, 0, 0.03); }
    sfxDie()     { this.tone(220, 'sawtooth', 0.25, 0.08, -120); }
    sfxSplat()   { this.noise(0.12, 0.15, 700); }
    sfxWin() {
        // Brighter fanfare: a triad arpeggio with a shimmer octave on the final note.
        const seq = [523, 659, 784, 1047];
        seq.forEach((f, i) => this.tone(f, 'square', i === seq.length - 1 ? 0.4 : 0.1, 0.07, 0, i * 0.10));
        seq.forEach((f, i) => this.tone(f, 'sine', i === seq.length - 1 ? 0.45 : 0.12, 0.06, 0, i * 0.10));
        this.tone(2093, 'sine', 0.5, 0.04, 0, 0.30); // high shimmer
    }
    sfxLose() {
        const seq = [392, 330, 262];
        seq.forEach((f, i) => this.tone(f, 'triangle', 0.2, 0.09, 0, i * 0.18));
        this.tone(196, 'sawtooth', 0.5, 0.06, -40, 0.36); // low descending tail
    }
    /** Medal stamp sting — a short bright two-note "ding-ding" per stamped medal. */
    sfxMedal(tier = 0) {
        const base = [1047, 1319, 1568][tier % 3];
        this.tone(base, 'square', 0.07, 0.06, 0);
        this.tone(base * 1.5, 'sine', 0.16, 0.06, 0, 0.06);
    }
}
const audio = new AudioEngine();
