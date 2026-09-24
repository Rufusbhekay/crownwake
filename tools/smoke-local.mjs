const baseUrl = process.env.CROWNWAKE_URL ?? "http://127.0.0.1:4173";
const checks = [
  ["/Models/crownwake-swordsman-v02.glb", "model/gltf-binary"],
  ["/src/character-animation.js", "text/javascript"],
  ["/vendor/utils/SkeletonUtils.js", "text/javascript"],
  ["/", "text/html"],
  ["/game.js", "text/javascript"],
  ["/sim-runtime-20260724g.js", "text/javascript"],
  ["/Models/CH_Model.glb", "model/gltf-binary"],
  ["/Models/Crownwake_Base.glb", "model/gltf-binary"],
  ["/Models/Forest_House_Fence_01.glb", "model/gltf-binary"],
  ["/Models/Forest_House_Fence_02.glb", "model/gltf-binary"],
  ["/Models/Forest_House_Fence_03.glb", "model/gltf-binary"],
  ["/Models/Forest_House_Fence_04.glb", "model/gltf-binary"],
  ["/assets/battle_music.m4a", "audio/mp4"]
];
const removedFoliagePaths = [
  "/assets/environment/edge_streak_lines.png",
  "/assets/foliage/bush_round_green_01.png",
  "/assets/grass/bush_wide_leafy_01.png",
  "/assets/grass/bush_tall_leafy_01.png",
  "/assets/grass/bush_round_leafy_01.png"
];

for (const [path, expectedType] of checks) {
  const response = await fetch(`${baseUrl}${path}`);
  const actualType = response.headers.get("content-type") ?? "";
  if (!response.ok || !actualType.startsWith(expectedType)) {
    throw new Error(`${path}: expected 200 ${expectedType}, received ${response.status} ${actualType}`);
  }
  console.log(`${response.status} ${expectedType} ${path}`);
}
for (const path of removedFoliagePaths) {
  const response = await fetch(`${baseUrl}${path}`);
  if (response.ok) throw new Error(`Removed foliage is still publicly served: ${path}`);
}

const gameSource = await (await fetch(`${baseUrl}/game.js`)).text();
if (!gameSource.includes('from "./sim-runtime-20260724g.js"')) {
  throw new Error("The served game does not import the current immutable simulation runtime");
}
if (!gameSource.includes("const WORLD_FLOOR_BASE_SIZE=64") ||
    !gameSource.includes('floor.userData.editorAssetType="world-floor"') ||
    gameSource.includes("updateFloorTiles()")) {
  throw new Error("The served game must use the finite editable world-space level plane.");
}
for (const removedMaskToken of ["FLOOR_MASK_", "floorMaskScale", "meadowFloorFade", "meadowFloorMask", "edgeStreak", "meadowEdgeStreak", "floorEdgeFade", "edgeStreakFade"]) {
  if (gameSource.includes(removedMaskToken)) throw new Error(`The served build still contains masking code: ${removedMaskToken}`);
}
if (/\bBUSH_|\bbush-sprite\b|assets\/(?:foliage|grass)\/bush/i.test(gameSource)) {
  throw new Error("The served build still contains removed bush foliage.");
}
const grassCategoriesSource = gameSource.match(
  /const\s+GRASS_CLUSTER_CATEGORIES\s*=\s*\[([\s\S]*?)\];/
)?.[1] ?? "";
if (!grassCategoriesSource.includes('id:"medium",label:"MEDIUM",count:9') ||
    !grassCategoriesSource.includes('id:"extreme-dense",label:"EXTREME DENSE",count:40,radius:1.1') ||
    ["small", "dense", "super-dense"].some(id => grassCategoriesSource.includes(`id:"${id}"`))) {
  throw new Error("The served grass library must retain only Medium and Extreme Dense categories.");
}
if (!gameSource.includes("cluster.userData.grassSafeProximity=") ||
    !gameSource.includes("Math.min(GRASS_WIND.proximity,cluster.userData.grassSafeProximity")) {
  throw new Error("Grass proximity must stop before camera-facing blade geometry overlaps.");
}
if (!gameSource.includes('shape.lineTo(halfWidth,height);shape.lineTo(-halfWidth,height);shape.closePath();')) {
  throw new Error("The served grass must use the restored square-ended blade silhouette.");
}
if (gameSource.includes('if(!editorObjects.some(object=>object.userData.editorAssetType==="grass-cluster"))')) {
  throw new Error("Grass foliage must not be placed automatically in the level.");
}

console.log(`Crownwake localhost smoke test passed at ${baseUrl}/`);
