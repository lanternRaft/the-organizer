# AGENTS.md — For human and AI agents working on The Organizer

## Rule #1: Always keep SPECIFICATIONS.md in sync

Any implementation change that:
- modifies a documented behavior,
- adds or removes a feature,
- changes how an element works (Nodes, Labels, Arrows, Keys),
- alters the user interface or interaction model,

**must also update** `SPECIFICATIONS.md` to match the new reality. This file is the canonical contract between spec and implementation.

---

## Project overview

An HTML/JavaScript/CSS based SVG canvas tool for world building via notes, flow charts, and relational diagrams. This is **not** a tldraw-based project — it is a bespoke SVG DOM implementation with custom hit testing, curve computation, anchor points, and selection logic.

---

## Technology stack

- **Vanilla HTML/CSS/JS** — no frameworks, no build step, no bundler.
- **SVG DOM** — all shapes, arrows, and text are raw SVG elements managed via the DOM API.
- **`npx serve`** for local development.

---

## Key files and their roles

| File | Role |
|---|---|
| `index.html` | App shell — loads CSS + scripts in order, contains the `<svg>` root element |
| `style.css` | All styling (light/dark mode, grid, anchor dots, selection borders) |
| `state.js` | Shared module state: `svg`, `defs`, `selectedSet` (Set), `selectedTypes` (Map), tool flags |
| `helpers.js` | Pure utility functions: coordinate helpers, hit testing, anchor system, bezier curves, arrow path computation, text wrapping, color utilities |
| `shape.js` | Shape (ellipse/label) creation, text editing, color changes, deletion |
| `node.js` | Node (small dot) creation, color changes, deletion |
| `arrow.js` | Arrow creation, waypoint insertion, direction toggling, anchor attachment, deletion |
| `select.js` | Selection logic — click-to-select, multi-select (Shift+click), drag-to-move, context menus |
| `app.js` | Top-level event wiring, tool mode management (select / arrow / label / node / key), keyboard shortcuts |
| `SPECIFICATIONS.md` | **Canonical specification** — must be kept up to date (see Rule #1) |
| `docs/` | Documentation assets |
| `AGENTS.md` | **This file** — agent conventions and project context |

---

## Architectural patterns

### Shapes (Labels/Nodes)

- SVG `<ellipse>` elements.
- Labels use `rx`/`ry` for sizing; Nodes have a fixed tiny radius.
- JavaScript properties stored **directly on the SVG element**:
  - `el._text` — the label's text string (or null)
  - `el._textEl` — the `<text>` child element (or null)
  - `el._textLines` — cached wrapped lines
  - `el._ignoreNextClick` — set after a drag to suppress the selection click

### Arrows

- SVG `<g>` groups containing two `<path>` children: `_visPath` (visible stroke) and `_hitPath` (thicker invisible stroke for easier clicking).
- Arrow data stored as JS properties on the `<g>` element:
  - `group._points` — array of `{x, y}` waypoints (at least 2)
  - `group._x1, _y1, _x2, _y2` — legacy endpoint shorthand, kept in sync
  - `group._anchors` — array of `{ ellipse, anchorLabel, end: 'start'|'end' }` (or null)
  - `group._arrowDirection` — `'mono'`, `'dual'`, or `'none'`
  - `group._offset` — legacy signed offset for quadratic curves (clipboard paste fallback)
- Paths are cubic bezier curves computed by `computeCubicControlPoints()`.
- Marker arrowheads are dynamically created `<marker>` elements in `<defs>`, keyed by color.

### Anchor point system

- Every `<ellipse>` has 4 cardinal anchor points: `top`, `left`, `bottom`, `right`.
- Anchor dots are rendered as SVG `<circle>` elements with class `anchor-point`.
- Anchors are shown/hidden via `showAnchors()` / `hideAnchors()` — triggered when arrow tool is active, an arrow endpoint is being placed, or an arrow is selected.
- Arrows snap to the nearest anchor within a 15px radius.

### Selection

- `selectedSet` (Set of SVG elements) and `selectedTypes` (Map of element → type string) in `state.js`.
- Multi-select via Shift+click.
- Multi-drag moves all selected shapes and their anchored arrows.
- Single-click context menus (no right-click).

### Color

- Shapes and arrows use hex colors (e.g. `#3b82f6`).
- `darkenColor(hex, percent)` and `lightenColor(hex, percent)` utilities for hover/selection borders.
- Selection border = darker version of the shape's color.

### Text on Labels

- SVG `<text>` with auto-wrapping: word-wrap breaks lines to fit within the shape width (`rx * 1.4`).
- Font size auto-scales to fit vertically within `ry * 1.6`.
- Text is rendered as `<tspan>` children, vertically centered.

### Modes

Tool modes are tracked in `state.js`:
- `select` — default, click/drag to select and move
- `arrow` — click start point, click end point to create arrow
- `label` — click to place a label shape
- `node` — click to place a node dot
- `key` — open the legend/keys menu

---

## Conventions

### Naming

- Files are lowercase with hyphens where needed (e.g. `helpers.js`, not `helperFunctions.js`).
- Module-level state lives in `state.js` and is imported by other modules.
- Functions that create DOM elements return the element for further manipulation.

### `_`-prefixed properties

These JS properties are attached directly to SVG DOM elements and **must not be stripped or overwritten** by DOM serialization/cloning or by generic element manipulation:

- `_text`, `_textEl`, `_textLines` — on `<ellipse>` labels
- `_points`, `_x1`, `_y1`, `_x2`, `_y2`, `_offset` — on arrow `<g>` groups
- `_anchors`, `_arrowDirection` — on arrow `<g>` groups
- `_visPath`, `_hitPath` — `<path>` children of arrow `<g>` groups
- `_ignoreNextClick` — on any selectable element
- `_arrowGroup` — on arrow waypoint circles (if used)

**When copying or cloning SVG elements (e.g. clipboard operations), always preserve these properties.**

### Pull requests

- Keep `SPECIFICATIONS.md` changes in the same PR as the implementation changes.
- If an implementation change deviates from an existing spec, update the spec — don't leave it stale.