import { access, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const root = resolve(".");
const required = [
  "index.html", "logic.js", "game.js", "strings.js", "styles.css", "tools/serve.mjs", "tools/smoke-local.mjs",
  "vendor/three.module.js", "vendor/three.core.js", "vendor/loaders/GLTFLoader.js", "vendor/utils/BufferGeometryUtils.js", "src/sim.js", "sim-runtime-20260724j.js", "design/plan.md", "design/gameplay-glossary.md",
  "design/assets.csv", "design/thresholds.md",
  "assets/battle_music.m4a", "assets/move_confirm.mp3", "assets/conversion_rise.mp3",
  "Models/CH_Mastert.glb", "Models/CH_Servant.glb", "Models/Enemy_master.glb", "Models/Enemy_Servant.glb"
];
for (const file of required) await access(resolve(root, file));

const sources = await Promise.all(["index.html", "game.js", "styles.css"].map(async file => [file, await readFile(resolve(root, file), "utf8")]));
const gameSource = sources.find(([file]) => file === "game.js")[1];
const simulationSource = await readFile(resolve(root, "src/sim.js"), "utf8");
const runtimeSimulationSource = await readFile(resolve(root, "sim-runtime-20260724j.js"), "utf8");
if (runtimeSimulationSource !== simulationSource) {
  throw new Error("Deployed simulation runtime differs from the tested source module");
}
if (!gameSource.includes('from "./sim-runtime-20260724j.js"')) {
  throw new Error("Game must import the immutable root simulation runtime");
}
if (/\bwater\.material\b/.test(gameSource)) {
  throw new Error("Stale water mesh reference would stop the render loop");
}
for (const contract of [
  ["new THREE.CanvasTexture(canvas)", "Grid ground must be generated as a canvas texture"],
  ["tile.material=gridGroundMaterial", "Every streamed tile must share the grid ground material"],
  ["tile.position.set((x+.5)*TILE_SIZE,.01", "Floor tiles must remain coplanar without overscan"]
]) {
  if (!gameSource.includes(contract[0])) throw new Error(contract[1]);
}
if (gameSource.includes("terrain_floor_v2.png") || /new THREE\.(?:Line|LineSegments)\b/.test(gameSource)) {
  throw new Error("Grid rollback must not load the painted terrain or use overlapping line geometry");
}
const refs = [];
for (const [file, text] of sources) {
  for (const match of text.matchAll(/(?:src|href)=["']([^"']+)["']|(?:new Audio\()(["'])([^"']+)\2/g)) {
    const ref = match[1] ?? match[3];
    if (!ref || ref.startsWith("#") || ref.startsWith("data:")) continue;
    if (/^(?:https?:)?\/\//.test(ref) || ref.startsWith("/")) throw new Error(`Non-relative reference in ${file}: ${ref}`);
    refs.push([file, ref]);
  }
}
for (const [file, ref] of refs) await access(resolve(dirname(resolve(root, file)), ref));

const logic = await import(pathToFileURL(resolve(root, "logic.js")));
for (const name of ["meta", "setup", "validateAction", "applyAction", "isGameOver", "viewFor"]) {
  if (!(name in logic)) throw new Error(`Missing logic export: ${name}`);
}
console.log(`Verified ${required.length} contract files, ${refs.length} relative asset references, and all logic exports.`);
