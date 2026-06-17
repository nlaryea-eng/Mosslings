# MOSSLINGS — Meta-Game Architecture

Design for meta-game features: level serialization, URL importing, par medals, and advanced editor objects.

**Status:** All listed features are **implemented** and covered by tests.

- **§1 Level Serialization / §2 URL Importing** live in `js/utils.js` and `js/ui.js`. The shipped binary format is **version `0x03`**. Refinements made during implementation: base64 is URL-*safe* (`+/=` → `-_`, padding stripped) so it survives a query string intact; the metadata byte carries flags (bit 0 = athlete portal, bit 1 = par data present, bit 2 = object data present); command types span the full tile range incl. one-way membranes (0–6); and `0x03` appends fixed-width editor objects for moving platforms, pressure switches, and switch gates. The deserializer accepts `0x01`, `0x02`, and `0x03`.
- **§3 Par Medals** is implemented as three **independent** medals per level — Rescue (saved ≥ par.saved), Efficiency (skills ≤ par.skills), and Speed (time ≤ par.time). `computeMedals(par, stats)` in `js/utils.js` evaluates them, and `StorageManager.getMedals/setMedals` (`js/game.js`) persists whether each medal has ever been earned for that level. The §3 pseudocode below describes the final implementation.
- **Advanced editor objects** are implemented as optional `level.objects` entries. `OBJ_PLATFORM` moves deterministically on the simulation step and carries riders; `OBJ_SWITCH` is a pressure trigger; `OBJ_GATE` is solid until a matching switch target is held. The editor exposes Platform, Switch, and Gate tools, and v03 sharing preserves those objects without breaking older terrain-only links.
- **Replay / ghost sharing** (`serializeReplay`/`deserializeReplay` in `js/utils.js`, `Game.buildReplay`/`loadReplay`) packs the deterministic action log plus the level identity into a `?replay=` link. Playback re-runs the exact inputs at their recorded `simStep` — the same determinism that powers rewind — so a friend watches the run reproduce step-for-step. The format is versioned JSON over URL-safe base64 (transient links favor robustness over a custom binary), size-capped, and steps must be non-decreasing. Watching a replay never writes the viewer's progress. The shipped scope is share + watch; concurrent "race the ghost" and a baked daily dev-ghost layer on the same infra.
- **Solvability smoke check** (`analyzeSolvability` in `js/utils.js`) is an intentionally GENEROUS reachability flood used as a non-blocking advisory at editor save/share. It grants every capability the inventory allows and flags a level only when the exit is unreachable even then. It is explicitly NOT a solver: a clean result means "no obvious dead end," not a proof of solvability.

---

## 1. Level Serialization (Base64)

Custom levels are packed into a compact, versioned binary buffer and encoded as URL-safe base64.

### Format Specification (Version 0x03)

**Version Byte (1 byte)**
- `0x03` = current format (handles terrain, pars, and editor objects)

**Name (variable)**
- UTF-8 C-string, null-terminated — max 64 chars

**Metadata (6 bytes)**
- `totalSpawn` (1 byte) — 0–255 mosslings
- `reqSaved` (1 byte) — 0–255
- `time` (2 bytes, big-endian) — 0–65535 frames
- `spawnRate` (1 byte) — 15–120 frames between spawns
- `flags` (1 byte) — bit 0: athlete portal, bit 1: has par data, bit 2: has objects

**Spawn & Exit (8 bytes)**
- `spawnX`, `spawnY` (2 bytes each, big-endian)
- `exitX`, `exitY` (2 bytes each, big-endian)

**Inventory (8 bytes, one per skill)**
- One byte per SKILLS slot (BLOCK, BUILD, BASH, MINE, DIG, FLOAT, CLIMB, EXPLODE)

**Par Data (4 bytes, optional — if flags bit 1 set)**
- `parTime` (2 bytes, big-endian) — seconds
- `parSkills` (1 byte)
- `parSaved` (1 byte)

**Command Array (variable)**
- Count (1 byte) — 0–255 commands
- For each command (9 bytes):
  - `type` (1 byte) — 0–6 (Air, Dirt, Metal, Lava, Bridge, One-way R/L)
  - `x`, `y`, `w`, `h` (2 bytes each, big-endian)

**Object Array (variable, optional — if flags bit 2 set)**
- Count (1 byte) — 0–80 objects
- For each object (19 bytes, big-endian):
  - `type` (1 byte) — 0: Platform, 1: Switch, 2: Gate
  - `x`, `y`, `w`, `h` (2 bytes each)
  - `dx`, `dy` (2 bytes each, signed i16) — movement offset
  - `period` (2 bytes) — frames
  - `phase` (2 bytes)
  - `target` (1 byte) — trigger channel
  - `flags` (1 byte)

### Size & Forward Compatibility

- **Typical level** (~10 commands): ~300–400 base64 chars
- **URL-safe**: `+/=` replaced with `-_` and padding stripped to survive query strings.
- **Limits**: rejected if base64 > 1500 chars.

### API Signatures

Actual signatures in `js/utils.js`:

```javascript
/**
 * Serialize a level object to a URL-safe base64 string.
 * @returns {string|null} encoded level
 */
function serializeLevel(level)

/**
 * Deserialize a base64 level string back into a level object.
 * @returns {Object|null} level
 */
function deserializeLevel(encoded)
```

---

## 2. URL Importing

Shared levels are imported via query parameter (`?level=...`) parsed during bootstrap.

### Bootstrap Integration

In `ui.js`, expand `init()`:

```javascript
init(game) {
    this.game = game;
    const $ = (id) => document.getElementById(id);
    
    // *** NEW: Parse ?level=... query before building menu ***
    const params = new URLSearchParams(location.search);
    const sharedLevel = params.get('level');
    if (sharedLevel) {
        this.pendingImportedLevel = this.parseSharedLevel(sharedLevel);
        if (!this.pendingImportedLevel) {
            this.showMsg(
                'Invalid Level',
                'The shared level could not be loaded. Format may be unsupported or corrupted.',
                false
            );
        }
    }
    
    // ... rest of init (button handlers, etc.) ...
    this.buildMenu();
}

/**
 * Validate & deserialize a shared level from the query parameter.
 * @param {string} encoded - base64 level string
 * @returns {Object|null} Level object or null if invalid
 */
parseSharedLevel(encoded) {
    // Size check
    if (encoded.length > 1500) {
        console.warn('Level too large:', encoded.length);
        return null;
    }
    
    // Deserialize
    const level = deserializeLevel(encoded);
    if (!level) {
        console.warn('Failed to deserialize level');
        return null;
    }
    
    // Validate geometry
    if (level.spawn.x < 0 || level.spawn.x > W || level.spawn.y < 0 || level.spawn.y > H ||
        level.exit.x < 0 || level.exit.x > W || level.exit.y < 0 || level.exit.y > H) {
        console.warn('Invalid spawn/exit coordinates');
        return null;
    }
    
    return level;
}
```

### UI Flow

1. **On page load**: if `pendingImportedLevel` exists, show a confirmation modal:
   ```
   "Play Shared Level"
   "Do you want to play: [level.name]?"
   [Play] [Cancel]
   ```

2. **Play click**: trigger game.loadLevel(this.pendingImportedLevel, true)

3. **Cancel click**: clear pending and return to menu

4. **Editor Share Button**:
   In `startEditor()` or via a "Share" button in editor UI:
   ```javascript
   shareCustomLevel() {
       const level = { /* construct from editor state */ };
       const encoded = serializeLevel(level);
       if (!encoded) {
           this.showMsg('Error', 'Level too large to share.', false);
           return;
       }
       const url = location.origin + location.pathname + '?level=' + encoded;
       // Copy to clipboard or show in a shareable link modal
       navigator.clipboard.writeText(url);
       this.showMsg('Copied!', 'Share link copied to clipboard.', true);
   }
   ```

### Error Handling

- **Malformed/oversized**: show toast "Invalid level format"
- **Version mismatch**: show toast "This level requires a newer version"
- **Invalid geometry**: show toast "Level geometry is invalid (spawn/exit out of bounds)"
- Toast reuses existing `showMsg()` overlay; auto-dismiss after 3 seconds or on user click

---

## 3. Par Medals

Each campaign level defines par targets (time, saved %, skills used). Players earn three independent medals (Rescue, Efficiency, Speed).

### Par Definitions

Levels carry a `par` object in `js/levels.js`:

```javascript
{
    name: 'The First March',
    totalSpawn: 8,
    reqSaved: 4,
    par: {
        time: 55,    // seconds (Speed medal)
        skills: 3,   // total assignments (Efficiency medal)
        saved: 8     // total rescued (Rescue medal)
    }
}
```

### Medal Computation

Medals are computed by comparing run stats against the par object. They are **independent** achievements, not tiered.

```javascript
/**
 * @param {Object} par   { saved, skills, time } targets
 * @param {Object} stats { saved, skills, time } achieved
 * @returns {{saved:boolean, skills:boolean, time:boolean}}
 */
function computeMedals(par, stats) {
    if (!par) return { saved: false, skills: false, time: false };
    return {
        saved: stats.saved >= par.saved,
        skills: stats.skills <= par.skills,
        time: stats.time <= par.time,
    };
}
```

### Storage

`StorageManager` persists the best result for each medal per level:

```javascript
{
    time: 1,   // 1 = Speed medal earned
    skills: 1, // 1 = Efficiency medal earned
    saved: 0   // 0 = Rescue medal not yet earned
}
```

### Menu Rendering

The level select menu shows icons for each earned medal. The next unearned medal target is disclosed as a goal (e.g., "SAVE 8" or "T<0:55").


---

## Summary

These three systems layer cleanly:

- **Serialization**: compact, versioned binary format for any level object
- **URL Importing**: query-param bootstrap with validation and graceful fallback
- **Par Medals**: per-level par targets with real-time skill tracking and persistent tier storage

All three respect the existing game architecture (StorageManager, level shape, game lifecycle) and add no new compile step.
