import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const game = readFileSync(new URL("../game.js", import.meta.url), "utf8");
const index = readFileSync(new URL("../index.html", import.meta.url), "utf8");

test("CH3 is a separate ranged deployment with editable projectile settings", () => {
  assert.match(game, /PLAYER_DEPLOYMENT_ARCHETYPES=Object\.freeze\(\["ch1","ch2","ch3","ch4"\]\)/);
  assert.match(game, /ch4:Object\.freeze\(\{id:"ch4",label:"CH3"/);
  assert.match(game, /projectileDamage/);
  assert.match(game, /projectileSpeed/);
  assert.match(game, /projectileLength/);
  assert.match(game, /projectileThickness/);
  assert.match(index, /id="companies-ch4"[^>]*data-deployment-archetype="ch4"/);
  assert.match(index, /data-actor-property="projectileDamage"/);
  assert.match(index, /data-actor-property="projectileSpeed"/);
  assert.match(index, /data-actor-property="projectileLength"/);
  assert.match(index, /data-actor-property="projectileThickness"/);
});

test("CH3 fires a flat non-homing line while one EN pursues it", () => {
  assert.match(game, /function launchProjectile\(/);
  assert.match(game, /new THREE\.PlaneGeometry\(thickness,length\)/);
  assert.match(game, /new THREE\.MeshBasicMaterial\(\{color:0xff1f64,side:THREE\.DoubleSide/);
  assert.match(game, /Math\.sin\(attacker\.rotation\.y\)/);
  assert.match(game, /function assignRangedSkirmishTargets\(/);
  assert.match(game, /function assignRangedEnemyPursuers\(/);
  assert.match(game, /lockDuel\(nearest,skirmisher\)/);
  assert.doesNotMatch(game, /lockDuel\(skirmisher,nearest\)/);
  assert.match(game, /rangedSkirmishers=commandableFollowers\.filter\(isRangedSkirmisher\)/);
  assert.match(game, /meleeCombatAssignmentRoster=combatAssignmentRoster\.filter\(unit=>!isRangedSkirmisher\(unit\)\)/);
  assert.match(game, /rangedAssignments\.get\(u\)\?\?playerAssignments\.get\(u\)/);
  assert.match(game, /rangedEnemyAssignments=assignRangedEnemyPursuers\(canAssignRangedCombat\?rangedSkirmishers:\[\],livingEnemySoldiers\)/);
  assert.match(game, /meleeEnemyRoster=livingEnemySoldiers\.filter\(enemy=>!rangedEnemyAssignments\.has\(enemy\)\)/);
  assert.match(game, /safeDistance=6\.15,retreatDistance=4\.9,fireDistance=8\.4/);
  assert.match(game, /rangedBurstLimit\?\?=2/);
  assert.match(game, /projectileThickness\)\|\|\.065/);
  assert.match(game, /attacker\.userData\.attackAnim=Math\.max\(attacker\.userData\.attackAnim\?\?0,\.12\)/);
  assert.match(game, /dealDamage\(projectile\.userData\.attacker,target,projectile\.userData\.damage,0\)/);
  assert.match(game, /function updateProjectiles\(dt\)/);
  assert.match(game, /direction:direction\.clone\(\)/);
  assert.match(game, /const direction=projectile\.userData\.direction/);
  assert.doesNotMatch(game, /targetPoint\.sub\(projectile\.position\)/);
  assert.match(game, /dealDamage\(projectile\.userData\.attacker,target,projectile\.userData\.damage,0\)/);
  assert.match(game, /if\(unit\.userData\.projectileDamage>0&&unit\.userData\.projectileSpeed>0\)return updateProjectileDuel\(unit,foe,dt\)/);
});
