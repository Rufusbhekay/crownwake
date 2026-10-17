# CH and EN Swordsmen

The bundled model is `Models/crownwake-swordsman-v02.glb`. Its model asset is in
**Content → Models → Crownwake Swordsman v02**. Its playable blueprint is in
**Content → Characters → CH → CH Swordsman BP**.
The enemy version is **Content → Characters → EN → EN Swordsman BP**.
It uses the same model, size and animations, with amber team accents, 32 health,
10 attack damage and 3.975 movement speed. Drag it onto the level opposite a CH
and start Playtest: it joins the enemy roster and uses normal pairing and combat.
Existing EN blueprints are unchanged.

The third deployment button, **CH SWORD**, deploys five swordsmen by default.
Click it, then click a free ground tile to place the group. Click any living
swordsman to highlight its group, then click another free ground tile to move
them and see their Walk animation. CH1, CH2 and swordsmen have separate groups.
Existing duel combat still takes priority over movement orders while engaged.
Change the starting count under Settings → CH Swordsmen available.

Drag the blueprint onto a walkable level surface, place an EN nearby, and start
Playtest. It uses the existing CH pairing, navigation and building attack slots.
Placed living CH activate combat on the first simulation tick, without pressing
the deploy button or consuming reserve soldiers. This also applies after reload.
It starts with 32 health, 10 attack damage and 3.975 movement speed.

To use this model with the existing CH1 deploy button, select CH1 in the Content
Browser and choose **Crownwake Swordsman v02** in its Model field. New CH1 soldiers
then use the swordsman. Existing placed actors retain their saved model choice.

Model scale is configured on the model asset and applies wherever it is used.
The starting scale fits the body to 1.22 units, excluding the raised sword from
the body-height calculation. Original materials are retained; enemy/team tinting
changes only the Team_Red material.

Idle and Walk loop. Walking follows actual displacement; stationary or blocked
soldiers idle. Attack plays once, with damage checked at the exported 0.6-second
contact time. Damage requires a live target still in range; building hits also
require the same reserved building slot and no intervening duel or move order.
Each soldier owns an independent cloned skeleton and animation mixer. A dead
actor or model replacement cancels pending damage. The game continues to use
its existing damage effects and death debris because this GLB has no Hit or
Death clips.
