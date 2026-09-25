import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import vm from "node:vm";
import * as THREE from "three";
import { GLTFLoader } from "../vendor/loaders/GLTFLoader.js";
import { queueCharacterStrike } from "../src/character-animation.js";
import { BASE_MATERIAL_PRESETS, applyBaseMaterial } from "../src/base-materials.js";

const source = readFileSync(new URL("../game.js", import.meta.url), "utf8");
const indexSource = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const gltfExporterSource = readFileSync(new URL("../vendor/exporters/GLTFExporter.js", import.meta.url), "utf8");

function tileGeometryHarness() {
  const context = vm.createContext({ THREE });
  const start = source.indexOf("const WORLD_FLOOR_BASE_SIZE=64");
  const end = source.indexOf("const islandSideMaterial=", start);
  vm.runInContext(source.slice(start, end), context);
  return context;
}

function raidBuildingCombatHarness() {
  const context = vm.createContext({
    THREE,
    GROUND_Y: .015,
    totalTime: 0,
    navigationLiveUnits: () => [],
    navigationPointWalkable: point => point.walkable,
    navigationPointFullySupported: point => point.supported !== false,
    navigationPointPhysicallyBlocked: point => point.physicallyBlocked === true,
    navigationObstacleContains(point, obstacle, clearance = 0) {
      return Math.abs(point.x - obstacle.x) <= obstacle.half.x + clearance
        && Math.abs(point.z - obstacle.z) <= obstacle.half.z + clearance;
    },
    raidBuildingCollisionHalf: () => ({ x: 1, z: 1 }),
    raidBuildingCollisionFootprints(building) {
      return building?.userData?.collisionFootprints ?? [{ object: building, x: 0, z: 0, half: { x: 1, z: 1 }, rotation: 0 }];
    },
    raidBuildingWorldPoint: (_building, point) => ({ ...point, clone() { return { ...this }; } }),
    RAID_BUILDING_WAIT_SLOTS_PER_RING: 12,
    RAID_BUILDING_WAIT_CLEARANCE: 1.3,
    RAID_BUILDING_WAIT_RING_GAP: .8,
    RAID_BUILDING_ATTACK_SLOT_BUFFER: .025,
    RAID_BUILDING_ATTACK_APPROACH_DISTANCE: .72,
    NAVIGATION_WAYPOINT_REACHED: .22,
    unitCollisionRadius: unit => unit?.userData?.collisionRadius ?? .29,
    navigationGrid: { revision: 1 },
    ensureNavigationGrid() { return context.navigationGrid; }
  });
  const start = source.indexOf("function clearBuildingAttackSlot");
  const end = source.indexOf("function raidBuildingDebris", start);
  vm.runInContext(source.slice(start, end), context);
  return context;
}

function raidBuildingUpdateHarness() {
  const context = vm.createContext({
    THREE,
    queueCharacterStrike,
    GROUND_Y: .015,
    totalTime: 0,
    navigationLiveUnits: () => [],
    navigationPointWalkable: () => true,
    navigationPointFullySupported: () => true,
    navigationPointPhysicallyBlocked: () => false,
    navigationObstacleContains: () => false,
    raidBuildingCollisionHalf: () => ({ x: 1, z: 1 }),
    raidBuildingCollisionFootprints: () => [{ x: 0, z: 0, half: { x: 1, z: 1 }, rotation: 0 }],
    raidBuildingWorldPoint: (_building, point) => new THREE.Vector3(point.x, point.y ?? .015, point.z),
    RAID_BUILDING_WAIT_SLOTS_PER_RING: 12,
    RAID_BUILDING_WAIT_CLEARANCE: 1.3,
    RAID_BUILDING_WAIT_RING_GAP: .8,
    RAID_BUILDING_ATTACK_RANGE: .36,
    RAID_BUILDING_ATTACK_SLOT_BUFFER: .025,
    RAID_BUILDING_ATTACK_APPROACH_DISTANCE: .72,
    NAVIGATION_WAYPOINT_REACHED: .22,
    unitCollisionRadius: () => .29,
    navigationGrid: { revision: 1 },
    ensureNavigationGrid() { return context.navigationGrid; },
    activeRaidBuildings: () => [],
    nearestAlive: () => null,
    editorActorMoveScale: () => 1,
    actorSteerAcceleration: (_unit, value) => value,
    steerTowards: () => {},
    steerStraightTowards: () => {},
    navigationPhysicalPathClear: () => true,
    particleBudgetAllows: () => false,
    activeTransientParticleCount: () => 0,
    MAX_ACTIVE_PARTICLES: 0,
    particles: [],
    battle: { add() {} },
    rand: () => .5,
    reducedMotion: false,
    shake: 0,
    showRaidBuildingHealth: () => {},
    invalidateNavigation: () => {},
    smoothAngle: (_current, target) => target
  });
  const start = source.indexOf("function clearBuildingAttackSlot");
  const end = source.indexOf("// The player starts", start);
  vm.runInContext(source.slice(start, end), context);
  return context;
}

function navigationTargetChannelHarness() {
  const context = vm.createContext({
    NAVIGATION_AGENT_CLEARANCE: .36,
    unitCollisionRadius: () => .29,
    unitIgnoresNavigationObstacle(unit, obstacle) {
      return unit?.userData?.barracksDeparture?.barracks === obstacle?.object;
    },
    navigationCellKey: point => `${point.x}:${point.z}`,
    navigationObstacleContains(point, obstacle, clearance = 0) {
      return Math.abs(point.x - obstacle.x) <= obstacle.half.x + clearance
        && Math.abs(point.z - obstacle.z) <= obstacle.half.z + clearance;
    },
    ensureNavigationGrid() { return context.navigationGrid; }
  });
  const start = source.indexOf("function navigationPointPhysicallyBlocked");
  const end = source.indexOf("function navigationPathDesired", start);
  vm.runInContext(source.slice(start, end), context);
  return context;
}

function modelCollisionFootprintHarness(cellSize = .34) {
  const context = vm.createContext({ THREE, COLLISION_FOOTPRINT_CELL_SIZE: cellSize });
  const start = source.indexOf("function isCrownwakeCollisionNode(");
  const end = source.indexOf("\nfunction groundContentBrowserModelVisual", start);
  assert.notEqual(start, -1, "building models must derive collision from their visible mesh footprint");
  assert.notEqual(end, -1, "building footprint helpers must stay isolated from visual grounding");
  vm.runInContext(source.slice(start, end), context);
  return context;
}

function barracksSpawnRouteHarness() {
  const context = vm.createContext({
    THREE,
    GROUND_Y: .015,
    ACTOR_FOOT_CLEARANCE: .04,
    BARRACKS_ENEMY_SPAWN_INSIDE_MARKER: "CROWNWAKE_EN_SPAWN_INSIDE",
    BARRACKS_ENEMY_SPAWN_EXIT_MARKER: "CROWNWAKE_EN_SPAWN_EXIT",
    walkableSupportHeightAt: () => .015
  });
  const start = source.indexOf("function isBarracksDeparting(");
  const end = source.indexOf("\nfunction barracksClearExitPoint", start);
  assert.notEqual(start, -1, "Barracks exits must track a departure state");
  assert.notEqual(end, -1, "Barracks spawn routes must stay separate from collision clearance");
  vm.runInContext(source.slice(start, end), context);
  return context;
}

function authoredBarracksDepartureHarness() {
  const context = vm.createContext({
    THREE,
    GROUND_Y: .015,
    ACTOR_FOOT_CLEARANCE: .04,
    BARRACKS_ENEMY_EXIT_DURATION: 1.15,
    BARRACKS_ENEMY_DOORWAY_PROGRESS: .68,
    BARRACKS_ENEMY_SPAWN_INSIDE_MARKER: "CROWNWAKE_EN_SPAWN_INSIDE",
    BARRACKS_ENEMY_SPAWN_EXIT_MARKER: "CROWNWAKE_EN_SPAWN_EXIT",
    walkableSupportHeightAt: () => .015,
    navigationPointFullySupported: () => true,
    navigationPointPhysicallyBlocked: () => false,
    navigationObstacleContains(point, obstacle, clearance = 0) {
      return Math.abs(point.x - obstacle.x) <= obstacle.half.x + clearance
        && Math.abs(point.z - obstacle.z) <= obstacle.half.z + clearance;
    },
    unitCollisionRadius: () => .29,
    raidBuildingCollisionFootprints(building) {
      return building.userData.collisionFootprints ?? [];
    },
    raidBuildingCollisionHalf(building) {
      return { x: building.userData.collisionHalf.x * Math.abs(building.scale.x), z: building.userData.collisionHalf.z * Math.abs(building.scale.z) };
    },
    raidBuildingLocalPoint(building, point) {
      const cosine = Math.cos(building.rotation.y), sine = Math.sin(building.rotation.y), offsetX = point.x - building.position.x, offsetZ = point.z - building.position.z;
      return { x: cosine * offsetX - sine * offsetZ, z: sine * offsetX + cosine * offsetZ };
    },
    editorObjects: [],
    enemyUnits: []
  });
  const start = source.indexOf("function isBarracksDeparting(");
  const end = source.indexOf("\nfunction barracksAnchorSlotPoint", start);
  assert.notEqual(start, -1, "Barracks interior departure helpers must be present");
  assert.notEqual(end, -1, "Barracks departure setup must stay separate from anchor selection");
  vm.runInContext(source.slice(start, end), context);
  return context;
}

function barracksDepartureHarness() {
  const context = vm.createContext({
    THREE,
    BARRACKS_ENEMY_EXIT_DURATION: 1.15,
    BARRACKS_ENEMY_DOORWAY_PROGRESS: .68,
    smoothAngle: (_current, target) => target,
    assignBarracksAnchor: () => null,
    activatePlacedCharacterEncounter: () => false
  });
  const start = source.indexOf("function updateBarracksDeparture(unit,dt){");
  const end = source.indexOf("\nfunction spawnBarracksEnemy", start);
  assert.notEqual(start, -1, "Barracks departure must animate from the authored doorway");
  assert.notEqual(end, -1, "Barracks spawning must stay separate from the departure animation");
  vm.runInContext(source.slice(start, end), context);
  return context;
}

test("island cliff has no top face competing with the editable tile surface", () => {
  const context = tileGeometryHarness();
  const geometry = vm.runInContext("islandSideGeometry", context);
  const normals = geometry.getAttribute("normal");
  const topIndices = Array.from(geometry.index.array).filter(index => normals.getY(index) > .5);
  assert.equal(topIndices.length, 0);
});

test("tile geometry and preview lines follow independent row and column counts", () => {
  const context = tileGeometryHarness();
  const surface = context.tileFloorGeometry(7, 8);
  const grid = context.tileGridGeometry(7, 8);
  assert.equal(surface.getAttribute("position").count, 8 * 9);
  assert.equal(grid.getAttribute("position").count, (8 + 9) * 2);
});

test("tile size makes every spawned box equal while rows and columns set its footprint", () => {
  const context = tileGeometryHarness();
  const surface = context.tileFloorGeometry(3, 4, 6);
  surface.computeBoundingBox();
  const size = surface.boundingBox.getSize(new THREE.Vector3());
  assert.equal(size.x, 24);
  assert.equal(size.z, 18);
});

test("Tile_bp is a placeable blueprint that creates persisted tile spawners", () => {
  assert.match(source, /if\(assetId===TILE_BP_ASSET_ID\)\{const spawner=addTileSpawner\(/);
  assert.match(source, /record\.type==="tile-spawner"\)return applySavedEditorMaterial\(addTileSpawner\(record\),record\)/);
  assert.match(source, /\{id:TILE_BP_ASSET_ID,name:"Tile_bp",type:"Blueprint",folderId:"bp_gn",preview/);
});

test("Crownwake Base has a reusable grid blueprint with its baked model", () => {
  assert.equal(existsSync(new URL("../Models/Crownwake_Base.glb", import.meta.url)), true);
  assert.match(source, /CROWNWAKE_BASE_MODEL_ASSET_ID="model:crownwake-base"/);
  assert.match(source, /BASE_BP_ASSET_ID="blueprint:base"/);
  assert.match(source, /crownwakeBase:\s*\["\.\/Models\/Crownwake_Base\.glb",\s*64\]/);
  assert.match(source, /id:BASE_BP_ASSET_ID,name:"Crownwake Base",type:"Blueprint",folderId:"bp_gn\/base",tileBlueprint:true/);
  assert.match(source, /tileBlueprintAssetId=BASE_BP_ASSET_ID/);
  assert.match(source, /tileModelAssetId=CROWNWAKE_BASE_MODEL_ASSET_ID/);
  assert.match(indexSource, /id="editor-tile-size"/);
});

test("Boolean Box subtracts persistent cells from placeable Base_bp tiles", () => {
  assert.match(source, /BOOLEAN_BOX_BP_ASSET_ID="blueprint:boolean-box"/);
  assert.match(source, /id:BOOLEAN_BOX_BP_ASSET_ID,name:"Boolean Box",type:"Blueprint",folderId:"bp_gn\/base"/);
  assert.match(source, /function addBooleanBox\(/);
  assert.match(source, /function applyBooleanBox\(/);
  assert.match(source, /booleanCutCells/);
  assert.match(source, /function baseGameplayGridSpecs\(/);
  assert.match(indexSource, /id="inspector-boolean-section"/);
  assert.match(indexSource, /id="editor-boolean-apply"/);
});

test("permanent tile-grid lines are hidden by default", () => {
  assert.match(source, /islandGrid\.name="Island Tile Grid";islandGrid\.visible=false;/);
  assert.match(source, /grid\.name="Tile Grid";grid\.visible=false;/);
});

test("legacy raw Crownwake Base imports restore as the reusable Base_bp", () => {
  const context = vm.createContext({
    CROWNWAKE_BASE_MODEL_ASSET_ID: "model:crownwake-base",
    BASE_BP_ASSET_ID: "blueprint:base",
    BASE_BP_DEFAULT_ROWS: 32,
    BASE_BP_DEFAULT_COLUMNS: 32,
    BASE_BP_DEFAULT_SIZE: 2,
    contentBrowserState: { importedModels: [] },
    normalizeTileDimension: (value, fallback) => value ?? fallback,
    normalizeTileSize: (value, fallback) => value ?? fallback
  });
  const start = source.indexOf("function isCrownwakeBaseModelAsset(");
  const end = source.indexOf("function levelAssetRecord(", start);
  assert.notEqual(start, -1, "legacy Base imports must be recognized");
  assert.notEqual(end, -1, "legacy Base conversion must stay independent from level serialization");
  vm.runInContext(source.slice(start, end), context);

  const converted = vm.runInContext(`migratedCrownwakeBaseRecord({
    type: "imported-model",
    importedModelAssetId: "model:crownwake-base",
    materialSlot: "__embedded__",
    materialColor: "#ffffff",
    x: 86.93,
    y: .015,
    z: 136.87,
    rotation: [0, 0, 0],
    scale: [1, 1, 1]
  })`, context);

  assert.equal(vm.runInContext('isCrownwakeBaseModelAsset("model:crownwake-base")', context), true);
  assert.equal(converted.type, "tile-spawner");
  assert.equal(converted.tileBlueprintAssetId, "blueprint:base");
  assert.deepEqual([converted.tileRows, converted.tileColumns, converted.tileSize], [32, 32, 2]);
  assert.equal("importedModelAssetId" in converted, false);
  assert.match(source, /migratedBaseModel=true/);
  assert.match(source, /if\(layout\.version===LEGACY_LEVEL_LAYOUT_VERSION\|\|migratedBaseModel\)saveLevelLayout\(\)/);
});

test("Base_bp preserves its imported model fit while scaling the shared grid", () => {
  const context = vm.createContext({
    THREE,
    TILE_BP_DEFAULT_ROWS: 5,
    TILE_BP_DEFAULT_COLUMNS: 5,
    TILE_BP_DEFAULT_SIZE: 8,
    BASE_BP_DEFAULT_ROWS: 32,
    BASE_BP_DEFAULT_COLUMNS: 32,
    BASE_BP_DEFAULT_SIZE: 2,
    BASE_BP_ASSET_ID: "blueprint:base",
    tileBlueprintAssetId: tile => tile.userData.tileBlueprintAssetId,
    isBaseTileBlueprint: tile => tile.userData.tileBlueprintAssetId === "blueprint:base"
  });
  const normalizeStart = source.indexOf("function normalizeTileDimension(");
  const normalizeEnd = source.indexOf("function tileBlueprintAssetId(", normalizeStart);
  const dimensionsStart = source.indexOf("function tileBlueprintDefaults(");
  const dimensionsEnd = source.indexOf("function tileSurface(", dimensionsStart);
  const fitStart = source.indexOf("function fitTileSpawnerModel(");
  const fitEnd = source.indexOf("function refreshTileGrid(", fitStart);
  assert.notEqual(normalizeStart, -1);
  assert.notEqual(normalizeEnd, -1);
  assert.notEqual(dimensionsStart, -1);
  assert.notEqual(dimensionsEnd, -1);
  assert.notEqual(fitStart, -1);
  assert.notEqual(fitEnd, -1);
  vm.runInContext(source.slice(normalizeStart, normalizeEnd), context);
  vm.runInContext(source.slice(dimensionsStart, dimensionsEnd), context);
  vm.runInContext(source.slice(fitStart, fitEnd), context);

  const base = new THREE.Group();
  base.userData = { tileBlueprintAssetId: "blueprint:base", tileRows: 32, tileColumns: 32, tileSize: 2 };
  const visual = new THREE.Group();
  visual.name = "Base Model";
  visual.userData.groundModelSize = 64;
  visual.scale.set(5.333, 5.333, 5.333);
  visual.position.set(2.6665, 0, .79995);
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(10, 1, 10));
  mesh.position.set(-.5, 0, -.15);
  visual.add(mesh);
  base.add(visual);

  const modelCenter = () => {
    base.updateWorldMatrix(true, true);
    return new THREE.Box3().setFromObject(visual).getCenter(new THREE.Vector3());
  };

  context.fitTileSpawnerModel(base);
  assert.deepEqual(visual.scale.toArray().map(value => Number(value.toFixed(3))), [5.333, 5.333, 5.333]);
  assert.deepEqual(modelCenter().toArray().map(value => Number(value.toFixed(6))), [0, 0, 0]);

  base.userData.tileColumns = 16;
  base.userData.tileRows = 24;
  context.fitTileSpawnerModel(base);
  assert.deepEqual(visual.scale.toArray().map(value => Number(value.toFixed(3))), [2.667, 2.667, 4]);
  assert.deepEqual(modelCenter().toArray().map(value => Number(value.toFixed(6))), [0, 0, 0]);
});

function baseGridAuthorityHarness() {
  const context = vm.createContext({
    THREE,
    TILE_BP_ASSET_ID: "blueprint:tile",
    BASE_BP_ASSET_ID: "blueprint:base",
    TILE_BP_DEFAULT_ROWS: 5,
    TILE_BP_DEFAULT_COLUMNS: 5,
    TILE_BP_DEFAULT_SIZE: 8,
    BASE_BP_DEFAULT_ROWS: 32,
    BASE_BP_DEFAULT_COLUMNS: 32,
    BASE_BP_DEFAULT_SIZE: 2
  });
  const start = source.indexOf("function normalizeTileDimension(");
  const end = source.indexOf("function tileSurface(", start);
  assert.notEqual(start, -1, "Base grid dimensions must stay near the tile helpers");
  assert.notEqual(end, -1, "Base local cells must stay independent from mesh lookup");
  vm.runInContext(source.slice(start, end), context);
  return context;
}

test("Base_bp derives exact navigation cells from its local rows and columns", () => {
  const context = baseGridAuthorityHarness();
  const base = new THREE.Group();
  base.userData = {
    tileBlueprintAssetId: "blueprint:base",
    sharedGameplayGrid: true,
    tileRows: 3,
    tileColumns: 4,
    tileSize: 2
  };
  base.position.set(9, .25, -6);
  base.rotation.y = Math.PI * .5;
  base.updateWorldMatrix(true, true);

  const spec = context.baseGameplayGridSpec(base);
  const xValues = [...new Set(spec.cells.map(cell => cell.x))];
  const zValues = [...new Set(spec.cells.map(cell => cell.z))];
  const spans = [
    Number((Math.max(...xValues) - Math.min(...xValues) + spec.cellSize.x).toFixed(6)),
    Number((Math.max(...zValues) - Math.min(...zValues) + spec.cellSize.z).toFixed(6))
  ].sort((first, second) => first - second);

  assert.equal(spec.cells.length, 12);
  assert.deepEqual([xValues.length, zValues.length].sort((first, second) => first - second), [3, 4]);
  assert.deepEqual(spans, [6, 8]);
  assert.match(source, /function synchronizeBaseGridTransform\(tile\)/);
  assert.match(source, /tile\.scale\.x=1;tile\.scale\.z=1;/);
  assert.match(source, /if\(baseBlueprint\)\{synchronizeBaseGridTransform\(spawner\);refreshBaseBooleanMask\(spawner\)\}/);
});

function baseGridTransformHarness() {
  const context = vm.createContext({
    isBaseTileBlueprint: tile => tile.userData.tileBlueprintAssetId === "blueprint:base",
    tileDimensions: () => ({ rows: 3, columns: 4, tileSize: 2, width: 8, depth: 6 }),
    normalizeTileDimension: value => value,
    applyTileBlueprint: options => { context.applied = options; },
    fitTileSpawnerModel: () => { context.fitted = true; },
    invalidateNavigation: () => { context.invalidated = true; }
  });
  const start = source.indexOf("function synchronizeBaseGridTransform(");
  const end = source.indexOf("function addWorldFloor(", start);
  assert.notEqual(start, -1, "Base scaling must synchronize with its local grid");
  assert.notEqual(end, -1, "Base scaling must remain separate from level creation");
  vm.runInContext(source.slice(start, end), context);
  return context;
}

test("Base_bp scaling snaps the mesh footprint to whole square cells", () => {
  const context = baseGridTransformHarness();
  const base = {
    userData: { tileBlueprintAssetId: "blueprint:base" },
    scale: { x: 1.47, y: 1.25, z: .7 },
    rotation: { x: .2, y: 1.4, z: -.1 }
  };

  assert.equal(context.synchronizeBaseGridTransform(base), true);
  assert.deepEqual(context.applied.rows, 2);
  assert.deepEqual(context.applied.columns, 6);
  assert.equal(base.scale.x, 1);
  assert.equal(base.scale.z, 1);
  assert.equal(base.scale.y, 1.25);
  assert.equal(base.rotation.x, 0);
  assert.equal(base.rotation.z, 0);
  assert.equal(base.rotation.y, Math.PI * .5);
});

test("Base_bp uses its edge-fitted grids for navigation and CH deployment", () => {
  assert.match(source, /function activeGameplayGridSpec\(/);
  assert.match(source, /function baseGameplayGridSpecs\(/);
  assert.match(source, /function baseGameplayGridSpec\(source\)/);
  assert.match(source, /navigationGrid\.cellSize=gridSpec\.cellSize/);
  assert.match(source, /for\(const baseSpec of baseSpecs\)for\(const cell of baseSpec\.cells\)/);
  const previewStart=source.indexOf("function deploymentPreviewCells(){");
  const previewEnd=source.indexOf("function enemyOccupiesDeploymentCell",previewStart);
  const previewSource=source.slice(previewStart,previewEnd);
  assert.match(previewSource,/ensureNavigationGrid\(\)/);
  assert.match(previewSource,/navigationGridCellFromPoint\(point,grid\)/);
  assert.doesNotMatch(previewSource,/DEPLOYMENT_PREVIEW_CELL/);
});

test("Base_bp batches its scalable deployment grid instead of rebuilding one mesh per tile", () => {
  assert.match(source, /function addDeploymentPreviewGrid\(/);
  assert.match(source, /function addCommandGridInstances\(/);
  assert.match(source, /new THREE\.InstancedMesh\(geometry,material,cells\.length\)/);
  assert.match(source, /addCommandGridInstances\(entries,geometry\.outline/);
  assert.match(source, /const deploymentPreviewCache=\{revision:-1,cells:\[\]\}/);
  assert.match(source, /deploymentPreviewCache\.revision===grid\.revision/);
  const refreshStart=source.indexOf("function refreshCommandGrid(){");
  const refreshEnd=source.indexOf("function clearTacticalSelection",refreshStart);
  const refreshSource=source.slice(refreshStart,refreshEnd);
  assert.match(refreshSource,/addDeploymentPreviewGrid\(deploymentPreviewCells\(\)\)/);
  assert.doesNotMatch(refreshSource,/for\(const preview of deploymentPreviewCells\(\)\)/);
});

test("large deployment previews update EN occupancy and hover without rebuilding every tile", () => {
  assert.match(source, /deploymentPreviewRenderer=\{revision:-1/);
  assert.match(source, /function deploymentEnemyOccupancySnapshot\(/);
  assert.match(source, /function updateDeploymentPreviewOccupied\(renderer,occupiedKeys\)/);
  assert.match(source, /function updateDeploymentPreviewHover\(renderer\)/);
  const occupancyStart=source.indexOf("function updateDeploymentEnemyOccupancy(){");
  const occupancyEnd=source.indexOf("function deploySoldier",occupancyStart);
  const occupancySource=source.slice(occupancyStart,occupancyEnd);
  assert.match(occupancySource,/const snapshot=deploymentEnemyOccupancySnapshot\(\)/);
  assert.match(occupancySource,/updateDeploymentPreviewOccupied\(renderer,snapshot\.keys\)/);
  assert.doesNotMatch(occupancySource,/deploymentPreviewCells\(\)\.filter/);
  const refreshStart=source.indexOf("function refreshCommandGrid(){");
  const refreshEnd=source.indexOf("function clearTacticalSelection",refreshStart);
  const refreshSource=source.slice(refreshStart,refreshEnd);
  assert.match(refreshSource,/if\(deploymentPlacementReady\|\|mode==="editor"\)\{\s*addDeploymentPreviewGrid/);
  assert.doesNotMatch(refreshSource,/clearCommandGrid\(\);\s*if\(deploymentPlacementReady/);
});

test("Town Hall and Barracks blueprints use Content Browser models and duplicate support", () => {
  assert.match(source, /\{id:"bp_gn\/town-hall",name:"Town Hall",parentId:"bp_gn"\}/);
  assert.match(source, /\{id:"bp_gn\/barracks",name:"Barracks",parentId:"bp_gn"\}/);
  assert.match(source, /id:TOWN_HALL_BP_ASSET_ID,name:"TownHall_bp",type:"Blueprint",folderId:"bp_gn\/town-hall",blueprintKind:"town-hall"/);
  assert.match(source, /id:BARRACKS_BP_ASSET_ID,name:"Barracks_bp",type:"Blueprint",folderId:"bp_gn\/barracks",blueprintKind:"barracks"/);
  assert.match(source, /if\(type==="town-hall"\|\|type==="barracks"\)\{record\.blueprintAssetId=/);
  assert.match(source, /if\(record\.type==="town-hall"\|\|record\.type==="barracks"\)return applySavedEditorMaterial\(addRaidBuilding/);
  assert.match(source, /function contentBrowserModelOptions\(\)/);
  assert.match(source, /for\(const asset of contentBrowserAssetSpecs\(\)\.filter\(isContentBrowserModelAsset\)\)/);
  assert.match(source, /populateContentBrowserModelSelect\(modelInput,profile\?\.settings\.model/);
  assert.match(source, /function selectedBuildingBlueprintProfile\(\)/);
  assert.match(source, /function applyBuildingBlueprintSettings\(\)/);
  assert.match(source, /barracksSpawnInterval:8/);
  assert.match(source, /if\(type==="barracks"\)record\.barracksSpawnInterval=/);
  assert.match(source, /function updateBarracksSpawners\(dt\)/);
  assert.match(source, /function contentBrowserDuplicateSelectedBlueprint\(\)/);
});

test("Content Browser imports persistent GLB models with a material fallback slot", () => {
  assert.match(indexSource, /id="content-browser-import"/);
  assert.match(indexSource, /id="content-browser-import-input" type="file" accept="\.glb,model\/gltf-binary"/);
  assert.match(indexSource, /id="editor-material-slot"/);
  assert.match(source, /function contentBrowserImportGlb\(/);
  assert.match(source, /await file\.arrayBuffer\(\)/);
  assert.match(source, /await writeImportedModelBuffer\(assetId,buffer\)/);
  assert.match(source, /function addImportedModel\(/);
  assert.match(source, /function applyImportedModelMaterialSlot\(/);
  assert.match(source, /NONE - USE COLOUR/);
});

test("Content Browser creates reusable GLB models from the current selected size", () => {
  assert.match(indexSource, /id="content-browser-new-model"/);
  assert.match(source, /import \{ GLTFExporter \} from "\.\/vendor\/exporters\/GLTFExporter\.js"/);
  assert.match(source, /function contentBrowserCreateNewModel\(\)/);
  assert.match(source, /new GLTFExporter\(\)\.parseAsync\(exported\.root,\{binary:true/);
  assert.match(source, /contentBrowserState\.modelScales\[assetId\]=\[0,1,2\]\.map/);
  assert.match(source, /sourcePath:normalizeGeneratedModelSourcePath\(saved\.path\)/);
});

test("the vendored GLB exporter loads Three.js from its sibling vendor path", () => {
  assert.match(gltfExporterSource, /from '\.\.\/three\.module\.js';/);
  assert.doesNotMatch(gltfExporterSource, /from '\.\.\/\.\.\/three\.module\.js';/);
});

test("Content Browser deletion removes placed asset references after confirmation", () => {
  assert.match(indexSource, /id="content-browser-delete"/);
  assert.match(source, /function contentBrowserReferencedLevelObjects\(/);
  assert.match(source, /Deleting it will also remove those level references/);
  assert.match(source, /for\(const object of referenceObjects\)removeEditorObject\(object\)/);
  assert.match(source, /\$\("content-browser-delete"\)\.onclick=openContentBrowserDeleteConfirm/);
  assert.match(source, /function contentBrowserDeleteFolder\(folder\)/);
});

test("Content Browser deletion finds direct and assigned model references", () => {
  const start = source.indexOf("function contentBrowserAssetIdForLevelObject(");
  const end = source.indexOf("\nfunction removeContentBrowserAssetDefinitions", start);
  assert.notEqual(start, -1, "Content Browser asset references must be identifiable");
  assert.notEqual(end, -1, "Content Browser reference matching must be self-contained");

  const imported = { name: "Building", userData: { editorAssetType: "imported-model", importedModelAssetId: "imported-model:building" } };
  const blueprint = { name: "Barracks", userData: { editorAssetType: "barracks", blueprintAssetId: "blueprint:barracks:copy-a" } };
  const buildingModel = { name: "Town Hall", userData: { editorAssetType: "town-hall", blueprintAssetId: "bp_gn/town-hall", blueprintModel: "imported-model:building" } };
  const actorModel = { name: "EN1", userData: { editorAssetType: "enemy-character", actorArchetypeId: "en1", modelAssetId: "imported-model:building" } };
  const context = vm.createContext({
    TILE_BP_ASSET_ID: "bp_gn/tile",
    editorAssetIdForObject: () => null,
    editorObjects: [imported, blueprint, buildingModel, actorModel]
  });

  vm.runInContext(source.slice(start, end), context);
  assert.equal(vm.runInContext("contentBrowserAssetIdForLevelObject(editorObjects[0])", context), "imported-model:building");
  assert.equal(vm.runInContext("contentBrowserAssetIdForLevelObject(editorObjects[1])", context), "blueprint:barracks:copy-a");
  assert.deepEqual(Array.from(vm.runInContext("contentBrowserReferencedLevelObjects(['imported-model:building','blueprint:barracks:copy-a']).map(object=>object.name)", context)), ["Building", "Barracks", "Town Hall", "EN1"]);
});

test("bug recorder UI and runtime are removed", () => {
  assert.doesNotMatch(indexSource, /mark-bug|bug-alert|bug-report-panel/);
  assert.doesNotMatch(source, /flightRecorder|FlightRecorder|MARK BUG/);
});

test("CH and EN share one model scale configured on the Content Browser model asset", () => {
  assert.equal(existsSync(new URL("../Models/CH_Model.glb", import.meta.url)), true);
  assert.match(source, /chModel: \["\.\/Models\/CH_Model\.glb", 1\.22\]/);
  assert.match(source, /\{id:CHARACTER_MODEL_ASSET_ID,name:"CH Model",type:"Model",folderId:"models",placeable:false/);
  assert.match(source, /actorModels:saved\.actorModels/);
  assert.match(source, /modelScales:saved\.modelScales/);
  assert.doesNotMatch(source, /actorScales:saved\.actorScales/);
  assert.match(source, /function applyContentBrowserModelScale\(visual,assetId\)/);
  assert.match(source, /function refreshContentBrowserModelScale\(assetId\)/);
  assert.match(source, /function applyCharacterModel\(actor,assetId\)/);
  assert.match(source, /actor\.scale\.fromArray\(scale\?\?\[1,1,1\]\)/);
  assert.match(indexSource, /id="editor-actor-model"/);
  assert.doesNotMatch(indexSource, /data-actor-scale|editor-actor-scale-lock/);
  assert.match(indexSource, /id="inspector-model-section"/);
  assert.match(indexSource, /data-model-scale="0"/);
  assert.match(indexSource, /id="editor-model-scale-lock"/);
});

test("latest Blender building is available as a Content Browser model", () => {
  assert.equal(existsSync(new URL("../Models/Crownwake_Building.glb", import.meta.url)), true);
  assert.match(source, /CROWNWAKE_BUILDING_MODEL_ASSET_ID="model:crownwake-building"/);
  assert.match(source, /crownwakeBuilding: \["\.\/Models\/Crownwake_Building\.glb", 2\]/);
  assert.match(source, /id:CROWNWAKE_BUILDING_MODEL_ASSET_ID,name:"Crownwake Building",type:"Model",folderId:"models",placeable:false/);
});

test("imported GLB colours replace assigned material slots", () => {
  assert.match(source, /if\(object\.userData\?\.editorAssetType==="imported-model"&&importedModelMaterialSlotValue\(object\)\)\{restoreImportedModelBaseMaterials\(object\);object\.userData\.importedMaterialSlot="";\}/);
  assert.match(source, /updateEditorMaterialSlotInspector\(\);const colourEditable=editable/);
});

test("Base_bp is an editable material dropdown target rather than a disabled tile spawner", () => {
  const base = new THREE.Group();
  base.userData.editorAssetType = "tile-spawner";
  const start = source.indexOf("function selectedImportedModelMaterialTarget()");
  const context = vm.createContext({ editorMaterialTargets: () => [base], isBaseTileBlueprint: object => object === base });
  vm.runInContext(source.slice(start, source.indexOf("\nfunction ", start + 1)), context);
  assert.equal(context.selectedImportedModelMaterialTarget(), base);
});

test("base material presets and None change only the visible model, not the shared grid", () => {
  const base = new THREE.Group(), visual = new THREE.Group();
  visual.name = "Base Model";
  const texture = new THREE.Texture(), original = new THREE.MeshStandardMaterial({ map: texture, color: "#b3a767", vertexColors: true });
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(), original);
  visual.add(mesh);
  const surface = new THREE.Mesh(new THREE.PlaneGeometry(), new THREE.MeshBasicMaterial({ opacity: 0, colorWrite: false }));
  surface.name = "Tile Surface";
  const grid = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: "#123456" }));
  grid.name = "Tile Grid";
  base.add(visual, surface, grid);
  base.userData.tileRows = 32;base.userData.tileColumns = 32;base.userData.tileSize = 2;base.userData.tileColour = "#123456";
  const geometry = mesh.geometry, surfaceMaterial = surface.material, originalColour = original.color.getHexString();
  const maps = new Set();
  for (const preset of BASE_MATERIAL_PRESETS) {
    assert.equal(applyBaseMaterial(base, preset.id), true);
    assert.equal(base.userData.importedMaterialSlot, preset.id);
    assert.ok(mesh.material.map.isDataTexture);
    maps.add(mesh.material.map);
    assert.notEqual(mesh.material.map, texture);
    assert.equal(mesh.material.vertexColors, false);
    assert.equal(mesh.material.color.getHexString(), "ffffff");
  }
  assert.equal(maps.size, 4);
  assert.equal(applyBaseMaterial(base, "", "#dae2ef"), true);
  assert.equal(mesh.material.map, null);
  assert.equal(mesh.material.vertexColors, false);
  assert.equal(mesh.material.color.getHexString(), "dae2ef");
  assert.equal(base.userData.editorMaterialColor, "#dae2ef");
  assert.equal(base.userData.importedMaterialSlot, "");
  applyBaseMaterial(base, "__embedded__");
  assert.equal(mesh.material.map, texture);
  assert.equal(mesh.material.color.getHexString(), originalColour);
  assert.equal(mesh.material.vertexColors, true);
  assert.equal(original.map, texture);
  assert.equal(original.color.getHexString(), originalColour);
  assert.equal(mesh.geometry, geometry);
  assert.equal(surface.material, surfaceMaterial);
  assert.equal(grid.material.color.getHexString(), "123456");
  assert.equal(base.userData.tileColour, "#123456");
  assert.equal(base.userData.tileRows, 32);
  assert.equal(base.userData.tileSize, 2);
});

test("saved base material choices restore before generic colour handling", () => {
  const calls = [], asset = { userData: { editorAssetType: "tile-spawner" } };
  const context = vm.createContext({
    isBaseTileBlueprint: candidate => candidate === asset,
    applyBaseMaterial: (...args) => calls.push(args),
    applyEditorMaterialColour: () => assert.fail("generic tinting must not overwrite a base material preset")
  });
  const start = source.indexOf("function applySavedEditorMaterial(");
  vm.runInContext(source.slice(start, source.indexOf("\nfunction ", start + 1)), context);
  for (const slot of ["__embedded__", ...BASE_MATERIAL_PRESETS.map(preset => preset.id), ""]) {
    context.applySavedEditorMaterial(asset, { materialSlot: slot, materialColor: "#ddeeff" });
    assert.deepEqual(calls.at(-1), [asset, slot, "#ddeeff"]);
  }
  context.applySavedEditorMaterial(asset, {});
  assert.deepEqual(calls.at(-1), [asset, "__embedded__", "#ffffff"]);
});

test("GLB import excludes Blender construction helpers from the final model", () => {
  const start = source.indexOf("function isImportedModelConstructionHelper(");
  const end = source.indexOf("\nfunction ", start + 1);
  assert.notEqual(start, -1, "imported models must identify Blender helper geometry");

  const context = vm.createContext({});
  vm.runInContext(source.slice(start, end), context);
  assert.equal(context.isImportedModelConstructionHelper({ name: "CUT - Window - Front facade 01" }), true);
  assert.equal(context.isImportedModelConstructionHelper({ name: "Roof pocket - Tall rear tower" }), true);
  assert.equal(context.isImportedModelConstructionHelper({ name: "Roof extension - Front block" }), true);
  assert.equal(context.isImportedModelConstructionHelper({ name: "Building - complete mesh" }), false);
  assert.match(source, /removeImportedModelConstructionHelpers\(model\)/);
});

test("selected viewport objects expose duplicate and delete actions outside settings", () => {
  const viewportStart = indexSource.indexOf('<main id="editor-viewport-frame"');
  const viewportEnd = indexSource.indexOf("</main>", viewportStart);
  const viewport = indexSource.slice(viewportStart, viewportEnd);
  assert.notEqual(viewportStart, -1);
  assert.match(viewport, /id="editor-viewport-actions"/);
  assert.match(viewport, /id="editor-viewport-duplicate"/);
  assert.match(viewport, /id="editor-viewport-delete"/);
  assert.match(viewport, /id="editor-delete-confirm"/);
  assert.doesNotMatch(indexSource, /id="editor-confirm-slot"/);
  assert.match(source, /\$\("editor-viewport-duplicate"\)\.onclick=duplicateEditorSelection/);
  assert.match(source, /\$\("editor-viewport-delete"\)\.onclick=\(\)=>openEditorDeleteConfirm\(\)/);
});

test("EN3 splits into two full-size EN4 enemies", () => {
  assert.match(source, /en3:Object\.freeze\(\{id:"en3",label:"EN 3",faction:"enemy",maxHp:32,attack:10/);
  assert.match(source, /en4:Object\.freeze\(\{id:"en4",label:"EN 4",faction:"enemy",maxHp:16,attack:5/);
  assert.match(source, /splitsOnDeath:archetype\.id==="en3"/);
  assert.match(source, /const child=makeUnit\("enemy","en4"\);child\.name="EN 4"/);
  assert.match(source, /child\.scale\.copy\(parent\.scale\);/);
});

test("Barracks spawn settings and EN material defaults are editable", () => {
  assert.match(source, /Math\.round\(Number\(settings\.barracksSpawnInterval\)\|\|BUILDING_BLUEPRINT_DEFAULTS\.barracksSpawnInterval\),5,10/);
  assert.match(source, /const enemy=makeUnit\("enemy","en1"\);enemy\.userData\.barracksSpawned=true;beginBarracksDeparture\(enemy,barracks,\{hidden:true\}\);battle\.add\(enemy\)/);
  assert.match(source, /actorMaterials:saved\.actorMaterials/);
  assert.match(source, /function applyEditorActorMaterial\(\)/);
  assert.match(source, /contentBrowserState\.actorMaterials\[profile\.archetype\.id\]=colour/);
});

test("Barracks EN leaves a scaled doorway before combat assignment", () => {
  const context = barracksSpawnRouteHarness();
  const barracks = new THREE.Group();
  barracks.position.set(8, .015, -3);
  barracks.scale.set(.5, 1, .5);
  const inside = new THREE.Object3D();
  inside.name = "CROWNWAKE_EN_SPAWN_INSIDE";
  inside.position.set(0, 0, -2);
  const exit = new THREE.Object3D();
  exit.name = "CROWNWAKE_EN_SPAWN_EXIT";
  exit.position.set(0, 0, 2);
  barracks.add(inside, exit);
  context.barracks = barracks;
  const route = vm.runInContext("barracksSpawnRoute(barracks)", context);

  assert.equal(route.inside.x, 8);
  assert.equal(route.exit.x, 8);
  assert.equal(route.inside.z, -4);
  assert.equal(route.exit.z, -2);
  assert.equal(route.inside.y, .055);
  assert.equal(route.exit.y, .055);
  assert.match(source, /function beginBarracksDeparture\(unit,barracks,\{hidden=true\}=\{\}\)/);
  assert.match(source, /unit\.userData\.barracksDeparture=\{barracks,inside:route\.inside\.clone\(\),doorway:route\.exit\.clone\(\),exit:clearExit/);
  assert.match(source, /enemy\.userData\.barracksSpawned=true;beginBarracksDeparture\(enemy,barracks,\{hidden:true\}\);battle\.add\(enemy\)/);
  assert.match(source, /if\(updateBarracksDeparture\(u,dt\)\)return;/);
  assert.match(source, /unit\.userData\.barracksDeparture=null;unit\.userData\.barracksInitialDuelCheck=true;unit\.userData\.velocity\.set\(0,0,0\);assignBarracksAnchor\(unit\);activatePlacedCharacterEncounter\(\);/);
  assert.match(source, /const activeEnemyUnits=enemyUnits\.filter\(u=>u\.userData\.alive&&!isBarracksDeparting\(u\)\)/);
  const buildingGlb = readFileSync(new URL("../Models/Crownwake_Building.glb", import.meta.url));
  assert.equal(buildingGlb.includes(Buffer.from("CROWNWAKE_EN_SPAWN_INSIDE")), true);
  assert.equal(buildingGlb.includes(Buffer.from("CROWNWAKE_EN_SPAWN_EXIT")), true);
});

test("authored EN inside a Barracks enters the protected exit flow", () => {
  const context = authoredBarracksDepartureHarness();
  const barracks = new THREE.Group();
  barracks.userData = {
    editorAssetType: "barracks",
    alive: true,
    collisionHalf: { x: 1, z: 1 },
    collisionFootprints: [{ object: barracks, x: 0, z: 0, half: { x: 1, z: .5 }, rotation: 0 }]
  };
  const inside = new THREE.Object3D();
  inside.name = "CROWNWAKE_EN_SPAWN_INSIDE";
  inside.position.set(0, 0, -.45);
  const exit = new THREE.Object3D();
  exit.name = "CROWNWAKE_EN_SPAWN_EXIT";
  exit.position.set(0, 0, .65);
  barracks.add(inside, exit);
  const enemy = new THREE.Group();
  enemy.visible = true;
  enemy.position.set(0, .055, 0);
  enemy.userData = { editorActor: true, faction: "enemy", alive: true, velocity: new THREE.Vector3() };
  context.editorObjects.push(barracks);
  context.enemyUnits.push(enemy);

  assert.equal(vm.runInContext("beginAuthoredBarracksDepartures()", context), 1);
  assert.equal(enemy.visible, false);
  assert.equal(enemy.userData.barracksSpawned, true);
  assert.equal(enemy.userData.barracksDeparture.barracks, barracks);
  assert.ok(enemy.userData.barracksDeparture.revealProgress > 0);
  assert.ok(enemy.userData.barracksDeparture.revealProgress < .68);
  assert.ok(enemy.position.distanceTo(new THREE.Vector3(0, .055, -.45)) < .000001);
});

test("Crownwake Building collision leaves the EN interior and doorway open", async () => {
  const buildingGlb = readFileSync(new URL("../Models/Crownwake_Building.glb", import.meta.url));
  const loader = new GLTFLoader();
  const { scene: visual } = await loader.parseAsync(buildingGlb.buffer.slice(buildingGlb.byteOffset, buildingGlb.byteOffset + buildingGlb.byteLength), "");
  visual.updateMatrixWorld(true);
  const inside = visual.getObjectByName("CROWNWAKE_EN_SPAWN_INSIDE")?.getWorldPosition(new THREE.Vector3());
  const doorway = visual.getObjectByName("CROWNWAKE_EN_SPAWN_EXIT")?.getWorldPosition(new THREE.Vector3());
  const context = modelCollisionFootprintHarness(.1);
  context.visual = visual;
  const footprints = vm.runInContext("modelCollisionFootprints(visual, { x: 1.5, z: 1.5 })", context);
  const clear = point => !footprints.some(footprint => Math.abs(point.x - footprint.x) <= footprint.half.x + .3 && Math.abs(point.z - footprint.z) <= footprint.half.z + .3);

  assert.ok(inside);
  assert.ok(doorway);
  assert.ok(footprints.length >= 4, "wall collision should remain segmented around the room");
  assert.equal(clear(inside), true);
  assert.equal(clear(doorway), true);
});

test("Barracks EN becomes visible while crossing the doorway", () => {
  const context = barracksDepartureHarness();
  const unit = new THREE.Group();
  unit.visible = false;
  unit.userData = {
    velocity: new THREE.Vector3(),
    barracksDeparture: {
      inside: new THREE.Vector3(0, .055, 0),
      doorway: new THREE.Vector3(1, .055, 0),
      exit: new THREE.Vector3(2, .055, 0),
      progress: 0,
      revealed: false,
      revealProgress: .25,
      duration: 1
    }
  };
  context.unit = unit;

  vm.runInContext("updateBarracksDeparture(unit, .24)", context);
  assert.equal(unit.visible, false);

  vm.runInContext("updateBarracksDeparture(unit, .01)", context);
  assert.equal(unit.visible, true);
  assert.ok(unit.position.x > 0 && unit.position.x < 1);

  vm.runInContext("updateBarracksDeparture(unit, .43)", context);
  assert.ok(unit.position.distanceTo(new THREE.Vector3(1, .055, 0)) < .000001);
  assert.equal(unit.visible, true);

  vm.runInContext("updateBarracksDeparture(unit, .32)", context);
  assert.ok(unit.position.distanceTo(new THREE.Vector3(2, .055, 0)) < .000001);
  assert.equal(unit.userData.barracksDeparture, null);
});

test("level actors patrol before CH deployment and Barracks still complete their doorway exit", () => {
  const spawnerStart = source.indexOf("function updateBarracksSpawners(dt){");
  const spawnerEnd = source.indexOf("\nfunction activeRaidBuildings", spawnerStart);
  const spawners = source.slice(spawnerStart, spawnerEnd);
  const enemyLoopStart = source.indexOf("enemyUnits.forEach((u,i)=>{");
  const enemyLoopEnd = source.indexOf("\n  updateEncounterRings", enemyLoopStart);
  const enemyLoop = source.slice(enemyLoopStart, enemyLoopEnd);

  assert.notEqual(spawnerStart, -1);
  assert.notEqual(spawnerEnd, -1);
  assert.doesNotMatch(spawners, /deploymentStarted/);
  assert.match(source, /function peacefulPatrolActive\(\)\{return mode==="playing"&&!celebrationWinnerFaction/);
  assert.match(source, /function updatePeacefulPatrol\(unit,allies,dt\)/);
  assert.match(enemyLoop, /const waitingDuel=enemyWaitingAssignments\.get\(u\);\n    if\(peacefulPatrol&&!foe\?\.userData\?\.alive&&!waitingDuel\)\{updateEnemyGroupPatrol\(u,livingEnemies,dt\);return;\}/);
  assert.match(source, /updateIndependentSoldier\(u,\{combat,enemyInSight:threatDetected,raidTarget,foe,waitingDuel,peacefulPatrol,patrolAllies:livingPlayerSoldiers,dt\}\)/);
  assert.match(source, /if\(deploymentStarted&&activeEncounter&&!activeEncounter\.done&&!activeEncounter\.aggro/);
  assert.match(source, /if\(deploymentStarted\)reserveRaidBuildingAssignments\(livingPlayerSoldiers\);/);
  assert.match(source, /if\(deploymentStarted\)updateRaidBuildingCombat\(livingPlayerSoldiers,dt\);/);
  const encounterStart=source.indexOf("function activatePlacedCharacterEncounter(");
  const encounterEnd=source.indexOf("function detachActorFromCombat",encounterStart);
  assert.doesNotMatch(source.slice(encounterStart,encounterEnd), /deploymentStarted=true/);
});

test("Town Hall and Barracks are destructible CH raid targets", () => {
  assert.match(source, /const RAID_BUILDING_MAX_HP=480/);
  assert.match(source, /function defaultRaidBuildingHealth\(\)\{return RAID_BUILDING_MAX_HP\}/);
  assert.match(source, /building\.userData\.raidBuilding=true;building\.userData\.alive=true/);
  assert.match(source, /function attackRaidBuilding\(attacker,building,dt,contact=false\)/);
  assert.match(source, /building\.userData\.hp=Math\.max\(0,building\.userData\.hp-attacker\.userData\.attack\)/);
  assert.match(source, /function raidBuildingDebris\(building,count=4\)/);
  assert.match(source, /width:4\.625,height:\.075/);
  assert.match(source, /function showRaidBuildingHealth\(building,previousHealth=building\.userData\.hp\)/);
  assert.match(source, /const previousHealth=building\.userData\.hp;building\.userData\.hp=Math\.max/);
  assert.match(source, /data\.visibleTimer=5/);
  assert.match(source, /if\(activeRaidBuildings\(\)\.length\)return;/);
});

test("building blueprints expose a persistent health amount", () => {
  assert.match(source, /function normalizeRaidBuildingHealth\(value,fallback=RAID_BUILDING_MAX_HP\)/);
  assert.match(source, /maxHp=normalizeRaidBuildingHealth\(settings\.maxHp,defaultRaidBuildingHealth\(\)\)/);
  assert.match(indexSource, /id="editor-building-health"/);
  assert.match(source, /maxHp:\$\("editor-building-health"\)\.value/);
  assert.match(source, /record\.maxHp=normalizeRaidBuildingHealth\(object\.userData\.maxHp\)/);
  assert.match(source, /maxHp:record\.maxHp/);
  assert.match(source, /showRaidBuildingHealth\(profile\.building,settings\.maxHp\)/);
});

test("Town Hall and Barracks block unit movement and routing", () => {
  assert.match(source, /building\.userData\.collisionHalf=\{\.\.\.visual\.userData\.modelCollisionHalf\}/);
  assert.match(source, /NAVIGATION_BLOCKING_TYPES=new Set\(\["primitive-cube","town-hall","barracks","archer-tower","forest-fence","imported-model"\]\)/);
  assert.match(source, /function navigationObstacleFootprint\(object\)/);
  assert.match(source, /function navigationPathDesired\(unit,desired,\{goalKey=null,targetActor=null,allowPhysicalGoal=false\}=\{\}\)/);
  assert.match(source, /function raidBuildingAttackSlotDestination\(unit,building\)/);
  assert.match(source, /function resolveNavigationObstacleCollisions\(\)/);
  assert.match(source, /resolveCircleBoxOverlap\(\{point:unit\.position/);
  assert.match(source, /resolveCharacterCollisions\(\);resolveNavigationObstacleCollisions\(\);updateActorTerrainSupport\(dt\);resolveDebrisCollisions\(\)/);
});

test("CH target paths ignore the navigation halo but retain real building collision", () => {
  const context = navigationTargetChannelHarness();
  const targetBuilding = { userData: { raidBuilding: true } };
  const otherObstacle = {};
  const cells = [{ x: .65, z: 0 }, { x: .75, z: 0 }, { x: 1.5, z: 0 }];
  const keys = cells.map(context.navigationCellKey);
  context.navigationGrid = {
    cells: new Map(cells.map((cell, index) => [keys[index], cell])),
    walkable: new Set(keys),
    blocked: new Set(keys),
    obstacles: [
      { object: targetBuilding, x: 0, z: 0, half: { x: .4, z: .4 }, rotation: 0 },
      { object: otherObstacle, x: 1.5, z: 0, half: { x: .1, z: .1 }, rotation: 0 }
    ]
  };

  const blocked = context.navigationPathBlockedCells({ userData: {} }, targetBuilding);

  assert.equal(blocked.has("0.65:0"), true);
  assert.equal(blocked.has("0.75:0"), false);
  assert.equal(blocked.has("1.5:0"), true);
});

test("Barracks departure ignores only its owning building collision", () => {
  const context = navigationTargetChannelHarness();
  const barracks = {};
  const otherObstacle = {};
  const unit = { userData: { barracksDeparture: { barracks } } };
  context.navigationGrid = {
    obstacles: [{ object: barracks, x: 0, z: 0, half: { x: .4, z: .4 }, rotation: 0 }]
  };

  assert.equal(context.navigationPointPhysicallyBlocked({ x: 0, z: 0 }, unit), false);
  context.navigationGrid.obstacles.push({ object: otherObstacle, x: 0, z: 0, half: { x: .4, z: .4 }, rotation: 0 });
  assert.equal(context.navigationPointPhysicallyBlocked({ x: 0, z: 0 }, unit), true);
});

test("playtest prepares authored Barracks interiors before simulation starts", () => {
  assert.match(source, /rebuildPlacedCharacterEncounter\(\{prepareBarracksInteriors:true\}\);battle\.visible=true/);
  assert.match(source, /function start\(\)\{removeUnplacedEnemyActors\(\{prepareBarracksInteriors:true\}\)/);
  assert.match(source, /\$\("editor-done"\)\.onclick=\(\)=>\{saveLevelLayout\(\);editorReturnMode="playing";closeLevelEditor\(\);resetPlaytestToSavedLevel\(\);\}/);
  assert.doesNotMatch(source, /if\(!actor\?\.visible\|\|!actor\.userData\?\.alive\|\|isBarracksDeparting\(actor\)\)return false/);
});

test("imported building collisions follow visible mesh sections instead of empty outer bounds", () => {
  const context = modelCollisionFootprintHarness();
  const visual = new THREE.Group();
  for (const x of [-2, 2]) {
    const section = new THREE.Mesh(new THREE.BoxGeometry(1.4, 3, 1.4), new THREE.MeshBasicMaterial());
    section.position.set(x, 1.5, 0);
    visual.add(section);
  }
  context.visual = visual;
  const footprints = vm.runInContext("modelCollisionFootprints(visual,{x:2.7,z:.7})", context);
  const contains = (x, z) => footprints.some(footprint => Math.abs(x - footprint.x) <= footprint.half.x && Math.abs(z - footprint.z) <= footprint.half.z);

  assert.equal(contains(-2, 0), true);
  assert.equal(contains(2, 0), true);
  assert.equal(contains(0, 0), false);
  assert.match(source, /navigationGrid\.obstacles=editorObjects\.flatMap\(navigationObstacleFootprints\)/);
  assert.match(source, /function raidBuildingCollisionFootprints\(building\)/);
});

test("named Blender collision meshes override the visible model footprint", () => {
  const context = modelCollisionFootprintHarness(.1);
  const visual = new THREE.Group();
  const visibleModel = new THREE.Mesh(new THREE.BoxGeometry(6, 3, 2), new THREE.MeshBasicMaterial());
  visibleModel.position.set(0, 1.5, 0);
  const collisionModel = new THREE.Mesh(new THREE.BoxGeometry(2, 3, 2), new THREE.MeshBasicMaterial());
  collisionModel.name = "COLLISION_Crownwake_Building_A";
  collisionModel.position.set(-1, 1.5, 0);
  visual.add(visibleModel, collisionModel);
  context.visual = visual;
  const footprints = vm.runInContext("modelCollisionFootprints(visual,{x:3,z:1})", context);
  const contains = (x, z) => footprints.some(footprint => Math.abs(x - footprint.x) <= footprint.half.x && Math.abs(z - footprint.z) <= footprint.half.z);

  assert.equal(contains(-1, 0), true);
  assert.equal(contains(2.5, 0), false);
  assert.match(source, /function editorCollisionSelectionHelper\(object\)/);
  assert.match(source, /new THREE\.EdgesGeometry\(mesh\.geometry\)/);
  assert.match(source, /editorCollisionSelectionHelper\(object\)\?\?new THREE\.BoxHelper\(object,0xf7fff1\)/);
});

test("model collision sampling stays tight to the visible building volume", () => {
  const context = modelCollisionFootprintHarness(.1);
  const visual = new THREE.Mesh(new THREE.BoxGeometry(2, 3, 2), new THREE.MeshBasicMaterial());
  visual.position.y = 1.5;
  context.visual = visual;
  const footprints = vm.runInContext("modelCollisionFootprints(visual,{x:1,z:1})", context);
  const minX = Math.min(...footprints.map(footprint => footprint.x - footprint.half.x));
  const maxX = Math.max(...footprints.map(footprint => footprint.x + footprint.half.x));
  const minZ = Math.min(...footprints.map(footprint => footprint.z - footprint.half.z));
  const maxZ = Math.max(...footprints.map(footprint => footprint.z + footprint.half.z));

  assert.ok(minX >= -1.12 && maxX <= 1.12);
  assert.ok(minZ >= -1.12 && maxZ <= 1.12);
  assert.match(source, /const RAID_BUILDING_MAX_HP=480,RAID_BUILDING_ATTACK_RANGE=\.36,COLLISION_FOOTPRINT_CELL_SIZE=\.1/);
});

test("overflow CH queue away from a building until an attack slot opens", () => {
  assert.match(source, /const RAID_BUILDING_WAIT_CLEARANCE=1\.3/);
  assert.match(source, /function raidBuildingAttackWaitDestination\(unit,building\)/);
  assert.match(source, /queueLeader=raidBuildingAttackQueueLeader\(building\)/);
  assert.match(source, /return \{state:"waiting",destination:raidBuildingAttackWaitDestination\(unit,building\)\}/);
  assert.doesNotMatch(source, /if\(!available\.length\)return slots\[unit\.id%slots\.length\]\.clone\(\)/);
});

test("new EN duels can interrupt CH raids and return them afterward", () => {
  assert.match(source, /function reserveRaidBuildingAssignments\(units\)/);
  assert.match(source, /filter\(\(\{slot\}\)=>raidBuildingAttackSlotWalkable\(slot,unit\)\)/);
  assert.match(source, /reserveRaidBuildingAssignments\(livingPlayerSoldiers\);/);
  assert.match(source, /const combatAssignmentRoster=preserveLockedCombatants\(livingPlayerSoldiers,commandableFollowers\);/);
  assert.match(source, /clearBuildingAttackAssignments\(unit\);unit\.userData\.lockedTarget=foe/);
  assert.match(source, /clearBuildingAttackAssignments\(unit\);unit\.userData\.navigationPath=null/);
  assert.match(source, /updateRaidBuildingCombat\(livingPlayerSoldiers,dt\);/);
  assert.doesNotMatch(source, /commandableFollowers\.filter\(unit=>!unit\.userData\.buildingAttackSlot\)/);
  assert.doesNotMatch(source, /enemyDistance<buildingCenterDistance&&buildingCenterDistance>4/);
});

test("physically clear Barracks slots survive coarse blocked navigation cells", () => {
  const context = raidBuildingCombatHarness();
  const slots = Array.from({ length: 8 }, (_, index) => ({
    id: index,
    walkable: false,
    supported: true,
    physicallyBlocked: false,
    distance: index,
    clone() { return { ...this }; }
  }));
  context.raidBuildingAttackSlots = () => slots;
  const building = { userData: {} };
  const units = slots.map((_, index) => ({
    id: index + 1,
    visible: true,
    userData: { alive: true },
    position: { distanceToSquared: point => point.distance, clone() { return { ...this }; } }
  }));
  const assignments = units.map(unit => context.raidBuildingAttackSlotDestination(unit, building));
  assert.deepEqual(assignments.map(assignment => assignment.state), Array(8).fill("attack"));
  assert.deepEqual(assignments.map(assignment => assignment.destination.id), Array.from({ length: 8 }, (_, index) => index));
});

test("the current Barracks scale has two CH attack slots on every side", () => {
  const context = raidBuildingCombatHarness();
  context.raidBuildingCollisionFootprints = () => [{ x: 0, z: 0, half: { x: .51, z: .51 }, rotation: 0 }];
  const slots = context.raidBuildingAttackSlots({ userData: {} });
  assert.equal(slots.length, 8);
  assert.equal(slots.slice(0, 2).every(slot => slot.x < 0), true);
  assert.equal(slots.slice(2, 4).every(slot => slot.x > 0), true);
  assert.equal(slots.slice(4, 6).every(slot => slot.z < 0), true);
  assert.equal(slots.slice(6, 8).every(slot => slot.z > 0), true);
  assert.match(source, /function navigationPhysicalPathClear\(start,end,unit\)/);
  assert.match(source, /allowPhysicalGoal:navigationOptions\.allowPhysicalGoal===true/);
  assert.match(source, /targetActor:building,allowPhysicalGoal:true/);
});

test("building attack slots stop just outside the CH collider", () => {
  const context = raidBuildingCombatHarness();
  context.raidBuildingCollisionFootprints = () => [{ x: 0, z: 0, half: { x: .51, z: .51 }, rotation: 0 }];
  const unit = { userData: { collisionRadius: .29 } };
  const slots = context.raidBuildingAttackSlots({ userData: {} }, unit);

  assert.ok(Math.abs(Math.abs(slots[0].x) - .825) < .000001);
  assert.match(source, /function raidBuildingAttackSlotClearance\(unit\)\{return unitCollisionRadius\(unit\)\+RAID_BUILDING_ATTACK_SLOT_BUFFER\}/);
  assert.doesNotMatch(source, /const half=raidBuildingCollisionHalf\(building\),clearance=\.42/);
});

test("CH attacks when collision keeps it close to a building but away from its reserved slot", () => {
  const context = raidBuildingUpdateHarness();
  const building = {
    id: 7,
    visible: true,
    position: new THREE.Vector3(),
    rotation: new THREE.Euler(),
    userData: { alive: true, hp: 100, maxHp: 100 }
  };
  const unit = {
    id: 3,
    position: new THREE.Vector3(0, .015, 0),
    rotation: new THREE.Euler(),
    userData: { alive: true, attack: 10, velocity: new THREE.Vector3() }
  };

  context.activeRaidBuildings = () => [building];
  context.nearestAlive = () => building;
  context.raidBuildingSurfaceDistance = () => .3;
  context.raidBuildingAttackSlotDestination = () => ({
    state: "attack",
    destination: new THREE.Vector3(1.2, .015, 0)
  });

  context.updateRaidBuildingCombat([unit], 1 / 60);

  assert.equal(building.userData.hp, 90);
});

test("CH uses a clear direct ingress to its building attack slot", () => {
  const context = raidBuildingUpdateHarness();
  const building = {
    id: 8,
    visible: true,
    position: new THREE.Vector3(),
    rotation: new THREE.Euler(),
    userData: { alive: true, hp: 100, maxHp: 100 }
  };
  const unit = {
    id: 4,
    position: new THREE.Vector3(-1, .015, 0),
    rotation: new THREE.Euler(),
    userData: { alive: true, attack: 10, velocity: new THREE.Vector3() }
  };
  const slot = new THREE.Vector3(.8, .015, 0);
  slot.attackApproach = new THREE.Vector3(1.52, .015, 0);
  let routed = false, directDestination = null;

  context.activeRaidBuildings = () => [building];
  context.nearestAlive = () => building;
  context.raidBuildingSurfaceDistance = () => .8;
  context.raidBuildingAttackSlotDestination = () => ({ state: "attack", destination: slot });
  context.navigationPhysicalPathClear = () => true;
  context.steerTowards = () => { routed = true; };
  context.steerStraightTowards = (_unit, destination) => { directDestination = destination; };

  context.updateRaidBuildingCombat([unit], 1 / 60);

  assert.equal(routed, false);
  assert.equal(directDestination, slot);
});

test("building slots route to a mesh-side approach before final attack contact", () => {
  const context = raidBuildingCombatHarness();
  context.raidBuildingCollisionFootprints = () => [{ x: 0, z: 0, half: { x: .51, z: .51 }, rotation: 0 }];
  const slot = context.raidBuildingAttackSlots({ userData: {} }, { userData: { collisionRadius: .29 } })[0];
  const mover = {
    position: {
      x: slot.attackApproach.x - 1,
      z: slot.attackApproach.z,
      distanceToSquared(point) { return (this.x - point.x) ** 2 + (this.z - point.z) ** 2; }
    }
  };

  assert.ok(slot.attackApproach);
  assert.equal(context.raidBuildingAttackMoveDestination(mover, slot), slot.attackApproach);
  mover.position.x = slot.attackApproach.x;
  mover.position.z = slot.attackApproach.z;
  assert.equal(context.raidBuildingAttackMoveDestination(mover, slot), slot);
});

test("building reservations ignore physically blocked slot candidates", () => {
  const context = raidBuildingCombatHarness();
  const slots = [
    { id: "blocked", walkable: false, physicallyBlocked: true, distance: 0, clone() { return { ...this }; } },
    { id: "reachable-far", walkable: true, distance: 4, clone() { return { ...this }; } },
    { id: "reachable-near", walkable: true, distance: 1, clone() { return { ...this }; } }
  ];
  context.raidBuildingAttackSlots = () => slots;
  const unit = { id: 1, visible: true, userData: { alive: true }, position: { distanceToSquared: point => point.distance } };
  const building = { userData: {} };
  const assignment = context.raidBuildingAttackSlotDestination(unit, building);
  assert.equal(assignment.state, "attack");
  assert.equal(assignment.destination.id, "reachable-near");
  assert.equal(unit.userData.buildingAttackSlot.index, 2);
});

test("saved platform cubes do not become full-level navigation blockers", () => {
  assert.match(source, /record\.navigationBlocks=object\.userData\.navigationBlocks===true/);
  assert.match(source, /asset\?\.userData\?\.editorAssetType==="primitive-cube"/);
  assert.match(source, /asset\.userData\.navigationBlocks=record\?\.navigationBlocks===true/);
  assert.match(source, /isNavigationPlatformCube\(\{walkableSurface:cube\.userData\.walkableSurface,navigationBlocks:cube\.userData\.navigationBlocks,scale:navigationWorldScale\}\)/);
});

test("building health bars are visible immediately and sync their fill on damage", () => {
  assert.match(source, /healthBarOffset:RAID_BUILDING_HEALTH_BAR_OFFSET/);
  assert.match(source, /group\.position\.y=\(building\.userData\.modelHeight\?\?3\)\+building\.userData\.healthBarOffset/);
  assert.match(source, /alwaysVisible:true/);
  assert.match(source, /const style=configuredProgressBar\(building\.userData\.progressBarAssetId,BUILDING_PROGRESS_BAR_BP_ASSET_ID\)/);
  assert.match(source, /outline=layer\(style\.backgroundColor,width\+\.14,height\+\.1,0,133,null,1\),track=layer\(style\.backgroundColor,width,height,\.005,134,null,1\)/);
  assert.match(source, /lag=layer\(style\.backgroundColor,width,height\*\.78,\.01,135\),main=layer\(style\.mainColor,width,height\*\.78,\.02,136\)/);
  assert.match(source, /data\.lag\.visible=false;setWidgetFill\(data\.main,data\.current\/max,data\.width,data\.height\)/);
  assert.match(source, /widget\.visible=data\.alwaysVisible\|\|state\.visible/);
  assert.match(source, /setWidgetFill\(data\.main,data\.current\/max,data\.width,data\.height\)/);
  assert.match(source, /part\.userData\.healthWidgetLayer/);
});

test("health-capable Blueprints expose a persistent health-bar height offset", () => {
  assert.match(source, /actorHealthBarOffsets:saved\.actorHealthBarOffsets/);
  assert.match(source, /function actorHealthBarOffset\(archetypeId\)/);
  assert.match(source, /healthBarOffset:actorHealthBarOffset\(archetypeId\)/);
  assert.match(source, /record\.healthBarOffset=object\.userData\.healthBarOffset/);
  assert.match(indexSource, /id="editor-actor-health-bar-offset"/);
  assert.match(indexSource, /id="editor-building-health-bar-offset"/);
});

test("progress-bar blueprints configure CH, EN, and building health bars", () => {
  assert.match(source, /ACTOR_PROGRESS_BAR_BP_ASSET_ID="blueprint:character-progress-bar"/);
  assert.match(source, /BUILDING_PROGRESS_BAR_BP_ASSET_ID="blueprint:building-progress-bar"/);
  assert.match(source, /id:"bp_gn\/progress-bars",name:"Progress Bars",parentId:"bp_gn"/);
  assert.match(source, /name:"CharacterProgressBar_bp",type:"Blueprint",folderId:"bp_gn\/progress-bars",placeable:false,progressBarBlueprint:true/);
  assert.match(source, /name:"BuildingProgressBar_bp",type:"Blueprint",folderId:"bp_gn\/progress-bars",placeable:false,progressBarBlueprint:true/);
  assert.match(indexSource, /id="editor-progress-bar-background"/);
  assert.match(indexSource, /id="editor-progress-bar-main"/);
  assert.match(indexSource, /id="editor-progress-bar-width"/);
  assert.match(indexSource, /id="editor-progress-bar-height"/);
  assert.match(indexSource, /id="editor-actor-progress-bar"/);
  assert.match(indexSource, /id="editor-building-progress-bar"/);
  assert.match(source, /progressBarAssetId/);
  assert.match(source, /healthWidgetLayer=true/);
  assert.match(source, /width:4\.625,height:\.075/);
  assert.match(source, /function applyProgressBarLayout\(widget,style\)/);
  assert.match(source, /actorProgressBars:saved\.actorProgressBars/);
  assert.match(source, /record\.progressBarAssetId=object\.userData\.progressBarAssetId/);
});

test("Barracks EN pair, take waiter slots, or anchor after leaving the Barracks", () => {
  assert.match(source, /const freshBarracksEnemies=b\.filter\(enemy=>enemy\.userData\.barracksSpawned&&enemy\.userData\.barracksInitialDuelCheck\)/);
  assert.match(source, /priorityWaiters:freshBarracksWaiters/);
  assert.match(source, /function barracksAnchorDestination\(unit,livingEnemySoldiers\)/);
  assert.match(source, /const anchorGoal=combatState===SOLDIER_COMBAT_STATE\.NEUTRAL&&u\.userData\.barracksSpawned\?barracksAnchorDestination/);
  assert.match(source, /barracksInitialDuelCheck=true/);
  assert.match(source, /barracksEnemyCanClaimDuel/);
  assert.match(source, /BARRACKS_ENEMY_ANCHOR_SLOT_COUNT=8/);
  assert.match(source, /function barracksAnchorSlotPoint\(anchor,slot,y\)/);
  assert.match(source, /chooseAvailableBarracksAnchorSlot/);
  assert.match(source, /waiter\.userData\.waitingDuelTarget=duel\.left;waiter\.userData\.barracksAnchor=null;waiter\.userData\.barracksAnchorSlot=null;/);
  assert.match(source, /function enemyRoamDestination/);
});

test("CH deployment uses separate icons and deploys the selected reserve as one group", () => {
  const start = source.indexOf("function deploySoldier(point){");
  const end = source.indexOf("function issueCompanyOrder", start);
  const deployment = source.slice(start, end);
  assert.match(indexSource, /id="companies"[^>]*data-deployment-archetype="ch1"/);
  assert.match(indexSource, /id="companies-ch2"[^>]*data-deployment-archetype="ch2"/);
  assert.match(indexSource, /id="starting-ch1-count"/);
  assert.match(indexSource, /id="starting-ch2-count"/);
  assert.match(deployment, /const count=deploymentReserves\[deploymentArchetypeId\]/);
  assert.match(deployment, /makeUnit\("player",deploymentArchetypeId\)/);
  assert.match(deployment, /unit\.userData\.companyId=deploymentGroupId\(deploymentArchetypeId\)/);
  assert.match(deployment, /activatePlacedCharacterEncounter\(\{engageImmediately:true\}\)/);
  assert.match(source, /forceSoldierEngagement/);
  assert.match(source, /forcedSoldierEngagement\|\|approachState!=="travel"/);
  assert.doesNotMatch(indexSource, /id="deployment-dilation"/);
  assert.doesNotMatch(source, /function updateDeploymentWindow\(/);
});

test("CH and EN HUD Blueprints are placeable, persistent level controls", () => {
  assert.match(source, /\{id:"hud",name:"HUD",parentId:CONTENT_BROWSER_ROOT_ID\}/);
  assert.match(source, /\{id:"hud\/ch",name:"CH",parentId:"hud"\}/);
  assert.match(source, /\{id:"hud\/en",name:"EN",parentId:"hud"\}/);
  assert.match(source, /HUD_ARCHETYPE_IDS\.map\(archetypeId=>\{const archetype=ACTOR_ARCHETYPES\[archetypeId\];return \{id:hudAssetId\(archetypeId\),name:`\$\{archetype\.label\} HUD`,type:"HUD",folderId:`hud\/\$\{archetype\.faction==="player"\?"ch":"en"\}`/);
  assert.match(source, /function addEditorHudWidget\(/);
  assert.match(source, /if\(blueprint\?\.hudArchetypeId\)/);
  assert.match(source, /record\.type==="hud-widget"/);
  assert.match(source, /inspector-hud-section/);
  assert.match(source, /function spawnHudEnemies\(/);
});

test("the default CH deploy row is an editable persisted HUD block layout", () => {
  assert.match(source, /HUD_LAYOUT_GRID=Object\.freeze\(\{columns:24,rows:16\}\)/);
  assert.match(source, /function ensureDefaultHudWidgets\(/);
  assert.match(source, /hudLayoutX:settings\.layoutX,hudLayoutY:settings\.layoutY/);
  assert.match(source, /record\.hudLayoutX=settings\.layoutX;record\.hudLayoutY=settings\.layoutY/);
  assert.match(source, /hudLayoutX:record\.hudLayoutX,hudLayoutY:record\.hudLayoutY/);
  assert.match(source, /function beginHudLayoutDrag\(/);
  assert.match(source, /document\.body\.classList\.toggle\("hud-layout-ready",widgets\.some\(widget=>widget\.userData\.editorAssetType==="hud-widget"&&hudWidgetArchetype\(widget\)\.faction==="player"\)\)/);
});

test("HUD text is a placeable editable Outliner asset", () => {
  assert.match(source, /const HUD_TEXT_ASSET_ID="hud:text"/);
  assert.match(source, /function addEditorHudText\(/);
  assert.match(source, /if\(blueprint\?\.hudText\)/);
  assert.match(source, /if\(record\.type==="hud-text"\)/);
  assert.match(source, /if\(type==="hud-text"\)return "HUD TEXT"/);
  assert.match(source, /\{id:HUD_TEXT_ASSET_ID,name:"Objective Text HUD",type:"HUD",folderId:"hud",hudText:true/);
  assert.match(source, /editor-hud-text/);
});

test("HUD layout blocks do not render solid world proxies", () => {
  assert.match(source, /widget\.visible=false;const element=placedHudWidgetElement\(widget\)/);
});

test("HUD layout blocks use their own screen selection instead of world highlights", () => {
  assert.match(source, /if\(isHudLayoutObject\(object\)\)continue;/);
});

test("clicking a CH selects its whole stable group and peaceful groups regroup", () => {
  const pointerStart=source.indexOf("function pointerWorld(e){");
  const pointerEnd=source.indexOf("function hoverTacticalGrid",pointerStart);
  const pointerSource=source.slice(pointerStart,pointerEnd);
  assert.match(pointerSource,/selectCompany\(actorHit\.userData\.companyId\)/);
  assert.match(source,/function independentGroupRegroupTarget\(unit\)/);
  assert.match(source,/shouldRegroupPlayerGroup\(/);
});

test("defeating every EN keeps playtest active until the player exits", () => {
  const enemy = {
    visible: true,
    userData: {
      alive: true,
      revival: {},
      velocity: { set() {} }
    }
  };
  const context = vm.createContext({
    activeEncounter: { victoryResolved: false, done: false },
    enemyUnits: [enemy],
    enemyPackAnchor: {},
    nextWaveTimer: 4,
    defeatCinematic: { elapsed: 1 },
    mode: "playing",
    resetDuel() {},
    beginFactionCelebration(faction) { context.celebrating = faction; },
    battle: { remove() {} },
    showToast(text, duration) { context.toast = { text, duration }; },
    updateStats() {}
  });
  const start = source.indexOf("function completeEnemyDefeat(){");
  const end = source.indexOf("function updateDefeatCinematic", start);
  vm.runInContext(source.slice(start, end), context);

  context.completeEnemyDefeat();

  assert.equal(context.mode, "playing");
  assert.equal(context.activeEncounter.victoryResolved, true);
  assert.equal(context.activeEncounter.done, true);
  assert.equal(context.enemyUnits.length, 0);
  assert.equal(context.defeatCinematic, null);
  assert.equal(context.celebrating, "player");
  assert.equal(context.toast.text, "ALL EN DEFEATED — EXIT WHEN READY");
});

test("EN celebration replaces retreat only after no CH reserve or deployed CH remains", () => {
  const start=source.indexOf("function resolveBattle(){");
  const end=source.indexOf("function updatePlayerGroupCommander",start);
  const resolution=source.slice(start,end);
  assert.match(resolution,/const winner=celebrationWinner\(\{livingPlayerCount:livingPlayerUnits\(\)\.length,livingEnemyCount:enemyUnits\.filter\(unit=>unit\.userData\.alive&&unit\.visible\)\.length,playerReserveCount:deploymentReserveTotal\(\),deploymentStarted\}\)/);
  assert.match(resolution,/if\(winner==="enemy"\)\{/);
  assert.match(resolution,/beginFactionCelebration\(winner\)/);
  assert.doesNotMatch(resolution,/beginEnemyRetreat\(\)/);
});

function previewHarness() {
  const context = vm.createContext({
    mode: "editor",
    selected: true,
    deploymentPlacementReady: false,
    commandGrid: { visible: true, children: [] },
    clearCommandGrid() { context.commandGrid.children = []; },
    tileBlueprintSelected() { return context.selected; },
    deploymentPreviewCells() { return [{ cell: { x: 0, z: 0 } }]; },
    addDeploymentPreviewGrid(previews) { context.commandGrid.children.push(...previews); },
    commandHoverCell: null,
    DEPLOYMENT_PREVIEW_CELL: 2,
    selectedCompanyId: null,
    selectedCommander: null,
  });
  const start = source.indexOf("function refreshCommandGrid(){");
  const end = source.indexOf("function clearTacticalSelection(){", start);
  vm.runInContext(source.slice(start, end), context);
  return context;
}

test("tile blueprint preview is not covered by the fixed deployment grid", () => {
  const context = previewHarness();
  context.refreshCommandGrid();
  assert.equal(context.commandGrid.visible, false);
});

test("deployment grid returns for other editor selections and gameplay deployment", () => {
  const context = previewHarness();
  context.selected = false;
  context.refreshCommandGrid();
  assert.equal(context.commandGrid.visible, true);
  context.selected = true;
  context.mode = "playing";
  context.deploymentPlacementReady = true;
  context.refreshCommandGrid();
  assert.equal(context.commandGrid.visible, true);
});
