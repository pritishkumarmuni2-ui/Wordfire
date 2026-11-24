// src/render/draw.js - All rendering to the single canvas
import { CONFIG } from '../../data/config.js';
import { POWERS } from '../../data/powers.js';

// Parallax background image handler
const bgImage = new Image();
bgImage.src = './assets/central_area.png';
let bgImageLoaded = false;
bgImage.onload = () => {
  if (bgImage.naturalWidth > 0) {
    bgImageLoaded = true;
  }
};
bgImage.onerror = () => { bgImageLoaded = false; };

/**
 * Main draw function: renders the entire game state.
 * Read-only: never modifies game logic state.
 */
export function renderGame(ctx, state, mouseState = {}) {
  const { width, height } = ctx.canvas;

  // 1. Calculate camera position
  updateCamera(state);
  const camX = state.camera.x;

  ctx.clearRect(0, 0, width, height);

  // 2. Render Parallax Background
  drawBackground(ctx, camX, width, height);

  // Save context for world coordinate rendering
  ctx.save();
  ctx.translate(-camX, 0);

  // 3. Render World Elements (black, white, and grey only)
  drawWorldStructures(ctx);
  drawPlatforms(ctx);
  drawSwingAnchors(ctx, state, mouseState, camX);
  drawWeaponsOnGround(ctx, state.weapons);

  // 4. Render Snowmen (Ice Army)
  drawSnowmen(ctx, state.snowmen);

  // 5. Render Swing Tethers & Fighters (one function for both)
  drawSwingTether(ctx, state.player);
  drawSwingTether(ctx, state.bot);
  drawFighter(ctx, state.player, state.matchElapsed);
  drawFighter(ctx, state.bot, state.matchElapsed);

  // 6. Render Projectiles, Beams and Melee
  drawProjectiles(ctx, state.projectiles);
  drawMeleeAttacks(ctx, state.player);
  drawMeleeAttacks(ctx, state.bot);
  drawContinuousBeams(ctx, state.player);
  drawContinuousBeams(ctx, state.bot);

  // 7. Render Particles & Splatters
  drawParticles(ctx, state.particles);

  // 8. Render Fog Zone Walls
  drawZoneWalls(ctx, state.zone);

  ctx.restore();

  // 9. Render HUD (In-canvas: HP bars, clock, cooldown chips, ultimate counter)
  drawHUD(ctx, state);

  // 10. Render Result Screen if match ended
  if (state.screen === 'result') {
    drawResultScreen(ctx, state);
  }
}

/**
 * Smoothly positions camera following the player, keeping bot in view when possible.
 */
function updateCamera(state) {
  const p = state.player;
  const b = state.bot;
  const viewW = CONFIG.canvasWidth;
  const maxCamX = CONFIG.worldWidth - viewW;

  let targetX;
  const dist = Math.abs(p.x - b.x);

  if (dist < viewW - 200) {
    // Both fit on screen
    targetX = (p.x + b.x) / 2 - viewW / 2;
  } else {
    // Focus on player
    targetX = p.x - viewW / 2;
  }

  // Clamp within world bounds
  targetX = Math.max(0, Math.min(maxCamX, targetX));

  // Smooth lerp camera
  state.camera.x += (targetX - state.camera.x) * 0.15;
}

/**
 * Background rendering: Parallax if assets/central_area.png exists, otherwise grey gradient & silhouettes.
 */
function drawBackground(ctx, camX, viewW, viewH) {
  const imgW = bgImage.naturalWidth || bgImage.width || 0;
  if (bgImageLoaded && imgW > 0) {
    try {
      const parallaxX = -(camX * 0.25) % imgW;
      for (let x = parallaxX - imgW; x < viewW + imgW; x += imgW) {
        ctx.drawImage(bgImage, x, 0, imgW, viewH);
      }
      return;
    } catch (e) {
      bgImageLoaded = false;
    }
  }

  // Fallback: Elegant grey gradient with architectural silhouettes
    const grad = ctx.createLinearGradient(0, 0, 0, viewH);
    grad.addColorStop(0, '#1A1C1E');
    grad.addColorStop(0.6, '#2E3236');
    grad.addColorStop(1, '#4A4F55');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, viewW, viewH);

    // Distant background silhouettes (parallax 0.15)
    ctx.fillStyle = '#22252A';
    const offset1 = -(camX * 0.15) % 800;
    for (let i = -1; i < 4; i++) {
      const bx = offset1 + i * 800;
      ctx.fillRect(bx + 50, 160, 140, 380);
      ctx.fillRect(bx + 230, 210, 190, 330);
      ctx.fillRect(bx + 460, 120, 180, 420);
      ctx.fillRect(bx + 680, 190, 100, 350);
    }

    // Midground silhouettes (parallax 0.35)
    ctx.fillStyle = '#33373E';
    const offset2 = -(camX * 0.35) % 600;
    for (let i = -1; i < 4; i++) {
      const bx = offset2 + i * 600;
      ctx.fillRect(bx + 30, 260, 110, 280);
      ctx.fillRect(bx + 180, 300, 130, 240);
      ctx.fillRect(bx + 350, 240, 120, 300);
      ctx.fillRect(bx + 500, 280, 80, 260);
    }
}

/**
 * World structures and ground line.
 */
function drawWorldStructures(ctx) {
  // Ground line
  ctx.fillStyle = '#181A1D';
  ctx.fillRect(0, CONFIG.groundY, CONFIG.worldWidth, CONFIG.worldHeight - CONFIG.groundY);

  ctx.strokeStyle = '#5A6068';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(0, CONFIG.groundY);
  ctx.lineTo(CONFIG.worldWidth, CONFIG.groundY);
  ctx.stroke();

  // Subtle cobblestone markings along the ground
  ctx.strokeStyle = '#32373E';
  ctx.lineWidth = 1;
  for (let x = 30; x < CONFIG.worldWidth; x += 40) {
    ctx.beginPath();
    ctx.moveTo(x, CONFIG.groundY + 8);
    ctx.lineTo(x + 20, CONFIG.groundY + 8);
    ctx.moveTo(x + 10, CONFIG.groundY + 22);
    ctx.lineTo(x + 30, CONFIG.groundY + 22);
    ctx.stroke();
  }
}

/**
 * Platforms (crates, benches, walls).
 */
function drawPlatforms(ctx) {
  CONFIG.platforms.forEach((p) => {
    ctx.save();
    if (p.type === 'crates') {
      // Stacked wooden crates (grey/black/white)
      ctx.fillStyle = '#4B5056';
      ctx.fillRect(p.x, p.y, p.w, p.h);
      ctx.strokeStyle = '#7B818A';
      ctx.lineWidth = 2;
      ctx.strokeRect(p.x, p.y, p.w, p.h);
      // Crate X bracing
      ctx.beginPath();
      ctx.moveTo(p.x + 4, p.y + 4);
      ctx.lineTo(p.x + p.w - 4, p.y + p.h - 4);
      ctx.moveTo(p.x + p.w - 4, p.y + 4);
      ctx.lineTo(p.x + 4, p.y + p.h - 4);
      ctx.stroke();
    } else if (p.type === 'bench') {
      // Park bench
      ctx.fillStyle = '#3E4247';
      ctx.fillRect(p.x, p.y, p.w, 10);
      // Legs
      ctx.fillRect(p.x + 10, p.y + 10, 8, p.h - 10);
      ctx.fillRect(p.x + p.w - 18, p.y + 10, 8, p.h - 10);
      ctx.strokeStyle = '#6E737C';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(p.x, p.y, p.w, 10);
    } else {
      // Stone wall
      ctx.fillStyle = '#383B40';
      ctx.fillRect(p.x, p.y, p.w, p.h);
      ctx.strokeStyle = '#656A73';
      ctx.lineWidth = 2;
      ctx.strokeRect(p.x, p.y, p.w, p.h);
      // Brick lines
      for (let y = p.y + 18; y < p.y + p.h; y += 18) {
        ctx.beginPath();
        ctx.moveTo(p.x, y);
        ctx.lineTo(p.x + p.w, y);
        ctx.stroke();
      }
    }
    ctx.restore();
  });
}

/**
 * Swing anchors:
 * At least 12 swing anchors spread across the map.
 * Faint highlight when under mouse and within reach (350px) of player.
 */
function drawSwingAnchors(ctx, state, mouseState, camX) {
  const p = state.player;
  const mouseWorldX = (mouseState.canvasX || 0) + camX;
  const mouseWorldY = mouseState.canvasY || 0;

  CONFIG.swingAnchors.forEach((anchor) => {
    const distFromPlayer = Math.hypot(p.x - anchor.x, (p.y - p.height / 2) - anchor.y);
    const inRange = distFromPlayer <= CONFIG.swing.maxReachDistance;
    const distToMouse = Math.hypot(mouseWorldX - anchor.x, mouseWorldY - anchor.y);
    const isHovered = distToMouse < 40;

    ctx.save();

    // Anchor structure (clock tower, wall corner, tree branch, etc.)
    ctx.fillStyle = '#2D3035';
    ctx.fillRect(anchor.x - anchor.w / 2, anchor.y - anchor.h / 2, anchor.w, anchor.h);
    ctx.strokeStyle = '#626870';
    ctx.lineWidth = 2;
    ctx.strokeRect(anchor.x - anchor.w / 2, anchor.y - anchor.h / 2, anchor.w, anchor.h);

    // Anchor center pin
    ctx.fillStyle = '#9FA6B2';
    ctx.beginPath();
    ctx.arc(anchor.x, anchor.y, 4, 0, Math.PI * 2);
    ctx.fill();

    // Faint highlight shows anchor under mouse when in range
    if (inRange && isHovered) {
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
      ctx.lineWidth = 2.5;
      ctx.setLineDash([5, 4]);
      ctx.beginPath();
      ctx.arc(anchor.x, anchor.y, 24, 0, Math.PI * 2);
      ctx.stroke();

      // Subtle range guideline to player
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y - p.height / 2);
      ctx.lineTo(anchor.x, anchor.y);
      ctx.stroke();
    } else if (inRange) {
      // Subtle pulse to indicate valid swing point
      ctx.strokeStyle = 'rgba(160, 170, 185, 0.3)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(anchor.x, anchor.y, 14, 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.restore();
  });
}

/**
 * Weapons spawned on ground (sword, spear, bow).
 */
function drawWeaponsOnGround(ctx, weapons) {
  weapons.forEach((wp) => {
    ctx.save();
    ctx.translate(wp.x, wp.y - wp.h / 2);

    // Ground shadow
    ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
    ctx.beginPath();
    ctx.ellipse(0, wp.h / 2 + 2, 16, 4, 0, 0, Math.PI * 2);
    ctx.fill();

    if (wp.type === 'sword') {
      // Grey steel blade, dark hilt
      ctx.strokeStyle = '#C5CCD6';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(-12, -4);
      ctx.lineTo(12, -4);
      ctx.stroke();
      // Crossguard
      ctx.strokeStyle = '#626870';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-4, -8);
      ctx.lineTo(-4, 0);
      ctx.stroke();
    } else if (wp.type === 'spear') {
      // Shaft
      ctx.strokeStyle = '#828892';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-16, -2);
      ctx.lineTo(16, -2);
      ctx.stroke();
      // Spearhead
      ctx.fillStyle = '#D6DCE5';
      ctx.beginPath();
      ctx.moveTo(16, -5);
      ctx.lineTo(24, -2);
      ctx.lineTo(16, 1);
      ctx.closePath();
      ctx.fill();
    } else if (wp.type === 'bow') {
      // Recurve bow
      ctx.strokeStyle = '#7B818A';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(0, -3, 12, Math.PI * 0.25, Math.PI * 0.75, true);
      ctx.stroke();
      // String
      ctx.strokeStyle = '#ABB2BD';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(-8, -2);
      ctx.lineTo(8, -2);
      ctx.stroke();
    }

    ctx.restore();
  });
}

/**
 * Snowmen (Ice army).
 */
function drawSnowmen(ctx, snowmen) {
  snowmen.forEach((sm) => {
    ctx.save();
    ctx.translate(sm.x, sm.y);

    // Body (two snowballs)
    ctx.fillStyle = '#E8F6FA';
    ctx.strokeStyle = '#A4C3CC';
    ctx.lineWidth = 1.5;

    // Bottom snowball
    ctx.beginPath();
    ctx.arc(0, -10, 11, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Head snowball
    ctx.beginPath();
    ctx.arc(0, -23, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Coal eyes & smile
    ctx.fillStyle = '#222222';
    ctx.beginPath();
    ctx.arc(sm.facing * 3, -24, 1.5, 0, Math.PI * 2);
    ctx.fill();

    // Carrot nose (orange)
    ctx.fillStyle = '#FF9800';
    ctx.beginPath();
    ctx.moveTo(sm.facing * 4, -23);
    ctx.lineTo(sm.facing * 10, -22);
    ctx.lineTo(sm.facing * 4, -20);
    ctx.closePath();
    ctx.fill();

    ctx.restore();
  });
}

/**
 * Single function to draw cartoon fighter:
 * - Oval body, plain round face with no features, visible hands, long trailing scarf in team colour.
 * - Team colour ring under feet.
 * - Both fighters look identical except the scarf colour.
 * - Poses: idle, run, jump, dodge, shield (grey-white dome), cast (hands glow in element colour), melee swing, defeat.
 */
export function drawFighter(ctx, fighter, time) {
  if (fighter.hp <= 0 && fighter.pose === 'defeat') {
    // Defeat handled by paint splatter, fighter fades
    return;
  }

  ctx.save();
  ctx.translate(fighter.x, fighter.y);

  // 1. Team ring under feet (never indicates element)
  ctx.strokeStyle = fighter.scarfColor;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.ellipse(0, 0, 18, 5, 0, 0, Math.PI * 2);
  ctx.stroke();

  // Flip horizontally based on facing direction
  if (fighter.facing === -1) {
    ctx.scale(-1, 1);
  }

  // Freeze effect tint
  if (fighter.frozen) {
    ctx.fillStyle = 'rgba(180, 235, 255, 0.4)';
    ctx.fillRect(-22, -fighter.height - 4, 44, fighter.height + 8);
    ctx.strokeStyle = '#CFF6FF';
    ctx.lineWidth = 2;
    ctx.strokeRect(-22, -fighter.height - 4, 44, fighter.height + 8);
  }

  // 2. Trailing Scarf (in team colour, flows behind)
  const runOffset = fighter.pose === 'run' ? Math.sin(time * 16) * 6 : 0;
  const scarfWave = Math.sin(time * 10) * 4;
  ctx.fillStyle = fighter.scarfColor;
  ctx.beginPath();
  ctx.moveTo(-6, -42);
  ctx.bezierCurveTo(
    -22, -40 + runOffset,
    -34, -34 + scarfWave,
    -46, -30 + runOffset
  );
  ctx.lineTo(-44, -24 + runOffset);
  ctx.bezierCurveTo(
    -32, -28 + scarfWave,
    -20, -34 + runOffset,
    -4, -38
  );
  ctx.closePath();
  ctx.fill();

  // 3. Oval Body (simple cartoon style: charcoal/dark grey tunic)
  ctx.fillStyle = '#2A2D33';
  ctx.strokeStyle = '#4B515B';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(0, -22, 12, 17, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // 4. Plain Round Face (no features, clean porcelain/light grey tone)
  ctx.fillStyle = '#EDEDED';
  ctx.strokeStyle = '#5E6570';
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.arc(0, -44, 11, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // 5. Scarf Knot around neck
  ctx.fillStyle = fighter.scarfColor;
  ctx.beginPath();
  ctx.ellipse(-2, -37, 8, 4, 0.2, 0, Math.PI * 2);
  ctx.fill();

  // 6. Visible Hands & Poses
  const handColor = '#EDEDED';
  ctx.fillStyle = handColor;
  ctx.strokeStyle = '#5E6570';
  ctx.lineWidth = 1.5;

  let hand1X = 10;
  let hand1Y = -24;
  let hand2X = -6;
  let hand2Y = -20;

  if (fighter.pose === 'cast') {
    hand1X = 16;
    hand1Y = -34;
    hand2X = 8;
    hand2Y = -36;

    // Glowing hands in element colour
    const elemColor = CONFIG.colors[fighter.element] || '#FFF';
    ctx.shadowColor = elemColor;
    ctx.shadowBlur = 12;
    ctx.fillStyle = elemColor;
  } else if (fighter.pose === 'melee') {
    hand1X = 20;
    hand1Y = -28;
  } else if (fighter.pose === 'jump') {
    hand1Y = -36;
    hand2Y = -34;
  } else if (fighter.pose === 'dodge') {
    hand1X = 18;
    hand1Y = -18;
  }

  // Draw hands
  ctx.beginPath();
  ctx.arc(hand1X, hand1Y, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(hand2X, hand2Y, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.shadowBlur = 0; // Reset shadow

  // 7. Active Weapon in hand
  const activeWp = fighter.carriedWeapons[fighter.activeWeaponIndex];
  if (activeWp) {
    drawHeldWeapon(ctx, activeWp, hand1X, hand1Y, fighter);
  }

  // 8. Shield dome (grey-white dome)
  if (fighter.shieldActive) {
    ctx.save();
    ctx.fillStyle = 'rgba(230, 240, 250, 0.28)';
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0, -fighter.height / 2, 34, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    // Inner shimmer
    ctx.strokeStyle = 'rgba(200, 220, 240, 0.4)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(0, -fighter.height / 2, 28, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  ctx.restore();
}

/**
 * Draws weapon held in fighter's hand.
 * Glows in element colour for 8s when imbued!
 */
function drawHeldWeapon(ctx, type, hx, hy, fighter) {
  ctx.save();
  ctx.translate(hx, hy);

  const isImbued = fighter.weaponImbued && fighter.weaponImbueTimer > 0;
  if (isImbued) {
    const elemColor = CONFIG.colors[fighter.weaponImbueElement] || '#FFF';
    ctx.shadowColor = elemColor;
    ctx.shadowBlur = 10;
    ctx.strokeStyle = elemColor;
    ctx.fillStyle = elemColor;
  } else {
    ctx.strokeStyle = '#B5BCC6';
    ctx.fillStyle = '#8B93A0';
  }

  if (type === 'sword') {
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(18, -14);
    ctx.stroke();
    // Crossguard
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(2, -4);
    ctx.lineTo(-4, 2);
    ctx.stroke();
  } else if (type === 'spear') {
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(-10, 8);
    ctx.lineTo(26, -20);
    ctx.stroke();
  } else if (type === 'bow') {
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(8, -6, 14, -Math.PI * 0.4, Math.PI * 0.4);
    ctx.stroke();
  }

  ctx.restore();
}

/**
 * Projectiles rendering (all fly straight, glowing power colors).
 */
function drawProjectiles(ctx, projectiles) {
  projectiles.forEach((p) => {
    ctx.save();
    ctx.translate(p.x, p.y);

    if (p.type === 'arrow') {
      // Bow arrow
      ctx.strokeStyle = p.color || '#C0C0C0';
      ctx.lineWidth = 2;
      const dir = Math.sign(p.vx);
      ctx.beginPath();
      ctx.moveTo(-dir * (p.length / 2), 0);
      ctx.lineTo(dir * (p.length / 2), 0);
      ctx.stroke();

      // Arrowhead
      ctx.fillStyle = p.color || '#C0C0C0';
      ctx.beginPath();
      ctx.moveTo(dir * (p.length / 2), -3);
      ctx.lineTo(dir * (p.length / 2 + 5), 0);
      ctx.lineTo(dir * (p.length / 2), 3);
      ctx.closePath();
      ctx.fill();
    } else {
      // Magic power / Ultimate projectile
      ctx.shadowColor = p.color;
      ctx.shadowBlur = p.isUltimate ? 24 : 12;

      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(0, 0, p.radius, 0, Math.PI * 2);
      ctx.fill();

      // Inner bright core
      ctx.fillStyle = '#FFFFFF';
      ctx.beginPath();
      ctx.arc(0, 0, p.radius * 0.5, 0, Math.PI * 2);
      ctx.fill();

      // Tornado arrow special wind effect
      if (p.pullStrength) {
        ctx.strokeStyle = 'rgba(220, 230, 240, 0.7)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.ellipse(0, 0, p.radius * 1.5, p.radius * 0.8, Math.PI / 4, 0, Math.PI * 2);
        ctx.stroke();
      }
    }

    ctx.restore();
  });
}

/**
 * Melee attacks (sword slash arc, spear thrust, fire hands, etc.)
 */
function drawMeleeAttacks(ctx, fighter) {
  if (!fighter.activeMelee) return;
  const melee = fighter.activeMelee;

  ctx.save();
  ctx.translate(fighter.x, fighter.y - fighter.height / 2);
  if (fighter.facing === -1) ctx.scale(-1, 1);

  const color = melee.element ? CONFIG.colors[melee.element] : '#E0E6ED';
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.shadowColor = color;
  ctx.shadowBlur = 10;

  if (melee.type === 'sword') {
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(0, 0, melee.range, -Math.PI * 0.35, Math.PI * 0.35);
    ctx.stroke();
  } else if (melee.type === 'spear') {
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(10, 0);
    ctx.lineTo(melee.range, 0);
    ctx.stroke();
  } else if (melee.type === 'flames' || melee.type === 'fire_hands') {
    // Blazing cone
    ctx.fillStyle = 'rgba(255, 179, 71, 0.4)';
    ctx.beginPath();
    ctx.moveTo(10, 0);
    ctx.lineTo(melee.range, -25);
    ctx.lineTo(melee.range, 25);
    ctx.closePath();
    ctx.fill();
  } else if (melee.type === 'ice_spikes') {
    // Spikes from ground
    ctx.fillStyle = CONFIG.colors.ice;
    for (let i = 0; i < 4; i++) {
      const sx = 20 + i * 36;
      ctx.beginPath();
      ctx.moveTo(sx - 12, fighter.height / 2);
      ctx.lineTo(sx, fighter.height / 2 - 40 - i * 5);
      ctx.lineTo(sx + 12, fighter.height / 2);
      ctx.closePath();
      ctx.fill();
    }
  } else if (melee.type === 'wind_punch') {
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(melee.range * 0.6, 0, 20, 0, Math.PI * 2);
    ctx.stroke();
  }

  ctx.restore();
}

/**
 * Continuous beam rendering (Light beam).
 */
function drawContinuousBeams(ctx, fighter) {
  if (!fighter.activeBeam) return;
  const beam = fighter.activeBeam;

  ctx.save();
  ctx.translate(fighter.x, fighter.y - fighter.height / 2);
  if (fighter.facing === -1) ctx.scale(-1, 1);

  ctx.shadowColor = beam.color;
  ctx.shadowBlur = 18;

  // Outer beam
  ctx.fillStyle = 'rgba(255, 242, 122, 0.55)';
  ctx.fillRect(10, -CONFIG.lightBeam.thickness / 2, beam.range, CONFIG.lightBeam.thickness);

  // Inner beam
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(10, -CONFIG.lightBeam.thickness / 4, beam.range, CONFIG.lightBeam.thickness / 2);

  ctx.restore();
}

/**
 * Splatters and sparks rendering.
 */
function drawParticles(ctx, particles) {
  particles.forEach((p) => {
    ctx.save();
    ctx.globalAlpha = Math.max(0, Math.min(1, p.alpha));
    if (p.type === 'text') {
      ctx.font = 'bold 15px monospace';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#000000';
      ctx.fillText(p.text, p.x + 1, p.y + 1);
      ctx.fillStyle = p.color || '#FFFFFF';
      ctx.fillText(p.text, p.x, p.y);
    } else {
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  });
}

/**
 * Shrinking fog zone walls (at both ends).
 */
function drawZoneWalls(ctx, zone) {
  const worldH = CONFIG.worldHeight;

  // Left fog wall
  if (zone.left > 0) {
    const gradL = ctx.createLinearGradient(0, 0, zone.left, 0);
    gradL.addColorStop(0, 'rgba(10, 12, 15, 0.96)');
    gradL.addColorStop(0.85, 'rgba(15, 18, 22, 0.85)');
    gradL.addColorStop(1, 'rgba(25, 30, 38, 0.0)');
    ctx.fillStyle = gradL;
    ctx.fillRect(0, 0, zone.left, worldH);
  }

  // Right fog wall
  if (zone.right < CONFIG.worldWidth) {
    const gradR = ctx.createLinearGradient(zone.right, 0, CONFIG.worldWidth, 0);
    gradR.addColorStop(0, 'rgba(25, 30, 38, 0.0)');
    gradR.addColorStop(0.15, 'rgba(15, 18, 22, 0.85)');
    gradR.addColorStop(1, 'rgba(10, 12, 15, 0.96)');
    ctx.fillStyle = gradR;
    ctx.fillRect(zone.right, 0, CONFIG.worldWidth - zone.right, worldH);
  }
}

/**
 * Draws swinging kinetic tether line between fighter and swing anchor.
 */
function drawSwingTether(ctx, fighter) {
  if (fighter.isSwinging && fighter.swingAnchor) {
    ctx.save();
    ctx.strokeStyle = fighter.id === 'player' ? 'rgba(220, 20, 60, 0.55)' : 'rgba(65, 105, 225, 0.55)';
    ctx.lineWidth = 1.8;
    ctx.setLineDash([5, 4]);
    ctx.beginPath();
    ctx.moveTo(fighter.swingAnchor.x, fighter.swingAnchor.y);
    ctx.lineTo(fighter.x, fighter.y - fighter.height / 2);
    ctx.stroke();

    // Subtle anchor glow
    ctx.fillStyle = fighter.id === 'player' ? '#FF6B8B' : '#7FA6FF';
    ctx.beginPath();
    ctx.arc(fighter.swingAnchor.x, fighter.swingAnchor.y, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

/**
 * In-canvas HUD:
 * - HP bars top left (player) and top right (bot) with names
 * - Match clock in middle
 * - Cooldown chips and ultimate counter under player's HP bar
 */
function drawHUD(ctx, state) {
  const p = state.player;
  const b = state.bot;

  // 1. Player HP Bar (Top Left)
  drawHpBar(ctx, 24, 20, 260, 24, p.name, p.hp, p.maxHp, p.scarfColor, true);

  // 2. Bot HP Bar (Top Right)
  drawHpBar(ctx, CONFIG.canvasWidth - 284, 20, 260, 24, b.name, b.hp, b.maxHp, b.scarfColor, false);

  // 3. Match Clock (Middle Pill Badge)
  const minutes = Math.floor(state.matchTimeRemaining / 60);
  const seconds = Math.floor(state.matchTimeRemaining % 60);
  const timeStr = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;

  ctx.save();
  // Pill background
  ctx.fillStyle = 'rgba(16, 20, 28, 0.85)';
  ctx.strokeStyle = state.matchTimeRemaining <= 30 ? 'rgba(255, 75, 75, 0.7)' : 'rgba(255, 255, 255, 0.15)';
  ctx.lineWidth = 1.5;
  const pillW = 120;
  const pillH = 34;
  const pillX = CONFIG.canvasWidth / 2 - pillW / 2;
  const pillY = 16;
  ctx.beginPath();
  ctx.roundRect(pillX, pillY, pillW, pillH, 8);
  ctx.fill();
  ctx.stroke();

  // Clock Text
  ctx.fillStyle = state.matchTimeRemaining <= 30 ? '#FF5555' : '#FFFFFF';
  ctx.font = 'bold 18px monospace';
  ctx.textAlign = 'center';
  ctx.fillText(timeStr, CONFIG.canvasWidth / 2, pillY + 23);

  // Phase sub-badge
  if (state.safePhaseActive) {
    ctx.fillStyle = '#FFDD55';
    ctx.font = 'bold 9.5px sans-serif';
    ctx.fillText('🛡️ SAFE PHASE', CONFIG.canvasWidth / 2, pillY + 48);
  } else {
    ctx.fillStyle = '#94A3B8';
    ctx.font = '9px sans-serif';
    ctx.fillText('⚡ ZONE ACTIVE', CONFIG.canvasWidth / 2, pillY + 46);
  }
  ctx.restore();

  // 4. Cooldown chips and Ultimate counter under Player's HP bar
  drawPlayerCooldownChips(ctx, p, 24, 52);

  // 5. Bot status badge under Bot HP bar
  drawBotStatusChips(ctx, b, CONFIG.canvasWidth - 284, 52);
}

function drawHpBar(ctx, x, y, w, h, name, hp, maxHp, color, isLeft) {
  ctx.save();

  // Outer container frame
  ctx.fillStyle = 'rgba(18, 22, 30, 0.9)';
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.18)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 6);
  ctx.fill();
  ctx.stroke();

  // Health fill with gradient
  const ratio = Math.max(0, Math.min(1, hp / maxHp));
  if (ratio > 0) {
    const barW = Math.max(0, (w - 6) * ratio);
    const grad = ctx.createLinearGradient(x + 3, y, x + w, y);
    if (color === CONFIG.colors.player) {
      grad.addColorStop(0, '#E11D48');
      grad.addColorStop(1, '#BE123C');
    } else {
      grad.addColorStop(0, '#3B82F6');
      grad.addColorStop(1, '#1D4ED8');
    }
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.roundRect(x + 3, y + 3, barW, h - 6, 4);
    ctx.fill();
  }

  // Name & HP text
  ctx.fillStyle = '#FFFFFF';
  ctx.font = 'bold 11px sans-serif';
  ctx.shadowColor = 'rgba(0,0,0,0.8)';
  ctx.shadowBlur = 4;
  ctx.textAlign = isLeft ? 'left' : 'right';
  const textX = isLeft ? x + 10 : x + w - 10;
  ctx.fillText(`${name}  ${hp} / ${maxHp} HP`, textX, y + 16);

  ctx.restore();
}

/**
 * Cooldown chips and ultimate counter under Player's HP bar.
 */
function drawPlayerCooldownChips(ctx, player, startX, startY) {
  ctx.save();
  ctx.font = 'bold 10px monospace';

  let curX = startX;

  // Ultimate Pill
  const ultReady = player.ultimateCooldown <= 0 && player.ultimateUsesRemaining > 0;
  const ultColor = ultReady ? '#FFD700' : '#888888';
  const stars = '★'.repeat(player.ultimateUsesRemaining) + '☆'.repeat(CONFIG.ultimate.maxUsesPerMatch - player.ultimateUsesRemaining);
  const ultText = player.ultimateCooldown > 0 ? `(${player.ultimateCooldown.toFixed(1)}s)` : `${stars}`;
  drawHUDChip(ctx, curX, startY, `ULT ${ultText}`, ultColor);
  curX += 95;

  // Shield Pill
  const shieldColor = player.shieldActive ? '#60A5FA' : (player.shieldCooldown > 0 ? '#64748B' : '#93C5FD');
  const shieldText = player.shieldActive ? 'SHIELD ON' : (player.shieldCooldown > 0 ? `${player.shieldCooldown.toFixed(1)}s` : 'SHIELD OK');
  drawHUDChip(ctx, curX, startY, shieldText, shieldColor);
  curX += 85;

  // Dodge Pill
  const dodgeColor = player.dodgeReady ? '#4ADE80' : (player.dodgeCooldown > 0 ? '#64748B' : '#86EFAC');
  const dodgeText = player.dodgeReady ? 'DODGE READY' : (player.dodgeCooldown > 0 ? `${player.dodgeCooldown.toFixed(1)}s` : 'DODGE OK');
  drawHUDChip(ctx, curX, startY, dodgeText, dodgeColor);
  curX += 92;

  // Weapon in hand chip
  const activeWp = player.carriedWeapons[player.activeWeaponIndex] || 'NONE';
  const imbueText = player.weaponImbued ? ` [${player.weaponImbueElement.toUpperCase()} ${player.weaponImbueTimer.toFixed(0)}s]` : '';
  const wpColor = player.weaponImbued ? (CONFIG.colors[player.weaponImbueElement] || '#FFF') : '#E2E8F0';
  drawHUDChip(ctx, curX, startY, `${activeWp}${imbueText}`, wpColor);

  ctx.restore();
}

/**
 * Bot status badge under Bot HP bar.
 */
function drawBotStatusChips(ctx, bot, startX, startY) {
  ctx.save();
  ctx.font = 'bold 10px monospace';
  ctx.textAlign = 'right';

  const activeWp = bot.carriedWeapons[bot.activeWeaponIndex] || 'UNARMED';
  const imbueText = bot.weaponImbued ? ` [${bot.weaponImbueElement.toUpperCase()}]` : '';
  const wpColor = bot.weaponImbued ? (CONFIG.colors[bot.weaponImbueElement] || '#FFF') : '#CBD5E1';

  let text = `BOT: ${activeWp}${imbueText}`;
  if (bot.shieldActive) text = `🛡️ SHIELDED | ${text}`;
  if (bot.frozen) text = `❄️ FROZEN | ${text}`;

  drawHUDChip(ctx, startX + 260 - 150, startY, text, wpColor, 150);
  ctx.restore();
}

function drawHUDChip(ctx, x, y, text, color, customW = null) {
  ctx.save();
  ctx.font = 'bold 10px monospace';
  const textW = ctx.measureText(text).width;
  const chipW = customW || (textW + 14);
  const chipH = 18;

  // Chip background
  ctx.fillStyle = 'rgba(15, 20, 28, 0.85)';
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(x, y, chipW, chipH, 4);
  ctx.fill();
  ctx.stroke();

  // Chip text
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.fillText(text, x + chipW / 2, y + 12);
  ctx.restore();
}

/**
 * Result screen overlay drawn in-canvas.
 */
function drawResultScreen(ctx, state) {
  const w = CONFIG.canvasWidth;
  const h = CONFIG.canvasHeight;

  ctx.save();
  ctx.fillStyle = 'rgba(0, 0, 0, 0.82)';
  ctx.fillRect(0, 0, w, h);

  ctx.textAlign = 'center';

  let title = 'MATCH ENDED';
  let titleColor = '#FFFFFF';

  if (state.winner === 'player') {
    title = 'YOU WIN!';
    titleColor = '#4ADE80';
  } else if (state.winner === 'bot') {
    title = 'YOU LOSE';
    titleColor = '#F87171';
  } else {
    title = 'DRAW MATCH';
    titleColor = '#FACC15';
  }

  ctx.fillStyle = titleColor;
  ctx.font = 'bold 44px sans-serif';
  ctx.fillText(title, w / 2, h / 2 - 60);

  ctx.fillStyle = '#E5E7EB';
  ctx.font = '20px sans-serif';
  ctx.fillText(`Final HP — Player: ${state.player.hp}  |  ${state.bot.name}: ${state.bot.hp}`, w / 2, h / 2 - 10);

  ctx.font = '14px sans-serif';
  ctx.fillStyle = '#9CA3AF';
  ctx.fillText('Click "Play Again" below to start a new duel', w / 2, h / 2 + 30);

  ctx.restore();
}
