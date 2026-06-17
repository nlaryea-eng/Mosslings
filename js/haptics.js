'use strict';
/**
 * MOSSLINGS — optional haptic feedback (mobile).
 *
 * A thin, dependency-free wrapper over navigator.vibrate. It is called ONLY from
 * UI / render / input paths — never from the fixed-timestep update() — so it
 * cannot perturb deterministic simulation or rewind/replay. It is a silent no-op
 * on devices with no vibration motor (all desktops), when the player has turned
 * it off, or when the OS asks for reduced motion.
 */
const haptics = (() => {
    const KEY = 'mosslings.haptics';
    let reduce = false;
    try {
        reduce = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    } catch (e) { /* matchMedia unavailable (e.g. test harness) */ }

    function supported() {
        return typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';
    }
    function enabled() {
        try { return localStorage.getItem(KEY) !== '0'; } catch (e) { return true; }
    }
    function setEnabled(on) {
        try { localStorage.setItem(KEY, on ? '1' : '0'); } catch (e) {}
    }
    function buzz(pattern) {
        if (reduce || !enabled() || !supported()) return false;
        try { return navigator.vibrate(pattern); } catch (e) { return false; }
    }
    return {
        supported, enabled, setEnabled,
        setReducedMotion(v) { reduce = !!v; },
        tap()  { return buzz(8); },            // skill assigned
        save() { return buzz(14); },           // mossling rescued
        deny() { return buzz([6, 18, 6]); },   // invalid tap
        win()  { return buzz([0, 30, 40, 70]); },
        fail() { return buzz([0, 60, 30, 60]); },
    };
})();

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { haptics };
}
