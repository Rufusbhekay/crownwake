import * as THREE from "./vendor/three.module.js";
import { GLTFLoader } from "./vendor/loaders/GLTFLoader.js";
import { STR } from "./strings.js";
import { DUEL_PHASE, DUEL_WAITING_DISTANCE, FACTION, FOLLOW_AWARENESS, SERVANT_MODE, SOLDIER_COMBAT_STATE, SOLDIER_HEALTH_WIDGET_DURATION, SOLDIER_REGEN_DELAY, SOLDIER_REGEN_DURATION, THREAT_FORMATION_SCALE, activeDuelRingState, actorCollisionProfile, actorDebugSnapshot, activeCombatantPoints, advanceDuelState, advanceFollowAwareness, advanceFormationSpread, advanceGroundFragment, advanceLaggingHealthBar, advancePathFailure, allocateDuelWaitingSlots, arrivalSpeed, battleApproachState, battleLaneOffset, cameraBaselineAfterDivision, canApplyAttackDamage, canDivideCompany, canMaintainSoldierDuel, centeredPackOffset, chooseBalancedTargetIndex, chooseCommanderBlockerIndex, chooseCommanderTargetIndex, chooseHiddenSpawn, chooseLocalDetour, chooseNearestAvailablePair, combatVisualPose, commanderClearanceVector, commanderCombatProfile, commanderControlState, commanderFormationOffset, commanderRegenHealth, commanderTacticalWaypoint, companyCommandState, companyDivisionPlan, companyFormationOffset, companyLeaderMotion, defeatCinematicState, duelAttackHits, duelLungeDirection, enemyWaveApproachAngle, environmentGrade, floorTileKeys, formationExpansionOffset, gameplayCameraDistanceScale, hiddenWaveSpawn, hitKnockback, incomingWaveCameraState, isPlayerWaveDefeated, limitPointToRadius, lineOfSightBlocked, makeCampaign, nextDuelTurn, normalizePracticeConfig, particleBudgetAllows, persistentFragmentBudgetAllows, practiceEnemyHealthMultiplier, practiceWaveInterval, practiceWaveSize, preserveLockedCombatants, resolveBoxOverlap, separationVector, shouldReleaseCombatCommitment, shouldRepositionFollower, smoothAngle, snapTacticalCell, soldierCombatState, soldierFragmentCount, soldierRegenHealth, soldierSpacingProfile, spawnPackOffset, standOffPursuitPoint, swarmTravelGroupCount, swarmTravelOffset, swarmTravelRadius, tacticalCameraFrame, tacticalCellAction, tacticalCellBlocked, tacticalInputEnabled, tacticalSelectionScope, unitCommanderProfile } from "./sim-runtime-20260724g.js";
import { ENEMY_TARGET_REVIEW_INTERVAL, enemyTargetReviewDue, scatteredPackOffset, shouldRetargetToCloserOpponent } from "./sim-runtime-20260724g.js";

const $ = id => document.getElementById(id);
const ENVIRONMENT=environmentGrade();
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
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = ENVIRONMENT.exposure;

const scene = new THREE.Scene();
scene.background = new THREE.Color(ENVIRONMENT.background);
scene.fog = new THREE.FogExp2(ENVIRONMENT.background, 0.013);
const camera = new THREE.PerspectiveCamera(37, innerWidth / innerHeight, 0.1, 160);
camera.position.set(12, 18, 18);
const gameplayCameraFocus = new THREE.Vector3();
let gameplayCameraScale = 1;
let gameplayCameraBaselineScale = 1;
const debugMode = new URLSearchParams(location.search).has("dev");
let debugPanelVisible = false;
let debugFocusId = null;

scene.add(new THREE.HemisphereLight(0xf3f0e5, 0x566466, ENVIRONMENT.hemisphereIntensity));
const sun = new THREE.DirectionalLight(0xf7f1df, ENVIRONMENT.sunIntensity);
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
function loadPracticeConfig(){try{return normalizePracticeConfig(JSON.parse(localStorage.getItem(PRACTICE_CONFIG_KEY)||"{}"))}catch{return normalizePracticeConfig()}}
const PRACTICE_CONFIG=loadPracticeConfig();
let campaign = makeCampaign(), mode = "title", target = new THREE.Vector3(), activeEncounter = null;
const PLAYER_COMMANDER=commanderCombatProfile("player"),ENEMY_COMMANDER=commanderCombatProfile("enemy"),STARTING_SOLDIERS=PRACTICE_CONFIG.playerSoldiers-1;
const INDEPENDENT_SOLDIERS=true;
let master, masterHealth = INDEPENDENT_SOLDIERS?32:PLAYER_COMMANDER.maxHealth, sinceDamage = 99, followers = [], enemyUnits = [], particles = [], tombstones = [];
const MAX_ACTIVE_PARTICLES=180,MAX_PERSISTENT_FRAGMENTS=800;
let totalTime = 0, shake = 0, reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches, audioOn = true, gameSpeed = 1, hudCompact = false, settingsReturnMode = "playing";
let selectedRegion = 2, toastTimer = 0, nextWaveTimer = practiceWaveInterval(rand()), waveNumber = 0, enemyPackAnchor = null;
let defeatCinematic = null;
let damagePulse = 0, damageStacks = 0;
let commanderHearts = 3;
let companyLayoutDirty=true,playerCompanies=[];
let selectedCompanyId=null,selectedCommander=null,commandHoverCell=null,wasCombat=false;
const companyAnchors=new Map(),selectionVisuals=[],COMMAND_CELL=3.6,COMMAND_GRID_OFFSET=1.8;
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
function makeGridGroundMaterial(){
  const size=1024,canvas=document.createElement("canvas");canvas.width=canvas.height=size;
  const ctx=canvas.getContext("2d"),step=size/ENVIRONMENT.gridCells;
  ctx.fillStyle=`#${ENVIRONMENT.groundColor.toString(16).padStart(6,"0")}`;ctx.fillRect(0,0,size,size);
  ctx.strokeStyle=`#${ENVIRONMENT.gridColor.toString(16).padStart(6,"0")}`;ctx.lineWidth=2;
  for(let i=0;i<ENVIRONMENT.gridCells;i++){
    const p=Math.round(i*step)+.5;
    ctx.beginPath();ctx.moveTo(p,0);ctx.lineTo(p,size);ctx.stroke();
    ctx.beginPath();ctx.moveTo(0,p);ctx.lineTo(size,p);ctx.stroke();
  }
  const texture=new THREE.CanvasTexture(canvas);
  texture.colorSpace=THREE.SRGBColorSpace;texture.wrapS=texture.wrapT=THREE.RepeatWrapping;
  texture.minFilter=THREE.LinearMipmapLinearFilter;texture.magFilter=THREE.LinearFilter;
  texture.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());
  return new THREE.MeshStandardMaterial({map:texture,color:0xffffff,roughness:ENVIRONMENT.roughness,metalness:ENVIRONMENT.metalness});
}
const gridGroundMaterial=makeGridGroundMaterial();
const mats = {
  grass: mat(COLORS.grass), cliff: mat(COLORS.cliff), water: new THREE.MeshStandardMaterial({ color: COLORS.water, roughness: .3, transparent: true, opacity: .93 }),
  player: mat(COLORS.player), playerDark: mat(COLORS.playerDark), coral: mat(COLORS.coral), amber: mat(COLORS.amber), crown: mat(COLORS.crown),
  warrior: mat(COLORS.warrior), master: mat(COLORS.master), masterDark: mat(0x7f3438),
  stone: mat(0xd8ddcc), groundA:gridGroundMaterial, groundB:gridGroundMaterial
};
function setWidgetFill(mesh,ratio,width,height){
  const value=THREE.MathUtils.clamp(ratio,0,1);
  mesh.scale.set(width*value,height,1);mesh.position.x=-width*(1-value)*.5;
}
const soldierBarGeometry=new THREE.PlaneGeometry(1,1);
const soldierRingGeometry=new THREE.RingGeometry(.53,.585,32);
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

const TILE_SIZE=18,TILE_RADIUS=4,floorGeometry=new THREE.PlaneGeometry(TILE_SIZE+ENVIRONMENT.tileOverscan,TILE_SIZE+ENVIRONMENT.tileOverscan),floorTiles=new Map(),floorPool=[];
floorGeometry.rotateX(-Math.PI/2);
function updateFloorTiles(){
  const combatFrame=activeCombatCameraFrame();
  const independentPoints=INDEPENDENT_SOLDIERS?livingPlayerUnits():[];
  const independentCenter=independentPoints.length
    ?independentPoints.reduce((sum,unit)=>sum.add(unit.position),new THREE.Vector3()).multiplyScalar(1/independentPoints.length)
    :playerFocus().position;
  const floorCenter=combatFrame?{x:combatFrame.x,z:combatFrame.z}:INDEPENDENT_SOLDIERS?independentCenter:playerFocus().position;
  const needed=new Set(floorTileKeys(floorCenter,TILE_SIZE,TILE_RADIUS));
  for(const [key,tile] of floorTiles)if(!needed.has(key)){battle.remove(tile);floorTiles.delete(key);floorPool.push(tile)}
  for(const key of needed){
    if(floorTiles.has(key))continue;
    const [x,z]=key.split(",").map(Number),tile=floorPool.pop()??new THREE.Mesh(floorGeometry,mats.groundA);
    tile.material=gridGroundMaterial;tile.position.set((x+.5)*TILE_SIZE,.01,(z+.5)*TILE_SIZE);tile.receiveShadow=true;
    floorTiles.set(key,tile);battle.add(tile);
  }
}

const commandGrid=new THREE.Group(),commandCellGeometry=new THREE.PlaneGeometry(COMMAND_CELL-.06,COMMAND_CELL-.06);
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
  for(const {actor,shell,shellMaterials,ring,materials} of selectionVisuals){
    actor?.remove(shell);
    shellMaterials.forEach(material=>material.dispose?.());
    battle.remove(ring);ring?.geometry?.dispose?.();ring?.material?.dispose?.();
    for(const snapshot of materials??[]){
      if(snapshot.material.color&&snapshot.color)snapshot.material.color.copy(snapshot.color);
      if(snapshot.material.emissive&&snapshot.emissive)snapshot.material.emissive.copy(snapshot.emissive);
      if(Number.isFinite(snapshot.emissiveIntensity))snapshot.material.emissiveIntensity=snapshot.emissiveIntensity;
    }
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
    shell.scale.multiplyScalar(1.11);
    shell.traverse(child=>{
      if(!child.isMesh)return;
      const source=Array.isArray(child.material)?child.material:[child.material];
      const outlined=source.map(()=>new THREE.MeshBasicMaterial({
        color:0x172126,side:THREE.BackSide,transparent:true,opacity:.96,depthWrite:false
      }));
      shellMaterials.push(...outlined);
      child.material=Array.isArray(child.material)?outlined:outlined[0];child.castShadow=false;child.receiveShadow=false;child.renderOrder=42;
    });
    actor.add(shell);
    const ring=new THREE.Mesh(
      new THREE.RingGeometry(.3,.47,32),
      new THREE.MeshBasicMaterial({color:0xf7fff7,transparent:true,opacity:.3,side:THREE.DoubleSide,depthWrite:false})
    );
    ring.rotation.x=-Math.PI/2;ring.position.copy(actor.position);ring.position.y=GROUND_Y+.028;ring.renderOrder=40;
    battle.add(ring);
    const materials=(actor.userData.damageMaterials??[]).map(({material})=>({
      material,color:material.color?.clone(),emissive:material.emissive?.clone(),emissiveIntensity:material.emissiveIntensity
    }));
    selectionVisuals.push({actor,shell,shellMaterials,ring,materials});
  }
}
const selectionColorLift=new THREE.Color(0xffffff),selectionEmissiveLift=new THREE.Color(0xf8fff3);
function updateSelectionVisuals(){
  const pulse=.5+.5*Math.sin(totalTime*4.5);
  for(const {actor,shell,shellMaterials,ring,materials} of selectionVisuals){
    if(!actor?.userData.alive){shell.visible=false;ring.visible=false;continue}
    shell.visible=true;ring.visible=true;ring.position.copy(actor.position);ring.position.y=GROUND_Y+.028;ring.material.opacity=.24+pulse*.14;
    for(const material of shellMaterials)material.opacity=.88+pulse*.1;
    for(const {material,color,emissive} of materials){
      if(material.color&&color)material.color.copy(color).lerp(selectionColorLift,.08+pulse*.1);
      if(material.emissive){material.emissive.copy(emissive??selectionColorLift).lerp(selectionEmissiveLift,.65);material.emissiveIntensity=.45+pulse*.5}
    }
  }
}
function tacticalActors(){
  return [master,...followers,...enemyUnits].map(actor=>({
    id:actor.id,x:actor.position.x,z:actor.position.z,alive:actor.visible&&actor.userData.alive
  }));
}
function isTacticalCellBlocked(cell){
  const excludedIds=livingSelectionMembers().map(actor=>actor.id),actors=tacticalActors();
  return tacticalCellBlocked({cell,actors,excludedIds,cellSize:COMMAND_CELL,offset:COMMAND_GRID_OFFSET});
}
function tacticalCellInRange(cell){
  const center=snapTacticalCell(tacticalSelectionCenter(),COMMAND_CELL,COMMAND_GRID_OFFSET);
  return Math.abs(cell.x-center.x)<=COMMAND_CELL*3.01&&Math.abs(cell.z-center.z)<=COMMAND_CELL*3.01;
}
function clearCommandGrid(){
  for(const child of [...commandGrid.children])child.material?.dispose?.();
  commandGrid.clear();
}
function refreshCommandGrid(){
  clearCommandGrid();
  if(selectedCompanyId===null&&!selectedCommander){commandGrid.visible=false;return}
  const center=snapTacticalCell(tacticalSelectionCenter(),COMMAND_CELL,COMMAND_GRID_OFFSET);
  for(let x=-3;x<=3;x++)for(let z=-3;z<=3;z++){
    const cell={x:center.x+x*COMMAND_CELL,z:center.z+z*COMMAND_CELL};
    const blocked=isTacticalCellBlocked(cell);
    const hovered=commandHoverCell&&Math.abs(commandHoverCell.x-cell.x)<.01&&Math.abs(commandHoverCell.z-cell.z)<.01;
    const color=blocked?0xd45d65:0x62d493;
    const opacity=blocked?.44:hovered?.72:.31;
    const mesh=new THREE.Mesh(commandCellGeometry,new THREE.MeshBasicMaterial({color,transparent:true,opacity,depthWrite:false,depthTest:false,side:THREE.DoubleSide}));
    mesh.position.set(cell.x,GROUND_Y+.08,cell.z);mesh.renderOrder=90;mesh.frustumCulled=false;mesh.userData={commandCell:cell,blocked};commandGrid.add(mesh);
  }
  commandGrid.visible=true;
}
function clearTacticalSelection(){
  selectedCompanyId=null;selectedCommander=null;commandHoverCell=null;commandGrid.visible=false;clearCommandGrid();clearSelectionVisuals();
  updateDivideControl();
}
function selectCompany(companyId){
  selectedCompanyId=companyId;selectedCommander=null;commandHoverCell=null;rebuildSelectionVisuals();refreshCommandGrid();updateDivideControl();showToast(STR.chooseGround,1300);synthTone(410,.12,"sine",.018);
}
function selectCommander(commander){
  selectedCompanyId=null;selectedCommander=commander;commandHoverCell=null;
  rebuildSelectionVisuals();refreshCommandGrid();updateDivideControl();showToast(STR.chooseGround,1300);synthTone(465,.12,"sine",.018);
}
function issueCompanyOrder(point){
  if(selectedCompanyId===null&&!selectedCommander)return false;
  const cell=snapTacticalCell(point,COMMAND_CELL,COMMAND_GRID_OFFSET);
  const action=tacticalCellAction({inRange:tacticalCellInRange(cell),occupied:isTacticalCellBlocked(cell)});
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
  if(faction!=="player")tintCharacter(g,COLORS.coral);prepareDamageVisual(g);makeActorHealthWidget(g,false);makeEncounterRing(g);return g;
}
function makeUnit(faction="player") {
  const g=new THREE.Group(), key=faction==="player"?"playerServant":"enemyServant";
  setCharacterVisual(g,key,()=>{const body=roundedBox(.42,1.22,.38,mats.warrior,.1);body.position.y=.03;return body});
  const player=faction==="player",maxHp=player?32:25.6,attack=player?10:8;
  g.userData={faction,hp:maxHp,maxHp,attack,sinceDamage:99,regenStartHealth:maxHp,regenActive:false,cool:rand()*.5,alive:true,isMaster:false,unitCommander:false,companyId:0,collisionHalf:actorCollisionProfile("soldier"),velocity:new THREE.Vector3(),phase:rand()*10,mode:SERVANT_MODE.FOLLOW,followState:FOLLOW_AWARENESS.HOLDING,followTimer:0,followThreshold:.38+rand()*.72,responseDelay:.12+rand()*.68,trackingRate:1.8+rand()*2.4,hitPulse:0,attackAnim:0,damageAnim:0,lastAttackTime:null,lastDamageTime:null,collisionContacts:0};
  if(!player)tintCharacter(g,COLORS.amber);
  prepareDamageVisual(g);makeActorHealthWidget(g,false);makeEncounterRing(g);return g;
}
const initialSpawnCenter=new THREE.Vector3(0,GROUND_Y,4),initialSpawnSeed=rand(),initialUnitCount=STARTING_SOLDIERS+1;
master=makeMaster();
const masterSpawnOffset=scatteredPackOffset(0,initialUnitCount,initialSpawnSeed);
master.position.set(initialSpawnCenter.x+masterSpawnOffset.lateral,GROUND_Y,initialSpawnCenter.z+masterSpawnOffset.forward);battle.add(master);target.copy(master.position);
for(let i=0;i<STARTING_SOLDIERS;i++){
  const u=makeUnit(),offset=scatteredPackOffset(i+1,initialUnitCount,initialSpawnSeed);
  u.position.set(initialSpawnCenter.x+offset.lateral,GROUND_Y,initialSpawnCenter.z+offset.forward);u.userData.holdPosition=u.position.clone();battle.add(u);followers.push(u)
}

// `master` remains a legacy variable name, but in the soldiers-only ruleset it
// has no special gameplay authority. These helpers keep camera, spawning, and
// floor streaming centered on the living army rather than that one actor.
function livingPlayerUnits(){
  return [master,...followers].filter(unit=>unit?.visible&&unit.userData?.alive);
}
function playerFocus(){
  return livingPlayerUnits()[0]??master;
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
function scheduleNextWave(){nextWaveTimer=configuredWaveCount(waveNumber)!=null?practiceWaveInterval(rand()):0}
function spawnWave(){
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
updateFloorTiles();

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
  unit.userData.duelPhase=DUEL_PHASE.APPROACH;unit.userData.duelTimer=0;unit.userData.pathPreviousDistance=Infinity;unit.userData.pathStallTimer=0;unit.userData.pathFailures=0;unit.scale.set(1,1,1);
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
  if(!foe?.userData.alive||foe.userData.lockedTarget!==unit||!enemyTargetReviewDue({now:totalTime,nextReviewAt:data.nextTargetReviewAt}))return foe;
  data.nextTargetReviewAt=totalTime+ENEMY_TARGET_REVIEW_INTERVAL;
  let alternative=null,alternativeDistance=Infinity;
  for(const candidate of candidates){
    if(candidate===foe||!candidate.userData.alive||candidate.userData.lockedTarget||isAvoidingDuelTarget(unit,candidate))continue;
    const distance=unit.position.distanceTo(candidate.position);
    if(distance<alternativeDistance){alternative=candidate;alternativeDistance=distance}
  }
  const currentDistance=unit.position.distanceTo(foe.position);
  if(!alternative||!shouldRetargetToCloserOpponent({phase:data.duelPhase,currentDistance,candidateDistance:alternativeDistance}))return foe;
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
  return state.relock;
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
  const pairs=[...aMap].map(([left,right])=>({left,right,midpoint:left.position.clone().add(right.position).multiplyScalar(.5)}));
  if(pairs.length){
    const aCenter=a.reduce((sum,unit)=>sum.add(unit.position),new THREE.Vector3()).multiplyScalar(1/a.length);
    const bCenter=b.reduce((sum,unit)=>sum.add(unit.position),new THREE.Vector3()).multiplyScalar(1/b.length);
    const heading=bCenter.clone().sub(aCenter).setY(0);
    if(heading.lengthSq()<.001)heading.set(0,0,1);else heading.normalize();
    const lateral=new THREE.Vector3(-heading.z,0,heading.x);
    const battleCenter=aCenter.add(bCenter).multiplyScalar(.5);battleCenter.y=GROUND_Y;
    pairs.sort((first,second)=>first.midpoint.dot(lateral)-second.midpoint.dot(lateral));
    for(const [index,pair] of pairs.entries()){
      const laneCenter=battleCenter.clone().addScaledVector(lateral,battleLaneOffset(index,pairs.length,1.6));
      const alreadyMutual=pair.left.userData.lockedTarget===pair.right&&pair.right.userData.lockedTarget===pair.left;
      if(!alreadyMutual){
        lockDuel(pair.left,pair.right,"primary",0,laneCenter);lockDuel(pair.right,pair.left,"primary",0,laneCenter);
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
  if(mutual&&data.duelTurnId==null){
    const firstAttacker=Math.min(unit.id,foe.id);
    data.duelTurnId=firstAttacker;foe.userData.duelTurnId=firstAttacker;
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
    start:unit.position,goal:desired,obstacles,clearance:.58,lookAhead:2.45,preferLeft:((unit.id+(unit.userData.pathFailures??0))&1)===0
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
      const state=advanceGroundFragment({
        position:p.position,velocity:p.userData.vel,halfSize:p.userData.halfSize,
        bounces:p.userData.bounces,settled:p.userData.settled,dt,groundY:GROUND_Y
      });
      p.position.set(state.position.x,state.position.y,state.position.z);
      p.userData.vel.set(state.velocity.x,state.velocity.y,state.velocity.z);
      p.userData.bounces=state.bounces;p.userData.settled=state.settled;
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
  defeatCinematic={elapsed:0,outcome:"wave-defeat",hasNextWave:configuredWaveCount(waveNumber)!=null};
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
function gameOver(){
  if(mode==="end"||defeatCinematic)return;
  clearTacticalSelection();
  if(activeEncounter)activeEncounter.done=true;
  defeatCinematic={elapsed:0,outcome:"game-over",hasNextWave:false};
}
function resolveBattle(){
  if(isPlayerWaveDefeated(livingPlayerUnits().length)){gameOver();return}
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
  commander.position.y=GROUND_Y;
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
  u.position.y=GROUND_Y;
}
function updateBattle(dt){
  if(defeatCinematic){updateDefeatCinematic(dt);return}
  if(nextWaveTimer>0){nextWaveTimer-=dt;if(nextWaveTimer<=0)spawnWave()}
  const masterDirectOrder=!!master.userData.manualMoving,masterManualOrder=INDEPENDENT_SOLDIERS?masterDirectOrder:masterDirectOrder||ensureCompanyAnchor(0).moving;
  if(!INDEPENDENT_SOLDIERS&&masterManualOrder)steerTowards(master,target,2.15,5.2,dt);
  master.position.y=GROUND_Y;
  if(!INDEPENDENT_SOLDIERS&&masterDirectOrder&&master.position.distanceTo(target)<.08){
    master.userData.velocity.set(0,0,0);target.copy(master.position);
    master.userData.manualMoving=false;master.userData.manualTarget=null;
  }
  updateFloorTiles();
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
    u.position.y=GROUND_Y;
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
      u.position.y=GROUND_Y;
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
    u.position.y=GROUND_Y;
    if(foe?.userData.alive){const facing=foe.position.clone().sub(u.position);u.rotation.y=smoothAngle(u.rotation.y,Math.atan2(facing.x,facing.z),14,dt)}
    else if(waitingDuel){const facing=waitingDuel.center.clone().sub(u.position);u.rotation.y=smoothAngle(u.rotation.y,Math.atan2(facing.x,facing.z),10,dt)}
  });
  resolveCharacterCollisions();resolveDebrisCollisions();
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

function pointerWorld(e){
  if(mode!=="map"&&!tacticalInputEnabled(mode))return;
  const rect=canvas.getBoundingClientRect();pointer.x=((e.clientX-rect.left)/rect.width)*2-1;pointer.y=-((e.clientY-rect.top)/rect.height)*2+1;raycaster.setFromCamera(pointer,camera);
  if(mode==="map"){const hit=raycaster.intersectObjects(hoverable,false)[0];if(hit)chooseRegion(hit.object.userData.region);return}
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
  const plane=new THREE.Plane(new THREE.Vector3(0,1,0),-GROUND_Y),p=new THREE.Vector3();if(raycaster.ray.intersectPlane(plane,p)&&(selectedCompanyId!==null||selectedCommander)){
    if(issueCompanyOrder(p)){
      const marker=$("tap-marker");marker.style.left=`${e.clientX}px`;marker.style.top=`${e.clientY}px`;marker.classList.remove("pulse");void marker.offsetWidth;marker.classList.add("pulse");
      $("mobile-command")?.classList.add("dismissed");
    }
  }
}
function hoverTacticalGrid(e){
  if(!tacticalInputEnabled(mode)||(selectedCompanyId===null&&!selectedCommander))return;
  const rect=canvas.getBoundingClientRect();pointer.x=((e.clientX-rect.left)/rect.width)*2-1;pointer.y=-((e.clientY-rect.top)/rect.height)*2+1;raycaster.setFromCamera(pointer,camera);
  const plane=new THREE.Plane(new THREE.Vector3(0,1,0),-GROUND_Y),p=new THREE.Vector3();
  if(raycaster.ray.intersectPlane(plane,p)){
    const cell=snapTacticalCell(p,COMMAND_CELL,COMMAND_GRID_OFFSET);
    if(!commandHoverCell||cell.x!==commandHoverCell.x||cell.z!==commandHoverCell.z){commandHoverCell=cell;refreshCommandGrid()}
  }
}
canvas.addEventListener("pointerdown",pointerWorld);
canvas.addEventListener("pointermove",hoverTacticalGrid);
function togglePause(forcePaused){
  const shouldPause=forcePaused??mode==="playing";
  if(shouldPause&&mode==="playing"){
    clearTacticalSelection();mode="paused";$("pause").textContent=STR.resumeGame;$("pause").setAttribute("aria-label",STR.resumeGame);
    $("pause-state").textContent=STR.paused;$("pause-state").classList.remove("hidden");sounds.music.pause();
  }else if(!shouldPause&&mode==="paused"){
    mode="playing";$("pause").textContent=STR.pause;$("pause").setAttribute("aria-label",STR.pause);$("pause-state").classList.add("hidden");
    if(audioOn)sounds.music.play().catch(()=>{});
  }
}
const GAME_SPEED_STEPS=[.5,.75,1,1.25,1.5,2];
function setAudio(enabled){audioOn=enabled;sounds.music.muted=!audioOn;$("settings-audio").textContent=audioOn?"SOUND ON":"SOUND OFF"}
function renderSettings(){
  $("speed").value=String(GAME_SPEED_STEPS.indexOf(gameSpeed));$("speed-value").textContent=`${gameSpeed}Ã—`;
  $("starting-soldiers").value=String(PRACTICE_CONFIG.playerSoldiers);setAudio(audioOn);
  $("hud-toggle").textContent=hudCompact?"SHOW HUD":"HIDE HUD";
  const waves=$("wave-settings");waves.replaceChildren(...PRACTICE_CONFIG.waveCounts.map((count,index)=>{
    const label=document.createElement("label");label.className="wave-setting";label.innerHTML=`<span>WAVE ${index+1}</span><input type="number" min="1" max="24" inputmode="numeric" value="${count}" aria-label="Enemy count for wave ${index+1}">`;return label;
  }));
}
function openSettings(){
  if(!["playing","paused"].includes(mode))return;
  settingsReturnMode=mode;mode="settings";clearTacticalSelection();renderSettings();$("settings-panel").classList.remove("hidden");
}
function closeSettings(){
  if(mode!=="settings")return;$("settings-panel").classList.add("hidden");mode=settingsReturnMode;
}
function exitToTitle(){location.reload()}
function applyPracticeSettings(){
  const waveCounts=[...$("wave-settings").querySelectorAll("input")].map(input=>input.value);
  const config=normalizePracticeConfig({playerSoldiers:$("starting-soldiers").value,waveCounts});
  localStorage.setItem(PRACTICE_CONFIG_KEY,JSON.stringify(config));location.reload();
}
addEventListener("keydown",e=>{if(e.code==="Escape"){if(mode==="settings")closeSettings();else if(mode==="paused")togglePause(false);else if(selectedCompanyId!==null||selectedCommander)clearTacticalSelection();else if(mode==="companies")closeCompanies()}});
addEventListener("keydown",e=>{if(debugMode&&e.code==="KeyI"){e.preventDefault();toggleDebugMonitor()}});
$("return").onclick=closeMap;
$("companies").onclick=openCompanies;$("companies-close").onclick=closeCompanies;
$("divide-company").onclick=()=>{if(selectedCompanyId!==null&&divideCompany(selectedCompanyId)){rebuildSelectionVisuals();refreshCommandGrid()}};
$("pause").onclick=()=>togglePause();
$("settings").onclick=openSettings;$("exit").onclick=exitToTitle;
$("settings-audio").onclick=()=>setAudio(!audioOn);
$("hud-toggle").onclick=()=>{hudCompact=!hudCompact;$("hud").classList.toggle("hud-compact",hudCompact);renderSettings()};
$("speed").oninput=e=>{gameSpeed=GAME_SPEED_STEPS[Number(e.currentTarget.value)]??1;$("speed-value").textContent=`${gameSpeed}Ã—`};
$("settings-cancel").onclick=closeSettings;$("settings-exit").onclick=exitToTitle;$("settings-apply").onclick=applyPracticeSettings;
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
function updateStats(){const count=livingPlayerUnits().length;$("army-count").textContent=count;$("army-button-count").textContent=count;$("territory-count").textContent=`${campaign.conquered.size}/7`}
function win(){mode="end";$("end-title").textContent=STR.victory;$("retry").textContent=STR.retry;$("end-screen").classList.remove("hidden");$("hud").classList.add("hidden")}
function start(){mode="playing";$("title-screen").classList.add("hidden");$("hud").classList.remove("hidden");$("commander-vitals")?.classList.add("hidden");$("companies")?.classList.add("hidden");$("divide-company")?.classList.add("hidden");$("pause").textContent=STR.pause;$("pause").setAttribute("aria-label",STR.pause);$("mobile-command").textContent=STR.tapToMove;updateStats();if(debugMode)toggleDebugMonitor(true);if(audioOn)sounds.music.play().catch(()=>{});showToast(STR.objective)}
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
  const commanders=INDEPENDENT_SOLDIERS
    ?livingPlayerUnits()
    :[master,...followers.filter(unit=>unit.userData.alive&&unit.userData.unitCommander)];
  return tacticalCameraFrame(activeCombatantPoints(commanders),{aspect:camera.aspect,baseSpan:17,padding:2.4,maxScale:1.34});
}

function resize(){renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));renderer.setSize(innerWidth,innerHeight);camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix()}
addEventListener("resize",resize);addEventListener("orientationchange",resize);
if(debugMode){if(debugButton)debugButton.classList.remove("hidden");}
let frames=0,fps=0,fpsAt=performance.now(),acc=0,last=performance.now();const STEP=1/60;
function loop(now){
  requestAnimationFrame(loop);let frame=Math.min(.05,(now-last)/1000);last=now;acc+=frame;if(mode==="playing")totalTime+=frame*gameSpeed;
  while(acc>=STEP){
    if(mode==="playing")updateBattle(defeatCinematic?STEP:STEP*gameSpeed);
    acc-=STEP;
  }
  const mapMode=mode==="map",combatFrame=null;
  let focus,desired;
  if(mapMode){
    focus=new THREE.Vector3(0,0,-1);desired=new THREE.Vector3(10,31,26);
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
    desired=focus.clone().add(new THREE.Vector3(11,18,18).multiplyScalar(cameraDistanceScale));
  }
  camera.position.lerp(desired,1-Math.pow(.001,frame));const look=focus.clone();look.y=mapMode?0:.4;camera.lookAt(look);
  if(!mapMode){sun.position.set(focus.x-8,18,focus.z+7);sun.target.position.set(focus.x,0,focus.z);sun.target.updateMatrixWorld()}
  if(shake>0){camera.position.x+=(rand()-.5)*shake;camera.position.y+=(rand()-.5)*shake;shake*=.83}
  for(const flag of flags)flag.rotation.y=-.12+Math.sin(totalTime*2+flag.id)*.08;
  renderer.render(scene,camera);
  if(debugMode&&debugPanelVisible)renderDebugMonitor();
  if(debugMode&&debugPanelVisible&&now-fpsAt>500){fps=Math.round(frames*1000/(now-fpsAt));debugPanel.dataset.stats=`${fps} fps | ${renderer.info.render.calls} draws | ${followers.length+enemyUnits.length} units`;frames=0;fpsAt=now}
  frames++;
}
requestAnimationFrame(loop);
