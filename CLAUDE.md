# AreaImageCalc — Claude Context

## What This Is

A browser-based area measurement tool. Users load images or PDFs, draw polygons or freehand traces, calibrate scale, and export measurements. No backend, no build step, no bundler — plain ES modules served as static files.

Live at: https://areaimagecalc.pages.dev/

---

## Hard Constraints (Never Break These)

- **No bundler, no TypeScript, no framework.** Vanilla JS ES modules only.
- **No `var`.** All new code uses `const` / `let`. The entire codebase was converted in Phase 4.
- **No `fn` dispatch object.** It was removed in Phase 3. All inter-module calls are direct named imports.
- **jQuery stays.** It's already used throughout; don't replace it with vanilla DOM or introduce a second library.
- **No new `<script>` tags in `index.html`** unless adding a new Web Worker. Modules are auto-resolved.
- **`worker.js` and `imageWorker.js` are standalone Web Workers** — they cannot use ES module imports.

---

## Architecture

The module graph is a strict DAG — no circular imports. Layers:

```
Layer 0 — zero deps, Node-importable, fully unit-testable
  constants.js   COLORS, SAVE_KEY, SAVE_VER*, STORAGE_*_LIMIT
  math.js        distSeg, pip, centroid

Layer 1 — runtime core (DOM-dependent)
  state.js       S object, DOM refs, workers  ← constants.js

Layer 2 — pure logic
  geometry.js    coordinate transforms, formatting  ← state.js, math.js

Layer 3 — UI primitives (all DOM-update functions)
  ui.js          status, enableTools, setTool, fitView,
                 updatePanel, updateScaleDisp, updateZoomDisp,
                 updateFilters, syncSliders  ← state.js, geometry.js

Layer 4 — feature modules (import upward only)
  tabs.js        tab lifecycle       ← state.js, ui.js, perspective.js, squareCalib.js
  storage.js     persistence         ← state.js, tabs.js
  storageUI.js   warning badge       ← state.js
  tools.js       shapes, image, view ← state.js, geometry.js, ui.js, storage.js, tabs.js
  perspective.js warp + homography   ← state.js, geometry.js, ui.js
  squareCalib.js square calibration  ← state.js, perspective.js, ui.js
  export.js      project I/O         ← state.js, tabs.js, ui.js
  pdf.js         PDF loading         ← state.js, ui.js, tabs.js
  render.js      rAF draw loop       ← state.js, geometry.js, perspective.js, squareCalib.js

Layer 5 — input (imports everything, nobody imports it)
  input.js       all event handlers  ← everything above

Layer 6 — bootstrap
  app.js         restores state, starts render loop  ← everything
```

**If a new module breaks this layering, flag it before implementing.**

---

## Testing — Always Run, Always Report

### Rule: tests are not optional

Every code change must be followed by running the relevant test suite. Do not report a task as complete without running tests. If tests fail, surface the failure immediately and fix it before closing the task.

When adding new functionality:
1. Write unit tests for any new pure functions added to `math.js` or `constants.js`
2. Write or extend E2E tests in `tests/e2e/smoke.spec.js` if the feature has a UI surface
3. Run both suites and confirm they pass

### Commands

```sh
npm test               # Vitest unit tests (~1s)
npm run test:e2e       # Playwright E2E (headless Chromium, ~15s)
npm run test:all       # both
```

### Unit tests (`tests/unit/`) — Vitest

Only `js/math.js` and `js/constants.js` are currently importable without a DOM. New unit-testable code should live in Layer 0.

### E2E tests (`tests/e2e/`) — Playwright

`tests/server.js` serves the app; Playwright spawns it automatically.

CDN interception is set up in `beforeEach` — jQuery is served from `node_modules`, Google Fonts fulfilled with empty 200s. **This is required** because the dev environment blocks external CDN requests.

Browser binary: auto-detected at `/opt/pw-browsers/chromium`; falls back to Playwright's own download on other machines. Override: `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/path/to/chrome`.

See `tests/testing.md` for full test inventory and patterns.

---

## Branching & Git

- **Feature work**: `claude/<feature-name>` → PR into `dev`
- **Staging**: `dev` — integration branch, always ahead of `main`
- **Stable**: `main` — only receives merges from `dev`
- **Never push directly to `main`** without going through `dev` first

The current working branch for ongoing refactor/test work is `claude/review-dev-branch-tr0uu`.

---

## No GitHub Actions

GitHub Actions are intentionally not used (GitHub Pro was cancelled due to Copilot training policy). All tests run locally. There is no CI pipeline to rely on — running tests manually before push is the only gate.

---

## User Preferences

- **No emojis** in code, commits, or responses unless explicitly asked.
- **No comments** unless the *why* is non-obvious (hidden constraint, workaround, subtle invariant). Never describe *what* the code does.
- **No backwards-compatibility shims** for removed code.
- **Short responses.** State results and changes directly.
- **Switch-case `const`/`let` declarations** must be wrapped in `{ }` block braces to avoid cross-case scope conflicts.
- **Commit messages**: imperative mood, concise, include the session URL trailer.

---

## Known Environment Notes

- Platform: Linux, shell unknown, OS kernel 4.4.0
- Pre-installed Chromium at `/opt/pw-browsers/chromium` (rev 1194)
- External CDN requests are blocked — always stub them in tests
- `python3 -m http.server` is unreliable mid-suite; use `tests/server.js` instead
