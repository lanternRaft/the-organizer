// ── Canvas serialization / deserialization ─────────────────
// Handles saving to and loading from localStorage.

import { svg, INFO, legendColors } from './state.js';
import { NODE_RADIUS } from './node.js';
import { darkenColor, setOvalText, updateArrowPath, applyArrowDirection, updateArrowMarker } from './helpers.js';
import { createShape } from './shape.js';
import { createNode } from './node.js';
import { createArrow } from './arrow.js';
import { deselect, updateLegend } from './select.js';

const STORAGE_KEY = 'organizer-canvas';

// ── Serialization ─────────────────────────────────────────

/**
 * Walk all serializable SVG children (skip <defs>) and produce
 * a plain-JSON representation of every shape, node, and arrow.
 * Anchor references are stored as element-index pointers so that
 * deserialization can reconstruct the DOM references.
 */
export function serializeCanvas() {
  const elements = [];
  const children = svg.children;

  for (let i = 0; i < children.length; i++) {
    const el = children[i];
    if (el.tagName === 'defs') continue;

    if (el.tagName === 'ellipse') {
      const rx = parseFloat(el.getAttribute('rx'));
      const cx = parseFloat(el.getAttribute('cx'));
      const cy = parseFloat(el.getAttribute('cy'));
      const fill = el.getAttribute('fill');

      if (rx <= NODE_RADIUS + 2) {
        // Node
        elements.push({ type: 'node', cx, cy, fill });
      } else {
        // Shape / label
        elements.push({
          type: 'ellipse',
          cx,
          cy,
          rx,
          ry: parseFloat(el.getAttribute('ry')),
          fill,
          text: el._text || null,
        });
      }
    } else if (el.tagName === 'g' && el._visPath) {
      // Arrow group
      const visPath = el._visPath;
      const color = visPath.getAttribute('stroke') || '#3b82f6';

      // Resolve anchor ellipse references to element indices
      const serAnchors = [];
      if (el._anchors) {
        for (const anchor of el._anchors) {
          const ellipseIndex = findElementIndex(anchor.ellipse);
          if (ellipseIndex !== -1) {
            serAnchors.push({
              end: anchor.end,
              elementIndex: ellipseIndex,
              anchorLabel: anchor.anchorLabel,
            });
          }
        }
      }

      elements.push({
        type: 'arrow',
        points: el._points
          ? el._points.map(p => ({ x: p.x, y: p.y }))
          : [{ x: el._x1, y: el._y1 }, { x: el._x2, y: el._y2 }],
        anchors: serAnchors,
        direction: el._arrowDirection || 'mono',
        color,
      });
    }
  }

  // Serialize legend
  const legend = [];
  for (const [color, data] of legendColors) {
    legend.push([color, { customName: data.customName }]);
  }

  return { elements, legend };
}

/**
 * Find the index of a given SVG element among the serializable children,
 * counting only non-<defs> children.
 */
function findElementIndex(targetEl) {
  const children = svg.children;
  let idx = 0;
  for (let i = 0; i < children.length; i++) {
    if (children[i].tagName === 'defs') continue;
    if (children[i] === targetEl) return idx;
    idx++;
  }
  return -1;
}

// ── Persistence ───────────────────────────────────────────

export function saveToLocalStorage() {
  try {
    const state = serializeCanvas();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    console.warn('Failed to save canvas state:', e);
  }
}

// ── Deserialization ───────────────────────────────────────

/**
 * Clear the canvas and restore state from localStorage.
 * Returns true if state was restored, false if nothing saved.
 */
export function loadFromLocalStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return false;

    const state = JSON.parse(raw);
    if (!state || !state.elements) return false;

    // Clear everything
    clearCanvasElements();

    // ── First pass: create all ellipses / nodes ────────────
    const created = []; // parallel array: same indices as state.elements
    for (const data of state.elements) {
      let el;
      if (data.type === 'ellipse') {
        el = createShape(data.cx, data.cy);
        el.setAttribute('rx', data.rx);
        el.setAttribute('ry', data.ry);
        el.setAttribute('fill', data.fill);
        el.setAttribute('stroke', darkenColor(data.fill, 40));
        if (data.text) {
          setOvalText(el, data.text);
        }
      } else if (data.type === 'node') {
        el = createNode(data.cx, data.cy);
        if (data.fill) {
          el.setAttribute('fill', data.fill);
          el.setAttribute('stroke', darkenColor(data.fill, 40));
        }
      } else {
        // Arrow – create later; push placeholder
        el = null;
      }
      created.push(el);
    }

    // ── Second pass: create arrows (ellipses must exist) ───
    for (let i = 0; i < state.elements.length; i++) {
      const data = state.elements[i];
      if (data.type !== 'arrow') continue;

      const pts = data.points;
      const startPos = pts[0];
      const endPos = pts[pts.length - 1];

      // Resolve anchor references to actual DOM elements
      let startAnchorEl = null;
      let endAnchorEl = null;
      let startAnchorLabel = null;
      let endAnchorLabel = null;

      if (data.anchors) {
        for (const a of data.anchors) {
          const refEl = created[a.elementIndex];
          if (refEl && refEl.parentNode) {
            if (a.end === 'start') {
              startAnchorEl = refEl;
              startAnchorLabel = a.anchorLabel;
            } else {
              endAnchorEl = refEl;
              endAnchorLabel = a.anchorLabel;
            }
          }
        }
      }

      const group = createArrow(
        startPos.x, startPos.y,
        endPos.x, endPos.y,
        startAnchorEl, endAnchorEl,
        startAnchorLabel, endAnchorLabel
      );

      // Restore full waypoints if more than 2
      if (pts.length > 2) {
        group._points = pts.map(p => ({ x: p.x, y: p.y }));
        // Keep _x1/_y1/_x2/_y2 in sync
        group._x1 = pts[0].x;
        group._y1 = pts[0].y;
        group._x2 = pts[pts.length - 1].x;
        group._y2 = pts[pts.length - 1].y;
        // Rebuild path with all waypoints
        updateArrowPath(group);
        applyArrowDirection(group);
      }

      // Restore direction
      if (data.direction && data.direction !== 'mono') {
        group._arrowDirection = data.direction;
        applyArrowDirection(group);
      }

      // Restore custom color
      if (data.color && data.color !== '#3b82f6') {
        group._visPath.setAttribute('stroke', data.color);
        group._visPath.setAttribute('data-original-color', data.color);
        updateArrowMarker(group._visPath, data.color);
      }

      created[i] = group;
    }

    // ── Restore legend ──────────────────────────────────────
    legendColors.clear();
    if (state.legend) {
      for (const [color, entry] of state.legend) {
        legendColors.set(color, { customName: entry.customName || null });
      }
    }
    updateLegend();

    return true;
  } catch (e) {
    console.warn('Failed to load canvas state:', e);
    return false;
  }
}

// ── Clear ─────────────────────────────────────────────────

function clearCanvasElements() {
  // Remove all children except <defs>
  const children = [...svg.children];
  for (const child of children) {
    if (child.tagName !== 'defs') {
      child.remove();
    }
  }
}

export function clearAndSave() {
  clearCanvasElements();
  deselect();
  legendColors.clear();
  updateLegend();
  saveToLocalStorage();
}