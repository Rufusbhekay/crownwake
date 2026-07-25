import * as THREE from "./vendor/three.module.js";
import { GLTFLoader } from "./vendor/loaders/GLTFLoader.js";
import { STR } from "./strings.js";
import { ATTACK_TIMING, DUEL_PHASE, FACTION, FOLLOW_AWARENESS, SERVANT_MODE, actorCollisionProfile, activeCombatantPoints, advanceDuelState, advanceFollowAwareness, advanceGroundFragment, advanceLaggingHealthBar, advancePathFailure, advanceRevival, arrivalSpeed, attackPhaseProgress, battleApproachState, battleLineOffset, battleLineSpacing, battlePreparationState, canAdvanceDuelAttack, canApplyAttackDamage, canDivideCompany, chooseBalancedTargetIndex, chooseCommanderBlockerIndex, chooseCommanderTargetIndex, chooseHiddenSpawn, chooseLocalDetour, chooseServantMode, combatVisualPose, commanderClearanceVector, commanderCombatProfile, commanderControlState, commanderFormationOffset, commanderRegenHealth, commanderTacticalWaypoint, companyCommandState, companyDivisionPlan, companyFormationOffset, companyLeaderMotion, composeGameplayCameraFrame, difficultyEncounter, duelAttackHits, encounterResolutionState, engagementAllocation, environmentGrade, floorTileKeys, hiddenWaveSpawn, hitKnockback, limitPointToRadius, makeCampaign, nextDuelTurn, particleBudgetAllows, playerArmyCameraFrame, playerThreatScore, prioritizedOpponents, proximityCameraScale, recruitRevivalTiming, resolveBoxOverlap, revivalProgressionState, separationVector, shouldReleaseCombatCommitment, shouldRepositionFollower, smoothAngle, snapTacticalCell, soldierFragmentCount, soldierSpacingProfile, standOffPursuitPoint, swarmTravelGroupCount, swarmTravelOffset, swarmTravelRadius, tacticalCameraFrame, tacticalCellAction, tacticalCellBlocked, tacticalCommandScale, tacticalInputEnabled, tacticalSelectionScope, unitCommanderProfile, waveSizeFromRoll } from "./sim-runtime-20260725c.js";

const $ = id => document.getElementById(id);
const ENVIRONMENT=environmentGrade();
for (const [id, key] of [["title","title"],["subtitle","subtitle"],["begin","begin"],["how-to","howTo"],["map","map"],["return","closeMap"],["army-label","army"],["territory-label","territory"],["objective","objective"],["map-hint","mapHint"],["fortify","lockedFortify"],["retry","retry"],["companies-kicker","yourArmy"],["companies-title","companies"],["companies-hint","companiesHint"],["companies-close","resume"]]) $(id).textContent = STR[key];
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
const GAMEPLAY_CAMERA_OFFSET = new THREE.Vector3(11.75, 19.25, 19.25);
const camera = new THREE.PerspectiveCamera(37, innerWidth / innerHeight, 0.1, 160);
camera.position.copy(GAMEPLAY_CAMERA_OFFSET);
const gameplayCameraFocus = new THREE.Vector3();
let gameplayCameraScale = 1;

scene.add(new THREE.HemisphereLight(0xf3f0e5, 0x566466, ENVIRONMENT.hemisphereIntensity));
const sun = new THREE.DirectionalLight(0xf7f1df, ENVIRONMENT.sunIntensity);
sun.position.set(-8, 18, 7); sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024); sun.shadow.camera.left = -30; sun.shadow.camera.right = 30; sun.shadow.camera.top = 30; sun.shadow.camera.bottom = -30;
sun.shadow.radius = 4; sun.shadow.bias = -.0004;
scene.add(sun,sun.target);

const COLORS = { player: 0x35c9c2, playerDark: 0x4383bd, coral: 0xef6d78, amber: 0xe4c45d, crown: 0x836bb7, warrior: 0xf7f2e4, master: 0xb94a4f, grass: 0xcdd69d, cliff: 0xf3f0df, water: 0xaec5c8, ink: 0x40565b };
const GROUND_Y=.015;
const battle = new THREE.Group(), overview = new THREE.Group();
scene.add(battle, overview); overview.visible = false;
const raycaster = new THREE.Raycaster(), pointer = new THREE.Vector2();
const clock = new THREE.Clock();
const hoverable = [];
const flags = [];
let rngState = 0xC0FFEE;
function rand() { rngState = (Math.imul(rngState, 1664525) + 1013904223) >>> 0; return rngState / 4294967296; }
let campaign = makeCampaign(), mode = "title", target = new THREE.Vector3(), activeEncounter = null;
const PLAYER_COMMANDER=commanderCombatProfile("player"),ENEMY_COMMANDER=commanderCombatProfile("enemy"),STARTING_SOLDIERS=6;
let master, masterHealth = PLAYER_COMMANDER.maxHealth, sinceDamage = 99, followers = [], enemyUnits = [], particles = [], tombstones = [];
const MAX_ACTIVE_PARTICLES=180;
let totalTime = 0, shake = 0, reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches, audioOn = true;
let selectedRegion = 2, toastTimer = 0, nextWaveTimer = 0, waveNumber = 0;
let damagePulse = 0, damageStacks = 0;
let commanderHearts = 3, waitingForRecruitRevival = false;
let companyLayoutDirty=true,playerCompanies=[];
let selectedCompanyId=null,selectedCommander=null,commandHoverCell=null,wasCombat=false;
const companyAnchors=new Map(),selectionVisuals=[],COMMAND_CELL=3.6,COMMAND_GRID_OFFSET=1.8;
const padPrev = new Set();
const sounds = {
  music: Object.assign(new Audio("./assets/battle_music.m4a"), { loop: true, volume: .16 }),
  move: Object.assign(new Audio("./assets/move_confirm.mp3"), { volume: .28 }),
  convert: Object.assign(new Audio("./assets/conversion_rise.mp3"), { volume: .42 }),
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
function makeActorHealthWidget(unit,commander=false){
  const group=new THREE.Group();
  const layer=(color,width,height,z,order)=>{
    const mesh=new THREE.Mesh(soldierBarGeometry,new THREE.MeshBasicMaterial({color,transparent:true,opacity:.93,depthTest:false,depthWrite:false}));
    mesh.scale.set(width,height,1);mesh.position.z=z;mesh.renderOrder=order;mesh.frustumCulled=false;group.add(mesh);return mesh;
  };
  const width=commander?.88:.59,height=commander?.06:.055;
  layer(0x253033,commander?1:.68,commander?.12:.105,0,33);
  const lag=layer(0xffe0aa,width,height,.01,34),main=layer(0x35c9c2,width,height,.02,35);
  group.position.y=commander?1.52:1.42;group.visible=commander;unit.add(group);
  group.userData={current:unit.userData.hp,lagHealth:unit.userData.hp,hold:0,visibleTimer:0,main,lag,width,height,alwaysVisible:commander};
  unit.userData.healthWidget=group;
}
function showActorHealth(unit,previousHealth){
  const data=unit.userData.healthWidget?.userData;if(!data)return;
  data.current=Math.max(0,unit.userData.hp);data.lagHealth=Math.max(data.lagHealth,previousHealth);
  data.hold=.24;data.visibleTimer=data.alwaysVisible?Infinity:1.6;
  data.main.material.color.setHex(unit.userData.faction==="player"?COLORS.player:unit.userData.isMaster?COLORS.coral:COLORS.amber);
  unit.userData.healthWidget.visible=true;
}
function updateActorHealthWidgets(dt){
  for(const unit of [master,...followers,...enemyUnits]){
    const widget=unit.userData.healthWidget,data=widget?.userData;if(!data)continue;
    if(!unit.userData.alive){widget.visible=false;continue}
    data.current=Math.max(0,unit.userData.hp);
    const state=advanceLaggingHealthBar({current:data.current,lag:data.lagHealth,hold:data.hold,visibleTimer:data.visibleTimer,dt});
    data.lagHealth=state.lag;data.hold=state.hold;data.visibleTimer=data.alwaysVisible?Infinity:state.visibleTimer;widget.visible=data.alwaysVisible||state.visible;
    const max=Math.max(1,unit.userData.maxHp);
    setWidgetFill(data.lag,state.lag/max,data.width,data.height);setWidgetFill(data.main,data.current/max,data.width,data.height);
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
  const missing=1-masterHealth/PLAYER_COMMANDER.maxHealth, recent=Math.max(0,1-sinceDamage/.8);
  const intensity=Math.min(5.5,(missing*.85+damagePulse)*(1+damageStacks*.42)*2);
  const tint=Math.min(.72,missing*.38+recent*.36+damagePulse*.24);
  for(const {material,baseColor,baseEmissive} of master.userData.damageMaterials??[]){
    if(material.color&&baseColor)material.color.copy(baseColor).lerp(new THREE.Color(0xff243f),tint);
    if(material.emissive){material.emissive.copy(baseEmissive??new THREE.Color()).lerp(new THREE.Color(0xff102f),Math.min(1,intensity));material.emissiveIntensity=.15+intensity}
  }
}
function updateSoldierDamageEffects(dt) {
  for(const actor of [...followers,...enemyUnits]){
    if(!actor.userData.alive)continue;
    actor.userData.hitPulse=Math.max(0,(actor.userData.hitPulse||0)-dt*3.8);
    const pulse=actor.userData.hitPulse;
    for(const {material,baseColor,baseEmissive} of actor.userData.damageMaterials??[]){
      if(material.color&&baseColor)material.color.copy(baseColor).lerp(new THREE.Color(0xffe2c2),pulse*.32);
      if(material.emissive){material.emissive.copy(baseEmissive??new THREE.Color()).lerp(new THREE.Color(0xff5533),pulse);material.emissiveIntensity=.12+pulse*2}
    }
  }
}
const DAMAGE_REACTION_DURATION=.42;
function updateActorCombatAnimations(dt){
  for(const actor of [master,...followers,...enemyUnits]){
    const visual=actor.children.find(child=>child.userData.characterVisual);
    if(!visual)continue;
    const phase=actor.userData.duelPhase??DUEL_PHASE.APPROACH;
    const hasLiveTarget=actor.userData.lockedTarget?.userData.alive||actor.userData.meleeTarget?.userData.alive;
    if(!hasLiveTarget&&(phase===DUEL_PHASE.CONTACT||phase===DUEL_PHASE.RECOVER)){
      const next=advanceDuelState({phase,timer:actor.userData.duelTimer??0,distance:Infinity,dt});
      actor.userData.duelPhase=next.phase;actor.userData.duelTimer=next.timer;
      if(next.phase===DUEL_PHASE.APPROACH)actor.userData.meleeTarget=null;
    }
    actor.userData.damageAnim=Math.max(0,(actor.userData.damageAnim??0)-dt);
    const attackPhase=actor.userData.duelPhase??DUEL_PHASE.APPROACH;
    const attackProgress=attackPhaseProgress(attackPhase,actor.userData.duelTimer??0,actor.userData.attackTempo??1);
    const damageActive=actor.userData.damageAnim>0;
    const damageProgress=damageActive?1-actor.userData.damageAnim/DAMAGE_REACTION_DURATION:1;
    const pose=combatVisualPose({attackPhase,attackProgress,damageActive,damageProgress,reducedMotion});
    const basePosition=visual.userData.basePosition??new THREE.Vector3(),baseScale=visual.userData.baseScale??new THREE.Vector3(1,1,1);
    visual.position.copy(basePosition);visual.position.z+=pose.forward;visual.position.y+=pose.lift;
    visual.scale.set(baseScale.x*pose.scaleX,baseScale.y*pose.scaleY,baseScale.z*pose.scaleZ);
  }
}
function updateRecruitRevival(unit,dt) {
  const revival=unit.userData.revival;
  if(!revival)return false;
  const state=advanceRevival({...revival,dt});
  revival.elapsed=state.elapsed;
  if(state.phase==="waiting"){
    unit.position.y=GROUND_Y;unit.userData.velocity.set(0,0,0);setFallenAppearance(unit,true);return true;
  }
  if(!revival.started){
    setCharacterVisual(unit,"playerServant",()=>{const body=roundedBox(.42,1.22,.38,mats.warrior,.1);body.position.y=.03;return body});
    prepareDamageVisual(unit);setFallenAppearance(unit,false);revival.started=true;
  }
  if(state.phase==="complete"){
    for(const {material,baseColor,baseEmissive} of unit.userData.damageMaterials??[]){
      if(material.color&&baseColor)material.color.copy(baseColor);
      if(material.emissive){material.emissive.copy(baseEmissive??new THREE.Color());material.emissiveIntensity=.12}
    }
    unit.position.y=GROUND_Y;unit.scale.setScalar(1);restoreSoldierPose(unit);unit.userData.alive=true;unit.userData.holdPosition=unit.position.clone();delete unit.userData.revival;companyLayoutDirty=true;updateStats();return true;
  }
  const lift=Math.sin(state.progress*Math.PI)*.28;
  unit.position.y=Math.max(GROUND_Y,GROUND_Y+lift+state.hover);
  unit.scale.setScalar(1+Math.sin(state.progress*Math.PI)*.06);
  for(const {material,baseColor,baseEmissive} of unit.userData.damageMaterials??[]){
    if(material.color&&baseColor)material.color.copy(baseColor).lerp(new THREE.Color(0xeaffff),Math.min(.72,state.intensity*.16));
    if(material.emissive){material.emissive.copy(baseEmissive??new THREE.Color()).lerp(new THREE.Color(0x59fff1),.9);material.emissiveIntensity=state.intensity}
  }
  return true;
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
  const gameplayFrame=activeGameplayCameraFrame();
  const floorCenter=gameplayFrame?{x:gameplayFrame.x,z:gameplayFrame.z}:master.position;
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
  if(selectedCompanyId===null)return;
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
  if(selectedCompanyId===null){commandGrid.visible=false;return}
  const center=snapTacticalCell(tacticalSelectionCenter(),COMMAND_CELL,COMMAND_GRID_OFFSET);
  for(let x=-3;x<=3;x++)for(let z=-3;z<=3;z++){
    const cell={x:center.x+x*COMMAND_CELL,z:center.z+z*COMMAND_CELL};
    const blocked=isTacticalCellBlocked(cell);
    const hovered=commandHoverCell&&Math.abs(commandHoverCell.x-cell.x)<.01&&Math.abs(commandHoverCell.z-cell.z)<.01;
    const color=blocked?0xd45d65:hovered?0x62d493:0xe8eee4;
    const opacity=blocked?.3:hovered?.52:.13;
    const mesh=new THREE.Mesh(commandCellGeometry,new THREE.MeshBasicMaterial({color,transparent:true,opacity,depthWrite:false,side:THREE.DoubleSide}));
    mesh.position.set(cell.x,GROUND_Y+.024,cell.z);mesh.renderOrder=39;mesh.userData={commandCell:cell,blocked};commandGrid.add(mesh);
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
  selectedCompanyId=commander.userData.companyId??0;selectedCommander=commander;commandHoverCell=null;
  rebuildSelectionVisuals();refreshCommandGrid();updateDivideControl();showToast(STR.chooseGround,1300);synthTone(465,.12,"sine",.018);
}
function issueCompanyOrder(point){
  if(selectedCompanyId===null)return false;
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
  const profile=commanderCombatProfile(faction==="player"?"player":"enemy");
  g.userData={faction,hp:profile.maxHealth,maxHp:profile.maxHealth,attack:profile.attack,regenDelay:profile.regenDelay,regenPerSecond:profile.regenPerSecond,sinceDamage:99,alive:true,isMaster:true,companyId:0,collisionHalf:actorCollisionProfile("commander"),velocity:new THREE.Vector3(),damageAnim:0,attackTempo:.94+rand()*.12,duelPhase:DUEL_PHASE.APPROACH,duelTimer:0,meleeTarget:null,manualMoving:false,manualTarget:null};
  tintCharacter(g,faction==="player"?COLORS.player:COLORS.coral);prepareDamageVisual(g);makeActorHealthWidget(g,true);showActorHealth(g,profile.maxHealth);return g;
}
function makeUnit(faction="player") {
  const g=new THREE.Group(), key=faction==="player"?"playerServant":"enemyServant";
  setCharacterVisual(g,key,()=>{const body=roundedBox(.42,1.22,.38,mats.warrior,.1);body.position.y=.03;return body});
  const player=faction==="player",maxHp=player?32:25.6,attack=player?10:8;
  g.userData={faction,hp:maxHp,maxHp,attack,alive:true,isMaster:false,unitCommander:false,companyId:0,collisionHalf:actorCollisionProfile("soldier"),velocity:new THREE.Vector3(),phase:rand()*10,mode:SERVANT_MODE.FOLLOW,followState:FOLLOW_AWARENESS.HOLDING,followTimer:0,followThreshold:.38+rand()*.72,responseDelay:.12+rand()*.68,trackingRate:1.8+rand()*2.4,hitPulse:0,damageAnim:0,attackTempo:.94+rand()*.12,duelPhase:DUEL_PHASE.APPROACH,duelTimer:0};
  if(!player)tintCharacter(g,0xe4c45d);
  prepareDamageVisual(g);makeActorHealthWidget(g,false);return g;
}
master=makeMaster(); master.position.set(0,GROUND_Y,4); battle.add(master); target.copy(master.position);
for(let i=0;i<STARTING_SOLDIERS;i++){const u=makeUnit();u.position.copy(formationSlot(i,STARTING_SOLDIERS,master.position,new THREE.Vector3(0,0,-1)));u.position.y=GROUND_Y;u.userData.holdPosition=u.position.clone();battle.add(u);followers.push(u)}

const spawnFrustum=new THREE.Frustum(),spawnProjection=new THREE.Matrix4(),spawnSphere=new THREE.Sphere(new THREE.Vector3(),3.6);
function waveSpawnIsVisible(point){
  camera.updateMatrixWorld(true);
  spawnProjection.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse);
  spawnFrustum.setFromProjectionMatrix(spawnProjection);
  spawnSphere.center.set(point.x,.8,point.z);
  return spawnFrustum.intersectsSphere(spawnSphere);
}
function offscreenWaveSpawn(baseAngle=rand()*Math.PI*2,avoid=[]){
  for(let ring=0;ring<6;ring++){
    const candidates=[];
    for(let i=0;i<16;i++)candidates.push(hiddenWaveSpawn(master.position,baseAngle+i*Math.PI/8,27+ring*12+(i%3)*3));
    const separated=candidates.filter(candidate=>avoid.every(point=>Math.hypot(candidate.x-point.x,candidate.z-point.z)>=18));
    const hidden=chooseHiddenSpawn(master.position,separated,27,waveSpawnIsVisible);
    if(hidden)return hidden;
  }
  const behindCamera=new THREE.Vector3().subVectors(camera.position,master.position).setY(0);
  if(behindCamera.lengthSq()<.001)behindCamera.set(1,0,0);
  behindCamera.normalize().multiplyScalar(96).add(master.position);
  if(avoid.some(point=>Math.hypot(behindCamera.x-point.x,behindCamera.z-point.z)<18)){
    const side=new THREE.Vector3(-behindCamera.z+master.position.z,0,behindCamera.x-master.position.x).normalize().multiplyScalar(28);
    behindCamera.add(side);
  }
  return {x:behindCamera.x,z:behindCamera.z};
}
function currentPlayerThreat(){
  const living=followers.filter(u=>u.userData.alive);
  const averageHealth=living.length?living.reduce((sum,u)=>sum+u.userData.hp/u.userData.maxHp,0)/living.length:0;
  return playerThreatScore({
    livingSoldiers:living.length,
    averageSoldierHealthRatio:averageHealth,
    commanderHealthRatio:masterHealth/PLAYER_COMMANDER.maxHealth
  });
}
function spawnWave(count=null,initial=false){
  enemyUnits.forEach(u=>battle.remove(u)); enemyUnits=[];
  waveNumber++;
  commanderHearts=3;waitingForRecruitRevival=false;updateHearts();
  const director=initial
    ? {soldierCount:count??STARTING_SOLDIERS,swarmCount:1,swarmSizes:[count??STARTING_SOLDIERS],threatBudget:count??STARTING_SOLDIERS}
    : difficultyEncounter({wave:waveNumber,playerThreat:currentPlayerThreat(),fluctuationRoll:rand()});
  count=count??director.soldierCount;
  const faction=waveNumber%2?FACTION.CORAL:FACTION.AMBER;
  const baseAngle=rand()*Math.PI*2;
  const swarmSpawns=[];
  director.swarmSizes.forEach((swarmSize,swarmIndex)=>{
    const spawn=initial?{x:0,z:-5.2}:offscreenWaveSpawn(baseAngle+swarmIndex*Math.PI*.78,swarmSpawns);
    swarmSpawns.push(spawn);
    const center=new THREE.Vector3(spawn.x,GROUND_Y,spawn.z);
    const rival=makeMaster(faction);rival.position.copy(center);rival.userData.anchor=center.clone();rival.userData.swarm=swarmIndex;battle.add(rival);enemyUnits.push(rival);
    const approach=master.position.clone().sub(center).setY(0).normalize();
    for(let i=0;i<swarmSize;i++){
      const u=makeUnit(faction);
      u.position.copy(formationSlot(i,swarmSize,center,approach));
      u.position.y=GROUND_Y;u.userData.swarm=swarmIndex;u.userData.leader=rival;battle.add(u);enemyUnits.push(u);
    }
  });
  activeEncounter={regionId:selectedRegion,faction,totalServants:count,aggro:false,approachDistance:Infinity,formationTime:0,done:false,victoryResolved:false,wave:waveNumber,swarmCount:director.swarmCount,threatBudget:director.threatBudget};
}
spawnWave(STARTING_SOLDIERS,true);updateFloorTiles();

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
  unit.userData.lockedTarget=null;unit.userData.duelRole=null;unit.userData.faceoffCenter=null;unit.userData.faceoffAxis=null;unit.userData.faceoffHold=null;
  unit.userData.lastTargetPosition=null;unit.userData.duelTurnId=null;unit.userData.meleeTarget=null;
  unit.userData.duelPhase=DUEL_PHASE.APPROACH;unit.userData.duelTimer=0;unit.userData.duelResponseDelay=0;unit.userData.pathPreviousDistance=Infinity;unit.userData.pathStallTimer=0;unit.userData.pathFailures=0;unit.scale.set(1,1,1);
}
function releaseStaleDuel(unit){
  const foe=unit.userData.lockedTarget;
  resetDuel(unit);unit.userData.seekingTarget=true;
  if(foe?.userData.lockedTarget===unit){resetDuel(foe);foe.userData.seekingTarget=true}
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
  unit.userData.lockedTarget=foe;unit.userData.duelRole=role;unit.userData.faceoffCenter=center;unit.userData.faceoffAxis=axis;
  unit.userData.lastTargetPosition=foe.position.clone();
  unit.userData.seekingTarget=false;
  unit.userData.faceoffHold=center.clone().addScaledVector(axis,role==="primary"?.68:1.38);
  unit.userData.duelPhase=DUEL_PHASE.APPROACH;unit.userData.duelTimer=0;
}
function finishingMelee(unit){
  return !unit.userData.lockedTarget?.userData.alive
    &&(unit.userData.duelPhase===DUEL_PHASE.CONTACT||unit.userData.duelPhase===DUEL_PHASE.RECOVER);
}
function assignEngagements(sideA,sideB){
  const a=sideA.filter(u=>u.userData.alive&&!finishingMelee(u)),b=sideB.filter(u=>u.userData.alive&&!finishingMelee(u)),aMap=new Map(),bMap=new Map();
  for(const unit of a)if(b.includes(unit.userData.lockedTarget))aMap.set(unit,unit.userData.lockedTarget);
  for(const unit of b)if(a.includes(unit.userData.lockedTarget))bMap.set(unit,unit.userData.lockedTarget);
  while(a.some(u=>!aMap.has(u))&&b.some(u=>!bMap.has(u))){
    let bestA=null,bestB=null,bestDistance=Infinity;
    for(const left of a)if(!aMap.has(left))for(const right of b)if(!bMap.has(right)){
      const distance=left.position.distanceToSquared(right.position);
      if(distance<bestDistance){bestDistance=distance;bestA=left;bestB=right}
    }
    const center=bestA.position.clone().add(bestB.position).multiplyScalar(.5);
    lockDuel(bestA,bestB,"primary",0,center);lockDuel(bestB,bestA,"primary",0,center);
    const firstAttacker=((bestA.id+bestB.id)&1)===0?bestA:bestB;
    bestA.userData.duelTurnId=firstAttacker.id;bestB.userData.duelTurnId=firstAttacker.id;
    aMap.set(bestA,bestB);bMap.set(bestB,bestA);
  }
  return {aMap,bMap};
}
function clearInvalidDuels(units){
  for(const unit of units){
    const foe=unit.userData.lockedTarget;
    if(foe&&!foe.userData.alive){
      const phase=unit.userData.duelPhase,timer=unit.userData.duelTimer;
      const preserveRecovery=phase===DUEL_PHASE.CONTACT||phase===DUEL_PHASE.RECOVER;
      resetDuel(unit);
      if(preserveRecovery){unit.userData.duelPhase=phase;unit.userData.duelTimer=timer}
      unit.userData.seekingTarget=true;
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
function reinforceCommander(units,commander,map){
  if(!commander?.userData.alive)return;
  let slot=0;
  for(const unit of units)if(unit.userData.alive&&!map.has(unit)){
    if(finishingMelee(unit))continue;
    lockDuel(unit,commander,slot===0?"primary":"support",slot++);map.set(unit,commander);
  }
}
function reinforceCommanders(units,commanders,map){
  for(const unit of units){
    if(!unit.userData.alive||map.has(unit)||finishingMelee(unit))continue;
    const commander=nearestAlive(unit,commanders);if(!commander)continue;
    lockDuel(unit,commander,"support",0);map.set(unit,commander);
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
    const aWeight=a.userData.isMaster&&!b.userData.isMaster?.25:b.userData.isMaster&&!a.userData.isMaster?1.75:1;
    const bWeight=b.userData.isMaster&&!a.userData.isMaster?.25:a.userData.isMaster&&!b.userData.isMaster?1.75:1;
    a.position.x+=correction.ax*aWeight;a.position.z+=correction.az*aWeight;b.position.x+=correction.bx*bWeight;b.position.z+=correction.bz*bWeight;
    if(correction.ax){
      if(a.userData.velocity.x*correction.ax<0)a.userData.velocity.x=0;
      if(b.userData.velocity.x*correction.bx<0)b.userData.velocity.x=0;
    }
    if(correction.az){
      if(a.userData.velocity.z*correction.az<0)a.userData.velocity.z=0;
      if(b.userData.velocity.z*correction.bz<0)b.userData.velocity.z=0;
    }
  }
}
function dealDamage(attacker,victim){
  if(!attacker.userData.alive||!victim.userData.alive||attacker.userData.faction===victim.userData.faction)return false;
  const previousHealth=victim.userData.hp;
  victim.userData.hp-=attacker.userData.attack;
  if(victim.userData.isMaster)victim.userData.sinceDamage=0;
  showActorHealth(victim,previousHealth);
  const knockback=hitKnockback(attacker.position,victim.position,victim.userData.isMaster?.62:.92);
  victim.userData.velocity.add(new THREE.Vector3(knockback.x,0,knockback.z));
  burst(victim.position,attacker.userData.faction); if(rand()<.22)synthTone(125+rand()*70,.08,"triangle",.018);
  victim.userData.damageAnim=DAMAGE_REACTION_DURATION;victim.userData.hitPulse=1;
  if(victim===master){
    masterHealth=Math.max(0,victim.userData.hp);sinceDamage=0;damagePulse=Math.min(1.65,damagePulse+.62);damageStacks=Math.min(6,damageStacks+1);
  }
  if(victim.userData.hp<=0){
    victim.userData.alive=false;victim.userData.velocity?.set(0,0,0);
    if(victim.userData.isMaster){
      playSound("death");
      if(victim===master){commanderHearts=Math.max(0,commanderHearts-1);updateHearts()}
      shatterCommander(victim);victim.visible=false
    }
    else if(victim.userData.faction==="player"){playSound("death");shatterSoldier(victim);victim.visible=false}
    else setFallenAppearance(victim,true);
    if(victim.userData.faction==="player"&&followers.includes(victim)){companyLayoutDirty=true;updateStats()}
  }
  return true;
}
function resetMeleeAttack(attacker){
  if(attacker.userData.duelPhase===DUEL_PHASE.APPROACH&&attacker.userData.duelTimer===0&&!attacker.userData.meleeTarget)return;
  attacker.userData.duelPhase=DUEL_PHASE.APPROACH;
  attacker.userData.duelTimer=0;
  attacker.userData.meleeTarget=null;
}
function updateCommanderMelee(attacker,victim,actors,dt){
  const previousTarget=attacker.userData.meleeTarget;
  const finishingStrike=previousTarget&&!previousTarget.userData.alive
    &&(attacker.userData.duelPhase===DUEL_PHASE.CONTACT||attacker.userData.duelPhase===DUEL_PHASE.RECOVER);
  if(finishingStrike){
    return {desired:attacker.position.clone(),speed:0,acceleration:6.5};
  }
  if(!victim?.userData.alive){
    resetMeleeAttack(attacker);
    return {desired:attacker.position.clone(),speed:0,acceleration:5.2};
  }
  if(attacker.userData.meleeTarget!==victim){
    resetMeleeAttack(attacker);
    attacker.userData.meleeTarget=victim;
  }
  const hold=commanderRoute(attacker,victim,actors);
  const distance=attacker.position.distanceTo(hold);
  const strikeDistance=attacker.position.distanceTo(victim.position);
  const next=advanceDuelState({
    phase:attacker.userData.duelPhase??DUEL_PHASE.APPROACH,
    timer:attacker.userData.duelTimer??0,
    distance,
    strikeDistance,
    strikeRange:1.05,
    tempo:attacker.userData.attackTempo??1,
    dt
  });
  attacker.userData.duelPhase=next.phase;
  attacker.userData.duelTimer=next.timer;
  const away=attacker.position.clone().sub(victim.position).setY(0);
  if(away.lengthSq()<.001)away.set(0,0,1);else away.normalize();
  let desired=hold.clone(),speed=1.55,acceleration=4.4;
  if(next.phase===DUEL_PHASE.ANTICIPATE){
    desired=hold.clone().addScaledVector(away,.06);speed=1.15;acceleration=4.2;
  }else if(next.phase===DUEL_PHASE.LUNGE){
    desired=victim.position.clone().addScaledVector(away,.62);speed=3.8;acceleration=14;
  }else if(next.phase===DUEL_PHASE.CONTACT){
    desired=attacker.position.clone();speed=0;acceleration=9;
  }else if(next.phase===DUEL_PHASE.RECOVER){
    desired=hold.clone().addScaledVector(away,.08);speed=1.75;acceleration=6.5;
  }
  if(next.strike&&victim.userData.alive){
    const valid=canApplyAttackDamage({
      attackerAlive:attacker.userData.alive,
      victimAlive:victim.userData.alive,
      opposingFactions:attacker.userData.faction!==victim.userData.faction,
      cooldown:0,
      distance:strikeDistance,
      range:1.05
    });
    if(valid)dealDamage(attacker,victim);
  }
  return {desired,speed,acceleration};
}
function updateDuel(unit,foe,dt){
  const data=unit.userData;
  data.duelPhase??=DUEL_PHASE.APPROACH;data.duelTimer??=0;data.attackSequence??=0;
  data.duelResponseDelay=Math.max(0,(data.duelResponseDelay??0)-dt);
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
  const mayAdvance=canAdvanceDuelAttack({
    phase:data.duelPhase,
    hasTurn:!mutual||data.duelTurnId===unit.id,
    responseDelay:data.duelResponseDelay
  });
  const next=mayAdvance
    ?advanceDuelState({phase:data.duelPhase,timer:data.duelTimer,distance,strikeDistance,strikeRange,tempo:data.attackTempo??1,dt})
    :{phase:DUEL_PHASE.APPROACH,timer:0,strike:false};
  data.duelPhase=next.phase;data.duelTimer=next.timer;
  const away=data.faceoffAxis??unit.position.clone().sub(foe.position).setY(0).normalize();
  let desired=hold.clone(),speed=2.15,acceleration=5.4;
  if(next.phase===DUEL_PHASE.APPROACH){
    desired=hold.clone();speed=2.1;acceleration=5.2;
  }else if(next.phase===DUEL_PHASE.ANTICIPATE){
    desired=hold.clone().addScaledVector(away,.07);speed=1.25;acceleration=4.4;
  }else if(next.phase===DUEL_PHASE.LUNGE){
    const lungeStandOff=foe.userData.isMaster?.88:.72;
    const lungeAxis=unit.position.clone().sub(foe.position).setY(0);
    if(lungeAxis.lengthSq()<.001)lungeAxis.copy(away);else lungeAxis.normalize();
    desired=foe.position.clone().addScaledVector(lungeAxis,lungeStandOff);speed=3.8;acceleration=14;
  }else if(next.phase===DUEL_PHASE.CONTACT){
    desired=unit.position.clone();speed=0;acceleration=9;
  }else{
    desired=hold.clone().addScaledVector(away,.16);speed=2.15;acceleration=6.6;
  }
  if(next.strike&&foe.userData.alive){
    const sequence=data.attackSequence++,landed=duelAttackHits(sequence);
    const distance=unit.position.distanceTo(foe.position);
    const valid=canApplyAttackDamage({attackerAlive:data.alive,victimAlive:foe.userData.alive,opposingFactions:data.faction!==foe.userData.faction,cooldown:0,distance,range:strikeRange});
    const strikeLanded=valid&&landed&&dealDamage(unit,foe);
    if(mutual&&strikeLanded&&foe.userData.alive){
      const turnId=nextDuelTurn({attackerId:unit.id,defenderId:foe.id,strikeLanded:true});
      data.duelTurnId=turnId;foe.userData.duelTurnId=turnId;
      foe.userData.duelPhase=DUEL_PHASE.APPROACH;foe.userData.duelTimer=0;
      foe.userData.duelResponseDelay=ATTACK_TIMING.contact+ATTACK_TIMING.recover;
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
    start:unit.position,goal:desired,obstacles,clearance:.48,lookAhead:1.65,preferLeft:(unit.id&1)===0
  });
  return detour?new THREE.Vector3(detour.x,desired.y,detour.z):desired;
}
function activeParticleCount(){let count=0;for(const particle of particles)if(particle.visible)count++;return count}
function burst(pos,faction){
  const color=COLORS[faction]||COLORS.player;
  for(let i=0;i<5;i++){if(!particleBudgetAllows(activeParticleCount(),MAX_ACTIVE_PARTICLES))break;let p=particles.find(x=>!x.visible&&x.userData.kind==="hit");if(!p){p=new THREE.Mesh(new THREE.TetrahedronGeometry(.09),mat(color));p.userData.kind="hit";particles.push(p);battle.add(p)}p.material.color.setHex(color);p.position.copy(pos);p.position.y=.8;p.userData.life=.45;p.userData.maxLife=.45;p.userData.vel=new THREE.Vector3((rand()-.5)*2,1+rand()*1.8,(rand()-.5)*2);p.userData.spin=null;p.visible=true}shake=reducedMotion?0:.07;
}
function shatterCommander(commander){
  const count=10+Math.floor(rand()*7),palette=commander.userData.faction==="player"?[0x247bff,0x103e9c,0x34383a]:[0xd92f43,0x8b1f2d,0x3b3437];
  for(let i=0;i<count;i++){
    if(!particleBudgetAllows(activeParticleCount(),MAX_ACTIVE_PARTICLES))break;
    const size=.07+rand()*.11,p=new THREE.Mesh(new THREE.BoxGeometry(size,size,size),mat(palette[i%palette.length],.9));
    p.position.copy(commander.position);p.position.y+=.78+rand()*.45;
    const angle=rand()*Math.PI*2,speed=.9+rand()*2.1;
    const life=3.8+rand()*1.2;
    p.userData={kind:"shatter",life,maxLife:life,halfSize:size*.5,bounces:0,settled:false,vel:new THREE.Vector3(Math.cos(angle)*speed,2+rand()*2.8,Math.sin(angle)*speed),spin:new THREE.Vector3((rand()-.5)*9,(rand()-.5)*9,(rand()-.5)*9)};
    p.castShadow=true;particles.push(p);battle.add(p);
  }
  shake=reducedMotion?0:.16;synthTone(72,.38,"sawtooth",.04);
}
function shatterSoldier(soldier){
  const count=soldierFragmentCount(rand()),palette=[0x35c9c2,0x4383bd,0xf7f2e4];
  for(let i=0;i<count;i++){
    if(!particleBudgetAllows(activeParticleCount(),MAX_ACTIVE_PARTICLES))break;
    const size=.045+rand()*.065,p=new THREE.Mesh(new THREE.BoxGeometry(size,size,size),mat(palette[i%palette.length],.9));
    p.position.copy(soldier.position);p.position.y+=.45+rand()*.5;
    const angle=rand()*Math.PI*2,speed=.55+rand()*1.45;
    const life=3.2+rand();
    p.userData={kind:"shatter",life,maxLife:life,halfSize:size*.5,bounces:0,settled:false,vel:new THREE.Vector3(Math.cos(angle)*speed,1.35+rand()*1.85,Math.sin(angle)*speed),spin:new THREE.Vector3((rand()-.5)*10,(rand()-.5)*10,(rand()-.5)*10)};
    p.castShadow=true;particles.push(p);battle.add(p);
  }
  shake=reducedMotion?0:.09;synthTone(105,.16,"triangle",.025);
}
function updateParticles(dt){
  for(let index=particles.length-1;index>=0;index--){
    const p=particles[index];
    if(!p.visible)continue;
    p.userData.life-=dt;
    if(p.userData.life<=0){
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
      p.scale.setScalar(p.userData.life<.45?p.userData.life/.45:1);
      continue;
    }
    p.position.addScaledVector(p.userData.vel,dt);p.userData.vel.y-=4*dt;
    if(p.userData.spin){p.rotation.x+=p.userData.spin.x*dt;p.rotation.y+=p.userData.spin.y*dt;p.rotation.z+=p.userData.spin.z*dt}
    p.scale.setScalar(Math.min(1,p.userData.life/(p.userData.maxLife||.45)));
  }
}

function resetPlayerArmyAfterDefeat(){
  const plan=defeatRosterPlan(followers.length,STARTING_SOLDIERS);
  const retained=followers.slice(0,plan.keep),removed=followers.slice(plan.keep);
  removed.forEach(unit=>battle.remove(unit));
  followers=retained;
  for(let i=0;i<plan.spawn;i++){
    const unit=makeUnit();
    battle.add(unit);followers.push(unit);
  }
  const forward=new THREE.Vector3(0,0,-1);
  followers.forEach((unit,index)=>{
    setCharacterVisual(unit,"playerServant",()=>{const body=roundedBox(.42,1.22,.38,mats.warrior,.1);body.position.y=.03;return body});
    unit.userData.faction="player";unit.userData.unitCommander=false;unit.userData.isMaster=false;unit.userData.companyId=0;
    unit.userData.hp=32;unit.userData.maxHp=32;unit.userData.attack=10;
    unit.userData.alive=true;unit.userData.leader=null;unit.userData.revival=null;unit.userData.seekingTarget=false;
    unit.userData.velocity.set(0,0,0);unit.userData.mode=SERVANT_MODE.FOLLOW;
    unit.userData.followAnchor=null;unit.userData.followState=FOLLOW_AWARENESS.HOLDING;unit.userData.followTimer=0;
    resetDuel(unit);setFallenAppearance(unit,false);restoreSoldierPose(unit);prepareDamageVisual(unit);
    if(unit.userData.healthWidget)unit.remove(unit.userData.healthWidget);makeActorHealthWidget(unit,false);
    unit.position.copy(formationSlot(index,STARTING_SOLDIERS,master.position,forward));unit.position.y=GROUND_Y;
    unit.userData.holdPosition=unit.position.clone();
    unit.visible=true;
    unit.userData.healthWidget.visible=false;
  });
  target.copy(master.position);companyLayoutDirty=true;updateStats();
}

function completeEnemyDefeat(){
  if(!activeEncounter||activeEncounter.victoryResolved)return;
  activeEncounter.victoryResolved=true;activeEncounter.done=true;
  const rivals=enemyUnits.filter(u=>u.userData.isMaster);
  const recruits=enemyUnits.filter(u=>!u.userData.isMaster);
  const recruitPopulations=ensureCompanyLayout().map(company=>company.soldiers.length);
  recruits.forEach((u,i)=>{
    u.visible=true;u.userData.alive=false;u.userData.faction="player";u.userData.hp=32;u.userData.maxHp=32;u.userData.attack=10;u.userData.velocity.set(0,0,0);
    u.userData.leader=null;u.userData.isMaster=false;u.userData.unitCommander=false;
    u.userData.companyId=recruitPopulations.indexOf(Math.min(...recruitPopulations));recruitPopulations[u.userData.companyId]++;
    if(u.userData.healthWidget){u.userData.healthWidget.visible=false;u.userData.healthWidget.userData.main.material.color.setHex(COLORS.player)}
    const revivalTiming=recruitRevivalTiming(i);
    resetDuel(u);u.userData.seekingTarget=false;u.userData.followAnchor=null;u.userData.followState=FOLLOW_AWARENESS.HOLDING;u.userData.followTimer=0;u.userData.mode=SERVANT_MODE.FOLLOW;u.userData.revival={elapsed:0,...revivalTiming,started:false};u.position.y=GROUND_Y;
    if(!followers.includes(u)){followers.push(u);companyLayoutDirty=true}
  });
  rivals.forEach(rival=>battle.remove(rival));enemyUnits=[];
  waitingForRecruitRevival=recruits.length>0;nextWaveTimer=waitingForRecruitRevival?0:1.2;
  playSound("convert");showToast(STR.converted,2600);updateStats();
}
function resolveBattle(){
  if(!activeEncounter)return;
  const state=encounterResolutionState({
    hasEncounter:true,
    encounterDone:activeEncounter.done,
    playerAlive:masterHealth>0&&master.userData.alive,
    enemyRosterCount:enemyUnits.length,
    livingEnemyCount:enemyUnits.filter(u=>u.userData.alive).length
  });
  if(state==="victory"){completeEnemyDefeat();return}
  if(state==="paused")return;
  if(state==="respawn"){
    const defeatedEncounter=activeEncounter;
    defeatedEncounter.done=true;showToast(STR.retreat,2500);
    setTimeout(()=>{
      if(activeEncounter!==defeatedEncounter)return;
      masterHealth=PLAYER_COMMANDER.maxHealth;damagePulse=0;damageStacks=0;
      master.userData.hp=PLAYER_COMMANDER.maxHealth;master.userData.sinceDamage=99;master.userData.alive=true;master.userData.velocity.set(0,0,0);
      master.userData.manualMoving=false;master.userData.manualTarget=null;resetMeleeAttack(master);
      setFallenAppearance(master,false);master.visible=true;resetPlayerArmyAfterDefeat();
      defeatedEncounter.done=false;
      resolveBattle();
    },1800);
    return;
  }
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
    resetMeleeAttack(commander);
    desired.copy(commanderOrder?(commander.userData.manualTarget??commander.position):(anchor.commanderTarget??formationPoint(anchor,commanderFormationOffset(1.42))));speed=2.15;acceleration=6.4;
  }else if(control==="engage"&&(livingRivals.length||livingEnemySoldiers.length)){
    foe=commanderTargets.get(commander)??nearestAlive(commander,livingEnemySoldiers)??nearestAlive(commander,livingRivals);
    if(foe){
      let strikeTarget=commander.userData.meleeTarget;
      if(!strikeTarget?.userData.alive){
        const blockerIndex=chooseCommanderBlockerIndex({
          commander:commander.position,target:foe.position,
          soldiers:livingEnemySoldiers.map(soldier=>({x:soldier.position.x,z:soldier.position.z,alive:true,threatening:soldier.userData.lockedTarget===commander}))
        });
        strikeTarget=blockerIndex>=0?livingEnemySoldiers[blockerIndex]:foe;
      }
      const melee=updateCommanderMelee(commander,strikeTarget,routeActors,dt);
      desired.copy(melee.desired);speed=melee.speed;acceleration=melee.acceleration;
    }
  }else{
    resetMeleeAttack(commander);
    desired.copy(commander.position);speed=0;
  }
  steerTowards(commander,desired,speed,acceleration,dt);
  if(commanderOrder&&commander.position.distanceTo(desired)<.08){
    commander.userData.manualMoving=false;commander.userData.manualTarget=null;commander.userData.velocity.set(0,0,0);
  }
  if(foe){const facing=foe.position.clone().sub(commander.position);if(facing.lengthSq()>.001)commander.rotation.y=smoothAngle(commander.rotation.y,Math.atan2(facing.x,facing.z),12,dt)}
  commander.position.y=GROUND_Y;
}
function updateBattle(dt){
  const revivalState=revivalProgressionState({
    waitingForRecruits:waitingForRecruitRevival,
    revivingFollowerCount:followers.filter(u=>u.userData.revival).length
  });
  if(revivalState==="advance"){waitingForRecruitRevival=false;settleCompanyAnchors();nextWaveTimer=1.2}
  if(nextWaveTimer>0){nextWaveTimer-=dt;if(nextWaveTimer<=0)spawnWave()}
  const masterDirectOrder=!!master.userData.manualMoving,masterManualOrder=masterDirectOrder||ensureCompanyAnchor(0).moving;
  if(masterManualOrder)steerTowards(master,target,2.15,5.2,dt);
  master.position.y=GROUND_Y;
  if(masterDirectOrder&&master.position.distanceTo(target)<.08){
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
  if(activeEncounter)activeEncounter.approachDistance=approachDistance;
  const approachState=battleApproachState({distance:approachDistance,detectionRadius:9.5,aggroRadius:6.2});
  if(activeEncounter&&!activeEncounter.done&&!activeEncounter.aggro&&approachState==="combat")activeEncounter.aggro=true;
  const combat=activeEncounter?.aggro&&enemyUnits.some(u=>u.userData.alive);
  const preparingForContact=!!activeEncounter&&!activeEncounter.done&&!combat&&approachState==="deploy";
  if(combat&&!wasCombat){
    for(const anchor of companyAnchors.values())if(!anchor.moving)anchor.deployTimer=Math.max(anchor.deployTimer??0,.65);
  }else if(!combat&&wasCombat)settleCompanyAnchors();
  wasCombat=combat;
  if(combat||preparingForContact)activeEncounter.formationTime=(activeEncounter.formationTime??0)+dt;
  const forward=master.userData.velocity.lengthSq()>.03?master.userData.velocity.clone().normalize():new THREE.Vector3(0,0,-1);
  const livingEnemies=enemyUnits.filter(u=>u.userData.alive);
  const livingEnemySoldiers=livingEnemies.filter(u=>!u.userData.isMaster);
  const enemyEvading=false;
  const masterAway=rival?master.position.clone().sub(rival.position).setY(0).normalize():new THREE.Vector3();
  const masterRetreating=combat&&rival&&master.userData.velocity.dot(masterAway)>.35;
  const enemyMasterRetreating=!!rival&&enemyEvading;
  const livingFollowers=followers.filter(u=>u.userData.alive);
  const livingPlayerCommanders=[master,...livingFollowers.filter(u=>u.userData.unitCommander)].filter(u=>u.userData.alive);
  const livingPlayerSoldiers=livingFollowers.filter(u=>!u.userData.unitCommander);
  const companies=ensureCompanyLayout(),companyCount=companies.length;
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
  const {formingBattleLine}=battlePreparationState({combat:combat||preparingForContact,formationTime:activeEncounter?.formationTime??0,livingFollowerCount:livingPlayerSoldiers.length,livingEnemySoldierCount:livingEnemySoldiers.length});
  clearInvalidDuels([...followers,...enemyUnits]);
  if(shouldReleaseCombatCommitment(combat,livingEnemies.length))releasePlayerCombatCommitment();
  const commandableFollowers=livingPlayerSoldiers.filter(unit=>{
    const anchor=ensureCompanyAnchor(unit.userData.companyId??0);
    const company=companies[unit.userData.companyId??0]??companies[0];
    const locked=!!unit.userData.lockedTarget?.userData.alive;
    const commanderMovingIndependently=!!company?.commander?.userData.manualMoving;
    return !finishingMelee(unit)&&!anchor.moving&&(anchor.deployTimer??0)<=0&&(!commanderMovingIndependently||locked);
  });
  const playerOpponents=prioritizedOpponents(livingEnemySoldiers,rival);
  const enemyOpponents=prioritizedOpponents(commandableFollowers,nearestAlive(rival??master,livingPlayerCommanders));
  const soldierVersusSoldier=playerOpponents[0]&&!playerOpponents[0].userData.isMaster&&enemyOpponents[0]&&!enemyOpponents[0].userData.isMaster;
  const engagements=combat&&!formingBattleLine&&soldierVersusSoldier?assignEngagements(commandableFollowers,livingEnemySoldiers):{aMap:new Map(),bMap:new Map()};
  if(combat){
    const playerAllocation=engagementAllocation(commandableFollowers.length,livingEnemySoldiers.length);
    const enemyAllocation=engagementAllocation(livingEnemySoldiers.length,commandableFollowers.length);
    if(livingRivals.length&&(livingEnemySoldiers.length===0||(!formingBattleLine&&playerAllocation.commanderAssaults>0)))reinforceCommanders(commandableFollowers,livingRivals,engagements.aMap);
    if(livingPlayerCommanders.length&&(livingPlayerSoldiers.length===0||(!formingBattleLine&&enemyAllocation.commanderAssaults>0)))reinforceCommanders(livingEnemySoldiers,livingPlayerCommanders,engagements.bMap);
  }
  const playerAssignments=engagements.aMap,enemyAssignments=engagements.bMap;
  const activeSoldierDuels=livingPlayerSoldiers.some(u=>livingEnemySoldiers.includes(u.userData.lockedTarget));
  if(activeSoldierDuels)activeEncounter.commanderDuelTime=(activeEncounter.commanderDuelTime??0)+dt;
  else activeEncounter.commanderDuelTime=0;
  const routeActors=[master,...livingFollowers,...livingEnemies];
  const playerCommanderTargets=assignCommanderTargets(
    livingPlayerCommanders,[...livingEnemySoldiers,...livingRivals],
    commander=>commander===master
  );
  const enemyCommanderTargets=assignCommanderTargets(
    livingRivals,[...livingPlayerSoldiers,...livingPlayerCommanders],
    ()=>true
  );
  const masterFoe=combat?(playerCommanderTargets.get(master)??rival??nearestAlive(master,livingEnemies)):null;
  if(masterFoe){
    if(commanderControlState({combat,manualOrder:!!master.userData.manualMoving||ensureCompanyAnchor(0).moving})==="engage"){
      let strikeTarget=master.userData.meleeTarget;
      if(!strikeTarget?.userData.alive){
        const blockerIndex=chooseCommanderBlockerIndex({
          commander:master.position,target:masterFoe.position,
          soldiers:livingEnemySoldiers.map(soldier=>({x:soldier.position.x,z:soldier.position.z,alive:true,threatening:soldier.userData.lockedTarget===master}))
        });
        strikeTarget=blockerIndex>=0?livingEnemySoldiers[blockerIndex]:masterFoe;
      }
      const melee=updateCommanderMelee(master,strikeTarget,routeActors,dt);
      steerTowards(master,melee.desired,melee.speed,melee.acceleration,dt);
    }else resetMeleeAttack(master);
  }else{
    resetMeleeAttack(master);
    if(!masterManualOrder)steerTowards(master,master.position,0,5.2,dt);
  }
  followers.forEach((u,i)=>{
    if(updateRecruitRevival(u,dt))return;
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
    if(manualOrder&&(u.userData.lockedTarget||u.userData.seekingTarget))resetDuel(u);
    const committed=!manualOrder&&!companyDeploying&&(!!u.userData.lockedTarget?.userData.alive||u.userData.seekingTarget);
    u.userData.mode=chooseServantMode({combat,masterRetreating,distanceToMaster,attackLeash:4.5,locked:committed});
    let foe=!manualOrder&&!companyDeploying&&u.userData.mode===SERVANT_MODE.ATTACK?playerAssignments.get(u):null;
    const emergencyFollow=!committed&&(masterRetreating||distanceToMaster>5.1);
    const observed=observedLeader(u,leader,leaderForward,dt,emergencyFollow);
    let reposition=!committed&&shouldRepositionFollower({combat,urgent:emergencyFollow,leaderSpeed:leader.userData.velocity.length(),distanceToMaster,leash:4.2});
    const travelIndex=localIndex*companyCount+u.userData.companyId;
    let desired=reposition?travelFormationSlot(Math.max(0,travelIndex),livingFollowers.length,observed.position,observed.forward):u.position.clone(),duelMotion=null;
    if(reposition){desired.x+=Math.sin(totalTime*.72+u.userData.phase)*.12;desired.z+=Math.cos(totalTime*.61+u.userData.phase)*.12}
    const ownCommanderLeading=companyLeaderMoving.get(company.groupIndex);
    const commandState=companyCommandState({manualOrder,combat,enemyDetected:companyDeploying||preparingForContact,commanderMoving:ownCommanderLeading||anchor.followingCommander});
    if(manualOrder){
      const offset=companyFormationOffset(localIndex,company.soldiers.length,1.42);
      desired.copy(formationPoint(anchor,offset));
      const arrived=u.position.distanceTo(desired)<.14;
      reposition=!arrived;u.userData.holdPosition=arrived?desired.clone():null;
    }else if(!combat&&!preparingForContact){
      if(commandState==="follow"){
        const offset=companyFormationOffset(localIndex,company.soldiers.length,1.42);
        const movingAnchor={position:observed.position,forward:observed.forward};
        desired=formationPoint(movingAnchor,offset);
        const arrived=u.position.distanceTo(desired)<.1;
        u.userData.holdPosition=arrived?desired.clone():null;
        anchor.followingCommander=ownCommanderLeading||!arrived;
        reposition=!arrived;
      }
    }
    if((formingBattleLine||companyDeploying)&&livingRivals.length&&!manualOrder){
      const lineOrigin=companyDeploying?anchor.position:leader.position;
      const formationRival=nearestAlive(lineOrigin,livingRivals);
      const advance=formationRival.position.clone().sub(lineOrigin).setY(0).normalize(),lateral=new THREE.Vector3(-advance.z,0,advance.x);
      const lineIndex=localIndex,lineCount=company.soldiers.length;
      desired=lineOrigin.clone().addScaledVector(advance,-.35).addScaledVector(lateral,battleLineOffset(Math.max(0,lineIndex),lineCount,battleLineSpacing(lineCount)));
      reposition=true;foe=null;
    }
    if(foe?.userData.alive){
      duelMotion=updateDuel(u,foe,dt);
      if(!u.userData.alive)return;
      if(duelPathNeedsRelock(u,duelMotion.desired,dt)){releaseStaleDuel(u);foe=null;duelMotion=null;desired=u.position.clone()}
      else desired=routeLockedDesired(u,duelMotion.desired,foe);
    }
    else if(u.userData.lockedTarget)resetDuel(u);
    const spacingProfile=soldierSpacingProfile(!!duelMotion,livingPlayerSoldiers.length);
    const spacing=separationVector(u.position,[...livingPlayerCommanders,...livingPlayerSoldiers.filter(v=>v!==u)],spacingProfile.distance);
    const spacingActive=spacing.x*spacing.x+spacing.z*spacing.z>.0004;
    desired.x+=spacing.x*spacingProfile.strength;desired.z+=spacing.z*spacingProfile.strength;
    if(combat)for(const allyCommander of livingPlayerCommanders){
      const commanderForward=allyCommander.userData.velocity.lengthSq()>.03?allyCommander.userData.velocity.clone().normalize():forward;
      const clearance=commanderClearanceVector({soldier:u.position,commander:allyCommander.position,forward:commanderForward,preferRight:(u.id&1)===0});
      desired.x+=clearance.x*1.78;desired.z+=clearance.z*1.78;
    }
    if(combat&&!formingBattleLine&&!manualOrder&&!companyDeploying&&!duelMotion&&reposition)leashTarget(desired,leader,swarmTravelRadius(company.soldiers.length));
    const catchup=Math.min(1.45,Math.max(0,distanceToMaster-2.2)*.65);
    const speed=duelMotion?.speed??(u.userData.mode===SERVANT_MODE.ATTACK?2.45:2.65+catchup);
    const acceleration=duelMotion?.acceleration??(u.userData.mode===SERVANT_MODE.ATTACK?5.7:reposition?7.2:4.2);
    const spacingSpeed=spacingActive&&!reposition&&!foe?1.05:speed;
    steerTowards(u,desired,reposition||foe||spacingActive?spacingSpeed:0,acceleration,dt);
    if(foe?.userData.alive){const facing=foe.position.clone().sub(u.position);u.rotation.y=smoothAngle(u.rotation.y,Math.atan2(facing.x,facing.z),14,dt)}
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
  enemyUnits.forEach((u,i)=>{
    if(!u.userData.alive)return;
    if(u.userData.isMaster){
      u.userData.sinceDamage+=dt;
      u.userData.hp=commanderRegenHealth(u.userData.hp,u.userData.maxHp,u.userData.sinceDamage,dt,u.userData.regenDelay,u.userData.regenPerSecond);
      const targetCommander=enemyCommanderTargets.get(u)??nearestAlive(u,livingPlayerCommanders)??master;
      let desired,speedScale=1,engageTarget=!(activeSoldierDuels&&livingEnemySoldiers.length&&livingPlayerSoldiers.length);
      if(activeSoldierDuels&&livingEnemySoldiers.length&&livingPlayerSoldiers.length){
        const battleCenter=livingEnemySoldiers.reduce((sum,soldier)=>({x:sum.x+soldier.position.x/livingEnemySoldiers.length,z:sum.z+soldier.position.z/livingEnemySoldiers.length}),{x:0,z:0});
        const tactical=commanderTacticalWaypoint({commander:u.position,target:targetCommander.position,battleCenter,duelAge:activeEncounter.commanderDuelTime,flankSide:u.userData.flankSide??=(u.id&1?1:-1)});
        desired=new THREE.Vector3(tactical.x,GROUND_Y,tactical.z);speedScale=tactical.speedScale;
        if(tactical.phase==="engage"){
          engageTarget=true;
        }
      }else{
        desired=combat?u.position.clone():commanderRoute(u,targetCommander,routeActors);
      }
      let moveSpeed=(combat?1.35:1.05)*speedScale,moveAcceleration=(combat?3.4:2.6)*Math.max(.55,speedScale);
      if(combat&&engageTarget){
        let strikeTarget=u.userData.meleeTarget;
        if(!strikeTarget?.userData.alive){
          const blockerIndex=chooseCommanderBlockerIndex({
            commander:u.position,
            target:targetCommander.position,
            soldiers:livingPlayerSoldiers.map(soldier=>({x:soldier.position.x,z:soldier.position.z,alive:soldier.userData.alive,threatening:soldier.userData.lockedTarget===u}))
          });
          strikeTarget=blockerIndex>=0?livingPlayerSoldiers[blockerIndex]:targetCommander;
        }
        const melee=updateCommanderMelee(u,strikeTarget,routeActors,dt);
        desired.copy(melee.desired);moveSpeed=melee.speed;moveAcceleration=melee.acceleration;
      }else resetMeleeAttack(u);
      steerTowards(u,desired,moveSpeed,moveAcceleration,dt);
      const faceTarget=u.userData.meleeTarget?.userData.alive?u.userData.meleeTarget:targetCommander;
      const facing=faceTarget.position.clone().sub(u.position);if(facing.lengthSq()>.001)u.rotation.y=smoothAngle(u.rotation.y,Math.atan2(facing.x,facing.z),10,dt);
      u.position.y=GROUND_Y;
      return;
    }
    let foe=enemyAssignments.get(u);
    const ownLeader=u.userData.leader;
    const leader=ownLeader?.userData.alive?ownLeader:nearestAlive(u,livingRivals);
    const distanceToLeader=leader?u.position.distanceTo(leader.position):0;
    const committed=!!u.userData.lockedTarget?.userData.alive||u.userData.seekingTarget;
    u.userData.mode=chooseServantMode({combat,masterRetreating:enemyMasterRetreating,distanceToMaster:distanceToLeader,attackLeash:4.4,locked:committed});
    const enemyForward=leader?master.position.clone().sub(leader.position).setY(0).normalize():new THREE.Vector3(0,0,1);
    const enemyObserved=leader?observedLeader(u,leader,enemyForward,dt,enemyMasterRetreating||distanceToLeader>5):null;
    const leaderSoldiers=leader?enemyUnits.filter(v=>!v.userData.isMaster&&v.userData.alive&&v.userData.leader===leader):[];
    const leaderIndex=leaderSoldiers.indexOf(u);
    let desired=leader?travelFormationSlot(Math.max(0,leaderIndex),Math.max(1,leaderSoldiers.length),enemyObserved.position,enemyObserved.forward):u.position.clone(),duelMotion=null;
    if(formingBattleLine&&leader){
      const advance=master.position.clone().sub(leader.position).setY(0).normalize(),lateral=new THREE.Vector3(-advance.z,0,advance.x);
      const swarmSoldiers=livingEnemySoldiers.filter(soldier=>soldier.userData.leader===ownLeader);
      const soldierIndex=swarmSoldiers.indexOf(u);
      desired=leader.position.clone().addScaledVector(advance,-.55).addScaledVector(lateral,battleLineOffset(Math.max(0,soldierIndex),swarmSoldiers.length,battleLineSpacing(swarmSoldiers.length)));
    }
    if(foe&&u.userData.mode===SERVANT_MODE.ATTACK){
      duelMotion=updateDuel(u,foe,dt);
      if(!u.userData.alive)return;
      if(duelPathNeedsRelock(u,duelMotion.desired,dt)){releaseStaleDuel(u);foe=null;duelMotion=null;desired=u.position.clone()}
      else desired=routeLockedDesired(u,duelMotion.desired,foe);
    }
    else if(u.userData.lockedTarget)resetDuel(u);
    const spacingProfile=soldierSpacingProfile(!!duelMotion,livingEnemySoldiers.length);
    const spacing=separationVector(u.position,[...livingRivals,...enemyUnits.filter(v=>v!==u&&!v.userData.isMaster&&v.userData.alive)],spacingProfile.distance);
    desired.x+=spacing.x*spacingProfile.strength;desired.z+=spacing.z*spacingProfile.strength;
    for(const allyCommander of livingRivals){
      const rivalForward=allyCommander.userData.velocity.lengthSq()>.03?allyCommander.userData.velocity.clone().normalize():master.position.clone().sub(allyCommander.position).setY(0).normalize();
      const clearance=commanderClearanceVector({soldier:u.position,commander:allyCommander.position,forward:rivalForward,preferRight:(u.id&1)===0});
      desired.x+=clearance.x*1.78;desired.z+=clearance.z*1.78;
    }
    if(!formingBattleLine&&!duelMotion&&leader)leashTarget(desired,leader,swarmTravelRadius(leaderSoldiers.length));
    const catchup=Math.min(1.2,Math.max(0,distanceToLeader-2.1)*.6);
    const speed=duelMotion?.speed??(u.userData.mode===SERVANT_MODE.ATTACK?1.8:2.15+catchup);
    const acceleration=duelMotion?.acceleration??(u.userData.mode===SERVANT_MODE.ATTACK?4.4:6.2);
    steerTowards(u,desired,speed,acceleration,dt);
    u.position.y=GROUND_Y;
    if(foe?.userData.alive){const facing=foe.position.clone().sub(u.position);u.rotation.y=smoothAngle(u.rotation.y,Math.atan2(facing.x,facing.z),14,dt)}
  });
  resolveCharacterCollisions();
  sinceDamage+=dt;masterHealth=commanderRegenHealth(masterHealth,PLAYER_COMMANDER.maxHealth,sinceDamage,dt,PLAYER_COMMANDER.regenDelay,PLAYER_COMMANDER.regenPerSecond);master.userData.hp=masterHealth;master.userData.sinceDamage=sinceDamage;
  updateMasterDamageEffect(dt);updateSoldierDamageEffects(dt);updateActorCombatAnimations(dt);updateActorHealthWidgets(dt);
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
  unit.userData.collisionHalf=actorCollisionProfile("commander");unit.userData.damageAnim=0;
  unit.userData.attackTempo??=.94+rand()*.12;unit.userData.duelPhase=DUEL_PHASE.APPROACH;unit.userData.duelTimer=0;unit.userData.meleeTarget=null;
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
  selectedRegion=region.id;closeMap();master.userData.velocity.set(0,0,0);spawnWave();showToast(STR.objective,1200);
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
    const scope=tacticalSelectionScope(actorHit.userData);
    if(scope==="commander")selectCommander(actorHit);
    else selectCompany(actorHit.userData.companyId??0);
    return;
  }
  const plane=new THREE.Plane(new THREE.Vector3(0,1,0),-GROUND_Y),p=new THREE.Vector3();if(raycaster.ray.intersectPlane(plane,p)&&selectedCompanyId!==null){
    if(issueCompanyOrder(p)){
      const marker=$("tap-marker");marker.style.left=`${e.clientX}px`;marker.style.top=`${e.clientY}px`;marker.classList.remove("pulse");void marker.offsetWidth;marker.classList.add("pulse");
      $("mobile-command")?.classList.add("dismissed");
    }
  }
}
function hoverTacticalGrid(e){
  if(!tacticalInputEnabled(mode)||selectedCompanyId===null)return;
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
addEventListener("keydown",e=>{if(e.code==="Space"){e.preventDefault();mode==="map"?closeMap():mode==="playing"&&openMap()}if(e.code==="Escape"){if(mode==="paused")togglePause(false);else if(selectedCompanyId!==null)clearTacticalSelection();else if(mode==="map")closeMap();else if(mode==="companies")closeCompanies()}});
$("map").onclick=()=>mode==="map"?closeMap():openMap();$("return").onclick=closeMap;
$("companies").onclick=openCompanies;$("companies-close").onclick=closeCompanies;
$("divide-company").onclick=()=>{if(selectedCompanyId!==null&&divideCompany(selectedCompanyId)){rebuildSelectionVisuals();refreshCommandGrid()}};
$("pause").onclick=()=>togglePause();
$("sound").onclick=()=>{audioOn=!audioOn;sounds.music.muted=!audioOn;$("sound").textContent=audioOn?STR.audioOn:STR.audioOff};
$("motion").onclick=()=>{reducedMotion=!reducedMotion;$("motion").textContent=reducedMotion?STR.reducedMotion:STR.fullMotion};
addEventListener("blur",()=>{if(mode==="playing")togglePause(true)});

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
function updateStats(){const count=followers.filter(u=>u.userData.alive).length;$("army-count").textContent=count;$("army-button-count").textContent=count;$("territory-count").textContent=`${campaign.conquered.size}/7`}
function win(){mode="end";$("end-title").textContent=STR.victory;$("end-screen").classList.remove("hidden");$("hud").classList.add("hidden")}
function start(){mode="playing";$("title-screen").classList.add("hidden");$("hud").classList.remove("hidden");$("pause").textContent=STR.pause;$("pause").setAttribute("aria-label",STR.pause);$("sound").textContent=STR.audioOn;$("motion").textContent=reducedMotion?STR.reducedMotion:STR.fullMotion;$("mobile-command").textContent=STR.tapToMove;updateStats();updateHearts();sounds.music.play().catch(()=>{});showToast(STR.objective)}
$("begin").onclick=start;$("retry").onclick=()=>location.reload();

function activeGameplayCameraFrame(){
  if(!master)return null;
  const playerFrame=playerArmyCameraFrame(activeCombatantPoints([master,...followers]),{
    aspect:camera.aspect,
    focusPoint:master.position
  });
  const focusPoint={x:master.position.x,z:master.position.z};
  if(!activeEncounter||activeEncounter.done)return composeGameplayCameraFrame({playerFrame,focusPoint});
  const actors=[master,...followers,...enemyUnits];
  const duelists=actors.filter(actor=>actor?.userData.alive&&actor.userData.lockedTarget?.userData.alive);
  const awarenessScale=proximityCameraScale(activeEncounter.approachDistance);
  if(!activeEncounter.aggro&&!duelists.length){
    return composeGameplayCameraFrame({playerFrame,awarenessScale,focusPoint});
  }
  const combatFrame=tacticalCameraFrame(activeCombatantPoints(actors),{aspect:camera.aspect});
  return composeGameplayCameraFrame({playerFrame,combatFrame,awarenessScale,focusPoint});
}

function resize(){renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));renderer.setSize(innerWidth,innerHeight);camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix()}
addEventListener("resize",resize);addEventListener("orientationchange",resize);
const dev=new URLSearchParams(location.search).has("dev");if(dev)$("dev").style.display="block";
let frames=0,fps=0,fpsAt=performance.now(),acc=0,last=performance.now();const STEP=1/60;
function loop(now){
  requestAnimationFrame(loop);let frame=Math.min(.05,(now-last)/1000);last=now;acc+=frame;if(mode==="playing")totalTime+=frame;
  const gp0=navigator.getGamepads?.()[0], padDown=!!gp0?.buttons?.[0]?.pressed;
  if(padDown&&!padPrev.has(0)){mode==="map"?closeMap():mode==="playing"&&openMap()} padDown?padPrev.add(0):padPrev.delete(0);
  while(acc>=STEP){if(mode==="playing")updateBattle(STEP*tacticalCommandScale(selectedCompanyId!==null));acc-=STEP}
  const mapMode=mode==="map",combatFrame=mapMode?null:activeGameplayCameraFrame();
  let focus,desired;
  if(mapMode){
    focus=new THREE.Vector3(0,0,-1);desired=new THREE.Vector3(10,31,26);
  }else{
    const focusTarget=combatFrame?new THREE.Vector3(combatFrame.x,0,combatFrame.z):master.position;
    const focusEase=1-Math.pow(.006,frame),zoomEase=1-Math.pow(.35,frame);
    gameplayCameraFocus.lerp(focusTarget,focusEase);
    gameplayCameraScale+=((combatFrame?.scale??1)-gameplayCameraScale)*zoomEase;
    focus=gameplayCameraFocus;
    desired=focus.clone().addScaledVector(GAMEPLAY_CAMERA_OFFSET,gameplayCameraScale);
  }
  camera.position.lerp(desired,1-Math.pow(.001,frame));const look=focus.clone();look.y=mapMode?0:.4;camera.lookAt(look);
  if(!mapMode){sun.position.set(focus.x-8,18,focus.z+7);sun.target.position.set(focus.x,0,focus.z);sun.target.updateMatrixWorld()}
  if(shake>0){camera.position.x+=(rand()-.5)*shake;camera.position.y+=(rand()-.5)*shake;shake*=.83}
  for(const flag of flags)flag.rotation.y=-.12+Math.sin(totalTime*2+flag.id)*.08;
  renderer.render(scene,camera);
  if(dev&&now-fpsAt>500){fps=Math.round(frames*1000/(now-fpsAt));$("dev").textContent=`${fps} fps · ${renderer.info.render.calls} draws · ${followers.length+enemyUnits.length} units`;frames=0;fpsAt=now}frames++;
}
requestAnimationFrame(loop);
