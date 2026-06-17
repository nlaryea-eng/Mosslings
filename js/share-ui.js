'use strict';
/** Shared-level/replay import and outbound share helpers for the UI singleton. */
Object.assign(ui, {
    // --- Level sharing ------------------------------------------------------
    /** On load, a ?level=… (or #level=…) param plays a shared level straight away. */
    tryImportSharedLevel() {
        const params = new URLSearchParams(location.search);
        if (this.tryImportReplay(params)) return;
        let code = params.get('level');
        if (!code && location.hash.startsWith('#level=')) code = location.hash.slice(7);
        if (!code && this.tryImportDaily(params)) return;
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
        // Audio waits for the player's first input so shared links do not trip
        // autoplay restrictions.
        if (typeof ugcTrustMeta === 'function') level.ugcTrust = ugcTrustMeta(level);
        this.game.loadLevel(level, true);
        const badge = typeof ugcTrustBadge === 'function' ? ugcTrustBadge(level) : null;
        this.toast(badge ? `Playing shared level: ${level.name}. ${badge.message}` : `Playing shared level: ${level.name}`);
        history.replaceState(null, '', location.pathname);
    },
    /** Validate + decode a shared level string; returns a level object or null. */
    parseSharedLevel(code) {
        const level = deserializeLevel(code);
        if (!level || !level.name || !Array.isArray(level.commands)) return null;
        return level;
    },
    /** A ?replay=… (or #replay=…) link plays the recorded run back as a ghost. */
    tryImportReplay(params) {
        let code = params.get('replay');
        if (!code && location.hash.startsWith('#replay=')) code = location.hash.slice(8);
        if (!code) return false;
        const validation = typeof validateReplayForPlayback === 'function'
            ? validateReplayForPlayback(code)
            : { ok: true, severity: 'allow', replay: deserializeReplay(code), message: 'Playing shared replay' };
        history.replaceState(null, '', location.pathname);
        if (!validation || validation.severity === 'refuse') {
            this.toast(validation && validation.message ? validation.message : 'That replay link is invalid or corrupted.', true);
            return true;
        }
        this.armAudioForPlay();
        if (this.game.loadReplay(validation.replay, validation)) {
            this.setTutorial('▶ Watching a shared replay — press Esc or Menu to take over.');
            this.toast(validation.severity === 'warn' ? validation.message : 'Playing shared replay');
        } else {
            this.toast(validation.message || 'Could not load that replay.', true);
        }
        return true;
    },
    tryImportDaily(params) {
        let key = params.get('daily');
        if (!key && location.hash.startsWith('#daily=')) key = location.hash.slice(7);
        if (!key) return false;

        const challenge = dailyChallengeForDate(key);
        if (!challenge) {
            this.toast('That daily challenge link is invalid.', true);
            history.replaceState(null, '', location.pathname);
            return true;
        }
        this.game.loadDailyChallenge(challenge);
        this.toast(`${challenge.label}: ${challenge.levelName}`);
        history.replaceState(null, '', location.pathname);
        return true;
    },
    shareCustomLevel() {
        const game = this.game;
        // The #edit-name input and this.editCommands belong to the editor and are
        // ALWAYS present in the DOM — even with a stale value when sharing from a
        // gallery card. Only sync from them while actually editing; otherwise the
        // gallery level (already on game.level) is the source of truth.
        if (game.state === 'EDITOR') {
            const nameInput = document.getElementById('edit-name');
            game.level.name = (nameInput.value || '').trim() || 'Custom Level';
            game.level.commands = this.editCommands;
            game.level.objects = this.editObjects;
        }
        const structuralErr = validateLevelStructure(game.level);
        if (structuralErr) { this.toast(`Can't share: ${structuralErr}`, true); return; }

        const code = serializeLevel(game.level);
        if (!code) { this.toast('Level is too large or invalid to share.', true); return; }

        // Generous solvability smoke check (advisory, not a proof). Don't block
        // the share, but warn so a likely-broken level isn't sent out blind.
        const solve = analyzeSolvability(game.level);
        if (typeof ugcTrustMeta === 'function') game.level.ugcTrust = ugcTrustMeta(game.level, { solvability: solve });
        const badge = typeof ugcTrustBadge === 'function' ? ugcTrustBadge(game.level, { solvability: solve }) : null;
        const trust = badge ? ` ${badge.label}: ${badge.message}` : '';
        const warn = solve.status === 'fail' ? ` Warning: ${solve.reason}.` : '';

        // On file:// there is no public origin to hand out, so a "link" would be
        // a dead local path on anyone else's machine. Share the level CODE
        // instead and tell the player to host the game for real links.
        if (location.protocol === 'file:') {
            this.promptCopy(code);
            this.toast(`Copied level code. Host the game to share a clickable link.${trust}${warn}`, !!warn);
            return;
        }
        const url = this.shareUrlFor(code);
        this.copyText(url, `Share link copied to clipboard!${trust}${warn}`);
    },
    /** Build a clean share URL from the current hosted location or test stub. */
    currentShareUrl() {
        const href = location.href || `${location.origin || 'http://localhost'}${location.pathname || '/'}`;
        const url = new URL(href);
        url.search = '';
        url.hash = '';
        return url;
    },
    /** Build a clean ?level= share URL from the current hosted location. */
    shareUrlFor(code) {
        const url = this.currentShareUrl();
        url.searchParams.set('level', code);
        return url.toString();
    },
    dailyUrlFor(key) {
        const url = this.currentShareUrl();
        url.searchParams.set('daily', key);
        return url.toString();
    },
    /** Copy text via the async Clipboard API, falling back to a manual prompt. */
    copyText(text, successMsg) {
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text)
                .then(() => this.toast(successMsg))
                .catch(() => this.promptCopy(text));
        } else {
            this.promptCopy(text);
        }
    },
    /** Clipboard API is unavailable on file:// in some browsers — fall back to a prompt. */
    promptCopy(text) {
        window.prompt('Copy this:', text);
    },
});
