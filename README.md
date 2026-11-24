# Wordfire v1

Wordfire is a 2D side-scrolling typing-duel game that runs directly in the browser. Duel against an AI opponent by combining rapid movement, pendulum swinging, and typed magical and martial commands.

---

## How to Run

Wordfire is built with vanilla HTML5, CSS3, and modern JavaScript (ES Modules). No backend or build step is required.

### Option 1: Local Static Server (Recommended)
Because modern browsers restrict ES module imports over `file://` by default, run a quick local HTTP server in this directory:

```bash
# Using Python 3
python -m http.server 8000

# Or using Node.js / npx
npx serve .
```

Then open your browser at `http://localhost:8000`.

### Option 2: Direct Open
If your browser allows local module loading, simply double-click `index.html` to open it.

---

## Controls

- **Run**: `Arrow Left` / `Arrow Right`
- **Jump**: `Arrow Up`
- **Swing**: Click and hold the **Mouse** on any valid anchor (within 350 px) to initiate pendulum swing. Release mouse button to let go with momentum. While swinging, `Arrow Left` and `Arrow Right` add push.
- **Type Commands**: The text prompt at the bottom is always focused. Type your command and press `Enter`.
- *Note*: Letter keys never move your fighter. The `Space` key is never used for jumping or movement.

---

## Commands Reference

### Universal & Utility
- `help` — Prints your element's available commands in the combat log.
- `shield` — Deploys a protective dome for 5 seconds (5s cooldown). Blocks all normal powers and weapon strikes. (Ultimates deal 2 chip damage through it).
- `dodge` — Prepares an evasive dash (2s cooldown). After typing, press `Arrow Left` or `Arrow Right` within 2 seconds to dash 220 px (or 330 px with Light Speed buff) with 0.3s invulnerability.
- `collect` — Picks up a nearby weapon on the ground within 80 px. You can carry up to 2 weapons.
- `swap` — Swaps the active weapon in hand between your 2 carried weapons.

### Weapon Attacks (Requires weapon in hand)
- `slash` — Short-range strike (~70 px) with the **Sword** (5 damage, no cooldown).
- `stab` — Medium-range thrust (~140 px) with the **Spear** (5 damage, no cooldown).
- `arrow` — Long-range straight projectile with the **Bow** (5 damage, no cooldown).
- `power` — Imbues your held weapon with your element for 8 seconds (+3 damage). An imbued weapon strike or arrow destroys normal enemy power projectiles on contact!

---

### Elemental Powers

#### Fire
- `fireball` — Launches a straight-flying fireball (4 damage).
- `flames` — Short-range blaze stream in front (3 damage).
- `heat wave` — For 5s: opponent deals 20% less damage and your fire powers deal 20% more (0 damage).
- `fire hands` — Melee blazing punch (5 damage).
- `power` — Imbues held weapon with fire (+3 damage for 8s, intercepts normal projectiles).
- `inferno blast` — **ULTIMATE**: Huge, fast blast (25 damage). (4 uses per match, 8s cooldown).

#### Ice
- `ice beam` — Straight-flying ice shard (4 damage).
- `blizzard` — Slows opponent movement by 30% for 6s (0 damage).
- `ice spikes` — Spikes erupt from the ground ahead (5 damage).
- `army` — Summons 5 marching snowmen (5 HP each, 2 damage per hit, up to 10 total).
- `power` — Imbues held weapon with ice (+3 damage for 8s, intercepts normal projectiles).
- `ice sphere` — **ULTIMATE**: Massive frosted sphere (20 damage, freezes opponent for 2s). (4 uses per match, 8s cooldown).

#### Wind
- `air slash` — Sharp crescent projectile (4 damage).
- `cluster` — 3 small air bursts in a spread (2 damage each, 6 max).
- `fly` — Flight for 3s while still able to attack (10s cooldown).
- `wind punch` — Short-range cyclone strike (5 damage).
- `power` — Imbues held weapon with wind (+3 damage for 8s, intercepts normal projectiles).
- `tornado arrow` — **ULTIMATE**: Heavy vortex arrow that pulls the opponent inward (25 damage). (4 uses per match, 8s cooldown).

#### Light
- `light beam` — Continuous beam lasting 3s (~3 damage/s, 9 max).
- `speed` — Enhances dodge dash to 330 px for 5s (0 damage).
- `radiation` — Boosts all your damage by +20% for 5s (0 damage).
- `shoot` — High-speed ray of light (4 damage).
- `power` — Imbues held weapon with light (+3 damage for 8s, intercepts normal projectiles).
- `solar beam` — **ULTIMATE**: Blinding solar ray (25 damage). (4 uses per match, 8s cooldown).

---

## Match Rules

1. **Duration**: 6 minutes (360 seconds).
2. **Safe Phase (0:00 to 1:00)**: No damage can be dealt to either fighter.
3. **Shrinking Zone (1:00 to 5:00)**: The playable field gradually narrows to 20% of the world width. Anyone caught in the fog loses 1 HP per second.
4. **Anti-Camping**: After the safe phase, any fighter who has not attacked for 20 seconds loses 1 HP, repeating every 20 seconds until an attack is made.
5. **Burst Typing Penalty**: Typing the same power more than 6 times in a 1.5s window triggers a 3-second overheat cooldown.
6. **Victory**: Match ends instantly when any fighter's HP drops to 0. At 6:00, the fighter with higher HP wins.
