# The Organizer — Specifications

> A whiteboard/canvas tool for world building, built on [tldraw](https://github.com/tldraw/tldraw).

---

## 1. Overview

**The Organizer** is a visual world-building canvas that allows users to organize ideas, characters, locations, relationships, and lore using a minimal set of graphical primitives. It is designed for writers, game masters, and creators who need a flexible, color-coded spatial workspace.

The tool is built as a single-page application leveraging **tldraw** as the core canvas/shape library, extending it with custom shape types and UI affordances for world-building-specific workflows.

---

## 2. Technology Stack

| Layer          | Technology                         |
|----------------|------------------------------------|
| Framework      | tldraw v5.x                        |
| Language       | TypeScript                         |
| Bundler        | Vite (recommended)                 |
| Styling        | CSS / Tailwind (optional)          |
| State          | tldraw's built-in store + custom schema |

---

## 3. Architecture

```
┌─────────────────────────────────────────────┐
│                  UI Layer                    │
│  ┌─────────┐ ┌──────────┐ ┌──────────────┐ │
│  │ Toolbar  │ │  Canvas   │ │  Key / Legend │ │
│  │ (custom) │ │ (tldraw) │ │    Panel     │ │
│  └─────────┘ └──────────┘ └──────────────┘ │
├─────────────────────────────────────────────┤
│              tldraw Core Engine              │
│  ┌─────────┐ ┌──────────┐ ┌──────────────┐ │
│  │ Shapes   │ │  Store    │ │    Input     │ │
│  │ (custom) │ │ (signals)│ │  (gestures)  │ │
│  └─────────┘ └──────────┘ └──────────────┘ │
├─────────────────────────────────────────────┤
│            Persistence Layer                 │
│  ┌──────────────────────────────────────┐   │
│  │  LocalStorage / File Export (.tlor)  │   │
│  └──────────────────────────────────────┘   │
└─────────────────────────────────────────────┘
```

- **tldraw Engine** provides the rendering loop, hit testing, selection, zoom/pan, undo/redo, and persistence.
- **Custom Shapes** are registered with tldraw via its `ShapeUtil` API.
- **UI Layer** overlays custom React components on top of the tldraw `<Tldraw />` component.
- **Persistence** uses tldraw's built-in snapshot system, optionally saving to `localStorage` or exporting to a `.tlor` file.

---

## 4. Elements (Custom Shape Types)

### 4.1 Nodes

**Purpose:** Represent discrete entities (characters, locations, items, events).

| Property   | Type             | Default  | Constraints                          |
|------------|------------------|----------|--------------------------------------|
| Position   | `Vec2d`          | —        | Freeform on canvas                   |
| Color      | `string` (hex)   | `#888888`| Picked from Key palette              |
| Radius     | `number`         | `16`     | Fixed (not user-resizable)           |
| Label      | `string`         | `""`     | Short text label (optional)          |
| Label font | `string`         | system   | Inherited from theme                 |

**Behavior:**
- Rendered as a filled circle.
- Cannot be scaled or rotated — only moved and recolored.
- Clicking reveals a color picker bound to the Key palette.
- A node may be connected by an arrow to any other node, arrow, label, or circle/oval.

### 4.2 Arrows

**Purpose:** Represent relationships, flows, or connections between elements.

| Property        | Type             | Default     | Constraints                |
|-----------------|------------------|-------------|----------------------------|
| Start bind      | `ShapeId`        | —           | Anchors to any shape       |
| End bind        | `ShapeId`        | —           | Anchors to any shape       |
| Color           | `string` (hex)   | `#888888`   | Picked from Key palette    |
| Direction type  | `enum`           | `mono`      | `none` / `mono` / `dual`   |
| Line style      | `string`         | `solid`     | solid, dashed, dotted (opt)|
| Thickness       | `number`         | `2`         | 1–6 px                     |
| Path            | `Vec2d[]`        | —           | Waypoints along the line   |

**Direction enum:**
- `none`:  Plain line — no arrowhead at either end.
- `mono`: Single arrowhead at the terminal end.
- `dual`: Arrowheads at both start and end.

**Behavior:**
- Drawn from one shape to another (or to a canvas point).
- Passes through intermediate nodes or arrows in its visual path (respects bounds/obstacles — optional smart routing).
- Color can be changed independently of connected shapes.
- Waypoints can be added/removed/dragged.

### 4.3 Labels

**Purpose:** Free-form textual annotations with adjustable geometry.

| Property     | Type             | Default     | Constraints                 |
|--------------|------------------|-------------|-----------------------------|
| Position     | `Vec2d`          | —           | Freeform on canvas          |
| Width        | `number`         | `200`       | Min `80`, max `800`         |
| Height       | `number`         | `auto`      | Grows with content          |
| Text         | `string`         | `"Label"`   | Rich text (plain)           |
| Color        | `string` (hex)   | `#000000`   | Text color from Key palette |
| Font size    | `number`         | `16`        | 10–48 px                    |
| Font family  | `string`         | system      | System default               |
| Background   | `string` (hex)   | `transparent`| Fill from Key palette       |

**Behavior:**
- Resizable via corner handles; maintains aspect ratio freely.
- Content is editable inline (double-click).
- Background color and text color independently configurable.

### 4.4 Keys (Legend)

**Purpose:** Define a color-coding system for the canvas.

| Property   | Type                       | Default | Constraints            |
|------------|----------------------------|---------|------------------------|
| Entries    | `KeyEntry[]`               | `[]`    | At least 1             |
| Visible    | `boolean`                  | `true`  | Toggle legend on/off   |
| Position   | `Vec2d` or `"toolbar"`    | toolbar | Floating or in-panel   |

**`KeyEntry`:**
```ts
interface KeyEntry {
  id: string;
  color: string;    // hex
  label: string;    // e.g. "Characters", "Locations"
  shortcut?: string; // optional keyboard shortcut
}
```

**Behavior:**
- A floating or docked panel showing color swatches and their meanings.
- Clicking a key entry filters/selects all elements of that color (optional).
- Adding/removing/renaming keys updates the global palette.
- Nodes, Arrows, Labels, and Circles/Ovals all pull their color choices from this palette.

### 4.5 Circles / Ovals

**Purpose:** Grouping or emphasis shapes — regions of interest on the canvas.

| Property   | Type             | Default      | Constraints                  |
|------------|------------------|--------------|------------------------------|
| Position   | `Vec2d`          | —            | Freeform on canvas           |
| Width      | `number`         | `300`        | Min `50`, no max             |
| Height     | `number`         | `200`        | Min `50`, no max             |
| Fill color | `string` (hex)   | `transparent`| From Key palette             |
| Stroke     | `string` (hex)   | `#888888`    | From Key palette             |
| Stroke width| `number`        | `2`          | 1–8 px                       |
| Text       | `string`         | `""`         | Optional centered label      |
| Dashed     | `boolean`        | `false`      | Toggle solid/dashed outline  |

**Behavior:**
- Can be resized and repositioned.
- Arrows can connect to circles (binding to their perimeter).
- Text appears centered inside the oval.
- Drawn as an ellipse (not a strict circle — aspect ratio is free).

---

## 5. UI / UX Requirements

### 5.1 Toolbar

A custom toolbar (separate from or augmenting tldraw's default) providing:
- Tool selection: Pointer (select/move), Node, Arrow (with sub-type toggle: none/mono/dual), Label, Circle/Oval.
- Color picker: Shows the current Key palette swatches; selecting one sets the active color.
- Undo / Redo buttons (or rely on tldraw default).
- Delete selected.
- Toggle background grid.
- Toggle dark/light mode.

### 5.2 Canvas

- Infinite pan/zoom canvas (tldraw default).
- Background grid that can be toggled on/off.
- Snap-to-grid (optional, configurable).

### 5.3 Key / Legend Panel

- A panel (collapsible, dockable on the right or left, or floating).
- Lists all defined keys with their color swatch and label.
- "Add Key" button creates a new entry (auto-generates a new color).
- Each key row has an edit (rename) and delete button.
- Clicking a key does **not** change the active tool but may highlight elements of that color.

### 5.4 Theme

| Mode    | Canvas BG | Grid     | Default text |
|---------|-----------|----------|--------------|
| Light   | `#F9F9F9` | `#DDD`   | `#1A1A1A`    |
| Dark    | `#1E1E1E` | `#333`   | `#F0F0F0`    |

- Theme toggle is persistent across sessions.
- Element colors from the Key palette remain unchanged across themes.

### 5.5 Keyboard Shortcuts

| Shortcut              | Action              |
|-----------------------|---------------------|
| `V`                   | Select/Pointer tool |
| `N`                   | Node tool           |
| `A`                   | Arrow tool          |
| `Shift+A`             | Cycle arrow type    |
| `L`                   | Label tool          |
| `O`                   | Circle/Oval tool    |
| `G`                   | Toggle grid         |
| `D`                   | Toggle dark mode    |
| `Delete` / `Backspace`| Delete selected     |
| `Ctrl+Z` / `Cmd+Z`   | Undo                |
| `Ctrl+Shift+Z` / `Cmd+Shift+Z` | Redo      |
| `Escape`              | Deselect / exit tool|

---

## 6. Data Model

The internal data model extends tldraw's `TLSchema` with custom shape types.

### 6.1 Store Shape Definitions

```ts
// Node
type TLNodeShape = TLBaseShape<"node", {
  color: string;
  radius: number;
  label: string;
}>;

// Arrow
type TLArrowShape = TLBaseShape<"arrow", {
  color: string;
  direction: "none" | "mono" | "dual";
  thickness: number;
  waypoints: Vec2d[];
  startBinding?: { shapeId: ShapeId; handle: "start" | "end" | "center" };
  endBinding?: { shapeId: ShapeId; handle: "start" | "end" | "center" };
}>;

// Label
type TLLabelShape = TLBaseShape<"label", {
  text: string;
  color: string;
  backgroundColor: string;
  fontSize: number;
  fontFamily: string;
  w: number;
  h: number;
}>;

// Circle/Oval
type TLCircleShape = TLBaseShape<"circle", {
  fillColor: string;
  strokeColor: string;
  strokeWidth: number;
  text: string;
  dashed: boolean;
  w: number;
  h: number;
}>;

// Key (stored as app state, not a canvas shape)
interface KeyEntry {
  id: string;
  color: string;
  label: string;
}

interface KeyState {
  entries: KeyEntry[];
  visible: boolean;
}
```

### 6.2 Persistence

- **Auto-save** to `localStorage` on every change (debounced, 500ms).
- **Export** snapshot as `.tlor` file (tldraw's JSON format).
- **Import** from `.tlor` file.
- Key definitions are stored alongside the canvas snapshot.

---

## 7. Implementation Plan

### Phase 1: Foundation
- [ ] Scaffold Vite + React + tldraw project.
- [ ] Register custom shapes (Node, Arrow, Label, Circle) with `ShapeUtil` stubs.
- [ ] Basic rendering for each shape type.

### Phase 2: Interaction
- [ ] Node: click-to-place, move, recolor via palette.
- [ ] Arrow: click-to-bind-start, click-to-bind-end, waypoint editing, direction toggle.
- [ ] Label: place, resize, inline edit, recolor.
- [ ] Circle/Oval: place, resize, recolor, text input.

### Phase 3: Key System
- [ ] Key panel UI with add/edit/delete entries.
- [ ] Wire Key palette into color pickers for all shapes.
- [ ] Persist keys alongside canvas state.

### Phase 4: Polish
- [ ] Dark/light mode toggle.
- [ ] Background grid toggle.
- [ ] Export/import `.tlor` files.
- [ ] Keyboard shortcuts.
- [ ] Smart arrow routing (optional).

---

## 8. Glossary

| Term      | Definition                                           |
|-----------|------------------------------------------------------|
| Node      | A fixed-radius colored circle representing an entity.|
| Arrow     | A directional or non-directional connecting line.    |
| Label     | A resizable text box for annotations.               |
| Key       | A named color entry in the legend palette.           |
| Circle    | A resizable ellipse for grouping/emphasis.           |
| ShapeUtil | tldraw's plugin interface for custom shape types.    |
| .tlor     | tldraw's native JSON snapshot file format.           |
