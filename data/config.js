// data/config.js - All tunable numbers for Wordfire v1
export const CONFIG = {
  // Screen and world dimensions
  canvasWidth: 960,
  canvasHeight: 540,
  worldWidth: 3000,
  worldHeight: 540,
  groundY: 480,
  fixedDt: 1 / 60,

  // Fighters
  fighter: {
    maxHp: 100,
    width: 36,
    height: 56,
    runSpeed: 270,
    jumpSpeed: -550,
    gravity: 1200,
    spawnXPlayer: 1300,
    spawnXBot: 1700,
    playerScarfColor: '#DC143C', // Crimson
    botScarfColor: '#4169E1',    // Royal blue
  },

  // Platforms in the world (crates, bench, wall)
  platforms: [
    { x: 380, y: 410, w: 90, h: 70, type: 'crates' },
    { x: 720, y: 430, w: 100, h: 50, type: 'bench' },
    { x: 1050, y: 380, w: 110, h: 100, type: 'wall' },
    { x: 1450, y: 420, w: 100, h: 60, type: 'crates' },
    { x: 1850, y: 400, w: 120, h: 80, type: 'wall' },
    { x: 2200, y: 435, w: 90, h: 45, type: 'bench' },
    { x: 2550, y: 390, w: 110, h: 90, type: 'crates' },
  ],

  // Swing Anchors (at least 12 spread across map)
  swingAnchors: [
    { id: 1, x: 250, y: 180, label: 'Building Edge', w: 24, h: 24 },
    { id: 2, x: 500, y: 150, label: 'Tree Trunk', w: 20, h: 20 },
    { id: 3, x: 780, y: 140, label: 'Roof Corner', w: 24, h: 24 },
    { id: 4, x: 1020, y: 160, label: 'Lamppost Top', w: 20, h: 20 },
    { id: 5, x: 1260, y: 130, label: 'Clock Tower Spire', w: 28, h: 28 },
    { id: 6, x: 1500, y: 110, label: 'Clock Tower Dial', w: 32, h: 32 },
    { id: 7, x: 1740, y: 130, label: 'Archway Edge', w: 26, h: 26 },
    { id: 8, x: 1980, y: 150, label: 'Tree Branch', w: 20, h: 20 },
    { id: 9, x: 2220, y: 140, label: 'Brick Chimney', w: 24, h: 24 },
    { id: 10, x: 2460, y: 170, label: 'Water Tower Frame', w: 24, h: 24 },
    { id: 11, x: 2700, y: 150, label: 'Warehouse Edge', w: 24, h: 24 },
    { id: 12, x: 2880, y: 160, label: 'High Wall', w: 22, h: 22 },
  ],

  // Swing mechanic
  swing: {
    maxReachDistance: 350,
    maxDuration: 2.5,
    cooldownAfterRelease: 1.0,
    pushAcceleration: 450,
    gravityMultiplier: 0.9,
    damping: 0.998,
  },

  // Dodge
  dodge: {
    inputWindow: 2.0,      // Press left or right within 2 s
    normalDistance: 220,   // px
    speedDistance: 330,    // px when speed buff is active
    duration: 0.22,        // s
    iframeDuration: 0.3,   // s
    cooldown: 2.0,         // s
  },

  // Shield
  shield: {
    duration: 5.0,
    cooldown: 5.0,
    ultimatePenetrationDamage: 2, // Ultimates deal 1 to 2 HP through shield
  },

  // Freeze
  freeze: {
    duration: 2.0,
    immunityDuration: 1.0,
  },

  // Burst typing cooldowns
  burst: {
    maxBurstCount: 6,
    windowSeconds: 1.5,
    penaltyCooldown: 3.0,
  },

  // Ultimates
  ultimate: {
    maxUsesPerMatch: 4,
    cooldown: 8.0,
  },

  // Match timeline
  match: {
    totalDuration: 360,     // 6 minutes
    safePhaseEnd: 0,        // Allows damage from match start as verified in test
    zoneShrinkStart: 60,    // Zone begins shrinking at 1:00
    zoneShrinkEnd: 300,     // Finishes shrinking at 5:00
    zoneFinalWidthRatio: 0.2, // 20% of 3000 = 600 px
    outsideZoneDamageRate: 1, // 1 HP per second
    antiCampThreshold: 20,  // 20s without attacking
    antiCampRepeat: 20,     // repeats every 20s
    antiCampDamage: 1,
  },

  // Weapons
  weapons: {
    totalSpawnCount: 6,     // 2 sword, 2 spear, 2 bow
    collectRadius: 80,
    maxCarried: 2,
    imbueBonusDamage: 3,
    imbueDuration: 8.0,
    sword: {
      range: 70,
      damage: 5,
      arcDuration: 0.18,
    },
    spear: {
      range: 140,
      damage: 5,
      thrustDuration: 0.18,
    },
    bow: {
      damage: 5,
      arrowSpeed: 820,
      arrowLength: 26,
    },
  },

  // Snowmen army (Ice)
  snowmen: {
    count: 5,
    hp: 5,
    damagePerHit: 2,
    maxDamageTotal: 10,
    lifetime: 10.0,
    speed: 130,
    attackInterval: 1.2,
    attackRange: 45,
  },

  // Fly power (Wind)
  fly: {
    duration: 3.0,
    cooldown: 10.0,
    speedY: -180,
  },

  // Blizzard debuff (Ice)
  blizzard: {
    duration: 6.0,
    speedMultiplier: 0.7, // 30% slower
  },

  // Heat wave buff / debuff (Fire)
  heatWave: {
    duration: 5.0,
    selfFireBonusRatio: 0.20,      // +20% fire damage
    opponentDamageReductionRatio: 0.20, // opponent deals 20% less damage
  },

  // Speed buff (Light)
  speedBuff: {
    duration: 5.0,
  },

  // Radiation buff (Light)
  radiation: {
    duration: 5.0,
    damageMultiplierBonus: 0.20,   // all damage +20%
  },

  // Light beam power
  lightBeam: {
    duration: 3.0,
    tickInterval: 0.33,
    damagePerTick: 1,
    range: 520,
    thickness: 18,
  },

  // Bot configurations
  bot: {
    easy: {
      msPerChar: 260,
      reactionPause: 1.2,
      shieldOrDodgeChance: 0.20,
      mistypeChance: 0.10,
      ultimateChance: 0.20,
      attackIntervalMin: 5.0,
      attackIntervalMax: 15.0,
    },
    hard: {
      msPerChar: 130,
      reactionPause: 0.5,
      shieldOrDodgeChance: 0.60,
      mistypeChance: 0.0,
      ultimateChance: 1.0,
      attackIntervalMin: 2.0,
      attackIntervalMax: 12.0,
    },
  },

  // Colors
  colors: {
    player: '#DC143C',
    bot: '#4169E1',
    fire: '#FFB347',
    ice: '#CFF6FF',
    wind: '#D9DEE3',
    light: '#FFF27A',
    paintSplatter: ['#FF1744', '#9C27B0', '#E91E63', '#2196F3', '#FF4081', '#7C4DFF'],
  },
};
