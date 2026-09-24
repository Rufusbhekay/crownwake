import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import * as THREE from "three";
import { levelCameraFrame } from "../src/sim.js";

const source = readFileSync(new URL("../game.js", import.meta.url), "utf8");

test("reopening the editor restores saved zoom and focus instead of the gameplay view", () => {
  const context = vm.createContext({
    THREE, mode: "settings", settingsReturnMode: "playing", editorReturnMode: "playing",
    editorCameraFocus: new THREE.Vector3(), editorCameraRotation: new THREE.Euler(),
    gameplayCameraFocus: new THREE.Vector3(80, 0, 90), gameplayCameraScale: 1,
    savedLevelCamera: { x: 0, z: 0, scale: 100 / 110, rotation: [.1, .2, 0] },
    EDITOR_ZOOM_MIN: .32, EDITOR_ZOOM_MAX: 3, navigationDebugVisible: false,
    document: { body: { classList: { add() {} } } },
    $: () => ({ classList: { add() {}, remove() {} } }),
    sounds: { music: { pause() {} } }, playerFocus: () => ({ position: new THREE.Vector3(10, 0, 20) })
  });
  for (const name of ["clearTacticalSelection", "updateEditorUndoControl", "updateEditorZoomControls", "updateEditorTransformControls", "updateEditorScaleLock", "syncFoliagePaintControls", "buildEditorTransformGizmo", "toggleEditorEnvironmentPopover", "ensureEditorCameraObject", "syncWorldLookControls", "applyWorldLook", "renderEditorAssets", "renderWorldOutliner", "updateEditorTransformInspector", "setEditorContext", "setAssetPanel", "updateFoliagePanel", "applyEditorLayout", "refreshCommandGrid", "setNavigationDebugVisible"]) context[name] = () => {};
  const start = source.indexOf("function openLevelEditor()");
  vm.runInContext(source.slice(start, source.indexOf("function closeLevelEditor()", start)), context);
  context.openLevelEditor();
  assert.equal(Math.round(100 / context.editorCameraScale), 110);
  assert.deepEqual(context.editorCameraFocus.toArray(), [0, 0, 0]);
  assert.deepEqual(context.editorCameraRotation.toArray().slice(0, 3), [.1, .2, 0]);
});

test("camera frames preserve independent XYZ rotation without changing legacy frames", () => {
  const rotation = [-.2, .6, .1];
  const frame = levelCameraFrame({ x: 12, z: 18, scale: 1, rotation });
  assert.deepEqual(frame.rotation, rotation);
  rotation[0] = 4;
  assert.equal(frame.rotation[0], -.2);
  assert.deepEqual(levelCameraFrame({ x: 12, z: 18, scale: 1 }), { x: 12, z: 18, scale: 1 });
  for (const invalid of [[1, 2], [1, Infinity, 3], [1, "2", 3]]) {
    assert.equal(levelCameraFrame({ x: 12, z: 18, scale: 1, rotation: invalid }).rotation, undefined);
  }
});

test("rotating the gameplay placeholder updates the live camera rig rotation", () => {
  const start = source.indexOf("function syncEditorCameraFocusFromObject(");
  const end = source.indexOf("\nfunction ", start + 1);
  const editorCameraFocus = new THREE.Vector3();
  const editorCameraRotation = new THREE.Euler();
  const editorCameraObject = new THREE.Group();
  editorCameraObject.userData.editorCamera = true;
  editorCameraObject.position.set(12, .015, 18);
  editorCameraObject.rotation.set(-.2, .6, .1);
  const context = vm.createContext({ editorCameraFocus, editorCameraRotation, editorCameraObject });
  vm.runInContext(source.slice(start, end), context);
  vm.runInContext("syncEditorCameraFocusFromObject()", context);
  assert.deepEqual(editorCameraFocus.toArray(), [12, 0, 18]);
  assert.deepEqual(editorCameraRotation.toArray(), editorCameraObject.rotation.toArray());
});

test("camera rig rotates its position and up direction while preserving legacy framing", () => {
  const start = source.indexOf("function levelCameraPose(");
  const end = source.indexOf("\nfunction ", start + 1);
  const offset = new THREE.Vector3(15, 20, 15);
  const context = vm.createContext({ THREE, ISOMETRIC_CAMERA_OFFSET: offset });
  vm.runInContext(source.slice(start, end), context);
  const focus = new THREE.Vector3(90, 0, 145);
  for (const scale of [.4, 1, 2]) {
    const initial = context.levelCameraPose(focus, scale);
    assert.ok(initial.position.distanceTo(focus.clone().addScaledVector(offset, scale)) < 1e-10);
    assert.deepEqual(initial.up.toArray(), [0, 1, 0]);
    for (const rotation of [[.2, 0, 0], [0, .4, 0], [0, 0, .3]]) {
      const pose = context.levelCameraPose(focus, scale, rotation);
      const look = focus.clone().setY(.4);
      assert.ok(pose.position.distanceTo(initial.position) > 1);
      assert.ok(Math.abs(pose.position.distanceTo(look) - initial.position.distanceTo(look)) < 1e-10);
      const initialCamera = new THREE.PerspectiveCamera();
      initialCamera.position.copy(initial.position);initialCamera.lookAt(look);
      const rotatedCamera = new THREE.PerspectiveCamera();
      rotatedCamera.position.copy(pose.position);rotatedCamera.up.copy(pose.up);rotatedCamera.lookAt(look);
      const expected = new THREE.Quaternion().setFromEuler(new THREE.Euler(...rotation)).multiply(initialCamera.quaternion);
      assert.ok(rotatedCamera.quaternion.angleTo(expected) < 1e-7);
    }
  }
});

test("editor undo snapshots and saves include detached camera rotation arrays", () => {
  const context = vm.createContext({
    levelCameraFrame, editorCameraFocus: new THREE.Vector3(12, 0, 18), editorCameraScale: 1.2,
    editorCameraRotation: new THREE.Euler(-.2, .6, .1), EDITOR_ZOOM_MIN: .32, EDITOR_ZOOM_MAX: 3,
    editorObjects: [], hiddenEditorAssets: new Set(), copyContentBrowserState: () => ({}), levelAssetRecord: () => null
  });
  const start = source.indexOf("function currentEditorCameraFrame()");
  const end = source.indexOf("\nfunction updateEditorUndoControl", start);
  vm.runInContext(source.slice(start, end), context);
  const snapshot = context.editorSnapshot();
  context.editorCameraRotation.set(0, 0, 0);
  assert.equal(JSON.stringify(snapshot.camera.rotation), JSON.stringify([-.2, .6, .1]));
  assert.match(source, /if\(mode==="editor"\)savedLevelCamera=currentEditorCameraFrame\(\)/);
  assert.match(source, /editorCameraRotation\.fromArray\(snapshot\.camera\.rotation\?\?\[0,0,0\]\)/);
});

test("Play Again restores and persists authored EN before browser reload", () => {
  const start = source.indexOf("function restartSavedLevel()");
  const end = source.indexOf("\n}", start) + 2;
  assert.notEqual(start, -1, "restartSavedLevel must own the Play Again lifecycle");

  const calls = [];
  const context = vm.createContext({
    resetPlaytestToSavedLevel: () => {
      calls.push("restore");
      return true;
    },
    saveLevelLayout: () => calls.push("save"),
    location: { reload: () => calls.push("reload") }
  });

  vm.runInContext(source.slice(start, end), context);
  vm.runInContext("restartSavedLevel()", context);

  assert.deepEqual(calls, ["restore", "save", "reload"]);
});

test("closing the editor persists placed EN before removing editor-only objects", () => {
  const start = source.indexOf("function closeLevelEditor()");
  const end = source.indexOf("\nfunction ", start + 1);
  const closeEditorSource = source.slice(start, end);

  assert.notEqual(start, -1, "closeLevelEditor must own the editor exit lifecycle");
  const saveIndex = closeEditorSource.indexOf("saveLevelLayout()");
  const removeCameraIndex = closeEditorSource.indexOf("removeEditorCameraObject()");
  assert.ok(
    saveIndex >= 0 && saveIndex < removeCameraIndex,
    "closing the editor must save authored EN before editor-only objects are removed"
  );
});

test("browser refresh keeps the authored EN snapshot rather than live combat actors", () => {
  const start = source.indexOf("function persistSavedLevelLayout()");
  const end = source.indexOf("\n}", start) + 2;
  assert.notEqual(start, -1, "persistSavedLevelLayout must own reload persistence");

  const writes = [];
  const context = vm.createContext({
    LEVEL_LAYOUT_KEY: "crownwake-level-layout-v1",
    savedLevelState: { version: 2, assets: [{ type: "enemy-character", x: 8, z: 12 }] },
    localStorage: { setItem: (...args) => writes.push(args) }
  });

  vm.runInContext(source.slice(start, end), context);
  assert.equal(vm.runInContext("persistSavedLevelLayout()", context), true);
  assert.deepEqual(writes, [["crownwake-level-layout-v1", JSON.stringify(context.savedLevelState)]]);
  assert.match(source, /addEventListener\("pagehide",\(\)=>.*persistSavedLevelLayout\(\)/);
});

test("restoring a saved level includes an EN placed after earlier scenery", () => {
  const start = source.indexOf("function restoreLevelLayout()");
  const end = source.indexOf("\nfunction ", start + 1);
  const records = Array.from({ length: 180 }, (_, index) => ({ type: "tree-cluster", x: index, z: 0 }));
  records.push({ type: "enemy-character", x: 84, z: 136 });
  const restored = [];
  const context = vm.createContext({
    LEVEL_LAYOUT_KEY: "crownwake-level-layout-v1",
    LEGACY_LEVEL_LAYOUT_VERSION: 1,
    LEVEL_LAYOUT_VERSION: 2,
    EDITOR_ZOOM_MIN: .32,
    EDITOR_ZOOM_MAX: 3,
    localStorage: { getItem: () => JSON.stringify({ version: 2, assets: records }) },
    levelCameraFrame: () => null,
    addLevelAsset: record => restored.push(record),
    rememberLevelState: () => {},
    console: { warn: () => {} }
  });

  vm.runInContext(source.slice(start, end), context);
  assert.equal(vm.runInContext("restoreLevelLayout()", context), true);
  assert.equal(restored.at(-1).type, "enemy-character");
  assert.equal(restored.at(-1).x, 84);
  assert.equal(restored.at(-1).z, 136);
});

test("saved material restoration does not require editor UI initialization", () => {
  const start = source.indexOf("function applySavedEditorMaterial(");
  const end = source.indexOf("\nfunction ", start + 1);
  assert.notEqual(start, -1, "applySavedEditorMaterial must restore saved colors");

  const calls = [];
  const context = vm.createContext({
    applyEditorMaterialColour: (...args) => calls.push(args)
  });
  vm.runInContext(source.slice(start, end), context);
  const asset = {};
  assert.equal(vm.runInContext('applySavedEditorMaterial(globalThis.asset,{materialColor:"#74766f"})===globalThis.asset', vm.createContext({
    asset,
    applySavedEditorMaterial: context.applySavedEditorMaterial,
    applyEditorMaterialColour: (...args) => calls.push(args)
  })), true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], "#74766f");
  assert.equal(calls[0][1][0], asset);
  assert.equal(calls[0][2].recordUndo, false);
  assert.equal(calls[0][2].refreshUi, false);
});

test("placed imported GLB models retain their asset and material selection", () => {
  assert.match(source, /"imported-model"/);
  assert.match(source, /record\.importedModelAssetId=object\.userData\.importedModelAssetId/);
  assert.match(source, /record\.materialSlot=object\.userData\.importedMaterialSlot/);
  assert.match(source, /if\(record\.type==="imported-model"\)return applySavedEditorMaterial\(addImportedModel\(/);
  assert.match(source, /const restoredLevelLayout=restoreLevelLayout\(\);/);
  assert.match(source, /await loadPersistedImportedModels\(\);/);
  assert.match(source, /IMPORTED_MODEL_DATABASE_NAME/);
});

test("viewport duplicate copies selected actors and level meshes nearby", () => {
  const start = source.indexOf("function canDuplicateEditorObject(");
  const end = source.indexOf("\nfunction setEditorSelection", start);
  assert.notEqual(start, -1, "viewport duplication must filter selectable level objects");

  const actor = { name: "EN 1", userData: { editorAssetType: "enemy-character" } };
  const mesh = { name: "Cube", userData: { editorAssetType: "primitive-cube" } };
  const floor = { name: "Island Plane", userData: { editorAssetType: "world-floor" } };
  const records = [], selections = [], status = { textContent: "" };
  const context = vm.createContext({
    editorObjects: [actor, mesh, floor],
    editorSelectedObjects: new Set([actor, mesh, floor]),
    recordEditorUndo: () => records.push("undo"),
    levelAssetRecord: object => ({ type: object.userData.editorAssetType, x: 8, z: 12 }),
    addLevelAsset: record => {
      records.push(record);
      return { name: record.type, userData: {} };
    },
    setEditorSelection: (...selection) => selections.push(selection),
    $: id => id === "editor-status" ? status : null
  });

  vm.runInContext(source.slice(start, end), context);
  vm.runInContext("duplicateEditorSelection()", context);

  assert.equal(records[0], "undo");
  assert.deepEqual(records.slice(1).map(record => record.type), ["enemy-character", "primitive-cube"]);
  assert.deepEqual(records.slice(1).map(record => [record.x, record.z]), [[9.4, 13.4], [9.4, 13.4]]);
  assert.equal(selections.length, 1);
  assert.match(status.textContent, /2 selected assets duplicated together/);
});

test("actor deletion confirmation identifies the selected actor", () => {
  const start = source.indexOf("function openEditorDeleteConfirm(");
  const end = source.indexOf("\nfunction closeEditorDeleteConfirm", start);
  assert.notEqual(start, -1, "level deletion must have a confirmation action");

  const actor = { name: "EN 3", userData: { editorActor: true, editorAssetType: "enemy-character" } };
  const title = { textContent: "" }, copy = { textContent: "" }, dialog = { classList: { remove: () => {} } };
  const context = vm.createContext({
    editorSelection: actor,
    editorSelectedObjects: new Set([actor]),
    editorObjects: [actor],
    pendingEditorDelete: null,
    editorAssetTypeLabel: () => "EN 3 ACTOR",
    selectEditorObject: () => {},
    positionEditorDeleteConfirm: () => {},
    requestAnimationFrame: callback => callback(),
    $: id => ({ "editor-delete-title": title, "editor-delete-copy": copy, "editor-delete-confirm": dialog, "editor-delete-confirm-button": { focus: () => {} } })[id]
  });

  vm.runInContext(source.slice(start, end), context);
  vm.runInContext("openEditorDeleteConfirm()", context);

  assert.equal(title.textContent, "DELETE EN 3?");
  assert.equal(copy.textContent, "Remove this EN 3 actor from the level?");
});
