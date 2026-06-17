// ── Arrow creation & placement preview ───────────────────

import { svg, INFO, defs, selected, selectedType, currentTool, selectedSet, selectedTypes } from './state.js';
import {
  getPos, findOvalAt, ellipseAttrs, lineAttrs,
  getEllipseEdgePoint, updateArrowPath, setArrowAttrs,
  startMultiDrag
} from './helpers.js';
import { selectElement, showLineHandles, updateLegend, showContextMenu } from './select.js';

// Arrow placement state
let _arrowStart = null;       // { x, y } | null
let _arrowStartAnchor = null; // oval element | null
let _arrowStartLabel = null;  // 'top'|'left'|'bottom'|'right' | null
let _arrowPreviewLine = null; // SVG line element
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
    _arrowPreviewLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    _arrowPreviewLine.setAttribute('stroke', 'rgba(59,130,246,0.4)');
    _arrowPreviewLine.setAttribute('stroke-width', '2');
    _arrowPreviewLine.setAttribute('stroke-dasharray', '6,4');
    _arrowPreviewLine.setAttribute('stroke-linecap', 'round');
    _arrowPreviewLine.setAttribute('marker-end', 'url(#prev-arrowhead)');
    svg.appendChild(_arrowPreviewLine);
  }
  _arrowPreviewLine.setAttribute('x1', _arrowStart.x);
  _arrowPreviewLine.setAttribute('y1', _arrowStart.y);
  _arrowPreviewLine.setAttribute('x2', pos.x);
  _arrowPreviewLine.setAttribute('y2', pos.y);
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
  group._anchors = [];
  group._x1 = x1;
  group._y1 = y1;
  group._x2 = x2;
  group._y2 = y2;
  group._offset = 0;

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
  visPath.setAttribute('marker-end', 'url(#arrowhead)');
  group.appendChild(visPath);

  // Store references for later attribute access
  group._hitPath = hitPath;
  group._visPath = visPath;

  // Set initial path geometry
  updateArrowPath(group);

  // Click on arrow → select it
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
      startMultiDrag(e);
      return;
    }

    // Detach all anchors when dragging the whole arrow
    if (group._anchors) {
      group._anchors = [];
    }

    const startPos = getPos(e);
    const { x1, y1, x2, y2 } = lineAttrs(group);
    let dragged = false;

    function onMove(me) {
      dragged = true;
      const pos = getPos(me);
      const dx = pos.x - startPos.x;
      const dy = pos.y - startPos.y;
      setArrowAttrs(group, {
        x1: x1 + dx, y1: y1 + dy,
        x2: x2 + dx, y2: y2 + dy,
      });
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

  // Right-click on arrow → show context menu
  group.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    e.stopPropagation();
    selectElement(group, 'arrow');
    showContextMenu(e.clientX, e.clientY);
  });

  svg.appendChild(group);
  return group;
}