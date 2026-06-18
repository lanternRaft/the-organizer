// ── Pure utility functions & DOM helpers ──────────────────

import { svg, defs, selectedSet, selectedTypes } from './state.js';

// ── Coordinate helpers ────────────────────────────────────

export function getPos(e) {
  const r = svg.getBoundingClientRect();
  return { x: e.clientX - r.left, y: e.clientY - r.top };
}

export function ellipseAttrs(el) {
  return {
    cx: parseFloat(el.getAttribute('cx')),
    cy: parseFloat(el.getAttribute('cy')),
    rx: parseFloat(el.getAttribute('rx')),
    ry: parseFloat(el.getAttribute('ry')),
  };
}

export function lineAttrs(el) {
  // Arrow elements are <g> groups; get stored coords from the group
  if (el.tagName === 'g') {
    return {
      x1: el._x1,
      y1: el._y1,
      x2: el._x2,
      y2: el._y2,
    };
  }
  // Fallback for plain <line> elements
  return {
    x1: parseFloat(el.getAttribute('x1')),
    y1: parseFloat(el.getAttribute('y1')),
    x2: parseFloat(el.getAttribute('x2')),
    y2: parseFloat(el.getAttribute('y2')),
  };
}

// ── Hit testing ────────────────────────────────────────────

export function findOvalAt(pos) {
  const ellipses = svg.querySelectorAll('ellipse');
  for (const el of ellipses) {
    const { cx, cy, rx, ry } = ellipseAttrs(el);
    const dx = (pos.x - cx) / rx;
    const dy = (pos.y - cy) / ry;
    if (dx * dx + dy * dy <= 1) {
      return el;
    }
  }
  return null;
}

// ── Ellipse geometry ─────────────────────────────────────

export function getEllipseEdgePoint(cx, cy, rx, ry, fromX, fromY) {
  const dx = fromX - cx;
  const dy = fromY - cy;
  if (Math.abs(dx) < 0.001 && Math.abs(dy) < 0.001) {
    return { x: cx + rx, y: cy };
  }
  const t = 1 / Math.sqrt((dx / rx) ** 2 + (dy / ry) ** 2);
  return { x: cx + dx * t, y: cy + dy * t };
}

// ── Curve helpers (Cubic Bézier) ───────────────────────────

/**
 * Compute control points for a cubic bezier segment.
 * At anchored endpoints, the control point extends straight AWAY from the
 * connected shape's center so the arrow exits/enters the node cleanly.
 * For unanchored endpoints (intermediate waypoints), control points are
 * placed at ⅓ and ⅔ along the segment for a smooth trajectory.
 *
 * @param {number} x1,y1 - Segment start point
 * @param {number} x2,y2 - Segment end point
 * @param {object|null} startAnchor - { ellipse, anchorLabel } for start, or null
 * @param {object|null} endAnchor   - { ellipse, anchorLabel } for end, or null
 * @returns {{ cp1x, cp1y, cp2x, cp2y }}
 */
export function computeCubicControlPoints(x1, y1, x2, y2, startAnchor, endAnchor) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.sqrt(dx * dx + dy * dy);
  // Distance the control point extends: at least 30, at most 100, proportional to segment length
  const dist = Math.max(30, Math.min(100, len * 0.35));

  // Default: control points at ⅓ and ⅔ for a nearly-straight cubic
  let cp1x = x1 + dx * 0.33;
  let cp1y = y1 + dy * 0.33;
  let cp2x = x2 - dx * 0.33;
  let cp2y = y2 - dy * 0.33;

  // Start anchor: extend straight away from the center of the connected shape
  if (startAnchor && startAnchor.ellipse && startAnchor.ellipse.parentNode) {
    const { cx, cy } = ellipseAttrs(startAnchor.ellipse);
    const adx = x1 - cx;
    const ady = y1 - cy;
    const aLen = Math.sqrt(adx * adx + ady * ady);
    if (aLen > 0.1) {
      cp1x = x1 + (adx / aLen) * dist;
      cp1y = y1 + (ady / aLen) * dist;
    }
  }

  // End anchor: extend straight away from the center of the connected shape
  // so the curve approaches the anchor from outside the node.
  if (endAnchor && endAnchor.ellipse && endAnchor.ellipse.parentNode) {
    const { cx, cy } = ellipseAttrs(endAnchor.ellipse);
    const adx = x2 - cx;
    const ady = y2 - cy;
    const aLen = Math.sqrt(adx * adx + ady * ady);
    if (aLen > 0.1) {
      cp2x = x2 + (adx / aLen) * dist;
      cp2y = y2 + (ady / aLen) * dist;
    }
  }

  return { cp1x, cp1y, cp2x, cp2y };
}

/**
 * Get the midpoint of a cubic bezier curve at t=0.5.
 * Falls back to the old quadratic calculation for legacy arrows that still use _offset.
 */
export function getArrowMidpoint(x1, y1, x2, y2, offset, startAnchor, endAnchor) {
  if (offset !== undefined && offset !== 0) {
    // Legacy quadratic bezier midpoint
    const cp = getControlPoint(x1, y1, x2, y2, offset);
    return {
      x: 0.25 * x1 + 0.5 * cp.x + 0.25 * x2,
      y: 0.25 * y1 + 0.5 * cp.y + 0.25 * y2,
    };
  }
  // Cubic bezier at t=0.5
  const { cp1x, cp1y, cp2x, cp2y } = computeCubicControlPoints(x1, y1, x2, y2, startAnchor, endAnchor);
  const t = 0.5, u = 1 - t;
  return {
    x: u*u*u*x1 + 3*u*u*t*cp1x + 3*u*t*t*cp2x + t*t*t*x2,
    y: u*u*u*y1 + 3*u*u*t*cp1y + 3*u*t*t*cp2y + t*t*t*y2,
  };
}

/**
 * Legacy quadratic control point helper — kept for backward compatibility
 * with clipboard paste and any old-style arrows that still use _offset.
 */
export function getControlPoint(x1, y1, x2, y2, offset) {
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len < 1) return { x: mx, y: my };
  const nx = -dy / len;
  const ny = dx / len;
  return { x: mx + nx * offset, y: my + ny * offset };
}

/**
 * Legacy signed-offset calculator — kept for backward compat with clipboard/old arrows.
 */
export function calculateSignedOffset(x1, y1, x2, y2, anchors) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.sqrt(dx * dx + dy * dy);
  const magnitude = len > 10 ? Math.min(50, Math.max(20, len * 0.12)) : 0;
  if (magnitude === 0 || !anchors || anchors.length === 0) return magnitude;
  let totalSide = 0;
  for (const anchor of anchors) {
    if (!anchor.ellipse || !anchor.ellipse.parentNode) continue;
    const { cx, cy } = ellipseAttrs(anchor.ellipse);
    const side = dx * (cy - y1) - dy * (cx - x1);
    totalSide += Math.sign(side);
  }
  const sign = totalSide >= 0 ? 1 : -1;
  return magnitude * sign;
}

// ── Anchor point system ────────────────────────────────────

const ANCHOR_SNAP_RADIUS = 15;
const ANCHOR_DOT_RADIUS = 4;
const ANCHOR_CLASS = 'anchor-point';
const _anchorDots = new Map(); // ellipse -> [{label, el}]

/**
 * Get the 4 cardinal anchor points for an ellipse.
 * Positions: top, left, bottom, right (relative to the shape's center).
 */
export function getAnchorPoints(cx, cy, rx, ry) {
  return {
    top:    { x: cx, y: cy - ry, label: 'top' },
    left:   { x: cx - rx, y: cy, label: 'left' },
    bottom: { x: cx, y: cy + ry, label: 'bottom' },
    right:  { x: cx + rx, y: cy, label: 'right' },
  };
}

/**
 * Find the nearest anchor point within ANCHOR_SNAP_RADIUS of the given position.
 * Returns { ellipse, anchorPos, anchorLabel } or null.
 */
export function findAnchorNear(pos, threshold = ANCHOR_SNAP_RADIUS) {
  const ellipses = svg.querySelectorAll('ellipse');
  let best = null;
  let bestDist = threshold;

  for (const el of ellipses) {
    const { cx, cy, rx, ry } = ellipseAttrs(el);
    const anchors = getAnchorPoints(cx, cy, rx, ry);
    for (const [label, anchorPos] of Object.entries(anchors)) {
      const dx = pos.x - anchorPos.x;
      const dy = pos.y - anchorPos.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < bestDist) {
        bestDist = dist;
        best = { ellipse: el, anchorPos, anchorLabel: label };
      }
    }
  }
  return best;
}

/**
 * Create anchor dots for a single ellipse and cache them.
 * Dots have pointer-events: auto and store refs to their parent ellipse + label.
 */
function _createDotsForEllipse(el) {
  if (_anchorDots.has(el)) return;
  const { cx, cy, rx, ry } = ellipseAttrs(el);
  const anchors = getAnchorPoints(cx, cy, rx, ry);
  const dots = [];
  for (const [label, pos] of Object.entries(anchors)) {
    const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    circle.setAttribute('cx', pos.x);
    circle.setAttribute('cy', pos.y);
    circle.setAttribute('r', ANCHOR_DOT_RADIUS);
    circle.setAttribute('fill', '#ffffff');
    circle.setAttribute('stroke', '#3b82f6');
    circle.setAttribute('stroke-width', '2');
    circle.setAttribute('class', ANCHOR_CLASS);
    // Store references for mousedown delegation in app.js
    circle._anchorEllipse = el;
    circle._anchorLabel = label;
    // Start hidden by default
    circle.style.display = 'none';
    svg.appendChild(circle);
    dots.push({ label, el: circle });
  }
  _anchorDots.set(el, dots);
}

/**
 * Show anchor dots for a specific ellipse (creates them if needed).
 */
export function showAnchorsForEllipse(el) {
  if (!el.parentNode) return;
  _createDotsForEllipse(el);
  const dots = _anchorDots.get(el);
  if (dots) {
    for (const dot of dots) {
      dot.el.style.display = '';
    }
  }
}

/**
 * Hide anchor dots for a specific ellipse (keeps them cached).
 */
export function hideAnchorsForEllipse(el) {
  const dots = _anchorDots.get(el);
  if (dots) {
    for (const dot of dots) {
      dot.el.style.display = 'none';
    }
  }
}

/**
 * Show anchor dots on all ellipses (legacy compat).
 */
export function showAnchors() {
  const ellipses = svg.querySelectorAll('ellipse');
  for (const el of ellipses) {
    showAnchorsForEllipse(el);
  }
}

/**
 * Hide all anchor dots (legacy compat).
 */
export function hideAnchors() {
  for (const [ellipse, dots] of _anchorDots) {
    for (const dot of dots) {
      dot.el.remove();
    }
  }
  _anchorDots.clear();
}

/**
 * Update anchor dot positions for all cached ellipses (call after shapes are moved/resized).
 */
export function updateAnchors() {
  for (const [ellipse, dots] of _anchorDots) {
    // Skip removed ellipses
    if (!ellipse.parentNode) {
      dots.forEach(d => d.el.remove());
      _anchorDots.delete(ellipse);
      continue;
    }
    const { cx, cy, rx, ry } = ellipseAttrs(ellipse);
    const anchors = getAnchorPoints(cx, cy, rx, ry);
    for (const dot of dots) {
      const pos = anchors[dot.label];
      dot.el.setAttribute('cx', pos.x);
      dot.el.setAttribute('cy', pos.y);
    }
  }
}

/**
 * Highlight a specific anchor dot by making it larger and filled.
 * Returns the dot element or null.
 */
export function highlightAnchorDot(ellipse, label) {
  const dots = _anchorDots.get(ellipse);
  if (!dots) return null;
  for (const dot of dots) {
    if (dot.label === label) {
      dot.el.setAttribute('r', ANCHOR_DOT_RADIUS + 3);
      dot.el.setAttribute('fill', '#3b82f6');
      return dot.el;
    }
  }
  return null;
}

/**
 * Unhighlight all anchor dots (reset to default appearance).
 */
export function unhighlightAllAnchors() {
  for (const dots of _anchorDots.values()) {
    for (const dot of dots) {
      dot.el.setAttribute('r', ANCHOR_DOT_RADIUS);
      dot.el.setAttribute('fill', '#ffffff');
    }
  }
}

// ── Arrow path & anchors ─────────────────────────────────

/**
 * Build a cubic-bezier path string from the arrow's waypoints.
 * Each consecutive pair in _points becomes a cubic bezier segment.
 * Anchored endpoints use direction-away-from-center control points;
 * intermediate waypoints use ⅓-⅔ default control points for smooth flow.
 */
export function updateArrowPath(group) {
  const points = group._points;
  if (!points || points.length < 2) {
    // Fallback for legacy arrows (clipboard paste, etc.)
    const { _x1: x1, _y1: y1, _x2: x2, _y2: y2 } = group;
    const offset = group._offset || 0;
    const cp = getControlPoint(x1, y1, x2, y2, offset);
    const d = 'M ' + x1 + ' ' + y1 + ' Q ' + cp.x + ' ' + cp.y + ' ' + x2 + ' ' + y2;
    group._hitPath.setAttribute('d', d);
    group._visPath.setAttribute('d', d);
    return;
  }

  const startAnchor = group._anchors?.find(a => a.end === 'start');
  const endAnchor = group._anchors?.find(a => a.end === 'end');

  let d = '';
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i];
    const p3 = points[i + 1];

    const segStartAnchor = i === 0 ? startAnchor : null;
    const segEndAnchor = i === points.length - 2 ? endAnchor : null;

    const { cp1x, cp1y, cp2x, cp2y } = computeCubicControlPoints(
      p0.x, p0.y, p3.x, p3.y, segStartAnchor, segEndAnchor
    );

    if (i === 0) {
      d += `M ${p0.x} ${p0.y} C ${cp1x} ${cp1y} ${cp2x} ${cp2y} ${p3.x} ${p3.y}`;
    } else {
      d += ` C ${cp1x} ${cp1y} ${cp2x} ${cp2y} ${p3.x} ${p3.y}`;
    }
  }

  group._hitPath.setAttribute('d', d);
  group._visPath.setAttribute('d', d);
}

/**
 * Insert a waypoint into an arrow at the given SVG coordinates.
 * The waypoint is inserted between the two closest consecutive waypoints.
 * Returns the index of the new waypoint, or -1 if insertion failed.
 */
export function insertArrowWaypoint(group, x, y) {
  const points = group._points;
  if (!points || points.length < 2) return -1;

  // Find which segment the click is closest to by measuring midpoint distance
  let bestSeg = 0;
  let bestDist = Infinity;

  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i];
    const p3 = points[i + 1];
    // Sample the segment midpoint as an approximation
    const mx = (p0.x + p3.x) / 2;
    const my = (p0.y + p3.y) / 2;
    const d = (x - mx) ** 2 + (y - my) ** 2;
    if (d < bestDist) {
      bestDist = d;
      bestSeg = i;
    }
  }

  // Insert the new waypoint after bestSeg
  const newPoint = { x, y };
  points.splice(bestSeg + 1, 0, newPoint);

  // Keep _x1/_y1/_x2/_y2 in sync for backward compat
  group._x1 = points[0].x;
  group._y1 = points[0].y;
  group._x2 = points[points.length - 1].x;
  group._y2 = points[points.length - 1].y;

  updateArrowPath(group);
  return bestSeg + 1;
}

export function setArrowAttrs(group, attrs) {
  // Update the stored coordinates and regenerate the path
  if (attrs.x1 !== undefined) {
    group._x1 = attrs.x1;
    if (group._points && group._points.length > 0) {
      group._points[0].x = attrs.x1;
    }
  }
  if (attrs.y1 !== undefined) {
    group._y1 = attrs.y1;
    if (group._points && group._points.length > 0) {
      group._points[0].y = attrs.y1;
    }
  }
  if (attrs.x2 !== undefined) {
    group._x2 = attrs.x2;
    if (group._points && group._points.length > 0) {
      group._points[group._points.length - 1].x = attrs.x2;
    }
  }
  if (attrs.y2 !== undefined) {
    group._y2 = attrs.y2;
    if (group._points && group._points.length > 0) {
      group._points[group._points.length - 1].y = attrs.y2;
    }
  }
  updateArrowPath(group);
}

export function updateAnchoredArrows(ellipse) {
  const { cx, cy, rx, ry } = ellipseAttrs(ellipse);
  const anchors = getAnchorPoints(cx, cy, rx, ry);
  const arrows = svg.querySelectorAll('g');
  arrows.forEach((group) => {
    if (!group._anchors || group._anchors.length === 0) return;

    const startAnchor = group._anchors.find(a => a.end === 'start');
    const endAnchor = group._anchors.find(a => a.end === 'end');

    if (startAnchor && startAnchor.ellipse === ellipse) {
      // Use the stored anchor label; fall back to 'right' for backward compat
      const label = startAnchor.anchorLabel || 'right';
      const pos = anchors[label];
      if (pos) {
        setArrowAttrs(group, { x1: pos.x, y1: pos.y });
      }
    }

    if (endAnchor && endAnchor.ellipse === ellipse) {
      const label = endAnchor.anchorLabel || 'left';
      const pos = anchors[label];
      if (pos) {
        setArrowAttrs(group, { x2: pos.x, y2: pos.y });
      }
    }
  });
}

// ── Color utilities ─────────────────────────────────────

/**
 * Darken a hex color by the given percentage (0-100).
 * @param {string} hex - Hex color like "#3b82f6"
 * @param {number} percent - Amount to darken (e.g. 40 = 40% darker)
 * @returns {string} Darkened hex color
 */
export function darkenColor(hex, percent) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const factor = 1 - percent / 100;
  const nr = Math.max(0, Math.round(r * factor));
  const ng = Math.max(0, Math.round(g * factor));
  const nb = Math.max(0, Math.round(b * factor));
  return `#${nr.toString(16).padStart(2, '0')}${ng.toString(16).padStart(2, '0')}${nb.toString(16).padStart(2, '0')}`;
}

/**
 * Lighten a hex color by the given percentage (0-100).
 * @param {string} hex - Hex color like "#3b82f6"
 * @param {number} percent - Amount to lighten (e.g. 40 = 40% lighter)
 * @returns {string} Lightened hex color
 */
export function lightenColor(hex, percent) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const factor = 1 + percent / 100;
  const nr = Math.min(255, Math.round(r * factor));
  const ng = Math.min(255, Math.round(g * factor));
  const nb = Math.min(255, Math.round(b * factor));
  return `#${nr.toString(16).padStart(2, '0')}${ng.toString(16).padStart(2, '0')}${nb.toString(16).padStart(2, '0')}`;
}

// ── Arrow marker helpers ────────────────────────────────

/**
 * Apply the current arrow direction (none/mono/dual) to an arrow group,
 * updating marker-start and marker-end on its visPath.
 */
export function applyArrowDirection(group) {
  const direction = group._arrowDirection || 'mono';
  const vis = group._visPath;
  if (!vis) return;

  const color = vis.getAttribute('stroke') || '#3b82f6';
  const safeColor = color.replace('#', '');
  const endMarkerId = 'arrowhead-' + safeColor;
  const startMarkerId = 'arrowhead-start-' + safeColor;

  // Remove both markers
  vis.removeAttribute('marker-start');
  vis.removeAttribute('marker-end');

  if (direction === 'none') return;

  // Ensure end marker exists (unchanged: tip at refX=12 pointing forward)
  let endMarker = document.getElementById(endMarkerId);
  if (!endMarker) {
    endMarker = document.createElementNS('http://www.w3.org/2000/svg', 'marker');
    endMarker.setAttribute('id', endMarkerId);
    endMarker.setAttribute('markerWidth', '12');
    endMarker.setAttribute('markerHeight', '8');
    endMarker.setAttribute('refX', '12');
    endMarker.setAttribute('refY', '4');
    endMarker.setAttribute('orient', 'auto');
    const p = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
    p.setAttribute('points', '0 0, 12 4, 0 8');
    p.setAttribute('fill', color);
    endMarker.appendChild(p);
    defs.appendChild(endMarker);
  }

  vis.setAttribute('marker-end', 'url(#' + endMarkerId + ')');

  // For dual, also add a start marker with reversed tip (refX=0, flipped polygon)
  if (direction === 'dual') {
    let startMarker = document.getElementById(startMarkerId);
    if (!startMarker) {
      startMarker = document.createElementNS('http://www.w3.org/2000/svg', 'marker');
      startMarker.setAttribute('id', startMarkerId);
      startMarker.setAttribute('markerWidth', '12');
      startMarker.setAttribute('markerHeight', '8');
      startMarker.setAttribute('refX', '0');
      startMarker.setAttribute('refY', '4');
      startMarker.setAttribute('orient', 'auto');
      const p = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
      // Reversed triangle: tip at x=0, base at x=12, so arrow points opposite to path direction
      p.setAttribute('points', '12 0, 0 4, 12 8');
      p.setAttribute('fill', color);
      startMarker.appendChild(p);
      defs.appendChild(startMarker);
    }
    vis.setAttribute('marker-start', 'url(#' + startMarkerId + ')');
  }
}

export function updateArrowMarker(lineEl, color) {
  // Delegate to applyArrowDirection which respects the group's direction setting
  const group = lineEl.parentNode;
  if (group) {
    applyArrowDirection(group);
  }
}

// ── Oval text helpers ───────────────────────────────────

/**
 * Word-wrap text into lines that fit within maxWidth at the given fontSize.
 * Uses a temporary SVG text element for accurate measurement.
 */
function wrapText(text, fontSize, maxWidth) {
  if (!text) return [];

  const temp = document.createElementNS('http://www.w3.org/2000/svg', 'text');
  temp.setAttribute('font-size', fontSize + 'px');
  temp.setAttribute('font-family', 'sans-serif');
  svg.appendChild(temp);

  const lines = [];
  const rawLines = text.split('\n');

  for (const rawLine of rawLines) {
    if (rawLine === '') {
      lines.push('');
      continue;
    }
    const words = rawLine.split(' ');
    let currentLine = '';

    for (const word of words) {
      const testLine = currentLine ? currentLine + ' ' + word : word;
      temp.textContent = testLine;
      if (temp.getComputedTextLength() > maxWidth && currentLine) {
        lines.push(currentLine);
        currentLine = word;
      } else {
        currentLine = testLine;
      }
    }
    if (currentLine) lines.push(currentLine);
  }

  svg.removeChild(temp);
  return lines;
}

/**
 * Find the largest font size such that wrapped text fits vertically
 * within the shape (ry * 1.6) and each line fits horizontally (rx * 1.4).
 */
function fitFontSize(text, rx, ry) {
  const maxWidth = Math.max(30, rx * 1.4);
  const maxHeight = ry * 1.6;
  let fontSize = Math.min(rx, ry) * 0.55;

  for (let attempt = 0; attempt < 10; attempt++) {
    const lines = wrapText(text, fontSize, maxWidth);
    const totalHeight = lines.length * fontSize * 1.4;
    if (totalHeight <= maxHeight || fontSize <= 8) break;
    fontSize *= 0.8;
  }

  return Math.max(8, fontSize);
}

function buildTextElement(ellipse, text, textEl) {
  const { cx, cy, rx, ry } = ellipseAttrs(ellipse);
  const maxWidth = Math.max(30, rx * 1.4);
  const fontSize = fitFontSize(text, rx, ry);
  const lineHeight = fontSize * 1.4;
  const lines = wrapText(text, fontSize, maxWidth);

  textEl.setAttribute('x', cx);
  textEl.setAttribute('y', cy);
  textEl.setAttribute('font-size', fontSize + 'px');
  textEl.setAttribute('text-anchor', 'middle');
  textEl.setAttribute('dominant-baseline', 'central');
  textEl.setAttribute('fill', '#ffffff');
  textEl.setAttribute('font-family', 'sans-serif');
  textEl.setAttribute('pointer-events', 'none');
  textEl.setAttribute('user-select', 'none');

  // Vertically center the block of lines
  const totalHeight = lines.length * lineHeight;
  const startY = cy - totalHeight / 2 + lineHeight / 2;

  lines.forEach((line, i) => {
    const tspan = document.createElementNS('http://www.w3.org/2000/svg', 'tspan');
    tspan.setAttribute('x', cx);
    tspan.setAttribute('dy', i === 0 ? (startY - cy) : lineHeight);
    tspan.textContent = line || ' ';
    textEl.appendChild(tspan);
  });

  ellipse._textLines = lines;
}

export function setOvalText(ellipse, text) {
  ellipse._text = text;

  if (ellipse._textEl) {
    ellipse._textEl.remove();
    ellipse._textEl = null;
  }

  if (!text) return;

  const textEl = document.createElementNS('http://www.w3.org/2000/svg', 'text');
  buildTextElement(ellipse, text, textEl);

  svg.appendChild(textEl);
  ellipse._textEl = textEl;
}

export function updateOvalTextPosition(ellipse) {
  if (!ellipse._textEl) return;

  // Clear existing tspans and rebuild
  const tspans = ellipse._textEl.querySelectorAll('tspan');
  for (const t of tspans) t.remove();

  buildTextElement(ellipse, ellipse._text || '', ellipse._textEl);
}

export function removeOvalText(ellipse) {
  if (ellipse._textEl) {
    ellipse._textEl.remove();
    ellipse._textEl = null;
  }
  ellipse._text = null;
}

// ── Event helper ─────────────────────────────────────────

export function preventClick(e) {
  e.stopPropagation();
  e.preventDefault();
}

// ── Multi-element drag ───────────────────────────────────

let _multiDragged = false;
let _dragHappened = false;

export function wasMultiDragged() {
  const val = _multiDragged;
  _multiDragged = false;
  return val;
}

/** General flag: set after any drag (single or multi), cleared on first check */
export function markDragHappened() {
  _dragHappened = true;
}

export function wasDragHappened() {
  const val = _dragHappened;
  _dragHappened = false;
  return val;
}

export function startMultiDrag(e) {
  // Capture initial positions of all selected elements
  const startPos = getPos(e);
  const snapshots = [];

  for (const el of selectedSet) {
    const type = selectedTypes.get(el);
    if (type === 'ellipse' || type === 'node') {
      snapshots.push({
        el,
        type,
        cx: parseFloat(el.getAttribute('cx')),
        cy: parseFloat(el.getAttribute('cy')),
      });
    } else if (type === 'arrow') {
      const points = el._points;
      if (points && points.length >= 2) {
        snapshots.push({
          el,
          type: 'arrow',
          points: points.map(p => ({ x: p.x, y: p.y })),
          x1: el._x1,
          y1: el._y1,
          x2: el._x2,
          y2: el._y2,
        });
      } else {
        snapshots.push({
          el,
          type: 'arrow',
          x1: el._x1,
          y1: el._y1,
          x2: el._x2,
          y2: el._y2,
        });
      }
    } 
  }

  let dragged = false;

  function onMove(me) {
    dragged = true;
    const pos = getPos(me);
    const dx = pos.x - startPos.x;
    const dy = pos.y - startPos.y;

    // First pass: move all ellipses/nodes
    for (const snap of snapshots) {
      if (snap.type === 'ellipse' || snap.type === 'node') {
        snap.el.setAttribute('cx', snap.cx + dx);
        snap.el.setAttribute('cy', snap.cy + dy);
        if (snap.type === 'ellipse') {
          updateOvalTextPosition(snap.el);
        }
      }
    }

    // Second pass: update anchored arrows so their endpoints follow moved nodes,
    // then move unanchored arrows (free arrows not connected to any node)
    for (const snap of snapshots) {
      if (snap.type === 'arrow') {
        if (snap.el._anchors && snap.el._anchors.length > 0) {
          // Anchored arrow: let updateAnchoredArrows handle endpoint positions
          for (const anchor of snap.el._anchors) {
            if (anchor.ellipse && anchor.ellipse.parentNode) {
              updateAnchoredArrows(anchor.ellipse);
            }
          }
        } else if (snap.points) {
          // Free-floating arrow with waypoints: move all points
          const pts = snap.el._points;
          for (let i = 0; i < pts.length; i++) {
            pts[i].x = snap.points[i].x + dx;
            pts[i].y = snap.points[i].y + dy;
          }
          snap.el._x1 = pts[0].x;
          snap.el._y1 = pts[0].y;
          snap.el._x2 = pts[pts.length - 1].x;
          snap.el._y2 = pts[pts.length - 1].y;
          updateArrowPath(snap.el);
        } else {
          // Legacy free-floating arrow: move as a whole
          setArrowAttrs(snap.el, {
            x1: snap.x1 + dx,
            y1: snap.y1 + dy,
            x2: snap.x2 + dx,
            y2: snap.y2 + dy,
          });
        }
      }
    }

    // Update visual anchors after all elements are moved
    for (const snap of snapshots) {
      if (snap.type === 'ellipse' || snap.type === 'node') {
        updateAnchoredArrows(snap.el);
      }
    }
    updateAnchors();
  }

  function onUp() {
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', onUp);
    if (dragged) {
      _multiDragged = true;
      markDragHappened();
      // Suppress the click on all dragged elements so the selection stays intact
      for (const snap of snapshots) {
        snap.el._ignoreNextClick = true;
      }
    }
  }

  document.addEventListener('mousemove', onMove);
  document.addEventListener('mouseup', onUp);
}