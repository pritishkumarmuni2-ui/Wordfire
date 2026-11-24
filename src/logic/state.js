// src/logic/state.js - Pure game state definitions and factories
import { CONFIG } from '../../data/config.js';

export function createFighter(id, name, element, scarfColor, spawnX) {
  return {
    id,
    name,
    element,
    scarfColor,
    hp: CONFIG.fighter.maxHp,
    maxHp: CONFIG.fighter.maxHp,
    x: spawnX,
    y: CONFIG.groundY,
    vx: 0,
    vy: 0,
    width: CONFIG.fighter.width,
    height: CONFIG.fighter.height,
    facing: id === 'player' ? 1 : -1,
    onGround: true,
    currentPlatform: null,
    pose: 'idle',
    poseTimer: 0,

    // Defense & dash
    dodgeReady: false,
    dodgeReadyTimer: 0,
    isDodging: false,
    dodgeTimer: 0,
    dodgeIframeTimer: 0,
    dodgeCooldown: 0,
    dodgeDirection: 0,

    shieldActive: false,
    shieldTimer: 0,
    shieldCooldown: 0,

    frozen: false,
    freezeTimer: 0,
    freezeImmuneTimer: 0,

    flying: false,
    flyTimer: 0,
    flyCooldown: 0,

    // Swing
    isSwinging: false,
    swingAnchor: null,
    swingRadius: 0,
    swingAngle: 0,
    swingAngularVelocity: 0,
    swingTimer: 0,
    swingCooldown: 0,

    // Weapons
    carriedWeapons: [], // ['sword', 'spear', 'bow'] max 2
    activeWeaponIndex: 0,
    weaponImbued: false,
    weaponImbueElement: null,
    weaponImbueTimer: 0,

    // Buffs & debuffs
    heatWaveTimer: 0,
    opponentWeakenedTimer: 0, // Heat wave cast by enemy
    blizzardTimer: 0,         // Slowed by enemy blizzard
    speedBuffTimer: 0,        // Speed dash
    radiationTimer: 0,        // All damage +20%

    // Anti-camping
    lastAttackTime: 0,
    antiCampTimer: 0,

    // Burst tracking: { [command]: { count, lastCastTime, cooldown } }
    bursts: {},

    // Ultimate
    ultimateUsesRemaining: CONFIG.ultimate.maxUsesPerMatch,
    ultimateCooldown: 0,

    // Active melee strike or continuous beam
    activeMelee: null,
    activeBeam: null,
  };
}

export function createInitialState(playerElement = 'fire', botDifficulty = 'easy', botElement = 'fire') {
  const player = createFighter(
    'player',
    'Player',
    playerElement,
    CONFIG.colors.player,
    CONFIG.fighter.spawnXPlayer
  );

  const bot = createFighter(
    'bot',
    botDifficulty === 'hard' ? 'Bot (Hard)' : 'Bot (Easy)',
    botElement,
    CONFIG.colors.bot,
    CONFIG.fighter.spawnXBot
  );

  // Spawn 6 weapons (2 sword, 2 spear, 2 bow) spread across the map
  const weaponTypes = ['sword', 'sword', 'spear', 'spear', 'bow', 'bow'];
  // Shuffle weapon types
  for (let i = weaponTypes.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [weaponTypes[i], weaponTypes[j]] = [weaponTypes[j], weaponTypes[i]];
  }

  // Pre-selected spawn positions across ground and platforms
  const spawnSlots = [
    { x: 300, y: CONFIG.groundY },
    { x: CONFIG.platforms[0].x + 40, y: CONFIG.platforms[0].y },
    { x: CONFIG.platforms[2].x + 50, y: CONFIG.platforms[2].y },
    { x: 1500, y: CONFIG.groundY },
    { x: CONFIG.platforms[4].x + 50, y: CONFIG.platforms[4].y },
    { x: 2700, y: CONFIG.groundY },
  ];

  const weaponsOnGround = weaponTypes.map((type, idx) => ({
    id: `wp_${idx}_${type}`,
    type,
    x: spawnSlots[idx].x,
    y: spawnSlots[idx].y,
    w: 32,
    h: 18,
  }));

  return {
    screen: 'match', // 'pick' | 'match' | 'result'
    matchTimeRemaining: CONFIG.match.totalDuration,
    matchElapsed: 0,
    safePhaseActive: CONFIG.match.safePhaseEnd > 0,
    ended: false,
    winner: null, // 'player' | 'bot' | 'draw'
    botDifficulty,

    // Fighters
    player,
    bot,

    // World entities
    weapons: weaponsOnGround,
    projectiles: [],
    snowmen: [],
    particles: [],

    // Camera
    camera: {
      x: Math.max(0, (CONFIG.fighter.spawnXPlayer + CONFIG.fighter.spawnXBot) / 2 - CONFIG.canvasWidth / 2),
      y: 0,
      width: CONFIG.canvasWidth,
      height: CONFIG.canvasHeight,
    },

    // Zone boundaries
    zone: {
      left: 0,
      right: CONFIG.worldWidth,
      damageAccumulator: 0,
    },

    // Log messages: max 6 visible in UI
    logs: [
      { text: 'Duel started! Type commands to strike.', type: 'system', id: 1 },
      { text: 'Type "help" to view your available commands.', type: 'system', id: 2 },
    ],
    nextLogId: 3,
  };
}

export function addLogMessage(state, text, type = 'system') {
  state.logs.push({
    id: state.nextLogId++,
    text,
    type,
    timestamp: state.matchElapsed,
  });
  if (state.logs.length > 20) {
    state.logs.shift();
  }
}
