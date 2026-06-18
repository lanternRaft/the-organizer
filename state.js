// ── Shared mutable state ──────────────────────────────────

export const svg = document.getElementById('canvas');
export const INFO = document.querySelector('#info');
export const selMenu = document.getElementById('selection-menu');
export const colorPalette = document.getElementById('color-palette-popup');
export const legendEl = document.getElementById('legend');

export let currentTool = 'select'; // 'select', 'shape', or 'node'
export let shapeMode = 'oval'; // 'oval' or 'circle'
export let selected = null;       // Primary SVG element (for handles/drag)
export let selectedType = null;   // 'ellipse' or 'arrow'
export const selectedSet = new Set();   // All selected SVG elements
export const selectedTypes = new Map(); // SVG element -> type
export const handles = [];
export const HANDLE_SIZE = 10;
export const legendColors = new Map(); // color -> { customName: string | null }

export const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');

export function setCurrentTool(tool) {
  currentTool = tool;
}

export function setShapeMode(mode) {
  shapeMode = mode;
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