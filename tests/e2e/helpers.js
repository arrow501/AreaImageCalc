/**
 * Shared E2E helpers: CDN interception (dev environment blocks external
 * requests) and in-browser test image generation.
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
import { expect } from '@playwright/test';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

const JQUERY_SRC = readFileSync(
  path.join(ROOT, 'node_modules/jquery/dist/jquery.min.js'), 'utf-8'
);

export async function interceptCdn(page) {
  await page.route('https://code.jquery.com/**', route =>
    route.fulfill({ status: 200, contentType: 'application/javascript; charset=utf-8', body: JQUERY_SRC })
  );
  await page.route('https://fonts.googleapis.com/**', route =>
    route.fulfill({ status: 200, contentType: 'text/css', body: '' }));
  await page.route('https://fonts.gstatic.com/**', route =>
    route.fulfill({ status: 200, contentType: 'font/woff2', body: Buffer.alloc(0) }));
  await page.route('**/favicon.ico', route =>
    route.fulfill({ status: 204, body: '' }));
}

export async function loadTestImage(page, width = 800, height = 600) {
  const pngBytes = await page.evaluate(([w, h]) =>
    new Promise(resolve => {
      const c = Object.assign(document.createElement('canvas'), { width: w, height: h });
      const ctx = c.getContext('2d');
      ctx.fillStyle = '#336699';
      ctx.fillRect(0, 0, w, h);
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

// Returns the centre of the overlay canvas in page coordinates.
export async function canvasCenter(page) {
  const box = await page.locator('#overlay-canvas').boundingBox();
  return { cx: box.x + box.width / 2, cy: box.y + box.height / 2 };
}

// Draws a triangle with the polygon tool already active.
export async function drawTriangle(page, cx, cy, off = 0) {
  await page.mouse.click(cx - 40 + off, cy + 25);
  await page.mouse.click(cx + 40 + off, cy + 25);
  await page.mouse.click(cx + off, cy - 35);
  await page.mouse.dblclick(cx + 5 + off, cy + 5);
}
