// src/logic/bot.js - AI decision making and typing simulation for the bot
import { CONFIG } from '../../data/config.js';
import { POWERS, ELEMENT_COMMANDS } from '../../data/powers.js';
import { executeCommand } from './commands.js';
import { addLogMessage } from './state.js';

export function createBotBrain(botDifficulty = 'easy') {
  const conf = CONFIG.bot[botDifficulty] || CONFIG.bot.easy;
  return {
    difficulty: botDifficulty,
    conf,
    reactionTimer: conf.reactionPause,
    typingTarget: '',
    typedChars: '',
    charTimer: 0,
    typingActive: false,
    botLogEntryId: null,

    // Movement state
    moveLeft: false,
    moveRight: false,
    jump: false,
    wantsSwing: false,
    releaseSwing: false,
    swingTargetX: 0,
    swingTargetY: 0,
    swingTimer: 0,

    dodgeDirectionPending: 0,
    dodgePendingTimer: 0,
    timeSinceLastAttack: 0,
  };
}

/**
 * Updates bot brain: runs decision loop, updates simulated typing, and outputs movement inputs.
 */
export function updateBot(state, brain, dt) {
  const bot = state.bot;
  const player = state.player;
  const conf = brain.conf;

  // Initialize input object for this frame
  const inputBot = {
    left: false,
    right: false,
    up: false,
    wantsSwing: false,
    releaseSwing: false,
    swingTargetX: 0,
    swingTargetY: 0,
  };

  if (state.ended || bot.hp <= 0) return inputBot;

  brain.timeSinceLastAttack += dt;

  // 1. If dodge was typed and ready, execute Left or Right dash
  if (bot.dodgeReady) {
    // Choose direction away from player or incoming danger
    const dashDir = bot.x > player.x ? 1 : -1;
    if (dashDir === 1) inputBot.right = true;
    else inputBot.left = true;
    return inputBot;
  }

  // 2. Typing simulation
  if (brain.typingActive) {
    brain.charTimer -= dt;
    if (brain.charTimer <= 0) {
      brain.charTimer = conf.msPerChar / 1000;

      if (brain.typedChars.length < brain.typingTarget.length) {
        // Type next character
        let nextChar = brain.typingTarget[brain.typedChars.length];

        // Easy mode mistype chance
        if (brain.difficulty === 'easy' && conf.mistypeChance > 0) {
          if (Math.random() < conf.mistypeChance && brain.typedChars.length > 2) {
            nextChar = String.fromCharCode(97 + Math.floor(Math.random() * 26));
          }
        }

        brain.typedChars += nextChar;

        // Show typing in log
        updateBotTypingLog(state, brain);
      } else {
        // Finished typing! Press enter and execute command through identical command path
        const commandToRun = brain.typedChars;
        brain.typingActive = false;
        brain.typingTarget = '';
        brain.typedChars = '';
        brain.reactionTimer = conf.reactionPause;
        clearBotTypingLog(state, brain);

        executeCommand(state, 'bot', commandToRun);
        brain.timeSinceLastAttack = 0;
      }
    }
  } else {
    // Reaction pause before deciding next command
    brain.reactionTimer -= dt;
    if (brain.reactionTimer <= 0 && !bot.frozen) {
      const chosenCommand = decideNextCommand(state, brain, bot, player);
      if (chosenCommand) {
        brain.typingTarget = chosenCommand;
        brain.typedChars = '';
        brain.charTimer = conf.msPerChar / 1000;
        brain.typingActive = true;
      } else {
        brain.reactionTimer = 0.4;
      }
    }
  }

  // 3. Movement AI (Run, Jump, Swing)
  decideMovement(state, brain, bot, player, inputBot, dt);

  return inputBot;
}

/**
 * Decides the bot's next typed command based on combat context.
 */
function decideNextCommand(state, brain, bot, player) {
  // If shield is active, cannot attack
  if (bot.shieldActive) return null;

  const conf = brain.conf;

  // A. Defensive reaction to incoming projectile
  const incomingProj = findIncomingDangerousProjectile(state, bot);
  if (incomingProj) {
    if (Math.random() < conf.shieldOrDodgeChance) {
      if (!bot.shieldActive && bot.shieldCooldown <= 0) {
        return 'shield';
      }
      if (!bot.isDodging && bot.dodgeCooldown <= 0) {
        return 'dodge';
      }
    }
  }

  // B. Pick up nearby weapon
  const nearbyWeapon = state.weapons.find((w) => {
    const dist = Math.hypot(bot.x - w.x, (bot.y - bot.height / 2) - (w.y - w.h / 2));
    return dist <= CONFIG.weapons.collectRadius;
  });
  if (nearbyWeapon && bot.carriedWeapons.length < CONFIG.weapons.maxCarried) {
    return 'collect';
  }

  // C. Imbue weapon if armed and not currently imbued
  if (bot.carriedWeapons.length > 0 && !bot.weaponImbued && bot.weaponImbueTimer <= 0) {
    return 'power';
  }

  // D. Ultimate usage
  const dx = player.x - bot.x;
  const isFacingPlayer = (dx > 0 && bot.facing === 1) || (dx < 0 && bot.facing === -1);
  if (
    bot.ultimateUsesRemaining > 0 &&
    bot.ultimateCooldown <= 0 &&
    isFacingPlayer &&
    Math.abs(dx) < 700
  ) {
    if (brain.difficulty === 'hard' || Math.random() < conf.ultimateChance) {
      const ultCmd = getUltimateCommand(bot.element);
      if (ultCmd) return ultCmd;
    }
  }

  // E. Anti-camping: force attack if getting close to threshold
  const mustAttack = brain.timeSinceLastAttack >= conf.attackIntervalMax - 2;

  // F. Weapon attacks if armed
  const activeWp = bot.carriedWeapons[bot.activeWeaponIndex];
  if (activeWp) {
    const dist = Math.abs(dx);
    if (activeWp === 'sword' && dist <= CONFIG.weapons.sword.range + 20) {
      return 'slash';
    }
    if (activeWp === 'spear' && dist <= CONFIG.weapons.spear.range + 30) {
      return 'stab';
    }
    if (activeWp === 'bow' && dist > 180) {
      return 'arrow';
    }
  }

  // F2. Close combat martial strikes if very close (< 75px)
  const distToPlayer = Math.abs(dx);
  if (distToPlayer <= 75 && isFacingPlayer && Math.random() < 0.45) {
    const martialMoves = ['punch', 'kick', 'uppercut', 'elbow'];
    return martialMoves[Math.floor(Math.random() * martialMoves.length)];
  }

  // G. Element powers
  const powerCmd = pickElementalPower(state, bot, player, mustAttack);
  if (powerCmd) return powerCmd;

  return null;
}

function pickElementalPower(state, bot, player, force) {
  const dist = Math.abs(player.x - bot.x);
  const element = bot.element;

  switch (element) {
    case 'fire':
      if (dist < 80) return 'fire hands';
      if (dist < 160) return 'flames';
      if (bot.heatWaveTimer <= 0 && Math.random() < 0.4) return 'heat wave';
      return 'fireball';

    case 'ice':
      if (state.snowmen.filter((s) => s.owner === 'bot').length === 0 && Math.random() < 0.35) {
        return 'army';
      }
      if (player.blizzardTimer <= 0 && Math.random() < 0.4) {
        return 'blizzard';
      }
      if (dist < 180) return 'ice spikes';
      return 'ice beam';

    case 'wind':
      if (!bot.flying && bot.flyCooldown <= 0 && Math.random() < 0.3) {
        return 'fly';
      }
      if (dist < 80) return 'wind punch';
      if (Math.random() < 0.4) return 'cluster';
      return 'air slash';

    case 'light':
      if (bot.radiationTimer <= 0 && Math.random() < 0.35) return 'radiation';
      if (bot.speedBuffTimer <= 0 && Math.random() < 0.3) return 'speed';
      if (dist < 500 && Math.random() < 0.5) return 'light beam';
      return 'shoot';

    default:
      return null;
  }
}

function getUltimateCommand(element) {
  switch (element) {
    case 'fire': return 'inferno blast';
    case 'ice': return 'ice sphere';
    case 'wind': return 'tornado arrow';
    case 'light': return 'solar beam';
    default: return null;
  }
}

function findIncomingDangerousProjectile(state, bot) {
  for (const p of state.projectiles) {
    if (p.owner !== bot.id) {
      const dx = bot.x - p.x;
      const isApproaching = (p.vx > 0 && dx > 0) || (p.vx < 0 && dx < 0);
      if (isApproaching && Math.abs(dx) < 320) {
        return p;
      }
    }
  }
  return null;
}

/**
 * Bot movement, jumping, and swinging.
 */
function decideMovement(state, brain, bot, player, inputBot, dt) {
  if (bot.frozen) return;

  const zone = state.zone;
  const margin = 120;

  // 1. PRIORITY: Stay inside zone
  if (bot.x < zone.left + margin) {
    inputBot.right = true;
    inputBot.left = false;
    bot.facing = 1;
    return;
  } else if (bot.x > zone.right - margin) {
    inputBot.left = true;
    inputBot.right = false;
    bot.facing = -1;
    return;
  }

  // 2. Swing logic:
  // "The bot also swings: it uses anchors to cross the map quickly or to reach a weapon, in the same way and with the same rules."
  if (bot.isSwinging) {
    brain.swingTimer += dt;
    // Push toward target
    const targetX = bot.carriedWeapons.length < 2 && state.weapons.length > 0 ? state.weapons[0].x : player.x;
    if (targetX > bot.x) inputBot.right = true;
    else inputBot.left = true;

    // Release after good momentum or 1.2s
    if (brain.swingTimer > 1.2 || (bot.vx > 200 && targetX > bot.x) || (bot.vx < -200 && targetX < bot.x)) {
      inputBot.releaseSwing = true;
      brain.swingTimer = 0;
    }
    return;
  }

  // Try to initiate swing if weapon is far or player is far
  if (bot.swingCooldown <= 0 && !bot.isSwinging) {
    const targetX = bot.carriedWeapons.length < 2 && state.weapons.length > 0 ? state.weapons[0].x : player.x;
    const distToTarget = Math.abs(targetX - bot.x);

    if (distToTarget > 400) {
      // Find anchor in the direction of the target within 350px
      const targetDir = Math.sign(targetX - bot.x);
      const goodAnchor = CONFIG.swingAnchors.find((anchor) => {
        const d = Math.hypot(bot.x - anchor.x, (bot.y - bot.height / 2) - anchor.y);
        const anchorDir = Math.sign(anchor.x - bot.x);
        return d <= CONFIG.swing.maxReachDistance && anchorDir === targetDir;
      });

      if (goodAnchor && Math.random() < 0.05) {
        inputBot.wantsSwing = true;
        inputBot.swingTargetX = goodAnchor.x;
        inputBot.swingTargetY = goodAnchor.y;
        brain.swingTimer = 0;
        return;
      }
    }
  }

  // 3. Move toward weapons if unarmed
  if (bot.carriedWeapons.length < 2 && state.weapons.length > 0) {
    const nearestWp = state.weapons.reduce((prev, curr) => {
      const d1 = Math.abs(bot.x - prev.x);
      const d2 = Math.abs(bot.x - curr.x);
      return d1 < d2 ? prev : curr;
    });

    if (nearestWp.x < bot.x - 30) {
      inputBot.left = true;
      bot.facing = -1;
    } else if (nearestWp.x > bot.x + 30) {
      inputBot.right = true;
      bot.facing = 1;
    }

    // Jump if weapon is on platform above
    if (nearestWp.y < bot.y - 40 && Math.abs(nearestWp.x - bot.x) < 80 && bot.onGround) {
      inputBot.up = true;
    }
    return;
  }

  // 4. Combat positioning relative to player
  const dist = player.x - bot.x;
  const absDist = Math.abs(dist);
  bot.facing = dist > 0 ? 1 : -1;

  const activeWp = bot.carriedWeapons[bot.activeWeaponIndex];
  let desiredDist = 260; // Default spacing

  if (activeWp === 'sword') desiredDist = 55;
  else if (activeWp === 'spear') desiredDist = 110;
  else if (activeWp === 'bow') desiredDist = 400;

  if (absDist > desiredDist + 40) {
    if (dist > 0) inputBot.right = true;
    else inputBot.left = true;
  } else if (absDist < desiredDist - 40) {
    // Back away slightly
    if (dist > 0) inputBot.left = true;
    else inputBot.right = true;
  }

  // Jump over obstacles / platforms
  for (const plat of CONFIG.platforms) {
    const isDirectlyAhead = (bot.facing === 1 && plat.x > bot.x && plat.x - bot.x < 70) ||
                            (bot.facing === -1 && plat.x + plat.w < bot.x && bot.x - (plat.x + plat.w) < 70);
    if (isDirectlyAhead && bot.onGround && Math.random() < 0.2) {
      inputBot.up = true;
    }
  }
}

function updateBotTypingLog(state, brain) {
  const text = `Bot typing: "${brain.typedChars}"`;
  if (brain.botLogEntryId) {
    const entry = state.logs.find((l) => l.id === brain.botLogEntryId);
    if (entry) {
      entry.text = text;
      return;
    }
  }
  const id = state.nextLogId++;
  brain.botLogEntryId = id;
  state.logs.push({ id, text, type: 'bot', timestamp: state.matchElapsed });
  if (state.logs.length > 20) state.logs.shift();
}

function clearBotTypingLog(state, brain) {
  if (brain.botLogEntryId) {
    const idx = state.logs.findIndex((l) => l.id === brain.botLogEntryId);
    if (idx !== -1) {
      state.logs.splice(idx, 1);
    }
    brain.botLogEntryId = null;
  }
}
