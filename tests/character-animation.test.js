import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import * as THREE from "../vendor/three.module.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { attachCharacterAnimation, cloneAnimatedModel, queueCharacterStrike, updateCharacterAnimation } from "../src/character-animation.js";
import { activeDuelRingState, normalizePracticeConfig, soldierCombatState, SOLDIER_COMBAT_STATE, SERVANT_MODE } from "../src/sim.js";

const bytes = await readFile(new URL("../Models/crownwake-swordsman-v02.glb", import.meta.url));
const gltf = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), "");
gltf.scene.animations = gltf.animations;
const game = await readFile(new URL("../game.js", import.meta.url), "utf8");
const index = await readFile(new URL("../index.html", import.meta.url), "utf8");

test("CH and EN Blueprints expose shared ring controls in Actor Details", () => {
  assert.match(index, /id="editor-actor-ring-controls"/);
  assert.match(index, /id="editor-ring-outer-size"/);
  assert.match(index, /id="editor-ring-radar-thickness"/);
  assert.match(index, /id="editor-ring-radar-thickness"[^>]*max="2"/);
  assert.match(index, /id="editor-ring-radar-radius"/);
  assert.match(index, /id="editor-ring-radar-size"/);
  assert.match(game, /function renderEditorActorRingControls\(enabled\)/);
  assert.match(game, /renderEditorActorRingControls\(Boolean\(libraryProfile\)\)/);
  assert.match(game, /updateEditorActorRingControls/);
});

test("CH and EN Actor Details expose native master, acceleration, and patrol movement controls", () => {
  assert.match(index, /data-actor-property="moveSpeed"[^>]*type="number"/);
  assert.match(index, /data-actor-property="acceleration"[^>]*type="number"/);
  assert.match(index, /data-actor-property="patrolSpeed"[^>]*type="number"/);
  assert.doesNotMatch(index, /data-actor-property="patrolSpeed"[^>]*type="range"/);
});

test("Content Browser CH and EN Blueprints save movement defaults for new placements", () => {
  assert.match(game, /actorStats:saved\.actorStats/);
  assert.match(game, /function actorBlueprintProfile\(archetypeId,faction\)/);
  assert.match(game, /input\.disabled=!libraryProfile/);
  assert.match(game, /New placements will use this value/);
});

test("CH and EN rotate into their front-radar direction before moving", () => {
  assert.match(game, /frontConstrained=Boolean\(unit\.userData\?\.actorArchetypeId&&!unit\.userData\?\.isMaster\)/);
  assert.match(game, /desiredVelocity=forward\.multiplyScalar\(speed\*alignment\)/);
});

test("ordered CH groups use a compact single-file travel column", () => {
  const context = vm.createContext({ INDEPENDENT_GROUP_COLUMN_GAP: .68 });
  const start = game.indexOf("function compactGroupColumnOffset(");
  const end = game.indexOf("function independentGroupPatrolTarget(", start);
  vm.runInContext(game.slice(start, end), context);
  const leader = context.compactGroupColumnOffset(0), rear = context.compactGroupColumnOffset(4);
  assert.equal(leader.lateral, 0);assert.equal(leader.forward, 0);
  assert.equal(rear.lateral, 0);assert.equal(rear.forward, -2.72);
  const orderStart = game.indexOf("function issueCompanyOrder(");
  const orderEnd = game.indexOf("\nfunction ", orderStart + 1);
  assert.match(game.slice(orderStart, orderEnd), /const offset=compactGroupColumnOffset\(index\)/);
});

test("CH group patrols share one moving target and resume immediately after an order", () => {
  const patrolStart = game.indexOf("function independentGroupPatrolTarget(");
  const patrolEnd = game.indexOf("function updateIndependentGroupPatrol(", patrolStart);
  const patrolSource = game.slice(patrolStart, patrolEnd);
  assert.match(patrolSource, /anchor\.patrolGoal=/);
  assert.match(patrolSource, /anchor\.patrolHome=home\.clone\(\)\.setY\(GROUND_Y\)/);
  assert.match(patrolSource, /INDEPENDENT_GROUP_PATROL_RADIUS/);
  assert.doesNotMatch(patrolSource, /expiresAt/);
  assert.match(patrolSource, /compactGroupColumnOffset\(index\)/);
  const soldierStart = game.indexOf("function updateIndependentSoldier(");
  const soldierEnd = game.indexOf("\nfunction ", soldierStart + 1);
  const soldierSource = game.slice(soldierStart, soldierEnd);
  assert.match(soldierSource, /updateIndependentGroupPatrol\(u,patrolAllies,dt\)/);
  assert.match(soldierSource, /ensureCompanyAnchor\(u\.userData\.companyId\)\.patrolGoal=null/);
  assert.match(soldierSource, /navigationPhysicalPathClear\(u\.position,desired,u\)/);
  assert.match(soldierSource, /steerStraightTowards\(u,desired/);
  assert.doesNotMatch(soldierSource, /manualMoving=false;u\.userData\.manualTarget=null;u\.userData\.velocity\.set\(0,0,0\)/);
});

test("CH and EN markers use raised white rings with a leading faction arc", () => {
  assert.match(game, /const UNIT_RING_SETTINGS_KEY="crownwake-unit-ring-settings-v1"/);
  const player = new THREE.Group(), enemy = new THREE.Group(), secondEnemy = new THREE.Group();
  player.userData = { alive: true, faction: "player", lockedTarget: enemy, velocity: new THREE.Vector3(1, 0, 0) };
  enemy.userData = { alive: true, faction: "enemy", lockedTarget: player, velocity: new THREE.Vector3() };
  secondEnemy.userData = { alive: true, faction: "enemy", editorMaterialColor: "#25c8e0", velocity: new THREE.Vector3(0, 0, 1) };
  const context = vm.createContext({
    THREE, SOLDIER_MARKER_LEAD_DISTANCE: .13, UNIT_RING_RADAR_GAP: .065, GROUND_Y: .015, totalTime: 1, reducedMotion: false,
    unitRingSettings: { outerColor: "#f7f2e4", outerSize: .7605, outerThickness: .04125, outerHeight: .018, innerColor: "#f7f2e4", innerSize: .5915, innerThickness: .04125, innerHeight: .054, playerRadarColor: "#e53935", enemyRadarColor: "#ffcf22", radarHeight: .021, radarThickness: .04125, radarRadius: .86675, radarSize: 1.06 / Math.PI },
    master: player, followers: [], enemyUnits: [enemy, secondEnemy], activeDuelRingState,
    isBarracksDeparting: () => false
  });
  const start = game.indexOf("function makeUnitRingGeometry("), end = game.indexOf("function configuredProgressBar(", start);
  vm.runInContext(game.slice(start, end), context);
  context.makeEncounterRing(player);
  context.makeEncounterRing(enemy);
  context.makeEncounterRing(secondEnemy);
  for (const property of ["outerVisible", "innerVisible", "radarVisible"]) context.unitRingSettings[property] = false;
  const restoredActor = new THREE.Group();
  context.makeEncounterRing(restoredActor);
  for (const part of restoredActor.userData.encounterRing.children) assert.equal(part.visible, false);
  for (const property of ["outerVisible", "innerVisible", "radarVisible"]) context.unitRingSettings[property] = true;
  context.refreshEncounterRing(restoredActor.userData.encounterRing);
  for (const part of restoredActor.userData.encounterRing.children) assert.equal(part.visible, true);
  for (const unit of [player, enemy, secondEnemy]) {
    const marker = unit.userData.encounterRing;
    assert.equal(marker.isGroup, true);
    assert.equal(marker.children.length, 3);
    assert.equal(marker.userData.outerMaterial.color.getHex(), 0xf7f2e4);
    assert.equal(marker.userData.innerMaterial.color.getHex(), 0xf7f2e4);
    assert.ok(Math.abs(marker.userData.inner.position.y-.036)<1e-9);
    assert.ok(Math.abs(marker.userData.direction.geometry.parameters.innerRadius-.8255)<1e-9);
  }
  for (let frame = 0; frame < 2; frame++) {
    context.updateEncounterRings();
    assert.equal(player.userData.encounterRing.userData.directionMaterial.color.getHex(), 0xffffff);
    assert.equal(enemy.userData.encounterRing.userData.directionMaterial.color.getHex(), 0xffffff);
    assert.equal(player.userData.encounterRing.userData.outerMaterial.color.getHex(), 0xe32646);
    assert.equal(enemy.userData.encounterRing.userData.innerMaterial.color.getHex(), 0xffbf24);
    assert.equal(secondEnemy.userData.encounterRing.userData.directionMaterial.color.getHex(), 0xffcf22);
    assert.equal(secondEnemy.userData.encounterRing.userData.outerMaterial.color.getHex(), 0xf7f2e4);
    assert.equal(player.userData.encounterRing.visible, true);
    assert.equal(enemy.userData.encounterRing.visible, true);
  }
  assert.equal(player.userData.encounterRing.userData.direction.position.z, .13);
  assert.equal(enemy.userData.encounterRing.userData.direction.position.z, 0);
  context.totalTime=1.25;
  context.updateEncounterRings();
  const pulsedRed=player.userData.encounterRing.userData.outerMaterial.color.r;
  context.totalTime=2;
  context.updateEncounterRings();
  assert.ok(pulsedRed>player.userData.encounterRing.userData.outerMaterial.color.r);
  assert.equal(player.userData.encounterRing.userData.pairConfirmedAt,1);
  assert.equal(player.userData.encounterRing.userData.outerMaterial.color.getHex(),0xe32646);
  context.totalTime=2.25;
  context.updateEncounterRings();
  assert.ok(Math.abs(player.userData.encounterRing.userData.outerMaterial.color.r-pulsedRed)<1e-9);
  context.reducedMotion=true;
  context.updateEncounterRings();
  assert.equal(player.userData.encounterRing.userData.outerMaterial.color.getHex(),0xe32646);
  context.reducedMotion=false;
  context.unitRingSettings = { ...context.unitRingSettings, outerSize: .9, outerThickness: .06, innerSize: .65, innerThickness: .05, radarThickness: .08, radarRadius: 1.045, radarSize: 1 };
  context.refreshEncounterRing(player.userData.encounterRing);
  assert.equal(player.userData.encounterRing.userData.outer.geometry.parameters.outerRadius, .9);
  assert.ok(Math.abs(player.userData.encounterRing.userData.outer.geometry.parameters.innerRadius-.84)<1e-9);
  assert.ok(Math.abs(player.userData.encounterRing.userData.direction.geometry.parameters.innerRadius-.965)<1e-9);
  assert.ok(Math.abs(player.userData.encounterRing.userData.direction.geometry.parameters.outerRadius-1.045)<1e-9);
  assert.equal(player.userData.encounterRing.userData.direction.geometry.parameters.thetaLength, Math.PI);
  enemy.userData.alive = false;
  context.updateEncounterRings();
  assert.equal(player.userData.encounterRing.visible, true);
  assert.equal(enemy.userData.encounterRing.visible, false);
  assert.equal(player.userData.encounterRing.userData.outerMaterial.color.getHex(),0xf7f2e4);
  assert.equal(player.userData.encounterRing.userData.directionMaterial.color.getHex(),0xe53935);
  enemy.userData.alive=true;
  enemy.userData.lockedTarget=null;
  context.updateEncounterRings();
  assert.equal(player.userData.encounterRing.userData.pairId,null);
  assert.equal(enemy.userData.encounterRing.userData.innerMaterial.color.getHex(),0xf7f2e4);
  for (const unit of [player, enemy, secondEnemy]) for (const material of unit.userData.encounterRing.userData.materials) material.dispose();
  for (const unit of [player, enemy, secondEnemy]) for (const part of unit.userData.encounterRing.children) part.geometry.dispose();
});

test("attack rings follow visual lunges and recover without changing their height", () => {
  const actor=new THREE.Group(),visual=new THREE.Group(),ring=new THREE.Group();
  actor.add(visual,ring);actor.userData.encounterRing=ring;
  visual.userData.characterVisual=true;visual.userData.basePosition=new THREE.Vector3(.2,.1,-.3);
  visual.position.copy(visual.userData.basePosition);ring.position.y=.08;
  const context=vm.createContext({THREE});
  const start=game.indexOf("function syncCharacterRingPosition("),end=game.indexOf("function updateActorCombatAnimations(",start);
  vm.runInContext(game.slice(start,end),context);
  visual.position.x+=.12;visual.position.z+=.5;visual.position.y+=.2;
  context.syncCharacterRingPosition(actor,visual);
  assert.ok(Math.abs(ring.position.x-.12)<1e-9);
  assert.equal(ring.position.z,.5);assert.equal(ring.position.y,.08);
  actor.rotation.y=Math.PI/2;
  const expected=actor.localToWorld(new THREE.Vector3(.12,.08,.5));
  assert.ok(ring.getWorldPosition(new THREE.Vector3()).distanceTo(expected)<1e-9);
  visual.position.copy(visual.userData.basePosition);
  context.syncCharacterRingPosition(actor,visual);
  assert.equal(ring.position.x,0);assert.equal(ring.position.z,0);
});

test("swordsman deployment owns a third group separate from CH1 and CH2", () => {
  const start = game.indexOf("const PLAYER_DEPLOYMENT_ARCHETYPES="), end = game.indexOf("let selectedCompanyId=", start);
  const context = vm.createContext({ PRACTICE_CONFIG: normalizePracticeConfig() });
  vm.runInContext(game.slice(start, end), context);
  assert.equal(context.deploymentGroupId("ch1"), 0);
  assert.equal(context.deploymentGroupId("ch2"), 1);
  assert.equal(context.deploymentGroupId("ch3"), 2);
  assert.equal(context.configuredDeploymentReserves().ch3, 5);
});

test("legacy hidden swordsman count migrates to five and configured counts survive reload", () => {
  const start = game.indexOf("function loadPracticeConfig()"), end = game.indexOf("\n", start);
  for (const [saved, expected] of [[{ ch1Soldiers: 5, ch2Soldiers: 0, ch3Soldiers: 2 }, 5], [{ deploymentRosterVersion: 2, ch3Soldiers: 2 }, 2], [{ deploymentRosterVersion: 2, ch3Soldiers: 0 }, 0]]) {
    const context = vm.createContext({ normalizePracticeConfig, PRACTICE_CONFIG_KEY: "test", localStorage: { getItem: () => JSON.stringify(saved) } });
    vm.runInContext(game.slice(start, end), context);
    assert.equal(context.loadPracticeConfig().ch3Soldiers, expected);
  }
});

test("unpaired swordsman honours click-to-move during neutral combat and peaceful patrol", () => {
  for (const peacefulPatrol of [false, true]) {
    const unit = new THREE.Group(), moves = [];
    unit.userData = { alive: true, manualMoving: true, manualTarget: new THREE.Vector3(6, 0, 2), velocity: new THREE.Vector3() };
    const context = vm.createContext({
      SOLDIER_COMBAT_STATE, SERVANT_MODE, soldierCombatState,
      shouldRegroupPlayerGroup: () => false, editorActorMoveScale: () => 1, actorSteerAcceleration: (_unit, value) => value,
      updatePeacefulPatrol: () => assert.fail("patrol must not swallow a move order"),
      steerTowards: (actor, desired, speed) => moves.push({ desired, speed }),
      steerStraightTowards: (actor, desired, speed) => moves.push({ desired, speed }),
      navigationPhysicalPathClear: () => true,
      smoothAngle: (current, target) => target
    });
    const start = game.indexOf("function updateIndependentSoldier("), end = game.indexOf("\nfunction ", start + 1);
    vm.runInContext(game.slice(start, end), context);
    context.updateIndependentSoldier(unit, { combat: true, peacefulPatrol, dt: 1 / 60 });
    assert.deepEqual(moves[0].desired.toArray(), [6, 0, 2]);
    assert.equal(moves[0].speed, 2.65);
    assert.equal(unit.userData.manualMoving, true);
  }
});

test("EN Swordsman blueprint creates an enemy with the shared animated model", () => {
  const context = vm.createContext({
    COLORS: { amber: 0xffaa00 }, contentBrowserState: { actorModels: {} },
    SWORDSMAN_MODEL_ASSET_ID: "model:ch-swordsman", CHARACTER_MODEL_ASSET_ID: "model:ch",
    resolveContentBrowserModelId: (assetId, fallback) => assetId ?? fallback,
    contentBrowserAssetById: () => null, BASE_BP_ASSET_ID: "base", TILE_BP_ASSET_ID: "tile",
    addEditorCharacter: profile => profile
  });
  const start = game.indexOf("const ACTOR_SPEED_BOOST=");
  vm.runInContext(game.slice(start, game.indexOf("function actorModelCollisionHalf(", start)), context);
  const createStart = game.indexOf("function createEditorAsset(");
  vm.runInContext(game.slice(createStart, game.indexOf("\nfunction ", createStart + 1)), context);
  const profile = context.actorArchetype("en5", "enemy");
  assert.equal(profile.label, "EN Swordsman");
  assert.equal(profile.faction, "enemy");
  assert.equal(profile.maxHp, 32);
  assert.equal(profile.attack, 10);
  assert.ok(Math.abs(profile.moveSpeed - 3.975) < .000001);
  assert.equal(context.actorModelAssetId("en5"), context.actorModelAssetId("ch3"));
  assert.equal(context.actorModelAssetId("en1"), "model:ch");
  const placed = context.createEditorAsset("character:en5", { x: 8, z: 12 }, { recordUndo: false, select: false });
  assert.equal(placed.faction, "enemy");
  assert.equal(placed.archetypeId, "en5");
  assert.equal(placed.x, 8);
  assert.equal(placed.z, 12);
  context.contentBrowserState.actorModels.en5 = "model:custom";
  assert.equal(context.actorModelAssetId("en5"), "model:custom");
  assert.equal(context.actorModelAssetId("ch3"), "model:ch-swordsman");
  assert.match(game, /id:"character:en5",name:"EN Swordsman BP",type:"Actor",folderId:"characters\/en"/);
});

function authoredCombatHarness() {
  const battle = new THREE.Group();
  const context = vm.createContext({
    THREE, battle, followers: [], enemyUnits: [], master: { visible: false, userData: { alive: false } },
    deploymentStarted: false, deploymentReserves: { ch1: 5, ch2: 5 }, activeEncounter: null, celebrationWinnerFaction: null,
    enemyPackAnchor: null, selectedRegion: 2, GROUND_Y: .015, FACTION: { AMBER: "amber" },
    clearPeacefulPatrols: () => { context.patrolClears++; }, patrolClears: 0,
    clearFactionCelebration: () => { context.celebrationWinnerFaction = null; },
    isBarracksDeparting: unit => Boolean(unit.userData.barracksDeparture)
  });
  for (const [startName, endName] of [
    ["function livingPlayerUnits(", "function playerFocus("],
    ["function resumePlayerCelebrationForThreat(", "function activatePlacedCharacterEncounter("],
    ["function activatePlacedCharacterEncounter(", "function detachActorFromCombat("],
    ["function activateFieldedPlayerCombat(", "function updateBattle("]
  ]) {
    const start = game.indexOf(startName), end = game.indexOf(endName, start);
    assert.ok(start >= 0 && end > start);
    vm.runInContext(game.slice(start, end), context);
  }
  return context;
}

test("placed CH variants activate pairing without consuming a deployment reserve", () => {
  for (const archetype of ["ch1", "ch2", "ch3"]) {
    const context = authoredCombatHarness();
    const player = new THREE.Group(), enemy = new THREE.Group();
    player.userData = { alive: true, faction: "player", actorArchetypeId: archetype };
    enemy.userData = { alive: true, faction: "enemy" };
    context.followers.push(player);context.enemyUnits.push(enemy);context.battle.add(player, enemy);
    context.activatePlacedCharacterEncounter();
    assert.equal(context.activeEncounter.aggro, false);
    assert.equal(context.activateFieldedPlayerCombat(), true);
    assert.equal(context.deploymentStarted, true);
    assert.equal(context.activeEncounter.aggro, true);
    assert.equal(context.activeEncounter.forceSoldierEngagement, true);
    assert.deepEqual(context.deploymentReserves, { ch1: 5, ch2: 5 });
    assert.equal(context.activateFieldedPlayerCombat(), false);
    assert.equal(context.patrolClears, 1);
  }
  const start = game.indexOf("function updateBattle(");
  assert.ok(game.indexOf("activateFieldedPlayerCombat();", start) < game.indexOf("const activeEnemyUnits=", start));
});

test("empty levels, dead CH and detached editor actors do not start combat", () => {
  const context = authoredCombatHarness();
  assert.equal(context.activateFieldedPlayerCombat(), false);
  const actor = new THREE.Group();
  actor.userData = { alive: true, faction: "player" };
  context.followers.push(actor);
  assert.equal(context.activateFieldedPlayerCombat(), false);
  context.battle.add(actor);actor.userData.alive = false;
  assert.equal(context.activateFieldedPlayerCombat(), false);
  actor.userData.alive = true;actor.visible = false;
  assert.equal(context.activateFieldedPlayerCombat(), false);
  assert.equal(context.deploymentStarted, false);
});

test("placed CH engages a Barracks EN only after its protected departure ends", () => {
  const context = authoredCombatHarness();
  const player = new THREE.Group(), enemy = new THREE.Group();
  player.userData = { alive: true };enemy.userData = { alive: true, barracksDeparture: {} };
  context.followers.push(player);context.enemyUnits.push(enemy);context.battle.add(player, enemy);
  context.activateFieldedPlayerCombat();
  assert.equal(context.activeEncounter, null);
  enemy.userData.barracksDeparture = null;
  context.activatePlacedCharacterEncounter();
  assert.equal(context.activeEncounter.aggro, true);
});

function soldier(faction = "player") {
  const actor = new THREE.Group();
  actor.userData = { alive: true, attack: 10, faction };
  const visual = cloneAnimatedModel(gltf.scene);
  actor.add(visual);
  attachCharacterAnimation(actor, visual);
  return { actor, visual };
}

test("swordsmen clone independent bones and retain all three exported clips", () => {
  const first = soldier(), second = soldier();
  assert.deepEqual(first.visual.animations.map(clip => clip.name).sort(), ["Attack", "Idle", "Walk"]);
  let firstMesh, secondMesh;
  first.visual.traverse(part => { if (part.isSkinnedMesh) firstMesh ??= part; });
  second.visual.traverse(part => { if (part.isSkinnedMesh) secondMesh ??= part; });
  assert.notEqual(firstMesh.skeleton, secondMesh.skeleton);
  assert.notEqual(firstMesh.skeleton.bones[0], secondMesh.skeleton.bones[0]);
  const untouched = second.visual.getObjectByName("Body");
  const before = untouched.quaternion.clone();
  queueCharacterStrike(first.actor, () => {});
  updateCharacterAnimation(first.actor, .4);
  assert.ok(untouched.quaternion.equals(before));
});

test("walk follows displacement and stops at idle without changing the actor position", () => {
  const walking = soldier(), idle = soldier();
  updateCharacterAnimation(walking.actor, .1);
  updateCharacterAnimation(idle.actor, .1);
  for (let frame = 0; frame < 5; frame++) {
    walking.actor.position.z += .265;
    updateCharacterAnimation(walking.actor, .1);
    updateCharacterAnimation(idle.actor, .1);
  }
  const walkingBody = walking.visual.getObjectByName("Body");
  const idleBody = idle.visual.getObjectByName("Body");
  assert.ok(walkingBody.position.distanceTo(idleBody.position) > .0001 || walkingBody.quaternion.angleTo(idleBody.quaternion) > .0001);
  assert.ok(Math.abs(walking.actor.position.z - 1.325) < .00001);
  for (let frame = 0; frame < 30; frame++) updateCharacterAnimation(walking.actor, .1);
  assert.ok(Math.abs(walking.actor.position.z - 1.325) < .00001);
});

test("sword contact fires once at 0.6 seconds and cannot restart during recovery", () => {
  const { actor } = soldier();
  let contacts = 0;
  queueCharacterStrike(actor, () => contacts++);
  updateCharacterAnimation(actor, .59);
  assert.equal(contacts, 0);
  queueCharacterStrike(actor, () => contacts += 100);
  updateCharacterAnimation(actor, .02);
  assert.equal(contacts, 1);
  updateCharacterAnimation(actor, .7);
  assert.equal(contacts, 1);
  queueCharacterStrike(actor, () => contacts++);
  updateCharacterAnimation(actor, .61);
  assert.equal(contacts, 2);
});

test("enemy swordsman walks and strikes independently from the CH swordsman", () => {
  const enemy = soldier("enemy"), player = soldier();
  updateCharacterAnimation(enemy.actor, .1);
  updateCharacterAnimation(player.actor, .1);
  const playerBody = player.visual.getObjectByName("Body");
  const initialPlayerPose = playerBody.quaternion.clone();
  enemy.actor.position.x += .265;
  assert.equal(updateCharacterAnimation(enemy.actor, .1), true);
  let hits = 0;
  assert.equal(queueCharacterStrike(enemy.actor, () => hits++), true);
  updateCharacterAnimation(enemy.actor, .59);
  assert.equal(hits, 0);
  updateCharacterAnimation(enemy.actor, .02);
  assert.equal(hits, 1);
  assert.ok(playerBody.quaternion.equals(initialPlayerPose));
});

test("pause, death and replacing a model cannot deliver a stale sword hit", () => {
  const { actor } = soldier();
  let contacts = 0;
  queueCharacterStrike(actor, () => contacts++);
  updateCharacterAnimation(actor, 0);
  assert.equal(contacts, 0);
  actor.userData.alive = false;
  updateCharacterAnimation(actor, 1);
  assert.equal(contacts, 0);
  actor.userData.alive = true;
  queueCharacterStrike(actor, () => contacts++);
  attachCharacterAnimation(actor, new THREE.Group());
  assert.equal(updateCharacterAnimation(actor, 1), false);
  assert.equal(contacts, 0);
});

test("animated building strikes damage only the reserved live building at contact", () => {
  const { actor } = soldier();
  const building = { userData: { alive: true, hp: 40 } };
  actor.userData.buildingAttackSlot = { building };
  let distance = .5;
  const context = vm.createContext({ queueCharacterStrike, raidBuildingSurfaceDistance: () => distance, RAID_BUILDING_ATTACK_RANGE: 1, rand: () => 0, showRaidBuildingHealth() {}, raidBuildingDebris() {}, reducedMotion: true, shake: 0, destroyRaidBuilding() {} });
  const start = game.indexOf("function attackRaidBuilding(");
  vm.runInContext(game.slice(start, game.indexOf("function updateRaidBuildingCombat(", start)), context);
  context.attackRaidBuilding(actor, building, .1);
  assert.equal(building.userData.hp, 40);
  updateCharacterAnimation(actor, .61);
  assert.equal(building.userData.hp, 30);
  updateCharacterAnimation(actor, .7);
  actor.userData.buildingAttackCooldown = 0;
  context.attackRaidBuilding(actor, building, .1);
  distance = 5;
  updateCharacterAnimation(actor, .61);
  assert.equal(building.userData.hp, 30);
});
