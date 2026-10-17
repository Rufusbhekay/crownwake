import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import * as THREE from "three";
import { SOLDIER_REGEN_DELAY, SOLDIER_REGEN_DURATION, soldierCanRegenerateAfterDuel, soldierRegenHealth } from "../src/sim.js";

const source = readFileSync(new URL("../game.js", import.meta.url), "utf8");

test("CH healing waits for its EN duo to fall and stops for a new duo", () => {
  const enemy = { userData: { alive: true, faction: "enemy" } };
  const unit = {
    userData: {
      alive: true,
      faction: "player",
      hp: 12,
      maxHp: 32,
      regenStartHealth: 12,
      sinceDamage: 99,
      regenActive: false,
      duoDefeatedAt: 10,
      lockedTarget: enemy
    }
  };
  const context = vm.createContext({
    INDEPENDENT_SOLDIERS: true,
    SOLDIER_REGEN_DELAY,
    SOLDIER_REGEN_DURATION,
    soldierCanRegenerateAfterDuel,
    soldierRegenHealth,
    livingPlayerUnits: () => [unit],
    totalTime: 13
  });
  const start = source.indexOf("function updatePlayerSoldierRegeneration(");
  const end = source.indexOf("function showGameOverScreen()", start);
  assert.notEqual(start, -1, "CH regeneration update must remain testable");
  vm.runInContext(source.slice(start, end), context);

  context.updatePlayerSoldierRegeneration(.1);
  assert.equal(unit.userData.hp, 12, "a live EN duo blocks CH healing");
  assert.equal(unit.userData.duoDefeatedAt, null, "a new duo cancels a pending recovery");

  unit.userData.lockedTarget = null;
  unit.userData.duoDefeatedAt = 20;
  context.totalTime = 22.99;
  context.updatePlayerSoldierRegeneration(.1);
  assert.equal(unit.userData.hp, 12, "CH waits the full three seconds after its duo falls");

  context.totalTime = 23;
  context.updatePlayerSoldierRegeneration(.1);
  assert.ok(unit.userData.hp > 12, "CH begins recovering after the three-second duo recovery delay");
  assert.equal(unit.userData.regenActive, true);
});

test("defeating an EN starts CH recovery and a new duo cancels it immediately", () => {
  const player = { userData: { alive: true, faction: "player", attack: 8, lockedTarget: null, regenActive: true, duoDefeatedAt: null } };
  const enemy = { userData: { alive: true, faction: "enemy", hp: 4, lockedTarget: player, velocity: new THREE.Vector3(), isMaster: false }, visible: true };
  player.userData.lockedTarget = enemy;
  const nextEnemy = { userData: { alive: true, faction: "enemy" } };
  const context = vm.createContext({
    THREE,
    totalTime: 42,
    INDEPENDENT_SOLDIERS: true,
    master: { userData: {} },
    followers: [player],
    enemyUnits: [enemy],
    rand: () => 1,
    showActorHealth() {},
    hitKnockback: () => ({ x: 0, z: 0 }),
    synthTone() {},
    resetDuel: unit => { unit.userData.lockedTarget = null; },
    spawnEnemySplitChildren() {},
    playSound() {},
    setFallenAppearance() {},
    clearBuildingAttackAssignments() {},
    ENEMY_TARGET_REVIEW_INTERVAL: 1,
    DUEL_PHASE: { APPROACH: "approach" }
  });
  const damageStart = source.indexOf("function dealDamage(");
  const damageEnd = source.indexOf("function hit(", damageStart);
  const lockStart = source.indexOf("function lockDuel(");
  const lockEnd = source.indexOf("function assignEngagements(", lockStart);
  vm.runInContext(source.slice(damageStart, damageEnd), context);
  vm.runInContext(source.slice(lockStart, lockEnd), context);

  assert.equal(context.dealDamage(player, enemy), true);
  assert.equal(player.userData.duoDefeatedAt, 42);
  assert.equal(player.userData.lockedTarget, null);

  context.lockDuel(player, nextEnemy);
  assert.equal(player.userData.duoDefeatedAt, null);
  assert.equal(player.userData.regenActive, false);
});
