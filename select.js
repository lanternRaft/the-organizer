// ── Selection, handles, context menu, legend ──────────────

import {
  svg, bgRect, HANDLE_SIZE, handles, selected, selectedType,
  selectedSet, selectedTypes,
  INFO, ctxMenu, legendEl, legendColors, currentTool,
  setSelected, clearSelected
} from './state.js';

import {
  getPos, findOvalAt, ellipseAttrs, lineAttrs,
  getEllipseEdgePoint, getArrowMidpoint,
  setArrowAttrs, updateArrowPath, updateArrowMarker,
  updateOvalTextPosition, updateAnchoredArrows,
  preventClick
} from './helpers.js';

// ── Selection ────────────────────────────────────────────

export function selectElement(el, type, additive = false) {
  if (additive && el) {
    // Additive (Shift+click): toggle this element in/out of the selection
    if (selectedSet.has(el)) {
      // Remove from selection
      selectedSet.delete(el);
      selectedTypes.delete(el);
      if (type === 'ellipse') {
        el.setAttribute('stroke', '#60a5fa');
        el.setAttribute('stroke-width', '2');
      } else if (type === 'arrow') {
        const orig = el._visPath.getAttribute('data-original-color') || '#3b82f6';
        el._visPath.setAttribute('stroke', orig);
        el._visPath.setAttribute('stroke-width', '2');
      }
      if (el === selected) {
        const first = selectedSet.values().next().value;
        if (first) {
          setSelected(first, selectedTypes.get(first));
        } else {
          clearSelected();
        }
      }
    } else {
      // Add to selection
      selectedSet.add(el);
      selectedTypes.set(el, type);
      setSelected(el, type);
      if (type === 'ellipse') {
        el.setAttribute('stroke', '#fbbf24');
        el.setAttribute('stroke-width', '3');
      } else if (type === 'arrow') {
        el._visPath.setAttribute('stroke', '#fbbf24');
        el._visPath.setAttribute('stroke-width', '3');
      }
    }
    // Handles only for single selection
    removeHandles();
    if (selectedSet.size === 1) {
      const sole = selectedSet.values().next().value;
      const soleType = selectedTypes.get(sole);
      if (soleType === 'ellipse') showEllipseHandles(sole);
      else if (soleType === 'arrow') showLineHandles(sole);
    }
  } else {
    // Single selection — clear all others first
    deselect();

    if (!el) return;
    setSelected(el, type);
    selectedSet.add(el);
    selectedTypes.set(el, type);

    if (type === 'ellipse') {
      el.setAttribute('stroke', '#fbbf24');
      el.setAttribute('stroke-width', '3');
      showEllipseHandles(el);
      INFO.textContent = 'Drag a corner handle to resize, or drag the oval to move it';
    } else if (type === 'arrow') {
      el._visPath.setAttribute('stroke', '#fbbf24');
      el._visPath.setAttribute('stroke-width', '3');
      showLineHandles(el);
      INFO.textContent = 'Drag an endpoint handle to change the arrow length; drag the midpoint handle to curve it';
    }
  }

  // Update info text for multi-selection
  if (selectedSet.size > 1) {
    INFO.textContent = `${selectedSet.size} elements selected`;
  }
}

export function deselect() {
  hideTextInput();

  // Remove visual selection from all selected elements
  for (const el of selectedSet) {
    const type = selectedTypes.get(el);
    if (type === 'ellipse') {
      el.setAttribute('stroke', '#60a5fa');
      el.setAttribute('stroke-width', '2');
    } else if (type === 'arrow') {
      const orig = el._visPath.getAttribute('data-original-color') || '#3b82f6';
      el._visPath.setAttribute('stroke', orig);
      el._visPath.setAttribute('stroke-width', '2');
    }
  }

  selectedSet.clear();
  selectedTypes.clear();
  clearSelected();
  removeHandles();
  hideContextMenu();

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
}

// ── Context menu ────────────────────────────────────────

export function showContextMenu(x, y) {
  ctxMenu.style.display = 'block';
  ctxMenu.style.left = x + 'px';
  ctxMenu.style.top = y + 'px';
}

export function hideContextMenu() {
  ctxMenu.style.display = 'none';
}

// Click a color or action in the context menu
ctxMenu.addEventListener('click', (e) => {
  const item = e.target.closest('.ctx-color, .ctx-action');
  if (!item) return;
  if (selectedSet.size === 0) return;

  if (item.classList.contains('ctx-color')) {
    const color = item.getAttribute('data-color');
    const affected = [...selectedSet];
    for (const el of affected) {
      const elType = selectedTypes.get(el);
      if (elType === 'ellipse') {
        el.setAttribute('fill', color);
      } else if (elType === 'arrow') {
        const vis = el._visPath;
        vis.setAttribute('stroke', color);
        vis.setAttribute('data-original-color', color);
        updateArrowMarker(vis, color);
      }
    }
    hideContextMenu();
    updateLegend();
  } else if (item.classList.contains('ctx-delete')) {
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
  }
});

// ── Handles ──────────────────────────────────────────────

export function removeHandles() {
  handles.forEach((h) => h.el.remove());
  handles.length = 0;
}

function createHandle(x, y, cursor, onDrag, onDragEnd) {
  const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  rect.setAttribute('x', x - HANDLE_SIZE / 2);
  rect.setAttribute('y', y - HANDLE_SIZE / 2);
  rect.setAttribute('width', HANDLE_SIZE);
  rect.setAttribute('height', HANDLE_SIZE);
  rect.setAttribute('fill', '#ffffff');
  rect.setAttribute('stroke', '#3b82f6');
  rect.setAttribute('stroke-width', '2');
  rect.setAttribute('cursor', cursor);
  rect.classList.add('resize-handle');
  svg.appendChild(rect);

  const data = { el: rect };
  handles.push(data);

  rect.addEventListener('mousedown', (e) => {
    e.stopPropagation();
    e.preventDefault();
    if (!selected) return;

    function onMove(me) {
      const pos = getPos(me);
      onDrag(pos);
    }

    function onUp() {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      if (onDragEnd) onDragEnd();
    }

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  });
}

// ── Ellipse handles (4 corners) ──────────────────────────

export function showEllipseHandles(el) {
  removeHandles();
  const { cx, cy, rx, ry } = ellipseAttrs(el);
  const corners = [
    { x: cx - rx, y: cy - ry, cursor: 'nwse-resize' },
    { x: cx + rx, y: cy - ry, cursor: 'nesw-resize' },
    { x: cx - rx, y: cy + ry, cursor: 'nesw-resize' },
    { x: cx + rx, y: cy + ry, cursor: 'nwse-resize' },
  ];

  corners.forEach((c) => {
    createHandle(c.x, c.y, c.cursor, (pos) => {
      const { cx, cy } = ellipseAttrs(el);
      const newRx = Math.max(10, Math.abs(pos.x - cx));
      const newRy = Math.max(10, Math.abs(pos.y - cy));
      el.setAttribute('rx', newRx);
      el.setAttribute('ry', newRy);
      showEllipseHandles(el);
      updateAnchoredArrows(el);
      updateOvalTextPosition(el);
    });
  });
}

// ── Line handles (2 endpoints + midpoint circle) ─────────

export function showLineHandles(el) {
  removeHandles();
  const { x1, y1, x2, y2 } = lineAttrs(el);
  const offset = el._offset || 0;

  // Handle at start point
  createHandle(x1, y1, 'grab', (pos) => {
    // Detach start anchor when manually moved
    if (el._anchors) {
      el._anchors = el._anchors.filter(a => a.end !== 'start');
    }
    setArrowAttrs(el, { x1: pos.x, y1: pos.y });
    showLineHandles(el);
  }, () => {
    // On drag end: check if endpoint is on an oval → anchor
    const { x1, y1, x2, y2 } = lineAttrs(el);
    const oval = findOvalAt({ x: x1, y: y1 });
    if (oval) {
      if (!el._anchors) el._anchors = [];
      el._anchors = el._anchors.filter(a => a.end !== 'start');
      el._anchors.push({ end: 'start', ellipse: oval });
      const edge = getEllipseEdgePoint(...Object.values(ellipseAttrs(oval)), x2, y2);
      setArrowAttrs(el, { x1: edge.x, y1: edge.y });
      showLineHandles(el);
    }
  });

  // Handle at end point
  createHandle(x2, y2, 'grab', (pos) => {
    // Detach end anchor when manually moved
    if (el._anchors) {
      el._anchors = el._anchors.filter(a => a.end !== 'end');
    }
    setArrowAttrs(el, { x2: pos.x, y2: pos.y });
    showLineHandles(el);
  }, () => {
    // On drag end: check if endpoint is on an oval → anchor
    const { x1, y1, x2, y2 } = lineAttrs(el);
    const oval = findOvalAt({ x: x2, y: y2 });
    if (oval) {
      if (!el._anchors) el._anchors = [];
      el._anchors = el._anchors.filter(a => a.end !== 'end');
      el._anchors.push({ end: 'end', ellipse: oval });
      const edge = getEllipseEdgePoint(...Object.values(ellipseAttrs(oval)), x1, y1);
      setArrowAttrs(el, { x2: edge.x, y2: edge.y });
      showLineHandles(el);
    }
  });

  // ── Midpoint circle handle for curving ──
  const mid = getArrowMidpoint(x1, y1, x2, y2, offset);
  const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  circle.setAttribute('cx', mid.x);
  circle.setAttribute('cy', mid.y);
  circle.setAttribute('r', HANDLE_SIZE / 2);
  circle.setAttribute('fill', '#ffffff');
  circle.setAttribute('stroke', '#3b82f6');
  circle.setAttribute('stroke-width', '2');
  circle.setAttribute('cursor', 'grab');
  circle.classList.add('resize-handle');
  svg.appendChild(circle);

  const data = { el: circle };
  handles.push(data);

  circle.addEventListener('mousedown', (e) => {
    e.stopPropagation();
    e.preventDefault();
    if (!selected) return;

    function onMove(me) {
      const pos = getPos(me);
      // Calculate signed perpendicular distance from the baseline (x1,y1)-(x2,y2)
      const dx = x2 - x1;
      const dy = y2 - y1;
      const len = Math.sqrt(dx * dx + dy * dy);
      if (len < 1) return;
      const cross = dx * (pos.y - y1) - dy * (pos.x - x1);
      el._offset = cross / len;
      updateArrowPath(el);
      showLineHandles(el);
    }

    function onUp() {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    }

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  });
}

// ── Legend ──────────────────────────────────────────────

export function updateLegend() {
  const ellipses = svg.querySelectorAll('ellipse');
  const paths = svg.querySelectorAll('path');
  const colorsInUse = new Map(); // color -> type

  ellipses.forEach((el) => {
    const fill = el.getAttribute('fill');
    if (fill) colorsInUse.set(fill, 'fill');
  });

  paths.forEach((el) => {
    const stroke = el.getAttribute('stroke');
    if (stroke && stroke !== 'transparent' && !stroke.startsWith('rgba') && stroke !== '#fbbf24' && !stroke.startsWith('none')) {
      if (!colorsInUse.has(stroke)) {
        colorsInUse.set(stroke, 'stroke');
      }
    }
  });

  // Remove colors no longer in use
  for (const color of legendColors.keys()) {
    if (!colorsInUse.has(color)) {
      legendColors.delete(color);
    }
  }

  // Add new colors (preserving insertion order)
  for (const [color] of colorsInUse) {
    if (!legendColors.has(color)) {
      legendColors.set(color, { customName: null });
    }
  }

  if (colorsInUse.size === 0) {
    legendEl.style.display = 'none';
    return;
  }
  legendEl.style.display = 'block';

  // Build legend HTML
  let html = '<div class="legend-title">Keys</div>';
  let idx = 1;
  for (const [color] of legendColors) {
    const data = legendColors.get(color);
    const displayName = data.customName || `Group ${idx}`;
    html += `<div class="legend-item">
      <span class="legend-swatch" style="background:${color}"></span>
      <span class="legend-label" data-color="${color}" contenteditable="true">${displayName}</span>
    </div>`;
    idx++;
  }
  legendEl.innerHTML = html;

  // Editable behavior: save custom name on blur / Enter
  legendEl.querySelectorAll('.legend-label').forEach((label) => {
    label.addEventListener('blur', () => {
      const color = label.getAttribute('data-color');
      const text = label.textContent.trim();
      legendColors.get(color).customName = text || null;
      updateLegend();
    });
    label.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        label.blur();
      }
    });
  });
}

// ── Text input (imported from oval.js for deselect) ─────

// Avoid circular dep: import inline
let hideTextInput = () => {};

export function setHideTextInput(fn) {
  hideTextInput = fn;
}

// ── Selection box (marquee select) ─────────────────────

let _selBoxStart = null;
let _selBoxRect = null;
let _selBoxDragged = false;

export function wasSelBoxDragged() {
  const val = _selBoxDragged;
  _selBoxDragged = false;
  return val;
}

function getElementsInRect(x, y, w, h) {
  const right = x + w;
  const bottom = y + h;
  const found = [];

  // Check ellipses by center point
  svg.querySelectorAll('ellipse').forEach(el => {
    const cx = parseFloat(el.getAttribute('cx'));
    const cy = parseFloat(el.getAttribute('cy'));
    if (cx >= x && cx <= right && cy >= y && cy <= bottom) {
      found.push({ el, type: 'ellipse' });
    }
  });

  // Check arrow groups by endpoint
  svg.querySelectorAll('g').forEach(el => {
    if (!el._visPath) return;
    const x1 = el._x1, y1 = el._y1, x2 = el._x2, y2 = el._y2;
    if ((x1 >= x && x1 <= right && y1 >= y && y1 <= bottom) ||
        (x2 >= x && x2 <= right && y2 >= y && y2 <= bottom)) {
      found.push({ el, type: 'arrow' });
    }
  });

  return found;
}

svg.addEventListener('mousedown', (e) => {
  if (currentTool !== 'select') return;
  // Only on background, left button
  if (e.target !== svg && e.target !== bgRect) return;
  if (e.button !== 0) return;

  const startPos = getPos(e);
  _selBoxStart = startPos;
  _selBoxDragged = false;

  // Create the visible selection rectangle
  const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  rect.setAttribute('x', startPos.x);
  rect.setAttribute('y', startPos.y);
  rect.setAttribute('width', 0);
  rect.setAttribute('height', 0);
  rect.setAttribute('fill', 'rgba(59, 130, 246, 0.15)');
  rect.setAttribute('stroke', '#3b82f6');
  rect.setAttribute('stroke-width', '1.5');
  rect.setAttribute('stroke-dasharray', '5,3');
  rect.setAttribute('pointer-events', 'none');
  svg.appendChild(rect);
  _selBoxRect = rect;

  function onMove(me) {
    const pos = getPos(me);
    const x = Math.min(_selBoxStart.x, pos.x);
    const y = Math.min(_selBoxStart.y, pos.y);
    const w = Math.abs(pos.x - _selBoxStart.x);
    const h = Math.abs(pos.y - _selBoxStart.y);

    if (w > 3 || h > 3) {
      _selBoxDragged = true;
    }

    _selBoxRect.setAttribute('x', x);
    _selBoxRect.setAttribute('y', y);
    _selBoxRect.setAttribute('width', w);
    _selBoxRect.setAttribute('height', h);
  }

  function onUp() {
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', onUp);

    const finalRect = _selBoxRect;
    if (finalRect) {
      const x = parseFloat(finalRect.getAttribute('x'));
      const y = parseFloat(finalRect.getAttribute('y'));
      const w = parseFloat(finalRect.getAttribute('width'));
      const h = parseFloat(finalRect.getAttribute('height'));

      finalRect.remove();
      _selBoxRect = null;

      if (_selBoxDragged && w > 3 && h > 3) {
        deselect();
        const inRect = getElementsInRect(x, y, w, h);
        for (const { el, type } of inRect) {
          selectElement(el, type, true);
        }
        if (inRect.length > 0) {
          INFO.textContent = `Selected ${inRect.length} element${inRect.length > 1 ? 's' : ''}`;
        }
      }
    }

    _selBoxStart = null;
  }

  document.addEventListener('mousemove', onMove);
  document.addEventListener('mouseup', onUp);
});