// ── Shared mutable state ──────────────────────────────────

export const svg = document.getElementById('canvas');
export const INFO = document.querySelector('#info');
export const selMenu = document.getElementById('selection-menu');
export const colorPalette = document.getElementById('color-palette-popup');
export const legendEl = document.getElementById('legend');

export let currentTool = 'select'; // 'select', 'shape', or 'node'
export let shapeMode = 'oval'; // 'oval' or 'circle'
export let nodeMode = 'circle'; // 'circle' or 'triangle'
export let selected = null;       // Primary SVG element (for handles/drag)
export let selectedType = null;   // 'ellipse' or 'arrow'
export const selectedSet = new Set();   // All selected SVG elements
export const selectedTypes = new Map(); // SVG element -> type
export const handles = [];

// Curve mode: Set of arrow <g> elements that are in "curve mode".
// When active, clicking on the arrow's path body inserts a waypoint.
// Mode is toggled by the curve button in the selection menu.
export const curveModeArrows = new Set();
export const HANDLE_SIZE = 10;
export const legendColors = new Map(); // color -> { customName: string | null }

export const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');

export function setCurrentTool(tool) {
  currentTool = tool;
}

export function setShapeMode(mode) {
  shapeMode = mode;
}

export function setNodeMode(mode) {
  nodeMode = mode;
}

export function setSelected(el, type) {
  selected = el;
  selectedType = type;
}

export function clearSelected() {
  selected = null;
  selectedType = null;
}

export function isSelected(el) {
  return selectedSet.has(el);
}

// ── Pan & Zoom (viewBox) ────────────────────────────────

// Natural canvas dimensions at zoom=1 (set after the SVG is rendered)
export let canvasWidth = 0;
export let canvasHeight = 0;

// Current viewBox state
export const viewBox = { x: 0, y: 0, width: 0, height: 0 };

/**
 * Store the initial (unzoomed) canvas dimensions.
 * Called once after the SVG is first rendered.
 */
export function initCanvasSize() {
  const rect = svg.getBoundingClientRect();
  canvasWidth = rect.width;
  canvasHeight = rect.height;
  viewBox.width = canvasWidth;
  viewBox.height = canvasHeight;
  viewBox.x = 0;
  viewBox.y = 0;
  applyViewBox();
}

/**
 * Apply the current viewBox to the SVG element.
 */
export function applyViewBox() {
  svg.setAttribute('viewBox', `${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}`);
}

/**
 * Update viewBox values and apply them.
 * @param {number} x
 * @param {number} y
 * @param {number} w
 * @param {number} h
 */
export function setViewBox(x, y, w, h) {
  viewBox.x = x;
  viewBox.y = y;
  viewBox.width = w;
  viewBox.height = h;
  applyViewBox();
}

/**
 * Reset zoom/pan to the initial state (fit to canvas).
 */
export function resetViewBox() {
  const rect = svg.getBoundingClientRect();
  canvasWidth = rect.width;
  canvasHeight = rect.height;
  setViewBox(0, 0, canvasWidth, canvasHeight);
}

/**
 * Get the current zoom level (1 = 100%).
 */
export function getZoomLevel() {
  if (!canvasWidth) return 1;
  return canvasWidth / viewBox.width;
}

// ── Canvas change notification (for auto-save) ───────────

const _changeListeners = new Set();

export function onCanvasChange(fn) {
  _changeListeners.add(fn);
}

export function removeCanvasChangeListener(fn) {
  _changeListeners.delete(fn);
}

export function notifyCanvasChanged() {
  for (const fn of _changeListeners) {
    try { fn(); } catch (e) { console.warn('Change listener error:', e); }
  }
}
