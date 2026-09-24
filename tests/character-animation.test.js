import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import * as THREE from "../vendor/three.module.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { attachCharacterAnimation, cloneAnimatedModel, queueCharacterStrike, updateCharacterAnimation } from "../src/character-animation.js";
import { activeDuelRingState, arrivalSpeed, choosePatrolGoal, normalizePracticeConfig, smoothAngle, soldierCombatState, SOLDIER_COMBAT_STATE, SERVANT_MODE } from "../src/sim.js";

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
  assert.match(game, /desiredVelocity=forward\.multiplyScalar\(speed\*turnSpeed\)/);
});

test("CH and EN brake and turn gradually rather than slide through a reversal", () => {
  const context = vm.createContext({ THREE, arrivalSpeed, smoothAngle });
  const start = game.indexOf("function steerStraightTowards("), end = game.indexOf("function steerTowards(", start);
  vm.runInContext(game.slice(start, end), context);
  for(const actorArchetypeId of ["ch2", "en1"]){
    const unit = new THREE.Group(), destination = new THREE.Vector3(0, 0, -10);
    unit.userData = { actorArchetypeId, velocity: new THREE.Vector3(0, 0, 2.65) };
    let forwardSlip = 0;
    for(let frame = 0; frame < 12; frame++){
      context.steerStraightTowards(unit, destination, 2.65, 5.4, 1 / 60);
      if(frame === 0)assert.ok(unit.rotation.y < .4, `${actorArchetypeId} turned too fast`);
      forwardSlip = Math.max(forwardSlip, unit.position.z);
    }
    assert.ok(forwardSlip < .25, `${actorArchetypeId} slid ${forwardSlip.toFixed(2)} units away`);
  }
});

test("paired CH and EN follow a sideways route instead of staring at a distant opponent", () => {
  const waypoint = new THREE.Vector3(4, 0, 0);
  const context = vm.createContext({
    THREE, arrivalSpeed, smoothAngle, SOLDIER_COMBAT_STATE, SERVANT_MODE, soldierCombatState,
    DUEL_PHASE: { APPROACH: "approach", LUNGE: "lunge", RECOVER: "recover" }, GROUND_Y: 0,
    advanceDuelState: ({ phase, timer }) => ({ phase, timer, strike: false }),
    duelLungeDirection: () => null,
    standOffPursuitPoint: (_unit, opponent, distance) => ({ x: opponent.x, z: opponent.z - distance }),
    shouldRegroupPlayerGroup: () => false,
    duelPathNeedsRelock: () => false,
    actorSteerAcceleration: (_unit, acceleration) => acceleration,
    editorActorMoveScale: () => 1,
    navigationPhysicalPathClear: () => false
  });
  for (const [startName, endName] of [
    ["function steerStraightTowards(", "function steerTowards("],
    ["function updateDuel(", "function activeTransientParticleCount("],
    ["function updateIndependentSoldier(", "function activateFieldedPlayerCombat("]
  ]) {
    const start = game.indexOf(startName);
    vm.runInContext(game.slice(start, game.indexOf(endName, start)), context);
  }
  context.steerTowards = (unit, _desired, speed, acceleration, dt) => context.steerStraightTowards(unit, waypoint, speed, acceleration, dt);
  const unit = new THREE.Group(), opponent = new THREE.Group();
  unit.userData = { alive: true, actorArchetypeId: "ch2", velocity: new THREE.Vector3() };
  opponent.position.set(0, 0, 8);
  opponent.userData = { alive: true };
  for (let frame = 0; frame < 180; frame++) {
    context.updateIndependentSoldier(unit, { combat: true, foe: opponent, dt: 1 / 60 });
  }
  assert.ok(unit.position.x > 2, `paired CH stalled at x=${unit.position.x.toFixed(2)}`);

  const enemy = new THREE.Group();
  enemy.userData = { alive: true, actorArchetypeId: "en1", lockedTarget: opponent, velocity: new THREE.Vector3() };
  context.combat = true;
  context.peacefulPatrol = false;
  context.enemyPackAnchor = null;
  context.enemyAssignments = new Map([[enemy, opponent]]);
  context.enemyWaitingAssignments = new Map();
  context.livingEnemies = context.livingEnemySoldiers = [enemy];
  context.livingPlayerSoldiers = [opponent];
  context.reviewEnemyDuelTarget = (_enemy, target) => target;
  context.soldierSpacingProfile = () => ({ distance: 1, strength: 1 });
  const enemyLoopStart = game.indexOf("  enemyUnits.forEach((u,i)=>{");
  const enemyStart = game.indexOf("    const committed=", enemyLoopStart);
  const enemyEnd = game.indexOf("\n  });", enemyStart);
  vm.runInContext(`function updateEnemySoldierForTest(u,dt){${game.slice(enemyStart, enemyEnd)}\n}`, context);
  for (let frame = 0; frame < 180; frame++) {
    context.updateEnemySoldierForTest(enemy, 1 / 60);
  }
  assert.ok(enemy.position.x > 2, `paired EN stalled at x=${enemy.position.x.toFixed(2)}`);
});

test("CH orders and both factions' patrols rotate only once per frame", () => {
  const start = game.indexOf("function updateIndependentSoldier("), end = game.indexOf("\nfunction ", start + 1);
  assert.doesNotMatch(game.slice(start, end), /speed>0\?desired:null/);
  for(const [startName, endName] of [
    ["function updateIndependentGroupPatrol(", "function updateIndependentSoldier("],
    ["function updatePeacefulPatrol(", "function clearBuildingAttackSlot("]
  ]){
    const startIndex = game.indexOf(startName);
    assert.doesNotMatch(game.slice(startIndex, game.indexOf(endName, startIndex)), /unit\.rotation\.y=smoothAngle/);
  }
});

test("ordered CH groups have separate destinations without following the leader's trail", () => {
  const context = vm.createContext({ INDEPENDENT_GROUP_COLUMN_GAP: .68 });
  const start = game.indexOf("function compactGroupColumnOffset(");
  const end = game.indexOf("function independentGroupPatrolTarget(", start);
  vm.runInContext(game.slice(start, end), context);
  const leader = context.compactGroupColumnOffset(0), rear = context.compactGroupColumnOffset(4);
  assert.equal(leader.lateral, 0);assert.equal(leader.forward, 0);
  assert.equal(rear.lateral, 0);assert.equal(rear.forward, -2.72);
  const orderStart = game.indexOf("function issueCompanyOrder(");
  const orderEnd = game.indexOf("\nfunction ", orderStart + 1);
  const orderSource = game.slice(orderStart, orderEnd);
  assert.match(orderSource, /const offset=compactGroupColumnOffset\(index\)/);
  assert.match(orderSource, /member\.userData\.manualFinalTarget=destination\.clone\(\)/);
  assert.doesNotMatch(orderSource, /orderTrail/);
  const soldierStart = game.indexOf("function updateIndependentSoldier(");
  const soldierEnd = game.indexOf("\nfunction ", soldierStart + 1);
  assert.match(game.slice(soldierStart, soldierEnd), /desired=u\.userData\.manualTarget\.clone\(\)/);
  assert.doesNotMatch(game.slice(soldierStart, soldierEnd), /manualColumnDestination|recordManualColumnTrail/);
});

test("CH group members keep independently patrolling around their pivot", () => {
  const patrolStart = game.indexOf("function independentGroupPatrolTarget(");
  const patrolEnd = game.indexOf("function updateIndependentGroupPatrol(", patrolStart);
  const patrolSource = game.slice(patrolStart, patrolEnd);
  assert.match(patrolSource, /unit\.userData\.groupPatrolGoal=/);
  assert.match(patrolSource, /INDEPENDENT_GROUP_PATROL_PAUSE_MAX/);
  assert.match(patrolSource, /expiresAt:totalTime\+INDEPENDENT_GROUP_PATROL_DURATION\+rand\(\)/);
  assert.match(patrolSource, /independentGroupPatrolRadii\(grid\)/);
  assert.match(patrolSource, /occupied\.push\(member\.position\)/);
  assert.doesNotMatch(patrolSource, /anchor\.patrolGoal=/);
  const patrolUpdateStart = game.indexOf("function updateIndependentGroupPatrol(");
  const patrolUpdateEnd = game.indexOf("function updateIndependentSoldier(", patrolUpdateStart);
  assert.match(game.slice(patrolUpdateStart, patrolUpdateEnd), /arrivalSpeed=Math\.min\(1,Math\.max\(\.24,distance\/\.58\)\)/);
  const soldierStart = game.indexOf("function updateIndependentSoldier(");
  const soldierEnd = game.indexOf("\nfunction ", soldierStart + 1);
  const soldierSource = game.slice(soldierStart, soldierEnd);
  assert.match(soldierSource, /updateIndependentGroupPatrol\(u,patrolAllies,dt\)/);
  assert.doesNotMatch(soldierSource, /recordManualColumnTrail\(u\)/);
  assert.doesNotMatch(soldierSource, /orderHoldPosition/);
  assert.match(soldierSource, /navigationPhysicalPathClear\(u\.position,desired,u\)/);
  assert.match(soldierSource, /manualOrderTravelGuidance\(u,desired,patrolAllies,speed\)/);
  assert.match(soldierSource, /steerStraightTowards\(u,guidance\?\.target\?\?desired/);
  assert.doesNotMatch(soldierSource, /manualMoving=false;u\.userData\.manualTarget=null;u\.userData\.velocity\.set\(0,0,0\)/);
});

test("a straying CH discards its outward patrol goal and chooses an interior tile", () => {
  const unit = new THREE.Group();
  unit.position.set(3.7, 0, 0);
  unit.userData = { alive: true, companyId: 1, groupPatrolGoal: { x: 4, y: 0, z: 0, revision: 1, expiresAt: 10 } };
  const anchor = { position: new THREE.Vector3(), patrolHome: new THREE.Vector3() };
  const candidates = new Map([["outer", { x: 4, z: 0 }], ["inner", { x: 1.5, z: 0 }]]);
  const context = vm.createContext({
    THREE, GROUND_Y: 0, CH_PATROL_COHESION_RADIUS: 2.4, INDEPENDENT_GROUP_PATROL_RADIUS: 3.2,
    INDEPENDENT_GROUP_PATROL_MIN_DISTANCE: .65, INDEPENDENT_GROUP_PATROL_SEPARATION: .72,
    INDEPENDENT_GROUP_PATROL_DURATION: 4, INDEPENDENT_GROUP_PATROL_PAUSE_MAX: .65,
    INDEPENDENT_GROUP_ARRIVAL_DISTANCE: .16, totalTime: 0, rand: () => .5,
    ensureCompanyLayout: () => [{ groupIndex: 1, soldiers: [unit] }], ensureCompanyAnchor: () => anchor,
    ensureNavigationGrid: () => ({ revision: 1, cells: candidates, blocked: new Set(), cellSize: { x: 1, z: 1 } }),
    navigationPointPhysicallyBlocked: () => false, walkableSupportHeightAt: () => 0,
    choosePatrolGoal: ({ candidates: options }) => options[0] ?? null
  });
  const start = game.indexOf("function independentGroupPatrolRadii(");
  const end = game.indexOf("function updateIndependentGroupPatrol(", start);
  vm.runInContext(game.slice(start, end), context);
  assert.equal(context.independentGroupPatrolTarget(unit, []).x, 0);
  assert.equal(unit.userData.groupPatrolGoal, null);
  unit.position.x = 3.59;
  assert.equal(context.independentGroupPatrolTarget(unit, []).x, 1.5);
  assert.equal(unit.userData.groupPatrolGoal.x, 1.5);
});

test("seven CH have enough nearby tiles to keep patrolling after an order", () => {
  for(const tileSize of [2, 8]){
    const unit = new THREE.Group();
    unit.userData = { alive: true, companyId: 1 };
    const occupiedTiles = [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, 1]];
    const members = [unit, ...occupiedTiles.map(([column, row]) => {
      const member = new THREE.Group();
      member.position.set(column * tileSize, 0, row * tileSize);
      member.userData = { alive: true, companyId: 1 };
      return member;
    })];
    const cells = new Map();
    for(const [column, row] of [[0, 0], ...occupiedTiles, [-1, 1], [1, -1]]){
      cells.set(`${column}:${row}`, { x: column * tileSize, z: row * tileSize });
    }
    let candidateCount = 0;
    const context = vm.createContext({
      THREE, GROUND_Y: 0, CH_PATROL_COHESION_RADIUS: 2.4, INDEPENDENT_GROUP_PATROL_RADIUS: 3.2,
      INDEPENDENT_GROUP_PATROL_MIN_DISTANCE: .65, INDEPENDENT_GROUP_PATROL_SEPARATION: .72,
      INDEPENDENT_GROUP_PATROL_DURATION: 4, INDEPENDENT_GROUP_PATROL_PAUSE_MAX: .65,
      INDEPENDENT_GROUP_ARRIVAL_DISTANCE: .16, totalTime: 0, rand: () => 0,
      ensureCompanyLayout: () => [{ groupIndex: 1, soldiers: members }],
      ensureCompanyAnchor: () => ({ position: new THREE.Vector3(), patrolHome: new THREE.Vector3() }),
      ensureNavigationGrid: () => ({ revision: 1, cells, blocked: new Set(), cellSize: { x: tileSize, z: tileSize } }),
      navigationPointPhysicallyBlocked: () => false, walkableSupportHeightAt: () => 0,
      choosePatrolGoal: options => { candidateCount = options.candidates.length; return choosePatrolGoal(options); }
    });
    const start = game.indexOf("function independentGroupPatrolRadii(");
    const end = game.indexOf("function updateIndependentGroupPatrol(", start);
    vm.runInContext(game.slice(start, end), context);
    for(const member of members){
      const goal = context.independentGroupPatrolTarget(member, members);
      assert.ok(candidateCount >= members.length, `${tileSize}-unit tiles offered only ${candidateCount} patrol cells`);
      assert.ok(goal.distanceTo(member.position) > .8, `${tileSize}-unit tiles returned a CH's current position`);
    }
  }
});

test("a CH moves from its current position to its own destination, then patrols independently", () => {
  const unit = new THREE.Group(), startPoint = new THREE.Vector3(4, 0, 2), finalSlot = new THREE.Vector3(8, 0, 2);
  const leader = new THREE.Group();
  leader.position.set(0, 0, 0);
  leader.userData = { companyId: 1, manualMoving: true };
  unit.position.copy(startPoint);
  unit.userData = { alive: true, companyId: 1, manualMoving: true, manualTarget: finalSlot.clone(), manualFinalTarget: finalSlot.clone(), velocity: new THREE.Vector3() };
  const anchor = { moving: true, patrolGoal: null };
  let patrolCalls = 0, steeredFrom, steeredTo;
  const context = vm.createContext({
    THREE, NAVIGATION_WAYPOINT_REACHED: .22, SOLDIER_COMBAT_STATE, SERVANT_MODE, soldierCombatState,
    shouldRegroupPlayerGroup: () => false,
    ensureCompanyAnchor: () => anchor, livingCompanyMembers: () => [leader, unit], updateIndependentGroupPatrol: () => patrolCalls++,
    actorSteerAcceleration: (_unit, acceleration) => acceleration, editorActorMoveScale: () => 1,
    navigationPhysicalPathClear: () => true, steerStraightTowards: (actor, destination) => { steeredFrom = actor.position.clone(); steeredTo = destination.clone(); }, steerTowards: () => {},
    smoothAngle: (_current, target) => target
  });
  const start = game.indexOf("function updateIndependentSoldier("), end = game.indexOf("\nfunction ", start + 1);
  vm.runInContext(game.slice(start, end), context);
  context.updateIndependentSoldier(unit, { combat: false, peacefulPatrol: true, dt: 1 / 60 });
  assert.equal(steeredFrom.x, startPoint.x);
  assert.equal(steeredTo.x, finalSlot.x);
  assert.equal(unit.userData.manualMoving, true);
  unit.position.copy(finalSlot);
  context.updateIndependentSoldier(unit, { combat: false, peacefulPatrol: true, dt: 1 / 60 });
  assert.equal(unit.userData.manualMoving, false);
  assert.equal(leader.userData.manualMoving, true);
  context.updateIndependentSoldier(unit, { combat: false, peacefulPatrol: true, dt: 1 / 60 });
  assert.equal(patrolCalls, 1);
});

test("ordered CH steer around nearby allies without changing their destinations", () => {
  const context = vm.createContext({ THREE, unitCollisionRadius: () => .29, navigationPhysicalPathClear: () => true });
  const start = game.indexOf("function manualOrderTravelGuidance("), end = game.indexOf("function updateIndependentSoldier(", start);
  assert.ok(start >= 0 && end > start);
  vm.runInContext(game.slice(start, end), context);
  const destination = new THREE.Vector3(8, 0, 0);
  const first = new THREE.Group(), second = new THREE.Group();
  first.position.set(0, 0, 0);second.position.set(1, 0, 0);
  first.userData = { alive: true, companyId: 1, manualTarget: destination.clone() };
  second.userData = { alive: true, companyId: 1, manualTarget: destination.clone() };
  assert.equal(context.manualOrderTravelGuidance(first, destination, []).target.x, destination.x);
  const firstGuidance = context.manualOrderTravelGuidance(first, destination, [second], 3.9), firstTarget = firstGuidance.target;
  assert.ok(Math.abs(firstTarget.z) > .3, "a CH should sidestep before reaching its ally's collider");
  assert.ok(firstGuidance.speedScale < 1, "a CH should slow while steering past a close ally");
  assert.equal(destination.z, 0, "avoidance must not change the assigned destination");
  second.position.set(.15, 0, 0);
  const secondTarget = context.manualOrderTravelGuidance(second, destination, [first]).target;
  assert.ok(firstTarget.z * secondTarget.z < 0, "neighbors in the same lane should pick opposite sides");
  second.position.set(-1, 0, 0);
  assert.equal(context.manualOrderTravelGuidance(first, destination, [second]).target.x, destination.x, "an ally behind should not pull CH backward");
  first.position.set(-1, 0, 0);second.position.set(1, 0, 0);
  first.userData.manualMoving = true;second.userData.manualMoving = true;
  first.userData.manualTarget = new THREE.Vector3(2, 0, 0);
  second.userData.manualTarget = new THREE.Vector3(-2, 0, 0);
  const opposingFirst = context.manualOrderTravelGuidance(first, first.userData.manualTarget, [second], 3.9).target;
  const opposingSecond = context.manualOrderTravelGuidance(second, second.userData.manualTarget, [first], 3.9).target;
  assert.ok(opposingFirst.z * opposingSecond.z < 0, "head-on CH should pass on opposite world-space sides");
});

test("an ordered CH passes a nearby ally without triggering collision correction", () => {
  const context = vm.createContext({ THREE, arrivalSpeed, smoothAngle, unitCollisionRadius: () => .29, navigationPhysicalPathClear: () => true });
  const spacingStart = game.indexOf("function manualOrderTravelGuidance("), spacingEnd = game.indexOf("function updateIndependentSoldier(", spacingStart);
  const steeringStart = game.indexOf("function steerStraightTowards("), steeringEnd = game.indexOf("function steerTowards(", steeringStart);
  vm.runInContext(game.slice(spacingStart, spacingEnd), context);
  vm.runInContext(game.slice(steeringStart, steeringEnd), context);
  const moving = new THREE.Group(), waiting = new THREE.Group(), destination = new THREE.Vector3(5, 0, 0);
  moving.position.set(0, 0, 0);waiting.position.set(1.2, 0, 0);
  moving.userData = { alive: true, actorArchetypeId: "ch2", velocity: new THREE.Vector3() };
  waiting.userData = { alive: true };
  let closest = Infinity, closestFrame = -1, closestPosition = null;
  for(let frame = 0; frame < 120; frame++){
    const guidance = context.manualOrderTravelGuidance(moving, destination, [waiting], 3.9);
    context.steerStraightTowards(moving, guidance.target, 3.9 * guidance.speedScale, 5.1, 1 / 60);
    const separation = moving.position.distanceTo(waiting.position);
    if(separation < closest){closest = separation;closestFrame = frame;closestPosition = moving.position.clone();}
  }
  assert.ok(closest > .55, `CH crossed the ally's space at ${closest.toFixed(2)} units in frame ${closestFrame} (${closestPosition.x.toFixed(2)}, ${closestPosition.z.toFixed(2)})`);
  assert.ok(moving.position.x > 2, "avoidance must still make progress toward the destination");
});

test("two ordered CH keep space on converging paths", () => {
  const context = vm.createContext({ THREE, arrivalSpeed, smoothAngle, unitCollisionRadius: () => .29, navigationPhysicalPathClear: () => true });
  const spacingStart = game.indexOf("function manualOrderTravelGuidance("), spacingEnd = game.indexOf("function updateIndependentSoldier(", spacingStart);
  const steeringStart = game.indexOf("function steerStraightTowards("), steeringEnd = game.indexOf("function steerTowards(", steeringStart);
  vm.runInContext(game.slice(spacingStart, spacingEnd), context);
  vm.runInContext(game.slice(steeringStart, steeringEnd), context);
  const first = new THREE.Group(), second = new THREE.Group();
  first.position.set(-1, 0, -.45);second.position.set(0, 0, .45);
  const firstDestination = new THREE.Vector3(5, 0, 0), secondDestination = new THREE.Vector3(4.32, 0, 0);
  first.userData = { alive: true, actorArchetypeId: "ch2", manualMoving: true, manualTarget: firstDestination, moveSpeed: 3.9, velocity: new THREE.Vector3() };
  second.userData = { alive: true, actorArchetypeId: "ch2", manualMoving: true, manualTarget: secondDestination, moveSpeed: 3.9, velocity: new THREE.Vector3() };
  let closest = Infinity;
  for(let frame = 0; frame < 180; frame++){
    for(const [unit, destination, ally] of [[first, firstDestination, second], [second, secondDestination, first]]){
      const guidance = context.manualOrderTravelGuidance(unit, destination, [ally], 3.9);
      context.steerStraightTowards(unit, guidance.target, 3.9 * guidance.speedScale, 5.1, 1 / 60);
    }
    closest = Math.min(closest, first.position.distanceTo(second.position));
  }
  assert.ok(closest > .55, `converging CH entered each other's space at ${closest.toFixed(2)} units`);
  assert.ok(first.position.x > 2 && second.position.x > 2, "both CH should keep advancing independently");
});

test("ordered CH maintain a compact moving group while avoiding overlaps", () => {
  const context = vm.createContext({ THREE, arrivalSpeed, smoothAngle, unitCollisionRadius: () => .29, navigationPhysicalPathClear: () => true });
  const spacingStart = game.indexOf("function manualOrderTravelGuidance("), spacingEnd = game.indexOf("function updateIndependentSoldier(", spacingStart);
  const steeringStart = game.indexOf("function steerStraightTowards("), steeringEnd = game.indexOf("function steerTowards(", steeringStart);
  vm.runInContext(game.slice(spacingStart, spacingEnd), context);
  vm.runInContext(game.slice(steeringStart, steeringEnd), context);
  const units = Array.from({ length: 5 }, (_, index) => {
    const unit = new THREE.Group();
    unit.position.set(-index * .68, 0, 0);
    unit.userData = { alive: true, actorArchetypeId: "ch2", manualMoving: true, manualTarget: new THREE.Vector3(6 - index * .68, 0, 0), moveSpeed: 3.9, velocity: new THREE.Vector3() };
    return unit;
  });
  let spread = 0, closest = Infinity;
  for(let frame = 0; frame < 90; frame++){
    for(const [index, unit] of units.entries()){
      const destination = unit.userData.manualTarget;
      const guidance = context.manualOrderTravelGuidance(unit, destination, units, 3.9);
      context.steerStraightTowards(unit, guidance.target, 3.9 * guidance.speedScale, 5.1, 1 / 60);
    }
    spread = Math.max(...units.map(unit => unit.position.x)) - Math.min(...units.map(unit => unit.position.x));
    for(let first = 0; first < units.length; first++)for(let second = first + 1; second < units.length; second++)closest = Math.min(closest, units[first].position.distanceTo(units[second].position));
  }
  assert.ok(spread < 4, `CH stretched ${spread.toFixed(2)} units apart on a shared order`);
  assert.ok(closest > .55, `CH overlapped while travelling in a group at ${closest.toFixed(2)} units`);
});

test("a CH near the pivot keeps moving until it reaches its own destination", () => {
  const unit = new THREE.Group(), pivot = new THREE.Vector3(.3, 0, 0), finalSlot = new THREE.Vector3(4, 0, 0);
  unit.position.set(1.5, 0, 0);
  unit.userData = { alive: true, companyId: 1, manualMoving: true, manualTarget: finalSlot.clone(), manualFinalTarget: finalSlot.clone(), velocity: new THREE.Vector3() };
  const anchor = { moving: true, patrolHome: pivot, patrolGoal: null };
  let patrolCalls = 0;
  const context = vm.createContext({
    THREE, NAVIGATION_WAYPOINT_REACHED: .22, CH_PATROL_COHESION_RADIUS: 2.4,
    SOLDIER_COMBAT_STATE, SERVANT_MODE, soldierCombatState,
    shouldRegroupPlayerGroup: () => false,
    ensureCompanyAnchor: () => anchor, updateIndependentGroupPatrol: () => patrolCalls++,
    actorSteerAcceleration: (_unit, acceleration) => acceleration, editorActorMoveScale: () => 1,
    navigationPhysicalPathClear: () => true, steerStraightTowards: () => {}, steerTowards: () => {},
    smoothAngle: (_current, target) => target
  });
  const start = game.indexOf("function updateIndependentSoldier("), end = game.indexOf("\nfunction ", start + 1);
  vm.runInContext(game.slice(start, end), context);
  context.updateIndependentSoldier(unit, { combat: false, peacefulPatrol: true, dt: 1 / 60 });
  assert.equal(unit.userData.manualMoving, true);
  unit.position.copy(finalSlot);
  context.updateIndependentSoldier(unit, { combat: false, peacefulPatrol: true, dt: 1 / 60 });
  assert.equal(unit.userData.manualMoving, false);
  context.updateIndependentSoldier(unit, { combat: false, peacefulPatrol: true, dt: 1 / 60 });
  assert.equal(patrolCalls, 1);
});

test("patrol keeps CH and EN close to their own group", () => {
  assert.match(game, /CH_PATROL_COHESION_RADIUS=2\.4/);
  assert.match(game, /patrolCohesionTarget\(\{unit:unit\.position,center:pivot,desired:patrolTarget,radius:independentGroupPatrolRadii\(\)\.cohesion\}\)/);
  const enemyPatrolStart = game.indexOf("function enemyRoamDestination(");
  const enemyPatrolEnd = game.indexOf("function peacefulPatrolDestination(", enemyPatrolStart);
  const enemyPatrolSource = game.slice(enemyPatrolStart, enemyPatrolEnd);
  assert.match(enemyPatrolSource, /anchorRadius:EN_PATROL_ANCHOR_RADIUS/);
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
