# Area Calculator

**[Live Demo](https://areaimagecalc.pages.dev/)**

A browser-based tool for measuring areas and perimeters on images. Load any image or PDF, set a real-world scale, draw shapes, and export measurements.

## Features

- **Image loading**: drag & drop, paste from clipboard, or file picker — JPEG, PNG, GIF, WebP; multiple files at once
- **Multi-tab workspace**: open multiple images in parallel tabs, each with independent shapes, scale, and view state
- **PDF support**: load PDFs, pick a page range, each page opens in its own tab at 150 DPI
- **Project save / load**: `.arcalc` files (JSON) save all tabs, images (WebP-compressed), shapes, and scale — reopens the full session
- **Measurements export**: JSON file with per-tab areas, perimeters, and calibrated values
- **Scale calibration**: click two points of known distance to convert pixels to real-world units (mm, cm, m, in, ft, yd)
- **Drawing tools**: Polygon lasso and freehand tracing
- **Edit mode**: drag control points to reshape existing polygons or freehand traces
- **Image rotation**: ↺ / ↻ 90° buttons and a custom angle popup — shapes and scale line rotate with the image
- **Perspective correction**: drag four corner handles to de-skew an image with a live CSS preview
- **Square calibration**: click the four corners of any object known to be a real-world square — corrects perspective and sets scale in one step
- **Storage management**: images are background-encoded to WebP (35% quality) to shrink localStorage usage; soft (5 MB) and hard (10 MB) limits with visual badge warnings and an export prompt
- **New project**: clears all tabs and resets to a blank workspace with a confirmation modal
- **Live measurements**: side-length labels, area, and perimeter with AABB collision-avoiding label placement
- **Image adjustments**: brightness and contrast sliders (drag, scrub, type, or double-click to reset)
- **Touch support**: one-finger tools, two-finger pan and pinch-to-zoom
- **Session persistence**: auto-saves to localStorage (2-second debounce); restores on reload

## Quick Start

1. Open `index.html` in a modern browser (or visit the live demo)
2. Drop an image / PDF, or click **Open**
3. *(Optional)* Click **Scale** and mark a known distance to enable real-world units
4. Draw shapes with **Polygon** or **Freehand**
5. View per-shape and total measurements in the Shapes panel
6. Click **Save** to export an `.arcalc` project file, or **Export** for a measurements JSON

## Tools

| Tool | Shortcut | Description |
|------|----------|-------------|
| Scale | `1` | Click two points of a known distance to calibrate units |
| Polygon | `2` | Click to place vertices; click first point or double-click to close |
| Freehand | `3` | Click and drag to trace; release to finish |
| Edit | `4` | Drag control points to reshape existing shapes |
| Perspective | `5` | Drag four corner handles to de-skew the image |
| Square Cal | — | In the Perspective panel → **Square Cal** tab; click 4 corners of a known square |
| ↺ 90° | — | Rotate image 90° counter-clockwise |
| ↻ 90° | — | Rotate image 90° clockwise |
| Rotate… | — | Rotate by a custom angle (popup) |

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `1` – `5` | Select tool |
| `Space` + drag | Pan |
| `+` / `-` | Zoom in / out |
| `Ctrl+0` | Fit image to view |
| `Enter` | Apply perspective correction or square calibration |
| `Escape` | Cancel current tool / exit perspective / deselect shape |
| `Delete` / `Backspace` | Delete selected shape |

## Mouse Controls

| Action | Result |
|--------|--------|
| Scroll wheel | Zoom at cursor |
| Middle-click drag | Pan |
| Right-click | Cancel current drawing |
| Click shape | Select it |
| Double-click (polygon) | Close polygon |

## Touch Controls

| Gesture | Result |
|---------|--------|
| One finger | Use active tool (draw, edit, select) |
| Two fingers | Pan and pinch-to-zoom |
| Tap shape | Select it |

## Scale Calibration

1. Click **Scale** (or press `1`)
2. Click two points on an object of known size
3. Enter the real-world distance and unit → **Set**
4. All measurements update immediately to calibrated units

Supported units: `mm` `cm` `m` `in` `ft` `yd`

## Square Calibration

A faster alternative that corrects perspective *and* sets scale in one step:

1. Enter Perspective mode (button or `5`) → switch to the **Square Cal** tab
2. Click the four corners of any object you know is a real-world square (any order; drag corners to fine-tune)
3. Enter the side length and click **Apply**

The image is de-skewed and the scale is set automatically.

## Perspective Correction (Manual)

1. Click **Perspective** (or press `5`)
2. Drag the four corner handles to match the image distortion — a reference grid helps judge alignment
3. A live CSS preview shows the correction before committing
4. Press **Apply** (or `Enter`) to re-raster; all shapes and the scale line transform automatically

## Rotation

- **↺ 90°** / **↻ 90°**: instant 90° rotation — shapes, scale line, and saved image all update
- **Rotate…**: opens a popup for arbitrary angles (positive = CW); same quick 90° buttons available inside
- All shape coordinates and the scale line are rotated with the image; `scalePPU` is preserved (rotation is distance-preserving)

## Project Files (.arcalc)

`.arcalc` files are plain JSON. They store every tab's label, WebP-encoded image, viewport, shapes, scale, and brightness/contrast settings. Use **Save** to export and **Open** to import.

## Measurements Export

**Export** produces a `measurements.json` with per-tab areas, perimeters, and (when a scale is set) calibrated values in real-world units. Shape coordinates (image-space pixels) are included for downstream processing.

## Storage Management

Because localStorage is limited, the app manages save size automatically:

| Condition | Behaviour |
|-----------|-----------|
| Save ≤ 5 MB | Full save — all tabs with images |
| 5 MB < save ≤ 10 MB | Background-tab images dropped; yellow ⚠ badge on Save |
| Save > 10 MB | All images dropped from auto-save; red ✕ badge; modal prompts to export a project file |

Images are background-encoded to WebP (35% lossy) via a Web Worker to reduce footprint before the size check runs.

## Brightness / Contrast Sliders

- **Drag the track** to adjust
- **Click the number field** and type a value
- **Drag the number field** vertically to scrub
- **Double-click** either element to reset to 0
- Snap-to-zero when within ±6 of centre

## Architecture

The app is split into ES modules — `index.html` only contains the CSS and HTML shell.

| File | Responsibility |
|------|----------------|
| `js/app.js` | Entry point: wires modules together, restores saved state |
| `js/state.js` | Shared mutable state (`S`), constants, DOM refs, workers |
| `js/input.js` | Mouse / touch / keyboard events, file queue, toolbar bindings |
| `js/tools.js` | Tool management, image loading & rotation, shape ops, view control |
| `js/render.js` | rAF render loop, canvas drawing (image layer + overlay layer) |
| `js/geometry.js` | Math utilities: shoelace, RDP, pip, distance, label formatting |
| `js/perspective.js` | Manual 4-point warp, homography math, shared pixel transform |
| `js/squareCalib.js` | Square-based perspective + scale calibration tool |
| `js/tabs.js` | Tab lifecycle (create / switch / close / serialize), tab bar rendering |
| `js/storage.js` | localStorage save / restore with size-aware fallback logic |
| `js/storageUI.js` | Storage warning badge + hard-limit modal |
| `js/export.js` | `.arcalc` project export / import, measurements JSON export |
| `js/pdf.js` | Lazy PDF.js loading, page-range dialog, per-page tab creation |
| `js/worker.js` | Web Worker: area & perimeter (shoelace) + RDP path simplification |
| `js/imageWorker.js` | Web Worker: OffscreenCanvas WebP encoder |

### Key Algorithms

- **Area / perimeter**: Shoelace formula, runs in a Web Worker
- **Path simplification**: Ramer–Douglas–Peucker, runs in a Web Worker
- **Freehand sampling**: velocity-based adaptive point spacing during drawing
- **Point-in-polygon**: ray casting
- **Homography**: 4-point DLT with Gaussian elimination; bilinear interpolation re-raster
- **Label placement**: AABB collision detection with priority (area labels first, then longest sides)

## File Structure

```
AreaImageCalc/
├── index.html          # UI shell (HTML + CSS only)
├── README.md
└── js/
    ├── app.js
    ├── state.js
    ├── input.js
    ├── tools.js
    ├── render.js
    ├── geometry.js
    ├── perspective.js
    ├── squareCalib.js
    ├── tabs.js
    ├── storage.js
    ├── storageUI.js
    ├── export.js
    ├── pdf.js
    ├── worker.js
    └── imageWorker.js
```

## Dependencies

- [jQuery 3.7.1](https://jquery.com/) — DOM / events (CDN)
- [JetBrains Mono](https://fonts.google.com/specimen/JetBrains+Mono) — monospace font (Google Fonts)
- [PDF.js](https://mozilla.github.io/pdf.js/) — lazy-loaded from CDN the first time a PDF is opened

## Browser Support

Requires a modern browser with:
- ES Modules (`type="module"`)
- Canvas 2D API
- Web Workers
- `localStorage`
- CSS Filters
- `FileReader` API
- `createImageBitmap` *(optional — used for WebP encoding; falls back to main-thread canvas if absent)*
- `OffscreenCanvas` *(optional — used inside the WebP worker; gracefully degrades)*

## License

MIT License
