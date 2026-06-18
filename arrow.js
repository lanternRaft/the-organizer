// ── Arrow creation & drag-from-anchor system ──────────────
// Arrows are created by clicking/dragging from an anchor point
// to another anchor point. Arrows not anchored on both ends are discarded.

import { svg, INFO, defs, selected, selectedType, currentTool, selectedSet, selectedTypes, notifyCanvasChanged } from './state.js';
import {
  getPos, findOvalAt, ellipseAttrs, lineAttrs,
  getEllipseEdgePoint, updateArrowPath, setArrowAttrs,
  calculateSignedOffset, updateAnchoredArrows,
  computeCubicControlPoints, insertArrowWaypoint,
  startMultiDrag, applyArrowDirection,
  findAnchorNear, highlightAnchorDot, unhighlightAllAnchors,
  showAnchorsForEllipse, hideAnchorsForEllipse
} from './helpers.js';
import { selectElement, showLineHandles, updateLegend, hideContextMenu } from './select.js';

// Drag-from-anchor state
let _arrowDragActive = false;
let _dragStartAnchor = null;   // { ellipse, anchorLabel, anchorPos }
let _dragPreviewLine = null;   // SVG path element for preview during drag
let _dragSnappedEnd = null;    // Currently hovered end anchor during drag

// ── Arrow drag state accessors ───────────────────────────

export function isArrowDragActive() {
  return _arrowDragActive;
}

// ── Cancel an in-progress arrow drag ─────────────────────

export function cancelArrowPlacement() {
  if (_dragPreviewLine) {
    _dragPreviewLine.remove();
    _dragPreviewLine = null;
  }
  _arrowDragActive = false;
  _dragStartAnchor = null;
  _dragSnappedEnd = null;
  unhighlightAllAnchors();
}

// ── Start an arrow drag from an anchor point ─────────────

export function startArrowDrag(anchorEllipse, anchorLabel, anchorPos) {
  cancelArrowPlacement();

  _arrowDragActive = true;
  _dragStartAnchor = {
    ellipse: anchorEllipse,
    anchorLabel: anchorLabel,
    anchorPos: anchorPos,
  };

  // Create the preview line
  _dragPreviewLine = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  _dragPreviewLine.setAttribute('stroke', 'rgba(59,130,246,0.4)');
  _dragPreviewLine.setAttribute('stroke-width', '2');
  _dragPreviewLine.setAttribute('stroke-dasharray', '6,4');
  _dragPreviewLine.setAttribute('stroke-linecap', 'round');
  _dragPreviewLine.setAttribute('fill', 'none');
  _dragPreviewLine.setAttribute('marker-end', 'url(#prev-arrowhead)');
  _dragPreviewLine.setAttribute('pointer-events', 'none');
  svg.appendChild(_dragPreviewLine);

  // Show anchors on all shapes so the user can see where to drop
  const ellipses = svg.querySelectorAll('ellipse');
  for (const el of ellipses) {
    showAnchorsForEllipse(el);
  }

  // Highlight the start anchor
  highlightAnchorDot(anchorEllipse, anchorLabel);

  INFO.textContent = 'Drag to another anchor point to create an arrow';
}

// ── Update the arrow drag preview ──────────────────────

export function updateArrowDragPreview(pos) {
  if (!_arrowDragActive || !_dragPreviewLine) return;

  const startPos = _dragStartAnchor.anchorPos;

  // Snap preview end to nearest anchor within 15px
  const snapped = findAnchorNear(pos);

  // Remove previous highlight
  unhighlightAllAnchors();
  // Re-highlight start anchor
  highlightAnchorDot(_dragStartAnchor.ellipse, _dragStartAnchor.anchorLabel);

  if (snapped) {
    // Highlight the potential end anchor
    highlightAnchorDot(snapped.ellipse, snapped.anchorLabel);
    _dragSnappedEnd = snapped;
  } else {
    _dragSnappedEnd = null;
  }

  const previewPos = snapped ? snapped.anchorPos : pos;

  // Compute preview curve
  const startAnchor = {
    ellipse: _dragStartAnchor.ellipse,
    anchorLabel: _dragStartAnchor.anchorLabel,
  };
  const endAnchor = snapped ? { ellipse: snapped.ellipse, anchorLabel: snapped.anchorLabel } : null;
  const { cp1x, cp1y, cp2x, cp2y } = computeCubicControlPoints(
    startPos.x, startPos.y, previewPos.x, previewPos.y,
    { ellipse: _dragStartAnchor.ellipse, anchorLabel: _dragStartAnchor.anchorLabel },
    endAnchor
  );
  _dragPreviewLine.setAttribute('d', `M ${startPos.x} ${startPos.y} C ${cp1x} ${cp1y} ${cp2x} ${cp2y} ${previewPos.x} ${previewPos.y}`);
}

// ── Finish the arrow drag (mouseup) ────────────────────

export function finishArrowDrag() {
  if (!_arrowDragActive || !_dragStartAnchor) {
    cancelArrowPlacement();
    return false;
  }

  // If snapped to a valid end anchor (different from start), create the arrow
  if (_dragSnappedEnd && _dragSnappedEnd.ellipse !== _dragStartAnchor.ellipse) {
    const startPos = _dragStartAnchor.anchorPos;
    const endPos = _dragSnappedEnd.anchorPos;

    createArrow(
      startPos.x, startPos.y,
      endPos.x, endPos.y,
      _dragStartAnchor.ellipse, _dragSnappedEnd.ellipse,
      _dragStartAnchor.anchorLabel, _dragSnappedEnd.anchorLabel
    );
    updateLegend();
    cancelArrowPlacement();
    INFO.textContent = 'Arrow created';
    return true;
  }

  // Not snapped to a valid (different) anchor — discard
  cancelArrowPlacement();
  INFO.textContent = 'Arrow discarded (must connect two different shapes)';
  return false;
}

// ── Create arrow (line) ─────────────────────────────────

export function createArrow(x1, y1, x2, y2, startAnchor, endAnchor, startAnchorLabel, endAnchorLabel) {
  const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  group.style.cursor = 'pointer';

  // ── Waypoint-based data model ────────────────────────────
  group._points = [
    { x: x1, y: y1 },
    { x: x2, y: y2 },
  ];
  group._anchors = [];
  group._x1 = x1;
  group._y1 = y1;
  group._x2 = x2;
  group._y2 = y2;

  // Build anchor array for offset sign calculation (legacy compat)
  const anchorsForOffset = [];
  if (startAnchor) {
    anchorsForOffset.push({ end: 'start', ellipse: startAnchor, anchorLabel: startAnchorLabel || 'right' });
  }
  if (endAnchor) {
    anchorsForOffset.push({ end: 'end', ellipse: endAnchor, anchorLabel: endAnchorLabel || 'left' });
  }
  // Legacy offset (kept for backward compat with clipboard)
  group._offset = calculateSignedOffset(x1, y1, x2, y2, anchorsForOffset);

  // Store anchor references if provided (with cardinal label)
  if (startAnchor) {
    group._anchors.push({ end: 'start', ellipse: startAnchor, anchorLabel: startAnchorLabel || 'right' });
  }
  if (endAnchor) {
    group._anchors.push({ end: 'end', ellipse: endAnchor, anchorLabel: endAnchorLabel || 'left' });
  }

  // Invisible wide path for easy clicking (14px hit target)
  const hitPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  hitPath.setAttribute('stroke', 'transparent');
  hitPath.setAttribute('stroke-width', '14');
  hitPath.setAttribute('fill', 'none');
  hitPath.setAttribute('stroke-linecap', 'round');
  group.appendChild(hitPath);

  // Visible arrow path (no pointer-events, all events go through the group)
  const visPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  visPath.setAttribute('stroke', '#3b82f6');
  visPath.setAttribute('stroke-width', '2');
  visPath.setAttribute('fill', 'none');
  visPath.setAttribute('stroke-linecap', 'round');
  visPath.setAttribute('data-original-color', '#3b82f6');
  group.appendChild(visPath);

  // Store references for later attribute access
  group._hitPath = hitPath;
  group._visPath = visPath;
  group._arrowDirection = 'mono';

  // Set initial path geometry and markers
  updateArrowPath(group);
  applyArrowDirection(group);

  // ── Click on arrow → select OR add waypoint ────────────
  group.addEventListener('click', (e) => {
    // If arrow drag is active, ignore click on existing arrows
    if (_arrowDragActive) return;
    // If this click follows a drag on this element, suppress it to preserve the selection set
    if (group._ignoreNextClick) {
      group._ignoreNextClick = false;
      e.stopPropagation();
      return;
    }
    e.stopPropagation();

    // Check if the click was on an existing waypoint handle (don't insert there)
    if (e.target.classList.contains('waypoint-handle')) return;

    // If the arrow is already selected and this is a single-selection,
    // clicking on the path inserts a new waypoint at the click position.
    if (selectedSet.has(group) && selectedSet.size === 1) {
      const pos = getPos(e);
      insertArrowWaypoint(group, pos.x, pos.y);
      showLineHandles(group);
      return;
    }

    // Regular click: select the arrow
    selectElement(group, 'arrow', e.shiftKey);
  });

  // Mousedown on an arrow → select it (if not already) and drag immediately
  group.addEventListener('mousedown', (e) => {
    // If arrow drag is active, ignore
    if (_arrowDragActive) return;
    // If not already selected, select it first (skip for Shift+click; let click handler handle toggling)
    if (!selectedSet.has(group)) {
      if (e.shiftKey) return;
      selectElement(group, 'arrow', false);
      // Suppress the click that follows to avoid re-running selectElement
      group._ignoreNextClick = true;
    }
    if (selectedTypes.get(group) !== 'arrow') return;
    e.stopPropagation();
    e.preventDefault();

    // Multi-drag: move all selected elements together
    if (selectedSet.size > 1) {
      hideContextMenu();
      startMultiDrag(e);
      return;
    }

    const startPos = getPos(e);
    const points = group._points;
    // Snapshot all waypoint positions before drag starts
    const startPoints = points.map(p => ({ x: p.x, y: p.y }));
    let dragged = false;

    function onMove(me) {
      dragged = true;
      hideContextMenu();
      const pos = getPos(me);
      const dx = pos.x - startPos.x;
      const dy = pos.y - startPos.y;

      // Shift ALL waypoints by the drag delta
      for (let i = 0; i < points.length; i++) {
        points[i].x = startPoints[i].x + dx;
        points[i].y = startPoints[i].y + dy;
      }

      // Keep _x1/_y1/_x2/_y2 in sync for backward compat
      group._x1 = points[0].x;
      group._y1 = points[0].y;
      group._x2 = points[points.length - 1].x;
      group._y2 = points[points.length - 1].y;

      // Re-snap anchored endpoints back to their connected nodes
      // so the arrow stays attached at both ends
      if (group._anchors && group._anchors.length > 0) {
        for (const anchor of group._anchors) {
          if (anchor.ellipse && anchor.ellipse.parentNode) {
            updateAnchoredArrows(anchor.ellipse);
          }
        }
        // Re-sync _points[0] and _points[last] after anchoring
        points[0].x = group._x1;
        points[0].y = group._y1;
        points[points.length - 1].x = group._x2;
        points[points.length - 1].y = group._y2;
      }

      updateArrowPath(group);
      showLineHandles(group);
    }

    function onUp() {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      if (dragged) {
        // Suppress the click that follows a drag to keep the selection intact
        group._ignoreNextClick = true;
        notifyCanvasChanged();
      }
    }

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  });

  // Note: right-click on an arrow is intentionally not handled.
  // The selection-based floating menu appears when the element is selected.

  svg.appendChild(group);
  notifyCanvasChanged();
  return group;
}
