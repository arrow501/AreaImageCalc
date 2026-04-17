# Testing Guide

## Overview

Two test suites run entirely locally — no CI required.

| Suite | Tool | Count | Scope |
|-------|------|-------|-------|
| Unit | Vitest | 38 tests | Pure functions (no DOM) |
| E2E | Playwright | 12 tests | Full app in headless Chromium |

---

## Quick Start

```sh
npm install            # installs Vitest, Playwright, jQuery (for CDN stub)
npm test               # unit tests only
npm run test:e2e       # E2E tests only
npm run test:all       # both suites
```

---

## Unit Tests (`tests/unit/`)

Runs in Node.js — no browser, no DOM, no mocks needed.

### `math.test.js`
Tests `js/math.js` pure functions:

- **`distSeg(p, a, b)`** — distance from point to line segment (10 cases)
  - Zero-length segment, endpoints, midpoint, perpendicular above/below
  - Clamped beyond-end and before-start cases
  - Diagonal segments
- **`pip(point, polygon)`** — point-in-polygon ray casting (9 cases)
  - Inside/outside unit square and triangle
  - Concave (L-shaped) polygon with a notch
- **`centroid(points)`** — arithmetic mean centroid (6 cases)
  - Single point, two-point midpoint, unit square, triangle
  - Fractional coords, regular hexagon

### `constants.test.js`
Tests `js/constants.js` exported values:

- **`COLORS`** — array, ≥2 entries, all valid 6-digit hex, all unique
- **`SAVE_KEY`** — non-empty string
- **`SAVE_VER` / `SAVE_VER_LEGACY`** — positive integers, legacy < current
- **`STORAGE_SOFT_LIMIT` / `STORAGE_HARD_LIMIT`** — positive, soft < hard, soft ≥ 1 MB, hard ≤ 50 MB

### Adding unit tests

Only `js/math.js` and `js/constants.js` are importable without a DOM. To test
other modules, they would need to be refactored to separate pure logic from DOM
access (see the architectural plan for guidance).

---

## E2E Tests (`tests/e2e/smoke.spec.js`)

Runs the full app in headless Chromium via Playwright.

### Infrastructure

**Static server** — `tests/server.js`
A minimal Node.js `http.createServer` that serves the project root. Started
automatically by Playwright's `webServer` config; reused across tests when
already running. Prefer this over `python3 -m http.server` (more reliable).

**CDN interception** — applied in `beforeEach` to every test:
- jQuery CDN (`code.jquery.com`) → served from `node_modules/jquery/dist/jquery.min.js`
- Google Fonts CSS/fonts → fulfilled with empty 200 responses
- `favicon.ico` → 204 No Content

This is necessary because the test environment blocks external network requests.

**Browser binary** — auto-detected:
```
/opt/pw-browsers/chromium   ← pre-installed binary (this machine)
```
On machines where Playwright manages its own browsers, it falls back to the
downloaded build automatically. Override with env var:
```sh
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/path/to/chrome npm run test:e2e
```

### Test coverage

| # | Test | What it checks |
|---|------|----------------|
| 1 | App loads | Title matches `/area/i`, no JS runtime errors, no failed `.js` modules, jQuery defined |
| 2 | Dropzone visible | `#dropzone` visible before image load |
| 3 | Tools disabled | `#btn-polygon`, `#btn-freehand`, `#btn-scale` have `.disabled` before load |
| 4 | Image load enables tools | Tools lose `.disabled`, dropzone content hides |
| 5 | Status bar dimensions | Shows "800" and "600" after loading an 800×600 image |
| 6 | Draw polygon | Shape appears in panel, area resolves from `...` |
| 7 | Delete shape | Shape removed, total shows "No shapes yet" |
| 8 | New tab | Tab count increases by 1 |
| 9 | Close tab | Tab count decreases by 1 |
| 10 | Key `2` | `#btn-polygon` gets `.active` |
| 11 | Key `Escape` | `#btn-polygon` loses `.active` |
| 12 | Key `+` | `#zoom-display` text changes |

### `loadTestImage` helper

Creates a PNG entirely in-browser (no fixture files), uploads it via
`#file-input`, and waits for `#status-text` to contain `"Image loaded"`.
Default size: 800×600. Accepts `(page, width, height)`.

### Adding E2E tests

Add new `test(...)` blocks to `smoke.spec.js` or create additional spec files
in `tests/e2e/`. The `loadTestImage` helper is importable from the same file or
can be moved to a shared `helpers.js`.

Common patterns:

```js
// Wait for a specific status message
await expect(page.locator('#status-text')).toContainText('Click to place vertices');

// Assert count of DOM elements
await expect(page.locator('.shape-item')).toHaveCount(2);

// Simulate mouse drawing
const box = await page.locator('#overlay-canvas').boundingBox();
await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
```

---

## Configuration Files

| File | Purpose |
|------|---------|
| `vitest.config.js` | Points Vitest at `tests/unit/**/*.test.js`, Node environment |
| `playwright.config.js` | Chromium only, `baseURL` localhost:3000, retries: 1 |
| `tests/server.js` | Static file server for Playwright |
| `package.json` | `test`, `test:e2e`, `test:all`, `test:watch` scripts |
