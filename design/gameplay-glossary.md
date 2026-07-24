# Crownwake Gameplay Glossary

## Actors

- **Player Master** — The blue leader controlled by click, keyboard, or gamepad. Starts with 100 health and 18 base damage.
- **Player Servant** — A white recruited fighter. Starts with 32 health and 10 base damage.
- **Enemy Master** — The red opposing leader. Has 80 health and 14.4 base damage: exactly 20% below the player master.
- **Enemy Servant** — A black opposing fighter. Has 25.6 health and 8 base damage: exactly 20% below a player servant.

## Servant Modes

- **FOLLOW** — The default and retreat mode. A servant prioritizes its assigned formation position around its master, accelerates when falling behind, and does not acquire or damage an enemy.
- **ATTACK** — A temporary combat mode. A servant may engage only while combat is active, its master is not retreating, and it remains inside the attack leash.
- **Battle line** — The brief pre-melee formation in which both swarms spread laterally and expose readable lanes before locking opponents.
- **Duel lock** — A mutually acknowledged primary soldier pairing anchored around a shared, fixed face-off centre.
- **Duel commitment** — Once locked, a soldier ignores all commander movement and retreat orders until either it or its opponent falls; survivors then acquire another living opponent.
- **Target priority** — A surviving duelist searches the entire encounter for living soldiers first. The opposing commander becomes a valid target only after no enemy soldiers remain.
- **Combat release** — When no living enemies remain, every player soldier immediately clears duel and seek state, resets follow awareness, and returns to commander-follow mode.
- **Trailing health bar** — The enemy commander’s red health fill drops immediately on damage while a pale chip bar briefly preserves the lost amount, then smoothly catches up before the two-second world-space widget hides.
- **Damage authority** — Health can change only when a live opposing attack passes cooldown and current-distance validation at the exact strike frame; movement and stale animation events cannot cause damage.
- **Local detour** — A committed soldier probes the route to its face-off point, scores both sides of a blocking commander or soldier, and temporarily steers through the clearer side without abandoning its lock.
- **Reinforcement** — A surplus soldier joining the least-crowded active duel from an open flank, turning superior numbers into a controlled advantage.
- **Lunge** — The short committed forward burst used once a duelist reaches its engagement gap.
- **Dodge cadence** — Every third lunge misses; the defender visibly sidesteps while the attacker enters recovery.
- **Recovery** — The deliberate backward movement after each lunge, reopening space before the next attack.
- **Soldier shatter** — A defeated player soldier disappears immediately into a compact turquoise, blue, and ivory cube-fragment burst instead of leaving a body.
- **Retreat override** — If a master moves away from the opposing master, every servant immediately returns to FOLLOW mode—even if it was already fighting.
- **Attack leash** — The maximum distance from a master at which a servant may remain in ATTACK mode. Crossing it forces FOLLOW mode.
- **Awareness threshold** — The individual distance a commander must move before a soldier notices and prepares to follow.
- **Reaction delay** — A small per-soldier delay between noticing commander movement and beginning pursuit, producing staggered rather than mirrored responses.
- **Remembered commander position** — The smoothed location each soldier follows. Individual tracking rates create natural movement while excessive separation still forces immediate catch-up.

## Health and Damage

- **Health (HP)** — The amount of damage an actor can receive before being defeated.
- **Base damage** — Health removed by one successful attack.
- **Attack cooldown** — The short recovery period before an actor may deal damage again.
- **Master regeneration** — The player commander begins recovering 5 health per second after 4.5 seconds without taking damage.
- **Defeat reset** — When the player commander falls, accumulated army growth is lost and the army returns with six ordinary soldiers.
- **Damage intensity** — Repeated damage makes the player master’s red emissive response brighter. The effect stacks during sustained pressure and fades when attacks stop.
- **Soldier damage highlight** — A hit briefly doubles a soldier material’s emissive intensity, then fades without permanently changing faction colour.

## Movement and Collision

- **Personal-space steering** — Soldiers apply soft repulsion inside 0.78 world units, preserving natural movement without forming a tightly packed block.

- **Formation slot** — A servant’s assigned location around its master.
- **Catch-up speed** — Extra FOLLOW-mode speed granted in proportion to how far a servant has fallen behind.
- **Box collision** — Actors use rectangular X/Z footprints matching their visible cube proportions. Overlap is resolved along the shallowest axis.
- **Debug box** — The visible wireframe box showing the exact footprint used by collision resolution.
- **Steering** — Acceleration-limited movement that produces gradual starts, stops, and turns.
- **Ground friction** — Direct keyboard/gamepad movement loses speed quickly when input is released. Click-to-move remains destination-based and is not cancelled by direct-control friction.
- **Fallen state** — A defeated soldier remains at its exact final position and orientation, turns charcoal-grey, loses velocity, attack ability, and collision, then restores its faction colour when revived.
- **Commander shatter** — A defeated player or enemy commander disappears at its death origin and emits 10–16 faction-coloured cube fragments with outward velocity, gravity, and spin. This effect applies only to commanders.

## Combat and Conquest

- **Pawn sensing** — Each living soldier and commander checks a local 6.2-unit sight radius. A sighting by any one pawn alerts the whole allied swarm; fallen soldiers cannot detect enemies.
- **Swarm alert** — The shared combat state entered after local pawn contact. Before contact, an enemy swarm marches in formation toward the player without assigning attack targets.
- **Enemy morale** — Enemy forces commit while at least two soldiers remain. The commander and final soldier may evade only after the squad falls to one soldier.
- **Command collapse** — Defeating an enemy commander immediately drops every surviving enemy soldier into the normal fallen state; they then enter the existing delayed revival and recruitment sequence.

- **Aggro** — The state entered when opposing forces move within engagement distance.
- **Recruitment** — After an enemy master and all its servants are defeated, those servants revive as player servants.
- **No commander remains** — Commanders leave no body and no tombstone. Ordinary soldiers still use the grey-black fallen state.
- **Territory claim** — Victory changes the defeated region to player ownership and reveals connected frontier regions.
- **Counterattack** — A defeat may return an adjacent unfortified player region to enemy control.
- **Fortified region** — A territory protected from normal counterattack capture.
