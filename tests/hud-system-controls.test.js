import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const gameSource = readFileSync(new URL("../game.js", import.meta.url), "utf8");
const indexSource = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const styleSource = readFileSync(new URL("../styles.css", import.meta.url), "utf8");

test("settings gear is an editable HUD asset that appears during play", () => {
  assert.match(gameSource, /LEVEL_LAYOUT_VERSION=8/);
  assert.match(gameSource, /const HUD_CONTROL_DEFINITIONS=Object\.freeze/);
  for (const controlId of ["brand", "swarm", "territory", "pause", "settings", "exit"]) {
    assert.match(gameSource, new RegExp(`${controlId}:Object\\.freeze`));
  }
  assert.match(gameSource, /function addEditorHudControl\(/);
  assert.match(gameSource, /function ensureDefaultHudControls\(/);
  assert.match(gameSource, /function ensureDefaultHudSettingControl\(/);
  assert.match(gameSource, /editorAssetType:"hud-control"/);
  assert.match(gameSource, /hudControlsSeeded/);
  assert.match(gameSource, /hudSettingsSeeded/);
  assert.match(gameSource, /function runHudControlAction\(/);
  assert.match(gameSource, /if\(type==="hud-control"\)return \[sceneBranch,\{id:"scene\/hud"/);
  assert.match(gameSource, /folderId:"hud\/system",hudControlId:controlId/);
  assert.match(indexSource, /id="editor-hud-help"/);
  assert.doesNotMatch(indexSource, /id="game-settings"/);
  assert.match(gameSource, /gameplaySettings=type==="hud-control"&&widget\.userData\.hudControlId==="settings"/);
  assert.match(gameSource, /mode==="editor"\|\|\(\(gameplayHud\|\|gameplaySettings\)&&\["playing","paused"\]\.includes\(mode\)\)/);
  assert.match(styleSource, /\.hud-controls-ready \.topbar\{display:none!important\}/);
  assert.match(styleSource, /body:not\(\.editor-active\) #hud>\.topbar,body:not\(\.editor-active\) #objective\{display:none!important\}/);
  assert.doesNotMatch(styleSource, /#game-settings/);
  assert.match(styleSource, /\.editor-active \.placed-hud-control\{cursor:grab/);
});
