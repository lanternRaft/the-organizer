// ── Entry point: initialises SVG defs, toolbar, and top-level event listeners ──

import { svg, INFO, defs, currentTool, selected, selectedType, selectedSet, selectedTypes, selMenu, colorPalette, setCurrentTool, shapeMode, setShapeMode, notifyCanvasChanged, onCanvasChange, initCanvasSize, viewBox, setViewBox, resetViewBox, canvasWidth, canvasHeight, getZoomLevel } from './state.js';
import { getPos, findOvalAt, findAnchorNear, getAnchorPoints, ellipseAttrs, getEllipseEdgePoint, setOvalText, updateArrowPath, updateArrowMarker, removeOvalText, showAnchors, hideAnchors, updateAnchors, wasMultiDragged, wasDragHappened, darkenColor, lightenColor, showAnchorsForEllipse, hideAnchorsForEllipse, unhighlightAllAnchors, highlightAnchorDot, snapToGrid } from './helpers.js';
import { deselect, selectElement, updateLegend, hideContextMenu, wasSelBoxDragged } from './select.js';
import { createShape, showTextInput, hideTextInput } from './shape.js';
import { createNode, NODE_RADIUS } from './node.js';
import {
  createArrow, cancelArrowPlacement, isArrowDragActive,
  startArrowDrag, updateArrowDragPreview, finishArrowDrag
} from './arrow.js';
import { saveToLocalStorage, loadFromLocalStorage, clearAndSave } from './storage.js';

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
  INFO.textContent = 'Click an element to select it';
}

function showShapeDropdown() {
  shapeDropdown.classList.add('show');
}

toolBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    // Cancel any in-progress arrow drag
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
        INFO.textContent = 'Click an element to select it';
        break;
      case 'shape':
        INFO.textContent = 'Click the canvas to place an oval';
        break;
      case 'node':
        INFO.textContent = 'Click the canvas to place a node';
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

  // Only handle background clicks
  if (e.target !== svg) return;

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
      createShape(snapToGrid(pos.x), snapToGrid(pos.y));
      updateLegend();
      switchToSelectTool();
      break;

    case 'node':
      deselect();
      createNode(snapToGrid(pos.x), snapToGrid(pos.y));
      updateLegend();
      switchToSelectTool();
      break;
  }
});

// ── Anchor hover detection (show anchors on nearby shapes) ──

let _lastHoveredEllipse = null;
const ANCHOR_HOVER_RADIUS = 20;

svg.addEventListener('mousemove', (e) => {
  // If an arrow drag is active, update the preview and skip hover
  if (isArrowDragActive()) {
    const pos = getPos(e);
    updateArrowDragPreview(pos);
    return;
  }

  // Only show anchor hover in select mode
  if (currentTool !== 'select') {
    // Hide anchors for previously hovered ellipse
    if (_lastHoveredEllipse) {
      hideAnchorsForEllipse(_lastHoveredEllipse);
      _lastHoveredEllipse = null;
    }
    return;
  }

  const pos = getPos(e);

  // Check if we're near any anchor point
  const near = findAnchorNear(pos, ANCHOR_HOVER_RADIUS);
  if (near && near.ellipse && near.ellipse.parentNode) {
    // Show anchors for the ellipse we're near
    if (_lastHoveredEllipse && _lastHoveredEllipse !== near.ellipse) {
      hideAnchorsForEllipse(_lastHoveredEllipse);
    }
    showAnchorsForEllipse(near.ellipse);
    _lastHoveredEllipse = near.ellipse;

    // Highlight the specific anchor we're hovering
    unhighlightAllAnchors();
    highlightAnchorDot(near.ellipse, near.anchorLabel);
  } else {
    // Not near any anchor — hide the previously shown anchors
    if (_lastHoveredEllipse) {
      hideAnchorsForEllipse(_lastHoveredEllipse);
      _lastHoveredEllipse = null;
      unhighlightAllAnchors();
    }
  }

  // If hovering over an anchor dot, set cursor to grab
  if (e.target.classList.contains('anchor-point')) {
    e.target.style.cursor = 'grab';
  }
});

// ── Arrow drag from anchor: intercept mousedown on anchor dots ──

svg.addEventListener('mousedown', (e) => {
  // Only in select mode
  if (currentTool !== 'select') return;
  if (e.button !== 0) return;

  // Check if the mousedown is on an anchor dot
  const target = e.target;
  if (target.classList.contains('anchor-point')) {
    e.stopPropagation();
    e.preventDefault();

    const ellipse = target._anchorEllipse;
    const label = target._anchorLabel;
    if (!ellipse || !ellipse.parentNode) return;

    // Get the anchor position
    const { cx, cy, rx, ry } = ellipseAttrs(ellipse);
    const anchors = getAnchorPoints(cx, cy, rx, ry);
    const anchorPos = anchors[label];
    if (!anchorPos) return;

    // Start the arrow drag
    startArrowDrag(ellipse, label, anchorPos);

    // If the mouse moves, we track it with the document mousemove handler
    // If the mouse is released immediately (click on anchor without drag),
    // we still treat it as a drag start — the mouseup handler will decide.

    let dragged = false;

    function onMove(me) {
      dragged = true;
      const p = getPos(me);
      updateArrowDragPreview(p);
    }

    function onUp(me) {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);

      if (dragged) {
        // Dragged — finish the arrow creation
        finishArrowDrag();
      } else {
        // Clicked without dragging — cancel
        cancelArrowPlacement();
        INFO.textContent = 'Click and drag from an anchor to create an arrow';
      }
    }

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    return;
  }
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
    } else if (type === 'node') {
      _clipboard.push({
        type: 'node',
        cx: parseFloat(el.getAttribute('cx')),
        cy: parseFloat(el.getAttribute('cy')),
        fill: el.getAttribute('fill'),
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
      const el = createShape(snapToGrid(data.cx + offset), snapToGrid(data.cy + offset));
      el.setAttribute('rx', data.rx);
      el.setAttribute('ry', data.ry);
      el.setAttribute('fill', data.fill || '#3b82f6');
      el.setAttribute('stroke', darkenColor(data.fill || '#3b82f6', 40));
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
      if (data.offset !== undefined) {
        el._offset = data.offset;
        updateArrowPath(el);
      }
      if (data.color) {
        el._visPath.setAttribute('stroke', data.color);
        el._visPath.setAttribute('data-original-color', data.color);
        updateArrowMarker(el._visPath, data.color);
      }
      newElements.push(el);
    } else if (data.type === 'node') {
      const el = createNode(snapToGrid(data.cx + offset), snapToGrid(data.cy + offset));
      if (data.fill) {
        el.setAttribute('fill', data.fill);
        el.setAttribute('stroke', darkenColor(data.fill, 40));
      }
      newElements.push(el);
    }
  }

  // Select all pasted elements
  deselect();
  for (const el of newElements) {
    const type = el.tagName === 'ellipse'
      ? (parseFloat(el.getAttribute('rx')) <= NODE_RADIUS + 2 ? 'node' : 'ellipse')
      : 'arrow';
    selectElement(el, type, true);
  }

  updateLegend();
  notifyCanvasChanged();
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
      const type = el.tagName === 'ellipse'
        ? (parseFloat(el.getAttribute('rx')) <= NODE_RADIUS + 2 ? 'node' : 'ellipse')
        : 'arrow';
      selectElement(el, type, true);
    }
    INFO.textContent = `Selected ${selectedSet.size} elements`;
    return;
  }

  // Ctrl+= / Cmd+=: zoom in
  if ((e.ctrlKey || e.metaKey) && (e.key === '=' || e.key === '+')) {
    e.preventDefault();
    zoomByFactor(ZOOM_STEP);
    return;
  }

  // Ctrl+- / Cmd+-: zoom out
  if ((e.ctrlKey || e.metaKey) && e.key === '-') {
    e.preventDefault();
    zoomByFactor(1 / ZOOM_STEP);
    return;
  }

  // Ctrl+0 / Cmd+0: reset zoom
  if ((e.ctrlKey || e.metaKey) && e.key === '0') {
    e.preventDefault();
    resetViewBox();
    INFO.textContent = 'Zoom: 100%';
    return;
  }

  // Delete / Backspace: delete selected elements
  if ((e.key === 'Delete' || e.key === 'Backspace') && selectedSet.size > 0) {
    // Only in select tool, not when editing text
    if (currentTool !== 'select') return;
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    if (e.target.isContentEditable) return;

    e.preventDefault();
    const affected = [...selectedSet].map(el => ({ el, elType: selectedTypes.get(el) }));
    deselect();
    for (const { el, elType } of affected) {
      if (elType === 'ellipse') {
        removeOvalText(el);
        const arrows = svg.querySelectorAll('g');
        arrows.forEach((group) => {
          if (group._anchors) {
            group._anchors = group._anchors.filter(a => a.ellipse !== el);
          }
        });
      } else if (elType === 'node') {
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
    notifyCanvasChanged();
    INFO.textContent = `Deleted ${affected.length} element${affected.length > 1 ? 's' : ''}`;
    return;
  }
});

// ── Selection menu: close on outside click & contextmenu ──

document.addEventListener('click', (e) => {
  if (selMenu && selMenu.contains(e.target)) return;
  hideContextMenu();
});

document.addEventListener('contextmenu', (e) => {
  hideContextMenu();
});

// ── Grid toggle ──────────────────────────────────────────

const gridToggle = document.getElementById('grid-toggle');

function applyGrid(enabled) {
  document.body.classList.toggle('grid-enabled', enabled);
  localStorage.setItem('grid', enabled ? 'on' : 'off');
}

// Restore grid state on load
const savedGrid = localStorage.getItem('grid');
if (savedGrid === 'on') {
  applyGrid(true);
}

gridToggle.addEventListener('click', () => {
  const enabled = !document.body.classList.contains('grid-enabled');
  applyGrid(enabled);
});

// ── Theme toggle (dark / light) ───────────────────────────

const themeToggle = document.getElementById('theme-toggle');

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('theme', theme);
}

themeToggle.addEventListener('click', () => {
  const current = document.documentElement.getAttribute('data-theme') || 'dark';
  const next = current === 'dark' ? 'light' : 'dark';
  applyTheme(next);
});

// ── Auto-save setup + restore ─────────────────────────────

onCanvasChange(() => saveToLocalStorage());
loadFromLocalStorage();

// ── Hamburger menu ──────────────────────────────────────

const menuBtn = document.getElementById('menu-btn');
const menuDropdown = document.getElementById('menu-dropdown');

menuBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  menuDropdown.classList.toggle('show');
});

// Close menu on outside click
document.addEventListener('click', (e) => {
  if (menuDropdown && menuDropdown.contains(e.target)) return;
  if (menuBtn && menuBtn.contains(e.target)) return;
  menuDropdown.classList.remove('show');
});

document.addEventListener('contextmenu', () => {
  menuDropdown.classList.remove('show');
});

// ── Clear button / confirmation dialog ────────────────────

const overlay = document.getElementById('confirm-overlay');
const dialog = document.getElementById('confirm-dialog');
const clearBtn = document.getElementById('menu-clear-btn');
const cancelBtn = document.getElementById('confirm-cancel');
const okBtn = document.getElementById('confirm-ok');

function showConfirmDialog() {
  overlay.classList.add('show');
}

function hideConfirmDialog() {
  overlay.classList.remove('show');
}

clearBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  menuDropdown.classList.remove('show');
  showConfirmDialog();
});

cancelBtn.addEventListener('click', () => {
  hideConfirmDialog();
});

okBtn.addEventListener('click', () => {
  clearAndSave();
  hideConfirmDialog();
  INFO.textContent = 'Canvas cleared';
});

// Close overlay on backdrop click
overlay.addEventListener('click', (e) => {
  if (e.target === overlay) {
    hideConfirmDialog();
  }
});

// Close overlay on Escape
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && overlay.classList.contains('show')) {
    hideConfirmDialog();
  }
});

// ── Export to PNG ─────────────────────────────────────────

const exportPngBtn = document.getElementById('menu-export-png-btn');

function exportToPNG() {
  // Close the menu
  menuDropdown.classList.remove('show');

  // ── Compute bounding box of all visible objects ─────────
  // This ensures all canvas content is framed in the export,
  // regardless of the user's current pan/zoom viewport.
  let minX = Infinity, minY = Infinity;
  let maxX = -Infinity, maxY = -Infinity;
  let hasObjects = false;

  const children = svg.children;
  for (let i = 0; i < children.length; i++) {
    const child = children[i];

    // Skip defs and anchor dots
    if (child.tagName === 'defs') continue;
    if (child.classList && child.classList.contains('anchor-point')) continue;

    if (child.tagName === 'ellipse') {
      // Shapes and nodes
      const cx = parseFloat(child.getAttribute('cx'));
      const cy = parseFloat(child.getAttribute('cy'));
      const rx = parseFloat(child.getAttribute('rx'));
      const ry = parseFloat(child.getAttribute('ry'));
      if (!isNaN(cx) && !isNaN(cy) && !isNaN(rx) && !isNaN(ry)) {
        minX = Math.min(minX, cx - rx);
        maxX = Math.max(maxX, cx + rx);
        minY = Math.min(minY, cy - ry);
        maxY = Math.max(maxY, cy + ry);
        hasObjects = true;
      }
    } else if (child.tagName === 'g') {
      // Arrow groups — use waypoints if available, else legacy endpoints
      if (child._points && child._points.length > 0) {
        for (const pt of child._points) {
          minX = Math.min(minX, pt.x);
          maxX = Math.max(maxX, pt.x);
          minY = Math.min(minY, pt.y);
          maxY = Math.max(maxY, pt.y);
          hasObjects = true;
        }
      } else if (child._x1 !== undefined && child._y1 !== undefined) {
        minX = Math.min(minX, child._x1, child._x2);
        maxX = Math.max(maxX, child._x1, child._x2);
        minY = Math.min(minY, child._y1, child._y2);
        maxY = Math.max(maxY, child._y1, child._y2);
        hasObjects = true;
      }
    } else if (child.tagName === 'text') {
      // Label text elements (always inside their parent shape, but include for safety)
      const x = parseFloat(child.getAttribute('x'));
      const y = parseFloat(child.getAttribute('y'));
      if (!isNaN(x) && !isNaN(y)) {
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
        hasObjects = true;
      }
    }
  }

  // ── Fallback: if no objects, use viewport dimensions ────
  let viewX, viewY, viewW, viewH;
  let exportWidth, exportHeight;

  if (!hasObjects) {
    const rect = svg.getBoundingClientRect();
    exportWidth = Math.round(rect.width);
    exportHeight = Math.round(rect.height);
    viewX = 0;
    viewY = 0;
    viewW = exportWidth;
    viewH = exportHeight;
  } else {
    // Add 40px padding on all sides
    const PADDING = 40;
    viewX = minX - PADDING;
    viewY = minY - PADDING;
    viewW = (maxX - minX) + PADDING * 2;
    viewH = (maxY - minY) + PADDING * 2;
    exportWidth = Math.round(viewW);
    exportHeight = Math.round(viewH);
  }

  // ── Prepare a standalone SVG for export ─────────────────
  const exportSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  exportSvg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  exportSvg.setAttribute('width', exportWidth);
  exportSvg.setAttribute('height', exportHeight);
  exportSvg.setAttribute('viewBox', `${viewX} ${viewY} ${viewW} ${viewH}`);

  // Include CSS styles inline so the exported SVG renders standalone
  const styleText = `
    text { font-family: sans-serif; user-select: none; }
    .anchor-point { display: none; }
  `;
  const styleEl = document.createElementNS('http://www.w3.org/2000/svg', 'style');
  styleEl.textContent = styleText;
  exportSvg.appendChild(styleEl);

  // Background rect matching the current theme's background color
  const bodyBg = getComputedStyle(document.body).backgroundColor;
  const bgRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  bgRect.setAttribute('x', viewX);
  bgRect.setAttribute('y', viewY);
  bgRect.setAttribute('width', viewW);
  bgRect.setAttribute('height', viewH);
  bgRect.setAttribute('fill', bodyBg);
  exportSvg.appendChild(bgRect);

  // ── Grid (if enabled) ───────────────────────────────────
  if (document.body.classList.contains('grid-enabled')) {
    const gridDefs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
    const pattern = document.createElementNS('http://www.w3.org/2000/svg', 'pattern');
    pattern.setAttribute('id', 'export-grid');
    pattern.setAttribute('width', '40');
    pattern.setAttribute('height', '40');
    pattern.setAttribute('patternUnits', 'userSpaceOnUse');
    const gridLine = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    gridLine.setAttribute('d', 'M 40 0 L 0 0 0 40');
    gridLine.setAttribute('fill', 'none');
    // Match the grid line color from CSS
    const isDark = document.documentElement.getAttribute('data-theme') !== 'light';
    gridLine.setAttribute('stroke', isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.07)');
    gridLine.setAttribute('stroke-width', '1');
    pattern.appendChild(gridLine);
    gridDefs.appendChild(pattern);
    exportSvg.appendChild(gridDefs);

    const gridRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    gridRect.setAttribute('x', viewX);
    gridRect.setAttribute('y', viewY);
    gridRect.setAttribute('width', viewW);
    gridRect.setAttribute('height', viewH);
    gridRect.setAttribute('fill', 'url(#export-grid)');
    exportSvg.appendChild(gridRect);
  }

  // ── Clone visible SVG children (skip defs / anchor dots) ──
  const originalChildren = svg.children;
  for (let i = 0; i < originalChildren.length; i++) {
    const child = originalChildren[i];
    if (child.tagName === 'defs') {
      // Clone defs and all its children (arrowhead markers)
      const defsClone = child.cloneNode(true);
      exportSvg.appendChild(defsClone);
      continue;
    }
    if (child.classList && child.classList.contains('anchor-point')) continue;

    const clone = child.cloneNode(true);
    // Remove any _ignoreNextClick property artifacts (they're JS props, not attributes)
    exportSvg.appendChild(clone);
  }

  // ── Serialize to string and create a Blob URL ────────────
  const serializer = new XMLSerializer();
  const svgString = serializer.serializeToString(exportSvg);
  const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(svgBlob);

  INFO.textContent = 'Rendering PNG…';

  // ── Render SVG onto a Canvas, then export as PNG ─────────
  const img = new Image();
  img.onload = () => {
    try {
      const canvas = document.createElement('canvas');
      canvas.width = exportWidth * 2;  // 2x for retina-quality export
      canvas.height = exportHeight * 2;
      const ctx = canvas.getContext('2d');
      ctx.scale(2, 2);
      ctx.drawImage(img, 0, 0, exportWidth, exportHeight);

      const pngDataUrl = canvas.toDataURL('image/png');

      // Trigger download
      const link = document.createElement('a');
      const now = new Date();
      const dateStr = now.toISOString().slice(0, 10);
      link.download = `the-organizer-${dateStr}.png`;
      link.href = pngDataUrl;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      INFO.textContent = 'PNG exported';
    } catch (e) {
      console.warn('PNG export failed:', e);
      INFO.textContent = 'PNG export failed';
    } finally {
      URL.revokeObjectURL(url);
    }
  };

  img.onerror = () => {
    URL.revokeObjectURL(url);
    INFO.textContent = 'PNG export failed — could not render SVG';
  };

  img.src = url;
}

exportPngBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  exportToPNG();
});

// ═══════════════════════════════════════════════════════════════
// ── Pan & Zoom ────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════

// ── Initialise canvas size & viewBox ───────────────────────────

function initZoomAndPan() {
  initCanvasSize();
}

// Call after the SVG is fully rendered (next tick)
requestAnimationFrame(() => initZoomAndPan());

// Also re-initialise on resize
let _resizeTimer;
window.addEventListener('resize', () => {
  clearTimeout(_resizeTimer);
  _resizeTimer = setTimeout(() => {
    // Only reset if at default zoom (no manual pan/zoom applied)
    // Otherwise just update the stored canvas dimensions
    const rect = svg.getBoundingClientRect();
    // Don't auto-reset viewBox on resize — user's viewport may have changed
    // but we want to keep their current pan/zoom. Just store new dims.
  }, 150);
});

// ── Zoom helper: zoom around a point ──────────────────────────

const MIN_ZOOM = 0.1;
const MAX_ZOOM = 20;
const ZOOM_STEP = 1.25; // multiplier per button click

/**
 * Zoom the canvas by a factor, centered on a given point.
 * @param {number} factor - >1 zooms in, <1 zooms out
 * @param {number} cx  - center x in viewBox coordinates (or NaN to use viewport center)
 * @param {number} cy  - center y in viewBox coordinates
 */
function zoomByFactor(factor, cx, cy) {
  if (!canvasWidth) return; // not yet initialized

  const newW = viewBox.width / factor;
  const newH = viewBox.height / factor;

  // Clamp zoom level
  if (newW < canvasWidth / MAX_ZOOM || newW > canvasWidth / MIN_ZOOM) return;

  // If center not provided, use viewport center
  if (typeof cx !== 'number' || !isFinite(cx)) {
    cx = viewBox.x + viewBox.width / 2;
    cy = viewBox.y + viewBox.height / 2;
  }

  const newX = cx - (cx - viewBox.x) / factor;
  const newY = cy - (cy - viewBox.y) / factor;

  setViewBox(newX, newY, newW, newH);
  INFO.textContent = `Zoom: ${Math.round(getZoomLevel() * 100)}%`;
}



// ── Scroll-wheel zoom ─────────────────────────────────────────

svg.addEventListener('wheel', (e) => {
  e.preventDefault();

  // Distinguish touchpad two-finger scroll from mouse wheel:
  // - Touchpad events: smooth scrolling, small delta values, often with non-zero deltaX
  // - Mouse wheel: notch-based, larger deltaY (~100-120), deltaX typically 0
  // - Pinch gesture: e.ctrlKey is set (macOS trackpad pinch → zoom)

  const isPinchZoom = e.ctrlKey || e.metaKey;
  const hasHorizontal = Math.abs(e.deltaX) > 2;
  const isSmooth = Math.abs(e.deltaY) < 10;

  if (isPinchZoom) {
    // Pinch gesture on trackpad → zoom centered on cursor
    const pos = getPos(e);
    const factor = 1 - e.deltaY * 0.005;
    if (factor <= 0) return;
    zoomByFactor(factor, pos.x, pos.y);
    return;
  }

  if (hasHorizontal || isSmooth) {
    // Touchpad two-finger scroll → pan
    if (canvasWidth) {
      const scale = viewBox.width / canvasWidth;
      setViewBox(
        viewBox.x + e.deltaX * scale,
        viewBox.y + e.deltaY * scale,
        viewBox.width,
        viewBox.height
      );
    }
    return;
  }

  // Mouse wheel → zoom centered on cursor
  const pos = getPos(e);
  const factor = 1 - e.deltaY * 0.001;
  if (factor <= 0) return;
  zoomByFactor(factor, pos.x, pos.y);
}, { passive: false });

// ── Pinch-to-zoom (touch) ─────────────────────────────────────

let _pinchState = null;

svg.addEventListener('touchstart', (e) => {
  if (e.touches.length === 2) {
    e.preventDefault();
    const t1 = e.touches[0];
    const t2 = e.touches[1];
    const dx = t1.clientX - t2.clientX;
    const dy = t1.clientY - t2.clientY;
    _pinchState = {
      dist: Math.sqrt(dx * dx + dy * dy),
      midX: (t1.clientX + t2.clientX) / 2,
      midY: (t1.clientY + t2.clientY) / 2,
      startViewBox: { x: viewBox.x, y: viewBox.y, w: viewBox.width, h: viewBox.height },
    };
  }
}, { passive: false });

svg.addEventListener('touchmove', (e) => {
  if (e.touches.length === 2 && _pinchState) {
    e.preventDefault();
    const t1 = e.touches[0];
    const t2 = e.touches[1];
    const dx = t1.clientX - t2.clientX;
    const dy = t1.clientY - t2.clientY;
    const dist = Math.sqrt(dx * dx + dy * dy);

    const factor = dist / _pinchState.dist;
    const newW = _pinchState.startViewBox.w / factor;
    const newH = _pinchState.startViewBox.h / factor;

    if (newW < canvasWidth / MAX_ZOOM || newW > canvasWidth / MIN_ZOOM) return;

    // Get the midpoint in current viewBox coordinates
    // Use the stored start positions to compute a stable zoom center
    const midPt = svg.createSVGPoint();
    midPt.x = _pinchState.midX;
    midPt.y = _pinchState.midY;
    const vbMid = midPt.matrixTransform(svg.getScreenCTM().inverse());

    const newX = vbMid.x - (vbMid.x - _pinchState.startViewBox.x) / factor;
    const newY = vbMid.y - (vbMid.y - _pinchState.startViewBox.y) / factor;

    setViewBox(newX, newY, newW, newH);
  }
}, { passive: false });

svg.addEventListener('touchend', (e) => {
  if (e.touches.length < 2) {
    _pinchState = null;
  }
});

// ── Middle-button pan ──────────────────────────────────────────

let _panning = false;
let _panStart = { x: 0, y: 0 };
let _panViewBox = { x: 0, y: 0 };

svg.addEventListener('mousedown', (e) => {
  if (e.button === 1) {
    e.preventDefault();
    e.stopPropagation();
    _panning = true;
    _panStart = { x: e.clientX, y: e.clientY };
    _panViewBox = { x: viewBox.x, y: viewBox.y };
    svg.style.cursor = 'grabbing';
  }
});

// Note: we must use document-level mousemove/mouseup so we don't lose
// the drag if the cursor leaves the SVG element.
document.addEventListener('mousemove', (e) => {
  if (!_panning || !canvasWidth) return;
  const scale = viewBox.width / canvasWidth;
  setViewBox(
    _panViewBox.x - (e.clientX - _panStart.x) * scale,
    _panViewBox.y - (e.clientY - _panStart.y) * scale,
    viewBox.width,
    viewBox.height
  );
});

document.addEventListener('mouseup', (e) => {
  if (e.button === 1 && _panning) {
    _panning = false;
    svg.style.cursor = '';
  }
});

// ── Zoom button click handlers ─────────────────────────────────

document.getElementById('zoom-in').addEventListener('click', () => {
  zoomByFactor(ZOOM_STEP);
});

document.getElementById('zoom-out').addEventListener('click', () => {
  zoomByFactor(1 / ZOOM_STEP);
});

document.getElementById('zoom-reset').addEventListener('click', () => {
  resetViewBox();
  INFO.textContent = 'Zoom: 100%';
});
