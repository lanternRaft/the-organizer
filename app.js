// ── Entry point: initialises SVG defs, toolbar, and top-level event listeners ──

import { svg, INFO, defs, currentTool, selected, selectedType, selectedSet, selectedTypes, selMenu, colorPalette, setCurrentTool, shapeMode, setShapeMode, notifyCanvasChanged, onCanvasChange } from './state.js';
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

  // Get the SVG's current rendered dimensions
  const rect = svg.getBoundingClientRect();
  const width = Math.round(rect.width);
  const height = Math.round(rect.height);

  // ── Prepare a standalone SVG for export ─────────────────
  const exportSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  exportSvg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  exportSvg.setAttribute('width', width);
  exportSvg.setAttribute('height', height);
  exportSvg.setAttribute('viewBox', `0 0 ${width} ${height}`);

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
  bgRect.setAttribute('width', '100%');
  bgRect.setAttribute('height', '100%');
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
    gridRect.setAttribute('width', '100%');
    gridRect.setAttribute('height', '100%');
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
      canvas.width = width * 2;  // 2x for retina-quality export
      canvas.height = height * 2;
      const ctx = canvas.getContext('2d');
      ctx.scale(2, 2);
      ctx.drawImage(img, 0, 0, width, height);

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
