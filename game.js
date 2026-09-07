import * as THREE from "./vendor/three.module.js";
import { GLTFLoader } from "./vendor/loaders/GLTFLoader.js";
import { STR } from "./strings.js";
import { DUEL_PHASE, DUEL_WAITING_DISTANCE, FACTION, FOLLOW_AWARENESS, SERVANT_MODE, SOLDIER_COMBAT_STATE, SOLDIER_HEALTH_WIDGET_DURATION, SOLDIER_REGEN_DELAY, SOLDIER_REGEN_DURATION, THREAT_FORMATION_SCALE, activeDuelRingState, actorCollisionProfile, actorDebugSnapshot, activeCombatantPoints, advanceDuelState, advanceFollowAwareness, advanceFormationSpread, advanceGroundFragment, advanceLaggingHealthBar, advancePathFailure, allocateDuelWaitingSlots, arrivalSpeed, battleApproachState, cameraBaselineAfterDivision, canApplyAttackDamage, canDivideCompany, canMaintainSoldierDuel, centeredPackOffset, chooseBalancedTargetIndex, chooseCommanderBlockerIndex, chooseCommanderTargetIndex, chooseHiddenSpawn, chooseLocalDetour, chooseNearestAvailablePair, combatVisualPose, commanderClearanceVector, commanderCombatProfile, commanderControlState, commanderFormationOffset, commanderRegenHealth, commanderTacticalWaypoint, companyCommandState, companyDivisionPlan, companyFormationOffset, companyLeaderMotion, defeatCinematicState, duelAttackHits, duelLungeDirection, duelMeetingPoint, duelPathFailureAction, editorPanVector, enemyWaveApproachAngle, environmentGrade, formationExpansionOffset, gameplayCameraDistanceScale, hiddenWaveSpawn, hitKnockback, incomingWaveCameraState, isPlayerWaveDefeated, limitPointToRadius, lineOfSightBlocked, makeCampaign, nextDuelTurn, normalizePracticeConfig, particleBudgetAllows, persistentFragmentBudgetAllows, practiceEnemyHealthMultiplier, preserveLockedCombatants, resolveBoxOverlap, resolveDuelTurnId, separationVector, shouldReleaseCombatCommitment, shouldRepositionFollower, smoothAngle, snapTacticalCell, soldierCombatState, soldierFragmentCount, soldierRegenHealth, soldierSpacingProfile, spawnPackOffset, standOffPursuitPoint, swarmTravelGroupCount, swarmTravelOffset, swarmTravelRadius, tacticalCameraFrame, tacticalCellAction, tacticalInputEnabled, tacticalSelectionScope, unitCommanderProfile } from "./sim-runtime-20260724g.js";
import { DEPLOYMENT_BATCH_SIZES, ENEMY_TARGET_REVIEW_INTERVAL, canDeploySoldier, deploymentFootprintSupported, deploymentReserveAfterDeploy, enemyTargetReviewDue, levelCameraFrame, scatteredPackOffset, shouldRetargetToCloserOpponent, walkableSurfaceCandidates } from "./sim-runtime-20260724g.js";

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
const PRACTICE_CONFIG_KEY="crownwake-practice-config";
const LEVEL_LAYOUT_KEY="crownwake-level-layout-v1",LEGACY_LEVEL_LAYOUT_VERSION=1,LEVEL_LAYOUT_VERSION=2,LEGACY_EDITOR_ASSET_LIBRARY_KEY="crownwake-editor-asset-library-v1",EDITOR_ASSET_LIBRARY_KEY="crownwake-editor-asset-library-v2";
function loadPracticeConfig(){try{return normalizePracticeConfig(JSON.parse(localStorage.getItem(PRACTICE_CONFIG_KEY)||"{}"))}catch{return normalizePracticeConfig()}}
const AUDIO_PREFERENCE_KEY="crownwake-audio-enabled";
function loadAudioPreference(){try{return localStorage.getItem(AUDIO_PREFERENCE_KEY)!=="false"}catch{return true}}
const PRACTICE_CONFIG=loadPracticeConfig();
let campaign = makeCampaign(), mode = "title", target = new THREE.Vector3(), activeEncounter = null;
const PLAYER_COMMANDER=commanderCombatProfile("player"),ENEMY_COMMANDER=commanderCombatProfile("enemy"),PLAYER_DEPLOYMENT_RESERVE_START=PRACTICE_CONFIG.playerSoldiers,OPENING_ENEMY_RADIUS=8,WAVES_ENABLED=false;
const INDEPENDENT_SOLDIERS=true;
let master, masterHealth = INDEPENDENT_SOLDIERS?32:PLAYER_COMMANDER.maxHealth, sinceDamage = 99, followers = [], enemyUnits = [], particles = [], tombstones = [];
const MAX_ACTIVE_PARTICLES=180,MAX_PERSISTENT_FRAGMENTS=800;
let totalTime = 0, shake = 0, reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches, audioOn = loadAudioPreference(), gameSpeed = 1, hudCompact = false, settingsReturnMode = "playing";
let selectedRegion = 2, toastTimer = 0, nextWaveTimer = 0, waveNumber = 0, enemyPackAnchor = null;
let defeatCinematic = null;
let enemyRetreat = null;
let damagePulse = 0, damageStacks = 0;
let commanderHearts = 3;
let companyLayoutDirty=true,playerCompanies=[];
let selectedCompanyId=null,selectedCommander=null,commandHoverCell=null,wasCombat=false,deploymentReserve=PLAYER_DEPLOYMENT_RESERVE_START,deploymentBatch=1,deploymentArmed=false,deploymentStarted=false;
const companyAnchors=new Map(),selectionVisuals=[],COMMAND_CELL=3.6,COMMAND_GRID_OFFSET=1.8;
const editorCameraFocus=new THREE.Vector3(),editorKeys=new Set(),editorObjects=[],editorSelectedObjects=new Set(),editorFoliageObjects=new Set(),editorFoliagePaintSelection=new Set();
const editorGroundPlane=new THREE.Plane(new THREE.Vector3(0,1,0),-GROUND_Y);
const EDITOR_CAMERA_OFFSET=ISOMETRIC_CAMERA_OFFSET.clone();
const EDITOR_PAN_FORWARD=new THREE.Vector3(-EDITOR_CAMERA_OFFSET.x,0,-EDITOR_CAMERA_OFFSET.z).normalize();
const EDITOR_PAN_RIGHT=new THREE.Vector3(-EDITOR_PAN_FORWARD.z,0,EDITOR_PAN_FORWARD.x);
const EDITOR_ZOOM_MIN=.32,EDITOR_ZOOM_MAX=3,EDITOR_ZOOM_STEP=.15;
let editorReturnMode="playing",editorCameraScale=1,editorSelection=null,editorSelectionAnchor=null,editorSelectionHelper=null,editorSelectionHelpers=[],editorTransformGizmo=null,editorTransformMode=null,editorScaleLocked=true,editorPointerState=null,editorPendingAsset=null,editorLibrarySelection=null,editorLibrarySelectionLabel="",editorAssetFolder=null,pendingEditorDelete=null,editorUndoHistory=[],editorCameraTravel=null,editorEnvironmentOpen=false,savedLevelCamera=null,savedLevelState=null,foliagePaintActive=false,foliagePaintOperation="add",foliagePaintStroke=null,foliagePaintBrush=null;
const EDITOR_LAYOUT_STORAGE_KEY="crownwake-editor-layout-v1";
const CONTENT_BROWSER_STORAGE_KEY="crownwake-content-browser-v1",CONTENT_BROWSER_ROOT_ID="content";
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
  {id:"characters",name:"Characters",parentId:CONTENT_BROWSER_ROOT_ID},
  {id:"characters/en",name:"EN",parentId:"characters"},
  {id:"characters/ch",name:"CH",parentId:"characters"},
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
function loadContentBrowserState(){
  try{
    const saved=JSON.parse(localStorage.getItem(CONTENT_BROWSER_STORAGE_KEY)||"{}");
    return {
      folders:Array.isArray(saved.folders)?saved.folders.filter(folder=>folder&&typeof folder.id==="string"&&typeof folder.name==="string"&&typeof folder.parentId==="string"):[],
      assetFolders:saved.assetFolders&&typeof saved.assetFolders==="object"?saved.assetFolders:{},
      assetNames:saved.assetNames&&typeof saved.assetNames==="object"?saved.assetNames:{},
      folderNames:saved.folderNames&&typeof saved.folderNames==="object"?saved.folderNames:{}
    };
  }catch{return {folders:[],assetFolders:{},assetNames:{},folderNames:{}}}
}
const contentBrowserState=loadContentBrowserState(),contentBrowserExpanded=new Set([CONTENT_BROWSER_ROOT_ID,"environment","materials"]),contentBrowserSelection=new Set();
let contentBrowserFolderId=CONTENT_BROWSER_ROOT_ID,contentBrowserQuery="",contentBrowserSelectionAnchor=null,contentBrowserContextTarget=null;
function persistContentBrowserState(){try{localStorage.setItem(CONTENT_BROWSER_STORAGE_KEY,JSON.stringify(contentBrowserState))}catch{}}
function copyContentBrowserState(){return {folders:contentBrowserState.folders.map(folder=>({...folder})),assetFolders:{...contentBrowserState.assetFolders},assetNames:{...contentBrowserState.assetNames},folderNames:{...contentBrowserState.folderNames}}}
function restoreContentBrowserState(snapshot){
  contentBrowserState.folders.splice(0,contentBrowserState.folders.length,...(snapshot?.folders??[]).map(folder=>({...folder})));
  Object.keys(contentBrowserState.assetFolders).forEach(key=>delete contentBrowserState.assetFolders[key]);Object.assign(contentBrowserState.assetFolders,snapshot?.assetFolders??{});
  Object.keys(contentBrowserState.assetNames).forEach(key=>delete contentBrowserState.assetNames[key]);Object.assign(contentBrowserState.assetNames,snapshot?.assetNames??{});
  Object.keys(contentBrowserState.folderNames).forEach(key=>delete contentBrowserState.folderNames[key]);Object.assign(contentBrowserState.folderNames,snapshot?.folderNames??{});
}
const editorOutlinerExpanded=new Set(["scene","scene/environment"]);
const padPrev = new Set();
const debugPanel = $("dev");
const debugButton = $("debug");
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
const soldierRingGeometry=new THREE.RingGeometry(.53,.585,32);
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
function makeEncounterRing(unit){
  const material=new THREE.MeshBasicMaterial({color:0xeaf1e6,transparent:true,opacity:.28,depthWrite:false,side:THREE.DoubleSide});
  const ring=new THREE.Mesh(soldierRingGeometry,material);
  ring.rotation.x=-Math.PI*.5;ring.position.y=GROUND_Y+.018;ring.renderOrder=31;ring.userData.alert=false;unit.add(ring);unit.userData.encounterRing=ring;
}
function updateEncounterRings(){
  for(const unit of [master,...followers,...enemyUnits]){
    const ring=unit?.userData?.encounterRing;if(!ring)continue;
    const foe=unit.userData.lockedTarget;
    const alert=activeDuelRingState({
      unitAlive:unit.userData.alive,
      targetAlive:foe?.userData.alive,
      mutualLock:foe?.userData.lockedTarget===unit
    });
    if(ring.userData.alert!==alert){ring.userData.alert=alert;ring.material.color.setHex(alert?0xed4d59:0xeaf1e6)}
    ring.material.opacity=alert?.78+.14*(.5+.5*Math.sin(totalTime*9+unit.id)):.28;
    const pulse=alert?1+.045*Math.sin(totalTime*7+unit.id):1;ring.scale.setScalar(pulse);ring.visible=alert;
  }
}
function makeActorHealthWidget(unit,commander=false){
  const group=new THREE.Group();
  const layer=(color,width,height,z,order,map=null)=>{
    const mesh=new THREE.Mesh(soldierBarGeometry,new THREE.MeshBasicMaterial({color,map,transparent:true,opacity:.93,depthTest:false,depthWrite:false}));
    mesh.scale.set(width,height,1);mesh.position.z=z;mesh.renderOrder=order;mesh.frustumCulled=false;group.add(mesh);return mesh;
  };
  const width=commander?.88:.74,height=commander?.06:.065;
  layer(0x111b1f,width+.09,height+.075,0,33);
  layer(0x2a373a,width,height,.005,34);
  const lag=layer(0xffffff,width,height*.78,.01,35),main=layer(unit.userData.faction==="player"?COLORS.player:COLORS.amber,width,height*.78,.02,36);
  lag.visible=false;
  group.position.y=commander?1.52:1.42;group.visible=commander;unit.add(group);
  group.userData={current:unit.userData.hp,lagHealth:unit.userData.hp,hold:0,visibleTimer:0,main,lag,width,height,alwaysVisible:commander,regenPulse:0};
  unit.userData.healthWidget=group;
}
function showActorHealth(unit,previousHealth){
  const data=unit.userData.healthWidget?.userData;if(!data)return;
  data.current=Math.max(0,unit.userData.hp);data.lagHealth=Math.max(data.lagHealth,previousHealth);
  data.hold=.24;data.visibleTimer=data.alwaysVisible?Infinity:SOLDIER_HEALTH_WIDGET_DURATION;data.regenPulse=0;
  data.main.material.color.setHex(unit.userData.faction==="player"?COLORS.player:unit.userData.isMaster?COLORS.coral:COLORS.amber);
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
    const max=Math.max(1,unit.userData.maxHp);
    data.lag.visible=state.lag>state.current+.001;
    setWidgetFill(data.lag,state.lag/max,data.width,data.height);
    setWidgetFill(data.main,data.current/max,data.width,data.height);
    const factionColor=unit.userData.faction==="player"?COLORS.player:unit.userData.isMaster?COLORS.coral:COLORS.amber;
    data.main.material.color.setHex(regenerating?0x71e89a:factionColor);
    data.main.material.opacity=regenerating?.88+.12*(.5+.5*Math.sin(totalTime*12)): .95;
    data.lag.material.opacity=.92;
    widget.quaternion.copy(unit.quaternion).invert().multiply(camera.quaternion);
  }
}

const MODEL_SPECS = {
  playerServant: ["./Models/CH_Servant.glb", 1.22],
  enemyServant: ["./Models/Enemy_Servant.glb", 1.22]
};
const FOREST_FENCE_SPECS=[
  ["./Models/Forest_House_Fence_01.glb",1.55],
  ["./Models/Forest_House_Fence_02.glb",1.55],
  ["./Models/Forest_House_Fence_03.glb",1.55],
  ["./Models/Forest_House_Fence_04.glb",1.55]
];
const modelTemplates = {};
const gltfLoader = new GLTFLoader();
function loadCharacterModel([url, targetHeight]) {
  return gltfLoader.loadAsync(url).then(({ scene: model }) => {
    const bounds = new THREE.Box3().setFromObject(model), size = bounds.getSize(new THREE.Vector3());
    model.scale.multiplyScalar(targetHeight / Math.max(size.y, .001));
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
await Promise.all(Object.entries(MODEL_SPECS).map(async ([key, spec]) => {
  try { modelTemplates[key] = await loadCharacterModel(spec); }
  catch (error) { console.warn(`Model fallback active for ${key}`, error); }
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
function characterVisual(key) {
  const visual = modelTemplates[key]?.clone(true);
  if (visual) visual.userData.characterVisual = true;
  return visual;
}
function setCharacterVisual(character, key, fallback) {
  const previous = character.children.find(child => child.userData.characterVisual);
  if (previous) character.remove(previous);
  const visual = characterVisual(key) ?? fallback();
  visual.userData.characterVisual = true;
  visual.userData.basePosition=visual.position.clone();
  visual.userData.baseScale=visual.scale.clone();
  character.add(visual);
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
    const tinted=source.map(material=>{const clone=material.clone();clone.color?.setHex(color);clone.roughness=.88;return clone});
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
  return [master, ...followers, ...enemyUnits].filter(Boolean);
}

function debugObstaclesFor(unit, target = null) {
  return allLiveUnits()
    .filter(other => other !== unit && other !== target && other.userData.alive !== false)
    .map(other => ({
      x: other.position.x,
      z: other.position.z,
      radius: Math.max(other.userData.collisionHalf?.x ?? .2, other.userData.collisionHalf?.z ?? .2)
    }));
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
  return actorDebugSnapshot({
    actor: unit,
    target,
    combat: !!activeEncounter && !activeEncounter.done && activeEncounter.aggro,
    targetDistance,
    lineOfSight,
    pathBlocked: (unit.userData.pathFailures ?? 0) > 0 || (unit.userData.pathStallTimer ?? 0) > .18,
    collisionContacts,
    attackRange: unit.userData.isMaster ? 1.4 : 1.05,
    now: totalTime
  });
}

function debugStateLabel(snapshot) {
  if (!snapshot.alive) return "down";
  if (snapshot.action === "fleeing") return "fleeing";
  if (snapshot.action === "stunned") return "stunned";
  if (snapshot.action === "attacking") return "attacking";
  if (snapshot.action === "seeking") return "seeking";
  if (snapshot.combatState === DUEL_PHASE.APPROACH || snapshot.combatState === DUEL_PHASE.LUNGE || snapshot.combatState === DUEL_PHASE.RECOVER) return "combat";
  if (snapshot.action === "moving") return "moving";
  return "idle";
}

function renderDebugMonitor() {
  if (!debugMode || !debugPanelVisible) return;
  const snapshots = allLiveUnits().map(unit => ({ unit, snapshot: debugSnapshotFor(unit) }));
  const focus = snapshots.find(entry => entry.unit.id === debugFocusId)?.unit ?? snapshots[0]?.unit ?? null;
  if (!debugFocusId && focus) debugFocusId = focus.id;
  const selected = snapshots.find(entry => entry.unit.id === debugFocusId)?.snapshot ?? snapshots[0]?.snapshot ?? null;
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
            <span>nav</span><strong>${selected.pathFailures > 0 ? `stalled x${selected.pathFailures}` : "moving"}</strong>
            <span>collisions</span><strong>${selected.collisionContacts.toFixed(2)}</strong>
            <span>last hit</span><strong>${selected.lastDamageAt == null ? "n/a" : selected.lastDamageAt.toFixed(1)}s</strong>
            <span>last attack</span><strong>${selected.lastAttackAt == null ? "n/a" : selected.lastAttackAt.toFixed(1)}s</strong>
          </div>
          <p class="debug-blockers">${selected.blockers.length ? selected.blockers.join(" | ") : "No current blockers"}</p>
        ` : `<p class="debug-empty">No unit selected.</p>`}
      </div>
      <div class="debug-list">
        ${snapshots.map(({ unit, snapshot }) => `
          <button class="debug-row ${unit.id === debugFocusId ? "selected" : ""}" data-debug-unit="${unit.id}">
            <span>${unitLabel(unit)}</span>
            <strong>${debugStateLabel(snapshot)}</strong>
            <small>${snapshot.blockers[0] ?? (snapshot.targetDistance == null ? "idle" : `d ${snapshot.targetDistance.toFixed(2)}`)}</small>
          </button>
        `).join("")}
      </div>
    </div>
  `;
  debugPanel.querySelectorAll("[data-debug-unit]").forEach(button => {
    button.onclick = () => {
      debugFocusId = Number(button.getAttribute("data-debug-unit"));
      renderDebugMonitor();
    };
  });
}

function toggleDebugMonitor(force) {
  if (!debugMode) return;
  debugPanelVisible = typeof force === "boolean" ? force : !debugPanelVisible;
  debugPanel.style.display = debugPanelVisible ? "block" : "none";
  if (debugButton) debugButton.textContent = debugPanelVisible ? "MONITOR ON" : "MONITOR";
  if (debugPanelVisible) renderDebugMonitor();
}
function updateActorCombatAnimations(dt){
  for(const actor of [master,...followers,...enemyUnits]){
    const visual=actor.children.find(child=>child.userData.characterVisual);
    if(!visual)continue;
    actor.userData.attackAnim=Math.max(0,(actor.userData.attackAnim??0)-dt*3.8);
    actor.userData.damageAnim=Math.max(0,(actor.userData.damageAnim??0)-dt*3.2);
    const pose=combatVisualPose({attack:actor.userData.attackAnim,damage:actor.userData.damageAnim,reducedMotion});
    const basePosition=visual.userData.basePosition??new THREE.Vector3(),baseScale=visual.userData.baseScale??new THREE.Vector3(1,1,1);
    visual.position.copy(basePosition);visual.position.z+=pose.forward;visual.position.y+=pose.lift;
    visual.scale.set(baseScale.x*pose.scaleX,baseScale.y*pose.scaleY,baseScale.z*pose.scaleZ);
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
  outline.scale.set(1.055,1.035,1);outline.position.z=-.003;outline.renderOrder=4;
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
  outline.scale.set(1.1,1.04,1);outline.position.set(0,0,-.003);outline.renderOrder=4;
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
  battle.add(tower);editorObjects.push(tower);return tower;
}
function addForestFence({x,z,y=GROUND_Y,variantIndex=0,turn=0,rotation=null,scale=null}){
  const template=forestFenceTemplates[variantIndex];if(!template)return null;
  const fence=template.clone(true);fence.position.set(x,y,z);fence.rotation.set(...(rotation??[0,turn,0]));if(scale)fence.scale.fromArray(scale);
  fence.userData.editorSelectable=true;fence.userData.editorAssetType="forest-fence";fence.userData.variantIndex=variantIndex;fence.name=`Forest fence ${String(variantIndex+1).padStart(2,"0")}`;
  battle.add(fence);editorObjects.push(fence);return fence;
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
function levelAssetRecord(object){
  const type=object?.userData?.editorAssetType;
  if(!["world-floor","primitive-cube","tree-cluster","tree-billboard","grass-cluster","rock-pillar","archer-tower","forest-fence","ch-character","enemy-character"].includes(type))return null;
  const scale=type==="grass-cluster"?(object.userData.grassSizeBaseScale??object.scale):object.scale;
  const record={type,x:Number(object.position.x.toFixed(3)),y:Number(object.position.y.toFixed(3)),z:Number(object.position.z.toFixed(3)),turn:Number(object.rotation.y.toFixed(4)),rotation:[object.rotation.x,object.rotation.y,object.rotation.z].map(value=>Number(value.toFixed(4))),scale:scale.toArray().map(value=>Number(value.toFixed(4)))};
  if(["tree-cluster","tree-billboard","grass-cluster","rock-pillar","forest-fence"].includes(type))record.variantIndex=object.userData.variantIndex;
  if(type==="grass-cluster"&&object.userData.meadowGrassBlade)record.meadowGrassBlade=true;
  if(type==="grass-cluster"&&object.userData.grassSprite)record.spriteIndex=object.userData.spriteIndex;
  return record;
}
function addLevelAsset(record){
  if(!record||!Number.isFinite(record.x)||!Number.isFinite(record.z))return null;
  const y=Number.isFinite(record.y)?record.y:GROUND_Y,turn=Number.isFinite(record.turn)?record.turn:0,rotation=Array.isArray(record.rotation)&&record.rotation.length===3&&record.rotation.every(Number.isFinite)?record.rotation:null,scale=Array.isArray(record.scale)&&record.scale.length===3&&record.scale.every(value=>Number.isFinite(value)&&value>0)?record.scale:null;
  if(record.type==="world-floor")return addWorldFloor(record);
  if(record.type==="primitive-cube")return addPrimitiveCube({x:record.x,y,z:record.z,turn,rotation,scale});
  if(record.type==="ch-character")return addEditorCharacter({faction:"player",x:record.x,y,z:record.z,turn,rotation,scale});
  if(record.type==="enemy-character")return addEditorCharacter({faction:"enemy",x:record.x,y,z:record.z,turn,rotation,scale});
  if(record.type==="tree-billboard")return addTallConiferBillboard({x:record.x,y,z:record.z,variantIndex:record.variantIndex,turn,rotation,scale});
  if(record.type==="tree-cluster"&&record.variantIndex===LEGACY_TALL_CONIFER_TREE_CLUSTER_INDEX)return addTallConiferBillboard({x:record.x,y,z:record.z,turn,rotation,scale});
  if(record.type==="tree-cluster"&&Number.isInteger(record.variantIndex)&&TREE_CLUSTER_VARIANTS[record.variantIndex])return addTreeCluster({x:record.x,y,z:record.z,trees:TREE_CLUSTER_VARIANTS[record.variantIndex],variantIndex:record.variantIndex,turn,rotation,scale});
  if(record.type==="grass-cluster"){
    if(record.meadowGrassBlade)return addMeadowGrassBlade({x:record.x,y,z:record.z,turn,rotation,scale});
    if(Number.isInteger(record.spriteIndex)&&SPRITE_GRASS_ASSETS[record.spriteIndex])return addGrassSpriteBillboard({x:record.x,y,z:record.z,spriteIndex:record.spriteIndex,turn,rotation,scale});
    const variantIndex=Number.isInteger(record.variantIndex)&&GRASS_CLUSTER_VARIANTS[record.variantIndex]?record.variantIndex:0;
    return addGrassCluster({x:record.x,y,z:record.z,variantIndex,turn,rotation,scale});
  }
  if(record.type==="rock-pillar"){
    const variantIndex=Number.isInteger(record.variantIndex)&&ROCK_PILLAR_VARIANTS[record.variantIndex]?record.variantIndex:0;
    return addSedimentaryRock({x:record.x,y,z:record.z,variantIndex,turn,rotation,scale});
  }
  if(record.type==="archer-tower")return addArcherTower({x:record.x,y,z:record.z,turn,rotation,scale});
  if(record.type==="forest-fence"){
    const variantIndex=Number.isInteger(record.variantIndex)&&forestFenceTemplates[record.variantIndex]?record.variantIndex:0;
    return addForestFence({x:record.x,y,z:record.z,variantIndex,turn,rotation,scale});
  }
  return null;
}
function rememberLevelState(layout){
  savedLevelState={
    version:LEVEL_LAYOUT_VERSION,
    assets:(layout.assets??[]).map(record=>({...record,rotation:record.rotation?.slice(),scale:record.scale?.slice()})),
    camera:layout.camera?{...layout.camera}:null
  };
}
function restoreLevelLayout(){
  try{
    const layout=JSON.parse(localStorage.getItem(LEVEL_LAYOUT_KEY)||"null");
    if(!layout||![LEGACY_LEVEL_LAYOUT_VERSION,LEVEL_LAYOUT_VERSION].includes(layout.version)||!Array.isArray(layout.assets))return false;
    savedLevelCamera=levelCameraFrame(layout.camera,{minScale:EDITOR_ZOOM_MIN,maxScale:EDITOR_ZOOM_MAX});
    if(savedLevelCamera){
      gameplayCameraFocus.set(savedLevelCamera.x,0,savedLevelCamera.z);
      gameplayCameraScale=savedLevelCamera.scale;
      gameplayCameraBaselineScale=savedLevelCamera.scale;
    }
    for(const record of layout.assets.slice(0,180)){
      if(record.type==="bush"+"-sprite")continue;
      if(record.type==="grass-cluster"&&layout.version===LEGACY_LEVEL_LAYOUT_VERSION)continue;
      addLevelAsset(record);
    }
    rememberLevelState({assets:layout.assets.slice(0,180).filter(record=>record.type!=="bush"+"-sprite"&&!(record.type==="grass-cluster"&&layout.version===LEGACY_LEVEL_LAYOUT_VERSION)),camera:savedLevelCamera});
    if(layout.version===LEGACY_LEVEL_LAYOUT_VERSION)saveLevelLayout();
    return true;
  }catch(error){console.warn("Saved level layout could not be restored",error);return false}
}
function saveLevelLayout(){
  const assets=editorObjects.map(levelAssetRecord).filter(Boolean);
  if(mode==="editor")savedLevelCamera=levelCameraFrame({x:editorCameraFocus.x,z:editorCameraFocus.z,scale:editorCameraScale},{minScale:EDITOR_ZOOM_MIN,maxScale:EDITOR_ZOOM_MAX});
  const layout={version:LEVEL_LAYOUT_VERSION,assets,camera:savedLevelCamera};rememberLevelState(layout);
  try{localStorage.setItem(LEVEL_LAYOUT_KEY,JSON.stringify(layout));localStorage.setItem(EDITOR_ASSET_LIBRARY_KEY,JSON.stringify([...hiddenEditorAssets]));persistContentBrowserState();}
  catch(error){console.warn("Level layout could not be saved",error);}
}
function editorSnapshot(){return {assets:editorObjects.map(levelAssetRecord).filter(Boolean),hiddenAssets:[...hiddenEditorAssets],contentBrowser:copyContentBrowserState()};}
function updateEditorUndoControl(){$("editor-undo").disabled=editorUndoHistory.length===0;}
function recordEditorUndo(){editorUndoHistory.push(editorSnapshot());if(editorUndoHistory.length>32)editorUndoHistory.shift();updateEditorUndoControl();}
function restoreEditorSnapshot(snapshot){
  if(!snapshot)return;
  selectEditorObject(null);
  removeEditorCameraObject();
  for(const object of [...editorObjects]){detachEditorActorFromCombat(object);battle.remove(object)}
  editorObjects.length=0;editorFoliageObjects.clear();worldFloor=null;
  for(const record of snapshot.assets??[])addLevelAsset(record);
  hiddenEditorAssets.clear();for(const assetId of snapshot.hiddenAssets??[])hiddenEditorAssets.add(assetId);
  restoreContentBrowserState(snapshot.contentBrowser);
  editorPendingAsset=null;editorLibrarySelection=null;editorLibrarySelectionLabel="";
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
const WORLD_FLOOR_BASE_SIZE=64,ISLAND_PLATFORM_DEPTH=1.65,worldFloorGeometry=new THREE.PlaneGeometry(WORLD_FLOOR_BASE_SIZE,WORLD_FLOOR_BASE_SIZE);
worldFloorGeometry.rotateX(-Math.PI/2);
const islandSideGeometry=new THREE.BoxGeometry(WORLD_FLOOR_BASE_SIZE,ISLAND_PLATFORM_DEPTH,WORLD_FLOOR_BASE_SIZE);
const islandSideMaterial=new THREE.MeshStandardMaterial({color:0x17201d,roughness:.9,metalness:0,flatShading:true});
const primitiveCubeGeometry=new THREE.BoxGeometry(1,1,1);
primitiveCubeGeometry.translate(0,.5,0);
let worldFloor=null;
function addWorldFloor(record={}){
  const floor=worldFloor??new THREE.Group();
  if(!worldFloor){
    worldFloor=floor;floor.name="Island Plane";floor.receiveShadow=true;
    floor.userData.editorSelectable=true;floor.userData.editorAssetType="world-floor";floor.userData.walkableSurface="island";
    const islandTop=new THREE.Mesh(worldFloorGeometry,meadowGroundMaterial),islandSides=new THREE.Mesh(islandSideGeometry,islandSideMaterial);
    islandTop.name="Island Surface";islandTop.receiveShadow=true;
    islandSides.name="Island Cliff";islandSides.position.y=-ISLAND_PLATFORM_DEPTH*.5;islandSides.castShadow=true;islandSides.receiveShadow=true;
    floor.add(islandSides,islandTop);
  }
  const x=Number.isFinite(record.x)?record.x:0,y=Number.isFinite(record.y)?record.y:.01,z=Number.isFinite(record.z)?record.z:0;
  const turn=Number.isFinite(record.turn)?record.turn:0,rotation=Array.isArray(record.rotation)&&record.rotation.length===3&&record.rotation.every(Number.isFinite)?record.rotation:[0,turn,0];
  const scale=Array.isArray(record.scale)&&record.scale.length===3&&record.scale.every(value=>Number.isFinite(value)&&value>0)?record.scale:[1,1,1];
  floor.position.set(x,y,z);floor.rotation.set(...rotation);floor.scale.fromArray(scale);
  if(!floor.parent)battle.add(floor);if(!editorObjects.includes(floor))editorObjects.unshift(floor);
  return floor;
}
function addPrimitiveCube({x,z,y=GROUND_Y,turn=0,rotation=null,scale=null}){
  const cube=new THREE.Mesh(primitiveCubeGeometry,mats.stone);
  cube.position.set(x,y,z);cube.rotation.set(...(rotation??[0,turn,0]));if(scale)cube.scale.fromArray(scale);
  cube.castShadow=true;cube.receiveShadow=true;cube.userData.editorSelectable=true;cube.userData.editorAssetType="primitive-cube";cube.userData.walkableSurface="cube";cube.name="Cube";
  battle.add(cube);editorObjects.push(cube);return cube;
}

const ACTOR_FOOT_CLEARANCE=.005,ACTOR_GRAVITY=24,ACTOR_MAX_FALL_SPEED=18,ACTOR_VOID_Y=-24;
const supportProbeWorld=new THREE.Vector3(),supportProbeLocal=new THREE.Vector3(),supportSurfacePoint=new THREE.Vector3();
function walkableSurfaceHeightAt(surface,x,z){
  const type=surface?.userData?.walkableSurface;if(!type||!surface.parent)return null;
  surface.updateWorldMatrix(true,false);supportProbeWorld.set(x,0,z);supportProbeLocal.copy(supportProbeWorld);surface.worldToLocal(supportProbeLocal);
  const halfExtent=type==="island"?WORLD_FLOOR_BASE_SIZE*.5:.5;
  if(Math.abs(supportProbeLocal.x)>halfExtent||Math.abs(supportProbeLocal.z)>halfExtent)return null;
  supportSurfacePoint.set(supportProbeLocal.x,type==="island"?0:1,supportProbeLocal.z);surface.localToWorld(supportSurfacePoint);
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
function actorSupportHeight(actor){return walkableSupportHeightAt(actor.position.x,actor.position.z)}
function commandCellSupported(cell){
  return deploymentFootprintSupported(
    {x:cell.x,z:cell.z,size:COMMAND_CELL-.06},
    point=>walkableSupportHeightAt(point.x,point.z)
  );
}
function removeActorIntoVoid(actor){
  if(!actor?.userData?.alive)return;
  resetDuel(actor);actor.userData.alive=false;actor.userData.falling=true;actor.userData.velocity?.set(0,0,0);actor.visible=false;battle.remove(actor);
  if(actor.userData.faction==="player"){companyLayoutDirty=true;updateStats();}
}
function updateActorGrounding(actor,dt){
  if(!actor?.visible||!actor.userData?.alive)return;
  const supportY=actorSupportHeight(actor),data=actor.userData;
  if(supportY!==null&&actor.position.y<=supportY+.26){
    actor.position.y=supportY+ACTOR_FOOT_CLEARANCE;data.verticalVelocity=0;data.falling=false;return;
  }
  data.verticalVelocity=Math.max(-ACTOR_MAX_FALL_SPEED,(data.verticalVelocity??0)-ACTOR_GRAVITY*dt);
  actor.position.y+=data.verticalVelocity*dt;data.falling=true;
  if(actor.position.y<ACTOR_VOID_Y)removeActorIntoVoid(actor);
}
function updateActorTerrainSupport(dt){
  for(const actor of [master,...followers,...enemyUnits])updateActorGrounding(actor,dt);
}

function commandCellBorderGeometry(size,thickness){
  const half=size*.5,inner=Math.max(0,half-thickness),shape=new THREE.Shape(),hole=new THREE.Path();
  shape.moveTo(-half,-half);shape.lineTo(half,-half);shape.lineTo(half,half);shape.lineTo(-half,half);shape.closePath();
  hole.moveTo(-inner,-inner);hole.lineTo(-inner,inner);hole.lineTo(inner,inner);hole.lineTo(inner,-inner);hole.closePath();shape.holes.push(hole);
  const geometry=new THREE.ShapeGeometry(shape);geometry.rotateX(-Math.PI/2);return geometry;
}
const commandGrid=new THREE.Group(),commandCellGeometry=new THREE.PlaneGeometry(COMMAND_CELL-.06,COMMAND_CELL-.06),commandCellOutlineGeometry=commandCellBorderGeometry(COMMAND_CELL-.06,.13);
commandCellGeometry.rotateX(-Math.PI/2);commandGrid.visible=false;battle.add(commandGrid);
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
function tacticalSelectionCenter(){
  const members=livingSelectionMembers();
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
      new THREE.RingGeometry(.3,.47,32),
      new THREE.MeshBasicMaterial({color:0xf7fff7,transparent:true,opacity:.3,side:THREE.DoubleSide,depthWrite:false})
    );
    ring.rotation.x=-Math.PI/2;ring.position.copy(actor.position);ring.position.y=actor.position.y+.028;ring.renderOrder=40;
    battle.add(ring);
    selectionVisuals.push({actor,shell,shellMaterials,ring});
  }
}
function updateSelectionVisuals(){
  const pulse=.5+.5*Math.sin(totalTime*4.5);
  for(const {actor,shell,shellMaterials,ring} of selectionVisuals){
    if(!actor?.userData.alive){shell.visible=false;ring.visible=false;continue}
    shell.visible=true;ring.visible=true;ring.position.copy(actor.position);ring.position.y=actor.position.y+.028;ring.material.opacity=.24+pulse*.14;
    for(const material of shellMaterials)material.opacity=.88+pulse*.1;
  }
}
function tacticalCellInRange(cell){
  const center=snapTacticalCell(tacticalSelectionCenter(),COMMAND_CELL,COMMAND_GRID_OFFSET);
  return Math.abs(cell.x-center.x)<=COMMAND_CELL*3.01&&Math.abs(cell.z-center.z)<=COMMAND_CELL*3.01;
}
function clearCommandGrid(){
  for(const child of [...commandGrid.children])child.material?.dispose?.();
  commandGrid.clear();
}
function addCommandGridCell(cell,{blocked=false,hovered=false}={}){
  if(!commandCellSupported(cell))return false;
  const surfaceY=walkableSupportHeightAt(cell.x,cell.z);
  const color=hovered?(blocked?0xd45d65:0x62d493):0xc7d5ca;
  const opacity=hovered?.72:.16;
  const mesh=new THREE.Mesh(commandCellGeometry,new THREE.MeshBasicMaterial({color,transparent:true,opacity,depthWrite:false,side:THREE.DoubleSide}));
  const outline=new THREE.Mesh(commandCellOutlineGeometry,new THREE.MeshBasicMaterial({color:0xf7fff1,transparent:true,opacity:.88,depthWrite:false,side:THREE.DoubleSide}));
  mesh.position.set(cell.x,surfaceY+.012,cell.z);outline.position.set(cell.x,surfaceY+.014,cell.z);mesh.renderOrder=90;outline.renderOrder=91;mesh.frustumCulled=false;outline.frustumCulled=false;mesh.userData={commandCell:cell,blocked};commandGrid.add(mesh,outline);return true;
}
function refreshCommandGrid(){
  clearCommandGrid();
  if(deploymentArmed){
    if(commandHoverCell)addCommandGridCell(commandHoverCell,{blocked:deploymentCellBlocked(commandHoverCell),hovered:true});
    commandGrid.visible=!!commandHoverCell;return;
  }
  if(selectedCompanyId===null&&!selectedCommander){commandGrid.visible=false;return}
  const center=snapTacticalCell(tacticalSelectionCenter(),COMMAND_CELL,COMMAND_GRID_OFFSET);
  for(let x=-3;x<=3;x++)for(let z=-3;z<=3;z++){
    const cell={x:center.x+x*COMMAND_CELL,z:center.z+z*COMMAND_CELL};
    const hovered=commandHoverCell&&Math.abs(commandHoverCell.x-cell.x)<.01&&Math.abs(commandHoverCell.z-cell.z)<.01;
    addCommandGridCell(cell,{hovered});
  }
  if(commandHoverCell&&!tacticalCellInRange(commandHoverCell))addCommandGridCell(commandHoverCell,{blocked:true,hovered:true});
  commandGrid.visible=true;
}
function clearTacticalSelection(){
  selectedCompanyId=null;selectedCommander=null;commandHoverCell=null;commandGrid.visible=false;clearCommandGrid();clearSelectionVisuals();
  updateDivideControl();
}
function selectCompany(companyId){
  deploymentArmed=false;updateDeploymentControl();
  selectedCompanyId=companyId;selectedCommander=null;commandHoverCell=null;rebuildSelectionVisuals();refreshCommandGrid();updateDivideControl();showToast(STR.chooseGround,1300);synthTone(410,.12,"sine",.018);
}
function selectCommander(commander){
  deploymentArmed=false;updateDeploymentControl();
  selectedCompanyId=null;selectedCommander=commander;commandHoverCell=null;
  rebuildSelectionVisuals();refreshCommandGrid();updateDivideControl();showToast(STR.chooseGround,1300);synthTone(465,.12,"sine",.018);
}
function updateDeploymentControl(){
  updateDeploymentOptions();
  const button=$("companies");if(!button)return;
  const available=canDeploySoldier(deploymentReserve);
  button.disabled=!available;button.classList.toggle("deploy-armed",deploymentArmed);button.setAttribute("aria-pressed",String(deploymentArmed));
  button.setAttribute("aria-label",available?`Deploy soldier — ${deploymentReserve} remaining`:"No soldiers left to deploy");
}
function updateDeploymentOptions(){
  for(const option of document.querySelectorAll("[data-deployment-batch]")){
    const batch=Number(option.dataset.deploymentBatch),enabled=canDeploySoldier(deploymentReserve,batch);
    option.disabled=!enabled;option.classList.toggle("selected",batch===deploymentBatch);option.setAttribute("aria-pressed",String(batch===deploymentBatch));
  }
}
function normalizeDeploymentBatch(){
  if(canDeploySoldier(deploymentReserve,deploymentBatch))return;
  deploymentBatch=[...DEPLOYMENT_BATCH_SIZES].reverse().find(batch=>canDeploySoldier(deploymentReserve,batch))??1;
}
function deploymentCellBlocked(cell){
  if(!commandCellSupported(cell))return true;
  const center=enemyPackAnchor?.position;
  return Boolean(center&&Math.hypot(cell.x-center.x,cell.z-center.z)<OPENING_ENEMY_RADIUS);
}
function selectDeploymentBatch(batch){
  if(mode!=="playing"||!DEPLOYMENT_BATCH_SIZES.includes(batch)||!canDeploySoldier(deploymentReserve,batch))return;
  const wasArmed=deploymentArmed;
  deploymentBatch=batch;deploymentArmed=true;commandHoverCell=null;clearTacticalSelection();refreshCommandGrid();updateDeploymentControl();
  if(!wasArmed){showToast("CHOOSE A DEPLOYMENT POINT",1300);synthTone(430,.12,"sine",.018)}
}
function toggleDeploymentMode(){
  if(mode!=="playing")return;
  if(!canDeploySoldier(deploymentReserve)){showToast("NO SOLDIERS LEFT TO DEPLOY",1100);return}
  deploymentArmed=!deploymentArmed;commandHoverCell=null;clearTacticalSelection();refreshCommandGrid();updateDeploymentControl();
  if(deploymentArmed){showToast("CHOOSE A DEPLOYMENT POINT",1300);synthTone(430,.12,"sine",.018)}
  else showToast("DEPLOYMENT CANCELLED",900);
}
function deploySoldier(point){
  if(!deploymentArmed||!canDeploySoldier(deploymentReserve))return false;
  const count=Math.min(deploymentBatch,deploymentReserve),cell=snapTacticalCell(point,COMMAND_CELL,COMMAND_GRID_OFFSET),seed=rand();
  if(deploymentCellBlocked(cell)){commandHoverCell=commandCellSupported(cell)?cell:null;refreshCommandGrid();showToast(commandHoverCell?"ENEMY GROUND":"CHOOSE THE ISLAND",1000);return false}
  const surfaceY=walkableSupportHeightAt(cell.x,cell.z);
  for(let index=0;index<count;index++){
    const offset=scatteredPackOffset(index,count,seed),unit=makeUnit("player");
    unit.position.set(cell.x+offset.lateral*.48,surfaceY+ACTOR_FOOT_CLEARANCE,cell.z+offset.forward*.48);unit.userData.holdPosition=unit.position.clone();battle.add(unit);followers.push(unit);
  }
  deploymentReserve=deploymentReserveAfterDeploy(deploymentReserve,count);deploymentStarted=true;activatePlacedCharacterEncounter();normalizeDeploymentBatch();deploymentArmed=canDeploySoldier(deploymentReserve);commandHoverCell=deploymentArmed?cell:null;refreshCommandGrid();updateStats();playSound("move");synthTone(520,.12,"sine",.022);showToast(count===1?"SOLDIER DEPLOYED":`${count} SOLDIERS DEPLOYED`,950);
  return true;
}
function issueCompanyOrder(point){
  if(selectedCompanyId===null&&!selectedCommander)return false;
  const cell=snapTacticalCell(point,COMMAND_CELL,COMMAND_GRID_OFFSET);
  const action=tacticalCellAction({inRange:tacticalCellInRange(cell)&&commandCellSupported(cell)});
  if(action==="reject"){showToast(STR.blockedGround,1000);commandHoverCell=cell;refreshCommandGrid();return true}
  if(action==="cancel"){
    clearTacticalSelection();showToast(STR.orderCancelled,1100);synthTone(220,.1,"sine",.014);return true;
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
  const g=new THREE.Group(), key=faction==="player"?"playerServant":"enemyServant";
  setCharacterVisual(g,key,()=>{const body=roundedBox(.42,1.22,.38,mats.warrior,.1);body.position.y=.03;return body});
  const profile={maxHealth:faction==="player"?32:25.6,attack:faction==="player"?10:8,regenDelay:99,regenPerSecond:0};
  g.userData={faction,hp:profile.maxHealth,maxHp:profile.maxHealth,attack:profile.attack,regenDelay:profile.regenDelay,regenPerSecond:profile.regenPerSecond,sinceDamage:99,regenStartHealth:profile.maxHealth,regenActive:false,cool:0,alive:true,isMaster:false,unitCommander:false,companyId:0,collisionHalf:actorCollisionProfile("soldier"),velocity:new THREE.Vector3(),attackAnim:0,damageAnim:0,manualMoving:false,manualTarget:null,lastAttackTime:null,lastDamageTime:null,collisionContacts:0};
  if(faction!=="player")tintCharacter(g,COLORS.coral);prepareDamageVisual(g);makeActorHealthWidget(g,false);addGroundContactOcclusion(g);makeEncounterRing(g);return g;
}
function makeUnit(faction="player") {
  const g=new THREE.Group(), key=faction==="player"?"playerServant":"enemyServant";
  setCharacterVisual(g,key,()=>{const body=roundedBox(.42,1.22,.38,mats.warrior,.1);body.position.y=.03;return body});
  const player=faction==="player",maxHp=player?32:25.6,attack=player?10:8;
  g.userData={faction,hp:maxHp,maxHp,attack,sinceDamage:99,regenStartHealth:maxHp,regenActive:false,cool:rand()*.5,alive:true,isMaster:false,unitCommander:false,companyId:0,collisionHalf:actorCollisionProfile("soldier"),velocity:new THREE.Vector3(),phase:rand()*10,mode:SERVANT_MODE.FOLLOW,followState:FOLLOW_AWARENESS.HOLDING,followTimer:0,followThreshold:.38+rand()*.72,responseDelay:.12+rand()*.68,trackingRate:1.8+rand()*2.4,hitPulse:0,attackAnim:0,damageAnim:0,lastAttackTime:null,lastDamageTime:null,collisionContacts:0};
  if(!player)tintCharacter(g,COLORS.amber);
  prepareDamageVisual(g);makeActorHealthWidget(g,false);addGroundContactOcclusion(g);makeEncounterRing(g);return g;
}
function addEditorCharacter({faction="player",x,z,y=GROUND_Y,turn=0,rotation=null,scale=null}){
  const actor=makeUnit(faction);actor.position.set(x,y,z);actor.rotation.set(...(rotation??[0,turn,0]));if(scale)actor.scale.fromArray(scale);
  actor.userData.editorSelectable=true;actor.userData.editorActor=true;actor.userData.editorAssetType=faction==="enemy"?"enemy-character":"ch-character";actor.name=faction==="enemy"?"EN soldier":"CH soldier";
  battle.add(actor);editorObjects.push(actor);
  const roster=faction==="enemy"?enemyUnits:followers;if(!roster.includes(actor))roster.push(actor);
  activatePlacedCharacterEncounter();return actor;
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
function activatePlacedCharacterEncounter(){
  const livingPlayers=followers.filter(unit=>unit?.parent===battle&&unit.visible&&unit.userData?.alive);
  const livingEnemies=enemyUnits.filter(unit=>unit?.parent===battle&&unit.visible&&unit.userData?.alive);
  if(!livingPlayers.length||!livingEnemies.length||activeEncounter&&!activeEncounter.done)return false;
  deploymentStarted=true;
  const enemyCenter=livingEnemies.reduce((sum,unit)=>sum.add(unit.position),new THREE.Vector3()).multiplyScalar(1/livingEnemies.length);enemyCenter.y=GROUND_Y;
  const playerCenter=livingPlayers.reduce((sum,unit)=>sum.add(unit.position),new THREE.Vector3()).multiplyScalar(1/livingPlayers.length);playerCenter.y=GROUND_Y;
  const forward=playerCenter.sub(enemyCenter).setY(0);if(forward.lengthSq()<.001)forward.set(0,0,1);else forward.normalize();
  enemyPackAnchor={position:enemyCenter.clone(),forward,velocity:new THREE.Vector3()};
  activeEncounter={regionId:selectedRegion,faction:FACTION.AMBER,totalServants:livingEnemies.length,aggro:false,done:false,victoryResolved:false,wave:0,swarmCount:1,threatBudget:livingEnemies.length,formationSpread:1};
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
function rebuildPlacedCharacterEncounter(){
  const attached=unit=>unit?.parent===battle&&unit.visible&&unit.userData?.alive;
  followers=followers.filter(attached);enemyUnits=enemyUnits.filter(attached);
  for(const unit of [...followers,...enemyUnits]){
    resetDuel(unit);unit.userData.seekingTarget=false;unit.userData.commanderTarget=null;
  }
  activeEncounter=null;enemyPackAnchor=null;wasCombat=false;defeatCinematic=null;
  activatePlacedCharacterEncounter();
}
function removeUnplacedEnemyActors(){
  for(const enemy of [...enemyUnits])if(!enemy.userData?.editorActor){detachActorFromCombat(enemy);battle.remove(enemy)}
  rebuildPlacedCharacterEncounter();
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
}
if(!savedLevelCamera)savedLevelCamera=levelCameraFrame({x:0,z:0,scale:1},{minScale:EDITOR_ZOOM_MIN,maxScale:EDITOR_ZOOM_MAX});
if(!savedLevelState)rememberLevelState({assets:editorObjects.map(levelAssetRecord).filter(Boolean),camera:savedLevelCamera});

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
  particles=[];tombstones=[];followers=[];enemyUnits=[];editorObjects.length=0;editorFoliageObjects.clear();worldFloor=null;
  activeEncounter=null;enemyPackAnchor=null;enemyRetreat=null;defeatCinematic=null;nextWaveTimer=0;waveNumber=0;wasCombat=false;
  companyAnchors.clear();playerCompanies=[];companyLayoutDirty=true;selectedCompanyId=null;selectedCommander=null;commandHoverCell=null;
  campaign=makeCampaign();selectedRegion=2;deploymentReserve=PLAYER_DEPLOYMENT_RESERVE_START;deploymentBatch=1;deploymentArmed=false;deploymentStarted=false;
  commanderHearts=3;masterHealth=INDEPENDENT_SOLDIERS?32:PLAYER_COMMANDER.maxHealth;sinceDamage=99;damagePulse=0;damageStacks=0;shake=0;totalTime=0;rngState=0xC0FFEE;
  master.visible=false;master.userData.alive=false;master.userData.falling=false;master.userData.verticalVelocity=0;master.userData.velocity.set(0,0,0);master.position.set(0,GROUND_Y,0);resetDuel(master);target.copy(master.position);
  savedLevelCamera=levelCameraFrame(savedLevelState.camera,{minScale:EDITOR_ZOOM_MIN,maxScale:EDITOR_ZOOM_MAX});
  if(savedLevelCamera){
    gameplayCameraFocus.set(savedLevelCamera.x,0,savedLevelCamera.z);gameplayCameraScale=savedLevelCamera.scale;gameplayCameraBaselineScale=savedLevelCamera.scale;
  }
  for(const record of savedLevelState.assets)addLevelAsset(record);
  rebuildPlacedCharacterEncounter();battle.visible=true;overview.visible=false;overview.clear();
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
function commanderRoute(attacker,targetActor,actors){
  const pursuit=standOffPursuitPoint(attacker.position,targetActor.position,.94,.1);
  const goal={x:pursuit.x,z:pursuit.z};
  const obstacles=actors
    .filter(actor=>actor!==attacker&&actor!==targetActor&&actor?.userData.alive)
    .map(actor=>({x:actor.position.x,z:actor.position.z,radius:actor.userData.isMaster ? .42 : .28}));
  const detour=chooseLocalDetour({
    start:attacker.position,goal,obstacles,clearance:.58,lookAhead:2.65,preferLeft:(attacker.id&1)===0
  });
  const point=detour??goal;
  return new THREE.Vector3(point.x,GROUND_Y,point.z);
}
function resetDuel(unit){
  unit.userData.lockedTarget=null;unit.userData.duelRole=null;unit.userData.faceoffCenter=null;unit.userData.faceoffAxis=null;unit.userData.faceoffHold=null;unit.userData.lungeAxis=null;unit.userData.nextTargetReviewAt=null;
  unit.userData.lastTargetPosition=null;unit.userData.duelTurnId=null;unit.userData.waitingDuelTarget=null;
  unit.userData.duelPhase=DUEL_PHASE.APPROACH;unit.userData.duelTimer=0;unit.userData.pathPreviousDistance=Infinity;unit.userData.pathStallTimer=0;unit.userData.pathFailures=0;unit.userData.pathRouteRevision=0;unit.scale.set(1,1,1);
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
  const center=unit.position.clone().add(alternative.position).multiplyScalar(.5);center.y=GROUND_Y;
  lockDuel(unit,alternative,"primary",0,center);lockDuel(alternative,unit,"primary",0,center);
  const firstAttacker=((unit.id+alternative.id)&1)===0?unit:alternative;
  unit.userData.duelTurnId=firstAttacker.id;alternative.userData.duelTurnId=firstAttacker.id;
  return alternative;
}
function isAvoidingDuelTarget(unit,foe){
  if(unit.userData.avoidTargetUntil<=totalTime){unit.userData.avoidTarget=null;unit.userData.avoidTargetUntil=0;return false}
  return unit.userData.avoidTarget===foe;
}
function duelPathNeedsRelock(unit,desired,dt){
  if(unit.userData.duelPhase!==DUEL_PHASE.APPROACH||unit.position.distanceTo(desired)<=.18){
    unit.userData.pathPreviousDistance=Infinity;unit.userData.pathStallTimer=0;unit.userData.pathFailures=0;return false;
  }
  const state=advancePathFailure({
    previousDistance:unit.userData.pathPreviousDistance,distance:unit.position.distanceTo(desired),
    timer:unit.userData.pathStallTimer??0,failures:unit.userData.pathFailures??0,dt
  });
  unit.userData.pathPreviousDistance=state.previousDistance;unit.userData.pathStallTimer=state.timer;unit.userData.pathFailures=state.failures;
  const foe=unit.userData.lockedTarget;
  const action=duelPathFailureAction({
    relock:state.relock,mutualLock:foe?.userData.lockedTarget===unit,targetAlive:!!foe?.userData.alive,targetOnFloor:!!foe&&actorSupportHeight(foe)!==null
  });
  if(action==="reroute"){
    unit.userData.pathRouteRevision=(unit.userData.pathRouteRevision??0)+1;
    unit.userData.pathPreviousDistance=Infinity;unit.userData.pathStallTimer=0;unit.userData.pathFailures=0;
  }
  return action==="release";
}
function lockDuel(unit,foe,role="primary",supportIndex=0,sharedCenter=null){
  if(unit.userData.lockedTarget===foe&&unit.userData.duelRole===role)return;
  const center=sharedCenter?.clone()??foe.userData.faceoffCenter?.clone()??foe.position.clone();
  let axis=unit.position.clone().sub(center).setY(0);
  if(axis.lengthSq()<.001)axis.set((unit.id&1)?1:-1,0,0);axis.normalize();
  if(role==="support"){
    const turn=(supportIndex%2?1:-1)*(.72+Math.floor(supportIndex/2)*.34);
    axis.applyAxisAngle(new THREE.Vector3(0,1,0),turn);
  }
  unit.userData.lockedTarget=foe;unit.userData.waitingDuelTarget=null;unit.userData.duelRole=role;unit.userData.faceoffCenter=center;unit.userData.faceoffAxis=axis;
  unit.userData.lastTargetPosition=foe.position.clone();unit.userData.nextTargetReviewAt=totalTime+ENEMY_TARGET_REVIEW_INTERVAL;
  unit.userData.seekingTarget=false;
  unit.userData.faceoffHold=center.clone().addScaledVector(axis,role==="primary"?.68:1.38);
  unit.userData.duelPhase=DUEL_PHASE.APPROACH;unit.userData.duelTimer=0;
}
function assignEngagements(sideA,sideB){
  const a=sideA.filter(u=>u.userData.alive),b=sideB.filter(u=>u.userData.alive),aMap=new Map(),bMap=new Map();
  for(const unit of a){
    const foe=unit.userData.lockedTarget;
    const valid=canMaintainSoldierDuel({unitAlive:unit.userData.alive,targetAlive:foe?.userData.alive,mutualLock:foe?.userData.lockedTarget===unit});
    if(valid&&b.includes(foe)&&!aMap.has(unit)&&!bMap.has(foe)){aMap.set(unit,foe);bMap.set(foe,unit)}
  }
  while(a.some(u=>!aMap.has(u))&&b.some(u=>!bMap.has(u))){
    const pair=chooseNearestAvailablePair(
      a.filter(unit=>!aMap.has(unit)),
      b.filter(unit=>!bMap.has(unit)),
      (left,right)=>isAvoidingDuelTarget(left,right)||isAvoidingDuelTarget(right,left)
        ?Infinity
        :left.position.distanceToSquared(right.position)
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
        const meeting=duelMeetingPoint(pair.left.position,pair.right.position);
        const pairCenter=new THREE.Vector3(meeting.x,GROUND_Y,meeting.z);
        lockDuel(pair.left,pair.right,"primary",0,pairCenter);lockDuel(pair.right,pair.left,"primary",0,pairCenter);
        const firstAttacker=((pair.left.id+pair.right.id)&1)===0?pair.left:pair.right;
        pair.left.userData.duelTurnId=firstAttacker.id;pair.right.userData.duelTurnId=firstAttacker.id;
      }
    }
  }
  const duels=pairs.map(({left,right})=>{
    const center=left.userData.faceoffCenter?.clone()??left.position.clone().add(right.position).multiplyScalar(.5);
    const axis=left.userData.faceoffAxis?.clone()??right.position.clone().sub(left.position).setY(0);
    if(axis.lengthSq()<.001)axis.set(1,0,0);else axis.normalize();
    return {left,right,center,axis};
  });
  const waiters=[...a.filter(unit=>!aMap.has(unit)),...b.filter(unit=>!bMap.has(unit))];
  const waitingAssignments=allocateDuelWaitingSlots(
    waiters,
    duels,
    waiter=>duels.find(duel=>duel.left===waiter.userData.waitingDuelTarget||duel.right===waiter.userData.waitingDuelTarget),
    (waiter,duel)=>waiter.position.distanceToSquared(duel.center)
  );
  for(const unit of [...a,...b])unit.userData.waitingDuelTarget=null;
  const aWaitMap=new Map(),bWaitMap=new Map();
  for(const [waiter,duel] of waitingAssignments){
    waiter.userData.waitingDuelTarget=duel.left;
    (a.includes(waiter)?aWaitMap:bWaitMap).set(waiter,duel);
  }
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
function steerTowards(unit,desired,maxSpeed,acceleration,dt){
  const delta=desired.clone().sub(unit.position);delta.y=0;
  const distance=delta.length(), speed=arrivalSpeed(distance,maxSpeed),desiredVelocity=speed>0?delta.multiplyScalar(speed/distance):new THREE.Vector3();
  const velocity=unit.userData.velocity??=new THREE.Vector3(), change=desiredVelocity.sub(velocity), maxChange=acceleration*dt;
  if(change.length()>maxChange)change.setLength(maxChange);
  velocity.add(change);unit.position.addScaledVector(velocity,dt);
  if(velocity.lengthSq()>.03)unit.rotation.y=smoothAngle(unit.rotation.y,Math.atan2(velocity.x,velocity.z),10,dt);
}
function leashTarget(desired,leader,maxDistance){
  const point=limitPointToRadius(desired,leader.position,maxDistance);
  desired.x=point.x;desired.z=point.z;return desired;
}
function resolveCharacterCollisions(){
  const units=[master,...followers,...enemyUnits].filter(u=>u.visible&&u.userData.alive!==false);
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
  attacker.userData.attackAnim=1;
  dealDamage(attacker,victim);
}
function updateDuel(unit,foe,dt){
  const data=unit.userData;
  data.duelPhase??=DUEL_PHASE.APPROACH;data.duelTimer??=0;data.attackSequence??=0;
  const previousPhase=data.duelPhase;
  if(foe.userData.isMaster&&data.lastTargetPosition){
    const shift=foe.position.clone().sub(data.lastTargetPosition);shift.y=0;
    data.faceoffCenter?.add(shift);data.faceoffHold?.add(shift);data.lastTargetPosition.copy(foe.position);
  }
  const hold=data.faceoffHold??foe.position;
  const distance=unit.position.distanceTo(hold);
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
    ?advanceDuelState({phase:data.duelPhase,timer:data.duelTimer,distance,strikeDistance,strikeRange,dt})
    :{phase:DUEL_PHASE.APPROACH,timer:0,strike:false};
  data.duelPhase=next.phase;data.duelTimer=next.timer;
  const away=data.faceoffAxis??unit.position.clone().sub(foe.position).setY(0).normalize();
  const currentLungeAxis=unit.position.clone().sub(foe.position).setY(0);
  if(currentLungeAxis.lengthSq()<.001)currentLungeAxis.copy(away);else currentLungeAxis.normalize();
  const committedLungeAxis=duelLungeDirection({
    phase:next.phase,
    previousPhase,
    committedDirection:data.lungeAxis?{x:data.lungeAxis.x,z:data.lungeAxis.z}:null,
    currentDirection:{x:currentLungeAxis.x,z:currentLungeAxis.z}
  });
  data.lungeAxis=committedLungeAxis?new THREE.Vector3(committedLungeAxis.x,0,committedLungeAxis.z):null;
  let desired=hold.clone(),speed=2.15,acceleration=5.4;
  if(next.phase===DUEL_PHASE.APPROACH){
    desired=hold.clone();speed=2.1;acceleration=5.2;
  }else if(next.phase===DUEL_PHASE.LUNGE){
    const lungeStandOff=foe.userData.isMaster?.88:.72;
    const lungeAxis=data.lungeAxis??away;
    desired=foe.position.clone().addScaledVector(lungeAxis,lungeStandOff);speed=2.82;acceleration=10.8;
  }else{
    desired=hold.clone().addScaledVector(away,.32);speed=2.75;acceleration=8.2;
  }
  if(next.strike&&foe.userData.alive){
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
  }
  const facing=foe.position.clone().sub(unit.position);if(facing.lengthSq()>.001)unit.rotation.y=smoothAngle(unit.rotation.y,Math.atan2(facing.x,facing.z),14,dt);
  return {desired,speed,acceleration};
}
function routeLockedDesired(unit,desired,foe){
  const obstacles=[master,...followers,...enemyUnits]
    .filter(actor=>actor!==unit&&actor!==foe&&actor.visible&&actor.userData.alive!==false)
    .map(actor=>({x:actor.position.x,z:actor.position.z,radius:Math.max(actor.userData.collisionHalf?.x??.2,actor.userData.collisionHalf?.z??.2)}));
  const detour=chooseLocalDetour({
    start:unit.position,goal:desired,obstacles,clearance:.58,lookAhead:2.45,preferLeft:((unit.id+(unit.userData.pathRouteRevision??0))&1)===0
  });
  return detour?new THREE.Vector3(detour.x,desired.y,detour.z):desired;
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
  const actors=[master,...followers,...enemyUnits].filter(unit=>unit?.userData?.alive);
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
  defeatCinematic={elapsed:0,outcome:"wave-defeat",hasNextWave:false};
  showToast("RIVAL WAVE DEFEATED",1800);updateStats();
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
function resolveBattle(){
  if(mode==="end")return;
  if(deploymentStarted&&deploymentReserve===0&&isPlayerWaveDefeated(livingPlayerUnits().length)){beginEnemyRetreat();return}
  if(!activeEncounter||activeEncounter.done)return;
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
function updateIndependentSoldier(u,{combat,foe,waitingDuel,dt}){
  if(!u?.userData?.alive)return;
  const combatState=soldierCombatState({combat,formingBattleLine:false,targetAlive:!!foe?.userData?.alive,waitingSlot:!!waitingDuel});
  u.userData.mode=foe?.userData?.alive?SERVANT_MODE.ATTACK:SERVANT_MODE.FOLLOW;
  let desired=u.position.clone(),duelMotion=null;
  if(foe?.userData?.alive){
    duelMotion=updateDuel(u,foe,dt);
    if(!u.userData.alive)return;
    if(duelPathNeedsRelock(u,duelMotion.desired,dt)){
      avoidBlockedDuelAndReassign(u);foe=null;duelMotion=null;
    }else{
      desired=u.userData.duelPhase===DUEL_PHASE.APPROACH?routeLockedDesired(u,duelMotion.desired,foe):duelMotion.desired;
    }
  }else if(waitingDuel){
    desired=duelWaitingPoint(u,waitingDuel);
  }else if(u.userData.manualMoving&&u.userData.manualTarget){
    desired=u.userData.manualTarget.clone();
  }
  if(combatState===SOLDIER_COMBAT_STATE.NEUTRAL&&!foe&&!waitingDuel)desired=u.position.clone();
  const arrived=!foe&&u.position.distanceTo(desired)<.1;
  const speed=foe?duelMotion?.speed??2.45:waitingDuel?1.7:u.userData.manualMoving&&!arrived?2.65:0;
  const acceleration=duelMotion?.acceleration??(foe?5.7:5.1);
  steerTowards(u,desired,speed,acceleration,dt);
  if(u.userData.manualMoving&&!foe&&!waitingDuel&&u.position.distanceTo(desired)<.1){
    u.userData.manualMoving=false;u.userData.manualTarget=null;u.userData.velocity.set(0,0,0);
  }
  const faceTarget=foe?.position??(waitingDuel?.center??(speed>0?desired:null));
  if(faceTarget){const facing=faceTarget.clone().sub(u.position);if(facing.lengthSq()>.001)u.rotation.y=smoothAngle(u.rotation.y,Math.atan2(facing.x,facing.z),12,dt)}
}
function updateBattle(dt){
  if(defeatCinematic){updateDefeatCinematic(dt);return}
  if(WAVES_ENABLED&&nextWaveTimer>0){nextWaveTimer-=dt;if(nextWaveTimer<=0)spawnWave()}
  const masterDirectOrder=!!master.userData.manualMoving,masterManualOrder=INDEPENDENT_SOLDIERS?masterDirectOrder:masterDirectOrder||ensureCompanyAnchor(0).moving;
  if(!INDEPENDENT_SOLDIERS&&masterManualOrder)steerTowards(master,target,2.15,5.2,dt);
  if(!INDEPENDENT_SOLDIERS&&masterDirectOrder&&master.position.distanceTo(target)<.08){
    master.userData.velocity.set(0,0,0);target.copy(master.position);
    master.userData.manualMoving=false;master.userData.manualTarget=null;
  }
  const livingRivals=enemyUnits.filter(u=>u.userData.isMaster&&u.userData.alive);
  const rival=nearestAlive(master,livingRivals);
  let approachDistanceSquared=Infinity;
  for(const playerActor of [master,...followers])if(playerActor.userData.alive)for(const enemyActor of enemyUnits)if(enemyActor.userData.alive){
    approachDistanceSquared=Math.min(approachDistanceSquared,playerActor.position.distanceToSquared(enemyActor.position));
  }
  const approachDistance=Math.sqrt(approachDistanceSquared);
  if(activeEncounter)activeEncounter.cameraApproachDistance=approachDistance;
  const approachState=battleApproachState({distance:approachDistance,detectionRadius:32,aggroRadius:17});
  if(activeEncounter&&!activeEncounter.done&&!activeEncounter.aggro&&approachState==="combat")activeEncounter.aggro=true;
  const threatDetected=!!activeEncounter&&!activeEncounter.done&&approachState!=="travel";
  updateEncounterRings();
  if(activeEncounter)activeEncounter.formationSpread=advanceFormationSpread(activeEncounter.formationSpread??1,{threatDetected,dt});
  const formationSpread=activeEncounter?.formationSpread??1;
  const expansionProgress=THREE.MathUtils.clamp((formationSpread-1)/(THREAT_FORMATION_SCALE-1),0,1);
  const combat=activeEncounter?.aggro&&enemyUnits.some(u=>u.userData.alive)&&threatDetected;
  const preparingForContact=!!activeEncounter&&!activeEncounter.done&&!combat&&approachState==="deploy";
  if(!combat&&wasCombat)settleCompanyAnchors();
  wasCombat=combat;
  const forward=master.userData.velocity.lengthSq()>.03?master.userData.velocity.clone().normalize():new THREE.Vector3(0,0,-1);
  const livingEnemies=enemyUnits.filter(u=>u.userData.alive);
  const livingEnemySoldiers=livingEnemies.filter(u=>!u.userData.isMaster);
  updateEnemyPackAnchor(livingEnemySoldiers,{combat,preparingForContact,dt});
  const masterRetreating=false;
  const livingFollowers=followers.filter(u=>u.userData.alive);
  const livingPlayerCommanders=INDEPENDENT_SOLDIERS?[]:[master,...livingFollowers.filter(u=>u.userData.unitCommander)].filter(u=>u.userData.alive);
  const livingPlayerSoldiers=INDEPENDENT_SOLDIERS?[master,...livingFollowers].filter(u=>u.userData.alive):livingFollowers.filter(u=>!u.userData.unitCommander);
  const companies=INDEPENDENT_SOLDIERS?[]:ensureCompanyLayout(),companyCount=Math.max(1,companies.length);
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
  clearInvalidDuels([master,...followers,...enemyUnits]);
  if(shouldReleaseCombatCommitment(combat,livingEnemies.length))releasePlayerCombatCommitment();
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
      if(duelPathNeedsRelock(u,duelMotion.desired,dt)){
        avoidBlockedDuelAndReassign(u);foe=null;duelMotion=null;
      }else{
        desired=u.userData.duelPhase===DUEL_PHASE.APPROACH?routeLockedDesired(u,duelMotion.desired,foe):duelMotion.desired;
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
    const acceleration=duelMotion?.acceleration??(combatState===SOLDIER_COMBAT_STATE.NEUTRAL?8.2:u.userData.mode===SERVANT_MODE.ATTACK?5.7:reposition?7.2:4.2);
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
    for(const u of livingPlayerSoldiers){
      const foe=playerAssignments.get(u)??(u.userData.lockedTarget?.userData.alive?u.userData.lockedTarget:null);
      const waitingDuel=playerWaitingAssignments.get(u);
      updateIndependentSoldier(u,{combat,foe,waitingDuel,dt});
    }
  }
  enemyUnits.forEach((u,i)=>{
    if(!u.userData.alive)return;
    if(enemyRetreat){updateEnemyRetreatUnit(u,dt);return}
    if(!deploymentStarted){u.userData.velocity.set(0,0,0);return}
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
      if(duelPathNeedsRelock(u,duelMotion.desired,dt)){
        avoidBlockedDuelAndReassign(u);foe=null;duelMotion=null;
      }else{
        desired=u.userData.duelPhase===DUEL_PHASE.APPROACH?routeLockedDesired(u,duelMotion.desired,foe):duelMotion.desired;
      }
    }
    else if(u.userData.lockedTarget)resetDuel(u);
    if(combatState===SOLDIER_COMBAT_STATE.NEUTRAL)desired.copy(u.position);
    const spacingProfile=soldierSpacingProfile(!!duelMotion,livingEnemySoldiers.length);
    const spacing=combatState===SOLDIER_COMBAT_STATE.FORMATION
      ?separationVector(u.position,enemyUnits.filter(v=>v!==u&&v.userData.alive),spacingProfile.distance)
      :{x:0,z:0};
    desired.x+=spacing.x*spacingProfile.strength;desired.z+=spacing.z*spacingProfile.strength;
    // Enemy soldiers are independent too: they travel toward the nearest
    // opposing soldier, never toward a shared formation anchor.
    const catchup=Math.min(1.2,Math.max(0,distanceToPack-2.1)*.6);
    const speed=combatState===SOLDIER_COMBAT_STATE.NEUTRAL?0:combatState===SOLDIER_COMBAT_STATE.WAITING?1.7:duelMotion?.speed??(u.userData.mode===SERVANT_MODE.ATTACK?1.8:2.15+catchup);
    const acceleration=duelMotion?.acceleration??(combatState===SOLDIER_COMBAT_STATE.NEUTRAL?8.2:u.userData.mode===SERVANT_MODE.ATTACK?4.4:6.2);
    steerTowards(u,desired,speed,acceleration,dt);
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
  updateActorTerrainSupport(dt);resolveCharacterCollisions();resolveDebrisCollisions();
  if(!INDEPENDENT_SOLDIERS){
    sinceDamage+=dt;
    masterHealth=commanderRegenHealth(masterHealth,PLAYER_COMMANDER.maxHealth,sinceDamage,dt,PLAYER_COMMANDER.regenDelay,PLAYER_COMMANDER.regenPerSecond);
    master.userData.hp=masterHealth;master.userData.sinceDamage=sinceDamage;
    updateMasterDamageEffect(dt);
  }
  updatePlayerSoldierRegeneration(dt);
  updateSoldierDamageEffects(dt);updateActorCombatAnimations(dt);updateActorHealthWidgets(dt);decayDebugSignals(dt);
  resolveBattle();updateParticles(dt);updateSelectionVisuals();
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
function editorObjectAt(clientX,clientY){
  setPointerFromClient(clientX,clientY);
  for(const hit of raycaster.intersectObjects(editorObjects,true)){
    const object=editorObjectFromHit(hit.object);
    if(object)return object;
  }
  return null;
}
function disposeEditorSelectionHelper(){
  for(const helper of editorSelectionHelpers){scene.remove(helper);helper.geometry?.dispose();helper.material?.dispose();}
  editorSelectionHelpers=[];editorSelectionHelper=null;
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
    // A Sprite is a true camera-facing billboard. It uses the supplied camera
    // icon and does not alter the real gameplay camera or its angle.
    const billboard=new THREE.Sprite(new THREE.SpriteMaterial({map:editorCameraPlaceholderTexture,color:0xffffff,transparent:true,alphaTest:.02,depthWrite:false}));
    billboard.name="Camera Placeholder";billboard.scale.set(1.1,1.1,1);billboard.position.y=.55;
    cameraMarker.add(billboard);battle.add(cameraMarker);editorObjects.push(cameraMarker);editorCameraObject=cameraMarker;
  }
  editorCameraObject.position.set(editorCameraFocus.x,GROUND_Y,editorCameraFocus.z);editorCameraObject.visible=mode==="editor";
  return editorCameraObject;
}
function syncEditorCameraFocusFromObject(object=editorCameraObject){if(object?.userData?.editorCamera)editorCameraFocus.set(object.position.x,0,object.position.z);}
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
  move("world-look-panel","editor-environment-slot");move("editor-delete-confirm","editor-confirm-slot");move("editor-status","editor-status-slot");
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
function updateEditorInspector(){
  const count=editorSelectedObjects.size,hasSelection=Boolean(editorSelection),foliageSelected=editorSelection&&["grass-cluster","tree-cluster","tree-billboard"].includes(editorSelection.userData.editorAssetType),cameraSelected=Boolean(editorSelection?.userData?.editorCamera),environmentActive=editorEnvironmentOpen;
  $("editor-inspector-title").textContent=environmentActive?"ENVIRONMENT":count>1?`${count} OBJECTS`:editorSelection?.name?.toUpperCase()||"NOTHING SELECTED";
  $("editor-status-selection").textContent=count>1?`${count} SELECTED`:editorSelection?.name?.toUpperCase()||"NO SELECTION";
  const position=editorSelection?.position;$("editor-status-coordinates").textContent=position?`X ${position.x.toFixed(1)} | Y ${position.y.toFixed(1)} | Z ${position.z.toFixed(1)}`:"X 0 | Y 0 | Z 0";
  $("editor-status-tool").textContent=`${(editorTransformMode??"select").toUpperCase()} | CAMERA ISO`;
  $("editor-transform-panel").classList.toggle("hidden",!hasSelection||environmentActive);$("inspector-transform-section").classList.toggle("hidden",!hasSelection||environmentActive);if(hasSelection&&!environmentActive)$("inspector-transform-section").open=true;
  $("inspector-camera-section").classList.toggle("hidden",!cameraSelected||environmentActive);if(cameraSelected&&!environmentActive)$("inspector-camera-section").open=true;
  $("inspector-foliage-section").classList.toggle("hidden",!foliageSelected||environmentActive);if(foliageSelected&&!environmentActive)$("inspector-foliage-section").open=true;
  $("inspector-environment-section").classList.toggle("hidden",!environmentActive);if(environmentActive)$("inspector-environment-section").open=true;
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
  if(type==="primitive-cube")return "CUBE";
  if(type==="tree-cluster")return "TREE CLUSTER";
  if(type==="tree-billboard")return "TREE";
  if(type==="grass-cluster")return "GRASS";
  if(type==="rock-pillar")return "ROCK";
  if(type==="archer-tower")return "TOWER";
  if(type==="forest-fence")return "FENCE";
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
  syncEditorCameraFocusFromObject(editorSelection);
  editorSelectionHelper?.update();updateEditorTransformGizmo();updateEditorTransformInspector();updateEditorInspector();renderWorldOutliner();
  $("editor-status").textContent=`${editorSelection.name||"Asset"} transform updated. Press Done to save the level.`;
}
function duplicateEditorSelection(){
  const sources=[...editorSelectedObjects].filter(object=>editorObjects.includes(object)&&!object.userData.editorProtected);if(!sources.length)return;
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
    const helper=new THREE.BoxHelper(object,0xf7fff1);helper.material.transparent=true;helper.material.opacity=(object===editorSelection)?.95:.62;helper.material.depthTest=false;helper.renderOrder=50;scene.add(helper);editorSelectionHelpers.push(helper);
    if(object===editorSelection)editorSelectionHelper=helper;
  }
  const protectedOnly=editorSelection&&[...editorSelectedObjects].every(object=>object.userData.editorProtected);
  for(const id of ["editor-duplicate","editor-delete"])$(id).disabled=!editorSelection||protectedOnly;
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
  if(removedActor)rebuildPlacedCharacterEncounter();
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
  $("editor-delete-title").textContent="DELETE?";
  $("editor-delete-copy").textContent=objects.length===1?`Remove ${object.name||"this asset"} from the level?`:`Remove ${objects.length} selected assets from the level?`;
  $("editor-delete-confirm").classList.remove("hidden");requestAnimationFrame(positionEditorDeleteConfirm);
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
function openAssetLibraryDeleteConfirm(){
  const assetIds=[...contentBrowserSelection];
  if(!assetIds.length&&!editorLibrarySelection)return;
  const selected=assetIds.length?assetIds:[editorLibrarySelection];
  pendingEditorDelete={kind:"library",assetIds:selected,label:selected.length===1?contentBrowserAssetById(selected[0])?.name||editorLibrarySelectionLabel:`${selected.length} assets`};
  $("editor-delete-title").textContent="DELETE?";
  $("editor-delete-copy").textContent=`Remove ${pendingEditorDelete.label||"this asset"} from the Content Browser? This will not delete its source definition.`;
  $("editor-delete-confirm").classList.remove("hidden");requestAnimationFrame(positionEditorDeleteConfirm);
}
function confirmEditorDelete(){
  const pending=pendingEditorDelete;closeEditorDeleteConfirm();
  if(pending?.kind==="level"&&pending.objects?.some(object=>editorObjects.includes(object))){recordEditorUndo();setEditorSelection(pending.objects,pending.objects.at(-1),pending.objects.at(-1));deleteEditorSelection();}
  if(pending?.kind==="library"){
    recordEditorUndo();for(const assetId of pending.assetIds??[])hiddenEditorAssets.add(assetId);editorPendingAsset=null;editorLibrarySelection=null;editorLibrarySelectionLabel="";contentBrowserSelection.clear();
    renderEditorAssets();updateEditorAssetSelection();$("editor-status").textContent="Asset removed from the Content Browser. Undo is available until you leave the editor.";
  }
  if(pending?.kind==="content-folder"){
    const folder=contentBrowserFolderById(pending.folderId);if(!contentBrowserCanChangeFolder(folder))return;
    recordEditorUndo();const descendants=contentBrowserDescendants(folder.id),parentId=folder.parentId||CONTENT_BROWSER_ROOT_ID;
    for(const asset of contentBrowserAssetSpecs())if(descendants.has(asset.folderId))contentBrowserState.assetFolders[asset.id]=parentId;
    contentBrowserState.folders.splice(0,contentBrowserState.folders.length,...contentBrowserState.folders.filter(item=>!descendants.has(item.id)));
    if(descendants.has(contentBrowserFolderId))contentBrowserFolderId=parentId;contentBrowserSelection.clear();persistContentBrowserState();renderContentBrowser();$("editor-status").textContent=`${pending.label} deleted. Its assets were kept and moved to ${contentBrowserFolderById(parentId)?.name||"Content"}.`;
  }
}
function updateEditorAssetSelection(){
  document.querySelectorAll(".editor-asset-card").forEach(card=>{
    const selected=foliagePaintActive?editorFoliagePaintSelection.has(card.dataset.asset):contentBrowserSelection.has(card.dataset.asset);card.classList.toggle("selected",selected);card.classList.toggle("paint-selected",foliagePaintActive&&selected);card.setAttribute("aria-pressed",String(selected));
  });
  const deleteButton=$("asset-library-delete"),canDelete=!foliagePaintActive&&Boolean(contentBrowserSelection.size||editorLibrarySelection);
  if(deleteButton){deleteButton.classList.toggle("hidden",!canDelete);deleteButton.disabled=!canDelete;}
  $("editor-asset-list").dataset.multiselect=String(foliagePaintActive);
  document.querySelectorAll(".foliage-paint-choice").forEach(choice=>{
    const selected=editorFoliagePaintSelection.has(choice.dataset.asset);choice.classList.toggle("selected",selected);choice.setAttribute("aria-pressed",String(selected));
  });
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
  if(assetId==="primitive-cube"){const cube=addPrimitiveCube({x:point.x,z:point.z});if(select)selectEditorObject(cube);return cube}
  if(assetId==="character:ch"){const actor=addEditorCharacter({faction:"player",x:point.x,z:point.z});if(select)selectEditorObject(actor);return actor}
  if(assetId==="character:en"){const actor=addEditorCharacter({faction:"enemy",x:point.x,z:point.z});if(select)selectEditorObject(actor);return actor}
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
function characterAssetPreview(faction){
  const preview=document.createElement("span"),body=document.createElement("i");preview.className=`character-asset-preview ${faction}`;body.setAttribute("aria-hidden","true");preview.append(body);return preview;
}
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
    {id:"character:en",name:"Enemy soldier",type:"Actor",folderId:"characters/en",preview:()=>characterAssetPreview("enemy")},
    {id:"character:ch",name:"CH soldier",type:"Actor",folderId:"characters/ch",preview:()=>characterAssetPreview("player")},
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
  const legacyGrassRoute=contentBrowserLegacyGrassRoute(folderId);contentBrowserFolderId=legacyGrassRoute?.folderId||aliases[folderId]||folderId||CONTENT_BROWSER_ROOT_ID;ensureContentBrowserFolder();editorAssetFolder=contentBrowserFolderId;editorPendingAsset=null;contentBrowserSelection.clear();contentBrowserSelectionAnchor=null;editorLibrarySelection=null;editorLibrarySelectionLabel="";renderContentBrowser();updateEditorAssetSelection();
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
  const selected=[...contentBrowserSelection];editorLibrarySelection=selected.at(-1)||null;editorLibrarySelectionLabel=contentBrowserAssetById(editorLibrarySelection)?.name||"";editorPendingAsset=null;updateEditorAssetSelection();
}
function makeContentBrowserAssetCard(asset){
  const card=document.createElement("div"),label=document.createElement("strong"),target={kind:"asset",asset};card.className="editor-asset-card content-browser-asset-card";card.dataset.asset=asset.id;card.draggable=true;card.tabIndex=0;card.setAttribute("role","button");card.setAttribute("aria-pressed",String(contentBrowserSelection.has(asset.id)));card.setAttribute("aria-label",`${asset.name}, ${asset.type}`);label.textContent=asset.name;card.append(asset.preview(),label);
  card.addEventListener("pointerdown",event=>{if(event.button===0&&contentBrowserRenameZone(card,event)){event.preventDefault();event.stopPropagation();beginContentBrowserInlineRename(target,card,label);}});
  card.addEventListener("click",event=>{if(card.classList.contains("content-browser-renaming")||contentBrowserRenameZone(card,event))return;selectContentBrowserAsset(asset.id,event)});card.addEventListener("dblclick",event=>{if(card.classList.contains("content-browser-renaming")||contentBrowserRenameZone(card,event))return;selectContentBrowserAsset(asset.id,{});armEditorAsset(asset.id,asset.name)});card.addEventListener("keydown",event=>{if(event.code==="Enter"||event.code==="Space"){event.preventDefault();selectContentBrowserAsset(asset.id,event)}});card.addEventListener("contextmenu",event=>{selectContentBrowserAsset(asset.id,event);showContentBrowserContextMenu(event,target)});
  card.addEventListener("dragstart",event=>{if(!contentBrowserSelection.has(asset.id))selectContentBrowserAsset(asset.id,{});const selected=[...contentBrowserSelection];event.dataTransfer.effectAllowed="copyMove";event.dataTransfer.setData("application/x-crownwake-content-assets",JSON.stringify(selected));event.dataTransfer.setData("application/x-crownwake-asset",asset.id);event.dataTransfer.setData("text/plain",asset.id);});return card;
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
  list.onclick=event=>{if(event.target!==list)return;contentBrowserSelection.clear();editorLibrarySelection=null;editorLibrarySelectionLabel="";editorPendingAsset=null;updateEditorAssetSelection();};
  list.oncontextmenu=event=>{if(event.target===list)showContentBrowserContextMenu(event,{kind:"blank",folder});};
}
function contentBrowserCreateFolder(parentId=contentBrowserFolderId){
  const parent=contentBrowserFolderById(parentId);if(!parent)return;const name=prompt(`New folder in ${parent.name}:`,`New Folder`)?.trim();if(!name)return;
  const id=`folder-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,7)}`;recordEditorUndo();contentBrowserState.folders.push({id,name,parentId});contentBrowserExpanded.add(parentId);persistContentBrowserState();renderContentBrowser();$("editor-status").textContent=`Created ${name}.`;
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
  if(!contentBrowserCanChangeFolder(folder))return;pendingEditorDelete={kind:"content-folder",folderId:folder.id,label:folder.name};$("editor-delete-title").textContent="DELETE FOLDER?";$("editor-delete-copy").textContent=`Delete ${folder.name}? Its assets will move to ${contentBrowserFolderById(folder.parentId)?.name||"Content"}.`;$("editor-delete-confirm").classList.remove("hidden");requestAnimationFrame(positionEditorDeleteConfirm);
}
function contentBrowserMoveAsset(assetId,folderId){recordEditorUndo();contentBrowserState.assetFolders[assetId]=folderId;persistContentBrowserState();renderContentBrowser();}
function showContentBrowserContextMenu(event,target){
  event.preventDefault();event.stopPropagation();const menu=$("content-browser-context-menu");menu.replaceChildren();contentBrowserContextTarget=target;
  const add=(label,handler,{danger=false}={})=>{const button=document.createElement("button");button.type="button";button.textContent=label;if(danger)button.classList.add("danger");button.onclick=()=>{hideContentBrowserContextMenu();handler();};menu.append(button);};
  if(target.kind==="blank")add("New Folder",()=>contentBrowserCreateFolder(target.folder.id));
  if(target.kind==="folder"){
    add("Open",()=>openEditorAssetFolder(target.folder.id));add("New Folder",()=>contentBrowserCreateFolder(target.folder.id));
    add("Rename",()=>contentBrowserRename(target));if(contentBrowserCanChangeFolder(target.folder))add("Delete",()=>contentBrowserDeleteFolder(target.folder),{danger:true});
  }
  if(target.kind==="asset"){
    add("Place in Level",()=>armEditorAsset(target.asset.id,target.asset.name));add("Rename",()=>contentBrowserRename(target));
    const mover=document.createElement("select");mover.className="content-browser-move-select";for(const folder of contentBrowserFolders()){const option=document.createElement("option");option.value=folder.id;option.textContent=contentBrowserFolderPath(folder.id).map(entry=>entry.name).join(" › ");option.selected=folder.id===target.asset.folderId;mover.append(option)}menu.append(mover);add("Move Here",()=>contentBrowserMoveAsset(target.asset.id,mover.value));add("Remove from Browser",()=>{contentBrowserSelection.clear();contentBrowserSelection.add(target.asset.id);openAssetLibraryDeleteConfirm();},{danger:true});
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
  editorCameraScale=THREE.MathUtils.clamp(Math.round((editorCameraScale+delta)*100)/100,EDITOR_ZOOM_MIN,EDITOR_ZOOM_MAX);
  updateEditorZoomControls();updateEditorTransformGizmo();
}
initializeEditorShell();applyEditorLayout();
function openLevelEditor(){
  if(mode!=="settings")return;
  editorReturnMode=settingsReturnMode;$("settings-panel").classList.add("hidden");$("pause-state").classList.add("hidden");
  clearTacticalSelection();mode="editor";editorCameraFocus.copy(gameplayCameraFocus.lengthSq()>.001?gameplayCameraFocus:playerFocus().position);editorCameraFocus.y=0;
  editorCameraScale=THREE.MathUtils.clamp(Math.max(1,gameplayCameraScale),EDITOR_ZOOM_MIN,EDITOR_ZOOM_MAX);document.body.classList.add("editor-active");$("editor-shell").classList.remove("hidden");
  editorUndoHistory=[];updateEditorUndoControl();updateEditorZoomControls();updateEditorTransformControls();updateEditorScaleLock();syncFoliagePaintControls();buildEditorTransformGizmo();
  $("editor-toolbar").classList.remove("hidden");toggleEditorEnvironmentPopover(false);$("editor-transform-panel").classList.add("hidden");$("world-outliner").classList.remove("hidden");$("editor-status").classList.remove("hidden");ensureEditorCameraObject();syncWorldLookControls();applyWorldLook();renderEditorAssets();renderWorldOutliner();updateEditorTransformInspector();setEditorContext("select");setAssetPanel(true);updateFoliagePanel();applyEditorLayout();sounds.music.pause();
}
function closeLevelEditor(){
  if(mode!=="editor")return;
  if(foliagePaintActive)setFoliagePaintActive(false);
  if(editorPointerState&&canvas.hasPointerCapture?.(editorPointerState.pointerId))canvas.releasePointerCapture(editorPointerState.pointerId);
  editorPointerState=null;editorCameraTravel=null;editorKeys.clear();editorPendingAsset=null;editorAssetFolder=null;updateEditorAssetSelection();closeEditorDeleteConfirm();selectEditorObject(null);removeEditorCameraObject();setAssetPanel(false);
  $("editor-shell").classList.add("hidden");$("editor-toolbar").classList.add("hidden");toggleEditorEnvironmentPopover(false);$("editor-transform-panel").classList.add("hidden");$("foliage-panel").classList.add("hidden");$("foliage-paint-panel").classList.add("hidden");$("foliage-presets-panel").classList.add("hidden");$("world-outliner").classList.add("hidden");$("editor-status").classList.add("hidden");document.body.classList.remove("editor-active","editor-dragging","foliage-paint-active");
  mode=editorReturnMode;
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
  if(object&&point){
    selectEditorObjectFromEvent(object,event);
    const floorSelected=object.userData.editorAssetType==="world-floor";
    if(editorTransformMode===null&&!modifyingSelection&&!floorSelected)recordEditorUndo();
    editorPointerState=editorTransformMode===null&&!modifyingSelection?(floorSelected?{type:"camera",pointerId:event.pointerId,lastX:event.clientX,lastY:event.clientY}:{type:"object",pointerId:event.pointerId,offset:point.clone().sub(object.position)}):null;
  }
  else{selectEditorObject(null);editorPointerState={type:"camera",pointerId:event.pointerId,lastX:event.clientX,lastY:event.clientY};}
  if(editorPointerState){canvas.setPointerCapture?.(event.pointerId);document.body.classList.add("editor-dragging");}
}
function editorPointerMove(event){
  if(mode!=="editor")return;
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
    for(const transform of state.selectedTransforms)syncEditorCameraFocusFromObject(transform.object);
    for(const helper of editorSelectionHelpers)helper.update();updateEditorTransformGizmo();updateEditorTransformInspector();return;
  }
  if(editorPointerState.type==="object"&&editorSelection){
    const point=editorGroundPoint(event.clientX,event.clientY);if(point){editorSelection.position.x=point.x-editorPointerState.offset.x;editorSelection.position.z=point.z-editorPointerState.offset.z;syncEditorCameraFocusFromObject(editorSelection);editorSelectionHelper?.update();updateEditorTransformGizmo();updateEditorTransformInspector();}
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
  const transformed=editorPointerState.type==="transform";canvas.releasePointerCapture?.(event.pointerId);editorPointerState=null;document.body.classList.remove("editor-dragging");
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
  if(deploymentArmed){
    if(floorHit)deploySoldier(p);
    else{commandHoverCell=null;refreshCommandGrid();showToast("CHOOSE THE ISLAND",900)}
    return;
  }
  ensureCompanyLayout();
  const actorHit=raycaster.intersectObjects([master,...followers.filter(unit=>unit.userData.alive&&unit.visible)],true)
    .map(hit=>{let object=hit.object;while(object&&object!==battle&&!object.userData?.isMaster&&!Number.isInteger(object.userData?.companyId))object=object.parent;return object&&object!==battle?object:null})
    .find(Boolean);
  if(actorHit){
    if(debugMode&&e.altKey){
      debugFocusId=actorHit.id;
      renderDebugMonitor();
      return;
    }
    // Every player piece is independently commandable; there is no company
    // selection or formation order in the soldier-only ruleset.
    selectCommander(actorHit);
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
  if(!tacticalInputEnabled(mode)||(!deploymentArmed&&selectedCompanyId===null&&!selectedCommander))return;
  const rect=canvas.getBoundingClientRect();pointer.x=((e.clientX-rect.left)/rect.width)*2-1;pointer.y=-((e.clientY-rect.top)/rect.height)*2+1;raycaster.setFromCamera(pointer,camera);
  const p=new THREE.Vector3();
  if(gameplayFloorPoint(p)){
    const cell=snapTacticalCell(p,COMMAND_CELL,COMMAND_GRID_OFFSET);
    if(!commandHoverCell||cell.x!==commandHoverCell.x||cell.z!==commandHoverCell.z){commandHoverCell=cell;refreshCommandGrid()}
  }else if(commandHoverCell){commandHoverCell=null;refreshCommandGrid()}
}
canvas.addEventListener("pointerdown",pointerWorld);
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
    deploymentArmed=false;clearTacticalSelection();refreshCommandGrid();updateDeploymentControl();mode="paused";$("pause").textContent=STR.resumeGame;$("pause").setAttribute("aria-label",STR.resumeGame);
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
function renderSettings(){
  $("speed").value=String(GAME_SPEED_STEPS.indexOf(gameSpeed));$("speed-value").textContent=`${gameSpeed}Ã—`;
  setAudio(audioOn);
  $("hud-toggle").textContent=hudCompact?"SHOW HUD":"HIDE HUD";
}
function openSettings(){
  if(!["playing","paused"].includes(mode))return;
  settingsReturnMode=mode;mode="settings";resetPlaytestToSavedLevel();deploymentArmed=false;clearTacticalSelection();refreshCommandGrid();updateDeploymentControl();renderSettings();$("settings-panel").classList.remove("hidden");
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
  if(e.code==="Escape"){if(mode==="editor")closeLevelEditor();else if(mode==="settings")closeSettings();else if(mode==="paused")togglePause(false);else if(deploymentArmed){deploymentArmed=false;commandHoverCell=null;refreshCommandGrid();updateDeploymentControl();}else if(selectedCompanyId!==null||selectedCommander)clearTacticalSelection();else if(mode==="companies")closeCompanies()}
});
addEventListener("keyup",e=>editorKeys.delete(e.code));addEventListener("blur",()=>editorKeys.clear());
addEventListener("keydown",e=>{if(debugMode&&e.code==="KeyI"){e.preventDefault();toggleDebugMonitor()}});
$("return").onclick=closeMap;
$("companies").onclick=toggleDeploymentMode;$("companies-close").onclick=closeCompanies;
for(const option of document.querySelectorAll("[data-deployment-batch]"))option.onclick=()=>selectDeploymentBatch(Number(option.dataset.deploymentBatch));
$("divide-company").onclick=()=>{if(selectedCompanyId!==null&&divideCompany(selectedCompanyId)){rebuildSelectionVisuals();refreshCommandGrid()}};
$("pause").onclick=()=>togglePause();
$("settings").onclick=openSettings;$("exit").onclick=exitToTitle;
$("settings-audio").onclick=()=>setAudio(!audioOn);
$("level-editor").onclick=openLevelEditor;
$("editor-zoom-in").onclick=()=>adjustEditorZoom(-EDITOR_ZOOM_STEP);$("editor-zoom-out").onclick=()=>adjustEditorZoom(EDITOR_ZOOM_STEP);
$("editor-undo").onclick=undoEditorAction;
document.querySelectorAll("#editor-transform-panel input").forEach(input=>input.addEventListener("change",()=>applyEditorTransformInput(input)));
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
$("editor-duplicate").onclick=duplicateEditorSelection;
document.querySelectorAll("[data-world-look-setting]").forEach(input=>input.addEventListener(input.type==="color"||input.tagName==="SELECT"?"change":"input",()=>applyWorldLookControl(input)));
$("content-browser-add").onclick=()=>contentBrowserCreateFolder();
$("content-browser-filter").onclick=()=>{contentBrowserQuery="";$("content-browser-search").value="";renderContentBrowser();};
$("content-browser-view").onclick=()=>{const panel=$("asset-panel"),active=!panel.classList.contains("content-browser-list-view");panel.classList.toggle("content-browser-list-view",active);$("content-browser-view").setAttribute("aria-pressed",String(active));};
$("content-browser-visibility").onclick=()=>{const slot=$("editor-content-drawer-slot"),hidden=slot.dataset.contentHidden!=="true";slot.dataset.contentHidden=String(hidden);$("content-browser-visibility").setAttribute("aria-pressed",String(!hidden));$("content-browser-visibility").setAttribute("title",hidden?"Show Content Browser":"Hide Content Browser");};
$("editor-environment-toggle").onclick=()=>toggleEditorEnvironmentPopover();
$("content-browser-search").addEventListener("input",event=>{contentBrowserQuery=event.currentTarget.value;renderContentBrowser();});$("editor-delete").onclick=()=>openEditorDeleteConfirm();$("editor-delete-cancel").onclick=closeEditorDeleteConfirm;$("editor-delete-confirm-button").onclick=confirmEditorDelete;$("editor-done").onclick=()=>{saveLevelLayout();resetPlaytestToSavedLevel();editorReturnMode="playing";closeLevelEditor();};
document.addEventListener("pointerdown",event=>{if(!event.target.closest("#content-browser-context-menu")&&!event.target.closest("#asset-panel"))hideContentBrowserContextMenu();});
for(const context of Object.keys(EDITOR_CONTEXTS))$("editor-context-"+context).onclick=()=>setEditorContext(context);
$("editor-save").onclick=saveEditorSession;$("editor-maximize").onclick=toggleEditorViewportMaximize;
$("editor-left-collapse").onclick=()=>{editorLayout.leftCollapsed=!editorLayout.leftCollapsed;applyEditorLayout()};$("editor-right-collapse").onclick=()=>{editorLayout.rightCollapsed=!editorLayout.rightCollapsed;applyEditorLayout()};
$("editor-left-resizer").onpointerdown=event=>beginEditorResize("left",event);$("editor-right-resizer").onpointerdown=event=>beginEditorResize("right",event);
$("content-browser-resizer").onpointerdown=beginContentBrowserResize;
$("world-outliner-search").addEventListener("input",event=>{editorOutlinerQuery=event.currentTarget.value;renderWorldOutliner()});
$("hud-toggle").onclick=()=>{hudCompact=!hudCompact;$("hud").classList.toggle("hud-compact",hudCompact);renderSettings()};
$("speed").oninput=e=>{gameSpeed=GAME_SPEED_STEPS[Number(e.currentTarget.value)]??1;$("speed-value").textContent=`${gameSpeed}Ã—`};
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
function updateStats(){const count=livingPlayerUnits().length;$("army-count").textContent=count;$("army-button-count").textContent=deploymentReserve;$("territory-count").textContent=`${campaign.conquered.size}/7`;updateDeploymentControl()}
function win(){mode="end";$("end-title").textContent=STR.victory;$("retry").textContent=STR.retry;$("end-screen").classList.remove("hidden");$("hud").classList.add("hidden")}
function start(){removeUnplacedEnemyActors();mode="playing";$("title-screen").classList.add("hidden");$("hud").classList.remove("hidden");$("commander-vitals")?.classList.add("hidden");$("companies")?.classList.remove("hidden");$("divide-company")?.classList.add("hidden");$("pause").textContent=STR.pause;$("pause").setAttribute("aria-label",STR.pause);$("mobile-command").textContent="TAP THE SOLDIER ICON TO DEPLOY";updateStats();if(debugMode)toggleDebugMonitor(true);if(audioOn)sounds.music.play().catch(()=>{});showToast("DEPLOY YOUR SOLDIERS")}
$("begin").onclick=start;$("retry").onclick=()=>location.reload();

function activeCombatCameraFrame(){
  if(!master||!activeEncounter||activeEncounter.done)return null;
  const players=livingPlayerUnits(),actors=[...players,...enemyUnits];
  const duelists=actors.filter(actor=>actor?.userData.alive&&actor.userData.lockedTarget?.userData.alive);
  const closestIncomingDistance=activeEncounter.cameraApproachDistance??enemyUnits.reduce((closest,enemy)=>{
    if(!enemy.userData.alive)return closest;
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

function resize(){
  renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));
  const rect=mode==="editor"?canvas.getBoundingClientRect():{width:innerWidth,height:innerHeight};const width=Math.max(1,Math.round(rect.width)),height=Math.max(1,Math.round(rect.height));
  renderer.setSize(width,height,false);camera.aspect=width/height;camera.updateProjectionMatrix();
}
addEventListener("resize",resize);addEventListener("orientationchange",resize);
if(debugMode){if(debugButton)debugButton.classList.remove("hidden");}
let frames=0,fps=0,fpsAt=performance.now(),acc=0,last=performance.now();const STEP=1/60;
function loop(now){
  requestAnimationFrame(loop);let frame=Math.min(.05,(now-last)/1000);last=now;acc+=frame;if(mode==="playing")totalTime+=frame*gameSpeed;
  while(acc>=STEP){
    if(mode==="playing")updateBattle(defeatCinematic?STEP:STEP*gameSpeed);
    acc-=STEP;
  }
  const mapMode=mode==="map",editorMode=mode==="editor",combatFrame=null;
  if(editorMode){updateEditorCameraTravel(frame);updateEditorKeyboardPan(frame)}
  let focus,desired;
  if(mapMode){
    focus=new THREE.Vector3(0,0,-1);desired=new THREE.Vector3(10,31,26);
  }else if(editorMode){
    focus=editorCameraFocus;
    const cameraDistanceScale=gameplayCameraDistanceScale(editorCameraScale,{combat:false});
    desired=focus.clone().addScaledVector(EDITOR_CAMERA_OFFSET,cameraDistanceScale/worldCameraZoom());
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
    desired=focus.clone().add(ISOMETRIC_CAMERA_OFFSET.clone().multiplyScalar(cameraDistanceScale/worldCameraZoom()));
  }
  if(editorMode)camera.position.copy(desired);else camera.position.lerp(desired,1-Math.pow(.001,frame));const look=focus.clone();look.y=mapMode?0:.4;camera.lookAt(look);
  voidBackdrop.position.copy(camera.position);voidBackdrop.quaternion.copy(camera.quaternion);voidBackdrop.translateZ(-.2);
  const cameraDistance=Math.max(.001,camera.position.distanceTo(look));
  scene.fog.density=baseFogDensity*FOG_REFERENCE_CAMERA_DISTANCE/cameraDistance;
  if(!mapMode){sun.position.set(focus.x-8,18,focus.z+7);sun.target.position.set(focus.x,0,focus.z);sun.target.updateMatrixWorld()}
  if(shake>0&&!editorMode){camera.position.x+=(rand()-.5)*shake;camera.position.y+=(rand()-.5)*shake;shake*=.83}
  for(const flag of flags)flag.rotation.y=-.12+Math.sin(totalTime*2+flag.id)*.08;
  if(mode==="playing"||editorMode){
    const foliageDelta=mode==="playing"?frame*gameSpeed:frame;
    grassWindTime+=foliageDelta;treeWindTime+=foliageDelta;
    updateGrassWind(foliageDelta);updateTreeWind(foliageDelta);
  }
  renderer.render(scene,camera);
  if(debugMode&&debugPanelVisible)renderDebugMonitor();
  if(debugMode&&debugPanelVisible&&now-fpsAt>500){fps=Math.round(frames*1000/(now-fpsAt));debugPanel.dataset.stats=`${fps} fps | ${renderer.info.render.calls} draws | ${followers.length+enemyUnits.length} units`;frames=0;fpsAt=now}
  frames++;
}
requestAnimationFrame(loop);
