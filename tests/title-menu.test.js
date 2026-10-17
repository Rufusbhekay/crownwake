import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const indexSource = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const gameSource = readFileSync(new URL("../game.js", import.meta.url), "utf8");
const styleSource = readFileSync(new URL("../styles.css", import.meta.url), "utf8");

test("title screen presents the Horde Base menu and connects every action", () => {
  assert.match(indexSource, /<title>Horde Base<\/title>/);
  for (const label of ["NEW GAME", "CONTINUE", "MY HORDE", "SETTINGS", "EXIT GAME"]) assert.match(indexSource, new RegExp(`>${label}<`));
  assert.match(indexSource, /id="continue-game"/);
  assert.match(indexSource, /id="my-horde"/);
  assert.match(indexSource, /id="title-settings"/);
  assert.match(indexSource, /id="exit-game"/);
  assert.match(styleSource, /horde-base-title-wallpaper\.png/);
  assert.match(gameSource, /CURRENT_PROGRESS_ORIGIN="http:\/\/127\.0\.0\.1:4173"/);
  assert.match(gameSource, /function startNewGame\(\)\{\s*if\(location\.origin!==CURRENT_PROGRESS_ORIGIN\)\{location\.assign\(`\$\{CURRENT_PROGRESS_ORIGIN\}\/\?play-current=1`\);return\}\s*start\(\);\s*\}/);
  assert.match(gameSource, /if\(OPEN_CURRENT_PROGRESS\)\{history\.replaceState\(null,"",location\.pathname\);start\(\)\}/);
  assert.match(gameSource, /\$\("continue-game"\)\.onclick=start/);
  assert.match(gameSource, /\$\("my-horde"\)\.onclick=openTitleSettings/);
  assert.match(gameSource, /\$\("title-settings"\)\.onclick=openTitleSettings/);
  assert.match(gameSource, /\$\("exit-game"\)\.onclick=exitTitleGame/);
});
