import test from "node:test";
import assert from "node:assert/strict";
import { DUEL_PHASE, FACTION, FOLLOW_AWARENESS, SERVANT_MODE, actorCollisionProfile, activeCombatantPoints, advanceDuelState, advanceFollowAwareness, advanceGroundFragment, advanceLaggingHealthBar, advancePathFailure, advanceRevival, applyLinearFriction, arrivalSpeed, battleApproachState, battleLineFormationDuration, battleLineOffset, battleLineSpacing, battlePreparationState, canApplyAttackDamage, canDivideCompany, chooseBalancedTargetIndex, chooseCommanderBlockerIndex, chooseCommanderTargetIndex, chooseHiddenSpawn, chooseLocalDetour, chooseServantMode, claimRegion, combatVisualPose, commanderClearanceVector, commanderCombatProfile, commanderControlState, commanderFormationOffset, commanderRegenHealth, commanderTacticalWaypoint, companyCommandState, companyDivisionPlan, companyFormationOffset, companyLeaderMotion, counterattack, defeatRosterPlan, difficultyEncounter, duelAttackHits, encounterResolutionState, engagementAllocation, environmentGrade, floorTileKeys, hiddenWaveSpawn, hitKnockback, limitPointToRadius, limitedFacingAngle, makeCampaign, nextDuelTurn, particleBudgetAllows, playerThreatScore, postBattleCompanyOffset, postRespawnResolution, prioritizedOpponents, recruitRevivalTiming, regenHealth, resolveBoxOverlap, resolveEncounter, revivalBlinkIntensity, revivalProgressionState, separationVector, shouldEnemyEvade, shouldReleaseCombatCommitment, shouldRepositionFollower, smoothAngle, snapTacticalCell, soldierFragmentCount, soldierSpacingProfile, standOffPoint, standOffPursuitPoint, swarmTravelGroupCount, swarmTravelOffset, swarmTravelRadius, swarmsHaveContact, tacticalCameraFrame, tacticalCellAction, tacticalCellBlocked, tacticalCommandScale, tacticalInputEnabled, tacticalOrderState, tacticalSelectionScope, unitCommanderProfile, waveSizeFromRoll } from "../src/sim.js";

test("victory resurrects all servants only after the entire enemy group dies", () => {
  assert.deepEqual(resolveEncounter({ playerHealth: 1, enemyMasterHealth: 0, livingEnemyServants: 1, enemyServantCount: 7 }), { outcome: "active", recruits: 0 });
  assert.deepEqual(resolveEncounter({ playerHealth: 1, enemyMasterHealth: 0, livingEnemyServants: 0, enemyServantCount: 7 }), { outcome: "victory", recruits: 7 });
});

test("claiming territory reveals adjacent frontier without recording a commander tombstone", () => {
  const campaign = makeCampaign();
  const result = claimRegion(campaign, 2, FACTION.CORAL, 5);
  assert.equal(campaign.regions[2].owner, FACTION.PLAYER);
  assert.equal(campaign.tombstones.length, 0);
  assert.equal(campaign.regions[4].revealed, true);
  assert.equal(result.recruits, 5);
});

test("counterattack captures one adjacent unfortified player region and retreats safely", () => {
  const campaign = makeCampaign();
  campaign.regions[1].owner = FACTION.PLAYER;
  campaign.conquered.add(1);
  const result = counterattack(campaign, 3);
  assert.equal(result.lostRegion, 1);
  assert.equal(campaign.regions[1].owner, FACTION.AMBER);
  assert.equal(result.retreatRegion, 0);
});

test("master regenerates only after the post-damage delay", () => {
  assert.equal(regenHealth(50, 100, 2.9, 1), 50);
  assert.equal(regenHealth(50, 100, 3, 1), 57);
  assert.equal(regenHealth(99, 100, 5, 1), 100);
});

test("followers keep tactical targets inside their master's leash", () => {
  assert.deepEqual(limitPointToRadius({ x: 9, z: 0 }, { x: 1, z: 0 }, 4), { x: 5, z: 0 });
  assert.deepEqual(limitPointToRadius({ x: 3, z: 2 }, { x: 1, z: 0 }, 4), { x: 3, z: 2 });
});

test("box collision resolves only the shallowest overlapping axis", () => {
  const correction = resolveBoxOverlap(
    { x: 0, z: 0 }, { x: .25, z: .25 },
    { x: .4, z: .1 }, { x: .25, z: .25 }
  );
  assert.ok(Math.abs(correction.ax + .05) < 1e-9);
  assert.equal(correction.az, 0);
  assert.ok(Math.abs(correction.bx - .05) < 1e-9);
  assert.equal(correction.bz, 0);
  assert.equal(resolveBoxOverlap(
    { x: 0, z: 0 }, { x: .25, z: .25 },
    { x: 1, z: 0 }, { x: .25, z: .25 }
  ), null);
});

test("servants attack only while the master is committed and within leash", () => {
  assert.equal(chooseServantMode({ combat: false, masterRetreating: false, distanceToMaster: 2, attackLeash: 4.5 }), SERVANT_MODE.FOLLOW);
  assert.equal(chooseServantMode({ combat: true, masterRetreating: false, distanceToMaster: 2, attackLeash: 4.5 }), SERVANT_MODE.ATTACK);
  assert.equal(chooseServantMode({ combat: true, masterRetreating: true, distanceToMaster: 2, attackLeash: 4.5 }), SERVANT_MODE.FOLLOW);
  assert.equal(chooseServantMode({ combat: true, masterRetreating: false, distanceToMaster: 5, attackLeash: 4.5 }), SERVANT_MODE.FOLLOW);
});

test("a living duel lock overrides commander retreat and leash commands", () => {
  assert.equal(chooseServantMode({
    combat: true, masterRetreating: true, distanceToMaster: 20, attackLeash: 4.5, locked: true
  }), SERVANT_MODE.ATTACK);
  assert.equal(chooseServantMode({
    combat: false, masterRetreating: true, distanceToMaster: 20, attackLeash: 4.5, locked: false
  }), SERVANT_MODE.FOLLOW);
});

test("ground friction stops direct movement quickly without reversing it", () => {
  assert.ok(Math.abs(applyLinearFriction(2.15, 9.5, .1) - 1.2) < 1e-9);
  assert.equal(applyLinearFriction(.4, 9.5, .1), 0);
  assert.equal(applyLinearFriction(0, 9.5, .1), 0);
});

test("followers notice commander movement before tracking after an individual delay", () => {
  const noticed = advanceFollowAwareness({
    state: FOLLOW_AWARENESS.HOLDING, moved: 1, threshold: .5, timer: 0, responseDelay: .4, dt: .1, urgent: false
  });
  assert.deepEqual(noticed, { state: FOLLOW_AWARENESS.RESPONDING, timer: .4, updateAnchor: false });
  const waiting = advanceFollowAwareness({ ...noticed, moved: 1, threshold: .5, responseDelay: .4, dt: .2, urgent: false });
  assert.equal(waiting.state, FOLLOW_AWARENESS.RESPONDING);
  assert.equal(waiting.updateAnchor, false);
  const tracking = advanceFollowAwareness({ ...waiting, moved: 1, threshold: .5, responseDelay: .4, dt: .25, urgent: false });
  assert.equal(tracking.state, FOLLOW_AWARENESS.TRACKING);
  assert.equal(tracking.updateAnchor, true);
});

test("settled servants preserve natural stopping positions until movement is tactically necessary", () => {
  assert.equal(shouldRepositionFollower({ combat: false, urgent: false, leaderSpeed: 0, distanceToMaster: 2.7, leash: 4.2 }), false);
  assert.equal(shouldRepositionFollower({ combat: false, urgent: false, leaderSpeed: .2, distanceToMaster: 2.7, leash: 4.2 }), true);
  assert.equal(shouldRepositionFollower({ combat: true, urgent: false, leaderSpeed: 0, distanceToMaster: 2.7, leash: 4.2 }), true);
  assert.equal(shouldRepositionFollower({ combat: false, urgent: false, leaderSpeed: 0, distanceToMaster: 4.3, leash: 4.2 }), true);
  assert.equal(shouldRepositionFollower({ combat: false, urgent: true, leaderSpeed: 0, distanceToMaster: 2.7, leash: 4.2 }), true);
});

test("damage knockback points away from the attacker with stable force", () => {
  assert.deepEqual(hitKnockback({ x: 1, z: 1 }, { x: 4, z: 5 }, 2.5), { x: 1.5, z: 2 });
  assert.deepEqual(hitKnockback({ x: 2, z: 2 }, { x: 2, z: 2 }, 2.5), { x: 2.5, z: 0 });
});

test("revival waits, then hovers and pulses before completing", () => {
  assert.deepEqual(advanceRevival({ elapsed: 0, delay: 2, duration: 1.5, dt: 1 }), {
    elapsed: 1, phase: "waiting", progress: 0, hover: 0, intensity: 0
  });
  const rising = advanceRevival({ elapsed: 2, delay: 2, duration: 1.5, dt: .75 });
  assert.equal(rising.phase, "rising");
  assert.equal(rising.progress, .5);
  assert.ok(Math.abs(rising.hover) <= .14);
  assert.ok(rising.intensity >= 1);
  assert.equal(advanceRevival({ elapsed: 3.4, delay: 2, duration: 1.5, dt: .2 }).phase, "complete");
});

test("combat assignments reserve each opponent for only one soldier", () => {
  const loads = [0, 0];
  const first = chooseBalancedTargetIndex([1, 4], loads);
  loads[first]++;
  const second = chooseBalancedTargetIndex([1.2, 5], loads);
  loads[second]++;
  const third = chooseBalancedTargetIndex([1.4, 6], loads);
  assert.equal(first, 0);
  assert.equal(second, 1);
  assert.equal(third, -1);
});

test("combat assignments refuse targets that are already locked", () => {
  assert.equal(chooseBalancedTargetIndex([3, 1, 2], [1, 1, 1]), -1);
  assert.equal(chooseBalancedTargetIndex([], []), -1);
});

test("approaching soldiers fan into a centered battle line", () => {
  const offsets=[0,1,2,3].map(i=>battleLineOffset(i,4));
  assert.ok(offsets.every((value,index)=>Math.abs(value-[-3.075,-1.025,1.025,3.075][index])<1e-9));
  assert.equal(battleLineOffset(0, 1), 0);
});

test("surplus soldiers assault the commander instead of crowding occupied duels", () => {
  assert.deepEqual(engagementAllocation(5,3),{soldierDuels:3,commanderAssaults:2});
  assert.deepEqual(engagementAllocation(3,5),{soldierDuels:3,commanderAssaults:0});
  assert.deepEqual(engagementAllocation(4,0),{soldierDuels:0,commanderAssaults:4});
});

test("duel winners prioritize every living soldier before the commander", () => {
  const living={alive:true,id:"soldier"},fallen={alive:false,id:"fallen"},commander={alive:true,id:"commander"};
  assert.deepEqual(prioritizedOpponents([fallen,living],commander),[living]);
  assert.deepEqual(prioritizedOpponents([fallen],commander),[commander]);
  assert.deepEqual(prioritizedOpponents([fallen],{alive:false,id:"commander"}),[]);
});

test("endless waves vary deterministically from two to five soldiers", () => {
  assert.equal(waveSizeFromRoll(0), 2);
  assert.equal(waveSizeFromRoll(.26), 3);
  assert.equal(waveSizeFromRoll(.51), 4);
  assert.equal(waveSizeFromRoll(.99), 5);
});

test("difficulty director responds to the player's surviving strength", () => {
  const weak=playerThreatScore({livingSoldiers:2,averageSoldierHealthRatio:.4,commanderHealthRatio:.5});
  const strong=playerThreatScore({livingSoldiers:7,averageSoldierHealthRatio:.9,commanderHealthRatio:1});
  assert.ok(strong>weak);
  const weakEncounter=difficultyEncounter({wave:4,playerThreat:weak,fluctuationRoll:.5,splitRoll:1});
  const strongEncounter=difficultyEncounter({wave:4,playerThreat:strong,fluctuationRoll:.5,splitRoll:1});
  assert.ok(strongEncounter.soldierCount>weakEncounter.soldierCount);
});

test("difficulty trends upward while bounded fluctuation creates breathers and peaks", () => {
  const early=difficultyEncounter({wave:2,playerThreat:6,fluctuationRoll:.5,splitRoll:1});
  const late=difficultyEncounter({wave:10,playerThreat:6,fluctuationRoll:.5,splitRoll:1});
  const breather=difficultyEncounter({wave:7,playerThreat:6,fluctuationRoll:0,splitRoll:1});
  const peak=difficultyEncounter({wave:7,playerThreat:6,fluctuationRoll:1,splitRoll:1});
  assert.ok(late.threatBudget>early.threatBudget);
  assert.ok(peak.threatBudget>breather.threatBudget);
});

test("exactly every third climbing encounter divides pressure between two swarms", () => {
  const single=difficultyEncounter({wave:5,playerThreat:8,fluctuationRoll:.5,splitRoll:0});
  const double=difficultyEncounter({wave:6,playerThreat:8,fluctuationRoll:.5,splitRoll:1});
  const nextSingle=difficultyEncounter({wave:7,playerThreat:8,fluctuationRoll:.5,splitRoll:0});
  assert.equal(single.swarmCount,1);
  assert.equal(double.swarmCount,2);
  assert.equal(nextSingle.swarmCount,1);
  assert.equal(double.swarmSizes.reduce((sum,count)=>sum+count,0),double.soldierCount);
  assert.ok(Math.abs(double.swarmSizes[0]-double.swarmSizes[1])<=1);
  assert.equal(difficultyEncounter({wave:3,playerThreat:1,fluctuationRoll:0}).swarmCount,2);
});

test("larger armies widen their pre-battle horizontal frontage", () => {
  assert.equal(battleLineSpacing(4),1.72);
  assert.ok(battleLineSpacing(8)>battleLineSpacing(4));
  assert.ok(battleLineSpacing(20)<=2.05);
  assert.ok(battleLineFormationDuration(12)>battleLineFormationDuration(4));
  assert.ok(battleLineFormationDuration(40)<=6.85);
});

test("tactical camera centers separated combatants and zooms only as much as needed", () => {
  const close=tacticalCameraFrame([{x:-2,z:1},{x:2,z:-1}],{aspect:16/9});
  assert.deepEqual(close,{x:0,z:0,scale:1});

  const split=tacticalCameraFrame([{x:-15,z:-3},{x:15,z:5}],{aspect:16/9});
  assert.equal(split.x,0);
  assert.equal(split.z,1);
  assert.ok(split.scale>1);
  assert.ok(split.scale<=2.35);
});

test("tactical camera safely handles empty and extreme combat frames", () => {
  assert.equal(tacticalCameraFrame([]),null);
  assert.equal(tacticalCameraFrame([{x:0,z:0},{x:200,z:200}]).scale,1.58);
});

test("battle preparation derives safely from the current living armies", () => {
  assert.deepEqual(
    battlePreparationState({combat:true,formationTime:1,livingFollowerCount:4,livingEnemySoldierCount:8}),
    {formationSize:8,formingBattleLine:true}
  );
  assert.equal(battlePreparationState({combat:false,formationTime:0,livingFollowerCount:4,livingEnemySoldierCount:4}).formingBattleLine,false);
});

test("large travel formations widen through four visual lanes", () => {
  assert.equal(swarmTravelGroupCount(1),1);
  assert.equal(swarmTravelGroupCount(6),1);
  assert.equal(swarmTravelGroupCount(9),1);
  assert.equal(swarmTravelGroupCount(10),2);
  assert.equal(swarmTravelGroupCount(18),2);
  assert.equal(swarmTravelGroupCount(19),3);
  assert.equal(swarmTravelGroupCount(27),3);
  assert.equal(swarmTravelGroupCount(28),4);
  assert.equal(swarmTravelGroupCount(36),4);
  assert.equal(swarmTravelGroupCount(60),4);
  assert.ok(swarmTravelRadius(28)>swarmTravelRadius(18));
  assert.equal(swarmTravelRadius(60),swarmTravelRadius(36));
});

test("capped companies grow deeper without reusing formation slots", () => {
  const span=count=>{
    const offsets=Array.from({length:count},(_,index)=>swarmTravelOffset(index,count).lateral);
    return Math.max(...offsets)-Math.min(...offsets);
  };
  assert.ok(span(12)>span(6));
  assert.ok(span(24)>span(12));
  const twelve=Array.from({length:12},(_,index)=>swarmTravelOffset(index,12));
  const twentyFour=Array.from({length:24},(_,index)=>swarmTravelOffset(index,24));
  const thirtySix=Array.from({length:36},(_,index)=>swarmTravelOffset(index,36));
  assert.equal(new Set(twelve.map(offset=>`${offset.lateral},${offset.trailing}`)).size,12);
  assert.equal(new Set(twentyFour.map(offset=>`${offset.lateral},${offset.trailing}`)).size,24);
  assert.equal(new Set(thirtySix.map(offset=>`${offset.lateral},${offset.trailing}`)).size,36);
  assert.ok(Math.max(...thirtySix.map(offset=>offset.groupIndex))>Math.max(...twentyFour.map(offset=>offset.groupIndex)));
});

test("tactical command tiles cover exactly four terrain squares", () => {
  assert.deepEqual(snapTacticalCell({x:2.65,z:-3.71},3.6,1.8),{x:1.8,z:-5.4});
  assert.deepEqual(snapTacticalCell({x:4.9,z:1.2},3.6,1.8),{x:5.4,z:1.8});
  const occupied=[{id:1,x:3.55,z:3.55,alive:true}];
  const neighboring=[{id:2,x:3.61,z:1.8,alive:true}];
  assert.equal(tacticalCellBlocked({cell:{x:1.8,z:1.8},actors:occupied,excludedIds:[],cellSize:3.6,offset:1.8}),true);
  assert.equal(tacticalCellBlocked({cell:{x:1.8,z:1.8},actors:occupied,excludedIds:[1],cellSize:3.6,offset:1.8}),false);
  assert.equal(tacticalCellBlocked({cell:{x:1.8,z:1.8},actors:neighboring,excludedIds:[],cellSize:3.6,offset:1.8}),false);
  assert.equal(tacticalCellAction({inRange:true,occupied:true}),"cancel");
  assert.equal(tacticalCellAction({inRange:true,occupied:false}),"move");
  assert.equal(tacticalCellAction({inRange:false,occupied:false}),"reject");
});

test("selecting a company slows time until its order is issued", () => {
  assert.equal(tacticalCommandScale(true),.25);
  assert.equal(tacticalCommandScale(false),1);
});

test("soldier groups remain selectable and commandable while conquest is paused", () => {
  assert.equal(tacticalInputEnabled("playing"),true);
  assert.equal(tacticalInputEnabled("paused"),true);
  assert.equal(tacticalInputEnabled("map"),false);
  assert.equal(tacticalInputEnabled("companies"),false);
});

test("soldiers select their company while commanders select only themselves", () => {
  assert.equal(tacticalSelectionScope({isMaster:false}),"company");
  assert.equal(tacticalSelectionScope({isMaster:true}),"commander");
});

test("manual commander orders override pursuit without releasing soldier duels", () => {
  assert.equal(commanderControlState({combat:true,manualOrder:true}),"move");
  assert.equal(commanderControlState({combat:true,manualOrder:false}),"engage");
  assert.equal(commanderControlState({combat:false,manualOrder:false}),"hold");
});

test("duel attacks alternate only after a successful strike", () => {
  assert.equal(nextDuelTurn({attackerId:4,defenderId:9,strikeLanded:false}),4);
  assert.equal(nextDuelTurn({attackerId:4,defenderId:9,strikeLanded:true}),9);
  assert.equal(nextDuelTurn({attackerId:9,defenderId:4,strikeLanded:true}),4);
});

test("issued destinations override combat and become hold after arrival", () => {
  assert.equal(tacticalOrderState({combat:true,hasDestination:true,arrived:false}),"move");
  assert.equal(tacticalOrderState({combat:false,hasDestination:true,arrived:false}),"move");
  assert.equal(tacticalOrderState({combat:false,hasDestination:true,arrived:true}),"hold");
  assert.equal(tacticalOrderState({combat:false,hasDestination:false,arrived:false}),"hold");
});

test("manual company orders override combat until the formation arrives", () => {
  assert.equal(companyCommandState({manualOrder:true,combat:true,enemyDetected:true,commanderMoving:true}),"move");
  assert.equal(companyCommandState({manualOrder:false,combat:true,enemyDetected:true,commanderMoving:true}),"combat");
});

test("companies resume following after battle when the commander moves", () => {
  assert.equal(companyCommandState({manualOrder:false,combat:false,enemyDetected:false,commanderMoving:true}),"follow");
  assert.equal(companyCommandState({manualOrder:false,combat:false,enemyDetected:false,commanderMoving:false}),"follow");
  for(let index=0;index<18;index++)assert.ok(companyFormationOffset(index,18,1.42).trailing>0);
  assert.ok(commanderFormationOffset(1.42).trailing<0);
});

test("enemy proximity telegraphs deployment before full combat contact", () => {
  assert.equal(battleApproachState({distance:8,detectionRadius:9.5,aggroRadius:6.2}),"deploy");
  assert.equal(battleApproachState({distance:5.5,detectionRadius:9.5,aggroRadius:6.2}),"combat");
  assert.equal(battleApproachState({distance:11,detectionRadius:9.5,aggroRadius:6.2}),"travel");
});

test("a company fans around its grid anchor instead of stacking into one cell", () => {
  const offsets=Array.from({length:12},(_,index)=>companyFormationOffset(index,12));
  assert.equal(new Set(offsets.map(value=>`${value.lateral},${value.trailing}`)).size,12);
  assert.ok(Math.max(...offsets.map(value=>Math.abs(value.lateral)))>=3.2);
  assert.ok(Math.min(...offsets.map(value=>value.trailing))>0);
  assert.ok(commanderFormationOffset().trailing<Math.min(...offsets.map(value=>value.trailing)));
});

test("enemy commander clears blockers without chasing unrelated soldiers", () => {
  const state={commander:{x:0,z:0},target:{x:0,z:5}};
  const blocker=chooseCommanderBlockerIndex({...state,soldiers:[
    {x:0.2,z:1,alive:true,threatening:false},
    {x:1.8,z:.8,alive:true,threatening:false}
  ]});
  assert.equal(blocker,0);
  const threat=chooseCommanderBlockerIndex({...state,soldiers:[
    {x:1.05,z:.2,alive:true,threatening:true},
    {x:-1.8,z:.8,alive:true,threatening:false}
  ]});
  assert.equal(threat,0);
  assert.equal(chooseCommanderBlockerIndex({...state,soldiers:[{x:0,z:-1,alive:true,threatening:false}]}),-1);
});

test("replacement waves spawn beyond the visible battle radius", () => {
  const spawn = hiddenWaveSpawn({ x: 10, z: -4 }, Math.PI / 2, 21);
  assert.ok(Math.abs(spawn.x - 31) < 1e-9);
  assert.ok(Math.abs(spawn.z + 4) < 1e-9);
  assert.ok(Math.hypot(spawn.x - 10, spawn.z + 4) >= 21);
});

test("floor streaming keeps only a square tile window around the commander", () => {
  const keys = floorTileKeys({ x: 19, z: -1 }, 18, 3);
  assert.equal(keys.length, 49);
  assert.ok(keys.includes("1,-1"));
  assert.ok(keys.includes("4,2"));
  assert.equal(new Set(keys).size, keys.length);
});

test("one soldier sighting alerts both complete swarms", () => {
  const playerSwarm = [{ x: 0, z: 0, alive: true }, { x: -8, z: 0, alive: true }];
  const enemySwarm = [{ x: 5.5, z: 0, alive: true }, { x: 14, z: 0, alive: true }];
  assert.equal(swarmsHaveContact(playerSwarm, enemySwarm, 6), true);
  assert.equal(swarmsHaveContact(playerSwarm, enemySwarm, 5), false);
});

test("fallen soldiers cannot reveal the opposing swarm", () => {
  assert.equal(swarmsHaveContact(
    [{ x: 0, z: 0, alive: false }],
    [{ x: 1, z: 0, alive: true }],
    6
  ), false);
});

test("soldier separation grows smoothly inside the personal-space threshold", () => {
  const offset = separationVector(
    { x: 0, z: 0 },
    [{ x: .3, z: 0 }, { x: 2, z: 0 }],
    .75
  );
  assert.ok(offset.x < -.59 && offset.x > -.61);
  assert.equal(offset.z, 0);
  assert.deepEqual(separationVector({ x: 0, z: 0 }, [{ x: 1, z: 0 }], .75), { x: 0, z: 0 });
});

test("visual collision boxes and personal space prevent actor clipping", () => {
  assert.deepEqual(actorCollisionProfile("commander"),{x:.215,z:.195});
  assert.deepEqual(actorCollisionProfile("soldier"),{x:.215,z:.195});
  const peaceful=soldierSpacingProfile(false),battle=soldierSpacingProfile(true);
  assert.ok(peaceful.distance>battle.distance);
  assert.ok(battle.distance>actorCollisionProfile("soldier").x*2);
  assert.ok(soldierSpacingProfile(false,24).distance>soldierSpacingProfile(false,6).distance);
});

test("commander pursuit stops at a melee stand-off instead of overlapping", () => {
  const point=standOffPoint({x:4,z:3},{x:1,z:3},.92);
  assert.deepEqual(point,{x:1.92,z:3});
  assert.ok(Math.abs(Math.hypot(point.x-1,point.z-3)-.92)<1e-9);
});

test("commander pursuit settles inside a clearance band without oscillating", () => {
  assert.deepEqual(standOffPursuitPoint({x:.98,z:0},{x:0,z:0},.94,.1),{x:.98,z:0,settled:true});
  const far=standOffPursuitPoint({x:3,z:0},{x:0,z:0},.94,.1);
  assert.deepEqual(far,{x:.94,z:0,settled:false});
  assert.equal(arrivalSpeed(.05,2),0);
  assert.ok(arrivalSpeed(.3,2)>0&&arrivalSpeed(.3,2)<2);
});

test("soldiers immediately promote the living commander when no enemy soldiers remain", () => {
  const commander={alive:true,id:"commander"};
  assert.deepEqual(prioritizedOpponents([],commander),[commander]);
  assert.deepEqual(prioritizedOpponents([{alive:false}],commander),[commander]);
});

test("enemy commander stages behind duels, then takes a stable flank before engaging", () => {
  const base={commander:{x:0,z:2},target:{x:0,z:-4},battleCenter:{x:0,z:0},flankSide:1};
  const hold=commanderTacticalWaypoint({...base,duelAge:.3});
  assert.equal(hold.phase,"hold");assert.ok(hold.z>0);assert.ok(hold.speedScale<.5);
  const flank=commanderTacticalWaypoint({...base,duelAge:1.2});
  assert.equal(flank.phase,"flank");assert.ok(Math.abs(flank.x)>2);assert.ok(flank.speedScale<1);
  assert.equal(commanderTacticalWaypoint({...base,duelAge:2.5}).phase,"engage");
});

test("commander clearance pushes allies out of its circle and forward travel lane", () => {
  const radial=commanderClearanceVector({soldier:{x:.4,z:0},commander:{x:0,z:0},forward:{x:0,z:-1}});
  assert.ok(radial.x>0);
  const forward=commanderClearanceVector({soldier:{x:0,z:-.7},commander:{x:0,z:0},forward:{x:0,z:-1},preferRight:true});
  assert.ok(Math.abs(forward.x)>.1);
  assert.deepEqual(commanderClearanceVector({soldier:{x:2,z:2},commander:{x:0,z:0},forward:{x:0,z:-1}}),{x:0,z:0});
});

test("three failed path windows trigger a clean target reacquisition", () => {
  let state={previousDistance:2,distance:2,timer:0,failures:0,dt:.72};
  state=advancePathFailure(state);assert.equal(state.relock,false);assert.equal(state.failures,1);
  state=advancePathFailure({...state,distance:2,dt:.72});assert.equal(state.relock,false);assert.equal(state.failures,2);
  state=advancePathFailure({...state,distance:2,dt:.72});assert.equal(state.relock,true);assert.equal(state.failures,3);
  const progressing=advancePathFailure({...state,distance:1.8,dt:.1});
  assert.equal(progressing.relock,false);assert.equal(progressing.failures,0);
});

test("enemy soldiers never evade, even when one remains", () => {
  assert.equal(shouldEnemyEvade(4), false);
  assert.equal(shouldEnemyEvade(2), false);
  assert.equal(shouldEnemyEvade(1), false);
  assert.equal(shouldEnemyEvade(0), false);
});

test("player soldier deaths create a compact fragment burst", () => {
  assert.equal(soldierFragmentCount(0),8);
  assert.equal(soldierFragmentCount(.5),10);
  assert.equal(soldierFragmentCount(.99),12);
});

test("environment uses the original matte square-grid ground without tile overscan", () => {
  const grade=environmentGrade();
  assert.ok(grade.exposure<.85);
  assert.ok(grade.roughness>=.95);
  assert.equal(grade.metalness,0);
  assert.equal(grade.groundColor,0x73796f);
  assert.equal(grade.gridColor,0x4d5651);
  assert.equal(grade.gridCells,10);
  assert.equal(grade.tileOverscan,0);
});

test("revival pulse reaches double brightness and returns to its lowest intensity", () => {
  assert.equal(revivalBlinkIntensity(0),8);
  assert.ok(Math.abs(revivalBlinkIntensity(1/12)-.12)<1e-9);
  assert.equal(revivalBlinkIntensity(1/6),8);
});

test("all player soldiers release combat commitment when enemies are gone", () => {
  assert.equal(shouldReleaseCombatCommitment(true,3),false);
  assert.equal(shouldReleaseCombatCommitment(true,0),true);
  assert.equal(shouldReleaseCombatCommitment(false,3),true);
});

test("enemy commander health bar holds chip damage, then catches up and hides", () => {
  const held=advanceLaggingHealthBar({current:62,lag:80,hold:.28,visibleTimer:2,dt:.1});
  assert.equal(held.lag,80);assert.equal(held.visible,true);
  const trailing=advanceLaggingHealthBar({...held,dt:.2});
  assert.equal(trailing.lag,71);assert.equal(trailing.visible,true);
  const hidden=advanceLaggingHealthBar({...trailing,dt:2});
  assert.equal(hidden.lag,62);assert.equal(hidden.visible,false);
});

test("soldier chip health remains briefly readable and hides before two seconds", () => {
  const hit=advanceLaggingHealthBar({current:18,lag:25.6,hold:.24,visibleTimer:1.6,dt:.1});
  assert.equal(hit.current,18);
  assert.equal(hit.lag,25.6);
  assert.equal(hit.visible,true);
  const expired=advanceLaggingHealthBar({...hit,dt:1.6});
  assert.equal(expired.visible,false);
  assert.equal(expired.visibleTimer,0);
});

test("health changes only for a live opposing attack inside current range", () => {
  const valid={attackerAlive:true,victimAlive:true,opposingFactions:true,cooldown:0,distance:.8,range:1.05};
  assert.equal(canApplyAttackDamage(valid),true);
  assert.equal(canApplyAttackDamage({...valid,distance:1.06}),false);
  assert.equal(canApplyAttackDamage({...valid,opposingFactions:false}),false);
  assert.equal(canApplyAttackDamage({...valid,cooldown:.01}),false);
  assert.equal(canApplyAttackDamage({...valid,attackerAlive:false}),false);
});

test("locked soldiers choose a clear side route around a blocking commander", () => {
  const detour=chooseLocalDetour({
    start:{x:0,z:0},goal:{x:0,z:-4},
    obstacles:[{x:0,z:-.8,radius:.25},{x:-.7,z:-.8,radius:.2}],
    clearance:.5,preferLeft:true
  });
  assert.ok(detour);assert.ok(detour.x>0);
  assert.equal(chooseLocalDetour({start:{x:0,z:0},goal:{x:0,z:-4},obstacles:[]}),null);
});

test("combat camera includes free living enemies, not only locked duelists", () => {
  const actors=[
    {alive:true,position:{x:0,z:0}},
    {alive:true,position:{x:12,z:-4}},
    {alive:false,position:{x:99,z:99}}
  ];
  assert.deepEqual(activeCombatantPoints(actors),[{x:0,z:0},{x:12,z:-4}]);
});

test("a promoted company follows only its own commander movement", () => {
  assert.equal(companyLeaderMotion({ownCommanderMoving:false,primaryCommanderMoving:true}),false);
  assert.equal(companyLeaderMotion({ownCommanderMoving:true,primaryCommanderMoving:false}),true);
});

test("promoted companies occupy unique defensive sectors after battle", () => {
  assert.deepEqual(postBattleCompanyOffset(0,3),{x:0,z:0});
  const left=postBattleCompanyOffset(1,3),right=postBattleCompanyOffset(2,3);
  assert.ok(Math.hypot(left.x,left.z)>=5);
  assert.ok(Math.hypot(right.x,right.z)>=5);
  assert.ok(Math.hypot(left.x-right.x,left.z-right.z)>=8);
});

test("facing ignores tiny corrections and limits necessary turns", () => {
  assert.equal(limitedFacingAngle({current:0,target:.03,dt:.1}),0);
  assert.equal(limitedFacingAngle({current:0,target:Math.PI,dt:.1,maxTurnRate:4}),.4);
  const wrapped=limitedFacingAngle({current:Math.PI-.1,target:-Math.PI+.1,dt:.1,maxTurnRate:4});
  assert.ok(wrapped>Math.PI-.1);
});

test("independent commanders spread onto available opponents", () => {
  const opponents=[
    {x:1,z:0,alive:true,isCommander:false},
    {x:2,z:0,alive:true,isCommander:false},
    {x:3,z:0,alive:true,isCommander:true}
  ];
  assert.equal(chooseCommanderTargetIndex({
    commander:{x:0,z:0},opponents,targetLoads:[1,0,1],preferCommander:false
  }),1);
  assert.equal(chooseCommanderTargetIndex({
    commander:{x:0,z:0},opponents,targetLoads:[0,0,0],preferCommander:true
  }),2);
});

test("movement facing eases smoothly across wrapped angles", () => {
  const next=smoothAngle(Math.PI-.1,-Math.PI+.1,10,.016);
  assert.ok(next>Math.PI-.1&&next<Math.PI+.1);
});

test("replacement waves choose an off-camera candidate beyond the safety range", () => {
  const center = { x: 0, z: 0 };
  const candidates = [{ x: 8, z: 0 }, { x: 24, z: 0 }, { x: 0, z: 28 }];
  const chosen = chooseHiddenSpawn(center, candidates, 20, point => point.x === 24);
  assert.deepEqual(chosen, { x: 0, z: 28 });
  assert.equal(chooseHiddenSpawn(center, candidates, 20, () => true), null);
});

test("duel strikes always land", () => {
  for(let sequence=0;sequence<12;sequence++)assert.equal(duelAttackHits(sequence),true);
});

test("the player commander is tougher and stronger than the enemy commander", () => {
  const player=commanderCombatProfile("player"),enemy=commanderCombatProfile("enemy");
  assert.equal(player.maxHealth,enemy.maxHealth*2);
  assert.equal(enemy.maxHealth,500);
  assert.equal(player.attack,enemy.attack*2);
  assert.deepEqual(unitCommanderProfile(),player);
  assert.ok(player.regenPerSecond>enemy.regenPerSecond);
});

test("commander regeneration is delayed and uses a slow flat rate", () => {
  const player=commanderCombatProfile("player"),enemy=commanderCombatProfile("enemy");
  assert.equal(commanderRegenHealth(300,500,player.regenDelay-.01,1,player.regenDelay,player.regenPerSecond),300);
  assert.equal(commanderRegenHealth(300,1000,player.regenDelay,2,player.regenDelay,player.regenPerSecond),310);
  assert.equal(commanderRegenHealth(499,500,enemy.regenDelay,1,enemy.regenDelay,enemy.regenPerSecond),500);
});

test("commander defeat resets army growth to the six-soldier opening strength", () => {
  assert.deepEqual(defeatRosterPlan(14),{keep:6,remove:8,spawn:0});
  assert.deepEqual(defeatRosterPlan(3),{keep:3,remove:0,spawn:3});
  assert.deepEqual(defeatRosterPlan(6),{keep:6,remove:0,spawn:0});
});

test("post-respawn resolution still converts enemies defeated during the respawn pause", () => {
  assert.equal(postRespawnResolution(true),"resume");
  assert.equal(postRespawnResolution(false),"resolve-victory");
});

test("a stale done flag cannot block victory after the commander revives", () => {
  assert.equal(encounterResolutionState({
    hasEncounter:true,encounterDone:true,playerAlive:true,enemyRosterCount:5,livingEnemyCount:0
  }),"victory");
  assert.equal(encounterResolutionState({
    hasEncounter:true,encounterDone:true,playerAlive:true,enemyRosterCount:5,livingEnemyCount:2
  }),"paused");
  assert.equal(encounterResolutionState({
    hasEncounter:true,encounterDone:false,playerAlive:false,enemyRosterCount:5,livingEnemyCount:2
  }),"respawn");
});

test("the next wave waits until every converted recruit has risen", () => {
  assert.equal(revivalProgressionState({waitingForRecruits:true,revivingFollowerCount:3}),"waiting");
  assert.equal(revivalProgressionState({waitingForRecruits:true,revivingFollowerCount:0}),"advance");
  assert.equal(revivalProgressionState({waitingForRecruits:false,revivingFollowerCount:0}),"inactive");
});

test("cube fragments bounce above the floor and then settle instead of falling through it", () => {
  const impact=advanceGroundFragment({
    position:{x:0,y:.08,z:0},velocity:{x:1,y:-2,z:.5},halfSize:.1,bounces:0,settled:false,dt:.1
  });
  assert.ok(Math.abs(impact.position.y-.12)<1e-9);
  assert.ok(impact.velocity.y>0);
  assert.equal(impact.bounces,1);
  const settled=advanceGroundFragment({
    position:{x:0,y:.12,z:0},velocity:{x:.05,y:-.2,z:.04},halfSize:.1,bounces:2,settled:false,dt:.1
  });
  assert.ok(Math.abs(settled.position.y-.12)<1e-9);
  assert.equal(settled.velocity.y,0);
  assert.equal(settled.settled,true);
});

test("the shared particle budget never permits a 181st active effect", () => {
  assert.equal(particleBudgetAllows(179),true);
  assert.equal(particleBudgetAllows(180),false);
  assert.equal(particleBudgetAllows(181),false);
});

test("a group can divide only above twelve soldiers and stays balanced", () => {
  assert.equal(canDivideCompany(12),false);
  assert.equal(canDivideCompany(13),true);
  const plan=companyDivisionPlan(13);
  assert.equal(plan.promotedIndex,0);
  assert.equal(plan.transferIndices.length,6);
  assert.equal(13-1-plan.transferIndices.length,6);
});

test("duel state visibly approaches, lunges, and recovers", () => {
  assert.deepEqual(advanceDuelState({ phase: DUEL_PHASE.APPROACH, timer: 0, distance: .12, dt: .1 }), {
    phase: DUEL_PHASE.LUNGE, timer: .48, strike: false
  });
  assert.deepEqual(advanceDuelState({ phase: DUEL_PHASE.LUNGE, timer: .3, distance: .7, strikeDistance: 1.2, strikeRange: 1.15, dt: .11 }), {
    phase: DUEL_PHASE.LUNGE, timer: .19, strike: false
  });
  assert.deepEqual(advanceDuelState({ phase: DUEL_PHASE.LUNGE, timer: .45, distance: .7, strikeDistance: 1.1, strikeRange: 1.15, dt: .01 }), {
    phase: DUEL_PHASE.LUNGE, timer: .44, strike: false
  });
  assert.deepEqual(advanceDuelState({ phase: DUEL_PHASE.LUNGE, timer: .3, distance: .7, strikeDistance: 1.1, strikeRange: 1.15, dt: .01 }), {
    phase: DUEL_PHASE.RECOVER, timer: .72, strike: true
  });
  assert.deepEqual(advanceDuelState({ phase: DUEL_PHASE.LUNGE, timer: .04, distance: .7, strikeDistance: 1.3, strikeRange: 1.15, dt: .05 }), {
    phase: DUEL_PHASE.APPROACH, timer: 0, strike: false
  });
  assert.deepEqual(advanceDuelState({ phase: DUEL_PHASE.RECOVER, timer: .05, distance: 1.7, dt: .06 }), {
    phase: DUEL_PHASE.APPROACH, timer: 0, strike: false
  });
});

test("combat animation squashes into attacks and rebounds from damage", () => {
  const attack=combatVisualPose({attack:1,damage:0});
  assert.ok(attack.scaleZ<1);
  assert.ok(attack.forward>=.4);
  const damage=combatVisualPose({attack:0,damage:1});
  assert.ok(damage.scaleX>1);
  assert.ok(damage.lift>0);
});

test("recruit revival lasts roughly five to six seconds", () => {
  assert.deepEqual(recruitRevivalTiming(0), { delay: 2, duration: 3.6 });
  assert.ok(Math.abs(recruitRevivalTiming(2).delay + recruitRevivalTiming(2).duration - 5.9) < 1e-9);
  assert.equal(advanceRevival({ elapsed: 0, ...recruitRevivalTiming(0), dt: 1.99 }).phase, "waiting");
  const bright=advanceRevival({elapsed:2.3,...recruitRevivalTiming(0),dt:.24});
  assert.equal(bright.phase,"rising");assert.ok(bright.intensity>=.12&&bright.intensity<=8);
});
