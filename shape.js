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

  const { cx, cy, rx, ry } = ellipseAttrs(ellipse);

  // Get the SVG's on-screen position for the shape center
  const pt = svg.createSVGPoint();
  pt.x = cx;
  pt.y = cy;
  const screenPt = pt.matrixTransform(svg.getScreenCTM());

  // Estimate a reasonable textarea size based on shape size
  const screenRx = Math.abs(ellipse.getScreenCTM().a) * rx;
  const screenRy = Math.abs(ellipse.getScreenCTM().d) * ry;

  const textarea = document.createElement('textarea');
  textarea.value = ellipse._text || '';
  textarea.placeholder = 'Type text...';
  textarea.rows = 3;
  textarea.wrap = 'soft';

  // Position it centered over the shape's screen position
  const inputX = screenPt.x;
  const inputY = screenPt.y;

  textarea.style.position = 'fixed';
  textarea.style.left = inputX + 'px';
  textarea.style.top = inputY + 'px';
  textarea.style.transform = 'translate(-50%, -50%)';
  textarea.style.zIndex = '2000';
  textarea.style.background = 'rgba(15, 23, 42, 0.95)';
  textarea.style.border = '2px solid #fbbf24';
  textarea.style.borderRadius = '8px';
  textarea.style.padding = '8px 14px';
  textarea.style.color = '#ffffff';
  textarea.style.fontSize = '16px';
  textarea.style.fontFamily = 'sans-serif';
  textarea.style.outline = 'none';
  textarea.style.textAlign = 'center';
  textarea.style.resize = 'none';
  textarea.style.overflow = 'hidden';
  textarea.style.minWidth = '140px';
  textarea.style.minHeight = '60px';
  textarea.style.width = Math.max(140, screenRx * 1.6) + 'px';
  textarea.style.boxShadow = '0 8px 32px rgba(0,0,0,0.6)';

  // Auto-resize as user types
  function autoResize() {
    textarea.style.height = 'auto';
    textarea.style.height = textarea.scrollHeight + 'px';
  }

  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();

  function commit() {
    // Guard: only commit if this textarea is still active
    if (textInput !== textarea) return;
    const val = textarea.value.trim();
    if (val) {
      setOvalText(ellipse, val);
    } else if (ellipse._text) {
      // Clear existing text
      setOvalText(ellipse, '');
    }
    hideTextInput();
  }

  textarea.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      commit();
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      hideTextInput();
    }
  });

  textarea.addEventListener('input', autoResize);
  textarea.addEventListener('blur', commit);

  // Initial resize to fit content
  requestAnimationFrame(autoResize);

  textInput = textarea;
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