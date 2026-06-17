// ── Shape creation & text editing ─────────────────────────
// Supports two modes: 'oval' (default) and 'circle'

import { svg, selected, selectedType, currentTool, selectedSet, selectedTypes, shapeMode, INFO, ctxMenu } from './state.js';
import {
  getPos, ellipseAttrs, setOvalText, removeOvalText,
  updateOvalTextPosition, updateAnchoredArrows, preventClick,
  startMultiDrag
} from './helpers.js';
import { selectElement, deselect, showEllipseHandles, updateLegend, showContextMenu, setHideTextInput } from './select.js';

// Register our hideTextInput with select module
let textInput = null;

export function showTextInput(ellipse) {
  // Remove any existing input
  hideTextInput();

  const { cx, cy } = ellipseAttrs(ellipse);

  // Get the SVG's on-screen position for the shape center
  const pt = svg.createSVGPoint();
  pt.x = cx;
  pt.y = cy;
  const screenPt = pt.matrixTransform(svg.getScreenCTM());

  const input = document.createElement('input');
  input.type = 'text';
  input.value = ellipse._text || '';
  input.placeholder = 'Type text...';

  // Position it centered over the shape's screen position
  const inputX = screenPt.x;
  const inputY = screenPt.y;

  input.style.position = 'fixed';
  input.style.left = inputX + 'px';
  input.style.top = inputY + 'px';
  input.style.transform = 'translate(-50%, -50%)';
  input.style.zIndex = '2000';
  input.style.background = 'rgba(15, 23, 42, 0.95)';
  input.style.border = '2px solid #fbbf24';
  input.style.borderRadius = '8px';
  input.style.padding = '8px 14px';
  input.style.color = '#ffffff';
  input.style.fontSize = '16px';
  input.style.fontFamily = 'sans-serif';
  input.style.outline = 'none';
  input.style.textAlign = 'center';
  input.style.minWidth = '120px';
  input.style.maxWidth = '300px';
  input.style.boxShadow = '0 8px 32px rgba(0,0,0,0.6)';

  document.body.appendChild(input);
  input.focus();
  input.select();

  function commit() {
    // Guard: only commit if this input is still active
    if (textInput !== input) return;
    const val = input.value.trim();
    if (val) {
      setOvalText(ellipse, val);
    } else if (ellipse._text) {
      // Clear existing text
      setOvalText(ellipse, '');
    }
    hideTextInput();
  }

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      commit();
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      hideTextInput();
    }
  });

  input.addEventListener('blur', commit);

  textInput = input;
}

export function hideTextInput() {
  if (textInput) {
    textInput.remove();
    textInput = null;
  }
}

// Register with select module so deselect can hide text input
setHideTextInput(() => hideTextInput());

// ── Create shape (oval or circle based on shapeMode) ─────

export function createShape(x, y) {
  const ellipse = document.createElementNS('http://www.w3.org/2000/svg', 'ellipse');
  ellipse.setAttribute('cx', x);
  ellipse.setAttribute('cy', y);

  if (shapeMode === 'circle') {
    ellipse.setAttribute('rx', 40);
    ellipse.setAttribute('ry', 40);
  } else {
    ellipse.setAttribute('rx', 40);
    ellipse.setAttribute('ry', 25);
  }

  ellipse.setAttribute('fill', '#3b82f6');
  ellipse.setAttribute('opacity', '0.9');
  ellipse.setAttribute('stroke', '#60a5fa');
  ellipse.setAttribute('stroke-width', '2');
  ellipse.style.cursor = 'pointer';

  // Click on shape → select it
  ellipse.addEventListener('click', (e) => {
    // In arrow mode, don't stop propagation — let the SVG handler place the arrow
    if (currentTool === 'arrow') return;
    // If the text input is showing, don't re-select (let it finish)
    if (textInput) return;
    e.stopPropagation();
    selectElement(ellipse, 'ellipse', e.shiftKey);
  });

  // Mousedown on a selected shape → drag to move it
  ellipse.addEventListener('mousedown', (e) => {
    if (!selectedSet.has(ellipse) || selectedTypes.get(ellipse) !== 'ellipse') return;

    // Multi-drag: move all selected elements together
    if (selectedSet.size > 1) {
      e.stopPropagation();
      e.preventDefault();
      startMultiDrag(e);
      return;
    }

    e.stopPropagation();
    e.preventDefault();

    const startPos = getPos(e);
    const startCx = parseFloat(ellipse.getAttribute('cx'));
    const startCy = parseFloat(ellipse.getAttribute('cy'));
    let dragged = false;

    function onMove(me) {
      dragged = true;
      const pos = getPos(me);
      const dx = pos.x - startPos.x;
      const dy = pos.y - startPos.y;
      ellipse.setAttribute('cx', startCx + dx);
      ellipse.setAttribute('cy', startCy + dy);
      showEllipseHandles(ellipse);
      updateAnchoredArrows(ellipse);
      updateOvalTextPosition(ellipse);
    }

    function onUp() {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      if (dragged) {
        ellipse.addEventListener('click', preventClick, { once: true });
      }
    }

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  });

  // Right-click on shape → show context menu
  ellipse.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (textInput) hideTextInput();
    selectElement(ellipse, 'ellipse');
    showContextMenu(e.clientX, e.clientY);
  });

  svg.appendChild(ellipse);
  return ellipse;
}