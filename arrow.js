// ── Arrow creation & placement preview ───────────────────

import { svg, INFO, defs, selected, selectedType, currentTool, selectedSet, selectedTypes } from './state.js';
import {
  getPos, findOvalAt, ellipseAttrs, lineAttrs,
  getEllipseEdgePoint, updateArrowPath, setArrowAttrs,
  calculateSignedOffset, updateAnchoredArrows,
  computeCubicControlPoints, insertArrowWaypoint,
  startMultiDrag, applyArrowDirection
} from './helpers.js';
import { selectElement, showLineHandles, updateLegend, hideContextMenu } from './select.js';

// Arrow placement state
let _arrowStart = null;       // { x, y } | null
let _arrowStartAnchor = null; // oval element | null
let _arrowStartLabel = null;  // 'top'|'left'|'bottom'|'right' | null
let _arrowPreviewLine = null; // SVG path element for curved preview
let _arrowPreviewDot = null;  // SVG circle element

export function getArrowStart() {
  return _arrowStart;
}
export function getArrowStartAnchor() {
  return _arrowStartAnchor;
}
export function getArrowStartLabel() {
  return _arrowStartLabel;
}

export function setArrowStart(pos) {
  _arrowStart = pos;
}
export function setArrowStartAnchor(oval) {
  _arrowStartAnchor = oval;
}
export function setArrowStartLabel(label) {
  _arrowStartLabel = label;
}

// ── Arrow placement (preview) ───────────────────────────

export function cancelArrowPlacement() {
  if (_arrowPreviewLine) {
    _arrowPreviewLine.remove();
    _arrowPreviewLine = null;
  }
  if (_arrowPreviewDot) {
    _arrowPreviewDot.remove();
    _arrowPreviewDot = null;
  }
  _arrowStart = null;
  _arrowStartAnchor = null;
  _arrowStartLabel = null;
}

export function updateArrowPreview(pos) {
  if (!_arrowPreviewLine) {
    _arrowPreviewLine = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    _arrowPreviewLine.setAttribute('stroke', 'rgba(59,130,246,0.4)');
    _arrowPreviewLine.setAttribute('stroke-width', '2');
    _arrowPreviewLine.setAttribute('stroke-dasharray', '6,4');
    _arrowPreviewLine.setAttribute('stroke-linecap', 'round');
    _arrowPreviewLine.setAttribute('fill', 'none');
    _arrowPreviewLine.setAttribute('marker-end', 'url(#prev-arrowhead)');
    svg.appendChild(_arrowPreviewLine);
  }
  // Cubic bezier preview: start anchor direction (if any), default control points for end
  const startAnchor = _arrowStartAnchor && _arrowStartLabel
    ? { ellipse: _arrowStartAnchor, anchorLabel: _arrowStartLabel }
    : null;
  const { cp1x, cp1y, cp2x, cp2y } = computeCubicControlPoints(
    _arrowStart.x, _arrowStart.y, pos.x, pos.y, startAnchor, null
  );
  _arrowPreviewLine.setAttribute('d', `M ${_arrowStart.x} ${_arrowStart.y} C ${cp1x} ${cp1y} ${cp2x} ${cp2y} ${pos.x} ${pos.y}`);
}

export function showArrowStartDot(pos) {
  if (!_arrowPreviewDot) {
    _arrowPreviewDot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    _arrowPreviewDot.setAttribute('r', '5');
    _arrowPreviewDot.setAttribute('fill', '#3b82f6');
    _arrowPreviewDot.setAttribute('opacity', '0.7');
    _arrowPreviewDot.setAttribute('pointer-events', 'none');
    svg.appendChild(_arrowPreviewDot);
  }
  _arrowPreviewDot.setAttribute('cx', pos.x);
  _arrowPreviewDot.setAttribute('cy', pos.y);
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
    // In arrow mode, don't stop propagation — let the SVG handler place the arrow
    if (currentTool === 'arrow') return;
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
      }
    }

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  });

  // Note: right-click on an arrow is intentionally not handled.
  // The selection-based floating menu appears when the element is selected.

  svg.appendChild(group);
  return group;
}