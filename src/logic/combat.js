// src/logic/combat.js - Physics, collisions, combat resolution and match loop
import { CONFIG } from '../../data/config.js';
import { addLogMessage } from './state.js';

/**
 * Main logic tick: updates state by fixedDt (1/60s).
 * Pure state transformation: no DOM or canvas access!
 */
export function updateGame(state, inputPlayer, inputBot) {
  if (state.ended) {
    // Keep updating particles for defeat animation
    updateParticles(state, CONFIG.fixedDt);
    return;
  }

  const dt = CONFIG.fixedDt;

  // 1. Match clock & phases
  state.matchElapsed += dt;
  state.matchTimeRemaining = Math.max(0, state.matchTimeRemaining - dt);
  state.safePhaseActive = state.matchElapsed < CONFIG.match.safePhaseEnd;

  // 2. Playable zone shrinking
  updateZone(state, dt);

  // 3. Zone damage & Anti-camping
  updateZoneDamage(state, dt);
  updateAntiCamping(state, dt);

  // 4. Update Fighters
  updateFighter(state, state.player, state.bot, inputPlayer, dt);
  updateFighter(state, state.bot, state.player, inputBot, dt);

  // 5. Update Snowmen (Ice Army)
  updateSnowmen(state, dt);

  // 6. Imbued weapon attacks vs normal projectiles
  resolveImbuedWeaponInterceptions(state);

  // 7. Projectile movement and collisions
  updateProjectiles(state, dt);

  // 8. Melee and continuous beam resolution
  resolveMeleeAndBeams(state, dt);

  // 9. Update particles & effects
  updateParticles(state, dt);

  // 10. Check match end condition
  checkMatchEnd(state);
}

/**
 * Updates shrinking zone coordinates:
 * 1:00 to 5:00: shrinks evenly from both ends to 20% width (600px).
 */
function updateZone(state, dt) {
  const shrinkStart = CONFIG.match.zoneShrinkStart; // 60s
  const shrinkEnd = CONFIG.match.zoneShrinkEnd;     // 300s
  const minWidth = CONFIG.worldWidth * CONFIG.match.zoneFinalWidthRatio; // 600px
  const center = CONFIG.worldWidth / 2; // 1500px

  if (state.matchElapsed <= shrinkStart) {
    state.zone.left = 0;
    state.zone.right = CONFIG.worldWidth;
  } else if (state.matchElapsed >= shrinkEnd) {
    state.zone.left = center - minWidth / 2;
    state.zone.right = center + minWidth / 2;
  } else {
    const ratio = (state.matchElapsed - shrinkStart) / (shrinkEnd - shrinkStart);
    const currentWidth = CONFIG.worldWidth - ratio * (CONFIG.worldWidth - minWidth);
    state.zone.left = center - currentWidth / 2;
    state.zone.right = center + currentWidth / 2;
  }
}

/**
 * Anyone outside the zone loses 1 HP per second.
 */
function updateZoneDamage(state, dt) {
  state.zone.damageAccumulator += dt;
  if (state.zone.damageAccumulator >= 1.0) {
    state.zone.damageAccumulator -= 1.0;

    [state.player, state.bot].forEach((fighter) => {
      if (fighter.x < state.zone.left || fighter.x > state.zone.right) {
        if (!state.safePhaseActive && fighter.hp > 0) {
          fighter.hp = Math.max(0, fighter.hp - CONFIG.match.outsideZoneDamageRate);
          addLogMessage(state, `${fighter.name} is taking fog zone damage (-1 HP)!`, 'system');
          spawnDamageSpark(state, fighter.x, fighter.y - fighter.height / 2, '#888888');
          spawnFloatingText(state, fighter.x, fighter.y - fighter.height - 14, '-1', '#888888');
        }
      }
    });
  }
}

/**
 * Anti-camping (after safe phase):
 * A fighter who has not attacked for 20 seconds loses 1 HP, and again every 20 seconds.
 */
function updateAntiCamping(state, dt) {
  if (state.safePhaseActive) return;

  [state.player, state.bot].forEach((fighter) => {
    fighter.antiCampTimer += dt;
    if (fighter.antiCampTimer >= CONFIG.match.antiCampThreshold) {
      fighter.antiCampTimer -= CONFIG.match.antiCampRepeat;
      fighter.hp = Math.max(0, fighter.hp - CONFIG.match.antiCampDamage);
      addLogMessage(state, `${fighter.name} penalized for camping (-1 HP)!`, 'system');
      spawnDamageSpark(state, fighter.x, fighter.y - fighter.height / 2, '#FF5555');
    }
  });
}

/**
 * Updates a single fighter's physics, buffs, cooldowns, and swing state.
 */
function updateFighter(state, fighter, opponent, input, dt) {
  if (fighter.hp <= 0) return;

  // Timers decrement
  if (fighter.poseTimer > 0) fighter.poseTimer -= dt;
  if (fighter.dodgeReadyTimer > 0) {
    fighter.dodgeReadyTimer -= dt;
    if (fighter.dodgeReadyTimer <= 0) fighter.dodgeReady = false;
  }
  if (fighter.dodgeTimer > 0) fighter.dodgeTimer -= dt;
  if (fighter.dodgeIframeTimer > 0) fighter.dodgeIframeTimer -= dt;
  if (fighter.dodgeCooldown > 0) fighter.dodgeCooldown -= dt;

  if (fighter.shieldTimer > 0) {
    fighter.shieldTimer -= dt;
    if (fighter.shieldTimer <= 0) {
      fighter.shieldActive = false;
      fighter.shieldCooldown = CONFIG.shield.cooldown;
      addLogMessage(state, `${fighter.name}'s shield dissipated.`, fighter.id);
    }
  }
  if (fighter.shieldCooldown > 0) fighter.shieldCooldown -= dt;

  if (fighter.frozen) {
    fighter.freezeTimer -= dt;
    if (fighter.freezeTimer <= 0) {
      fighter.frozen = false;
      fighter.freezeImmuneTimer = CONFIG.freeze.immunityDuration;
      addLogMessage(state, `${fighter.name} thawed out!`, fighter.id);
    }
  }
  if (fighter.freezeImmuneTimer > 0) fighter.freezeImmuneTimer -= dt;

  if (fighter.flying) {
    fighter.flyTimer -= dt;
    if (fighter.flyTimer <= 0) fighter.flying = false;
  }
  if (fighter.flyCooldown > 0) fighter.flyCooldown -= dt;

  if (fighter.weaponImbueTimer > 0) {
    fighter.weaponImbueTimer -= dt;
    if (fighter.weaponImbueTimer <= 0) {
      fighter.weaponImbued = false;
      fighter.weaponImbueElement = null;
    }
  }

  if (fighter.heatWaveTimer > 0) fighter.heatWaveTimer -= dt;
  if (fighter.opponentWeakenedTimer > 0) fighter.opponentWeakenedTimer -= dt;
  if (fighter.blizzardTimer > 0) fighter.blizzardTimer -= dt;
  if (fighter.speedBuffTimer > 0) fighter.speedBuffTimer -= dt;
  if (fighter.radiationTimer > 0) fighter.radiationTimer -= dt;
  if (fighter.ultimateCooldown > 0) fighter.ultimateCooldown -= dt;
  if (fighter.swingCooldown > 0) fighter.swingCooldown -= dt;

  // Burst cooldowns decrement
  for (const key of Object.keys(fighter.bursts)) {
    const burst = fighter.bursts[key];
    if (burst.cooldown > 0) {
      burst.cooldown -= dt;
    }
  }

  // Handle Dodge trigger if dodgeReady is waiting for Left/Right
  if (fighter.dodgeReady && !fighter.frozen && (input.left || input.right)) {
    const dir = input.left ? -1 : 1;
    const dist = fighter.speedBuffTimer > 0 ? CONFIG.dodge.speedDistance : CONFIG.dodge.normalDistance;
    fighter.dodgeDirection = dir;
    fighter.isDodging = true;
    fighter.dodgeTimer = CONFIG.dodge.duration;
    fighter.dodgeIframeTimer = CONFIG.dodge.iframeDuration;
    fighter.dodgeCooldown = CONFIG.dodge.cooldown;
    fighter.dodgeReady = false;
    fighter.vx = (dir * dist) / CONFIG.dodge.duration;
    fighter.pose = 'dodge';
    fighter.poseTimer = CONFIG.dodge.duration;
    addLogMessage(state, `${fighter.name} dashed!`, fighter.id);
  }

  // Handle Swing Request (from input)
  if (input.wantsSwing && !fighter.isSwinging && fighter.swingCooldown <= 0 && !fighter.frozen) {
    initiateSwing(fighter, input.swingTargetX, input.swingTargetY);
  }

  // Handle Swing Release (mouse up or bot release)
  if (fighter.isSwinging && input.releaseSwing) {
    releaseSwing(fighter);
  }

  // ---------------- MOVEMENT & PHYSICS ----------------
  if (fighter.isSwinging) {
    updateFighterSwinging(fighter, input, dt);
  } else if (fighter.isDodging && fighter.dodgeTimer > 0) {
    fighter.x += fighter.vx * dt;
  } else {
    updateFighterNormalMovement(fighter, opponent, input, dt);
  }

  // Clamp within world bounds
  fighter.x = Math.max(fighter.width / 2, Math.min(CONFIG.worldWidth - fighter.width / 2, fighter.x));

  // Determine Pose
  if (fighter.poseTimer <= 0) {
    if (fighter.shieldActive) {
      fighter.pose = 'shield';
    } else if (fighter.isDodging) {
      fighter.pose = 'dodge';
    } else if (!fighter.onGround) {
      fighter.pose = 'jump';
    } else if (Math.abs(fighter.vx) > 10) {
      fighter.pose = 'run';
    } else {
      fighter.pose = 'idle';
    }
  }
}

/**
 * Swing mechanics (pendulum arc around swing anchor).
 */
function initiateSwing(fighter, targetX, targetY) {
  // Find valid anchor near target coords within max reach (350px)
  let bestAnchor = null;
  let bestDist = Infinity;

  CONFIG.swingAnchors.forEach((anchor) => {
    const distFromFighter = Math.hypot(fighter.x - anchor.x, (fighter.y - fighter.height / 2) - anchor.y);
    if (distFromFighter <= CONFIG.swing.maxReachDistance) {
      const clickDist = Math.hypot(targetX - anchor.x, targetY - anchor.y);
      if (clickDist < 50 && clickDist < bestDist) {
        bestDist = clickDist;
        bestAnchor = anchor;
      }
    }
  });

  if (!bestAnchor) return;

  const dx = fighter.x - bestAnchor.x;
  const dy = (fighter.y - fighter.height / 2) - bestAnchor.y;
  const radius = Math.hypot(dx, dy);
  if (radius < 30) return;

  fighter.isSwinging = true;
  fighter.swingAnchor = bestAnchor;
  fighter.swingRadius = radius;
  // Angle: 0 is straight down, positive clockwise
  fighter.swingAngle = Math.atan2(dx, dy);

  // Approximate initial angular velocity from linear vx
  const tangVx = fighter.vx * Math.cos(fighter.swingAngle) - fighter.vy * Math.sin(fighter.swingAngle);
  fighter.swingAngularVelocity = tangVx / radius;
  fighter.swingTimer = 0;
}

function releaseSwing(fighter) {
  if (!fighter.isSwinging) return;
  fighter.isSwinging = false;
  fighter.swingCooldown = CONFIG.swing.cooldownAfterRelease;
}

function updateFighterSwinging(fighter, input, dt) {
  fighter.swingTimer += dt;
  if (fighter.swingTimer >= CONFIG.swing.maxDuration) {
    releaseSwing(fighter);
    return;
  }

  const anchor = fighter.swingAnchor;
  const r = fighter.swingRadius;

  // Pendulum equation: alpha = -(g/r)*sin(theta)
  const g = CONFIG.fighter.gravity * CONFIG.swing.gravityMultiplier;
  let alpha = -(g / r) * Math.sin(fighter.swingAngle);

  // Arrow keys add small push
  if (input.left) {
    alpha -= (CONFIG.swing.pushAcceleration / r);
    fighter.facing = -1;
  }
  if (input.right) {
    alpha += (CONFIG.swing.pushAcceleration / r);
    fighter.facing = 1;
  }

  fighter.swingAngularVelocity += alpha * dt;
  fighter.swingAngularVelocity *= CONFIG.swing.damping;
  fighter.swingAngle += fighter.swingAngularVelocity * dt;

  // Convert polar back to cartesian
  fighter.x = anchor.x + r * Math.sin(fighter.swingAngle);
  fighter.y = anchor.y + r * Math.cos(fighter.swingAngle) + fighter.height / 2;

  // Tangential velocity
  const speed = r * fighter.swingAngularVelocity;
  fighter.vx = speed * Math.cos(fighter.swingAngle);
  fighter.vy = -speed * Math.sin(fighter.swingAngle);

  // Check collision with ground or platform -> landing ends swing
  if (fighter.y >= CONFIG.groundY) {
    fighter.y = CONFIG.groundY;
    fighter.onGround = true;
    fighter.vy = 0;
    releaseSwing(fighter);
    return;
  }

  for (const plat of CONFIG.platforms) {
    if (
      fighter.x >= plat.x &&
      fighter.x <= plat.x + plat.w &&
      fighter.y >= plat.y &&
      fighter.y <= plat.y + 16 &&
      fighter.vy >= 0
    ) {
      fighter.y = plat.y;
      fighter.onGround = true;
      fighter.vy = 0;
      releaseSwing(fighter);
      return;
    }
  }
}

/**
 * Standard ground & air movement.
 */
function updateFighterNormalMovement(fighter, opponent, input, dt) {
  // If frozen, cannot move or jump
  if (fighter.frozen) {
    fighter.vx = 0;
  } else {
    let speed = CONFIG.fighter.runSpeed;
    if (fighter.blizzardTimer > 0) {
      speed *= CONFIG.blizzard.speedMultiplier;
    }

    if (input.left && !input.right) {
      fighter.vx = -speed;
      fighter.facing = -1;
    } else if (input.right && !input.left) {
      fighter.vx = speed;
      fighter.facing = 1;
    } else {
      fighter.vx = 0;
    }

    // Jump
    if (input.up && fighter.onGround) {
      fighter.vy = CONFIG.fighter.jumpSpeed;
      fighter.onGround = false;
      fighter.currentPlatform = null;
    }
  }

  // Gravity & flight
  if (fighter.flying) {
    fighter.vy = -80; // Gentle float upwards
  } else {
    fighter.vy += CONFIG.fighter.gravity * dt;
  }

  fighter.x += fighter.vx * dt;
  fighter.y += fighter.vy * dt;

  // Platform collision
  fighter.onGround = false;
  fighter.currentPlatform = null;

  for (const plat of CONFIG.platforms) {
    const isAbove = fighter.y - fighter.vy * dt <= plat.y + 4;
    const isWithinX = fighter.x >= plat.x && fighter.x <= plat.x + plat.w;
    if (isAbove && isWithinX && fighter.y >= plat.y && fighter.vy >= 0) {
      fighter.y = plat.y;
      fighter.vy = 0;
      fighter.onGround = true;
      fighter.currentPlatform = plat;
      break;
    }
  }

  // Ground collision
  if (fighter.y >= CONFIG.groundY) {
    fighter.y = CONFIG.groundY;
    fighter.vy = 0;
    fighter.onGround = true;
  }
}

/**
 * Imbued weapon strikes and arrows destroy enemy normal power projectiles on contact!
 * "A weapon swing or arrow carrying an element (after `power`) destroys normal enemy power projectiles it touches. It does not stop ultimates. A plain weapon cannot stop powers."
 */
function resolveImbuedWeaponInterceptions(state) {
  // Check imbued melee
  [state.player, state.bot].forEach((fighter) => {
    if (fighter.activeMelee && fighter.activeMelee.isImbued) {
      const melee = fighter.activeMelee;
      const attackBox = getAttackHitbox(fighter, melee.range);

      state.projectiles = state.projectiles.filter((p) => {
        if (p.owner !== fighter.id && !p.isUltimate && p.type === 'power') {
          if (boxIntersectsCircle(attackBox, p.x, p.y, p.radius)) {
            spawnDamageSpark(state, p.x, p.y, '#FFFFFF');
            addLogMessage(state, `${fighter.name}'s imbued weapon intercepted a projectile!`, fighter.id);
            return false; // Destroyed
          }
        }
        return true;
      });
    }
  });

  // Check imbued arrows vs normal enemy power projectiles
  const arrows = state.projectiles.filter((p) => p.type === 'arrow' && p.isImbued);
  arrows.forEach((arrow) => {
    state.projectiles = state.projectiles.filter((p) => {
      if (p.id !== arrow.id && p.owner !== arrow.owner && !p.isUltimate && p.type === 'power') {
        const dist = Math.hypot(arrow.x - p.x, arrow.y - p.y);
        if (dist <= arrow.radius + p.radius + 8) {
          spawnDamageSpark(state, p.x, p.y, '#FFFFFF');
          return false;
        }
      }
      return true;
    });
  });
}

/**
 * Updates projectiles and resolves hits against fighters.
 */
function updateProjectiles(state, dt) {
  const remaining = [];

  for (const p of state.projectiles) {
    p.x += p.vx * dt;
    p.y += p.vy * dt;

    // Tornado arrow pull effect
    if (p.pullStrength) {
      const target = p.owner === 'player' ? state.bot : state.player;
      const pullDir = Math.sign(p.x - target.x);
      target.x += pullDir * p.pullStrength * dt;
    }

    // World bound check
    if (p.x < -100 || p.x > CONFIG.worldWidth + 100) {
      continue;
    }

    const target = p.owner === 'player' ? state.bot : state.player;
    const targetBox = getFighterHitbox(target);

    if (boxIntersectsCircle(targetBox, p.x, p.y, p.radius)) {
      // Hit target!
      handleProjectileHit(state, p, target);
      continue; // Projectile consumed
    }

    remaining.push(p);
  }

  state.projectiles = remaining;
}

function handleProjectileHit(state, projectile, target) {
  // Dodge iframe check: if target is in dodge i-frames, projectile misses
  if (target.dodgeIframeTimer > 0) {
    addLogMessage(state, `${target.name} dodged through ${projectile.name || 'projectile'}!`, target.id);
    spawnFloatingText(state, target.x, target.y - target.height - 14, 'DODGED!', '#77DD77');
    return;
  }

  // Safe phase check
  if (state.safePhaseActive) {
    addLogMessage(state, `${projectile.name || 'Projectile'} hit during safe phase (0 damage).`, 'system');
    spawnDamageSpark(state, projectile.x, projectile.y, '#AAAAAA');
    spawnFloatingText(state, target.x, target.y - target.height - 14, 'SAFE', '#FFDD55');
    return;
  }

  // Shield check
  if (target.shieldActive) {
    if (projectile.isUltimate) {
      // Ultimates deal 1 to 2 HP through shield
      const chipDamage = CONFIG.shield.ultimatePenetrationDamage;
      target.hp = Math.max(0, target.hp - chipDamage);
      addLogMessage(state, `Ultimate pierced ${target.name}'s shield for ${chipDamage} chip damage!`, target.id);
      spawnDamageSpark(state, projectile.x, projectile.y, '#FFCC00');
      spawnFloatingText(state, target.x, target.y - target.height - 14, `-${chipDamage}`, '#FFCC00');
    } else {
      addLogMessage(state, `${target.name}'s shield blocked ${projectile.name || 'projectile'}!`, target.id);
      spawnDamageSpark(state, projectile.x, projectile.y, '#FFFFFF');
      spawnFloatingText(state, target.x, target.y - target.height - 14, 'BLOCKED', '#FFFFFF');
    }
    return;
  }

  // Direct hit!
  target.hp = Math.max(0, target.hp - projectile.damage);
  spawnDamageSpark(state, projectile.x, projectile.y, projectile.color);
  spawnFloatingText(state, target.x, target.y - target.height - 14, `-${projectile.damage}`, projectile.color);
  addLogMessage(state, `${projectile.owner === 'player' ? 'Player' : 'Bot'} hit ${target.name} with ${projectile.name || 'attack'} for ${projectile.damage} dmg!`, projectile.owner);

  // Freeze effect (Ice Sphere ultimate)
  if (projectile.freezes && target.freezeImmuneTimer <= 0) {
    target.frozen = true;
    target.freezeTimer = CONFIG.freeze.duration;
    spawnFloatingText(state, target.x, target.y - target.height - 30, 'FROZEN!', CONFIG.colors.ice);
    addLogMessage(state, `${target.name} was frozen solid for 2 seconds!`, target.id);
  }
}

/**
 * Resolves active melee attacks and continuous beams.
 */
function resolveMeleeAndBeams(state, dt) {
  [state.player, state.bot].forEach((attacker) => {
    const defender = attacker.id === 'player' ? state.bot : state.player;

    // Melee attack resolution
    if (attacker.activeMelee) {
      const melee = attacker.activeMelee;
      melee.timer -= dt;

      // Check hit once at start of melee
      if (!melee.hitChecked) {
        melee.hitChecked = true;
        const attackBox = getAttackHitbox(attacker, melee.range);
        const defenderBox = getFighterHitbox(defender);

        if (boxesIntersect(attackBox, defenderBox)) {
          handleDirectDamage(state, attacker, defender, melee.damage, melee.type, melee.element);
        }
      }

      if (melee.timer <= 0) {
        attacker.activeMelee = null;
      }
    }

    // Continuous Beam resolution (Light Beam)
    if (attacker.activeBeam) {
      const beam = attacker.activeBeam;
      beam.elapsed += dt;
      beam.tickTimer += dt;

      if (beam.tickTimer >= CONFIG.lightBeam.tickInterval) {
        beam.tickTimer -= CONFIG.lightBeam.tickInterval;

        const beamBox = {
          x: attacker.facing === 1 ? attacker.x : attacker.x - beam.range,
          y: attacker.y - attacker.height / 2 - CONFIG.lightBeam.thickness / 2,
          w: beam.range,
          h: CONFIG.lightBeam.thickness,
        };
        const defenderBox = getFighterHitbox(defender);

        if (boxesIntersect(beamBox, defenderBox)) {
          handleDirectDamage(state, attacker, defender, beam.damagePerTick, 'light beam', 'light');
        }
      }

      if (beam.elapsed >= beam.duration) {
        attacker.activeBeam = null;
      }
    }
  });
}

function handleDirectDamage(state, attacker, defender, damage, attackName, element) {
  if (defender.dodgeIframeTimer > 0) return;

  if (state.safePhaseActive) {
    spawnDamageSpark(state, defender.x, defender.y - defender.height / 2, '#AAAAAA');
    return;
  }

  if (defender.shieldActive) {
    addLogMessage(state, `${defender.name}'s shield blocked ${attackName}!`, defender.id);
    spawnDamageSpark(state, defender.x, defender.y - defender.height / 2, '#FFFFFF');
    spawnFloatingText(state, defender.x, defender.y - defender.height - 14, 'BLOCKED', '#FFFFFF');
    return;
  }

  defender.hp = Math.max(0, defender.hp - damage);
  const color = element ? CONFIG.colors[element] : '#FFDD44';
  spawnDamageSpark(state, defender.x, defender.y - defender.height / 2, color);
  spawnFloatingText(state, defender.x, defender.y - defender.height - 14, `-${damage}`, color);
  addLogMessage(state, `${attacker.name} struck ${defender.name} with ${attackName} for ${damage} dmg!`, attacker.id);
}

/**
 * Snowmen army logic (Ice).
 */
function updateSnowmen(state, dt) {
  const remaining = [];

  for (const sm of state.snowmen) {
    sm.lifetime -= dt;
    if (sm.lifetime <= 0 || sm.hp <= 0 || sm.totalDamageDealt >= sm.maxTotalDamage) {
      spawnDamageSpark(state, sm.x, sm.y - sm.h / 2, CONFIG.colors.ice);
      continue;
    }

    const target = sm.targetId === 'player' ? state.player : state.bot;
    const dx = target.x - sm.x;
    sm.facing = Math.sign(dx) || 1;

    const dist = Math.abs(dx);
    if (dist > CONFIG.snowmen.attackRange) {
      sm.x += sm.facing * CONFIG.snowmen.speed * dt;
    } else {
      // Within attack range: attack target on interval
      sm.attackTimer -= dt;
      if (sm.attackTimer <= 0) {
        sm.attackTimer = CONFIG.snowmen.attackInterval;
        if (!state.safePhaseActive && target.dodgeIframeTimer <= 0) {
          if (target.shieldActive) {
            addLogMessage(state, `${target.name}'s shield blocked snowman attack!`, target.id);
          } else {
            target.hp = Math.max(0, target.hp - sm.damagePerHit);
            sm.totalDamageDealt += sm.damagePerHit;
            spawnDamageSpark(state, target.x, target.y - target.height / 2, CONFIG.colors.ice);
            addLogMessage(state, `Snowman hit ${target.name} for ${sm.damagePerHit} dmg!`, sm.owner);
          }
        }
      }
    }

    remaining.push(sm);
  }

  state.snowmen = remaining;
}

/**
 * Checks for match defeat or match timer completion.
 */
function checkMatchEnd(state) {
  if (state.ended) return;

  const playerDead = state.player.hp <= 0;
  const botDead = state.bot.hp <= 0;

  if (playerDead || botDead) {
    state.ended = true;
    state.screen = 'result';

    if (playerDead && botDead) {
      state.winner = 'draw';
      addLogMessage(state, 'Both fighters collapsed! Match is a DRAW!', 'system');
      triggerDefeatSplatter(state, state.player);
      triggerDefeatSplatter(state, state.bot);
    } else if (playerDead) {
      state.winner = 'bot';
      state.player.pose = 'defeat';
      addLogMessage(state, 'Player has fallen! BOT WINS!', 'system');
      triggerDefeatSplatter(state, state.player);
    } else {
      state.winner = 'player';
      state.bot.pose = 'defeat';
      addLogMessage(state, 'Bot has fallen! YOU WIN!', 'system');
      triggerDefeatSplatter(state, state.bot);
    }
    return;
  }

  // 6:00 match time ended
  if (state.matchTimeRemaining <= 0) {
    state.ended = true;
    state.screen = 'result';

    if (state.player.hp > state.bot.hp) {
      state.winner = 'player';
      addLogMessage(state, 'Time up! Player wins by higher HP!', 'system');
    } else if (state.bot.hp > state.player.hp) {
      state.winner = 'bot';
      addLogMessage(state, 'Time up! Bot wins by higher HP!', 'system');
    } else {
      state.winner = 'draw';
      addLogMessage(state, 'Time up! Equal HP, match is a DRAW!', 'system');
    }
  }
}

/**
 * Multi-colour paint splatter on defeat (red, purple, pink, blue, no blood).
 */
function triggerDefeatSplatter(state, fighter) {
  const colors = CONFIG.colors.paintSplatter;
  for (let i = 0; i < 60; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 80 + Math.random() * 260;
    state.particles.push({
      x: fighter.x,
      y: fighter.y - fighter.height / 2,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 60,
      radius: 4 + Math.random() * 6,
      color: colors[Math.floor(Math.random() * colors.length)],
      alpha: 1.0,
      lifetime: 1.5 + Math.random() * 1.0,
      gravity: 500,
      type: 'splatter',
    });
  }
}

function spawnFloatingText(state, x, y, text, color) {
  state.particles.push({
    x,
    y,
    vx: (Math.random() - 0.5) * 20,
    vy: -45,
    text,
    color,
    alpha: 1.0,
    lifetime: 0.85,
    gravity: 0,
    type: 'text',
  });
}

function spawnDamageSpark(state, x, y, color) {
  for (let i = 0; i < 8; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 40 + Math.random() * 120;
    state.particles.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      radius: 2 + Math.random() * 3,
      color,
      alpha: 1.0,
      lifetime: 0.35 + Math.random() * 0.25,
      gravity: 200,
      type: 'spark',
    });
  }
}

function updateParticles(state, dt) {
  const remaining = [];
  for (const p of state.particles) {
    p.lifetime -= dt;
    if (p.lifetime <= 0) continue;

    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vy += (p.gravity || 0) * dt;
    p.alpha = Math.max(0, p.lifetime / 1.5);
    remaining.push(p);
  }
  state.particles = remaining;
}

// Hitbox helper utilities
function getFighterHitbox(f) {
  return {
    x: f.x - f.width / 2,
    y: f.y - f.height,
    w: f.width,
    h: f.height,
  };
}

function getAttackHitbox(fighter, range) {
  return {
    x: fighter.facing === 1 ? fighter.x : fighter.x - range,
    y: fighter.y - fighter.height,
    w: range,
    h: fighter.height,
  };
}

function boxesIntersect(a, b) {
  return (
    a.x < b.x + b.w &&
    a.x + a.w > b.x &&
    a.y < b.y + b.h &&
    a.y + a.h > b.y
  );
}

function boxIntersectsCircle(box, cx, cy, r) {
  const closestX = Math.max(box.x, Math.min(cx, box.x + box.w));
  const closestY = Math.max(box.y, Math.min(cy, box.y + box.h));
  const dx = cx - closestX;
  const dy = cy - closestY;
  return (dx * dx + dy * dy) <= (r * r);
}
