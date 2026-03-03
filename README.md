# Area Calculator

**[Live Demo](https://areaimagecalc.pages.dev/)**

A single-file web application for measuring areas and perimeters on images. Load any image, set a real-world scale, and draw shapes to calculate their measurements.

## Features

- **Image Loading**: Drag & drop, paste from clipboard, or use file picker
- **Scale Calibration**: Set a known distance to convert pixels to real-world units
- **Drawing Tools**: Polygon lasso and freehand tracing
- **Edit Mode**: Drag control points to modify existing shapes
- **Perspective Correction**: Four-corner warp with live preview to de-skew images
- **Live Measurements**: Side lengths, area, and perimeter with smart label collision avoidance
- **Image Adjustments**: Brightness and contrast sliders
- **Touch Support**: Full touchscreen support with two-finger pan/zoom
- **Session Persistence**: Auto-saves work to localStorage
- **Responsive UI**: Pan, zoom, and retina display support

## Quick Start

1. Open `index.html` in a modern browser
2. Load an image (drag, paste, or click **Open**)
3. (Optional) Set scale using a known distance
4. Draw shapes with Polygon or Freehand tools
5. View measurements in the shapes panel

## Tools

| Tool | Shortcut | Description |
|------|----------|-------------|
| Scale | `1` | Click two points of known distance to calibrate |
| Polygon | `2` | Click to place vertices, click first point or double-click to close |
| Freehand | `3` | Click and drag to trace, release to finish |
| Edit | `4` | Drag control points to modify shapes |
| Perspective | `5` | Drag image corners to correct perspective distortion |

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `1` - `5` | Select tool |
| `Space` + drag | Pan the image |
| `+` / `-` | Zoom in/out |
| `Ctrl+0` | Fit image to view |
| `Delete` / `Backspace` | Delete selected shape |
| `Enter` | Apply perspective correction |
| `Escape` | Cancel current tool / Deselect shape |

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

## Brightness/Contrast Sliders

- **Drag slider track** to adjust value
- **Click number input** to type a value directly
- **Drag number up/down** to scrub the value
- **Double-click** to reset to 0
- Sliders snap to center when near 0

## Perspective Correction

1. Click **Perspective** (or press `5`)
2. Drag the four corner handles to match the distortion in the image
3. A reference grid helps judge alignment
4. Live CSS preview shows the correction in real-time
5. Press **Apply** (or `Enter`) to commit, **Cancel** (or `Escape`) to abort
6. All existing shapes and scale calibration are transformed automatically

## Scale Calibration

1. Click **Scale** (or press `1`)
2. Click two points on an object of known size
3. Enter the real-world distance and unit
4. All measurements will now display in calibrated units

Supported units: mm, cm, m, in, ft, yd

## Shapes Panel

- Lists all shapes with area and perimeter
- Click to select a shape
- Click **×** to delete a shape
- Shows total area of all shapes

## Persistence

- Session auto-saves after changes (2-second debounce)
- Restores automatically when reopening the page
- Opening a new image prompts to confirm discarding work

## Technical Details

### Architecture

- **Single HTML file** with embedded CSS and JavaScript
- **Two-canvas system**: Image layer + overlay layer for shapes/UI
- **Web Worker**: Area/perimeter calculation and path simplification run off the main thread
- **jQuery**: Used for DOM manipulation and event handling

### Algorithms

- **Area**: Shoelace formula for polygon area
- **Path Simplification**: Ramer-Douglas-Peucker algorithm for freehand traces
- **Freehand Sampling**: Velocity-based adaptive point spacing during drawing
- **Point-in-Polygon**: Ray casting algorithm for selection
- **Perspective**: 4-point homography (DLT) with bilinear interpolation re-raster
- **Label Placement**: AABB collision detection with priority-based rendering

### Browser Support

Modern browsers with support for:
- Canvas 2D API
- Web Workers
- localStorage
- CSS Filters
- FileReader API

## File Structure

```
AreaImageCalc/
├── index.html    # Complete application (single file)
└── README.md     # This documentation
```

## Dependencies

- [jQuery 3.7.1](https://jquery.com/) (CDN)
- [JetBrains Mono](https://fonts.google.com/specimen/JetBrains+Mono) (Google Fonts)

For offline use, download jQuery locally and update the script src.

## License

MIT License
