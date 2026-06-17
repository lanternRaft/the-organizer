// ── Shared mutable state ──────────────────────────────────

export const svg = document.getElementById('canvas');
export const bgRect = svg.querySelector('rect');
export const INFO = document.querySelector('#info');
export const ctxMenu = document.getElementById('ctx-menu');
export const legendEl = document.getElementById('legend');

export let currentTool = 'select'; // 'select', 'oval', or 'arrow'
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