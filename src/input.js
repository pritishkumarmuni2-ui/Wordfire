// src/input.js - Keyboard and mouse input handling
export function initInput(canvas, textInput, onCommandSubmit, getCameraX) {
  const inputState = {
    left: false,
    right: false,
    up: false,
    wantsSwing: false,
    releaseSwing: false,
    swingTargetX: 0,
    swingTargetY: 0,
    mouseCanvasX: 0,
    mouseCanvasY: 0,
  };

  // Keep text input focused at all times
  function ensureFocus() {
    if (document.activeElement !== textInput) {
      textInput.focus();
    }
  }

  // Refocus on any click anywhere on document
  document.addEventListener('click', () => {
    ensureFocus();
  });

  // Keyboard handlers for arrow keys
  window.addEventListener('keydown', (e) => {
    if (e.code === 'ArrowLeft') {
      inputState.left = true;
      e.preventDefault();
    } else if (e.code === 'ArrowRight') {
      inputState.right = true;
      e.preventDefault();
    } else if (e.code === 'ArrowUp') {
      inputState.up = true;
      e.preventDefault();
    } else if (e.code === 'Space') {
      // Space is only allowed inside the input box as part of typed commands (e.g. "heat wave")
      // Never use Space for jumping or anything else
    }
  });

  window.addEventListener('keyup', (e) => {
    if (e.code === 'ArrowLeft') {
      inputState.left = false;
    } else if (e.code === 'ArrowRight') {
      inputState.right = false;
    } else if (e.code === 'ArrowUp') {
      inputState.up = false;
    }
  });

  // Text input submission on Enter
  textInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const val = textInput.value;
      textInput.value = '';
      if (val.trim()) {
        onCommandSubmit(val);
      }
    }
  });

  // Calculate mouse position relative to canvas (accounting for CSS scaling)
  function getCanvasCoords(e) {
    const rect = canvas.getBoundingClientRect();
    const scaleX = rect.width ? canvas.width / rect.width : 1;
    const scaleY = rect.height ? canvas.height / rect.height : 1;
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  }

  // Mouse move on canvas (for highlight preview)
  canvas.addEventListener('mousemove', (e) => {
    const coords = getCanvasCoords(e);
    inputState.mouseCanvasX = coords.x;
    inputState.mouseCanvasY = coords.y;
  });

  // Mouse down on canvas triggers swing attempt
  canvas.addEventListener('mousedown', (e) => {
    if (e.button === 0) { // Left click
      const coords = getCanvasCoords(e);
      const camX = getCameraX ? getCameraX() : 0;
      inputState.wantsSwing = true;
      inputState.releaseSwing = false;
      inputState.swingTargetX = coords.x + camX;
      inputState.swingTargetY = coords.y;
      ensureFocus();
    }
  });

  // Mouse up anywhere releases swing
  window.addEventListener('mouseup', (e) => {
    if (e.button === 0) {
      inputState.wantsSwing = false;
      inputState.releaseSwing = true;
      ensureFocus();
    }
  });

  // Consume one-frame swing trigger pulses
  function pollAndResetInput() {
    const current = {
      left: inputState.left,
      right: inputState.right,
      up: inputState.up,
      wantsSwing: inputState.wantsSwing,
      releaseSwing: inputState.releaseSwing,
      swingTargetX: inputState.swingTargetX,
      swingTargetY: inputState.swingTargetY,
      mouseCanvasX: inputState.mouseCanvasX,
      mouseCanvasY: inputState.mouseCanvasY,
    };

    // Reset edge triggers
    inputState.wantsSwing = false;
    inputState.releaseSwing = false;

    return current;
  }

  // Initial focus
  ensureFocus();

  return {
    poll: pollAndResetInput,
    ensureFocus,
    getMouseCoords: () => ({
      canvasX: inputState.mouseCanvasX,
      canvasY: inputState.mouseCanvasY,
    }),
  };
}
