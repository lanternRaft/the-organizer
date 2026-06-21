// ── Selection, handles, context menu, legend ──────────────

import {
  svg, HANDLE_SIZE, handles, selected, selectedType,
  selectedSet, selectedTypes,
  INFO, selMenu, colorPalette, legendEl, legendColors, currentTool, shapeMode,
  setSelected, clearSelected, notifyCanvasChanged, curveModeArrows
} from './state.js';

import {
  getPos, findOvalAt, findAnchorNear, ellipseAttrs, lineAttrs,
  getEllipseEdgePoint, getArrowMidpoint,
  setArrowAttrs, updateArrowPath, updateArrowMarker, applyArrowDirection,
  updateOvalTextPosition, updateAnchoredArrows,
  calculateSignedOffset,
  showAnchors, hideAnchors, updateAnchors, removeOvalText,
  darkenColor, lightenColor, snapToGrid
} from './helpers.js';

// ── Selection ────────────────────────────────────────────

/**
 * Update anchor visibility based on current state.
 * Anchors are shown when any arrow is in the selected set
 * (for endpoint re-attachment via handles).
 */
function updateAnchorVisibility() {
  const hasArrowSelected = [...selectedTypes.values()].includes('arrow');
  if (hasArrowSelected) {
    showAnchors();
  } else {
    // Don't hide all anchors — they may be showing due to hover
    // Only hide if no arrow is selected
    hideAnchors();
  }
}

export function selectElement(el, type, additive = false) {
  if (additive && el) {
    // Additive (Shift+click): toggle this element in/out of the selection
    if (selectedSet.has(el)) {
      // Remove from selection
      selectedSet.delete(el);
      selectedTypes.delete(el);
      if (type === 'ellipse' || type === 'node') {
        el.setAttribute('stroke', darkenColor(el.getAttribute('fill'), 40));
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
      if (type === 'ellipse' || type === 'node') {
        el.setAttribute('stroke', lightenColor(el.getAttribute('fill'), 40));
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
      else if (soleType === 'node') removeHandles(); // nodes have no resize handles
      else if (soleType === 'arrow') showLineHandles(sole);
    }
    updateAnchorVisibility();
  } else {
    // Single selection — clear all others first
    deselect();

    if (!el) return;
    setSelected(el, type);
    selectedSet.add(el);
    selectedTypes.set(el, type);

    if (type === 'ellipse' || type === 'node') {
      el.setAttribute('stroke', lightenColor(el.getAttribute('fill'), 40));
      el.setAttribute('stroke-width', '3');
      if (type === 'ellipse') {
        showEllipseHandles(el);
        INFO.textContent = 'Drag a corner handle to resize, or drag the oval to move it';
      } else {
        // Node: no resize handles
        removeHandles();
        INFO.textContent = 'Drag the node to move it';
      }
    } else if (type === 'arrow') {
      el._visPath.setAttribute('stroke', '#fbbf24');
      el._visPath.setAttribute('stroke-width', '3');
      showLineHandles(el);
      INFO.textContent = 'Drag handles to move endpoints; use the curve button to add bend points';
    }
    updateAnchorVisibility();
  }

  // Show or hide the selection menu
  if (selectedSet.size === 1) {
    showSelectionMenu(selected);
  } else {
    hideSelectionMenu();
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
    if (type === 'ellipse' || type === 'node') {
      el.setAttribute('stroke', darkenColor(el.getAttribute('fill'), 40));
      el.setAttribute('stroke-width', '2');
    } else if (type === 'arrow') {
      const orig = el._visPath.getAttribute('data-original-color') || '#3b82f6';
      el._visPath.setAttribute('stroke', orig);
      el._visPath.setAttribute('stroke-width', '2');
    }
  }

  // Clear curve mode for all deselected arrows
  curveModeArrows.clear();

  selectedSet.clear();
  selectedTypes.clear();
  clearSelected();
  removeHandles();
  hideSelectionMenu();
  updateAnchorVisibility();

  switch (currentTool) {
    case 'select':
      INFO.textContent = 'Click an element to select it';
      break;
    case 'shape':
      INFO.textContent = shapeMode === 'circle'
        ? 'Click the canvas to place a circle'
        : 'Click the canvas to place an oval';
      break;
    case 'node':
      INFO.textContent = 'Click the canvas to place a node';
      break;
  }
}

// ── Selection-based floating menu ──────────────────────

let _colorPaletteVisible = false;

function getElementScreenRect(el) {
  if (el.tagName === 'ellipse') {
    return el.getBoundingClientRect();
  }
  // Arrow group: compute from the stored endpoints
  if (el._visPath) {
    const { x1, y1, x2, y2 } = lineAttrs(el);
    const pt1 = svg.createSVGPoint();
    pt1.x = x1; pt1.y = y1;
    const pt2 = svg.createSVGPoint();
    pt2.x = x2; pt2.y = y2;
    const ctm = svg.getScreenCTM();
    const sp1 = pt1.matrixTransform(ctm);
    const sp2 = pt2.matrixTransform(ctm);
    const minX = Math.min(sp1.x, sp2.x);
    const minY = Math.min(sp1.y, sp2.y);
    const maxX = Math.max(sp1.x, sp2.x);
    const maxY = Math.max(sp1.y, sp2.y);
    return {
      left: minX,
      top: minY,
      width: maxX - minX,
      height: maxY - minY,
      bottom: maxY,
    };
  }
  return el.getBoundingClientRect();
}

function showSelectionMenu(el) {
  if (!selMenu) return;

  const rect = getElementScreenRect(el);
  if (!rect || rect.width === 0) return;

  // Show/hide arrow-specific buttons based on element type
  const isArrow = selectedTypes.get(el) === 'arrow';
  selMenu.querySelectorAll('.sel-dir-none, .sel-dir-mono, .sel-dir-dual, .sel-curve, .sel-separator').forEach(btn => {
    btn.style.display = isArrow ? '' : 'none';
  });

  // Set the active direction button
  if (isArrow) {
    const dir = el._arrowDirection || 'mono';
    selMenu.querySelectorAll('.sel-dir-none, .sel-dir-mono, .sel-dir-dual').forEach(btn => {
      btn.classList.toggle('active-dir', btn.getAttribute('data-dir') === dir);
    });

    // Set the active curve mode state
    const curveBtn = selMenu.querySelector('.sel-curve');
    if (curveBtn) {
      curveBtn.classList.toggle('active-curve', curveModeArrows.has(el));
    }
  }

  // Show and measure the menu so we can compute centered position
  selMenu.style.display = 'flex';
  selMenu.style.visibility = 'hidden';
  const menuWidth = selMenu.offsetWidth;
  selMenu.style.visibility = 'visible';

  const x = rect.left + rect.width / 2 - menuWidth / 2;
  const y = rect.bottom + 8;

  selMenu.style.left = Math.max(4, x) + 'px';
  selMenu.style.top = y + 'px';

  hideColorPalette();
}

function hideSelectionMenu() {
  if (!selMenu) return;
  selMenu.style.display = 'none';
  hideColorPalette();
}

function hideColorPalette() {
  if (!colorPalette) return;
  colorPalette.classList.remove('show');
  _colorPaletteVisible = false;
}

function toggleColorPalette(e) {
  e.stopPropagation();
  if (!colorPalette) return;
  _colorPaletteVisible = !_colorPaletteVisible;
  colorPalette.classList.toggle('show', _colorPaletteVisible);
}

function applyColor(color) {
  if (selectedSet.size === 0) return;
  const affected = [...selectedSet];
  for (const el of affected) {
    const elType = selectedTypes.get(el);
    if (elType === 'ellipse' || elType === 'node') {
      el.setAttribute('fill', color);
      // Update stroke to match the new fill color
      if (selectedSet.has(el)) {
        el.setAttribute('stroke', lightenColor(color, 40));
      } else {
        el.setAttribute('stroke', darkenColor(color, 40));
      }
    } else if (elType === 'arrow') {
      const vis = el._visPath;
      vis.setAttribute('stroke', color);
      vis.setAttribute('data-original-color', color);
      updateArrowMarker(vis, color);
    }
  }
  hideColorPalette();
  updateLegend();
  notifyCanvasChanged();
}

function deleteSelected() {
  if (selectedSet.size === 0) return;
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
}

// ── Selection menu event listeners ──────────────────────

selMenu?.querySelector('.sel-delete')?.addEventListener('click', (e) => {
  e.stopPropagation();
  deleteSelected();
});

selMenu?.querySelector('.sel-palette')?.addEventListener('click', toggleColorPalette);

// Color swatch clicks in palette
colorPalette?.addEventListener('click', (e) => {
  const swatch = e.target.closest('.palette-swatch');
  if (!swatch) return;
  const color = swatch.getAttribute('data-color');
  applyColor(color);
});

// Click outside the color palette to close it
// (handled at document level in app.js)

// ── Arrow direction buttons ─────────────────────────────

function applyDirection(direction) {
  if (selectedSet.size === 0) return;
  for (const el of selectedSet) {
    const elType = selectedTypes.get(el);
    if (elType !== 'arrow') continue;
    el._arrowDirection = direction;
    applyArrowDirection(el);
  }
  // Update which button is active
  selMenu.querySelectorAll('.sel-dir-none, .sel-dir-mono, .sel-dir-dual').forEach(btn => {
    btn.classList.toggle('active-dir', btn.getAttribute('data-dir') === direction);
  });
  hideColorPalette();
  notifyCanvasChanged();
}

selMenu?.querySelector('.sel-dir-none')?.addEventListener('click', (e) => {
  e.stopPropagation();
  applyDirection('none');
});

selMenu?.querySelector('.sel-dir-mono')?.addEventListener('click', (e) => {
  e.stopPropagation();
  applyDirection('mono');
});

selMenu?.querySelector('.sel-dir-dual')?.addEventListener('click', (e) => {
  e.stopPropagation();
  applyDirection('dual');
});

// ── Curve mode button ────────────────────────────────────

function toggleCurveMode() {
  const activeArrow = [...selectedSet].find(el => selectedTypes.get(el) === 'arrow');
  if (!activeArrow) return;

  if (curveModeArrows.has(activeArrow)) {
    curveModeArrows.delete(activeArrow);
  } else {
    curveModeArrows.add(activeArrow);
  }

  // Update the button state
  const curveBtn = selMenu.querySelector('.sel-curve');
  if (curveBtn) {
    curveBtn.classList.toggle('active-curve', curveModeArrows.has(activeArrow));
  }
  hideColorPalette();
  notifyCanvasChanged();
}

selMenu?.querySelector('.sel-curve')?.addEventListener('click', (e) => {
  e.stopPropagation();
  toggleCurveMode();
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
    hideContextMenu();

    function onMove(me) {
      const pos = getPos(me);
      onDrag(pos);
    }

    function onUp() {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      notifyCanvasChanged();
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
      if (shapeMode === 'circle') {
        const dist = Math.sqrt((pos.x - cx) ** 2 + (pos.y - cy) ** 2);
        const newR = Math.max(10, snapToGrid(dist));
        el.setAttribute('rx', newR);
        el.setAttribute('ry', newR);
      } else {
        const newRx = Math.max(10, snapToGrid(Math.abs(pos.x - cx)));
        const newRy = Math.max(10, snapToGrid(Math.abs(pos.y - cy)));
        el.setAttribute('rx', newRx);
        el.setAttribute('ry', newRy);
      }
      showEllipseHandles(el);
      updateAnchoredArrows(el);
      updateAnchors();
      updateOvalTextPosition(el);
    });
  });
}

// ── Line handles (2 endpoints + midpoint circle) ─────────

export function showLineHandles(el) {
  removeHandles();

  const points = el._points;
  if (!points || points.length < 2) {
    // Legacy fallback: use old endpoint + midpoint handles
    const { x1, y1, x2, y2 } = lineAttrs(el);
    const offset = el._offset || 0;

    createHandle(x1, y1, 'grab', (pos) => {
      if (el._anchors) el._anchors = el._anchors.filter(a => a.end !== 'start');
      setArrowAttrs(el, { x1: pos.x, y1: pos.y });
      showLineHandles(el);
    }, () => {
      const { x1, y1, x2, y2 } = lineAttrs(el);
      const snapped = findAnchorNear({ x: x1, y: y1 });
      if (snapped) {
        if (!el._anchors) el._anchors = [];
        el._anchors = el._anchors.filter(a => a.end !== 'start');
        el._anchors.push({ end: 'start', ellipse: snapped.ellipse, anchorLabel: snapped.anchorLabel });
        setArrowAttrs(el, { x1: snapped.anchorPos.x, y1: snapped.anchorPos.y });
        const { x1: nx1, y1: ny1, x2: nx2, y2: ny2 } = lineAttrs(el);
        el._offset = calculateSignedOffset(nx1, ny1, nx2, ny2, el._anchors);
        updateArrowPath(el);
        showLineHandles(el);
      }
      notifyCanvasChanged();
    });

    createHandle(x2, y2, 'grab', (pos) => {
      if (el._anchors) el._anchors = el._anchors.filter(a => a.end !== 'end');
      setArrowAttrs(el, { x2: pos.x, y2: pos.y });
      showLineHandles(el);
    }, () => {
      const { x1, y1, x2, y2 } = lineAttrs(el);
      const snapped = findAnchorNear({ x: x2, y: y2 });
      if (snapped) {
        if (!el._anchors) el._anchors = [];
        el._anchors = el._anchors.filter(a => a.end !== 'end');
        el._anchors.push({ end: 'end', ellipse: snapped.ellipse, anchorLabel: snapped.anchorLabel });
        setArrowAttrs(el, { x2: snapped.anchorPos.x, y2: snapped.anchorPos.y });
        const { x1: nx1, y1: ny1, x2: nx2, y2: ny2 } = lineAttrs(el);
        el._offset = calculateSignedOffset(nx1, ny1, nx2, ny2, el._anchors);
        updateArrowPath(el);
        showLineHandles(el);
      }
      notifyCanvasChanged();
    });

    // Midpoint circle handle for legacy offset-based curving
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
    const circleData = { el: circle };
    handles.push(circleData);
    circle.addEventListener('mousedown', (e) => {
      e.stopPropagation();
      e.preventDefault();
      if (!selected) return;
      function onMove(me) {
        const pos = getPos(me);
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
    return;
  }

  // ── Waypoint-based handles ─────────────────────────────
  const startAnchor = el._anchors?.find(a => a.end === 'start');
  const endAnchor = el._anchors?.find(a => a.end === 'end');

  for (let i = 0; i < points.length; i++) {
    const pt = points[i];
    const isFirst = i === 0;
    const isLast = i === points.length - 1;
    const isEndHandle = isFirst || isLast;

    // Endpoint handles are squares; intermediate waypoints are circles
    if (isEndHandle) {
      createHandle(pt.x, pt.y, 'grab', (pos) => {
        // Detach the relevant anchor when manually moved
        if (el._anchors) {
          el._anchors = el._anchors.filter(a =>
            (isFirst && a.end === 'start') || (isLast && a.end === 'end') ? false : true
          );
        }
        pt.x = pos.x;
        pt.y = pos.y;
        setArrowAttrs(el, {
          [isFirst ? 'x1' : 'x2']: pos.x,
          [isFirst ? 'y1' : 'y2']: pos.y,
        });
        showLineHandles(el);
      }, () => {
        // On drag end: snap to nearest anchor within 15px
        const snapped = findAnchorNear({ x: pt.x, y: pt.y });
        if (snapped) {
          if (!el._anchors) el._anchors = [];
          el._anchors = el._anchors.filter(a =>
            (isFirst && a.end === 'start') || (isLast && a.end === 'end')
          );
          el._anchors.push({
            end: isFirst ? 'start' : 'end',
            ellipse: snapped.ellipse,
            anchorLabel: snapped.anchorLabel,
          });
          pt.x = snapped.anchorPos.x;
          pt.y = snapped.anchorPos.y;
          setArrowAttrs(el, {
            [isFirst ? 'x1' : 'x2']: snapped.anchorPos.x,
            [isFirst ? 'y1' : 'y2']: snapped.anchorPos.y,
          });
          updateArrowPath(el);
          showLineHandles(el);
        }
      });
    } else {
      // ── Intermediate waypoint handle (circle) ────────────
      const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      circle.setAttribute('cx', pt.x);
      circle.setAttribute('cy', pt.y);
      circle.setAttribute('r', HANDLE_SIZE / 3);
      circle.setAttribute('fill', '#ffffff');
      circle.setAttribute('stroke', '#3b82f6');
      circle.setAttribute('stroke-width', '2');
      circle.setAttribute('cursor', 'grab');
      circle.classList.add('resize-handle', 'waypoint-handle');
      svg.appendChild(circle);

      const data = { el: circle };
      handles.push(data);

      circle.addEventListener('mousedown', (e) => {
        e.stopPropagation();
        e.preventDefault();
        if (!selected) return;
        const snapX = pt.x;
        const snapY = pt.y;

        function onMove(me) {
          const pos = getPos(me);
          pt.x = pos.x;
          pt.y = pos.y;
          // Keep _x1/_y1/_x2/_y2 in sync
          el._x1 = points[0].x;
          el._y1 = points[0].y;
          el._x2 = points[points.length - 1].x;
          el._y2 = points[points.length - 1].y;
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
  }
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
      notifyCanvasChanged();
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

// Keep old exports for backwards compat
export function showContextMenu(x, y) {
  // No-op now
}
export function hideContextMenu() {
  hideSelectionMenu();
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

  // Check ellipses (ovals + nodes) by center point
  svg.querySelectorAll('ellipse').forEach(el => {
    const cx = parseFloat(el.getAttribute('cx'));
    const cy = parseFloat(el.getAttribute('cy'));
    if (cx >= x && cx <= right && cy >= y && cy <= bottom) {
      const rx = parseFloat(el.getAttribute('rx'));
      const type = rx <= 10 ? 'node' : 'ellipse';
      found.push({ el, type });
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
  if (e.target !== svg) return;
  if (e.button !== 0) return;

  hideContextMenu();

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