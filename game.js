import * as THREE from "./vendor/three.module.js";
import { GLTFExporter } from "./vendor/exporters/GLTFExporter.js";
import { GLTFLoader } from "./vendor/loaders/GLTFLoader.js";
import { attachCharacterAnimation, cloneAnimatedModel, queueCharacterStrike, updateCharacterAnimation } from "./src/character-animation.js";
import { BASE_MATERIAL_PRESETS, applyBaseMaterial } from "./src/base-materials.js";
import { STR } from "./strings.js";
import { DUEL_PHASE, DUEL_WAITING_DISTANCE, FACTION, FOLLOW_AWARENESS, SERVANT_MODE, SOLDIER_COMBAT_STATE, SOLDIER_HEALTH_WIDGET_DURATION, SOLDIER_REGEN_DELAY, SOLDIER_REGEN_DURATION, THREAT_FORMATION_SCALE, activeDuelRingState, actorCollisionProfile, actorDebugSnapshot, activeCombatantPoints, advanceDuelState, advanceFollowAwareness, advanceFormationSpread, advanceGroundFragment, advanceLaggingHealthBar, advancePathFailure, allocateDuelWaitingSlots, arrivalSpeed, battleApproachState, cameraBaselineAfterDivision, canApplyAttackDamage, canDivideCompany, canMaintainSoldierDuel, centeredPackOffset, chooseBalancedTargetIndex, chooseCommanderBlockerIndex, chooseCommanderTargetIndex, chooseHiddenSpawn, chooseLocalDetour, chooseNearestAvailablePair, combatVisualPose, commanderClearanceVector, commanderCombatProfile, commanderControlState, commanderFormationOffset, commanderRegenHealth, commanderTacticalWaypoint, companyCommandState, companyDivisionPlan, companyFormationOffset, companyLeaderMotion, defeatCinematicState, duelAttackHits, duelLungeDirection, duelPathFailureAction, editorPanVector, enemyWaveApproachAngle, environmentGrade, findNavigationPath, fittedGridSpec, formationExpansionOffset, gameplayCameraDistanceScale, gridCellsWithinBounds, hiddenWaveSpawn, hitKnockback, incomingWaveCameraState, isNavigationPlatformCube, isPlayerWaveDefeated, limitPointToRadius, lineOfSightBlocked, makeCampaign, navigationCellKey, nextDuelTurn, normalizePracticeConfig, particleBudgetAllows, persistentFragmentBudgetAllows, practiceEnemyHealthMultiplier, preserveLockedCombatants, resolveBoxOverlap, resolveCircleBoxOverlap, resolveDuelTurnId, separationVector, shouldRegroupPlayerGroup, shouldReleaseCombatCommitment, shouldRepositionFollower, smoothAngle, snapNavigationCell, soldierCombatState, soldierFragmentCount, soldierRegenHealth, soldierSpacingProfile, spawnPackOffset, standOffPursuitPoint, swarmTravelGroupCount, swarmTravelOffset, swarmTravelRadius, tacticalCameraFrame, tacticalCellAction, tacticalInputEnabled, tacticalSelectionScope, unitCommanderProfile } from "./sim-runtime-20260724g.js";
import { ENEMY_TARGET_REVIEW_INTERVAL, canDeploySoldier, deploymentPreviewCellState, deploymentReserveAfterDeploy, enemyTargetReviewDue, levelCameraFrame, navigationFootprintSupported, scatteredPackOffset, shouldRetargetToCloserOpponent, splitEnemyStats, walkableSurfaceCandidates } from "./sim-runtime-20260724g.js";
import { allocatePrioritizedDuelWaitingSlots, barracksEnemyCanClaimDuel, chooseAvailableBarracksAnchorSlot, chooseBarracksAnchor, choosePatrolGoal, patrolCohesionTarget, shouldClearStaleDuelState } from "./sim-runtime-20260724g.js";
import { celebrationWinner } from "./sim-runtime-20260724g.js";

const $ = id => document.getElementById(id);
const ENVIRONMENT=environmentGrade();
const WORLD_LOOK_STORAGE_KEY="crownwake-world-look-v1";
const WORLD_LOOK_DEFAULTS=Object.freeze({
  toneMapping:"aces",exposure:ENVIRONMENT.exposure,hemisphereIntensity:ENVIRONMENT.hemisphereIntensity,sunIntensity:ENVIRONMENT.sunIntensity,
  sunColor:"#f7f1df",shadowType:"pcfSoft",shadowRadius:4,background:"#8fa4a7",fogDensity:.013*.7,cameraZoom:1,
  meadowRoughness:.97,meadowMetalness:0
});
const TONE_MAPPING_MODES=Object.freeze({aces:THREE.ACESFilmicToneMapping,neutral:THREE.NeutralToneMapping,none:THREE.NoToneMapping});
const SHADOW_MAP_TYPES=Object.freeze({pcfSoft:THREE.PCFSoftShadowMap,pcf:THREE.PCFShadowMap,basic:THREE.BasicShadowMap});
function readWorldLook(){
  try{
    const stored=JSON.parse(localStorage.getItem(WORLD_LOOK_STORAGE_KEY)||"{}");
    return {...WORLD_LOOK_DEFAULTS,...Object.fromEntries(Object.entries(stored).filter(([key,value])=>key in WORLD_LOOK_DEFAULTS&&(typeof value==="number"?Number.isFinite(value):typeof value==="string")))};
  }catch{return {...WORLD_LOOK_DEFAULTS}}
}
let worldLook=readWorldLook();
for (const [id, key] of [["title","title"],["subtitle","subtitle"],["begin","begin"],["how-to","howTo"],["return","closeMap"],["army-label","army"],["territory-label","territory"],["objective","objective"],["map-hint","mapHint"],["fortify","lockedFortify"],["retry","retry"],["companies-kicker","yourArmy"],["companies-title","companies"],["companies-hint","companiesHint"],["companies-close","resume"]]) $(id).textContent = STR[key];
if(matchMedia("(pointer: coarse)").matches)$("how-to").textContent=STR.howToTouch;
$("divide-company").textContent=`\u2197 ${STR.divide}`;$("divide-company").setAttribute("aria-label",STR.divide);

const canvas = $("game");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: "high-performance" });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = TONE_MAPPING_MODES[worldLook.toneMapping]??THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = worldLook.exposure;

function worldCameraZoom(){return THREE.MathUtils.clamp(Number(worldLook.cameraZoom)||1,.6,1.8)}

const scene = new THREE.Scene();
scene.background = new THREE.Color(worldLook.background);
const ISOMETRIC_CAMERA_OFFSET=new THREE.Vector3(15,20,15);
const voidBackdropMaterial=new THREE.ShaderMaterial({
  depthTest:false,depthWrite:false,
  vertexShader:"varying vec2 vVoidUv;void main(){vVoidUv=uv;gl_Position=vec4(position.xy,0.0,1.0);}",
  fragmentShader:"varying vec2 vVoidUv;void main(){float vertical=smoothstep(0.0,1.0,vVoidUv.y);float glow=1.0-smoothstep(.12,.86,length((vVoidUv-.5)*vec2(1.0,.78)));vec3 voidColor=vec3(.027,.043,.047);vec3 horizonColor=vec3(.255,.305,.282);vec3 color=mix(voidColor,horizonColor,vertical*.78)+vec3(.038,.047,.031)*glow;gl_FragColor=vec4(color,1.0);}",
  toneMapped:false
});
const voidBackdrop=new THREE.Mesh(new THREE.PlaneGeometry(2,2),voidBackdropMaterial);
voidBackdrop.name="Void Backdrop";voidBackdrop.frustumCulled=false;voidBackdrop.renderOrder=-1000;scene.add(voidBackdrop);
// Keep the gentle distance haze consistent in screen space as the tactical
// camera widens.  Without this compensation, a battle zoom-out exposes more
// world distance and makes the same fog look noticeably heavier.
let baseFogDensity=worldLook.fogDensity;
const FOG_REFERENCE_CAMERA_DISTANCE = ISOMETRIC_CAMERA_OFFSET.length() * 1.38;
scene.fog = new THREE.FogExp2(worldLook.background, baseFogDensity);
const camera = new THREE.PerspectiveCamera(37, innerWidth / innerHeight, 0.1, 160);
camera.position.copy(ISOMETRIC_CAMERA_OFFSET);
const gameplayCameraFocus = new THREE.Vector3();
let gameplayCameraScale = 1;
let gameplayCameraBaselineScale = 1;
const debugMode = new URLSearchParams(location.search).has("dev");
let debugPanelVisible = false;
let debugFocusId = null;

const hemisphere=new THREE.HemisphereLight(0xf3f0e5, 0x566466, worldLook.hemisphereIntensity);
scene.add(hemisphere);
const sun = new THREE.DirectionalLight(worldLook.sunColor, worldLook.sunIntensity);
sun.position.set(-8, 18, 7); sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024); sun.shadow.camera.left = -30; sun.shadow.camera.right = 30; sun.shadow.camera.top = 30; sun.shadow.camera.bottom = -30;
sun.shadow.radius = 4; sun.shadow.bias = -.0004;
scene.add(sun,sun.target);

const COLORS = { player: 0x35c9c2, playerDark: 0x4383bd, coral: 0xef6d78, amber: 0xf2a40c, crown: 0x836bb7, warrior: 0xf7f2e4, master: 0xb94a4f, grass: 0xcdd69d, cliff: 0xf3f0df, water: 0xaec5c8, ink: 0x40565b };
const GROUND_Y=.015;
const battle = new THREE.Group(), overview = new THREE.Group();
scene.add(battle, overview); overview.visible = false;
const raycaster = new THREE.Raycaster(), pointer = new THREE.Vector2();
const clock = new THREE.Clock();
const hoverable = [];
const flags = [];
let rngState = 0xC0FFEE;
function rand() { rngState = (Math.imul(rngState, 1664525) + 1013904223) >>> 0; return rngState / 4294967296; }
const PRACTICE_CONFIG_KEY="crownwake-practice-config",TILE_BP_ASSET_ID="blueprint:tile",BASE_BP_ASSET_ID="blueprint:base",TOWN_HALL_BP_ASSET_ID="blueprint:town-hall",BARRACKS_BP_ASSET_ID="blueprint:barracks",ACTOR_PROGRESS_BAR_BP_ASSET_ID="blueprint:character-progress-bar",BUILDING_PROGRESS_BAR_BP_ASSET_ID="blueprint:building-progress-bar",CHARACTER_MODEL_ASSET_ID="model:ch",CROWNWAKE_BUILDING_MODEL_ASSET_ID="model:crownwake-building",CROWNWAKE_BASE_MODEL_ASSET_ID="model:crownwake-base";
const UNIT_RING_SETTINGS_KEY="crownwake-unit-ring-settings-v1";
const LEVEL_LAYOUT_KEY="crownwake-level-layout-v1",LEGACY_LEVEL_LAYOUT_VERSION=1,LEVEL_LAYOUT_VERSION=4,LEGACY_EDITOR_ASSET_LIBRARY_KEY="crownwake-editor-asset-library-v1",EDITOR_ASSET_LIBRARY_KEY="crownwake-editor-asset-library-v2";
const RAID_BUILDING_MAX_HP=480,RAID_BUILDING_ATTACK_RANGE=.36,COLLISION_FOOTPRINT_CELL_SIZE=.1,RAID_BUILDING_ATTACK_SLOT_BUFFER=.025,ACTOR_HEALTH_BAR_OFFSET=.2,RAID_BUILDING_HEALTH_BAR_OFFSET=1.12,RAID_BUILDING_ATTACK_APPROACH_DISTANCE=.72;
const RAID_BUILDING_WAIT_CLEARANCE=1.3,RAID_BUILDING_WAIT_RING_GAP=.8,RAID_BUILDING_WAIT_SLOTS_PER_RING=12;
const PROGRESS_BAR_BLUEPRINTS=Object.freeze({
  [ACTOR_PROGRESS_BAR_BP_ASSET_ID]:Object.freeze({backgroundColor:"#111b1f",mainColor:"#35c9c2",width:.74,height:.065}),
  [BUILDING_PROGRESS_BAR_BP_ASSET_ID]:Object.freeze({backgroundColor:"#000000",mainColor:"#ef6d78",width:4.625,height:.075})
});
const SWORDSMAN_MODEL_ASSET_ID="model:ch-swordsman";
const ACTOR_PROGRESS_BAR_ARCHETYPE_IDS=Object.freeze(["ch1","ch2","ch3","en1","en2","en3","en4","en5"]);
const HUD_ARCHETYPE_IDS=ACTOR_PROGRESS_BAR_ARCHETYPE_IDS,HUD_LAYOUT_GRID=Object.freeze({columns:24,rows:16}),HUD_WIDGET_DEFAULTS=Object.freeze({size:1,spawnCount:5,visible:true});
const HUD_LAYOUT_DEFAULTS=Object.freeze({ch1:{x:.56,y:.09},ch2:{x:.67,y:.09},ch3:{x:.8,y:.09},en1:{x:.56,y:.18},en2:{x:.67,y:.18},en3:{x:.8,y:.18},en4:{x:.56,y:.27},en5:{x:.67,y:.27}});
const HUD_TEXT_ASSET_ID="hud:text",HUD_TEXT_DEFAULTS=Object.freeze({text:"BREAK THE RIVAL CROWN",size:1,visible:true,layoutX:.39,layoutY:.09});
function hudAssetId(archetypeId){return `hud:${archetypeId}`}
function hudLayoutDefault(archetypeId){return HUD_LAYOUT_DEFAULTS[archetypeId]??{x:.5,y:.16}}
function snapHudLayout(value,divisions){return THREE.MathUtils.clamp(Math.round(THREE.MathUtils.clamp(Number(value),0,1)*divisions)/divisions,0,1)}
function normalizeHudWidgetSettings(settings={},archetypeId="en1"){
  const validArchetype=HUD_ARCHETYPE_IDS.includes(archetypeId)?archetypeId:"en1",layoutDefault=hudLayoutDefault(validArchetype),size=THREE.MathUtils.clamp(Number(settings.size)||HUD_WIDGET_DEFAULTS.size,.5,2.5),spawnCount=THREE.MathUtils.clamp(Math.round(Number(settings.spawnCount)||HUD_WIDGET_DEFAULTS.spawnCount),1,99),layoutX=snapHudLayout(Number.isFinite(Number(settings.layoutX))?settings.layoutX:layoutDefault.x,HUD_LAYOUT_GRID.columns),layoutY=snapHudLayout(Number.isFinite(Number(settings.layoutY))?settings.layoutY:layoutDefault.y,HUD_LAYOUT_GRID.rows);
  return {archetypeId:validArchetype,size,spawnCount,visible:settings.visible!==false,layoutX,layoutY};
}
function normalizeHudTextSettings(settings={}){
  const text=String(settings.text??HUD_TEXT_DEFAULTS.text).trim().slice(0,80)||HUD_TEXT_DEFAULTS.text,size=THREE.MathUtils.clamp(Number(settings.size)||HUD_TEXT_DEFAULTS.size,.5,2.5),layoutX=snapHudLayout(Number.isFinite(Number(settings.layoutX))?settings.layoutX:HUD_TEXT_DEFAULTS.layoutX,HUD_LAYOUT_GRID.columns),layoutY=snapHudLayout(Number.isFinite(Number(settings.layoutY))?settings.layoutY:HUD_TEXT_DEFAULTS.layoutY,HUD_LAYOUT_GRID.rows);
  return {text,size,visible:settings.visible!==false,layoutX,layoutY};
}
function isProgressBarBlueprint(assetId){return Boolean(PROGRESS_BAR_BLUEPRINTS[assetId])}
function normalizeHexColour(value,fallback){return /^#[0-9a-f]{6}$/i.test(value??"")?value.toLowerCase():fallback}
const UNIT_RING_RADAR_GAP=.065,DEFAULT_UNIT_RING_SETTINGS=Object.freeze({outerColor:"#f7f2e4",outerSize:.7605,outerThickness:.04125,outerHeight:.018,innerColor:"#f7f2e4",innerSize:.5915,innerThickness:.04125,innerHeight:.054,playerRadarColor:"#e53935",enemyRadarColor:"#ffcf22",radarHeight:.021,radarThickness:.04125,radarSize:1.06/Math.PI});
function normalizeUnitRingSettings(settings={}){
  const source={...DEFAULT_UNIT_RING_SETTINGS,...settings},outerSize=THREE.MathUtils.clamp(Number(source.outerSize)||DEFAULT_UNIT_RING_SETTINGS.outerSize,.3,5),outerThickness=THREE.MathUtils.clamp(Number(source.outerThickness)||DEFAULT_UNIT_RING_SETTINGS.outerThickness,.012,Math.min(2,outerSize-.001)),innerSize=THREE.MathUtils.clamp(Number(source.innerSize)||DEFAULT_UNIT_RING_SETTINGS.innerSize,.1,5),innerThickness=THREE.MathUtils.clamp(Number(source.innerThickness)||DEFAULT_UNIT_RING_SETTINGS.innerThickness,.012,Math.min(2,innerSize-.001)),radarThickness=THREE.MathUtils.clamp(Number(source.radarThickness)||DEFAULT_UNIT_RING_SETTINGS.radarThickness,.012,2),requestedRadarRadius=Number(settings.radarRadius),radarRadius=Number.isFinite(requestedRadarRadius)&&requestedRadarRadius>0?THREE.MathUtils.clamp(requestedRadarRadius,radarThickness+.01,8):outerSize+UNIT_RING_RADAR_GAP+radarThickness;
  return {outerVisible:source.outerVisible!==false,innerVisible:source.innerVisible!==false,radarVisible:source.radarVisible!==false,outerColor:normalizeHexColour(source.outerColor,DEFAULT_UNIT_RING_SETTINGS.outerColor),outerSize,outerThickness,outerHeight:THREE.MathUtils.clamp(Number(source.outerHeight)||0,0,.2),innerColor:normalizeHexColour(source.innerColor,DEFAULT_UNIT_RING_SETTINGS.innerColor),innerSize,innerThickness,innerHeight:THREE.MathUtils.clamp(Number(source.innerHeight)||0,0,.35),playerRadarColor:normalizeHexColour(source.playerRadarColor,DEFAULT_UNIT_RING_SETTINGS.playerRadarColor),enemyRadarColor:normalizeHexColour(source.enemyRadarColor,DEFAULT_UNIT_RING_SETTINGS.enemyRadarColor),radarHeight:THREE.MathUtils.clamp(Number(source.radarHeight)||0,0,.2),radarThickness,radarRadius,radarSize:THREE.MathUtils.clamp(Number(source.radarSize)||DEFAULT_UNIT_RING_SETTINGS.radarSize,.05,1)};
}
function loadUnitRingSettings(){try{return normalizeUnitRingSettings(JSON.parse(localStorage.getItem(UNIT_RING_SETTINGS_KEY)||"{}"))}catch{return normalizeUnitRingSettings()}}
function normalizeHealthBarOffset(value,fallback){const offset=Number(value);return Number.isFinite(offset)?THREE.MathUtils.clamp(offset,0,12):fallback}
function normalizeProgressBarBlueprintSettings(settings={},assetId=BUILDING_PROGRESS_BAR_BP_ASSET_ID){const defaults=PROGRESS_BAR_BLUEPRINTS[isProgressBarBlueprint(assetId)?assetId:BUILDING_PROGRESS_BAR_BP_ASSET_ID],width=THREE.MathUtils.clamp(Number(settings.width)||defaults.width,.2,12),height=THREE.MathUtils.clamp(Number(settings.height)||defaults.height,.02,.5);return {backgroundColor:normalizeHexColour(settings.backgroundColor,defaults.backgroundColor),mainColor:normalizeHexColour(settings.mainColor,defaults.mainColor),width,height}}
const BUILDING_BLUEPRINT_MODELS=Object.freeze([{id:"box",label:"Box"}]),BUILDING_BLUEPRINT_DEFAULTS=Object.freeze({model:"box",materialColor:"#d8ddcc",barracksSpawnInterval:8,maxHp:RAID_BUILDING_MAX_HP,progressBarAssetId:BUILDING_PROGRESS_BAR_BP_ASSET_ID,healthBarOffset:RAID_BUILDING_HEALTH_BAR_OFFSET});
function defaultRaidBuildingHealth(){return RAID_BUILDING_MAX_HP}
function normalizeRaidBuildingHealth(value,fallback=RAID_BUILDING_MAX_HP){const health=Math.round(Number(value));return Number.isFinite(health)&&health>0?THREE.MathUtils.clamp(health,1,99999):fallback}
function isContentBrowserModelId(value){
  if(value===SWORDSMAN_MODEL_ASSET_ID)return true;
  return typeof value==="string"&&(value==="box"||value==="primitive-cube"||value===CHARACTER_MODEL_ASSET_ID||value===CROWNWAKE_BUILDING_MODEL_ASSET_ID||value===CROWNWAKE_BASE_MODEL_ASSET_ID||value==="archer-tower"||/^imported-model:[a-z0-9-]+$/i.test(value)||/^forest-fence:\d+$/.test(value)||/^rock-pillar:\d+$/.test(value));
}
function normalizeModelScale(value){
  return [0,1,2].map(index=>{const scale=Number(value?.[index]);return Number.isFinite(scale)&&scale>=.02&&scale<=20?scale:1;});
}
function normalizeBuildingBlueprintSettings(settings={},kind="barracks"){
  const model=isContentBrowserModelId(settings.model)?settings.model:BUILDING_BLUEPRINT_DEFAULTS.model,materialColor=normalizeHexColour(settings.materialColor,BUILDING_BLUEPRINT_DEFAULTS.materialColor),barracksSpawnInterval=THREE.MathUtils.clamp(Math.round(Number(settings.barracksSpawnInterval)||BUILDING_BLUEPRINT_DEFAULTS.barracksSpawnInterval),5,10),maxHp=normalizeRaidBuildingHealth(settings.maxHp,defaultRaidBuildingHealth()),progressBarAssetId=isProgressBarBlueprint(settings.progressBarAssetId)?settings.progressBarAssetId:BUILDING_BLUEPRINT_DEFAULTS.progressBarAssetId,healthBarOffset=normalizeHealthBarOffset(settings.healthBarOffset,BUILDING_BLUEPRINT_DEFAULTS.healthBarOffset);
  return {model,materialColor,barracksSpawnInterval,maxHp,progressBarAssetId,healthBarOffset};
}
function loadPracticeConfig(){try{const saved=JSON.parse(localStorage.getItem(PRACTICE_CONFIG_KEY)||"{}");if(saved.deploymentRosterVersion!==2)saved.ch3Soldiers=5;return normalizePracticeConfig(saved)}catch{return normalizePracticeConfig()}}
const AUDIO_PREFERENCE_KEY="crownwake-audio-enabled";
function loadAudioPreference(){try{return localStorage.getItem(AUDIO_PREFERENCE_KEY)!=="false"}catch{return true}}
const PRACTICE_CONFIG=loadPracticeConfig();
let unitRingSettings=loadUnitRingSettings();
let campaign = makeCampaign(), mode = "title", target = new THREE.Vector3(), activeEncounter = null;
const PLAYER_COMMANDER=commanderCombatProfile("player"),ENEMY_COMMANDER=commanderCombatProfile("enemy"),OPENING_ENEMY_RADIUS=8,WAVES_ENABLED=false;
const INDEPENDENT_SOLDIERS=true;
let master, masterHealth = INDEPENDENT_SOLDIERS?32:PLAYER_COMMANDER.maxHealth, sinceDamage = 99, followers = [], enemyUnits = [], particles = [], tombstones = [];
const MAX_ACTIVE_PARTICLES=180,MAX_PERSISTENT_FRAGMENTS=800;
let totalTime = 0, interfaceTime = 0, shake = 0, reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches, audioOn = loadAudioPreference(), gameSpeed = 1, hudCompact = false, settingsReturnMode = "playing";
let selectedRegion = 2, toastTimer = 0, nextWaveTimer = 0, waveNumber = 0, enemyPackAnchor = null;
let defeatCinematic = null;
let enemyRetreat = null;
let celebrationWinnerFaction = null;
let damagePulse = 0, damageStacks = 0;
let commanderHearts = 3;
let companyLayoutDirty=true,playerCompanies=[];
const PLAYER_DEPLOYMENT_ARCHETYPES=Object.freeze(["ch1","ch2","ch3"]);
function deploymentGroupId(archetypeId){const index=PLAYER_DEPLOYMENT_ARCHETYPES.indexOf(archetypeId);return index<0?0:index}
function deploymentReserveTotal(){return PLAYER_DEPLOYMENT_ARCHETYPES.reduce((total,archetypeId)=>total+(deploymentReserves[archetypeId]??0),0)}
function configuredDeploymentReserves(config=PRACTICE_CONFIG){return Object.fromEntries(PLAYER_DEPLOYMENT_ARCHETYPES.map(id=>[id,config[`${id}Soldiers`]]))}
let selectedCompanyId=null,selectedCommander=null,commandHoverCell=null,wasCombat=false,deploymentReserves=configuredDeploymentReserves(),deploymentArchetypeId=null,deploymentPlacementReady=false,deploymentStarted=false,deploymentPreviewOccupancySignature="";
let pendingStartingChCounts=configuredDeploymentReserves(),settingsStartingChDirty=false;
const companyAnchors=new Map(),selectionVisuals=[];
const editorCameraFocus=new THREE.Vector3(),editorKeys=new Set(),editorObjects=[],editorSelectedObjects=new Set(),editorFoliageObjects=new Set(),editorFoliagePaintSelection=new Set(),hudWidgetElements=new Map();
const NAVIGATION_CELL_SIZE=1,NAVIGATION_AGENT_CLEARANCE=.36,NAVIGATION_WAYPOINT_REACHED=.22,NAVIGATION_GOAL_REPATH_DISTANCE=.72,NAVIGATION_YIELD_DURATION=.72,BARRACKS_ENEMY_DUEL_RADIUS=8,BARRACKS_ENEMY_ANCHOR_DISTANCE=1.45,BARRACKS_ENEMY_ANCHOR_SLOT_COUNT=8,BARRACKS_ENEMY_PATROL_MIN_DISTANCE=3.2,BARRACKS_ENEMY_PATROL_SEPARATION=2.1,EN_PATROL_ANCHOR_RADIUS=2.6,PEACEFUL_PATROL_MIN_DISTANCE=3.2,PEACEFUL_PATROL_SEPARATION=2.1,PEACEFUL_PATROL_SPEED=1.35,PEACEFUL_PATROL_DURATION=4.5,INDEPENDENT_GROUP_COLUMN_GAP=.68,INDEPENDENT_GROUP_PATROL_SEPARATION=.72,INDEPENDENT_GROUP_PATROL_RADIUS=3.2,INDEPENDENT_GROUP_PATROL_MIN_DISTANCE=.65,INDEPENDENT_GROUP_PATROL_DURATION=4,INDEPENDENT_GROUP_PATROL_PAUSE_MAX=.65,CH_PATROL_COHESION_RADIUS=2.4,INDEPENDENT_GROUP_ARRIVAL_DISTANCE=.16,BARRACKS_ENEMY_EXIT_DURATION=1.15,BARRACKS_ENEMY_DOORWAY_PROGRESS=.68,BARRACKS_ENEMY_SPAWN_INSIDE_MARKER="CROWNWAKE_EN_SPAWN_INSIDE",BARRACKS_ENEMY_SPAWN_EXIT_MARKER="CROWNWAKE_EN_SPAWN_EXIT",NAVIGATION_BLOCKING_TYPES=new Set(["primitive-cube","town-hall","barracks","archer-tower","forest-fence","imported-model"]),NAVIGATION_EDITOR_STATE_KEY="crownwake-navigation-overlay-v1";
const navigationGrid={dirty:true,revision:0,cells:new Map(),walkable:new Set(),blocked:new Set(),obstacles:[],cellSize:{x:NAVIGATION_CELL_SIZE,z:NAVIGATION_CELL_SIZE},offset:{x:0,z:0},source:null,baseCellsByIndex:new Map(),baseDimensions:null};
const deploymentPreviewCache={revision:-1,cells:[]},deploymentPreviewRenderer={revision:-1,entries:[],entryByKey:new Map(),outline:null,enemyFill:null,hoverFill:null,hoverOutline:null,occupiedKeys:new Set(),fillGeometry:null};
const navigationOverlay=new THREE.Group(),navigationBounds=new THREE.Box3(),navigationWorldScale=new THREE.Vector3(),navigationWorldPosition=new THREE.Vector3(),navigationLocalPoint=new THREE.Vector3(),navigationOverlayMatrix=new THREE.Object3D();
navigationOverlay.name="Navigation Overlay";navigationOverlay.renderOrder=84;battle.add(navigationOverlay);
function loadNavigationDebugVisible(){try{return localStorage.getItem(NAVIGATION_EDITOR_STATE_KEY)==="true"}catch{return false}}
let navigationDebugVisible=loadNavigationDebugVisible();
const editorGroundPlane=new THREE.Plane(new THREE.Vector3(0,1,0),-GROUND_Y);
const EDITOR_CAMERA_OFFSET=ISOMETRIC_CAMERA_OFFSET.clone();
const editorCameraRotation=new THREE.Euler();
const EDITOR_PAN_FORWARD=new THREE.Vector3(-EDITOR_CAMERA_OFFSET.x,0,-EDITOR_CAMERA_OFFSET.z).normalize();
const EDITOR_PAN_RIGHT=new THREE.Vector3(-EDITOR_PAN_FORWARD.z,0,EDITOR_PAN_FORWARD.x);
const EDITOR_ZOOM_MIN=.32,EDITOR_ZOOM_MAX=3,EDITOR_ZOOM_STEP=5;
let editorReturnMode="playing",editorCameraScale=1,editorSelection=null,editorSelectionAnchor=null,editorSelectionHelper=null,editorSelectionHelpers=[],editorTransformGizmo=null,editorTransformMode=null,editorScaleLocked=true,editorModelScaleLocked=true,editorPointerState=null,editorPendingAsset=null,editorLibrarySelection=null,editorLibrarySelectionLabel="",editorAssetFolder=null,pendingEditorDelete=null,editorUndoHistory=[],editorCameraTravel=null,editorEnvironmentOpen=false,savedLevelCamera=null,savedLevelState=null,foliagePaintActive=false,foliagePaintOperation="add",foliagePaintStroke=null,foliagePaintBrush=null,hudLayoutDrag=null;
const EDITOR_LAYOUT_STORAGE_KEY="crownwake-editor-layout-v1";
const CONTENT_BROWSER_STORAGE_KEY="crownwake-content-browser-v1",CONTENT_BROWSER_ROOT_ID="content",EDITOR_MATERIAL_SWATCHES_KEY="crownwake-editor-material-swatches-v1",IMPORTED_MODEL_DATABASE_NAME="crownwake-imported-models-v1",IMPORTED_MODEL_STORE_NAME="models",IMPORTED_MODEL_MAX_BYTES=50*1024*1024,IMPORTED_MODEL_TARGET_HEIGHT=2;
const EDITOR_CONTEXTS=Object.freeze({select:{title:"SELECT",kicker:"EDITOR MODE"},assets:{title:"ASSETS",kicker:"WORLD TOOL"},foliage:{title:"FOLIAGE",kicker:"WORLD TOOL"},environment:{title:"ENVIRONMENT",kicker:"WORLD LOOK"}});
let editorContext="select",editorOutlinerQuery="",editorCameraObject=null;
function readEditorLayout(){
  try{return {...{leftWidth:280,rightWidth:320,contentDrawerHeight:340,leftCollapsed:false,rightCollapsed:false,maximized:false},...JSON.parse(localStorage.getItem(EDITOR_LAYOUT_STORAGE_KEY)||"{}")}}
  catch{return {leftWidth:280,rightWidth:320,contentDrawerHeight:340,leftCollapsed:false,rightCollapsed:false,maximized:false}}
}
const editorLayout=readEditorLayout();
function persistEditorLayout(){try{localStorage.setItem(EDITOR_LAYOUT_STORAGE_KEY,JSON.stringify(editorLayout))}catch{}}
const FOLIAGE_PAINT=Object.seal({brushSize:5,paintAmount:5,scaleVariation:20});
function loadEditorAssetLibrary(){
  try{
    const current=localStorage.getItem(EDITOR_ASSET_LIBRARY_KEY);
    if(current!==null)return new Set(JSON.parse(current).filter(value=>typeof value==="string"));
    const legacy=JSON.parse(localStorage.getItem(LEGACY_EDITOR_ASSET_LIBRARY_KEY)||"[]").filter(value=>typeof value==="string"&&!/^grass-cluster(?::|$)/.test(value)&&!/bush/i.test(value));
    localStorage.setItem(EDITOR_ASSET_LIBRARY_KEY,JSON.stringify(legacy));return new Set(legacy);
  }
  catch{return new Set()}
}
const hiddenEditorAssets=loadEditorAssetLibrary();
const CONTENT_BROWSER_SYSTEM_FOLDERS=Object.freeze([
  {id:"models",name:"Models",parentId:CONTENT_BROWSER_ROOT_ID},
  {id:"characters",name:"Characters",parentId:CONTENT_BROWSER_ROOT_ID},
  {id:"characters/en",name:"EN",parentId:"characters"},
  {id:"characters/ch",name:"CH",parentId:"characters"},
  {id:"hud",name:"HUD",parentId:CONTENT_BROWSER_ROOT_ID},
  {id:"hud/ch",name:"CH",parentId:"hud"},
  {id:"hud/en",name:"EN",parentId:"hud"},
  {id:"bp_gn",name:"BP_GN",parentId:CONTENT_BROWSER_ROOT_ID},
  {id:"bp_gn/base",name:"Base",parentId:"bp_gn"},
  {id:"bp_gn/town-hall",name:"Town Hall",parentId:"bp_gn"},
  {id:"bp_gn/barracks",name:"Barracks",parentId:"bp_gn"},
  {id:"bp_gn/progress-bars",name:"Progress Bars",parentId:"bp_gn"},
  {id:"environment",name:"Environment",parentId:CONTENT_BROWSER_ROOT_ID},
  {id:"environment/terrain",name:"Terrain",parentId:"environment"},
  {id:"environment/structures",name:"Structures",parentId:"environment"},
  {id:"environment/trees",name:"Trees",parentId:"environment"},
  {id:"environment/grass",name:"Grass",parentId:"environment"},
  {id:"environment/rocks",name:"Rocks",parentId:"environment"},
  {id:"materials",name:"Materials",parentId:CONTENT_BROWSER_ROOT_ID},
  {id:"materials/ground",name:"Ground",parentId:"materials"},
  {id:"shapes",name:"Shapes",parentId:CONTENT_BROWSER_ROOT_ID}
]);
function normalizeGeneratedModelSourcePath(value){return typeof value==="string"&&/^Models\/[A-Za-z0-9][A-Za-z0-9_-]{0,71}\.glb$/.test(value)?value:""}
function normalizeImportedModelRecord(record){
  if(!record||typeof record.id!=="string"||!record.id.startsWith("imported-model:")||typeof record.name!=="string")return null;
  const materials=Array.isArray(record.materials)?record.materials.filter(material=>material&&typeof material.id==="string"&&typeof material.name==="string").map(material=>({id:material.id,name:material.name})):[];
  return {id:record.id,name:record.name.trim()||"Imported GLB",folderId:typeof record.folderId==="string"?record.folderId:CONTENT_BROWSER_ROOT_ID,materials,sourcePath:normalizeGeneratedModelSourcePath(record.sourcePath)};
}
function normalizeActorBlueprintStats(settings){
  if(!settings||typeof settings!=="object")return {};
  const normalized={};
  for(const [property,minimum,maximum] of [["maxHp",1,500],["attack",.5,200],["moveSpeed",.25,15],["acceleration",.5,30],["patrolSpeed",.25,15]]){
    const value=Number(settings[property]);if(Number.isFinite(value))normalized[property]=Math.min(maximum,Math.max(minimum,value));
  }
  return normalized;
}
function loadContentBrowserState(){
  try{
    const saved=JSON.parse(localStorage.getItem(CONTENT_BROWSER_STORAGE_KEY)||"{}");
    return {
      folders:Array.isArray(saved.folders)?saved.folders.filter(folder=>folder&&typeof folder.id==="string"&&typeof folder.name==="string"&&typeof folder.parentId==="string"):[],
      assetFolders:saved.assetFolders&&typeof saved.assetFolders==="object"?saved.assetFolders:{},
      assetNames:saved.assetNames&&typeof saved.assetNames==="object"?saved.assetNames:{},
      folderNames:saved.folderNames&&typeof saved.folderNames==="object"?saved.folderNames:{},
      blueprintCopies:Array.isArray(saved.blueprintCopies)?saved.blueprintCopies.filter(copy=>copy&&typeof copy.id==="string"&&typeof copy.name==="string"&&typeof copy.folderId==="string"&&["town-hall","barracks"].includes(copy.blueprintKind)):[],
      blueprintSettings:saved.blueprintSettings&&typeof saved.blueprintSettings==="object"?Object.fromEntries(Object.entries(saved.blueprintSettings).filter(([assetId,settings])=>typeof assetId==="string"&&settings&&typeof settings==="object").map(([assetId,settings])=>[assetId,isProgressBarBlueprint(assetId)?normalizeProgressBarBlueprintSettings(settings,assetId):normalizeBuildingBlueprintSettings(settings)])): {},
      actorMaterials:saved.actorMaterials&&typeof saved.actorMaterials==="object"?Object.fromEntries(Object.entries(saved.actorMaterials).filter(([archetypeId,colour])=>["en1","en2","en3","en4","en5"].includes(archetypeId)&&/^#[0-9a-f]{6}$/i.test(colour))):{},
      actorProgressBars:saved.actorProgressBars&&typeof saved.actorProgressBars==="object"?Object.fromEntries(Object.entries(saved.actorProgressBars).filter(([archetypeId,assetId])=>ACTOR_PROGRESS_BAR_ARCHETYPE_IDS.includes(archetypeId)&&isProgressBarBlueprint(assetId))):{},
      actorHealthBarOffsets:saved.actorHealthBarOffsets&&typeof saved.actorHealthBarOffsets==="object"?Object.fromEntries(Object.entries(saved.actorHealthBarOffsets).filter(([archetypeId])=>ACTOR_PROGRESS_BAR_ARCHETYPE_IDS.includes(archetypeId)).map(([archetypeId,offset])=>[archetypeId,normalizeHealthBarOffset(offset,ACTOR_HEALTH_BAR_OFFSET)])): {},
      actorModels:saved.actorModels&&typeof saved.actorModels==="object"?Object.fromEntries(Object.entries(saved.actorModels).filter(([archetypeId,assetId])=>ACTOR_PROGRESS_BAR_ARCHETYPE_IDS.includes(archetypeId)&&isContentBrowserModelId(assetId))):{},
      actorStats:saved.actorStats&&typeof saved.actorStats==="object"?Object.fromEntries(Object.entries(saved.actorStats).filter(([archetypeId])=>ACTOR_PROGRESS_BAR_ARCHETYPE_IDS.includes(archetypeId)).map(([archetypeId,stats])=>[archetypeId,normalizeActorBlueprintStats(stats)])): {},
      modelScales:saved.modelScales&&typeof saved.modelScales==="object"?Object.fromEntries(Object.entries(saved.modelScales).filter(([assetId,scale])=>isContentBrowserModelId(assetId)&&Array.isArray(scale)).map(([assetId,scale])=>[assetId,normalizeModelScale(scale)])): {},
      importedModels:Array.isArray(saved.importedModels)?saved.importedModels.map(normalizeImportedModelRecord).filter(Boolean):[]
    };
  }catch{return {folders:[],assetFolders:{},assetNames:{},folderNames:{},blueprintCopies:[],blueprintSettings:{},actorMaterials:{},actorProgressBars:{},actorHealthBarOffsets:{},actorModels:{},actorStats:{},modelScales:{},importedModels:[]}}
}
const contentBrowserState=loadContentBrowserState(),contentBrowserExpanded=new Set([CONTENT_BROWSER_ROOT_ID,"environment","materials"]),contentBrowserSelection=new Set();
let contentBrowserFolderId=CONTENT_BROWSER_ROOT_ID,contentBrowserQuery="",contentBrowserSelectionAnchor=null,contentBrowserContextTarget=null,contentBrowserModelCreationInProgress=false;
function persistContentBrowserState(){try{localStorage.setItem(CONTENT_BROWSER_STORAGE_KEY,JSON.stringify(contentBrowserState))}catch{}}
function copyContentBrowserState(){return {folders:contentBrowserState.folders.map(folder=>({...folder})),assetFolders:{...contentBrowserState.assetFolders},assetNames:{...contentBrowserState.assetNames},folderNames:{...contentBrowserState.folderNames},blueprintCopies:contentBrowserState.blueprintCopies.map(copy=>({...copy})),blueprintSettings:Object.fromEntries(Object.entries(contentBrowserState.blueprintSettings).map(([assetId,settings])=>[assetId,{...settings}])),actorMaterials:{...contentBrowserState.actorMaterials},actorProgressBars:{...contentBrowserState.actorProgressBars},actorHealthBarOffsets:{...contentBrowserState.actorHealthBarOffsets},actorModels:{...contentBrowserState.actorModels},actorStats:Object.fromEntries(Object.entries(contentBrowserState.actorStats).map(([archetypeId,stats])=>[archetypeId,{...stats}])),modelScales:Object.fromEntries(Object.entries(contentBrowserState.modelScales).map(([assetId,scale])=>[assetId,scale.slice()])),importedModels:contentBrowserState.importedModels.map(model=>({...model,materials:model.materials.map(material=>({...material}))}))}}
function restoreContentBrowserState(snapshot){
  contentBrowserState.folders.splice(0,contentBrowserState.folders.length,...(snapshot?.folders??[]).map(folder=>({...folder})));
  Object.keys(contentBrowserState.assetFolders).forEach(key=>delete contentBrowserState.assetFolders[key]);Object.assign(contentBrowserState.assetFolders,snapshot?.assetFolders??{});
  Object.keys(contentBrowserState.assetNames).forEach(key=>delete contentBrowserState.assetNames[key]);Object.assign(contentBrowserState.assetNames,snapshot?.assetNames??{});
  Object.keys(contentBrowserState.folderNames).forEach(key=>delete contentBrowserState.folderNames[key]);Object.assign(contentBrowserState.folderNames,snapshot?.folderNames??{});
  contentBrowserState.blueprintCopies.splice(0,contentBrowserState.blueprintCopies.length,...(snapshot?.blueprintCopies??[]).map(copy=>({...copy})));
  Object.keys(contentBrowserState.blueprintSettings).forEach(key=>delete contentBrowserState.blueprintSettings[key]);Object.assign(contentBrowserState.blueprintSettings,snapshot?.blueprintSettings??{});
  Object.keys(contentBrowserState.actorMaterials).forEach(key=>delete contentBrowserState.actorMaterials[key]);Object.assign(contentBrowserState.actorMaterials,snapshot?.actorMaterials??{});
  Object.keys(contentBrowserState.actorProgressBars).forEach(key=>delete contentBrowserState.actorProgressBars[key]);Object.assign(contentBrowserState.actorProgressBars,snapshot?.actorProgressBars??{});
  Object.keys(contentBrowserState.actorHealthBarOffsets).forEach(key=>delete contentBrowserState.actorHealthBarOffsets[key]);Object.assign(contentBrowserState.actorHealthBarOffsets,Object.fromEntries(Object.entries(snapshot?.actorHealthBarOffsets??{}).map(([archetypeId,offset])=>[archetypeId,normalizeHealthBarOffset(offset,ACTOR_HEALTH_BAR_OFFSET)])));
  Object.keys(contentBrowserState.actorModels).forEach(key=>delete contentBrowserState.actorModels[key]);Object.assign(contentBrowserState.actorModels,snapshot?.actorModels??{});
  Object.keys(contentBrowserState.actorStats).forEach(key=>delete contentBrowserState.actorStats[key]);Object.assign(contentBrowserState.actorStats,Object.fromEntries(Object.entries(snapshot?.actorStats??{}).map(([archetypeId,stats])=>[archetypeId,normalizeActorBlueprintStats(stats)])));
  Object.keys(contentBrowserState.modelScales).forEach(key=>delete contentBrowserState.modelScales[key]);Object.assign(contentBrowserState.modelScales,Object.fromEntries(Object.entries(snapshot?.modelScales??{}).map(([assetId,scale])=>[assetId,normalizeModelScale(scale)])));
  contentBrowserState.importedModels.splice(0,contentBrowserState.importedModels.length,...(snapshot?.importedModels??[]).map(normalizeImportedModelRecord).filter(Boolean));
}
const editorOutlinerExpanded=new Set(["scene","scene/environment"]);
const padPrev = new Set();
const debugPanel = $("dev");
const debugButton = $("debug");
if(debugPanel){
  const selectDebugMonitorUnit=event=>{
    const row=event.target instanceof Element?event.target.closest("[data-debug-unit]"):null;
    if(!row||!debugPanel.contains(row))return false;
    const unitId=Number(row.dataset.debugUnit);
    if(!Number.isFinite(unitId))return false;
    debugFocusId=unitId;
    renderDebugMonitor();
    return true;
  };
  debugPanel.addEventListener("pointerdown",event=>{
    if(!selectDebugMonitorUnit(event))return;
    event.preventDefault();
    event.stopPropagation();
  });
  debugPanel.addEventListener("click",event=>{
    if(!selectDebugMonitorUnit(event))return;
    event.preventDefault();
    event.stopPropagation();
  });
}
const sounds = {
  music: Object.assign(new Audio("./assets/battle_music.m4a"), { loop: true, volume: .16 }),
  move: Object.assign(new Audio("./assets/move_confirm.mp3"), { volume: .28 }),
  death: Object.assign(new Audio("./assets/commander_death.mp3"), { volume: .34 })
};
function playSound(name) {
  if (!audioOn || !sounds[name]) return;
  const a = sounds[name].cloneNode(); a.volume = sounds[name].volume; a.play().catch(()=>{});
}
function synthTone(freq=180, duration=.16, type="sine", volume=.035) {
  if (!audioOn) return;
  const ctx = synthTone.ctx ??= new (window.AudioContext||window.webkitAudioContext)();
  const o=ctx.createOscillator(),g=ctx.createGain();o.type=type;o.frequency.setValueAtTime(freq,ctx.currentTime);
  g.gain.setValueAtTime(volume,ctx.currentTime);g.gain.exponentialRampToValueAtTime(.0001,ctx.currentTime+duration);
  o.connect(g).connect(ctx.destination);o.start();o.stop(ctx.currentTime+duration);
}

function mat(color, rough = .82) {
  return new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: .02, flatShading: true });
}
function vertexColorMat(){const material=mat(0xffffff);material.vertexColors=true;return material;}
const MEADOW_GROUND_VARIANTS=Object.freeze({
  "illustrated-sage":Object.freeze({
    broadScale:.042,microScale:.17,fleckScale:.82,
    baseSage:0x87996e,shadedSage:0x748961,fleckGreen:0x526742,
    broadStrength:.09,microStrength:.035,fleckStrength:.15
  })
});
const ACTIVE_MEADOW_GROUND_VARIANT="illustrated-sage";
function makeMeadowGroundMaterial(){
  const variant=MEADOW_GROUND_VARIANTS[ACTIVE_MEADOW_GROUND_VARIANT];
  const material=new THREE.MeshStandardMaterial({color:new THREE.Color(variant.baseSage),roughness:worldLook.meadowRoughness,metalness:worldLook.meadowMetalness,flatShading:true,dithering:true});
  material.onBeforeCompile=shader=>{
    shader.vertexShader=`varying vec3 vMeadowWorldPosition;\n${shader.vertexShader}`.replace("#include <worldpos_vertex>","#include <worldpos_vertex>\n  vMeadowWorldPosition=worldPosition.xyz;");
    shader.fragmentShader=`
varying vec3 vMeadowWorldPosition;
float meadowHash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453123);}
float meadowFleck(vec2 p){
  vec2 cell=floor(p);vec2 local=fract(p)-.5;
  float fleckEnabled=step(.83,meadowHash(cell+97.3));
  vec2 offset=vec2(meadowHash(cell+13.7),meadowHash(cell+41.9))-.5;
  return fleckEnabled*smoothstep(.115,.03,length(local-offset*.42));
}
${shader.fragmentShader}`.replace("#include <color_fragment>",`#include <color_fragment>
  vec2 meadowPoint=vMeadowWorldPosition.xz;
  float broad=sin(meadowPoint.x*${variant.broadScale.toFixed(3)}+meadowPoint.y*${(variant.broadScale*.72).toFixed(3)})*.5+.5;
  float micro=sin(meadowPoint.x*${variant.microScale.toFixed(3)}-meadowPoint.y*${(variant.microScale*.81).toFixed(3)})*.5+.5;
  float flecks=meadowFleck(meadowPoint*${variant.fleckScale.toFixed(2)});
  vec3 shade=vec3(${((variant.shadedSage>>16)&255)/255},${((variant.shadedSage>>8)&255)/255},${(variant.shadedSage&255)/255});
  vec3 fleck=vec3(${((variant.fleckGreen>>16)&255)/255},${((variant.fleckGreen>>8)&255)/255},${(variant.fleckGreen&255)/255});
  diffuseColor.rgb=mix(diffuseColor.rgb,shade,(1.0-broad)*${variant.broadStrength.toFixed(3)}+micro*${variant.microStrength.toFixed(3)});
  diffuseColor.rgb=mix(diffuseColor.rgb,fleck,flecks*${variant.fleckStrength.toFixed(3)});
  diffuseColor.rgb+=vec3(.035,.038,.025)*(broad-.38);`);
  };
  material.customProgramCacheKey=()=>`meadow-${ACTIVE_MEADOW_GROUND_VARIANT}-matcap`;
  return material;
}
const meadowGroundMaterial=makeMeadowGroundMaterial();
function formatWorldLookValue(key,value){
  if(key==="fogDensity")return Number(value).toFixed(3);
  if(key==="cameraZoom")return `${Number(value).toFixed(2).replace(/0+$/,'').replace(/\.$/,'')}×`;
  if(key==="meadowMetalness")return Number(value).toFixed(2).replace(/0+$/,"").replace(/\.$/,"")||"0";
  return Number(value).toFixed(2).replace(/\.00$/,"");
}
function syncWorldLookControls(){
  for(const input of document.querySelectorAll("[data-world-look-setting]")){
    const key=input.dataset.worldLookSetting,value=worldLook[key];if(value===undefined)continue;
    input.value=String(value);
    const output=document.querySelector(`[data-world-look-output="${key}"]`);if(output)output.textContent=formatWorldLookValue(key,value);
  }
}
function persistWorldLook(){try{localStorage.setItem(WORLD_LOOK_STORAGE_KEY,JSON.stringify(worldLook));}catch{}}
function applyWorldLook(){
  renderer.toneMapping=TONE_MAPPING_MODES[worldLook.toneMapping]??THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure=worldLook.exposure;
  hemisphere.intensity=worldLook.hemisphereIntensity;
  sun.intensity=worldLook.sunIntensity;sun.color.set(worldLook.sunColor);sun.shadow.radius=worldLook.shadowRadius;
  scene.background.set(worldLook.background);scene.fog.color.set(worldLook.background);baseFogDensity=worldLook.fogDensity;
  renderer.shadowMap.type=SHADOW_MAP_TYPES[worldLook.shadowType]??THREE.PCFSoftShadowMap;renderer.shadowMap.needsUpdate=true;
  meadowGroundMaterial.roughness=worldLook.meadowRoughness;meadowGroundMaterial.metalness=worldLook.meadowMetalness;
}
function applyWorldLookControl(input){
  if(mode!=="editor"||!input)return;
  const key=input.dataset.worldLookSetting;if(!(key in WORLD_LOOK_DEFAULTS))return;
  worldLook[key]=input.type==="range"?Number(input.value):input.value;
  applyWorldLook();syncWorldLookControls();persistWorldLook();
  $("editor-status").textContent=`${key.replace(/([A-Z])/g," $1").toLowerCase()} updated live.`;
}
const GRASS_BLADE_PALETTE=Object.freeze([
  0x829765,
  0x8c9f6c,
  0x93a672,
  0x9cac7c,
  0x879a70
]);
const mats = {
  grass: mat(COLORS.grass), cliff: mat(COLORS.cliff), water: new THREE.MeshStandardMaterial({ color: COLORS.water, roughness: .3, transparent: true, opacity: .93 }),
  player: mat(COLORS.player), playerDark: mat(COLORS.playerDark), coral: mat(COLORS.coral), amber: mat(COLORS.amber), crown: mat(COLORS.crown),
  warrior: mat(COLORS.warrior), master: mat(COLORS.master), masterDark: mat(0x7f3438),
  stone: mat(0xd8ddcc), treeTrunk: mat(0x76543b), treeLeaf: vertexColorMat(), treeLeafDark: vertexColorMat(), towerWood: mat(0x6c5642), towerWoodDark: mat(0x40372f), towerRoof: mat(0x3e4a3e), groundA:meadowGroundMaterial, groundB:meadowGroundMaterial
};
const GRASS_BLADE_MATERIALS=GRASS_BLADE_PALETTE.map(color=>mat(color));
for(const material of GRASS_BLADE_MATERIALS)material.side=THREE.DoubleSide;
function setWidgetFill(mesh,ratio,width,height){
  const value=THREE.MathUtils.clamp(ratio,0,1);
  mesh.scale.set(width*value,height,1);mesh.position.x=-width*(1-value)*.5;
}
const soldierBarGeometry=new THREE.PlaneGeometry(1,1);
const SOLDIER_MARKER_LEAD_DISTANCE=.13;
const contactOcclusionGeometry=new THREE.CircleGeometry(1,24);
const contactOcclusionMaterial=new THREE.ShaderMaterial({
  transparent:true,depthWrite:false,depthTest:true,
  uniforms:{occlusionColor:{value:new THREE.Color(0x263128)},occlusionOpacity:{value:.2}},
  vertexShader:"varying vec2 vContactUv;void main(){vContactUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}",
  fragmentShader:"uniform vec3 occlusionColor;uniform float occlusionOpacity;varying vec2 vContactUv;void main(){float radial=length(vContactUv-.5)*2.0;float fade=1.0-smoothstep(.18,1.0,radial);gl_FragColor=vec4(occlusionColor,fade*occlusionOpacity);}",
  polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-1
});
function addGroundContactOcclusion(actor,radius=.42,depth=.74){
  const contact=new THREE.Mesh(contactOcclusionGeometry,contactOcclusionMaterial);
  contact.rotation.x=-Math.PI*.5;contact.position.y=-.002;contact.scale.set(radius,depth*radius,1);contact.renderOrder=1;
  contact.userData.groundContactOcclusion=true;actor.add(contact);return contact;
}
function makeUnitRingGeometry(size,thickness,segments=48,thetaStart=0,thetaLength=Math.PI*2){return new THREE.RingGeometry(Math.max(.001,size-thickness),size,segments,1,thetaStart,thetaLength)}
function radarOuterRadius(){return unitRingSettings.radarRadius}
function radarArcGeometry(){const thetaLength=Math.PI*unitRingSettings.radarSize;return makeUnitRingGeometry(radarOuterRadius(),unitRingSettings.radarThickness,16,-Math.PI*.5-thetaLength*.5,thetaLength)}
function replaceRingGeometry(part,geometry){const previous=part.geometry;part.geometry=geometry;previous?.dispose?.()}
function refreshEncounterRing(ring){
  const data=ring.userData,settings=unitRingSettings;
  data.outer.visible=settings.outerVisible!==false;data.inner.visible=settings.innerVisible!==false;data.direction.visible=settings.radarVisible!==false;
  replaceRingGeometry(data.outer,makeUnitRingGeometry(settings.outerSize,settings.outerThickness));replaceRingGeometry(data.inner,makeUnitRingGeometry(settings.innerSize,settings.innerThickness));replaceRingGeometry(data.direction,radarArcGeometry());
  data.outerMaterial.color.set(settings.outerColor);data.innerMaterial.color.set(settings.innerColor);data.directionColor=null;
  ring.position.y=GROUND_Y+settings.outerHeight;data.inner.position.y=settings.innerHeight-settings.outerHeight;data.direction.position.y=settings.radarHeight-settings.outerHeight;
}
function makeEncounterRing(unit){
  const makeMaterial=(color,opacity)=>new THREE.MeshBasicMaterial({color,transparent:true,opacity,depthWrite:false,side:THREE.DoubleSide});
  const ring=new THREE.Group(),outerMaterial=makeMaterial(unitRingSettings.outerColor,.88),innerMaterial=makeMaterial(unitRingSettings.innerColor,.9),directionMaterial=makeMaterial(unitRingSettings.playerRadarColor,.98);
  const addPart=(geometry,material,height=0)=>{const part=new THREE.Mesh(geometry,material);part.rotation.x=-Math.PI*.5;part.position.y=height;part.renderOrder=31;ring.add(part);return part;};
  const outer=addPart(makeUnitRingGeometry(unitRingSettings.outerSize,unitRingSettings.outerThickness),outerMaterial),direction=addPart(radarArcGeometry(),directionMaterial),inner=addPart(makeUnitRingGeometry(unitRingSettings.innerSize,unitRingSettings.innerThickness),innerMaterial);
  ring.renderOrder=31;ring.userData={outer,inner,direction,outerMaterial,innerMaterial,directionMaterial,materials:[outerMaterial,innerMaterial,directionMaterial],directionColor:null};refreshEncounterRing(ring);unit.add(ring);unit.userData.encounterRing=ring;
}
function updateEncounterRings(){
  for(const unit of [master,...followers,...enemyUnits]){
    const ring=unit?.userData?.encounterRing;if(!ring)continue;
    const data=ring.userData,foe=unit.userData.lockedTarget;
    const paired=Boolean(unit.visible&&!isBarracksDeparting(unit)&&foe?.visible&&!isBarracksDeparting(foe)&&foe.userData.faction!==unit.userData.faction&&activeDuelRingState({unitAlive:unit.userData.alive,targetAlive:foe.userData.alive,mutualLock:foe.userData.lockedTarget===unit}));
    const pairId=paired?foe.id:null;
    if(data.pairId!==pairId){data.pairId=pairId;data.pairConfirmedAt=paired?totalTime:null;}
    if(!unit.visible||isBarracksDeparting(unit)){ring.visible=false;continue;}
    const enemy=unit.userData.faction==="enemy",combatColor=enemy?"#ffbf24":"#e32646",color=paired?"#ffffff":enemy?unitRingSettings.enemyRadarColor:unitRingSettings.playerRadarColor;
    const elapsed=paired?Math.max(0,totalTime-data.pairConfirmedAt):0,pulse=paired&&!reducedMotion?(1-Math.cos(Math.PI*2*elapsed))/2:0;
    data.outerMaterial.color.set(paired?combatColor:unitRingSettings.outerColor).multiplyScalar(1+pulse*1.5);
    data.innerMaterial.color.set(paired?combatColor:unitRingSettings.innerColor).multiplyScalar(1+pulse*1.5);
    data.outerMaterial.opacity=paired&&!reducedMotion?.5+.5*pulse:.9;data.innerMaterial.opacity=paired&&!reducedMotion?.5+.5*pulse:.9;
    data.outer.visible=unitRingSettings.outerVisible!==false;data.inner.visible=unitRingSettings.innerVisible!==false;data.direction.visible=unitRingSettings.radarVisible!==false;
    data.outer.scale.setScalar(1+pulse*.12);data.inner.scale.setScalar(1+pulse*.12);
    if(data.directionColor!==color){data.directionColor=color;data.directionMaterial.color.set(color)}
    data.direction.position.z=(unit.userData.velocity?.lengthSq()??0)>.012?SOLDIER_MARKER_LEAD_DISTANCE:0;
    ring.scale.setScalar(1);ring.visible=unit.userData.alive;
  }
}
function configuredProgressBar(assetId,fallbackAssetId){
  const resolvedAssetId=isProgressBarBlueprint(assetId)?assetId:fallbackAssetId;
  return {assetId:resolvedAssetId,...normalizeProgressBarBlueprintSettings(contentBrowserState.blueprintSettings[resolvedAssetId],resolvedAssetId)};
}
function applyProgressBarLayout(widget,style){
  const data=widget?.userData;if(!data)return;
  const width=style.width*(data.widthMultiplier??1),height=style.height,max=Math.max(1,data.maxHealth??data.current??1);
  data.width=width;data.height=height;data.outline?.scale.set(width+(data.outlinePaddingX??0),height+(data.outlinePaddingY??0),1);data.track?.scale.set(width,height,1);
  setWidgetFill(data.lag,data.lagHealth/max,width,height*.78);setWidgetFill(data.main,data.current/max,width,height*.78);
}
function applyProgressBarAppearance(widget,assetId,fallbackAssetId){
  const data=widget?.userData;if(!data)return null;
  const style=configuredProgressBar(assetId,fallbackAssetId);data.progressBarAssetId=style.assetId;data.backgroundColor=style.backgroundColor;data.mainColor=style.mainColor;
  for(const layer of data.backgroundLayers??[])layer.material.color.set(style.backgroundColor);
  data.main?.material?.color?.set(style.mainColor);applyProgressBarLayout(widget,style);return style;
}
function makeActorHealthWidget(unit,commander=false){
  const style=configuredProgressBar(unit.userData.progressBarAssetId,ACTOR_PROGRESS_BAR_BP_ASSET_ID),group=new THREE.Group();unit.userData.progressBarAssetId=style.assetId;
  const layer=(color,width,height,z,order,map=null)=>{
    const mesh=new THREE.Mesh(soldierBarGeometry,new THREE.MeshBasicMaterial({color,map,transparent:true,opacity:.93,depthTest:false,depthWrite:false}));
    mesh.userData.healthWidgetLayer=true;mesh.scale.set(width,height,1);mesh.position.z=z;mesh.renderOrder=order;mesh.frustumCulled=false;group.add(mesh);return mesh;
  };
  const width=style.width*(commander?1.19:1),height=style.height;
  const outline=layer(style.backgroundColor,width+.09,height+.075,0,33),track=layer(style.backgroundColor,width,height,.005,34),lag=layer(style.backgroundColor,width,height*.78,.01,35),main=layer(style.mainColor,width,height*.78,.02,36);
  lag.visible=false;
  group.position.y=commander?1.52:1.42;group.visible=commander;unit.add(group);
  group.userData={current:unit.userData.hp,lagHealth:unit.userData.hp,hold:0,visibleTimer:0,main,lag,width,height,alwaysVisible:commander,regenPulse:0,backgroundLayers:[outline,track,lag],outline,track,outlinePaddingX:.09,outlinePaddingY:.075,widthMultiplier:commander?1.19:1,maxHealth:unit.userData.maxHp,mainColor:style.mainColor};
  applyProgressBarLayout(group,style);
  unit.userData.healthWidget=group;
  positionActorHealthWidget(unit);
}
function positionActorHealthWidget(unit){
  const widget=unit?.userData?.healthWidget,visual=unit?.children?.find(child=>child.userData?.characterVisual);if(!widget||!visual)return;
  unit.updateMatrixWorld(true);const bounds=new THREE.Box3().setFromObject(visual),origin=unit.getWorldPosition(new THREE.Vector3()),scale=unit.getWorldScale(new THREE.Vector3());
  widget.position.y=(bounds.max.y-origin.y)/Math.max(.001,Math.abs(scale.y))+normalizeHealthBarOffset(unit.userData.healthBarOffset,ACTOR_HEALTH_BAR_OFFSET);
}
function showActorHealth(unit,previousHealth){
  const data=unit.userData.healthWidget?.userData;if(!data)return;
  data.current=Math.max(0,unit.userData.hp);data.maxHealth=Math.max(1,unit.userData.maxHp);data.lagHealth=Math.max(data.lagHealth,previousHealth);
  data.hold=.24;data.visibleTimer=data.alwaysVisible?Infinity:SOLDIER_HEALTH_WIDGET_DURATION;data.regenPulse=0;
  data.main.material.color.set(data.mainColor);
  unit.userData.healthWidget.visible=true;
}
function updateActorHealthWidgets(dt){
  for(const unit of [master,...followers,...enemyUnits]){
    const widget=unit.userData.healthWidget,data=widget?.userData;if(!data)continue;
    if(!unit.userData.alive){widget.visible=false;continue}
    const regenerating=!!unit.userData.regenActive;
    data.current=Math.max(0,unit.userData.hp);
    const state=advanceLaggingHealthBar({current:data.current,lag:data.lagHealth,hold:data.hold,visibleTimer:data.visibleTimer,regenerating,dt});
    data.lagHealth=state.lag;data.hold=state.hold;data.visibleTimer=data.alwaysVisible?Infinity:state.visibleTimer;
    data.regenPulse=Math.max(0,data.regenPulse-dt*3.4);
    widget.visible=data.alwaysVisible||state.visible||regenerating;
    const max=Math.max(1,unit.userData.maxHp);data.maxHealth=max;
    data.lag.visible=state.lag>state.current+.001;
    setWidgetFill(data.lag,state.lag/max,data.width,data.height);
    setWidgetFill(data.main,data.current/max,data.width,data.height);
    data.main.material.color.set(regenerating?0x71e89a:data.mainColor);
    data.main.material.opacity=regenerating?.88+.12*(.5+.5*Math.sin(totalTime*12)): .95;
    data.lag.material.opacity=.92;
    widget.quaternion.copy(unit.quaternion).invert().multiply(camera.quaternion);
  }
}

const MODEL_SPECS = {
  swordsman: ["./Models/crownwake-swordsman-v02.glb", 1.22, 2.51],
  chModel: ["./Models/CH_Model.glb", 1.22],
  crownwakeBuilding: ["./Models/Crownwake_Building.glb", 2]
};
const GROUND_MODEL_SPECS = {
  crownwakeBase: ["./Models/Crownwake_Base.glb", 64]
};
const FOREST_FENCE_SPECS=[
  ["./Models/Forest_House_Fence_01.glb",1.55],
  ["./Models/Forest_House_Fence_02.glb",1.55],
  ["./Models/Forest_House_Fence_03.glb",1.55],
  ["./Models/Forest_House_Fence_04.glb",1.55]
];
const modelTemplates = {};
const gltfLoader = new GLTFLoader();
const importedModelTemplates=new Map(),importedModelLoadErrors=new Map();
let importedModelDatabasePromise=null;
function openImportedModelDatabase(){
  if(!globalThis.indexedDB)return Promise.reject(new Error("This browser cannot store imported GLB files."));
  if(importedModelDatabasePromise)return importedModelDatabasePromise;
  importedModelDatabasePromise=new Promise((resolve,reject)=>{
    const request=globalThis.indexedDB.open(IMPORTED_MODEL_DATABASE_NAME,1);
    request.onupgradeneeded=()=>{const database=request.result;if(!database.objectStoreNames.contains(IMPORTED_MODEL_STORE_NAME))database.createObjectStore(IMPORTED_MODEL_STORE_NAME,{keyPath:"id"});};
    request.onsuccess=()=>resolve(request.result);
    request.onerror=()=>reject(request.error??new Error("Imported model storage could not be opened."));
    request.onblocked=()=>reject(new Error("Close other Crownwake tabs before importing a GLB."));
  });
  return importedModelDatabasePromise;
}
async function writeImportedModelBuffer(assetId,buffer){
  const database=await openImportedModelDatabase();
  return new Promise((resolve,reject)=>{
    const transaction=database.transaction(IMPORTED_MODEL_STORE_NAME,"readwrite");
    transaction.oncomplete=()=>resolve();
    transaction.onerror=()=>reject(transaction.error??new Error("Imported model storage could not be updated."));
    transaction.onabort=()=>reject(transaction.error??new Error("Imported model storage was interrupted."));
    transaction.objectStore(IMPORTED_MODEL_STORE_NAME).put({id:assetId,buffer:buffer.slice(0)});
  });
}
async function readImportedModelBuffer(assetId){
  const database=await openImportedModelDatabase();
  return new Promise((resolve,reject)=>{
    const transaction=database.transaction(IMPORTED_MODEL_STORE_NAME,"readonly"),request=transaction.objectStore(IMPORTED_MODEL_STORE_NAME).get(assetId);
    request.onsuccess=()=>resolve(request.result?.buffer instanceof ArrayBuffer?request.result.buffer:null);
    request.onerror=()=>reject(request.error??new Error("Imported model source could not be read."));
  });
}
async function readImportedModelSourceBuffer(model){
  const stored=await readImportedModelBuffer(model.id).catch(()=>null);if(stored)return stored;
  if(!model?.sourcePath)return null;
  const response=await fetch(`./${model.sourcePath}`);if(!response.ok)return null;
  const buffer=await response.arrayBuffer();await writeImportedModelBuffer(model.id,buffer).catch(()=>{});return buffer;
}
async function deleteImportedModelBuffer(assetId){
  const database=await openImportedModelDatabase();
  return new Promise((resolve,reject)=>{
    const transaction=database.transaction(IMPORTED_MODEL_STORE_NAME,"readwrite");
    transaction.oncomplete=()=>resolve();
    transaction.onerror=()=>reject(transaction.error??new Error("Imported model source could not be removed."));
    transaction.onabort=()=>reject(transaction.error??new Error("Imported model removal was interrupted."));
    transaction.objectStore(IMPORTED_MODEL_STORE_NAME).delete(assetId);
  });
}
function parseImportedGlb(buffer){
  return new Promise((resolve,reject)=>gltfLoader.parse(buffer,"",gltf=>{
    const model=gltf.scene??gltf.scenes?.[0];if(model)resolve(model);else reject(new Error("The GLB does not contain a scene."));
  },reject));
}
function isImportedModelConstructionHelper(object){
  return /^(?:CUT -|Roof (?:extension|pocket) -|Sample plane -)/i.test(String(object?.name??"").trim());
}
function removeImportedModelConstructionHelpers(model){
  const helpers=new Set();
  model.traverse(object=>{if(object!==model&&isImportedModelConstructionHelper(object))helpers.add(object);});
  if(helpers.size)model.traverse(object=>{if(object!==model&&object.isMesh&&object.name==="Cube")helpers.add(object);});
  const roots=[...helpers].filter(object=>{
    let parent=object.parent;
    while(parent){if(helpers.has(parent))return false;parent=parent.parent;}
    return true;
  });
  for(const object of roots)object.parent?.remove(object);
  return roots.length;
}
function prepareImportedModelTemplate(model){
  removeImportedModelConstructionHelpers(model);
  const bounds=new THREE.Box3().setFromObject(model),size=bounds.getSize(new THREE.Vector3());
  if(size.y>.001)model.scale.multiplyScalar(IMPORTED_MODEL_TARGET_HEIGHT/size.y);
  model.updateMatrixWorld(true);
  const placedBounds=new THREE.Box3().setFromObject(model),center=placedBounds.getCenter(new THREE.Vector3());
  model.position.x-=center.x;model.position.z-=center.z;model.position.y-=placedBounds.min.y;
  const materialIds=new Map(),materials=[];
  model.traverse(part=>{
    if(!part.isMesh)return;
    part.castShadow=true;part.receiveShadow=true;
    const materialArray=Array.isArray(part.material),sourceMaterials=(materialArray?part.material:[part.material]).map(material=>material?.isMaterial?material:new THREE.MeshStandardMaterial({color:0xffffff,roughness:.82,metalness:.02}));
    for(const material of sourceMaterials){
      let slotId=materialIds.get(material);
      if(!slotId){slotId=`material-${materials.length+1}`;materialIds.set(material,slotId);materials.push({id:slotId,name:String(material.name??"").trim()||`Material ${materials.length+1}`});}
      material.userData={...material.userData,importedModelMaterialSlotId:slotId};
    }
    part.material=materialArray?sourceMaterials:sourceMaterials[0];part.userData.importedModelMaterialArray=materialArray;
  });
  model.userData.importedModelMaterials=materials;
  return model;
}
function cloneImportedModelMaterial(material){
  const clone=material.clone();clone.userData={...material.userData};return clone;
}
function setImportedModelMeshMaterials(part,materials){part.material=part.userData.importedModelMaterialArray?materials:materials[0];}
function cloneImportedModelTemplate(assetId){
  const template=importedModelTemplates.get(assetId);if(!template)return null;
  const model=template.clone(true);
  model.traverse(part=>{
    if(!part.isMesh||!part.material)return;
    const materialArray=Array.isArray(part.material),sourceMaterials=materialArray?part.material:[part.material],baseMaterials=sourceMaterials.map(cloneImportedModelMaterial);
    part.userData.importedModelMaterialArray=materialArray;part.userData.importedModelBaseMaterials=baseMaterials;part.userData.editorMaterialOverride=false;setImportedModelMeshMaterials(part,baseMaterials);
  });
  return model;
}
function contentBrowserModelScale(assetId){return normalizeModelScale(contentBrowserState.modelScales[assetId])}
function applyContentBrowserModelScale(visual,assetId){
  if(!visual)return null;
  visual.scale.multiply(new THREE.Vector3(...contentBrowserModelScale(assetId)));return visual;
}
function cloneContentBrowserModelVisual(assetId){
  let visual=null;
  if(assetId===CHARACTER_MODEL_ASSET_ID)visual=modelTemplates.chModel?.clone(true)??null;
  else if(assetId===SWORDSMAN_MODEL_ASSET_ID)visual=modelTemplates.swordsman?cloneAnimatedModel(modelTemplates.swordsman):null;
  else if(assetId===CROWNWAKE_BUILDING_MODEL_ASSET_ID)visual=modelTemplates.crownwakeBuilding?.clone(true)??null;
  else if(assetId===CROWNWAKE_BASE_MODEL_ASSET_ID)visual=modelTemplates.crownwakeBase?.clone(true)??null;
  else if(assetId?.startsWith("imported-model:"))visual=cloneImportedModelTemplate(assetId);
  else if(assetId==="primitive-cube")visual=new THREE.Mesh(primitiveCubeGeometry.clone(),mat(0xffffff));
  else if(assetId==="archer-tower")visual=makeArcherTower();
  const fence=/^forest-fence:(\d+)$/.exec(assetId??"");
  if(fence)visual=forestFenceTemplates[Number(fence[1])]?.clone(true)??null;
  const rock=/^rock-pillar:(\d+)$/.exec(assetId??"");
  if(rock)visual=makeSedimentaryRock(Number(rock[1]));
  return applyContentBrowserModelScale(visual,assetId);
}
function tintContentBrowserModelVisual(visual,materialColor){
  const colour=new THREE.Color(materialColor);
  visual.traverse(part=>{
    if(!part.isMesh||!part.material)return;
    const source=Array.isArray(part.material)?part.material:[part.material],materials=source.map(material=>{const clone=material.clone();if(clone.color?.isColor)clone.color.copy(colour);return clone;});
    part.material=Array.isArray(part.material)?materials:materials[0];part.castShadow=true;part.receiveShadow=true;
  });
}
function isCrownwakeCollisionNode(node){return Boolean(node?.userData?.crownwakeCollision||node?.userData?.crownwake_collision)||/^COLLISION(?:[_\s-]|$)/i.test(node?.name??"")}
function crownwakeCollisionMeshes(visual){
  const meshes=[];visual?.traverse?.(part=>{
    if(!part?.isMesh)return;
    let collision=isCrownwakeCollisionNode(part);
    for(let parent=part.parent;!collision&&parent;parent=parent.parent){collision=isCrownwakeCollisionNode(parent);if(parent===visual)break;}
    if(!collision)return;
    part.userData.crownwakeCollision=true;meshes.push(part);
  });
  return meshes;
}
function hideCrownwakeCollisionMeshes(visual){for(const mesh of crownwakeCollisionMeshes(visual))mesh.visible=false;}
function collisionMeshBounds(meshes){
  const bounds=new THREE.Box3().makeEmpty();
  for(const mesh of meshes){
    const geometry=mesh.geometry;if(!geometry?.getAttribute?.("position"))continue;
    geometry.computeBoundingBox?.();if(!geometry.boundingBox)continue;
    mesh.updateWorldMatrix(true,false);bounds.union(geometry.boundingBox.clone().applyMatrix4(mesh.matrixWorld));
  }
  return bounds;
}
function collisionFootprintCellKey(x,z){return `${x}:${z}`}
function collisionFootprintSegmentDistance(point,first,second){
  const dx=second.x-first.x,dz=second.z-first.z,length=dx*dx+dz*dz;
  const progress=length>.000001?THREE.MathUtils.clamp(((point.x-first.x)*dx+(point.z-first.z)*dz)/length,0,1):0;
  return Math.hypot(point.x-(first.x+dx*progress),point.z-(first.z+dz*progress));
}
function collisionFootprintTriangleContains(point,first,second,third){
  const cross=(left,right)=>((right.x-left.x)*(point.z-left.z)-(right.z-left.z)*(point.x-left.x)),a=cross(first,second),b=cross(second,third),c=cross(third,first);
  return !(a<-.00001&&b>.00001||a>.00001&&b<-.00001||b<-.00001&&c>.00001||b>.00001&&c<-.00001||c<-.00001&&a>.00001||c>.00001&&a<-.00001);
}
function addCollisionFootprintTriangle(cells,first,second,third,cellSize){
  const minX=Math.min(first.x,second.x,third.x)-cellSize*.56,maxX=Math.max(first.x,second.x,third.x)+cellSize*.56,minZ=Math.min(first.z,second.z,third.z)-cellSize*.56,maxZ=Math.max(first.z,second.z,third.z)+cellSize*.56,area=Math.abs((second.x-first.x)*(third.z-first.z)-(second.z-first.z)*(third.x-first.x));
  const minCellX=Math.floor(minX/cellSize),maxCellX=Math.ceil(maxX/cellSize),minCellZ=Math.floor(minZ/cellSize),maxCellZ=Math.ceil(maxZ/cellSize),edgeDistance=cellSize*.57;
  for(let z=minCellZ;z<=maxCellZ;z++)for(let x=minCellX;x<=maxCellX;x++){
    const point={x:x*cellSize,z:z*cellSize},distance=Math.min(collisionFootprintSegmentDistance(point,first,second),collisionFootprintSegmentDistance(point,second,third),collisionFootprintSegmentDistance(point,third,first));
    if((area>cellSize*cellSize*.012&&collisionFootprintTriangleContains(point,first,second,third))||distance<=edgeDistance)cells.set(collisionFootprintCellKey(x,z),{x,z});
  }
}
function mergeCollisionFootprintCells(cells,cellSize){
  const remaining=new Map(cells),parts=[];
  while(remaining.size){
    const start=[...remaining.values()].sort((left,right)=>left.z-right.z||left.x-right.x)[0];let width=1;
    while(remaining.has(collisionFootprintCellKey(start.x+width,start.z)))width++;
    let height=1,canExtend=true;
    while(canExtend){for(let x=start.x;x<start.x+width;x++)if(!remaining.has(collisionFootprintCellKey(x,start.z+height))){canExtend=false;break}if(canExtend)height++;}
    for(let z=start.z;z<start.z+height;z++)for(let x=start.x;x<start.x+width;x++)remaining.delete(collisionFootprintCellKey(x,z));
    parts.push({x:(start.x+(width-1)*.5)*cellSize,z:(start.z+(height-1)*.5)*cellSize,half:{x:width*cellSize*.5,z:height*cellSize*.5}});
  }
  return parts;
}
function modelCollisionFootprints(visual,fallback){
  visual.updateMatrixWorld(true);const collisionMeshes=crownwakeCollisionMeshes(visual),sources=collisionMeshes.length?collisionMeshes:null,bounds=sources?collisionMeshBounds(sources):new THREE.Box3().setFromObject(visual),size=bounds.getSize(new THREE.Vector3()),cellSize=Math.max(COLLISION_FOOTPRINT_CELL_SIZE,Math.max(size.x,size.z)/42),collisionHeight=Math.max(.45,Math.min(1.2,size.y*.38)),cells=new Map(),first=new THREE.Vector3(),second=new THREE.Vector3(),third=new THREE.Vector3();
  const addMeshFootprint=part=>{
    const positions=part?.isMesh?part.geometry?.getAttribute?.("position"):null;if(!positions)return;
    const indices=part.geometry.index;part.updateWorldMatrix(true,false);const vertexAt=(index,target)=>target.fromBufferAttribute(positions,indices?indices.getX(index):index).applyMatrix4(part.matrixWorld);
    const count=indices?indices.count:positions.count;
    for(let index=0;index+2<count;index+=3){
      vertexAt(index,first);vertexAt(index+1,second);vertexAt(index+2,third);
      if(Math.min(first.y,second.y,third.y)>collisionHeight)continue;
      addCollisionFootprintTriangle(cells,first,second,third,cellSize);
    }
  };
  if(sources)for(const part of sources)addMeshFootprint(part);else visual.traverse(addMeshFootprint);
  const footprints=mergeCollisionFootprintCells(cells,cellSize);return footprints.length?footprints:[{x:0,z:0,half:{x:Math.max(.08,fallback?.x??1.5),z:Math.max(.08,fallback?.z??1.5)}}];
}
function groundContentBrowserModelVisual(visual){
  visual.updateMatrixWorld(true);
  const bounds=new THREE.Box3().setFromObject(visual),size=bounds.getSize(new THREE.Vector3()),center=bounds.getCenter(new THREE.Vector3());
  if(!Number.isFinite(size.x)||!Number.isFinite(size.y)||!Number.isFinite(size.z))return {x:1.5,y:3,z:1.5};
  visual.position.x-=center.x;visual.position.z-=center.z;visual.position.y-=bounds.min.y;visual.updateMatrixWorld(true);
  return {x:Math.max(.3,size.x*.5),y:Math.max(.4,size.y),z:Math.max(.3,size.z*.5)};
}
function isContentBrowserModelAsset(asset){return Boolean(asset)&&["Model","Mesh","Structure","GLB Model"].includes(asset.type)&&isContentBrowserModelId(asset.id)&&asset.id!=="box"&&!hiddenEditorAssets.has(asset.id);}
function contentBrowserModelOptions(){
  const options=[...BUILDING_BLUEPRINT_MODELS];
  for(const asset of contentBrowserAssetSpecs().filter(isContentBrowserModelAsset)){
    if(!options.some(option=>option.id===asset.id))options.push({id:asset.id,label:asset.name});
  }
  return options;
}
function resolveContentBrowserModelId(assetId,fallbackAssetId="box"){
  const options=contentBrowserModelOptions();
  return options.some(option=>option.id===assetId)?assetId:options.some(option=>option.id===fallbackAssetId)?fallbackAssetId:options[0]?.id??"box";
}
function restoreImportedModelBaseMaterials(object){
  object?.traverse(part=>{
    if(!part.isMesh||!Array.isArray(part.userData.importedModelBaseMaterials)||!part.userData.importedModelBaseMaterials.length)return;
    const restoredMaterials=part.userData.importedModelBaseMaterials.map(cloneImportedModelMaterial);setImportedModelMeshMaterials(part,restoredMaterials);part.userData.editorMaterialOverride=false;
  });
}
function importedModelMaterialBySlot(object,slotId){
  let selectedMaterial=null;
  object?.traverse(part=>{
    if(selectedMaterial||!part.isMesh)return;
    selectedMaterial=part.userData.importedModelBaseMaterials?.find(material=>material.userData?.importedModelMaterialSlotId===slotId)??null;
  });
  return selectedMaterial;
}
async function loadPersistedImportedModels(){
  for(const importedModel of contentBrowserState.importedModels){
    try{
      const buffer=await readImportedModelSourceBuffer(importedModel);if(!buffer)throw new Error("The source GLB is missing from this browser.");
      const template=prepareImportedModelTemplate(await parseImportedGlb(buffer));
      importedModelTemplates.set(importedModel.id,template);importedModel.materials=template.userData.importedModelMaterials.map(material=>({...material}));importedModelLoadErrors.delete(importedModel.id);
    }catch(error){importedModelLoadErrors.set(importedModel.id,error instanceof Error?error.message:"The GLB could not be loaded.");console.warn(`Imported model unavailable: ${importedModel.name}`,error);}
  }
}
function loadCharacterModel([url, targetHeight, bodyHeight]) {
  return gltfLoader.loadAsync(url).then(({ scene: model, animations }) => {
    model.animations=animations;
    const bounds = new THREE.Box3().setFromObject(model), size = bounds.getSize(new THREE.Vector3());
    model.scale.multiplyScalar(targetHeight / Math.max(bodyHeight??size.y, .001));
    model.updateMatrixWorld(true);
    const grounded = new THREE.Box3().setFromObject(model);
    model.position.y -= grounded.min.y;
    model.traverse(child => {
      if (!child.isMesh) return;
      child.castShadow = true;
      child.receiveShadow = true;
    });
    return model;
  });
}
function loadGroundModel([url,targetSize]){
  return gltfLoader.loadAsync(url).then(({scene:model})=>{
    const bounds=new THREE.Box3().setFromObject(model),size=bounds.getSize(new THREE.Vector3());
    model.scale.multiplyScalar(targetSize/Math.max(size.x,size.z,.001));model.updateMatrixWorld(true);
    const fitted=new THREE.Box3().setFromObject(model),center=fitted.getCenter(new THREE.Vector3());
    model.position.x-=center.x;model.position.z-=center.z;model.position.y-=fitted.max.y;
    model.traverse(child=>{if(!child.isMesh)return;child.castShadow=true;child.receiveShadow=true;});
    model.userData.groundModelSize=targetSize;return model;
  });
}
await Promise.all(Object.entries(MODEL_SPECS).map(async ([key, spec]) => {
  try { modelTemplates[key] = await loadCharacterModel(spec); }
  catch (error) { console.warn(`Model fallback active for ${key}`, error); }
}));
await Promise.all(Object.entries(GROUND_MODEL_SPECS).map(async([key,spec])=>{
  try{modelTemplates[key]=await loadGroundModel(spec)}
  catch(error){console.warn(`Ground model fallback active for ${key}`,error)}
}));
function loadEnvironmentModel([url,targetHeight]){
  return gltfLoader.loadAsync(url).then(({scene:model})=>{
    const bounds=new THREE.Box3().setFromObject(model),size=bounds.getSize(new THREE.Vector3());
    model.scale.multiplyScalar(targetHeight/Math.max(size.y,.001));model.updateMatrixWorld(true);
    const placedBounds=new THREE.Box3().setFromObject(model),center=placedBounds.getCenter(new THREE.Vector3());
    model.position.x-=center.x;model.position.z-=center.z;model.position.y-=placedBounds.min.y;
    model.traverse(child=>{if(child.isMesh){child.castShadow=true;child.receiveShadow=true;}});
    return model;
  });
}
const forestFenceTemplates=await Promise.all(FOREST_FENCE_SPECS.map(async spec=>{
  try{return await loadEnvironmentModel(spec);}
  catch(error){console.warn(`Forest fence asset unavailable: ${spec[0]}`,error);return null;}
}));
await loadPersistedImportedModels();
function characterVisual(assetId) {
  const visual = cloneContentBrowserModelVisual(assetId);
  if (visual) visual.userData.characterVisual = true;
  return visual;
}
function setCharacterVisual(character, assetId, fallback) {
  const previous = character.children.find(child => child.userData.characterVisual);
  if (previous) character.remove(previous);
  const visual = characterVisual(assetId) ?? applyContentBrowserModelScale(fallback(),assetId);
  visual.userData.characterVisual = true;
  visual.userData.basePosition=visual.position.clone();
  visual.userData.baseScale=visual.scale.clone();
  character.add(visual);
  attachCharacterAnimation(character,visual);
}
const fallenMaterial=new THREE.MeshStandardMaterial({color:0x34383a,roughness:1,metalness:0,flatShading:true});
function setFallenAppearance(character, fallen) {
  const visual=character.children.find(child=>child.userData.characterVisual);
  visual?.traverse(mesh=>{
    if(!mesh.isMesh)return;
    if(fallen){
      if(!mesh.userData.liveMaterial)mesh.userData.liveMaterial=mesh.material;
      mesh.material=Array.isArray(mesh.material)?mesh.material.map(()=>fallenMaterial):fallenMaterial;
    }else if(mesh.userData.liveMaterial){
      mesh.material=mesh.userData.liveMaterial;delete mesh.userData.liveMaterial;
    }
  });
}
function restoreSoldierPose(character){
  character.rotation.x=0;character.rotation.z=0;character.position.y=GROUND_Y;
}
function prepareDamageVisual(character) {
  const visual=character.children.find(child=>child.userData.characterVisual), entries=[];
  visual?.traverse(mesh=>{
    if(!mesh.isMesh)return;
    const source=Array.isArray(mesh.material)?mesh.material:[mesh.material];
    const cloned=source.map(material=>material.clone());
    mesh.material=Array.isArray(mesh.material)?cloned:cloned[0];
    cloned.forEach(material=>entries.push({material,baseColor:material.color?.clone(),baseEmissive:material.emissive?.clone()}));
  });
  character.userData.damageMaterials=entries;
}
function tintCharacter(character,color) {
  const visual=character.children.find(child=>child.userData.characterVisual);
  visual?.traverse(mesh=>{
    if(!mesh.isMesh)return;
    const source=Array.isArray(mesh.material)?mesh.material:[mesh.material];
    const tinted=source.map(material=>{const clone=material.clone();if(character.userData.modelAssetId!==SWORDSMAN_MODEL_ASSET_ID||material.name==="Team_Red")clone.color?.setHex(color);clone.roughness=.88;return clone});
    mesh.material=Array.isArray(mesh.material)?tinted:tinted[0];
  });
}
function updateMasterDamageEffect(dt) {
  damagePulse=Math.max(0,damagePulse-dt*1.35);
  if(sinceDamage>1.2)damageStacks=Math.max(0,damageStacks-dt*.45);
  const maxHealth=INDEPENDENT_SOLDIERS?(master?.userData.maxHp??32):PLAYER_COMMANDER.maxHealth;
  const missing=1-masterHealth/maxHealth, recent=Math.max(0,1-sinceDamage/.8);
  const intensity=Math.min(5.5,(missing*.85+damagePulse)*(1+damageStacks*.42)*2);
  const tint=Math.min(.72,missing*.38+recent*.36+damagePulse*.24);
  for(const {material,baseColor,baseEmissive} of master.userData.damageMaterials??[]){
    if(material.color&&baseColor)material.color.copy(baseColor).lerp(new THREE.Color(0xff243f),tint);
    if(material.emissive){material.emissive.copy(baseEmissive??new THREE.Color()).lerp(new THREE.Color(0xff102f),Math.min(1,intensity));material.emissiveIntensity=.15+intensity}
  }
}
function updateSoldierDamageEffects(dt) {
  for(const actor of [...(INDEPENDENT_SOLDIERS?[master]:[]),...followers,...enemyUnits]){
    if(!actor.userData.alive)continue;
    actor.userData.hitPulse=Math.max(0,(actor.userData.hitPulse||0)-dt*3.8);
    const pulse=actor.userData.hitPulse;
    for(const {material,baseColor,baseEmissive} of actor.userData.damageMaterials??[]){
      if(material.color&&baseColor)material.color.copy(baseColor).lerp(new THREE.Color(0xffe2c2),pulse*.32);
      if(material.emissive){material.emissive.copy(baseEmissive??new THREE.Color()).lerp(new THREE.Color(0xff5533),pulse);material.emissiveIntensity=.12+pulse*2}
    }
  }
}

function decayDebugSignals(dt) {
  for (const actor of [master, ...followers, ...enemyUnits]) {
    if (!actor?.userData) continue;
    actor.userData.collisionContacts = Math.max(0, (actor.userData.collisionContacts ?? 0) - dt * 2.8);
  }
}

function unitLabel(unit) {
  if (!unit) return "none";
  const side = unit.userData.faction === "player" ? "P" : "E";
  const role = unit.userData.isMaster ? "commander" : unit.userData.unitCommander ? "promoted" : "soldier";
  return `${side}-${role}-${String(unit.id ?? 0).slice(-4)}`;
}

function allLiveUnits() {
  return [master, ...followers, ...enemyUnits].filter(unit => unit?.visible && unit.userData?.alive);
}

function debugObstaclesFor(unit, target = null) {
  return [...allLiveUnits()
    .filter(other => other !== unit && other !== target && other.userData.alive !== false)
    .map(other => ({
      x: other.position.x,
      z: other.position.z,
      radius: Math.max(other.userData.collisionHalf?.x ?? .2, other.userData.collisionHalf?.z ?? .2)
    })),...ensureNavigationGrid().obstacles.map(obstacle => ({x:obstacle.x,z:obstacle.z,radius:Math.hypot(obstacle.half.x,obstacle.half.z)}))];
}

function debugTargetFor(unit) {
  return unit.userData.lockedTarget ?? unit.userData.waitingDuelTarget ?? unit.userData.commanderTarget ?? null;
}

function debugSnapshotFor(unit) {
  const target = debugTargetFor(unit);
  const targetDistance = target?.position ? unit.position.distanceTo(target.position) : null;
  const obstacles = target ? debugObstaclesFor(unit, target) : [];
  const lineOfSight = target ? !lineOfSightBlocked(unit.position, target.position, obstacles, unit.userData.isMaster ? .42 : .34) : true;
  const collisionContacts = unit.userData.collisionContacts ?? 0;
  const navigationPath = unit.userData.navigationPath;
  const snapshot = actorDebugSnapshot({
    actor: unit,
    target,
    combat: !!activeEncounter && !activeEncounter.done && activeEncounter.aggro,
    targetDistance,
    lineOfSight,
    pathBlocked: Boolean(navigationPath?.failed) || (unit.userData.pathFailures ?? 0) > 0 || (unit.userData.pathStallTimer ?? 0) > .18,
    collisionContacts,
    attackRange: unit.userData.isMaster ? 1.4 : 1.05,
    now: totalTime
  });
  const navigationState = navigationPath?.failed ? "route failed" : navigationPath?.directFallback ? "direct fallback" : navigationPath ? `route ${Math.min(navigationPath.index + 1, navigationPath.cells.length)}/${navigationPath.cells.length}` : "idle";
  return { ...snapshot, navigationState };
}

function debugStateLabel(snapshot) {
  if (!snapshot.alive) return "down";
  if (snapshot.action === "fleeing") return "fleeing";
  if (snapshot.action === "stunned") return "stunned";
  if (snapshot.action === "celebrating") return "celebrating";
  if (snapshot.action === "attacking") return "attacking";
  if (snapshot.action === "seeking") return "seeking";
  if (snapshot.combatState === DUEL_PHASE.APPROACH || snapshot.combatState === DUEL_PHASE.LUNGE || snapshot.combatState === DUEL_PHASE.RECOVER) return "combat";
  if (snapshot.action === "moving") return "moving";
  return "idle";
}

function renderDebugMonitor() {
  if (!debugMode || !debugPanelVisible) return;
  const snapshots = allLiveUnits().map(unit => ({ unit, snapshot: debugSnapshotFor(unit) }));
  const focusedEntry = snapshots.find(entry => entry.unit.id === debugFocusId) ?? snapshots[0] ?? null;
  const focus = focusedEntry?.unit ?? null;
  debugFocusId = focus?.id ?? null;
  const selected = focusedEntry?.snapshot ?? null;
  const activeCount = snapshots.filter(entry => entry.snapshot.alive).length;
  const attackingCount = snapshots.filter(entry => entry.snapshot.action === "attacking").length;
  const waitingCount = snapshots.filter(entry => entry.snapshot.blockers.includes("waiting for duel slot")).length;
  debugPanel.innerHTML = `
    <div class="debug-shell">
      <div class="debug-head">
        <strong>AI MONITOR</strong>
        <span>${debugPanel.dataset.stats ?? mode} | ${activeCount} alive | ${attackingCount} attacking | ${waitingCount} waiting</span>
      </div>
      <div class="debug-focus">
        <small>selected</small>
        <h3>${focus ? unitLabel(focus) : "none"}</h3>
        ${selected ? `
          <div class="debug-grid">
            <span>life</span><strong>${selected.alive ? "alive" : "down"}</strong>
            <span>action</span><strong>${debugStateLabel(selected)}</strong>
            <span>combat</span><strong>${selected.combatState ?? "none"}</strong>
            <span>mode</span><strong>${selected.mode ?? "none"}</strong>
            <span>target</span><strong>${selected.targetId ?? "none"}</strong>
            <span>distance</span><strong>${selected.targetDistance == null ? "n/a" : selected.targetDistance.toFixed(2)}</strong>
            <span>range</span><strong>${selected.attackRange.toFixed(2)}</strong>
            <span>cooldown</span><strong>${selected.cooldown.toFixed(2)}s</strong>
            <span>LOS</span><strong>${selected.lineOfSight ? "clear" : "blocked"}</strong>
            <span>nav</span><strong>${selected.pathFailures > 0 ? `stalled x${selected.pathFailures}` : selected.navigationState}</strong>
            <span>collisions</span><strong>${selected.collisionContacts.toFixed(2)}</strong>
            <span>last hit</span><strong>${selected.lastDamageAt == null ? "n/a" : selected.lastDamageAt.toFixed(1)}s</strong>
            <span>last attack</span><strong>${selected.lastAttackAt == null ? "n/a" : selected.lastAttackAt.toFixed(1)}s</strong>
          </div>
          <p class="debug-blockers">${selected.blockers.length ? selected.blockers.join(" | ") : "No current blockers"}</p>
        ` : `<p class="debug-empty">No unit selected.</p>`}
      </div>
      <div class="debug-list">
        ${snapshots.map(({ unit, snapshot }) => `
          <button type="button" class="debug-row ${unit.id === debugFocusId ? "selected" : ""}" data-debug-unit="${unit.id}">
            <span>${unitLabel(unit)}</span>
            <strong>${debugStateLabel(snapshot)}</strong>
            <small>${snapshot.blockers[0] ?? (snapshot.targetDistance == null ? "idle" : `d ${snapshot.targetDistance.toFixed(2)}`)}</small>
          </button>
        `).join("")}
      </div>
    </div>
  `;
}

function toggleDebugMonitor(force) {
  if (!debugMode) return;
  debugPanelVisible = typeof force === "boolean" ? force : !debugPanelVisible;
  debugPanel.style.display = debugPanelVisible ? "block" : "none";
  if (debugButton) debugButton.textContent = debugPanelVisible ? "MONITOR ON" : "MONITOR";
  if (debugPanelVisible) renderDebugMonitor();
}
function syncCharacterRingPosition(actor,visual){
  const ring=actor.userData.encounterRing;if(!ring)return;
  const basePosition=visual.userData.basePosition;
  ring.position.x=visual.position.x-(basePosition?.x??0);
  ring.position.z=visual.position.z-(basePosition?.z??0);
}
function updateActorCombatAnimations(dt){
  for(const actor of [master,...followers,...enemyUnits]){
    const visual=actor.children.find(child=>child.userData.characterVisual);
    if(!visual)continue;
    if(updateCharacterAnimation(actor,dt)){syncCharacterRingPosition(actor,visual);continue;}
    actor.userData.attackAnim=Math.max(0,(actor.userData.attackAnim??0)-dt*3.8);
    actor.userData.damageAnim=Math.max(0,(actor.userData.damageAnim??0)-dt*3.2);
    const pose=combatVisualPose({attack:actor.userData.attackAnim,damage:actor.userData.damageAnim,celebration:actor.userData.celebrating?totalTime*7.2+(actor.userData.phase??0):0,reducedMotion});
    const basePosition=visual.userData.basePosition??new THREE.Vector3(),baseScale=visual.userData.baseScale??new THREE.Vector3(1,1,1);
    visual.position.copy(basePosition);visual.position.z+=pose.forward;visual.position.y+=pose.lift;
    visual.scale.set(baseScale.x*pose.scaleX,baseScale.y*pose.scaleY,baseScale.z*pose.scaleZ);
    syncCharacterRingPosition(actor,visual);
  }
}
function roundedBox(w, h, d, material, bevel = .12) {
  const shape = new THREE.Shape();
  const x = -w/2, y = -d/2, r = Math.min(bevel, w/3, d/3);
  shape.moveTo(x+r,y); shape.lineTo(x+w-r,y); shape.quadraticCurveTo(x+w,y,x+w,y+r); shape.lineTo(x+w,y+d-r);
  shape.quadraticCurveTo(x+w,y+d,x+w-r,y+d); shape.lineTo(x+r,y+d); shape.quadraticCurveTo(x,y+d,x,y+d-r); shape.lineTo(x,y+r); shape.quadraticCurveTo(x,y,x+r,y);
  const geo = new THREE.ExtrudeGeometry(shape,{depth:h,bevelEnabled:true,bevelSegments:1,steps:1,bevelSize:r*.55,bevelThickness:r*.55});
  geo.rotateX(Math.PI/2); geo.translate(0,h/2,d/2);
  const mesh = new THREE.Mesh(geo,material); mesh.castShadow = true; mesh.receiveShadow = true; return mesh;
}
function treeCanopyGeometry(width,height,shade=1){
  const geometry=new THREE.BoxGeometry(width,height,width),positions=geometry.getAttribute("position"),colors=new Float32Array(positions.count*3);
  const lower=new THREE.Color(0x738b5a).multiplyScalar(shade),upper=new THREE.Color(0xa8ba80).multiplyScalar(shade),color=new THREE.Color();
  for(let index=0;index<positions.count;index++){
    const blend=THREE.MathUtils.clamp((positions.getY(index)+height*.5)/height,0,1);color.lerpColors(lower,upper,blend);
    colors[index*3]=color.r;colors[index*3+1]=color.g;colors[index*3+2]=color.b;
  }
  geometry.setAttribute("color",new THREE.BufferAttribute(colors,3));return geometry;
}
function makeLowPolyTree({height=1.4,canopyWidth=.36,material=mats.treeLeaf,turn=0}){
  const tree=new THREE.Group(),trunkHeight=Math.max(.24,height*.22),canopyHeight=height-trunkHeight;
  const contact=new THREE.Mesh(contactOcclusionGeometry,contactOcclusionMaterial);contact.rotation.x=-Math.PI*.5;contact.position.y=.002;contact.scale.set(canopyWidth*.75,canopyWidth*.48,1);contact.renderOrder=1;tree.add(contact);
  const trunk=new THREE.Mesh(new THREE.BoxGeometry(.11,trunkHeight,.11),mats.treeTrunk);
  trunk.position.y=trunkHeight*.5;trunk.castShadow=true;trunk.receiveShadow=true;tree.add(trunk);
  const shade=material===mats.treeLeafDark ? .94 : 1;
  const canopyGeometry=treeCanopyGeometry(canopyWidth,canopyHeight,shade),canopy=new THREE.Mesh(canopyGeometry,material);
  // A scaled transparent canopy intersects the canopy faces and shimmers as the camera moves.
  // Edge segments keep the illustrated contour without adding another translucent surface.
  const canopyEdges=new THREE.LineSegments(new THREE.EdgesGeometry(canopyGeometry),new THREE.LineBasicMaterial({color:FOLIAGE_OUTLINE_COLOR,transparent:true,opacity:.72,depthTest:true,depthWrite:false}));
  canopyEdges.scale.setScalar(1.004);canopyEdges.position.y=trunkHeight+canopyHeight*.5;canopyEdges.rotation.y=turn;canopyEdges.renderOrder=2;
  canopy.position.y=trunkHeight+canopyHeight*.5;canopy.rotation.y=turn;canopy.castShadow=true;canopy.receiveShadow=true;tree.add(canopy,canopyEdges);
  const seed=height*37.31+canopyWidth*71.17+turn*13.73;
  tree.userData.treeWind={
    bendX:0,bendZ:0,velocityX:0,velocityZ:0,
    strength:.84+grassWindVariation(seed)*.28,
    response:.9+grassWindVariation(seed+19.7)*.2,
    angleScale:.9+grassWindVariation(seed+41.9)*.2,
    phaseJitter:(grassWindVariation(seed+67.1)-.5)*.7
  };
  return tree;
}
function registerEditorFoliage(object){if(object)editorFoliageObjects.add(object);return object}
function addTreeCluster({x,z,y=GROUND_Y,trees,variantIndex=null,turn=0,rotation=null,scale=null}){
  const cluster=new THREE.Group();
  for(const treeSpec of trees){
    const tree=makeLowPolyTree({height:treeSpec.height,canopyWidth:treeSpec.width,material:treeSpec.material,turn:0});
    tree.position.set(treeSpec.x,GROUND_Y,treeSpec.z);cluster.add(tree);
  }
  cluster.position.set(x,y,z);cluster.rotation.set(...(rotation??[0,turn,0]));cluster.scale.setScalar(.8);if(scale)cluster.scale.fromArray(scale);
  cluster.userData.editorSelectable=true;cluster.userData.editorAssetType="tree-cluster";cluster.userData.variantIndex=variantIndex;
  cluster.name=variantIndex===null?"Tree cluster":`Tree cluster ${variantIndex+1}`;
  battle.add(cluster);editorObjects.push(cluster);
  return registerEditorFoliage(cluster);
}
const FOLIAGE_OUTLINE_COLOR=0x172019;
const foliageTextureLoader=new THREE.TextureLoader(),tallConiferTexture=foliageTextureLoader.load("./assets/Trees/tall-conifer-billboard.png");
tallConiferTexture.colorSpace=THREE.SRGBColorSpace;tallConiferTexture.minFilter=THREE.LinearMipmapLinearFilter;tallConiferTexture.magFilter=THREE.LinearFilter;tallConiferTexture.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());
const editorCameraPlaceholderTexture=foliageTextureLoader.load("./assets/ui/camera-placeholder.png");
editorCameraPlaceholderTexture.colorSpace=THREE.SRGBColorSpace;editorCameraPlaceholderTexture.minFilter=THREE.LinearMipmapLinearFilter;editorCameraPlaceholderTexture.magFilter=THREE.LinearFilter;editorCameraPlaceholderTexture.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());
const LEGACY_TALL_CONIFER_TREE_CLUSTER_INDEX=6;
const TALL_CONIFER_VARIANTS=Object.freeze([
  {id:"short",label:"SHORT",scale:.58},
  {id:"short-medium",label:"SHORT MEDIUM",scale:.78},
  {id:"medium",label:"MEDIUM",scale:1},
  {id:"medium-tall",label:"MEDIUM TALL",scale:1.25},
  {id:"tall-tall",label:"TALL TALL",scale:1.55},
  {id:"tall-big",label:"TALL BIG",scale:1.88},
  {id:"big-big",label:"BIG BIG",scale:2.22}
]);
const DEFAULT_TALL_CONIFER_VARIANT=2;
const SPRITE_GRASS_ASSETS=Object.freeze([
  {id:"sprite-grass-01",label:"SPRITE GRASS 01",src:"./assets/grass/sprite-grass-01.png",aspect:1254/1254,height:1.18},
  {id:"sprite-grass-02",label:"SPRITE GRASS 02",src:"./assets/grass/sprite-grass-02.png",aspect:1660/948,height:.72},
  {id:"sprite-grass-03",label:"SPRITE GRASS 03",src:"./assets/grass/sprite-grass-03.png",aspect:1254/1254,height:1.28},
  {id:"sprite-grass-04",label:"SPRITE GRASS 04",src:"./assets/grass/sprite-grass-04.png",aspect:1447/1087,height:.66}
].map(spec=>{
  const texture=foliageTextureLoader.load(spec.src);texture.colorSpace=THREE.SRGBColorSpace;texture.minFilter=THREE.LinearMipmapLinearFilter;texture.magFilter=THREE.LinearFilter;texture.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());return Object.freeze({...spec,texture});
}));
const treeBillboardDirection=new THREE.Vector3(),treeBillboardParentQuaternion=new THREE.Quaternion(),treeBillboardFacingQuaternion=new THREE.Quaternion(),treeBillboardLocalQuaternion=new THREE.Quaternion();
function updateTreeBillboard(tree){
  const pivot=tree.userData.treeWind?.billboardPivot;if(!pivot)return;
  treeBillboardDirection.subVectors(camera.position,treeWindWorldPosition);treeBillboardDirection.y=0;
  if(treeBillboardDirection.lengthSq()<.000001)return;
  treeBillboardFacingQuaternion.setFromAxisAngle(WORLD_UP,Math.atan2(treeBillboardDirection.x,treeBillboardDirection.z));
  tree.getWorldQuaternion(treeBillboardParentQuaternion);
  treeBillboardLocalQuaternion.copy(treeBillboardParentQuaternion).invert().multiply(treeBillboardFacingQuaternion);
  pivot.quaternion.copy(treeBillboardLocalQuaternion);
}
function makeOutlinedFoliageBillboard(texture,width,height){
  const group=new THREE.Group(),geometry=new THREE.PlaneGeometry(width,height),fillMaterial=new THREE.MeshBasicMaterial({map:texture,transparent:true,alphaTest:.08,side:THREE.DoubleSide,toneMapped:false,depthWrite:true});
  // These authored sprites already contain their dark contour. Rendering one plane prevents alpha-layer interference.
  const fill=new THREE.Mesh(geometry,fillMaterial);fill.position.y=height*.5;fill.castShadow=false;fill.receiveShadow=false;group.add(fill);return group;
}
function tallConiferVariant(variantIndex=DEFAULT_TALL_CONIFER_VARIANT){return TALL_CONIFER_VARIANTS[variantIndex]??TALL_CONIFER_VARIANTS[DEFAULT_TALL_CONIFER_VARIANT]}
function makeTallConiferBillboard(){
  const tree=new THREE.Group(),billboardPivot=new THREE.Group(),sway=new THREE.Group();
  const height=4.1,width=height*(306/1242);sway.add(makeOutlinedFoliageBillboard(tallConiferTexture,width,height));billboardPivot.add(sway);tree.add(billboardPivot);
  const contact=new THREE.Mesh(contactOcclusionGeometry,contactOcclusionMaterial);contact.rotation.x=-Math.PI*.5;contact.position.y=.002;contact.scale.set(.72,.46,1);contact.renderOrder=1;tree.add(contact);
  tree.userData.treeWind={
    billboardPivot,sway,bendX:0,bendZ:0,velocityX:0,velocityZ:0,
    strength:1,response:1,angleScale:.72,phaseJitter:.27
  };
  return tree;
}
function addTallConiferBillboard({x,z,y=GROUND_Y,variantIndex=DEFAULT_TALL_CONIFER_VARIANT,turn=0,rotation=null,scale=null}){
  const variant=tallConiferVariant(variantIndex),tree=makeTallConiferBillboard();tree.position.set(x,y,z);tree.rotation.set(...(rotation??[0,turn,0]));tree.scale.setScalar(.9*variant.scale);if(scale)tree.scale.fromArray(scale);
  tree.userData.editorSelectable=true;tree.userData.editorAssetType="tree-billboard";tree.userData.variantIndex=TALL_CONIFER_VARIANTS.indexOf(variant);tree.userData.treeBillboard=true;tree.name=`Conifer ${variant.label.toLowerCase()}`;
  battle.add(tree);editorObjects.push(tree);return registerEditorFoliage(tree);
}
function makeGrassSpriteBillboard(spec){
  const root=new THREE.Group(),billboardPivot=new THREE.Group(),sway=new THREE.Group(),width=spec.height*spec.aspect;
  sway.add(makeOutlinedFoliageBillboard(spec.texture,width,spec.height));billboardPivot.add(sway);root.add(billboardPivot);
  root.userData.grassWind={billboardPivot,sway,bend:0,velocity:0,secondaryBend:0,secondaryVelocity:0,strength:.92,response:1,angleScale:.88,phaseJitter:.19};return root;
}
function addGrassSpriteBillboard({x,z,y=GROUND_Y,spriteIndex=0,turn=0,rotation=null,scale=null}){
  const safeSpriteIndex=Number.isInteger(spriteIndex)&&SPRITE_GRASS_ASSETS[spriteIndex]?spriteIndex:0,spec=SPRITE_GRASS_ASSETS[safeSpriteIndex],cluster=new THREE.Group(),sprite=makeGrassSpriteBillboard(spec);
  cluster.add(sprite);cluster.position.set(x,y,z);cluster.rotation.set(...(rotation??[0,turn,0]));cluster.scale.setScalar(.86);if(scale)cluster.scale.fromArray(scale);
  cluster.userData.grassSizeBaseScale=cluster.scale.clone();cluster.userData.editorSelectable=true;cluster.userData.editorAssetType="grass-cluster";cluster.userData.grassSprite=true;cluster.userData.spriteIndex=safeSpriteIndex;cluster.name=spec.label.toLowerCase();
  battle.add(cluster);editorObjects.push(cluster);applyGrassSize(cluster);return registerEditorFoliage(cluster);
}
const GRASS_CLUSTER_CATEGORIES=[
  {id:"medium",label:"MEDIUM",count:9,radius:.74,seed:0x9ed17},
  {id:"extreme-dense",label:"EXTREME DENSE",count:40,radius:1.1,seed:0xe71e5,spacingScale:.5}
];
const GRASS_CLUSTER_VERSION_COUNT=2,GRASS_CLUSTER_SECONDARY_SPREAD=1.55;
const GRASS_PLACEMENT_CANDIDATES=192,GRASS_MAX_VISIBLE_WIDTH_SCALE=1.17,GRASS_EDGE_GAP=.02;
const FOLIAGE_WIND_STORAGE_KEY="crownwake-foliage-wind-v1";
const TREE_WIND_STORAGE_KEY="crownwake-tree-wind-v1";
const FOLIAGE_PRESET_LIMIT=5;
const FOLIAGE_PRESET_STORAGE_KEY="crownwake-foliage-presets-v1";
const FOLIAGE_CONTROL_DEFINITIONS=Object.freeze([
  {key:"size",label:"Grass size",min:.5,max:2,step:.25,digits:2,unit:"x",kinds:["grass"]},
  {key:"proximity",label:"Proximity",min:.5,max:2,step:.05,digits:2,unit:"x",kinds:["grass"]},
  {key:"windSpeed",label:"Wind speed",min:.1,max:8,step:.1,digits:1},
  {key:"baseWindStrength",label:"Base strength",min:0,max:1.2,step:.01,digits:2},
  {key:"gustStrength",label:"Gust strength",min:0,max:3,step:.05,digits:2},
  {key:"springStrength",label:"Spring response",min:1,max:30,step:.5,digits:1},
  {key:"damping",label:"Motion damping",min:.7,max:.98,step:.01,digits:2},
  {key:"secondaryMovement",label:"Secondary sway",min:0,max:.8,step:.01,digits:2},
  {key:"maxBendAngle",label:"Maximum bend",min:0,max:60,step:1,digits:0,angle:true,unit:"°"},
  {key:"spatialFrequency",label:"Wave scale",min:.1,max:1.5,step:.05,digits:2},
  {key:"noiseScale",label:"Wind variation",min:.05,max:.8,step:.05,digits:2}
]);
const GRASS_WIND_DEFAULTS=Object.freeze({size:1,proximity:1,windSpeed:4.5,baseWindStrength:.64,gustStrength:1.6,spatialFrequency:.7,noiseScale:.25,springStrength:14,damping:.88,maxBendAngle:30,secondaryMovement:.3});
const TREE_WIND_DEFAULTS=Object.freeze({windSpeed:1.4,baseWindStrength:.09,gustStrength:.8,spatialFrequency:.32,noiseScale:.2,springStrength:7,damping:.91,maxBendAngle:8,secondaryMovement:.16});
const GRASS_WIND=Object.seal({
  direction:new THREE.Vector2(.94,.34).normalize(),
  size:1,
  proximity:1,
  windSpeed:4.5,
  baseWindStrength:.64,
  gustStrength:1.6,
  spatialFrequency:.7,
  noiseScale:.25,
  springStrength:14,
  damping:.88,
  maxBendAngle:THREE.MathUtils.degToRad(30),
  secondaryMovement:.3
});
const TREE_WIND=Object.seal({
  direction:new THREE.Vector2(.94,.34).normalize(),
  windSpeed:1.4,
  baseWindStrength:.09,
  gustStrength:.8,
  spatialFrequency:.32,
  noiseScale:.2,
  springStrength:7,
  damping:.91,
  maxBendAngle:THREE.MathUtils.degToRad(8),
  secondaryMovement:.16
});
let foliagePresetStore={},selectedFoliagePresetSlot=null,foliagePresetPanelKind=null;
function foliageControlDefinition(key){return FOLIAGE_CONTROL_DEFINITIONS.find(definition=>definition.key===key)??null}
function foliageControlApplies(definition,kind){return !definition.kinds||definition.kinds.includes(kind)}
function foliageControlDefinitions(profile){return FOLIAGE_CONTROL_DEFINITIONS.filter(definition=>foliageControlApplies(definition,profile.kind))}
function selectedFoliageProfile(){
  const type=editorSelection?.userData?.editorAssetType;
  if(["tree-cluster","tree-billboard"].includes(type))return {kind:"tree",label:"TREE WIND",wind:TREE_WIND,defaults:TREE_WIND_DEFAULTS,storageKey:TREE_WIND_STORAGE_KEY};
  if(type==="grass-cluster")return {kind:"grass",label:"GRASS WIND",wind:GRASS_WIND,defaults:GRASS_WIND_DEFAULTS,storageKey:FOLIAGE_WIND_STORAGE_KEY};
  return null;
}
function foliageDisplayValue(definition,wind){
  const value=wind[definition.key];return definition.angle?THREE.MathUtils.radToDeg(value):value;
}
function currentFoliagePresetValues(profile){
  const values={};for(const definition of foliageControlDefinitions(profile))values[definition.key]=foliageDisplayValue(definition,profile.wind);return values;
}
function normalizeFoliagePreset(preset,kind){
  if(!preset||typeof preset!=="object"||!preset.values||typeof preset.values!=="object")return null;
  const profile={kind},defaults=kind==="tree"?TREE_WIND_DEFAULTS:GRASS_WIND_DEFAULTS,values={};
  for(const definition of foliageControlDefinitions(profile)){
    const value=Number(preset.values[definition.key]??defaults[definition.key]);if(!Number.isFinite(value))return null;
    values[definition.key]=THREE.MathUtils.clamp(value,definition.min,definition.max);
  }
  return {values};
}
function foliagePresetSlots(kind){
  const current=Array.isArray(foliagePresetStore[kind])?foliagePresetStore[kind]:[];current.length=Math.min(current.length,FOLIAGE_PRESET_LIMIT);
  while(current.length<FOLIAGE_PRESET_LIMIT)current.push(null);
  foliagePresetStore[kind]=current;return current;
}
function loadFoliagePresetStore(){
  try{
    const saved=JSON.parse(localStorage.getItem(FOLIAGE_PRESET_STORAGE_KEY)||"null");if(!saved||typeof saved!=="object")return;
    for(const [kind,slots] of Object.entries(saved))if(Array.isArray(slots))foliagePresetStore[kind]=slots.slice(0,FOLIAGE_PRESET_LIMIT).map(preset=>normalizeFoliagePreset(preset,kind));
  }catch{}
}
function persistFoliagePresetStore(){
  try{localStorage.setItem(FOLIAGE_PRESET_STORAGE_KEY,JSON.stringify(foliagePresetStore));return true;}catch{return false}
}
function setFoliageWindValue(definition,value,wind){
  const safe=THREE.MathUtils.clamp(Number(value),definition.min,definition.max);
  wind[definition.key]=definition.angle?THREE.MathUtils.degToRad(safe):safe;return safe;
}
function loadFoliageWindSettings({storageKey,wind,kind}){
  try{
    const saved=JSON.parse(localStorage.getItem(storageKey)||"null");if(!saved||typeof saved!=="object")return;
    for(const definition of foliageControlDefinitions({kind}))if(Number.isFinite(Number(saved[definition.key])))setFoliageWindValue(definition,saved[definition.key],wind);
  }catch{}
}
function saveFoliageWindSettings(profile){
  const saved={};for(const definition of foliageControlDefinitions(profile))saved[definition.key]=foliageDisplayValue(definition,profile.wind);
  try{localStorage.setItem(profile.storageKey,JSON.stringify(saved));}catch{}
}
function formatFoliageValue(definition,value){
  const fixed=Number(value).toFixed(definition.digits),trimmed=definition.digits?fixed.replace(/\.?0+$/,""):fixed;
  return `${trimmed}${definition.unit??""}`;
}
function foliagePresetSummary(preset){
  const speed=foliageControlDefinition("windSpeed"),bend=foliageControlDefinition("maxBendAngle");
  return `${formatFoliageValue(speed,preset.values.windSpeed)} SPEED · ${formatFoliageValue(bend,preset.values.maxBendAngle)} BEND`;
}
function renderFoliagePresets(){
  const profile=selectedFoliageProfile(),list=$("foliage-preset-list"),actions=$("foliage-preset-actions");if(!profile)return;
  $("foliage-presets-title").textContent=`${profile.kind.toUpperCase()} PRESETS`;list.replaceChildren();
  const slots=foliagePresetSlots(profile.kind);
  slots.forEach((preset,index)=>{
    const row=document.createElement("button"),label=document.createElement("strong"),summary=document.createElement("small");
    row.type="button";row.className="foliage-preset-slot";row.disabled=!preset;row.classList.toggle("selected",index===selectedFoliagePresetSlot&&Boolean(preset));row.setAttribute("aria-pressed",String(index===selectedFoliagePresetSlot&&Boolean(preset)));
    label.textContent=`SLOT ${String(index+1).padStart(2,"0")}`;summary.textContent=preset?foliagePresetSummary(preset):"EMPTY";row.append(label,summary);
    if(preset)row.onclick=()=>{selectedFoliagePresetSlot=index;renderFoliagePresets();};list.append(row);
  });
  const selected=Number.isInteger(selectedFoliagePresetSlot)?slots[selectedFoliagePresetSlot]:null;actions.classList.toggle("hidden",!selected);
  if(!$("foliage-presets-panel").classList.contains("hidden"))requestAnimationFrame(positionFoliagePresetsPanel);
}
function setFoliagePresetPanel(open){
  const profile=selectedFoliageProfile(),panel=$("foliage-presets-panel"),visible=Boolean(open&&mode==="editor"&&profile);
  if(!visible){panel.classList.add("hidden");selectedFoliagePresetSlot=null;foliagePresetPanelKind=null;return}
  if(foliagePresetPanelKind!==profile.kind)selectedFoliagePresetSlot=null;
  foliagePresetPanelKind=profile.kind;panel.classList.remove("hidden");renderFoliagePresets();
}
function saveCurrentFoliagePreset(){
  const profile=selectedFoliageProfile();if(!profile)return;
  const slots=foliagePresetSlots(profile.kind),slot=slots.findIndex(preset=>preset===null);
  if(slot<0){setFoliagePresetPanel(true);$("editor-status").textContent=`All ${FOLIAGE_PRESET_LIMIT} ${profile.kind} preset slots are full. Delete one before saving.`;return}
  slots[slot]={values:currentFoliagePresetValues(profile)};selectedFoliagePresetSlot=slot;foliagePresetPanelKind=profile.kind;
  const persisted=persistFoliagePresetStore();setFoliagePresetPanel(true);
  $("editor-status").textContent=persisted?`${profile.label.toLowerCase()} saved to slot ${slot+1}.`:`Slot ${slot+1} is saved for this session, but browser storage is unavailable.`;
}
function loadSelectedFoliagePreset(){
  const profile=selectedFoliageProfile();if(!profile||!Number.isInteger(selectedFoliagePresetSlot))return;
  const preset=foliagePresetSlots(profile.kind)[selectedFoliagePresetSlot];if(!preset)return;
  for(const definition of foliageControlDefinitions(profile))setFoliageWindValue(definition,preset.values[definition.key],profile.wind);
  if(profile.kind==="grass"){applyGrassProximity();applyGrassSize();}
  syncFoliageControls();saveFoliageWindSettings(profile);$("editor-status").textContent=`${profile.kind} preset slot ${selectedFoliagePresetSlot+1} loaded.`;
}
function deleteSelectedFoliagePreset(){
  const profile=selectedFoliageProfile();if(!profile||!Number.isInteger(selectedFoliagePresetSlot))return;
  const slots=foliagePresetSlots(profile.kind),slot=selectedFoliagePresetSlot;if(!slots[slot])return;
  slots[slot]=null;selectedFoliagePresetSlot=null;persistFoliagePresetStore();renderFoliagePresets();$("editor-status").textContent=`${profile.kind} preset slot ${slot+1} deleted.`;
}
function syncFoliageControls(){
  const profile=selectedFoliageProfile();if(!profile)return;
  $("foliage-panel-title").textContent=profile.label;
  for(const input of document.querySelectorAll("[data-foliage-setting]")){
    const definition=foliageControlDefinition(input.dataset.foliageSetting);if(!definition)continue;
    const applies=foliageControlApplies(definition,profile.kind);input.closest("label")?.classList.toggle("hidden",!applies);if(!applies)continue;
    const value=foliageDisplayValue(definition,profile.wind);input.value=String(value);
    const output=document.querySelector(`[data-foliage-output="${definition.key}"]`);if(output)output.textContent=formatFoliageValue(definition,value);
  }
}
function applyFoliageControl(input){
  const profile=selectedFoliageProfile(),definition=foliageControlDefinition(input?.dataset?.foliageSetting);if(!profile||!definition)return;
  if(!foliageControlApplies(definition,profile.kind))return;
  setFoliageWindValue(definition,input.value,profile.wind);syncFoliageControls();saveFoliageWindSettings(profile);
  if(definition.key==="proximity")applyGrassProximity();
  if(definition.key==="size"){applyGrassSize();updateEditorTransformGizmo();updateEditorTransformInspector();}
  $("editor-status").textContent=`${profile.label.toLowerCase()} ${definition.label.toLowerCase()} updated live.`;
}
function resetFoliageControls(){
  const profile=selectedFoliageProfile();if(!profile)return;
  for(const definition of foliageControlDefinitions(profile))setFoliageWindValue(definition,profile.defaults[definition.key],profile.wind);
  if(profile.kind==="grass"){applyGrassProximity();applyGrassSize();}
  syncFoliageControls();saveFoliageWindSettings(profile);$("editor-status").textContent=`${profile.label.toLowerCase()} restored to its defaults.`;
}
function updateFoliagePanel(){
  const visible=mode==="editor"&&["grass-cluster","tree-cluster","tree-billboard"].includes(editorSelection?.userData?.editorAssetType);
  const presetsOpen=!$("foliage-presets-panel").classList.contains("hidden");
  $("foliage-panel").classList.toggle("hidden",!visible);
  if(!visible){setFoliagePresetPanel(false);return}
  syncFoliageControls();requestAnimationFrame(positionFoliagePanel);if(presetsOpen)setFoliagePresetPanel(true);
}
loadFoliageWindSettings({storageKey:FOLIAGE_WIND_STORAGE_KEY,wind:GRASS_WIND,kind:"grass"});
loadFoliageWindSettings({storageKey:TREE_WIND_STORAGE_KEY,wind:TREE_WIND,kind:"tree"});
loadFoliagePresetStore();
const grassWindWorldPosition=new THREE.Vector3();
const treeWindWorldPosition=new THREE.Vector3();
const grassBillboardDirection=new THREE.Vector3(),grassBillboardParentQuaternion=new THREE.Quaternion(),grassBillboardFacingQuaternion=new THREE.Quaternion(),grassBillboardLocalQuaternion=new THREE.Quaternion(),WORLD_UP=new THREE.Vector3(0,1,0);
let grassWindTime=0,treeWindTime=0;
function grassWindVariation(value){
  const wave=Math.sin(value*12.9898+78.233)*43758.5453;
  return wave-Math.floor(wave);
}
function coherentGrassWindNoise(x,z,time){
  const scale=GRASS_WIND.noiseScale;
  const broad=Math.sin((x*.61+z*.37)*scale-time*.23);
  const cross=Math.sin((x*-.29+z*.83)*scale*.63+time*.17+1.7);
  return broad*.65+cross*.35;
}
function coherentTreeWindNoise(x,z,time){
  const scale=TREE_WIND.noiseScale;
  const broad=Math.sin((x*.43+z*.31)*scale-time*.19);
  const cross=Math.sin((x*-.21+z*.69)*scale*.7+time*.13+2.1);
  return broad*.72+cross*.28;
}
function smoothWindPulse(value){
  const normalized=THREE.MathUtils.clamp((value-.58)/.42,0,1);
  return normalized*normalized*(3-2*normalized);
}
function generateGrassClusterVariant({count,radius,seed,spacingScale=1}){
  const random=treeClusterRandom(seed),blades=[],extraGap=GRASS_EDGE_GAP*Math.max(.5,spacingScale);
  for(let index=0;index<count;index++){
    const height=.46+random()*.58,width=.135+random()*.065;
    let placement=null,bestClearance=-Infinity;
    for(let attempt=0;attempt<GRASS_PLACEMENT_CANDIDATES;attempt++){
      const angle=random()*Math.PI*2,distance=radius*(.1+Math.sqrt(random())*.9);
      const candidate={x:Math.cos(angle)*distance+(random()-.5)*.06,z:Math.sin(angle)*distance+(random()-.5)*.06};
      const clearance=blades.length?Math.min(...blades.map(blade=>Math.hypot(blade.x-candidate.x,blade.z-candidate.z)-(blade.width+width)*.5*GRASS_MAX_VISIBLE_WIDTH_SCALE-extraGap)):Infinity;
      if(clearance>bestClearance){bestClearance=clearance;placement=candidate}
    }
    const centerWeight=1-Math.min(1,Math.hypot(placement.x,placement.z)/radius);
    blades.push({
      ...placement,
      height:height+centerWeight*.12,
      width,
      turn:(random()-.5)*.58
    });
  }
  return blades;
}
const GRASS_CLUSTER_VARIANT_DEFINITIONS=GRASS_CLUSTER_CATEGORIES.flatMap(category=>[
  {...category,versionNumber:1},
  {...category,versionNumber:2,radius:category.radius*GRASS_CLUSTER_SECONDARY_SPREAD,spacingScale:(category.spacingScale??1)*GRASS_CLUSTER_SECONDARY_SPREAD,seed:category.seed^0x7f4a7c15}
]);
const GRASS_CLUSTER_VARIANTS=GRASS_CLUSTER_VARIANT_DEFINITIONS.map(({versionNumber,...definition})=>generateGrassClusterVariant(definition));
function grassClusterIdentity(variantIndex){
  const safeVariantIndex=Number.isInteger(variantIndex)&&GRASS_CLUSTER_VARIANTS[variantIndex]?variantIndex:0;
  const definition=GRASS_CLUSTER_VARIANT_DEFINITIONS[safeVariantIndex],category=GRASS_CLUSTER_CATEGORIES.find(item=>item.id===definition.id);
  return {safeVariantIndex,category,versionNumber:definition.versionNumber};
}
function grassBladeGeometry(width,height){
  const shape=new THREE.Shape(),halfWidth=width*.5;
  shape.moveTo(-halfWidth,0);shape.lineTo(halfWidth,0);shape.lineTo(halfWidth,height);shape.lineTo(-halfWidth,height);shape.closePath();
  return new THREE.ShapeGeometry(shape);
}
function meadowGrassBladeGeometry(width,height){
  const shape=new THREE.Shape(),halfWidth=width*.5;
  shape.moveTo(-halfWidth,0);
  shape.quadraticCurveTo(-halfWidth*1.03,height*.28,-halfWidth*.88,height*.58);
  shape.quadraticCurveTo(-halfWidth*.72,height*.88,0,height);
  shape.quadraticCurveTo(halfWidth*.72,height*.88,halfWidth*.88,height*.58);
  shape.quadraticCurveTo(halfWidth*1.03,height*.28,halfWidth,0);
  shape.closePath();
  return new THREE.ShapeGeometry(shape);
}
function makeMeadowGrassBlade({height=.78,width=.2,turn=0}={}){
  const root=new THREE.Group(),billboardPivot=new THREE.Group(),sway=new THREE.Group();
  const geometry=meadowGrassBladeGeometry(width,height);
  const outline=new THREE.Mesh(geometry,new THREE.MeshBasicMaterial({color:FOLIAGE_OUTLINE_COLOR,side:THREE.DoubleSide,transparent:true,opacity:.9,depthWrite:false,polygonOffset:true,polygonOffsetFactor:1,polygonOffsetUnits:1}));
  outline.userData.editorMaterialOutline=true;outline.scale.set(1.055,1.035,1);outline.position.z=-.003;outline.renderOrder=4;
  const fill=new THREE.Mesh(geometry,GRASS_BLADE_MATERIALS[2]);fill.castShadow=true;fill.receiveShadow=true;
  sway.add(outline,fill);billboardPivot.add(sway);root.add(billboardPivot);root.rotation.y=turn;
  root.userData.grassWind={billboardPivot,sway,bend:0,velocity:0,secondaryBend:0,secondaryVelocity:0,strength:1,response:1,angleScale:1,phaseJitter:.12};
  return root;
}
function addMeadowGrassBlade({x,z,y=GROUND_Y,turn=0,rotation=null,scale=null}){
  const blade=makeMeadowGrassBlade({turn});
  blade.position.set(x,y,z);blade.rotation.set(...(rotation??[0,turn,0]));blade.scale.setScalar(.9);if(scale)blade.scale.fromArray(scale);
  blade.userData.grassSizeBaseScale=blade.scale.clone();blade.userData.editorSelectable=true;blade.userData.editorAssetType="grass-cluster";blade.userData.meadowGrassBlade=true;blade.name="Meadow grass blade";
  battle.add(blade);editorObjects.push(blade);applyGrassSize(blade);return registerEditorFoliage(blade);
}
function makeLowPolyGrassBlade({height,width,turn=0,x=0,z=0}){
  const seed=x*19.19+z*47.77+height*31.31+width*73.13+turn*11.17;
  const shadeIndex=Math.floor(grassWindVariation(seed+97.3)*GRASS_BLADE_MATERIALS.length);
  const blade=new THREE.Group(),sway=new THREE.Group();
  const bladeWidth=width*(.94+grassWindVariation(seed+11.7)*.12),bladeHeight=height*(.96+grassWindVariation(seed+29.4)*.08);
  const billboardPivot=new THREE.Group(),geometry=grassBladeGeometry(bladeWidth,bladeHeight),outline=new THREE.Mesh(geometry,new THREE.MeshBasicMaterial({color:FOLIAGE_OUTLINE_COLOR,side:THREE.DoubleSide,transparent:true,opacity:.9,depthWrite:false,polygonOffset:true,polygonOffsetFactor:1,polygonOffsetUnits:1}));
  outline.userData.editorMaterialOutline=true;outline.scale.set(1.1,1.04,1);outline.position.set(0,0,-.003);outline.renderOrder=4;
  const fill=new THREE.Mesh(geometry,GRASS_BLADE_MATERIALS[shadeIndex]);fill.castShadow=true;fill.receiveShadow=true;sway.add(outline,fill);billboardPivot.add(sway);blade.add(billboardPivot);blade.rotation.y=turn;
  blade.userData.grassWind={
    billboardPivot,sway,bend:0,velocity:0,secondaryBend:0,secondaryVelocity:0,
    strength:.85+grassWindVariation(seed)*.3,
    response:.9+grassWindVariation(seed+17.3)*.2,
    angleScale:.92+grassWindVariation(seed+39.1)*.16,
    phaseJitter:(grassWindVariation(seed+61.7)-.5)*.2
  };
  return blade;
}
function updateGrassBillboard(blade){
  const billboardPivot=blade.userData.grassWind?.billboardPivot;
  if(!billboardPivot)return;
  grassBillboardDirection.subVectors(camera.position,grassWindWorldPosition);grassBillboardDirection.y=0;
  if(grassBillboardDirection.lengthSq()<.000001)return;
  grassBillboardFacingQuaternion.setFromAxisAngle(WORLD_UP,Math.atan2(grassBillboardDirection.x,grassBillboardDirection.z));
  blade.getWorldQuaternion(grassBillboardParentQuaternion);
  grassBillboardLocalQuaternion.copy(grassBillboardParentQuaternion).invert().multiply(grassBillboardFacingQuaternion);
  billboardPivot.quaternion.copy(grassBillboardLocalQuaternion);
}
function addGrassCluster({x,z,y=GROUND_Y,variantIndex=0,turn=0,rotation=null,scale=null}){
  const {safeVariantIndex,category,versionNumber}=grassClusterIdentity(variantIndex),variant=GRASS_CLUSTER_VARIANTS[safeVariantIndex];
  const cluster=new THREE.Group();
  let safeProximity=2;
  for(let first=0;first<variant.length;first++)for(let second=first+1;second<variant.length;second++){
    const bladeA=variant[first],bladeB=variant[second],distance=Math.hypot(bladeA.x-bladeB.x,bladeA.z-bladeB.z),requiredGap=(bladeA.width+bladeB.width)*.5*GRASS_MAX_VISIBLE_WIDTH_SCALE+GRASS_EDGE_GAP;
    safeProximity=Math.min(safeProximity,distance/requiredGap);
  }
  cluster.userData.grassSafeProximity=Math.max(.5,safeProximity);
  const proximityScale=1/Math.min(GRASS_WIND.proximity,cluster.userData.grassSafeProximity);
  for(const bladeSpec of variant){
    const blade=makeLowPolyGrassBlade(bladeSpec);blade.userData.grassBasePosition=new THREE.Vector2(bladeSpec.x,bladeSpec.z);blade.position.set(bladeSpec.x*proximityScale,0,bladeSpec.z*proximityScale);cluster.add(blade);
  }
  cluster.position.set(x,y,z);cluster.rotation.set(...(rotation??[0,turn,0]));cluster.scale.setScalar(.86);if(scale)cluster.scale.fromArray(scale);
  cluster.userData.grassSizeBaseScale=cluster.scale.clone();
  cluster.userData.editorSelectable=true;cluster.userData.editorAssetType="grass-cluster";cluster.userData.variantIndex=safeVariantIndex;cluster.name=`${category.label.toLowerCase()} grass cluster ${String(versionNumber).padStart(2,"0")}`;
  battle.add(cluster);editorObjects.push(cluster);applyGrassSize(cluster);return registerEditorFoliage(cluster);
}
function applyGrassProximity(){
  for(const cluster of editorObjects){
    if(cluster.userData.editorAssetType!=="grass-cluster"||!cluster.parent)continue;
    if(cluster.userData.meadowGrassBlade)continue;
    const proximityScale=1/Math.min(GRASS_WIND.proximity,cluster.userData.grassSafeProximity??GRASS_WIND.proximity);
    for(const blade of cluster.children){
      const basePosition=blade.userData.grassBasePosition;if(!basePosition)continue;
      blade.position.x=basePosition.x*proximityScale;blade.position.z=basePosition.y*proximityScale;
    }
  }
}
function syncGrassSizeBaseScale(cluster){
  if(cluster?.userData?.editorAssetType!=="grass-cluster")return;
  cluster.userData.grassSizeBaseScale=cluster.scale.clone().multiplyScalar(1/GRASS_WIND.size);
}
function applyGrassSize(targetCluster=null){
  const clusters=targetCluster?[targetCluster]:editorObjects;
  for(const cluster of clusters){
    if(cluster?.userData?.editorAssetType!=="grass-cluster"||!cluster.parent)continue;
    const baseScale=cluster.userData.grassSizeBaseScale??cluster.scale.clone().multiplyScalar(1/GRASS_WIND.size);
    cluster.userData.grassSizeBaseScale=baseScale;cluster.scale.copy(baseScale).multiplyScalar(GRASS_WIND.size);
  }
}
function updateGrassWindState(foliage,state,frameDelta,windDirection){
  updateGrassBillboard(foliage);
  const x=grassWindWorldPosition.x,z=grassWindWorldPosition.z,worldAlongWind=x*windDirection.x+z*windDirection.y;
  const windPhase=worldAlongWind*GRASS_WIND.spatialFrequency-grassWindTime*GRASS_WIND.windSpeed,noise=coherentGrassWindNoise(x,z,grassWindTime);
  const slowBase=.35+.65*(Math.sin(windPhase*.19+noise*.7)+1)*.5,travellingWave=Math.sin(windPhase+noise*.42+state.phaseJitter)*GRASS_WIND.maxBendAngle*.14;
  const gustCarrier=(Math.sin(windPhase*.43+noise*1.25-1.1)+1)*.5;
  const gustBoost=1+GRASS_WIND.gustStrength*smoothWindPulse(gustCarrier)*.35;
  const windBend=(GRASS_WIND.baseWindStrength*slowBase+travellingWave+noise*GRASS_WIND.maxBendAngle*.06)*gustBoost,bendLimit=GRASS_WIND.maxBendAngle*state.angleScale;
  const targetBend=THREE.MathUtils.clamp(windBend*state.strength,-bendLimit,bendLimit),secondaryWave=Math.sin(windPhase*.71+noise*1.6+2.4),targetSecondary=targetBend*GRASS_WIND.secondaryMovement*secondaryWave,spring=GRASS_WIND.springStrength*state.response;
  state.velocity+=(targetBend-state.bend)*spring*frameDelta;state.secondaryVelocity+=(targetSecondary-state.secondaryBend)*spring*frameDelta;
  const damping=Math.pow(GRASS_WIND.damping,frameDelta*60);state.velocity*=damping;state.secondaryVelocity*=damping;state.bend+=state.velocity*frameDelta;state.secondaryBend+=state.secondaryVelocity*frameDelta;
  const frontBend=THREE.MathUtils.clamp(state.bend+state.secondaryBend,-bendLimit,bendLimit),sway=state.sway;
  sway.rotation.x=-frontBend;sway.rotation.z=0;
}
function updateGrassWind(delta){
  if(delta<=0)return;
  const frameDelta=Math.min(delta,1/30),windDirection=GRASS_WIND.direction;
  for(const cluster of editorObjects){
    if(!cluster.parent||cluster.userData.editorAssetType!=="grass-cluster")continue;
    if(cluster.userData.meadowGrassBlade){
      cluster.updateWorldMatrix(true,false);grassWindWorldPosition.copy(cluster.position).applyMatrix4(cluster.parent.matrixWorld);updateGrassWindState(cluster,cluster.userData.grassWind,frameDelta,windDirection);continue;
    }
    cluster.updateWorldMatrix(true,false);
    for(const blade of cluster.children){
      const state=blade.userData.grassWind;if(!state)continue;grassWindWorldPosition.copy(blade.position).applyMatrix4(cluster.matrixWorld);updateGrassWindState(blade,state,frameDelta,windDirection);
    }
  }
}
function updateTreeWind(delta){
  if(delta<=0)return;
  const frameDelta=Math.min(delta,1/30),windDirection=TREE_WIND.direction;
  for(const cluster of editorObjects){
    if(!["tree-cluster","tree-billboard"].includes(cluster.userData.editorAssetType)||!cluster.parent)continue;
    cluster.updateWorldMatrix(true,false);
    const trees=cluster.userData.treeWind?[cluster]:cluster.children;
    for(const tree of trees){
      const state=tree.userData.treeWind;if(!state)continue;
      if(tree===cluster)tree.getWorldPosition(treeWindWorldPosition);else treeWindWorldPosition.copy(tree.position).applyMatrix4(cluster.matrixWorld);
      updateTreeBillboard(tree);
      const x=treeWindWorldPosition.x,z=treeWindWorldPosition.z,worldAlongWind=x*windDirection.x+z*windDirection.y;
      const windPhase=worldAlongWind*TREE_WIND.spatialFrequency-treeWindTime*TREE_WIND.windSpeed+state.phaseJitter;
      const noise=coherentTreeWindNoise(x,z,treeWindTime);
      const slowBase=.28+.72*(Math.sin(windPhase*.34+noise*.8)+1)*.5;
      const travellingWave=Math.sin(windPhase+noise*.5)*TREE_WIND.maxBendAngle*.18;
      const gustCarrier=(Math.sin(windPhase*.47+noise*1.1-.8)+1)*.5;
      const gustBoost=1+TREE_WIND.gustStrength*smoothWindPulse(gustCarrier)*.3;
      const bendLimit=TREE_WIND.maxBendAngle*state.angleScale;
      const targetBend=THREE.MathUtils.clamp((TREE_WIND.baseWindStrength*slowBase+travellingWave+noise*TREE_WIND.maxBendAngle*.07)*gustBoost*state.strength,-bendLimit,bendLimit);
      const secondary=Math.sin(windPhase*.73+noise*1.4+1.8)*targetBend*TREE_WIND.secondaryMovement;
      const targetX=-(targetBend+secondary)*windDirection.y,targetZ=(targetBend-secondary*.45)*windDirection.x;
      const spring=TREE_WIND.springStrength*state.response,damping=Math.pow(TREE_WIND.damping,frameDelta*60);
      state.velocityX=(state.velocityX+(targetX-state.bendX)*spring*frameDelta)*damping;
      state.velocityZ=(state.velocityZ+(targetZ-state.bendZ)*spring*frameDelta)*damping;
      state.bendX+=state.velocityX*frameDelta;state.bendZ+=state.velocityZ*frameDelta;
      const sway=state.sway??tree;
      sway.rotation.x=THREE.MathUtils.clamp(state.bendX,-bendLimit,bendLimit);
      sway.rotation.z=THREE.MathUtils.clamp(state.bendZ,-bendLimit,bendLimit);
    }
  }
}
const ROCK_PILLAR_VARIANTS=[
  {height:1.72,width:.72,depth:.62,phase:.12},
  {height:2.14,width:.68,depth:.68,phase:1.84},
  {height:1.46,width:.83,depth:.61,phase:3.4}
];
const ROCK_RING_TEMPLATE=[
  {y:0,width:.87,depth:.88,x:-.012,z:.008,turn:-.025},
  {y:.18,width:.95,depth:.94,x:.006,z:-.009,turn:.01},
  {y:.4,width:1,depth:1,x:.018,z:.006,turn:.025},
  {y:.62,width:1.015,depth:1,x:-.006,z:.016,turn:-.01},
  {y:.82,width:.975,depth:.965,x:.014,z:-.006,turn:.018},
  {y:1,width:.945,depth:.93,x:.03,z:.012,turn:-.025}
];
const rockPillarMaterials=[mat(0x56635d,.94),mat(0x69736b,.92),mat(0x7f8579,.9),mat(0x979688,.88)];
const rockContactMaterial=new THREE.MeshBasicMaterial({color:0x26322d,transparent:true,opacity:.2,depthWrite:false});
function bevelledRectangleRing(halfWidth,halfDepth,bevel,turn,x,z){
  const corners=[[-halfWidth+bevel,-halfDepth],[halfWidth-bevel,-halfDepth],[halfWidth,-halfDepth+bevel],[halfWidth,halfDepth-bevel],[halfWidth-bevel,halfDepth],[-halfWidth+bevel,halfDepth],[-halfWidth,halfDepth-bevel],[-halfWidth,-halfDepth+bevel]];
  const cosine=Math.cos(turn),sine=Math.sin(turn);return corners.map(([localX,localZ])=>[x+localX*cosine-localZ*sine,z+localX*sine+localZ*cosine]);
}
function sedimentaryRockGeometry({height,width,depth,phase=0}){
  const positions=[],indices=[],rings=[];
  ROCK_RING_TEMPLATE.forEach((template,index)=>{
    const swayX=Math.sin(phase+index*1.9)*.012,swayZ=Math.cos(phase+index*1.47)*.011;
    const halfWidth=width*template.width*.5,halfDepth=depth*template.depth*.5,bevel=Math.min(halfWidth,halfDepth)*.18;
    const ring=bevelledRectangleRing(halfWidth,halfDepth,bevel,template.turn+Math.sin(phase+index)*.014,template.x+swayX,template.z+swayZ);
    rings.push(ring);for(const [x,z] of ring)positions.push(x,template.y*height,z);
  });
  for(let layer=0;layer<rings.length-1;layer++){
    const start=indices.length,lower=layer*8,upper=(layer+1)*8;
    for(let side=0;side<8;side++){const next=(side+1)%8;indices.push(lower+side,lower+next,upper+next,lower+side,upper+next,upper+side);}
    indices.layerStarts??=[];indices.layerStarts.push([start,indices.length-start]);
  }
  const bottomCenter=positions.length/3;positions.push(0,0,0),topCenter=positions.length/3;positions.push(ROCK_RING_TEMPLATE.at(-1).x,height,ROCK_RING_TEMPLATE.at(-1).z);
  const bottomStart=indices.length;for(let side=0;side<8;side++)indices.push(bottomCenter,(side+1)%8,side);
  const topStart=indices.length,topRing=(rings.length-1)*8;for(let side=0;side<8;side++)indices.push(topCenter,topRing+side,topRing+(side+1)%8);
  const geometry=new THREE.BufferGeometry();geometry.setAttribute("position",new THREE.Float32BufferAttribute(positions,3));geometry.setIndex(indices);
  for(const [layer,start,count] of indices.layerStarts.map(([start,count],layer)=>[layer,start,count]))geometry.addGroup(start,count,Math.min(rockPillarMaterials.length-1,Math.floor(layer*rockPillarMaterials.length/(rings.length-1))));
  geometry.addGroup(bottomStart,indices.length-bottomStart-(indices.length-topStart),0);geometry.addGroup(topStart,indices.length-topStart,rockPillarMaterials.length-1);geometry.computeVertexNormals();return geometry;
}
function makeSedimentaryRock(variantIndex=0){
  const variant=ROCK_PILLAR_VARIANTS[variantIndex]??ROCK_PILLAR_VARIANTS[0],rock=new THREE.Group(),contact=new THREE.Mesh(new THREE.CircleGeometry(variant.width*.78,16),rockContactMaterial),mesh=new THREE.Mesh(sedimentaryRockGeometry(variant),rockPillarMaterials);
  contact.rotation.x=-Math.PI*.5;contact.scale.y=.63;contact.position.y=.004;contact.renderOrder=1;
  mesh.castShadow=true;mesh.receiveShadow=true;rock.add(contact,mesh);return rock;
}
function addSedimentaryRock({x,z,y=GROUND_Y,variantIndex=0,turn=0,rotation=null,scale=null}){
  const rock=makeSedimentaryRock(variantIndex);rock.position.set(x,y,z);rock.rotation.set(...(rotation??[0,turn,0]));if(scale)rock.scale.fromArray(scale);
  rock.userData.editorSelectable=true;rock.userData.editorAssetType="rock-pillar";rock.userData.variantIndex=variantIndex;rock.name=`Rock pillar ${String(variantIndex+1).padStart(2,"0")}`;
  battle.add(rock);editorObjects.push(rock);return rock;
}
function towerPart(width,height,depth,material,x,y,z){
  const part=new THREE.Mesh(new THREE.BoxGeometry(width,height,depth),material);part.position.set(x,y,z);part.castShadow=true;part.receiveShadow=true;return part;
}
function makeArcherTower(){
  const tower=new THREE.Group(),body=towerPart(1.42,2.7,1.42,mats.towerWood,0,1.35,0);
  tower.add(body);
  for(const x of [-.76,.76])for(const z of [-.76,.76])tower.add(towerPart(.16,4.05,.16,mats.towerWoodDark,x,2.025,z));
  tower.add(towerPart(1.92,.16,1.92,mats.towerWoodDark,0,3.05,0));
  for(const x of [-.76,.76])for(const z of [-.76,.76])tower.add(towerPart(.12,1.15,.12,mats.towerWoodDark,x,3.65,z));
  tower.add(towerPart(1.72,.12,.12,mats.towerWoodDark,0,4.13,-.76),towerPart(1.72,.12,.12,mats.towerWoodDark,0,4.13,.76));
  tower.add(towerPart(.12,.12,1.72,mats.towerWoodDark,-.76,4.13,0),towerPart(.12,.12,1.72,mats.towerWoodDark,.76,4.13,0));
  for(const [rotation,x,z] of [[-.7,0,.77],[.7,0,.77]]){
    const brace=towerPart(.13,2.25,.12,mats.towerWoodDark,x,1.72,z);brace.rotation.z=rotation;tower.add(brace);
  }
  for(const [rotation,x,z] of [[-.7,.77,0],[.7,.77,0]]){
    const brace=towerPart(.12,2.25,.13,mats.towerWoodDark,x,1.72,z);brace.rotation.x=rotation;tower.add(brace);
  }
  const roof=new THREE.Mesh(new THREE.ConeGeometry(1.28,.72,4),mats.towerRoof);roof.position.y=4.5;roof.rotation.y=Math.PI*.25;roof.castShadow=true;roof.receiveShadow=true;tower.add(roof);
  return tower;
}
function addArcherTower({x,z,y=GROUND_Y,turn=0,rotation=null,scale=null}){
  const tower=makeArcherTower();tower.position.set(x,y,z);tower.rotation.set(...(rotation??[0,turn,0]));tower.scale.setScalar(.84);if(scale)tower.scale.fromArray(scale);
  tower.userData.editorSelectable=true;tower.userData.editorAssetType="archer-tower";tower.name="Archer tower";
  battle.add(tower);editorObjects.push(tower);invalidateNavigation();return tower;
}
function buildingBlueprintSettings(assetId,kind){return normalizeBuildingBlueprintSettings(contentBrowserState.blueprintSettings[assetId],kind)}
function makeRaidBuilding(kind,settings={}){
  const {model,materialColor}=normalizeBuildingBlueprintSettings(settings),building=new THREE.Group(),modelVisual=model==="box"?null:cloneContentBrowserModelVisual(model);
  const visual=modelVisual??applyContentBrowserModelScale(new THREE.Mesh(new THREE.BoxGeometry(3,3,3),mat(materialColor)),model);
  if(model==="primitive-cube")visual.scale.multiplyScalar(3);
  if(!modelVisual)visual.position.y=1.5;
  tintContentBrowserModelVisual(visual,materialColor);
  const collisionHalf=groundContentBrowserModelVisual(visual),collisionFootprints=modelCollisionFootprints(visual,collisionHalf);
  hideCrownwakeCollisionMeshes(visual);
  building.userData.modelCollisionHalf={x:collisionHalf.x,z:collisionHalf.z};building.userData.modelCollisionFootprints=collisionFootprints;building.userData.modelHeight=collisionHalf.y;
  building.add(visual);
  return building;
}
function rebuildRaidBuildingVisual(building,settings){
  const visual=makeRaidBuilding(building.userData.editorAssetType,settings),healthWidget=building.userData.healthWidget;for(const child of [...building.children])if(child!==healthWidget)building.remove(child);building.add(...visual.children);building.userData.collisionHalf={...visual.userData.modelCollisionHalf};building.userData.modelCollisionFootprints=visual.userData.modelCollisionFootprints;building.userData.modelHeight=visual.userData.modelHeight;building.userData.healthBarOffset=normalizeHealthBarOffset(settings?.healthBarOffset,RAID_BUILDING_HEALTH_BAR_OFFSET);if(healthWidget)healthWidget.position.y=building.userData.modelHeight+building.userData.healthBarOffset;invalidateNavigation();
}
function makeRaidBuildingHealthWidget(building){
  const style=configuredProgressBar(building.userData.progressBarAssetId,BUILDING_PROGRESS_BAR_BP_ASSET_ID),group=new THREE.Group(),width=style.width,height=style.height,layer=(color,layerWidth,layerHeight,z,order,map=null,opacity=.93)=>{const mesh=new THREE.Mesh(soldierBarGeometry,new THREE.MeshBasicMaterial({color,map,transparent:opacity<1,opacity,depthTest:false,depthWrite:false}));mesh.userData.healthWidgetLayer=true;mesh.scale.set(layerWidth,layerHeight,1);mesh.position.z=z;mesh.renderOrder=order;mesh.frustumCulled=false;group.add(mesh);return mesh;};
  building.userData.progressBarAssetId=style.assetId;const outline=layer(style.backgroundColor,width+.14,height+.1,0,133,null,1),track=layer(style.backgroundColor,width,height,.005,134,null,1),lag=layer(style.backgroundColor,width,height*.78,.01,135),main=layer(style.mainColor,width,height*.78,.02,136);lag.visible=false;group.position.y=(building.userData.modelHeight??3)+building.userData.healthBarOffset;group.visible=true;group.userData={current:building.userData.hp,lagHealth:building.userData.hp,hold:0,visibleTimer:Infinity,main,lag,width,height,alwaysVisible:true,backgroundLayers:[outline,track,lag],outline,track,outlinePaddingX:.14,outlinePaddingY:.1,widthMultiplier:1,maxHealth:building.userData.maxHp,mainColor:style.mainColor};applyProgressBarLayout(group,style);building.add(group);building.userData.healthWidget=group;
}
function showRaidBuildingHealth(building,previousHealth=building.userData.hp){const data=building.userData.healthWidget?.userData;if(!data)return;data.current=Math.max(0,building.userData.hp);data.lagHealth=Math.max(data.lagHealth,previousHealth);data.hold=.24;data.visibleTimer=5;const max=Math.max(1,building.userData.maxHp);data.maxHealth=max;data.lag.visible=false;setWidgetFill(data.main,data.current/max,data.width,data.height);data.main.material.color.set(data.mainColor);building.userData.healthWidget.visible=true;}
function updateRaidBuildingHealthWidgets(dt){
  for(const building of editorObjects){
    if(!building.userData.raidBuilding)continue;
    const widget=building.userData.healthWidget,data=widget?.userData;if(!data)continue;
    if(!building.userData.alive){widget.visible=false;continue}
    data.current=Math.max(0,building.userData.hp);const state=advanceLaggingHealthBar({current:data.current,lag:data.lagHealth,hold:data.hold,visibleTimer:data.visibleTimer,regenerating:false,dt});data.lagHealth=state.lag;data.hold=state.hold;data.visibleTimer=data.alwaysVisible?Infinity:state.visibleTimer;widget.visible=data.alwaysVisible||state.visible;const max=Math.max(1,building.userData.maxHp);data.maxHealth=max;data.lag.visible=false;setWidgetFill(data.main,data.current/max,data.width,data.height);data.main.material.color.set(data.mainColor);data.main.material.opacity=.95;widget.quaternion.copy(building.quaternion).invert().multiply(camera.quaternion);
  }
}
function addRaidBuilding({kind,x,z,y=GROUND_Y,turn=0,rotation=null,scale=null,blueprintAssetId=null,blueprintModel=null,materialColor=null,maxHp=null,barracksSpawnInterval=null,progressBarAssetId=null,healthBarOffset=null}){
  if(!["town-hall","barracks"].includes(kind))return null;
  const assetId=blueprintAssetId??(kind==="town-hall"?TOWN_HALL_BP_ASSET_ID:BARRACKS_BP_ASSET_ID),defaults=buildingBlueprintSettings(assetId,kind),settings=normalizeBuildingBlueprintSettings({...defaults,model:blueprintModel??defaults.model,materialColor:materialColor??defaults.materialColor,maxHp:maxHp??defaults.maxHp,barracksSpawnInterval:barracksSpawnInterval??defaults.barracksSpawnInterval,progressBarAssetId:progressBarAssetId??defaults.progressBarAssetId,healthBarOffset:healthBarOffset??defaults.healthBarOffset},kind),building=makeRaidBuilding(kind,settings);building.position.set(x,y,z);building.rotation.set(...(rotation??[0,turn,0]));if(scale)building.scale.fromArray(scale);
  building.userData.editorSelectable=true;building.userData.editorAssetType=kind;building.userData.raidBuilding=true;building.userData.alive=true;building.userData.collisionHalf={...building.userData.modelCollisionHalf};building.userData.collisionFootprints=building.userData.modelCollisionFootprints;building.userData.blueprintAssetId=assetId;building.userData.blueprintModel=settings.model;building.userData.editorMaterialColor=settings.materialColor;building.userData.progressBarAssetId=settings.progressBarAssetId;building.userData.healthBarOffset=settings.healthBarOffset;building.userData.maxHp=settings.maxHp;building.userData.hp=settings.maxHp;building.userData.barracksSpawnInterval=settings.barracksSpawnInterval;building.userData.barracksSpawnTimer=settings.barracksSpawnInterval;building.name=kind==="town-hall"?"Town Hall":"Barracks";makeRaidBuildingHealthWidget(building);
  battle.add(building);editorObjects.push(building);invalidateNavigation();return building;
}
function addForestFence({x,z,y=GROUND_Y,variantIndex=0,turn=0,rotation=null,scale=null}){
  const template=forestFenceTemplates[variantIndex];if(!template)return null;
  const fence=template.clone(true);fence.position.set(x,y,z);fence.rotation.set(...(rotation??[0,turn,0]));if(scale)fence.scale.fromArray(scale);
  fence.userData.editorSelectable=true;fence.userData.editorAssetType="forest-fence";fence.userData.variantIndex=variantIndex;fence.name=`Forest fence ${String(variantIndex+1).padStart(2,"0")}`;
  battle.add(fence);editorObjects.push(fence);invalidateNavigation();return fence;
}
function addImportedModel({assetId,x,z,y=GROUND_Y,turn=0,rotation=null,scale=null,materialSlot=null,materialColor=null}){
  const model=cloneContentBrowserModelVisual(assetId);if(!model)return null;
  hideCrownwakeCollisionMeshes(model);
  const importedAsset=contentBrowserState.importedModels.find(asset=>asset.id===assetId),defaultSlot=model.userData.importedModelMaterials?.length?"__embedded__":"",resolvedSlot=materialSlot===null||materialSlot===undefined?defaultSlot:materialSlot;
  model.position.set(x,y,z);model.rotation.set(...(rotation??[0,turn,0]));if(scale)model.scale.fromArray(scale);
  model.userData.editorSelectable=true;model.userData.editorAssetType="imported-model";model.userData.importedModelAssetId=assetId;model.userData.importedMaterialSlot="";model.userData.editorMaterialColor=/^#[0-9a-f]{6}$/i.test(materialColor??"")?materialColor.toLowerCase():"#ffffff";model.name=contentBrowserState.assetNames[assetId]||importedAsset?.name||"Imported GLB";
  applyImportedModelMaterialSlot(model,resolvedSlot,{recordUndo:false,refreshUi:false});
  battle.add(model);editorObjects.push(model);invalidateNavigation();return model;
}
const MIN_TREE_CLUSTERS=15,MAX_TREE_CLUSTERS=20,TREE_CLUSTER_MIN_DISTANCE=12;
const TREE_CLUSTER_VARIANTS=[
  [
      {x:-.18,z:.28,height:2.16,width:.4,material:mats.treeLeafDark},
      {x:.66,z:.34,height:1.62,width:.34,material:mats.treeLeaf},
      {x:-.86,z:-.28,height:.92,width:.27,material:mats.treeLeaf},
      {x:.62,z:-.58,height:1.08,width:.29,material:mats.treeLeafDark}
  ],[
      {x:-.5,z:.38,height:1.86,width:.37,material:mats.treeLeafDark},
      {x:.45,z:.2,height:2.08,width:.4,material:mats.treeLeaf},
      {x:-.9,z:-.42,height:1.05,width:.28,material:mats.treeLeaf},
      {x:.86,z:-.52,height:.88,width:.26,material:mats.treeLeafDark}
  ],[
      {x:-.28,z:.36,height:2.02,width:.39,material:mats.treeLeaf},
      {x:.72,z:.48,height:1.36,width:.32,material:mats.treeLeafDark},
      {x:-.84,z:-.36,height:.82,width:.25,material:mats.treeLeafDark},
      {x:.36,z:-.64,height:1.2,width:.3,material:mats.treeLeaf}
  ],[
      {x:-.36,z:.3,height:1.96,width:.38,material:mats.treeLeafDark},
      {x:.68,z:.18,height:1.24,width:.31,material:mats.treeLeaf},
      {x:-.68,z:-.46,height:.94,width:.26,material:mats.treeLeaf}
  ],[
      {x:-.72,z:.28,height:1.46,width:.33,material:mats.treeLeaf},
      {x:.08,z:.42,height:2.24,width:.41,material:mats.treeLeafDark},
      {x:.82,z:.2,height:1.56,width:.34,material:mats.treeLeaf},
      {x:-.36,z:-.58,height:.88,width:.25,material:mats.treeLeafDark},
      {x:.72,z:-.52,height:1.06,width:.28,material:mats.treeLeaf}
  ],[
      {x:-.54,z:.22,height:2.04,width:.39,material:mats.treeLeaf},
      {x:.58,z:.42,height:1.14,width:.3,material:mats.treeLeafDark},
      {x:-.82,z:-.48,height:.9,width:.25,material:mats.treeLeafDark}
  ]
];
function treeClusterRandom(seed){
  let state=seed>>>0;
  return ()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state/4294967296};
}
function addSampleTreeClusters(){
  const random=treeClusterRandom((Math.random()*0xffffffff)>>>0),origin={x:0,z:4},centers=[];
  const count=MIN_TREE_CLUSTERS+Math.floor(random()*(MAX_TREE_CLUSTERS-MIN_TREE_CLUSTERS+1));
  for(let attempts=0;centers.length<count&&attempts<count*80;attempts++){
    const angle=random()*Math.PI*2,minRadius=15,maxRadius=67;
    const radius=Math.sqrt(minRadius*minRadius+random()*(maxRadius*maxRadius-minRadius*minRadius));
    const x=origin.x+Math.cos(angle)*radius,z=origin.z+Math.sin(angle)*radius;
    if(centers.some(center=>Math.hypot(center.x-x,center.z-z)<TREE_CLUSTER_MIN_DISTANCE))continue;
    centers.push({x,z});
    const variantIndex=Math.floor(random()*TREE_CLUSTER_VARIANTS.length);
    addTreeCluster({x,z,trees:TREE_CLUSTER_VARIANTS[variantIndex],variantIndex});
  }
  return centers;
}
function isCrownwakeBaseModelAsset(assetId){
  if(assetId===CROWNWAKE_BASE_MODEL_ASSET_ID)return true;
  const imported=contentBrowserState.importedModels.find(model=>model.id===assetId),candidates=[String(assetId??"").replace(/^imported-model:/i,""),imported?.name,(imported?.sourcePath??"").split("/").at(-1)];
  return candidates.some(candidate=>String(candidate??"").replace(/\.glb$/i,"").replace(/[^a-z0-9]/gi,"").toLowerCase()==="crownwakebase");
}
function migratedCrownwakeBaseRecord(record){
  const {importedModelAssetId,materialSlot,materialColor,...baseRecord}=record;
  return {...baseRecord,type:"tile-spawner",tileBlueprintAssetId:BASE_BP_ASSET_ID,tileModelAssetId:CROWNWAKE_BASE_MODEL_ASSET_ID,tileRows:normalizeTileDimension(record.tileRows,BASE_BP_DEFAULT_ROWS),tileColumns:normalizeTileDimension(record.tileColumns,BASE_BP_DEFAULT_COLUMNS),tileSize:normalizeTileSize(record.tileSize,BASE_BP_DEFAULT_SIZE)};
}
function levelAssetRecord(object){
  const type=object?.userData?.editorAssetType;
  if(!["world-floor","tile-spawner","town-hall","barracks","primitive-cube","tree-cluster","tree-billboard","grass-cluster","rock-pillar","archer-tower","forest-fence","imported-model","ch-character","enemy-character","hud-widget","hud-text"].includes(type))return null;
  const scale=type==="grass-cluster"?(object.userData.grassSizeBaseScale??object.scale):object.scale;
  const record={type,x:Number(object.position.x.toFixed(3)),y:Number(object.position.y.toFixed(3)),z:Number(object.position.z.toFixed(3)),turn:Number(object.rotation.y.toFixed(4)),rotation:[object.rotation.x,object.rotation.y,object.rotation.z].map(value=>Number(value.toFixed(4))),scale:scale.toArray().map(value=>Number(value.toFixed(4)))};
  if(type==="primitive-cube")record.navigationBlocks=object.userData.navigationBlocks===true;
  if(type==="world-floor"||type==="tile-spawner"){const defaults=tileBlueprintDefaults(object);record.tileRows=normalizeTileDimension(object.userData.tileRows,defaults.rows);record.tileColumns=normalizeTileDimension(object.userData.tileColumns,defaults.columns);record.tileSize=normalizeTileSize(object.userData.tileSize,defaults.tileSize);if(type==="tile-spawner"){record.tileBlueprintAssetId=tileBlueprintAssetId(object);record.tileModelAssetId=object.userData.tileModelAssetId??null}if(/^#[0-9a-f]{6}$/i.test(object.userData.tileColour??""))record.tileColour=object.userData.tileColour;}
  if(type==="town-hall"||type==="barracks"){record.blueprintAssetId=object.userData.blueprintAssetId;record.blueprintModel=object.userData.blueprintModel;record.maxHp=normalizeRaidBuildingHealth(object.userData.maxHp);record.progressBarAssetId=object.userData.progressBarAssetId;record.healthBarOffset=object.userData.healthBarOffset;if(type==="barracks")record.barracksSpawnInterval=object.userData.barracksSpawnInterval;}
  if(type==="imported-model"){record.importedModelAssetId=object.userData.importedModelAssetId;record.materialSlot=object.userData.importedMaterialSlot??"";}
  if(type==="tile-spawner"&&isBaseTileBlueprint(object))record.materialSlot=object.userData.importedMaterialSlot??"__embedded__";
  if(["tree-cluster","tree-billboard","grass-cluster","rock-pillar","forest-fence"].includes(type))record.variantIndex=object.userData.variantIndex;
  if(type==="grass-cluster"&&object.userData.meadowGrassBlade)record.meadowGrassBlade=true;
  if(type==="grass-cluster"&&object.userData.grassSprite)record.spriteIndex=object.userData.spriteIndex;
  if(type==="ch-character"||type==="enemy-character")record.actor={
    archetypeId:object.userData.actorArchetypeId,
    maxHp:Number(object.userData.maxHp.toFixed(2)),
    attack:Number(object.userData.attack.toFixed(2)),
    moveSpeed:Number(object.userData.moveSpeed.toFixed(2)),
    acceleration:Number(actorAcceleration(object).toFixed(2)),
    patrolSpeed:Number(actorPatrolSpeed(object).toFixed(2)),
    modelAssetId:object.userData.modelAssetId,
    progressBarAssetId:object.userData.progressBarAssetId,
    healthBarOffset:object.userData.healthBarOffset
  };
  if(type==="hud-widget"){
    const settings=normalizeHudWidgetSettings({size:object.userData.hudSize,spawnCount:object.userData.hudSpawnCount,visible:object.userData.hudVisible,layoutX:object.userData.hudLayoutX,layoutY:object.userData.hudLayoutY},object.userData.hudArchetypeId);
    record.hudArchetypeId=settings.archetypeId;record.hudSize=settings.size;record.hudSpawnCount=settings.spawnCount;record.hudVisible=settings.visible;record.hudLayoutX=settings.layoutX;record.hudLayoutY=settings.layoutY;
  }
  if(type==="hud-text"){
    const settings=normalizeHudTextSettings({text:object.userData.hudText,size:object.userData.hudSize,visible:object.userData.hudVisible,layoutX:object.userData.hudLayoutX,layoutY:object.userData.hudLayoutY});
    record.hudText=settings.text;record.hudSize=settings.size;record.hudVisible=settings.visible;record.hudLayoutX=settings.layoutX;record.hudLayoutY=settings.layoutY;
  }
  if(/^#[0-9a-f]{6}$/i.test(object.userData.editorMaterialColor??""))record.materialColor=object.userData.editorMaterialColor;
  return record;
}
function applySavedEditorMaterial(asset,record){
  if(asset?.userData?.editorAssetType==="primitive-cube"){asset.userData.navigationBlocks=record?.navigationBlocks===true;invalidateNavigation();}
  if(asset?.userData?.editorAssetType==="tile-spawner"&&isBaseTileBlueprint(asset)){
    const colour=/^#[0-9a-f]{6}$/i.test(record?.materialColor??"")?record.materialColor:"#ffffff";
    asset.userData.editorMaterialColor=colour;
    applyBaseMaterial(asset,record.materialSlot??(record.materialColor?"":"__embedded__"),colour);return asset;
  }
  if(asset?.userData?.editorAssetType==="imported-model"){
    if(typeof record?.materialSlot==="string")applyImportedModelMaterialSlot(asset,record.materialSlot,{recordUndo:false,refreshUi:false});
    if(!asset.userData.importedMaterialSlot&&/^#[0-9a-f]{6}$/i.test(record?.materialColor??""))applyEditorMaterialColour(record.materialColor,[asset],{recordUndo:false,refreshUi:false});
    return asset;
  }
  if(asset&&/^#[0-9a-f]{6}$/i.test(record?.materialColor??""))applyEditorMaterialColour(record.materialColor,[asset],{recordUndo:false,refreshUi:false});
  return asset;
}
function addLevelAsset(record){
  if(!record||!Number.isFinite(record.x)||!Number.isFinite(record.z))return null;
  const y=Number.isFinite(record.y)?record.y:GROUND_Y,turn=Number.isFinite(record.turn)?record.turn:0,rotation=Array.isArray(record.rotation)&&record.rotation.length===3&&record.rotation.every(Number.isFinite)?record.rotation:null,scale=Array.isArray(record.scale)&&record.scale.length===3&&record.scale.every(value=>Number.isFinite(value)&&value>0)?record.scale:null;
  if(record.type==="world-floor")return applySavedEditorMaterial(addWorldFloor(record),record);
  if(record.type==="tile-spawner")return applySavedEditorMaterial(addTileSpawner(record),record);
  if(record.type==="town-hall"||record.type==="barracks")return applySavedEditorMaterial(addRaidBuilding({kind:record.type,x:record.x,y,z:record.z,turn,rotation,scale,blueprintAssetId:record.blueprintAssetId,blueprintModel:record.blueprintModel,materialColor:record.materialColor,maxHp:record.maxHp,barracksSpawnInterval:record.barracksSpawnInterval,progressBarAssetId:record.progressBarAssetId,healthBarOffset:record.healthBarOffset}),record);
  if(record.type==="primitive-cube")return applySavedEditorMaterial(addPrimitiveCube({x:record.x,y,z:record.z,turn,rotation,scale}),record);
  if(record.type==="ch-character")return applySavedEditorMaterial(addEditorCharacter({faction:"player",x:record.x,y,z:record.z,turn,rotation,scale,actor:record.actor}),record);
  if(record.type==="enemy-character")return applySavedEditorMaterial(addEditorCharacter({faction:"enemy",x:record.x,y,z:record.z,turn,rotation,scale,actor:record.actor}),record);
  if(record.type==="hud-widget")return addEditorHudWidget({archetypeId:record.hudArchetypeId,x:record.x,y,z:record.z,turn,rotation,scale,hudSize:record.hudSize,hudSpawnCount:record.hudSpawnCount,hudVisible:record.hudVisible,hudLayoutX:record.hudLayoutX,hudLayoutY:record.hudLayoutY});
  if(record.type==="hud-text")return addEditorHudText({x:record.x,y,z:record.z,turn,rotation,scale,hudText:record.hudText,hudSize:record.hudSize,hudVisible:record.hudVisible,hudLayoutX:record.hudLayoutX,hudLayoutY:record.hudLayoutY});
  if(record.type==="tree-billboard")return applySavedEditorMaterial(addTallConiferBillboard({x:record.x,y,z:record.z,variantIndex:record.variantIndex,turn,rotation,scale}),record);
  if(record.type==="tree-cluster"&&record.variantIndex===LEGACY_TALL_CONIFER_TREE_CLUSTER_INDEX)return applySavedEditorMaterial(addTallConiferBillboard({x:record.x,y,z:record.z,turn,rotation,scale}),record);
  if(record.type==="tree-cluster"&&Number.isInteger(record.variantIndex)&&TREE_CLUSTER_VARIANTS[record.variantIndex])return applySavedEditorMaterial(addTreeCluster({x:record.x,y,z:record.z,trees:TREE_CLUSTER_VARIANTS[record.variantIndex],variantIndex:record.variantIndex,turn,rotation,scale}),record);
  if(record.type==="grass-cluster"){
    if(record.meadowGrassBlade)return applySavedEditorMaterial(addMeadowGrassBlade({x:record.x,y,z:record.z,turn,rotation,scale}),record);
    if(Number.isInteger(record.spriteIndex)&&SPRITE_GRASS_ASSETS[record.spriteIndex])return applySavedEditorMaterial(addGrassSpriteBillboard({x:record.x,y,z:record.z,spriteIndex:record.spriteIndex,turn,rotation,scale}),record);
    const variantIndex=Number.isInteger(record.variantIndex)&&GRASS_CLUSTER_VARIANTS[record.variantIndex]?record.variantIndex:0;
    return applySavedEditorMaterial(addGrassCluster({x:record.x,y,z:record.z,variantIndex,turn,rotation,scale}),record);
  }
  if(record.type==="rock-pillar"){
    const variantIndex=Number.isInteger(record.variantIndex)&&ROCK_PILLAR_VARIANTS[record.variantIndex]?record.variantIndex:0;
    return applySavedEditorMaterial(addSedimentaryRock({x:record.x,y,z:record.z,variantIndex,turn,rotation,scale}),record);
  }
  if(record.type==="archer-tower")return applySavedEditorMaterial(addArcherTower({x:record.x,y,z:record.z,turn,rotation,scale}),record);
  if(record.type==="forest-fence"){
    const variantIndex=Number.isInteger(record.variantIndex)&&forestFenceTemplates[record.variantIndex]?record.variantIndex:0;
    return applySavedEditorMaterial(addForestFence({x:record.x,y,z:record.z,variantIndex,turn,rotation,scale}),record);
  }
  if(record.type==="imported-model"&&isCrownwakeBaseModelAsset(record.importedModelAssetId))return addTileSpawner(migratedCrownwakeBaseRecord(record));
  if(record.type==="imported-model")return applySavedEditorMaterial(addImportedModel({assetId:record.importedModelAssetId,x:record.x,y,z:record.z,turn,rotation,scale,materialSlot:record.materialSlot,materialColor:record.materialColor}),record);
  return null;
}
function rememberLevelState(layout){
  savedLevelState={
    version:LEVEL_LAYOUT_VERSION,
    assets:(layout.assets??[]).map(record=>({...record,rotation:record.rotation?.slice(),scale:record.scale?.slice(),actor:record.actor?{...record.actor}:undefined})),
    camera:layout.camera?{...layout.camera,...(layout.camera.rotation?{rotation:layout.camera.rotation.slice()}:{})}:null,
    hudLayoutSeeded:layout.hudLayoutSeeded===true,
    hudTextSeeded:layout.hudTextSeeded===true
  };
}
function restoreLevelLayout(){
  try{
    const layout=JSON.parse(localStorage.getItem(LEVEL_LAYOUT_KEY)||"null");
    if(!layout||![LEGACY_LEVEL_LAYOUT_VERSION,2,3,LEVEL_LAYOUT_VERSION].includes(layout.version)||!Array.isArray(layout.assets))return false;
    savedLevelCamera=levelCameraFrame(layout.camera,{minScale:EDITOR_ZOOM_MIN,maxScale:EDITOR_ZOOM_MAX});
    if(savedLevelCamera){
      gameplayCameraFocus.set(savedLevelCamera.x,0,savedLevelCamera.z);
      gameplayCameraScale=savedLevelCamera.scale;
      gameplayCameraBaselineScale=savedLevelCamera.scale;
    }
    const assets=[];let migratedBaseModel=false;
    for(const record of layout.assets){
      if(record.type==="bush"+"-sprite")continue;
      if(record.type==="grass-cluster"&&layout.version===LEGACY_LEVEL_LAYOUT_VERSION)continue;
      const normalized=record.type==="imported-model"&&isCrownwakeBaseModelAsset(record.importedModelAssetId)?migratedCrownwakeBaseRecord(record):record;
      if(normalized!==record)migratedBaseModel=true;
      assets.push(normalized);addLevelAsset(normalized);
    }
    rememberLevelState({assets,camera:savedLevelCamera,hudLayoutSeeded:layout.version>=3,hudTextSeeded:layout.version>=LEVEL_LAYOUT_VERSION});
    if(layout.version===LEGACY_LEVEL_LAYOUT_VERSION||migratedBaseModel)saveLevelLayout();
    return true;
  }catch(error){console.warn("Saved level layout could not be restored",error);return false}
}
function saveLevelLayout(){
  const assets=editorObjects.map(levelAssetRecord).filter(Boolean);
  if(mode==="editor")savedLevelCamera=currentEditorCameraFrame();
  const layout={version:LEVEL_LAYOUT_VERSION,assets,camera:savedLevelCamera,hudLayoutSeeded:true,hudTextSeeded:true};rememberLevelState(layout);
  try{localStorage.setItem(LEVEL_LAYOUT_KEY,JSON.stringify(layout));localStorage.setItem(EDITOR_ASSET_LIBRARY_KEY,JSON.stringify([...hiddenEditorAssets]));persistContentBrowserState();}
  catch(error){console.warn("Level layout could not be saved",error);}
}
function persistSavedLevelLayout(){
  if(!savedLevelState)return false;
  try{localStorage.setItem(LEVEL_LAYOUT_KEY,JSON.stringify(savedLevelState));return true;}
  catch(error){console.warn("Saved level layout could not be persisted",error);return false;}
}
addEventListener("pagehide",()=>mode==="editor"?saveLevelLayout():persistSavedLevelLayout());
function currentEditorCameraFrame(){return levelCameraFrame({x:editorCameraFocus.x,z:editorCameraFocus.z,scale:editorCameraScale,rotation:[editorCameraRotation.x,editorCameraRotation.y,editorCameraRotation.z]},{minScale:EDITOR_ZOOM_MIN,maxScale:EDITOR_ZOOM_MAX});}
function editorSnapshot(){return {assets:editorObjects.map(levelAssetRecord).filter(Boolean),hiddenAssets:[...hiddenEditorAssets],contentBrowser:copyContentBrowserState(),camera:currentEditorCameraFrame()};}
function updateEditorUndoControl(){$("editor-undo").disabled=editorUndoHistory.length===0;}
function recordEditorUndo(){editorUndoHistory.push(editorSnapshot());if(editorUndoHistory.length>32)editorUndoHistory.shift();updateEditorUndoControl();}
function restoreEditorSnapshot(snapshot){
  if(!snapshot)return;
  selectEditorObject(null);
  removeEditorCameraObject();
  for(const object of [...editorObjects]){detachEditorActorFromCombat(object);battle.remove(object)}
  editorObjects.length=0;editorFoliageObjects.clear();worldFloor=null;
  restoreContentBrowserState(snapshot.contentBrowser);
  for(const record of snapshot.assets??[])addLevelAsset(record);
  hiddenEditorAssets.clear();for(const assetId of snapshot.hiddenAssets??[])hiddenEditorAssets.add(assetId);
  editorPendingAsset=null;editorLibrarySelection=null;editorLibrarySelectionLabel="";
  if(snapshot.camera){
    editorCameraFocus.set(snapshot.camera.x,0,snapshot.camera.z);editorCameraScale=snapshot.camera.scale;
    editorCameraRotation.fromArray(snapshot.camera.rotation??[0,0,0]);updateEditorZoomControls();
  }
  ensureEditorCameraObject();
  rebuildPlacedCharacterEncounter();
  renderEditorAssets();updateEditorAssetSelection();renderWorldOutliner();
}
function undoEditorAction(){
  const snapshot=editorUndoHistory.pop();if(!snapshot)return;
  restoreEditorSnapshot(snapshot);updateEditorUndoControl();
  $("editor-status").textContent="Last editor change undone. Press Done to save the level.";
}

// This is a bounded island surface, not an infinite or streamed world floor.
// Use the Content Browser cube with proportional scale unlocked to create additional platforms.
const WORLD_FLOOR_BASE_SIZE=64,ISLAND_PLATFORM_DEPTH=1.65,TILE_BP_DEFAULT_ROWS=5,TILE_BP_DEFAULT_COLUMNS=5,TILE_BP_DEFAULT_SIZE=8,BASE_BP_DEFAULT_ROWS=32,BASE_BP_DEFAULT_COLUMNS=32,BASE_BP_DEFAULT_SIZE=2;
function tileFloorGeometry(rows=TILE_BP_DEFAULT_ROWS,columns=TILE_BP_DEFAULT_COLUMNS,tileSize=TILE_BP_DEFAULT_SIZE){
  const geometry=new THREE.PlaneGeometry(columns*tileSize,rows*tileSize,columns,rows);geometry.rotateX(-Math.PI/2);return geometry;
}
function tileGridGeometry(rows=TILE_BP_DEFAULT_ROWS,columns=TILE_BP_DEFAULT_COLUMNS,tileSize=TILE_BP_DEFAULT_SIZE){
  const positions=[],halfWidth=columns*tileSize*.5,halfDepth=rows*tileSize*.5;
  for(let row=0;row<=rows;row++){const z=-halfDepth+row*tileSize;positions.push(-halfWidth,.004,z,halfWidth,.004,z)}
  for(let column=0;column<=columns;column++){const x=-halfWidth+column*tileSize;positions.push(x,.004,-halfDepth,x,.004,halfDepth)}
  return new THREE.BufferGeometry().setAttribute("position",new THREE.Float32BufferAttribute(positions,3));
}
const islandSideGeometry=new THREE.BoxGeometry(WORLD_FLOOR_BASE_SIZE,ISLAND_PLATFORM_DEPTH,WORLD_FLOOR_BASE_SIZE);
// The separate tile surface owns the top face; overlapping faces cause z-fighting.
islandSideGeometry.setIndex(Array.from(islandSideGeometry.index.array).filter(index=>islandSideGeometry.getAttribute("normal").getY(index)<=0));
islandSideGeometry.clearGroups();
const islandSideMaterial=new THREE.MeshStandardMaterial({color:0x17201d,roughness:.9,metalness:0,flatShading:true});
const primitiveCubeGeometry=new THREE.BoxGeometry(1,1,1);
primitiveCubeGeometry.translate(0,.5,0);
let worldFloor=null;
function normalizeTileDimension(value,fallback){return THREE.MathUtils.clamp(Math.round(Number.isFinite(Number(value))?Number(value):fallback),1,64)}
function normalizeTileSize(value,fallback){return THREE.MathUtils.clamp(Math.round((Number.isFinite(Number(value))?Number(value):fallback)*100)/100,1,32)}
function tileBlueprintAssetId(tile){return tile?.userData?.tileBlueprintAssetId??tile?.tileBlueprintAssetId??(tile?.userData?.editorAssetType==="tile-spawner"?TILE_BP_ASSET_ID:null)}
function isBaseTileBlueprint(tile){return tileBlueprintAssetId(tile)===BASE_BP_ASSET_ID}
function tileBlueprintDefaults(tile){return isBaseTileBlueprint(tile)?{rows:BASE_BP_DEFAULT_ROWS,columns:BASE_BP_DEFAULT_COLUMNS,tileSize:BASE_BP_DEFAULT_SIZE}:{rows:TILE_BP_DEFAULT_ROWS,columns:TILE_BP_DEFAULT_COLUMNS,tileSize:TILE_BP_DEFAULT_SIZE}}
function tileDimensions(tile){const defaults=tileBlueprintDefaults(tile),rows=normalizeTileDimension(tile?.userData?.tileRows,defaults.rows),columns=normalizeTileDimension(tile?.userData?.tileColumns,defaults.columns),tileSize=normalizeTileSize(tile?.userData?.tileSize,defaults.tileSize);return {rows,columns,tileSize,width:columns*tileSize,depth:rows*tileSize}}
function baseGridCellIndex(row,column){return `${row}:${column}`}
function baseGameplayGridSpec(source){
  if(!source?.userData?.sharedGameplayGrid||!isBaseTileBlueprint(source))return null;
  const dimensions=tileDimensions(source),cells=[],local=new THREE.Vector3(),world=new THREE.Vector3(),columnWorld=new THREE.Vector3(),rowWorld=new THREE.Vector3();
  source.updateWorldMatrix(true,false);
  const originLocalX=-dimensions.width*.5+dimensions.tileSize*.5,originLocalZ=-dimensions.depth*.5+dimensions.tileSize*.5;
  local.set(originLocalX,0,originLocalZ);world.copy(local);source.localToWorld(world);
  local.set(originLocalX+dimensions.tileSize,0,originLocalZ);columnWorld.copy(local);source.localToWorld(columnWorld);
  local.set(originLocalX,0,originLocalZ+dimensions.tileSize);rowWorld.copy(local);source.localToWorld(rowWorld);
  const columnStep=columnWorld.sub(world),rowStep=rowWorld.sub(world),angle=Math.atan2(columnStep.z,columnStep.x),cellSize={x:Math.max(.001,Math.max(Math.abs(columnStep.x),Math.abs(rowStep.x))),z:Math.max(.001,Math.max(Math.abs(columnStep.z),Math.abs(rowStep.z)))};
  for(let row=0;row<dimensions.rows;row++)for(let column=0;column<dimensions.columns;column++){
    local.set(-dimensions.width*.5+(column+.5)*dimensions.tileSize,0,-dimensions.depth*.5+(row+.5)*dimensions.tileSize);world.copy(local);source.localToWorld(world);
    cells.push({x:Number(world.x.toFixed(6)),y:Number(world.y.toFixed(6)),z:Number(world.z.toFixed(6)),gridRow:row,gridColumn:column,gridAngle:angle});
  }
  if(!cells.length)return null;
  return {source,cells,cellSize,offset:{x:Math.min(...cells.map(cell=>cell.x)),z:Math.min(...cells.map(cell=>cell.z))},dimensions};
}
function tileSurface(tile=worldFloor){return tile?.getObjectByName("Tile Surface")??tile?.getObjectByName("Island Surface")??null}
function fitTileSpawnerModel(tile){
  const visual=tile?.getObjectByName("Base Model");if(!visual)return;
  const dimensions=tileDimensions(tile),referenceSize=Math.max(.001,Number(visual.userData.groundModelSize)||WORLD_FLOOR_BASE_SIZE),widthScale=dimensions.width/referenceSize,depthScale=dimensions.depth/referenceSize,verticalScale=Math.min(dimensions.width,dimensions.depth)/referenceSize,storedScale=visual.userData.groundModelBaseScale,baseScale=Array.isArray(storedScale)&&storedScale.length===3&&storedScale.every(Number.isFinite)?storedScale:visual.scale.toArray(),storedPosition=visual.userData.groundModelBasePosition,basePosition=Array.isArray(storedPosition)&&storedPosition.length===3&&storedPosition.every(Number.isFinite)?storedPosition:visual.position.toArray();
  visual.userData.groundModelBaseScale=baseScale.slice();visual.userData.groundModelBasePosition=basePosition.slice();visual.scale.set(baseScale[0]*widthScale,baseScale[1]*verticalScale,baseScale[2]*depthScale);visual.position.set(basePosition[0]*widthScale,basePosition[1]*verticalScale,basePosition[2]*depthScale);visual.updateMatrixWorld(true);
}
function refreshTileGrid(tile=worldFloor){
  if(!tile)return;const {rows,columns,tileSize}=tileDimensions(tile),grid=tile.getObjectByName("Tile Grid")??tile.getObjectByName("Island Tile Grid");
  if(!grid)return;grid.geometry.dispose();grid.geometry=tileGridGeometry(rows,columns,tileSize);
}
function applyTileBlueprint({target=selectedTileSpawner(),rows,columns,tileSize,colour,recordUndo=true,refreshUi=true}={}){
  const floor=target;if(!floor)return false;
  if(recordUndo&&mode==="editor")recordEditorUndo();
  const defaults=tileBlueprintDefaults(floor);floor.userData.tileRows=normalizeTileDimension(rows??floor.userData.tileRows,defaults.rows);floor.userData.tileColumns=normalizeTileDimension(columns??floor.userData.tileColumns,defaults.columns);floor.userData.tileSize=normalizeTileSize(tileSize??floor.userData.tileSize,defaults.tileSize);
  const dimensions=tileDimensions(floor),surface=tileSurface(floor);if(surface){const previous=surface.geometry;surface.geometry=tileFloorGeometry(dimensions.rows,dimensions.columns,dimensions.tileSize);if(previous!==surface.geometry)previous.dispose();}
  const base=floor.getObjectByName("Island Cliff")??floor.getObjectByName("Tile Base");if(base?.name==="Island Cliff")base.scale.set(dimensions.width/WORLD_FLOOR_BASE_SIZE,1,dimensions.depth/WORLD_FLOOR_BASE_SIZE);else if(base){const previous=base.geometry;base.geometry=tileSpawnerBaseGeometry(dimensions.width,dimensions.depth);previous.dispose();}
  fitTileSpawnerModel(floor);
  if(/^#[0-9a-f]{6}$/i.test(colour??"")){
    if(isBaseTileBlueprint(floor)){const grid=floor.getObjectByName("Tile Grid");grid?.material?.color?.set(colour)}
    else applyEditorMaterialColour(colour,[floor],{recordUndo:false,refreshUi:false});
    floor.userData.tileColour=colour.toLowerCase();
  }
  refreshTileGrid(floor);invalidateNavigation();if(refreshUi){updateEditorTileInspector();renderWorldOutliner();}return true;
}
function synchronizeBaseGridTransform(tile){
  if(!isBaseTileBlueprint(tile))return false;
  const dimensions=tileDimensions(tile),scaleX=Math.max(.02,Math.abs(tile.scale.x)),scaleZ=Math.max(.02,Math.abs(tile.scale.z)),rows=normalizeTileDimension(Math.round(dimensions.depth*scaleZ/dimensions.tileSize),dimensions.rows),columns=normalizeTileDimension(Math.round(dimensions.width*scaleX/dimensions.tileSize),dimensions.columns),turn=Math.round(tile.rotation.y/(Math.PI*.5))*Math.PI*.5;
  const dimensionsChanged=rows!==dimensions.rows||columns!==dimensions.columns,transformChanged=Math.abs(tile.scale.x-1)>.0001||Math.abs(tile.scale.z-1)>.0001||Math.abs(tile.rotation.x)>.0001||Math.abs(tile.rotation.z)>.0001||Math.abs(tile.rotation.y-turn)>.0001;
  tile.scale.x=1;tile.scale.z=1;tile.rotation.x=0;tile.rotation.z=0;tile.rotation.y=turn;
  if(dimensionsChanged)applyTileBlueprint({target:tile,rows,columns,tileSize:dimensions.tileSize,recordUndo:false,refreshUi:false});
  else if(transformChanged){fitTileSpawnerModel(tile);invalidateNavigation();}
  return dimensionsChanged||transformChanged;
}
function addWorldFloor(record={}){
  const floor=worldFloor??new THREE.Group();
  if(!worldFloor){
    worldFloor=floor;floor.name="Island Plane";floor.receiveShadow=true;
    floor.userData.editorSelectable=true;floor.userData.editorAssetType="world-floor";floor.userData.walkableSurface="island";floor.userData.tileRows=normalizeTileDimension(record.tileRows,TILE_BP_DEFAULT_ROWS);floor.userData.tileColumns=normalizeTileDimension(record.tileColumns,TILE_BP_DEFAULT_COLUMNS);floor.userData.tileSize=normalizeTileSize(record.tileSize,WORLD_FLOOR_BASE_SIZE/floor.userData.tileColumns);floor.userData.tileColour=/^#[0-9a-f]{6}$/i.test(record.tileColour??"")?record.tileColour.toLowerCase():null;
    const dimensions=tileDimensions(floor),islandTop=new THREE.Mesh(tileFloorGeometry(dimensions.rows,dimensions.columns,dimensions.tileSize),meadowGroundMaterial),islandSides=new THREE.Mesh(islandSideGeometry,islandSideMaterial),islandGrid=new THREE.LineSegments(tileGridGeometry(dimensions.rows,dimensions.columns,dimensions.tileSize),new THREE.LineBasicMaterial({color:0x34443b,transparent:true,opacity:.18,depthWrite:false}));
    islandTop.name="Island Surface";islandTop.receiveShadow=true;
    islandSides.name="Island Cliff";islandSides.position.y=-ISLAND_PLATFORM_DEPTH*.5;islandSides.castShadow=true;islandSides.receiveShadow=true;
    islandGrid.name="Island Tile Grid";islandGrid.visible=false;islandGrid.renderOrder=2;islandGrid.userData.editorMaterialOutline=true;islandSides.scale.set(dimensions.width/WORLD_FLOOR_BASE_SIZE,1,dimensions.depth/WORLD_FLOOR_BASE_SIZE);floor.add(islandSides,islandTop,islandGrid);
  }
  const x=Number.isFinite(record.x)?record.x:0,y=Number.isFinite(record.y)?record.y:.01,z=Number.isFinite(record.z)?record.z:0;
  const turn=Number.isFinite(record.turn)?record.turn:0,rotation=Array.isArray(record.rotation)&&record.rotation.length===3&&record.rotation.every(Number.isFinite)?record.rotation:[0,turn,0];
  const scale=Array.isArray(record.scale)&&record.scale.length===3&&record.scale.every(value=>Number.isFinite(value)&&value>0)?record.scale:[1,1,1];
  floor.position.set(x,y,z);floor.rotation.set(...rotation);floor.scale.fromArray(scale);
  if(Number.isFinite(record.tileRows)||Number.isFinite(record.tileColumns)||Number.isFinite(record.tileSize)||/^#[0-9a-f]{6}$/i.test(record.tileColour??""))applyTileBlueprint({target:floor,rows:record.tileRows,columns:record.tileColumns,tileSize:record.tileSize,colour:record.tileColour,recordUndo:false,refreshUi:false});
  if(!floor.parent)battle.add(floor);if(!editorObjects.includes(floor))editorObjects.unshift(floor);invalidateNavigation();
  return floor;
}
function tileSpawnerBaseGeometry(width,depth){
  const geometry=new THREE.BoxGeometry(width,.5,depth),normal=geometry.getAttribute("normal");geometry.setIndex(Array.from(geometry.index.array).filter(index=>normal.getY(index)<=0));geometry.clearGroups();return geometry;
}
function addTileSpawner(record={}){
  const blueprintAssetId=record.tileBlueprintAssetId===BASE_BP_ASSET_ID?BASE_BP_ASSET_ID:TILE_BP_ASSET_ID,baseBlueprint=blueprintAssetId===BASE_BP_ASSET_ID,defaults=tileBlueprintDefaults({tileBlueprintAssetId:blueprintAssetId}),rows=normalizeTileDimension(record.tileRows,defaults.rows),columns=normalizeTileDimension(record.tileColumns,defaults.columns),tileSize=normalizeTileSize(record.tileSize,defaults.tileSize),spawner=new THREE.Group();
  spawner.name=baseBlueprint?"Crownwake Base":"Tile Spawner";spawner.receiveShadow=true;spawner.userData.editorSelectable=true;spawner.userData.editorAssetType="tile-spawner";spawner.userData.walkableSurface="tile-spawner";spawner.userData.tileRows=rows;spawner.userData.tileColumns=columns;spawner.userData.tileSize=tileSize;spawner.userData.tileColour=/^#[0-9a-f]{6}$/i.test(record.tileColour??"")?record.tileColour.toLowerCase():null;
  if(baseBlueprint){spawner.userData.tileBlueprintAssetId=BASE_BP_ASSET_ID;spawner.userData.tileModelAssetId=CROWNWAKE_BASE_MODEL_ASSET_ID;spawner.userData.sharedGameplayGrid=true}else spawner.userData.tileBlueprintAssetId=TILE_BP_ASSET_ID;
  const dimensions=tileDimensions(spawner),surfaceMaterial=baseBlueprint?new THREE.MeshBasicMaterial({transparent:true,opacity:0,depthWrite:false,colorWrite:false,side:THREE.DoubleSide}):meadowGroundMaterial,surface=new THREE.Mesh(tileFloorGeometry(rows,columns,tileSize),surfaceMaterial),grid=new THREE.LineSegments(tileGridGeometry(rows,columns,tileSize),new THREE.LineBasicMaterial({color:spawner.userData.tileColour??0xf7fff1,transparent:true,opacity:.72,depthWrite:false}));
  surface.name="Tile Surface";surface.receiveShadow=!baseBlueprint;grid.name="Tile Grid";grid.visible=false;grid.renderOrder=2;grid.userData.editorMaterialOutline=true;spawner.add(surface,grid);
  if(baseBlueprint){const visual=cloneContentBrowserModelVisual(CROWNWAKE_BASE_MODEL_ASSET_ID);if(visual){visual.name="Base Model";visual.userData.groundModelSize=WORLD_FLOOR_BASE_SIZE;spawner.add(visual);fitTileSpawnerModel(spawner)}}
  else{const base=new THREE.Mesh(tileSpawnerBaseGeometry(dimensions.width,dimensions.depth),islandSideMaterial);base.name="Tile Base";base.position.y=-.25;base.castShadow=true;base.receiveShadow=true;spawner.add(base)}
  const x=Number.isFinite(record.x)?record.x:0,y=Number.isFinite(record.y)?record.y:GROUND_Y,z=Number.isFinite(record.z)?record.z:0,turn=Number.isFinite(record.turn)?record.turn:0,rotation=Array.isArray(record.rotation)&&record.rotation.length===3&&record.rotation.every(Number.isFinite)?record.rotation:[0,turn,0],scale=Array.isArray(record.scale)&&record.scale.length===3&&record.scale.every(value=>Number.isFinite(value)&&value>0)?record.scale:[1,1,1];
  spawner.position.set(x,y,z);spawner.rotation.set(...rotation);spawner.scale.fromArray(scale);if(baseBlueprint)synchronizeBaseGridTransform(spawner);if(spawner.userData.tileColour)applyTileBlueprint({target:spawner,colour:spawner.userData.tileColour,recordUndo:false,refreshUi:false});battle.add(spawner);editorObjects.push(spawner);invalidateNavigation();return spawner;
}
function addPrimitiveCube({x,z,y=GROUND_Y,turn=0,rotation=null,scale=null}){
  const cube=new THREE.Mesh(primitiveCubeGeometry,mats.stone);
  cube.position.set(x,y,z);cube.rotation.set(...(rotation??[0,turn,0]));if(scale)cube.scale.fromArray(scale);
  cube.castShadow=true;cube.receiveShadow=true;cube.userData.editorSelectable=true;cube.userData.editorAssetType="primitive-cube";cube.userData.walkableSurface="cube";cube.userData.navigationBlocks=true;cube.name="Cube";
  battle.add(cube);editorObjects.push(cube);invalidateNavigation();return cube;
}

const ACTOR_FOOT_CLEARANCE=.005,ACTOR_GRAVITY=24,ACTOR_MAX_FALL_SPEED=18,ACTOR_VOID_Y=-24;
const supportProbeWorld=new THREE.Vector3(),supportProbeLocal=new THREE.Vector3(),supportSurfacePoint=new THREE.Vector3();
function walkableSurfaceHeightAt(surface,x,z){
  const type=surface?.userData?.walkableSurface;if(!type||!surface.parent)return null;
  surface.updateWorldMatrix(true,false);supportProbeWorld.set(x,0,z);supportProbeLocal.copy(supportProbeWorld);surface.worldToLocal(supportProbeLocal);
  const dimensions=type==="island"||type==="tile-spawner"?tileDimensions(surface):null,halfWidth=dimensions?dimensions.width*.5:.5,halfDepth=dimensions?dimensions.depth*.5:.5;
  if(Math.abs(supportProbeLocal.x)>halfWidth||Math.abs(supportProbeLocal.z)>halfDepth)return null;
  supportSurfacePoint.set(supportProbeLocal.x,dimensions?0:1,supportProbeLocal.z);surface.localToWorld(supportSurfacePoint);
  return supportSurfacePoint.y;
}
function walkableSupportHeightAt(x,z){
  let highest=null;
  for(const surface of editorObjects){
    const height=walkableSurfaceHeightAt(surface,x,z);
    if(height!==null&&(highest===null||height>highest))highest=height;
  }
  return highest;
}
function primitiveCubeIsNavigationPlatform(cube){
  cube.getWorldScale(navigationWorldScale);
  return isNavigationPlatformCube({walkableSurface:cube.userData.walkableSurface,navigationBlocks:cube.userData.navigationBlocks,scale:navigationWorldScale});
}
function navigationObstacleActive(object){
  const type=object?.userData?.editorAssetType;
  if(!object?.parent||!object.visible||!NAVIGATION_BLOCKING_TYPES.has(type))return false;
  if(object.userData.raidBuilding&&!object.userData.alive)return false;
  return type!=="primitive-cube"||!primitiveCubeIsNavigationPlatform(object);
}
function navigationObstacleFootprint(object){
  if(!navigationObstacleActive(object))return null;
  const type=object.userData.editorAssetType;object.updateWorldMatrix(true,true);object.getWorldPosition(navigationWorldPosition);
  if(type==="town-hall"||type==="barracks")return raidBuildingCollisionFootprints(object)[0]??null;
  object.getWorldScale(navigationWorldScale);
  if(type==="primitive-cube")return {object,x:navigationWorldPosition.x,z:navigationWorldPosition.z,half:{x:Math.abs(navigationWorldScale.x)*.5,z:Math.abs(navigationWorldScale.z)*.5},rotation:object.rotation.y};
  if(type==="archer-tower")return {object,x:navigationWorldPosition.x,z:navigationWorldPosition.z,half:{x:Math.abs(navigationWorldScale.x)*.96,z:Math.abs(navigationWorldScale.z)*.96},rotation:object.rotation.y};
  navigationBounds.setFromObject(object);const size=navigationBounds.getSize(navigationWorldScale),center=navigationBounds.getCenter(navigationWorldPosition);
  return {object,x:center.x,z:center.z,half:{x:Math.max(.08,size.x*.5),z:Math.max(.08,size.z*.5)},rotation:0};
}
function navigationObstacleFootprints(object){
  if(!navigationObstacleActive(object))return [];
  const type=object.userData.editorAssetType;if(type==="town-hall"||type==="barracks")return raidBuildingCollisionFootprints(object);
  const footprint=navigationObstacleFootprint(object);return footprint?[footprint]:[];
}
function navigationObstacleContains(point,obstacle,clearance=0){
  const cosine=Math.cos(obstacle.rotation),sine=Math.sin(obstacle.rotation),offsetX=point.x-obstacle.x,offsetZ=point.z-obstacle.z,localX=cosine*offsetX-sine*offsetZ,localZ=sine*offsetX+cosine*offsetZ;
  return Math.abs(localX)<=obstacle.half.x+clearance&&Math.abs(localZ)<=obstacle.half.z+clearance;
}
function clearNavigationOverlay(){
  for(const child of [...navigationOverlay.children]){navigationOverlay.remove(child);child.geometry?.dispose?.();for(const material of Array.isArray(child.material)?child.material:[child.material])material?.dispose?.();}
}
function activeGameplayGridSpec(){
  const source=walkableSurfaceCandidates(editorObjects).find(surface=>surface.userData.sharedGameplayGrid===true);
  if(!source)return {cellSize:{x:NAVIGATION_CELL_SIZE,z:NAVIGATION_CELL_SIZE},offset:{x:0,z:0},source:null};
  const baseGrid=baseGameplayGridSpec(source);if(baseGrid)return baseGrid;
  const surface=tileSurface(source);if(!surface)return {cellSize:{x:NAVIGATION_CELL_SIZE,z:NAVIGATION_CELL_SIZE},offset:{x:0,z:0},source:null};
  navigationBounds.setFromObject(surface);const dimensions=tileDimensions(source),quarterTurn=Math.round(source.rotation.y/(Math.PI*.5)),swapped=Math.abs(quarterTurn)%2===1;
  const fitted=fittedGridSpec({minX:navigationBounds.min.x,maxX:navigationBounds.max.x,minZ:navigationBounds.min.z,maxZ:navigationBounds.max.z,columns:swapped?dimensions.rows:dimensions.columns,rows:swapped?dimensions.columns:dimensions.rows});
  return fitted?{...fitted,source}:{cellSize:{x:NAVIGATION_CELL_SIZE,z:NAVIGATION_CELL_SIZE},offset:{x:0,z:0},source:null};
}
function addNavigationOverlayCells(cells,color,opacity){
  if(!cells.length)return;
  const mesh=new THREE.InstancedMesh(new THREE.PlaneGeometry(navigationGrid.cellSize.x*.86,navigationGrid.cellSize.z*.86),new THREE.MeshBasicMaterial({color,transparent:true,opacity,depthWrite:false,side:THREE.DoubleSide}),cells.length);
  mesh.renderOrder=84;mesh.frustumCulled=false;
  cells.forEach((cell,index)=>{navigationOverlayMatrix.position.set(cell.x,cell.y+.022,cell.z);navigationOverlayMatrix.rotation.set(-Math.PI*.5,cell.gridAngle??0,0);navigationOverlayMatrix.scale.set(1,1,1);navigationOverlayMatrix.updateMatrix();mesh.setMatrixAt(index,navigationOverlayMatrix.matrix);});
  mesh.instanceMatrix.needsUpdate=true;navigationOverlay.add(mesh);
}
function renderNavigationOverlay(){
  clearNavigationOverlay();navigationOverlay.visible=mode==="editor"&&navigationDebugVisible;
  if(!navigationOverlay.visible)return;
  const walkable=[],blocked=[];
  for(const [key,cell] of navigationGrid.cells)(navigationGrid.blocked.has(key)?blocked:walkable).push(cell);
  addNavigationOverlayCells(walkable,0x41d982,.2);addNavigationOverlayCells(blocked,0xd76569,.36);
}
function editorNavigationDragActive(){return mode==="editor"&&["transform","object"].includes(editorPointerState?.type)}
function invalidateNavigation(){navigationGrid.dirty=true;if(navigationDebugVisible&&mode==="editor"&&!editorNavigationDragActive())ensureNavigationGrid();}
function rebuildNavigationGrid(){
  navigationGrid.cells.clear();navigationGrid.walkable.clear();navigationGrid.blocked.clear();navigationGrid.baseCellsByIndex.clear();navigationGrid.baseDimensions=null;
  const gridSpec=activeGameplayGridSpec();navigationGrid.cellSize=gridSpec.cellSize;navigationGrid.offset=gridSpec.offset;navigationGrid.source=gridSpec.source;
  if(gridSpec.cells?.length){
    navigationGrid.baseDimensions=gridSpec.dimensions;
    for(const cell of gridSpec.cells){
      const height=walkableSurfaceHeightAt(gridSpec.source,cell.x,cell.z);if(height===null)continue;
      const key=navigationCellKey(cell),worldCell={...cell,y:height};navigationGrid.cells.set(key,worldCell);navigationGrid.baseCellsByIndex.set(baseGridCellIndex(cell.gridRow,cell.gridColumn),worldCell);
    }
  }else for(const surface of walkableSurfaceCandidates(editorObjects)){
    navigationBounds.setFromObject(surface);
    for(const cell of gridCellsWithinBounds({minX:navigationBounds.min.x,maxX:navigationBounds.max.x,minZ:navigationBounds.min.z,maxZ:navigationBounds.max.z,cellSize:navigationGrid.cellSize,offset:navigationGrid.offset})){
      const height=walkableSurfaceHeightAt(surface,cell.x,cell.z);if(height===null)continue;
      const key=navigationCellKey(cell),existing=navigationGrid.cells.get(key);if(!existing||height>existing.y)navigationGrid.cells.set(key,{...cell,y:height});
    }
  }
  navigationGrid.obstacles=editorObjects.flatMap(navigationObstacleFootprints);
  for(const [key,cell] of navigationGrid.cells){
    if(!navigationFootprintSupported({x:cell.x,z:cell.z,halfX:NAVIGATION_AGENT_CLEARANCE,halfZ:NAVIGATION_AGENT_CLEARANCE},point=>walkableSupportHeightAt(point.x,point.z))){navigationGrid.cells.delete(key);if(Number.isInteger(cell.gridRow)&&Number.isInteger(cell.gridColumn))navigationGrid.baseCellsByIndex.delete(baseGridCellIndex(cell.gridRow,cell.gridColumn));continue;}
    navigationGrid.walkable.add(key);
    if(navigationGrid.obstacles.some(obstacle=>navigationObstacleContains(cell,obstacle,NAVIGATION_AGENT_CLEARANCE)))navigationGrid.blocked.add(key);
  }
  navigationGrid.dirty=false;navigationGrid.revision++;renderNavigationOverlay();return navigationGrid;
}
function ensureNavigationGrid(){return navigationGrid.dirty?rebuildNavigationGrid():navigationGrid;}
function setNavigationDebugVisible(visible){
  navigationDebugVisible=Boolean(visible);try{localStorage.setItem(NAVIGATION_EDITOR_STATE_KEY,String(navigationDebugVisible))}catch{}
  ensureNavigationGrid();renderNavigationOverlay();const button=$("editor-show-navigation");if(button){button.textContent=navigationDebugVisible?"HIDE NAV":"SHOW NAV";button.setAttribute("aria-pressed",String(navigationDebugVisible));}
}
function actorSupportHeight(actor){return walkableSupportHeightAt(actor.position.x,actor.position.z)}
function commandCellSupported(cell,cellSize=ensureNavigationGrid().cellSize){
  const width=typeof cellSize==="object"?Number(cellSize.x):Number(cellSize),depth=typeof cellSize==="object"?Number(cellSize.z):Number(cellSize);
  if(!cell||![cell.x,cell.z,width,depth].every(Number.isFinite)||width<=0||depth<=0)return false;
  return navigationFootprintSupported({x:cell.x,z:cell.z,halfX:Math.max(.01,width-.06)*.48,halfZ:Math.max(.01,depth-.06)*.48},point=>walkableSupportHeightAt(point.x,point.z));
}
function navigationGridCellFromPoint(point,grid=ensureNavigationGrid()){
  if(!point)return null;
  if(grid.source&&grid.baseDimensions&&grid.baseCellsByIndex.size){
    const {width,depth,tileSize,rows,columns}=grid.baseDimensions;
    navigationLocalPoint.copy(point);grid.source.updateWorldMatrix(true,false);grid.source.worldToLocal(navigationLocalPoint);
    const column=Math.floor((navigationLocalPoint.x+width*.5)/tileSize),row=Math.floor((navigationLocalPoint.z+depth*.5)/tileSize);
    if(row<0||row>=rows||column<0||column>=columns)return null;
    return grid.baseCellsByIndex.get(baseGridCellIndex(row,column))??null;
  }
  return snapNavigationCell(point,grid.cellSize,grid.offset);
}
function deploymentPreviewCells(){
  const grid=ensureNavigationGrid();
  if(deploymentPreviewCache.revision===grid.revision)return deploymentPreviewCache.cells;
  const cells=[...grid.cells.values()].filter(cell=>commandCellSupported(cell,grid.cellSize));
  if(!cells.length){deploymentPreviewCache.revision=grid.revision;deploymentPreviewCache.cells=[];return deploymentPreviewCache.cells}
  const minX=Math.min(...cells.map(cell=>cell.x)),maxX=Math.max(...cells.map(cell=>cell.x)),minZ=Math.min(...cells.map(cell=>cell.z)),maxZ=Math.max(...cells.map(cell=>cell.z)),dimensions=grid.baseDimensions;
  deploymentPreviewCache.revision=grid.revision;deploymentPreviewCache.cells=cells.map(cell=>({cell,cellSize:grid.cellSize,edge:dimensions&&Number.isInteger(cell.gridRow)&&Number.isInteger(cell.gridColumn)?cell.gridRow===0||cell.gridRow===dimensions.rows-1||cell.gridColumn===0||cell.gridColumn===dimensions.columns-1:cell.x===minX||cell.x===maxX||cell.z===minZ||cell.z===maxZ}));
  return deploymentPreviewCache.cells;
}
function deploymentCellFromPoint(point){const grid=ensureNavigationGrid();return navigationGridCellFromPoint(point,grid)}
function deploymentEnemyOccupancySnapshot(){
  const grid=ensureNavigationGrid(),keys=new Set(),halfX=grid.cellSize.x*.5,halfZ=grid.cellSize.z*.5;
  for(const unit of enemyUnits){
    if(!unit?.visible||!unit.userData?.alive||isBarracksDeparting(unit))continue;
    const footprint=Math.max(.18,unit.userData.collisionHalf?.x??unit.userData.collisionHalf?.z??.24);
    for(const [key,candidate] of grid.cells)if(Math.abs(unit.position.x-candidate.x)<=halfX+footprint&&Math.abs(unit.position.z-candidate.z)<=halfZ+footprint)keys.add(key);
  }
  return {grid,keys,signature:[...keys].sort().join("|")};
}
function enemyOccupiesDeploymentCell(cell,cellSize=ensureNavigationGrid().cellSize){
  const grid=ensureNavigationGrid(),key=navigationCellKey(cell);
  if(deploymentPreviewRenderer.revision===grid.revision)return deploymentPreviewRenderer.occupiedKeys.has(key);
  const halfX=(typeof cellSize==="object"?cellSize.x:cellSize)*.5,halfZ=(typeof cellSize==="object"?cellSize.z:cellSize)*.5;
  return enemyUnits.some(unit=>{
    if(!unit?.visible||!unit.userData?.alive||isBarracksDeparting(unit))return false;
    const footprint=Math.max(.18,unit.userData.collisionHalf?.x??unit.userData.collisionHalf?.z??.24);
    return Math.abs(unit.position.x-cell.x)<=halfX+footprint&&Math.abs(unit.position.z-cell.z)<=halfZ+footprint;
  });
}
function deploymentPreviewState(preview){
  const enemyOccupied=enemyOccupiesDeploymentCell(preview.cell,preview.cellSize);
  return {
    enemyOccupied,
    blocked:deploymentPreviewCellState({supported:commandCellSupported(preview.cell,preview.cellSize),edge:preview.edge,enemyOccupied})==="blocked"
  };
}
function removeActorIntoVoid(actor){
  if(!actor?.userData?.alive)return;
  resetDuel(actor);actor.userData.alive=false;actor.userData.falling=true;actor.userData.velocity?.set(0,0,0);actor.visible=false;battle.remove(actor);
  if(actor.userData.faction==="player"){companyLayoutDirty=true;updateStats();}
}
function updateActorGrounding(actor,dt){
  if(!actor?.visible||!actor.userData?.alive||isBarracksDeparting(actor))return;
  const supportY=actorSupportHeight(actor),data=actor.userData;
  if(supportY!==null&&actor.position.y<=supportY+.26){
    actor.position.y=supportY+ACTOR_FOOT_CLEARANCE;data.verticalVelocity=0;data.falling=false;return;
  }
  data.verticalVelocity=Math.max(-ACTOR_MAX_FALL_SPEED,(data.verticalVelocity??0)-ACTOR_GRAVITY*dt);
  actor.position.y+=data.verticalVelocity*dt;data.falling=true;
  if(actor.position.y<ACTOR_VOID_Y)removeActorIntoVoid(actor);
}
function updateActorTerrainSupport(dt){
  for(const actor of [master,...followers,...enemyUnits]){constrainActorToNavigation(actor);updateActorGrounding(actor,dt);}
}

function commandCellBorderGeometry(width,depth,thickness){
  const halfWidth=width*.5,halfDepth=depth*.5,innerWidth=Math.max(0,halfWidth-thickness),innerDepth=Math.max(0,halfDepth-thickness),shape=new THREE.Shape(),hole=new THREE.Path();
  shape.moveTo(-halfWidth,-halfDepth);shape.lineTo(halfWidth,-halfDepth);shape.lineTo(halfWidth,halfDepth);shape.lineTo(-halfWidth,halfDepth);shape.closePath();
  hole.moveTo(-innerWidth,-innerDepth);hole.lineTo(-innerWidth,innerDepth);hole.lineTo(innerWidth,innerDepth);hole.lineTo(innerWidth,-innerDepth);hole.closePath();shape.holes.push(hole);
  const geometry=new THREE.ShapeGeometry(shape);geometry.rotateX(-Math.PI/2);return geometry;
}
const commandGrid=new THREE.Group(),commandCellGeometryCache=new Map(),commandGridMatrix=new THREE.Object3D();
function commandCellSizeAxes(cellSize){const width=typeof cellSize==="object"?Number(cellSize.x):Number(cellSize),depth=typeof cellSize==="object"?Number(cellSize.z):Number(cellSize);return {width:Math.max(.08,width||NAVIGATION_CELL_SIZE),depth:Math.max(.08,depth||NAVIGATION_CELL_SIZE)}}
function commandCellVisualGeometry(cellSize,{deploymentPreview=false,hovered=false}={}){
  const {width,depth}=commandCellSizeAxes(cellSize),key=`${width.toFixed(4)}:${depth.toFixed(4)}:${deploymentPreview?1:0}:${hovered?1:0}`;
  if(commandCellGeometryCache.has(key))return commandCellGeometryCache.get(key);
  const visibleWidth=Math.max(.04,width-.06),visibleDepth=Math.max(.04,depth-.06),minimum=Math.min(visibleWidth,visibleDepth),thickness=minimum*(deploymentPreview?(hovered?.097:.063):(hovered?.047:.025)),fill=new THREE.PlaneGeometry(visibleWidth,visibleDepth),outline=commandCellBorderGeometry(visibleWidth,visibleDepth,thickness);fill.rotateX(-Math.PI/2);
  const geometry={fill,outline};commandCellGeometryCache.set(key,geometry);return geometry;
}
commandGrid.visible=false;battle.add(commandGrid);
function livingCompanyMembers(companyId){
  const company=ensureCompanyLayout().find(item=>item.groupIndex===companyId);
  if(!company)return[];
  return [company.commander,...company.soldiers].filter(actor=>actor?.userData.alive);
}
function livingSelectionMembers(){
  if(selectedCommander?.userData.alive)return[selectedCommander];
  return livingCompanyMembers(selectedCompanyId);
}
function companyCenter(companyId){
  const members=livingCompanyMembers(companyId);
  if(!members.length)return master.position.clone();
  return members.reduce((sum,actor)=>sum.add(actor.position),new THREE.Vector3()).multiplyScalar(1/members.length);
}
function ensureCompanyAnchor(companyId){
  let anchor=companyAnchors.get(companyId);
  if(!anchor){anchor={position:companyCenter(companyId),forward:new THREE.Vector3(0,0,-1),moving:false,deployTimer:0,followingCommander:false};companyAnchors.set(companyId,anchor)}
  return anchor;
}
function formationPoint(anchor,offset){
  const forward=anchor.forward?.clone().setY(0)??new THREE.Vector3(0,0,-1);
  if(forward.lengthSq()<.001)forward.set(0,0,-1);else forward.normalize();
  const lateral=new THREE.Vector3(-forward.z,0,forward.x);
  return anchor.position.clone().addScaledVector(lateral,offset.lateral).addScaledVector(forward,-offset.trailing);
}
function companyBattleFormationOffset(index,count,expansionProgress){
  const base=companyFormationOffset(index,count,1.42);
  const expansion=formationExpansionOffset(index,count,expansionProgress,6);
  return {lateral:base.lateral+expansion.lateral,trailing:base.trailing-expansion.forward};
}
function settleCompanyAnchors(){
  for(const company of ensureCompanyLayout()){
    const anchor=ensureCompanyAnchor(company.groupIndex);
    anchor.position.copy(companyCenter(company.groupIndex));anchor.position.y=GROUND_Y;anchor.moving=false;anchor.deployTimer=0;anchor.followingCommander=false;
    for(const soldier of company.soldiers)soldier.userData.holdPosition=soldier.position.clone();
  }
  target.copy(master.position);master.userData.velocity.set(0,0,0);
}
function clearSelectionVisuals(){
  for(const {actor,shell,shellMaterials,ring} of selectionVisuals){
    actor?.remove(shell);
    shellMaterials.forEach(material=>material.dispose?.());
    battle.remove(ring);ring?.geometry?.dispose?.();ring?.material?.dispose?.();
  }
  selectionVisuals.length=0;
}
function rebuildSelectionVisuals(){
  clearSelectionVisuals();
  if(selectedCompanyId===null&&!selectedCommander)return;
  for(const actor of livingSelectionMembers()){
    const visual=actor.children.find(child=>child.userData.characterVisual);
    const shell=visual?.clone(true)??new THREE.Group();
    const shellMaterials=[];
    // Scale each axis by its own visible size. This keeps the selection edge
    // equally thick around the tall soldier rather than over-emphasising it
    // along the top face.
    if(visual){
      const bounds=new THREE.Box3().setFromObject(visual),size=bounds.getSize(new THREE.Vector3()),edgeWidth=.09;
      shell.scale.multiply(new THREE.Vector3(
        1+edgeWidth*2/Math.max(size.x,.01),
        1+edgeWidth*2/Math.max(size.y,.01),
        1+edgeWidth*2/Math.max(size.z,.01)
      ));
    }
    shell.traverse(child=>{
      if(!child.isMesh)return;
      const source=Array.isArray(child.material)?child.material:[child.material];
      const outlined=source.map(()=>new THREE.MeshBasicMaterial({
        color:0xf7fff7,side:THREE.BackSide,transparent:true,opacity:.92,depthWrite:false
      }));
      shellMaterials.push(...outlined);
      child.material=Array.isArray(child.material)?outlined:outlined[0];child.castShadow=false;child.receiveShadow=false;child.renderOrder=42;
    });
    actor.add(shell);
    const ring=new THREE.Mesh(
      new THREE.RingGeometry(radarOuterRadius()+.022,radarOuterRadius()+.045,48),
      new THREE.MeshBasicMaterial({color:0xf7f2e4,transparent:true,opacity:.88,side:THREE.DoubleSide,depthWrite:false})
    );
    ring.rotation.x=-Math.PI/2;ring.position.copy(actor.position);ring.position.y=actor.position.y+Math.max(unitRingSettings.outerHeight,unitRingSettings.innerHeight,unitRingSettings.radarHeight)+.022;ring.renderOrder=40;
    battle.add(ring);
    selectionVisuals.push({actor,shell,shellMaterials,ring});
  }
}
function updateSelectionVisuals(){
  for(const {actor,shell,shellMaterials,ring} of selectionVisuals){
    if(!actor?.userData.alive){shell.visible=false;ring.visible=false;continue}
    shell.visible=true;ring.visible=true;ring.position.set(actor.userData.encounterRing?.position.x??0,0,actor.userData.encounterRing?.position.z??0);actor.localToWorld(ring.position);ring.position.y=actor.position.y+Math.max(unitRingSettings.outerHeight,unitRingSettings.innerHeight,unitRingSettings.radarHeight)+.022;ring.material.opacity=.88;
    for(const material of shellMaterials)material.opacity=.92;
  }
}
function tacticalCellInRange(cell){
  if(!cell)return false;
  const grid=ensureNavigationGrid(),key=navigationCellKey(cell);
  return grid.walkable.has(key)&&!grid.blocked.has(key)&&commandCellSupported(cell,grid.cellSize);
}
function resetDeploymentPreviewRenderer(){Object.assign(deploymentPreviewRenderer,{revision:-1,mode:null,entries:[],entryByKey:new Map(),outline:null,enemyFill:null,hoverFill:null,hoverOutline:null,occupiedKeys:new Set(),fillGeometry:null});}
function removeCommandGridChild(child){
  if(!child)return;
  commandGrid.remove(child);for(const material of Array.isArray(child.material)?child.material:[child.material])material?.dispose?.();
}
function clearCommandGrid(){
  for(const child of [...commandGrid.children])removeCommandGridChild(child);
  commandGrid.clear();commandGrid.userData.hoverOutline=null;resetDeploymentPreviewRenderer();
}
function addCommandGridInstances(cells,geometry,material,heightOffset,renderOrder){
  if(!cells.length)return null;
  const mesh=new THREE.InstancedMesh(geometry,material,cells.length);
  mesh.renderOrder=renderOrder;mesh.frustumCulled=false;
  cells.forEach(({cell,surfaceY},index)=>{
    commandGridMatrix.position.set(cell.x,surfaceY+heightOffset,cell.z);commandGridMatrix.rotation.set(0,cell.gridAngle??0,0);commandGridMatrix.scale.set(1,1,1);commandGridMatrix.updateMatrix();mesh.setMatrixAt(index,commandGridMatrix.matrix);
  });
  mesh.instanceMatrix.needsUpdate=true;commandGrid.add(mesh);return mesh;
}
function sameDeploymentCellKeys(first,second){return first.size===second.size&&[...first].every(key=>second.has(key))}
function ensureDeploymentPreviewRenderer(previews,mode="deployment"){
  const grid=ensureNavigationGrid(),renderer=deploymentPreviewRenderer;
  if(renderer.revision===grid.revision&&renderer.mode===mode&&renderer.entries.length===previews.length&&renderer.outline?.parent===commandGrid)return renderer;
  clearCommandGrid();
  const entries=[];
  for(const preview of previews){
    const surfaceY=Number.isFinite(preview.cell.y)?preview.cell.y:walkableSupportHeightAt(preview.cell.x,preview.cell.z);if(surfaceY!==null)entries.push({...preview,surfaceY});
  }
  if(!entries.length)return null;
  const geometry=commandCellVisualGeometry(entries[0].cellSize,{deploymentPreview:true}),hoverGeometry=commandCellVisualGeometry(entries[0].cellSize,{deploymentPreview:true,hovered:true});
  renderer.revision=grid.revision;renderer.mode=mode;renderer.entries=entries;renderer.entryByKey=new Map(entries.map(entry=>[navigationCellKey(entry.cell),entry]));renderer.fillGeometry=geometry.fill;
  renderer.outline=addCommandGridInstances(entries,geometry.outline,new THREE.MeshBasicMaterial({color:0xf7fff1,transparent:true,opacity:.78,depthWrite:false,side:THREE.DoubleSide}),.014,91);
  renderer.hoverFill=new THREE.Mesh(hoverGeometry.fill,new THREE.MeshBasicMaterial({color:0x72e7a1,transparent:true,opacity:.48,depthWrite:false,side:THREE.DoubleSide}));
  renderer.hoverOutline=new THREE.Mesh(hoverGeometry.outline,new THREE.MeshBasicMaterial({color:0x9fffc3,transparent:true,opacity:.98,depthWrite:false,side:THREE.DoubleSide}));
  renderer.hoverFill.renderOrder=92;renderer.hoverOutline.renderOrder=93;renderer.hoverFill.frustumCulled=false;renderer.hoverOutline.frustumCulled=false;renderer.hoverFill.visible=false;renderer.hoverOutline.visible=false;renderer.hoverOutline.userData.commandGridHover=true;commandGrid.add(renderer.hoverFill,renderer.hoverOutline);
  return renderer;
}
function updateDeploymentPreviewOccupied(renderer,occupiedKeys){
  const visibleKeys=new Set([...occupiedKeys].filter(key=>renderer.entryByKey.has(key)));
  if(sameDeploymentCellKeys(renderer.occupiedKeys,visibleKeys))return false;
  removeCommandGridChild(renderer.enemyFill);renderer.enemyFill=null;
  const entries=[...visibleKeys].map(key=>renderer.entryByKey.get(key));
  if(entries.length)renderer.enemyFill=addCommandGridInstances(entries,renderer.fillGeometry,new THREE.MeshBasicMaterial({color:0xd76569,transparent:true,opacity:.26,depthWrite:false,side:THREE.DoubleSide}),.012,90);
  renderer.occupiedKeys=visibleKeys;return true;
}
function updateDeploymentPreviewHover(renderer){
  const hovered=commandHoverCell?renderer.entryByKey.get(navigationCellKey(commandHoverCell)):null;
  if(!hovered){renderer.hoverFill.visible=false;renderer.hoverOutline.visible=false;commandGrid.userData.hoverOutline=null;return;}
  const enemyOccupied=renderer.mode==="deployment"&&renderer.occupiedKeys.has(navigationCellKey(hovered.cell));
  renderer.hoverFill.visible=!enemyOccupied;renderer.hoverFill.position.set(hovered.cell.x,hovered.surfaceY+.016,hovered.cell.z);renderer.hoverFill.rotation.set(0,hovered.cell.gridAngle??0,0);
  renderer.hoverOutline.visible=true;renderer.hoverOutline.position.set(hovered.cell.x,hovered.surfaceY+.018,hovered.cell.z);renderer.hoverOutline.rotation.set(0,hovered.cell.gridAngle??0,0);renderer.hoverOutline.scale.setScalar(1);renderer.hoverOutline.material.color.set(enemyOccupied?0xf7fff1:0x9fffc3);renderer.hoverOutline.material.opacity=.98;commandGrid.userData.hoverOutline=renderer.hoverOutline;
}
function addDeploymentPreviewGrid(previews){
  const renderer=ensureDeploymentPreviewRenderer(previews,"deployment");if(!renderer)return 0;
  const snapshot=deploymentEnemyOccupancySnapshot();updateDeploymentPreviewOccupied(renderer,snapshot.keys);deploymentPreviewOccupancySignature=snapshot.signature;updateDeploymentPreviewHover(renderer);return renderer.entries.length;
}
function addTacticalCommandGrid(){
  const renderer=ensureDeploymentPreviewRenderer(deploymentPreviewCells(),"command");
  if(!renderer)return 0;
  deploymentPreviewOccupancySignature="";updateDeploymentPreviewHover(renderer);return renderer.entries.length;
}
function updateCommandGridGlow(){
  const outline=commandGrid.userData.hoverOutline;
  if(!outline?.visible)return;
  const pulse=.5+.5*Math.sin(interfaceTime*5.2);
  outline.material.opacity=.76+pulse*.24;outline.scale.setScalar(1.008+pulse*.017);
}
function refreshCommandGrid(){
  if(deploymentPlacementReady||mode==="editor"){
    addDeploymentPreviewGrid(deploymentPreviewCells());
    commandGrid.visible=commandGrid.children.length>0&&!(mode==="editor"&&tileBlueprintSelected());return;
  }
  if(selectedCompanyId===null&&!selectedCommander){clearCommandGrid();commandGrid.visible=false;return}
  if(deploymentPreviewRenderer.mode!=="command"||deploymentPreviewRenderer.outline?.parent!==commandGrid)clearCommandGrid();
  addTacticalCommandGrid();
  commandGrid.visible=commandGrid.children.length>0;
}
function clearTacticalSelection(){
  selectedCompanyId=null;selectedCommander=null;commandHoverCell=null;commandGrid.visible=false;clearCommandGrid();clearSelectionVisuals();
  updateDivideControl();
}
function selectCompany(companyId){
  if(deploymentPlacementReady)disarmDeployment();
  selectedCompanyId=companyId;selectedCommander=null;commandHoverCell=null;rebuildSelectionVisuals();refreshCommandGrid();updateDivideControl();showToast(STR.chooseGround,1300);synthTone(410,.12,"sine",.018);
}
function selectCommander(commander){
  if(deploymentPlacementReady)disarmDeployment();
  selectedCompanyId=null;selectedCommander=commander;commandHoverCell=null;
  rebuildSelectionVisuals();refreshCommandGrid();updateDivideControl();showToast(STR.chooseGround,1300);synthTone(465,.12,"sine",.018);
}
function updateDeploymentControl(){
  for(const [archetypeId,buttonId] of [["ch1","companies"],["ch2","companies-ch2"],["ch3","companies-ch3"]]){
    const button=$(buttonId);if(!button)continue;
    const reserve=deploymentReserves[archetypeId]??0,available=canDeploySoldier(reserve),active=deploymentPlacementReady&&deploymentArchetypeId===archetypeId;
    button.disabled=!available;button.classList.toggle("deploy-armed",active);button.setAttribute("aria-pressed",String(active));
    button.setAttribute("aria-label",available?`Deploy all ${reserve} ${archetypeId.toUpperCase()} soldiers`:`No ${archetypeId.toUpperCase()} soldiers left to deploy`);
  }
}
function disarmDeployment(){
  deploymentArchetypeId=null;deploymentPlacementReady=false;deploymentPreviewOccupancySignature="";commandHoverCell=null;
  refreshCommandGrid();updateDeploymentControl();
}
function deploymentCellBlocked(cell){
  if(!cell)return true;
  const preview=deploymentPreviewCells().find(candidate=>candidate.cell.x===cell.x&&candidate.cell.z===cell.z);
  return !preview||deploymentPreviewState(preview).blocked;
}
function toggleDeploymentMode(archetypeId){
  if(mode!=="playing")return;
  if(!PLAYER_DEPLOYMENT_ARCHETYPES.includes(archetypeId))return;
  const reserve=deploymentReserves[archetypeId]??0;
  if(!canDeploySoldier(reserve)){showToast(`NO ${archetypeId.toUpperCase()} SOLDIERS LEFT`,1100);return}
  if(deploymentPlacementReady&&deploymentArchetypeId===archetypeId){disarmDeployment();showToast("DEPLOYMENT CANCELLED",900);return}
  deploymentArchetypeId=archetypeId;deploymentPlacementReady=true;deploymentPreviewOccupancySignature="";commandHoverCell=null;clearTacticalSelection();refreshCommandGrid();updateDeploymentControl();showToast(`CHOOSE A POINT FOR ${archetypeId.toUpperCase()}`,1300);synthTone(430,.12,"sine",.018);
}
function updateDeploymentEnemyOccupancy(){
  if(!deploymentPlacementReady)return;
  const snapshot=deploymentEnemyOccupancySnapshot();
  if(snapshot.signature===deploymentPreviewOccupancySignature)return;
  deploymentPreviewOccupancySignature=snapshot.signature;
  const renderer=deploymentPreviewRenderer;
  if(renderer.revision!==snapshot.grid.revision||renderer.outline?.parent!==commandGrid){refreshCommandGrid();return;}
  updateDeploymentPreviewOccupied(renderer,snapshot.keys);updateDeploymentPreviewHover(renderer);
}
function deploySoldier(point){
  if(!deploymentPlacementReady||!PLAYER_DEPLOYMENT_ARCHETYPES.includes(deploymentArchetypeId)||!canDeploySoldier(deploymentReserves[deploymentArchetypeId]))return false;
  const count=deploymentReserves[deploymentArchetypeId],grid=ensureNavigationGrid(),cell=deploymentCellFromPoint(point),seed=rand();
  if(!cell){commandHoverCell=null;refreshCommandGrid();showToast("CHOOSE THE ISLAND",1000);return false;}
  if(deploymentCellBlocked(cell)){commandHoverCell=commandCellSupported(cell,grid.cellSize)?cell:null;refreshCommandGrid();showToast(commandHoverCell?"ENEMY GROUND":"CHOOSE THE ISLAND",1000);return false}
  const surfaceY=walkableSupportHeightAt(cell.x,cell.z),deployed=[];
  for(let index=0;index<count;index++){
    const offset=scatteredPackOffset(index,count,seed),unit=makeUnit("player",deploymentArchetypeId);
    unit.userData.companyId=deploymentGroupId(deploymentArchetypeId);unit.position.set(cell.x+offset.lateral*.48,surfaceY+ACTOR_FOOT_CLEARANCE,cell.z+offset.forward*.48);unit.userData.holdPosition=unit.position.clone();battle.add(unit);followers.push(unit);deployed.push(unit);
  }
  const deployedArchetypeId=deploymentArchetypeId,groupId=deploymentGroupId(deployedArchetypeId),anchor=ensureCompanyAnchor(groupId);anchor.position.set(cell.x,GROUND_Y,cell.z);anchor.patrolHome=anchor.position.clone();anchor.patrolGoal=null;anchor.forward.set(0,0,-1);anchor.moving=false;
  deploymentReserves[deploymentArchetypeId]=deploymentReserveAfterDeploy(deploymentReserves[deploymentArchetypeId],count);deploymentStarted=true;clearPeacefulPatrols();companyLayoutDirty=true;activatePlacedCharacterEncounter({engageImmediately:true});
  deploymentArchetypeId=null;deploymentPlacementReady=false;deploymentPreviewOccupancySignature="";commandHoverCell=null;refreshCommandGrid();updateDeploymentControl();
  updateStats();playSound("move");synthTone(520,.12,"sine",.022);showToast(`${deployedArchetypeId.toUpperCase()} GROUP DEPLOYED`,950);
  return true;
}
function issueCompanyOrder(point){
  if(selectedCompanyId===null&&!selectedCommander)return false;
  const cell=deploymentCellFromPoint(point);
  if(!cell){showToast(STR.blockedGround,1000);commandHoverCell=null;refreshCommandGrid();return true;}
  const action=tacticalCellAction({inRange:tacticalCellInRange(cell)});
  if(action==="reject"){showToast(STR.blockedGround,1000);commandHoverCell=cell;refreshCommandGrid();return true}
  if(action==="cancel"){
    clearTacticalSelection();showToast(STR.orderCancelled,1100);synthTone(220,.1,"sine",.014);return true;
  }
  if(INDEPENDENT_SOLDIERS&&selectedCompanyId!==null){
    const members=livingCompanyMembers(selectedCompanyId),anchor=ensureCompanyAnchor(selectedCompanyId),center=companyCenter(selectedCompanyId),direction=new THREE.Vector3(cell.x,GROUND_Y,cell.z).sub(center).setY(0);
    if(direction.lengthSq()>.001)anchor.forward.copy(direction.normalize());
    if(celebrationWinnerFaction==="player")clearFactionCelebration();
    anchor.position.copy(center).setY(GROUND_Y);anchor.orderTarget=new THREE.Vector3(cell.x,GROUND_Y,cell.z);anchor.patrolHome=anchor.orderTarget.clone();anchor.patrolGoal=null;anchor.moving=true;
    const forward=anchor.forward.clone().setY(0).normalize();
    members.forEach((member,index)=>{
      const offset=compactGroupColumnOffset(index),destination=anchor.orderTarget.clone().addScaledVector(forward,offset.forward);
      destination.y=member.position.y;resetDuel(member);clearBuildingAttackAssignments(member);member.userData.holdPosition=null;member.userData.peacefulPatrolGoal=null;member.userData.groupPatrolGoal=null;member.userData.groupPatrolPauseUntil=0;member.userData.celebrating=false;member.userData.manualTarget=destination;member.userData.manualFinalTarget=destination.clone();member.userData.manualMoving=true;member.userData.navigationPath=null;member.userData.navigationYield=null;
    });
    clearTacticalSelection();playSound("move");return true;
  }
  if(selectedCommander){
    const commander=selectedCommander,destination=new THREE.Vector3(cell.x,GROUND_Y,cell.z);
    commander.userData.manualTarget=destination;commander.userData.manualMoving=true;
    if(commander===master)target.copy(destination);
    clearTacticalSelection();playSound("move");return true;
  }
  const companyId=selectedCompanyId,anchor=ensureCompanyAnchor(companyId);
  const direction=new THREE.Vector3(cell.x,GROUND_Y,cell.z).sub(companyCenter(companyId)).setY(0);
  if(direction.lengthSq()>.001)anchor.forward.copy(direction.normalize());
  anchor.position.set(cell.x,GROUND_Y,cell.z);anchor.moving=true;anchor.deployTimer=0;
  const commander=ensureCompanyLayout().find(item=>item.groupIndex===companyId)?.commander;
  const commanderTarget=formationPoint(anchor,commanderFormationOffset(1.42));
  anchor.commanderTarget=commanderTarget;
  if(commander===master){target.copy(commanderTarget);master.userData.manualTarget=commanderTarget.clone();master.userData.manualMoving=true}
  for(const member of livingCompanyMembers(companyId)){
    resetDuel(member);
    if(!member.userData.isMaster)member.userData.holdPosition=null;
  }
  clearTacticalSelection();playSound("move");return true;
}

function makeBanner(color) {
  const g=new THREE.Group(), pole=new THREE.Mesh(new THREE.CylinderGeometry(.035,.05,1.85,6),mat(0xf3ead1));
  pole.position.y=1.2; g.add(pole);
  const shape=new THREE.Shape(); shape.moveTo(0,0); shape.lineTo(.88,.08); shape.lineTo(.68,.34); shape.lineTo(.9,.62); shape.lineTo(0,.55);
  const flag=new THREE.Mesh(new THREE.ShapeGeometry(shape),mat(color)); flag.position.set(.03,1.55,0); flag.rotation.y=-.18; flag.userData.flag=true; flags.push(flag); g.add(flag); return g;
}
function makeMaster(faction="player") {
  const g=new THREE.Group(),archetypeId=faction==="player"?"ch1":"en1",modelAssetId=actorModelAssetId(archetypeId);
  setCharacterVisual(g,modelAssetId,()=>{const body=roundedBox(.42,1.22,.38,mats.warrior,.1);body.position.y=.03;return body});
  const profile={maxHealth:faction==="player"?32:25.6,attack:faction==="player"?10:8,regenDelay:99,regenPerSecond:0};
  g.userData={faction,actorArchetypeId:archetypeId,modelAssetId,progressBarAssetId:actorProgressBarAssetId(archetypeId),healthBarOffset:actorHealthBarOffset(archetypeId),hp:profile.maxHealth,maxHp:profile.maxHealth,attack:profile.attack,regenDelay:profile.regenDelay,regenPerSecond:profile.regenPerSecond,sinceDamage:99,regenStartHealth:profile.maxHealth,regenActive:false,cool:0,alive:true,isMaster:false,unitCommander:false,companyId:0,collisionHalf:actorModelCollisionHalf(modelAssetId),velocity:new THREE.Vector3(),attackAnim:0,damageAnim:0,celebrating:false,manualMoving:false,manualTarget:null,lastAttackTime:null,lastDamageTime:null,collisionContacts:0};
  if(faction!=="player")tintCharacter(g,COLORS.coral);prepareDamageVisual(g);makeActorHealthWidget(g,false);addGroundContactOcclusion(g);makeEncounterRing(g);return g;
}
const ACTOR_SPEED_BOOST=1.5;
const ACTOR_LEGACY_MOVE_SPEEDS=Object.freeze({ch1:2.65,ch2:3.18,ch3:2.65,en1:2.65,en2:3.18,en3:2.65,en4:2.65,en5:2.65});
const ACTOR_DEFAULT_ACCELERATION=5.4,ACTOR_SPEED_INPUT_MAX=15,ACTOR_ACCELERATION_INPUT_MAX=30;
const ACTOR_ARCHETYPES=Object.freeze({
  ch1:Object.freeze({id:"ch1",label:"CH1",faction:"player",maxHp:32,attack:10,moveSpeed:2.65*ACTOR_SPEED_BOOST,acceleration:ACTOR_DEFAULT_ACCELERATION,patrolSpeed:2.65*ACTOR_SPEED_BOOST,tint:null}),
  ch3:Object.freeze({id:"ch3",label:"CH Swordsman",faction:"player",maxHp:32,attack:10,moveSpeed:2.65*ACTOR_SPEED_BOOST,acceleration:ACTOR_DEFAULT_ACCELERATION,patrolSpeed:2.65*ACTOR_SPEED_BOOST,tint:null}),
  en1:Object.freeze({id:"en1",label:"EN1",faction:"enemy",maxHp:32,attack:10,moveSpeed:2.65*ACTOR_SPEED_BOOST,acceleration:ACTOR_DEFAULT_ACCELERATION,patrolSpeed:2.65*ACTOR_SPEED_BOOST,tint:COLORS.amber}),
  ch2:Object.freeze({id:"ch2",label:"CH2",faction:"player",maxHp:38.4,attack:12,moveSpeed:3.18*ACTOR_SPEED_BOOST,acceleration:ACTOR_DEFAULT_ACCELERATION,patrolSpeed:3.18*ACTOR_SPEED_BOOST,tint:0x171a1d}),
  en2:Object.freeze({id:"en2",label:"EN2",faction:"enemy",maxHp:38.4,attack:12,moveSpeed:3.18*ACTOR_SPEED_BOOST,acceleration:ACTOR_DEFAULT_ACCELERATION,patrolSpeed:3.18*ACTOR_SPEED_BOOST,tint:0xd84b55}),
  en3:Object.freeze({id:"en3",label:"EN 3",faction:"enemy",maxHp:32,attack:10,moveSpeed:2.65*ACTOR_SPEED_BOOST,acceleration:ACTOR_DEFAULT_ACCELERATION,patrolSpeed:2.65*ACTOR_SPEED_BOOST,tint:0xbe63e6}),
  en4:Object.freeze({id:"en4",label:"EN 4",faction:"enemy",maxHp:16,attack:5,moveSpeed:2.65*ACTOR_SPEED_BOOST,acceleration:ACTOR_DEFAULT_ACCELERATION,patrolSpeed:2.65*ACTOR_SPEED_BOOST,tint:0xb17ad1}),
  en5:Object.freeze({id:"en5",label:"EN Swordsman",faction:"enemy",maxHp:32,attack:10,moveSpeed:2.65*ACTOR_SPEED_BOOST,acceleration:ACTOR_DEFAULT_ACCELERATION,patrolSpeed:2.65*ACTOR_SPEED_BOOST,tint:COLORS.amber})
});
function actorArchetype(archetypeId,faction="player"){
  const candidate=ACTOR_ARCHETYPES[archetypeId==="en-splitter"?"en3":archetypeId];
  return candidate?.faction===faction?candidate:ACTOR_ARCHETYPES[faction==="enemy"?"en1":"ch1"];
}
function actorMaterialColour(archetypeId){const colour=contentBrowserState.actorMaterials[archetypeId];return /^#[0-9a-f]{6}$/i.test(colour??"")?colour.toLowerCase():null}
function actorProgressBarAssetId(archetypeId){const assetId=contentBrowserState.actorProgressBars[archetypeId];return isProgressBarBlueprint(assetId)?assetId:ACTOR_PROGRESS_BAR_BP_ASSET_ID}
function actorHealthBarOffset(archetypeId){return normalizeHealthBarOffset(contentBrowserState.actorHealthBarOffsets[archetypeId],ACTOR_HEALTH_BAR_OFFSET)}
function actorModelAssetId(archetypeId){return resolveContentBrowserModelId(contentBrowserState.actorModels[archetypeId],["ch3","en5"].includes(archetypeId)?SWORDSMAN_MODEL_ASSET_ID:CHARACTER_MODEL_ASSET_ID)}
function actorModelCollisionHalf(assetId){const base=actorCollisionProfile("soldier"),scale=contentBrowserModelScale(assetId);return {...base,x:base.x*Math.abs(scale[0]),z:base.z*Math.abs(scale[2])}}
function actorDefaultMoveSpeed(faction){return actorArchetype(null,faction).moveSpeed}
function actorBlueprintStats(archetypeId){return normalizeActorBlueprintStats(contentBrowserState.actorStats[archetypeId])}
function actorBlueprintProfile(archetypeId,faction){const archetype=actorArchetype(archetypeId,faction);return {...archetype,...actorBlueprintStats(archetype.id)}}
function actorAcceleration(unit){const archetype=actorArchetype(unit?.userData?.actorArchetypeId,unit?.userData?.faction),configured=Number(unit?.userData?.acceleration);return THREE.MathUtils.clamp(Number.isFinite(configured)?configured:archetype.acceleration,.5,ACTOR_ACCELERATION_INPUT_MAX)}
function actorPatrolSpeed(unit){const archetype=actorArchetype(unit?.userData?.actorArchetypeId,unit?.userData?.faction),configured=Number(unit?.userData?.patrolSpeed);return THREE.MathUtils.clamp(Number.isFinite(configured)?configured:archetype.patrolSpeed,.25,ACTOR_SPEED_INPUT_MAX)}
function actorSteerAcceleration(unit,baseAcceleration){return baseAcceleration*(actorAcceleration(unit)/ACTOR_DEFAULT_ACCELERATION)}
function actorLegacyMoveSpeed(unit){const archetype=actorArchetype(unit?.userData?.actorArchetypeId,unit?.userData?.faction);return ACTOR_LEGACY_MOVE_SPEEDS[archetype.id]??actorDefaultMoveSpeed(unit?.userData?.faction)}
function normalizeActorMoveSpeed(moveSpeed,archetypeId,faction){
  const archetype=actorArchetype(archetypeId,faction),configured=THREE.MathUtils.clamp(moveSpeed,.25,8),legacySpeed=ACTOR_LEGACY_MOVE_SPEEDS[archetype.id];
  return legacySpeed!=null&&Math.abs(configured-legacySpeed)<.001?archetype.moveSpeed:configured;
}
function editorActorMoveScale(unit){
  const baseline=actorLegacyMoveSpeed(unit),configured=Number(unit?.userData?.moveSpeed);
  return THREE.MathUtils.clamp(Number.isFinite(configured)?configured:baseline,.25,8)/baseline;
}
function applyEditorActorProfile(actor,profile){
  if(!actor?.userData||!profile)return;
  const maxHp=Number(profile.maxHp),attack=Number(profile.attack),moveSpeed=Number(profile.moveSpeed),acceleration=Number(profile.acceleration),patrolSpeed=Number(profile.patrolSpeed),healthBarOffset=Number(profile.healthBarOffset);
  if(profile.archetypeId){actor.userData.actorArchetypeId=actorArchetype(profile.archetypeId,actor.userData.faction).id;if(actor.userData.faction==="player")actor.userData.companyId=deploymentGroupId(actor.userData.actorArchetypeId);}
  if(Number.isFinite(maxHp))actor.userData.maxHp=actor.userData.hp=THREE.MathUtils.clamp(maxHp,1,500);
  if(Number.isFinite(attack))actor.userData.attack=THREE.MathUtils.clamp(attack,.5,200);
  if(Number.isFinite(moveSpeed))actor.userData.moveSpeed=normalizeActorMoveSpeed(moveSpeed,actor.userData.actorArchetypeId,actor.userData.faction);
  if(Number.isFinite(acceleration))actor.userData.acceleration=THREE.MathUtils.clamp(acceleration,.5,ACTOR_ACCELERATION_INPUT_MAX);
  if(Number.isFinite(patrolSpeed))actor.userData.patrolSpeed=THREE.MathUtils.clamp(patrolSpeed,.25,ACTOR_SPEED_INPUT_MAX);
  if(Number.isFinite(healthBarOffset))actor.userData.healthBarOffset=normalizeHealthBarOffset(healthBarOffset,ACTOR_HEALTH_BAR_OFFSET);
  if(isProgressBarBlueprint(profile.progressBarAssetId))actor.userData.progressBarAssetId=profile.progressBarAssetId;
  if(profile.modelAssetId)applyCharacterModel(actor,profile.modelAssetId);
  applyProgressBarAppearance(actor.userData.healthWidget,actor.userData.progressBarAssetId,ACTOR_PROGRESS_BAR_BP_ASSET_ID);
  positionActorHealthWidget(actor);
}
function applyCharacterModel(actor,assetId){
  if(!actor?.userData)return null;
  const archetype=actorArchetype(actor.userData.actorArchetypeId,actor.userData.faction),resolvedAssetId=resolveContentBrowserModelId(assetId,actorModelAssetId(archetype.id));
  setCharacterVisual(actor,resolvedAssetId,()=>{const body=roundedBox(.42,1.22,.38,mats.warrior,.1);body.position.y=.03;return body});
  actor.userData.modelAssetId=resolvedAssetId;actor.userData.collisionHalf=actorModelCollisionHalf(resolvedAssetId);
  const materialColor=actor.userData.faction==="enemy"?actor.userData.editorMaterialColor??actorMaterialColour(archetype.id):null,tint=materialColor?new THREE.Color(materialColor).getHex():archetype.tint;
  if(Number.isInteger(tint))tintCharacter(actor,tint);
  prepareDamageVisual(actor);
  positionActorHealthWidget(actor);
  if(actor.userData.alive===false)setFallenAppearance(actor,true);
  return resolvedAssetId;
}
function makeUnit(faction="player",archetypeId=null) {
  const g=new THREE.Group(),archetype=actorBlueprintProfile(archetypeId,faction),modelAssetId=actorModelAssetId(archetype.id);
  setCharacterVisual(g,modelAssetId,()=>{const body=roundedBox(.42,1.22,.38,mats.warrior,.1);body.position.y=.03;return body});
  const {maxHp,attack,moveSpeed}=archetype,materialColor=faction==="enemy"?actorMaterialColour(archetype.id):null;
  g.userData={faction,actorArchetypeId:archetype.id,modelAssetId,progressBarAssetId:actorProgressBarAssetId(archetype.id),healthBarOffset:actorHealthBarOffset(archetype.id),hp:maxHp,maxHp,attack,moveSpeed,acceleration:archetype.acceleration,patrolSpeed:archetype.patrolSpeed,splitsOnDeath:archetype.id==="en3",editorMaterialColor:materialColor??undefined,sinceDamage:99,regenStartHealth:maxHp,regenActive:false,cool:rand()*.5,alive:true,isMaster:false,unitCommander:false,companyId:faction==="player"?deploymentGroupId(archetype.id):0,collisionHalf:actorModelCollisionHalf(modelAssetId),velocity:new THREE.Vector3(),phase:rand()*10,mode:SERVANT_MODE.FOLLOW,followState:FOLLOW_AWARENESS.HOLDING,followTimer:0,followThreshold:.38+rand()*.72,responseDelay:.12+rand()*.68,trackingRate:1.8+rand()*2.4,hitPulse:0,attackAnim:0,damageAnim:0,celebrating:false,lastAttackTime:null,lastDamageTime:null,collisionContacts:0};
  const tint=materialColor?new THREE.Color(materialColor).getHex():archetype.tint;if(Number.isInteger(tint))tintCharacter(g,tint);
  prepareDamageVisual(g);makeActorHealthWidget(g,false);addGroundContactOcclusion(g);makeEncounterRing(g);return g;
}
function addEditorCharacter({faction="player",x,z,y=GROUND_Y,turn=0,rotation=null,scale=null,actor:actorProfile=null,archetypeId=null}){
  const archetype=actorArchetype(archetypeId??actorProfile?.archetypeId,faction),actor=makeUnit(faction,archetype.id);actor.position.set(x,y,z);actor.rotation.set(...(rotation??[0,turn,0]));actor.scale.fromArray(scale??[1,1,1]);
  applyEditorActorProfile(actor,actorProfile);
  actor.userData.editorSelectable=true;actor.userData.editorActor=true;actor.userData.editorAssetType=faction==="enemy"?"enemy-character":"ch-character";actor.name=archetype.label;
  battle.add(actor);editorObjects.push(actor);
  const roster=faction==="enemy"?enemyUnits:followers;if(!roster.includes(actor))roster.push(actor);
  activatePlacedCharacterEncounter();if(mode==="editor")refreshCommandGrid();return actor;
}
function addEditorHudWidget({archetypeId="en1",x,z,y=GROUND_Y,turn=0,rotation=null,scale=null,hudSize,hudSpawnCount,hudVisible,hudLayoutX,hudLayoutY}={}){
  const settings=normalizeHudWidgetSettings({size:hudSize,spawnCount:hudSpawnCount,visible:hudVisible,layoutX:hudLayoutX,layoutY:hudLayoutY},archetypeId),archetype=actorArchetype(settings.archetypeId,ACTOR_ARCHETYPES[settings.archetypeId].faction),widget=new THREE.Group(),panelMaterial=new THREE.MeshStandardMaterial({color:0xf7f2df,roughness:.8,metalness:.02}),accentMaterial=new THREE.MeshStandardMaterial({color:archetype.faction==="player"?COLORS.player:COLORS.amber,roughness:.62,metalness:.04}),panel=new THREE.Mesh(new THREE.BoxGeometry(1.24,.06,.5),panelMaterial),accent=new THREE.Mesh(new THREE.BoxGeometry(.08,.075,.34),accentMaterial);
  panel.position.y=.04;accent.position.set(-.42,.08,0);widget.add(panel,accent);widget.position.set(x,y,z);widget.rotation.set(...(rotation??[0,turn,0]));widget.scale.fromArray(scale??[1,1,1]);
  widget.userData={editorAssetType:"hud-widget",editorSelectable:true,hudArchetypeId:settings.archetypeId,hudAssetId:hudAssetId(settings.archetypeId),hudSize:settings.size,hudSpawnCount:settings.spawnCount,hudVisible:settings.visible,hudLayoutX:settings.layoutX,hudLayoutY:settings.layoutY};widget.name=`${archetype.label} HUD`;
  battle.add(widget);editorObjects.push(widget);return widget;
}
function addEditorHudText({x=0,z=0,y=GROUND_Y,turn=0,rotation=null,scale=null,hudText,hudSize,hudVisible,hudLayoutX,hudLayoutY}={}){
  const settings=normalizeHudTextSettings({text:hudText,size:hudSize,visible:hudVisible,layoutX:hudLayoutX,layoutY:hudLayoutY}),widget=new THREE.Group(),panelMaterial=new THREE.MeshStandardMaterial({color:0xf7f2df,roughness:.8,metalness:.02}),panel=new THREE.Mesh(new THREE.BoxGeometry(1.9,.06,.46),panelMaterial);
  panel.position.y=.04;widget.add(panel);widget.position.set(x,y,z);widget.rotation.set(...(rotation??[0,turn,0]));widget.scale.fromArray(scale??[1,1,1]);
  widget.userData={editorAssetType:"hud-text",editorSelectable:true,hudAssetId:HUD_TEXT_ASSET_ID,hudText:settings.text,hudSize:settings.size,hudVisible:settings.visible,hudLayoutX:settings.layoutX,hudLayoutY:settings.layoutY};widget.name="Objective Text HUD";
  battle.add(widget);editorObjects.push(widget);return widget;
}
function isHudLayoutObject(object){return ["hud-widget","hud-text"].includes(object?.userData?.editorAssetType)}
function hudWidgetArchetype(widget){return actorArchetype(widget?.userData?.hudArchetypeId,ACTOR_ARCHETYPES[widget?.userData?.hudArchetypeId]?.faction??"enemy")}
function hudWidgetScale(widget){const worldScale=Math.max(Math.abs(widget.scale.x),Math.abs(widget.scale.y),Math.abs(widget.scale.z));return THREE.MathUtils.clamp((Number(widget.userData.hudSize)||1)*worldScale,.35,4)}
function hudWidgetLayout(widget){const settings=widget?.userData?.editorAssetType==="hud-text"?normalizeHudTextSettings({layoutX:widget?.userData?.hudLayoutX,layoutY:widget?.userData?.hudLayoutY}):normalizeHudWidgetSettings({layoutX:widget?.userData?.hudLayoutX,layoutY:widget?.userData?.hudLayoutY},widget?.userData?.hudArchetypeId);return {x:settings.layoutX,y:settings.layoutY}}
function beginHudLayoutDrag(widget,event){
  if(mode!=="editor"||!widget||(event.button!==undefined&&event.button!==0))return;
  event.preventDefault();event.stopPropagation();selectEditorObject(widget);renderPlacedHudWidgets();recordEditorUndo();hudLayoutDrag={widget,pointerId:event.pointerId};event.currentTarget?.setPointerCapture?.(event.pointerId);document.body.classList.add("editor-dragging");
}
function updateHudLayoutDrag(event){
  if(!hudLayoutDrag||hudLayoutDrag.pointerId!==event.pointerId)return;
  const rect=canvas.getBoundingClientRect(),layoutX=snapHudLayout((event.clientX-rect.left)/rect.width,HUD_LAYOUT_GRID.columns),layoutY=snapHudLayout((event.clientY-rect.top)/rect.height,HUD_LAYOUT_GRID.rows),widget=hudLayoutDrag.widget;
  widget.userData.hudLayoutX=layoutX;widget.userData.hudLayoutY=layoutY;renderPlacedHudWidgets();updateEditorHudWidgetInspector();
}
function endHudLayoutDrag(event){
  if(!hudLayoutDrag||hudLayoutDrag.pointerId!==event.pointerId)return;
  event.currentTarget?.releasePointerCapture?.(event.pointerId);hudLayoutDrag=null;document.body.classList.remove("editor-dragging");$("editor-status").textContent="HUD block moved. Press Save to keep this layout.";
}
function createPlacedHudWidgetElement(widget){
  if(widget.userData.editorAssetType==="hud-text"){
    const text=document.createElement("div");text.className="placed-hud-text";text.addEventListener("pointerdown",event=>{if(mode==="editor")beginHudLayoutDrag(widget,event);else event.stopPropagation();});text.addEventListener("pointermove",updateHudLayoutDrag);text.addEventListener("pointerup",endHudLayoutDrag);text.addEventListener("pointercancel",endHudLayoutDrag);$("placed-hud-layer")?.append(text);hudWidgetElements.set(widget,text);return text;
  }
  const button=document.createElement("button"),icon=document.createElement("i"),label=document.createElement("small"),count=document.createElement("strong");
  button.type="button";button.className="placed-hud-widget";button.append(icon,label,count);button.addEventListener("pointerdown",event=>{if(mode==="editor")beginHudLayoutDrag(widget,event);else event.stopPropagation();});button.addEventListener("pointermove",updateHudLayoutDrag);button.addEventListener("pointerup",endHudLayoutDrag);button.addEventListener("pointercancel",endHudLayoutDrag);button.addEventListener("click",event=>{
    event.preventDefault();event.stopPropagation();if(mode!=="playing"||widget.userData.hudVisible===false)return;
    const archetype=hudWidgetArchetype(widget);if(archetype.faction==="player")toggleDeploymentMode(archetype.id);else spawnHudEnemies(widget);
  });
  $("placed-hud-layer")?.append(button);hudWidgetElements.set(widget,button);return button;
}
function placedHudWidgetElement(widget){return hudWidgetElements.get(widget)??createPlacedHudWidgetElement(widget)}
function spawnHudEnemies(widget){
  const archetype=hudWidgetArchetype(widget);if(archetype.faction!=="enemy"||!widget.userData.hudVisible)return false;
  const count=normalizeHudWidgetSettings({spawnCount:widget.userData.hudSpawnCount},archetype.id).spawnCount,supportY=walkableSupportHeightAt(widget.position.x,widget.position.z)??GROUND_Y,seed=rand();
  for(let index=0;index<count;index++){
    const offset=scatteredPackOffset(index,count,seed),enemy=makeUnit("enemy",archetype.id);enemy.position.set(widget.position.x+offset.lateral*.56,supportY+ACTOR_FOOT_CLEARANCE,widget.position.z+offset.forward*.56);battle.add(enemy);enemyUnits.push(enemy);
  }
  activatePlacedCharacterEncounter({engageImmediately:true});updateStats();showToast(`${count} ${archetype.label.toUpperCase()} SPAWNED`,1100);return true;
}
function ensureDefaultHudWidgets(){
  if(editorObjects.some(object=>object.userData?.editorAssetType==="hud-widget"&&hudWidgetArchetype(object).faction==="player"))return false;
  for(const [index,archetypeId] of PLAYER_DEPLOYMENT_ARCHETYPES.entries())addEditorHudWidget({archetypeId,x:(index-1)*1.55,z:-2.2,hudLayoutX:hudLayoutDefault(archetypeId).x,hudLayoutY:hudLayoutDefault(archetypeId).y});
  return true;
}
function ensureDefaultHudText(){
  if(editorObjects.some(object=>object.userData?.editorAssetType==="hud-text"))return false;
  addEditorHudText({x:0,z:-3,hudText:HUD_TEXT_DEFAULTS.text,hudLayoutX:HUD_TEXT_DEFAULTS.layoutX,hudLayoutY:HUD_TEXT_DEFAULTS.layoutY});return true;
}
function renderPlacedHudWidgets(){
  const layer=$("placed-hud-layer");if(!layer)return;
  const widgets=editorObjects.filter(isHudLayoutObject),active=new Set(widgets),rect=canvas.getBoundingClientRect();document.body.classList.toggle("hud-layout-ready",widgets.some(widget=>widget.userData.editorAssetType==="hud-widget"&&hudWidgetArchetype(widget).faction==="player"));document.body.classList.toggle("hud-text-ready",widgets.some(widget=>widget.userData.editorAssetType==="hud-text"));layer.classList.toggle("editor-layout-grid",mode==="editor");
  for(const [widget,element] of hudWidgetElements)if(!active.has(widget)){element.remove();hudWidgetElements.delete(widget);}
  for(const widget of widgets){
    widget.visible=false;const element=placedHudWidgetElement(widget),archetype=hudWidgetArchetype(widget),layout=hudWidgetLayout(widget),visible=widget.userData.hudVisible!==false&&["playing","paused","editor"].includes(mode);
    element.classList.toggle("hidden",!visible);if(!visible)continue;
    element.classList.toggle("editor-selected",editorSelection===widget);element.style.left=`${rect.left+layout.x*rect.width}px`;element.style.top=`${rect.top+layout.y*rect.height}px`;element.style.setProperty("--placed-hud-scale",String(hudWidgetScale(widget)));if(widget.userData.editorAssetType==="hud-text"){element.textContent=widget.userData.hudText;continue;}
    const icon=element.querySelector("i"),label=element.querySelector("small"),count=element.querySelector("strong"),player=archetype.faction==="player",amount=player?(deploymentReserves[archetype.id]??0):widget.userData.hudSpawnCount;
    icon.className=`placed-hud-icon ${player?"ch":"en"} ${archetype.id}`;label.textContent=archetype.label.toUpperCase();count.textContent=String(amount);element.disabled=mode==="playing"&&player&&amount<=0;element.setAttribute("aria-label",player?`Deploy ${amount} ${archetype.label} soldiers`:`Spawn ${amount} ${archetype.label} enemies`);
  }
}
function spawnEnemySplitChildren(parent){
  if(parent?.userData?.faction!=="enemy"||!parent.userData.splitsOnDeath)return [];
  parent.userData.splitsOnDeath=false;
  const stats=splitEnemyStats(parent.userData),lateral=new THREE.Vector3(Math.cos(parent.rotation.y),0,-Math.sin(parent.rotation.y)),children=[];
  for(const side of [-1,1]){
    const child=makeUnit("enemy","en4");child.name="EN 4";child.position.copy(parent.position).addScaledVector(lateral,side*.44);child.rotation.copy(parent.rotation);child.scale.copy(parent.scale);
    child.userData.maxHp=stats.maxHp;child.userData.hp=stats.maxHp;child.userData.regenStartHealth=stats.maxHp;child.userData.attack=stats.attack;child.userData.moveSpeed=parent.userData.moveSpeed;child.userData.acceleration=actorAcceleration(parent);child.userData.patrolSpeed=actorPatrolSpeed(parent);child.userData.splitsOnDeath=false;child.userData.splitChild=true;const health=child.userData.healthWidget?.userData;if(health){health.current=stats.maxHp;health.lagHealth=stats.maxHp;}
    battle.add(child);enemyUnits.push(child);children.push(child);
  }
  if(activeEncounter){activeEncounter.totalServants+=children.length;activeEncounter.threatBudget+=children.length;}
  return children;
}
function isBarracksDeparting(unit){return Boolean(unit?.userData?.barracksDeparture)}
function barracksSpawnRoute(barracks){
  const insideMarker=barracks.getObjectByName(BARRACKS_ENEMY_SPAWN_INSIDE_MARKER),exitMarker=barracks.getObjectByName(BARRACKS_ENEMY_SPAWN_EXIT_MARKER);let inside,exit;
  barracks.updateMatrixWorld(true);
  if(insideMarker&&exitMarker){inside=insideMarker.getWorldPosition(new THREE.Vector3());exit=exitMarker.getWorldPosition(new THREE.Vector3());}
  else{
    const half=barracks.userData.collisionHalf??{z:1.5},front=Math.max(.8,half.z+.5);inside=new THREE.Vector3(0,0,Math.max(.1,front-.9));exit=new THREE.Vector3(0,0,front);barracks.localToWorld(inside);barracks.localToWorld(exit);
  }
  const support=walkableSupportHeightAt(exit.x,exit.z)??walkableSupportHeightAt(inside.x,inside.z)??GROUND_Y;inside.y=support+ACTOR_FOOT_CLEARANCE;exit.y=support+ACTOR_FOOT_CLEARANCE;
  return {inside,exit};
}
function barracksDepartureRevealProgress(barracks,route){
  const fallback=BARRACKS_ENEMY_DOORWAY_PROGRESS*.35,footprints=raidBuildingCollisionFootprints(barracks);if(!footprints.length)return fallback;
  const point=new THREE.Vector3(),blocked=progress=>{point.lerpVectors(route.inside,route.exit,progress);return footprints.some(footprint=>navigationObstacleContains(point,footprint));};
  if(!blocked(0)||blocked(1))return fallback;
  let previous=0;
  for(let step=1;step<=32;step++){const progress=step/32;if(!blocked(progress))return Math.max(.08,previous*BARRACKS_ENEMY_DOORWAY_PROGRESS);previous=progress;}
  return fallback;
}
function barracksClearExitPoint(unit,route){
  const exit=route.exit.clone(),direction=exit.clone().sub(route.inside);direction.y=0;if(direction.lengthSq()<.0001)return exit;direction.normalize();
  for(let step=0;step<20;step++){
    exit.y=(walkableSupportHeightAt(exit.x,exit.z)??GROUND_Y)+ACTOR_FOOT_CLEARANCE;
    if(navigationPointFullySupported(exit,unit)&&!navigationPointPhysicallyBlocked(exit,unit))break;
    exit.addScaledVector(direction,Math.max(.08,unitCollisionRadius(unit)*.5));
  }
  return exit;
}
function beginBarracksDeparture(unit,barracks,{hidden=true}={}){
  if(!unit?.userData||!barracks?.userData?.alive)return false;
  const route=barracksSpawnRoute(barracks),clearExit=barracksClearExitPoint(unit,route),revealProgress=barracksDepartureRevealProgress(barracks,route),direction=clearExit.clone().sub(route.inside);direction.y=0;
  unit.position.copy(route.inside);if(direction.lengthSq()>.0001)unit.rotation.y=Math.atan2(direction.x,direction.z);
  unit.visible=!hidden;unit.userData.barracksSpawned=true;unit.userData.barracksInitialDuelCheck=false;unit.userData.velocity?.set(0,0,0);
  unit.userData.barracksDeparture={barracks,inside:route.inside.clone(),doorway:route.exit.clone(),exit:clearExit,progress:0,revealed:!hidden,revealProgress,duration:BARRACKS_ENEMY_EXIT_DURATION};
  return true;
}
function barracksInteriorContainsPoint(barracks,point){
  if(!barracks?.userData?.alive||!point)return false;
  const local=raidBuildingLocalPoint(barracks,point),half=raidBuildingCollisionHalf(barracks);
  return Math.abs(local.x)<=half.x&&Math.abs(local.z)<=half.z;
}
function beginAuthoredBarracksDepartures(){
  let prepared=0;
  for(const unit of enemyUnits){
    if(!unit?.userData?.editorActor||unit.userData.faction!=="enemy"||!unit.userData.alive||isBarracksDeparting(unit))continue;
    const barracks=editorObjects.find(building=>building?.userData?.editorAssetType==="barracks"&&building.userData.alive&&building.visible&&barracksInteriorContainsPoint(building,unit.position));
    if(beginBarracksDeparture(unit,barracks,{hidden:true}))prepared++;
  }
  return prepared;
}
function barracksSpawnPoint(barracks){return barracksSpawnRoute(barracks).exit;}
function barracksAnchorSlotPoint(anchor,slot,y){
  const angle=slot/BARRACKS_ENEMY_ANCHOR_SLOT_COUNT*Math.PI*2;
  return new THREE.Vector3(anchor.position.x+Math.cos(angle)*BARRACKS_ENEMY_ANCHOR_DISTANCE,y,anchor.position.z+Math.sin(angle)*BARRACKS_ENEMY_ANCHOR_DISTANCE);
}
function barracksAnchorOpenSlots(unit,anchor,livingEnemySoldiers){
  const slots=[];for(let slot=0;slot<BARRACKS_ENEMY_ANCHOR_SLOT_COUNT;slot++)if(navigationPointWalkable(barracksAnchorSlotPoint(anchor,slot,unit.position.y),unit))slots.push(slot);return slots;
}
function barracksAnchorOccupiedSlots(unit,anchor,livingEnemySoldiers){
  return livingEnemySoldiers.filter(other=>other!==unit&&other?.visible&&other.userData?.alive&&other.userData.barracksAnchor===anchor).map(other=>other.userData.barracksAnchorSlot).filter(Number.isInteger);
}
function assignBarracksAnchor(unit,livingEnemySoldiers=enemyUnits){
  const candidates=livingEnemySoldiers.filter(other=>other!==unit&&other?.visible&&other.userData?.alive&&!other.userData.isMaster),available=candidates.filter(anchor=>chooseAvailableBarracksAnchorSlot({slots:barracksAnchorOpenSlots(unit,anchor,livingEnemySoldiers),occupiedSlots:barracksAnchorOccupiedSlots(unit,anchor,livingEnemySoldiers),preferredSlot:unit.userData.barracksAnchorSlot})!==null),anchor=chooseBarracksAnchor({candidates:available.length?available:candidates,roll:rand()});
  unit.userData.barracksAnchor=anchor;unit.userData.barracksAnchorSlot=null;return anchor;
}
function barracksAnchorDestination(unit,livingEnemySoldiers){
  let anchor=unit.userData.barracksAnchor;
  if(!anchor?.visible||!anchor.userData?.alive||!livingEnemySoldiers.includes(anchor))anchor=assignBarracksAnchor(unit,livingEnemySoldiers);
  if(!anchor)return null;
  let slots=barracksAnchorOpenSlots(unit,anchor,livingEnemySoldiers),slot=chooseAvailableBarracksAnchorSlot({slots,occupiedSlots:barracksAnchorOccupiedSlots(unit,anchor,livingEnemySoldiers),preferredSlot:unit.userData.barracksAnchorSlot});
  if(slot===null){anchor=assignBarracksAnchor(unit,livingEnemySoldiers);if(!anchor)return null;slots=barracksAnchorOpenSlots(unit,anchor,livingEnemySoldiers);slot=chooseAvailableBarracksAnchorSlot({slots,occupiedSlots:barracksAnchorOccupiedSlots(unit,anchor,livingEnemySoldiers)});}
  if(slot===null)return null;
  unit.userData.barracksAnchorSlot=slot;return barracksAnchorSlotPoint(anchor,slot,unit.position.y);
}
function updateBarracksDeparture(unit,dt){
  const departure=unit?.userData?.barracksDeparture;if(!departure)return false;
  const progress=Math.min(1,(departure.progress??0)+dt/Math.max(.2,departure.duration??BARRACKS_ENEMY_EXIT_DURATION)),doorway=departure.doorway??departure.exit,doorwayProgress=THREE.MathUtils.clamp(BARRACKS_ENEMY_DOORWAY_PROGRESS,.05,.95),revealProgress=THREE.MathUtils.clamp(departure.revealProgress??doorwayProgress*.35,.04,doorwayProgress),direction=departure.exit.clone().sub(departure.inside);direction.y=0;
  if(progress<=doorwayProgress){const stageProgress=progress/doorwayProgress,eased=stageProgress*stageProgress*(3-2*stageProgress);unit.position.lerpVectors(departure.inside,doorway,eased);}
  else{const stageProgress=(progress-doorwayProgress)/(1-doorwayProgress),eased=stageProgress*stageProgress*(3-2*stageProgress);unit.position.lerpVectors(doorway,departure.exit,eased);}
  if(direction.lengthSq()>.0001)unit.rotation.y=smoothAngle(unit.rotation.y,Math.atan2(direction.x,direction.z),12,dt);
  if(!departure.revealed&&progress>=revealProgress){unit.visible=true;departure.revealed=true;}
  departure.progress=progress;
  if(progress<1)return true;
  unit.position.copy(departure.exit);unit.visible=true;unit.userData.barracksDeparture=null;unit.userData.barracksInitialDuelCheck=true;unit.userData.velocity.set(0,0,0);assignBarracksAnchor(unit);activatePlacedCharacterEncounter();
  return true;
}
function spawnBarracksEnemy(barracks){
  const enemy=makeUnit("enemy","en1");enemy.userData.barracksSpawned=true;beginBarracksDeparture(enemy,barracks,{hidden:true});battle.add(enemy);enemyUnits.push(enemy);
  if(activeEncounter){activeEncounter.totalServants++;activeEncounter.threatBudget++;}
  return enemy;
}
function updateBarracksSpawners(dt){
  for(const barracks of editorObjects){
    if(barracks.userData.editorAssetType!=="barracks"||!barracks.userData.alive)continue;
    const interval=THREE.MathUtils.clamp(Math.round(Number(barracks.userData.barracksSpawnInterval)||BUILDING_BLUEPRINT_DEFAULTS.barracksSpawnInterval),5,10),remaining=Number.isFinite(barracks.userData.barracksSpawnTimer)?barracks.userData.barracksSpawnTimer:interval;
    barracks.userData.barracksSpawnTimer=remaining-dt;
    if(barracks.userData.barracksSpawnTimer>0)continue;
    spawnBarracksEnemy(barracks);barracks.userData.barracksSpawnTimer+=interval;
  }
}
function activeRaidBuildings(){return editorObjects.filter(building=>building.userData.raidBuilding&&building.userData.alive&&building.visible)}
function raidBuildingCollisionHalf(building){const half=building.userData.collisionHalf??{x:1.5,z:1.5};return {x:half.x*Math.abs(building.scale.x),z:half.z*Math.abs(building.scale.z)}}
function raidBuildingCollisionFootprints(building){
  const localFootprints=Array.isArray(building?.userData?.modelCollisionFootprints)&&building.userData.modelCollisionFootprints.length?building.userData.modelCollisionFootprints:[{x:0,z:0,half:building?.userData?.collisionHalf??{x:1.5,z:1.5}}],scaleX=Number.isFinite(building?.scale?.x)?building.scale.x:1,scaleZ=Number.isFinite(building?.scale?.z)?building.scale.z:1;
  return localFootprints.map(footprint=>{const center=raidBuildingWorldPoint(building,{x:footprint.x*scaleX,z:footprint.z*scaleZ});return {object:building,x:center.x,z:center.z,half:{x:Math.max(.08,footprint.half.x*Math.abs(scaleX)),z:Math.max(.08,footprint.half.z*Math.abs(scaleZ))},rotation:building.rotation.y};});
}
function unitCollisionRadius(unit){const half=unit.userData.collisionHalf??{x:.2,z:.2};return Math.hypot(half.x,half.z)}
function raidBuildingLocalPoint(building,point){const cosine=Math.cos(building.rotation.y),sine=Math.sin(building.rotation.y),offsetX=point.x-building.position.x,offsetZ=point.z-building.position.z;return {x:cosine*offsetX-sine*offsetZ,z:sine*offsetX+cosine*offsetZ}}
function raidBuildingWorldPoint(building,point){const cosine=Math.cos(building.rotation.y),sine=Math.sin(building.rotation.y);return new THREE.Vector3(building.position.x+cosine*point.x+sine*point.z,GROUND_Y,building.position.z-sine*point.x+cosine*point.z)}
function obstacleSurfaceDistance(point,obstacle){const cosine=Math.cos(obstacle.rotation),sine=Math.sin(obstacle.rotation),offsetX=point.x-obstacle.x,offsetZ=point.z-obstacle.z,localX=cosine*offsetX-sine*offsetZ,localZ=sine*offsetX+cosine*offsetZ;return Math.hypot(Math.max(0,Math.abs(localX)-obstacle.half.x),Math.max(0,Math.abs(localZ)-obstacle.half.z))}
function raidBuildingSurfaceDistance(point,building){return Math.min(...raidBuildingCollisionFootprints(building).map(footprint=>obstacleSurfaceDistance(point,footprint)))}
function raidBuildingApproachPoint(building,point,clearance=.36,fallbackSide=1){const local=raidBuildingLocalPoint(building,point),length=Math.hypot(local.x,local.z),direction=length<.001?{x:fallbackSide,z:0}:{x:local.x/length,z:local.z/length},half=raidBuildingCollisionHalf(building),distance=Math.min(Math.abs(direction.x)>.001?half.x/Math.abs(direction.x):Infinity,Math.abs(direction.z)>.001?half.z/Math.abs(direction.z):Infinity);return raidBuildingWorldPoint(building,{x:direction.x*(distance+clearance),z:direction.z*(distance+clearance)})}
function navigationLiveUnits(){return [master,...followers,...enemyUnits].filter(unit=>unit?.visible&&unit.userData?.alive!==false&&!isBarracksDeparting(unit))}
function navigationTrafficCosts(unit,targetActor=null){
  const grid=ensureNavigationGrid(),costs=new Map();
  for(const other of navigationLiveUnits()){
    if(other===unit||other===targetActor)continue;
    const center=navigationGridCellFromPoint(other.position,grid);if(!center)continue;
    if(grid.baseDimensions&&Number.isInteger(center.gridRow)&&Number.isInteger(center.gridColumn)){
      for(let column=-1;column<=1;column++)for(let row=-1;row<=1;row++){
        const cell=grid.baseCellsByIndex.get(baseGridCellIndex(center.gridRow+row,center.gridColumn+column));if(!cell)continue;
        const key=navigationCellKey(cell);if(!grid.walkable.has(key)||grid.blocked.has(key))continue;
        const distance=Math.hypot(column,row),weight=distance<.1?2.6:distance<1.1?1.05:.32;costs.set(key,(costs.get(key)??0)+weight);
      }
    }else for(let column=-1;column<=1;column++)for(let row=-1;row<=1;row++){
      const cell={x:center.x+column*grid.cellSize.x,z:center.z+row*grid.cellSize.z},key=navigationCellKey(cell);if(!grid.walkable.has(key)||grid.blocked.has(key))continue;
      const distance=Math.hypot(column,row),weight=distance<.1?2.6:distance<1.1?1.05:.32;costs.set(key,(costs.get(key)??0)+weight);
    }
  }
  return costs;
}
function navigationGoalKey(desired,goalKey=null){
  if(goalKey!==null&&goalKey!==undefined)return String(goalKey);
  const grid=ensureNavigationGrid(),cell=navigationGridCellFromPoint(desired,grid);return `point:${navigationCellKey(cell??desired)}`;
}
function unitIgnoresNavigationObstacle(unit,obstacle){return unit?.userData?.barracksDeparture?.barracks===obstacle?.object}
function navigationPointPhysicallyBlocked(point,unit){
  const radius=unitCollisionRadius(unit)+.01;
  return ensureNavigationGrid().obstacles.some(obstacle=>!unitIgnoresNavigationObstacle(unit,obstacle)&&navigationObstacleContains(point,obstacle,radius));
}
function navigationPointFullySupported(point,unit){
  const half=unit.userData.collisionHalf??{x:NAVIGATION_AGENT_CLEARANCE,z:NAVIGATION_AGENT_CLEARANCE};
  return navigationFootprintSupported({x:point.x,z:point.z,halfX:half.x,halfZ:half.z},sample=>walkableSupportHeightAt(sample.x,sample.z));
}
function navigationPointWalkable(point,unit,blocked=null){
  const grid=ensureNavigationGrid(),cell=navigationGridCellFromPoint(point,grid),key=navigationCellKey(cell??point);
  return !!cell&&grid.walkable.has(key)&&!(blocked??grid.blocked).has(key)&&navigationPointFullySupported(point,unit)&&!navigationPointPhysicallyBlocked(point,unit);
}
function navigationPathBlockedCells(unit,targetActor=null){
  const grid=ensureNavigationGrid(),targetObstacles=targetActor?.userData?.raidBuilding?grid.obstacles.filter(obstacle=>obstacle.object===targetActor):[];
  if(!targetObstacles.length)return grid.blocked;
  const targetClearance=unitCollisionRadius(unit)+.01,blocked=new Set();
  for(const [key,cell] of grid.cells){
    if(!grid.walkable.has(key))continue;
    const blockedByOther=grid.obstacles.some(obstacle=>obstacle.object!==targetActor&&navigationObstacleContains(cell,obstacle,NAVIGATION_AGENT_CLEARANCE));
    const blockedByTarget=targetObstacles.some(obstacle=>navigationObstacleContains(cell,obstacle,targetClearance));
    if(blockedByOther||blockedByTarget)blocked.add(key);
  }
  return blocked;
}
function navigationPhysicalPathClear(start,end,unit){
  const distance=Math.hypot(end.x-start.x,end.z-start.z),stepCount=Math.max(1,Math.ceil(distance/.1));
  for(let stepIndex=1;stepIndex<=stepCount;stepIndex++){
    const progress=stepIndex/stepCount,point={x:start.x+(end.x-start.x)*progress,z:start.z+(end.z-start.z)*progress};
    if(!navigationPointFullySupported(point,unit)||navigationPointPhysicallyBlocked(point,unit))return false;
  }
  return true;
}
function navigationRecoveryPoint(unit){
  const grid=ensureNavigationGrid();let closest=null,closestDistance=Infinity;
  for(const [key,cell] of grid.cells){
    if(!grid.walkable.has(key)||grid.blocked.has(key))continue;
    const point=new THREE.Vector3(cell.x,unit.position.y,cell.z);
    if(!navigationPointFullySupported(point,unit)||navigationPointPhysicallyBlocked(point,unit))continue;
    const distance=unit.position.distanceToSquared(point);if(distance<closestDistance){closest=point;closestDistance=distance;}
  }
  return closest;
}
function constrainActorToNavigation(actor){
  if(!actor?.visible||!actor.userData?.alive)return false;
  if(navigationPointFullySupported(actor.position,actor)&&!navigationPointPhysicallyBlocked(actor.position,actor))return false;
  const recovery=navigationRecoveryPoint(actor);if(!recovery)return false;
  actor.position.x=recovery.x;actor.position.z=recovery.z;actor.userData.velocity?.set(0,0,0);actor.userData.navigationPath=null;actor.userData.navigationYield=null;actor.userData.enemyRoamGoal=null;return true;
}
function navigationPathDesired(unit,desired,{goalKey=null,targetActor=null,allowPhysicalGoal=false}={}){
  const grid=ensureNavigationGrid();if(!grid.walkable.size)return navigationPointFullySupported(desired,unit)?desired:unit.position.clone();
  const identity=navigationGoalKey(desired,goalKey),existing=unit.userData.navigationPath,goalMoved=!existing?.goal||Math.hypot(existing.goal.x-desired.x,existing.goal.z-desired.z)>NAVIGATION_GOAL_REPATH_DISTANCE;
  const shouldRepath=!existing||existing.revision!==grid.revision||existing.identity!==identity||existing.targetActor!==targetActor||goalMoved||existing.failed&&totalTime>=existing.retryAt;
  if(shouldRepath){
    const blocked=navigationPathBlockedCells(unit,targetActor),route=findNavigationPath({start:unit.position,goal:desired,walkable:grid.walkable,blocked,dynamicCosts:navigationTrafficCosts(unit,targetActor),cellSize:grid.cellSize,offset:grid.offset,maxVisited:Math.max(8192,grid.walkable.size*2),nearestCellRadius:6});
    const directFallback=!route&&navigationPhysicalPathClear(unit.position,desired,unit);
    const directGoal=allowPhysicalGoal&&route?.goal&&navigationPointFullySupported(desired,unit)&&!navigationPointPhysicallyBlocked(desired,unit)&&navigationPhysicalPathClear(route.goal,desired,unit);
    unit.userData.navigationPath={revision:grid.revision,identity,targetActor,blocked,goal:{x:desired.x,z:desired.z},cells:route?.cells??[],index:0,arrival:route?.goal??null,directGoal:Boolean(directGoal),directFallback,failed:!route&&!directFallback,retryAt:totalTime+.42};
  }
  const path=unit.userData.navigationPath;if(!path||path.failed)return unit.position.clone();
  if(path.directFallback)return desired;
  while(path.index<path.cells.length){
    const cell=path.cells[path.index],cellKey=navigationCellKey(cell),worldCell=grid.cells.get(cellKey)??cell,waypoint=new THREE.Vector3(worldCell.x,desired.y,worldCell.z);
    if(unit.position.distanceToSquared(waypoint)<=NAVIGATION_WAYPOINT_REACHED*NAVIGATION_WAYPOINT_REACHED){path.index++;continue;}
    return waypoint;
  }
  if(path.directGoal||navigationPointWalkable(desired,unit,path.blocked))return desired;
  if(path.arrival){
    const arrival=new THREE.Vector3(path.arrival.x,desired.y,path.arrival.z);
    if(navigationPointWalkable(arrival,unit,path.blocked))return arrival;
  }
  return unit.position.clone();
}
function navigationYieldDesired(unit,desired,targetActor,routeKey){
  const existing=unit.userData.navigationYield;
  if(existing?.routeKey===routeKey&&existing.expiresAt>totalTime&&unit.position.distanceToSquared(existing.point)>NAVIGATION_WAYPOINT_REACHED*NAVIGATION_WAYPOINT_REACHED&&navigationPointWalkable(existing.point,unit))return existing.point;
  const obstacles=navigationLiveUnits().filter(other=>other!==unit&&other!==targetActor).map(other=>({x:other.position.x,z:other.position.z,radius:unitCollisionRadius(other)}));
  const detour=chooseLocalDetour({start:unit.position,goal:desired,obstacles,clearance:unitCollisionRadius(unit)+.08,lookAhead:1.8,preferLeft:(unit.id&1)===0});
  if(!detour){unit.userData.navigationYield=null;return desired;}
  const point=new THREE.Vector3(detour.x,desired.y,detour.z);if(!navigationPointWalkable(point,unit)){unit.userData.navigationYield=null;return desired;}
  unit.userData.navigationYield={point,routeKey,expiresAt:totalTime+NAVIGATION_YIELD_DURATION};return point;
}
function roamingDestination(unit,peers,{goalProperty,minimumTravelDistance,separation,duration,anchor=null,anchorRadius=Infinity}){
  const grid=ensureNavigationGrid(),previousGoal=unit.userData[goalProperty];
  const goalInsideAnchor=!anchor||Math.hypot(previousGoal?.x-anchor.x,previousGoal?.z-anchor.z)<=anchorRadius;
  const goalActive=previousGoal?.revision===grid.revision&&previousGoal.expiresAt>totalTime&&unit.position.distanceToSquared(previousGoal)>.32*.32&&goalInsideAnchor&&!navigationPointPhysicallyBlocked(previousGoal,unit);
  if(goalActive)return new THREE.Vector3(previousGoal.x,previousGoal.y,previousGoal.z);
  const occupied=[];
  for(const other of peers){
    if(other===unit)continue;
    occupied.push(other.position);
    const otherGoal=other.userData[goalProperty];
    if(otherGoal?.revision===grid.revision)occupied.push(otherGoal);
  }
  const candidates=[...grid.cells].filter(([cellKey,cell])=>!grid.blocked.has(cellKey)&&(!anchor||Math.hypot(cell.x-anchor.x,cell.z-anchor.z)<=anchorRadius)).map(([,cell])=>cell);
  const patrolGoal=choosePatrolGoal({
    origin:unit.position,candidates,recentGoal:previousGoal,occupied,roll:rand(),
    minimumTravelDistance,separation
  });
  if(!patrolGoal){unit.userData[goalProperty]=null;return unit.position.clone();}
  const goalY=walkableSupportHeightAt(patrolGoal.x,patrolGoal.z)??unit.position.y;
  unit.userData[goalProperty]={x:patrolGoal.x,y:goalY,z:patrolGoal.z,revision:grid.revision,expiresAt:totalTime+duration+rand()*2};
  unit.userData.navigationPath=null;unit.userData.navigationYield=null;
  return new THREE.Vector3(patrolGoal.x,goalY,patrolGoal.z);
}
function patrolGroupCenter(units,fallback){
  const members=units.filter(member=>member?.userData?.alive);
  return members.length?members.reduce((sum,member)=>sum.add(member.position),new THREE.Vector3()).multiplyScalar(1/members.length):fallback.clone();
}
function enemyRoamDestination(unit,livingEnemySoldiers){
  const anchor=enemyPackAnchor?.position??patrolGroupCenter(livingEnemySoldiers,unit.position);
  return roamingDestination(unit,livingEnemySoldiers,{goalProperty:"enemyRoamGoal",minimumTravelDistance:BARRACKS_ENEMY_PATROL_MIN_DISTANCE,separation:BARRACKS_ENEMY_PATROL_SEPARATION,duration:6,anchor,anchorRadius:EN_PATROL_ANCHOR_RADIUS});
}
function peacefulPatrolDestination(unit,allies){return roamingDestination(unit,allies,{goalProperty:"peacefulPatrolGoal",minimumTravelDistance:PEACEFUL_PATROL_MIN_DISTANCE,separation:PEACEFUL_PATROL_SEPARATION,duration:PEACEFUL_PATROL_DURATION});}
function peacefulPatrolActive(){return mode==="playing"&&!celebrationWinnerFaction&&!enemyRetreat;}
function clearPeacefulPatrols(){
  for(const unit of [master,...followers,...enemyUnits]){
    if(!unit?.userData)continue;
    unit.userData.peacefulPatrolGoal=null;
    unit.userData.groupPatrolGoal=null;unit.userData.groupPatrolPauseUntil=0;
    if(unit.userData.navigationPath?.identity?.startsWith("peaceful-patrol:")||unit.userData.navigationPath?.identity?.startsWith("group-patrol:"))unit.userData.navigationPath=null;
    unit.userData.navigationYield=null;
  }
}
function updatePeacefulPatrol(unit,allies,dt){
  const desired=peacefulPatrolDestination(unit,allies),distance=unit.position.distanceTo(desired),speed=distance>.08?actorPatrolSpeed(unit):0;
  steerTowards(unit,desired,speed,actorSteerAcceleration(unit,5.4),dt,{goalKey:`peaceful-patrol:${unit.id}`});
}
function clearBuildingAttackSlot(unit){
  const reservation=unit?.userData?.buildingAttackSlot;if(!reservation)return;
  reservation.building?.userData?.attackSlotOwners?.delete(reservation.index);unit.userData.buildingAttackSlot=null;
}
function clearBuildingAttackWaitSlot(unit){
  const reservation=unit?.userData?.buildingAttackWaitSlot;if(!reservation)return;
  reservation.building?.userData?.attackWaitSlotOwners?.delete(reservation.index);unit.userData.buildingAttackWaitSlot=null;
}
function clearBuildingAttackAssignments(unit){clearBuildingAttackSlot(unit);clearBuildingAttackWaitSlot(unit)}
function clearRaidBuildingAttackSlots(building){
  for(const unit of navigationLiveUnits()){
    if(unit.userData.buildingAttackSlot?.building===building)unit.userData.buildingAttackSlot=null;
    if(unit.userData.buildingAttackWaitSlot?.building===building)unit.userData.buildingAttackWaitSlot=null;
  }
  building?.userData?.attackSlotOwners?.clear?.();building?.userData?.attackWaitSlotOwners?.clear?.();
}
function raidBuildingAttackSlotClearance(unit){return unitCollisionRadius(unit)+RAID_BUILDING_ATTACK_SLOT_BUFFER}
function raidBuildingAttackSlotApproach(point,footprint,axis,sign){const normal=axis==="x"?{x:sign,z:0}:{x:0,z:sign},cosine=Math.cos(footprint.rotation),sine=Math.sin(footprint.rotation);return new THREE.Vector3(point.x+(cosine*normal.x+sine*normal.z)*RAID_BUILDING_ATTACK_APPROACH_DISTANCE,GROUND_Y,point.z+(-sine*normal.x+cosine*normal.z)*RAID_BUILDING_ATTACK_APPROACH_DISTANCE)}
function cloneRaidBuildingAttackSlot(slot){const destination=slot.clone();if(slot.attackApproach)destination.attackApproach=slot.attackApproach.clone();return destination}
function raidBuildingAttackMoveDestination(unit,slot){const approach=slot?.attackApproach;return approach&&unit.position.distanceToSquared(approach)>NAVIGATION_WAYPOINT_REACHED*NAVIGATION_WAYPOINT_REACHED?approach:slot}
function raidBuildingAttackSlots(building,unit=null){
  ensureNavigationGrid();
  const clearance=raidBuildingAttackSlotClearance(unit),current=building.userData.attackSlots;if(current?.revision===navigationGrid.revision&&Math.abs((current.clearance??0)-clearance)<.001)return current.slots;
  const spacing=.68,slots=[],footprints=raidBuildingCollisionFootprints(building),candidates=[],unitClearance=Math.max(0,clearance-RAID_BUILDING_ATTACK_SLOT_BUFFER);
  const addFootprintSide=(footprint,axis,sign,length)=>{
    const count=Math.max(1,Math.ceil(length/spacing)),span=Math.max(length,spacing*count),cosine=Math.cos(footprint.rotation),sine=Math.sin(footprint.rotation);
    for(let index=0;index<count;index++){
      const value=-span*.5+(index+.5)*span/count,local=axis==="x"?{x:sign*(footprint.half.x+clearance),z:value}:{x:value,z:sign*(footprint.half.z+clearance)},point=new THREE.Vector3(footprint.x+cosine*local.x+sine*local.z,GROUND_Y,footprint.z-sine*local.x+cosine*local.z),approach=raidBuildingAttackSlotApproach(point,footprint,axis,sign);
      if(!footprints.some(other=>navigationObstacleContains(point,other,unitClearance)||navigationObstacleContains(approach,other,unitClearance))){point.attackApproach=approach;candidates.push(point);}
    }
  };
  for(const footprint of footprints){addFootprintSide(footprint,"x",-1,footprint.half.z*2);addFootprintSide(footprint,"x",1,footprint.half.z*2);addFootprintSide(footprint,"z",-1,footprint.half.x*2);addFootprintSide(footprint,"z",1,footprint.half.x*2);}
  for(const point of candidates)if(!slots.some(slot=>slot.distanceToSquared(point)<spacing*spacing*.55))slots.push(point);
  building.userData.attackSlots={revision:navigationGrid.revision,clearance,slots};building.userData.attackSlotOwners??=new Map();return slots;
}
function raidBuildingAttackSlotWalkable(slot,unit){return navigationPointFullySupported(slot,unit)&&!navigationPointPhysicallyBlocked(slot,unit)}
function pruneRaidBuildingAttackWaitOwners(building){
  const owners=building.userData.attackWaitSlotOwners??=new Map();
  for(const [index,unit] of owners){
    const reservation=unit?.userData?.buildingAttackWaitSlot;
    if(!unit?.visible||!unit.userData?.alive||reservation?.building!==building||reservation.index!==index)owners.delete(index);
  }
  return owners;
}
function raidBuildingAttackWaitPoint(building,index){
  const half=raidBuildingCollisionHalf(building),ring=Math.floor(index/RAID_BUILDING_WAIT_SLOTS_PER_RING),slot=index%RAID_BUILDING_WAIT_SLOTS_PER_RING,radius=Math.hypot(half.x,half.z)+RAID_BUILDING_WAIT_CLEARANCE+ring*RAID_BUILDING_WAIT_RING_GAP,angle=slot/RAID_BUILDING_WAIT_SLOTS_PER_RING*Math.PI*2+(ring%2?Math.PI/RAID_BUILDING_WAIT_SLOTS_PER_RING:0);
  return raidBuildingWorldPoint(building,{x:Math.cos(angle)*radius,z:Math.sin(angle)*radius});
}
function raidBuildingAttackWaitDestination(unit,building){
  const owners=pruneRaidBuildingAttackWaitOwners(building),reservation=unit.userData.buildingAttackWaitSlot;
  if(reservation?.building===building){
    const point=raidBuildingAttackWaitPoint(building,reservation.index);point.y=unit.position.y;
    if(navigationPointWalkable(point,unit))return point;
    clearBuildingAttackWaitSlot(unit);
  }else if(reservation)clearBuildingAttackWaitSlot(unit);
  const candidates=[],limit=Math.max(RAID_BUILDING_WAIT_SLOTS_PER_RING*4,owners.size+RAID_BUILDING_WAIT_SLOTS_PER_RING);
  for(let index=0;index<limit;index++){
    if(owners.has(index))continue;
    const point=raidBuildingAttackWaitPoint(building,index);point.y=unit.position.y;
    if(navigationPointWalkable(point,unit))candidates.push({index,point});
  }
  if(!candidates.length)return unit.position.clone();
  candidates.sort((first,second)=>unit.position.distanceToSquared(first.point)-unit.position.distanceToSquared(second.point));const selected=candidates[0];owners.set(selected.index,unit);unit.userData.buildingAttackWaitSlot={building,index:selected.index,queuedAt:totalTime};return selected.point;
}
function raidBuildingAttackQueueLeader(building){
  return [...pruneRaidBuildingAttackWaitOwners(building).values()].sort((left,right)=>{
    const leftQueued=left.userData.buildingAttackWaitSlot?.queuedAt??Infinity,rightQueued=right.userData.buildingAttackWaitSlot?.queuedAt??Infinity;
    return leftQueued-rightQueued||left.id-right.id;
  })[0]??null;
}
function raidBuildingAttackSlotDestination(unit,building){
  const slots=raidBuildingAttackSlots(building,unit),reachableSlots=slots.map((slot,index)=>({slot,index})).filter(({slot})=>raidBuildingAttackSlotWalkable(slot,unit)),slotsByIndex=new Map(reachableSlots.map(entry=>[entry.index,entry.slot])),owners=building.userData.attackSlotOwners??=new Map(),reservation=unit.userData.buildingAttackSlot;
  for(const [index,owner] of owners)if(!owner?.userData?.alive||owner.userData.buildingAttackSlot?.building!==building||owner.userData.buildingAttackSlot?.index!==index||!slotsByIndex.has(index)){if(owner?.userData?.buildingAttackSlot?.building===building&&owner.userData.buildingAttackSlot.index===index)owner.userData.buildingAttackSlot=null;owners.delete(index);}
  if(reservation?.building===building&&slotsByIndex.has(reservation.index)){clearBuildingAttackWaitSlot(unit);return {state:"attack",destination:cloneRaidBuildingAttackSlot(slotsByIndex.get(reservation.index))};}
  clearBuildingAttackSlot(unit);if(unit.userData.buildingAttackWaitSlot?.building!==building)clearBuildingAttackWaitSlot(unit);
  const available=reachableSlots.filter(({index})=>!owners.has(index)),queueLeader=raidBuildingAttackQueueLeader(building);
  if(!available.length||queueLeader&&queueLeader!==unit)return {state:"waiting",destination:raidBuildingAttackWaitDestination(unit,building)};
  available.sort((first,second)=>unit.position.distanceToSquared(first.slot)-unit.position.distanceToSquared(second.slot));const selected=available[0];clearBuildingAttackWaitSlot(unit);owners.set(selected.index,unit);unit.userData.buildingAttackSlot={building,index:selected.index};return {state:"attack",destination:cloneRaidBuildingAttackSlot(selected.slot)};
}
function reserveRaidBuildingAssignments(units){
  const buildings=activeRaidBuildings();
  for(const unit of units){
    if(!unit?.userData?.alive||unit.userData.lockedTarget?.userData?.alive||unit.userData.manualMoving){clearBuildingAttackAssignments(unit);continue;}
    const building=nearestAlive(unit,buildings);if(!building){clearBuildingAttackAssignments(unit);continue;}
    raidBuildingAttackSlotDestination(unit,building);
  }
}
function raidBuildingDebris(building,count=4){
  const colour=new THREE.Color(building.userData.editorMaterialColor??"#d8ddcc"),palette=[colour.getHex(),colour.clone().multiplyScalar(.72).getHex(),colour.clone().lerp(new THREE.Color(0xffffff),.24).getHex()];
  for(let index=0;index<count;index++){
    if(!particleBudgetAllows(activeTransientParticleCount(),MAX_ACTIVE_PARTICLES))break;
    let particle=particles.find(item=>!item.visible&&item.userData.kind==="building-hit");if(!particle){particle=new THREE.Mesh(new THREE.BoxGeometry(.1,.1,.1),mat(palette[0],.9));particle.userData.kind="building-hit";particles.push(particle);battle.add(particle);}
    const size=.045+rand()*.1,angle=rand()*Math.PI*2,speed=.7+rand()*2.2;particle.material.color.setHex(palette[index%palette.length]);particle.position.copy(building.position).add(new THREE.Vector3((rand()-.5)*2.5,.35+rand()*2.5,(rand()-.5)*2.5));particle.scale.setScalar(size/.1);particle.rotation.set(rand()*Math.PI,rand()*Math.PI,rand()*Math.PI);particle.userData.life=.7+rand()*.35;particle.userData.maxLife=particle.userData.life;particle.userData.vel=new THREE.Vector3(Math.cos(angle)*speed,.8+rand()*2.6,Math.sin(angle)*speed);particle.userData.spin=new THREE.Vector3((rand()-.5)*15,(rand()-.5)*15,(rand()-.5)*15);particle.visible=true;
  }
}
function destroyRaidBuilding(building){
  if(!building.userData.alive)return;clearRaidBuildingAttackSlots(building);building.userData.alive=false;building.userData.hp=0;showRaidBuildingHealth(building);raidBuildingDebris(building,12);building.visible=false;invalidateNavigation();
}
function attackRaidBuilding(attacker,building,dt,contact=false){
  if(!attacker?.userData?.alive||!building?.userData?.alive)return false;
  const cooldown=Math.max(0,(attacker.userData.buildingAttackCooldown??0)-dt);attacker.userData.buildingAttackCooldown=cooldown;
  const distance=raidBuildingSurfaceDistance(attacker.position,building);if(cooldown>0||distance>RAID_BUILDING_ATTACK_RANGE)return false;
  if(!contact&&queueCharacterStrike(attacker,()=>{if(!attacker.userData.lockedTarget&&!attacker.userData.manualMoving&&attacker.userData.buildingAttackSlot?.building===building)attackRaidBuilding(attacker,building,0,true)}))return true;
  attacker.userData.buildingAttackCooldown=.62+rand()*.18;attacker.userData.attackAnim=1;const previousHealth=building.userData.hp;building.userData.hp=Math.max(0,building.userData.hp-attacker.userData.attack);showRaidBuildingHealth(building,previousHealth);raidBuildingDebris(building);shake=reducedMotion?0:.055;if(building.userData.hp<=0)destroyRaidBuilding(building);return true;
}
function updateRaidBuildingCombat(units,dt){
  const buildings=activeRaidBuildings();if(!buildings.length)return;
  for(const unit of units){
    if(!unit?.userData?.alive){clearBuildingAttackAssignments(unit);continue;}
    if(unit.userData.lockedTarget?.userData?.alive||unit.userData.manualMoving){clearBuildingAttackAssignments(unit);continue;}
    const building=nearestAlive(unit,buildings);if(!building){clearBuildingAttackAssignments(unit);continue;}
    const buildingDistance=raidBuildingSurfaceDistance(unit.position,building);
    const assignment=raidBuildingAttackSlotDestination(unit,building),destination=assignment.destination,movementDestination=raidBuildingAttackMoveDestination(unit,destination),directIngress=assignment.state==="attack"&&navigationPhysicalPathClear(unit.position,destination,unit);destination.y=unit.position.y;movementDestination.y=unit.position.y;
    if(assignment.state==="waiting")steerTowards(unit,destination,2.1*editorActorMoveScale(unit),actorSteerAcceleration(unit,5.2),dt,{goalKey:`building:${building.id}:wait:${unit.userData.buildingAttackWaitSlot?.index??unit.id}`,targetActor:building});else if(buildingDistance<=RAID_BUILDING_ATTACK_RANGE){unit.userData.velocity.set(0,0,0);attackRaidBuilding(unit,building,dt);}else if(directIngress)steerStraightTowards(unit,destination,2.35*editorActorMoveScale(unit),actorSteerAcceleration(unit,5.8),dt);else if(movementDestination!==destination)steerTowards(unit,movementDestination,2.35*editorActorMoveScale(unit),actorSteerAcceleration(unit,5.8),dt,{goalKey:`building:${building.id}:slot:${unit.userData.buildingAttackSlot?.index??unit.id}:approach`,targetActor:building,allowPhysicalGoal:true});else steerTowards(unit,destination,2.35*editorActorMoveScale(unit),actorSteerAcceleration(unit,5.8),dt,{goalKey:`building:${building.id}:slot:${unit.userData.buildingAttackSlot?.index??unit.id}`,targetActor:building,allowPhysicalGoal:true});
    const facing=building.position.clone().sub(unit.position);if(facing.lengthSq()>.001)unit.rotation.y=smoothAngle(unit.rotation.y,Math.atan2(facing.x,facing.z),12,dt);
  }
}
// The player starts with a reserve rather than a piece already on the field.
// `master` stays as an invisible camera/navigation fallback while the active
// player roster is held entirely in `followers`.
master=makeMaster();master.visible=false;master.userData.alive=false;master.position.set(0,GROUND_Y,0);target.copy(master.position);

// `master` remains a legacy variable name, but in the soldiers-only ruleset it
// has no special gameplay authority. These helpers keep camera, spawning, and
// floor streaming centered on the living army rather than that one actor.
function livingPlayerUnits(){
  return [master,...followers].filter(unit=>unit?.visible&&unit.userData?.alive);
}
function playerFocus(){
  return livingPlayerUnits()[0]??master;
}
function activatePlacedCharacterEncounter({engageImmediately=false}={}){
  const livingPlayers=followers.filter(unit=>unit?.parent===battle&&unit.visible&&unit.userData?.alive);
  const livingEnemies=enemyUnits.filter(unit=>unit?.parent===battle&&unit.visible&&unit.userData?.alive&&!isBarracksDeparting(unit));
  const forceSoldierEngagement=engageImmediately||deploymentStarted;
  if(!livingPlayers.length||!livingEnemies.length)return false;
  if(activeEncounter&&!activeEncounter.done){
    if(forceSoldierEngagement){activeEncounter.aggro=true;activeEncounter.forceSoldierEngagement=true;}
    return false;
  }
  const enemyCenter=livingEnemies.reduce((sum,unit)=>sum.add(unit.position),new THREE.Vector3()).multiplyScalar(1/livingEnemies.length);enemyCenter.y=GROUND_Y;
  const playerCenter=livingPlayers.reduce((sum,unit)=>sum.add(unit.position),new THREE.Vector3()).multiplyScalar(1/livingPlayers.length);playerCenter.y=GROUND_Y;
  const forward=playerCenter.sub(enemyCenter).setY(0);if(forward.lengthSq()<.001)forward.set(0,0,1);else forward.normalize();
  enemyPackAnchor={position:enemyCenter.clone(),forward,velocity:new THREE.Vector3()};
  activeEncounter={regionId:selectedRegion,faction:FACTION.AMBER,totalServants:livingEnemies.length,aggro:forceSoldierEngagement,forceSoldierEngagement,done:false,victoryResolved:false,wave:0,swarmCount:1,threatBudget:livingEnemies.length,formationSpread:1};
  return true;
}
function detachActorFromCombat(object){
  if(!object?.userData)return false;
  const combatants=[master,...followers,...enemyUnits].filter(Boolean);
  for(const unit of combatants){
    if(unit===object)continue;
    if(unit.userData.lockedTarget===object||unit.userData.waitingDuelTarget===object){
      resetDuel(unit);unit.userData.seekingTarget=false;
    }
    if(unit.userData.commanderTarget===object)unit.userData.commanderTarget=null;
  }
  resetDuel(object);object.userData.seekingTarget=false;object.userData.commanderTarget=null;object.userData.manualMoving=false;object.userData.manualTarget=null;
  object.userData.alive=false;object.userData.velocity?.set(0,0,0);object.visible=false;
  for(const roster of [followers,enemyUnits])for(let index=roster.length-1;index>=0;index--)if(roster[index]===object)roster.splice(index,1);
  return true;
}
function detachEditorActorFromCombat(object){
  return object?.userData?.editorActor?detachActorFromCombat(object):false;
}
function rebuildPlacedCharacterEncounter({prepareBarracksInteriors=false}={}){
  const attached=unit=>unit?.parent===battle&&unit.visible&&unit.userData?.alive;
  followers=followers.filter(attached);enemyUnits=enemyUnits.filter(attached);
  for(const unit of [...followers,...enemyUnits]){
    resetDuel(unit);unit.userData.seekingTarget=false;unit.userData.commanderTarget=null;
  }
  if(prepareBarracksInteriors)beginAuthoredBarracksDepartures();
  activeEncounter=null;enemyPackAnchor=null;wasCombat=false;defeatCinematic=null;
  activatePlacedCharacterEncounter();
}
function removeUnplacedEnemyActors(options={}){
  for(const enemy of [...enemyUnits])if(!enemy.userData?.editorActor){detachActorFromCombat(enemy);battle.remove(enemy)}
  rebuildPlacedCharacterEncounter(options);
}

const spawnFrustum=new THREE.Frustum(),spawnProjection=new THREE.Matrix4(),spawnSphere=new THREE.Sphere(new THREE.Vector3(),3.6);
function waveSpawnIsVisible(point){
  camera.updateMatrixWorld(true);
  spawnProjection.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse);
  spawnFrustum.setFromProjectionMatrix(spawnProjection);
  spawnSphere.center.set(point.x,.8,point.z);
  return spawnFrustum.intersectsSphere(spawnSphere);
}
function offscreenWaveSpawn(baseAngle=rand()*Math.PI*2,avoid=[]){
  const focus=playerFocus();
  for(let ring=0;ring<6;ring++){
    const candidates=[];
    for(let i=0;i<16;i++)candidates.push(hiddenWaveSpawn(focus.position,baseAngle+i*Math.PI/8,27+ring*12+(i%3)*3));
    const separated=candidates.filter(candidate=>avoid.every(point=>Math.hypot(candidate.x-point.x,candidate.z-point.z)>=18));
    const hidden=chooseHiddenSpawn(focus.position,separated,27,waveSpawnIsVisible);
    if(hidden)return hidden;
  }
  const behindCamera=new THREE.Vector3().subVectors(camera.position,focus.position).setY(0);
  if(behindCamera.lengthSq()<.001)behindCamera.set(1,0,0);
  behindCamera.normalize().multiplyScalar(96).add(focus.position);
  if(avoid.some(point=>Math.hypot(behindCamera.x-point.x,behindCamera.z-point.z)<18)){
    const side=new THREE.Vector3(-behindCamera.z+focus.position.z,0,behindCamera.x-focus.position.x).normalize().multiplyScalar(28);
    behindCamera.add(side);
  }
  return {x:behindCamera.x,z:behindCamera.z};
}
function enemyPackFormationPoint(anchor,index,count,expansionProgress=0){
  const base=centeredPackOffset(index,count,1.28);
  const expansion=formationExpansionOffset(index,count,expansionProgress,3);
  const offset={lateral:base.lateral+expansion.lateral,forward:base.forward+expansion.forward};
  const forward=anchor.forward.clone().setY(0);
  if(forward.lengthSq()<.001)forward.set(0,0,1);else forward.normalize();
  const lateral=new THREE.Vector3(-forward.z,0,forward.x);
  return anchor.position.clone().addScaledVector(lateral,offset.lateral).addScaledVector(forward,offset.forward);
}
function configuredWaveCount(waveIndex){return PRACTICE_CONFIG.waveCounts[waveIndex]??null}
function hasRemainingConfiguredWave(startIndex=waveNumber){return PRACTICE_CONFIG.waveCounts.slice(startIndex).some(count=>count>0)}
function scheduleNextWave(){nextWaveTimer=0}
function spawnWave(){
  while(configuredWaveCount(waveNumber)===0)waveNumber++;
  const count=configuredWaveCount(waveNumber);
  if(count==null){nextWaveTimer=0;return false}
  enemyUnits.forEach(u=>battle.remove(u)); enemyUnits=[];
  waveNumber++;
  commanderHearts=3;updateHearts();
  const faction=waveNumber%2?FACTION.CORAL:FACTION.AMBER;
  const baseAngle=rand()*Math.PI*2;
  const circularArrival=count>2;
  const spawnPoints=[];
  for(let i=0;i<count;i++){
    const angle=enemyWaveApproachAngle(i,count,baseAngle);
    const spawn=offscreenWaveSpawn(angle,spawnPoints);
    spawnPoints.push(spawn);
    if(!circularArrival)break;
  }
  const center=spawnPoints.reduce((sum,point)=>sum.add(new THREE.Vector3(point.x,GROUND_Y,point.z)),new THREE.Vector3()).multiplyScalar(1/spawnPoints.length);
  const approach=playerFocus().position.clone().sub(center).setY(0).normalize();
  enemyPackAnchor={position:center.clone(),forward:approach.clone(),velocity:new THREE.Vector3()};
  const healthMultiplier=practiceEnemyHealthMultiplier(waveNumber);
  const placementSeed=rand();
  for(let i=0;i<count;i++){
    const u=makeUnit(faction);
    u.userData.maxHp*=healthMultiplier;u.userData.hp=u.userData.maxHp;
    const spawn=spawnPoints[circularArrival?i:0],origin=new THREE.Vector3(spawn.x,GROUND_Y,spawn.z);
    const localApproach=playerFocus().position.clone().sub(origin).setY(0).normalize();
    const lateral=new THREE.Vector3(-localApproach.z,0,localApproach.x);
    const offset=circularArrival?{lateral:0,forward:0}:spawnPackOffset(i,count,placementSeed);
    u.position.copy(origin).addScaledVector(lateral,offset.lateral).addScaledVector(localApproach,offset.forward);
    u.position.y=GROUND_Y;u.userData.leader=null;battle.add(u);enemyUnits.push(u);
  }
  activeEncounter={regionId:selectedRegion,faction,totalServants:count,aggro:false,done:false,victoryResolved:false,wave:waveNumber,swarmCount:1,threatBudget:count,formationSpread:1};
  return true;
}
const restoredLevelLayout=restoreLevelLayout();
if(!restoredLevelLayout){
  addWorldFloor();
  addSampleTreeClusters();
  addArcherTower({x:11,z:-3});
  ensureDefaultHudWidgets();
  ensureDefaultHudText();
}else{
  const addedHudWidgets=!savedLevelState?.hudLayoutSeeded&&ensureDefaultHudWidgets(),addedHudText=!savedLevelState?.hudTextSeeded&&ensureDefaultHudText();
  if(addedHudWidgets||addedHudText)saveLevelLayout();
}
if(!savedLevelCamera)savedLevelCamera=levelCameraFrame({x:0,z:0,scale:1},{minScale:EDITOR_ZOOM_MIN,maxScale:EDITOR_ZOOM_MAX});
if(!savedLevelState)rememberLevelState({assets:editorObjects.map(levelAssetRecord).filter(Boolean),camera:savedLevelCamera,hudLayoutSeeded:true,hudTextSeeded:true});

function disposePlaytestParticle(particle){
  battle.remove(particle);particle.geometry?.dispose?.();
  const materials=Array.isArray(particle.material)?particle.material:[particle.material];
  for(const material of materials)material?.dispose?.();
}
function resetPlaytestToSavedLevel(){
  if(!savedLevelState)return false;
  clearTacticalSelection();selectEditorObject(null);removeEditorCameraObject();clearCommandGrid();
  for(const particle of particles)disposePlaytestParticle(particle);
  for(const marker of tombstones)battle.remove(marker);
  for(const object of new Set([...editorObjects,...followers,...enemyUnits]))battle.remove(object);
  particles=[];tombstones=[];followers=[];enemyUnits=[];editorObjects.length=0;editorFoliageObjects.clear();worldFloor=null;invalidateNavigation();
  activeEncounter=null;enemyPackAnchor=null;enemyRetreat=null;defeatCinematic=null;celebrationWinnerFaction=null;nextWaveTimer=0;waveNumber=0;wasCombat=false;
  companyAnchors.clear();playerCompanies=[];companyLayoutDirty=true;selectedCompanyId=null;selectedCommander=null;commandHoverCell=null;
  campaign=makeCampaign();selectedRegion=2;deploymentReserves=configuredDeploymentReserves();deploymentArchetypeId=null;deploymentPlacementReady=false;deploymentPreviewOccupancySignature="";deploymentStarted=false;
  commanderHearts=3;masterHealth=INDEPENDENT_SOLDIERS?32:PLAYER_COMMANDER.maxHealth;sinceDamage=99;damagePulse=0;damageStacks=0;shake=0;totalTime=0;interfaceTime=0;rngState=0xC0FFEE;
  master.visible=false;master.userData.alive=false;master.userData.falling=false;master.userData.verticalVelocity=0;master.userData.velocity.set(0,0,0);master.position.set(0,GROUND_Y,0);resetDuel(master);target.copy(master.position);
  savedLevelCamera=levelCameraFrame(savedLevelState.camera,{minScale:EDITOR_ZOOM_MIN,maxScale:EDITOR_ZOOM_MAX});
  if(savedLevelCamera){
    gameplayCameraFocus.set(savedLevelCamera.x,0,savedLevelCamera.z);gameplayCameraScale=savedLevelCamera.scale;gameplayCameraBaselineScale=savedLevelCamera.scale;
  }
  for(const record of savedLevelState.assets)addLevelAsset(record);
  rebuildPlacedCharacterEncounter({prepareBarracksInteriors:true});battle.visible=true;overview.visible=false;overview.clear();
  $("map-panel")?.classList.add("hidden");$("end-screen")?.classList.add("hidden");updateHearts();updateStats();return true;
}

function formationSlot(i,count,leaderPos,forward,spread=0){
  const heading=Math.atan2(forward.x,forward.z), ring=Math.floor(i/8), slot=i%8;
  const ringCount=Math.min(8,count-ring*8), radius=1.65+ring*1.15+spread*.42;
  const angle=heading+slot/ringCount*Math.PI*2+(ring%2)*Math.PI/ringCount;
  return leaderPos.clone().add(new THREE.Vector3(Math.sin(angle)*radius,0,Math.cos(angle)*radius));
}
function travelFormationSlot(i,count,leaderPos,forward){
  const offset=swarmTravelOffset(i,count);
  const direction=forward.clone().setY(0);
  if(direction.lengthSq()<.001)direction.set(0,0,-1);else direction.normalize();
  const lateral=new THREE.Vector3(-direction.z,0,direction.x);
  return leaderPos.clone().addScaledVector(lateral,offset.lateral).addScaledVector(direction,-offset.trailing);
}
function observedLeader(unit,leader,leaderForward,dt,urgent=false){
  const data=unit.userData;
  if(!data.followAnchor){data.followAnchor=leader.position.clone();data.followForward=leaderForward.clone();data.followState=FOLLOW_AWARENESS.HOLDING;data.followTimer=0}
  const moved=data.followAnchor.distanceTo(leader.position);
  const next=advanceFollowAwareness({state:data.followState,moved,threshold:data.followThreshold,timer:data.followTimer,responseDelay:data.responseDelay,dt,urgent});
  data.followState=next.state;data.followTimer=next.timer;
  if(next.updateAnchor){
    const alpha=urgent?1:1-Math.exp(-data.trackingRate*dt);
    data.followAnchor.lerp(leader.position,alpha);data.followForward.lerp(leaderForward,alpha).normalize();
  }
  if(data.followState===FOLLOW_AWARENESS.TRACKING&&leader.userData.velocity.lengthSq()<.01&&moved<.1)data.followState=FOLLOW_AWARENESS.HOLDING;
  return {position:data.followAnchor,forward:data.followForward};
}
function updateEnemyPackAnchor(livingSoldiers,{combat,preparingForContact,dt}){
  if(!livingSoldiers.length)return;
  if(!deploymentStarted||!livingPlayerUnits().length){
    enemyPackAnchor??={position:new THREE.Vector3(),forward:new THREE.Vector3(0,0,1),velocity:new THREE.Vector3()};
    enemyPackAnchor.velocity.set(0,0,0);return;
  }
  const centroid=livingSoldiers.reduce((sum,soldier)=>sum.add(soldier.position),new THREE.Vector3()).multiplyScalar(1/livingSoldiers.length);
  centroid.y=GROUND_Y;
  if(!enemyPackAnchor)enemyPackAnchor={position:centroid.clone(),forward:new THREE.Vector3(0,0,1),velocity:new THREE.Vector3()};
  if(combat){
    enemyPackAnchor.position.lerp(centroid,1-Math.exp(-1.8*dt));
    enemyPackAnchor.velocity.multiplyScalar(Math.exp(-7*dt));
    return;
  }
  const advance=playerFocus().position.clone().sub(enemyPackAnchor.position).setY(0);
  const distance=advance.length();
  if(distance>.001){
    advance.normalize();
    enemyPackAnchor.forward.lerp(advance,1-Math.exp(-3.4*dt)).normalize();
  }
  const targetSpeed=distance>4.8?(preparingForContact?.78:1.12):0;
  const desiredVelocity=enemyPackAnchor.forward.clone().multiplyScalar(targetSpeed);
  enemyPackAnchor.velocity.lerp(desiredVelocity,1-Math.exp(-3.8*dt));
  enemyPackAnchor.position.addScaledVector(enemyPackAnchor.velocity,dt);
  enemyPackAnchor.position.y=GROUND_Y;
}
function nearestAlive(from,list){const origin=from.position??from;let best=null,bd=Infinity;for(const u of list){if(!u.userData.alive)continue;const d=origin.distanceToSquared(u.position);if(d<bd){bd=d;best=u}}return best}
function assignCommanderTargets(commanders,opponents,preferCommander){
  const targets=new Map(),loads=opponents.map(()=>0);
  for(const commander of commanders){
    const currentIndex=opponents.indexOf(commander.userData.commanderTarget);
    let index=currentIndex>=0&&loads[currentIndex]===0?currentIndex:-1;
    if(index<0)index=chooseCommanderTargetIndex({
      commander:commander.position,
      opponents:opponents.map(opponent=>({x:opponent.position.x,z:opponent.position.z,alive:opponent.userData.alive,isCommander:!!opponent.userData.isMaster})),
      targetLoads:loads,
      preferCommander:preferCommander(commander)
    });
    const targetActor=index>=0?opponents[index]:null;
    commander.userData.commanderTarget=targetActor;
    if(targetActor){targets.set(commander,targetActor);loads[index]++}
  }
  return targets;
}
function commanderRoute(attacker,targetActor){
  const pursuit=standOffPursuitPoint(attacker.position,targetActor.position,.94,.1);
  return new THREE.Vector3(pursuit.x,GROUND_Y,pursuit.z);
}
function resetDuel(unit){
  unit.userData.lockedTarget=null;unit.userData.duelRole=null;unit.userData.lungeAxis=null;unit.userData.nextTargetReviewAt=null;
  unit.userData.duelTurnId=null;unit.userData.waitingDuelTarget=null;
  clearBuildingAttackAssignments(unit);unit.userData.navigationPath=null;unit.userData.navigationYield=null;unit.userData.duelPhase=null;unit.userData.duelTimer=0;unit.userData.pathPreviousDistance=Infinity;unit.userData.pathStallTimer=0;unit.userData.pathFailures=0;unit.userData.pathRecoveryAttempts=0;unit.userData.pathRouteRevision=0;unit.scale.set(1,1,1);
}
function releaseStaleDuel(unit){
  const foe=unit.userData.lockedTarget;
  resetDuel(unit);unit.userData.seekingTarget=false;
  if(foe?.userData.lockedTarget===unit){resetDuel(foe);foe.userData.seekingTarget=false}
}
function avoidBlockedDuelAndReassign(unit){
  const foe=unit.userData.lockedTarget;
  const avoidUntil=totalTime+2.2;
  releaseStaleDuel(unit);
  if(!foe)return;
  unit.userData.avoidTarget=foe;unit.userData.avoidTargetUntil=avoidUntil;
  foe.userData.avoidTarget=unit;foe.userData.avoidTargetUntil=avoidUntil;
}
function reviewEnemyDuelTarget(unit,foe,candidates){
  const data=unit.userData;
  const mutualLock=foe?.userData.lockedTarget===unit;
  if(!foe?.userData.alive||mutualLock||!enemyTargetReviewDue({now:totalTime,nextReviewAt:data.nextTargetReviewAt}))return foe;
  data.nextTargetReviewAt=totalTime+ENEMY_TARGET_REVIEW_INTERVAL;
  let alternative=null,alternativeDistance=Infinity;
  for(const candidate of candidates){
    if(candidate===foe||!candidate.userData.alive||candidate.userData.lockedTarget||isAvoidingDuelTarget(unit,candidate))continue;
    const distance=unit.position.distanceTo(candidate.position);
    if(distance<alternativeDistance){alternative=candidate;alternativeDistance=distance}
  }
  const currentDistance=unit.position.distanceTo(foe.position);
  if(!alternative||!shouldRetargetToCloserOpponent({phase:data.duelPhase,currentDistance,candidateDistance:alternativeDistance,mutualLock}))return foe;
  releaseStaleDuel(unit);
  lockDuel(unit,alternative);lockDuel(alternative,unit);
  const firstAttacker=((unit.id+alternative.id)&1)===0?unit:alternative;
  unit.userData.duelTurnId=firstAttacker.id;alternative.userData.duelTurnId=firstAttacker.id;
  return alternative;
}
function isAvoidingDuelTarget(unit,foe){
  if(unit.userData.avoidTargetUntil<=totalTime){unit.userData.avoidTarget=null;unit.userData.avoidTargetUntil=0;return false}
  return unit.userData.avoidTarget===foe;
}
function duelPathNeedsRelock(unit,desired,foe,dt){
  const strikeRange=foe?.userData.isMaster?1.4:1.15;
  const inAttackProximity=!!foe?.userData.alive&&unit.position.distanceTo(foe.position)<=strikeRange+.4;
  if(unit.userData.duelPhase!==DUEL_PHASE.APPROACH||inAttackProximity){
    unit.userData.pathPreviousDistance=Infinity;unit.userData.pathStallTimer=0;unit.userData.pathFailures=0;unit.userData.pathRecoveryAttempts=0;return false;
  }
  const state=advancePathFailure({
    previousDistance:unit.userData.pathPreviousDistance,distance:unit.position.distanceTo(desired),
    timer:unit.userData.pathStallTimer??0,failures:unit.userData.pathFailures??0,dt
  });
  unit.userData.pathPreviousDistance=state.previousDistance;unit.userData.pathStallTimer=state.timer;unit.userData.pathFailures=state.failures;
  if(state.failures===0)unit.userData.pathRecoveryAttempts=0;
  const action=duelPathFailureAction({
    relock:state.relock,mutualLock:foe?.userData.lockedTarget===unit,targetAlive:!!foe?.userData.alive,targetOnFloor:!!foe&&actorSupportHeight(foe)!==null,recoveryAttempts:unit.userData.pathRecoveryAttempts??0
  });
  if(action==="reroute"){
    unit.userData.pathRecoveryAttempts=(unit.userData.pathRecoveryAttempts??0)+1;unit.userData.pathRouteRevision=(unit.userData.pathRouteRevision??0)+1;unit.userData.navigationPath=null;unit.userData.navigationYield=null;
    unit.userData.pathPreviousDistance=Infinity;unit.userData.pathStallTimer=0;unit.userData.pathFailures=0;
  }
  return action==="release";
}
function lockDuel(unit,foe){
  if(unit.userData.lockedTarget===foe&&unit.userData.duelRole==="primary")return;
  clearBuildingAttackAssignments(unit);unit.userData.lockedTarget=foe;unit.userData.waitingDuelTarget=null;unit.userData.duelRole="primary";
  unit.userData.enemyRoamGoal=null;unit.userData.barracksAnchor=null;unit.userData.barracksAnchorSlot=null;unit.userData.nextTargetReviewAt=totalTime+ENEMY_TARGET_REVIEW_INTERVAL;
  unit.userData.seekingTarget=false;
  unit.userData.duelPhase=DUEL_PHASE.APPROACH;unit.userData.duelTimer=0;
}
function assignEngagements(sideA,sideB){
  const a=sideA.filter(u=>u.userData.alive),b=sideB.filter(u=>u.userData.alive),aMap=new Map(),bMap=new Map();
  for(const unit of a){
    const foe=unit.userData.lockedTarget;
    const valid=canMaintainSoldierDuel({unitAlive:unit.userData.alive,targetAlive:foe?.userData.alive,mutualLock:foe?.userData.lockedTarget===unit});
    if(valid&&b.includes(foe)&&!aMap.has(unit)&&!bMap.has(foe)){aMap.set(unit,foe);bMap.set(foe,unit)}
  }
  const pairingDistance=(left,right)=>isAvoidingDuelTarget(left,right)||isAvoidingDuelTarget(right,left)||!barracksEnemyCanClaimDuel({
    barracksSpawned:!!right.userData.barracksSpawned,initialDuelCheck:!!right.userData.barracksInitialDuelCheck,
    distance:left.position.distanceTo(right.position),detectionRadius:BARRACKS_ENEMY_DUEL_RADIUS
  })
    ?Infinity
    :left.position.distanceToSquared(right.position);
  const freshBarracksEnemies=b.filter(enemy=>enemy.userData.barracksSpawned&&enemy.userData.barracksInitialDuelCheck);
  for(const enemy of freshBarracksEnemies){
    if(bMap.has(enemy))continue;
    const pair=chooseNearestAvailablePair(a.filter(unit=>!aMap.has(unit)),[enemy],pairingDistance);
    if(!pair)continue;
    aMap.set(pair.left,pair.right);bMap.set(pair.right,pair.left);
  }
  while(a.some(u=>!aMap.has(u))&&b.some(u=>!bMap.has(u))){
    const pair=chooseNearestAvailablePair(
      a.filter(unit=>!aMap.has(unit)),
      b.filter(unit=>!bMap.has(unit)),
      pairingDistance
    );
    if(!pair)break;
    const {left:bestA,right:bestB}=pair;
    aMap.set(bestA,bestB);bMap.set(bestB,bestA);
  }
  const pairs=[...aMap].map(([left,right])=>({left,right}));
  if(pairs.length){
    for(const pair of pairs){
      const alreadyMutual=pair.left.userData.lockedTarget===pair.right&&pair.right.userData.lockedTarget===pair.left;
      if(!alreadyMutual){
        lockDuel(pair.left,pair.right);lockDuel(pair.right,pair.left);
        const firstAttacker=((pair.left.id+pair.right.id)&1)===0?pair.left:pair.right;
        pair.left.userData.duelTurnId=firstAttacker.id;pair.right.userData.duelTurnId=firstAttacker.id;
      }
    }
  }
  const duels=pairs.map(({left,right})=>{
    const center=left.position.clone().add(right.position).multiplyScalar(.5);center.y=GROUND_Y;
    const axis=right.position.clone().sub(left.position).setY(0);
    if(axis.lengthSq()<.001)axis.set(1,0,0);else axis.normalize();
    return {left,right,center,axis};
  });
  const unmatchedA=a.filter(unit=>!aMap.has(unit)),unmatchedB=b.filter(unit=>!bMap.has(unit)),waiters=[...unmatchedA,...unmatchedB],freshBarracksWaiters=freshBarracksEnemies.filter(enemy=>unmatchedB.includes(enemy));
  const waitingAssignments=allocatePrioritizedDuelWaitingSlots({
    priorityWaiters:freshBarracksWaiters,waiters,duels,
    preferredDuel:waiter=>duels.find(duel=>duel.left===waiter.userData.waitingDuelTarget||duel.right===waiter.userData.waitingDuelTarget),
    distanceBetween:(waiter,duel)=>waiter.position.distanceToSquared(duel.center)
  });
  for(const unit of [...a,...b])unit.userData.waitingDuelTarget=null;
  const aWaitMap=new Map(),bWaitMap=new Map();
  for(const [waiter,duel] of waitingAssignments){
    waiter.userData.waitingDuelTarget=duel.left;waiter.userData.barracksAnchor=null;waiter.userData.barracksAnchorSlot=null;
    (a.includes(waiter)?aWaitMap:bWaitMap).set(waiter,duel);
  }
  for(const enemy of b)enemy.userData.barracksInitialDuelCheck=false;
  return {aMap,bMap,aWaitMap,bWaitMap};
}

function duelWaitingPoint(waiter,duel){
  const center=duel.center.clone();center.y=GROUND_Y;
  const lateral=new THREE.Vector3(-duel.axis.z,0,duel.axis.x).multiplyScalar((waiter.id&1)?DUEL_WAITING_DISTANCE:-DUEL_WAITING_DISTANCE);
  return center.add(lateral);
}
function clearInvalidDuels(units){
  for(const unit of units){
    const foe=unit.userData.lockedTarget;
    if(!foe){
      if(shouldClearStaleDuelState({hasTarget:false,duelPhase:unit.userData.duelPhase,duelRole:unit.userData.duelRole,duelTurnId:unit.userData.duelTurnId,lungeAxis:unit.userData.lungeAxis}))resetDuel(unit);
      continue;
    }
    if(foe&&!canMaintainSoldierDuel({unitAlive:unit.userData.alive,targetAlive:foe.userData.alive,mutualLock:foe.userData.lockedTarget===unit})){
      resetDuel(unit);unit.userData.seekingTarget=false;
    }
  }
}
function releasePlayerCombatCommitment(){
  for(const unit of followers){
    if(!unit.userData.lockedTarget&&!unit.userData.seekingTarget&&unit.userData.mode===SERVANT_MODE.FOLLOW)continue;
    resetDuel(unit);unit.userData.seekingTarget=false;unit.userData.mode=SERVANT_MODE.FOLLOW;
    unit.userData.followAnchor=null;unit.userData.followState=FOLLOW_AWARENESS.HOLDING;unit.userData.followTimer=0;
  }
}
function navigationTargetActor(unit){return unit.userData.lockedTarget??unit.userData.waitingDuelTarget??unit.userData.commanderTarget??null}
function steerStraightTowards(unit,desired,maxSpeed,acceleration,dt){
  const delta=desired.clone().sub(unit.position);delta.y=0;
  const distance=delta.length(), speed=arrivalSpeed(distance,maxSpeed),frontConstrained=Boolean(unit.userData?.actorArchetypeId&&!unit.userData?.isMaster);
  let desiredVelocity=new THREE.Vector3(),alignment=1;
  if(speed>0&&frontConstrained){
    const heading=Math.atan2(delta.x,delta.z);unit.rotation.y=smoothAngle(unit.rotation.y,heading,6,dt);
    const forward=new THREE.Vector3(Math.sin(unit.rotation.y),0,Math.cos(unit.rotation.y));alignment=Math.max(0,forward.dot(delta)/distance);
    const turnSpeed=Math.max(0,(alignment-.5)*2);
    desiredVelocity=forward.multiplyScalar(speed*turnSpeed);
  }else if(speed>0)desiredVelocity=delta.multiplyScalar(speed/distance);
  const velocity=unit.userData.velocity??=new THREE.Vector3(), change=desiredVelocity.sub(velocity), maxChange=acceleration*(frontConstrained&&alignment<.8?3:1)*dt;
  if(change.length()>maxChange)change.setLength(maxChange);
  velocity.add(change);unit.position.addScaledVector(velocity,dt);
  if(!frontConstrained&&velocity.lengthSq()>.03)unit.rotation.y=smoothAngle(unit.rotation.y,Math.atan2(velocity.x,velocity.z),10,dt);
}
function steerTowards(unit,desired,maxSpeed,acceleration,dt,navigationOptions={}){
  const targetActor=navigationOptions.targetActor??navigationTargetActor(unit),routeKey=navigationGoalKey(desired,navigationOptions.goalKey),pathDesired=maxSpeed>.001?navigationPathDesired(unit,desired,{goalKey:routeKey,targetActor,allowPhysicalGoal:navigationOptions.allowPhysicalGoal===true}):desired,routedDesired=maxSpeed>.001?navigationYieldDesired(unit,pathDesired,targetActor,routeKey):pathDesired;steerStraightTowards(unit,routedDesired,maxSpeed,acceleration,dt);
}
function leashTarget(desired,leader,maxDistance){
  const point=limitPointToRadius(desired,leader.position,maxDistance);
  desired.x=point.x;desired.z=point.z;return desired;
}
function resolveCharacterCollisions(){
  const units=[master,...followers,...enemyUnits].filter(u=>u.visible&&u.userData.alive!==false&&!isBarracksDeparting(u));
  for(let pass=0;pass<4;pass++)for(let i=0;i<units.length;i++)for(let j=i+1;j<units.length;j++){
    const a=units[i],b=units[j],correction=resolveBoxOverlap(a.position,a.userData.collisionHalf,b.position,b.userData.collisionHalf);if(!correction)continue;
    a.userData.collisionContacts=Math.min(3,(a.userData.collisionContacts??0)+.8);
    b.userData.collisionContacts=Math.min(3,(b.userData.collisionContacts??0)+.8);
    a.userData.lastCollisionTime=totalTime;
    b.userData.lastCollisionTime=totalTime;
    const aWeight=a.userData.isMaster&&!b.userData.isMaster?.25:b.userData.isMaster&&!a.userData.isMaster?1.75:1;
    const bWeight=b.userData.isMaster&&!a.userData.isMaster?.25:a.userData.isMaster&&!b.userData.isMaster?1.75:1;
    a.position.x+=correction.ax*aWeight;a.position.z+=correction.az*aWeight;b.position.x+=correction.bx*bWeight;b.position.z+=correction.bz*bWeight;
    const pairedDuel=a.userData.lockedTarget===b&&b.userData.lockedTarget===a;
    if(!pairedDuel&&correction.ax){
      if(a.userData.velocity.x*correction.ax<0)a.userData.velocity.x=0;
      if(b.userData.velocity.x*correction.bx<0)b.userData.velocity.x=0;
    }
    if(!pairedDuel&&correction.az){
      if(a.userData.velocity.z*correction.az<0)a.userData.velocity.z=0;
      if(b.userData.velocity.z*correction.bz<0)b.userData.velocity.z=0;
    }
  }
}
function resolveNavigationObstacleCollisions(){
  const obstacles=ensureNavigationGrid().obstacles;if(!obstacles.length)return;
  const units=[master,...followers,...enemyUnits].filter(unit=>unit.visible&&unit.userData.alive!==false);
  for(let pass=0;pass<2;pass++)for(const unit of units)for(const obstacle of obstacles){
    if(unitIgnoresNavigationObstacle(unit,obstacle))continue;
    const correction=resolveCircleBoxOverlap({point:unit.position,radius:unitCollisionRadius(unit),box:obstacle,boxHalf:obstacle.half,rotation:obstacle.rotation});if(!correction)continue;
    unit.position.x+=correction.x;unit.position.z+=correction.z;unit.userData.collisionContacts=Math.min(3,(unit.userData.collisionContacts??0)+.8);unit.userData.lastCollisionTime=totalTime;
    const velocity=unit.userData.velocity;if(velocity?.x*correction.x<0)velocity.x=0;if(velocity?.z*correction.z<0)velocity.z=0;
  }
}
function dealDamage(attacker,victim){
  if(!attacker.userData.alive||!victim.userData.alive||attacker.userData.faction===victim.userData.faction)return false;
  const previousHealth=victim.userData.hp;
  attacker.userData.lastAttackTime=totalTime;
  victim.userData.lastDamageTime=totalTime;
  victim.userData.hp-=attacker.userData.attack;
  victim.userData.sinceDamage=0;victim.userData.regenStartHealth=Math.max(0,victim.userData.hp);victim.userData.regenActive=false;
  showActorHealth(victim,previousHealth);
  const knockback=hitKnockback(attacker.position,victim.position,victim.userData.isMaster?1.35:2.25);
  victim.userData.velocity.add(new THREE.Vector3(knockback.x,0,knockback.z));
  burst(victim.position,attacker.userData.faction); if(rand()<.22)synthTone(125+rand()*70,.08,"triangle",.018);
  attacker.userData.attackAnim=1;victim.userData.damageAnim=1;victim.userData.hitPulse=1;
  if(victim===master&&!INDEPENDENT_SOLDIERS){
    masterHealth=Math.max(0,victim.userData.hp);sinceDamage=0;damagePulse=Math.min(1.65,damagePulse+.62);damageStacks=Math.min(6,damageStacks+1);
  }
  if(victim.userData.hp<=0){
    const partner=victim.userData.lockedTarget;
    if(partner?.userData.lockedTarget===victim)resetDuel(partner);
    for(const unit of [master,...followers,...enemyUnits])if(unit.userData.waitingDuelTarget===victim)unit.userData.waitingDuelTarget=null;
    resetDuel(victim);
    victim.userData.alive=false;victim.userData.velocity?.set(0,0,0);
    spawnEnemySplitChildren(victim);
    if(victim.userData.isMaster&&!INDEPENDENT_SOLDIERS){
      playSound("death");
      if(victim===master){commanderHearts=Math.max(0,commanderHearts-1);updateHearts()}
      shatterCommander(victim);victim.visible=false
    }
    else if(victim.userData.faction==="player"||INDEPENDENT_SOLDIERS){playSound("death");shatterSoldier(victim);victim.visible=false}
    else setFallenAppearance(victim,true);
    if(victim.userData.faction==="player"){companyLayoutDirty=true;updateStats()}
  }
  return true;
}
function hit(attacker,victim,dt){
  attacker.userData.cool-=dt;
  const dist=attacker.position.distanceTo(victim.position);
  if(!canApplyAttackDamage({attackerAlive:attacker.userData.alive,victimAlive:victim.userData.alive,opposingFactions:attacker.userData.faction!==victim.userData.faction,cooldown:attacker.userData.cool,distance:dist,range:1.05}))return;
  attacker.userData.cool=.62+rand()*.18;
  if(queueCharacterStrike(attacker,()=>{if(attacker.position.distanceTo(victim.position)<=1.05)dealDamage(attacker,victim)}))return;
  attacker.userData.attackAnim=1;
  dealDamage(attacker,victim);
}
function updateDuel(unit,foe,dt){
  const data=unit.userData;
  data.duelPhase??=DUEL_PHASE.APPROACH;data.duelTimer??=0;data.attackSequence??=0;
  const previousPhase=data.duelPhase;
  const strikeRange=foe.userData.isMaster?1.4:1.15;
  const strikeDistance=unit.position.distanceTo(foe.position);
  const mutual=foe.userData.lockedTarget===unit;
  if(mutual){
    const turnId=resolveDuelTurnId({
      unitId:unit.id,targetId:foe.id,
      unitTurnId:data.duelTurnId,targetTurnId:foe.userData.duelTurnId
    });
    data.duelTurnId=turnId;foe.userData.duelTurnId=turnId;
  }
  const mayAttack=!mutual||data.duelTurnId===unit.id;
  const next=mayAttack
    ?advanceDuelState({phase:data.duelPhase,timer:data.duelTimer,strikeDistance,strikeRange,dt})
    :{phase:DUEL_PHASE.APPROACH,timer:0,strike:false};
  data.duelPhase=next.phase;data.duelTimer=next.timer;
  const currentLungeAxis=unit.position.clone().sub(foe.position).setY(0);
  if(currentLungeAxis.lengthSq()<.001)currentLungeAxis.set((unit.id&1)?1:-1,0,0);else currentLungeAxis.normalize();
  const committedLungeAxis=duelLungeDirection({
    phase:next.phase,
    previousPhase,
    committedDirection:data.lungeAxis?{x:data.lungeAxis.x,z:data.lungeAxis.z}:null,
    currentDirection:{x:currentLungeAxis.x,z:currentLungeAxis.z}
  });
  data.lungeAxis=committedLungeAxis?new THREE.Vector3(committedLungeAxis.x,0,committedLungeAxis.z):null;
  const approachStandOff=Math.max(.72,strikeRange-.22),pursuit=standOffPursuitPoint(unit.position,foe.position,approachStandOff,.1);
  let desired=new THREE.Vector3(pursuit.x,GROUND_Y,pursuit.z),speed=2.15,acceleration=5.4;
  if(next.phase===DUEL_PHASE.APPROACH){
    desired.set(pursuit.x,GROUND_Y,pursuit.z);speed=2.1;acceleration=5.2;
  }else if(next.phase===DUEL_PHASE.LUNGE){
    const lungeStandOff=foe.userData.isMaster?.88:.72;
    const lungeAxis=data.lungeAxis??currentLungeAxis;
    desired=foe.position.clone().addScaledVector(lungeAxis,lungeStandOff);speed=2.82;acceleration=10.8;
  }else{
    desired.set(pursuit.x,GROUND_Y,pursuit.z);speed=2.75;acceleration=8.2;
  }
  if(next.strike&&foe.userData.alive){
    const strike=()=>{
      unit.userData.attackAnim=1;
      const sequence=data.attackSequence++,landed=duelAttackHits(sequence);
      const distance=unit.position.distanceTo(foe.position);
      const valid=canApplyAttackDamage({attackerAlive:data.alive,victimAlive:foe.userData.alive,opposingFactions:data.faction!==foe.userData.faction,cooldown:0,distance,range:strikeRange});
      const strikeLanded=valid&&landed&&dealDamage(unit,foe);
      if(mutual&&strikeLanded&&foe.userData.alive){
        const turnId=nextDuelTurn({attackerId:unit.id,defenderId:foe.id,strikeLanded:true});
        data.duelTurnId=turnId;foe.userData.duelTurnId=turnId;
        foe.userData.duelPhase=DUEL_PHASE.APPROACH;foe.userData.duelTimer=0;
      }
    };
    if(!queueCharacterStrike(unit,()=>{if(unit.userData.lockedTarget===foe)strike()}))strike();
  }
  const facing=foe.position.clone().sub(unit.position);if(facing.lengthSq()>.001)unit.rotation.y=smoothAngle(unit.rotation.y,Math.atan2(facing.x,facing.z),14,dt);
  return {desired,speed,acceleration};
}
function activeTransientParticleCount(){let count=0;for(const particle of particles)if(particle.visible&&particle.userData.kind!=="shatter")count++;return count}
function persistentFragmentCount(){let count=0;for(const particle of particles)if(particle.visible&&particle.userData.kind==="shatter")count++;return count}
function burst(pos,faction){
  const color=COLORS[faction]||COLORS.player;
  for(let i=0;i<5;i++){if(!particleBudgetAllows(activeTransientParticleCount(),MAX_ACTIVE_PARTICLES))break;let p=particles.find(x=>!x.visible&&x.userData.kind==="hit");if(!p){p=new THREE.Mesh(new THREE.TetrahedronGeometry(.09),mat(color));p.userData.kind="hit";particles.push(p);battle.add(p)}p.material.color.setHex(color);p.position.copy(pos);p.position.y=.8;p.userData.life=.45;p.userData.maxLife=.45;p.userData.vel=new THREE.Vector3((rand()-.5)*2,1+rand()*1.8,(rand()-.5)*2);p.userData.spin=null;p.visible=true}shake=reducedMotion?0:.07;
}
function shatterCommander(commander){
  const count=10+Math.floor(rand()*7),palette=commander.userData.faction==="player"?[0x247bff,0x103e9c,0x34383a]:[0xd92f43,0x8b1f2d,0x3b3437];
  for(let i=0;i<count;i++){
    if(!persistentFragmentBudgetAllows(persistentFragmentCount(),MAX_PERSISTENT_FRAGMENTS))break;
    const size=.07+rand()*.11,p=new THREE.Mesh(new THREE.BoxGeometry(size,size,size),mat(palette[i%palette.length],.9));
    p.position.copy(commander.position);p.position.y+=.78+rand()*.45;
    const angle=rand()*Math.PI*2,speed=.9+rand()*2.1;
    p.userData={kind:"shatter",persistent:true,life:Infinity,maxLife:Infinity,halfSize:size*.5,bounces:0,settled:false,vel:new THREE.Vector3(Math.cos(angle)*speed,2+rand()*2.8,Math.sin(angle)*speed),spin:new THREE.Vector3((rand()-.5)*9,(rand()-.5)*9,(rand()-.5)*9)};
    p.castShadow=true;particles.push(p);battle.add(p);
  }
  shake=reducedMotion?0:.16;synthTone(72,.38,"sawtooth",.04);
}
function shatterSoldier(soldier){
  const count=soldierFragmentCount(rand()),palette=soldier.userData.faction==="player"?[0x35c9c2,0x4383bd,0xf7f2e4]:[COLORS.amber,0xb7650e,0xffd566];
  for(let i=0;i<count;i++){
    if(!persistentFragmentBudgetAllows(persistentFragmentCount(),MAX_PERSISTENT_FRAGMENTS))break;
    const scale=soldier.userData.faction==="player"?1:1.5,size=(.045+rand()*.065)*scale,p=new THREE.Mesh(new THREE.BoxGeometry(size,size,size),mat(palette[i%palette.length],.9));
    p.position.copy(soldier.position);p.position.y+=.45+rand()*.5;
    const angle=rand()*Math.PI*2,speed=.55+rand()*1.45;
    p.userData={kind:"shatter",persistent:true,life:Infinity,maxLife:Infinity,halfSize:size*.5,bounces:0,settled:false,vel:new THREE.Vector3(Math.cos(angle)*speed,1.35+rand()*1.85,Math.sin(angle)*speed),spin:new THREE.Vector3((rand()-.5)*10,(rand()-.5)*10,(rand()-.5)*10)};
    p.castShadow=true;particles.push(p);battle.add(p);
  }
  shake=reducedMotion?0:.09;synthTone(105,.16,"triangle",.025);
}
function updateParticles(dt){
  for(let index=particles.length-1;index>=0;index--){
    const p=particles[index];
    if(!p.visible)continue;
    if(!p.userData.persistent)p.userData.life-=dt;
    if(!p.userData.persistent&&p.userData.life<=0){
      if(p.userData.kind==="shatter"){
        battle.remove(p);p.geometry.dispose();p.material.dispose();particles.splice(index,1);
      }else p.visible=false;
      continue;
    }
    if(p.userData.kind==="shatter"){
      const supportY=walkableSupportHeightAt(p.position.x,p.position.z);
      const state=advanceGroundFragment({
        position:p.position,velocity:p.userData.vel,halfSize:p.userData.halfSize,
        bounces:p.userData.bounces,settled:p.userData.settled,dt,groundY:supportY
      });
      p.position.set(state.position.x,state.position.y,state.position.z);
      p.userData.vel.set(state.velocity.x,state.velocity.y,state.velocity.z);
      p.userData.bounces=state.bounces;p.userData.settled=state.settled;
      if(p.position.y<ACTOR_VOID_Y){battle.remove(p);p.geometry.dispose();p.material.dispose();particles.splice(index,1);continue}
      if(state.settled){p.rotation.x=0;p.rotation.z=0}
      if(!state.settled&&p.userData.spin){p.rotation.x+=p.userData.spin.x*dt;p.rotation.y+=p.userData.spin.y*dt;p.rotation.z+=p.userData.spin.z*dt}
      p.scale.setScalar(p.userData.persistent?1:p.userData.life<.45?p.userData.life/.45:1);
      continue;
    }
    p.position.addScaledVector(p.userData.vel,dt);p.userData.vel.y-=4*dt;
    if(p.userData.spin){p.rotation.x+=p.userData.spin.x*dt;p.rotation.y+=p.userData.spin.y*dt;p.rotation.z+=p.userData.spin.z*dt}
    p.scale.setScalar(Math.min(1,p.userData.life/(p.userData.maxLife||.45)));
  }
}

function resolveDebrisCollisions(){
  const actors=[master,...followers,...enemyUnits].filter(unit=>unit?.userData?.alive&&!isBarracksDeparting(unit));
  for(const actor of actors)for(const fragment of particles){
    if(!fragment.visible||fragment.userData.kind!=="shatter"||!fragment.userData.settled)continue;
    const half=fragment.userData.halfSize;
    const correction=resolveBoxOverlap(actor.position,actor.userData.collisionHalf,fragment.position,{x:half,z:half});
    if(!correction)continue;
    fragment.position.x+=correction.bx*2;fragment.position.z+=correction.bz*2;
    fragment.userData.vel.set(
      (actor.userData.velocity?.x??0)*.45+correction.bx*16,
      0,
      (actor.userData.velocity?.z??0)*.45+correction.bz*16
    );
    fragment.userData.settled=false;fragment.userData.bounces=2;
  }
}

function completeEnemyDefeat(){
  if(!activeEncounter||activeEncounter.victoryResolved)return;
  activeEncounter.victoryResolved=true;activeEncounter.done=true;
  const defeatedEnemies=enemyUnits.splice(0);
  defeatedEnemies.forEach(unit=>{
    resetDuel(unit);unit.userData.revival=null;unit.userData.alive=false;unit.userData.velocity?.set(0,0,0);unit.visible=false;battle.remove(unit);
  });
  enemyPackAnchor=null;nextWaveTimer=0;
  defeatCinematic=null;
  beginFactionCelebration("player");
  showToast("ALL EN DEFEATED — EXIT WHEN READY",3000);updateStats();
}
function updateDefeatCinematic(dt){
  const state=defeatCinematicState(defeatCinematic.elapsed);
  const visualDt=dt*state.timeScale;
  updatePlayerSoldierRegeneration(visualDt);updateSoldierDamageEffects(visualDt);updateActorCombatAnimations(visualDt);updateActorHealthWidgets(visualDt);
  updateParticles(visualDt);resolveDebrisCollisions();updateEncounterRings(false);updateSelectionVisuals();
  defeatCinematic.elapsed+=dt;
  if(!defeatCinematicState(defeatCinematic.elapsed).complete)return;
  const {hasNextWave,outcome}=defeatCinematic;defeatCinematic=null;activeEncounter=null;
  if(outcome==="game-over")showGameOverScreen();
  else if(hasNextWave)scheduleNextWave();else win();
}
function updatePlayerSoldierRegeneration(dt){
  if(!INDEPENDENT_SOLDIERS)return;
  for(const unit of livingPlayerUnits()){
    const data=unit.userData;
    data.sinceDamage=(data.sinceDamage??99)+dt;
    const previousHealth=data.hp;
    data.hp=soldierRegenHealth({
      health:data.hp,
      maxHealth:data.maxHp,
      regenStartHealth:data.regenStartHealth,
      sinceDamage:data.sinceDamage,
      dt,
      delay:SOLDIER_REGEN_DELAY,
      duration:SOLDIER_REGEN_DURATION
    });
    data.regenActive=data.hp>previousHealth+.0001;
  }
}
function showGameOverScreen(){
  clearTacticalSelection();
  mode="end";
  $("end-title").textContent=STR.gameOver;
  $("retry").textContent=STR.backToBegin;
  $("end-screen").classList.remove("hidden");
  $("hud").classList.add("hidden");
  sounds.music.pause();
}
function beginEnemyRetreat(){
  if(enemyRetreat)return;
  clearTacticalSelection();
  if(activeEncounter)activeEncounter.done=true;
  nextWaveTimer=0;
  const focus=playerFocus().position.clone();
  enemyUnits.forEach((unit,index)=>{
    if(!unit.userData.alive)return;
    resetDuel(unit);
    unit.userData.seekingTarget=false;unit.userData.manualMoving=false;unit.userData.manualTarget=null;
    const away=unit.position.clone().sub(focus).setY(0);
    if(away.lengthSq()<.001)away.set((unit.id&1)?1:-1,0,0);else away.normalize();
    const side=new THREE.Vector3(-away.z,0,away.x);
    const lateral=(index%2?1:-1)*(1.8+rand()*2.6);
    unit.userData.retreatTarget=unit.position.clone().addScaledVector(away,42+rand()*12).addScaledVector(side,lateral);
    unit.userData.retreatPhase=rand()*Math.PI*2;
    unit.userData.velocity.set(0,0,0);
  });
  enemyRetreat={elapsed:0};
}
function updateEnemyRetreatUnit(unit,dt){
  const destination=unit.userData.retreatTarget;
  if(!destination)return;
  const sway=new THREE.Vector3(
    Math.sin(totalTime*.72+unit.userData.retreatPhase)*.6,
    0,
    Math.cos(totalTime*.61+unit.userData.retreatPhase)*.6
  );
  const desired=destination.clone().add(sway);
  steerTowards(unit,desired,3.1,4.2,dt);
  const facing=desired.clone().sub(unit.position);
  if(facing.lengthSq()>.001)unit.rotation.y=smoothAngle(unit.rotation.y,Math.atan2(facing.x,facing.z),7,dt);
  if(enemyRetreat?.elapsed>.75&&!waveSpawnIsVisible(unit.position)){
    unit.userData.alive=false;unit.userData.velocity.set(0,0,0);unit.visible=false;battle.remove(unit);
  }
}
function pauseCelebratingUnit(unit){
  unit.userData.velocity?.set(0,0,0);unit.userData.manualMoving=false;unit.userData.manualTarget=null;unit.userData.enemyRoamGoal=null;unit.userData.peacefulPatrolGoal=null;unit.userData.navigationPath=null;unit.userData.navigationYield=null;
}
function clearFactionCelebration(){
  celebrationWinnerFaction=null;
  for(const unit of [master,...followers,...enemyUnits])if(unit?.userData)unit.userData.celebrating=false;
}
function beginFactionCelebration(faction){
  if(celebrationWinnerFaction===faction)return false;
  clearFactionCelebration();celebrationWinnerFaction=faction;
  if(activeEncounter){activeEncounter.done=true;activeEncounter.aggro=false;activeEncounter.forceSoldierEngagement=false;}
  for(const unit of [master,...followers,...enemyUnits]){
    if(!unit?.visible||!unit.userData?.alive)continue;
    resetDuel(unit);unit.userData.waitingDuelTarget=null;unit.userData.seekingTarget=false;
    unit.userData.celebrating=unit.userData.faction===faction;
    if(unit.userData.celebrating)pauseCelebratingUnit(unit);
  }
  return true;
}
function resolveBattle(){
  if(mode==="end")return;
  const winner=celebrationWinner({livingPlayerCount:livingPlayerUnits().length,livingEnemyCount:enemyUnits.filter(unit=>unit.userData.alive&&unit.visible).length,playerReserveCount:deploymentReserveTotal(),deploymentStarted});
  if(winner==="enemy"){
    if(beginFactionCelebration(winner))showToast("NO CH REMAIN - EN CELEBRATE. EXIT WHEN READY",3000);
    return;
  }
  if(!activeEncounter||activeEncounter.done)return;
  if(activeRaidBuildings().length)return;
  if(enemyUnits.length&&enemyUnits.every(unit=>!unit.userData.alive))completeEnemyDefeat();
}
function updatePlayerGroupCommander(commander,company,{combat,livingRivals,livingEnemySoldiers,commanderTargets,routeActors,dt}){
  const anchor=ensureCompanyAnchor(company.groupIndex);
  const companyOrder=anchor.moving,commanderOrder=!!commander.userData.manualMoving;
  const control=commanderControlState({combat,manualOrder:companyOrder||commanderOrder});
  commander.userData.sinceDamage=(commander.userData.sinceDamage??99)+dt;
  commander.userData.hp=commanderRegenHealth(
    commander.userData.hp,commander.userData.maxHp,commander.userData.sinceDamage,dt,
    commander.userData.regenDelay,commander.userData.regenPerSecond
  );
  let desired=commander.position.clone(),foe=null,speed=0,acceleration=5.8;
  if(control==="move"){
    desired.copy(commanderOrder?(commander.userData.manualTarget??commander.position):(anchor.commanderTarget??formationPoint(anchor,commanderFormationOffset(1.42))));speed=2.15;acceleration=6.4;
  }else if(control==="engage"&&(livingRivals.length||livingEnemySoldiers.length)){
    foe=commanderTargets.get(commander)??nearestAlive(commander,livingEnemySoldiers)??nearestAlive(commander,livingRivals);
    if(foe){
      desired.copy(commanderRoute(commander,foe,routeActors));speed=1.55;acceleration=4.4;
      const blockerIndex=chooseCommanderBlockerIndex({
        commander:commander.position,target:foe.position,
        soldiers:livingEnemySoldiers.map(soldier=>({x:soldier.position.x,z:soldier.position.z,alive:true,threatening:soldier.userData.lockedTarget===commander}))
      });
      hit(commander,blockerIndex>=0?livingEnemySoldiers[blockerIndex]:foe,dt);
    }
  }else{
    desired.copy(commander.position);speed=0;
  }
  steerTowards(commander,desired,speed,acceleration,dt);
  if(commanderOrder&&commander.position.distanceTo(desired)<.08){
    commander.userData.manualMoving=false;commander.userData.manualTarget=null;commander.userData.velocity.set(0,0,0);
  }
  if(foe){const facing=foe.position.clone().sub(commander.position);if(facing.lengthSq()>.001)commander.rotation.y=smoothAngle(commander.rotation.y,Math.atan2(facing.x,facing.z),12,dt)}
}
function independentGroupRegroupTarget(unit){
  const company=ensureCompanyLayout().find(item=>item.groupIndex===unit.userData.companyId);if(!company)return null;
  const index=company.soldiers.indexOf(unit);if(index<0)return null;
  const anchor=ensureCompanyAnchor(company.groupIndex),forward=anchor.forward.clone().setY(0);
  if(forward.lengthSq()<.001)forward.set(0,0,-1);else forward.normalize();
  const lateral=new THREE.Vector3(-forward.z,0,forward.x),offset=centeredPackOffset(index,company.soldiers.length,1.05);
  return anchor.position.clone().addScaledVector(lateral,offset.lateral).addScaledVector(forward,offset.forward).setY(unit.position.y);
}
function compactGroupColumnOffset(index){const rank=Math.max(0,Math.floor(index));return {lateral:0,forward:rank===0?0:-rank*INDEPENDENT_GROUP_COLUMN_GAP}}
function independentGroupPatrolRadii(grid=ensureNavigationGrid()){
  const patrol=Math.max(INDEPENDENT_GROUP_PATROL_RADIUS,Math.hypot(grid.cellSize.x,grid.cellSize.z)+.1);
  return {patrol,cohesion:Math.max(CH_PATROL_COHESION_RADIUS,patrol+.4)};
}
function independentGroupPatrolTarget(unit,allies){
  const company=ensureCompanyLayout().find(item=>item.groupIndex===unit.userData.companyId),members=company?.soldiers.filter(member=>member.userData.alive)??[];
  if(!company||!members.length)return unit.position.clone();
  const grid=ensureNavigationGrid(),{patrol:patrolRadius,cohesion:cohesionRadius}=independentGroupPatrolRadii(grid),anchor=ensureCompanyAnchor(company.groupIndex),pivot=(anchor.patrolHome??anchor.orderTarget??anchor.position).clone().setY(GROUND_Y);
  anchor.patrolHome??=pivot.clone();
  if(Math.hypot(unit.position.x-pivot.x,unit.position.z-pivot.z)>cohesionRadius){unit.userData.groupPatrolGoal=null;unit.userData.groupPatrolPauseUntil=0;return pivot.setY(unit.position.y);}
  if(unit.userData.groupPatrolGoal&&Math.hypot(unit.userData.groupPatrolGoal.x-pivot.x,unit.userData.groupPatrolGoal.z-pivot.z)>patrolRadius)unit.userData.groupPatrolGoal=null;
  const previousGoal=unit.userData.groupPatrolGoal;
  const arrivedAtGoal=previousGoal&&unit.position.distanceToSquared(previousGoal)<=INDEPENDENT_GROUP_ARRIVAL_DISTANCE**2;
  const goalActive=previousGoal?.revision===grid.revision&&previousGoal.expiresAt>totalTime&&!arrivedAtGoal&&!navigationPointPhysicallyBlocked(previousGoal,unit);
  if(goalActive)return new THREE.Vector3(previousGoal.x,previousGoal.y,previousGoal.z);
  if(arrivedAtGoal&&!unit.userData.groupPatrolPauseUntil){unit.userData.groupPatrolPauseUntil=totalTime+rand()*INDEPENDENT_GROUP_PATROL_PAUSE_MAX;return unit.position.clone();}
  if((unit.userData.groupPatrolPauseUntil??0)>totalTime)return unit.position.clone();
  unit.userData.groupPatrolPauseUntil=0;
  const occupied=[];
  for(const member of members){
    if(member===unit)continue;
    occupied.push(member.position);
    const memberGoal=member.userData.groupPatrolGoal;
    if(memberGoal?.revision===grid.revision)occupied.push(memberGoal);
  }
  const minimumStep=Math.min(grid.cellSize.x,grid.cellSize.z)*.4;
  const candidates=[...grid.cells].filter(([cellKey,cell])=>!grid.blocked.has(cellKey)&&Math.hypot(cell.x-pivot.x,cell.z-pivot.z)<=patrolRadius&&Math.hypot(cell.x-unit.position.x,cell.z-unit.position.z)>minimumStep).map(([,cell])=>cell);
  const patrolGoal=choosePatrolGoal({origin:unit.position,candidates,recentGoal:previousGoal,occupied,roll:rand(),minimumTravelDistance:INDEPENDENT_GROUP_PATROL_MIN_DISTANCE,separation:INDEPENDENT_GROUP_PATROL_SEPARATION});
  if(!patrolGoal)return pivot.setY(unit.position.y);
  const goalY=walkableSupportHeightAt(patrolGoal.x,patrolGoal.z)??unit.position.y;
  unit.userData.groupPatrolGoal={x:patrolGoal.x,y:goalY,z:patrolGoal.z,revision:grid.revision,expiresAt:totalTime+INDEPENDENT_GROUP_PATROL_DURATION+rand()};unit.userData.navigationPath=null;unit.userData.navigationYield=null;
  return new THREE.Vector3(patrolGoal.x,goalY,patrolGoal.z);
}
function updateIndependentGroupPatrol(unit,allies,dt){
  const patrolTarget=independentGroupPatrolTarget(unit,allies),anchor=ensureCompanyAnchor(unit.userData.companyId),pivot=anchor.patrolHome??anchor.position,cohesionTarget=patrolCohesionTarget({unit:unit.position,center:pivot,desired:patrolTarget,radius:independentGroupPatrolRadii().cohesion}),desired=new THREE.Vector3(cohesionTarget.x,unit.position.y,cohesionTarget.z),distance=unit.position.distanceTo(desired),arrivalSpeed=Math.min(1,Math.max(.24,distance/.58)),speed=distance>.08?actorPatrolSpeed(unit)*arrivalSpeed:0;
  steerTowards(unit,desired,speed,actorSteerAcceleration(unit,5.4),dt,{goalKey:`group-patrol:${unit.userData.companyId}`});
}
function manualOrderTravelGuidance(unit,destination,allies,travelSpeed){
  const forward=destination.clone().sub(unit.position).setY(0),distance=forward.length();
  if(distance<.6)return {target:destination,speedScale:1};
  forward.divideScalar(distance);
  const lateral=new THREE.Vector3(-forward.z,0,forward.x);
  let sidestep=0,speedScale=1;
  for(const ally of allies){
    if(ally===unit||!ally.userData?.alive)continue;
    const relative=ally.position.clone().sub(unit.position).setY(0),ahead=relative.dot(forward),side=relative.dot(lateral);
    const collisionClearance=unitCollisionRadius(unit)+unitCollisionRadius(ally),clearance=Math.max(1,collisionClearance+.25);
    if(ahead<-.25||ahead>3.2||Math.abs(side)>=clearance)continue;
    let allyAlignment=1;
    if(ally.userData.manualMoving&&ally.userData.manualTarget){
      const allyForward=ally.userData.manualTarget.clone().sub(ally.position).setY(0);
      if(allyForward.lengthSq()>.001)allyAlignment=allyForward.normalize().dot(forward);
      if(allyAlignment>.995&&(ally.userData.moveSpeed??travelSpeed)>=travelSpeed-.2&&ahead>collisionClearance+.05)continue;
    }
    const direction=Math.abs(side)>.05?-Math.sign(side):allyAlignment<-.5?-1:unit.id<ally.id?-1:1;
    sidestep+=direction*(clearance-Math.abs(side)+.18)*(1-Math.max(0,ahead)/3.2);
    if(ahead>0&&ahead<1.6)speedScale=Math.min(speedScale,Math.max(.3,(ahead-.2)/1.4));
  }
  if(Math.abs(sidestep)<.01)return {target:destination,speedScale:1};
  const lookahead=unit.position.clone().addScaledVector(forward,Math.min(distance,.8));
  const offset=Math.max(-1.2,Math.min(1.2,sidestep)),candidate=lookahead.clone().addScaledVector(lateral,offset);
  if(navigationPhysicalPathClear(unit.position,candidate,unit))return {target:candidate,speedScale};
  candidate.copy(lookahead).addScaledVector(lateral,-offset);
  return navigationPhysicalPathClear(unit.position,candidate,unit)?{target:candidate,speedScale}:{target:destination,speedScale:1};
}
function updateIndependentSoldier(u,{combat,enemyInSight,raidTarget,foe,waitingDuel,peacefulPatrol=false,patrolAllies=[],dt}){
  if(!u?.userData?.alive)return;
  if(u.userData.celebrating){pauseCelebratingUnit(u);return;}
  if(peacefulPatrol&&!u.userData.manualMoving&&!foe?.userData?.alive&&!waitingDuel&&!raidTarget){updateIndependentGroupPatrol(u,patrolAllies,dt);return;}
  const combatState=soldierCombatState({combat,formingBattleLine:false,targetAlive:!!foe?.userData?.alive,waitingSlot:!!waitingDuel});
  u.userData.mode=foe?.userData?.alive?SERVANT_MODE.ATTACK:SERVANT_MODE.FOLLOW;
  const regrouping=shouldRegroupPlayerGroup({combat,enemyInSight,targetAlive:!!foe?.userData?.alive,waitingSlot:!!waitingDuel,manualOrder:!!u.userData.manualMoving,raidTarget});
  const regroupTarget=regrouping?independentGroupRegroupTarget(u):null;
  let desired=u.position.clone(),duelMotion=null;
  if(foe?.userData?.alive){
    duelMotion=updateDuel(u,foe,dt);
    if(!u.userData.alive)return;
    if(duelPathNeedsRelock(u,duelMotion.desired,foe,dt)){
      avoidBlockedDuelAndReassign(u);foe=null;duelMotion=null;
    }else{
      desired=duelMotion.desired;
    }
  }else if(waitingDuel){
    desired=duelWaitingPoint(u,waitingDuel);
  }else if(u.userData.manualMoving&&u.userData.manualTarget){
    desired=u.userData.manualTarget.clone();
  }else if(regroupTarget){
    desired=regroupTarget;
  }
  if(combatState===SOLDIER_COMBAT_STATE.NEUTRAL&&!foe&&!waitingDuel&&!u.userData.manualMoving&&!regroupTarget)desired=u.position.clone();
  const reachedOrder=()=>u.position.distanceTo(desired)<(u.userData.manualFinalTarget?NAVIGATION_WAYPOINT_REACHED:.1);
  const arrived=!foe&&reachedOrder();
  const speed=foe?duelMotion?.speed??2.45:waitingDuel?1.7:(u.userData.manualMoving||regroupTarget)&&!arrived?(u.userData.moveSpeed??2.65):0;
  const acceleration=actorSteerAcceleration(u,duelMotion?.acceleration??(foe?5.7:5.1));
  const moveScale=editorActorMoveScale(u);
  const directOrder=u.userData.manualMoving&&!foe&&!waitingDuel&&navigationPhysicalPathClear(u.position,desired,u);
  const guidance=directOrder&&patrolAllies.length?manualOrderTravelGuidance(u,desired,patrolAllies,speed):null;
  if(directOrder)steerStraightTowards(u,guidance?.target??desired,speed*(guidance?.speedScale??1)*moveScale,acceleration*Math.sqrt(moveScale),dt);
  else steerTowards(u,desired,speed*moveScale,acceleration*Math.sqrt(moveScale),dt);
  if(u.userData.manualMoving&&!foe&&!waitingDuel&&reachedOrder()){
    u.userData.manualMoving=false;u.userData.manualTarget=null;u.userData.manualFinalTarget=null;u.userData.peacefulPatrolGoal=null;ensureCompanyAnchor(u.userData.companyId).patrolGoal=null;
  }
  const faceTarget=foe?.position??waitingDuel?.center??null;
  if(faceTarget){const facing=faceTarget.clone().sub(u.position);if(facing.lengthSq()>.001)u.rotation.y=smoothAngle(u.rotation.y,Math.atan2(facing.x,facing.z),12,dt)}
}
function activateFieldedPlayerCombat(){
  if(deploymentStarted||!livingPlayerUnits().some(unit=>unit.parent===battle))return false;
  deploymentStarted=true;clearPeacefulPatrols();
  activatePlacedCharacterEncounter({engageImmediately:true});
  return true;
}
function updateBattle(dt){
  if(defeatCinematic){updateDefeatCinematic(dt);return}
  activateFieldedPlayerCombat();
  if(WAVES_ENABLED&&nextWaveTimer>0){nextWaveTimer-=dt;if(nextWaveTimer<=0)spawnWave()}
  updateBarracksSpawners(dt);
  const masterDirectOrder=!!master.userData.manualMoving,masterManualOrder=INDEPENDENT_SOLDIERS?masterDirectOrder:masterDirectOrder||ensureCompanyAnchor(0).moving;
  if(!INDEPENDENT_SOLDIERS&&masterManualOrder)steerTowards(master,target,2.15,5.2,dt);
  if(!INDEPENDENT_SOLDIERS&&masterDirectOrder&&master.position.distanceTo(target)<.08){
    master.userData.velocity.set(0,0,0);target.copy(master.position);
    master.userData.manualMoving=false;master.userData.manualTarget=null;
  }
  const activeEnemyUnits=enemyUnits.filter(u=>u.userData.alive&&!isBarracksDeparting(u)),livingRivals=activeEnemyUnits.filter(u=>u.userData.isMaster);
  const rival=nearestAlive(master,livingRivals);
  let approachDistanceSquared=Infinity;
  for(const playerActor of [master,...followers])if(playerActor.userData.alive)for(const enemyActor of activeEnemyUnits){
    approachDistanceSquared=Math.min(approachDistanceSquared,playerActor.position.distanceToSquared(enemyActor.position));
  }
  const approachDistance=Math.sqrt(approachDistanceSquared);
  if(activeEncounter)activeEncounter.cameraApproachDistance=approachDistance;
  const approachState=battleApproachState({distance:approachDistance,detectionRadius:32,aggroRadius:17}),forcedSoldierEngagement=!!activeEncounter?.forceSoldierEngagement;
  if(deploymentStarted&&activeEncounter&&!activeEncounter.done&&!activeEncounter.aggro&&(forcedSoldierEngagement||approachState==="combat"))activeEncounter.aggro=true;
  const threatDetected=!!activeEncounter&&!activeEncounter.done&&(forcedSoldierEngagement||approachState!=="travel");
  updateEncounterRings();
  if(activeEncounter)activeEncounter.formationSpread=advanceFormationSpread(activeEncounter.formationSpread??1,{threatDetected,dt});
  const formationSpread=activeEncounter?.formationSpread??1;
  const expansionProgress=THREE.MathUtils.clamp((formationSpread-1)/(THREAT_FORMATION_SCALE-1),0,1);
  const combat=activeEncounter?.aggro&&activeEnemyUnits.length>0&&threatDetected;
  const preparingForContact=!!activeEncounter&&!activeEncounter.done&&!combat&&approachState==="deploy";
  if(!combat&&wasCombat)settleCompanyAnchors();
  wasCombat=combat;
  const forward=master.userData.velocity.lengthSq()>.03?master.userData.velocity.clone().normalize():new THREE.Vector3(0,0,-1);
  const livingEnemies=activeEnemyUnits;
  const livingEnemySoldiers=livingEnemies.filter(u=>!u.userData.isMaster);
  updateEnemyPackAnchor(livingEnemySoldiers,{combat,preparingForContact,dt});
  const masterRetreating=false;
  const livingFollowers=followers.filter(u=>u.userData.alive);
  const livingPlayerCommanders=INDEPENDENT_SOLDIERS?[]:[master,...livingFollowers.filter(u=>u.userData.unitCommander)].filter(u=>u.userData.alive);
  const livingPlayerSoldiers=INDEPENDENT_SOLDIERS?[master,...livingFollowers].filter(u=>u.userData.alive):livingFollowers.filter(u=>!u.userData.unitCommander);
  const companies=INDEPENDENT_SOLDIERS?[]:ensureCompanyLayout(),companyCount=Math.max(1,companies.length);
  const peacefulPatrol=peacefulPatrolActive();
  const commanderLeading=!combat&&(master.userData.velocity.length()>.08||master.position.distanceTo(target)>.12);
  const companyLeaderMoving=new Map(companies.map(company=>{
    const anchor=ensureCompanyAnchor(company.groupIndex),leader=company.commander;
    const ownCommanderMoving=!!leader?.userData.alive&&(
      leader.userData.velocity.length()>.08||leader.userData.manualMoving||anchor.moving
    );
    return [company.groupIndex,companyLeaderMotion({ownCommanderMoving,primaryCommanderMoving:commanderLeading})];
  }));
  for(const company of companies){
    const anchor=ensureCompanyAnchor(company.groupIndex);
    if(anchor.deployTimer>0)anchor.deployTimer=Math.max(0,anchor.deployTimer-dt);
    const ownCommanderMoving=companyLeaderMoving.get(company.groupIndex);
    if(!ownCommanderMoving&&anchor.followingCommander&&!anchor.moving){
      const leader=company.commander?.userData.alive?company.commander:master;
      const caughtUp=company.soldiers.every(soldier=>soldier.position.distanceTo(leader.position)<=swarmTravelRadius(company.soldiers.length)+.8);
      if(caughtUp){
        anchor.position.copy(companyCenter(company.groupIndex));anchor.position.y=GROUND_Y;anchor.followingCommander=false;
        for(const soldier of company.soldiers)soldier.userData.holdPosition=soldier.position.clone();
      }
    }
  }
  clearInvalidDuels([master,...followers,...livingEnemies]);
  if(shouldReleaseCombatCommitment(combat,livingEnemies.length))releasePlayerCombatCommitment();
  if(deploymentStarted)reserveRaidBuildingAssignments(livingPlayerSoldiers);
  else for(const unit of livingPlayerSoldiers)clearBuildingAttackAssignments(unit);
  const commandableFollowers=INDEPENDENT_SOLDIERS?livingPlayerSoldiers:livingPlayerSoldiers.filter(unit=>{
    const anchor=ensureCompanyAnchor(unit.userData.companyId??0);
    const company=companies[unit.userData.companyId??0]??companies[0];
    const locked=!!unit.userData.lockedTarget?.userData.alive;
    if(locked)return true;
    const commanderMovingIndependently=!!company?.commander?.userData.manualMoving;
    return !anchor.moving&&(anchor.deployTimer??0)<=0&&!commanderMovingIndependently;
  });
  const combatAssignmentRoster=preserveLockedCombatants(livingPlayerSoldiers,commandableFollowers);
  const canAssignSoldierCombat=combat&&combatAssignmentRoster.length&&livingEnemySoldiers.length;
  if(!canAssignSoldierCombat)for(const unit of [...livingPlayerSoldiers,...livingEnemySoldiers])unit.userData.waitingDuelTarget=null;
  const engagements=canAssignSoldierCombat
    ?assignEngagements(combatAssignmentRoster,livingEnemySoldiers)
    :{aMap:new Map(),bMap:new Map(),aWaitMap:new Map(),bWaitMap:new Map()};
  const playerAssignments=engagements.aMap,enemyAssignments=engagements.bMap;
  const playerWaitingAssignments=engagements.aWaitMap,enemyWaitingAssignments=engagements.bWaitMap;
  const activeSoldierDuels=livingPlayerSoldiers.some(u=>livingEnemySoldiers.includes(u.userData.lockedTarget));
  if(activeEncounter){
    if(activeSoldierDuels)activeEncounter.commanderDuelTime=(activeEncounter.commanderDuelTime??0)+dt;
    else activeEncounter.commanderDuelTime=0;
  }
  const routeActors=[master,...livingFollowers,...livingEnemies];
  const playerCommanderTargets=assignCommanderTargets(
    livingPlayerCommanders,[...livingEnemySoldiers,...livingRivals],
    commander=>commander===master
  );
  const enemyCommanderTargets=assignCommanderTargets(
    livingRivals,[...livingPlayerSoldiers,...livingPlayerCommanders],
    ()=>true
  );
  if(!INDEPENDENT_SOLDIERS){
  const masterFoe=combat?(playerCommanderTargets.get(master)??rival??nearestAlive(master,livingEnemies)):null;
  if(masterFoe){
    if(commanderControlState({combat,manualOrder:!!master.userData.manualMoving||ensureCompanyAnchor(0).moving})==="engage"){
      steerTowards(master,commanderRoute(master,masterFoe,routeActors),1.55,4.4,dt);
    }
    const blockerIndex=chooseCommanderBlockerIndex({
      commander:master.position,target:masterFoe.position,
      soldiers:livingEnemySoldiers.map(soldier=>({x:soldier.position.x,z:soldier.position.z,alive:true,threatening:soldier.userData.lockedTarget===master}))
    });
    hit(master,blockerIndex>=0?livingEnemySoldiers[blockerIndex]:masterFoe,dt);
  }else if(!masterManualOrder)steerTowards(master,master.position,0,5.2,dt);
  followers.forEach((u,i)=>{
    if(!u.userData.alive)return;
    const company=companies[u.userData.companyId]??companies[0];
    if(u.userData.unitCommander){
      updatePlayerGroupCommander(u,company,{combat,livingRivals,livingEnemySoldiers,commanderTargets:playerCommanderTargets,routeActors,dt});
      return;
    }
    const leader=company.commander?.userData.alive?company.commander:master;
    const leaderForward=leader.userData.velocity.lengthSq()>.03?leader.userData.velocity.clone().normalize():forward;
    const distanceToMaster=u.position.distanceTo(leader.position);
    const localIndex=Math.max(0,company.soldiers.indexOf(u));
    const anchor=ensureCompanyAnchor(company.groupIndex),manualOrder=anchor.moving,companyDeploying=!manualOrder&&(anchor.deployTimer??0)>0;
    const committed=!!u.userData.lockedTarget?.userData.alive;
    let foe=playerAssignments.get(u)??(committed?u.userData.lockedTarget:null);
    const waitingDuel=playerWaitingAssignments.get(u);
    const combatState=soldierCombatState({combat,formingBattleLine:companyDeploying,targetAlive:!!foe?.userData.alive,waitingSlot:!!waitingDuel});
    u.userData.mode=combatState===SOLDIER_COMBAT_STATE.DUEL?SERVANT_MODE.ATTACK:SERVANT_MODE.FOLLOW;
    const emergencyFollow=combatState===SOLDIER_COMBAT_STATE.FORMATION&&(masterRetreating||distanceToMaster>5.1);
    const observed=observedLeader(u,leader,leaderForward,dt,emergencyFollow);
    let reposition=combatState===SOLDIER_COMBAT_STATE.FORMATION&&shouldRepositionFollower({combat,urgent:emergencyFollow||preparingForContact,leaderSpeed:leader.userData.velocity.length(),distanceToMaster,leash:4.2});
    const travelIndex=localIndex*companyCount+u.userData.companyId;
    let desired=reposition?travelFormationSlot(Math.max(0,travelIndex),livingFollowers.length,observed.position,observed.forward):u.position.clone(),duelMotion=null;
    if(reposition){desired.x+=Math.sin(totalTime*.72+u.userData.phase)*.12;desired.z+=Math.cos(totalTime*.61+u.userData.phase)*.12}
    const ownCommanderLeading=companyLeaderMoving.get(company.groupIndex);
    const commandState=companyCommandState({manualOrder,combat,enemyDetected:companyDeploying||preparingForContact,commanderMoving:ownCommanderLeading||anchor.followingCommander});
    if(manualOrder&&combatState===SOLDIER_COMBAT_STATE.FORMATION){
      const offset=companyBattleFormationOffset(localIndex,company.soldiers.length,expansionProgress);
      desired.copy(formationPoint(anchor,offset));
      const arrived=u.position.distanceTo(desired)<.14;
      reposition=!arrived;u.userData.holdPosition=arrived?desired.clone():null;
    }else if(!combat){
      if(commandState==="follow"||commandState==="deploy"){
        const offset=companyBattleFormationOffset(localIndex,company.soldiers.length,expansionProgress);
        const movingAnchor={position:observed.position,forward:observed.forward};
        desired=formationPoint(movingAnchor,offset);
        const arrived=u.position.distanceTo(desired)<.1;
        u.userData.holdPosition=arrived?desired.clone():null;
        anchor.followingCommander=ownCommanderLeading||!arrived;
        reposition=!arrived;
      }
    }
    if(waitingDuel){desired=duelWaitingPoint(u,waitingDuel);reposition=u.position.distanceTo(desired)>.12}
    if(foe?.userData.alive){
      duelMotion=updateDuel(u,foe,dt);
      if(!u.userData.alive)return;
      if(duelPathNeedsRelock(u,duelMotion.desired,foe,dt)){
        avoidBlockedDuelAndReassign(u);foe=null;duelMotion=null;
      }else{
        desired=duelMotion.desired;
      }
    }
    else if(u.userData.lockedTarget)resetDuel(u);
    if(combatState===SOLDIER_COMBAT_STATE.NEUTRAL){desired.copy(u.position);reposition=false}
    const spacingProfile=soldierSpacingProfile(!!duelMotion,livingPlayerSoldiers.length);
    const spacing=combatState===SOLDIER_COMBAT_STATE.FORMATION
      ?separationVector(u.position,[...livingPlayerCommanders,...livingPlayerSoldiers.filter(v=>v!==u)],spacingProfile.distance)
      :{x:0,z:0};
    const spacingActive=spacing.x*spacing.x+spacing.z*spacing.z>.0004;
    desired.x+=spacing.x*spacingProfile.strength;desired.z+=spacing.z*spacingProfile.strength;
    if(combat&&combatState===SOLDIER_COMBAT_STATE.FORMATION)for(const allyCommander of livingPlayerCommanders){
      const commanderForward=allyCommander.userData.velocity.lengthSq()>.03?allyCommander.userData.velocity.clone().normalize():forward;
      const clearance=commanderClearanceVector({soldier:u.position,commander:allyCommander.position,forward:commanderForward,preferRight:(u.id&1)===0});
      desired.x+=clearance.x*1.78;desired.z+=clearance.z*1.78;
    }
    if(combatState===SOLDIER_COMBAT_STATE.FORMATION&&combat&&!manualOrder&&!companyDeploying&&!duelMotion&&reposition)leashTarget(desired,leader,swarmTravelRadius(company.soldiers.length));
    const catchup=Math.min(1.45,Math.max(0,distanceToMaster-2.2)*.65);
    const speed=combatState===SOLDIER_COMBAT_STATE.NEUTRAL?0:combatState===SOLDIER_COMBAT_STATE.WAITING?1.7:duelMotion?.speed??(u.userData.mode===SERVANT_MODE.ATTACK?2.45:2.65+catchup);
    const acceleration=actorSteerAcceleration(u,duelMotion?.acceleration??(combatState===SOLDIER_COMBAT_STATE.NEUTRAL?8.2:u.userData.mode===SERVANT_MODE.ATTACK?5.7:reposition?7.2:4.2));
    const spacingSpeed=spacingActive&&!reposition&&!foe?1.05:speed;
    steerTowards(u,desired,combatState===SOLDIER_COMBAT_STATE.NEUTRAL?0:reposition||foe||spacingActive?spacingSpeed:0,acceleration,dt);
    if(foe?.userData.alive){const facing=foe.position.clone().sub(u.position);u.rotation.y=smoothAngle(u.rotation.y,Math.atan2(facing.x,facing.z),14,dt)}
    else if(waitingDuel){const facing=waitingDuel.center.clone().sub(u.position);u.rotation.y=smoothAngle(u.rotation.y,Math.atan2(facing.x,facing.z),10,dt)}
  });
  for(const company of companies){
    const anchor=ensureCompanyAnchor(company.groupIndex);
    const commanderTarget=company.commander===master?target:(anchor.commanderTarget??formationPoint(anchor,commanderFormationOffset(1.42)));
    if(anchor.moving&&company.soldiers.every(soldier=>!!soldier.userData.holdPosition)&&company.commander.position.distanceTo(commanderTarget)<.14){
      anchor.moving=false;anchor.followingCommander=false;
      if(combat)anchor.deployTimer=.78;
    }
  }
  }else{
    const raidTarget=activeRaidBuildings().length>0;
    for(const u of livingPlayerSoldiers){
      const foe=playerAssignments.get(u)??(u.userData.lockedTarget?.userData.alive?u.userData.lockedTarget:null);
      const waitingDuel=playerWaitingAssignments.get(u);
      updateIndependentSoldier(u,{combat,enemyInSight:threatDetected,raidTarget,foe,waitingDuel,peacefulPatrol,patrolAllies:livingPlayerSoldiers,dt});
    }
    for(const company of ensureCompanyLayout())if(ensureCompanyAnchor(company.groupIndex).moving&&company.soldiers.every(unit=>!unit.userData.manualMoving))ensureCompanyAnchor(company.groupIndex).moving=false;
  }
  enemyUnits.forEach((u,i)=>{
    if(!u.userData.alive)return;
    if(enemyRetreat){updateEnemyRetreatUnit(u,dt);return}
    if(updateBarracksDeparture(u,dt))return;
    if(u.userData.celebrating){pauseCelebratingUnit(u);return;}
    if(u.userData.isMaster){
      u.userData.sinceDamage+=dt;
      u.userData.hp=commanderRegenHealth(u.userData.hp,u.userData.maxHp,u.userData.sinceDamage,dt,u.userData.regenDelay,u.userData.regenPerSecond);
      const targetCommander=enemyCommanderTargets.get(u)??nearestAlive(u,livingPlayerCommanders)??master;
      let desired,speedScale=1;
      if(activeSoldierDuels&&livingEnemySoldiers.length&&livingPlayerSoldiers.length){
        const battleCenter=livingEnemySoldiers.reduce((sum,soldier)=>({x:sum.x+soldier.position.x/livingEnemySoldiers.length,z:sum.z+soldier.position.z/livingEnemySoldiers.length}),{x:0,z:0});
        const tactical=commanderTacticalWaypoint({commander:u.position,target:targetCommander.position,battleCenter,duelAge:activeEncounter.commanderDuelTime,flankSide:u.userData.flankSide??=(u.id&1?1:-1)});
        desired=new THREE.Vector3(tactical.x,GROUND_Y,tactical.z);speedScale=tactical.speedScale;
        if(tactical.phase==="engage"){
          desired.copy(commanderRoute(u,targetCommander,routeActors));
        }
      }else{
        desired=commanderRoute(u,targetCommander,routeActors);
      }
      steerTowards(u,desired,(combat?1.35:1.05)*speedScale,(combat?3.4:2.6)*Math.max(.55,speedScale),dt);
      const facing=targetCommander.position.clone().sub(u.position);if(facing.lengthSq()>.001)u.rotation.y=smoothAngle(u.rotation.y,Math.atan2(facing.x,facing.z),10,dt);
      if(combat){
        const blockerIndex=chooseCommanderBlockerIndex({
          commander:u.position,
          target:targetCommander.position,
          soldiers:livingPlayerSoldiers.map(soldier=>({x:soldier.position.x,z:soldier.position.z,alive:soldier.userData.alive,threatening:soldier.userData.lockedTarget===u}))
        });
        const blocker=blockerIndex>=0?livingPlayerSoldiers[blockerIndex]:null;
        hit(u,blocker??targetCommander,dt);
      }
      return;
    }
    const committed=!!u.userData.lockedTarget?.userData.alive;
    let foe=enemyAssignments.get(u)??(committed?u.userData.lockedTarget:null);
    const waitingDuel=enemyWaitingAssignments.get(u);
    if(peacefulPatrol&&!foe?.userData?.alive&&!waitingDuel){updatePeacefulPatrol(u,livingEnemies,dt);return;}
    const packIndex=Math.max(0,livingEnemySoldiers.indexOf(u));
    const distanceToPack=enemyPackAnchor?u.position.distanceTo(enemyPackAnchor.position):0;
    const combatState=soldierCombatState({combat,formingBattleLine:false,targetAlive:!!foe?.userData.alive,waitingSlot:!!waitingDuel});
    u.userData.mode=combatState===SOLDIER_COMBAT_STATE.DUEL?SERVANT_MODE.ATTACK:SERVANT_MODE.FOLLOW;
    const enemyTravelTarget=!combat?nearestAlive(u,livingPlayerSoldiers):null;
    let desired=enemyTravelTarget?.position.clone()??u.position.clone(),duelMotion=null;
    if(waitingDuel)desired=duelWaitingPoint(u,waitingDuel);
    if(foe&&u.userData.mode===SERVANT_MODE.ATTACK){
      foe=reviewEnemyDuelTarget(u,foe,livingPlayerSoldiers);
      duelMotion=updateDuel(u,foe,dt);
      if(!u.userData.alive)return;
      if(duelPathNeedsRelock(u,duelMotion.desired,foe,dt)){
        avoidBlockedDuelAndReassign(u);foe=null;duelMotion=null;
      }else{
        desired=duelMotion.desired;
      }
    }
    else if(u.userData.lockedTarget)resetDuel(u);
    const anchorGoal=combatState===SOLDIER_COMBAT_STATE.NEUTRAL&&u.userData.barracksSpawned?barracksAnchorDestination(u,livingEnemySoldiers):null;
    const patrolGoal=combatState===SOLDIER_COMBAT_STATE.NEUTRAL&&(!u.userData.barracksSpawned||!anchorGoal)?enemyRoamDestination(u,livingEnemySoldiers):null;
    const neutralGoal=anchorGoal??patrolGoal;
    if(combatState===SOLDIER_COMBAT_STATE.NEUTRAL){
      if(neutralGoal)desired.copy(neutralGoal);
      else desired.copy(u.position);
    }
    const spacingProfile=soldierSpacingProfile(!!duelMotion,livingEnemySoldiers.length);
    const spacing=combatState===SOLDIER_COMBAT_STATE.FORMATION
      ?separationVector(u.position,livingEnemySoldiers.filter(v=>v!==u),spacingProfile.distance)
      :{x:0,z:0};
    desired.x+=spacing.x*spacingProfile.strength;desired.z+=spacing.z*spacingProfile.strength;
    const catchup=Math.min(1.2,Math.max(0,distanceToPack-2.1)*.6);
    const speed=combatState===SOLDIER_COMBAT_STATE.NEUTRAL?(neutralGoal?2.15:0):combatState===SOLDIER_COMBAT_STATE.WAITING?1.7:duelMotion?.speed??(u.userData.mode===SERVANT_MODE.ATTACK?1.8:2.15+catchup);
    const acceleration=actorSteerAcceleration(u,duelMotion?.acceleration??(combatState===SOLDIER_COMBAT_STATE.NEUTRAL?8.2:u.userData.mode===SERVANT_MODE.ATTACK?4.4:6.2));
    const moveScale=editorActorMoveScale(u);
    steerTowards(u,desired,speed*moveScale,acceleration*Math.sqrt(moveScale),dt);
    if(foe?.userData.alive){const facing=foe.position.clone().sub(u.position);u.rotation.y=smoothAngle(u.rotation.y,Math.atan2(facing.x,facing.z),14,dt)}
    else if(waitingDuel){const facing=waitingDuel.center.clone().sub(u.position);u.rotation.y=smoothAngle(u.rotation.y,Math.atan2(facing.x,facing.z),10,dt)}
  });
  if(enemyRetreat){
    enemyUnits=enemyUnits.filter(unit=>unit.userData.alive&&unit.visible);
    enemyRetreat.elapsed+=dt;
    if(!enemyUnits.length){
      enemyRetreat=null;enemyPackAnchor=null;activeEncounter=null;
      showGameOverScreen();
    }
  }
  if(deploymentStarted)updateRaidBuildingCombat(livingPlayerSoldiers,dt);
  resolveCharacterCollisions();resolveNavigationObstacleCollisions();updateActorTerrainSupport(dt);resolveDebrisCollisions();
  if(!INDEPENDENT_SOLDIERS){
    sinceDamage+=dt;
    masterHealth=commanderRegenHealth(masterHealth,PLAYER_COMMANDER.maxHealth,sinceDamage,dt,PLAYER_COMMANDER.regenDelay,PLAYER_COMMANDER.regenPerSecond);
    master.userData.hp=masterHealth;master.userData.sinceDamage=sinceDamage;
    updateMasterDamageEffect(dt);
  }
  updatePlayerSoldierRegeneration(dt);
  updateSoldierDamageEffects(dt);updateActorCombatAnimations(dt);updateActorHealthWidgets(dt);updateRaidBuildingHealthWidgets(dt);decayDebugSignals(dt);
  resolveBattle();updateParticles(dt);updateSelectionVisuals();updateDeploymentEnemyOccupancy();
}

function buildOverview(){
  overview.clear();hoverable.length=0;
  const water2=new THREE.Mesh(new THREE.CircleGeometry(38,48),mats.water);water2.rotation.x=-Math.PI/2;water2.position.y=-1.2;overview.add(water2);
  campaign.regions.forEach(r=>{
    const revealed=r.revealed, owned=r.owner===FACTION.PLAYER, frontier=revealed&&!owned;
    const m=owned?mats.player:frontier?mats.amber:mat(0x91a6a5);
    const tile=new THREE.Mesh(new THREE.CylinderGeometry(3.25,2.85,1.05,8),m);tile.position.set((r.x-5)*.62,0,(r.z+21)*.45);tile.userData.region=r;tile.castShadow=true;tile.receiveShadow=true;
    overview.add(tile);hoverable.push(tile);
    if(revealed){const b=makeBanner(owned?COLORS.player:(COLORS[r.owner]||COLORS.amber));b.scale.setScalar(.78);b.position.copy(tile.position);b.position.y=.55;overview.add(b)}
    if(!revealed){const mist=new THREE.Mesh(new THREE.SphereGeometry(3.6,12,8),new THREE.MeshBasicMaterial({color:COLORS.water,transparent:true,opacity:.7,depthWrite:false}));mist.scale.y=.35;mist.position.copy(tile.position);mist.position.y=1;overview.add(mist)}
  });
}
function openMap(){clearTacticalSelection();mode="map";battle.visible=false;overview.visible=true;buildOverview();$("map-panel").classList.remove("hidden");$("map").textContent=STR.closeMap;synthTone(330,.5,"sine",.025);showToast(STR.revealed,1400)}
function closeMap(){mode="playing";overview.visible=false;battle.visible=true;$("map-panel").classList.add("hidden");$("map").textContent=STR.map}
function ensureCompanyLayout(){
  const living=followers.filter(unit=>unit.userData.alive);
  if(INDEPENDENT_SOLDIERS){
    const groupIds=[...new Set(living.map(unit=>unit.userData.companyId=deploymentGroupId(unit.userData.actorArchetypeId)))].sort((a,b)=>a-b);
    playerCompanies=groupIds.map(groupIndex=>({groupIndex,commander:null,soldiers:living.filter(unit=>unit.userData.companyId===groupIndex)}));companyLayoutDirty=false;
    for(const id of [...companyAnchors.keys()])if(!groupIds.includes(id))companyAnchors.delete(id);
    for(const company of playerCompanies)if(!companyAnchors.has(company.groupIndex)){
      const anchor=company.soldiers.reduce((sum,actor)=>sum.add(actor.position),new THREE.Vector3()).multiplyScalar(1/company.soldiers.length);anchor.y=GROUND_Y;
      companyAnchors.set(company.groupIndex,{position:anchor,forward:new THREE.Vector3(0,0,-1),moving:false,deployTimer:0,followingCommander:false});
    }
    return playerCompanies;
  }
  const promoted=living.filter(unit=>unit.userData.unitCommander).sort((a,b)=>(a.userData.companyId??0)-(b.userData.companyId??0));
  const commanders=[master,...promoted];
  if(companyLayoutDirty||playerCompanies.length!==commanders.length){
    const oldToNew=new Map([[master.userData.companyId??0,0]]);
    master.userData.companyId=0;
    promoted.forEach((unit,index)=>{
      oldToNew.set(unit.userData.companyId,index+1);
      unit.userData.companyId=index+1;
    });
    const populations=Array.from({length:commanders.length},()=>0);
    for(const unit of living){
      if(unit.userData.unitCommander)continue;
      const mapped=oldToNew.get(unit.userData.companyId);
      const companyId=mapped??populations.indexOf(Math.min(...populations));
      unit.userData.companyId=companyId;populations[companyId]++;
    }
    companyLayoutDirty=false;
  }
  playerCompanies=commanders.map((commander,groupIndex)=>({
    groupIndex,commander,soldiers:living.filter(unit=>!unit.userData.unitCommander&&unit.userData.companyId===groupIndex)
  }));
  for(const id of [...companyAnchors.keys()])if(id>=playerCompanies.length)companyAnchors.delete(id);
  for(const company of playerCompanies)if(!companyAnchors.has(company.groupIndex)){
    const members=[company.commander,...company.soldiers].filter(Boolean);
    const anchor=members.length
      ? members.reduce((sum,actor)=>sum.add(actor.position),new THREE.Vector3()).multiplyScalar(1/members.length)
      : master.position.clone();
    anchor.y=GROUND_Y;companyAnchors.set(company.groupIndex,{position:anchor,forward:new THREE.Vector3(0,0,-1),moving:false,deployTimer:0,followingCommander:false});
  }
  return playerCompanies;
}
function companyRoster(){return ensureCompanyLayout()}
function promoteGroupCommander(unit,newCompanyId){
  const profile=unitCommanderProfile();
  unit.userData.unitCommander=true;unit.userData.isMaster=true;unit.userData.companyId=newCompanyId;
  unit.userData.maxHp=profile.maxHealth;unit.userData.hp=profile.maxHealth;unit.userData.attack=profile.attack;
  unit.userData.regenDelay=profile.regenDelay;unit.userData.regenPerSecond=profile.regenPerSecond;unit.userData.sinceDamage=99;
  unit.userData.collisionHalf=actorCollisionProfile("commander");unit.userData.attackAnim=0;unit.userData.damageAnim=0;
  unit.userData.manualMoving=false;unit.userData.manualTarget=null;
  tintCharacter(unit,COLORS.player);prepareDamageVisual(unit);
  if(unit.userData.healthWidget)unit.remove(unit.userData.healthWidget);
  makeActorHealthWidget(unit,true);showActorHealth(unit,profile.maxHealth);
}
function divideCompany(companyId){
  const company=ensureCompanyLayout().find(item=>item.groupIndex===companyId);
  if(!company||!canDivideCompany(company.soldiers.length))return false;
  const plan=companyDivisionPlan(company.soldiers.length),commander=company.soldiers[plan.promotedIndex];
  const newCompanyId=ensureCompanyLayout().length;
  promoteGroupCommander(commander,newCompanyId);
  for(const index of plan.transferIndices){
    const soldier=company.soldiers[index];if(soldier&&soldier!==commander)soldier.userData.companyId=newCompanyId;
  }
  companyLayoutDirty=true;ensureCompanyLayout();
  const newAnchor=ensureCompanyAnchor(newCompanyId);newAnchor.position.copy(commander.position);newAnchor.forward.copy(ensureCompanyAnchor(companyId).forward);
  gameplayCameraBaselineScale=cameraBaselineAfterDivision(gameplayCameraBaselineScale);
  showToast(STR.groupDivided,1500);synthTone(520,.2,"triangle",.025);updateDivideControl();updateStats();return true;
}
function updateDivideControl(){
  const button=$("divide-company");if(!button)return;
  if(INDEPENDENT_SOLDIERS){button.classList.add("hidden");return}
  const company=selectedCompanyId===null?null:ensureCompanyLayout().find(item=>item.groupIndex===selectedCompanyId);
  button.classList.toggle("hidden",!!selectedCommander||!company||!canDivideCompany(company.soldiers.length));
}
function renderCompanies(){
  const list=$("companies-list");list.replaceChildren();
  for(const company of companyRoster()){
    const row=document.createElement("div");row.className="company-row";
    const number=document.createElement("span");number.className="company-number";number.textContent=company.groupIndex+1;
    const copy=document.createElement("div");copy.className="company-copy";
    const title=document.createElement("strong");title.textContent=`${STR.company} ${company.groupIndex+1}`;
    const detail=document.createElement("small");detail.textContent=`${company.soldiers.length} ${STR.soldiers}`;
    copy.append(title,detail);
    row.append(number,copy);
    if(canDivideCompany(company.soldiers.length)){
      const button=document.createElement("button");button.className="split-button";button.textContent=`\u2197 ${STR.divide}`;
      button.onclick=()=>{if(divideCompany(company.groupIndex))renderCompanies()};
      row.append(button);
    }
    list.append(row);
  }
  if(!list.children.length){const empty=document.createElement("p");empty.textContent=STR.noLivingSoldiers;list.append(empty)}
}
function openCompanies(){
  if(mode!=="playing")return;
  clearTacticalSelection();
  mode="companies";renderCompanies();$("companies-panel").classList.remove("hidden");synthTone(250,.18,"sine",.018);
}
function closeCompanies(){if(mode!=="companies")return;mode="playing";$("companies-panel").classList.add("hidden")}
function chooseRegion(region){
  if(activeEncounter?.aggro&&!activeEncounter.done){showToast(STR.battleLocked,1200);return}
  if(!region.revealed||region.owner===FACTION.PLAYER)return;
  selectedRegion=region.id;closeMap();master.userData.velocity.set(0,0,0);scheduleNextWave();showToast(STR.objective,1200);
}

function setPointerFromClient(clientX,clientY){
  const rect=canvas.getBoundingClientRect();
  pointer.x=((clientX-rect.left)/rect.width)*2-1;pointer.y=-((clientY-rect.top)/rect.height)*2+1;
  raycaster.setFromCamera(pointer,camera);
}
function editorGroundPoint(clientX,clientY,targetPoint=new THREE.Vector3()){
  setPointerFromClient(clientX,clientY);
  return raycaster.ray.intersectPlane(editorGroundPlane,targetPoint)?targetPoint:null;
}
function isFoliageAssetId(assetId){return /^(tree(?::|\-billboard:)|grass-cluster(?::|$)|sprite-grass:|meadow-grass-blade$)/.test(assetId??"")}
function editorAssetIdForObject(object){
  const type=object?.userData?.editorAssetType;
  if(type==="hud-widget")return object.userData.hudAssetId??hudAssetId(object.userData.hudArchetypeId);
  if(type==="hud-text")return object.userData.hudAssetId??HUD_TEXT_ASSET_ID;
  if(type==="tree-billboard")return `tree-billboard:${object.userData.variantIndex??DEFAULT_TALL_CONIFER_VARIANT}`;
  if(type==="tree-cluster")return `tree:${object.userData.variantIndex??0}`;
  if(type==="grass-cluster"&&object.userData.grassSprite)return `sprite-grass:${object.userData.spriteIndex??0}`;
  if(type==="grass-cluster"&&object.userData.meadowGrassBlade)return "meadow-grass-blade";
  if(type==="grass-cluster")return `grass-cluster:${object.userData.variantIndex??0}`;
  return null;
}
function foliagePaintRadiusFor(assetId,scale=1){
  if(assetId?.startsWith("tree:"))return 1.05*scale;
  if(assetId?.startsWith("tree-billboard:"))return .38*scale;
  if(assetId?.startsWith("grass-cluster:"))return .3*scale;
  return .18*scale;
}
function ensureFoliagePaintBrush(){
  if(foliagePaintBrush)return foliagePaintBrush;
  foliagePaintBrush=new THREE.Mesh(new THREE.RingGeometry(.965,1,72),new THREE.MeshBasicMaterial({color:0x72dfc1,transparent:true,opacity:.92,side:THREE.DoubleSide,depthTest:true,depthWrite:false,toneMapped:false}));
  foliagePaintBrush.rotation.x=-Math.PI*.5;foliagePaintBrush.position.y=GROUND_Y+.025;foliagePaintBrush.renderOrder=38;foliagePaintBrush.visible=false;scene.add(foliagePaintBrush);return foliagePaintBrush;
}
function updateFoliagePaintBrush(point){
  const brush=ensureFoliagePaintBrush(),visible=foliagePaintActive&&mode==="editor"&&Boolean(point);
  brush.visible=visible;if(!visible)return;
  brush.position.set(point.x,GROUND_Y+.025,point.z);brush.scale.setScalar(FOLIAGE_PAINT.brushSize);brush.material.color.setHex(foliagePaintOperation==="remove"?0xd95d61:0x72dfc1);
}
function removePaintedFoliage(point){
  const inRange=[...editorFoliageObjects].filter(object=>object.parent&&Math.hypot(object.position.x-point.x,object.position.z-point.z)<=FOLIAGE_PAINT.brushSize);
  const matching=editorFoliagePaintSelection.size?inRange.filter(object=>editorFoliagePaintSelection.has(editorAssetIdForObject(object))):[];
  const candidates=(matching.length?matching:inRange).sort((a,b)=>a.position.distanceToSquared(point)-b.position.distanceToSquared(point)).slice(0,FOLIAGE_PAINT.paintAmount);
  for(const object of candidates)removeEditorObject(object);
  return candidates.length;
}
function addPaintedFoliage(point){
  const selected=[...editorFoliagePaintSelection].filter(assetId=>isFoliageAssetId(assetId)&&!hiddenEditorAssets.has(assetId));if(!selected.length)return 0;
  let added=0;
  for(let attempt=0;attempt<FOLIAGE_PAINT.paintAmount*8&&added<FOLIAGE_PAINT.paintAmount;attempt++){
    const angle=Math.random()*Math.PI*2,distance=Math.sqrt(Math.random())*FOLIAGE_PAINT.brushSize,assetId=selected[Math.floor(Math.random()*selected.length)],scaleFactor=1+(Math.random()*2-1)*FOLIAGE_PAINT.scaleVariation/100;
    const candidate=new THREE.Vector3(point.x+Math.cos(angle)*distance,GROUND_Y,point.z+Math.sin(angle)*distance),radius=foliagePaintRadiusFor(assetId,scaleFactor);
    let blocked=false;
    for(const object of editorFoliageObjects){if(!object.parent)continue;const otherRadius=object.userData.foliagePaintRadius??foliagePaintRadiusFor(editorAssetIdForObject(object),Math.max(object.scale.x,object.scale.z));if(Math.hypot(object.position.x-candidate.x,object.position.z-candidate.z)<radius+otherRadius){blocked=true;break}}
    if(blocked)continue;
    const object=createEditorAsset(assetId,candidate,{recordUndo:false,select:false});if(!object)continue;
    const baseScale=object.scale.clone();object.scale.copy(baseScale).multiplyScalar(scaleFactor);syncGrassSizeBaseScale(object);object.userData.foliagePaintRadius=radius;added++;
  }
  return added;
}
function stampFoliagePaint(point){
  if(!foliagePaintActive||!point)return 0;
  const changed=foliagePaintOperation==="remove"?removePaintedFoliage(point):addPaintedFoliage(point);
  if(!changed&&foliagePaintOperation==="add"&&!editorFoliagePaintSelection.size)$("editor-status").textContent="Select one or more Tree or Grass assets to paint.";
  return changed;
}
function foliagePaintChoices(){
  return [
    {label:"TREES",items:[
      ...TREE_CLUSTER_VARIANTS.map((trees,index)=>({assetId:`tree:${index}`,label:`Cluster ${String(index+1).padStart(2,"0")}`,preview:()=>treeAssetPreview(trees)})),
      ...TALL_CONIFER_VARIANTS.map((variant,index)=>({assetId:`tree-billboard:${index}`,label:variant.label,preview:()=>spritePreview("tree-billboard-preview","./assets/Trees/tall-conifer-billboard.png")}))
    ]},
    {label:"GRASS",items:[
      ...GRASS_CLUSTER_VARIANTS.map((blades,index)=>{const {category,versionNumber}=grassClusterIdentity(index);return {assetId:`grass-cluster:${index}`,label:`${category.label} ${String(versionNumber).padStart(2,"0")}`,preview:()=>grassAssetPreview(blades)}}),
      ...SPRITE_GRASS_ASSETS.map((spec,index)=>({assetId:`sprite-grass:${index}`,label:spec.label,preview:()=>spritePreview("sprite-grass-preview",spec.src)})),
      {assetId:"meadow-grass-blade",label:"MEADOW BLADE",preview:()=>grassAssetPreview([{x:0,z:0,height:.78,width:.2,turn:0}])}
    ]}
  ];
}
function spritePreview(className,src){const preview=document.createElement("span"),image=document.createElement("img");preview.className=`sprite-grass-preview ${className}`;image.src=src;image.alt="";preview.append(image);return preview;}
function renderFoliagePaintChoices(){
  const list=$("foliage-paint-assets");if(!list)return;list.replaceChildren();
  for(const group of foliagePaintChoices()){
    const section=document.createElement("section"),heading=document.createElement("strong"),items=document.createElement("div");
    section.className="foliage-paint-asset-group";heading.textContent=group.label;items.className="foliage-paint-choice-list";section.append(heading,items);
    for(const item of group.items){
      if(hiddenEditorAssets.has(item.assetId))continue;
      const choice=document.createElement("button"),label=document.createElement("strong");choice.type="button";choice.className="foliage-paint-choice";choice.dataset.asset=item.assetId;choice.setAttribute("aria-pressed",String(editorFoliagePaintSelection.has(item.assetId)));label.textContent=item.label;choice.append(item.preview(),label);
      choice.onclick=()=>armEditorAsset(item.assetId,item.label);items.append(choice);
    }
    if(items.childElementCount)list.append(section);
  }
}
function syncFoliagePaintControls(){
  document.querySelectorAll("[data-foliage-paint-setting]").forEach(input=>{const key=input.dataset.foliagePaintSetting,value=FOLIAGE_PAINT[key];input.value=String(value);const output=document.querySelector(`[data-foliage-paint-output="${key}"]`);if(output)output.textContent=key==="scaleVariation"?`${value}%`:`${value}`;});
  for(const operation of ["add","remove"]){const button=$("foliage-paint-"+operation);button.setAttribute("aria-pressed",String(foliagePaintOperation===operation));}
}
function setFoliagePaintActive(active){
  foliagePaintActive=Boolean(active)&&mode==="editor";foliagePaintStroke=null;editorPointerState=null;editorPendingAsset=null;editorTransformMode=null;disposeEditorTransformGizmo();updateEditorTransformControls();
  $("editor-context-foliage").setAttribute("aria-pressed",String(foliagePaintActive));$("foliage-paint-panel").classList.toggle("hidden",!foliagePaintActive);document.body.classList.toggle("foliage-paint-active",foliagePaintActive);updateFoliagePaintBrush(null);
  if(foliagePaintActive){selectEditorObject(null);if(!editorFoliagePaintSelection.size)editorFoliagePaintSelection.add("tree-billboard:2");$("editor-status").textContent="Select foliage, then click or drag the terrain to paint.";}
  else $("editor-status").textContent="Arrow keys or drag empty ground to explore.";
  renderFoliagePaintChoices();updateEditorAssetSelection();syncFoliagePaintControls();
}
function editorObjectFromHit(object){
  let current=object;
  while(current&&current!==battle){if(current.userData?.editorSelectable)return current;current=current.parent}
  return null;
}
function editorNearbyObjectAt(clientX,clientY){
  const rect=canvas.getBoundingClientRect();
  let nearest=null,nearestDistance=Infinity;
  for(const object of editorObjects){
    const type=object.userData?.editorAssetType;
    if(!object.visible||["world-floor","tile-spawner","hud-widget","hud-text"].includes(type))continue;
    const bounds=new THREE.Box3().setFromObject(object);
    if(bounds.isEmpty())continue;
    const center=bounds.getCenter(new THREE.Vector3()).project(camera);
    if(center.z<-1||center.z>1)continue;
    let left=Infinity,right=-Infinity,top=Infinity,bottom=-Infinity;
    for(const x of [bounds.min.x,bounds.max.x])for(const y of [bounds.min.y,bounds.max.y])for(const z of [bounds.min.z,bounds.max.z]){
      const corner=new THREE.Vector3(x,y,z).project(camera),screenX=rect.left+(corner.x+1)*rect.width/2,screenY=rect.top+(1-corner.y)*rect.height/2;
      left=Math.min(left,screenX);right=Math.max(right,screenX);top=Math.min(top,screenY);bottom=Math.max(bottom,screenY);
    }
    if(right-left>120||bottom-top>120)continue;
    const halfWidth=Math.max(14,(right-left)/2+8),halfHeight=Math.max(14,(bottom-top)/2+8);
    const distance=Math.hypot((clientX-(left+right)/2)/halfWidth,(clientY-(top+bottom)/2)/halfHeight);
    if(distance<=1&&distance<nearestDistance){nearest=object;nearestDistance=distance;}
  }
  return nearest;
}
function editorObjectAt(clientX,clientY){
  setPointerFromClient(clientX,clientY);
  let surface=null;
  for(const hit of raycaster.intersectObjects(editorObjects,true)){
    const object=editorObjectFromHit(hit.object);
    if(!object||!object.visible||["hud-widget","hud-text"].includes(object.userData.editorAssetType))continue;
    if(["world-floor","tile-spawner"].includes(object.userData.editorAssetType)){surface=object;break;}
    return object;
  }
  return editorNearbyObjectAt(clientX,clientY)??surface;
}
function disposeEditorSelectionHelper(){
  for(const helper of editorSelectionHelpers){scene.remove(helper);helper.traverse?.(part=>{part.geometry?.dispose?.();for(const material of Array.isArray(part.material)?part.material:[part.material])material?.dispose?.();});}
  editorSelectionHelpers=[];editorSelectionHelper=null;
}
function editorCollisionSelectionHelper(object){
  const meshes=crownwakeCollisionMeshes(object);if(!meshes.length)return null;
  const helper=new THREE.Group(),entries=[];
  for(const mesh of meshes){
    const outline=new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry),new THREE.LineBasicMaterial({color:0xf7fff1,transparent:true,opacity:1,depthTest:false,depthWrite:false}));
    outline.matrixAutoUpdate=false;outline.frustumCulled=false;helper.add(outline);entries.push({mesh,outline});
  }
  helper.update=()=>{object.updateWorldMatrix(true,true);for(const {mesh,outline} of entries){outline.matrix.copy(mesh.matrixWorld);outline.matrixWorld.copy(mesh.matrixWorld);outline.matrixWorldNeedsUpdate=true;}};
  helper.update();return helper;
}
function styleEditorSelectionHelper(helper,opacity){
  helper.traverse(part=>{for(const material of Array.isArray(part.material)?part.material:[part.material])if(material){material.transparent=true;material.opacity=opacity;material.depthTest=false;material.depthWrite=false;}part.renderOrder=50;});
}
const EDITOR_GIZMO_COLORS={x:0xe8535f,y:0x53c987,z:0x478ee5};
function disposeEditorTransformGizmo(){
  if(!editorTransformGizmo)return;
  scene.remove(editorTransformGizmo);editorTransformGizmo.traverse(part=>{part.geometry?.dispose?.();part.material?.dispose?.();});editorTransformGizmo=null;
}
function markEditorTransformHandle(object,axis,mode){
  object.userData.editorTransformAxis=axis;object.userData.editorTransformMode=mode;
  object.traverse(part=>{part.userData.editorTransformAxis=axis;part.userData.editorTransformMode=mode;});
}
function editorGizmoMaterial(color){return new THREE.MeshBasicMaterial({color,transparent:true,opacity:.96,depthTest:false,depthWrite:false});}
function addEditorAxisArrow(gizmo,axis,mode,length){
  const direction={x:new THREE.Vector3(1,0,0),y:new THREE.Vector3(0,1,0),z:new THREE.Vector3(0,0,1)}[axis];
  const arrow=new THREE.ArrowHelper(direction,new THREE.Vector3(),length,EDITOR_GIZMO_COLORS[axis],length*.26,length*.14);
  arrow.line.material.depthTest=false;arrow.cone.material.depthTest=false;arrow.line.renderOrder=61;arrow.cone.renderOrder=62;markEditorTransformHandle(arrow,axis,mode);gizmo.add(arrow);
  if(mode==="scale"){
    const handle=new THREE.Mesh(new THREE.BoxGeometry(.18,.18,.18),editorGizmoMaterial(EDITOR_GIZMO_COLORS[axis]));handle.position.copy(direction).multiplyScalar(length);markEditorTransformHandle(handle,axis,mode);handle.renderOrder=63;gizmo.add(handle);
  }
}
function buildEditorTransformGizmo(){
  disposeEditorTransformGizmo();if(!editorSelection||!editorTransformMode||mode!=="editor")return;
  const gizmo=new THREE.Group();gizmo.name="Editor transform gizmo";gizmo.userData.editorTransformGizmo=true;
  if(editorTransformMode==="rotate"){
    for(const [axis,rotation] of [["x",[0,Math.PI*.5,0]],["y",[Math.PI*.5,0,0]],["z",[0,0,0]]]){
      const ring=new THREE.Mesh(new THREE.TorusGeometry(1,.045,8,48),editorGizmoMaterial(EDITOR_GIZMO_COLORS[axis]));ring.rotation.set(...rotation);ring.renderOrder=62;markEditorTransformHandle(ring,axis,"rotate");gizmo.add(ring);
    }
  }else{
    for(const axis of ["x","y","z"])addEditorAxisArrow(gizmo,axis,editorTransformMode,1.25);
  }
  editorTransformGizmo=gizmo;scene.add(gizmo);updateEditorTransformGizmo();
}
function updateEditorTransformGizmo(){
  if(!editorTransformGizmo||!editorSelection)return;
  const selection=[...editorSelectedObjects].filter(object=>editorObjects.includes(object)),bounds=new THREE.Box3().makeEmpty();
  for(const object of selection){object.updateWorldMatrix(true,true);bounds.expandByObject(object);}
  if(bounds.isEmpty())return;
  const size=bounds.getSize(new THREE.Vector3()),center=bounds.getCenter(new THREE.Vector3());
  const span=Math.max(size.x,size.y,size.z,1);const gizmoScale=THREE.MathUtils.clamp(span*.34,1.15,3.8)*editorCameraScale;
  editorTransformGizmo.position.copy(center);editorTransformGizmo.scale.setScalar(gizmoScale);editorTransformGizmo.visible=mode==="editor";
}
function editorGizmoHit(clientX,clientY){
  if(!editorTransformGizmo)return null;setPointerFromClient(clientX,clientY);
  for(const hit of raycaster.intersectObject(editorTransformGizmo,true)){
    let part=hit.object;
    while(part&&part!==editorTransformGizmo){if(part.userData.editorTransformAxis)return {axis:part.userData.editorTransformAxis,mode:part.userData.editorTransformMode};part=part.parent;}
  }
  return null;
}
function ensureEditorCameraObject(){
  if(!editorCameraObject){
    const cameraMarker=new THREE.Group();cameraMarker.name="Gameplay Camera";
    cameraMarker.userData={editorSelectable:true,editorProtected:true,editorCamera:true,editorAssetType:"editor-camera"};
    cameraMarker.rotation.copy(editorCameraRotation);
    const billboard=new THREE.Sprite(new THREE.SpriteMaterial({map:editorCameraPlaceholderTexture,color:0xffffff,transparent:true,alphaTest:.02,depthWrite:false}));
    billboard.name="Camera Placeholder";billboard.scale.set(1.1,1.1,1);billboard.position.y=.55;
    cameraMarker.add(billboard);battle.add(cameraMarker);editorObjects.push(cameraMarker);editorCameraObject=cameraMarker;
  }
  editorCameraObject.position.set(editorCameraFocus.x,GROUND_Y,editorCameraFocus.z);editorCameraObject.visible=mode==="editor";
  return editorCameraObject;
}
function syncEditorCameraFocusFromObject(object=editorCameraObject){
  if(!object?.userData?.editorCamera)return;
  editorCameraFocus.set(object.position.x,0,object.position.z);editorCameraRotation.copy(object.rotation);
}
function removeEditorCameraObject(){
  if(!editorCameraObject)return;
  const index=editorObjects.indexOf(editorCameraObject);if(index>=0)editorObjects.splice(index,1);
  battle.remove(editorCameraObject);editorCameraObject=null;
}
function initializeEditorShell(){
  const move=(id,slot)=>{const node=$(id),target=$(slot);if(node&&target)target.append(node)};
  move("editor-toolbar","editor-toolbar-slot");
  move("asset-panel","editor-content-drawer-slot");move("foliage-paint-panel","editor-foliage-context-slot");
  move("world-outliner","editor-outliner-slot");move("editor-transform-panel","editor-transform-slot");
  move("foliage-panel","editor-foliage-slot");move("foliage-presets-panel","editor-foliage-slot");
  move("world-look-panel","editor-environment-slot");move("editor-status","editor-status-slot");
}
function applyEditorLayout({save=true}={}){
  const shell=$("editor-shell");if(!shell)return;
  editorLayout.leftWidth=THREE.MathUtils.clamp(Number(editorLayout.leftWidth)||280,240,360);editorLayout.rightWidth=THREE.MathUtils.clamp(Number(editorLayout.rightWidth)||320,280,420);
  editorLayout.contentDrawerHeight=THREE.MathUtils.clamp(Number(editorLayout.contentDrawerHeight)||340,180,Math.max(180,innerHeight-120));
  shell.style.setProperty("--editor-left-width",`${editorLayout.leftWidth}px`);shell.style.setProperty("--editor-right-width",`${editorLayout.rightWidth}px`);
  shell.style.setProperty("--editor-content-drawer-height",`${editorLayout.contentDrawerHeight}px`);
  document.body.style.setProperty("--editor-left-width",`${editorLayout.leftWidth}px`);document.body.style.setProperty("--editor-right-width",`${editorLayout.rightWidth}px`);
  shell.classList.toggle("left-collapsed",Boolean(editorLayout.leftCollapsed));shell.classList.toggle("right-collapsed",Boolean(editorLayout.rightCollapsed));shell.classList.toggle("viewport-maximized",Boolean(editorLayout.maximized));
  document.body.classList.toggle("editor-left-collapsed",Boolean(editorLayout.leftCollapsed));document.body.classList.toggle("editor-right-collapsed",Boolean(editorLayout.rightCollapsed));document.body.classList.toggle("editor-viewport-maximized",Boolean(editorLayout.maximized));
  $("editor-left-collapse").setAttribute("aria-pressed",String(Boolean(editorLayout.leftCollapsed)));$("editor-right-collapse").setAttribute("aria-pressed",String(Boolean(editorLayout.rightCollapsed)));$("editor-maximize").setAttribute("aria-pressed",String(Boolean(editorLayout.maximized)));
  if(save)persistEditorLayout();requestAnimationFrame(resize);
}
function setEditorContext(context){
  if(!(context in EDITOR_CONTEXTS))return;editorContext=context;
  for(const key of Object.keys(EDITOR_CONTEXTS)){
    $("editor-context-"+key)?.setAttribute("aria-pressed",String(key===context));
    document.querySelector(`[data-editor-context-panel="${key}"]`)?.classList.toggle("hidden",key!==context);
  }
  const descriptor=EDITOR_CONTEXTS[context];$("editor-context-title").textContent=descriptor.title;$("editor-context-kicker").textContent=descriptor.kicker;
  if(context!=="foliage"&&foliagePaintActive)setFoliagePaintActive(false);
  if(context==="assets")setAssetPanel(true);
  if(context==="foliage")setFoliagePaintActive(true);
  updateEditorInspector();
}
function toggleEditorViewportMaximize(){editorLayout.maximized=!editorLayout.maximized;applyEditorLayout();$("editor-status").textContent=editorLayout.maximized?"Viewport maximized. Press Tab to restore the editor panels.":"Editor panels restored.";}
function saveEditorSession(){saveLevelLayout();persistEditorLayout();$("editor-status").textContent="Level and editor layout saved locally.";}
function selectedEditorActorProfile(){
  const actor=editorSelectedObjects.size===1&&editorSelection?.userData?.editorActor?editorSelection:null;
  if(actor){
    const archetype=actorArchetype(actor.userData.actorArchetypeId,actor.userData.faction);
    return {actor,archetype,name:actor.name||archetype.label,values:actor.userData};
  }
  if(contentBrowserSelection.size!==1||!editorLibrarySelection)return null;
  const match=/^character:(ch|en)([2-5])?$/.exec(editorLibrarySelection),archetypeId=match?`${match[1]}${match[2]??"1"}`:null,archetype=ACTOR_ARCHETYPES[archetypeId];if(!archetype)return null;
  return {actor:null,archetype,name:contentBrowserAssetById(editorLibrarySelection)?.name||archetype.label,values:actorBlueprintProfile(archetype.id,archetype.faction)};
}
function progressBarBlueprintOptions(){return [ACTOR_PROGRESS_BAR_BP_ASSET_ID,BUILDING_PROGRESS_BAR_BP_ASSET_ID].map(assetId=>contentBrowserAssetById(assetId)).filter(Boolean)}
function populateProgressBarSelect(input,assetId,fallbackAssetId,enabled){
  if(!input)return;
  input.replaceChildren(...progressBarBlueprintOptions().map(asset=>{const option=document.createElement("option");option.value=asset.id;option.textContent=asset.name;return option;}));
  input.value=isProgressBarBlueprint(assetId)?assetId:fallbackAssetId;input.disabled=!enabled;
}
function populateContentBrowserModelSelect(input,assetId,fallbackAssetId=CHARACTER_MODEL_ASSET_ID,enabled=false){
  if(!input)return;
  const options=contentBrowserModelOptions(),resolvedAssetId=resolveContentBrowserModelId(assetId,fallbackAssetId);
  input.replaceChildren(...options.map(option=>{const element=document.createElement("option");element.value=option.id;element.textContent=option.label;return element;}));
  input.value=resolvedAssetId;input.disabled=!enabled;
}
function selectedContentBrowserModelAsset(){
  if(contentBrowserSelection.size!==1||!editorLibrarySelection)return null;
  const asset=contentBrowserAssetById(editorLibrarySelection);return isContentBrowserModelAsset(asset)?asset:null;
}
function updateEditorModelScaleLock(){
  const button=$("editor-model-scale-lock");if(!button)return;
  button.textContent=String.fromCodePoint(editorModelScaleLocked?0x1f512:0x1f513);button.setAttribute("aria-pressed",String(editorModelScaleLocked));
  button.setAttribute("aria-label",editorModelScaleLocked?"Unlock proportional model scale":"Lock proportional model scale");button.title=button.getAttribute("aria-label");
}
function toggleEditorModelScaleLock(){
  editorModelScaleLocked=!editorModelScaleLocked;updateEditorModelScaleLock();
  $("editor-status").textContent=editorModelScaleLocked?"Model scale locked - proportions are preserved.":"Model scale unlocked - edit each axis separately.";
}
function updateEditorModelInspector(){
  const asset=selectedContentBrowserModelAsset(),scale=contentBrowserModelScale(asset?.id),enabled=Boolean(asset);
  $("editor-model-name").textContent=asset?.name?.toUpperCase()||"MODEL";
  document.querySelectorAll("[data-model-scale]").forEach(input=>{const axis=Number(input.dataset.modelScale),value=scale[axis];input.value=Number.isFinite(value)?String(Math.round(value*100)/100):"1";input.disabled=!enabled;});
  const lock=$("editor-model-scale-lock");if(lock)lock.disabled=!enabled;updateEditorModelScaleLock();
}
function updateEditorActorInspector(){
  const libraryProfile=selectedEditorActorProfile(),actor=libraryProfile?.actor??null,archetype=libraryProfile?.archetype??ACTOR_ARCHETYPES.ch1;
  $("editor-actor-faction").textContent=archetype.label;
  $("editor-actor-faction").classList.toggle("enemy",archetype.faction==="enemy");
  $("editor-actor-faction").classList.toggle("tier-two",archetype.id.endsWith("2"));
  $("editor-actor-name").textContent=libraryProfile?.name?.toUpperCase()||"CHARACTER";
  document.querySelectorAll("[data-actor-property]").forEach(input=>{
    const property=input.dataset.actorProperty,value=libraryProfile?.values?.[property],configuredMasterSpeed=Number(libraryProfile?.values?.moveSpeed),masterSpeed=Number.isFinite(configuredMasterSpeed)?configuredMasterSpeed:archetype.moveSpeed;
    if(property==="moveSpeed")input.max=String(Number((archetype.moveSpeed*3).toFixed(3)));
    if(property==="patrolSpeed")input.max=String(Number((masterSpeed*3).toFixed(3)));
    input.value=Number.isFinite(value)?String(Math.round(value*100)/100):"0";input.disabled=!libraryProfile;
  });
  const materialInput=$("editor-actor-material"),enemyEditable=Boolean(libraryProfile&&archetype.faction==="enemy"),colour=actor?.userData.editorMaterialColor??actorMaterialColour(archetype.id)??`#${new THREE.Color(archetype.tint??COLORS.amber).getHexString()}`;
  if(materialInput){materialInput.value=colour;materialInput.disabled=!enemyEditable;}
  populateContentBrowserModelSelect($("editor-actor-model"),actor?.userData.modelAssetId??actorModelAssetId(archetype.id),CHARACTER_MODEL_ASSET_ID,Boolean(libraryProfile));
  populateProgressBarSelect($("editor-actor-progress-bar"),actor?.userData.progressBarAssetId??actorProgressBarAssetId(archetype.id),ACTOR_PROGRESS_BAR_BP_ASSET_ID,Boolean(libraryProfile));
  const healthBarOffsetInput=$("editor-actor-health-bar-offset"),healthBarOffset=actor?.userData.healthBarOffset??actorHealthBarOffset(archetype.id);
  if(healthBarOffsetInput){healthBarOffsetInput.value=String(Math.round(healthBarOffset*100)/100);healthBarOffsetInput.disabled=!libraryProfile;}
  renderEditorActorRingControls(Boolean(libraryProfile));
}
function selectedHudWidgetProfile(){
  const widget=editorSelectedObjects.size===1&&isHudLayoutObject(editorSelection)?editorSelection:null;
  if(!widget)return null;
  if(widget.userData.editorAssetType==="hud-text"){
    const settings=normalizeHudTextSettings({text:widget.userData.hudText,size:widget.userData.hudSize,visible:widget.userData.hudVisible,layoutX:widget.userData.hudLayoutX,layoutY:widget.userData.hudLayoutY});return {widget,kind:"text",settings};
  }
  const settings=normalizeHudWidgetSettings({size:widget.userData.hudSize,spawnCount:widget.userData.hudSpawnCount,visible:widget.userData.hudVisible,layoutX:widget.userData.hudLayoutX,layoutY:widget.userData.hudLayoutY},widget.userData.hudArchetypeId);
  return {widget,kind:"widget",archetype:actorArchetype(settings.archetypeId,ACTOR_ARCHETYPES[settings.archetypeId].faction),settings};
}
function updateEditorHudWidgetInspector(){
  const profile=selectedHudWidgetProfile(),enabled=Boolean(profile),isText=profile?.kind==="text",archetype=profile?.archetype??ACTOR_ARCHETYPES.en1;
  $("editor-hud-faction").textContent=isText?"TEXT":archetype.label;$("editor-hud-faction").classList.toggle("enemy",!isText&&archetype.faction==="enemy");$("editor-hud-name").textContent=profile?.widget.name?.toUpperCase()||"HUD WIDGET";
  $("editor-hud-visible").checked=profile?.settings.visible??true;$("editor-hud-visible").disabled=!enabled;
  $("editor-hud-size").value=String(profile?.settings.size??HUD_WIDGET_DEFAULTS.size);$("editor-hud-size").disabled=!enabled;
  $("editor-hud-layout-x").value=String(Math.round((profile?.settings.layoutX??.5)*100));$("editor-hud-layout-x").disabled=!enabled;
  $("editor-hud-layout-y").value=String(Math.round((profile?.settings.layoutY??.1)*100));$("editor-hud-layout-y").disabled=!enabled;
  const textSetting=$("editor-hud-text-setting"),textInput=$("editor-hud-text");textSetting.classList.toggle("hidden",!isText);textInput.value=profile?.settings.text??HUD_TEXT_DEFAULTS.text;textInput.disabled=!isText;
  const spawnSetting=$("editor-hud-spawn-count-setting"),spawnInput=$("editor-hud-spawn-count");spawnSetting.classList.toggle("hidden",!enabled||isText||archetype.faction!=="enemy");spawnInput.value=String(profile?.settings.spawnCount??HUD_WIDGET_DEFAULTS.spawnCount);spawnInput.disabled=!enabled||isText||archetype.faction!=="enemy";
}
function applyEditorHudWidgetSettings(){
  const profile=selectedHudWidgetProfile();if(!profile)return;
  if(profile.kind==="text"){
    const settings=normalizeHudTextSettings({text:$("editor-hud-text").value,size:$("editor-hud-size").value,visible:$("editor-hud-visible").checked,layoutX:Number($("editor-hud-layout-x").value)/100,layoutY:Number($("editor-hud-layout-y").value)/100});recordEditorUndo();
    profile.widget.userData.hudText=settings.text;profile.widget.userData.hudSize=settings.size;profile.widget.userData.hudVisible=settings.visible;profile.widget.userData.hudLayoutX=settings.layoutX;profile.widget.userData.hudLayoutY=settings.layoutY;renderPlacedHudWidgets();updateEditorHudWidgetInspector();$("editor-status").textContent="HUD text settings updated. Press Save to keep this layout.";return;
  }
  const settings=normalizeHudWidgetSettings({size:$("editor-hud-size").value,spawnCount:$("editor-hud-spawn-count").value,visible:$("editor-hud-visible").checked,layoutX:Number($("editor-hud-layout-x").value)/100,layoutY:Number($("editor-hud-layout-y").value)/100},profile.archetype.id);recordEditorUndo();
  profile.widget.userData.hudSize=settings.size;profile.widget.userData.hudSpawnCount=settings.spawnCount;profile.widget.userData.hudVisible=settings.visible;profile.widget.userData.hudLayoutX=settings.layoutX;profile.widget.userData.hudLayoutY=settings.layoutY;renderPlacedHudWidgets();updateEditorHudWidgetInspector();
  $("editor-status").textContent=`${profile.widget.name} settings updated. Press Done to save the level.`;
}
function applyEditorActorMaterial(){
  const profile=selectedEditorActorProfile(),input=$("editor-actor-material");if(!profile||profile.archetype.faction!=="enemy"||!input)return;
  const colour=input.value.toLowerCase();if(!/^#[0-9a-f]{6}$/i.test(colour))return;
  if(profile.actor){applyEditorMaterialColour(colour,[profile.actor]);profile.actor.userData.editorMaterialColor=colour;$("editor-status").textContent=`${profile.actor.name} material updated. Press Done to save the level.`;}
  else{recordEditorUndo();contentBrowserState.actorMaterials[profile.archetype.id]=colour;persistContentBrowserState();$("editor-status").textContent=`${profile.name} material updated. New enemies will use this colour.`;}
  updateEditorActorInspector();
}
function applyEditorActorProgressBar(){
  const profile=selectedEditorActorProfile(),input=$("editor-actor-progress-bar");if(!profile||!input)return;
  const assetId=isProgressBarBlueprint(input.value)?input.value:ACTOR_PROGRESS_BAR_BP_ASSET_ID;
  if(profile.actor){recordEditorUndo();profile.actor.userData.progressBarAssetId=assetId;applyProgressBarAppearance(profile.actor.userData.healthWidget,assetId,ACTOR_PROGRESS_BAR_BP_ASSET_ID);$("editor-status").textContent=`${profile.actor.name} progress bar updated. Press Done to save the level.`;}
  else{recordEditorUndo();contentBrowserState.actorProgressBars[profile.archetype.id]=assetId;persistContentBrowserState();$("editor-status").textContent=`${profile.name} progress bar updated. New characters will use it.`;}
  updateEditorActorInspector();
}
function applyEditorActorHealthBarOffset(){
  const profile=selectedEditorActorProfile(),input=$("editor-actor-health-bar-offset"),value=Number(input?.value);if(!profile||!Number.isFinite(value)){updateEditorActorInspector();return;}
  const offset=normalizeHealthBarOffset(value,ACTOR_HEALTH_BAR_OFFSET);recordEditorUndo();
  if(profile.actor){profile.actor.userData.healthBarOffset=offset;positionActorHealthWidget(profile.actor);$("editor-status").textContent=`${profile.actor.name} health-bar offset updated. Press Done to save the level.`;}
  else{contentBrowserState.actorHealthBarOffsets[profile.archetype.id]=offset;persistContentBrowserState();$("editor-status").textContent=`${profile.name} health-bar offset saved for new characters.`;}
  updateEditorActorInspector();
}
function applyEditorActorModel(){
  const profile=selectedEditorActorProfile(),input=$("editor-actor-model");if(!profile||!input)return;
  const assetId=resolveContentBrowserModelId(input.value,CHARACTER_MODEL_ASSET_ID);recordEditorUndo();
  if(profile.actor){applyCharacterModel(profile.actor,assetId);$("editor-status").textContent=`${profile.actor.name} model updated. Press Done to save the level.`;}
  else{contentBrowserState.actorModels[profile.archetype.id]=assetId;persistContentBrowserState();$("editor-status").textContent=`${profile.name} now uses ${contentBrowserAssetById(assetId)?.name||"CH Model"}.`;}
  updateEditorActorInspector();updateEditorMaterialInspector();renderWorldOutliner();
}
function refreshContentBrowserModelScale(assetId){
  for(const actor of new Set(allLiveUnits()))if(actor?.userData?.modelAssetId===assetId)applyCharacterModel(actor,assetId);
  for(const building of editorObjects){
    const kind=building?.userData?.editorAssetType;
    if(!["town-hall","barracks"].includes(kind)||building.userData.blueprintModel!==assetId)continue;
    rebuildRaidBuildingVisual(building,normalizeBuildingBlueprintSettings({model:building.userData.blueprintModel,materialColor:building.userData.editorMaterialColor,maxHp:building.userData.maxHp,barracksSpawnInterval:building.userData.barracksSpawnInterval,progressBarAssetId:building.userData.progressBarAssetId,healthBarOffset:building.userData.healthBarOffset},kind));
  }
  invalidateNavigation();
}
function applyEditorModelScaleInput(input){
  const asset=selectedContentBrowserModelAsset(),axis=Number(input?.dataset.modelScale),value=Number(input?.value);
  if(!asset||!Number.isInteger(axis)||axis<0||axis>2||!Number.isFinite(value)){updateEditorModelInspector();return;}
  const current=contentBrowserModelScale(asset.id),next=current.slice(),target=THREE.MathUtils.clamp(value,.02,20);
  if(editorModelScaleLocked){const factor=target/Math.max(.0001,current[axis]);for(let index=0;index<3;index++)next[index]=THREE.MathUtils.clamp(current[index]*factor,.02,20);}else next[axis]=target;
  recordEditorUndo();contentBrowserState.modelScales[asset.id]=next;persistContentBrowserState();refreshContentBrowserModelScale(asset.id);
  updateEditorModelInspector();updateEditorMaterialInspector();updateEditorTransformInspector();renderWorldOutliner();
  $("editor-status").textContent=`${asset.name} scale updated everywhere this model is used.`;
}
function selectedBuildingBlueprintProfile(){
  const building=editorSelectedObjects.size===1&&["town-hall","barracks"].includes(editorSelection?.userData?.editorAssetType)?editorSelection:null,asset=building?contentBrowserAssetById(building.userData.blueprintAssetId):contentBrowserAssetById(editorLibrarySelection);
  if(!asset?.blueprintKind)return null;
  const settings=building?normalizeBuildingBlueprintSettings({model:building.userData.blueprintModel,materialColor:building.userData.editorMaterialColor,maxHp:building.userData.maxHp,barracksSpawnInterval:building.userData.barracksSpawnInterval,progressBarAssetId:building.userData.progressBarAssetId,healthBarOffset:building.userData.healthBarOffset},building.userData.editorAssetType):buildingBlueprintSettings(asset.id,asset.blueprintKind);
  return {asset,building,settings};
}
function updateBuildingBlueprintInspector(){
  const profile=selectedBuildingBlueprintProfile(),modelInput=$("editor-building-model"),materialInput=$("editor-building-material"),healthInput=$("editor-building-health"),healthBarOffsetInput=$("editor-building-health-bar-offset"),spawnInput=$("editor-barracks-spawn-interval"),spawnOutput=$("editor-barracks-spawn-output"),spawnSetting=$("editor-barracks-spawn-setting"),name=$("editor-building-name"),enabled=Boolean(profile),barracks=profile?.asset.blueprintKind==="barracks";
  if(name)name.textContent=profile?.asset.name||"BUILDING BLUEPRINT";
  populateContentBrowserModelSelect(modelInput,profile?.settings.model??BUILDING_BLUEPRINT_DEFAULTS.model,"box",enabled);
  if(materialInput){materialInput.value=profile?.settings.materialColor??BUILDING_BLUEPRINT_DEFAULTS.materialColor;materialInput.disabled=!enabled;}
  if(healthInput){healthInput.value=String(profile?.settings.maxHp??BUILDING_BLUEPRINT_DEFAULTS.maxHp);healthInput.disabled=!enabled;}
  populateProgressBarSelect($("editor-building-progress-bar"),profile?.settings.progressBarAssetId,BUILDING_PROGRESS_BAR_BP_ASSET_ID,enabled);
  if(healthBarOffsetInput){healthBarOffsetInput.value=String(Math.round((profile?.settings.healthBarOffset??RAID_BUILDING_HEALTH_BAR_OFFSET)*100)/100);healthBarOffsetInput.disabled=!enabled;}
  if(spawnSetting)spawnSetting.classList.toggle("hidden",!barracks);
  if(spawnInput){spawnInput.value=String(profile?.settings.barracksSpawnInterval??BUILDING_BLUEPRINT_DEFAULTS.barracksSpawnInterval);spawnInput.disabled=!barracks;}
  if(spawnOutput)spawnOutput.textContent=`${profile?.settings.barracksSpawnInterval??BUILDING_BLUEPRINT_DEFAULTS.barracksSpawnInterval}s`;
}
function applyBuildingBlueprintSettings(){
  const profile=selectedBuildingBlueprintProfile();if(!profile)return;
  const settings=normalizeBuildingBlueprintSettings({model:$("editor-building-model").value,materialColor:$("editor-building-material").value,maxHp:$("editor-building-health").value,barracksSpawnInterval:$("editor-barracks-spawn-interval").value,progressBarAssetId:$("editor-building-progress-bar").value,healthBarOffset:$("editor-building-health-bar-offset").value},profile.asset.blueprintKind);recordEditorUndo();
  if(profile.building){rebuildRaidBuildingVisual(profile.building,settings);profile.building.userData.blueprintModel=settings.model;profile.building.userData.editorMaterialColor=settings.materialColor;profile.building.userData.progressBarAssetId=settings.progressBarAssetId;profile.building.userData.healthBarOffset=settings.healthBarOffset;profile.building.userData.maxHp=settings.maxHp;profile.building.userData.hp=settings.maxHp;profile.building.userData.barracksSpawnInterval=settings.barracksSpawnInterval;profile.building.userData.barracksSpawnTimer=Math.min(profile.building.userData.barracksSpawnTimer??settings.barracksSpawnInterval,settings.barracksSpawnInterval);applyProgressBarAppearance(profile.building.userData.healthWidget,settings.progressBarAssetId,BUILDING_PROGRESS_BAR_BP_ASSET_ID);showRaidBuildingHealth(profile.building,settings.maxHp);updateEditorMaterialInspector();$("editor-status").textContent=`${profile.building.name} settings updated. Press Done to save the level.`;}
  else{contentBrowserState.blueprintSettings[profile.asset.id]=settings;persistContentBrowserState();$("editor-status").textContent=`${profile.asset.name} defaults updated. New placements will use this model, material, health, progress bar, and health-bar offset.`;}
  updateBuildingBlueprintInspector();renderWorldOutliner();
}
function selectedProgressBarBlueprint(){
  const asset=contentBrowserSelection.size===1&&isProgressBarBlueprint(editorLibrarySelection)?contentBrowserAssetById(editorLibrarySelection):null;
  return asset?.progressBarBlueprint?{asset,settings:normalizeProgressBarBlueprintSettings(contentBrowserState.blueprintSettings[asset.id],asset.id)}:null;
}
function updateProgressBarBlueprintInspector(){
  const profile=selectedProgressBarBlueprint(),backgroundInput=$("editor-progress-bar-background"),mainInput=$("editor-progress-bar-main"),widthInput=$("editor-progress-bar-width"),heightInput=$("editor-progress-bar-height"),name=$("editor-progress-bar-name");
  if(name)name.textContent=profile?.asset.name||"PROGRESS BAR";
  if(backgroundInput){backgroundInput.value=profile?.settings.backgroundColor??"#000000";backgroundInput.disabled=!profile;}
  if(mainInput){mainInput.value=profile?.settings.mainColor??"#ef6d78";mainInput.disabled=!profile;}
  if(widthInput){widthInput.value=String(profile?.settings.width??.74);widthInput.disabled=!profile;}
  if(heightInput){heightInput.value=String(profile?.settings.height??.065);heightInput.disabled=!profile;}
}
function refreshProgressBarWidgets(assetId){
  for(const unit of [master,...followers,...enemyUnits]){
    if(!unit?.userData)continue;
    const assignedAssetId=isProgressBarBlueprint(unit.userData.progressBarAssetId)?unit.userData.progressBarAssetId:ACTOR_PROGRESS_BAR_BP_ASSET_ID;
    if(assignedAssetId===assetId)applyProgressBarAppearance(unit.userData.healthWidget,assignedAssetId,ACTOR_PROGRESS_BAR_BP_ASSET_ID);
  }
  for(const building of editorObjects){
    if(!building.userData.raidBuilding)continue;
    const assignedAssetId=isProgressBarBlueprint(building.userData.progressBarAssetId)?building.userData.progressBarAssetId:BUILDING_PROGRESS_BAR_BP_ASSET_ID;
    if(assignedAssetId===assetId)applyProgressBarAppearance(building.userData.healthWidget,assignedAssetId,BUILDING_PROGRESS_BAR_BP_ASSET_ID);
  }
}
function applyProgressBarBlueprintSettings(){
  const profile=selectedProgressBarBlueprint();if(!profile)return;
  const settings=normalizeProgressBarBlueprintSettings({backgroundColor:$("editor-progress-bar-background").value,mainColor:$("editor-progress-bar-main").value,width:$("editor-progress-bar-width").value,height:$("editor-progress-bar-height").value},profile.asset.id);
  recordEditorUndo();contentBrowserState.blueprintSettings[profile.asset.id]=settings;persistContentBrowserState();refreshProgressBarWidgets(profile.asset.id);renderContentBrowser();updateEditorAssetSelection();updateProgressBarBlueprintInspector();$("editor-status").textContent=`${profile.asset.name} settings updated.`;
}
function selectedTileSpawner(){return ["world-floor","tile-spawner"].includes(editorSelection?.userData?.editorAssetType)?editorSelection:null}
function tileBlueprintSelected(){return Boolean(selectedTileSpawner())||(contentBrowserSelection.size===1&&[TILE_BP_ASSET_ID,BASE_BP_ASSET_ID].includes(editorLibrarySelection))}
function selectedTileColour(){
  const tile=selectedTileSpawner(),colour=tile?.userData?.tileColour;if(/^#[0-9a-f]{6}$/i.test(colour??""))return colour;
  if(isBaseTileBlueprint(tile)){const grid=tile?.getObjectByName("Tile Grid");return grid?.material?.color?.getHexString?`#${grid.material.color.getHexString()}`:"#f7fff1"}
  const material=tileSurface(tile)?.material;return material?.color?.getHexString?`#${material.color.getHexString()}`:"#78866c";
}
function updateEditorTileInspector(){
  const floor=selectedTileSpawner(),colour=$("editor-tile-colour"),rows=$("editor-tile-rows"),columns=$("editor-tile-columns"),tileSize=$("editor-tile-size"),enabled=Boolean(floor);
  const baseBlueprint=isBaseTileBlueprint(floor)||(contentBrowserSelection.size===1&&editorLibrarySelection===BASE_BP_ASSET_ID),defaults=baseBlueprint?{rows:BASE_BP_DEFAULT_ROWS,columns:BASE_BP_DEFAULT_COLUMNS,tileSize:BASE_BP_DEFAULT_SIZE}:{rows:TILE_BP_DEFAULT_ROWS,columns:TILE_BP_DEFAULT_COLUMNS,tileSize:TILE_BP_DEFAULT_SIZE};
  const preview=mode==="editor"&&tileBlueprintSelected(),grid=floor?.getObjectByName("Tile Grid")??floor?.getObjectByName("Island Tile Grid");
  if(grid)grid.material.opacity=preview?.75:.18;
  if(mode==="editor"){
    commandGrid.visible=!preview&&commandGrid.children.length>0;
  }
  $("editor-tile-name").textContent=baseBlueprint?"Base_bp":"Tile_bp";$("editor-tile-colour-label").textContent=baseBlueprint?"GRID COLOUR":"MATERIAL COLOUR";$("editor-tile-help").textContent=baseBlueprint?"The baked Crownwake Base owns the complete gameplay grid. Rows, columns, and tile size set its cells; X/Z viewport scaling snaps to whole rows or columns so every cell stays square and reaches the edge.":"Drag Tile_bp into the level. Rows and columns set the number of equal boxes; tile size sets every box edge.";
  if(colour){colour.value=selectedTileColour();colour.disabled=!enabled;}
  if(rows){rows.value=String(normalizeTileDimension(floor?.userData?.tileRows,defaults.rows));rows.disabled=!enabled;}
  if(columns){columns.value=String(normalizeTileDimension(floor?.userData?.tileColumns,defaults.columns));columns.disabled=!enabled;}
  if(tileSize){tileSize.value=String(normalizeTileSize(floor?.userData?.tileSize,defaults.tileSize));tileSize.disabled=!enabled;}
}
function applyEditorTileInput(){
  const floor=selectedTileSpawner();if(!floor)return;const rows=Number($("editor-tile-rows").value),columns=Number($("editor-tile-columns").value),tileSize=Number($("editor-tile-size").value),colour=$("editor-tile-colour").value;
  if(applyTileBlueprint({target:floor,rows,columns,tileSize,colour}))$("editor-status").textContent=`${isBaseTileBlueprint(floor)?"Base_bp":"Tile_bp"} set to ${floor.userData.tileRows} × ${floor.userData.tileColumns} at ${floor.userData.tileSize} units per tile. Press Done to save the level.`;
}
function applyEditorActorInput(input){
  const profile=selectedEditorActorProfile(),actor=profile?.actor??null;
  if(!profile)return;
  const property=input.dataset.actorProperty,value=Number(input.value),minimum=Number(input.min),maximum=Number(input.max);
  if(!["maxHp","attack","moveSpeed","acceleration","patrolSpeed"].includes(property)||!Number.isFinite(value)){updateEditorActorInspector();return}
  recordEditorUndo();const next=THREE.MathUtils.clamp(value,minimum,maximum);
  if(actor){
    actor.userData[property]=next;
    if(property==="maxHp"){actor.userData.hp=next;actor.userData.regenStartHealth=next;actor.userData.regenActive=false;}
  }else{
    const archetypeId=profile.archetype.id,existing=actorBlueprintStats(archetypeId);contentBrowserState.actorStats[archetypeId]=normalizeActorBlueprintStats({...existing,[property]:next});persistContentBrowserState();
  }
  updateEditorActorInspector();
  $("editor-status").textContent=actor?`${actor.name} ${input.previousElementSibling?.textContent?.toLowerCase()||"property"} updated. Press Done to save the level.`:`${profile.name} defaults updated. New placements will use this value.`;
}
function loadEditorMaterialSwatches(){
  try{
    const saved=JSON.parse(localStorage.getItem(EDITOR_MATERIAL_SWATCHES_KEY)||"[]");
    return Array.isArray(saved)?saved.filter(value=>/^#[0-9a-f]{6}$/i.test(value)).slice(0,12):[];
  }catch{return []}
}
const editorMaterialSwatches=loadEditorMaterialSwatches();
function persistEditorMaterialSwatches(){try{localStorage.setItem(EDITOR_MATERIAL_SWATCHES_KEY,JSON.stringify(editorMaterialSwatches))}catch{}}
function editorMaterialMeshes(objects=[editorSelection]){
  const meshes=[];
  for(const object of objects){
    if(!object)continue;
    object.traverse(part=>{
      if(!(part.isMesh||part.isSprite)||part.userData.editorMaterialOutline||part.userData.healthWidgetLayer||!part.material)return;
      const materials=Array.isArray(part.material)?part.material:[part.material];
      if(materials.some(material=>material?.color?.isColor))meshes.push(part);
    });
  }
  return meshes;
}
function editorMaterialTargets(){return [...editorSelectedObjects].filter(object=>editorObjects.includes(object));}
function importedModelMaterialOptions(object){
  if(isBaseTileBlueprint(object))return BASE_MATERIAL_PRESETS;
  const assetId=object?.userData?.importedModelAssetId,templateMaterials=importedModelTemplates.get(assetId)?.userData?.importedModelMaterials,storedMaterials=contentBrowserState.importedModels.find(model=>model.id===assetId)?.materials,materials=object?.userData?.importedModelMaterials??templateMaterials??storedMaterials??[];
  return Array.isArray(materials)?materials.filter(material=>material&&typeof material.id==="string"&&typeof material.name==="string"):[];
}
function normalizeImportedModelMaterialSlot(object,value){
  const materials=importedModelMaterialOptions(object);if(value==="__embedded__"&&materials.length)return "__embedded__";
  return materials.some(material=>material.id===value)?value:"";
}
function importedModelMaterialSlotValue(object){return normalizeImportedModelMaterialSlot(object,object?.userData?.importedMaterialSlot??(isBaseTileBlueprint(object)?"__embedded__":""));}
function selectedImportedModelMaterialTarget(){
  const targets=editorMaterialTargets();return targets.length===1&&(targets[0]?.userData?.editorAssetType==="imported-model"||isBaseTileBlueprint(targets[0]))?targets[0]:null;
}
function selectedEditorMaterialColour(){
  const base=editorMaterialTargets().find(isBaseTileBlueprint);if(base)return base.userData.editorMaterialColor??"#ffffff";
  const material=editorMaterialMeshes(editorMaterialTargets())[0]?.material;
  const primary=Array.isArray(material)?material.find(entry=>entry?.color?.isColor):material;
  return primary?.color?.getHexString?`#${primary.color.getHexString()}`:"#ffffff";
}
function updateActorDamageMaterialBase(actor,material){
  for(const entry of actor?.userData?.damageMaterials??[])if(entry.material===material&&material.color)entry.baseColor=material.color.clone();
}
function applyEditorMaterialColour(value,objects=editorMaterialTargets(),{recordUndo=true,refreshUi=true}={}){
  const editableObjects=objects.filter(Boolean),colour=new THREE.Color(value);if(!colour.isColor||!editableObjects.length)return false;
  if(recordUndo)recordEditorUndo();
  for(const object of editableObjects){
    if(isBaseTileBlueprint(object)){applyBaseMaterial(object,"",`#${colour.getHexString()}`);continue;}
    if(object.userData?.editorAssetType==="imported-model"&&importedModelMaterialSlotValue(object)){restoreImportedModelBaseMaterials(object);object.userData.importedMaterialSlot="";}
    for(const mesh of editorMaterialMeshes([object])){
      if(!mesh.userData.editorMaterialOverride){
        const source=Array.isArray(mesh.material)?mesh.material:[mesh.material];
        const cloned=source.map(material=>material.clone());
        mesh.material=Array.isArray(mesh.material)?cloned:cloned[0];mesh.userData.editorMaterialOverride=true;
        for(const entry of object.userData.damageMaterials??[]){
          const index=source.indexOf(entry.material);if(index>=0){entry.material=cloned[index];entry.baseColor=cloned[index].color?.clone()??entry.baseColor;entry.baseEmissive=cloned[index].emissive?.clone()??entry.baseEmissive;}
        }
      }
      for(const material of Array.isArray(mesh.material)?mesh.material:[mesh.material]){
        if(!material?.color?.isColor)continue;
        material.color.copy(colour);material.needsUpdate=true;updateActorDamageMaterialBase(object,material);
      }
    }
    object.userData.editorMaterialColor=`#${colour.getHexString()}`;
    if(["world-floor","tile-spawner"].includes(object.userData.editorAssetType))object.userData.tileColour=`#${colour.getHexString()}`;
  }
  if(refreshUi){updateEditorMaterialInspector();renderWorldOutliner();}return true;
}
function applyImportedModelMaterialSlot(object,value,{recordUndo=true,refreshUi=true}={}){
  if(isBaseTileBlueprint(object)){
    if(recordUndo)recordEditorUndo();
    const applied=applyBaseMaterial(object,normalizeImportedModelMaterialSlot(object,value),object.userData.editorMaterialColor??"#ffffff");
    if(refreshUi){updateEditorMaterialInspector();renderWorldOutliner();}return applied;
  }
  if(object?.userData?.editorAssetType!=="imported-model")return false;
  const materialSlot=normalizeImportedModelMaterialSlot(object,value);if(recordUndo)recordEditorUndo();restoreImportedModelBaseMaterials(object);
  if(materialSlot&&materialSlot!=="__embedded__"){
    const selectedMaterial=importedModelMaterialBySlot(object,materialSlot);
    if(selectedMaterial)object.traverse(part=>{
      if(!part.isMesh||!Array.isArray(part.userData.importedModelBaseMaterials)||!part.userData.importedModelBaseMaterials.length)return;
      const replacementMaterials=part.userData.importedModelBaseMaterials.map(()=>cloneImportedModelMaterial(selectedMaterial));setImportedModelMeshMaterials(part,replacementMaterials);part.userData.editorMaterialOverride=true;
    });
  }
  object.userData.importedMaterialSlot=materialSlot;
  if(!materialSlot)applyEditorMaterialColour(/^#[0-9a-f]{6}$/i.test(object.userData.editorMaterialColor??"")?object.userData.editorMaterialColor:"#ffffff",[object],{recordUndo:false,refreshUi:false});
  if(refreshUi){updateEditorMaterialInspector();renderWorldOutliner();}return true;
}
function updateEditorMaterialSlotInspector(){
  const select=$("editor-material-slot");if(!select)return false;
  const object=selectedImportedModelMaterialTarget(),emptyOption=document.createElement("option");emptyOption.value="";emptyOption.textContent="NONE - USE COLOUR";select.replaceChildren(emptyOption);
  if(!object){select.disabled=true;select.value="";return false;}
  const materials=importedModelMaterialOptions(object);
  if(materials.length){
    const embeddedOption=document.createElement("option");embeddedOption.value="__embedded__";embeddedOption.textContent="ORIGINAL GLB MATERIALS";select.append(embeddedOption);
    for(const material of materials){const option=document.createElement("option");option.value=material.id;option.textContent=material.name;select.append(option);}
  }
  const materialSlot=importedModelMaterialSlotValue(object);object.userData.importedMaterialSlot=materialSlot;select.value=materialSlot;select.disabled=!materials.length;return Boolean(materialSlot);
}
function renderEditorMaterialSwatches({disabled=false}={}){
  const host=$("editor-material-swatches");if(!host)return;
  const current=selectedEditorMaterialColour().toLowerCase();host.replaceChildren();
  for(const colour of editorMaterialSwatches){
    const swatch=document.createElement("button");swatch.type="button";swatch.className="editor-material-swatch";swatch.style.backgroundColor=colour;swatch.title=`Apply ${colour}`;swatch.setAttribute("aria-label",`Apply saved colour ${colour}`);swatch.classList.toggle("active",colour.toLowerCase()===current);swatch.disabled=disabled;
    swatch.onclick=()=>{if(applyEditorMaterialColour(colour))$("editor-status").textContent="Material colour applied. Press Done to save the level.";};host.append(swatch);
  }
}
function updateEditorMaterialInspector(){
  const targets=editorMaterialTargets(),editable=editorMaterialMeshes(targets).length>0;updateEditorMaterialSlotInspector();const colourEditable=editable,input=$("editor-material-colour"),save=$("editor-material-save-swatch");
  if(input){input.value=selectedEditorMaterialColour();input.disabled=!colourEditable;}
  if(save)save.disabled=!colourEditable;
  renderEditorMaterialSwatches({disabled:!colourEditable});
}
function saveEditorMaterialSwatch(){
  if(importedModelMaterialSlotValue(selectedImportedModelMaterialTarget()))return;
  const colour=selectedEditorMaterialColour().toLowerCase();if(!/^#[0-9a-f]{6}$/i.test(colour))return;
  const existing=editorMaterialSwatches.indexOf(colour);if(existing>=0)editorMaterialSwatches.splice(existing,1);editorMaterialSwatches.unshift(colour);editorMaterialSwatches.splice(12);persistEditorMaterialSwatches();updateEditorMaterialInspector();$("editor-status").textContent=`Saved ${colour.toUpperCase()} to material swatches.`;
}
function applyEditorMaterialSlot(event){
  const object=selectedImportedModelMaterialTarget();if(!object)return;
  if(applyImportedModelMaterialSlot(object,event.currentTarget.value))$("editor-status").textContent="Material slot updated. Choosing a colour replaces it.";
}
function updateEditorInspector(){
  const count=editorSelectedObjects.size,hasSelection=Boolean(editorSelection),actorProfile=selectedEditorActorProfile(),actorSelected=Boolean(actorProfile),hudProfile=selectedHudWidgetProfile(),hudSelected=Boolean(hudProfile),modelAsset=selectedContentBrowserModelAsset(),modelSelected=Boolean(modelAsset),buildingProfile=selectedBuildingBlueprintProfile(),buildingSelected=Boolean(buildingProfile),progressBarProfile=selectedProgressBarBlueprint(),progressBarSelected=Boolean(progressBarProfile),tileSelected=tileBlueprintSelected(),materialSelected=editorMaterialMeshes(editorMaterialTargets()).length>0,foliageSelected=editorSelection&&["grass-cluster","tree-cluster","tree-billboard"].includes(editorSelection.userData.editorAssetType),cameraSelected=Boolean(editorSelection?.userData?.editorCamera),environmentActive=editorEnvironmentOpen;
  const selectionName=actorProfile?.name?.toUpperCase()||hudProfile?.widget.name?.toUpperCase()||modelAsset?.name?.toUpperCase()||buildingProfile?.asset.name?.toUpperCase()||progressBarProfile?.asset.name?.toUpperCase()||editorSelection?.name?.toUpperCase()||(tileSelected?"TILE_BP":"");
  $("editor-inspector-title").textContent=environmentActive?"ENVIRONMENT":count>1?`${count} OBJECTS`:selectionName||"NOTHING SELECTED";
  $("editor-status-selection").textContent=count>1?`${count} SELECTED`:selectionName||"NO SELECTION";
  const position=editorSelection?.position;$("editor-status-coordinates").textContent=position?`X ${position.x.toFixed(1)} | Y ${position.y.toFixed(1)} | Z ${position.z.toFixed(1)}`:"X 0 | Y 0 | Z 0";
  $("editor-status-tool").textContent=`${(editorTransformMode??"select").toUpperCase()} | CAMERA ISO`;
  $("editor-transform-panel").classList.toggle("hidden",!hasSelection||environmentActive);$("inspector-transform-section").classList.toggle("hidden",!hasSelection||environmentActive);if(hasSelection&&!environmentActive)$("inspector-transform-section").open=true;
  $("inspector-material-section").classList.toggle("hidden",!materialSelected||environmentActive);if(materialSelected&&!environmentActive)$("inspector-material-section").open=true;updateEditorMaterialInspector();
  $("inspector-model-section").classList.toggle("hidden",!modelSelected||environmentActive);if(modelSelected&&!environmentActive)$("inspector-model-section").open=true;updateEditorModelInspector();
  $("inspector-actor-section").classList.toggle("hidden",!actorSelected||environmentActive);if(actorSelected&&!environmentActive)$("inspector-actor-section").open=true;updateEditorActorInspector();
  $("inspector-hud-section").classList.toggle("hidden",!hudSelected||environmentActive);if(hudSelected&&!environmentActive)$("inspector-hud-section").open=true;updateEditorHudWidgetInspector();
  $("inspector-building-section").classList.toggle("hidden",!buildingSelected||environmentActive);if(buildingSelected&&!environmentActive)$("inspector-building-section").open=true;updateBuildingBlueprintInspector();
  $("inspector-progress-bar-section").classList.toggle("hidden",!progressBarSelected||environmentActive);if(progressBarSelected&&!environmentActive)$("inspector-progress-bar-section").open=true;updateProgressBarBlueprintInspector();
  $("inspector-tile-section").classList.toggle("hidden",!tileSelected||environmentActive);if(tileSelected&&!environmentActive)$("inspector-tile-section").open=true;updateEditorTileInspector();
  $("inspector-camera-section").classList.toggle("hidden",!cameraSelected||environmentActive);if(cameraSelected&&!environmentActive)$("inspector-camera-section").open=true;
  $("inspector-foliage-section").classList.toggle("hidden",!foliageSelected||environmentActive);if(foliageSelected&&!environmentActive)$("inspector-foliage-section").open=true;
  $("inspector-environment-section").classList.toggle("hidden",!environmentActive);if(environmentActive)$("inspector-environment-section").open=true;
  updateContentBrowserNewModelButton();
}
function beginEditorResize(side,event){
  if(event.button!==0)return;event.preventDefault();const startX=event.clientX,startWidth=side==="left"?editorLayout.leftWidth:editorLayout.rightWidth;
  const move=moveEvent=>{const delta=moveEvent.clientX-startX;editorLayout[side+"Width"]=THREE.MathUtils.clamp(startWidth+(side==="left"?delta:-delta),side==="left"?240:280,side==="left"?360:420);applyEditorLayout({save:false})};
  const stop=()=>{removeEventListener("pointermove",move);removeEventListener("pointerup",stop);persistEditorLayout()};addEventListener("pointermove",move);addEventListener("pointerup",stop,{once:true});
}
function beginContentBrowserResize(event){
  if(event.button!==0||mode!=="editor")return;event.preventDefault();
  const startY=event.clientY,startHeight=editorLayout.contentDrawerHeight;
  const move=moveEvent=>{editorLayout.contentDrawerHeight=THREE.MathUtils.clamp(startHeight+(startY-moveEvent.clientY),180,Math.max(180,innerHeight-120));applyEditorLayout({save:false});};
  const stop=()=>{removeEventListener("pointermove",move);removeEventListener("pointerup",stop);persistEditorLayout();};
  addEventListener("pointermove",move);addEventListener("pointerup",stop,{once:true});
}
function updateEditorTransformControls(){
  $("editor-transform-select")?.setAttribute("aria-pressed",String(editorTransformMode===null));
  for(const transformMode of ["move","rotate","scale"]){
    const button=$("editor-transform-"+transformMode);button.setAttribute("aria-pressed",String(editorTransformMode===transformMode));
  }
}
function updateEditorScaleLock(){
  const button=$("editor-scale-lock");if(!button)return;
  button.textContent=editorScaleLocked?"🔒":"🔓";button.setAttribute("aria-pressed",String(editorScaleLocked));
  button.setAttribute("aria-label",editorScaleLocked?"Unlock proportional scale":"Lock proportional scale");button.title=editorScaleLocked?"Unlock proportional scale":"Lock proportional scale";
}
function toggleEditorScaleLock(){
  editorScaleLocked=!editorScaleLocked;updateEditorScaleLock();
  $("editor-status").textContent=editorScaleLocked?"Proportional scale locked — scale changes preserve the asset proportions.":"Proportional scale unlocked — edit each scale axis separately.";
}
function setEditorTransformMode(nextMode){
  if(!["select","move","rotate","scale"].includes(nextMode))return;
  if(foliagePaintActive)setFoliagePaintActive(false);
  if(nextMode==="select"){editorTransformMode=null;setEditorContext("select")}else editorTransformMode=editorTransformMode===nextMode?null:nextMode;updateEditorTransformControls();buildEditorTransformGizmo();updateEditorInspector();
  const label=nextMode[0].toUpperCase()+nextMode.slice(1);
  $("editor-status").textContent=editorTransformMode?editorSelection?`${label} controls ready for ${editorSelection.name||"the selected asset"}.`:`${label} mode ready — select an asset.`:"Free drag restored — drag a selected asset across the ground.";
}
function editorAssetTypeLabel(object){
  const type=object?.userData?.editorAssetType;
  if(type==="editor-camera")return "CAMERA";
  if(type==="world-floor")return "LEVEL PLANE";
  if(type==="tile-spawner")return "TILE SPAWNER";
  if(type==="town-hall")return "TOWN HALL";
  if(type==="barracks")return "BARRACKS";
  if(type==="primitive-cube")return "CUBE";
  if(type==="tree-cluster")return "TREE CLUSTER";
  if(type==="tree-billboard")return "TREE";
  if(type==="grass-cluster")return "GRASS";
  if(type==="rock-pillar")return "ROCK";
  if(type==="archer-tower")return "TOWER";
  if(type==="forest-fence")return "FENCE";
  if(type==="hud-widget")return "HUD WIDGET";
  if(type==="hud-text")return "HUD TEXT";
  if(type==="ch-character"||type==="enemy-character")return `${actorArchetype(object.userData.actorArchetypeId,object.userData.faction).label} ACTOR`;
  return "ASSET";
}
function editorOutlinerPath(object){
  const type=object?.userData?.editorAssetType;
  const sceneBranch={id:"scene",label:"SCENE"},environmentBranch={id:"scene/environment",label:"ENVIRONMENT"};
  if(type==="world-floor")return [sceneBranch,{id:"scene/ground",label:"GROUND"}];
  if(type==="editor-camera")return [sceneBranch,{id:"scene/camera",label:"CAMERA"}];
  if(type==="primitive-cube")return [sceneBranch,{id:"scene/terrain",label:"TERRAIN"},{id:"scene/terrain/primitives",label:"PRIMITIVES"}];
  if(type==="tree-billboard"){
    const variant=tallConiferVariant(object.userData.variantIndex);return [sceneBranch,environmentBranch,{id:"scene/environment/trees",label:"TREES"},{id:`scene/environment/trees/conifer-${variant.id}`,label:`Conifer ${variant.label}`}];
  }
  if(type==="tree-cluster"){
    const variant=Math.max(0,Number(object.userData.variantIndex)||0);return [sceneBranch,environmentBranch,{id:"scene/environment/trees",label:"TREES"},{id:`scene/environment/trees/cluster-${variant}`,label:`TREE CLUSTER ${variant+1}`}];
  }
  if(type==="grass-cluster"){
    const sprite=Number.isInteger(object.userData.spriteIndex)?SPRITE_GRASS_ASSETS[object.userData.spriteIndex]:null,variant=GRASS_CLUSTER_VARIANT_DEFINITIONS[object.userData.variantIndex];
    const label=sprite?.label??(object.userData.meadowGrassBlade?"MEADOW BLADE":variant?.label??"GRASS CLUSTER"),id=(sprite?.id??(object.userData.meadowGrassBlade?"meadow-blade":variant?.id??"cluster"));
    return [sceneBranch,environmentBranch,{id:"scene/environment/grass",label:"GRASS"},{id:`scene/environment/grass/${id}`,label}];
  }
  if(type==="rock-pillar")return [sceneBranch,environmentBranch,{id:"scene/environment/rocks",label:"ROCKS"}];
  if(type==="archer-tower")return [sceneBranch,{id:"scene/buildings",label:"BUILDINGS"}];
  if(type==="forest-fence")return [sceneBranch,{id:"scene/props",label:"PROPS"},{id:`scene/props/fence-${object.userData.variantIndex??0}`,label:"FOREST FENCE"}];
  if(type==="ch-character")return [sceneBranch,{id:"scene/characters",label:"CHARACTERS"},{id:"scene/characters/ch",label:"CH"}];
  if(type==="enemy-character")return [sceneBranch,{id:"scene/characters",label:"CHARACTERS"},{id:"scene/characters/en",label:"EN"}];
  if(type==="hud-widget")return [sceneBranch,{id:"scene/hud",label:"HUD"},{id:`scene/hud/${hudWidgetArchetype(object).faction==="player"?"ch":"en"}`,label:hudWidgetArchetype(object).faction==="player"?"CH":"EN"}];
  if(type==="hud-text")return [sceneBranch,{id:"scene/hud",label:"HUD"},{id:"scene/hud/text",label:"TEXT"}];
  return [sceneBranch,{id:"scene/assets",label:"ASSETS"}];
}
function editorOutlinerBranchIds(object){return editorOutlinerPath(object).map(branch=>branch.id)}
function buildEditorOutlinerTree(){
  const root={id:"root",label:"ROOT",children:new Map(),objects:[]};
  const query=editorOutlinerQuery.trim().toLowerCase();
  for(const object of editorObjects){
    const path=editorOutlinerPath(object),haystack=[object.name,editorAssetTypeLabel(object),...path.map(branch=>branch.label)].join(" ").toLowerCase();if(query&&!haystack.includes(query))continue;
    let parent=root;
    for(const branch of path){
      if(!parent.children.has(branch.id))parent.children.set(branch.id,{...branch,children:new Map(),objects:[]});
      parent=parent.children.get(branch.id);
    }
    parent.objects.push(object);
  }
  const count=node=>node.objects.length+[...node.children.values()].reduce((total,child)=>total+count(child),0);
  return {root,count};
}
function updateEditorTransformInspector(){
  const selected=editorSelection;
  document.querySelectorAll("#editor-transform-panel input").forEach(input=>{
    const property=input.dataset.transformProperty,axis=input.dataset.transformAxis;
    const value=selected?(property==="rotation"?THREE.MathUtils.radToDeg(selected.rotation[axis]):selected[property][axis]):0;
    input.value=Number.isFinite(value)?String(Math.round(value*100)/100):"0";input.disabled=!selected;
  });
  document.querySelectorAll("[data-transform-step]").forEach(button=>button.disabled=!selected);
}
function renderWorldOutliner(){
  const list=$("world-outliner-list");list.replaceChildren();
  if(!editorObjects.length){const empty=document.createElement("p");empty.className="world-outliner-empty";empty.textContent="No placed assets.";list.append(empty);return;}
  const {root,count}=buildEditorOutlinerTree();
  if(!root.children.size){const empty=document.createElement("p");empty.className="world-outliner-empty";empty.textContent="No scene objects match this search.";list.append(empty);return;}
  const appendAssetRow=(object,depth,index,total)=>{
    const row=document.createElement("button"),label=document.createElement("strong"),type=document.createElement("small");
    row.type="button";row.className="world-outliner-row child";row.style.setProperty("--outliner-depth",String(depth));row.classList.toggle("selected",editorSelectedObjects.has(object));row.setAttribute("aria-pressed",String(editorSelectedObjects.has(object)));
    const base=object.name||"Level asset";label.textContent=total>1?`${base} ${String(index+1).padStart(3,"0")}`:base;type.textContent=editorAssetTypeLabel(object);row.append(label,type);row.onclick=event=>selectEditorObjectFromEvent(object,event);row.ondblclick=()=>focusEditorCameraOnAsset(object);list.append(row);
  };
  const appendBranch=(branch,depth)=>{
    const expanded=Boolean(editorOutlinerQuery)||editorOutlinerExpanded.has(branch.id),group=document.createElement("button"),label=document.createElement("strong"),assetCount=document.createElement("small"),total=count(branch);
    group.type="button";group.className="world-outliner-group";group.style.setProperty("--outliner-depth",String(depth));group.setAttribute("aria-expanded",String(expanded));label.textContent=`${expanded?"▾":"▸"} ${branch.label}`;assetCount.textContent=`${total} ${total===1?"ASSET":"ASSETS"}`;group.append(label,assetCount);
    group.onclick=()=>{if(expanded)editorOutlinerExpanded.delete(branch.id);else editorOutlinerExpanded.add(branch.id);renderWorldOutliner();};list.append(group);
    if(!expanded)return;
    for(const child of branch.children.values())appendBranch(child,depth+1);
    branch.objects.forEach((object,index)=>appendAssetRow(object,depth+1,index,branch.objects.length));
  };
  for(const branch of root.children.values())appendBranch(branch,0);
}
function focusEditorCameraOnAsset(object){
  if(mode!=="editor"||!object)return;
  const center=new THREE.Box3().setFromObject(object).getCenter(new THREE.Vector3());
  if(!Number.isFinite(center.x)||!Number.isFinite(center.z))return;
  editorCameraTravel={start:editorCameraFocus.clone(),target:new THREE.Vector3(center.x,0,center.z),elapsed:0,duration:2.3};
  $("editor-status").textContent=`Travelling to ${object.name||"asset"}.`;
}
function updateEditorCameraTravel(dt){
  if(!editorCameraTravel)return;
  editorCameraTravel.elapsed=Math.min(editorCameraTravel.duration,editorCameraTravel.elapsed+Math.max(0,dt));
  const progress=editorCameraTravel.elapsed/editorCameraTravel.duration,eased=progress*progress*(3-2*progress);
  editorCameraFocus.lerpVectors(editorCameraTravel.start,editorCameraTravel.target,eased);
  ensureEditorCameraObject();
  if(progress>=1){editorCameraTravel=null;$("editor-status").textContent="Asset centred. Drag empty ground or use arrow keys to explore.";}
}
function applyEditorTransformInput(input){
  if(!editorSelection){updateEditorTransformInspector();return;}
  const value=Number(input.value),property=input.dataset.transformProperty,axis=input.dataset.transformAxis;
  if(!Number.isFinite(value)||!property||!axis){updateEditorTransformInspector();return;}
  recordEditorUndo();
  if(property==="scale"){
    const next=Math.max(.02,value),current=Math.max(.0001,editorSelection.scale[axis]);
    if(editorScaleLocked)editorSelection.scale.multiplyScalar(next/current);else editorSelection.scale[axis]=next;
    syncGrassSizeBaseScale(editorSelection);
  }else editorSelection[property][axis]=property==="rotation"?THREE.MathUtils.degToRad(value):value;
  synchronizeBaseGridTransform(editorSelection);
  invalidateNavigation();
  syncEditorCameraFocusFromObject(editorSelection);
  editorSelectionHelper?.update();updateEditorTransformGizmo();updateEditorTransformInspector();updateEditorInspector();renderWorldOutliner();
  $("editor-status").textContent=`${editorSelection.name||"Asset"} transform updated. Press Done to save the level.`;
}
function applyEditorTransformStep(button){
  const input=button.closest(".editor-transform-number")?.querySelector("input[data-transform-property]");
  const direction=Number(button.dataset.transformStep),step=Number(input?.step),current=Number(input?.value);
  if(!input||input.disabled||!Number.isFinite(direction)||direction===0||!Number.isFinite(step)||step<=0||!Number.isFinite(current))return;
  const minimum=input.min===""?-Infinity:Number(input.min),maximum=input.max===""?Infinity:Number(input.max);
  const decimals=(input.step.split(".")[1]||"").length;
  const next=Math.min(maximum,Math.max(minimum,Math.round((current+step*direction)*10**decimals)/10**decimals));
  input.value=String(next);applyEditorTransformInput(input);
}
function canDuplicateEditorObject(object){return Boolean(object&&editorObjects.includes(object)&&!object.userData.editorProtected&&object.userData.editorAssetType!=="world-floor"&&levelAssetRecord(object))}
function duplicateEditorSelection(){
  const sources=[...editorSelectedObjects].filter(canDuplicateEditorObject);if(!sources.length)return;
  recordEditorUndo();
  const duplicates=[];
  for(const source of sources){
    const record=levelAssetRecord(source);if(!record)continue;
    const duplicate=addLevelAsset({...record,x:record.x+1.4,z:record.z+1.4});if(!duplicate)continue;
    duplicate.name=`${source.name||duplicate.name} copy`;duplicates.push(duplicate);
  }
  if(!duplicates.length)return;
  setEditorSelection(duplicates,duplicates.at(-1),duplicates.at(-1));
  $("editor-status").textContent=duplicates.length===1?`${duplicates[0].name} created — drag it to a new position. Press Done to save.`:`${duplicates.length} selected assets duplicated together — use Move to reposition them as one group.`;
}
function setEditorSelection(objects,primary=null,anchor=primary){
  const selected=objects.filter(object=>editorObjects.includes(object)),nextPrimary=selected.includes(primary)?primary:selected.at(-1)??null;
  editorSelectedObjects.clear();selected.forEach(object=>editorSelectedObjects.add(object));editorSelection=nextPrimary;editorSelectionAnchor=nextPrimary?anchor??nextPrimary:null;disposeEditorSelectionHelper();disposeEditorTransformGizmo();
  for(const object of editorSelectedObjects){
    for(const branchId of editorOutlinerBranchIds(object))editorOutlinerExpanded.add(branchId);
    if(isHudLayoutObject(object))continue;
    const helper=editorCollisionSelectionHelper(object)??new THREE.BoxHelper(object,0xf7fff1);styleEditorSelectionHelper(helper,(object===editorSelection)?.95:.62);scene.add(helper);editorSelectionHelpers.push(helper);
    if(object===editorSelection)editorSelectionHelper=helper;
  }
  const selectedObjects=[...editorSelectedObjects],canDuplicate=selectedObjects.some(canDuplicateEditorObject),canDelete=selectedObjects.some(object=>editorObjects.includes(object)&&!object.userData.editorProtected),actions=$("editor-viewport-actions");
  for(const id of ["editor-duplicate","editor-viewport-duplicate"])$(id).disabled=!canDuplicate;
  for(const id of ["editor-delete","editor-viewport-delete"])$(id).disabled=!canDelete;
  actions.classList.toggle("hidden",!canDuplicate&&!canDelete);
  buildEditorTransformGizmo();updateEditorTransformInspector();updateFoliagePanel();updateEditorInspector();renderWorldOutliner();
  if(editorSelection)requestAnimationFrame(()=>$("world-outliner-list").querySelector(".world-outliner-row.selected")?.scrollIntoView({block:"nearest"}));
  const count=editorSelectedObjects.size;
  $("editor-status").textContent=editorSelection?(count>1?`${count} assets selected. Transform controls affect ${editorSelection.name||"the active asset"}.`:editorTransformMode?"Use the coloured transform controls. Toggle the active mode off to restore free drag.":"Drag the selected asset across the ground, or select a transform mode."):"Arrow keys or drag empty ground to explore.";
}
function selectEditorObject(object){
  setEditorSelection(object?[object]:[],object,object);
}
function selectEditorObjectFromEvent(object,event){
  if(!object||!editorObjects.includes(object))return;
  if(event.shiftKey){
    const anchor=editorSelectionAnchor&&editorObjects.includes(editorSelectionAnchor)?editorSelectionAnchor:object,first=editorObjects.indexOf(anchor),last=editorObjects.indexOf(object);
    setEditorSelection(editorObjects.slice(Math.min(first,last),Math.max(first,last)+1),object,anchor);return;
  }
  if(event.ctrlKey||event.metaKey){
    const selected=[...editorSelectedObjects];
    if(editorSelectedObjects.has(object))setEditorSelection(selected.filter(item=>item!==object),editorSelection===object?selected.find(item=>item!==object)??null:editorSelection,object);
    else setEditorSelection([...selected,object],object,object);
    return;
  }
  selectEditorObject(object);
}
function removeEditorObject(object){
  const index=editorObjects.indexOf(object);if(index<0||object.userData.editorProtected)return false;
  const removedActor=detachEditorActorFromCombat(object);
  editorObjects.splice(index,1);editorFoliageObjects.delete(object);battle.remove(object);
  if(object===worldFloor)worldFloor=null;
  invalidateNavigation();if(removedActor)rebuildPlacedCharacterEncounter();if(mode==="editor")refreshCommandGrid();
  return true;
}
function deleteEditorSelection(){
  const selected=[...editorSelectedObjects];if(!selected.length)return;
  for(const object of selected)removeEditorObject(object);
  selectEditorObject(null);
}
function openEditorDeleteConfirm(object=editorSelection){
  if(!object||!editorObjects.includes(object)||object.userData.editorProtected)return;
  const objects=(editorSelectedObjects.has(object)?[...editorSelectedObjects]:[object]).filter(item=>!item.userData.editorProtected);if(!objects.length)return;if(!editorSelectedObjects.has(object))selectEditorObject(object);
  pendingEditorDelete={kind:"level",objects};
  const actor=object.userData.editorActor,assetName=(object.name||editorAssetTypeLabel(object)||"asset").toUpperCase();
  $("editor-delete-title").textContent=objects.length===1?`DELETE ${assetName}?`:"DELETE SELECTION?";
  $("editor-delete-copy").textContent=objects.length===1?actor?`Remove this ${object.name||"selected"} actor from the level?`:`Remove ${object.name||"this asset"} from the level?`:`Remove ${objects.length} selected assets from the level?`;
  $("editor-delete-confirm").classList.remove("hidden");requestAnimationFrame(()=>{positionEditorDeleteConfirm();$("editor-delete-confirm-button").focus();});
}
function closeEditorDeleteConfirm(){pendingEditorDelete=null;$("editor-delete-confirm").classList.add("hidden");}
function positionEditorDeleteConfirm(){
  if(!$("editor-shell").classList.contains("hidden"))return;
  const fallback=$("editor-toolbar").getBoundingClientRect(),inspector=$("editor-transform-panel"),anchor=inspector.classList.contains("hidden")?fallback:inspector.getBoundingClientRect(),panel=$("editor-delete-confirm");
  panel.style.left=`${Math.max(8,Math.min(anchor.left,innerWidth-panel.offsetWidth-8))}px`;
  panel.style.top=`${Math.min(anchor.bottom+10,innerHeight-panel.offsetHeight-8)}px`;
}
function positionEditorTransformPanel(){
  if(!$("editor-shell").classList.contains("hidden"))return;
  const toolbar=$("editor-toolbar").getBoundingClientRect(),panel=$("editor-transform-panel");
  panel.style.left=`${Math.max(8,Math.min(toolbar.left,innerWidth-panel.offsetWidth-8))}px`;
  panel.style.top=`${Math.min(toolbar.bottom+10,innerHeight-panel.offsetHeight-8)}px`;
}
function positionFoliagePanel(){
  if(!$("editor-shell").classList.contains("hidden"))return;
  const panel=$("foliage-panel");if(panel.classList.contains("hidden"))return;
  if(innerWidth<=700){panel.style.left="";panel.style.top="";panel.style.bottom="";panel.style.maxHeight="";return}
  const worldLook=$("world-look-panel").getBoundingClientRect(),top=Math.min(worldLook.bottom+10,innerHeight-160);
  panel.style.left=`${Math.max(8,Math.min(worldLook.left,innerWidth-panel.offsetWidth-8))}px`;panel.style.top=`${Math.max(8,top)}px`;panel.style.bottom="auto";panel.style.maxHeight=`${Math.max(140,innerHeight-Math.max(8,top)-18)}px`;
}
function positionWorldLookPanel(){
  if(!$("editor-shell").classList.contains("hidden"))return;
  const panel=$("world-look-panel");if(panel.classList.contains("hidden"))return;
  if(innerWidth<=700){panel.style.left="";panel.style.top="";panel.style.bottom="";panel.style.maxHeight="";return}
  const transform=$("editor-transform-panel").getBoundingClientRect(),top=Math.min(transform.bottom+10,innerHeight-170);
  panel.style.left=`${Math.max(8,Math.min(transform.left,innerWidth-panel.offsetWidth-8))}px`;panel.style.top=`${Math.max(8,top)}px`;panel.style.bottom="auto";panel.style.maxHeight=`${Math.max(150,innerHeight-Math.max(8,top)-18)}px`;
}
function positionFoliagePresetsPanel(){
  if(!$("editor-shell").classList.contains("hidden"))return;
  const panel=$("foliage-presets-panel");if(panel.classList.contains("hidden"))return;
  if(innerWidth<=700){panel.style.left="";panel.style.top="";panel.style.right="";panel.style.bottom="";panel.style.maxHeight="";return}
  const foliage=$("foliage-panel").getBoundingClientRect();let left=foliage.right+10;
  if(left+panel.offsetWidth>innerWidth-8)left=Math.max(8,foliage.left-panel.offsetWidth-10);
  const top=Math.max(8,Math.min(foliage.top,innerHeight-panel.offsetHeight-8));
  panel.style.left=`${left}px`;panel.style.top=`${top}px`;panel.style.right="auto";panel.style.bottom="auto";panel.style.maxHeight=`${Math.max(150,innerHeight-top-18)}px`;
}
function contentBrowserAssetIdForLevelObject(object){
  const type=object?.userData?.editorAssetType;
  if(type==="imported-model")return object.userData.importedModelAssetId??null;
  if(type==="town-hall"||type==="barracks")return object.userData.blueprintAssetId??null;
  if(type==="tile-spawner")return tileBlueprintAssetId(object)??TILE_BP_ASSET_ID;
  if(type==="primitive-cube"||type==="archer-tower")return type;
  if(type==="forest-fence")return `forest-fence:${object.userData.variantIndex??0}`;
  if(type==="rock-pillar")return `rock-pillar:${object.userData.variantIndex??0}`;
  if(type==="ch-character"||type==="enemy-character"){
    const match=/^(ch|en)([2-5])?$/.exec(object.userData.actorArchetypeId??"");return match?`character:${match[1]}${match[2]??""}`:null;
  }
  return editorAssetIdForObject(object);
}
function contentBrowserReferencedLevelObjects(assetIds){
  const selected=new Set(assetIds);return editorObjects.filter(object=>selected.has(contentBrowserAssetIdForLevelObject(object))||selected.has(object?.userData?.blueprintModel)||selected.has(object?.userData?.modelAssetId));
}
function removeContentBrowserAssetDefinitions(assetIds){
  const removed=new Set(assetIds);
  for(const settings of Object.values(contentBrowserState.blueprintSettings))if(removed.has(settings?.model))settings.model="box";
  for(const [archetypeId,assetId] of Object.entries(contentBrowserState.actorModels))if(removed.has(assetId))delete contentBrowserState.actorModels[archetypeId];
  for(const assetId of assetIds){
    delete contentBrowserState.modelScales[assetId];
    const importedIndex=contentBrowserState.importedModels.findIndex(model=>model.id===assetId);
    if(importedIndex>=0){contentBrowserState.importedModels.splice(importedIndex,1);importedModelTemplates.delete(assetId);importedModelLoadErrors.delete(assetId);void deleteImportedModelBuffer(assetId).catch(()=>{});}
    const blueprintIndex=contentBrowserState.blueprintCopies.findIndex(copy=>copy.id===assetId);
    if(blueprintIndex>=0){contentBrowserState.blueprintCopies.splice(blueprintIndex,1);delete contentBrowserState.blueprintSettings[assetId];}
    if(importedIndex<0&&blueprintIndex<0)hiddenEditorAssets.add(assetId);
    delete contentBrowserState.assetFolders[assetId];delete contentBrowserState.assetNames[assetId];
  }
}
function openContentBrowserAssetDeleteConfirm(assetIds=[...contentBrowserSelection]){
  const selected=assetIds.filter(assetId=>contentBrowserAssetById(assetId));if(!selected.length)return;
  const references=contentBrowserReferencedLevelObjects(selected),label=selected.length===1?contentBrowserAssetById(selected[0])?.name||"this asset":`${selected.length} assets`;
  pendingEditorDelete={kind:"content-assets",assetIds:selected,referenceObjects:references,label};
  $("editor-delete-title").textContent=selected.length===1?"DELETE ASSET?":"DELETE ASSETS?";
  $("editor-delete-copy").textContent=references.length?`Delete ${label} from the Content Browser? It is used by ${references.length} placed level item${references.length===1?"":"s"}. Deleting it will also remove those level references.`:`Delete ${label} from the Content Browser? This cannot be undone after you leave the editor.`;
  $("editor-delete-confirm").classList.remove("hidden");requestAnimationFrame(()=>{positionEditorDeleteConfirm();$("editor-delete-confirm-button").focus();});
}
function openContentBrowserDeleteConfirm(){
  const selected=[...contentBrowserSelection].filter(assetId=>contentBrowserAssetById(assetId));if(selected.length){openContentBrowserAssetDeleteConfirm(selected);return;}
  const folder=contentBrowserFolderById(contentBrowserFolderId);if(contentBrowserCanChangeFolder(folder))contentBrowserDeleteFolder(folder);
}
function confirmEditorDelete(){
  const pending=pendingEditorDelete;closeEditorDeleteConfirm();
  if(pending?.kind==="level"&&pending.objects?.some(object=>editorObjects.includes(object))){recordEditorUndo();setEditorSelection(pending.objects,pending.objects.at(-1),pending.objects.at(-1));deleteEditorSelection();}
  if(pending?.kind==="content-assets"){
    const assetIds=(pending.assetIds??[]).filter(assetId=>contentBrowserAssetById(assetId));if(!assetIds.length)return;
    const referenceObjects=(pending.referenceObjects??contentBrowserReferencedLevelObjects(assetIds)).filter(object=>editorObjects.includes(object));recordEditorUndo();removeContentBrowserAssetDefinitions(assetIds);
    for(const object of referenceObjects)removeEditorObject(object);
    selectEditorObject(null);editorPendingAsset=null;editorLibrarySelection=null;editorLibrarySelectionLabel="";contentBrowserSelection.clear();contentBrowserSelectionAnchor=null;
    saveLevelLayout();renderContentBrowser();updateEditorAssetSelection();updateEditorInspector();renderWorldOutliner();$("editor-status").textContent=`Deleted ${assetIds.length} Content Browser asset${assetIds.length===1?"":"s"}${referenceObjects.length?` and removed ${referenceObjects.length} placed level reference${referenceObjects.length===1?"":"s"}`:""}.`;
  }
  if(pending?.kind==="content-folder"){
    const folder=contentBrowserFolderById(pending.folderId);if(!contentBrowserCanChangeFolder(folder))return;
    recordEditorUndo();const descendants=contentBrowserDescendants(folder.id),parentId=folder.parentId||CONTENT_BROWSER_ROOT_ID;
    for(const asset of contentBrowserAssetSpecs())if(descendants.has(asset.folderId))contentBrowserState.assetFolders[asset.id]=parentId;
    contentBrowserState.folders.splice(0,contentBrowserState.folders.length,...contentBrowserState.folders.filter(item=>!descendants.has(item.id)));
    for(const folderId of descendants)contentBrowserExpanded.delete(folderId);
    if(descendants.has(contentBrowserFolderId))contentBrowserFolderId=parentId;contentBrowserSelection.clear();contentBrowserSelectionAnchor=null;editorLibrarySelection=null;editorLibrarySelectionLabel="";persistContentBrowserState();renderContentBrowser();updateEditorAssetSelection();$("editor-status").textContent=`${pending.label} deleted. Its assets were kept and moved to ${contentBrowserFolderById(parentId)?.name||"Content"}.`;
  }
}
function updateEditorAssetSelection(){
  document.querySelectorAll(".editor-asset-card").forEach(card=>{
    const selected=foliagePaintActive?editorFoliagePaintSelection.has(card.dataset.asset):contentBrowserSelection.has(card.dataset.asset);card.classList.toggle("selected",selected);card.classList.toggle("paint-selected",foliagePaintActive&&selected);card.setAttribute("aria-pressed",String(selected));
  });
  const deleteButton=$("content-browser-delete"),selectedAssets=[...contentBrowserSelection].filter(assetId=>contentBrowserAssetById(assetId)),currentFolder=contentBrowserFolderById(contentBrowserFolderId),canDelete=!foliagePaintActive&&Boolean(selectedAssets.length||contentBrowserCanChangeFolder(currentFolder));
  if(deleteButton){deleteButton.classList.toggle("hidden",!canDelete);deleteButton.disabled=!canDelete;deleteButton.title=selectedAssets.length?`Delete ${selectedAssets.length===1?contentBrowserAssetById(selectedAssets[0])?.name||"selected asset":`${selectedAssets.length} selected assets`}`:`Delete ${currentFolder?.name||"current folder"}`;deleteButton.setAttribute("aria-label",deleteButton.title);}
  const duplicateButton=$("content-browser-duplicate"),canDuplicate=!foliagePaintActive&&Boolean(contentBrowserAssetById(editorLibrarySelection)?.blueprintKind);if(duplicateButton)duplicateButton.disabled=!canDuplicate;
  $("editor-asset-list").dataset.multiselect=String(foliagePaintActive);
  document.querySelectorAll(".foliage-paint-choice").forEach(choice=>{
    const selected=editorFoliagePaintSelection.has(choice.dataset.asset);choice.classList.toggle("selected",selected);choice.setAttribute("aria-pressed",String(selected));
  });
  updateContentBrowserNewModelButton();
}
function armEditorAsset(assetId,label){
  if(foliagePaintActive){
    if(!isFoliageAssetId(assetId)){$("editor-status").textContent="Foliage Paint accepts Tree and Grass assets only.";return}
    if(editorFoliagePaintSelection.has(assetId))editorFoliagePaintSelection.delete(assetId);else editorFoliagePaintSelection.add(assetId);
    updateEditorAssetSelection();$("editor-status").textContent=editorFoliagePaintSelection.size?`${editorFoliagePaintSelection.size} foliage ${editorFoliagePaintSelection.size===1?"asset":"assets"} ready to paint.`:"Select one or more foliage assets.";return;
  }
  editorPendingAsset=editorPendingAsset===assetId?null:assetId;editorLibrarySelection=editorPendingAsset;editorLibrarySelectionLabel=editorPendingAsset?label:"";contentBrowserSelection.clear();if(editorPendingAsset)contentBrowserSelection.add(assetId);updateEditorAssetSelection();selectEditorObject(null);
  $("editor-status").textContent=editorPendingAsset===null?"Arrow keys or drag empty ground to explore.":`${label} ready — click the ground to place it.`;
}
function createEditorTreeCluster(variantIndex,point,{select=true}={}){
  if(!Number.isInteger(variantIndex)||!point)return null;
  const cluster=TREE_CLUSTER_VARIANTS[variantIndex]?addTreeCluster({x:point.x,z:point.z,trees:TREE_CLUSTER_VARIANTS[variantIndex],variantIndex}):null;
  if(!cluster)return null;
  if(select)selectEditorObject(cluster);return cluster;
}
function createEditorAsset(assetId,point,{recordUndo=true,select=true}={}){
  if(!assetId||!point)return null;
  if(recordUndo)recordEditorUndo();
  const blueprint=contentBrowserAssetById(assetId);
  if(blueprint?.hudArchetypeId){const widget=addEditorHudWidget({archetypeId:blueprint.hudArchetypeId,x:point.x,z:point.z});if(select)selectEditorObject(widget);return widget}
  if(blueprint?.hudText){const text=addEditorHudText({x:point.x,z:point.z});if(select)selectEditorObject(text);return text}
  if(blueprint?.blueprintKind){const building=addRaidBuilding({kind:blueprint.blueprintKind,x:point.x,z:point.z,blueprintAssetId:assetId});if(select)selectEditorObject(building);return building}
  if(blueprint?.importedModel){const model=addImportedModel({assetId,x:point.x,z:point.z});if(!model){$("editor-status").textContent=`${blueprint.name} could not be loaded from this browser.`;return null;}if(select)selectEditorObject(model);return model;}
  if(assetId===BASE_BP_ASSET_ID){const spawner=addTileSpawner({x:point.x,y:GROUND_Y,z:point.z,tileBlueprintAssetId:BASE_BP_ASSET_ID});if(select)selectEditorObject(spawner);return spawner}
  if(assetId===TILE_BP_ASSET_ID){const spawner=addTileSpawner({x:point.x,y:GROUND_Y,z:point.z});if(select)selectEditorObject(spawner);return spawner}
  if(assetId==="primitive-cube"){const cube=addPrimitiveCube({x:point.x,z:point.z});if(select)selectEditorObject(cube);return cube}
  const characterVariant=/^character:(ch|en)([2-5])?$/.exec(assetId),archetypeId=characterVariant?`${characterVariant[1]}${characterVariant[2]??"1"}`:null;
  if(ACTOR_ARCHETYPES[archetypeId]){const archetype=ACTOR_ARCHETYPES[archetypeId],actor=addEditorCharacter({faction:archetype.faction,archetypeId,x:point.x,z:point.z});if(select)selectEditorObject(actor);return actor}
  if(assetId==="archer-tower"){const tower=addArcherTower({x:point.x,z:point.z});if(select)selectEditorObject(tower);return tower}
  if(assetId==="grass-cluster"){const grass=addGrassCluster({x:point.x,z:point.z});if(select)selectEditorObject(grass);return grass}
  if(assetId==="meadow-grass-blade"){const blade=addMeadowGrassBlade({x:point.x,z:point.z});if(select)selectEditorObject(blade);return blade}
  const grassVariant=/^grass-cluster:(\d+)$/.exec(assetId);
  if(grassVariant){const grass=addGrassCluster({x:point.x,z:point.z,variantIndex:Number(grassVariant[1])});if(select)selectEditorObject(grass);return grass}
  const spriteGrass=/^sprite-grass:(\d+)$/.exec(assetId);
  if(spriteGrass){const grass=addGrassSpriteBillboard({x:point.x,z:point.z,spriteIndex:Number(spriteGrass[1])});if(select)selectEditorObject(grass);return grass}
  const rockVariant=/^rock-pillar:(\d+)$/.exec(assetId);
  if(rockVariant){const rock=addSedimentaryRock({x:point.x,z:point.z,variantIndex:Number(rockVariant[1])});if(select)selectEditorObject(rock);return rock}
  if(assetId==="forest-fence"){const fence=addForestFence({x:point.x,z:point.z});if(fence&&select)selectEditorObject(fence);return fence}
  const fenceVariant=/^forest-fence:(\d+)$/.exec(assetId);
  if(fenceVariant){const fence=addForestFence({x:point.x,z:point.z,variantIndex:Number(fenceVariant[1])});if(fence&&select)selectEditorObject(fence);return fence}
  const coniferVariant=/^tree-billboard:(\d+)$/.exec(assetId);
  if(coniferVariant){const tree=addTallConiferBillboard({x:point.x,z:point.z,variantIndex:Number(coniferVariant[1])});if(select)selectEditorObject(tree);return tree}
  const treeVariant=/^tree:(\d+)$/.exec(assetId);return treeVariant?createEditorTreeCluster(Number(treeVariant[1]),point,{select}):null;
}
function treeAssetPreview(treeSpecs){
  const preview=document.createElement("span");preview.className="tree-preview";
  const shadow=document.createElement("span");shadow.className="tree-preview-shadow";preview.append(shadow);
  const minX=Math.min(...treeSpecs.map(tree=>tree.x)),maxX=Math.max(...treeSpecs.map(tree=>tree.x));
  for(const tree of treeSpecs){
    const stem=document.createElement("i"),range=Math.max(.1,maxX-minX);
    stem.style.left=`${12+(tree.x-minX)/range*52}px`;stem.style.height=`${18+tree.height*15}px`;stem.style.zIndex=String(Math.round(30-tree.z*10));preview.append(stem);
  }
  return preview;
}
function characterAssetPreview(archetypeId){
  const archetype=ACTOR_ARCHETYPES[archetypeId]??ACTOR_ARCHETYPES.ch1,preview=document.createElement("span"),body=document.createElement("i");preview.className=`character-asset-preview ${archetype.faction} ${archetype.id}`;body.setAttribute("aria-hidden","true");preview.append(body);return preview;
}
function hudAssetPreview(archetypeId){const archetype=actorArchetype(archetypeId,ACTOR_ARCHETYPES[archetypeId]?.faction??"enemy"),preview=document.createElement("span"),icon=document.createElement("i"),label=document.createElement("small");preview.className="hud-asset-preview";icon.className=`${archetype.faction==="player"?"ch":"en"}`;label.textContent=archetype.label.replace("Swordsman","Sword").toUpperCase();preview.append(icon,label);return preview;}
function hudTextAssetPreview(){const preview=document.createElement("span"),label=document.createElement("small");preview.className="hud-text-asset-preview";label.textContent="TEXT";preview.append(label);return preview;}
function raidBuildingBlueprintPreview(kind){const preview=document.createElement("span");preview.className="folder-preview";preview.textContent=kind==="town-hall"?"TH":"BR";return preview;}
function progressBarBlueprintPreview(assetId){const settings=normalizeProgressBarBlueprintSettings(contentBrowserState.blueprintSettings[assetId],assetId),preview=document.createElement("span"),main=document.createElement("i");preview.className="progress-bar-blueprint-preview";preview.style.setProperty("--progress-bar-background",settings.backgroundColor);preview.style.setProperty("--progress-bar-main",settings.mainColor);preview.append(main);return preview;}
function importedModelPreview(){const preview=document.createElement("span");preview.className="folder-preview imported-model-preview";preview.textContent="GLB";return preview;}
const EDITOR_ASSET_FOLDERS=[
  {id:"terrain",label:"TERRAIN",icon:"▣"},
  {id:"houses",label:"HOUSES",icon:"⌂"},
  {id:"trees",label:"TREES",icon:"♣"},
  {id:"grass",label:"GRASS",icon:"♠"},
  {id:"rocks",label:"ROCKS",icon:"◆"}
];
function grassAssetPreview(blades){
  const preview=document.createElement("span");preview.className="tree-preview";
  const minX=Math.min(...blades.map(blade=>blade.x)),maxX=Math.max(...blades.map(blade=>blade.x)),minZ=Math.min(...blades.map(blade=>blade.z)),maxZ=Math.max(...blades.map(blade=>blade.z));
  const rangeX=Math.max(.1,maxX-minX),rangeZ=Math.max(.1,maxZ-minZ);
  for(const bladeSpec of blades){
    const blade=document.createElement("i"),previewLeft=blades.length===1?36:10+(bladeSpec.x-minX)/rangeX*54;blade.style.left=`${previewLeft}px`;blade.style.bottom=`${8+(bladeSpec.z-minZ)/rangeZ*11}px`;blade.style.height=`${12+bladeSpec.height*22}px`;blade.style.width=`${4+bladeSpec.width*17}px`;blade.style.transform=`rotate(${bladeSpec.turn*.5}rad)`;blade.style.zIndex=String(Math.round(20+(bladeSpec.z-minZ)/rangeZ*20));blade.style.background="#93a672";blade.style.boxShadow="0 0 0 1px #263229,0 7px 0 -2px #53665d30";preview.append(blade);
  }
  return preview;
}
function renderGrassCategoryFolders(list){
  const meadowFolder=document.createElement("button");meadowFolder.className="editor-folder-card";meadowFolder.setAttribute("aria-label","Open meadow grass blade folder");
  const meadowPreview=document.createElement("span");meadowPreview.className="folder-preview";meadowPreview.textContent="1";
  const meadowLabel=document.createElement("strong");meadowLabel.textContent="MEADOW BLADE";meadowFolder.append(meadowPreview,meadowLabel);meadowFolder.onclick=()=>openEditorAssetFolder("grass/meadow-blade");list.append(meadowFolder);
  const spriteFolder=document.createElement("button");spriteFolder.className="editor-folder-card";spriteFolder.setAttribute("aria-label","Open sprite grass folder");
  const spritePreview=document.createElement("span");spritePreview.className="folder-preview sprite-folder-preview";spritePreview.textContent=String(SPRITE_GRASS_ASSETS.length);
  const spriteLabel=document.createElement("strong");spriteLabel.textContent="SPRITES";spriteFolder.append(spritePreview,spriteLabel);spriteFolder.onclick=()=>openEditorAssetFolder("grass/sprites");list.append(spriteFolder);
  GRASS_CLUSTER_CATEGORIES.forEach(category=>{
    const card=document.createElement("button");card.className="editor-folder-card";card.setAttribute("aria-label",`Open ${category.label.toLowerCase()} grass folder`);
    const preview=document.createElement("span");preview.className="folder-preview";preview.textContent=String(category.count);
    const label=document.createElement("strong");label.textContent=category.label;card.append(preview,label);card.onclick=()=>openEditorAssetFolder(`grass/${category.id}`);list.append(card);
  });
}
function renderSpriteGrassAssets(list){
  SPRITE_GRASS_ASSETS.forEach((spec,index)=>{
    const assetId=`sprite-grass:${index}`;if(hiddenEditorAssets.has(assetId))return;
    const card=document.createElement("div"),preview=document.createElement("span"),image=document.createElement("img"),label=document.createElement("strong");
    card.className="editor-asset-card";card.dataset.asset=assetId;card.draggable=true;card.tabIndex=0;card.setAttribute("role","button");card.setAttribute("aria-pressed","false");card.setAttribute("aria-label",`Place ${spec.label.toLowerCase()}`);
    preview.className="sprite-grass-preview";image.src=spec.src;image.alt="";preview.append(image);label.textContent=spec.label;card.append(preview,label);
    card.addEventListener("click",()=>armEditorAsset(assetId,spec.label));card.addEventListener("keydown",event=>{if(event.code==="Enter"||event.code==="Space"){event.preventDefault();armEditorAsset(assetId,spec.label)}});card.addEventListener("dragstart",event=>{editorPendingAsset=assetId;editorLibrarySelection=assetId;editorLibrarySelectionLabel=spec.label;updateEditorAssetSelection();event.dataTransfer.effectAllowed="copy";event.dataTransfer.setData("application/x-crownwake-asset",assetId);event.dataTransfer.setData("text/plain",assetId);});list.append(card);
  });
}
function renderMeadowGrassBladeAsset(list){
  const assetId="meadow-grass-blade";if(hiddenEditorAssets.has(assetId))return;
  const card=document.createElement("div"),label=document.createElement("strong");card.className="editor-asset-card";card.dataset.asset=assetId;card.draggable=true;card.tabIndex=0;card.setAttribute("role","button");card.setAttribute("aria-pressed","false");card.setAttribute("aria-label","Place meadow grass blade");
  card.append(grassAssetPreview([{x:0,z:0,height:.78,width:.2,turn:0}]),label);label.textContent="MEADOW BLADE";
  card.addEventListener("click",()=>armEditorAsset(assetId,"Meadow grass blade"));card.addEventListener("keydown",event=>{if(event.code==="Enter"||event.code==="Space"){event.preventDefault();armEditorAsset(assetId,"Meadow grass blade")}});card.addEventListener("dragstart",event=>{editorPendingAsset=assetId;editorLibrarySelection=assetId;editorLibrarySelectionLabel="Meadow grass blade";updateEditorAssetSelection();event.dataTransfer.effectAllowed="copy";event.dataTransfer.setData("application/x-crownwake-asset",assetId);event.dataTransfer.setData("text/plain",assetId);});list.append(card);
}
function renderGrassAsset(list,variantIndex){
  const {category,versionNumber}=grassClusterIdentity(variantIndex),variant=GRASS_CLUSTER_VARIANTS[variantIndex];if(!category||!variant)return;
  const assetId=`grass-cluster:${variantIndex}`;
  if(hiddenEditorAssets.has(assetId)||(variantIndex===0&&hiddenEditorAssets.has("grass-cluster")))return;
  const versionLabel=String(versionNumber).padStart(2,"0"),labelText=`${category.label.toLowerCase()} grass cluster ${versionLabel}`,card=document.createElement("div");card.className="editor-asset-card";card.dataset.asset=assetId;card.draggable=true;card.tabIndex=0;card.setAttribute("role","button");card.setAttribute("aria-pressed","false");card.setAttribute("aria-label",`Place ${labelText}`);
  const label=document.createElement("strong");label.textContent=`${category.label} ${versionLabel}`;card.append(grassAssetPreview(variant),label);
  card.addEventListener("click",()=>armEditorAsset(assetId,labelText));card.addEventListener("keydown",event=>{if(event.code==="Enter"||event.code==="Space"){event.preventDefault();armEditorAsset(assetId,labelText)}});card.addEventListener("dragstart",event=>{editorPendingAsset=assetId;editorLibrarySelection=assetId;editorLibrarySelectionLabel=labelText;updateEditorAssetSelection();event.dataTransfer.effectAllowed="copy";event.dataTransfer.setData("application/x-crownwake-asset",assetId);event.dataTransfer.setData("text/plain",assetId);});list.append(card);
}
function renderTreeAssets(list){
  TREE_CLUSTER_VARIANTS.forEach((trees,index)=>{
    const assetId=`tree:${index}`,card=document.createElement("div");card.className="editor-asset-card";card.dataset.asset=assetId;card.draggable=true;card.tabIndex=0;card.setAttribute("role","button");card.setAttribute("aria-pressed","false");card.setAttribute("aria-label",`Place tree cluster ${index+1}`);
    if(hiddenEditorAssets.has(assetId))return;
    const assetLabel=`Tree cluster ${index+1}`,label=document.createElement("strong");label.textContent=`CLUSTER ${String(index+1).padStart(2,"0")}`;
    card.append(treeAssetPreview(trees),label);
    card.addEventListener("click",()=>armEditorAsset(assetId,assetLabel));
    card.addEventListener("keydown",event=>{if(event.code==="Enter"||event.code==="Space"){event.preventDefault();armEditorAsset(assetId,assetLabel)}});
    card.addEventListener("dragstart",event=>{editorPendingAsset=assetId;editorLibrarySelection=assetId;editorLibrarySelectionLabel=assetLabel;updateEditorAssetSelection();event.dataTransfer.effectAllowed="copy";event.dataTransfer.setData("application/x-crownwake-asset",assetId);event.dataTransfer.setData("text/plain",assetId);});
    list.append(card);
  });
  TALL_CONIFER_VARIANTS.forEach((variant,index)=>{
    const assetId=`tree-billboard:${index}`,card=document.createElement("div"),preview=document.createElement("span"),image=document.createElement("img"),label=document.createElement("strong");
    if(hiddenEditorAssets.has(assetId))return;
    card.className="editor-asset-card";card.dataset.asset=assetId;card.draggable=true;card.tabIndex=0;card.setAttribute("role","button");card.setAttribute("aria-pressed","false");card.setAttribute("aria-label",`Place ${variant.label.toLowerCase()} conifer`);
    preview.className="sprite-grass-preview tree-billboard-preview";image.src="./assets/Trees/tall-conifer-billboard.png";image.alt="";preview.append(image);label.textContent=variant.label;card.append(preview,label);
    const assetLabel=`Conifer ${variant.label.toLowerCase()}`;card.addEventListener("click",()=>armEditorAsset(assetId,assetLabel));card.addEventListener("keydown",event=>{if(event.code==="Enter"||event.code==="Space"){event.preventDefault();armEditorAsset(assetId,assetLabel)}});card.addEventListener("dragstart",event=>{editorPendingAsset=assetId;editorLibrarySelection=assetId;editorLibrarySelectionLabel=assetLabel;updateEditorAssetSelection();event.dataTransfer.effectAllowed="copy";event.dataTransfer.setData("application/x-crownwake-asset",assetId);event.dataTransfer.setData("text/plain",assetId);});list.append(card);
  });
}
function renderHouseAssets(list){
  const houseAssets=[
    {assetId:"archer-tower",label:"ARCHER TOWER",preview:"T"},
    ...FOREST_FENCE_SPECS.map((_,index)=>({assetId:`forest-fence:${index}`,label:`FENCE ${String(index+1).padStart(2,"0")}`,preview:String(index+1)}))
  ];
  for(const {assetId,label,preview:previewText} of houseAssets){
    if(hiddenEditorAssets.has(assetId))continue;
    const card=document.createElement("div");card.className="editor-asset-card";card.dataset.asset=assetId;card.draggable=true;card.tabIndex=0;card.setAttribute("role","button");card.setAttribute("aria-pressed","false");card.setAttribute("aria-label",`Place ${label.toLowerCase()}`);
    const preview=document.createElement("span");preview.className="folder-preview";preview.textContent=previewText;
    const cardLabel=document.createElement("strong");cardLabel.textContent=label;card.append(preview,cardLabel);
    card.addEventListener("click",()=>armEditorAsset(assetId,label));
    card.addEventListener("keydown",event=>{if(event.code==="Enter"||event.code==="Space"){event.preventDefault();armEditorAsset(assetId,label)}});
    card.addEventListener("dragstart",event=>{editorPendingAsset=assetId;editorLibrarySelection=assetId;editorLibrarySelectionLabel=label;updateEditorAssetSelection();event.dataTransfer.effectAllowed="copy";event.dataTransfer.setData("application/x-crownwake-asset",assetId);event.dataTransfer.setData("text/plain",assetId);});
    list.append(card);
  }
}
function renderTerrainAssets(list){
  const assetId="primitive-cube";if(hiddenEditorAssets.has(assetId))return;
  const card=document.createElement("div"),preview=document.createElement("span"),label=document.createElement("strong");
  card.className="editor-asset-card";card.dataset.asset=assetId;card.draggable=true;card.tabIndex=0;card.setAttribute("role","button");card.setAttribute("aria-pressed","false");card.setAttribute("aria-label","Place cube primitive");
  preview.className="primitive-cube-preview";label.textContent="CUBE";card.append(preview,label);
  card.addEventListener("click",()=>armEditorAsset(assetId,"Cube"));
  card.addEventListener("keydown",event=>{if(event.code==="Enter"||event.code==="Space"){event.preventDefault();armEditorAsset(assetId,"Cube")}});
  card.addEventListener("dragstart",event=>{editorPendingAsset=assetId;editorLibrarySelection=assetId;editorLibrarySelectionLabel="Cube";updateEditorAssetSelection();event.dataTransfer.effectAllowed="copy";event.dataTransfer.setData("application/x-crownwake-asset",assetId);event.dataTransfer.setData("text/plain",assetId);});list.append(card);
}
function renderRockAssets(list){
  ROCK_PILLAR_VARIANTS.forEach((variant,index)=>{
    const assetId=`rock-pillar:${index}`;if(hiddenEditorAssets.has(assetId))return;
    const card=document.createElement("div"),preview=document.createElement("span"),label=document.createElement("strong");
    card.className="editor-asset-card";card.dataset.asset=assetId;card.draggable=true;card.tabIndex=0;card.setAttribute("role","button");card.setAttribute("aria-pressed","false");card.setAttribute("aria-label",`Place rock pillar ${index+1}`);
    preview.className="rock-preview";preview.style.setProperty("--rock-height",`${Math.round(variant.height*21)}px`);
    for(let layer=0;layer<4;layer++){const band=document.createElement("i");band.style.setProperty("--rock-layer",String(layer));preview.append(band);}
    label.textContent=`PILLAR ${String(index+1).padStart(2,"0")}`;card.append(preview,label);
    card.addEventListener("click",()=>armEditorAsset(assetId,`Rock pillar ${index+1}`));
    card.addEventListener("keydown",event=>{if(event.code==="Enter"||event.code==="Space"){event.preventDefault();armEditorAsset(assetId,`Rock pillar ${index+1}`)}});
    card.addEventListener("dragstart",event=>{editorPendingAsset=assetId;editorLibrarySelection=assetId;editorLibrarySelectionLabel=`Rock pillar ${index+1}`;updateEditorAssetSelection();event.dataTransfer.effectAllowed="copy";event.dataTransfer.setData("application/x-crownwake-asset",assetId);event.dataTransfer.setData("text/plain",assetId);});list.append(card);
  });
}
function contentBrowserFolders(){
  const named=folder=>({...folder,name:contentBrowserState.folderNames[folder.id]||folder.name});
  return [named({id:CONTENT_BROWSER_ROOT_ID,name:"Content",parentId:null,system:true}),...CONTENT_BROWSER_SYSTEM_FOLDERS.map(folder=>named({...folder,system:true})),...contentBrowserState.folders.map(folder=>({...folder,system:false}))];
}
function contentBrowserFolderById(folderId){return contentBrowserFolders().find(folder=>folder.id===folderId)||null}
function contentBrowserChildren(folderId){return contentBrowserFolders().filter(folder=>folder.parentId===folderId).sort((a,b)=>a.name.localeCompare(b.name))}
function contentBrowserFolderPath(folderId){
  const path=[];let current=contentBrowserFolderById(folderId),guard=0;
  while(current&&guard++<64){path.unshift(current);current=current.parentId?contentBrowserFolderById(current.parentId):null}
  return path.length?path:[contentBrowserFolderById(CONTENT_BROWSER_ROOT_ID)];
}
function contentBrowserAssetSpecs(){
  const specs=[
    {id:CHARACTER_MODEL_ASSET_ID,name:"CH Model",type:"Model",folderId:"models",placeable:false,preview:()=>characterAssetPreview("ch1")},
    {id:SWORDSMAN_MODEL_ASSET_ID,name:"Crownwake Swordsman v02",type:"Model",folderId:"models",placeable:false,preview:()=>characterAssetPreview("ch3")},
    {id:CROWNWAKE_BUILDING_MODEL_ASSET_ID,name:"Crownwake Building",type:"Model",folderId:"models",placeable:false,preview:()=>importedModelPreview()},
    {id:CROWNWAKE_BASE_MODEL_ASSET_ID,name:"Crownwake Base",type:"Model",folderId:"models",placeable:false,preview:()=>importedModelPreview()},
    {id:"character:ch",name:"CH1",type:"Actor",folderId:"characters/ch",preview:()=>characterAssetPreview("ch1")},
    {id:"character:ch2",name:"CH2",type:"Actor",folderId:"characters/ch",preview:()=>characterAssetPreview("ch2")},
    {id:"character:ch3",name:"CH Swordsman BP",type:"Actor",folderId:"characters/ch",preview:()=>characterAssetPreview("ch3")},
    {id:"character:en",name:"EN1",type:"Actor",folderId:"characters/en",preview:()=>characterAssetPreview("en1")},
    {id:"character:en2",name:"EN2",type:"Actor",folderId:"characters/en",preview:()=>characterAssetPreview("en2")},
    {id:"character:en3",name:"EN 3",type:"Actor",folderId:"characters/en",preview:()=>characterAssetPreview("en3")},
    {id:"character:en4",name:"EN 4",type:"Actor",folderId:"characters/en",preview:()=>characterAssetPreview("en4")},
    {id:"character:en5",name:"EN Swordsman BP",type:"Actor",folderId:"characters/en",preview:()=>characterAssetPreview("en5")},
    {id:HUD_TEXT_ASSET_ID,name:"Objective Text HUD",type:"HUD",folderId:"hud",hudText:true,preview:()=>hudTextAssetPreview()},
    ...HUD_ARCHETYPE_IDS.map(archetypeId=>{const archetype=ACTOR_ARCHETYPES[archetypeId];return {id:hudAssetId(archetypeId),name:`${archetype.label} HUD`,type:"HUD",folderId:`hud/${archetype.faction==="player"?"ch":"en"}`,hudArchetypeId:archetypeId,preview:()=>hudAssetPreview(archetypeId)};}),
    {id:TILE_BP_ASSET_ID,name:"Tile_bp",type:"Blueprint",folderId:"bp_gn",preview:()=>{const preview=document.createElement("span");preview.className="folder-preview";preview.textContent="TILE";return preview;}},
    {id:BASE_BP_ASSET_ID,name:"Base_bp",type:"Blueprint",folderId:"bp_gn/base",tileBlueprint:true,preview:()=>{const preview=document.createElement("span");preview.className="folder-preview";preview.textContent="BASE";return preview;}},
    {id:TOWN_HALL_BP_ASSET_ID,name:"TownHall_bp",type:"Blueprint",folderId:"bp_gn/town-hall",blueprintKind:"town-hall",preview:()=>raidBuildingBlueprintPreview("town-hall")},
    {id:BARRACKS_BP_ASSET_ID,name:"Barracks_bp",type:"Blueprint",folderId:"bp_gn/barracks",blueprintKind:"barracks",preview:()=>raidBuildingBlueprintPreview("barracks")},
    {id:ACTOR_PROGRESS_BAR_BP_ASSET_ID,name:"CharacterProgressBar_bp",type:"Blueprint",folderId:"bp_gn/progress-bars",placeable:false,progressBarBlueprint:true,preview:()=>progressBarBlueprintPreview(ACTOR_PROGRESS_BAR_BP_ASSET_ID)},
    {id:BUILDING_PROGRESS_BAR_BP_ASSET_ID,name:"BuildingProgressBar_bp",type:"Blueprint",folderId:"bp_gn/progress-bars",placeable:false,progressBarBlueprint:true,preview:()=>progressBarBlueprintPreview(BUILDING_PROGRESS_BAR_BP_ASSET_ID)},
    ...contentBrowserState.blueprintCopies.map(copy=>({id:copy.id,name:copy.name,type:"Blueprint",folderId:copy.folderId,blueprintKind:copy.blueprintKind,preview:()=>raidBuildingBlueprintPreview(copy.blueprintKind)})),
    ...contentBrowserState.importedModels.map(model=>({id:model.id,name:model.name,type:"GLB Model",folderId:model.folderId,importedModel:true,placeable:importedModelTemplates.has(model.id)&&!isCrownwakeBaseModelAsset(model.id),preview:()=>importedModelPreview()})),
    {id:"primitive-cube",name:"Cube",type:"Mesh",folderId:"shapes",preview:()=>{const preview=document.createElement("span");preview.className="primitive-cube-preview";return preview;}},
    {id:"archer-tower",name:"Archer Tower",type:"Structure",folderId:"environment/structures",preview:()=>{const preview=document.createElement("span");preview.className="folder-preview";preview.textContent="T";return preview;}},
    ...FOREST_FENCE_SPECS.map((_,index)=>({id:`forest-fence:${index}`,name:`Fence ${String(index+1).padStart(2,"0")}`,type:"Mesh",folderId:"environment/structures",preview:()=>{const preview=document.createElement("span");preview.className="folder-preview";preview.textContent=String(index+1);return preview;}})),
    ...TREE_CLUSTER_VARIANTS.map((trees,index)=>({id:`tree:${index}`,name:`Tree cluster ${String(index+1).padStart(2,"0")}`,type:"Foliage",folderId:"environment/trees",preview:()=>treeAssetPreview(trees)})),
    ...TALL_CONIFER_VARIANTS.map((variant,index)=>({id:`tree-billboard:${index}`,name:variant.label,type:"Billboard",folderId:"environment/trees",preview:()=>spritePreview("sprite-grass-preview tree-billboard-preview","./assets/Trees/tall-conifer-billboard.png")})),
    ...GRASS_CLUSTER_VARIANTS.map((blades,index)=>{const {category,versionNumber}=grassClusterIdentity(index);return {id:`grass-cluster:${index}`,name:`${category.label.toLowerCase()} grass cluster ${String(versionNumber).padStart(2,"0")}`,type:"Foliage",folderId:"environment/grass",preview:()=>grassAssetPreview(blades)}}),
    ...SPRITE_GRASS_ASSETS.map((spec,index)=>({id:`sprite-grass:${index}`,name:spec.label,type:"Sprite",folderId:"environment/grass",preview:()=>spritePreview("sprite-grass-preview",spec.src)})),
    {id:"meadow-grass-blade",name:"Meadow blade",type:"Foliage",folderId:"environment/grass",preview:()=>grassAssetPreview([{x:0,z:0,height:.78,width:.2,turn:0}])},
    ...ROCK_PILLAR_VARIANTS.map((variant,index)=>({id:`rock-pillar:${index}`,name:`Rock pillar ${String(index+1).padStart(2,"0")}`,type:"Mesh",folderId:"environment/rocks",preview:()=>{const preview=document.createElement("span");preview.className="rock-preview";preview.style.setProperty("--rock-height",`${Math.round(variant.height*21)}px`);for(let layer=0;layer<4;layer++){const band=document.createElement("i");band.style.setProperty("--rock-layer",String(layer));preview.append(band)}return preview;}}))
  ];
  return specs.map(spec=>({...spec,name:contentBrowserState.assetNames[spec.id]||spec.name,folderId:contentBrowserFolderById(contentBrowserState.assetFolders[spec.id])?contentBrowserState.assetFolders[spec.id]:spec.folderId}));
}
function contentBrowserAssetById(assetId){return contentBrowserAssetSpecs().find(asset=>asset.id===assetId)||null}
function contentBrowserAssetsInFolder(folderId){return contentBrowserAssetSpecs().filter(asset=>asset.folderId===folderId&&!hiddenEditorAssets.has(asset.id)).sort((a,b)=>a.name.localeCompare(b.name))}
function contentBrowserQueryMatches(value){return !contentBrowserQuery||value.toLocaleLowerCase().includes(contentBrowserQuery.toLocaleLowerCase())}
function ensureContentBrowserFolder(){if(!contentBrowserFolderById(contentBrowserFolderId))contentBrowserFolderId=CONTENT_BROWSER_ROOT_ID;}
function contentBrowserCanChangeFolder(folder){return Boolean(folder)&&!folder.system&&folder.id!==CONTENT_BROWSER_ROOT_ID}
function contentBrowserDescendants(folderId){
  const ids=new Set([folderId]),stack=[folderId];
  while(stack.length){for(const child of contentBrowserChildren(stack.pop()))if(!ids.has(child.id)){ids.add(child.id);stack.push(child.id)}}
  return ids;
}
function contentBrowserLegacyGrassRoute(folderId){
  // Old saved editor sessions can still point at the former nested grass routes.
  if(folderId==="grass/sprites")return {folderId:"environment/grass",assetIds:SPRITE_GRASS_ASSETS.map((_,index)=>`sprite-grass:${index}`)};
  const grassFolder=/^grass\/(.+)$/.exec(folderId);if(!grassFolder)return null;
  const category=GRASS_CLUSTER_CATEGORIES.find(item=>item.id===grassFolder[1]);if(!category)return null;
  const assetIds=[];
  for(let versionIndex=0;versionIndex<GRASS_CLUSTER_VERSION_COUNT;versionIndex++){
    const variantIndex=GRASS_CLUSTER_VARIANT_DEFINITIONS.findIndex(definition=>definition.id===category.id&&definition.versionNumber===versionIndex+1);
    if(variantIndex>=0)assetIds.push(`grass-cluster:${variantIndex}`);
  }
  return {folderId:"environment/grass",assetIds};
}
function openEditorAssetFolder(folderId=CONTENT_BROWSER_ROOT_ID){
  const aliases={terrain:"environment/terrain",houses:"environment/structures",trees:"environment/trees",grass:"environment/grass",rocks:"environment/rocks"};
  const legacyGrassRoute=contentBrowserLegacyGrassRoute(folderId);contentBrowserFolderId=legacyGrassRoute?.folderId||aliases[folderId]||folderId||CONTENT_BROWSER_ROOT_ID;ensureContentBrowserFolder();editorAssetFolder=contentBrowserFolderId;editorPendingAsset=null;contentBrowserSelection.clear();contentBrowserSelectionAnchor=null;editorLibrarySelection=null;editorLibrarySelectionLabel="";renderContentBrowser();updateEditorAssetSelection();updateEditorInspector();
}
function renderContentBrowserBreadcrumb(){
  const crumb=$("content-browser-breadcrumb");crumb.replaceChildren();
  for(const [index,folder] of contentBrowserFolderPath(contentBrowserFolderId).entries()){
    if(index){const separator=document.createElement("span");separator.textContent="›";separator.setAttribute("aria-hidden","true");crumb.append(separator)}
    const button=document.createElement("button");button.type="button";button.textContent=folder.name;button.className=index===contentBrowserFolderPath(contentBrowserFolderId).length-1?"current":"";button.onclick=()=>openEditorAssetFolder(folder.id);crumb.append(button);
  }
}
function contentBrowserDropOnFolder(event,folderId){
  event.preventDefault();event.currentTarget.classList.remove("drop-target");
  const assetIds=JSON.parse(event.dataTransfer.getData("application/x-crownwake-content-assets")||"[]");
  const sourceFolderId=event.dataTransfer.getData("application/x-crownwake-content-folder");
  if(assetIds.length){recordEditorUndo();for(const assetId of assetIds)contentBrowserState.assetFolders[assetId]=folderId;persistContentBrowserState();renderContentBrowser();$("editor-status").textContent=`Moved ${assetIds.length} asset${assetIds.length===1?"":"s"} to ${contentBrowserFolderById(folderId)?.name||"folder"}.`;return}
  if(sourceFolderId&&sourceFolderId!==folderId&&!contentBrowserDescendants(sourceFolderId).has(folderId)&&contentBrowserCanChangeFolder(contentBrowserFolderById(sourceFolderId))){
    const folder=contentBrowserFolderById(sourceFolderId);const saved=contentBrowserState.folders.find(item=>item.id===folder.id);if(saved){recordEditorUndo();saved.parentId=folderId;persistContentBrowserState();renderContentBrowser();}
  }
}
function makeContentBrowserFolderCard(folder){
  const card=document.createElement("div"),preview=document.createElement("span"),label=document.createElement("strong"),target={kind:"folder",folder};card.className="editor-folder-card content-browser-folder-card";card.draggable=contentBrowserCanChangeFolder(folder);card.dataset.folder=folder.id;card.tabIndex=0;card.setAttribute("role","button");card.setAttribute("aria-label",`Open ${folder.name}`);preview.className="folder-preview";preview.setAttribute("aria-hidden","true");label.textContent=folder.name;card.append(preview,label);
  card.addEventListener("pointerdown",event=>{if(event.button===0&&contentBrowserRenameZone(card,event)){event.preventDefault();event.stopPropagation();beginContentBrowserInlineRename(target,card,label);}});
  card.onclick=event=>{if(card.classList.contains("content-browser-renaming")||contentBrowserRenameZone(card,event))return;openEditorAssetFolder(folder.id);};card.ondblclick=event=>{if(card.classList.contains("content-browser-renaming")||contentBrowserRenameZone(card,event))return;openEditorAssetFolder(folder.id);};card.onkeydown=event=>{if(event.code==="Enter"||event.code==="Space"){event.preventDefault();openEditorAssetFolder(folder.id);}};card.oncontextmenu=event=>showContentBrowserContextMenu(event,target);
  card.ondragstart=event=>{event.dataTransfer.effectAllowed="move";event.dataTransfer.setData("application/x-crownwake-content-folder",folder.id)};
  card.ondragover=event=>{event.preventDefault();card.classList.add("drop-target")};card.ondragleave=()=>card.classList.remove("drop-target");card.ondrop=event=>contentBrowserDropOnFolder(event,folder.id);
  return card;
}
function selectContentBrowserAsset(assetId,event={}){
  const visible=contentBrowserAssetsInFolder(contentBrowserFolderId).filter(asset=>contentBrowserQueryMatches(asset.name)).map(asset=>asset.id);
  if(event.shiftKey&&contentBrowserSelectionAnchor&&visible.includes(contentBrowserSelectionAnchor)){
    const start=visible.indexOf(contentBrowserSelectionAnchor),end=visible.indexOf(assetId);if(!event.ctrlKey&&!event.metaKey)contentBrowserSelection.clear();for(const id of visible.slice(Math.min(start,end),Math.max(start,end)+1))contentBrowserSelection.add(id);
  }else if(event.ctrlKey||event.metaKey){if(contentBrowserSelection.has(assetId))contentBrowserSelection.delete(assetId);else contentBrowserSelection.add(assetId);contentBrowserSelectionAnchor=assetId;}
  else{contentBrowserSelection.clear();contentBrowserSelection.add(assetId);contentBrowserSelectionAnchor=assetId;}
  const selected=[...contentBrowserSelection];editorLibrarySelection=selected.at(-1)||null;editorLibrarySelectionLabel=contentBrowserAssetById(editorLibrarySelection)?.name||"";editorPendingAsset=null;updateEditorAssetSelection();selectEditorObject(null);
}
function makeContentBrowserAssetCard(asset){
  const card=document.createElement("div"),label=document.createElement("strong"),target={kind:"asset",asset},placeable=asset.placeable!==false;card.className="editor-asset-card content-browser-asset-card";card.dataset.asset=asset.id;card.draggable=placeable;card.tabIndex=0;card.setAttribute("role","button");card.setAttribute("aria-pressed",String(contentBrowserSelection.has(asset.id)));card.setAttribute("aria-label",`${asset.name}, ${asset.type}`);label.textContent=asset.name;card.append(asset.preview(),label);
  card.addEventListener("pointerdown",event=>{if(event.button===0&&contentBrowserRenameZone(card,event)){event.preventDefault();event.stopPropagation();beginContentBrowserInlineRename(target,card,label);}});
  card.addEventListener("click",event=>{if(card.classList.contains("content-browser-renaming")||contentBrowserRenameZone(card,event))return;selectContentBrowserAsset(asset.id,event)});card.addEventListener("dblclick",event=>{if(card.classList.contains("content-browser-renaming")||contentBrowserRenameZone(card,event))return;selectContentBrowserAsset(asset.id,{});if(placeable)armEditorAsset(asset.id,asset.name)});card.addEventListener("keydown",event=>{if(event.code==="Enter"||event.code==="Space"){event.preventDefault();selectContentBrowserAsset(asset.id,event)}});card.addEventListener("contextmenu",event=>{selectContentBrowserAsset(asset.id,event);showContentBrowserContextMenu(event,target)});
  if(placeable)card.addEventListener("dragstart",event=>{if(!contentBrowserSelection.has(asset.id))selectContentBrowserAsset(asset.id,{});const selected=[...contentBrowserSelection];event.dataTransfer.effectAllowed="copyMove";event.dataTransfer.setData("application/x-crownwake-content-assets",JSON.stringify(selected));event.dataTransfer.setData("application/x-crownwake-asset",asset.id);event.dataTransfer.setData("text/plain",asset.id);});return card;
}
function renderContentBrowserTree(){
  const tree=$("content-browser-tree");tree.replaceChildren();
  const addFolder=(folder,depth=0)=>{
    const children=contentBrowserChildren(folder.id),row=document.createElement("div"),toggle=document.createElement("button"),label=document.createElement("button");row.className="content-browser-tree-row";row.style.setProperty("--tree-depth",String(depth));
    toggle.type="button";toggle.className="content-browser-tree-toggle";toggle.textContent=children.length?(contentBrowserExpanded.has(folder.id)?"▾":"▸"):"";toggle.disabled=!children.length;toggle.onclick=event=>{event.stopPropagation();if(contentBrowserExpanded.has(folder.id))contentBrowserExpanded.delete(folder.id);else contentBrowserExpanded.add(folder.id);renderContentBrowserTree();};
    label.type="button";label.className="content-browser-tree-label";label.dataset.folder=folder.id;label.textContent=folder.name;label.classList.toggle("selected",folder.id===contentBrowserFolderId);label.onclick=()=>openEditorAssetFolder(folder.id);label.oncontextmenu=event=>showContentBrowserContextMenu(event,{kind:"folder",folder});
    label.ondragover=event=>{event.preventDefault();label.classList.add("drop-target")};label.ondragleave=()=>label.classList.remove("drop-target");label.ondrop=event=>contentBrowserDropOnFolder(event,folder.id);row.append(toggle,label);tree.append(row);
    if(children.length&&contentBrowserExpanded.has(folder.id))for(const child of children)addFolder(child,depth+1);
  };
  addFolder(contentBrowserFolderById(CONTENT_BROWSER_ROOT_ID));
  tree.oncontextmenu=event=>{if(event.target===tree)showContentBrowserContextMenu(event,{kind:"blank",folder:contentBrowserFolderById(contentBrowserFolderId)})};
}
function renderContentBrowser(){
  ensureContentBrowserFolder();const folder=contentBrowserFolderById(contentBrowserFolderId),list=$("editor-asset-list"),copy=$("asset-panel-copy"),title=$("asset-panel-title");title.textContent="CONTENT BROWSER";copy.textContent=`${folder.name} · double-click an asset to place it.`;list.replaceChildren();renderContentBrowserBreadcrumb();renderContentBrowserTree();
  const folders=contentBrowserChildren(folder.id).filter(child=>contentBrowserQueryMatches(child.name)),assets=contentBrowserAssetsInFolder(folder.id).filter(asset=>contentBrowserQueryMatches(asset.name));
  for(const child of folders)list.append(makeContentBrowserFolderCard(child));for(const asset of assets)list.append(makeContentBrowserAssetCard(asset));
  if(!folders.length&&!assets.length){const empty=document.createElement("p");empty.className="asset-empty";empty.textContent=contentBrowserQuery?"No matching assets or folders.":"This folder is empty. Right-click to create a sub-folder.";list.append(empty);}
  list.onclick=event=>{if(event.target!==list)return;contentBrowserSelection.clear();editorLibrarySelection=null;editorLibrarySelectionLabel="";editorPendingAsset=null;updateEditorAssetSelection();updateEditorInspector();};
  list.oncontextmenu=event=>{if(event.target===list)showContentBrowserContextMenu(event,{kind:"blank",folder});};
}
function contentBrowserCreateFolder(parentId=contentBrowserFolderId){
  const parent=contentBrowserFolderById(parentId);if(!parent)return;const name=prompt(`New folder in ${parent.name}:`,`New Folder`)?.trim();if(!name)return;
  const id=`folder-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,7)}`;recordEditorUndo();contentBrowserState.folders.push({id,name,parentId});contentBrowserExpanded.add(parentId);persistContentBrowserState();renderContentBrowser();$("editor-status").textContent=`Created ${name}.`;
}
function importedModelDisplayName(fileName){return String(fileName??"").replace(/\.glb$/i,"").trim().slice(0,64)||"Imported GLB";}
function contentBrowserObjectHasExportableMesh(object){
  let hasMesh=false;object?.traverse(part=>{if(part.isMesh&&!part.userData?.healthWidgetLayer)hasMesh=true;});return hasMesh;
}
function contentBrowserNewModelSource(){
  if(mode!=="editor")return null;
  const selectedObject=editorSelection,selectedType=selectedObject?.userData?.editorAssetType;
  if(selectedObject&&editorObjects.includes(selectedObject)&&!['world-floor','tile-spawner'].includes(selectedType)&&contentBrowserObjectHasExportableMesh(selectedObject))return {kind:"object",object:selectedObject,name:selectedObject.name||"Crownwake Model"};
  const modelAsset=selectedContentBrowserModelAsset();if(modelAsset)return {kind:"model",asset:modelAsset,name:modelAsset.name};
  const buildingProfile=selectedBuildingBlueprintProfile();if(buildingProfile)return {kind:"blueprint",profile:buildingProfile,name:buildingProfile.asset.name};
  return null;
}
function cloneEditorObjectForNewModel(object){
  const root=new THREE.Group(),healthWidget=object.userData?.healthWidget;root.name=`${object.name||"Crownwake Model"} Model`;
  if(object.userData?.raidBuilding){
    for(const child of object.children)if(child!==healthWidget)root.add(child.clone(true));
    root.scale.copy(object.scale);
  }else{
    const clone=object.clone(true),healthIndex=healthWidget?object.children.indexOf(healthWidget):-1;
    if(healthIndex>=0)clone.remove(clone.children[healthIndex]);
    clone.position.set(0,0,0);clone.rotation.set(0,0,0);root.add(clone);
  }
  return root;
}
function prepareNewModelExportRoot(root){
  root.traverse(part=>{part.userData={};});root.updateMatrixWorld(true);
  const bounds=new THREE.Box3().setFromObject(root),size=bounds.getSize(new THREE.Vector3()),center=bounds.getCenter(new THREE.Vector3());
  if(!Number.isFinite(size.x)||!Number.isFinite(size.y)||!Number.isFinite(size.z)||size.x<=.001||size.y<=.001||size.z<=.001)return null;
  root.position.x-=center.x;root.position.z-=center.z;root.position.y-=bounds.min.y;root.updateMatrixWorld(true);
  return {root,height:size.y};
}
function contentBrowserNewModelExportRoot(source){
  let root=null;
  if(source.kind==="object")root=cloneEditorObjectForNewModel(source.object);
  if(source.kind==="model"){
    const visual=cloneContentBrowserModelVisual(source.asset.id);if(!visual)return null;
    root=new THREE.Group();root.name=`${source.asset.name} Model`;root.add(visual);
  }
  if(source.kind==="blueprint"){
    root=makeRaidBuilding(source.profile.asset.blueprintKind,source.profile.settings);root.name=`${source.profile.asset.name} Model`;
  }
  return root?prepareNewModelExportRoot(root):null;
}
async function saveNewModelFile(name,buffer){
  const response=await fetch("/api/models",{method:"POST",headers:{"Content-Type":"model/gltf-binary","X-Crownwake-Model-Name":name},body:buffer});
  const payload=await response.json().catch(()=>null);if(!response.ok)throw new Error(payload?.error||`The local model saver returned ${response.status}.`);
  if(!payload||typeof payload.fileName!=="string"||!normalizeGeneratedModelSourcePath(payload.path))throw new Error("The local model saver returned an invalid file path.");
  return payload;
}
function updateContentBrowserNewModelButton(){
  const button=$("content-browser-new-model");if(!button)return;
  const source=contentBrowserNewModelSource(),enabled=Boolean(source)&&!contentBrowserModelCreationInProgress;
  button.disabled=!enabled;button.textContent=contentBrowserModelCreationInProgress?"SAVING...":"NEW MODEL";
  button.title=contentBrowserModelCreationInProgress?"Saving the new model to Models":source?`Create a new model from ${source.name} at its current size`:"Select a model or placed asset first";
}
async function contentBrowserCreateNewModel(){
  const source=contentBrowserNewModelSource();if(!source){$("editor-status").textContent="Select a model or placed asset before creating a new model.";return;}
  const name=prompt("New model name:",`${importedModelDisplayName(source.name)} Model`)?.trim();if(!name)return;
  contentBrowserModelCreationInProgress=true;updateContentBrowserNewModelButton();
  try{
    const exported=contentBrowserNewModelExportRoot(source);if(!exported)throw new Error("That selection does not contain exportable model geometry.");
    const buffer=await new GLTFExporter().parseAsync(exported.root,{binary:true,onlyVisible:false,trs:true,truncateDrawRange:true});
    if(!(buffer instanceof ArrayBuffer))throw new Error("The model exporter did not create a GLB file.");
    if(buffer.byteLength<=0||buffer.byteLength>IMPORTED_MODEL_MAX_BYTES)throw new Error("The new GLB must be between 1 byte and 50 MB.");
    const saved=await saveNewModelFile(name,buffer),assetId=`imported-model:${Date.now().toString(36)}-${Math.random().toString(36).slice(2,8)}`;
    const template=prepareImportedModelTemplate(await parseImportedGlb(buffer));await writeImportedModelBuffer(assetId,buffer);
    const model={id:assetId,name:importedModelDisplayName(name),folderId:"models",materials:template.userData.importedModelMaterials.map(material=>({...material})),sourcePath:normalizeGeneratedModelSourcePath(saved.path)};
    recordEditorUndo();contentBrowserState.importedModels.push(model);contentBrowserState.modelScales[assetId]=[0,1,2].map(()=>THREE.MathUtils.clamp(exported.height/IMPORTED_MODEL_TARGET_HEIGHT,.02,20));importedModelTemplates.set(assetId,template);importedModelLoadErrors.delete(assetId);contentBrowserFolderId="models";contentBrowserExpanded.add(CONTENT_BROWSER_ROOT_ID);contentBrowserSelection.clear();contentBrowserSelection.add(assetId);contentBrowserSelectionAnchor=assetId;editorLibrarySelection=assetId;editorLibrarySelectionLabel=model.name;editorPendingAsset=null;persistContentBrowserState();renderContentBrowser();updateEditorAssetSelection();updateEditorInspector();
    $("editor-status").textContent=`Created ${model.name} at ${saved.path}. Its current size is now the new model default.`;
  }catch(error){$("editor-status").textContent=error instanceof Error?`Could not create model: ${error.message}`:"Could not create the new model.";}
  finally{contentBrowserModelCreationInProgress=false;updateContentBrowserNewModelButton();}
}
async function contentBrowserImportGlb(){
  if(mode!=="editor")return;
  const input=$("content-browser-import-input"),file=input?.files?.[0];if(input)input.value="";if(!file)return;
  if(!/\.glb$/i.test(file.name)){ $("editor-status").textContent="Choose a .glb model file to import.";return; }
  if(file.size<=0){$("editor-status").textContent="That GLB file is empty.";return;}
  if(file.size>IMPORTED_MODEL_MAX_BYTES){$("editor-status").textContent="GLB files must be 50 MB or smaller.";return;}
  const assetId=`imported-model:${Date.now().toString(36)}-${Math.random().toString(36).slice(2,8)}`;
  try{
    const buffer=await file.arrayBuffer(),template=prepareImportedModelTemplate(await parseImportedGlb(buffer)),folderId=contentBrowserFolderById(contentBrowserFolderId)?contentBrowserFolderId:CONTENT_BROWSER_ROOT_ID;
    await writeImportedModelBuffer(assetId,buffer);
    const importedModel={id:assetId,name:importedModelDisplayName(file.name),folderId,materials:template.userData.importedModelMaterials.map(material=>({...material}))};
    recordEditorUndo();contentBrowserState.importedModels.push(importedModel);importedModelTemplates.set(assetId,template);importedModelLoadErrors.delete(assetId);persistContentBrowserState();renderContentBrowser();contentBrowserSelection.clear();contentBrowserSelection.add(assetId);contentBrowserSelectionAnchor=assetId;editorLibrarySelection=assetId;editorLibrarySelectionLabel=importedModel.name;updateEditorAssetSelection();
    $("editor-status").textContent=`Imported ${importedModel.name}. Double-click it, then click the level to place it.`;
  }catch(error){$("editor-status").textContent=error instanceof Error?`Could not import GLB: ${error.message}`:"Could not import that GLB.";}
}
function contentBrowserRename(target){
  const current=target.kind==="folder"?target.folder.name:target.asset.name;const name=prompt(`Rename ${current}:`,current)?.trim();if(!name||name===current)return;
  contentBrowserSetName(target,name);
}
function contentBrowserSetName(target,name){
  const next=String(name??"").trim();if(!next)return;
  const current=target.kind==="folder"?target.folder.name:target.asset.name;if(next===current)return;
  recordEditorUndo();
  if(target.kind==="folder"){
    const saved=contentBrowserState.folders.find(folder=>folder.id===target.folder.id);
    if(saved)saved.name=next;else contentBrowserState.folderNames[target.folder.id]=next;
  }else contentBrowserState.assetNames[target.asset.id]=next;
  persistContentBrowserState();renderContentBrowser();$("editor-status").textContent=`Renamed ${next}.`;
}
function contentBrowserRenameZone(card,event){
  const bounds=card.getBoundingClientRect();return event.clientY>=bounds.top+bounds.height*.75;
}
function beginContentBrowserInlineRename(target,card,label){
  if(card.classList.contains("content-browser-renaming"))return;
  const current=target.kind==="folder"?target.folder.name:target.asset.name,input=document.createElement("input");
  card.classList.add("content-browser-renaming");card.draggable=false;input.className="content-browser-name-input";input.value=current;input.setAttribute("aria-label",`Rename ${current}`);label.replaceWith(input);
  let settled=false;
  const finish=commit=>{if(settled)return;settled=true;const next=input.value.trim();card.classList.remove("content-browser-renaming");if(commit&&next&&next!==current)contentBrowserSetName(target,next);else renderContentBrowser();};
  input.addEventListener("pointerdown",event=>event.stopPropagation());input.addEventListener("keydown",event=>{if(event.code==="Enter"){event.preventDefault();finish(true);}if(event.code==="Escape"){event.preventDefault();finish(false);}});input.addEventListener("blur",()=>finish(true));
  requestAnimationFrame(()=>{input.focus();input.select();});
}
function contentBrowserDeleteFolder(folder){
  if(!contentBrowserCanChangeFolder(folder))return;pendingEditorDelete={kind:"content-folder",folderId:folder.id,label:folder.name};$("editor-delete-title").textContent="DELETE FOLDER?";$("editor-delete-copy").textContent=`Delete ${folder.name}? Its contents will stay available and move to ${contentBrowserFolderById(folder.parentId)?.name||"Content"}.`;$("editor-delete-confirm").classList.remove("hidden");requestAnimationFrame(()=>{positionEditorDeleteConfirm();$("editor-delete-confirm-button").focus();});
}
function contentBrowserMoveAsset(assetId,folderId){recordEditorUndo();contentBrowserState.assetFolders[assetId]=folderId;persistContentBrowserState();renderContentBrowser();}
function contentBrowserDuplicateSelectedBlueprint(){
  const asset=contentBrowserAssetById(editorLibrarySelection);if(!asset?.blueprintKind)return;
  recordEditorUndo();const id=`blueprint:${asset.blueprintKind}:copy-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,7)}`,copy={id,name:`${asset.name} Copy`,folderId:asset.folderId,blueprintKind:asset.blueprintKind};contentBrowserState.blueprintCopies.push(copy);contentBrowserState.blueprintSettings[id]={...buildingBlueprintSettings(asset.id)};contentBrowserSelection.clear();contentBrowserSelection.add(id);contentBrowserSelectionAnchor=id;editorLibrarySelection=id;editorLibrarySelectionLabel=copy.name;persistContentBrowserState();renderContentBrowser();updateEditorAssetSelection();updateEditorInspector();$("editor-status").textContent=`Duplicated ${asset.name}. Rename or move the new blueprint variation from the Content Browser.`;
}
function showContentBrowserContextMenu(event,target){
  event.preventDefault();event.stopPropagation();const menu=$("content-browser-context-menu");menu.replaceChildren();contentBrowserContextTarget=target;
  const add=(label,handler,{danger=false}={})=>{const button=document.createElement("button");button.type="button";button.textContent=label;if(danger)button.classList.add("danger");button.onclick=()=>{hideContentBrowserContextMenu();handler();};menu.append(button);};
  if(target.kind==="blank")add("New Folder",()=>contentBrowserCreateFolder(target.folder.id));
  if(target.kind==="folder"){
    add("Open",()=>openEditorAssetFolder(target.folder.id));add("New Folder",()=>contentBrowserCreateFolder(target.folder.id));
    add("Rename",()=>contentBrowserRename(target));if(contentBrowserCanChangeFolder(target.folder))add("Delete",()=>contentBrowserDeleteFolder(target.folder),{danger:true});
  }
  if(target.kind==="asset"){
    if(target.asset.placeable!==false)add("Place in Level",()=>armEditorAsset(target.asset.id,target.asset.name));add("Rename",()=>contentBrowserRename(target));
    const mover=document.createElement("select");mover.className="content-browser-move-select";for(const folder of contentBrowserFolders()){const option=document.createElement("option");option.value=folder.id;option.textContent=contentBrowserFolderPath(folder.id).map(entry=>entry.name).join(" › ");option.selected=folder.id===target.asset.folderId;mover.append(option)}menu.append(mover);add("Move Here",()=>contentBrowserMoveAsset(target.asset.id,mover.value));add("Delete",()=>{contentBrowserSelection.clear();contentBrowserSelection.add(target.asset.id);contentBrowserSelectionAnchor=target.asset.id;editorLibrarySelection=target.asset.id;editorLibrarySelectionLabel=target.asset.name;openContentBrowserAssetDeleteConfirm();},{danger:true});
  }
  menu.classList.remove("hidden");const maxX=innerWidth-menu.offsetWidth-8,maxY=innerHeight-menu.offsetHeight-8;menu.style.left=`${Math.max(8,Math.min(event.clientX,maxX))}px`;menu.style.top=`${Math.max(8,Math.min(event.clientY,maxY))}px`;
}
function hideContentBrowserContextMenu(){const menu=$("content-browser-context-menu");menu.classList.add("hidden");menu.replaceChildren();contentBrowserContextTarget=null;}
function renderEditorAssets(){renderContentBrowser()}
function editorAssetFolderParent(folderId){return contentBrowserFolderById(folderId)?.parentId||null}
function setAssetPanel(open){
  const panel=$("asset-panel");$("editor-context-assets")?.setAttribute("aria-expanded",String(open));
  if(open){if(editorAssetFolder===null)openEditorAssetFolder(null);panel.classList.remove("hidden");panel.classList.add("open");}
  else{panel.classList.remove("open");panel.classList.add("hidden");}
}
function toggleEditorEnvironmentPopover(force){
  const panel=$("world-look-panel");if(!panel)return;
  const open=typeof force==="boolean"?force:!editorEnvironmentOpen;
  editorEnvironmentOpen=open;panel.classList.toggle("hidden",!open);$("editor-environment-toggle")?.setAttribute("aria-pressed",String(open));updateEditorInspector();
}
function updateEditorZoomControls(){
  const percent=Math.round(100/editorCameraScale);
  $("editor-zoom-value").textContent=`${percent}%`;
  $("editor-zoom-in").disabled=editorCameraScale<=EDITOR_ZOOM_MIN;
  $("editor-zoom-out").disabled=editorCameraScale>=EDITOR_ZOOM_MAX;
}
function adjustEditorZoom(delta){
  if(mode!=="editor")return;
  const percent=THREE.MathUtils.clamp(Math.round(100/editorCameraScale)+delta,100/EDITOR_ZOOM_MAX,100/EDITOR_ZOOM_MIN);
  editorCameraScale=100/percent;
  updateEditorZoomControls();updateEditorTransformGizmo();
}
initializeEditorShell();applyEditorLayout();
function openLevelEditor(){
  if(mode!=="settings")return;
  editorReturnMode=settingsReturnMode;$("settings-panel").classList.add("hidden");$("pause-state").classList.add("hidden");
  clearTacticalSelection();mode="editor";editorCameraFocus.copy(gameplayCameraFocus.lengthSq()>.001?gameplayCameraFocus:playerFocus().position);editorCameraFocus.y=0;
  if(savedLevelCamera)editorCameraFocus.set(savedLevelCamera.x,0,savedLevelCamera.z);
  editorCameraRotation.fromArray(savedLevelCamera?.rotation??[0,0,0]);
  editorCameraScale=THREE.MathUtils.clamp(savedLevelCamera?.scale??gameplayCameraScale,EDITOR_ZOOM_MIN,EDITOR_ZOOM_MAX);document.body.classList.add("editor-active");$("editor-shell").classList.remove("hidden");
  editorUndoHistory=[];commandHoverCell=null;updateEditorUndoControl();updateEditorZoomControls();updateEditorTransformControls();updateEditorScaleLock();syncFoliagePaintControls();buildEditorTransformGizmo();
  $("editor-toolbar").classList.remove("hidden");toggleEditorEnvironmentPopover(false);$("editor-transform-panel").classList.add("hidden");$("world-outliner").classList.remove("hidden");$("editor-status").classList.remove("hidden");ensureEditorCameraObject();syncWorldLookControls();applyWorldLook();renderEditorAssets();renderWorldOutliner();updateEditorTransformInspector();setEditorContext("select");setAssetPanel(true);updateFoliagePanel();applyEditorLayout();refreshCommandGrid();setNavigationDebugVisible(navigationDebugVisible);sounds.music.pause();
}
function closeLevelEditor(){
  if(mode!=="editor")return;
  saveLevelLayout();
  if(foliagePaintActive)setFoliagePaintActive(false);
  if(editorPointerState&&canvas.hasPointerCapture?.(editorPointerState.pointerId))canvas.releasePointerCapture(editorPointerState.pointerId);
  editorPointerState=null;editorCameraTravel=null;editorKeys.clear();editorPendingAsset=null;editorAssetFolder=null;commandHoverCell=null;clearCommandGrid();updateEditorAssetSelection();closeEditorDeleteConfirm();selectEditorObject(null);removeEditorCameraObject();setAssetPanel(false);
  $("editor-shell").classList.add("hidden");$("editor-toolbar").classList.add("hidden");toggleEditorEnvironmentPopover(false);$("editor-transform-panel").classList.add("hidden");$("foliage-panel").classList.add("hidden");$("foliage-paint-panel").classList.add("hidden");$("foliage-presets-panel").classList.add("hidden");$("world-outliner").classList.add("hidden");$("editor-status").classList.add("hidden");navigationOverlay.visible=false;document.body.classList.remove("editor-active","editor-dragging","foliage-paint-active");
  mode=editorReturnMode;updateEditorTileInspector();
  if(savedLevelCamera){
    gameplayCameraFocus.set(savedLevelCamera.x,0,savedLevelCamera.z);
    gameplayCameraScale=savedLevelCamera.scale;
    gameplayCameraBaselineScale=savedLevelCamera.scale;
  }
  if(mode==="paused")$("pause-state").classList.remove("hidden");else if(mode==="playing"&&audioOn)sounds.music.play().catch(()=>{});
}
function editorPointerDown(event){
  event.preventDefault();
  if(foliagePaintActive){
    if(event.button!==0)return;
    const point=editorGroundPoint(event.clientX,event.clientY);updateFoliagePaintBrush(point);if(!point)return;
    if(foliagePaintOperation==="add"&&!editorFoliagePaintSelection.size){$("editor-status").textContent="Select one or more Tree or Grass assets to paint.";return}
    const undoDepth=editorUndoHistory.length;recordEditorUndo();const changed=stampFoliagePaint(point);foliagePaintStroke={pointerId:event.pointerId,lastPoint:point.clone(),changed,undoDepth};canvas.setPointerCapture?.(event.pointerId);document.body.classList.add("editor-dragging");return;
  }
  if(editorPendingAsset!==null){
    const point=editorGroundPoint(event.clientX,event.clientY);if(point)createEditorAsset(editorPendingAsset,point);
    editorPendingAsset=null;updateEditorAssetSelection();return;
  }
  const handle=editorGizmoHit(event.clientX,event.clientY);
  if(handle&&editorSelection){
    const point=editorGroundPoint(event.clientX,event.clientY);
    recordEditorUndo();
    editorPointerState={type:"transform",pointerId:event.pointerId,axis:handle.axis,transformMode:handle.mode,startPoint:point?.clone()??editorSelection.position.clone(),selectedTransforms:[...editorSelectedObjects].filter(object=>editorObjects.includes(object)).map(object=>({object,position:object.position.clone(),rotation:object.rotation.clone(),scale:object.scale.clone()})),startX:event.clientX,startY:event.clientY};
    canvas.setPointerCapture?.(event.pointerId);document.body.classList.add("editor-dragging");return;
  }
  const object=editorObjectAt(event.clientX,event.clientY),point=editorGroundPoint(event.clientX,event.clientY);
  const modifyingSelection=event.shiftKey||event.ctrlKey||event.metaKey;
  if(object){
    selectEditorObjectFromEvent(object,event);
    const floorSelected=object.userData.editorAssetType==="world-floor";
    if(point&&editorTransformMode===null&&!modifyingSelection&&!floorSelected)recordEditorUndo();
    editorPointerState=point&&editorTransformMode===null&&!modifyingSelection?(floorSelected?{type:"camera",pointerId:event.pointerId,lastX:event.clientX,lastY:event.clientY}:{type:"object",pointerId:event.pointerId,offset:point.clone().sub(object.position)}):null;
  }
  else{selectEditorObject(null);editorPointerState={type:"camera",pointerId:event.pointerId,lastX:event.clientX,lastY:event.clientY};}
  if(editorPointerState){canvas.setPointerCapture?.(event.pointerId);document.body.classList.add("editor-dragging");}
}
function editorActorDoubleClick(event){
  if(mode!=="editor")return;
  const actor=editorObjectAt(event.clientX,event.clientY);
  if(!actor?.userData?.editorActor)return;
  event.preventDefault();selectEditorObject(actor);focusEditorCameraOnAsset(actor);
  $("editor-status").textContent=`${actor.name} centred. Actor Details are ready.`;
}
function updateEditorDeploymentPreviewHover(event){
  if(mode!=="editor"||editorPointerState||foliagePaintActive)return;
  const grid=ensureNavigationGrid(),point=editorGroundPoint(event.clientX,event.clientY),snapped=point?deploymentCellFromPoint(point):null,cell=snapped&&commandCellSupported(snapped,grid.cellSize)?snapped:null;
  if((!cell&&!commandHoverCell)||(cell&&commandHoverCell&&cell.x===commandHoverCell.x&&cell.z===commandHoverCell.z))return;
  commandHoverCell=cell;refreshCommandGrid();
}
function editorPointerMove(event){
  if(mode!=="editor")return;
  updateEditorDeploymentPreviewHover(event);
  if(foliagePaintActive){
    const point=editorGroundPoint(event.clientX,event.clientY);updateFoliagePaintBrush(point);
    if(!foliagePaintStroke||foliagePaintStroke.pointerId!==event.pointerId||!point)return;
    event.preventDefault();const spacing=Math.max(.35,FOLIAGE_PAINT.brushSize*.3),distance=point.distanceTo(foliagePaintStroke.lastPoint);
    if(distance>=spacing){const steps=Math.floor(distance/spacing),direction=point.clone().sub(foliagePaintStroke.lastPoint).normalize();for(let step=1;step<=steps;step++){const sample=foliagePaintStroke.lastPoint.clone().addScaledVector(direction,spacing*step);foliagePaintStroke.changed+=stampFoliagePaint(sample)}foliagePaintStroke.lastPoint.addScaledVector(direction,spacing*steps);}
    return;
  }
  if(!editorPointerState||editorPointerState.pointerId!==event.pointerId)return;
  event.preventDefault();
  if(editorPointerState.type==="transform"&&editorSelection){
    const state=editorPointerState,{axis,transformMode}=state,dx=event.clientX-state.startX,dy=event.clientY-state.startY;
    if(transformMode==="move"){
      if(axis==="y")for(const transform of state.selectedTransforms)transform.object.position.y=transform.position.y-dy*.025*editorCameraScale;
      else{const point=editorGroundPoint(event.clientX,event.clientY);if(point)for(const transform of state.selectedTransforms)transform.object.position[axis]=transform.position[axis]+point[axis]-state.startPoint[axis];}
    }else if(transformMode==="rotate"){
      const rotation=(dx-dy*.35)*.012;for(const transform of state.selectedTransforms)transform.object.rotation[axis]=transform.rotation[axis]+rotation;
    }else if(transformMode==="scale"){
      const factor=THREE.MathUtils.clamp(1+(dx-dy)*.009,.2,4);
      for(const transform of state.selectedTransforms){if(editorScaleLocked)transform.object.scale.copy(transform.scale).multiplyScalar(factor);else transform.object.scale[axis]=transform.scale[axis]*factor;syncGrassSizeBaseScale(transform.object);}
    }
    invalidateNavigation();for(const transform of state.selectedTransforms)syncEditorCameraFocusFromObject(transform.object);
    for(const helper of editorSelectionHelpers)helper.update();updateEditorTransformGizmo();updateEditorTransformInspector();return;
  }
  if(editorPointerState.type==="object"&&editorSelection){
    const point=editorGroundPoint(event.clientX,event.clientY);if(point){editorSelection.position.x=point.x-editorPointerState.offset.x;editorSelection.position.z=point.z-editorPointerState.offset.z;invalidateNavigation();syncEditorCameraFocusFromObject(editorSelection);editorSelectionHelper?.update();updateEditorTransformGizmo();updateEditorTransformInspector();}
    return;
  }
  const dx=event.clientX-editorPointerState.lastX,dy=event.clientY-editorPointerState.lastY;editorPointerState.lastX=event.clientX;editorPointerState.lastY=event.clientY;editorCameraTravel=null;
  const pan=editorPanVector({forward:EDITOR_PAN_FORWARD,right:EDITOR_PAN_RIGHT,horizontal:-dx,vertical:dy,distance:Math.hypot(dx,dy)*.045*editorCameraScale});
  editorCameraFocus.x+=pan.x;editorCameraFocus.z+=pan.z;ensureEditorCameraObject();
}
function editorPointerUp(event){
  if(foliagePaintActive&&foliagePaintStroke?.pointerId===event.pointerId){
    canvas.releasePointerCapture?.(event.pointerId);const {changed,undoDepth}=foliagePaintStroke;foliagePaintStroke=null;document.body.classList.remove("editor-dragging");if(changed){renderWorldOutliner();$("editor-status").textContent=`Foliage ${foliagePaintOperation==="remove"?"removed":"painted"}. Press Done to save the level.`;}else{editorUndoHistory.splice(undoDepth);updateEditorUndoControl();}return;
  }
  if(!editorPointerState||editorPointerState.pointerId!==event.pointerId)return;
  const transformed=editorPointerState.type==="transform",transformedBases=transformed?editorPointerState.selectedTransforms.map(transform=>transform.object).filter(isBaseTileBlueprint):[],navigationChanged=transformed||editorPointerState.type==="object";canvas.releasePointerCapture?.(event.pointerId);editorPointerState=null;document.body.classList.remove("editor-dragging");
  for(const base of transformedBases)synchronizeBaseGridTransform(base);
  if(transformedBases.length){for(const helper of editorSelectionHelpers)helper.update();updateEditorTransformGizmo();updateEditorTransformInspector();updateEditorInspector();renderWorldOutliner();}
  if(navigationChanged){ensureNavigationGrid();refreshCommandGrid();}
  if(transformed)$("editor-status").textContent=`${editorSelection?.name||"Asset"} updated. Press Done to save the level.`;
}
function updateEditorKeyboardPan(dt){
  if(foliagePaintActive)return;
  const horizontal=Number(editorKeys.has("ArrowRight"))-Number(editorKeys.has("ArrowLeft")),vertical=Number(editorKeys.has("ArrowUp"))-Number(editorKeys.has("ArrowDown"));
  if(!horizontal&&!vertical)return;
  editorCameraTravel=null;
  const pan=editorPanVector({forward:EDITOR_PAN_FORWARD,right:EDITOR_PAN_RIGHT,horizontal,vertical,distance:14*dt*editorCameraScale});editorCameraFocus.x+=pan.x;editorCameraFocus.z+=pan.z;ensureEditorCameraObject();
}

const gameplaySurfaceNormal=new THREE.Vector3(),gameplaySurfaceNormalMatrix=new THREE.Matrix3();
function gameplayFloorPoint(targetPoint=new THREE.Vector3()){
  const surfaces=walkableSurfaceCandidates(editorObjects);
  if(!surfaces.length)return null;
  const hit=raycaster.intersectObjects(surfaces,true).find(candidate=>{
    if(!candidate.face)return false;
    gameplaySurfaceNormalMatrix.getNormalMatrix(candidate.object.matrixWorld);
    gameplaySurfaceNormal.copy(candidate.face.normal).applyMatrix3(gameplaySurfaceNormalMatrix).normalize();
    return gameplaySurfaceNormal.y>.55;
  });
  return hit?targetPoint.copy(hit.point):null;
}

function pointerWorld(e){
  if(mode==="editor"){editorPointerDown(e);return}
  if(mode!=="map"&&!tacticalInputEnabled(mode))return;
  const rect=canvas.getBoundingClientRect();pointer.x=((e.clientX-rect.left)/rect.width)*2-1;pointer.y=-((e.clientY-rect.top)/rect.height)*2+1;raycaster.setFromCamera(pointer,camera);
  if(mode==="map"){const hit=raycaster.intersectObjects(hoverable,false)[0];if(hit)chooseRegion(hit.object.userData.region);return}
  const p=new THREE.Vector3(),floorHit=gameplayFloorPoint(p);
  if(deploymentPlacementReady){
    if(floorHit)deploySoldier(p);
    else{commandHoverCell=null;refreshCommandGrid();showToast("CHOOSE THE ISLAND",900)}
    return;
  }
  ensureCompanyLayout();
  const actorHit=raycaster.intersectObjects([master,...followers].filter(unit=>unit.userData.alive&&unit.visible),true)
    .map(hit=>{let object=hit.object;while(object&&object!==battle&&!object.userData?.isMaster&&!Number.isInteger(object.userData?.companyId))object=object.parent;return object&&object!==battle?object:null})
    .find(Boolean);
  if(actorHit){
    if(debugMode&&e.altKey){
      debugFocusId=actorHit.id;
      renderDebugMonitor();
      return;
    }
    selectCompany(actorHit.userData.companyId);
    return;
  }
  if(floorHit&&(selectedCompanyId!==null||selectedCommander)){
    if(issueCompanyOrder(p)){
      const marker=$("tap-marker");marker.style.left=`${e.clientX}px`;marker.style.top=`${e.clientY}px`;marker.classList.remove("pulse");void marker.offsetWidth;marker.classList.add("pulse");
      $("mobile-command")?.classList.add("dismissed");
    }
  }
}
function hoverTacticalGrid(e){
  if(!tacticalInputEnabled(mode)||(!deploymentPlacementReady&&selectedCompanyId===null&&!selectedCommander))return;
  const rect=canvas.getBoundingClientRect();pointer.x=((e.clientX-rect.left)/rect.width)*2-1;pointer.y=-((e.clientY-rect.top)/rect.height)*2+1;raycaster.setFromCamera(pointer,camera);
  const p=new THREE.Vector3();
  if(gameplayFloorPoint(p)){
    const cell=deploymentCellFromPoint(p);
    if((!cell&&!commandHoverCell)||(cell&&commandHoverCell&&cell.x===commandHoverCell.x&&cell.z===commandHoverCell.z))return;
    commandHoverCell=cell;refreshCommandGrid();
  }else if(commandHoverCell){commandHoverCell=null;refreshCommandGrid()}
}
canvas.addEventListener("pointerdown",pointerWorld);
canvas.addEventListener("dblclick",editorActorDoubleClick);
canvas.addEventListener("pointermove",hoverTacticalGrid);
canvas.addEventListener("pointermove",editorPointerMove);
canvas.addEventListener("pointerup",editorPointerUp);canvas.addEventListener("pointercancel",editorPointerUp);
canvas.addEventListener("pointerleave",()=>{if(foliagePaintActive&&!foliagePaintStroke)updateFoliagePaintBrush(null)});
canvas.addEventListener("dragover",event=>{if(mode==="editor"){event.preventDefault();event.dataTransfer.dropEffect="copy"}});
canvas.addEventListener("drop",event=>{
  if(mode!=="editor")return;event.preventDefault();
  const assetId=event.dataTransfer.getData("application/x-crownwake-asset")||event.dataTransfer.getData("text/plain"),point=editorGroundPoint(event.clientX,event.clientY);
  if(point)createEditorAsset(assetId,point);editorPendingAsset=null;updateEditorAssetSelection();
});
function togglePause(forcePaused){
  const shouldPause=forcePaused??mode==="playing";
  if(shouldPause&&mode==="playing"){
    disarmDeployment();clearTacticalSelection();mode="paused";$("pause").textContent=STR.resumeGame;$("pause").setAttribute("aria-label",STR.resumeGame);
    $("pause-state").textContent=STR.paused;$("pause-state").classList.remove("hidden");sounds.music.pause();
  }else if(!shouldPause&&mode==="paused"){
    mode="playing";$("pause").textContent=STR.pause;$("pause").setAttribute("aria-label",STR.pause);$("pause-state").classList.add("hidden");
    if(audioOn)sounds.music.play().catch(()=>{});
  }
}
const GAME_SPEED_STEPS=[.5,.75,1,1.25,1.5,2];
function setAudio(enabled){
  audioOn=Boolean(enabled);sounds.music.muted=!audioOn;
  try{localStorage.setItem(AUDIO_PREFERENCE_KEY,String(audioOn))}catch{}
  $("settings-audio").textContent=audioOn?"SOUND ON":"SOUND OFF";
}
function previewStartingChCount(archetypeId,value){
  if(!PLAYER_DEPLOYMENT_ARCHETYPES.includes(archetypeId))return;
  const parsed=Number(value);if(!Number.isFinite(parsed))return;
  pendingStartingChCounts={...pendingStartingChCounts,[archetypeId]:Math.min(999,Math.max(0,Math.floor(parsed)))};
  settingsStartingChDirty=PLAYER_DEPLOYMENT_ARCHETYPES.some(id=>pendingStartingChCounts[id]!==PRACTICE_CONFIG[`${id}Soldiers`]);
  $("settings-apply").classList.toggle("hidden",!settingsStartingChDirty);
}
function setStartingChCounts(){
  const next=normalizePracticeConfig({...PRACTICE_CONFIG,...Object.fromEntries(PLAYER_DEPLOYMENT_ARCHETYPES.map(id=>[`${id}Soldiers`,pendingStartingChCounts[id]]))});
  Object.assign(PRACTICE_CONFIG,next);pendingStartingChCounts=configuredDeploymentReserves(next);settingsStartingChDirty=false;
  try{localStorage.setItem(PRACTICE_CONFIG_KEY,JSON.stringify({...PRACTICE_CONFIG,deploymentRosterVersion:2}))}catch{}
  deploymentReserves=configuredDeploymentReserves(next);deploymentArchetypeId=null;deploymentPlacementReady=false;deploymentStarted=false;commandHoverCell=null;clearTacticalSelection();refreshCommandGrid();
  for(const id of PLAYER_DEPLOYMENT_ARCHETYPES)$(`starting-${id}-count`).value=String(next[`${id}Soldiers`]);$("settings-apply").classList.add("hidden");updateStats();
}
function syncRingVisibilityButtons(){
  document.querySelectorAll('[data-ring-visibility]').forEach(button=>{
    const visible=unitRingSettings[button.dataset.ringVisibility]!==false;
    button.setAttribute('aria-pressed',String(visible));button.title=visible?'Hide ring':'Show ring';
    button.textContent=visible?'\u{1F441} ON':'\u{1F441} OFF';
  });
}
function installRingVisibilityButtons(){
  for(const [selector,headings] of [['.unit-ring-settings',['legend']],['#editor-actor-ring-controls',['h4']]]){
    document.querySelectorAll(`${selector} ${headings[0]}`).forEach((heading,index)=>{
      const property=['outerVisible','innerVisible','radarVisible'][index];if(!property)return;
      const button=document.createElement('button');button.type='button';button.className='ring-visibility-toggle';button.dataset.ringVisibility=property;
      button.setAttribute('aria-label',`${heading.textContent.trim()} visibility`);
      button.onclick=()=>{
        unitRingSettings[property]=unitRingSettings[property]===false;
        try{localStorage.setItem(UNIT_RING_SETTINGS_KEY,JSON.stringify(unitRingSettings))}catch{}
        syncRingVisibilityButtons();applyUnitRingSettings();
      };
      heading.append(button);
    });
  }
  syncRingVisibilityButtons();
}
function renderUnitRingSettings(){
  syncRingVisibilityButtons();
  $("ring-outer-color").value=unitRingSettings.outerColor;$("ring-outer-size").value=String(unitRingSettings.outerSize);$("ring-outer-thickness").value=String(unitRingSettings.outerThickness);$("ring-outer-height").value=String(unitRingSettings.outerHeight);
  $("ring-inner-color").value=unitRingSettings.innerColor;$("ring-inner-size").value=String(unitRingSettings.innerSize);$("ring-inner-thickness").value=String(unitRingSettings.innerThickness);$("ring-inner-height").value=String(unitRingSettings.innerHeight);
  $("ring-ch-radar-color").value=unitRingSettings.playerRadarColor;$("ring-en-radar-color").value=unitRingSettings.enemyRadarColor;$("ring-radar-height").value=String(unitRingSettings.radarHeight);$("ring-radar-thickness").value=String(unitRingSettings.radarThickness);$("ring-radar-radius").value=String(unitRingSettings.radarRadius);$("ring-radar-size").value=String(Math.round(unitRingSettings.radarSize*100));$("ring-radar-size-value").textContent=`${Math.round(unitRingSettings.radarSize*100)}%`;
}
function renderEditorActorRingControls(enabled){
  syncRingVisibilityButtons();
  const controls=$("editor-actor-ring-controls");if(!controls)return;controls.disabled=!enabled;
  $("editor-ring-outer-color").value=unitRingSettings.outerColor;$("editor-ring-outer-size").value=String(unitRingSettings.outerSize);$("editor-ring-outer-thickness").value=String(unitRingSettings.outerThickness);$("editor-ring-outer-height").value=String(unitRingSettings.outerHeight);
  $("editor-ring-inner-color").value=unitRingSettings.innerColor;$("editor-ring-inner-size").value=String(unitRingSettings.innerSize);$("editor-ring-inner-thickness").value=String(unitRingSettings.innerThickness);$("editor-ring-inner-height").value=String(unitRingSettings.innerHeight);
  $("editor-ring-ch-radar-color").value=unitRingSettings.playerRadarColor;$("editor-ring-en-radar-color").value=unitRingSettings.enemyRadarColor;$("editor-ring-radar-height").value=String(unitRingSettings.radarHeight);$("editor-ring-radar-thickness").value=String(unitRingSettings.radarThickness);$("editor-ring-radar-radius").value=String(unitRingSettings.radarRadius);$("editor-ring-radar-size").value=String(Math.round(unitRingSettings.radarSize*100));$("editor-ring-radar-size-value").textContent=`${Math.round(unitRingSettings.radarSize*100)}%`;
}
function applyUnitRingSettings(){for(const unit of [master,...followers,...enemyUnits])if(unit?.userData?.encounterRing)refreshEncounterRing(unit.userData.encounterRing);rebuildSelectionVisuals();updateEncounterRings()}
function updateUnitRingSettings(){
  unitRingSettings=normalizeUnitRingSettings({...unitRingSettings,outerColor:$("ring-outer-color").value,outerSize:$("ring-outer-size").value,outerThickness:$("ring-outer-thickness").value,outerHeight:$("ring-outer-height").value,innerColor:$("ring-inner-color").value,innerSize:$("ring-inner-size").value,innerThickness:$("ring-inner-thickness").value,innerHeight:$("ring-inner-height").value,playerRadarColor:$("ring-ch-radar-color").value,enemyRadarColor:$("ring-en-radar-color").value,radarHeight:$("ring-radar-height").value,radarThickness:$("ring-radar-thickness").value,radarRadius:$("ring-radar-radius").value,radarSize:Number($("ring-radar-size").value)/100});
  try{localStorage.setItem(UNIT_RING_SETTINGS_KEY,JSON.stringify(unitRingSettings))}catch{}
  renderUnitRingSettings();applyUnitRingSettings();
}
function updateEditorActorRingControls(){
  unitRingSettings=normalizeUnitRingSettings({...unitRingSettings,outerColor:$("editor-ring-outer-color").value,outerSize:$("editor-ring-outer-size").value,outerThickness:$("editor-ring-outer-thickness").value,outerHeight:$("editor-ring-outer-height").value,innerColor:$("editor-ring-inner-color").value,innerSize:$("editor-ring-inner-size").value,innerThickness:$("editor-ring-inner-thickness").value,innerHeight:$("editor-ring-inner-height").value,playerRadarColor:$("editor-ring-ch-radar-color").value,enemyRadarColor:$("editor-ring-en-radar-color").value,radarHeight:$("editor-ring-radar-height").value,radarThickness:$("editor-ring-radar-thickness").value,radarRadius:$("editor-ring-radar-radius").value,radarSize:Number($("editor-ring-radar-size").value)/100});
  try{localStorage.setItem(UNIT_RING_SETTINGS_KEY,JSON.stringify(unitRingSettings))}catch{}
  renderUnitRingSettings();renderEditorActorRingControls(true);applyUnitRingSettings();$("editor-status").textContent="CH and EN ring controls updated and saved.";
}
function renderSettings(){
  $("speed").value=String(GAME_SPEED_STEPS.indexOf(gameSpeed));$("speed-value").textContent=`${gameSpeed}Ã—`;
  setAudio(audioOn);
  $("hud-toggle").textContent=hudCompact?"SHOW HUD":"HIDE HUD";
  if(!settingsStartingChDirty)for(const id of PLAYER_DEPLOYMENT_ARCHETYPES)$(`starting-${id}-count`).value=String(PRACTICE_CONFIG[`${id}Soldiers`]);
  renderUnitRingSettings();
  $("settings-apply").classList.toggle("hidden",!settingsStartingChDirty);
}
function openSettings(){
  if(!["playing","paused"].includes(mode))return;
  settingsReturnMode=mode;mode="settings";resetPlaytestToSavedLevel();disarmDeployment();clearTacticalSelection();pendingStartingChCounts=configuredDeploymentReserves();settingsStartingChDirty=false;renderSettings();$("settings-panel").classList.remove("hidden");
}
function closeSettings(){
  if(mode!=="settings")return;$("settings-panel").classList.add("hidden");mode=settingsReturnMode;
}
function exitToTitle(){location.reload()}
addEventListener("keydown",e=>{
  if(mode==="editor"){
    const editingField=e.target?.matches?.("input,select,textarea");
    if(e.code.startsWith("Arrow")&&e.target?.matches?.("[data-foliage-setting],[data-foliage-paint-setting],[data-world-look-setting]"))return;
    if(e.code==="Escape"&&!$("editor-delete-confirm").classList.contains("hidden")){e.preventDefault();closeEditorDeleteConfirm();return}
    if(e.code==="Escape"&&foliagePaintActive){e.preventDefault();setFoliagePaintActive(false);return}
    if((e.ctrlKey||e.metaKey)&&e.code==="KeyZ"){e.preventDefault();undoEditorAction();return}
    if((e.ctrlKey||e.metaKey)&&e.code==="KeyS"){e.preventDefault();saveEditorSession();return}
    if(!editingField&&e.code==="Tab"){e.preventDefault();toggleEditorViewportMaximize();return}
    if(!editingField&&e.code==="KeyQ"){e.preventDefault();setEditorTransformMode("select");return}
    if(!editingField&&e.code==="KeyW"){e.preventDefault();setEditorTransformMode("move");return}
    if(!editingField&&e.code==="KeyE"){e.preventDefault();setEditorTransformMode("rotate");return}
    if(!editingField&&e.code==="KeyR"){e.preventDefault();setEditorTransformMode("scale");return}
    if(editingField)return;
    if(foliagePaintActive&&e.code.startsWith("Arrow")){e.preventDefault();return}
    if(e.code.startsWith("Arrow")){e.preventDefault();editorKeys.add(e.code);return}
    if(e.code==="Delete"||e.code==="Backspace"){e.preventDefault();openEditorDeleteConfirm();return}
  }
  if(e.code==="Escape"){if(mode==="editor")closeLevelEditor();else if(mode==="settings")closeSettings();else if(mode==="paused")togglePause(false);else if(deploymentPlacementReady){disarmDeployment();}else if(selectedCompanyId!==null||selectedCommander)clearTacticalSelection();else if(mode==="companies")closeCompanies()}
});
addEventListener("keyup",e=>editorKeys.delete(e.code));addEventListener("blur",()=>editorKeys.clear());
addEventListener("keydown",e=>{if(debugMode&&e.code==="KeyI"){e.preventDefault();toggleDebugMonitor()}});
$("return").onclick=closeMap;
function bindDeploymentButton(buttonId,archetypeId){
  const button=$(buttonId);if(!button)return;
  // Keep the HUD interaction separate from the canvas' world pointer handler.
  button.addEventListener("pointerdown",event=>event.stopPropagation());
  button.addEventListener("click",event=>{event.preventDefault();event.stopPropagation();toggleDeploymentMode(archetypeId)});
}
bindDeploymentButton("companies","ch1");bindDeploymentButton("companies-ch2","ch2");bindDeploymentButton("companies-ch3","ch3");$("companies-close").onclick=closeCompanies;
$("divide-company").onclick=()=>{if(selectedCompanyId!==null&&divideCompany(selectedCompanyId)){rebuildSelectionVisuals();refreshCommandGrid()}};
$("pause").onclick=()=>togglePause();
$("settings").onclick=openSettings;$("exit").onclick=exitToTitle;
$("settings-audio").onclick=()=>setAudio(!audioOn);
$("level-editor").onclick=openLevelEditor;
$("editor-zoom-in").onclick=()=>adjustEditorZoom(EDITOR_ZOOM_STEP);$("editor-zoom-out").onclick=()=>adjustEditorZoom(-EDITOR_ZOOM_STEP);
$("editor-undo").onclick=undoEditorAction;
document.querySelectorAll("#editor-transform-panel input").forEach(input=>input.addEventListener("change",()=>applyEditorTransformInput(input)));
document.querySelectorAll("[data-transform-step]").forEach(button=>button.addEventListener("click",()=>applyEditorTransformStep(button)));
document.querySelectorAll("[data-actor-property]").forEach(input=>input.addEventListener("change",()=>applyEditorActorInput(input)));
  $("editor-actor-material").addEventListener("input",applyEditorActorMaterial);
  $("editor-actor-progress-bar").addEventListener("change",applyEditorActorProgressBar);
  $("editor-actor-health-bar-offset").addEventListener("change",applyEditorActorHealthBarOffset);
  $("editor-actor-model").addEventListener("change",applyEditorActorModel);
  $("editor-hud-visible").addEventListener("change",applyEditorHudWidgetSettings);
  $("editor-hud-size").addEventListener("change",applyEditorHudWidgetSettings);
  $("editor-hud-layout-x").addEventListener("change",applyEditorHudWidgetSettings);
  $("editor-hud-layout-y").addEventListener("change",applyEditorHudWidgetSettings);
  $("editor-hud-text").addEventListener("change",applyEditorHudWidgetSettings);
  $("editor-hud-spawn-count").addEventListener("change",applyEditorHudWidgetSettings);
  document.querySelectorAll("[data-model-scale]").forEach(input=>input.addEventListener("change",()=>applyEditorModelScaleInput(input)));
  $("editor-model-scale-lock").onclick=toggleEditorModelScaleLock;
$("editor-building-model").addEventListener("change",applyBuildingBlueprintSettings);
$("editor-building-material").addEventListener("input",applyBuildingBlueprintSettings);
$("editor-building-health").addEventListener("change",applyBuildingBlueprintSettings);
$("editor-building-progress-bar").addEventListener("change",applyBuildingBlueprintSettings);
$("editor-building-health-bar-offset").addEventListener("change",applyBuildingBlueprintSettings);
$("editor-barracks-spawn-interval").addEventListener("input",applyBuildingBlueprintSettings);
$("editor-progress-bar-background").addEventListener("input",applyProgressBarBlueprintSettings);
$("editor-progress-bar-main").addEventListener("input",applyProgressBarBlueprintSettings);
$("editor-progress-bar-width").addEventListener("input",applyProgressBarBlueprintSettings);
$("editor-progress-bar-height").addEventListener("input",applyProgressBarBlueprintSettings);
$("editor-tile-colour").addEventListener("input",applyEditorTileInput);
$("editor-tile-rows").addEventListener("change",applyEditorTileInput);
$("editor-tile-columns").addEventListener("change",applyEditorTileInput);
$("editor-tile-size").addEventListener("change",applyEditorTileInput);
$("editor-material-slot").addEventListener("change",applyEditorMaterialSlot);
$("editor-material-colour").addEventListener("input",event=>{if(applyEditorMaterialColour(event.currentTarget.value))$("editor-status").textContent="Material colour updated. Press Done to save the level.";});
$("editor-material-save-swatch").onclick=saveEditorMaterialSwatch;
$("editor-scale-lock").onclick=toggleEditorScaleLock;
document.querySelectorAll("[data-foliage-setting]").forEach(input=>input.addEventListener("input",()=>applyFoliageControl(input)));
$("foliage-reset").onclick=resetFoliageControls;syncFoliageControls();
$("foliage-preset-load").onclick=()=>setFoliagePresetPanel($("foliage-presets-panel").classList.contains("hidden"));
$("foliage-preset-save").onclick=saveCurrentFoliagePreset;$("foliage-presets-close").onclick=()=>setFoliagePresetPanel(false);
$("foliage-preset-apply").onclick=loadSelectedFoliagePreset;$("foliage-preset-delete").onclick=deleteSelectedFoliagePreset;
$("editor-transform-select").onclick=()=>setEditorTransformMode("select");$("editor-transform-move").onclick=()=>setEditorTransformMode("move");$("editor-transform-rotate").onclick=()=>setEditorTransformMode("rotate");$("editor-transform-scale").onclick=()=>setEditorTransformMode("scale");
for(const operation of ["add","remove"])$("foliage-paint-"+operation).onclick=()=>{foliagePaintOperation=operation;syncFoliagePaintControls();if(foliagePaintBrush?.visible)foliagePaintBrush.material.color.setHex(operation==="remove"?0xd95d61:0x72dfc1);$("editor-status").textContent=operation==="add"?"Click or drag the terrain to add selected foliage.":"Click or drag the terrain to remove foliage.";};
document.querySelectorAll("[data-foliage-paint-setting]").forEach(input=>input.addEventListener("input",()=>{const key=input.dataset.foliagePaintSetting,value=Number(input.value);FOLIAGE_PAINT[key]=key==="paintAmount"?Math.round(value):value;syncFoliagePaintControls();if(foliagePaintBrush?.visible)foliagePaintBrush.scale.setScalar(FOLIAGE_PAINT.brushSize);}));
$("editor-asset-list").addEventListener("dragstart",event=>{if(foliagePaintActive){event.preventDefault();event.stopImmediatePropagation();}},true);
$("editor-duplicate").onclick=duplicateEditorSelection;$("editor-viewport-duplicate").onclick=duplicateEditorSelection;$("editor-viewport-delete").onclick=()=>openEditorDeleteConfirm();$("editor-show-navigation").onclick=()=>setNavigationDebugVisible(!navigationDebugVisible);
document.querySelectorAll("[data-world-look-setting]").forEach(input=>input.addEventListener(input.type==="color"||input.tagName==="SELECT"?"change":"input",()=>applyWorldLookControl(input)));
$("content-browser-add").onclick=()=>contentBrowserCreateFolder();
$("content-browser-import").onclick=()=>$("content-browser-import-input").click();
$("content-browser-new-model").onclick=contentBrowserCreateNewModel;
$("content-browser-import-input").addEventListener("change",contentBrowserImportGlb);
$("content-browser-duplicate").onclick=contentBrowserDuplicateSelectedBlueprint;
$("content-browser-delete").onclick=openContentBrowserDeleteConfirm;
$("content-browser-filter").onclick=()=>{contentBrowserQuery="";$("content-browser-search").value="";renderContentBrowser();};
$("content-browser-view").onclick=()=>{const panel=$("asset-panel"),active=!panel.classList.contains("content-browser-list-view");panel.classList.toggle("content-browser-list-view",active);$("content-browser-view").setAttribute("aria-pressed",String(active));};
$("content-browser-visibility").onclick=()=>{const slot=$("editor-content-drawer-slot"),hidden=slot.dataset.contentHidden!=="true";slot.dataset.contentHidden=String(hidden);$("content-browser-visibility").setAttribute("aria-pressed",String(!hidden));$("content-browser-visibility").setAttribute("title",hidden?"Show Content Browser":"Hide Content Browser");};
$("editor-environment-toggle").onclick=()=>toggleEditorEnvironmentPopover();
$("content-browser-search").addEventListener("input",event=>{contentBrowserQuery=event.currentTarget.value;renderContentBrowser();});$("editor-delete").onclick=()=>openEditorDeleteConfirm();$("editor-delete-cancel").onclick=closeEditorDeleteConfirm;$("editor-delete-confirm-button").onclick=confirmEditorDelete;$("editor-done").onclick=()=>{saveLevelLayout();editorReturnMode="playing";closeLevelEditor();resetPlaytestToSavedLevel();};
document.addEventListener("pointerdown",event=>{if(!event.target.closest("#content-browser-context-menu")&&!event.target.closest("#asset-panel"))hideContentBrowserContextMenu();});
for(const context of Object.keys(EDITOR_CONTEXTS))$("editor-context-"+context).onclick=()=>setEditorContext(context);
$("editor-save").onclick=saveEditorSession;$("editor-maximize").onclick=toggleEditorViewportMaximize;
$("editor-left-collapse").onclick=()=>{editorLayout.leftCollapsed=!editorLayout.leftCollapsed;applyEditorLayout()};$("editor-right-collapse").onclick=()=>{editorLayout.rightCollapsed=!editorLayout.rightCollapsed;applyEditorLayout()};
$("editor-left-resizer").onpointerdown=event=>beginEditorResize("left",event);$("editor-right-resizer").onpointerdown=event=>beginEditorResize("right",event);
$("content-browser-resizer").onpointerdown=beginContentBrowserResize;
$("world-outliner-search").addEventListener("input",event=>{editorOutlinerQuery=event.currentTarget.value;renderWorldOutliner()});
$("hud-toggle").onclick=()=>{hudCompact=!hudCompact;$("hud").classList.toggle("hud-compact",hudCompact);renderSettings()};
$("speed").oninput=e=>{gameSpeed=GAME_SPEED_STEPS[Number(e.currentTarget.value)]??1;$("speed-value").textContent=`${gameSpeed}Ã—`};
for(const id of PLAYER_DEPLOYMENT_ARCHETYPES)$(`starting-${id}-count`).oninput=e=>previewStartingChCount(id,e.currentTarget.value);
for(const id of ["ring-outer-color","ring-outer-size","ring-outer-thickness","ring-outer-height","ring-inner-color","ring-inner-size","ring-inner-thickness","ring-inner-height","ring-ch-radar-color","ring-en-radar-color","ring-radar-height","ring-radar-thickness","ring-radar-radius","ring-radar-size"])$(id).oninput=updateUnitRingSettings;
for(const id of ["editor-ring-outer-color","editor-ring-outer-size","editor-ring-outer-thickness","editor-ring-outer-height","editor-ring-inner-color","editor-ring-inner-size","editor-ring-inner-thickness","editor-ring-inner-height","editor-ring-ch-radar-color","editor-ring-en-radar-color","editor-ring-radar-height","editor-ring-radar-thickness","editor-ring-radar-radius","editor-ring-radar-size"])$(id).oninput=updateEditorActorRingControls;
installRingVisibilityButtons();
$("settings-apply").onclick=setStartingChCounts;
$("settings-cancel").onclick=closeSettings;$("settings-exit").onclick=exitToTitle;
if(debugButton)debugButton.onclick=()=>toggleDebugMonitor();

function showToast(text,ms=1800){const t=$("toast");t.textContent=text;t.classList.add("show");clearTimeout(toastTimer);toastTimer=setTimeout(()=>t.classList.remove("show"),ms)}
function updateHearts(){
  const container=$("hearts");if(!container)return;
  container.setAttribute("aria-label",`${STR.commanderLives}: ${commanderHearts} / 3`);
  container.replaceChildren(...Array.from({length:3},(_,index)=>{
    const heart=document.createElement("span");heart.textContent="♥";
    if(index>=commanderHearts)heart.className="lost";
    return heart;
  }));
}
function updateStats(){const count=livingPlayerUnits().length;$("army-count").textContent=count;$("army-button-count").textContent=deploymentReserves.ch1;$("army-button-count-ch2").textContent=deploymentReserves.ch2;$("army-button-count-ch3").textContent=deploymentReserves.ch3;$("territory-count").textContent=`${campaign.conquered.size}/7`;updateDeploymentControl()}
function win(){mode="end";$("end-title").textContent=STR.victory;$("retry").textContent=STR.retry;$("end-screen").classList.remove("hidden");$("hud").classList.add("hidden")}
function restartSavedLevel(){
  if(resetPlaytestToSavedLevel())saveLevelLayout();
  location.reload();
}
function start(){removeUnplacedEnemyActors({prepareBarracksInteriors:true});mode="playing";$("title-screen").classList.add("hidden");$("hud").classList.remove("hidden");$("commander-vitals")?.classList.add("hidden");$("companies")?.classList.remove("hidden");$("divide-company")?.classList.add("hidden");$("pause").textContent=STR.pause;$("pause").setAttribute("aria-label",STR.pause);$("mobile-command").textContent="TAP THE SOLDIER ICON TO DEPLOY";updateStats();if(debugMode)toggleDebugMonitor(true);if(audioOn)sounds.music.play().catch(()=>{});showToast("DEPLOY YOUR SOLDIERS")}
$("begin").onclick=start;$("retry").onclick=restartSavedLevel;

function activeCombatCameraFrame(){
  if(!master||!activeEncounter||activeEncounter.done)return null;
  const players=livingPlayerUnits(),activeEnemies=enemyUnits.filter(enemy=>enemy.userData.alive&&!isBarracksDeparting(enemy)),actors=[...players,...activeEnemies];
  const duelists=actors.filter(actor=>actor?.userData.alive&&actor.userData.lockedTarget?.userData.alive);
  const closestIncomingDistance=activeEncounter.cameraApproachDistance??activeEnemies.reduce((closest,enemy)=>{
    return Math.min(closest,...players.map(player=>enemy.position.distanceTo(player.position)));
  },Infinity);
  if(incomingWaveCameraState({distance:closestIncomingDistance})==="preview"){
    return tacticalCameraFrame(activeCombatantPoints(actors),{aspect:camera.aspect,baseSpan:14.5,padding:2.8,maxScale:1.34});
  }
  if(!activeEncounter.aggro&&!duelists.length)return null;
  return tacticalCameraFrame(activeCombatantPoints(actors),{aspect:camera.aspect});
}

function defaultGameplayCameraFrame(){
  if(savedLevelCamera)return savedLevelCamera;
  const commanders=INDEPENDENT_SOLDIERS
    ?livingPlayerUnits()
    :[master,...followers.filter(unit=>unit.userData.alive&&unit.userData.unitCommander)];
  const frame=tacticalCameraFrame(activeCombatantPoints(commanders),{aspect:camera.aspect,baseSpan:17,padding:2.4,maxScale:1.34});
  if(frame)return frame;
  // A defeated army has no living camera subjects. Keep rendering from the
  // last player position so retreating enemies can still leave the board.
  return {x:playerFocus().position.x,z:playerFocus().position.z,scale:gameplayCameraBaselineScale};
}

function levelCameraPose(focus,distanceScale,rotation=[0,0,0]){
  const orientation=new THREE.Quaternion().setFromEuler(new THREE.Euler(...rotation));
  const look=new THREE.Vector3(focus.x,.4,focus.z);
  const offset=ISOMETRIC_CAMERA_OFFSET.clone().multiplyScalar(distanceScale);offset.y-=.4;
  return {position:look.clone().add(offset.applyQuaternion(orientation)),up:new THREE.Vector3(0,1,0).applyQuaternion(orientation)};
}
function resize(){
  renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));
  const rect=mode==="editor"?canvas.getBoundingClientRect():{width:innerWidth,height:innerHeight};const width=Math.max(1,Math.round(rect.width)),height=Math.max(1,Math.round(rect.height));
  renderer.setSize(width,height,false);camera.aspect=width/height;camera.updateProjectionMatrix();
}
addEventListener("resize",resize);addEventListener("orientationchange",resize);
if(debugMode){if(debugButton)debugButton.classList.remove("hidden");}
let frames=0,fps=0,fpsAt=performance.now(),acc=0,last=performance.now();const STEP=1/60;
function loop(now){
  requestAnimationFrame(loop);let frame=Math.min(.05,(now-last)/1000);last=now;interfaceTime+=frame;const simulationScale=gameSpeed;acc+=frame;if(mode==="playing")totalTime+=frame*simulationScale;
  while(acc>=STEP){
    if(mode==="playing")updateBattle(defeatCinematic?STEP:STEP*simulationScale);
    acc-=STEP;
  }
  const mapMode=mode==="map",editorMode=mode==="editor",combatFrame=null;
  if(editorMode){updateEditorCameraTravel(frame);updateEditorKeyboardPan(frame)}
  let focus,desired;camera.up.set(0,1,0);
  if(mapMode){
    focus=new THREE.Vector3(0,0,-1);desired=new THREE.Vector3(10,31,26);
  }else if(editorMode){
    focus=editorCameraFocus;
    const cameraDistanceScale=gameplayCameraDistanceScale(editorCameraScale,{combat:false});
    const pose=levelCameraPose(focus,cameraDistanceScale/worldCameraZoom(),[editorCameraRotation.x,editorCameraRotation.y,editorCameraRotation.z]);
    desired=pose.position;camera.up.copy(pose.up);
  }else{
    const defaultFrame=defaultGameplayCameraFrame();
    const focusTarget=combatFrame?new THREE.Vector3(combatFrame.x,0,combatFrame.z):new THREE.Vector3(defaultFrame.x,0,defaultFrame.z);
    const focusEase=1-Math.pow(.006,frame),zoomEase=1-Math.pow(.35,frame);
    gameplayCameraFocus.lerp(focusTarget,focusEase);
    const defaultScale=Math.max(gameplayCameraBaselineScale,defaultFrame.scale);
    const desiredScale=Math.max(gameplayCameraBaselineScale,combatFrame?.scale??defaultScale);
    gameplayCameraScale+=(desiredScale-gameplayCameraScale)*zoomEase;
    focus=gameplayCameraFocus;
    const cameraDistanceScale=gameplayCameraDistanceScale(gameplayCameraScale,{combat:Boolean(combatFrame)});
    const pose=levelCameraPose(focus,cameraDistanceScale/worldCameraZoom(),defaultFrame.rotation);
    desired=pose.position;camera.up.copy(pose.up);
  }
  if(editorMode)camera.position.copy(desired);else camera.position.lerp(desired,1-Math.pow(.001,frame));const look=focus.clone();look.y=mapMode?0:.4;camera.lookAt(look);
  if(editorMode){
    EDITOR_PAN_RIGHT.set(1,0,0).applyQuaternion(camera.quaternion).setY(0).normalize();
    EDITOR_PAN_FORWARD.set(0,1,0).applyQuaternion(camera.quaternion).setY(0).normalize();
  }
  voidBackdrop.position.copy(camera.position);voidBackdrop.quaternion.copy(camera.quaternion);voidBackdrop.translateZ(-.2);
  const cameraDistance=Math.max(.001,camera.position.distanceTo(look));
  scene.fog.density=baseFogDensity*FOG_REFERENCE_CAMERA_DISTANCE/cameraDistance;
  if(!mapMode){sun.position.set(focus.x-8,18,focus.z+7);sun.target.position.set(focus.x,0,focus.z);sun.target.updateMatrixWorld()}
  if(shake>0&&!editorMode){camera.position.x+=(rand()-.5)*shake;camera.position.y+=(rand()-.5)*shake;shake*=.83}
  for(const flag of flags)flag.rotation.y=-.12+Math.sin(totalTime*2+flag.id)*.08;
  if(mode==="playing"||editorMode){
    const foliageDelta=mode==="playing"?frame*simulationScale:frame;
    grassWindTime+=foliageDelta;treeWindTime+=foliageDelta;
    updateGrassWind(foliageDelta);updateTreeWind(foliageDelta);
  }
  updateCommandGridGlow();
  renderPlacedHudWidgets();
  renderer.render(scene,camera);
  if(debugMode&&debugPanelVisible)renderDebugMonitor();
  if(debugMode&&debugPanelVisible&&now-fpsAt>500){fps=Math.round(frames*1000/(now-fpsAt));debugPanel.dataset.stats=`${fps} fps | ${renderer.info.render.calls} draws | ${followers.length+enemyUnits.length} units`;frames=0;fpsAt=now}
  frames++;
}
requestAnimationFrame(loop);
