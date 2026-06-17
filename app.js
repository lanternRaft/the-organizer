// ── Entry point: initialises SVG defs, toolbar, and top-level event listeners ──

import { svg, bgRect, INFO, defs, currentTool, selected, selectedType, selectedSet, selectedTypes, setCurrentTool, shapeMode, setShapeMode } from './state.js';
import { getPos, findOvalAt, findAnchorNear, getAnchorPoints, ellipseAttrs, getEllipseEdgePoint, setOvalText, updateArrowPath, updateArrowMarker, removeOvalText, showAnchors, hideAnchors, updateAnchors, wasMultiDragged, wasDragHappened } from './helpers.js';
import { deselect, selectElement, updateLegend, hideContextMenu, wasSelBoxDragged } from './select.js';
import { createShape, showTextInput, hideTextInput } from './shape.js';
import {
  createArrow, cancelArrowPlacement,
  updateArrowPreview, showArrowStartDot,
  getArrowStart, getArrowStartAnchor, getArrowStartLabel,
  setArrowStart, setArrowStartAnchor, setArrowStartLabel
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

const shapeDropdown = document.getElementById('shape-dropdown');
const shapeLabel = document.getElementById('shape-label');
const shapeOptions = shapeDropdown.querySelectorAll('.shape-option');
const shapeToolWrap = document.getElementById('shape-tool-wrap');

function updateShapeLabel() {
  shapeLabel.textContent = shapeMode === 'circle' ? 'Circle' : 'Oval';
  shapeOptions.forEach(opt => {
    opt.classList.toggle('active-mode', opt.getAttribute('data-mode') === shapeMode);
  });
}
updateShapeLabel();

function hideShapeDropdown() {
  shapeDropdown.classList.remove('show');
}

function switchToSelectTool() {
  toolBtns.forEach(b => b.classList.remove('active'));
  document.querySelector('[data-tool="select"]').classList.add('active');
  setCurrentTool('select');
  hideShapeDropdown();
  hideAnchors();
  INFO.textContent = 'Click an element to select it';
}

function showShapeDropdown() {
  shapeDropdown.classList.add('show');
}

toolBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    // Cancel any in-progress arrow placement
    cancelArrowPlacement();

    const tool = btn.getAttribute('data-tool');

    // Shape tool: show dropdown instead of immediately activating
    if (tool === 'shape') {
      const wasActive = btn.classList.contains('active');

      // If shape was already active, just toggle the dropdown
      if (wasActive) {
        shapeDropdown.classList.toggle('show');
        return;
      }

      toolBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      setCurrentTool('shape');

      deselect();
      showShapeDropdown();
      return;
    }

    // For non-shape tools, hide dropdown and proceed normally
    hideShapeDropdown();

    toolBtns.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    setCurrentTool(tool);

    deselect();

    switch (currentTool) {
      case 'select':
        hideAnchors();
        INFO.textContent = 'Click an element to select it';
        break;
      case 'shape':
        hideAnchors();
        INFO.textContent = 'Click the canvas to place an oval';
        break;
      case 'arrow':
        showAnchors();
        INFO.textContent = 'Click to set the arrow start point';
        break;
    }
  });
});

// ── Shape option clicks ─────────────────────────────────

shapeOptions.forEach(opt => {
  opt.addEventListener('click', (e) => {
    e.stopPropagation();
    const mode = opt.getAttribute('data-mode');
    setShapeMode(mode);
    updateShapeLabel();
    hideShapeDropdown();

    // Update the info text
    if (currentTool === 'shape') {
      INFO.textContent = mode === 'circle'
        ? 'Click the canvas to place a circle'
        : 'Click the canvas to place an oval';
    }
  });
});

// ── Hide dropdown on outside click ──────────────────────

document.addEventListener('click', (e) => {
  if (shapeToolWrap && shapeToolWrap.contains(e.target)) return;
  hideShapeDropdown();
});

document.addEventListener('contextmenu', (e) => {
  if (shapeToolWrap && shapeToolWrap.contains(e.target)) return;
  hideShapeDropdown();
});

// ── SVG background click ─────────────────────────────────────

svg.addEventListener('click', (e) => {
  const pos = getPos(e);

  // For 'select' and 'shape', only handle background clicks
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
      // If a multi-drag just happened, skip (keeps selection)
      if (wasMultiDragged()) {
        break;
      }
      // If any drag just happened, skip (keeps selection)
      if (wasDragHappened()) {
        break;
      }
      // Just deselect — clicking the background clears selection
      deselect();
      break;

    case 'shape':
      deselect();
      createShape(pos.x, pos.y);
      updateLegend();
      switchToSelectTool();
      break;

    case 'arrow': {
      const arrowStart = getArrowStart();
      if (!arrowStart) {
        // First click: snap to nearest anchor within 15px
        const snappedStart = findAnchorNear(pos);
        const ovalAtStart = snappedStart ? snappedStart.ellipse : null;
        const startPos = snappedStart ? snappedStart.anchorPos : pos;
        setArrowStart(startPos);
        setArrowStartAnchor(ovalAtStart || null);
        setArrowStartLabel(ovalAtStart ? snappedStart.anchorLabel : null);
        showArrowStartDot(startPos);
        INFO.textContent = 'Click again to place the arrow end point';
      } else {
        // Second click: snap to nearest anchor within 15px
        const arrowStartAnchor = getArrowStartAnchor();
        const arrowStartLabel = getArrowStartLabel();
        const snappedEnd = findAnchorNear(pos);
        const endAnchor = snappedEnd ? snappedEnd.ellipse : null;
        const endAnchorLabel = snappedEnd ? snappedEnd.anchorLabel : null;
        const snappedEndPos = snappedEnd ? snappedEnd.anchorPos : pos;

        // Compute actual start position (on oval edge at the stored cardinal anchor)
        let sx = arrowStart.x, sy = arrowStart.y;
        if (arrowStartAnchor && arrowStartLabel) {
          const { cx, cy, rx, ry } = ellipseAttrs(arrowStartAnchor);
          const anchors = getAnchorPoints(cx, cy, rx, ry);
          sx = anchors[arrowStartLabel].x;
          sy = anchors[arrowStartLabel].y;
        }

        // Compute actual end position (on oval edge at the cardinal anchor)
        let ex = snappedEndPos.x, ey = snappedEndPos.y;
        if (endAnchor && endAnchorLabel) {
          // Already snapped to the anchor position, just use it
          ex = snappedEndPos.x;
          ey = snappedEndPos.y;
        }

        createArrow(sx, sy, ex, ey, arrowStartAnchor, endAnchor, arrowStartLabel, endAnchorLabel);
        cancelArrowPlacement();
        updateLegend();
        switchToSelectTool();
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
  // Snap preview end to nearest anchor within 15px
  const snapped = findAnchorNear(pos);
  const previewPos = snapped ? snapped.anchorPos : pos;
  updateArrowPreview(previewPos);
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
      const el = createShape(data.cx + offset, data.cy + offset);
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