# Crownwake Gameplay Glossary

**Current ruleset:** soldiers-only prototype. This document describes the
running game, not the older commander/recruitment design.

## The game loop

```text
Start with seven player soldiers
        ↓
Wait 5–7 seconds for a hidden enemy wave
        ↓
Enemy soldiers travel towards the nearest player soldier
        ↓
Any opposing pair enters detection range
        ↓
Closest available soldiers form one-to-one duels
        ↓
Every enemy is destroyed → next wave timer begins
        ↓
After wave 10, no further wave is scheduled
```

There is no recruitment, revival, commander respawn, territory capture, or
automatic player reset in this loop.

If every player soldier is destroyed, the session ends on a **GAME OVER**
screen. Its **BACK TO BEGIN** button returns to the opening screen.

## Actors

| Actor | Current appearance | Health | Damage | Control |
| --- | --- | ---: | ---: | --- |
| Player soldier | Untinted player model | 32 | 10 | Click the soldier, then click a free green tile. |
| Enemy soldier | Yellow/gold enemy model | 25.6 before wave scaling | 8 | Moves automatically and fights automatically. |

### Important naming note

`master` is still the name of one internal JavaScript variable from the old
commander version. In the current `INDEPENDENT_SOLDIERS` ruleset, that actor is
only another player soldier: it has the same health, damage, collision, model,
selection, death, and duel behaviour as the other six. The camera, floor, and
future wave spawns now use the first *living* player soldier, so losing that
legacy actor does not reset the army or end the wave.

## Player movement

### Tactical grid

- Clicking a living **player** soldier selects that one soldier only. Enemy
  soldiers are not player-commandable.
- Selection displays the light outline and a 7 × 7 tactical grid around that
  soldier.
- Each tactical cell is **3.6 world units** wide. The selectable range is
  three cells in each direction, or roughly **10.8 units** from the selected
  soldier.
- A free cell is green. A cell containing another living actor is red.
- Clicking a green cell gives that soldier a personal destination.
- Clicking a red occupied cell cancels selection; it does not issue movement.
- There is no slow motion. Time and combat continue at normal speed while a
  soldier is selected.

### Movement feel

**Steering** is acceleration-limited: each soldier accelerates towards a
desired point rather than snapping to it. `arrivalSpeed` reduces speed near the
destination, while `smoothAngle` rotates the model gradually.

**Box collision** gives each actor a soft rectangular footprint of roughly
0.43 × 0.39 world units. The game resolves overlap in four small passes per
simulation step and removes the velocity component driving into the collision.
This is why actors separate instead of occupying the same ground.

## Enemy approach and wave schedule

### Waves

- Waves spawn outside the current camera frame, using hidden-spawn candidates
  around the living player army.
- Enemy spawn placement uses a compact centred pack. Larger waves fill balanced
  rows (up to four across), then receive a small per-wave positional variation.
  This keeps soldiers separated without creating a straight line, a rigid grid,
  or an overly wide opening formation.
- The first wave and each later wave wait a random **5–7 seconds**.
- There are ten waves in this practice session:

| Wave | Enemy count | Enemy health multiplier |
| --- | ---: | --- |
| 1–4 | 5–6 | Wave 1 is base health; each later wave adds a compounded 5%. |
| 5–8 | 5–7 | Continues the early 5% growth, then adds compounded 7.5% per wave. |
| 9–10 | 6–8 | Continues the 7.5% growth. |

An enemy soldier travels towards the nearest living player soldier before
combat. The code still keeps an **enemy pack anchor** for camera and catch-up
measurements, but enemy soldiers currently do not hold a rigid marching
formation. They are individually steered.

### Detection and combat activation

The game measures the shortest distance between any living player soldier and
any living enemy soldier:

| Threshold | Value | Result |
| --- | ---: | --- |
| Detection radius | 32 units | Encounter enters **deploy**: the incoming enemy is recognised and rings turn red. |
| Aggro radius | 17 units | Encounter enters **combat**: both squads pair and charge before the enemy reaches the player formation. |
| Camera preview radius | 18 units | Retained for encounter awareness; gameplay camera remains at its default zoom. |

Because these are encounter-wide thresholds, one close pair wakes the combat
system for every soldier in that wave.

Every soldier has a ground ring. It is pale while no enemy wave is detected,
then turns red and lightly pulses from detection until that encounter ends.
The ring communicates a wave-wide alert before every soldier has a duel.

## Soldier behaviour state machine

Every living soldier is evaluated every simulation step (60 times per second).
The runtime uses these states:

| State | Meaning | Movement behaviour |
| --- | --- | --- |
| `FORMATION` | Not in combat. The name remains from the old system. | Player soldiers hold position unless manually ordered. Enemy soldiers travel towards their nearest player. |
| `DUEL` | Has a living, mutually locked opponent. | Moves to its assigned face-off point, turns to face the opponent, then attacks in sequence. |
| `WAITING` | No free opponent, but assigned as the one reserve for an active duel. | Moves to a controlled point 3.6 units to one side of that duel. |
| `NEUTRAL` | Combat is active but the soldier has neither a duel nor the available waiting slot. | Holds position. |

### Target assignment

`assignEngagements` uses exactly the same logic for player and enemy sides:

1. Keep valid mutual locks. A valid lock requires both soldiers to be alive and
   to point at each other.
2. From all remaining unpaired soldiers, find the globally closest player/enemy
   pair.
3. Lock that pair, then repeat until one side has no free soldier left. Each
   new pair is placed on a horizontal battle lane, with lanes spaced **1.6
   units** apart across the shared battle line.
4. Of any excess soldiers, assign **one total waiter per active duel**. The
   rest become neutral rather than surrounding a target.

Enemy soldiers review a distant mutual lock every **1 second**. While still in
`APPROACH`, an enemy will swap only to a living, unlocked player soldier that
is at least **0.35 units closer**. It never changes targets inside the
1.15-unit close-combat range, during a lunge, or during recovery.

This means the current game is **one primary attacker against one primary
defender**, not a two-attacker-per-target system. A waiter is a reserve position,
not an attacking slot.

### Duel lock

When a pair forms:

- Both soldiers share a fixed **face-off centre** halfway between their current
  positions.
- Each receives a hold point on a different side of that centre.
- They route around other actors with a small local left/right detour when a
  direct line is blocked.
- Normal roaming stops. A duellist prioritises its opponent until one dies.
- If a duellist cannot make meaningful approach progress through two 0.55-second
  path watchdog windows, it first changes detour side, then both soldiers
  release the stale lock. They avoid being paired with one another for 2.2
  seconds and immediately seek the closest different free opponent instead.
- When a soldier dies, its partner lock and any reserve references to that
  soldier are cleared in the same damage event, so a survivor can be assigned
  again on the next update.

## Attack sequence and damage

```text
APPROACH → reach face-off point → LUNGE → strike → RECOVER → other soldier's turn
```

- A soldier must reach its face-off hold point before it can lunge.
- Lunge movement targets a close stand-off distance: 0.72 units for a normal
  soldier opponent.
- A strike is valid only if both actors are alive, from opposing factions, and
  within **1.15 units** at the strike frame.
- The current `duelAttackHits` rule always returns `true`: there are no misses
  or dodge rolls in this build.
- After a successful strike in a mutual duel, turn ownership switches to the
  defender. That produces the intended alternating, flip-flop attack cadence.
- Damage is direct: player soldiers deal 10; enemy soldiers deal 8.

### Hit feedback

On a valid hit, the victim receives:

- a brief material/emissive flash towards a warm bright colour;
- a cube scale/position damage animation;
- a small velocity impulse away from the attacker;
- a compact hit burst and short audio tone; and
- a world-space health bar which appears only after damage.

Health bars remain visible for **3.2 seconds** after the last damage event.
They now use a dark framed rail, an immediate faction-coloured main fill, and
a white delayed-damage fill. The white section marks recently lost health,
then shrinks to meet the current health value.

### Player regeneration

Player soldiers begin regenerating **1.2 seconds** after their last damage.
Each wound records the health value immediately after that hit; regeneration
then returns the soldier from that value to full health in **10 seconds**.
During regeneration the health bar remains visible, changes to green, and its
fill grows smoothly. Enemy soldiers do not regenerate.

## Death, wave completion, and particles

**Soldier shatter** is the current death rule for both factions. At zero health,
the soldier is removed from combat and visibility, then emits a small set of
cube fragments. Fragments use gravity, bounce against the ground, spin while
airborne, then remain on the level after settling. Moving soldiers can nudge a
settled fragment aside; it rolls to a new resting place without blocking
navigation.

Persistent fragments have their own 800-piece session allowance and no longer
consume the 180-piece transient hit-effect budget. Enemy fragments are 50%
larger than player fragments.

When the last enemy in the active wave is dead:

1. All enemy units are removed from the encounter.
2. Existing enemy duel references are cleared.

Before the next-wave handoff, the game plays a 1.25-second slow-motion beat so
the final debris can land. It then returns to normal speed for 3 seconds. Only
after that pause does the next-wave timer begin; after wave 10, it instead
shows the victory end state.
3. A “RIVAL WAVE DEFEATED” toast appears.
4. The next 5–7 second wave timer starts, unless wave 10 has already spawned.

Enemy revival and player recruitment are disabled. The old “THE FRONTIER
STRIKES BACK” player-respawn branch has also been removed: losing one player
soldier never rebuilds the roster or alters the enemy wave.

When the final player soldier is destroyed, the same cinematic runs before the
game-over screen is allowed to appear. Its 4.25-second handoff clock always
uses real time, so changing the game-speed setting cannot make the ending
screen jump in early.

## Camera, floor, and interface

**Camera framing** follows the living player army with a deliberately wide,
stable default view. Combat does not force a zoom change, keeping the board
readable and avoiding sudden camera movements.

**Endless floor** consists of 18-unit grid tiles streamed around the camera's
current gameplay focus. Tiles leaving the radius are pooled and reused.

**HUD** currently shows the living player count and static territory counter.
The map/campaign data still exists, but normal wave victory does not yet claim
territory or reveal a new region.

**Settings** are opened with the gear button. HUD visibility, audio, and game
speed (0.5×, 0.75×, 1×, 1.25×, 1.5×, 2×) apply immediately. The Character
field defines the starting number of player soldiers. Enemy Waves contains ten
slots; each slot is the exact enemy count for that wave. Clicking **Apply &
Restart** saves those values locally and restarts the session with them.

## Legacy systems that are inactive

These code paths remain in the project for possible future reuse but do not
drive the current soldiers-only game:

- Commander health, regeneration, lives, and commander targeting.
- Company formation, division, promotion, and follower behaviour.
- Recruitment/revival progression and tombstones.
- Territory claiming and counterattack campaign consequences.
- Keyboard/gamepad movement; current movement is click-to-grid only.

## Current gaps worth fixing next

1. Enemy travel is individual, despite the retained pack-anchor terminology.
   If the intended feel is a joined wave, that needs a new travel-formation
   rule rather than relying on the inactive commander formation code.
3. The static territory HUD and map are not yet connected to wave victories.
