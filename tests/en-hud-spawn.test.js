import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import * as THREE from "three";

const source = readFileSync(new URL("../game.js", import.meta.url), "utf8");

function spawnHarness() {
  const cells = [
    { x: 90, y: 0, z: 133 },
    { x: 92, y: 0, z: 133 },
    { x: 94, y: 0, z: 133 },
    { x: 90, y: 0, z: 135 },
    { x: 92, y: 0, z: 135 },
    { x: 94, y: 0, z: 135 }
  ];
  const navigationCellKey = cell => `${cell.x}:${cell.z}`;
  const grid = {
    cells: new Map(cells.map(cell => [navigationCellKey(cell), cell])),
    walkable: new Set(cells.map(navigationCellKey)),
    blocked: new Set()
  };
  const calls = [];
  const context = vm.createContext({
    THREE,
    GROUND_Y: -4.3,
    ACTOR_FOOT_CLEARANCE: .04,
    ensureNavigationGrid: () => grid,
    navigationCellKey,
    navigationGridCellFromPoint(point) {
      return grid.cells.get(`${point.x}:${point.z}`) ?? null;
    },
    walkableSupportHeightAt: () => null,
    normalizeHudWidgetSettings: settings => ({ spawnCount: settings.spawnCount }),
    hudWidgetArchetype: () => ({ id: "en4", faction: "enemy", label: "EN 4" }),
    hudWidgetSpawnSource: () => ({ id: "character:en4", archetypeId: "en4", label: "EN 4", isCopy: false }),
    applyHudSpawnAsset: unit => unit,
    scatteredPackOffset: (index, count) => ({ lateral: index - (count - 1) / 2, forward: 0 }),
    rand: () => .5,
    makeUnit: () => new THREE.Group(),
    battle: { add: unit => calls.push(["add", unit]) },
    enemyUnits: [],
    assignEnemyPatrolGroup: units => calls.push(["patrol", units]),
    celebrationWinnerFaction: null,
    clearFactionCelebration: () => calls.push(["clear-celebration"]),
    activatePlacedCharacterEncounter: options => calls.push(["activate", options]),
    updateStats: () => calls.push(["stats"]),
    showToast: text => calls.push(["toast", text])
  });
  const start = source.indexOf("function spawnHudEnemies(");
  const end = source.indexOf("function ensureDefaultHudWidgets()", start);
  assert.notEqual(start, -1, "EN HUD spawning must remain isolated for regression coverage");
  assert.notEqual(end, -1, "EN HUD spawning must end before HUD defaults");
  vm.runInContext(source.slice(start, end), context);
  return { context, grid, navigationCellKey, calls };
}

test("EN HUD spawns outside a base resolve onto walkable base tiles", () => {
  const { context, grid, navigationCellKey, calls } = spawnHarness();
  const widget = new THREE.Group();
  widget.position.set(83.637, 0, 127.858);
  widget.userData = { hudVisible: true, hudSpawnCount: 3 };

  assert.equal(context.spawnHudEnemies(widget), true);
  assert.equal(context.enemyUnits.length, 3);
  assert.ok(context.enemyUnits.every(unit => grid.walkable.has(navigationCellKey(unit.position))), "every EN must spawn on a walkable base tile");
  assert.equal(calls.find(([type]) => type === "activate")?.[1]?.engageImmediately, true);
});

test("EN HUD uses the chosen deployment tile instead of the HUD position", () => {
  const { context } = spawnHarness();
  const widget = new THREE.Group();
  widget.position.set(90, 0, 133);
  widget.userData = { hudVisible: true, hudSpawnCount: 1 };
  assert.equal(context.spawnHudEnemies(widget, { x: 94, z: 135 }), true);
  assert.equal(context.enemyUnits[0].position.x, 94);
  assert.equal(context.enemyUnits[0].position.z, 135);
});

test("EN deployment does not scan enemy occupancy during combat", () => {
  let scans = 0;
  const renderer = { entries: [{}], occupiedKeys: new Set(), hoverFill: {}, hoverOutline: {} };
  const context = vm.createContext({
    mode: "playing", deploymentPlacementReady: true, enemyDeploymentWidget: {}, deploymentPreviewOccupancySignature: "",
    ensureDeploymentPreviewRenderer: () => renderer,
    deploymentEnemyOccupancySnapshot: () => { scans++; return { keys: new Set(), signature: "", grid: { revision: 1 } }; },
    updateDeploymentPreviewOccupied: () => {}, updateDeploymentPreviewHover: () => {}
  });
  const start = source.indexOf("function addDeploymentPreviewGrid(");
  const end = source.indexOf("function addTacticalCommandGrid(", start);
  vm.runInContext(source.slice(start, end), context);
  const updateStart = source.indexOf("function updateDeploymentEnemyOccupancy(");
  const updateEnd = source.indexOf("function toggleEnemyDeployment(", updateStart);
  vm.runInContext(source.slice(updateStart, updateEnd), context);
  context.addDeploymentPreviewGrid([]);
  context.updateDeploymentEnemyOccupancy();
  assert.equal(scans, 0, "EN deployment can target occupied ground and should not scan every enemy against every tile");
});
