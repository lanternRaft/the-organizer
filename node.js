// ── Node creation (small fixed-size circles, colorable, no resize) ──

import { svg, selectedSet, selectedTypes, notifyCanvasChanged } from './state.js';
import { getPos, darkenColor, startMultiDrag, updateAnchors, updateAnchoredArrows } from './helpers.js';
import { selectElement, hideContextMenu } from './select.js';

export const NODE_RADIUS = 8;

/**
 * Create a node (small fixed-size circle element).
 * Nodes are <ellipse> elements with rx=ry=NODE_RADIUS so they integrate
 * seamlessly with the existing anchor / arrow system.
 *
 * @param {number} x - Canvas x position
 * @param {number} y - Canvas y position
 * @returns {SVGEllipseElement} The created node element
 */
export function createNode(x, y) {
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

  // ── Click → select the node ──────────────────────────────
  circle.addEventListener('click', (e) => {
    // If this click follows a drag on this element, suppress it to preserve the selection set
    if (circle._ignoreNextClick) {
      circle._ignoreNextClick = false;
      e.stopPropagation();
      return;
    }
    e.stopPropagation();
    selectElement(circle, 'node', e.shiftKey);
  });

  // ── Mousedown → drag the node ───────────────────────────
  circle.addEventListener('mousedown', (e) => {
    // If not already selected, select it first (skip for Shift+click; let click handler handle toggling)
    if (!selectedSet.has(circle)) {
      if (e.shiftKey) return;
      selectElement(circle, 'node', false);
      // Suppress the click that follows to avoid re-running selectElement
      circle._ignoreNextClick = true;
    }
    if (selectedTypes.get(circle) !== 'node') return;

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
    const startCx = parseFloat(circle.getAttribute('cx'));
    const startCy = parseFloat(circle.getAttribute('cy'));
    let dragged = false;

    function onMove(me) {
      dragged = true;
      hideContextMenu();
      const pos = getPos(me);
      const dx = pos.x - startPos.x;
      const dy = pos.y - startPos.y;
      circle.setAttribute('cx', startCx + dx);
      circle.setAttribute('cy', startCy + dy);
      updateAnchoredArrows(circle);
      updateAnchors();
    }

    function onUp() {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      if (dragged) {
        circle._ignoreNextClick = true;
        notifyCanvasChanged();
      }
    }

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  });

  svg.appendChild(circle);
  notifyCanvasChanged();
  return circle;
}
