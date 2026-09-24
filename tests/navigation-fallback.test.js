import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import * as THREE from "three";

const source = readFileSync(new URL("../game.js", import.meta.url), "utf8");

function navigationPathHarness({ route = null, directClear = false } = {}) {
  const context = vm.createContext({
    THREE,
    totalTime: 1,
    NAVIGATION_GOAL_REPATH_DISTANCE: .72,
    NAVIGATION_WAYPOINT_REACHED: .22,
    ensureNavigationGrid: () => ({
      walkable: new Set(["0:0"]),
      revision: 1,
      cellSize: { x: 1, z: 1 },
      offset: { x: 0, z: 0 }
    }),
    navigationGoalKey: (_desired, goalKey) => goalKey ?? "goal",
    navigationPathBlockedCells: () => new Set(),
    navigationTrafficCosts: () => new Map(),
    findNavigationPath: () => route,
    navigationPhysicalPathClear: () => directClear,
    navigationPointFullySupported: () => true,
    navigationPointPhysicallyBlocked: () => false,
    navigationCellKey: cell => `${cell.x}:${cell.z}`,
    navigationPointWalkable: () => true
  });
  const start = source.indexOf("function navigationPathDesired(");
  const end = source.indexOf("function navigationYieldDesired", start);
  vm.runInContext(source.slice(start, end), context);
  return context;
}

test("a clear physical duel route survives a missing grid path", () => {
  const context = navigationPathHarness({ directClear: true });
  const unit = { position: new THREE.Vector3(0, 0, 0), userData: {} };
  const desired = new THREE.Vector3(10, 0, 0);

  const result = context.navigationPathDesired(unit, desired, { goalKey: "duel:target" });

  assert.equal(result, desired);
  assert.equal(unit.userData.navigationPath.directFallback, true);
  assert.equal(unit.userData.navigationPath.failed, false);
});

test("a blocked physical route remains a failed grid route", () => {
  const context = navigationPathHarness({ directClear: false });
  const unit = { position: new THREE.Vector3(0, 0, 0), userData: {} };
  const desired = new THREE.Vector3(10, 0, 0);

  const result = context.navigationPathDesired(unit, desired, { goalKey: "duel:target" });

  assert.notEqual(result, desired);
  assert.equal(unit.userData.navigationPath.directFallback, false);
  assert.equal(unit.userData.navigationPath.failed, true);
});

test("manual commands use the shared navigation grid", () => {
  assert.doesNotMatch(source, /\bCOMMAND_CELL\b/);
  assert.match(source, /function addTacticalCommandGrid\(\)/);
  assert.match(source, /const cell=deploymentCellFromPoint\(point\);\s*if\(!cell\)\{showToast\(STR\.blockedGround,1000\);/);
  assert.match(source, /const cell=deploymentCellFromPoint\(p\);\s*if\(\(!cell&&!commandHoverCell\)/);
});
