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

// ── Curve helpers ────────────────────────────────────────

export function getControlPoint(x1, y1, x2, y2, offset) {
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len < 1) return { x: mx, y: my };
  // Perpendicular unit vector
  const nx = -dy / len;
  const ny = dx / len;
  return { x: mx + nx * offset, y: my + ny * offset };
}

export function getArrowMidpoint(x1, y1, x2, y2, offset) {
  // Quadratic bezier at t=0.5: B(0.5) = 0.25*P0 + 0.5*P1 + 0.25*P2
  const cp = getControlPoint(x1, y1, x2, y2, offset);
  return {
    x: 0.25 * x1 + 0.5 * cp.x + 0.25 * x2,
    y: 0.25 * y1 + 0.5 * cp.y + 0.25 * y2,
  };
}

// ── Arrow path & anchors ─────────────────────────────────

export function updateArrowPath(group) {
  const { _x1: x1, _y1: y1, _x2: x2, _y2: y2 } = group;
  const offset = group._offset || 0;
  const cp = getControlPoint(x1, y1, x2, y2, offset);
  const d = 'M ' + x1 + ' ' + y1 + ' Q ' + cp.x + ' ' + cp.y + ' ' + x2 + ' ' + y2;
  group._hitPath.setAttribute('d', d);
  group._visPath.setAttribute('d', d);
}

export function setArrowAttrs(group, attrs) {
  // Update the stored coordinates and regenerate the path
  if (attrs.x1 !== undefined) group._x1 = attrs.x1;
  if (attrs.y1 !== undefined) group._y1 = attrs.y1;
  if (attrs.x2 !== undefined) group._x2 = attrs.x2;
  if (attrs.y2 !== undefined) group._y2 = attrs.y2;
  updateArrowPath(group);
}

export function updateAnchoredArrows(ellipse) {
  const { cx, cy, rx, ry } = ellipseAttrs(ellipse);
  const arrows = svg.querySelectorAll('g');
  arrows.forEach((group) => {
    if (!group._anchors || group._anchors.length === 0) return;
    const cur = lineAttrs(group);

    const startAnchor = group._anchors.find(a => a.end === 'start');
    const endAnchor = group._anchors.find(a => a.end === 'end');

    if (startAnchor && startAnchor.ellipse === ellipse) {
      const edge = getEllipseEdgePoint(cx, cy, rx, ry, cur.x2, cur.y2);
      setArrowAttrs(group, { x1: edge.x, y1: edge.y });
    }

    if (endAnchor && endAnchor.ellipse === ellipse) {
      // Re-read in case start was just updated
      const cur2 = lineAttrs(group);
      const edge = getEllipseEdgePoint(cx, cy, rx, ry, cur2.x1, cur2.y1);
      setArrowAttrs(group, { x2: edge.x, y2: edge.y });
    }
  });
}

// ── Arrow marker helpers ────────────────────────────────

export function updateArrowMarker(lineEl, color) {
  // Remove old marker
  lineEl.removeAttribute('marker-end');
  // Create a new marker with the right color
  const markerId = 'arrowhead-' + color.replace('#', '');
  let existing = document.getElementById(markerId);
  if (!existing) {
    existing = document.createElementNS('http://www.w3.org/2000/svg', 'marker');
    existing.setAttribute('id', markerId);
    existing.setAttribute('markerWidth', '12');
    existing.setAttribute('markerHeight', '8');
    existing.setAttribute('refX', '12');
    existing.setAttribute('refY', '4');
    existing.setAttribute('orient', 'auto');
    const p = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
    p.setAttribute('points', '0 0, 12 4, 0 8');
    p.setAttribute('fill', color);
    existing.appendChild(p);
    defs.appendChild(existing);
  }
  lineEl.setAttribute('marker-end', 'url(#' + markerId + ')');
}

// ── Oval text helpers ───────────────────────────────────

export function setOvalText(ellipse, text) {
  ellipse._text = text;

  // Remove existing text element if any
  if (ellipse._textEl) {
    ellipse._textEl.remove();
    ellipse._textEl = null;
  }

  if (!text) return;

  const textEl = document.createElementNS('http://www.w3.org/2000/svg', 'text');
  const { cx, cy, rx, ry } = ellipseAttrs(ellipse);
  textEl.setAttribute('x', cx);
  textEl.setAttribute('y', cy);
  textEl.setAttribute('text-anchor', 'middle');
  textEl.setAttribute('dominant-baseline', 'central');
  textEl.setAttribute('fill', '#ffffff');
  textEl.setAttribute('font-size', Math.min(rx, ry) * 0.8 + 'px');
  textEl.setAttribute('font-family', 'sans-serif');
  textEl.setAttribute('pointer-events', 'none');
  textEl.setAttribute('user-select', 'none');
  textEl.textContent = text;

  // Reduce font size if text is too wide
  const words = text.length;
  const maxWidth = rx * 1.6;
  const fontSize = Math.min(Math.min(rx, ry) * 0.8, maxWidth / words * 1.2);
  textEl.setAttribute('font-size', Math.max(8, fontSize) + 'px');

  svg.appendChild(textEl);
  ellipse._textEl = textEl;
}

export function updateOvalTextPosition(ellipse) {
  if (!ellipse._textEl) return;
  const { cx, cy, rx, ry } = ellipseAttrs(ellipse);
  ellipse._textEl.setAttribute('x', cx);
  ellipse._textEl.setAttribute('y', cy);
  const fontSize = Math.min(Math.min(rx, ry) * 0.8, rx * 1.6 / (ellipse._text || 'X').length * 1.2);
  ellipse._textEl.setAttribute('font-size', Math.max(8, fontSize) + 'px');
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

export function startMultiDrag(e) {
  // Capture initial positions of all selected elements
  const startPos = getPos(e);
  const snapshots = [];

  for (const el of selectedSet) {
    const type = selectedTypes.get(el);
    if (type === 'ellipse') {
      snapshots.push({
        el,
        type: 'ellipse',
        cx: parseFloat(el.getAttribute('cx')),
        cy: parseFloat(el.getAttribute('cy')),
      });
    } else if (type === 'arrow') {
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

  let dragged = false;

  function onMove(me) {
    dragged = true;
    const pos = getPos(me);
    const dx = pos.x - startPos.x;
    const dy = pos.y - startPos.y;

    for (const snap of snapshots) {
      if (snap.type === 'ellipse') {
        snap.el.setAttribute('cx', snap.cx + dx);
        snap.el.setAttribute('cy', snap.cy + dy);
        updateOvalTextPosition(snap.el);
      } else if (snap.type === 'arrow') {
        setArrowAttrs(snap.el, {
          x1: snap.x1 + dx,
          y1: snap.y1 + dy,
          x2: snap.x2 + dx,
          y2: snap.y2 + dy,
        });
      }
    }

    // Update anchored arrows after all elements are moved
    for (const snap of snapshots) {
      if (snap.type === 'ellipse') {
        updateAnchoredArrows(snap.el);
      }
    }
  }

  function onUp() {
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', onUp);
    if (dragged) {
      // Prevent the click that follows a drag on the element that was mousedowned
      // Find the element that was actually clicked (any selected element)
      // To keep it simple, just prevent click on all selected elements
      for (const snap of snapshots) {
        snap.el.addEventListener('click', preventClick, { once: true });
      }
    }
  }

  document.addEventListener('mousemove', onMove);
  document.addEventListener('mouseup', onUp);
}