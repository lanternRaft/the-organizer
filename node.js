// ── Node creation (small fixed-size circles / triangles, colorable, no resize) ──

import { svg, selectedSet, selectedTypes, notifyCanvasChanged } from './state.js';
import { getPos, darkenColor, startMultiDrag, updateAnchors, updateAnchoredArrows, snapToGrid } from './helpers.js';
import { selectElement, hideContextMenu } from './select.js';

export const NODE_RADIUS = 8;
export const NODE_SIZE = 8; // circumradius for triangle nodes

/**
 * Create a node. In 'circle' mode (default), creates an <ellipse> with
 * rx=ry=NODE_RADIUS. In 'triangle' mode, creates a <polygon> forming an
 * equilateral triangle pointing up, inscribed in a circle of radius NODE_SIZE.
 *
 * @param {number} x - Canvas x position
 * @param {number} y - Canvas y position
 * @param {string} [mode='circle'] - 'circle' or 'triangle'
 * @returns {SVGElement} The created node element
 */
export function createNode(x, y, mode = 'circle') {
  if (mode === 'triangle') {
    return createTriangleNode(x, y);
  }
  return createCircleNode(x, y);
}

/**
 * Create a circle node (<ellipse> with rx=ry=NODE_RADIUS).
 */
function createCircleNode(x, y) {
  const circle = document.createElementNS('http://www.w3.org/2000/svg', 'ellipse');
  circle.setAttribute('cx', x);
  circle.setAttribute('cy', y);
  circle.setAttribute('rx', NODE_RADIUS);
  circle.setAttribute('ry', NODE_RADIUS);
  circle.setAttribute('fill', '#3b82f6');
  circle.setAttribute('opacity', '0.9');
  circle.setAttribute('stroke', darkenColor('#3b82f6', 40));
  circle.setAttribute('stroke-width', '2');
  circle.style.cursor = 'pointer';
  circle._nodeShape = 'circle';

  attachNodeEvents(circle);

  svg.appendChild(circle);
  notifyCanvasChanged();
  return circle;
}

/**
 * Create a triangle node (<polygon> — equilateral triangle pointing up).
 */
function createTriangleNode(x, y) {
  const r = NODE_SIZE;
  const cos30 = Math.cos(Math.PI / 6);
  const sin30 = Math.sin(Math.PI / 6);
  // Vertices: top, bottom-left, bottom-right
  const v1 = { x: x,       y: y - r };
  const v2 = { x: x - r * cos30, y: y + r * sin30 };
  const v3 = { x: x + r * cos30, y: y + r * sin30 };

  const poly = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
  poly.setAttribute('points', `${v1.x},${v1.y} ${v2.x},${v2.y} ${v3.x},${v3.y}`);
  // Store cx/cy/rx/ry attrs so the anchor system can read them
  poly.setAttribute('cx', x);
  poly.setAttribute('cy', y);
  poly.setAttribute('rx', r);
  poly.setAttribute('ry', r);
  poly.setAttribute('fill', '#3b82f6');
  poly.setAttribute('opacity', '0.9');
  poly.setAttribute('stroke', darkenColor('#3b82f6', 40));
  poly.setAttribute('stroke-width', '2');
  poly.style.cursor = 'pointer';
  poly._nodeShape = 'triangle';

  attachNodeEvents(poly);

  svg.appendChild(poly);
  notifyCanvasChanged();
  return poly;
}

/**
 * Attach click / mousedown event listeners shared by both node types.
 */
function attachNodeEvents(el) {
  // ── Click → select the node ──────────────────────────────
  el.addEventListener('click', (e) => {
    // If this click follows a drag on this element, suppress it to preserve the selection set
    if (el._ignoreNextClick) {
      el._ignoreNextClick = false;
      e.stopPropagation();
      return;
    }
    e.stopPropagation();
    selectElement(el, 'node', e.shiftKey);
  });

  // ── Mousedown → drag the node ───────────────────────────
  el.addEventListener('mousedown', (e) => {
    // If not already selected, select it first (skip for Shift+click; let click handler handle toggling)
    if (!selectedSet.has(el)) {
      if (e.shiftKey) return;
      selectElement(el, 'node', false);
      // Suppress the click that follows to avoid re-running selectElement
      el._ignoreNextClick = true;
    }
    if (selectedTypes.get(el) !== 'node') return;

    // Multi-drag: move all selected elements together
    if (selectedSet.size > 1) {
      e.stopPropagation();
      e.preventDefault();
      hideContextMenu();
      startMultiDrag(e);
      return;
    }

    e.stopPropagation();
    e.preventDefault();

    const startPos = getPos(e);
    const startCx = parseFloat(el.getAttribute('cx'));
    const startCy = parseFloat(el.getAttribute('cy'));
    let dragged = false;

    function onMove(me) {
      dragged = true;
      hideContextMenu();
      const pos = getPos(me);
      const dx = pos.x - startPos.x;
      const dy = pos.y - startPos.y;
      const newCx = snapToGrid(startCx + dx);
      const newCy = snapToGrid(startCy + dy);
      el.setAttribute('cx', newCx);
      el.setAttribute('cy', newCy);
      if (el._nodeShape === 'triangle') {
        updateTriangleVertices(el, newCx, newCy);
      }
      updateAnchoredArrows(el);
      updateAnchors();
    }

    function onUp() {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      if (dragged) {
        el._ignoreNextClick = true;
        notifyCanvasChanged();
      }
    }

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  });
}

/**
 * Update polygon points when a triangle node is moved.
 */
function updateTriangleVertices(poly, cx, cy) {
  const r = NODE_SIZE;
  const cos30 = Math.cos(Math.PI / 6);
  const sin30 = Math.sin(Math.PI / 6);
  const v1 = { x: cx,           y: cy - r };
  const v2 = { x: cx - r * cos30, y: cy + r * sin30 };
  const v3 = { x: cx + r * cos30, y: cy + r * sin30 };
  poly.setAttribute('points', `${v1.x},${v1.y} ${v2.x},${v2.y} ${v3.x},${v3.y}`);
}
