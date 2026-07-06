# Testing Guide

## Overview

Two test suites run entirely locally — no CI required.

| Suite | Tool | Scope |
|-------|------|-------|
| Unit | Vitest | Layer 0 pure modules (no DOM) |
| E2E | Playwright | Full app in headless Chromium |

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

| File | Module under test | Covers |
|------|-------------------|--------|
| `math.test.js` | `js/math.js` | `distSeg`, `pip`, `centroid`, `segmentLength`, `nearestPoint`, `fitScale` |
| `constants.test.js` | `js/constants.js` | palette validity, save-version ordering (legacy < compat < current), storage limits |
| `handles.test.js` | `js/handles.js` | grab-ring layout: no displacement when apart, collision push-apart, control point never exits its ring, deterministic coincident separation, hit-testing against displaced ring centres |
| `arcalcFormat.test.js` | `js/arcalcFormat.js` | HTML polyglot structure, `<`-escaping, round-trips (incl. hostile strings), legacy JSON + BOM acceptance, rejection of unrelated/truncated files |
| `csv.test.js` | `js/csv.js` | escaping, number formatting, scaled/unscaled rows, segment and note rows, CRLF |

### Adding unit tests

Layer 0 modules (`math.js`, `constants.js`, `handles.js`, `arcalcFormat.js`,
`csv.js`) are importable without a DOM. To test other modules, extract the
pure logic into Layer 0 first.

---

## E2E Tests (`tests/e2e/`)

Runs the full app in headless Chromium via Playwright.

### Infrastructure

**Static server** — `tests/server.js`
A minimal Node.js `http.createServer` that serves the project root. Started
automatically by Playwright's `webServer` config; reused across tests when
already running. Prefer this over `python3 -m http.server` (more reliable).

**Shared helpers** — `tests/e2e/helpers.js`
- `interceptCdn(page)` — routes jQuery CDN to `node_modules`, fulfills Google
  Fonts with empty 200s, stubs favicon. Required: the test environment blocks
  external network requests.
- `loadTestImage(page, w, h)` — builds a PNG in-browser, uploads it via
  `#file-input`, waits for the "Image loaded" status.
- `canvasCenter(page)` — centre of the overlay canvas in page coords.
- `drawTriangle(page, cx, cy, off)` — draws and closes a polygon triangle.

**Browser binary** — auto-detected at `/opt/pw-browsers/chromium`; falls back
to Playwright's own download elsewhere. Override:
```sh
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/path/to/chrome npm run test:e2e
```

### Spec files

| File | Covers |
|------|--------|
| `smoke.spec.js` | App boot without errors, initial UI state, image load enables tools, polygon draw + area, delete, document sidebar add/close, tool hotkeys, zoom keys, backup-key recovery, visibilitychange save flush |
| `interactions.spec.js` | Sticky tools, Backspace point removal, right-click path finish, undo/redo (add, delete, clear), scale-endpoint drag in edit mode, double-click scale re-calibration, freehand trace |
| `export.spec.js` | .arcalc is self-describing HTML, .arcalc round-trip, legacy JSON import, CSV export content, JSON export content |
| `notes.spec.js` | Note pinning via hotkey, cancel leaves no shape, double-click text editing, note undo |

### Common patterns

```js
// Wait for a specific status message
await expect(page.locator('#status-text')).toContainText('Click to place vertices');

// Assert count of DOM elements
await expect(page.locator('.shape-item')).toHaveCount(2);

// Capture a download
const [download] = await Promise.all([
  page.waitForEvent('download'),
  page.locator('#btn-export-project').click(),
]);

// Reset persisted state before a reload (beforeunload flushes a save,
// so a plain localStorage.clear() before reload is not enough)
await page.addInitScript(() => localStorage.clear());
await page.reload();
```

---

## Configuration Files

| File | Purpose |
|------|---------|
| `vitest.config.js` | Points Vitest at `tests/unit/**/*.test.js`, Node environment |
| `playwright.config.js` | Chromium only, `baseURL` localhost:3000, retries: 1 |
| `tests/server.js` | Static file server for Playwright |
| `package.json` | `test`, `test:e2e`, `test:all`, `test:watch` scripts |
