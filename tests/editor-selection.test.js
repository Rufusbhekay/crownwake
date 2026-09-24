import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import * as THREE from "three";

const source = readFileSync(new URL("../game.js", import.meta.url), "utf8");

function selectionHarness() {
  const battle = new THREE.Group();
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(20, 20), new THREE.MeshBasicMaterial());
  floor.rotation.x = -Math.PI / 2;
  floor.userData = { editorSelectable: true, editorAssetType: "world-floor" };
  battle.add(floor);
  const camera = new THREE.OrthographicCamera(-10, 10, 10, -10, .1, 100);
  camera.position.set(10, 12, 10);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();
  const canvas = { getBoundingClientRect: () => ({ left: 0, top: 0, width: 1000, height: 1000 }) };
  const context = vm.createContext({ THREE, battle, camera, canvas, pointer: new THREE.Vector2(), raycaster: new THREE.Raycaster(), editorObjects: [floor] });
  const pointerStart = source.indexOf("function setPointerFromClient(");
  const pointerEnd = source.indexOf("function editorGroundPoint(", pointerStart);
  const selectionStart = source.indexOf("function editorObjectFromHit(");
  const selectionEnd = source.indexOf("function disposeEditorSelectionHelper(", selectionStart);
  vm.runInContext(source.slice(pointerStart, pointerEnd) + source.slice(selectionStart, selectionEnd), context);
  return { battle, camera, context, floor };
}

function makeActor(battle, context, x = 0) {
  const actor = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(.12, .65, .12), new THREE.MeshBasicMaterial());
  body.position.y = .33;
  actor.position.x = x;
  actor.userData = { editorSelectable: true, editorActor: true, editorAssetType: "ch-character" };
  actor.add(body);
  battle.add(actor);
  context.editorObjects.push(actor);
  battle.updateMatrixWorld(true);
  return actor;
}

function clientPoint(worldPoint, camera) {
  const point = worldPoint.clone().project(camera);
  return { x: (point.x + 1) * 500, y: (1 - point.y) * 500 };
}

test("editor picks a tiny actor from a nearby click that only raycasts the floor", () => {
  const { battle, camera, context } = selectionHarness();
  const actor = makeActor(battle, context);
  const point = clientPoint(new THREE.Vector3(0, .33, 0), camera);
  assert.equal(vm.runInContext(`editorObjectAt(${point.x + 9}, ${point.y})`, context), actor);
});

test("editor picks the nearest small actor but leaves empty ground selectable", () => {
  const { battle, camera, context, floor } = selectionHarness();
  const first = makeActor(battle, context);
  const second = makeActor(battle, context, .5);
  const firstPoint = clientPoint(new THREE.Vector3(0, .33, 0), camera);
  const secondPoint = clientPoint(new THREE.Vector3(.5, .33, 0), camera);
  assert.equal(vm.runInContext(`editorObjectAt(${firstPoint.x}, ${firstPoint.y})`, context), first);
  assert.equal(vm.runInContext(`editorObjectAt(${secondPoint.x + 9}, ${secondPoint.y})`, context), second);
  assert.equal(vm.runInContext("editorObjectAt(700, 700)", context), floor);
});

test("hidden HUD placeholders cannot steal editor clicks from the ground", () => {
  const { battle, camera, context, floor } = selectionHarness();
  const placeholder = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
  placeholder.userData = { editorSelectable: true, editorAssetType: "hud-widget" };
  placeholder.position.y = .5;
  battle.add(placeholder);
  context.editorObjects.push(placeholder);
  battle.updateMatrixWorld(true);
  const point = clientPoint(new THREE.Vector3(0, 0, 0), camera);
  assert.equal(vm.runInContext(`editorObjectAt(${point.x}, ${point.y})`, context), floor);
});
