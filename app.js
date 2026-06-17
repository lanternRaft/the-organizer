const svg = document.getElementById('canvas');
const bgRect = svg.querySelector('rect');

let selected = null;
const handles = [];
const HANDLE_SIZE = 10;
const INFO = document.querySelector('.info');
const ctxMenu = document.getElementById('ctx-menu');

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

function selectEllipse(el) {
  deselect();
  if (!el) return;
  selected = el;
  el.setAttribute('stroke', '#fbbf24');
  el.setAttribute('stroke-width', '3');
  showHandles(el);
  INFO.textContent = 'Drag a corner handle to resize';
}

function deselect() {
  if (selected) {
    selected.setAttribute('stroke', '#60a5fa');
    selected.setAttribute('stroke-width', '2');
    selected = null;
  }
  removeHandles();
  hideContextMenu();
  INFO.textContent = 'Click anywhere to place a blue oval, or click an oval to select it';
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

// Click a color in the context menu
ctxMenu.addEventListener('click', (e) => {
  const item = e.target.closest('.ctx-color');
  if (!item || !selected) return;
  const color = item.getAttribute('data-color');
  selected.setAttribute('fill', color);
  hideContextMenu();
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
  if (e.key === 'Escape') hideContextMenu();
});

// ── Handles ──────────────────────────────────────────────

function removeHandles() {
  handles.forEach(h => h.el.remove());
  handles.length = 0;
}

function showHandles(el) {
  removeHandles();
  const { cx, cy, rx, ry } = ellipseAttrs(el);
  const corners = [
    { x: cx - rx, y: cy - ry, cursor: 'nwse-resize' },
    { x: cx + rx, y: cy - ry, cursor: 'nesw-resize' },
    { x: cx - rx, y: cy + ry, cursor: 'nesw-resize' },
    { x: cx + rx, y: cy + ry, cursor: 'nwse-resize' },
  ];

  corners.forEach((c) => {
    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rect.setAttribute('x', c.x - HANDLE_SIZE / 2);
    rect.setAttribute('y', c.y - HANDLE_SIZE / 2);
    rect.setAttribute('width', HANDLE_SIZE);
    rect.setAttribute('height', HANDLE_SIZE);
    rect.setAttribute('fill', '#ffffff');
    rect.setAttribute('stroke', '#3b82f6');
    rect.setAttribute('stroke-width', '2');
    rect.setAttribute('cursor', c.cursor);
    rect.classList.add('resize-handle');
    svg.appendChild(rect);

    const data = { el: rect };
    handles.push(data);

    // ── Drag resize ──
    rect.addEventListener('mousedown', (e) => {
      e.stopPropagation();
      e.preventDefault();
      if (!selected) return;

      const { cx, cy } = ellipseAttrs(selected);

      function onMove(me) {
        const pos = getPos(me);
        const newRx = Math.max(10, Math.abs(pos.x - cx));
        const newRy = Math.max(10, Math.abs(pos.y - cy));
        selected.setAttribute('rx', newRx);
        selected.setAttribute('ry', newRy);
        showHandles(selected);
      }

      function onUp() {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
      }

      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });
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

  // Click on oval → select it (stop propagation so svg click doesn't fire)
  ellipse.addEventListener('click', (e) => {
    e.stopPropagation();
    selectEllipse(ellipse);
  });

  // Right-click on oval → show context menu
  ellipse.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    e.stopPropagation();
    selectEllipse(ellipse);
    showContextMenu(e.clientX, e.clientY);
  });

  svg.appendChild(ellipse);
  return ellipse;
}

// ── SVG background click ─────────────────────────────────

svg.addEventListener('click', (e) => {
  // Only handle clicks directly on the svg or the background rect
  if (e.target !== svg && e.target !== bgRect) return;

  const pos = getPos(e);
  deselect();
  createOval(pos.x, pos.y);
});