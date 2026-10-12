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
  assert.match(index, /id="companies-ch4"[^>]*data-deployment-archetype="ch4"/);
  assert.match(index, /data-actor-property="projectileDamage"/);
  assert.match(index, /data-actor-property="projectileSpeed"/);
  assert.match(index, /data-actor-property="projectileLength"/);
});

test("CH3 fires a visible long projectile which applies its own configured damage", () => {
  assert.match(game, /function launchProjectile\(/);
  assert.match(game, /new THREE\.BoxGeometry\(/);
  assert.match(game, /function updateProjectiles\(dt\)/);
  assert.match(game, /dealDamage\(projectile\.userData\.attacker,target,projectile\.userData\.damage\)/);
  assert.match(game, /if\(unit\.userData\.projectileDamage>0&&unit\.userData\.projectileSpeed>0\)return updateProjectileDuel\(unit,foe,dt\)/);
});
