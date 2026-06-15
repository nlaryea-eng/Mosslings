# MOSSLINGS — Meta-Game Architecture

Design for three meta-game features: level serialization, URL importing, and par medals.

**Status:** §1 Level Serialization and §2 URL Importing are **implemented** in `js/utils.js` and `js/ui.js` (covered by tests). §3 Par Medals remains forward-looking. Two refinements were made during implementation: base64 is URL-*safe* (`+/=` → `-_`, padding stripped) so it survives a query string intact, and the reserved metadata byte now carries exit flags (bit 0 = athlete portal); command types span the full tile range incl. one-way membranes (0–6).

---

## 1. Level Serialization (Base64)

Custom levels created in the editor must be shareable as compact, URL-safe strings. This section specifies a versioned binary format that encodes the full level object.

### Format Specification

**Version Byte (1 byte)**
- `0x01` = current format
- Future versions increment; deserializer rejects unknown versions with graceful fallback

**Metadata (variable)**
- Version 0x01 layout:
  - `name` (UTF-8 C-string, null-terminated) — max 64 chars
  - `totalSpawn` (1 byte) — 0–255 mosslings
  - `reqSaved` (1 byte) — 0–255
  - `time` (2 bytes, big-endian) — 0–65535 frames (~273 seconds at 60Hz)
  - `spawnRate` (1 byte) — clamped to RATE_MIN..RATE_MAX (15–120)
  - Reserved padding (1 byte) — 0x00 for forward compat

**Spawn & Exit (6 bytes)**
- `spawnX` (2 bytes, big-endian) — 0–960
- `spawnY` (2 bytes, big-endian) — 0–540
- `exitX` (2 bytes, big-endian) — 0–960
- `exitY` (2 bytes, big-endian) — 0–540

**Inventory (8 bytes, one per skill)**
- One byte per SKILLS slot (BLOCK, BUILD, BASH, MINE, DIG, FLOAT, CLIMB, EXPLODE)
- Each byte is 0–255 (count of items)

**Command Array (variable)**
- Count (1 byte) — 0–255 commands
- For each command:
  - `type` (1 byte) — T_AIR (0), T_DIRT (1), T_METAL (2), T_HAZARD (3), T_BRIDGE (4)
  - `x`, `y`, `w`, `h` (2 bytes each, big-endian) — packed {x: 0–960, y: 0–540, w: 1–960, h: 1–540}

**Encoding Path**
```
binary buffer
  ↓ (Uint8Array)
encodeURIComponent(String.fromCharCode(...))
  ↓ (percent-encoded UTF-8)
btoa() [or custom base64]
  ↓ (base64, 33% smaller than percent-encoded)
→ query string parameter
```

### API Signatures

```javascript
/**
 * Serialize a level object to a URL-safe base64 string.
 * @param {Object} level - { name, totalSpawn, reqSaved, time, spawnRate, 
 *                            spawn: {x,y}, exit: {x,y}, inventory: {0..7: count}, 
 *                            commands: [{type, x, y, w, h}, ...] }
 * @returns {string} Base64-encoded level (or null if invalid)
 */
function serializeLevel(level) {
    // Validate inputs
    if (!level.name || level.name.length > 64) return null;
    if (!Array.isArray(level.commands)) return null;
    if (level.commands.length > 255) return null;

    const buf = [];
    
    // Version byte
    buf.push(0x01);
    
    // Name (UTF-8 C-string, null-terminated)
    const nameBytes = new TextEncoder().encode(level.name.slice(0, 64));
    buf.push(...nameBytes, 0x00);
    
    // Metadata
    buf.push(Math.min(255, level.totalSpawn ?? 0));
    buf.push(Math.min(255, level.reqSaved ?? 0));
    buf.push((level.time >> 8) & 0xFF, level.time & 0xFF);
    buf.push(Math.min(RATE_MAX, Math.max(RATE_MIN, level.spawnRate ?? 60)));
    buf.push(0x00); // reserved
    
    // Spawn & exit
    const spawn = level.spawn || {x: 0, y: 0};
    const exit = level.exit || {x: W-1, y: H-1};
    buf.push((spawn.x >> 8) & 0xFF, spawn.x & 0xFF);
    buf.push((spawn.y >> 8) & 0xFF, spawn.y & 0xFF);
    buf.push((exit.x >> 8) & 0xFF, exit.x & 0xFF);
    buf.push((exit.y >> 8) & 0xFF, exit.y & 0xFF);
    
    // Inventory (8 skills)
    for (let s = 0; s < 8; s++) {
        buf.push(Math.min(255, level.inventory?.[s] ?? 0));
    }
    
    // Commands
    buf.push(level.commands.length);
    for (const cmd of level.commands) {
        buf.push(cmd.type ?? T_AIR);
        buf.push((cmd.x >> 8) & 0xFF, cmd.x & 0xFF);
        buf.push((cmd.y >> 8) & 0xFF, cmd.y & 0xFF);
        buf.push((cmd.w >> 8) & 0xFF, cmd.w & 0xFF);
        buf.push((cmd.h >> 8) & 0xFF, cmd.h & 0xFF);
    }
    
    // Convert to base64
    return btoa(String.fromCharCode(...buf));
}

/**
 * Deserialize a base64 level string.
 * @param {string} encoded - Base64 string from serializeLevel()
 * @returns {Object|null} Level object, or null if invalid/malformed
 */
function deserializeLevel(encoded) {
    try {
        const binary = atob(encoded);
        const buf = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) buf[i] = binary.charCodeAt(i);
        
        let offset = 0;
        
        // Version
        const version = buf[offset++];
        if (version !== 0x01) return null; // unknown version
        
        // Name (read until null byte)
        let nameEnd = offset;
        while (nameEnd < buf.length && buf[nameEnd] !== 0x00) nameEnd++;
        if (nameEnd >= buf.length) return null;
        const name = new TextDecoder().decode(buf.slice(offset, nameEnd));
        offset = nameEnd + 1;
        
        // Metadata
        const totalSpawn = buf[offset++];
        const reqSaved = buf[offset++];
        const time = (buf[offset] << 8) | buf[offset + 1]; offset += 2;
        const spawnRate = buf[offset++];
        offset++; // skip reserved
        
        // Spawn & exit
        const spawn = {
            x: (buf[offset] << 8) | buf[offset + 1],
            y: (buf[offset + 2] << 8) | buf[offset + 3]
        }; offset += 4;
        const exit = {
            x: (buf[offset] << 8) | buf[offset + 1],
            y: (buf[offset + 2] << 8) | buf[offset + 3]
        }; offset += 4;
        
        // Inventory
        const inventory = {};
        for (let s = 0; s < 8; s++) inventory[s] = buf[offset++];
        
        // Commands
        const cmdCount = buf[offset++];
        const commands = [];
        for (let i = 0; i < cmdCount; i++) {
            if (offset + 9 > buf.length) return null;
            commands.push({
                type: buf[offset++],
                x: (buf[offset] << 8) | buf[offset + 1], offset += 2,
                y: (buf[offset] << 8) | buf[offset + 1], offset += 2,
                w: (buf[offset] << 8) | buf[offset + 1], offset += 2,
                h: (buf[offset] << 8) | buf[offset + 1], offset += 2
            });
        }
        
        return { name, totalSpawn, reqSaved, time, spawnRate, spawn, exit, inventory, commands };
    } catch (e) {
        return null;
    }
}
```

### Size & Forward Compatibility

- **Typical level** (~10 commands): ~200–300 bytes → 270–400 base64 chars (practical URL limit ~2000 chars)
- **Unknown version**: deserializer returns null; UI shows "unsupported level format"
- **Oversized payload**: reject if base64 > 1500 chars or decompressed > 10KB

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

Each campaign level defines par targets (time, saved %, skills used). Players earn Bronze/Silver/Gold based on how many pars they beat.

### Par Definitions

Add optional fields to each LEVELS[i]:

```javascript
// In levels.js, example level 0:
{
    name: 'The First March',
    // ... existing fields ...
    parTime: 90,       // seconds (beat time limit in 90s or less)
    parSavedPct: 60,   // beat 60% or more
    parSkills: 4,      // use 4 or fewer distinct skills
}

// Level 1:
{ ..., parTime: 120, parSavedPct: 75, parSkills: 3 }

// Level 7 (final):
{ ..., parTime: 240, parSavedPct: 95, parSkills: 6 }
```

### Tracking Skills Used

In `game.js`, track assignments during a run:

```javascript
class Game {
    constructor() {
        // ... existing ...
        this.skillsUsedThisRun = new Set(); // track unique skills assigned
    }
    
    loadLevel(idx, isCustom = false) {
        // ... existing ...
        this.skillsUsedThisRun = new Set();
    }
    
    tryAssign() {
        // ... existing skill selection logic ...
        if (this.selectedSkill !== null) {
            this.skillsUsedThisRun.add(this.selectedSkill); // track
            // ... rest of assignment ...
        }
    }
}
```

### Medal Computation

In `game.js`, add method to `endLevel()`:

```javascript
endLevel(won) {
    // ... existing end logic ...
    
    if (won && this.levelIdx >= 0) {
        const level = LEVELS[this.levelIdx];
        const medal = this.computeMedal(level);
        if (medal) storage.setMedal(this.levelIdx, medal);
    }
}

computeMedal(level) {
    // If par fields are missing, no medal
    if (!level.parTime || !level.parSavedPct || !level.parSkills) return null;
    
    const pactMet = [];
    
    // Beat par time?
    if (this.time >= 0) pactMet.push(true); // time remaining >= 0
    
    // Beat par saved %?
    const savedPct = Math.round(100 * this.savedCount / level.totalSpawn);
    if (savedPct >= level.parSavedPct) pactMet.push(true);
    
    // Beat par skills used?
    if (this.skillsUsedThisRun.size <= level.parSkills) pactMet.push(true);
    
    // Tier: Gold = all 3, Silver = 2, Bronze = 1, None = 0
    const metCount = pactMet.filter(Boolean).length;
    if (metCount === 3) return 'GOLD';
    if (metCount === 2) return 'SILVER';
    if (metCount === 1) return 'BRONZE';
    return null;
}
```

### Storage

Extend `StorageManager` in `game.js`:

```javascript
class StorageManager {
    // ... existing methods ...
    
    getMedal(idx) { return this.load('medals', {})[idx] ?? null; }
    
    setMedal(idx, tier) {
        const medals = this.load('medals', {});
        medals[idx] = tier;
        this.save('medals', medals);
    }
}
```

### Menu Rendering

In `ui.js`, update `buildMenu()`:

```javascript
buildMenu() {
    const c = document.getElementById('level-select-container');
    c.innerHTML = '';
    const unlocked = storage.getUnlocked();
    for (let i = 0; i < LEVELS.length; i++) {
        const b = document.createElement('button');
        b.className = 'lvl-btn' + (i === this.game.levelIdx ? ' selected' : '');
        b.disabled = i > unlocked;
        const best = storage.getBest(i);
        const medal = storage.getMedal(i);
        
        let badgeHtml = '';
        if (medal === 'GOLD') badgeHtml = '<span class="medal gold">★</span>';
        else if (medal === 'SILVER') badgeHtml = '<span class="medal silver">✦</span>';
        else if (medal === 'BRONZE') badgeHtml = '<span class="medal bronze">◆</span>';
        
        b.innerHTML = `<span class="lvl-num">${i + 1}</span>` +
            (best !== null ? `<span class="lvl-best">${best}%</span>` : '') +
            badgeHtml;
        b.title = i <= unlocked ? LEVELS[i].name : 'Locked';
        b.onclick = () => { this.game.levelIdx = i; this.buildMenu(); };
        c.appendChild(b);
    }
    document.getElementById('btn-play-custom').classList.toggle('hidden', storage.getCustomLevels().length === 0);
}
```

### CSS (minimal example)

```css
.medal {
    font-size: 0.8em;
    margin-left: 4px;
}
.medal.gold { color: #FFD700; }
.medal.silver { color: #C0C0C0; }
.medal.bronze { color: #CD7F32; }
```

---

## Summary

These three systems layer cleanly:

- **Serialization**: compact, versioned binary format for any level object
- **URL Importing**: query-param bootstrap with validation and graceful fallback
- **Par Medals**: per-level par targets with real-time skill tracking and persistent tier storage

All three respect the existing game architecture (StorageManager, level shape, game lifecycle) and add no new compile step.
