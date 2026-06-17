// ── Entry point: initialises SVG defs, toolbar, and top-level event listeners ──

import { svg, bgRect, INFO, defs, currentTool, selected, selectedType, setCurrentTool } from './state.js';
import { getPos, findOvalAt, ellipseAttrs, getEllipseEdgePoint } from './helpers.js';
import { deselect, updateLegend, hideContextMenu } from './select.js';
import { createOval, showTextInput, hideTextInput } from './oval.js';
import {
  createArrow, cancelArrowPlacement,
  updateArrowPreview, showArrowStartDot,
  getArrowStart, getArrowStartAnchor,
  setArrowStart, setArrowStartAnchor
} from './arrow.js';

// ── SVG defs: arrowhead markers ────────────────────

// Arrowhead marker for placed arrows (blue default)
const markerArrow = document.createElementNS('http://www.w3.org/2000/svg', 'marker');
markerArrow.setAttribute('id', 'arrowhead');
markerArrow.setAttribute('markerWidth', '12');
markerArrow.setAttribute('markerHeight', '8');
markerArrow.setAttribute('refX', '12');
markerArrow.setAttribute('refY', '4');
markerArrow.setAttribute('orient', 'auto');
const polyArrow = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
polyArrow.setAttribute('points', '0 0, 12 4, 0 8');
polyArrow.setAttribute('fill', '#3b82f6');
markerArrow.appendChild(polyArrow);
defs.appendChild(markerArrow);

// Preview arrowhead (translucent)
const markerPrev = document.createElementNS('http://www.w3.org/2000/svg', 'marker');
markerPrev.setAttribute('id', 'prev-arrowhead');
markerPrev.setAttribute('markerWidth', '12');
markerPrev.setAttribute('markerHeight', '8');
markerPrev.setAttribute('refX', '12');
markerPrev.setAttribute('refY', '4');
markerPrev.setAttribute('orient', 'auto');
const polyPrev = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
polyPrev.setAttribute('points', '0 0, 12 4, 0 8');
polyPrev.setAttribute('fill', 'rgba(59,130,246,0.4)');
markerPrev.appendChild(polyPrev);
defs.appendChild(markerPrev);

svg.insertBefore(defs, svg.firstChild);

// ── Toolbar ────────────────────────────────────────────
const toolbar = document.getElementById('toolbar');
const toolBtns = toolbar.querySelectorAll('.tool-btn');

toolBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    // Cancel any in-progress arrow placement
    cancelArrowPlacement();

    toolBtns.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    setCurrentTool(btn.getAttribute('data-tool'));

    deselect();

    switch (currentTool) {
      case 'select':
        INFO.textContent = 'Click an element to select it';
        break;
      case 'oval':
        INFO.textContent = 'Click the canvas to place an oval';
        break;
      case 'arrow':
        INFO.textContent = 'Click to set the arrow start point';
        break;
    }
  });
});

// ── SVG background click ─────────────────────────────────────

svg.addEventListener('click', (e) => {
  const pos = getPos(e);

  // For 'select' and 'oval', only handle background clicks
  // For 'arrow', allow clicks on any element (ovals, etc.)
  if (currentTool !== 'arrow') {
    if (e.target !== svg && e.target !== bgRect) return;
  }

  switch (currentTool) {
    case 'select':
      // Just deselect — clicking the background clears selection
      deselect();
      break;

    case 'oval':
      deselect();
      createOval(pos.x, pos.y);
      updateLegend();
      break;

    case 'arrow': {
      const arrowStart = getArrowStart();
      if (!arrowStart) {
        // First click: detect if on an oval
        const ovalAtStart = findOvalAt(pos);
        setArrowStart(pos);
        setArrowStartAnchor(ovalAtStart || null);
        showArrowStartDot(pos);
        INFO.textContent = 'Click again to place the arrow end point';
      } else {
        // Second click: detect if on an oval, compute edge points
        const arrowStartAnchor = getArrowStartAnchor();
        const endAnchor = findOvalAt(pos);

        // Compute actual start position (may be on oval edge)
        let sx = arrowStart.x, sy = arrowStart.y;
        if (arrowStartAnchor) {
          const { cx, cy, rx, ry } = ellipseAttrs(arrowStartAnchor);
          // Reference: toward the end click position
          const ref = endAnchor ? getEllipseEdgePoint(...Object.values(ellipseAttrs(endAnchor)), pos.x, pos.y) : pos;
          const edge = getEllipseEdgePoint(cx, cy, rx, ry, ref.x, ref.y);
          sx = edge.x; sy = edge.y;
        }

        // Compute actual end position (may be on oval edge)
        let ex = pos.x, ey = pos.y;
        if (endAnchor) {
          const { cx, cy, rx, ry } = ellipseAttrs(endAnchor);
          const edge = getEllipseEdgePoint(cx, cy, rx, ry, sx, sy);
          ex = edge.x; ey = edge.y;
        }

        createArrow(sx, sy, ex, ey, arrowStartAnchor, endAnchor);
        cancelArrowPlacement();
        updateLegend();
        INFO.textContent = 'Click to set the arrow start point';
      }
      break;
    }
  }
});

// ── Mouse move preview for arrow ────────────────────────

svg.addEventListener('mousemove', (e) => {
  if (currentTool !== 'arrow' || !getArrowStart()) return;
  // Ignore if hovering over a handle
  if (e.target.classList.contains('resize-handle')) return;

  const pos = getPos(e);
  updateArrowPreview(pos);
});

// ── Keyboard shortcut ───────────────────────────────────

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    hideContextMenu();
    cancelArrowPlacement();
    hideTextInput();
  }

  // Enter on a selected oval → start text editing (any tool)
  if (e.key === 'Enter' && selected && selectedType === 'ellipse') {
    e.preventDefault();
    showTextInput(selected);
  }
});

// ── Context menu: hide on any outside click ────────────

document.addEventListener('click', (e) => {
  const ctxMenu = document.getElementById('ctx-menu');
  if (ctxMenu && ctxMenu.contains(e.target)) return;
  hideContextMenu();
});

document.addEventListener('contextmenu', (e) => {
  const ctxMenu = document.getElementById('ctx-menu');
  if (ctxMenu && ctxMenu.contains(e.target)) return;
  hideContextMenu();
});