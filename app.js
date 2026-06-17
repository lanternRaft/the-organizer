const svg = document.getElementById('canvas');
const bgRect = svg.querySelector('rect');

// ── SVG defs: arrowhead marker ─────────────────────────
const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');

// Toolbar arrowhead (light)
const markerTool = document.createElementNS('http://www.w3.org/2000/svg', 'marker');
markerTool.setAttribute('id', 'tool-arrowhead');
markerTool.setAttribute('markerWidth', '10');
markerTool.setAttribute('markerHeight', '7');
markerTool.setAttribute('refX', '10');
markerTool.setAttribute('refY', '3.5');
markerTool.setAttribute('orient', 'auto');
const polyTool = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
polyTool.setAttribute('points', '0 0, 10 3.5, 0 7');
polyTool.setAttribute('fill', 'currentColor');
markerTool.appendChild(polyTool);
defs.appendChild(markerTool);

// Arrowhead marker for placed arrows (blue default)
const markerArrow = document.createElementNS('http://www.w3.org/2000/svg', 'marker');
markerArrow.setAttribute('id', 'arrowhead');
markerArrow.setAttribute('markerWidth', '12');
markerArrow.setAttribute('markerHeight', '8');
markerArrow.setAttribute('refX', '12');
markerArrow.setAttribute('refY', '4');
markerArrow.setAttribute('orient', 'auto');
const polyArrow = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
polyArrow.setAttribute('points', '0 0, 12 4, 0 8');
polyArrow.setAttribute('fill', '#3b82f6');
markerArrow.appendChild(polyArrow);
defs.appendChild(markerArrow);

// Preview arrowhead (translucent)
const markerPrev = document.createElementNS('http://www.w3.org/2000/svg', 'marker');
markerPrev.setAttribute('id', 'prev-arrowhead');
markerPrev.setAttribute('markerWidth', '12');
markerPrev.setAttribute('markerHeight', '8');
markerPrev.setAttribute('refX', '12');
markerPrev.setAttribute('refY', '4');
markerPrev.setAttribute('orient', 'auto');
const polyPrev = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
polyPrev.setAttribute('points', '0 0, 12 4, 0 8');
polyPrev.setAttribute('fill', 'rgba(59,130,246,0.4)');
markerPrev.appendChild(polyPrev);
defs.appendChild(markerPrev);

svg.insertBefore(defs, svg.firstChild);

// ── State ──────────────────────────────────────────────
let currentTool = 'oval'; // 'oval' or 'arrow'
let selected = null;      // SVG element (ellipse or line)
let selectedType = null;  // 'ellipse' or 'arrow'
const handles = [];
const HANDLE_SIZE = 10;
const INFO = document.querySelector('#info');
const ctxMenu = document.getElementById('ctx-menu');

// Arrow placement state
let arrowStart = null;       // { x, y } | null
let arrowPreviewLine = null; // SVG line element
let arrowPreviewDot = null;  // SVG circle element

// ── Toolbar ────────────────────────────────────────────
const toolbar = document.getElementById('toolbar');
const toolBtns = toolbar.querySelectorAll('.tool-btn');

toolBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    // Cancel any in-progress arrow placement
    cancelArrowPlacement();

    toolBtns.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentTool = btn.getAttribute('data-tool');

    deselect();

    if (currentTool === 'oval') {
      INFO.textContent = 'Click the canvas to place an oval';
    } else {
      INFO.textContent = 'Click to set the arrow start point';
    }
  });
});

// ── Helpers ──────────────────────────────────────────────

function getPos(e) {
  const r = svg.getBoundingClientRect();
  return { x: e.clientX - r.left, y: e.clientY - r.top };
}

function ellipseAttrs(el) {
  return {
    cx: parseFloat(el.getAttribute('cx')),
    cy: parseFloat(el.getAttribute('cy')),
    rx: parseFloat(el.getAttribute('rx')),
    ry: parseFloat(el.getAttribute('ry')),
  };
}

function lineAttrs(el) {
  return {
    x1: parseFloat(el.getAttribute('x1')),
    y1: parseFloat(el.getAttribute('y1')),
    x2: parseFloat(el.getAttribute('x2')),
    y2: parseFloat(el.getAttribute('y2')),
  };
}

// ── Selection ────────────────────────────────────────────

function selectElement(el, type) {
  deselect();
  if (!el) return;
  selected = el;
  selectedType = type;

  if (type === 'ellipse') {
    el.setAttribute('stroke', '#fbbf24');
    el.setAttribute('stroke-width', '3');
    showEllipseHandles(el);
    INFO.textContent = 'Drag a corner handle to resize, or drag the oval to move it';
  } else if (type === 'arrow') {
    el.setAttribute('stroke', '#fbbf24');
    el.setAttribute('stroke-width', '3');
    showLineHandles(el);
    INFO.textContent = 'Drag an endpoint handle to change the arrow length';
  }
}

function deselect() {
  if (selected) {
    if (selectedType === 'ellipse') {
      selected.setAttribute('stroke', '#60a5fa');
      selected.setAttribute('stroke-width', '2');
    } else if (selectedType === 'arrow') {
      selected.setAttribute('stroke', selected.getAttribute('data-original-color') || '#3b82f6');
      selected.setAttribute('stroke-width', '2');
    }
    selected = null;
    selectedType = null;
  }
  removeHandles();
  hideContextMenu();
  if (currentTool === 'oval') {
    INFO.textContent = 'Click the canvas to place an oval';
  } else {
    INFO.textContent = 'Click to set the arrow start point';
  }
}

// ── Context menu ────────────────────────────────────────

function showContextMenu(x, y) {
  ctxMenu.style.display = 'block';
  ctxMenu.style.left = x + 'px';
  ctxMenu.style.top = y + 'px';
}

function hideContextMenu() {
  ctxMenu.style.display = 'none';
}

// Click a color or action in the context menu
ctxMenu.addEventListener('click', (e) => {
  const item = e.target.closest('.ctx-color, .ctx-action');
  if (!item || !selected) return;

  if (item.classList.contains('ctx-color')) {
    const color = item.getAttribute('data-color');
    if (selectedType === 'ellipse') {
      selected.setAttribute('fill', color);
    } else if (selectedType === 'arrow') {
      selected.setAttribute('stroke', color);
      selected.setAttribute('data-original-color', color);
      // Update the marker color
      updateArrowMarker(selected, color);
    }
    hideContextMenu();
    updateLegend();
  } else if (item.classList.contains('ctx-delete')) {
    const el = selected;
    deselect();
    el.remove();
    updateLegend();
  }
});

// Hide menu on any click outside
document.addEventListener('click', (e) => {
  if (ctxMenu.contains(e.target)) return;
  hideContextMenu();
});

// Hide menu on right-click outside
document.addEventListener('contextmenu', (e) => {
  if (ctxMenu.contains(e.target)) return;
  hideContextMenu();
});

// Hide menu on Escape
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    hideContextMenu();
    cancelArrowPlacement();
  }
});

// ── Arrow marker helpers ────────────────────────────────

function updateArrowMarker(lineEl, color) {
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

// ── Handles ──────────────────────────────────────────────

function removeHandles() {
  handles.forEach((h) => h.el.remove());
  handles.length = 0;
}

function createHandle(x, y, cursor, onDrag) {
  const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  rect.setAttribute('x', x - HANDLE_SIZE / 2);
  rect.setAttribute('y', y - HANDLE_SIZE / 2);
  rect.setAttribute('width', HANDLE_SIZE);
  rect.setAttribute('height', HANDLE_SIZE);
  rect.setAttribute('fill', '#ffffff');
  rect.setAttribute('stroke', '#3b82f6');
  rect.setAttribute('stroke-width', '2');
  rect.setAttribute('cursor', cursor);
  rect.classList.add('resize-handle');
  svg.appendChild(rect);

  const data = { el: rect };
  handles.push(data);

  rect.addEventListener('mousedown', (e) => {
    e.stopPropagation();
    e.preventDefault();
    if (!selected) return;

    function onMove(me) {
      const pos = getPos(me);
      onDrag(pos);
    }

    function onUp() {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    }

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  });
}

// ── Ellipse handles (4 corners) ──────────────────────────

function showEllipseHandles(el) {
  removeHandles();
  const { cx, cy, rx, ry } = ellipseAttrs(el);
  const corners = [
    { x: cx - rx, y: cy - ry, cursor: 'nwse-resize' },
    { x: cx + rx, y: cy - ry, cursor: 'nesw-resize' },
    { x: cx - rx, y: cy + ry, cursor: 'nesw-resize' },
    { x: cx + rx, y: cy + ry, cursor: 'nwse-resize' },
  ];

  corners.forEach((c) => {
    createHandle(c.x, c.y, c.cursor, (pos) => {
      const { cx, cy } = ellipseAttrs(el);
      const newRx = Math.max(10, Math.abs(pos.x - cx));
      const newRy = Math.max(10, Math.abs(pos.y - cy));
      el.setAttribute('rx', newRx);
      el.setAttribute('ry', newRy);
      showEllipseHandles(el);
    });
  });
}

// ── Line handles (2 endpoints) ───────────────────────────

function showLineHandles(el) {
  removeHandles();
  const { x1, y1, x2, y2 } = lineAttrs(el);

  // Handle at start point
  createHandle(x1, y1, 'grab', (pos) => {
    el.setAttribute('x1', pos.x);
    el.setAttribute('y1', pos.y);
    showLineHandles(el);
  });

  // Handle at end point
  createHandle(x2, y2, 'grab', (pos) => {
    el.setAttribute('x2', pos.x);
    el.setAttribute('y2', pos.y);
    showLineHandles(el);
  });
}

// ── Create oval ──────────────────────────────────────────

function createOval(x, y) {
  const ellipse = document.createElementNS('http://www.w3.org/2000/svg', 'ellipse');
  ellipse.setAttribute('cx', x);
  ellipse.setAttribute('cy', y);
  ellipse.setAttribute('rx', 40);
  ellipse.setAttribute('ry', 25);
  ellipse.setAttribute('fill', '#3b82f6');
  ellipse.setAttribute('opacity', '0.9');
  ellipse.setAttribute('stroke', '#60a5fa');
  ellipse.setAttribute('stroke-width', '2');
  ellipse.style.cursor = 'pointer';

  // Click on oval → select it
  ellipse.addEventListener('click', (e) => {
    e.stopPropagation();
    selectElement(ellipse, 'ellipse');
  });

  // Mousedown on a selected oval → drag to move it
  ellipse.addEventListener('mousedown', (e) => {
    if (selected !== ellipse || selectedType !== 'ellipse') return;
    e.stopPropagation();
    e.preventDefault();

    const startPos = getPos(e);
    const startCx = parseFloat(ellipse.getAttribute('cx'));
    const startCy = parseFloat(ellipse.getAttribute('cy'));
    let dragged = false;

    function onMove(me) {
      dragged = true;
      const pos = getPos(me);
      const dx = pos.x - startPos.x;
      const dy = pos.y - startPos.y;
      ellipse.setAttribute('cx', startCx + dx);
      ellipse.setAttribute('cy', startCy + dy);
      showEllipseHandles(ellipse);
    }

    function onUp() {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      if (dragged) {
        ellipse.addEventListener('click', preventClick, { once: true });
      }
    }

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  });

  // Right-click on oval → show context menu
  ellipse.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    e.stopPropagation();
    selectElement(ellipse, 'ellipse');
    showContextMenu(e.clientX, e.clientY);
  });

  svg.appendChild(ellipse);
  return ellipse;
}

// ── Create arrow (line) ─────────────────────────────────

function createArrow(x1, y1, x2, y2) {
  const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
  line.setAttribute('x1', x1);
  line.setAttribute('y1', y1);
  line.setAttribute('x2', x2);
  line.setAttribute('y2', y2);
  line.setAttribute('stroke', '#3b82f6');
  line.setAttribute('stroke-width', '2');
  line.setAttribute('stroke-linecap', 'round');
  line.setAttribute('data-original-color', '#3b82f6');
  line.setAttribute('marker-end', 'url(#arrowhead)');
  line.style.cursor = 'pointer';

  // Click on arrow → select it
  line.addEventListener('click', (e) => {
    e.stopPropagation();
    selectElement(line, 'arrow');
  });

  // Mousedown on a selected arrow → drag to move it
  line.addEventListener('mousedown', (e) => {
    if (selected !== line || selectedType !== 'arrow') return;
    e.stopPropagation();
    e.preventDefault();

    const startPos = getPos(e);
    const { x1, y1, x2, y2 } = lineAttrs(line);
    let dragged = false;

    function onMove(me) {
      dragged = true;
      const pos = getPos(me);
      const dx = pos.x - startPos.x;
      const dy = pos.y - startPos.y;
      line.setAttribute('x1', x1 + dx);
      line.setAttribute('y1', y1 + dy);
      line.setAttribute('x2', x2 + dx);
      line.setAttribute('y2', y2 + dy);
      showLineHandles(line);
    }

    function onUp() {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      if (dragged) {
        line.addEventListener('click', preventClick, { once: true });
      }
    }

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  });

  // Right-click on arrow → show context menu
  line.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    e.stopPropagation();
    selectElement(line, 'arrow');
    showContextMenu(e.clientX, e.clientY);
  });

  svg.appendChild(line);
  return line;
}

// ── Arrow placement (preview) ───────────────────────────

function cancelArrowPlacement() {
  if (arrowPreviewLine) {
    arrowPreviewLine.remove();
    arrowPreviewLine = null;
  }
  if (arrowPreviewDot) {
    arrowPreviewDot.remove();
    arrowPreviewDot = null;
  }
  arrowStart = null;
}

function updateArrowPreview(pos) {
  if (!arrowPreviewLine) {
    arrowPreviewLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    arrowPreviewLine.setAttribute('stroke', 'rgba(59,130,246,0.4)');
    arrowPreviewLine.setAttribute('stroke-width', '2');
    arrowPreviewLine.setAttribute('stroke-dasharray', '6,4');
    arrowPreviewLine.setAttribute('stroke-linecap', 'round');
    arrowPreviewLine.setAttribute('marker-end', 'url(#prev-arrowhead)');
    svg.appendChild(arrowPreviewLine);
  }
  arrowPreviewLine.setAttribute('x1', arrowStart.x);
  arrowPreviewLine.setAttribute('y1', arrowStart.y);
  arrowPreviewLine.setAttribute('x2', pos.x);
  arrowPreviewLine.setAttribute('y2', pos.y);
}

function showArrowStartDot(pos) {
  if (!arrowPreviewDot) {
    arrowPreviewDot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    arrowPreviewDot.setAttribute('r', '5');
    arrowPreviewDot.setAttribute('fill', '#3b82f6');
    arrowPreviewDot.setAttribute('opacity', '0.7');
    arrowPreviewDot.setAttribute('pointer-events', 'none');
    svg.appendChild(arrowPreviewDot);
  }
  arrowPreviewDot.setAttribute('cx', pos.x);
  arrowPreviewDot.setAttribute('cy', pos.y);
}

// Prevent a click event once, used after a drag to avoid re-selecting
function preventClick(e) {
  e.stopPropagation();
  e.preventDefault();
}

// ── SVG background click ─────────────────────────────────

svg.addEventListener('click', (e) => {
  // Only handle clicks directly on the svg or the background rect
  if (e.target !== svg && e.target !== bgRect) return;

  const pos = getPos(e);

  if (currentTool === 'oval') {
    deselect();
    createOval(pos.x, pos.y);
    updateLegend();
  } else if (currentTool === 'arrow') {
    if (!arrowStart) {
      // First click: set start point
      arrowStart = pos;
      showArrowStartDot(pos);
      INFO.textContent = 'Click again to place the arrow end point';
    } else {
      // Second click: create the arrow
      createArrow(arrowStart.x, arrowStart.y, pos.x, pos.y);
      cancelArrowPlacement();
      updateLegend();
      INFO.textContent = 'Click to set the arrow start point';
    }
  }
});

// ── Mouse move preview for arrow ────────────────────────

svg.addEventListener('mousemove', (e) => {
  if (currentTool !== 'arrow' || !arrowStart) return;
  // Ignore if hovering over a handle
  if (e.target.classList.contains('resize-handle')) return;

  const pos = getPos(e);
  updateArrowPreview(pos);
});

// ── Legend ──────────────────────────────────────────────

const legendEl = document.getElementById('legend');
const legendColors = new Map(); // color -> { customName: string | null, type: 'fill' | 'stroke' }

function updateLegend() {
  const ellipses = svg.querySelectorAll('ellipse');
  const lines = svg.querySelectorAll('line');
  const colorsInUse = new Map(); // color -> type

  ellipses.forEach((el) => {
    const fill = el.getAttribute('fill');
    if (fill) colorsInUse.set(fill, 'fill');
  });

  lines.forEach((el) => {
    const stroke = el.getAttribute('stroke');
    if (stroke && !stroke.startsWith('rgba') && stroke !== '#fbbf24') {
      // Only add if not already tracked as a fill color
      if (!colorsInUse.has(stroke)) {
        colorsInUse.set(stroke, 'stroke');
      }
    }
  });

  // Remove colors no longer in use
  for (const color of legendColors.keys()) {
    if (!colorsInUse.has(color)) {
      legendColors.delete(color);
    }
  }

  // Add new colors (preserving insertion order)
  for (const [color] of colorsInUse) {
    if (!legendColors.has(color)) {
      legendColors.set(color, { customName: null });
    }
  }

  if (colorsInUse.size === 0) {
    legendEl.style.display = 'none';
    return;
  }
  legendEl.style.display = 'block';

  // Build legend HTML
  let html = '<div class="legend-title">Keys</div>';
  let idx = 1;
  for (const [color] of legendColors) {
    const data = legendColors.get(color);
    const displayName = data.customName || `Group ${idx}`;
    html += `<div class="legend-item">
      <span class="legend-swatch" style="background:${color}"></span>
      <span class="legend-label" data-color="${color}" contenteditable="true">${displayName}</span>
    </div>`;
    idx++;
  }
  legendEl.innerHTML = html;

  // Editable behavior: save custom name on blur / Enter
  legendEl.querySelectorAll('.legend-label').forEach((label) => {
    label.addEventListener('blur', () => {
      const color = label.getAttribute('data-color');
      const text = label.textContent.trim();
      legendColors.get(color).customName = text || null;
      updateLegend();
    });
    label.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        label.blur();
      }
    });
  });
}