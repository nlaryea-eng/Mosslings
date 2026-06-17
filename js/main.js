'use strict';
/**
 * MOSSLINGS — bootstrap. Loads LAST, after every UI module has mixed its
 * methods onto the shared `ui` object (js/ui.js core, js/result-ui.js), so the
 * menu's first render can safely reach result/sharing helpers. Skipped under
 * the Node test harness, which constructs Game/ui itself.
 */
if (typeof document !== 'undefined' && document.getElementById('gameCanvas')) {
    const game = new Game();
    ui.init(game);
    game.loop(0);
}
