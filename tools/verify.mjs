import { access, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const root = resolve(".");
const required = [
  "index.html", "logic.js", "game.js", "strings.js", "styles.css", "tools/serve.mjs", "tools/smoke-local.mjs",
  "vendor/three.module.js", "vendor/three.core.js", "vendor/loaders/GLTFLoader.js", "vendor/utils/BufferGeometryUtils.js", "src/sim.js", "sim-runtime-20260724g.js", "design/plan.md", "design/gameplay-glossary.md",
  "design/assets.csv", "design/thresholds.md",
  "assets/battle_music.m4a", "assets/move_confirm.mp3", "assets/conversion_rise.mp3",
  "assets/grass/sprite-grass-01.png", "assets/grass/sprite-grass-02.png", "assets/grass/sprite-grass-03.png", "assets/grass/sprite-grass-04.png",
  "Models/CH_Mastert.glb", "Models/CH_Servant.glb", "Models/Enemy_master.glb", "Models/Enemy_Servant.glb", "Models/Forest_House_Fence_01.glb", "Models/Forest_House_Fence_02.glb", "Models/Forest_House_Fence_03.glb", "Models/Forest_House_Fence_04.glb", "CREDITS.md"
];
for (const file of required) await access(resolve(root, file));
const removedFoliageAssets = [
  "assets/environment/edge_streak_lines.png",
  "assets/foliage/bush_round_green_01.png",
  "assets/grass/bush_wide_leafy_01.png",
  "assets/grass/bush_tall_leafy_01.png",
  "assets/grass/bush_round_leafy_01.png"
];
for (const file of removedFoliageAssets) {
  try {
    await access(resolve(root, file));
    throw new Error(`Removed foliage asset still exists: ${file}`);
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
}

const sources = await Promise.all(["index.html", "game.js", "styles.css"].map(async file => [file, await readFile(resolve(root, file), "utf8")]));
const indexSource = sources.find(([file]) => file === "index.html")[1];
const gameSource = sources.find(([file]) => file === "game.js")[1];
const styleSource = sources.find(([file]) => file === "styles.css")[1];
const simulationSource = await readFile(resolve(root, "src/sim.js"), "utf8");
const runtimeSimulationSource = await readFile(resolve(root, "sim-runtime-20260724g.js"), "utf8");
if (runtimeSimulationSource !== simulationSource) {
  throw new Error("Deployed simulation runtime differs from the tested source module");
}
if (!gameSource.includes('from "./sim-runtime-20260724g.js"')) {
  throw new Error("Game must import the immutable root simulation runtime");
}
if (!gameSource.includes("for(const branchId of editorOutlinerBranchIds(object))editorOutlinerExpanded.add(branchId)")) {
  throw new Error("Selecting a level asset must reveal its row in the World Outliner");
}
for (const contract of [
  ['id="editor-shell"', "Level Editor must use one docked application shell"],
  ['id="editor-context-panel"', "Level Editor must provide a contextual left panel"],
  ['id="editor-right-dock"', "Level Editor must provide a permanent right dock"],
  ['id="editor-inspector"', "Level Editor must provide a context-sensitive inspector"],
  ['id="world-outliner-search"', "World Outliner must provide search"],
  ['id="editor-context-select"', "Editor tool rail must expose Select context"],
  ['id="editor-context-assets"', "Editor tool rail must expose a dedicated Assets context"],
  ['id="editor-context-foliage"', "Editor tool rail must expose Foliage context"],
  ['id="editor-context-environment"', "Editor tool rail must expose Environment context"],
  ['id="editor-maximize"', "Editor toolbar must expose viewport maximize"],
  ['id="editor-save"', "Editor toolbar must expose persistent Save"],
  ['id="editor-left-resizer"', "Editor left dock must be resizable"],
  ['id="editor-right-resizer"', "Editor right dock must be resizable"]
]) {
  if (!indexSource.includes(contract[0])) throw new Error(contract[1]);
}
for (const contract of [
  ['const EDITOR_LAYOUT_STORAGE_KEY="crownwake-editor-layout-v1"', "Editor dock layout must persist locally"],
  ['function setEditorContext(context)', "Editor must switch one active left-tool context"],
  ['function ensureEditorCameraObject()', "Editor must expose a selectable camera scene object"],
  ['function toggleEditorViewportMaximize()', "Tab must maximize the viewport"],
  ['function saveEditorSession()', "Editor must expose a save action without leaving playtest"],
  ['function updateEditorInspector()', "Inspector must respond to editor context and selection"],
  ['world-outliner-search', "World Outliner search must be wired"],
  ['Conifer ${variant.label}', "World Outliner must dynamically group conifer types"]
]) {
  if (!gameSource.includes(contract[0])) throw new Error(contract[1]);
}
const restoreSnapshotSource = gameSource.slice(
  gameSource.indexOf("function restoreEditorSnapshot(snapshot)"),
  gameSource.indexOf("function undoEditorAction()")
);
if (!restoreSnapshotSource.includes("removeEditorCameraObject();") ||
    !restoreSnapshotSource.includes("ensureEditorCameraObject();")) {
  throw new Error("Undo must reconstruct the editor camera in the scene and World Outliner");
}
if (!gameSource.includes("function detachEditorActorFromCombat(object)")) {
  throw new Error("Editor actors must have a shared combat-roster cleanup path");
}
if (!restoreSnapshotSource.includes("detachEditorActorFromCombat(object)")) {
  throw new Error("Undo restore must remove discarded editor actors from combat rosters");
}
const removeEditorObjectSource = gameSource.slice(
  gameSource.indexOf("function removeEditorObject(object)"),
  gameSource.indexOf("function deleteEditorSelection()")
);
if (!removeEditorObjectSource.includes("detachEditorActorFromCombat(object)")) {
  throw new Error("Deleting an editor actor must remove it from combat rosters");
}
const startSource = gameSource.slice(gameSource.indexOf("function start()"), gameSource.indexOf('$("begin").onclick'));
if (!startSource.includes("removeUnplacedEnemyActors()")) {
  throw new Error("Starting play must purge enemies that were not placed in the level editor");
}
for (const contract of [
  ['.editor-shell{', "Editor shell must have dedicated docked layout styles"],
  ['grid-template-areas:', "Editor shell must reserve explicit toolbar, rail, viewport, dock and status regions"],
  ['body.editor-active #game{', "Editor canvas must resize into the docked viewport"],
  ['.editor-right-dock{', "Right editor panels must share a dock"],
  ['.editor-context-panel{', "Left editor controls must share a contextual dock"]
]) {
  if (!styleSource.includes(contract[0])) throw new Error(contract[1]);
}
if (!styleSource.includes(".world-outliner-row.selected{background:#fff;color:#202725")) {
  throw new Error("The selected World Outliner row must use a full-width white highlight with dark text");
}
for (const contract of [
  ['id="foliage-paint-panel"', "Foliage paint mode must expose compact brush controls"],
  ['data-foliage-paint-setting="brushSize"', "Foliage paint must expose brush size"],
  ['data-foliage-paint-setting="paintAmount"', "Foliage paint must expose paint amount"],
  ['data-foliage-paint-setting="scaleVariation"', "Foliage paint must expose scale variation"],
  ['id="foliage-paint-assets"', "Foliage paint must expose selectable foliage types"],
  ['id="world-look-panel"', "Level Editor must include a dedicated lighting and post-processing panel"],
  ['id="editor-environment-slot"', "Environment controls must render in the left Environment context"],
  ['id="inspector-camera-section"', "Camera selection must reveal camera-specific inspector controls"],
  ['data-world-look-setting="toneMapping"', "The World Look panel must expose tone mapping"],
  ['data-world-look-setting="exposure"', "The World Look panel must expose exposure"],
  ['data-world-look-setting="hemisphereIntensity"', "The World Look panel must expose hemisphere light strength"],
  ['data-world-look-setting="sunIntensity"', "The World Look panel must expose sun intensity"],
  ['data-world-look-setting="sunColor"', "The World Look panel must expose sun colour"],
  ['data-world-look-setting="shadowType"', "The World Look panel must expose shadow type"],
  ['data-world-look-setting="shadowRadius"', "The World Look panel must expose shadow softness"],
  ['data-world-look-setting="background"', "The World Look panel must expose sky colour"],
  ['data-world-look-setting="fogDensity"', "The World Look panel must expose distance fog"],
  ['data-world-look-setting="meadowRoughness"', "The World Look panel must expose meadow roughness"],
  ['data-world-look-setting="meadowMetalness"', "The World Look panel must expose meadow metalness"],
  ['data-world-look-setting="cameraZoom"', "The World Look panel must expose persistent gameplay camera zoom"],
  ['id="editor-duplicate"', "World Tools must include a full-width Duplicate action"],
  ['id="foliage-panel"', "Selecting foliage must expose a dedicated wind tuning panel"],
  ['id="foliage-panel-title"', "The foliage panel must identify the selected foliage type"],
  ['id="foliage-preset-load"', "The foliage panel must expose saved presets"],
  ['id="foliage-preset-save"', "The foliage panel must save the active wind tuning"],
  ['id="foliage-presets-panel"', "Foliage presets must open in a dedicated side panel"],
  ['id="foliage-preset-apply"', "A selected foliage preset must expose a load action"],
  ['id="foliage-preset-delete"', "A selected foliage preset must expose a delete action"],
  ['data-foliage-setting="windSpeed"', "The foliage panel must provide a wind speed slider"],
  ['data-foliage-setting="proximity"', "The foliage panel must provide a grass proximity slider"],
  ['data-foliage-setting="maxBendAngle"', "The foliage panel must provide a maximum bend slider"]
]) {
  if (!indexSource.includes(contract[0])) throw new Error(contract[1]);
}
for (const contract of [
  ['editorFoliageObjects=new Set()', "Foliage painting must maintain a dedicated foliage registry"],
  ['function setFoliagePaintActive(active)', "World Tools must toggle a dedicated foliage paint mode"],
  ['function stampFoliagePaint(point)', "Foliage paint must stamp in world space"],
  ['function updateFoliagePaintBrush(point)', "Foliage paint must display a terrain-anchored brush ring"],
  ['function renderFoliagePaintChoices()', "Foliage paint must render selectable foliage types"],
  ['function editorOutlinerPath(object)', "World Outliner must expose recursive category paths"],
  ['function buildEditorOutlinerTree()', "World Outliner must build a collapsible hierarchy"],
  ['for(const branchId of editorOutlinerBranchIds(object))editorOutlinerExpanded.add(branchId)', "Scene selection must reveal every ancestor branch in the outliner"]
]) {
  if (!gameSource.includes(contract[0])) throw new Error(contract[1]);
}
if (!styleSource.includes(".foliage-panel{")) {
  throw new Error("The foliage controls must use a dedicated lower-left editor panel");
}
if (!styleSource.includes(".foliage-paint-choice.selected") || !styleSource.includes("background:#f7f2dfbf")) {
  throw new Error("Foliage paint choices and editor panels must remain visibly selectable and translucent");
}
if (!styleSource.includes(".foliage-presets-panel{")) {
  throw new Error("Saved foliage presets must use a compact panel beside the foliage controls");
}
if (!gameSource.includes("function worldCameraZoom()")) throw new Error("World Look must retain gameplay camera zoom control");
for (const removedMaskToken of [
  "FLOOR_MASK_", "floorMaskScale", "meadowFloorFade", "meadowFloorMask", "edgeStreak", "meadowEdgeStreak",
  "floorEdgeFade", "edgeStreakFade", "focusMaskScene", "ovalDistance"
]) {
  if (gameSource.includes(removedMaskToken)) throw new Error(`Removed masking code still exists: ${removedMaskToken}`);
}
for (const removedMaskUi of ['id="vignette"', 'data-world-look-setting="maskExtent"', "EDGE STREAKS", "edgeStreak"]) {
  if (indexSource.includes(removedMaskUi)) throw new Error(`Removed masking UI still exists: ${removedMaskUi}`);
}
if ((gameSource.match(/cameraDistanceScale\/worldCameraZoom\(\)/g) || []).length < 2) {
  throw new Error("The saved World Tools camera zoom must apply in both editor and gameplay camera modes");
}
if (styleSource.includes("#vignette") || styleSource.includes(".world-look-section-heading")) throw new Error("Removed masking styles still exist");
for (const contract of [
  ['id:"medium",label:"MEDIUM",count:9', "Grass library must retain the nine-blade Medium category"],
  ['id:"extreme-dense",label:"EXTREME DENSE",count:40,radius:1.1,seed:0xe71e5,spacingScale:.5', "Grass library must include a forty-blade Extreme Dense category with a non-overlapping footprint"],
  ['const GRASS_CLUSTER_VERSION_COUNT=2,GRASS_CLUSTER_SECONDARY_SPREAD=1.55', "Every grass category must include a more widely spaced second version"],
  ['const GRASS_PLACEMENT_CANDIDATES=192,GRASS_MAX_VISIBLE_WIDTH_SCALE=1.17,GRASS_EDGE_GAP=.02', "Grass placement must reserve clearance for the rendered blade and outline width"],
  ['const GRASS_CLUSTER_VARIANT_DEFINITIONS=GRASS_CLUSTER_CATEGORIES.flatMap(category=>[', "Only retained grass categories should generate editor variants"],
  ['spacingScale:(category.spacingScale??1)*GRASS_CLUSTER_SECONDARY_SPREAD', "Wider grass versions must preserve their category density ratio"],
  ['shape.moveTo(-halfWidth,0);shape.lineTo(halfWidth,0);shape.lineTo(halfWidth,height);shape.lineTo(-halfWidth,height);shape.closePath();', "Grass blades must use the restored flat-topped rectangular silhouette"],
  ['const GRASS_BLADE_PALETTE=Object.freeze([', "Grass blades must use a controlled multi-shade green palette"],
  ['const FOLIAGE_OUTLINE_COLOR=0x172019', "Tree and grass foliage must share a restrained dark edge colour"],
  ['function meadowGrassBladeGeometry(width,height)', "The Grass asset library must include a distinct soft meadow-blade mesh for dense future clusters"],
  ['function addMeadowGrassBlade({x,z,y=GROUND_Y,turn=0,rotation=null,scale=null})', "The new meadow grass blade must be a placeable and saved level asset"],
  ['if(assetId==="meadow-grass-blade")', "The meadow grass blade must be selectable from the editor asset library"],
  ['const canopyEdges=new THREE.LineSegments(new THREE.EdgesGeometry(canopyGeometry)', "Procedural tree outlines must use edge lines instead of overlapping canopy faces"],
  ['const fill=new THREE.Mesh(geometry,fillMaterial);fill.position.y=height*.5;fill.castShadow=false;fill.receiveShadow=false;group.add(fill);return group;', "Billboard foliage must avoid duplicate transparent texture planes"],
  ['const SPRITE_GRASS_ASSETS=Object.freeze([', "The four approved grass sprites must be registered as independent assets"],
  ['function makeOutlinedFoliageBillboard(', "Billboard foliage must share the same slight dark edge treatment"],
  ['function addGrassSpriteBillboard(', "Approved grass sprites must be placeable as animated billboard foliage"],
  ['const GRASS_BLADE_MATERIALS=GRASS_BLADE_PALETTE.map(color=>mat(color))', "Grass palette shades must remain solid shared materials"],
  ['grassWindVariation(seed+97.3)*GRASS_BLADE_MATERIALS.length', "Grass shade variation must be deterministic per blade"],
  ['const GRASS_WIND=Object.seal({', "Grass movement must expose one live-tunable wind configuration"],
  ['const TREE_WIND=Object.seal({', "Tree movement must expose a separate live-tunable wind configuration"],
  ['{key:"proximity",label:"Proximity",min:.5,max:2,step:.05,digits:2,unit:"x",kinds:["grass"]}', "Grass proximity must be a bounded grass-only foliage control"],
  ['function applyGrassProximity()', "Grass proximity changes must update existing grass clusters live"],
  ['cluster.userData.grassSafeProximity=', "Every grass cluster must cap proximity before its blade geometry intersects"],
  ['blade.userData.grassBasePosition=', "Grass blades must preserve their authored positions for reversible proximity changes"],
  ['const proximityScale=1/Math.min(GRASS_WIND.proximity,cluster.userData.grassSafeProximity', "Higher grass proximity values must tighten blade spacing without crossing the safe geometry limit"],
  ['const FOLIAGE_WIND_STORAGE_KEY="crownwake-foliage-wind-v1"', "Foliage tuning must persist across browser reloads"],
  ['const TREE_WIND_STORAGE_KEY="crownwake-tree-wind-v1"', "Tree wind tuning must persist independently across browser reloads"],
  ['const FOLIAGE_PRESET_LIMIT=5', "Each foliage type must be limited to five saved preset slots"],
  ['const FOLIAGE_PRESET_STORAGE_KEY="crownwake-foliage-presets-v1"', "Foliage preset slots must persist across browser reloads"],
  ['function saveCurrentFoliagePreset()', "The current foliage tuning must be savable into a preset slot"],
  ['function loadSelectedFoliagePreset()', "A selected foliage preset must restore all live controls"],
  ['function deleteSelectedFoliagePreset()', "Saved foliage preset slots must be deletable"],
  ['function applyFoliageControl(input)', "Foliage sliders must update the live wind simulation"],
  ['function updateFoliagePanel()', "Foliage selection must control panel visibility"],
  ['function positionFoliagePanel()', "The foliage panel must remain in the lower-left editor space without covering World Tools"],
  ['["grass-cluster","tree-cluster","tree-billboard"].includes(editorSelection?.userData?.editorAssetType)', "The foliage panel must open for both grass and tree selections"],
  ['const TALL_CONIFER_VARIANTS=Object.freeze([', "The Trees library must provide named tall-conifer size variations"],
  ['{id:"medium",label:"MEDIUM",scale:1}', "The current tall-conifer scale must remain the Medium reference"],
  ['const coniferVariant=/^tree-billboard:(\\d+)$/.exec(assetId)', "Each tall-conifer variation must be placeable from the Trees library"],
  ['windSpeed:4.5,\n  baseWindStrength:.64,\n  gustStrength:1.6,', "Grass must use the requested 4.5 wind speed with the stronger force settings"],
  ['springStrength:14,', "Grass must react with the requested doubled spring strength"],
  ['secondaryMovement:.3', "Grass must use doubled secondary sway for obvious motion"],
  ['maxBendAngle:THREE.MathUtils.degToRad(30)', "Grass must support the requested thirty-degree maximum front-facing bend"],
  ['const blade=new THREE.Group(),sway=new THREE.Group()', "Grass blades must separate fixed facing from their animated front-axis sway"],
  ['polygonOffset:true,polygonOffsetFactor:1,polygonOffsetUnits:1', "Grass outlines must not z-fight with their coplanar fill geometry"],
  ['const gustBoost=1+GRASS_WIND.gustStrength*smoothWindPulse(gustCarrier)*.35', "Grass gusts must preserve visible angular travel instead of remaining pinned at the bend limit"],
  ['sway.rotation.x=-frontBend;sway.rotation.z=0', "Grass must bend through its thin front-to-back axis in the requested opposite direction"],
  ['function updateGrassWind(delta)', "Grass movement must be updated by the render loop"],
  ['function updateTreeWind(delta)', "Tree movement must be updated by the render loop"],
  ['tree.userData.treeWind=', "Every procedural tree must retain an independent wind state"],
  ['function duplicateEditorSelection()', "Selected level assets must be duplicable"],
  ['const sources=[...editorSelectedObjects].filter(object=>editorObjects.includes(object)&&!object.userData.editorProtected);if(!sources.length)return;', "Duplicate must operate on every selected non-protected level asset"],
  ['for(const source of sources){', "Duplicate must iterate through the complete selected set"],
  ['const duplicate=addLevelAsset({...record,x:record.x+1.4,z:record.z+1.4});', "Duplicated assets must retain their serialized properties and appear at a common movable offset"],
  ['setEditorSelection(duplicates,duplicates.at(-1),duplicates.at(-1));', "Newly duplicated assets must remain selected as a group"],
  ['selectedTransforms:[...editorSelectedObjects].filter(object=>editorObjects.includes(object)).map(', "Transform tools must capture the complete selected set"],
  ['for(const transform of state.selectedTransforms)transform.object.position[axis]=transform.position[axis]+point[axis]-state.startPoint[axis];', "Move must apply one shared delta to every selected asset"],
  ['windPhase=worldAlongWind*GRASS_WIND.spatialFrequency-grassWindTime*GRASS_WIND.windSpeed', "Grass gusts must travel coherently through world space"],
  ['const windBend=(GRASS_WIND.baseWindStrength*slowBase', "Grass wind strength must produce a visible angular bend before the maximum-angle clamp"],
  ['if(mode==="playing"||editorMode)', "Grass wind must remain visible while arranging vegetation in the Level Editor"],
  ['Math.pow(GRASS_WIND.damping,frameDelta*60)', "Grass must recover through a damped spring rather than snapping"],
  ['for(let versionIndex=0;versionIndex<GRASS_CLUSTER_VERSION_COUNT;versionIndex++)', "Every grass density folder must render both versions"],
  ['record.variantIndex=object.userData.variantIndex', "Saved grass clusters must retain their density variant"],
  ['/^grass\\/(.+)$/.exec(folderId)', "Grass assets must expose nested density folders in the Grass library"]
  ,['function renderSpriteGrassAssets(list)', "The Grass library must render each approved sprite independently"]
  ,['folderId==="grass/sprites"', "The Grass library must expose the approved sprite collection"]
]) {
  if (!gameSource.includes(contract[0])) throw new Error(contract[1]);
}
if (indexSource.includes('id="editor-copy-properties"') || gameSource.includes('function copyEditorAssetProperties()')) {
  throw new Error("Copy Properties must be removed from World Tools");
}
if (!gameSource.includes('const WORLD_LOOK_STORAGE_KEY="crownwake-world-look-v1"') ||
    !gameSource.includes('function applyWorldLookControl(input)') ||
    !gameSource.includes('renderer.toneMapping=TONE_MAPPING_MODES[worldLook.toneMapping]') ||
    !gameSource.includes('scene.fog.density=baseFogDensity*FOG_REFERENCE_CAMERA_DISTANCE/cameraDistance')) {
  throw new Error("World Look controls must persist and update the live renderer, lights, and camera-compensated fog");
}
if (!styleSource.includes('.editor-active .deployment-options,.editor-active .army-button{display:none!important}')) {
  throw new Error("Deployment batch controls must be hidden in Level Editor mode");
}
const grassCategoriesSource = gameSource.match(/const\s+GRASS_CLUSTER_CATEGORIES\s*=\s*\[([\s\S]*?)\];/)?.[1] ?? "";
for (const removedCategory of ["small", "dense", "super-dense"]) {
  if (grassCategoriesSource.includes(`id:"${removedCategory}"`)) {
    throw new Error(`Removed grass category still present: ${removedCategory}`);
  }
}
if (/\bBUSH_|\bbush-sprite\b|\baddBushSprite\b|assets\/(?:foliage|grass)\/bush/i.test(gameSource)) {
  throw new Error("Bush foliage must be removed from the level and asset library");
}
if (gameSource.includes("height*.82") || gameSource.includes("tipOffset")) {
  throw new Error("Pointed grass geometry must be replaced by the original square-ended silhouette");
}
if (!gameSource.includes("LEGACY_LEVEL_LAYOUT_VERSION=1,LEVEL_LAYOUT_VERSION=2") ||
    !gameSource.includes('if(record.type==="grass-cluster"&&layout.version===LEGACY_LEVEL_LAYOUT_VERSION)continue;') ||
    !gameSource.includes('if(record.type==="bush"+"-sprite")continue;') ||
    !gameSource.includes('if(layout.version===LEGACY_LEVEL_LAYOUT_VERSION)saveLevelLayout();')) {
  throw new Error("Legacy saved layouts must discard old foliage without removing other level assets");
}
if (!gameSource.includes('LEGACY_EDITOR_ASSET_LIBRARY_KEY="crownwake-editor-asset-library-v1",EDITOR_ASSET_LIBRARY_KEY="crownwake-editor-asset-library-v2"') ||
    !gameSource.includes('!/^grass-cluster(?::|$)/.test(value)&&!/bush/i.test(value)')) {
  throw new Error("Legacy hidden-asset preferences must not alias the retained grass categories");
}
if (gameSource.includes("applyGrassBladeGradient")) {
  throw new Error("Grass blades must use solid colors without a vertical gradient");
}
if (/\bwater\.material\b/.test(gameSource)) {
  throw new Error("Stale water mesh reference would stop the render loop");
}
for (const contract of [
  ["function makeMeadowGroundMaterial()", "Ground must use the seamless muted meadow material"],
  ["const MEADOW_GROUND_VARIANTS=Object.freeze({", "Meadow terrain directions must remain configurable as reusable variants"],
  ["const ACTIVE_MEADOW_GROUND_VARIANT=\"illustrated-sage\"", "The approved illustrated sage direction must be selected"],
  ["broadStrength:.09,microStrength:.035,fleckStrength:.15", "The illustrated meadow must remain mostly clear with restrained tonal variation"],
  ["float meadowFleck(vec2 p)", "The meadow material must add sparse illustrated flecks rather than broad dry patches"],
  ["float fleckEnabled=step(.83,meadowHash(cell+97.3));", "The meadow shader must avoid the reserved GLSL identifier that prevents the floor from compiling"],
  ["const contactOcclusionMaterial=new THREE.ShaderMaterial({", "Grounded actors must use a subtle contact-occlusion material"],
  ["function addGroundContactOcclusion(actor,radius=.42,depth=.74)", "Soldiers must receive a stronger soft floor contact shade"],
  ["occlusionOpacity:{value:.2}", "Contact occlusion must remain controlled rather than darkening the terrain"],
  ["vMeadowWorldPosition", "Meadow variation must remain continuous in world space across the editable plane"],
  ["const WORLD_FLOOR_BASE_SIZE=64", "The level must use one finite world-space island plane"],
  ["function addWorldFloor(record={})", "The editable floor must have a dedicated creation path"],
  ['floor.userData.editorAssetType="world-floor"', "The floor must be selectable through the existing editor system"],
  ["floor.receiveShadow=true", "The editable floor must retain terrain shadows"],
  ['if(record.type==="world-floor")return addWorldFloor(record);', "Saved floor transforms must restore with the level"],
  ['return [sceneBranch,{id:"scene/ground",label:"GROUND"}];', "The World Outliner must expose the floor under the Scene Ground category"],
  ['function addPrimitiveCube({x,z,y=GROUND_Y,turn=0,rotation=null,scale=null})', "The editor must provide a reusable cube primitive"],
  ['if(record.type==="primitive-cube")return addPrimitiveCube({x:record.x,y,z:record.z,turn,rotation,scale});', "Saved cube transforms must restore with the level"],
  ['{id:"terrain",label:"TERRAIN",icon:', "The asset library must expose a Terrain folder"],
  ['if(assetId==="primitive-cube")', "The Terrain cube must be placeable from the asset library"],
  ['if(type==="primitive-cube")return "CUBE";', "Cube primitives must be identified in the World Outliner"]
]) {
  if (!gameSource.includes(contract[0])) throw new Error(contract[1]);
}
for (const removedStreamingToken of ["floorTileKeys(", "floorTiles", "updateFloorTiles()", "TILE_RADIUS"]) {
  if (gameSource.includes(removedStreamingToken)) throw new Error(`The finite editable floor must not retain streamed tile code: ${removedStreamingToken}`);
}
if (gameSource.includes("makeGridGroundMaterial") || gameSource.includes("new THREE.CanvasTexture(canvas)") || gameSource.includes("terrain_floor_v2.png") || gameSource.includes("gridLineMaterial")) {
  throw new Error("Meadow terrain must not restore the grid, paint texture, or overlapping line geometry");
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
