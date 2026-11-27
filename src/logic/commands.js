// src/logic/commands.js - Command parsing and execution for both player and bot
import { CONFIG } from '../../data/config.js';
import { POWERS, ELEMENT_COMMANDS, UNIVERSAL_COMMANDS } from '../../data/powers.js';
import { addLogMessage } from './state.js';

/**
 * Normalizes input text: lower-case, trimmed, collapse internal whitespace.
 */
export function normalizeCommand(input) {
  if (typeof input !== 'string') return '';
  return input.trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * Returns whether a command is valid for a given element.
 */
export function isCommandAllowedForElement(cmd, element) {
  if (UNIVERSAL_COMMANDS.includes(cmd)) return true;
  const allowed = ELEMENT_COMMANDS[element] || [];
  return allowed.includes(cmd);
}

/**
 * Executes a command for a fighter (player or bot).
 * Uses the exact same code path for both.
 * Returns { success: boolean, reason?: string }
 */
export function executeCommand(state, fighterId, rawInput) {
  const cmd = normalizeCommand(rawInput);
  if (!cmd) return { success: false, reason: 'empty' };

  const fighter = fighterId === 'player' ? state.player : state.bot;
  const opponent = fighterId === 'player' ? state.bot : state.player;

  // Play again / restart command
  if (cmd === 'play again' || cmd === 'playagain' || cmd === 'restart') {
    state.restartRequested = true;
    addLogMessage(state, `${fighter.name}: Play Again! Restarting duel...`, 'system');
    return { success: true, action: 'restart' };
  }

  // Pause / Resume / Quit commands
  if (cmd === 'pause' || cmd === 'menu') {
    state.pauseRequested = true;
    addLogMessage(state, `${fighter.name}: Duel Paused.`, 'system');
    return { success: true, action: 'pause' };
  }
  if (cmd === 'resume') {
    state.resumeRequested = true;
    addLogMessage(state, `${fighter.name}: Resuming duel...`, 'system');
    return { success: true, action: 'resume' };
  }
  if (cmd === 'quit' || cmd === 'exit') {
    state.quitRequested = true;
    addLogMessage(state, `${fighter.name}: Quitting duel...`, 'system');
    return { success: true, action: 'quit' };
  }

  // If frozen, cannot type commands
  if (fighter.frozen) {
    if (fighterId === 'player') {
      addLogMessage(state, 'You are frozen and cannot type!', 'system');
    }
    return { success: false, reason: 'frozen' };
  }

  // Validate command existence and element alignment
  if (!isCommandAllowedForElement(cmd, fighter.element)) {
    addLogMessage(state, 'unknown command', 'system');
    return { success: false, reason: 'unknown' };
  }

  // Help command
  if (cmd === 'help') {
    const list = [...ELEMENT_COMMANDS[fighter.element], 'shield', 'dodge', 'collect', 'swap', 'slash', 'stab', 'arrow'].join(', ');
    addLogMessage(state, `Commands (${fighter.element}): ${list}`, 'system');
    return { success: true };
  }

  // Swap weapons
  if (cmd === 'swap') {
    if (fighter.carriedWeapons.length < 2) {
      addLogMessage(state, `${fighter.name}: only carrying ${fighter.carriedWeapons.length} weapon(s)`, 'system');
      return { success: false, reason: 'cannot_swap' };
    }
    fighter.activeWeaponIndex = 1 - fighter.activeWeaponIndex;
    const active = fighter.carriedWeapons[fighter.activeWeaponIndex];
    addLogMessage(state, `${fighter.name} swapped to ${active}`, fighterId);
    return { success: true };
  }

  // Collect weapon from ground
  if (cmd === 'collect') {
    // Find closest weapon on ground within collectRadius (80 px)
    let bestDist = Infinity;
    let bestIdx = -1;
    for (let i = 0; i < state.weapons.length; i++) {
      const wp = state.weapons[i];
      const dx = fighter.x - wp.x;
      const dy = (fighter.y - fighter.height / 2) - (wp.y - wp.h / 2);
      const dist = Math.hypot(dx, dy);
      if (dist <= CONFIG.weapons.collectRadius && dist < bestDist) {
        bestDist = dist;
        bestIdx = i;
      }
    }

    if (bestIdx === -1) {
      addLogMessage(state, `${fighter.name}: no weapon in range to collect`, fighterId);
      return { success: false, reason: 'no_weapon_in_range' };
    }

    const picked = state.weapons.splice(bestIdx, 1)[0];
    if (fighter.carriedWeapons.length < CONFIG.weapons.maxCarried) {
      fighter.carriedWeapons.push(picked.type);
      if (fighter.carriedWeapons.length === 1) {
        fighter.activeWeaponIndex = 0;
      }
    } else {
      // Replaces the weapon in hand
      fighter.carriedWeapons[fighter.activeWeaponIndex] = picked.type;
      fighter.weaponImbued = false;
      fighter.weaponImbueTimer = 0;
    }

    addLogMessage(state, `${fighter.name} picked up a ${picked.type}`, fighterId);
    return { success: true };
  }

  // Shield
  if (cmd === 'shield') {
    if (fighter.shieldCooldown > 0) {
      addLogMessage(state, `${fighter.name}: shield on cooldown (${fighter.shieldCooldown.toFixed(1)}s)`, fighterId);
      return { success: false, reason: 'cooldown' };
    }
    if (fighter.shieldActive) {
      return { success: false, reason: 'already_active' };
    }
    fighter.shieldActive = true;
    fighter.shieldTimer = CONFIG.shield.duration;
    fighter.pose = 'shield';
    fighter.poseTimer = 0.5;
    addLogMessage(state, `${fighter.name} raised shield!`, fighterId);
    return { success: true };
  }

  // Dodge
  if (cmd === 'dodge') {
    if (fighter.dodgeCooldown > 0) {
      addLogMessage(state, `${fighter.name}: dodge on cooldown (${fighter.dodgeCooldown.toFixed(1)}s)`, fighterId);
      return { success: false, reason: 'cooldown' };
    }
    fighter.dodgeReady = true;
    fighter.dodgeReadyTimer = CONFIG.dodge.inputWindow;
    addLogMessage(state, `${fighter.name} prepared dodge! (Press Left or Right)`, fighterId);
    return { success: true };
  }

  // Check if fighter has shield active: cannot attack while shield is up
  if (fighter.shieldActive) {
    addLogMessage(state, `${fighter.name}: cannot attack while shield is up`, fighterId);
    return { success: false, reason: 'shield_blocks_attack' };
  }

  // Weapon commands (slash, stab, arrow)
  if (cmd === 'slash' || cmd === 'stab' || cmd === 'arrow') {
    const activeWp = fighter.carriedWeapons[fighter.activeWeaponIndex];
    if (!activeWp) {
      addLogMessage(state, 'no weapon in hand', fighterId);
      return { success: false, reason: 'no_weapon' };
    }

    if (
      (cmd === 'slash' && activeWp !== 'sword') ||
      (cmd === 'stab' && activeWp !== 'spear') ||
      (cmd === 'arrow' && activeWp !== 'bow')
    ) {
      addLogMessage(state, `${fighter.name}: holding ${activeWp}, cannot ${cmd}`, fighterId);
      return { success: false, reason: 'wrong_weapon' };
    }

    // Execute weapon attack
    executeWeaponAttack(state, fighter, opponent, cmd);
    return { success: true };
  }

  // Universal close combat martial attacks (punch, kick, uppercut, elbow, etc.)
  if (cmd === 'punch' || cmd === 'jab' || cmd === 'kick' || cmd === 'sweep' || cmd === 'uppercut' || cmd === 'elbow') {
    executeCloseCombatAttack(state, fighter, opponent, cmd);
    return { success: true };
  }

  // Find power definition
  // Match by command string and element
  let powerDef = null;
  for (const key of Object.keys(POWERS)) {
    const p = POWERS[key];
    if (p.command === cmd && (p.element === fighter.element || p.element === 'universal')) {
      powerDef = p;
      break;
    }
  }

  if (!powerDef) {
    addLogMessage(state, 'unknown command', 'system');
    return { success: false, reason: 'unknown' };
  }

  // Check weapon requirement for "power" (imbue)
  if (cmd === 'power') {
    const activeWp = fighter.carriedWeapons[fighter.activeWeaponIndex];
    if (!activeWp) {
      addLogMessage(state, 'no weapon in hand', fighterId);
      return { success: false, reason: 'no_weapon' };
    }
  }

  // Ultimates rule: 4 uses per match, 8s cooldown
  if (powerDef.type === 'ultimate') {
    if (fighter.ultimateUsesRemaining <= 0) {
      addLogMessage(state, `${fighter.name}: no ultimate uses remaining`, fighterId);
      return { success: false, reason: 'no_ultimates_left' };
    }
    if (fighter.ultimateCooldown > 0) {
      addLogMessage(state, `${fighter.name}: ultimate on cooldown (${fighter.ultimateCooldown.toFixed(1)}s)`, fighterId);
      return { success: false, reason: 'ultimate_cooldown' };
    }

    // Spend ultimate use and set cooldown
    fighter.ultimateUsesRemaining--;
    fighter.ultimateCooldown = CONFIG.ultimate.cooldown;
    executePowerAction(state, fighter, opponent, powerDef);
    return { success: true };
  }

  // Fly power has a specific 10-second cooldown
  if (cmd === 'fly') {
    if (fighter.flyCooldown > 0) {
      addLogMessage(state, `${fighter.name}: fly on cooldown (${fighter.flyCooldown.toFixed(1)}s)`, fighterId);
      return { success: false, reason: 'cooldown' };
    }
  }

  // Magical power burst cooldown check:
  // "The same power can be typed up to 6 times in a burst (each cast within 1.5 s of the last), then it has a 3-second cooldown. Each power has its own counter."
  if (powerDef.type === 'power' || powerDef.type === 'melee' || powerDef.type === 'buff') {
    const burstData = fighter.bursts[cmd] || { count: 0, lastCastTime: -10, cooldown: 0 };
    if (burstData.cooldown > 0) {
      addLogMessage(state, `${fighter.name}: ${powerDef.name} burst overheated (${burstData.cooldown.toFixed(1)}s)`, fighterId);
      return { success: false, reason: 'burst_cooldown' };
    }

    const timeSinceLast = state.matchElapsed - burstData.lastCastTime;
    if (timeSinceLast <= CONFIG.burst.windowSeconds) {
      burstData.count++;
      if (burstData.count >= CONFIG.burst.maxBurstCount) {
        burstData.cooldown = CONFIG.burst.penaltyCooldown;
        burstData.count = 0;
        addLogMessage(state, `${fighter.name}: ${powerDef.name} overheated! 3s cooldown`, fighterId);
      }
    } else {
      burstData.count = 1;
    }
    burstData.lastCastTime = state.matchElapsed;
    fighter.bursts[cmd] = burstData;
  }

  executePowerAction(state, fighter, opponent, powerDef);
  return { success: true };
}

/**
 * Executes a weapon attack (slash, stab, arrow).
 */
function executeWeaponAttack(state, fighter, opponent, cmd) {
  fighter.lastAttackTime = state.matchElapsed;
  fighter.antiCampTimer = 0;
  fighter.pose = 'melee';
  fighter.poseTimer = 0.25;

  const isImbued = fighter.weaponImbued && fighter.weaponImbueTimer > 0;
  const imbueBonus = isImbued ? CONFIG.weapons.imbueBonusDamage : 0;
  const element = isImbued ? fighter.weaponImbueElement : null;

  if (cmd === 'slash') {
    // Sword swing: short range ~70px
    const baseDamage = CONFIG.weapons.sword.damage + imbueBonus;
    const finalDamage = calculateOutgoingDamage(fighter, baseDamage, 'weapon');
    fighter.activeMelee = {
      type: 'sword',
      damage: finalDamage,
      range: CONFIG.weapons.sword.range,
      timer: CONFIG.weapons.sword.arcDuration,
      element,
      isImbued,
      facing: fighter.facing,
      x: fighter.x,
      y: fighter.y - fighter.height / 2,
    };
    addLogMessage(state, `${fighter.name} slashes with sword!`, fighter.id);
  } else if (cmd === 'stab') {
    // Spear thrust: medium range ~140px
    const baseDamage = CONFIG.weapons.spear.damage + imbueBonus;
    const finalDamage = calculateOutgoingDamage(fighter, baseDamage, 'weapon');
    fighter.activeMelee = {
      type: 'spear',
      damage: finalDamage,
      range: CONFIG.weapons.spear.range,
      timer: CONFIG.weapons.spear.thrustDuration,
      element,
      isImbued,
      facing: fighter.facing,
      x: fighter.x,
      y: fighter.y - fighter.height / 2,
    };
    addLogMessage(state, `${fighter.name} stabs with spear!`, fighter.id);
  } else if (cmd === 'arrow') {
    // Bow arrow: long range straight flight
    const baseDamage = CONFIG.weapons.bow.damage + imbueBonus;
    const finalDamage = calculateOutgoingDamage(fighter, baseDamage, 'weapon');
    const spawnX = fighter.x + fighter.facing * (fighter.width / 2 + 10);
    const spawnY = fighter.y - fighter.height / 2 - 4;

    state.projectiles.push({
      id: `proj_${Date.now()}_${Math.random()}`,
      owner: fighter.id,
      name: 'arrow',
      type: 'arrow',
      element,
      isImbued,
      damage: finalDamage,
      x: spawnX,
      y: spawnY,
      vx: fighter.facing * CONFIG.weapons.bow.arrowSpeed,
      vy: 0,
      radius: 6,
      length: CONFIG.weapons.bow.arrowLength,
      color: isImbued ? CONFIG.colors[element] : '#C0C0C0',
      isUltimate: false,
    });
    addLogMessage(state, `${fighter.name} looses an arrow!`, fighter.id);
  }
}

/**
 * Executes a martial close combat attack (punch, kick, uppercut, elbow).
 */
function executeCloseCombatAttack(state, fighter, opponent, cmd) {
  let moveKey = cmd;
  if (moveKey === 'jab') moveKey = 'punch';
  if (moveKey === 'sweep') moveKey = 'kick';

  const powerDef = POWERS[moveKey];
  if (!powerDef) return;

  fighter.lastAttackTime = state.matchElapsed;
  fighter.antiCampTimer = 0;
  fighter.pose = 'melee';
  fighter.poseTimer = powerDef.duration + 0.08;

  const isImbued = fighter.weaponImbued && fighter.weaponImbueTimer > 0;
  const imbueBonus = isImbued ? CONFIG.weapons.imbueBonusDamage : 0;
  const element = isImbued ? fighter.weaponImbueElement : null;

  const baseDamage = powerDef.damage + imbueBonus;
  const finalDamage = calculateOutgoingDamage(fighter, baseDamage, element || 'melee');

  fighter.activeMelee = {
    type: moveKey,
    damage: finalDamage,
    range: powerDef.range,
    timer: powerDef.duration,
    element,
    isImbued,
    knockback: powerDef.knockback || 0,
    verticalPop: powerDef.verticalPop || 0,
    facing: fighter.facing,
    x: fighter.x,
    y: fighter.y - fighter.height / 2,
  };

  const verbMap = {
    punch: 'throws a swift punch!',
    kick: 'delivers a roundhouse kick!',
    uppercut: 'launches a rising uppercut!',
    elbow: 'strikes with a crushing elbow!',
  };
  addLogMessage(state, `${fighter.name} ${verbMap[moveKey] || 'strikes in close combat!'}`, fighter.id);
}

/**
 * Calculates outgoing damage taking buffs into account (radiation, heat wave, etc.)
 */
export function calculateOutgoingDamage(attacker, baseDamage, damageType = 'normal') {
  let multiplier = 1.0;

  // Radiation: all damage +20%
  if (attacker.radiationTimer > 0) {
    multiplier += CONFIG.radiation.damageMultiplierBonus;
  }

  // Heat wave: your fire powers deal +20% more
  if (attacker.heatWaveTimer > 0 && damageType === 'fire') {
    multiplier += CONFIG.heatWave.selfFireBonusRatio;
  }

  // Opponent weakened by heat wave: deals 20% less damage
  if (attacker.opponentWeakenedTimer > 0) {
    multiplier -= CONFIG.heatWave.opponentDamageReductionRatio;
  }

  return Math.round(baseDamage * Math.max(0.1, multiplier));
}

/**
 * Executes a power action (projectile, beam, melee, buff, summon).
 */
function executePowerAction(state, fighter, opponent, powerDef) {
  // Mark attack time for anti-camping (except for pure self buffs)
  if (powerDef.damage > 0 || powerDef.type === 'ultimate' || powerDef.id === 'army' || powerDef.id === 'blizzard') {
    fighter.lastAttackTime = state.matchElapsed;
    fighter.antiCampTimer = 0;
  }

  fighter.pose = 'cast';
  fighter.poseTimer = 0.3;

  addLogMessage(state, `${fighter.name} casts ${powerDef.name}!`, fighter.id);

  const spawnX = fighter.x + fighter.facing * (fighter.width / 2 + 12);
  const spawnY = fighter.y - fighter.height / 2 - 4;

  switch (powerDef.id) {
    // ---------------- FIRE ----------------
    case 'fireball': {
      const dmg = calculateOutgoingDamage(fighter, powerDef.damage, 'fire');
      state.projectiles.push({
        id: `proj_${Date.now()}_${Math.random()}`,
        owner: fighter.id,
        name: powerDef.name,
        type: 'power',
        element: 'fire',
        damage: dmg,
        x: spawnX,
        y: spawnY,
        vx: fighter.facing * powerDef.speed,
        vy: 0,
        radius: powerDef.radius,
        color: powerDef.color,
        isUltimate: false,
      });
      break;
    }
    case 'flames': {
      const dmg = calculateOutgoingDamage(fighter, powerDef.damage, 'fire');
      fighter.activeMelee = {
        type: 'flames',
        damage: dmg,
        range: powerDef.range,
        timer: powerDef.duration,
        element: 'fire',
        facing: fighter.facing,
        x: fighter.x,
        y: fighter.y - fighter.height / 2,
      };
      break;
    }
    case 'heat_wave': {
      // Buff self, debuff opponent. Buffs never stack; recasting refreshes timer.
      fighter.heatWaveTimer = CONFIG.heatWave.duration;
      opponent.opponentWeakenedTimer = CONFIG.heatWave.duration;
      break;
    }
    case 'fire_hands': {
      const dmg = calculateOutgoingDamage(fighter, powerDef.damage, 'fire');
      fighter.activeMelee = {
        type: 'fire_hands',
        damage: dmg,
        range: powerDef.range,
        timer: powerDef.duration,
        element: 'fire',
        facing: fighter.facing,
        x: fighter.x,
        y: fighter.y - fighter.height / 2,
      };
      break;
    }
    case 'fire_power':
    case 'ice_power':
    case 'wind_power':
    case 'light_power': {
      fighter.weaponImbued = true;
      fighter.weaponImbueElement = fighter.element;
      fighter.weaponImbueTimer = CONFIG.weapons.imbueDuration;
      break;
    }
    case 'inferno_blast': {
      const dmg = calculateOutgoingDamage(fighter, powerDef.damage, 'fire');
      state.projectiles.push({
        id: `proj_${Date.now()}_${Math.random()}`,
        owner: fighter.id,
        name: powerDef.name,
        type: 'ultimate',
        element: 'fire',
        damage: dmg,
        x: spawnX,
        y: spawnY,
        vx: fighter.facing * powerDef.speed,
        vy: 0,
        radius: powerDef.radius,
        color: powerDef.color,
        isUltimate: true,
      });
      break;
    }

    // ---------------- ICE ----------------
    case 'ice_beam': {
      const dmg = calculateOutgoingDamage(fighter, powerDef.damage, 'ice');
      state.projectiles.push({
        id: `proj_${Date.now()}_${Math.random()}`,
        owner: fighter.id,
        name: powerDef.name,
        type: 'power',
        element: 'ice',
        damage: dmg,
        x: spawnX,
        y: spawnY,
        vx: fighter.facing * powerDef.speed,
        vy: 0,
        radius: powerDef.radius,
        color: powerDef.color,
        isUltimate: false,
      });
      break;
    }
    case 'blizzard': {
      opponent.blizzardTimer = CONFIG.blizzard.duration;
      break;
    }
    case 'ice_spikes': {
      const dmg = calculateOutgoingDamage(fighter, powerDef.damage, 'ice');
      fighter.activeMelee = {
        type: 'ice_spikes',
        damage: dmg,
        range: powerDef.range,
        timer: powerDef.duration,
        element: 'ice',
        facing: fighter.facing,
        x: fighter.x,
        y: CONFIG.groundY,
      };
      break;
    }
    case 'army': {
      // Five snowmen appear and attack. Each has 5 HP, deals 2 per hit (10 max total), disappears after 10s.
      for (let i = 0; i < powerDef.snowmanCount; i++) {
        state.snowmen.push({
          id: `sm_${Date.now()}_${i}_${Math.random()}`,
          owner: fighter.id,
          targetId: opponent.id,
          x: fighter.x + fighter.facing * (40 + i * 28),
          y: CONFIG.groundY,
          w: 24,
          h: 34,
          hp: powerDef.snowmanHp,
          maxHp: powerDef.snowmanHp,
          damagePerHit: powerDef.damage,
          facing: fighter.facing,
          lifetime: powerDef.snowmanLifetime,
          attackTimer: 0.5 + i * 0.2, // Stagger initial attacks
          totalDamageDealt: 0,
          maxTotalDamage: CONFIG.snowmen.maxDamageTotal,
        });
      }
      break;
    }
    case 'ice_sphere': {
      const dmg = calculateOutgoingDamage(fighter, powerDef.damage, 'ice');
      state.projectiles.push({
        id: `proj_${Date.now()}_${Math.random()}`,
        owner: fighter.id,
        name: powerDef.name,
        type: 'ultimate',
        element: 'ice',
        damage: dmg,
        x: spawnX,
        y: spawnY,
        vx: fighter.facing * powerDef.speed,
        vy: 0,
        radius: powerDef.radius,
        color: powerDef.color,
        isUltimate: true,
        freezes: true,
      });
      break;
    }

    // ---------------- WIND ----------------
    case 'air_slash': {
      const dmg = calculateOutgoingDamage(fighter, powerDef.damage, 'wind');
      state.projectiles.push({
        id: `proj_${Date.now()}_${Math.random()}`,
        owner: fighter.id,
        name: powerDef.name,
        type: 'power',
        element: 'wind',
        damage: dmg,
        x: spawnX,
        y: spawnY,
        vx: fighter.facing * powerDef.speed,
        vy: 0,
        radius: powerDef.radius,
        color: powerDef.color,
        isUltimate: false,
      });
      break;
    }
    case 'cluster': {
      const dmg = calculateOutgoingDamage(fighter, powerDef.damage, 'wind');
      const angles = [-powerDef.spreadAngle, 0, powerDef.spreadAngle];
      angles.forEach((ang, idx) => {
        const speed = powerDef.speed;
        const vx = fighter.facing * Math.cos(ang) * speed;
        const vy = Math.sin(ang) * speed;
        state.projectiles.push({
          id: `proj_${Date.now()}_${idx}_${Math.random()}`,
          owner: fighter.id,
          name: 'cluster',
          type: 'power',
          element: 'wind',
          damage: dmg,
          x: spawnX,
          y: spawnY + (idx - 1) * 8,
          vx,
          vy,
          radius: powerDef.radius,
          color: powerDef.color,
          isUltimate: false,
        });
      });
      break;
    }
    case 'fly': {
      fighter.flying = true;
      fighter.flyTimer = CONFIG.fly.duration;
      fighter.flyCooldown = CONFIG.fly.cooldown;
      fighter.vy = CONFIG.fly.speedY;
      break;
    }
    case 'wind_punch': {
      const dmg = calculateOutgoingDamage(fighter, powerDef.damage, 'wind');
      fighter.activeMelee = {
        type: 'wind_punch',
        damage: dmg,
        range: powerDef.range,
        timer: powerDef.duration,
        element: 'wind',
        facing: fighter.facing,
        x: fighter.x,
        y: fighter.y - fighter.height / 2,
      };
      break;
    }
    case 'tornado_arrow': {
      const dmg = calculateOutgoingDamage(fighter, powerDef.damage, 'wind');
      state.projectiles.push({
        id: `proj_${Date.now()}_${Math.random()}`,
        owner: fighter.id,
        name: powerDef.name,
        type: 'ultimate',
        element: 'wind',
        damage: dmg,
        x: spawnX,
        y: spawnY,
        vx: fighter.facing * powerDef.speed,
        vy: 0,
        radius: powerDef.radius,
        color: powerDef.color,
        isUltimate: true,
        pullStrength: powerDef.pullStrength,
      });
      break;
    }

    // ---------------- LIGHT ----------------
    case 'light_beam': {
      fighter.activeBeam = {
        type: 'light_beam',
        duration: CONFIG.lightBeam.duration,
        elapsed: 0,
        tickTimer: 0,
        range: CONFIG.lightBeam.range,
        damagePerTick: calculateOutgoingDamage(fighter, CONFIG.lightBeam.damagePerTick, 'light'),
        element: 'light',
        color: powerDef.color,
        facing: fighter.facing,
      };
      break;
    }
    case 'speed': {
      fighter.speedBuffTimer = CONFIG.speedBuff.duration;
      break;
    }
    case 'radiation': {
      fighter.radiationTimer = CONFIG.radiation.duration;
      break;
    }
    case 'shoot': {
      const dmg = calculateOutgoingDamage(fighter, powerDef.damage, 'light');
      state.projectiles.push({
        id: `proj_${Date.now()}_${Math.random()}`,
        owner: fighter.id,
        name: powerDef.name,
        type: 'power',
        element: 'light',
        damage: dmg,
        x: spawnX,
        y: spawnY,
        vx: fighter.facing * powerDef.speed,
        vy: 0,
        radius: powerDef.radius,
        color: powerDef.color,
        isUltimate: false,
      });
      break;
    }
    case 'solar_beam': {
      const dmg = calculateOutgoingDamage(fighter, powerDef.damage, 'light');
      state.projectiles.push({
        id: `proj_${Date.now()}_${Math.random()}`,
        owner: fighter.id,
        name: powerDef.name,
        type: 'ultimate',
        element: 'light',
        damage: dmg,
        x: spawnX,
        y: spawnY,
        vx: fighter.facing * powerDef.speed,
        vy: 0,
        radius: powerDef.radius,
        color: powerDef.color,
        isUltimate: true,
      });
      break;
    }
  }
}
