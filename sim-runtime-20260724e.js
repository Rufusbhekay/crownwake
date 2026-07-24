export const FACTION = { PLAYER: "player", CORAL: "coral", AMBER: "amber" };
export const SERVANT_MODE = { FOLLOW: "follow", ATTACK: "attack" };
export const FOLLOW_AWARENESS = { HOLDING: "holding", RESPONDING: "responding", TRACKING: "tracking" };
export const DUEL_PHASE = { APPROACH: "approach", LUNGE: "lunge", RECOVER: "recover" };

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

export function battleLineOffset(index, count, spacing = 2.05) {
  return (index - (count - 1) * .5) * spacing;
}

export function battleLineSpacing(count) {
  return 1.72 + Math.min(.33, Math.max(0, count - 4) * .035);
}

export function tacticalCameraFrame(points, { aspect = 16 / 9, baseSpan = 14, padding = 2.8, maxScale = 1.45 } = {}) {
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

export function battleLineFormationDuration(count) {
  return 1.65 + Math.min(5.2, Math.max(0, count - 4) * .45);
}

export function battlePreparationState({ combat, formationTime, livingFollowerCount, livingEnemySoldierCount }) {
  const formationSize = Math.max(livingFollowerCount, livingEnemySoldierCount);
  return {
    formationSize,
    formingBattleLine: combat && formationTime < battleLineFormationDuration(formationSize)
  };
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

export function advanceDuelState({ phase, timer, distance, dt }) {
  if (phase === DUEL_PHASE.APPROACH) {
    return distance <= .16
      ? { phase: DUEL_PHASE.LUNGE, timer: .24, strike: false }
      : { phase, timer: 0, strike: false };
  }
  if (phase === DUEL_PHASE.LUNGE) {
    return timer - dt <= 0
      ? { phase: DUEL_PHASE.RECOVER, timer: .72, strike: true }
      : { phase, timer: timer - dt, strike: false };
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

export function advanceLaggingHealthBar({ current, lag, hold, visibleTimer, dt }) {
  const nextHold = Math.max(0, hold - dt);
  const nextLag = nextHold > 0 ? Math.max(current, lag) : Math.max(current, lag - 45 * dt);
  const nextTimer = Math.max(0, visibleTimer - dt);
  return { current, lag: nextLag, hold: nextHold, visibleTimer: nextTimer, visible: nextTimer > 0 };
}

export function actorCollisionProfile(kind) {
  return { x: .215, z: .195 };
}

export function engagementAllocation(attackerCount, defenderCount) {
  const soldierDuels = Math.min(Math.max(0, attackerCount), Math.max(0, defenderCount));
  return { soldierDuels, commanderAssaults: Math.max(0, attackerCount - soldierDuels) };
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
