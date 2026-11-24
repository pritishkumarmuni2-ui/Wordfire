// src/main.js - Orchestration, screen transitions, and fixed 60 FPS loop
import { CONFIG } from '../data/config.js';
import { ELEMENT_COMMANDS } from '../data/powers.js';
import { createInitialState } from './logic/state.js';
import { executeCommand } from './logic/commands.js';
import { updateGame } from './logic/combat.js';
import { createBotBrain, updateBot } from './logic/bot.js';
import { renderGame } from './render/draw.js';
import { initInput } from './input.js';

// DOM Elements
const canvas = document.getElementById('game-canvas');
const ctx = canvas.getContext('2d');
const commandInput = document.getElementById('command-input');
const eventLogContainer = document.getElementById('event-log');
const pickScreen = document.getElementById('pick-screen');
const resultOverlay = document.getElementById('result-overlay');
const startMatchBtn = document.getElementById('start-match-btn');
const playAgainBtn = document.getElementById('play-again-btn');
const resultBadge = document.getElementById('result-badge');
const resultTitle = document.getElementById('result-title');
const resultSubtitle = document.getElementById('result-subtitle');
const resultStats = document.getElementById('result-stats');
const quickCommandsList = document.getElementById('quick-commands-list');

// Pick screen state selections
let selectedPlayerElement = 'fire';
let selectedBotDifficulty = 'easy';

// Active match state
let gameState = null;
let botBrain = null;
let inputHandler = null;

// Fixed 1/60s time step accumulator
let lastTime = performance.now();
let accumulator = 0;
let isLoopRunning = false;

function escapeHTML(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Global error handlers: write errors directly to visible log on screen
function showErrorInLog(msg) {
  console.error(msg);
  if (eventLogContainer) {
    const li = document.createElement('li');
    li.className = 'log-item log-system';
    li.style.color = '#FF5555';
    li.innerHTML = `<span class="log-tag tag-sys" style="background:#500;color:#FFAAAA;">ERR</span> <span>${escapeHTML(msg)}</span>`;
    eventLogContainer.appendChild(li);
    if (eventLogContainer.children.length > 6) {
      eventLogContainer.removeChild(eventLogContainer.children[0]);
    }
  }
}

window.addEventListener('error', (event) => {
  showErrorInLog(event.message || 'Unknown runtime error');
});

window.addEventListener('unhandledrejection', (event) => {
  showErrorInLog(event.reason ? (event.reason.message || String(event.reason)) : 'Unhandled rejection');
});

/**
 * Updates quick command pill bar to match chosen element
 */
function updateQuickCommands(element) {
  if (!quickCommandsList) return;
  quickCommandsList.innerHTML = '';

  const elemSpells = ELEMENT_COMMANDS[element] || [];
  const universalSpells = ['shield', 'dodge', 'collect', 'swap', 'play again', 'help'];

  // Elemental Spells
  elemSpells.forEach((cmd) => {
    const btn = document.createElement('button');
    const isUlt = cmd.includes('blast') || cmd.includes('sphere') || cmd.includes('arrow') || cmd.includes('solar');
    btn.className = `cmd-pill pill-elem ${isUlt ? 'pill-ult' : ''}`;
    btn.textContent = cmd;
    btn.title = `Cast ${cmd}`;
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      onQuickCommandClick(cmd);
    });
    quickCommandsList.appendChild(btn);
  });

  // Utility & Defensive
  universalSpells.forEach((cmd) => {
    const btn = document.createElement('button');
    btn.className = 'cmd-pill pill-util';
    btn.textContent = cmd;
    btn.title = `Execute ${cmd}`;
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      onQuickCommandClick(cmd);
    });
    quickCommandsList.appendChild(btn);
  });
}

function handlePlayerCommand(typedCommand) {
  const norm = (typedCommand || '').trim().toLowerCase().replace(/\s+/g, ' ');
  if (norm === 'play again' || norm === 'playagain' || norm === 'restart') {
    startNewMatch();
    return;
  }
  if (gameState && !gameState.ended) {
    const res = executeCommand(gameState, 'player', typedCommand);
    if (res && res.action === 'restart') {
      startNewMatch();
      return;
    }
    updateDOMEventLog(gameState);
  }
}

function onQuickCommandClick(cmd) {
  const norm = (cmd || '').trim().toLowerCase().replace(/\s+/g, ' ');
  if (norm === 'play again' || norm === 'playagain' || norm === 'restart') {
    startNewMatch();
    return;
  }
  if (commandInput) {
    commandInput.value = cmd;
  }
  if (gameState && !gameState.ended) {
    const res = executeCommand(gameState, 'player', cmd);
    if (res && res.action === 'restart') {
      startNewMatch();
      return;
    }
    if (commandInput) commandInput.value = '';
    updateDOMEventLog(gameState);
  }
  if (inputHandler) {
    inputHandler.ensureFocus();
  }
}

/**
 * Initializes pick screen controls and button bindings.
 */
function initPickScreen() {
  const elementCards = document.querySelectorAll('.element-card');
  elementCards.forEach((card) => {
    card.addEventListener('click', () => {
      elementCards.forEach((c) => c.classList.remove('selected'));
      card.classList.add('selected');
      selectedPlayerElement = card.getAttribute('data-element');
      updateQuickCommands(selectedPlayerElement);
    });
  });

  const diffBtns = document.querySelectorAll('.diff-btn');
  diffBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      diffBtns.forEach((b) => b.classList.remove('selected'));
      btn.classList.add('selected');
      selectedBotDifficulty = btn.getAttribute('data-difficulty');
    });
  });

  if (startMatchBtn) {
    startMatchBtn.addEventListener('click', (e) => {
      e.preventDefault();
      startNewMatch();
    });
  }

  if (playAgainBtn) {
    playAgainBtn.addEventListener('click', (e) => {
      e.preventDefault();
      if (resultOverlay) {
        resultOverlay.classList.add('hidden');
        resultOverlay.style.display = 'none';
      }
      if (pickScreen) {
        pickScreen.classList.remove('hidden');
        pickScreen.style.display = 'flex';
      }
    });
  }

  // Populate initial quick commands
  updateQuickCommands(selectedPlayerElement);
}

/**
 * Ensures the animation loop is running.
 */
function ensureLoopRunning() {
  if (!isLoopRunning) {
    isLoopRunning = true;
    lastTime = performance.now();
    requestAnimationFrame(mainLoop);
  }
}

/**
 * Starts a new match without reloading the page.
 */
function startNewMatch() {
  try {
    // 1. Hide pick screen completely (display none)
    if (pickScreen) {
      pickScreen.style.display = 'none';
      pickScreen.classList.add('hidden');
    }

    // 2. Show canvas and verify exact 960x540 dimensions
    if (canvas) {
      canvas.style.display = 'block';
      canvas.width = CONFIG.canvasWidth;
      canvas.height = CONFIG.canvasHeight;
    }

    // 3. Bot secretly picks random element
    const elements = ['fire', 'ice', 'wind', 'light'];
    const botSecretElement = elements[Math.floor(Math.random() * elements.length)];

    // 4. Create state and bot brain
    gameState = createInitialState(selectedPlayerElement, selectedBotDifficulty, botSecretElement);
    botBrain = createBotBrain(selectedBotDifficulty);

    if (resultOverlay) {
      resultOverlay.classList.add('hidden');
      resultOverlay.style.display = 'none';
    }

    // Update quick commands list
    updateQuickCommands(selectedPlayerElement);

    // 5. Initialize or reset input handler
    if (!inputHandler) {
      inputHandler = initInput(
        canvas,
        commandInput,
        (typedCommand) => {
          handlePlayerCommand(typedCommand);
        },
        () => (gameState && gameState.camera ? gameState.camera.x : 0)
      );
    }

    // 6. Focus text input
    if (commandInput) {
      commandInput.focus();
    }
    if (inputHandler) {
      inputHandler.ensureFocus();
    }

    // 7. Start the game loop
    ensureLoopRunning();

    // 8. Update DOM log
    updateDOMEventLog(gameState);
  } catch (err) {
    showErrorInLog(`Error starting match: ${err && err.message ? err.message : err}`);
  }
}

/**
 * Updates DOM log with last 6 events with clean UI tags.
 */
function updateDOMEventLog(state) {
  if (!state || !eventLogContainer) return;
  const last6 = state.logs.slice(-6);

  eventLogContainer.innerHTML = '';
  last6.forEach((log) => {
    const li = document.createElement('li');
    li.className = `log-item log-${log.type}`;

    let tagHtml = '<span class="log-tag tag-sys">SYS</span>';
    if (log.type === 'player') {
      tagHtml = '<span class="log-tag tag-player">YOU</span>';
    } else if (log.type === 'bot') {
      tagHtml = '<span class="log-tag tag-bot">BOT</span>';
    }

    li.innerHTML = `${tagHtml} <span>${escapeHTML(log.text)}</span>`;
    eventLogContainer.appendChild(li);
  });
}

/**
 * Main game loop: fixed 1/60s update tick, variable render.
 */
function mainLoop(now) {
  requestAnimationFrame(mainLoop);

  const dt = Math.min((now - lastTime) / 1000, 0.1);
  lastTime = now;

  if (gameState) {
    try {
      accumulator += dt;

      const inputPlayer = inputHandler ? inputHandler.poll() : {};

      while (accumulator >= CONFIG.fixedDt) {
        // 1. Update Bot AI & simulated typing
        const inputBot = updateBot(gameState, botBrain, CONFIG.fixedDt);

        // 2. Update logic on fixed 1/60s step
        updateGame(gameState, inputPlayer, inputBot);

        accumulator -= CONFIG.fixedDt;
      }

      // 3. Update DOM Log
      updateDOMEventLog(gameState);

      // 4. Render to Canvas
      const mouseState = inputHandler ? inputHandler.getMouseCoords() : {};
      renderGame(ctx, gameState, mouseState);

      // 5. Check Result Overlay
      if (gameState.screen === 'result' && resultOverlay && resultOverlay.classList.contains('hidden')) {
        showResultOverlay(gameState);
      }
    } catch (loopErr) {
      showErrorInLog(`Game loop error: ${loopErr && loopErr.message ? loopErr.message : loopErr}`);
    }
  }
}

function showResultOverlay(state) {
  if (!resultOverlay) return;
  resultOverlay.classList.remove('hidden');
  resultOverlay.style.display = 'flex';

  let titleText = 'MATCH DRAW';
  let titleClass = 'draw';
  let badgeText = 'STALEMATE';

  if (state.winner === 'player') {
    titleText = 'VICTORY!';
    titleClass = 'win';
    badgeText = 'DUEL WON';
  } else if (state.winner === 'bot') {
    titleText = 'DEFEATED';
    titleClass = 'lose';
    badgeText = 'DUEL LOST';
  }

  if (resultBadge) resultBadge.textContent = badgeText;
  if (resultTitle) {
    resultTitle.textContent = titleText;
    resultTitle.className = `result-title ${titleClass}`;
  }
  if (resultSubtitle) {
    resultSubtitle.textContent = `Player: ${state.player.hp} HP  |  ${state.bot.name}: ${state.bot.hp} HP`;
  }

  if (resultStats) {
    const elapsedM = Math.floor(state.matchElapsed / 60);
    const elapsedS = Math.floor(state.matchElapsed % 60);
    const timeStr = `${String(elapsedM).padStart(2, '0')}:${String(elapsedS).padStart(2, '0')}`;
    resultStats.innerHTML = `
      <div class="stat-chip">Your HP: <span>${state.player.hp}/100</span></div>
      <div class="stat-chip">Bot HP: <span>${state.bot.hp}/100</span></div>
      <div class="stat-chip">Duration: <span>${timeStr}</span></div>
      <div class="stat-chip">Mode: <span>${state.botDifficulty.toUpperCase()}</span></div>
    `;
  }

  // Ensure command input remains focused so player can type 'play again'
  if (commandInput) {
    commandInput.focus();
  }
  if (inputHandler) {
    inputHandler.ensureFocus();
  }
}

// Bootstrap: runs immediately if DOM already parsed, otherwise on DOMContentLoaded
function bootstrap() {
  initPickScreen();
  ensureLoopRunning();
}

if (document.readyState === 'loading') {
  window.addEventListener('DOMContentLoaded', bootstrap);
} else {
  bootstrap();
}
