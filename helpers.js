// ── Pure utility functions & DOM helpers ──────────────────

import { svg, defs, selectedSet, selectedTypes, notifyCanvasChanged } from './state.js';

// ── Coordinate helpers ────────────────────────────────────

export function getPos(e) {
  const r = svg.getBoundingClientRect();
  return { x: e.clientX - r.left, y: e.clientY - r.top };
}

export const GRID_SNAP = 10;
export function snapToGrid(val) {
  return Math.round(val / GRID_SNAP) * GRID_SNAP;
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

// ── Arrow marker constants ────────────────────────────────

const ARROWHEAD_WIDTH = 9.6;
const ARROWHEAD_HEIGHT = 6.4;
const ARROWHEAD_ANCHOR_EXT = 15; // straight-line extension from anchor edge (shrunk to leave room for marker tip)

/**
 * Get the 4 cardinal anchor points for an ellipse at the ellipse edge.
 * These positions are used as actual arrow endpoints.
 * Positions: top, left, bottom, right (relative to the shape's center).
 */
const ANCHOR_OFFSET = 5;
export function getAnchorPoints(cx, cy, rx, ry) {
  return {
    top:    { x: cx,      y: cy - ry,           label: 'top' },
    left:   { x: cx - rx, y: cy,                label: 'left' },
    bottom: { x: cx,      y: cy + ry,           label: 'bottom' },
    right:  { x: cx + rx, y: cy,                label: 'right' },
  };
}

/**
 * Get the 4 anchor dot positions — each offset ANCHOR_OFFSET px outward
 * from the ellipse edge. Used for dot rendering and snap hit-testing so the
 * visible handle and the snap zone match, while the arrow still ends at the edge.
 */
export function getAnchorDotPoints(cx, cy, rx, ry) {
  return {
    top:    { x: cx,                      y: cy - ry - ANCHOR_OFFSET, label: 'top' },
    left:   { x: cx - rx - ANCHOR_OFFSET, y: cy,                      label: 'left' },
    bottom: { x: cx,                      y: cy + ry + ANCHOR_OFFSET, label: 'bottom' },
    right:  { x: cx + rx + ANCHOR_OFFSET, y: cy,                      label: 'right' },
  };
}

/**
 * Find the nearest anchor point within ANCHOR_SNAP_RADIUS of the given position.
 * Snap detection is based on the dot's visual position (getAnchorDotPoints) so
 * hovering over the visible handle triggers correctly, but anchorPos returned is
 * the edge position used as the actual arrow endpoint.
 * Returns { ellipse, anchorPos, anchorLabel } or null.
 */
export function findAnchorNear(pos, threshold = ANCHOR_SNAP_RADIUS) {
  const ellipses = svg.querySelectorAll('ellipse');
  let best = null;
  let bestDist = threshold;

  for (const el of ellipses) {
    const { cx, cy, rx, ry } = ellipseAttrs(el);
    const dotPoints  = getAnchorDotPoints(cx, cy, rx, ry);
    const edgePoints = getAnchorPoints(cx, cy, rx, ry);
    for (const [label, dotPos] of Object.entries(dotPoints)) {
      const dx = pos.x - dotPos.x;
      const dy = pos.y - dotPos.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < bestDist) {
        bestDist = dist;
        best = { ellipse: el, anchorPos: edgePoints[label], anchorLabel: label };
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
  const anchors = getAnchorDotPoints(cx, cy, rx, ry);
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
    const dotAnchors = getAnchorDotPoints(cx, cy, rx, ry);
    for (const dot of dots) {
      const pos = dotAnchors[dot.label];
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
 * Get the outward direction vector for an anchor label.
 */
function getAnchorDir(label) {
  switch (label) {
    case 'top':    return { x: 0, y: -1 };
    case 'left':   return { x: -1, y: 0 };
    case 'bottom': return { x: 0, y: 1 };
    case 'right':  return { x: 1, y: 0 };
    default:       return { x: 0, y: 0 };
  }
}

/**
 * Compute the SVG path string for a waypoint-based arrow using Catmull-Rom
 * tangents so curves flow smoothly through every intermediate waypoint (C1
 * continuity — no sharp kinks).
 *
 * Algorithm:
 *  1. Build a "nodes" array of the points the bezier actually passes through.
 *     Anchored endpoints are replaced by an extension point (ARROWHEAD_ANCHOR_EXT px
 *     outward) so the curve exits/enters shapes orthogonally.
 *  2. Compute a unit tangent at every node:
 *     • Anchored start/end: the anchor's outward cardinal direction.
 *     • First/last unanchored: direction along the first/last segment.
 *     • Intermediate nodes: Catmull-Rom — normalize(next − prev).
 *  3. For each segment i→i+1, the control points are:
 *     cp1 = node[i]   + tangent[i]   * dist   (outgoing)
 *     cp2 = node[i+1] − tangent[i+1] * dist   (incoming)
 *  4. Anchored endpoints re-attach the straight L segment to the actual
 *     ellipse edge so the arrowhead tip lands exactly on the shape.
 */
export function getArrowPathString(points, startAnchor, endAnchor) {
  if (!points || points.length < 2) return '';

  const hasStartAnchor = !!(startAnchor?.ellipse?.parentNode);
  const hasEndAnchor   = !!(endAnchor?.ellipse?.parentNode);

  // ── Build nodes: the points the cubic bezier passes through ──────────
  // Anchored endpoints are replaced by their outward extension.
  const pFirst = points[0];
  const pLast  = points[points.length - 1];

  let startExt = null;
  if (hasStartAnchor) {
    const dir = getAnchorDir(startAnchor.anchorLabel);
    startExt = { x: pFirst.x + dir.x * ARROWHEAD_ANCHOR_EXT, y: pFirst.y + dir.y * ARROWHEAD_ANCHOR_EXT };
  }
  let endExt = null;
  if (hasEndAnchor) {
    const dir = getAnchorDir(endAnchor.anchorLabel);
    endExt = { x: pLast.x + dir.x * ARROWHEAD_ANCHOR_EXT, y: pLast.y + dir.y * ARROWHEAD_ANCHOR_EXT };
  }

  const nodes = [];
  nodes.push(startExt ?? pFirst);
  for (let i = 1; i < points.length - 1; i++) nodes.push(points[i]);
  nodes.push(endExt ?? pLast);

  // ── Compute Catmull-Rom unit tangents at every node ───────────────────
  const tangents = nodes.map((_, i) => {
    if (i === 0) {
      // Anchored start: outward cardinal direction
      if (hasStartAnchor) return getAnchorDir(startAnchor.anchorLabel);
      // Unanchored: direction toward next node
      const dx = nodes[1].x - nodes[0].x, dy = nodes[1].y - nodes[0].y;
      const len = Math.sqrt(dx * dx + dy * dy) || 1;
      return { x: dx / len, y: dy / len };
    }
    if (i === nodes.length - 1) {
      // Anchored end: use the INWARD direction as the tangent.
      // Because cp2 = endExt − tangent × dist, using inward gives
      // cp2 = endExt + outward × dist — further outside the shape —
      // so the curve approaches endExt coming from outside, not doubling back.
      if (hasEndAnchor) {
        const dir = getAnchorDir(endAnchor.anchorLabel);
        return { x: -dir.x, y: -dir.y };
      }
      // Unanchored: direction from previous node
      const dx = nodes[i].x - nodes[i - 1].x, dy = nodes[i].y - nodes[i - 1].y;
      const len = Math.sqrt(dx * dx + dy * dy) || 1;
      return { x: dx / len, y: dy / len };
    }
    // Intermediate: Catmull-Rom tangent — direction from prev to next
    const dx = nodes[i + 1].x - nodes[i - 1].x, dy = nodes[i + 1].y - nodes[i - 1].y;
    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    return { x: dx / len, y: dy / len };
  });

  // ── Assemble the SVG path ─────────────────────────────────────────────
  let d = `M ${pFirst.x} ${pFirst.y}`;
  if (startExt) d += ` L ${startExt.x} ${startExt.y}`;

  for (let i = 0; i < nodes.length - 1; i++) {
    const n1 = nodes[i];
    const n2 = nodes[i + 1];
    const dx = n2.x - n1.x, dy = n2.y - n1.y;
    const segLen = Math.sqrt(dx * dx + dy * dy);
    // Control-point reach: at least 30px, at most 100px, proportional to segment length
    const dist = Math.max(30, Math.min(100, segLen * 0.35));

    const t1 = tangents[i];
    const t2 = tangents[i + 1];
    const cp1x = n1.x + t1.x * dist;
    const cp1y = n1.y + t1.y * dist;
    const cp2x = n2.x - t2.x * dist;
    const cp2y = n2.y - t2.y * dist;

    d += ` C ${cp1x} ${cp1y} ${cp2x} ${cp2y} ${n2.x} ${n2.y}`;
  }

  // Re-attach straight line back to the actual ellipse edge for anchored end
  if (endExt) d += ` L ${pLast.x} ${pLast.y}`;

  return d;
}

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

  const d = getArrowPathString(points, startAnchor, endAnchor);

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
  notifyCanvasChanged();
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

  // Always update end marker to reflect current ARROWHEAD constants
  let endMarker = document.getElementById(endMarkerId);
  if (!endMarker) {
    endMarker = document.createElementNS('http://www.w3.org/2000/svg', 'marker');
    endMarker.setAttribute('id', endMarkerId);
    defs.appendChild(endMarker);
  }
  // Remove old polygon if present so we recreate with correct geometry
  while (endMarker.firstChild) endMarker.removeChild(endMarker.firstChild);
  endMarker.setAttribute('markerWidth', String(ARROWHEAD_WIDTH));
  endMarker.setAttribute('markerHeight', String(ARROWHEAD_HEIGHT));
  // refX at the tip position so the tip lands exactly at the path endpoint (no gap)
  endMarker.setAttribute('refX', String(ARROWHEAD_WIDTH));
  endMarker.setAttribute('refY', String(ARROWHEAD_HEIGHT / 2));
  endMarker.setAttribute('orient', 'auto');
  const ep = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
  // Classic arrowhead: tip faces forward (+x) at refX, base trails behind at x=0
  ep.setAttribute('points', `0 0, ${ARROWHEAD_WIDTH} ${ARROWHEAD_HEIGHT / 2}, 0 ${ARROWHEAD_HEIGHT}`);
  ep.setAttribute('fill', color);
  endMarker.appendChild(ep);

  vis.setAttribute('marker-end', 'url(#' + endMarkerId + ')');

  // For dual, always update the start marker too
  if (direction === 'dual') {
    let startMarker = document.getElementById(startMarkerId);
    if (!startMarker) {
      startMarker = document.createElementNS('http://www.w3.org/2000/svg', 'marker');
      startMarker.setAttribute('id', startMarkerId);
      defs.appendChild(startMarker);
    }
    while (startMarker.firstChild) startMarker.removeChild(startMarker.firstChild);
    startMarker.setAttribute('markerWidth', String(ARROWHEAD_WIDTH));
    startMarker.setAttribute('markerHeight', String(ARROWHEAD_HEIGHT));
    // For marker-start, refX=0 places the base at the path start; tip extends backward.
    startMarker.setAttribute('refX', '0');
    startMarker.setAttribute('refY', String(ARROWHEAD_HEIGHT / 2));
    startMarker.setAttribute('orient', 'auto');
    const sp = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
    // Reversed: tip faces backward at x=ARROWHEAD_WIDTH, base at x=0.
    // orient="auto" mirrors it so the tip points INTO the start shape.
    sp.setAttribute('points', `${ARROWHEAD_WIDTH} 0, 0 ${ARROWHEAD_HEIGHT / 2}, ${ARROWHEAD_WIDTH} ${ARROWHEAD_HEIGHT}`);
    sp.setAttribute('fill', color);
    startMarker.appendChild(sp);
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
  notifyCanvasChanged();
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
        snap.el.setAttribute('cx', snapToGrid(snap.cx + dx));
        snap.el.setAttribute('cy', snapToGrid(snap.cy + dy));
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
      notifyCanvasChanged();
    }
  }

  document.addEventListener('mousemove', onMove);
  document.addEventListener('mouseup', onUp);
}