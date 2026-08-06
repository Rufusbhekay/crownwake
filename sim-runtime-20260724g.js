export const FACTION = { PLAYER: "player", CORAL: "coral", AMBER: "amber" };
export const SERVANT_MODE = { FOLLOW: "follow", ATTACK: "attack" };
export const FOLLOW_AWARENESS = { HOLDING: "holding", RESPONDING: "responding", TRACKING: "tracking" };
export const DUEL_PHASE = { APPROACH: "approach", LUNGE: "lunge", RECOVER: "recover" };
export const SOLDIER_COMBAT_STATE = { FORMATION: "formation", DUEL: "duel", WAITING: "waiting", NEUTRAL: "neutral" };
export const DUEL_WAITING_DISTANCE = 3.6;
export const THREAT_FORMATION_SCALE = 2.35;

export function canMaintainSoldierDuel({ unitAlive, targetAlive, mutualLock }) {
  return Boolean(unitAlive && targetAlive && mutualLock);
}

export function preserveLockedCombatants(units = [], commandableUnits = []) {
  const commandable = new Set(commandableUnits);
  return units.filter(unit => commandable.has(unit) || unit?.userData?.lockedTarget?.userData?.alive);
}

export function soldierCombatState({ combat, formingBattleLine, targetAlive, waitingSlot = false }) {
  if (targetAlive) return SOLDIER_COMBAT_STATE.DUEL;
  if (combat && !formingBattleLine && waitingSlot) return SOLDIER_COMBAT_STATE.WAITING;
  if (combat && !formingBattleLine) return SOLDIER_COMBAT_STATE.NEUTRAL;
  return SOLDIER_COMBAT_STATE.FORMATION;
}

export function allocateDuelWaitingSlots(waiters, duels, preferredDuel, distanceBetween) {
  const assignments = new Map();
  const availableDuels = new Set(duels);

  for (const waiter of waiters) {
    const preferred = preferredDuel(waiter);
    if (preferred && availableDuels.delete(preferred)) assignments.set(waiter, preferred);
  }

  while (availableDuels.size) {
    let nearestWaiter = null;
    let nearestDuel = null;
    let nearestDistance = Infinity;
    for (const waiter of waiters) {
      if (assignments.has(waiter)) continue;
      for (const duel of availableDuels) {
        const distance = distanceBetween(waiter, duel);
        if (distance < nearestDistance) {
          nearestWaiter = waiter;
          nearestDuel = duel;
          nearestDistance = distance;
        }
      }
    }
    if (!nearestWaiter) break;
    assignments.set(nearestWaiter, nearestDuel);
    availableDuels.delete(nearestDuel);
  }

  return assignments;
}

export function chooseNearestAvailablePair(sideA, sideB, distanceBetween = (left, right) => Math.hypot(left.x - right.x, left.z - right.z)) {
  let best = null;
  let bestDistance = Infinity;
  for (const left of sideA) for (const right of sideB) {
    const distance = distanceBetween(left, right);
    if (distance < bestDistance) {
      best = { left, right, distance };
      bestDistance = distance;
    }
  }
  return best;
}

export function advanceFormationSpread(current, { threatDetected, dt, expandRate = 4.8, contractRate = 2.8 } = {}) {
  const target = threatDetected ? THREAT_FORMATION_SCALE : 1;
  const rate = target > current ? expandRate : contractRate;
  const blend = 1 - Math.exp(-Math.max(0, rate) * Math.max(0, dt));
  return current + (target - current) * blend;
}

export function environmentGrade() {
  return {
    background: 0x8fa4a7,
    exposure: .78,
    hemisphereIntensity: 1.55,
    sunIntensity: 1.85,
    roughness: .96,
    metalness: 0,
    groundColor: 0x73796f,
    gridColor: 0x4d5651,
    gridCells: 10,
    tileOverscan: 0
  };
}

export function makeCampaign() {
  return {
    regions: [
      { id: 0, x: 0, z: 0, owner: FACTION.PLAYER, revealed: true, fortified: true, links: [1, 2] },
      { id: 1, x: -14, z: -8, owner: null, revealed: true, fortified: false, links: [0, 3] },
      { id: 2, x: 15, z: -5, owner: FACTION.CORAL, revealed: true, fortified: false, links: [0, 3, 4] },
      { id: 3, x: 0, z: -19, owner: FACTION.AMBER, revealed: false, fortified: false, links: [1, 2, 5] },
      { id: 4, x: 27, z: -15, owner: FACTION.CORAL, revealed: false, fortified: false, links: [2, 5] },
      { id: 5, x: 12, z: -31, owner: FACTION.AMBER, revealed: false, fortified: false, links: [3, 4, 6] },
      { id: 6, x: 10, z: -45, owner: "crown", revealed: false, fortified: false, links: [5] }
    ],
    activeRegion: 0,
    conquered: new Set([0]),
    tombstones: [],
    won: false
  };
}

export function claimRegion(campaign, regionId, rivalFaction, servantCount) {
  const region = campaign.regions.find(r => r.id === regionId);
  if (!region) throw new Error("Unknown region");
  region.owner = FACTION.PLAYER;
  region.revealed = true;
  campaign.activeRegion = regionId;
  campaign.conquered.add(regionId);
  for (const linkedId of region.links) campaign.regions[linkedId].revealed = true;
  campaign.won = regionId === 6;
  return { recruits: servantCount, revealed: region.links.filter(id => campaign.regions[id].revealed) };
}

export function counterattack(campaign, fromRegionId) {
  const source = campaign.regions.find(r => r.id === fromRegionId);
  const candidates = source.links
    .map(id => campaign.regions[id])
    .filter(r => r.owner === FACTION.PLAYER && !r.fortified);
  const lost = candidates.sort((a, b) => b.id - a.id)[0] ?? null;
  if (lost) {
    lost.owner = source.owner ?? FACTION.CORAL;
    campaign.conquered.delete(lost.id);
  }
  const safe = [...campaign.regions]
    .filter(r => r.owner === FACTION.PLAYER)
    .sort((a, b) => Number(b.fortified) - Number(a.fortified) || a.id - b.id)[0];
  campaign.activeRegion = safe?.id ?? 0;
  return { lostRegion: lost?.id ?? null, retreatRegion: campaign.activeRegion };
}

export function resolveEncounter({ playerHealth, enemyMasterHealth, livingEnemyServants, enemyServantCount }) {
  if (playerHealth <= 0) return { outcome: "defeat", recruits: 0 };
  if (enemyMasterHealth <= 0 && livingEnemyServants === 0) {
    return { outcome: "victory", recruits: enemyServantCount };
  }
  return { outcome: "active", recruits: 0 };
}

export function regenHealth(health, maxHealth, sinceDamage, dt) {
  return sinceDamage < 3 ? health : Math.min(maxHealth, health + maxHealth * 0.07 * dt);
}

export function commanderCombatProfile(faction) {
  return faction === "enemy"
    ? { maxHealth: 500, attack: 48, regenDelay: 4.5, regenPerSecond: 2.6 }
    : { maxHealth: 1000, attack: 96, regenDelay: 4.5, regenPerSecond: 5 };
}

export function commanderRegenHealth(health, maxHealth, sinceDamage, dt, delay, perSecond) {
  return sinceDamage < delay ? health : Math.min(maxHealth, health + perSecond * dt);
}

export function defeatRosterPlan(currentCount, startingCount = 6) {
  return {
    keep: Math.min(currentCount, startingCount),
    remove: Math.max(0, currentCount - startingCount),
    spawn: Math.max(0, startingCount - currentCount)
  };
}

export function postRespawnResolution(enemyAlive) {
  return enemyAlive ? "resume" : "resolve-victory";
}

export function encounterResolutionState({
  hasEncounter,
  encounterDone,
  playerAlive,
  enemyRosterCount,
  livingEnemyCount
}) {
  if (!hasEncounter) return "none";
  if (playerAlive && enemyRosterCount > 0 && livingEnemyCount === 0) return "victory";
  if (encounterDone) return "paused";
  if (!playerAlive) return "respawn";
  return "active";
}

export function revivalProgressionState({ waitingForRecruits, revivingFollowerCount }) {
  if (!waitingForRecruits) return "inactive";
  return revivingFollowerCount > 0 ? "waiting" : "advance";
}

export function advanceGroundFragment({ position, velocity, halfSize, bounces, settled, dt, groundY = .02 }) {
  if (settled) {
    return {
      position: { x: position.x, y: groundY + halfSize, z: position.z },
      velocity: { x: 0, y: 0, z: 0 },
      bounces,
      settled: true
    };
  }
  const nextVelocity = { x: velocity.x, y: velocity.y - 8.5 * dt, z: velocity.z };
  const nextPosition = {
    x: position.x + nextVelocity.x * dt,
    y: position.y + nextVelocity.y * dt,
    z: position.z + nextVelocity.z * dt
  };
  const floor = groundY + halfSize;
  if (nextPosition.y > floor) {
    return { position: nextPosition, velocity: nextVelocity, bounces, settled: false };
  }
  nextPosition.y = floor;
  if (bounces < 2 && Math.abs(nextVelocity.y) > .45) {
    nextVelocity.y = Math.abs(nextVelocity.y) * .32;
    nextVelocity.x *= .7;
    nextVelocity.z *= .7;
    return { position: nextPosition, velocity: nextVelocity, bounces: bounces + 1, settled: false };
  }
  return {
    position: nextPosition,
    velocity: { x: 0, y: 0, z: 0 },
    bounces,
    settled: true
  };
}

export function particleBudgetAllows(activeCount, maximum = 180) {
  return activeCount < maximum;
}

export function unitCommanderProfile() {
  return commanderCombatProfile("player");
}

export function limitPointToRadius(point, center, maxRadius) {
  const dx = point.x - center.x;
  const dz = point.z - center.z;
  const distance = Math.hypot(dx, dz);
  if (distance <= maxRadius || distance === 0) return { x: point.x, z: point.z };
  const scale = maxRadius / distance;
  return { x: center.x + dx * scale, z: center.z + dz * scale };
}

export function resolveBoxOverlap(a, aHalf, b, bHalf) {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const overlapX = aHalf.x + bHalf.x - Math.abs(dx);
  const overlapZ = aHalf.z + bHalf.z - Math.abs(dz);
  if (overlapX <= 0 || overlapZ <= 0) return null;
  if (overlapX < overlapZ) {
    const direction = dx < 0 ? -1 : 1;
    return { ax: -direction * overlapX * .5, az: 0, bx: direction * overlapX * .5, bz: 0 };
  }
  const direction = dz < 0 ? -1 : 1;
  return { ax: 0, az: -direction * overlapZ * .5, bx: 0, bz: direction * overlapZ * .5 };
}

export function chooseServantMode({ combat, masterRetreating, distanceToMaster, attackLeash, locked = false }) {
  return locked || (combat && !masterRetreating && distanceToMaster <= attackLeash)
    ? SERVANT_MODE.ATTACK
    : SERVANT_MODE.FOLLOW;
}

export function applyLinearFriction(speed, friction, dt) {
  return Math.max(0, speed - friction * dt);
}

export function shouldRepositionFollower({ combat, urgent, leaderSpeed, distanceToMaster, leash }) {
  return combat || urgent || leaderSpeed > .08 || distanceToMaster > leash;
}

export function hitKnockback(attacker, victim, force) {
  const dx = victim.x - attacker.x;
  const dz = victim.z - attacker.z;
  const length = Math.hypot(dx, dz);
  if (length < 1e-6) return { x: force, z: 0 };
  return { x: dx / length * force, z: dz / length * force };
}

export function chooseBalancedTargetIndex(distances, loads) {
  let best = -1;
  for (let i = 0; i < distances.length; i++) {
    if (loads[i] > 0) continue;
    if (best === -1 || distances[i] < distances[best]) best = i;
  }
  return best;
}

export function activeCombatantPoints(actors) {
  return actors
    .filter(actor => (actor?.alive ?? actor?.userData?.alive) !== false && actor?.position)
    .map(actor => ({ x: actor.position.x, z: actor.position.z }));
}

export function tacticalCameraFrame(points, { aspect = 16 / 9, baseSpan = 14, padding = 2.8, maxScale = 1.58 } = {}) {
  const valid = points.filter(point => Number.isFinite(point?.x) && Number.isFinite(point?.z));
  if (!valid.length) return null;
  const xs = valid.map(point => point.x);
  const zs = valid.map(point => point.z);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minZ = Math.min(...zs), maxZ = Math.max(...zs);
  const horizontalSpan = (maxX - minX + padding * 2) / Math.max(.8, aspect);
  const depthSpan = maxZ - minZ + padding * 2;
  const scale = Math.min(maxScale, Math.max(1, horizontalSpan / baseSpan, depthSpan / baseSpan));
  return {
    x: (minX + maxX) * .5,
    z: (minZ + maxZ) * .5,
    scale
  };
}

export function gameplayCameraDistanceScale(scale, { combat = false, defaultZoom = 1.2 } = {}) {
  const safeScale = Number.isFinite(scale) ? scale : 1;
  const safeDefaultZoom = Number.isFinite(defaultZoom) ? Math.max(1, defaultZoom) : 1.2;
  return safeScale * (combat ? 1 : safeDefaultZoom);
}

export function incomingWaveCameraState({ distance, previewRadius = 18, arrivalRadius = 6.2 }) {
  if (!Number.isFinite(distance) || distance > previewRadius || distance <= arrivalRadius) return "default";
  return "preview";
}

export function cameraBaselineAfterDivision(currentScale, { increment = .12, maxScale = 1.34 } = {}) {
  const safeScale = Number.isFinite(currentScale) ? currentScale : 1;
  return Math.min(maxScale, Math.max(1, Math.round((safeScale + increment) * 100) / 100));
}

export function swarmTravelGroupCount(count) {
  return Math.max(1, Math.min(4, Math.ceil(Math.max(0, count) / 9)));
}

export function swarmTravelRadius(count) {
  return 4.4 + (swarmTravelGroupCount(count) - 1) * 3;
}

export function swarmTravelOffset(index, count) {
  const groupCount = swarmTravelGroupCount(count);
  const safeIndex = Math.max(0, index);
  const groupIndex = safeIndex % groupCount;
  const localIndex = Math.floor(safeIndex / groupCount);
  const baseGroupSize = Math.floor(Math.max(0, count) / groupCount);
  const groupSize = Math.max(1, baseGroupSize + (groupIndex < Math.max(0, count) % groupCount ? 1 : 0));
  const row = Math.floor(localIndex / 3);
  const rowStart = row * 3;
  const rowCount = Math.min(3, Math.max(1, groupSize - rowStart));
  const column = localIndex - rowStart;
  const internalSpacing = 1.25 + Math.min(.35, Math.max(0, count - 6) * .012);
  const groupSpacing = 4.35 + Math.min(1.4, Math.max(0, groupCount - 1) * .24);
  return {
    groupIndex,
    groupCount,
    lateral: (groupIndex - (groupCount - 1) * .5) * groupSpacing + (column - (rowCount - 1) * .5) * internalSpacing,
    trailing: 1.7 + row * 1.5 + (groupIndex % 2) * .32
  };
}

export function snapTacticalCell(point, cellSize = 1.8, offset = 0) {
  return {
    x: Math.round((point.x - offset) / cellSize) * cellSize + offset,
    z: Math.round((point.z - offset) / cellSize) * cellSize + offset
  };
}

export function tacticalCellBlocked({ cell, actors, excludedIds = [], cellSize = 3.6, offset = 1.8 }) {
  const excluded = new Set(excludedIds);
  return actors.some(actor => {
    if (actor.alive === false || excluded.has(actor.id)) return false;
    const occupiedCell = snapTacticalCell(actor, cellSize, offset);
    return occupiedCell.x === cell.x && occupiedCell.z === cell.z;
  });
}

export function tacticalCellAction({ inRange, occupied }) {
  if (!inRange) return "reject";
  return occupied ? "cancel" : "move";
}

export function tacticalCommandScale(hasSelection) {
  return hasSelection ? .25 : 1;
}

export function tacticalInputEnabled(mode) {
  return mode === "playing" || mode === "paused";
}

export function tacticalSelectionScope({ isMaster }) {
  return isMaster ? "commander" : "company";
}

export function commanderControlState({ combat, manualOrder }) {
  if (manualOrder) return "move";
  return combat ? "engage" : "hold";
}

export function tacticalOrderState({ combat, hasDestination, arrived }) {
  if (hasDestination && !arrived) return "move";
  if (combat) return "combat";
  return "hold";
}

export function companyCommandState({ manualOrder, combat, enemyDetected, commanderMoving }) {
  if (manualOrder) return "move";
  if (combat) return "combat";
  if (enemyDetected) return "deploy";
  return "follow";
}

export function companyLeaderMotion({ ownCommanderMoving }) {
  return Boolean(ownCommanderMoving);
}

export function battleApproachState({ distance, detectionRadius = 9.5, aggroRadius = 6.2 }) {
  if (distance <= aggroRadius) return "combat";
  if (distance <= detectionRadius) return "deploy";
  return "travel";
}

export function companyFormationOffset(index, count, spacing = 1.35) {
  const safeCount = Math.max(1, count);
  const columns = Math.min(6, safeCount);
  const row = Math.floor(Math.max(0, index) / columns);
  const rowCount = Math.min(columns, safeCount - row * columns);
  const column = Math.max(0, index) % columns;
  return {
    lateral: (column - (rowCount - 1) * .5) * spacing,
    trailing: .95 + row * spacing * 1.1
  };
}

export function formationExpansionOffset(index, count, progress, columns = 3) {
  const safeCount = Math.max(1, Math.floor(count));
  const safeColumns = Math.max(1, Math.min(Math.floor(columns), safeCount));
  const safeIndex = Math.min(safeCount - 1, Math.max(0, Math.floor(index)));
  const row = Math.floor(safeIndex / safeColumns);
  const rowCount = Math.min(safeColumns, safeCount - row * safeColumns);
  const column = safeIndex % safeColumns;
  const rows = Math.ceil(safeCount / safeColumns);
  const lateralRadius = Math.max(.5, (safeColumns - 1) * .5);
  const depthRadius = Math.max(.5, (rows - 1) * .5);
  const lateralDistance = Math.abs(column - (rowCount - 1) * .5) / lateralRadius;
  const depthDistance = Math.abs(row - (rows - 1) * .5) / depthRadius;
  const edgeScore = Math.min(1, (lateralDistance + depthDistance * .55) / 1.55);
  const threshold = edgeScore > .58 ? 0 : edgeScore > .28 ? .34 : .67;
  const activation = Math.max(0, Math.min(1, (Math.max(0, Math.min(1, progress)) - threshold) / .33));
  const sideBias = safeIndex % 5 === 1 ? -1 : safeIndex % 5 === 3 ? 1 : 0;
  return { activation, forward: 1.35 * activation, lateral: .46 * sideBias * activation };
}

export function commanderFormationOffset(spacing = 1.35) {
  return { lateral: 0, trailing: -spacing };
}

export function canDivideCompany(soldierCount, threshold = 12) {
  return soldierCount > threshold;
}

export function companyDivisionPlan(soldierCount, threshold = 12) {
  if (!canDivideCompany(soldierCount, threshold)) {
    return { promotedIndex: -1, transferIndices: [] };
  }
  const remaining = soldierCount - 1;
  const transferCount = Math.floor(remaining / 2);
  return {
    promotedIndex: 0,
    transferIndices: Array.from({ length: transferCount }, (_, index) => index + 1)
  };
}

export function combatVisualPose({ attack = 0, damage = 0, reducedMotion = false }) {
  if (reducedMotion) return { scaleX: 1, scaleY: 1, scaleZ: 1, forward: 0, lift: 0 };
  const attackPulse = Math.sin(Math.PI * .5 * Math.max(0, Math.min(1, attack)));
  const damagePulse = Math.sin(Math.PI * .5 * Math.max(0, Math.min(1, damage)));
  return {
    scaleX: 1 + attackPulse * .08 + damagePulse * .16,
    scaleY: 1 + attackPulse * .05 - damagePulse * .12,
    scaleZ: 1 - attackPulse * .2 + damagePulse * .14,
    forward: attackPulse * .42,
    lift: damagePulse * .1
  };
}

export function chooseCommanderBlockerIndex({ commander, target, soldiers, lookAhead = 2.4, corridorHalfWidth = .72, threatRadius = 1.25 }) {
  let fx = target.x - commander.x;
  let fz = target.z - commander.z;
  const forwardLength = Math.hypot(fx, fz);
  if (forwardLength < 1e-6) return -1;
  fx /= forwardLength;
  fz /= forwardLength;
  const sx = -fz;
  const sz = fx;
  let best = -1;
  let bestScore = Infinity;
  for (let index = 0; index < soldiers.length; index++) {
    const soldier = soldiers[index];
    if (soldier.alive === false) continue;
    const rx = soldier.x - commander.x;
    const rz = soldier.z - commander.z;
    const distance = Math.hypot(rx, rz);
    const projection = rx * fx + rz * fz;
    const lateral = Math.abs(rx * sx + rz * sz);
    const obstructing = projection > 0 && projection < lookAhead && lateral < corridorHalfWidth;
    const immediateThreat = soldier.threatening && distance <= threatRadius;
    if (!obstructing && !immediateThreat) continue;
    const score = immediateThreat ? distance - .5 : projection + lateral * .35;
    if (score < bestScore) {
      bestScore = score;
      best = index;
    }
  }
  return best;
}

export function chooseCommanderTargetIndex({ commander, opponents, targetLoads = [], preferCommander = true }) {
  let best = -1;
  let bestScore = Infinity;
  for (let index = 0; index < opponents.length; index++) {
    const opponent = opponents[index];
    if (opponent?.alive === false) continue;
    const load = targetLoads[index] ?? 0;
    const commanderPriority = preferCommander
      ? (opponent.isCommander ? -8 : 0)
      : (opponent.isCommander ? 2.5 : 0);
    const distance = Math.hypot(opponent.x - commander.x, opponent.z - commander.z);
    const score = load * 12 + distance + commanderPriority;
    if (score < bestScore) {
      bestScore = score;
      best = index;
    }
  }
  return best;
}

export function prioritizedOpponents(soldiers, commander) {
  const livingSoldiers = soldiers.filter(soldier => (soldier.userData?.alive ?? soldier.alive) !== false);
  if (livingSoldiers.length) return livingSoldiers;
  return commander && (commander.userData?.alive ?? commander.alive) !== false ? [commander] : [];
}

export function duelAttackHits(sequence) {
  return true;
}

export function nextDuelTurn({ attackerId, defenderId, strikeLanded }) {
  return strikeLanded ? defenderId : attackerId;
}

export function advanceDuelState({ phase, timer, distance, strikeDistance = Infinity, strikeRange = 1.15, dt }) {
  if (phase === DUEL_PHASE.APPROACH) {
    return distance <= .16
      ? { phase: DUEL_PHASE.LUNGE, timer: .48, strike: false }
      : { phase, timer: 0, strike: false };
  }
  if (phase === DUEL_PHASE.LUNGE) {
    const strikeArmed = timer <= .34;
    if (strikeArmed && strikeDistance <= strikeRange) {
      return { phase: DUEL_PHASE.RECOVER, timer: .72, strike: true };
    }
    const remaining = timer - dt;
    return remaining <= 0
      ? { phase: DUEL_PHASE.APPROACH, timer: 0, strike: false }
      : { phase, timer: remaining, strike: false };
  }
  return timer - dt <= 0
    ? { phase: DUEL_PHASE.APPROACH, timer: 0, strike: false }
    : { phase, timer: timer - dt, strike: false };
}

export function recruitRevivalTiming(index) {
  return { delay: 2, duration: 3.6 + index * .15 };
}

export function soldierFragmentCount(roll) {
  return 8 + Math.min(4, Math.floor(Math.max(0, roll) * 5));
}

export function revivalBlinkIntensity(progress) {
  const wave = .5 + .5 * Math.cos(progress * Math.PI * 12);
  return .12 + Math.pow(wave, 3) * 7.88;
}

export function shouldReleaseCombatCommitment(combat, livingEnemyCount) {
  return !combat || livingEnemyCount === 0;
}

export const SOLDIER_HEALTH_WIDGET_DURATION = 3.2;

export function advanceLaggingHealthBar({ current, lag, hold, visibleTimer, dt }) {
  const nextHold = Math.max(0, hold - dt);
  const nextLag = nextHold > 0 ? Math.max(current, lag) : Math.max(current, lag - 45 * dt);
  const nextTimer = Math.max(0, visibleTimer - dt);
  return { current, lag: nextLag, hold: nextHold, visibleTimer: nextTimer, visible: nextTimer > 0 };
}

export function actorCollisionProfile(kind) {
  return { x: .215, z: .195 };
}

export function soldierSpacingProfile(inBattle, swarmSize = 1) {
  const growth = Math.min(.58, Math.max(0, swarmSize - 6) * .024);
  return inBattle
    ? { distance: .94, strength: .68 }
    : { distance: 1.12 + growth, strength: .92 + growth * .22 };
}

export function standOffPoint(attacker, target, distance) {
  let dx = attacker.x - target.x;
  let dz = attacker.z - target.z;
  const length = Math.hypot(dx, dz);
  if (length < 1e-6) {
    dx = 1;
    dz = 0;
  } else {
    dx /= length;
    dz /= length;
  }
  return { x: target.x + dx * distance, z: target.z + dz * distance };
}

export function standOffPursuitPoint(attacker, target, distance, tolerance = .1) {
  const currentDistance = Math.hypot(attacker.x - target.x, attacker.z - target.z);
  if (Math.abs(currentDistance - distance) <= tolerance) return { x: attacker.x, z: attacker.z, settled: true };
  const correctionDistance = currentDistance < distance - tolerance ? distance + tolerance : distance;
  return { ...standOffPoint(attacker, target, correctionDistance), settled: false };
}

export function arrivalSpeed(distance, maxSpeed, stopRadius = .06, slowRadius = .7) {
  if (distance <= stopRadius || maxSpeed <= 0) return 0;
  return maxSpeed * Math.min(1, (distance - stopRadius) / Math.max(.001, slowRadius - stopRadius));
}

export function commanderTacticalWaypoint({ commander, target, battleCenter, duelAge, flankSide = 1 }) {
  let fx = target.x - battleCenter.x;
  let fz = target.z - battleCenter.z;
  const length = Math.hypot(fx, fz) || 1;
  fx /= length;
  fz /= length;
  const sx = -fz * (flankSide < 0 ? -1 : 1);
  const sz = fx * (flankSide < 0 ? -1 : 1);
  if (duelAge < .85) {
    return {
      x: battleCenter.x - fx * 1.35 + sx * .65,
      z: battleCenter.z - fz * 1.35 + sz * .65,
      phase: "hold",
      speedScale: .42
    };
  }
  if (duelAge < 2.4) {
    return {
      x: target.x - fx * .35 + sx * 2.35,
      z: target.z - fz * .35 + sz * 2.35,
      phase: "flank",
      speedScale: .78
    };
  }
  return { x: commander.x, z: commander.z, phase: "engage", speedScale: 1 };
}

export function commanderClearanceVector({ soldier, commander, forward, preferRight = true, radius = 1.2, frontLength = 2.25, frontHalfWidth = 1.28 }) {
  const relativeX = soldier.x - commander.x;
  const relativeZ = soldier.z - commander.z;
  const distance = Math.hypot(relativeX, relativeZ);
  const forwardLength = Math.hypot(forward.x, forward.z) || 1;
  const fx = forward.x / forwardLength;
  const fz = forward.z / forwardLength;
  const sx = -fz;
  const sz = fx;
  let x = 0;
  let z = 0;
  if (distance < radius) {
    const pressure = (radius - distance) / radius;
    if (distance < 1e-6) {
      const sign = preferRight ? 1 : -1;
      x += sx * pressure * sign;
      z += sz * pressure * sign;
    } else {
      x += relativeX / distance * pressure;
      z += relativeZ / distance * pressure;
    }
  }
  const projection = relativeX * fx + relativeZ * fz;
  const lateral = relativeX * sx + relativeZ * sz;
  if (projection > 0 && projection < frontLength && Math.abs(lateral) < frontHalfWidth) {
    const sign = Math.abs(lateral) > .04 ? Math.sign(lateral) : (preferRight ? 1 : -1);
    const pressure = (1 - projection / frontLength) * (1 - Math.abs(lateral) / frontHalfWidth);
    x += sx * pressure * sign;
    z += sz * pressure * sign;
  }
  return { x, z };
}

export function advancePathFailure({ previousDistance, distance, timer, failures, dt, window = .72, progressEpsilon = .07, maxFailures = 3 }) {
  if (!Number.isFinite(previousDistance) || distance < previousDistance - progressEpsilon) {
    return { previousDistance: distance, timer: 0, failures: 0, relock: false };
  }
  const nextTimer = timer + dt;
  if (nextTimer < window) return { previousDistance, timer: nextTimer, failures, relock: false };
  const nextFailures = failures + 1;
  return { previousDistance: distance, timer: 0, failures: nextFailures, relock: nextFailures >= maxFailures };
}

export function canApplyAttackDamage({ attackerAlive, victimAlive, opposingFactions, cooldown, distance, range }) {
  return attackerAlive && victimAlive && opposingFactions && cooldown <= 0 && distance <= range;
}

export function chooseLocalDetour({ start, goal, obstacles, clearance = .5, lookAhead = 1.5, preferLeft = true }) {
  const dx = goal.x - start.x, dz = goal.z - start.z, length = Math.hypot(dx, dz);
  if (length < .001) return null;
  const forward = { x: dx / length, z: dz / length }, side = { x: -forward.z, z: forward.x };
  let blocker = null, nearestProjection = Infinity;
  for (const obstacle of obstacles) {
    const ox = obstacle.x - start.x, oz = obstacle.z - start.z;
    const projection = ox * forward.x + oz * forward.z;
    const lateral = Math.abs(ox * side.x + oz * side.z);
    const blockedWidth = (obstacle.radius ?? .2) + clearance;
    if (projection > .05 && projection < Math.min(lookAhead, length) && lateral < blockedWidth && projection < nearestProjection) {
      blocker = obstacle; nearestProjection = projection;
    }
  }
  if (!blocker) return null;
  const offset = (blocker.radius ?? .2) + clearance;
  const candidates = [
    { x: blocker.x + side.x * offset, z: blocker.z + side.z * offset, left: true },
    { x: blocker.x - side.x * offset, z: blocker.z - side.z * offset, left: false }
  ];
  const score = candidate => {
    let space = Infinity;
    for (const obstacle of obstacles) {
      if (obstacle === blocker) continue;
      space = Math.min(space, Math.hypot(candidate.x - obstacle.x, candidate.z - obstacle.z) - (obstacle.radius ?? .2));
    }
    return (Number.isFinite(space) ? space : 4) - Math.hypot(candidate.x - goal.x, candidate.z - goal.z) * .08 + (candidate.left === preferLeft ? .01 : 0);
  };
  return score(candidates[0]) >= score(candidates[1]) ? candidates[0] : candidates[1];
}

export function smoothAngle(current, target, response, dt) {
  const difference = Math.atan2(Math.sin(target - current), Math.cos(target - current));
  return current + difference * (1 - Math.exp(-response * dt));
}

export function waveSizeFromRoll(roll) {
  return 2 + Math.min(3, Math.floor(Math.max(0, roll) * 4));
}

export const PRACTICE_WAVE_INTERVAL = 5;

export function practiceWaveInterval(roll = 0) {
  const normalizedRoll = Math.min(.999999, Math.max(0, roll));
  return PRACTICE_WAVE_INTERVAL + Math.floor(normalizedRoll * 3);
}

export function practiceWaveSize(waveIndex, roll = 0) {
  const index = Math.max(0, Math.floor(waveIndex));
  const range = index < 4 ? [5, 6] : index < 8 ? [5, 7] : index < 10 ? [6, 8] : null;
  if (!range) return null;
  const normalizedRoll = Math.min(.999999, Math.max(0, roll));
  return range[0] + Math.floor(normalizedRoll * (range[1] - range[0] + 1));
}

export function practiceEnemyHealthMultiplier(waveNumber) {
  const wave = Math.max(1, Math.min(10, Math.floor(waveNumber)));
  const fivePercentSteps = Math.min(4, wave - 1);
  const sevenPointFivePercentSteps = Math.max(0, wave - 5);
  return 1.05 ** fivePercentSteps * 1.075 ** sevenPointFivePercentSteps;
}

export function centeredPackOffset(index, count, spacing = 1.25) {
  const safeCount = Math.max(1, Math.floor(count));
  const columns = Math.min(3, safeCount);
  const safeIndex = Math.min(safeCount - 1, Math.max(0, Math.floor(index)));
  const row = Math.floor(safeIndex / columns);
  const rowCount = Math.min(columns, safeCount - row * columns);
  const column = safeIndex % columns;
  const fullRows = Math.floor(safeCount / columns);
  const remainder = safeCount % columns;
  const weightedRow = (
    columns * fullRows * (fullRows - 1) * .5 + fullRows * remainder
  ) / safeCount;
  return {
    lateral: (column - (rowCount - 1) * .5) * spacing,
    forward: (weightedRow - row) * spacing
  };
}

export function playerThreatScore({ livingSoldiers, averageSoldierHealthRatio, commanderHealthRatio }) {
  const count = Math.max(0, livingSoldiers);
  const soldierHealth = Math.max(0, Math.min(1, averageSoldierHealthRatio));
  const commanderHealth = Math.max(0, Math.min(1, commanderHealthRatio));
  return count * (.68 + soldierHealth * .32) + 1.6 + commanderHealth * 1.4;
}

export function difficultyEncounter({ wave, playerThreat, fluctuationRoll }) {
  const safeWave = Math.max(1, wave);
  const trend = 1 + Math.min(.72, Math.max(0, safeWave - 1) * .055);
  const fluctuation = .86 + Math.max(0, Math.min(1, fluctuationRoll)) * .28;
  const threatBudget = Math.max(3, Math.min(14, playerThreat * trend * fluctuation));
  const soldierCount = Math.max(3, Math.min(14, Math.round(threatBudget)));
  const swarmCount = safeWave >= 3 && safeWave % 3 === 0 ? 2 : 1;
  const firstSwarm = Math.ceil(soldierCount / swarmCount);
  const swarmSizes = swarmCount === 1 ? [soldierCount] : [firstSwarm, soldierCount - firstSwarm];
  return { threatBudget, soldierCount, swarmCount, swarmSizes, trend, fluctuation };
}

export function hiddenWaveSpawn(center, angle, distance) {
  return { x: center.x + Math.sin(angle) * distance, z: center.z + Math.cos(angle) * distance };
}

export function chooseHiddenSpawn(center, candidates, minDistance, isVisible) {
  for (const candidate of candidates) {
    const distance = Math.hypot(candidate.x - center.x, candidate.z - center.z);
    if (distance >= minDistance && !isVisible(candidate)) return candidate;
  }
  return null;
}

export function floorTileKeys(center, tileSize, radius) {
  const cx = Math.floor(center.x / tileSize);
  const cz = Math.floor(center.z / tileSize);
  const keys = [];
  for (let x = cx - radius; x <= cx + radius; x++) {
    for (let z = cz - radius; z <= cz + radius; z++) keys.push(`${x},${z}`);
  }
  return keys;
}

export function swarmsHaveContact(swarmA, swarmB, sightRange) {
  const rangeSquared = sightRange * sightRange;
  for (const a of swarmA) {
    if ((a.userData?.alive ?? a.alive) === false) continue;
    const aPosition = a.position ?? a;
    for (const b of swarmB) {
      if ((b.userData?.alive ?? b.alive) === false) continue;
      const bPosition = b.position ?? b;
      const dx = bPosition.x - aPosition.x;
      const dz = bPosition.z - aPosition.z;
      if (dx * dx + dz * dz <= rangeSquared) return true;
    }
  }
  return false;
}

export function separationVector(origin, neighbors, preferredDistance) {
  let x = 0;
  let z = 0;
  for (const neighbor of neighbors) {
    const position = neighbor.position ?? neighbor;
    const dx = origin.x - position.x;
    const dz = origin.z - position.z;
    const distance = Math.hypot(dx, dz);
    if (distance >= preferredDistance) continue;
    const pressure = (preferredDistance - distance) / preferredDistance;
    if (distance < 1e-6) x += pressure;
    else {
      x += dx / distance * pressure;
      z += dz / distance * pressure;
    }
  }
  return { x, z };
}

export function shouldEnemyEvade(livingSoldiers) {
  return false;
}

export function advanceRevival({ elapsed, delay, duration, dt }) {
  const nextElapsed = elapsed + dt;
  if (nextElapsed < delay) {
    return { elapsed: nextElapsed, phase: "waiting", progress: 0, hover: 0, intensity: 0 };
  }
  const progress = Math.min(1, (nextElapsed - delay) / duration);
  if (progress >= 1) {
    return { elapsed: nextElapsed, phase: "complete", progress: 1, hover: 0, intensity: 0 };
  }
  const wave = .5 + .5 * Math.cos(progress * Math.PI * 12);
  const hover = (wave - .5) * .18;
  const intensity = revivalBlinkIntensity(progress);
  return { elapsed: nextElapsed, phase: "rising", progress, hover, intensity };
}

export function advanceFollowAwareness({ state, moved, threshold, timer, responseDelay, dt, urgent }) {
  if (urgent) return { state: FOLLOW_AWARENESS.TRACKING, timer: 0, updateAnchor: true };
  if (state === FOLLOW_AWARENESS.HOLDING && moved > threshold) {
    return { state: FOLLOW_AWARENESS.RESPONDING, timer: responseDelay, updateAnchor: false };
  }
  if (state === FOLLOW_AWARENESS.RESPONDING) {
    const remaining = timer - dt;
    if (remaining <= 0) return { state: FOLLOW_AWARENESS.TRACKING, timer: 0, updateAnchor: true };
    return { state, timer: remaining, updateAnchor: false };
  }
  return { state, timer, updateAnchor: state === FOLLOW_AWARENESS.TRACKING };
}

function clamp01(value) {
  return Math.min(1, Math.max(0, value));
}

function segmentDistanceToPoint(start, end, point) {
  const dx = end.x - start.x;
  const dz = end.z - start.z;
  const lengthSq = dx * dx + dz * dz;
  if (lengthSq < 1e-6) return Math.hypot(point.x - start.x, point.z - start.z);
  const t = clamp01(((point.x - start.x) * dx + (point.z - start.z) * dz) / lengthSq);
  const closestX = start.x + dx * t;
  const closestZ = start.z + dz * t;
  return Math.hypot(point.x - closestX, point.z - closestZ);
}

export function lineOfSightBlocked(start, end, obstacles = [], corridorHalfWidth = .34) {
  for (const obstacle of obstacles) {
    if (!obstacle) continue;
    const radius = Number.isFinite(obstacle.radius) ? obstacle.radius : 0;
    if (segmentDistanceToPoint(start, end, obstacle) <= radius + corridorHalfWidth) return true;
  }
  return false;
}

export function actorDebugSnapshot({
  actor,
  target = null,
  combat = false,
  targetDistance = null,
  lineOfSight = true,
  pathBlocked = false,
  collisionContacts = 0,
  attackRange = 1.05,
  now = 0
} = {}) {
  const data = actor?.userData ?? {};
  const alive = data.alive !== false;
  const targetAlive = !!target && (target.userData?.alive ?? target.alive) !== false;
  const cooldown = Math.max(0, data.cool ?? 0);
  const locked = !!data.lockedTarget && targetAlive;
  const duelPhase = data.duelPhase ?? null;
  const inRange = targetDistance == null ? null : targetDistance <= attackRange;
  const visibleCooldown = cooldown > 0 ? `${cooldown.toFixed(2)}s` : "ready";
  const blockers = [];

  if (!alive) blockers.push("down");
  else {
    if (!target) blockers.push("no target");
    else if (!targetAlive) blockers.push("target down");
    if (data.waitingDuelTarget) blockers.push("waiting for duel slot");
    if (cooldown > 0) blockers.push(`cooldown ${visibleCooldown}`);
    if (targetDistance != null && !inRange) blockers.push(`out of range ${targetDistance.toFixed(2)}/${attackRange.toFixed(2)}`);
    if (!lineOfSight) blockers.push("line of sight blocked");
    if (pathBlocked) blockers.push(`path stalled ${data.pathFailures ?? 0}`);
    if (collisionContacts > 0.1) blockers.push("collision blocked");
  }

  let action = "idle";
  if (!alive) action = "down";
  else if ((data.damageAnim ?? 0) > .2 || (data.hitPulse ?? 0) > .2) action = "stunned";
  else if (locked && targetAlive) action = duelPhase === DUEL_PHASE.LUNGE || (data.attackAnim ?? 0) > .1 ? "attacking" : "seeking";
  else if (combat && (data.manualMoving || data.seekingTarget)) action = "seeking";
  else if ((data.manualMoving || (data.velocity?.lengthSq?.() ?? 0) > .01) && !data.lockedTarget) action = "moving";

  if (combat && data.manualMoving && !data.lockedTarget && targetDistance != null && targetDistance > attackRange * 1.75) {
    action = "fleeing";
  }

  return {
    action,
    alive,
    attackRange,
    blockers,
    combatState: data.duelPhase ?? null,
    collisionContacts,
    cooldown,
    lineOfSight,
    locked,
    now,
    pathFailures: data.pathFailures ?? 0,
    pathStallTimer: data.pathStallTimer ?? 0,
    targetAlive,
    targetDistance,
    targetId: target?.id ?? null,
    targetLockedByOther: target ? target.userData?.lockedTarget && target.userData.lockedTarget !== actor : false,
    lastAttackAt: data.lastAttackTime ?? null,
    lastDamageAt: data.lastDamageTime ?? null,
    mode: data.mode ?? null,
    faction: data.faction ?? null,
    isMaster: !!data.isMaster,
    hp: data.hp ?? 0,
    maxHp: data.maxHp ?? 1,
    followState: data.followState ?? null
  };
}
