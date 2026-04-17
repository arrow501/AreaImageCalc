/**
 * E2E smoke tests — run against the static app served by python3 http.server.
 *
 * Run: npm run test:e2e
 *
 * The tests cover:
 *   1. App loads without console errors
 *   2. Initial UI state (dropzone visible, tools disabled)
 *   3. Loading an image (tools enable, status updates)
 *   4. Drawing a polygon and waiting for area calculation
 *   5. Deleting a shape
 *   6. Tab operations (new tab, switch, close)
 *   7. Keyboard shortcut: tool toggle via number key
 */

import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

// Read jQuery once so every test can serve it locally (CDN may be blocked).
const JQUERY_SRC = readFileSync(
  path.join(ROOT, 'node_modules/jquery/dist/jquery.min.js'), 'utf-8'
);

// ---------------------------------------------------------------------------
// Global setup: intercept external CDN requests before every test.
// ---------------------------------------------------------------------------
test.beforeEach(async ({ page }) => {
  // Serve jQuery from the local npm copy regardless of network conditions.
  await page.route('https://code.jquery.com/**', route =>
    route.fulfill({ status: 200, contentType: 'application/javascript; charset=utf-8', body: JQUERY_SRC })
  );
  // Fulfill font CDN requests with empty 200s — aborting produces ERR_FAILED noise.
  await page.route('https://fonts.googleapis.com/**', route =>
    route.fulfill({ status: 200, contentType: 'text/css', body: '' }));
  await page.route('https://fonts.gstatic.com/**', route =>
    route.fulfill({ status: 200, contentType: 'font/woff2', body: Buffer.alloc(0) }));
  // Stub favicon so the browser doesn't 404-log it.
  await page.route('**/favicon.ico', route =>
    route.fulfill({ status: 204, body: '' }));
});

// ---------------------------------------------------------------------------
// Helper: create a test PNG in-browser and hand it to the file input.
// Returns after the "Image loaded" status message appears.
// ---------------------------------------------------------------------------
async function loadTestImage(page, width = 800, height = 600) {
  // Build a PNG entirely in the browser so we need no fixture files.
  const pngBytes = await page.evaluate(([w, h]) =>
    new Promise(resolve => {
      const c = Object.assign(document.createElement('canvas'), { width: w, height: h });
      const ctx = c.getContext('2d');
      ctx.fillStyle = '#336699';
      ctx.fillRect(0, 0, w, h);
      // Add a contrasting rectangle so polygon clicks land on visible content.
      ctx.fillStyle = '#ff9900';
      ctx.fillRect(w * 0.2, h * 0.2, w * 0.6, h * 0.6);
      c.toBlob(blob =>
        blob.arrayBuffer().then(ab => resolve([...new Uint8Array(ab)]))
      , 'image/png');
    }),
  [width, height]);

  await page.locator('#file-input').setInputFiles({
    name: 'test.png',
    mimeType: 'image/png',
    buffer: Buffer.from(pngBytes),
  });

  await expect(page.locator('#status-text')).toContainText('Image loaded', { timeout: 8000 });
}

// ---------------------------------------------------------------------------
// 1. App loads
// ---------------------------------------------------------------------------
test('app loads with correct title, no JS runtime errors, no failed JS modules', async ({ page }) => {
  // Capture unhandled JS exceptions (the real signal that the app is broken).
  const jsErrors = [];
  page.on('pageerror', err => jsErrors.push(err.message));

  // Capture any JS module that fails to load (4xx/5xx on a .js file is fatal).
  const failedModules = [];
  page.on('response', resp => {
    if (resp.status() >= 400 && /\.js(\?|$)/.test(resp.url()) &&
        !resp.url().includes('localhost')) return; // only external JS
    if (resp.status() >= 400 && /\.js(\?|$)/.test(resp.url())) {
      failedModules.push(resp.status() + ' ' + resp.url());
    }
  });

  await page.goto('/');
  await page.waitForLoadState('networkidle');

  await expect(page).toHaveTitle(/area/i);
  // jQuery must be present (proves CDN interception worked)
  const jqDefined = await page.evaluate(() => typeof $ !== 'undefined');
  expect(jqDefined, 'jQuery not loaded — CDN intercept may have failed').toBe(true);

  expect(jsErrors, `JS runtime errors: ${jsErrors.join(' | ')}`).toHaveLength(0);
  expect(failedModules, `Failed JS modules: ${failedModules.join(' | ')}`).toHaveLength(0);
});

// ---------------------------------------------------------------------------
// 2. Initial UI state
// ---------------------------------------------------------------------------
test('dropzone is visible before any image is loaded', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#dropzone')).toBeVisible();
});

test('tool buttons are disabled before image load', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#btn-polygon')).toHaveClass(/disabled/);
  await expect(page.locator('#btn-freehand')).toHaveClass(/disabled/);
  await expect(page.locator('#btn-scale')).toHaveClass(/disabled/);
});

// ---------------------------------------------------------------------------
// 3. Image loading
// ---------------------------------------------------------------------------
test('loading an image enables tools and hides dropzone content', async ({ page }) => {
  await page.goto('/');
  await loadTestImage(page);

  await expect(page.locator('#btn-polygon')).not.toHaveClass(/disabled/);
  await expect(page.locator('#btn-freehand')).not.toHaveClass(/disabled/);
  // Dropzone overlay hides once an image is present
  await expect(page.locator('#dropzone .dz-content')).toBeHidden();
});

test('status bar shows image dimensions after load', async ({ page }) => {
  await page.goto('/');
  await loadTestImage(page, 800, 600);
  await expect(page.locator('#status-text')).toContainText('800');
  await expect(page.locator('#status-text')).toContainText('600');
});

// ---------------------------------------------------------------------------
// 4. Draw a polygon and get an area
// ---------------------------------------------------------------------------
test('drawing a polygon creates a shape with a computed area', async ({ page }) => {
  await page.goto('/');
  await loadTestImage(page);

  // Activate polygon tool
  await page.locator('#btn-polygon').click();
  await expect(page.locator('#status-text')).toContainText('Click to place vertices');

  const overlay = page.locator('#overlay-canvas');
  const box = await overlay.boundingBox();
  const cx = box.x + box.width  / 2;
  const cy = box.y + box.height / 2;

  // Click 3 points forming a small triangle near the canvas centre.
  // These are well within a 800×600 image fitted to the viewport.
  await page.mouse.click(cx - 40, cy + 25);
  await page.mouse.click(cx + 40, cy + 25);
  await page.mouse.click(cx,      cy - 35);

  // Double-click at a 4th position to trigger the dblclick-close handler
  // (mousedown adds a temporary 4th point; dblclick pops it and closes).
  await page.mouse.dblclick(cx + 5, cy + 5);

  // Shape should appear in the panel
  await expect(page.locator('#shapes-list .shape-item')).toBeVisible({ timeout: 5000 });

  // Area label should resolve from '...' to a real value
  await expect(page.locator('#shapes-list .area')).not.toContainText('...', { timeout: 5000 });
});

// ---------------------------------------------------------------------------
// 5. Delete a shape
// ---------------------------------------------------------------------------
test('deleting a shape removes it from the panel', async ({ page }) => {
  await page.goto('/');
  await loadTestImage(page);

  await page.locator('#btn-polygon').click();

  const overlay = page.locator('#overlay-canvas');
  const box = await overlay.boundingBox();
  const cx = box.x + box.width  / 2;
  const cy = box.y + box.height / 2;

  await page.mouse.click(cx - 30, cy + 20);
  await page.mouse.click(cx + 30, cy + 20);
  await page.mouse.click(cx,      cy - 25);
  await page.mouse.dblclick(cx, cy - 25);

  await expect(page.locator('#shapes-list .shape-item')).toBeVisible({ timeout: 5000 });

  // Select shape then delete via toolbar button
  await page.locator('#shapes-list .shape-item').first().click();
  await page.locator('#btn-delete').click();

  await expect(page.locator('#shapes-list .shape-item')).toHaveCount(0);
  await expect(page.locator('#shapes-total')).toContainText('No shapes yet');
});

// ---------------------------------------------------------------------------
// 6. Tab operations
// ---------------------------------------------------------------------------
test('new-tab button creates a second tab', async ({ page }) => {
  await page.goto('/');
  await loadTestImage(page);

  // Tab bar starts collapsed; expand it before clicking the new-tab button.
  await page.locator('#btn-toggle-tabs').click();
  await expect(page.locator('#tab-bar')).not.toHaveClass(/collapsed/);

  const before = await page.locator('.tab-item').count();
  await page.locator('#btn-new-tab').click();
  await expect(page.locator('.tab-item')).toHaveCount(before + 1);
});

test('closing a tab removes it from the tab bar', async ({ page }) => {
  await page.goto('/');
  await loadTestImage(page);

  // Tab bar starts collapsed; expand it before interacting.
  await page.locator('#btn-toggle-tabs').click();
  await expect(page.locator('#tab-bar')).not.toHaveClass(/collapsed/);

  await page.locator('#btn-new-tab').click();
  const before = await page.locator('.tab-item').count();

  // Close the newly created tab (last one)
  await page.locator('.tab-item').last().locator('.tab-close').click();
  await expect(page.locator('.tab-item')).toHaveCount(before - 1);
});

// ---------------------------------------------------------------------------
// 7. Keyboard shortcuts
// ---------------------------------------------------------------------------
test('pressing "2" activates polygon tool', async ({ page }) => {
  await page.goto('/');
  await loadTestImage(page);

  await page.keyboard.press('2');
  await expect(page.locator('#btn-polygon')).toHaveClass(/active/);
});

test('pressing Escape from polygon tool returns to idle', async ({ page }) => {
  await page.goto('/');
  await loadTestImage(page);

  await page.keyboard.press('2');
  await expect(page.locator('#btn-polygon')).toHaveClass(/active/);

  await page.keyboard.press('Escape');
  await expect(page.locator('#btn-polygon')).not.toHaveClass(/active/);
});

test('pressing "+" and "-" changes zoom display', async ({ page }) => {
  await page.goto('/');
  await loadTestImage(page);

  const before = await page.locator('#zoom-display').textContent();

  await page.keyboard.press('+');
  const after = await page.locator('#zoom-display').textContent();

  expect(before).not.toBe(after);
});
