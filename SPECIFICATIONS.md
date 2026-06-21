# The Organizer

A canvas-based whiteboarding tool for world building — notes, flow charts, and relational diagrams. Built as a bespoke SVG DOM implementation with zero dependencies.

---

## Technology Stack

- **Vanilla HTML/CSS/JS** — No frameworks, no bundler, no build step
- **SVG DOM** — All shapes, arrows, text, and UI are native SVG elements manipulated via the DOM API
- **`npx serve`** for local development

---

## Tool Modes

A toolbar at the bottom center of the screen provides 3 tool modes. After placing an element (shape or node), the app auto-switches back to **Select** mode.

| Tool | Button Label | Behavior |
|---|---|---|
| Select | Select | Click/drag to select and move elements. Default mode. Also used for arrow creation — see Arrow section below. |
| Shape | Oval / Circle | Dropdown button; click to toggle between Oval and Circle. Click canvas to place the shape. |
| Node | Node | Click canvas to place a small fixed-size dot. |

### Shape Tool Dropdown

The Oval/Circle button opens a small dropdown above it. Selecting a mode updates the button label and the info text. The dropdown closes on outside click.

---

## Elements

### Shapes (Labels)

SVG `<ellipse>` elements that serve as labeled containers.

- **Two shape modes** (selected via dropdown):
  - **Oval**: Default size `rx=40`, `ry=25`
  - **Circle**: Default size `rx=40`, `ry=40`
- **Colorable**: Default fill `#3b82f6`
- **Opacity**: 0.9
- **Resize**: 4 corner handles (white squares) appear on selection; drag to resize (snaps to 10px increments)
  - In Circle mode, handles constrain to equal `rx`/`ry` (distance from center)
  - In Oval mode, handles allow independent `rx`/`ry`
- **Drag to move**: Snaps to 10px increments
- **Placement**: Initial placement via click snaps to 10px increments
- **Stroke**: Darkened version of fill color (40% darker by default) at `stroke-width=2`; on selection, lightened version (40% lighter) at `stroke-width=3`
- **Text**:
  - Press **Enter** on a selected shape to open an inline `<textarea>` centered over the shape
  - **Enter** (without Shift) commits text, **Escape** cancels
  - Text is word-wrapped to fit within `rx * 1.4` width
  - Font size auto-scales to fit vertically within `ry * 1.6` (minimum 8px)
  - Rendered as SVG `<text>` with `<tspan>` children, vertically centered, color `#ffffff`
  - `_text`, `_textEl`, `_textLines` stored as JS properties on the ellipse element

### Nodes

Small fixed-size colorable dots. Implemented as `<ellipse>` elements with `rx=ry=8` for integration with the anchor/arrow system.

- **Fixed size**: `NODE_RADIUS = 8` (rx=8, ry=8)
- **Colorable**: Default fill `#3b82f6`
- **No resize handles** on selection
- **Stroke**: Same rules as shapes (darkened/lightened fill)
- **Drag to move**: Snaps to 10px increments
- **Placement**: Initial placement via click snaps to 10px increments

### Arrows

SVG `<g>` groups containing two `<path>` children: `_visPath` (visible stroke) and `_hitPath` (invisible 14px-wide stroke for easier click targeting).

- **Waypoint-based data model**: `group._points` is an array of `{x, y}` waypoints (minimum 2)
- **Legacy compat**: `group._x1, _y1, _x2, _y2` kept in sync with first/last waypoints
- **Legacy offset**: `group._offset` kept for clipboard backward compatibility
- **Path computation**: Cubic bezier curves using **Catmull-Rom tangents** for C1 continuity through every waypoint, combined with `ARROWHEAD_ANCHOR_EXT=15px` straight extensions from anchors. The path draws to the exact ellipse edge; the end-marker tip (at `refX=ARROWHEAD_WIDTH`) is placed at that endpoint so there is zero gap between the arrowhead tip and the shape.
  - Anchored endpoints: the arrow extends 15px straight out from each anchor before curving. The cardinal direction of the anchor is used as the tangent at that node.
  - Intermediate waypoints: the tangent at node *i* is `normalize(nodes[i+1] − nodes[i−1])` (Catmull-Rom). Both the outgoing control point of segment *i→i+1* and the incoming control point of *i−1→i* align with this same tangent, guaranteeing smooth curves with no kinks.
  - Control-point reach: `clamp(segLen × 0.35, 30, 100)` px along the tangent direction.
- **Direction** (controlled via selection menu buttons):
  - `mono` (default): Single arrowhead at end
  - `dual`: Arrowheads at both start and end
  - `none`: No arrowheads
  - Dynamic `<marker>` elements in `<defs>`, keyed by color (e.g. `arrowhead-#3b82f6`) with dimensions 9.6×6.4 (20% smaller than original 12×8). End marker uses a classic arrowhead polygon (tip at `refX`, base trailing back) so the tip touches the path endpoint with no gap.
- **Waypoint insertion (Curve Mode)**: Waypoints can only be added to an arrow when **Curve Mode** is active. Curve mode is toggled via the curve button (curved-path icon) in the selection menu. When curve mode is on, clicking or dragging anywhere on the path body of a single selected arrow immediately inserts a new waypoint at that position and enters a drag loop so the user can "grab and pull" the curve into shape in one gesture. If released without moving, the waypoint stays at the click location. Curve mode is automatically deactivated when the arrow is deselected, and can also be toggled off by clicking the curve button again. Clicking or dragging on an existing handle moves that handle and does not insert a new waypoint (handles consume the `mousedown` via `stopPropagation`).
- **Curve mode state**: Tracked in `curveModeArrows` (a `Set` of arrow `<g>` elements in `state.js`). When an arrow is in the selection and curve mode is active, the curve button shows an `active-curve` background. On deselection, `curveModeArrows.clear()` is called.
- **Hit testing**: Wide transparent path (`stroke-width=14`) for easier clicking

#### Arrow Creation (Drag from Anchor)

Arrows are created by clicking and dragging from an anchor point to another anchor point. This works in **Select** mode — no separate Arrow tool is needed.

**Flow:**
1. **Hover** near a shape (within 20px of any anchor point) — the shape's 4 anchor dots appear
2. **Hover** directly over an anchor dot — the dot highlights (larger, filled blue)
3. **Mousedown** on an anchor dot → arrow drag begins
   - A dashed preview line appears from the start anchor, following the cursor
   - All shapes' anchor dots become visible
   - The start anchor remains highlighted
4. **Drag** the cursor — the preview line snaps to the nearest anchor within 15px
   - The nearest anchor highlights as a valid drop target
5. **Mouseup** over a different shape's anchor → arrow is created, anchored on both ends
6. **Mouseup** not over a valid anchor (same shape, or empty space) → arrow is discarded

**Key rules:**
- Arrows **must** be anchored on both ends — unanchored arrows are discarded
- You cannot connect a shape to itself (start and end must be different shapes)
- Existing arrows can still be re-anchored via endpoint handles (drag endpoint handle to snap to a new anchor)

#### Arrow Preview

During drag, a dashed preview line shows the intended curve using the same cubic bezier computation as placed arrows.

#### Arrow Drag State

The following module-level state tracks a drag in progress in `arrow.js`:

- `_arrowDragActive` — boolean, true while a drag is in progress
- `_dragStartAnchor` — `{ ellipse, anchorLabel, anchorPos }`
- `_dragPreviewLine` — SVG `<path>` element for the dashed preview
- `_dragSnappedEnd` — `{ ellipse, anchorPos, anchorLabel }` or null

### Anchors

Every `<ellipse>` (shapes and nodes) has 4 cardinal anchor points. Two sets of positions are maintained:

**Edge positions** (`getAnchorPoints`) — used as actual arrow endpoints:
- **top**: `{x: cx, y: cy - ry}`
- **left**: `{x: cx - rx, y: cy}`
- **bottom**: `{x: cx, y: cy + ry}`
- **right**: `{x: cx + rx, y: cy}`

**Dot positions** (`getAnchorDotPoints`) — each offset `ANCHOR_OFFSET = 5` px outward, used for dot rendering and snap hit-testing so the visible handle and snap zone match:
- **top**: `{x: cx, y: cy - ry - 5}`
- **left**: `{x: cx - rx - 5, y: cy}`
- **bottom**: `{x: cx, y: cy + ry + 5}`
- **right**: `{x: cx + rx + 5, y: cy}`

`findAnchorNear` snaps based on dot positions but returns the edge `anchorPos` so arrows connect at the ellipse boundary.

Anchor dots are SVG `<circle>` elements with class `anchor-point`, white fill, blue stroke, radius 4. Dots have `pointer-events: auto` (interactive) and store references to their parent ellipse and anchor label via `_anchorEllipse` and `_anchorLabel` properties.

**Visibility**: Anchors are shown when:
- The cursor is near a shape (within 20px radius `ANCHOR_HOVER_RADIUS`)
- An arrow is in the selected set (for endpoint re-attachment via handles)
- An arrow drag is in progress (all shapes' anchors visible)

**Highlighting**: The nearest anchor to the cursor gets highlighted (radius 7, filled blue `#3b82f6`) via `highlightAnchorDot()`.

**Snap**: Arrow endpoints snap to the nearest anchor within 15px radius (`ANCHOR_SNAP_RADIUS = 15`).

**Endpoint attachment**: Arrow `_anchors` array stores `{ end: 'start'|'end', ellipse, anchorLabel }`. When a connected shape moves, `updateAnchoredArrows()` updates the arrow endpoint to follow.

**Per-ellipse control**: Anchors are created and cached per-ellipse. Functions `showAnchorsForEllipse(el)` and `hideAnchorsForEllipse(el)` control visibility for a specific shape, while `updateAnchors()` updates positions for all cached dots.

---

## Selection System

### Single Click

Click an element to select it. A floating **selection menu** appears below the element.

### Shift+Click (Additive)

Toggle an element in/out of the current selection set.

- `selectedSet` (Set of SVG elements) tracks all selected items
- `selectedTypes` (Map of element → type string: `'ellipse'`, `'node'`, `'arrow'`)
- `selected` / `selectedType` hold the **primary** element (used for handles and drag)

### Marquee (Selection Box)

Drag on the empty canvas background (Select tool only) to draw a dashed selection rectangle. Any element whose center point (ellipses) or endpoints (arrows) fall within the box becomes selected.

### Multi-Drag

When multiple elements are selected, dragging any one moves all of them:
- Shapes/nodes: Offsets their `cx`/`cy` by the drag delta, snapping to 10px increments
- Arrows: Updates anchored endpoints to follow connected nodes; moves free-floating waypoints by the delta
- Anchor dots update in real-time
- A `_ignoreNextClick` flag on dragged elements suppresses the click that follows a drag, preserving the selection

### Drag Suppression Flags

- `_ignoreNextClick` — set on any element after a drag; cleared on next click
- `_multiDragged` — set after a multi-element drag (checked by background click handler)
- `_dragHappened` — general flag set after any drag (checked by background click handler)

### Selection Menu

A floating toolbar that appears below a single selected element containing:

| Button | Action |
|---|---|
| Delete (trash icon) | Delete the selected element(s) |
| Color palette (palette icon) | Toggle an 8-color popup |
| Separator | — |
| Direction: None | Remove arrowheads |
| Direction: Mono | Single arrowhead at end (default) |
| Direction: Dual | Arrowheads at both ends |

Direction buttons are only visible for arrow elements.

### Color Palette

8 swatches: `#3b82f6` (blue), `#ef4444` (red), `#22c55e` (green), `#f59e0b` (amber), `#a855f7` (purple), `#ec4899` (pink), `#ffffff` (white), `#1e293b` (dark). Applies to all selected elements.

---

## Keys / Legend

An auto-generated legend in the bottom-left corner that lists colors currently in use on the canvas. Each entry has:

- A colored circle swatch
- An editable label (`contenteditable=true`) — click to rename
- Default names: `Group 1`, `Group 2`, etc.
- Custom names are stored in `legendColors` Map and persist until the color is no longer in use
- Hidden when no colors are in use

---

## Pan & Zoom

The canvas implements a **viewBox-based** pan and zoom system. Rather than applying CSS transforms to individual elements, the SVG's `viewBox` attribute is manipulated to change the visible region of the coordinate system. This means all canvas coordinates remain stable — only the viewport onto them changes.

### State (`state.js`)

- `canvasWidth`, `canvasHeight` — the natural (unzoomed) pixel dimensions of the SVG element, captured from `getBoundingClientRect()` on initialization
- `viewBox` — reactive object `{ x, y, width, height }` representing the current viewBox
- `initCanvasSize()` — captures initial dimensions and sets `viewBox` to match
- `applyViewBox()` — writes `viewBox` to the SVG `viewBox` attribute
- `setViewBox(x, y, w, h)` — updates `viewBox` values and applies them
- `resetViewBox()` — resets to initial state (100% zoom, origin at 0,0), recapturing canvas dimensions
- `getZoomLevel()` — returns `canvasWidth / viewBox.width` (1.0 = 100%)

### Zoom Controls (UI)

A vertical button stack in the **bottom-right corner** (`#zoom-controls`, `position: fixed; bottom: 82px; right: 16px`) provides three buttons:

| Button | ID | Action | Tooltip |
|---|---|---|---|
| + (plus) | `zoom-in` | Zoom in by factor 1.25×, centered on viewport center | Zoom in (Ctrl+=) |
| − (minus) | `zoom-out` | Zoom out by factor 0.8×, centered on viewport center | Zoom out (Ctrl+-) |
| ⟳ (reset) | `zoom-reset` | Reset to 100% zoom, viewBox origin to (0,0) | Reset zoom (Ctrl+0) |

Buttons include glassmorphism styling (`backdrop-filter: blur(8px)`, border, shadow) and hover/active transforms.

### Zoom Limits

- **Minimum zoom**: 10% (`MIN_ZOOM = 0.1`) — `viewBox.width` cannot exceed `canvasWidth / 0.1`
- **Maximum zoom**: 2000% (`MAX_ZOOM = 20`) — `viewBox.width` cannot be smaller than `canvasWidth / 20`
- Attempting to zoom beyond these limits silently returns without changing the viewBox

### Zoom Around a Point

The core function `zoomByFactor(factor, cx, cy)` zooms relative to a specific point in viewBox coordinates:

1. Computes `newW = viewBox.width / factor` and `newH = viewBox.height / factor`
2. Clamps against min/max zoom bounds
3. If `cx`/`cy` are omitted or invalid, defaults to the current viewport center
4. Computes new origin: `newX = cx - (cx - viewBox.x) / factor` (same for Y)
5. Calls `setViewBox()` with the new values
6. Updates the info bar with the current zoom percentage: `Zoom: NNN%`

### Scroll-Wheel / Trackpad Zoom & Pan

The SVG element listens for the `wheel` event (non-passive, with `preventDefault()`) and distinguishes three interaction types:

| Gesture | Detection | Behaviour |
|---|---|---|
| **Mouse wheel** (notch-based) | `deltaY` ≥ 10, `deltaX` nearly 0, no Ctrl/Meta | Zoom centered on cursor position. Factor = `1 - deltaY × 0.001` |
| **Trackpad pinch-to-zoom** (macOS) | `e.ctrlKey` or `e.metaKey` is set | Zoom centered on cursor position. Factor = `1 - deltaY × 0.005` |
| **Trackpad two-finger scroll** (pan) | Smooth scrolling (`deltaY` < 10) or non-zero `deltaX` | Pan the viewBox by `delta × scale` where `scale = viewBox.width / canvasWidth` |

All coordinates are converted from screen-space to viewBox-space using the `getPos(e)` helper (which uses `svg.createSVGPoint()` + `getScreenCTM().inverse()`).

### Touch Pinch-to-Zoom

Pinch-to-zoom is handled via `touchstart` / `touchmove` / `touchend` listeners:

1. **`touchstart`** (2 fingers detected): Records initial distance between touch points, midpoint, and a snapshot of the current viewBox (`startViewBox`)
2. **`touchmove`** (2 fingers, state active): Computes `factor = currentDist / initialDist`, clamps zoom bounds, then computes new viewBox centered on the stored midpoint (using `getScreenCTM().inverse()` to convert screen midpoint to viewBox coordinates)
3. **`touchend`** (fewer than 2 fingers): Clears the pinch state

### Middle-Button Pan

Pressing and dragging with the **middle mouse button** (button code 1) pans the canvas:

- **`mousedown`** (button 1) on SVG: Sets `_panning = true`, records `_panStart = { clientX, clientY }` and snapshots the current viewBox as `_panViewBox`. Sets cursor to `grabbing`. Prevents default and stops propagation to avoid interfering with element interactions.
- **`mousemove`** on `document` (while panning): Computes `setViewBox(_panViewBox.x - deltaClientX × scale, _panViewBox.y - deltaClientY × scale, ...)` where `scale = viewBox.width / canvasWidth`.
- **`mouseup`** (button 1) on `document`: Clears `_panning`, restores cursor. Document-level listeners ensure pan continues even if the cursor leaves the SVG element.

### Keyboard Shortcuts

| Key | Action |
|---|---|
| **Ctrl/Cmd + =** (or **+**) | Zoom in by 1.25×, centered on viewport center |
| **Ctrl/Cmd + -** | Zoom out by 0.8×, centered on viewport center |
| **Ctrl/Cmd + 0** | Reset zoom to 100% |
| **Escape** | Hide context menu, cancel arrow placement, hide text input |
| **Enter** | Open text editor on selected shape |
| **Ctrl/Cmd + C** | Copy selected element(s) to clipboard |
| **Ctrl/Cmd + V** | Paste from clipboard |
| **Ctrl/Cmd + A** | Select all elements |
| **Delete / Backspace** | Delete selected element(s) (Select tool only, not in text input) |

### Resize Behaviour

On window resize, the canvas dimensions are re-read from `getBoundingClientRect()`, but the viewBox is **not** automatically reset. The user's current pan/zoom viewport is preserved (only the `canvasWidth`/`canvasHeight` stored dimensions are updated for future scale calculations). This ensures resizing the browser window doesn't unexpectedly reset the user's view.

### Interaction with Coordinate Transforms

All pointer coordinate conversions (`getPos(e)` in `helpers.js`) use `svg.createSVGPoint()` + `getScreenCTM().inverse()` to convert from screen coordinates to viewBox coordinates. This ensures click/drag positions are correctly interpreted regardless of the current zoom/pan state.

### Export PNG Interaction

When exporting to PNG (Export PNG from hamburger menu), the export computation uses the **logical viewBox** (bounding box of all elements + padding), not the user's current viewBox. The export function creates a temporary SVG that renders at 2× resolution with the computed bounding-box viewBox, independent of the current pan/zoom viewport.

---

## Copy / Paste

In-memory clipboard (`_clipboard` array) stores serialized copies of selected elements:

- **Shapes**: `{ type, cx, cy, rx, ry, fill, text }`
- **Nodes**: `{ type, cx, cy, fill }`
- **Arrows**: `{ type, x1, y1, x2, y2, offset, color }`

Pasted elements are offset by +20px from original and become selected.

---

## UI Controls

### Grid Toggle

Button (top-right, next to theme toggle) with grid icon. Toggles a CSS background grid overlay (40px spacing). Persisted to `localStorage` as `grid`.

### Theme Toggle

Button (top-right corner) with sun/moon icons. Toggles `data-theme` attribute on `<html>` between `'dark'` and `'light'`. Persisted to `localStorage` as `theme`.

### Info Bar

Centered text at the bottom of the screen showing contextual hints based on current tool and selection state. During zoom operations, it also displays the current zoom level as `Zoom: NNN%`.

---

## Auto-Save / Persistence

The full canvas state is automatically persisted to `localStorage` under the key `organizer-canvas` on any mutation.

| Setting | Key | Location |
|---|---|---|
| Canvas state | `organizer-canvas` | `localStorage` (JSON) |
| Grid state | `grid` | `localStorage` |
| Theme | `theme` | `localStorage` (dark/light) |

### Save Triggers

`notifyCanvasChanged()` is called after every user-initiated mutation:

- Shape / node / arrow creation
- Deletion (selection menu, keyboard Delete/Backspace)
- Single and multi-element drag (on mouseup)
- Color change (via palette swatch)
- Arrow direction change (none/mono/dual)
- Waypoint insertion/drag (drag on selected arrow path body)
- Text commit (setOvalText)
- Legend name edit (contenteditable blur)
- Paste from clipboard

The notification is dispatched via the `onCanvasChange` / `notifyCanvasChanged` API in `state.js`. `app.js` registers a listener that calls `saveToLocalStorage()` (from `storage.js`).

### Serialization Format

The `serializeCanvas()` function in `storage.js` produces a JSON object:
```json
{
  "elements": [
    { "type": "ellipse", "cx", "cy", "rx", "ry", "fill", "text" },
    { "type": "node", "cx", "cy", "fill" },
    {
      "type": "arrow",
      "points": [{"x","y"}, ...],
      "anchors": [{"end":"start"|"end","elementIndex":N,"anchorLabel":"top"|"left"|"bottom"|"right"}],
      "direction": "mono"|"dual"|"none",
      "color": "#hex"
    }
  ],
  "legend": [["#color", {"customName":"..."}], ...]
}
```

Anchor references use **element-index pointers** (the index of the referenced ellipse/node among non-`<defs>` children in the serialized array), so they can be reconstructed on deserialization.

### Deserialization

`loadFromLocalStorage()` runs on page load:
1. Reads the JSON from `localStorage`
2. **First pass**: creates all ellipses and nodes (arrows need ellipse DOM references)
3. **Second pass**: creates all arrows, resolving anchor element indices to the actual DOM elements
4. Restores arrow direction, colors, and waypoints
5. Restores the legend (colors and custom names)

### Clear Canvas

The hamburger menu → **Clear** button shows a confirmation dialog (overlay with Cancel/Clear). On confirmation, `clearAndSave()` removes all canvas elements, clears the legend, and saves the empty state to `localStorage`.

---

## Hamburger Menu

A hamburger button (`#menu-btn`) in the top-left corner toggles a dropdown (`#menu-dropdown`) with:

| Item | Action |
|---|---|
| **Export PNG** | Exports the canvas as a PNG image framing all objects. Computes the bounding box of every shape, node, arrow, and text label, adds 40px padding, and renders the PNG at 2x retina quality. Downloads as `the-organizer-YYYY-MM-DD.png`. |
| **Clear** | Opens the confirmation dialog to clear the canvas |

The dropdown closes on outside click and on `contextmenu`.

---

## Confirmation Dialog

A modal overlay (`#confirm-overlay` / `#confirm-dialog`) with:
- Title: "Clear Canvas"
- Message: "This will delete everything on the canvas. This cannot be undone."
- Cancel button (dismisses)
- Clear button (executes `clearAndSave()` and closes)

Closable via: Cancel button, backdrop click, or Escape key.

---

## `storage.js` File

| Export | Description |
|---|---|
| `serializeCanvas()` | Walks the SVG DOM and returns a plain-JSON object |
| `saveToLocalStorage()` | Serializes + writes to `localStorage` |
| `loadFromLocalStorage()` | Reads from `localStorage` and restores canvas state |
| `clearAndSave()` | Removes all elements, clears legend, saves empty state |

---

## SVG `_`-prefixed Properties

These JavaScript properties are attached directly to SVG DOM elements and **must not be stripped or overwritten** by serialization/cloning:

| Property | Element | Purpose |
|---|---|---|
| `_text` | `<ellipse>` | Label text string |
| `_textEl` | `<ellipse>` | `<text>` child element |
| `_textLines` | `<ellipse>` | Cached wrapped lines |
| `_ignoreNextClick` | Any selectable | Suppress click after drag |
| `_points` | Arrow `<g>` | Waypoint array `[{x,y}]` |
| `_x1, _y1, _x2, _y2` | Arrow `<g>` | Legacy endpoint shorthand |
| `_offset` | Arrow `<g>` | Legacy curve offset |
| `_anchors` | Arrow `<g>` | Anchor references `[{end, ellipse, anchorLabel}]` |
| `_arrowDirection` | Arrow `<g>` | `'mono'`, `'dual'`, or `'none'` |
| `_visPath` | Arrow `<g>` | Visible stroke `<path>` child |
| `_hitPath` | Arrow `<g>` | Invisible hit-test `<path>` child |
| `_arrowGroup` | Waypoint circles | Reference to parent arrow group |
| `_anchorEllipse` | Anchor dot `<circle>` | Parent ellipse element |
| `_anchorLabel` | Anchor dot `<circle>` | Anchor label (`top`/`left`/`bottom`/`right`) |

---

## File Structure

| File | Role |
|---|---|
| `index.html` | App shell — loads CSS + scripts, contains `<svg>` root element, toolbar, legend, selection menu |
| `style.css` | All styling — light/dark theme variables, toolbar, grid, anchors, selection menu, color palette, legend |
| `state.js` | Shared module state — SVG root, tool mode, selection sets, color/legend data |
| `helpers.js` | Pure utility functions — coordinate helpers, hit testing, anchor system (per-ellipse visibility, highlighting), bezier curves, arrow path computation, text wrapping, color utilities, multi-drag |
| `shape.js` | Shape creation, text editing (textarea overlay), shape drag |
| `node.js` | Node creation (fixed 8px circle), drag |
| `arrow.js` | Arrow creation via drag-from-anchor, preview during drag, cancel/finish logic, waypoints, direction, createArrow function |
| `select.js` | Selection logic, handles (resize/endpoint/waypoint), selection menu, color palette, direction buttons, legend, marquee select |
| `app.js` | Top-level event wiring: toolbar, SVG click for shape/node placement, anchor hover detection (mousemove), anchor mousedown for arrow drag, keyboard shortcuts, clipboard, grid toggle, theme toggle |
| `SPECIFICATIONS.md` | **Canonical specification** — must be kept up to date (see Rule #1) |
| `docs/` | Documentation assets |
| `AGENTS.md` | Agent conventions and project context |