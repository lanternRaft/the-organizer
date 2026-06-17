// ── Entry point: initialises SVG defs, toolbar, and top-level event listeners ──

import { svg, bgRect, INFO, defs, currentTool, selected, selectedType, selectedSet, selectedTypes, setCurrentTool } from './state.js';
import { getPos, findOvalAt, ellipseAttrs, getEllipseEdgePoint, setOvalText, updateArrowPath, updateArrowMarker, removeOvalText } from './helpers.js';
import { deselect, selectElement, updateLegend, hideContextMenu, wasSelBoxDragged } from './select.js';
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
      // If a selection box drag just happened, skip (handled by mouseup)
      if (wasSelBoxDragged()) {
        break;
      }
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

// ── Clipboard (in-memory) ────────────────────────────────

let _clipboard = [];

function copyToClipboard() {
  _clipboard = [];
  for (const el of selectedSet) {
    const type = selectedTypes.get(el);
    if (type === 'ellipse') {
      _clipboard.push({
        type: 'ellipse',
        cx: parseFloat(el.getAttribute('cx')),
        cy: parseFloat(el.getAttribute('cy')),
        rx: parseFloat(el.getAttribute('rx')),
        ry: parseFloat(el.getAttribute('ry')),
        fill: el.getAttribute('fill'),
        text: el._text || null,
      });
    } else if (type === 'arrow') {
      _clipboard.push({
        type: 'arrow',
        x1: el._x1,
        y1: el._y1,
        x2: el._x2,
        y2: el._y2,
        offset: el._offset || 0,
        color: el._visPath.getAttribute('stroke'),
      });
    }
  }
}

function pasteFromClipboard() {
  if (_clipboard.length === 0) return;
  const offset = 20;
  const newElements = [];

  for (const data of _clipboard) {
    if (data.type === 'ellipse') {
      const el = createOval(data.cx + offset, data.cy + offset);
      el.setAttribute('rx', data.rx);
      el.setAttribute('ry', data.ry);
      el.setAttribute('fill', data.fill || '#3b82f6');
      if (data.text) {
        setOvalText(el, data.text);
      }
      newElements.push(el);
    } else if (data.type === 'arrow') {
      const el = createArrow(
        data.x1 + offset, data.y1 + offset,
        data.x2 + offset, data.y2 + offset,
        null, null
      );
      el._offset = data.offset || 0;
      if (data.offset) {
        updateArrowPath(el);
      }
      if (data.color) {
        el._visPath.setAttribute('stroke', data.color);
        el._visPath.setAttribute('data-original-color', data.color);
        updateArrowMarker(el._visPath, data.color);
      }
      newElements.push(el);
    }
  }

  // Select all pasted elements
  deselect();
  for (const el of newElements) {
    const type = el.tagName === 'ellipse' ? 'ellipse' : 'arrow';
    selectElement(el, type, true);
  }

  updateLegend();
}

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

  // Ctrl+C / Cmd+C: copy selected
  if ((e.ctrlKey || e.metaKey) && e.key === 'c') {
    if (selectedSet.size > 0) {
      e.preventDefault();
      copyToClipboard();
      INFO.textContent = `Copied ${selectedSet.size} element${selectedSet.size > 1 ? 's' : ''}`;
    }
    return;
  }

  // Ctrl+V / Cmd+V: paste
  if ((e.ctrlKey || e.metaKey) && e.key === 'v') {
    if (_clipboard.length > 0) {
      e.preventDefault();
      pasteFromClipboard();
      INFO.textContent = `Pasted ${_clipboard.length} element${_clipboard.length > 1 ? 's' : ''}`;
    }
    return;
  }

  // Ctrl+A / Cmd+A: select all
  if ((e.ctrlKey || e.metaKey) && e.key === 'a') {
    e.preventDefault();
    const all = svg.querySelectorAll('ellipse, g');
    if (all.length === 0) return;
    deselect();
    for (const el of all) {
      const type = el.tagName === 'ellipse' ? 'ellipse' : 'arrow';
      selectElement(el, type, true);
    }
    INFO.textContent = `Selected ${selectedSet.size} elements`;
    return;
  }

  // Delete / Backspace: delete selected elements
  if ((e.key === 'Delete' || e.key === 'Backspace') && selectedSet.size > 0) {
    // Only in select tool, not when editing text
    if (currentTool !== 'select') return;
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    if (e.target.isContentEditable) return;

    e.preventDefault();
    const affected = [...selectedSet];
    deselect();
    for (const el of affected) {
      const elType = selectedTypes.get(el);
      if (elType === 'ellipse') {
        removeOvalText(el);
        const arrows = svg.querySelectorAll('g');
        arrows.forEach((group) => {
          if (group._anchors) {
            group._anchors = group._anchors.filter(a => a.ellipse !== el);
          }
        });
      }
      el.remove();
    }
    updateLegend();
    INFO.textContent = `Deleted ${affected.length} element${affected.length > 1 ? 's' : ''}`;
    return;
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