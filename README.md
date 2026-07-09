# Area Calculator

**[Live Demo](https://areaimagecalc.pages.dev/)**

A browser-based tool for measuring areas and distances on images. Load any image or PDF, set a real-world scale, draw shapes, annotate, and export measurements. No backend, no build step — plain ES modules served as static files.

## Features

- **Image loading**: drag & drop, paste from clipboard, or file picker — JPEG, PNG, GIF, WebP; multiple files at once
- **Integrated sidebar**: Documents and Shapes live in one sidebar as collapsible panes with a draggable height splitter; dock it left or right (File menu, persisted); multi-page PDFs group their pages under one expandable node; file actions sit in a compact File menu
- **Shape organisation**: drag rows to reorder (z-order follows), group shapes with subtotals and collapse, rename inline with a double-click, and recolor via a palette or free-text input (hex, rgb(), names)
- **Move tool**: drag a whole shape to reposition it (handy for comparing outlines); arrow keys nudge
- **Selection cycling**: repeated clicks on overlapping measurements cycle through the stack; the selected shape renders on top
- **PDF support**: thumbnail picker to choose pages (click, All/None, or type a range); pages render lazily at 150 DPI; PageUp/PageDown and a statusbar pager navigate within a document
- **Project save / load**: projects save as `.arcalc.html` — self-describing HTML that opens in any browser on double-click, with a one-click handoff into the app; all tabs, WebP-compressed images, shapes, notes, and scale round-trip
- **Measurements export**: CSV (spreadsheet-ready) or JSON, with calibrated values when a scale is set
- **Scale calibration**: click two points of known distance (mm, cm, m, in, ft, yd); endpoints stay adjustable — drag them in Edit mode (the entered distance is kept) or double-click the scale line to re-calibrate. Alternatively, calibrate from a shape of known area via the shape menu
- **Drawing tools**: polygon, freehand tracing with live fill preview, and open-path distance measurement — tools stay active so you can measure repeatedly; Esc exits
- **Undo / redo**: per-document history for adding, deleting, moving, renaming, regrouping, recoloring, and clearing shapes and scale changes (`Ctrl+Z` / `Ctrl+Shift+Z`); the most recent image transform (rotate / perspective) is also undoable via a snapshot slot in localStorage
- **Notes**: pin text annotations anywhere on the image; they export with measurements
- **Edit mode**: every control point has a minimum-size grab ring; overlapping rings move aside (the point never leaves its ring) so dense vertices stay clickable at any zoom
- **Label / rename**: click any shape to rename it inline
- **Hide / show shapes**: toggle visibility per shape; a "show all" notice appears when any are hidden
- **Image rotation**: 90° buttons and custom angles — recomposed from the original image, so repeated rotations never blur or grow the canvas
- **Perspective correction**: drag four corner handles with a live CSS preview; the pixel warp runs in a Web Worker and never crops — oversized results are scaled into a pixel budget with all geometry kept consistent
- **Square calibration**: click the four corners of a known real-world square — corrects perspective and sets scale in one step
- **Storage management**: images background-encoded to WebP; soft (5 MB) and hard (10 MB) limits with badge warnings and an export prompt
- **Live measurements**: side-length labels, area, and perimeter with collision-avoiding label placement
- **Image adjustments**: brightness and contrast sliders
- **Touch support**: one-finger tools, two-finger pan and pinch-to-zoom
- **Session persistence**: auto-saves to localStorage with a backup key; restores on reload

## Quick Start

1. Open `index.html` in a modern browser (or visit the live demo)
2. Drop an image / PDF, or click **Open**
3. *(Optional)* Click **Scale** `S` and mark a known distance to enable real-world units
4. Draw shapes with **Polygon** `P`, **Freehand** `F`, or measure a path with **Distance** `D` — tools stay active until `Esc`
5. View per-shape and total measurements in the Shapes panel
6. Pin notes with **Note** `N`; rename shapes with **Label** `L`
7. Click **Save** for an `.arcalc.html` project file, or **Export** for CSV / JSON measurements

## Tools

| Tool | Shortcut | Description |
|------|----------|-------------|
| Scale | `S` | Click two points of a known distance; drag endpoints to fine-tune before confirming |
| Polygon | `P` | Click to place vertices; close via first point, double-click, Enter, or right-click |
| Freehand | `F` | Drag to trace; live fill shows the region; release to finish |
| Distance | `D` | Click points along a path; finish with double-click, Enter, or right-click |
| Move | `M` | Drag a whole shape to reposition it; arrow keys nudge (Shift = 10x) |
| Edit | `E` | Drag grab rings to move shape points, note pins, and scale endpoints |
| Label | `L` | Click a shape to rename it; click a note to edit its text |
| Note | `N` | Click to pin a text annotation |
| Perspective | `W` | Drag four corner handles to de-skew the image |
| Square Cal | — | Perspective panel → **Square Cal** tab; click 4 corners of a known square |
| Rotate | — | 90° buttons or a custom-angle popup |

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `S` / `P` / `F` / `D` / `M` / `E` / `L` / `N` | Activate tool (toggle off if already active) |
| `1`–`6` | Numeric aliases for Scale / Polygon / Freehand / Distance / Edit / Perspective |
| `W` | Enter / exit Perspective mode |
| `H` | Hide / show selected shape |
| `Ctrl+Z` / `Ctrl+Shift+Z` (or `Ctrl+Y`) | Undo / redo |
| `Backspace` | Remove the last placed point while drawing; delete selected shape otherwise |
| `Space` + drag | Pan |
| `+` / `-` | Zoom in / out |
| `Ctrl+0` | Fit image to view |
| `PgUp` / `PgDn` | Previous / next page of the current document |
| `Enter` | Finish Distance path · Apply perspective / square calibration |
| `Escape` | Exit current tool / cancel perspective / deselect |
| `?` | Show shortcut help |

## Mouse Controls

| Action | Result |
|--------|--------|
| Scroll wheel | Zoom at cursor |
| Middle-click drag | Pan |
| Right-click | Finish the current path (or clear it if too short) |
| Click shape | Select it |
| Double-click note pin | Edit its text |
| Double-click scale line | Re-open calibration with the value prefilled |

## Touch Controls

| Gesture | Result |
|---------|--------|
| One finger | Use active tool (draw, edit, select) |
| Two fingers | Pan and pinch-to-zoom |
| Tap shape | Select it |

## Scale Calibration

1. Click **Scale** (or press `S`)
2. Click two points on an object of known size — drag the grab rings to fine-tune
3. Enter the real-world distance and unit → **Set**
4. All measurements update immediately to calibrated units

To correct later: drag an endpoint in **Edit** mode (the entered distance is kept and pixels-per-unit recalculates), or double-click the line to re-enter the value.

**Scale by area**: draw a closed shape around a region of known real-world area, open its shape menu (⋮ in the Shapes pane) → **Set scale from area…**, and enter the area. Pixels-per-unit derives from `sqrt(px_area / real_area)`.

Supported units: `mm` `cm` `m` `in` `ft` `yd`

## Square Calibration

A faster alternative that corrects perspective *and* sets scale in one step:

1. Enter Perspective mode (button or `W`) → switch to the **Square Cal** tab
2. Click the four corners of any object you know is a real-world square (any order; drag corners to fine-tune)
3. Enter the side length and click **Apply**

## Perspective Correction (Manual)

1. Click **Perspective** (or press `W`)
2. Drag the four corner handles to match the image distortion — a reference grid helps judge alignment
3. A live CSS preview shows the correction before committing
4. Press **Apply** (or `Enter`); the pixel warp runs in a Web Worker so the UI stays responsive

The output is never cropped. If a strong correction would balloon the raster, a uniform downscale is folded into the transform — shapes, the scale line, and pixels-per-unit all stay consistent.

## Rotation

Rotation always recomposes from the document's base image at the cumulative angle: rotating 10° six times gives the same quality and canvas size as rotating 60° once. Shapes and the scale line rotate with the image; `scalePPU` is preserved.

## Project Files (.arcalc.html)

A project file is a self-describing HTML document saved as `<name>.arcalc.html`: double-clicking it opens the browser with a short explanation and an "Open AreaImageCalc" button that hands the project straight into the app. The project data is embedded in a JSON script tag. Older `.arcalc` files (HTML polyglot or legacy plain JSON) still import. When installed as a PWA, the app registers as a handler for `.arcalc` files.

## Measurements Export

**Export** offers two formats:

- **CSV** — one row per shape (`document, name, type, area, area_unit, length, length_unit, area_px2, length_px, text`), BOM-prefixed for spreadsheet apps
- **JSON** — per-tab measurements with shape coordinates for downstream processing

## Storage Management

| Condition | Behaviour |
|-----------|-----------|
| Save ≤ 5 MB | Full save — all tabs with images |
| 5 MB < save ≤ 10 MB | Background-tab images dropped; yellow badge on Save |
| Save > 10 MB | All images dropped from auto-save; red badge; modal prompts to export a project file |

Images are background-encoded to WebP (35% lossy) via a Web Worker to reduce footprint before the size check runs.

## Architecture

The app is split into ES modules — `index.html` only contains the CSS and HTML shell. The module graph is a strict DAG (see `CLAUDE.md` for the layer diagram).

| File | Responsibility |
|------|----------------|
| `js/app.js` | Entry point: wires modules together, restores saved state |
| `js/constants.js` | Palette, save keys/versions, storage limits (pure) |
| `js/math.js` | Pure geometry: shoelace, distance, point-in-polygon, fit-scale |
| `js/handles.js` | Pure grab-ring layout: min hit size, collision displacement |
| `js/arcalcFormat.js` | Pure `.arcalc` HTML-polyglot encode / decode |
| `js/csv.js` | Pure measurements CSV builder |
| `js/color.js` | Pure color parsing (hex, rgb(), names → #RRGGBB) |
| `js/state.js` | Shared mutable state (`S`), DOM refs, workers |
| `js/canvasUtil.js` | Canvas encode helper (WebP with PNG fallback) |
| `js/geometry.js` | State-aware transforms, formatting, handle collection |
| `js/ui.js` | Status bar, tool state, panel, sliders — all DOM updates |
| `js/history.js` | Per-tab undo / redo snapshots |
| `js/tabs.js` | Tab lifecycle, document grouping, sidebar rendering, page nav |
| `js/storage.js` | localStorage save / restore with size-aware fallback logic |
| `js/storageUI.js` | Storage warning badge + hard-limit modal |
| `js/tools.js` | Image loading & rotation, shape ops, scale, notes |
| `js/perspective.js` | Manual 4-point warp, homography math, worker-backed warp |
| `js/squareCalib.js` | Square-based perspective + scale calibration tool |
| `js/export.js` | `.arcalc` export / import, CSV / JSON measurements export |
| `js/pdf.js` | Lazy PDF.js loading, thumbnail page picker, per-page tabs |
| `js/render.js` | rAF render loop, canvas drawing, grab rings, note labels |
| `js/input.js` | Mouse / touch / keyboard events, file queue, toolbar bindings |
| `js/worker.js` | Web Worker: shoelace, RDP simplification, homography warp |
| `js/imageWorker.js` | Web Worker: OffscreenCanvas WebP encoder |

### Key Algorithms

- **Area / perimeter**: shoelace formula, runs in a Web Worker
- **Path simplification**: Ramer–Douglas–Peucker, runs in a Web Worker
- **Freehand sampling**: fixed screen-space step (zoom-independent detail)
- **Point-in-polygon**: ray casting
- **Homography**: 4-point DLT with Gaussian elimination; bilinear re-raster in a Web Worker; pixel-budget scale folding
- **Handle layout**: iterative pairwise ring separation clamped so control points never exit their rings
- **Label placement**: AABB collision detection with priority (area labels, then longest sides, then notes)

## Testing

```sh
npm test           # Vitest unit tests (pure modules)
npm run test:e2e   # Playwright E2E (headless Chromium)
npm run test:all   # both
```

## Dependencies

- [jQuery 3.7.1](https://jquery.com/) — DOM / events (CDN)
- [JetBrains Mono](https://fonts.google.com/specimen/JetBrains+Mono) — monospace font (Google Fonts)
- [PDF.js](https://mozilla.github.io/pdf.js/) — lazy-loaded from CDN the first time a PDF is opened

## Browser Support

Requires a modern browser with ES modules, Canvas 2D, Web Workers, and `localStorage`. `createImageBitmap` and `OffscreenCanvas` are used when available (WebP encoding) and degrade gracefully.

## License

MIT License
