/**
 * E2E tests for the v2 interaction model:
 *   - sticky drawing tools
 *   - Backspace removes the last placed point
 *   - right-click finishes a path
 *   - undo / redo
 *   - scale line adjustment in the edit tool
 */

import { test, expect } from '@playwright/test';
import { interceptCdn, loadTestImage, canvasCenter, drawTriangle } from './helpers.js';

test.beforeEach(async ({ page }) => {
  await interceptCdn(page);
  await page.goto('/');
  await loadTestImage(page);
});

test('polygon tool stays active after closing a shape', async ({ page }) => {
  await page.locator('#btn-polygon').click();
  const { cx, cy } = await canvasCenter(page);

  await drawTriangle(page, cx, cy);
  await expect(page.locator('#shapes-list .shape-item')).toHaveCount(1);
  await expect(page.locator('#btn-polygon')).toHaveClass(/active/);

  await drawTriangle(page, cx, cy, 120);
  await expect(page.locator('#shapes-list .shape-item')).toHaveCount(2);
});

test('Backspace removes the last placed polygon point', async ({ page }) => {
  await page.locator('#btn-polygon').click();
  const { cx, cy } = await canvasCenter(page);

  await page.mouse.click(cx - 40, cy + 25);
  await page.mouse.click(cx + 40, cy + 25);
  await page.mouse.click(cx, cy - 35);
  await page.mouse.click(cx + 60, cy - 35);
  await page.keyboard.press('Backspace');

  // Close: with the 4th point removed this is still a valid triangle
  await page.mouse.dblclick(cx + 5, cy + 5);
  await expect(page.locator('#shapes-list .shape-item')).toHaveCount(1);
});

test('right-click finishes a distance path', async ({ page }) => {
  await page.locator('#btn-segment').click();
  const { cx, cy } = await canvasCenter(page);

  await page.mouse.click(cx - 50, cy);
  await page.mouse.click(cx + 50, cy);
  await page.mouse.click(cx + 50, cy + 40, { button: 'right' });

  await expect(page.locator('#shapes-list .shape-item')).toHaveCount(1);
  await expect(page.locator('#btn-segment')).toHaveClass(/active/);
});

test('Ctrl+Z undoes and Ctrl+Shift+Z redoes adding a shape', async ({ page }) => {
  await page.locator('#btn-polygon').click();
  const { cx, cy } = await canvasCenter(page);
  await drawTriangle(page, cx, cy);
  await expect(page.locator('#shapes-list .shape-item')).toHaveCount(1);

  await page.keyboard.press('Escape');
  await page.keyboard.press('Control+z');
  await expect(page.locator('#shapes-list .shape-item')).toHaveCount(0);

  await page.keyboard.press('Control+Shift+z');
  await expect(page.locator('#shapes-list .shape-item')).toHaveCount(1);
});

test('undo restores a deleted shape', async ({ page }) => {
  await page.locator('#btn-polygon').click();
  const { cx, cy } = await canvasCenter(page);
  await drawTriangle(page, cx, cy);
  await expect(page.locator('#shapes-list .shape-item')).toHaveCount(1);

  await page.locator('#shapes-list .shape-item').first().click();
  await page.locator('#btn-delete').click();
  await expect(page.locator('#shapes-list .shape-item')).toHaveCount(0);

  await page.keyboard.press('Control+z');
  await expect(page.locator('#shapes-list .shape-item')).toHaveCount(1);
});

test('Clear is undoable without a confirm dialog', async ({ page }) => {
  await page.locator('#btn-polygon').click();
  const { cx, cy } = await canvasCenter(page);
  await drawTriangle(page, cx, cy);
  await drawTriangle(page, cx, cy, 120);
  await expect(page.locator('#shapes-list .shape-item')).toHaveCount(2);

  await page.locator('#btn-clear').click();
  await expect(page.locator('#shapes-list .shape-item')).toHaveCount(0);

  await page.keyboard.press('Control+z');
  await expect(page.locator('#shapes-list .shape-item')).toHaveCount(2);
});

async function calibrateScale(page, cx, cy) {
  await page.locator('#btn-scale').click();
  await page.mouse.click(cx - 100, cy);
  await page.mouse.click(cx + 100, cy);
  await page.locator('#scale-value').fill('10');
  await page.locator('#scale-confirm').click();
  await expect(page.locator('#scale-display')).not.toContainText('No scale');
}

test('scale line endpoint is draggable in edit mode and keeps the real distance', async ({ page }) => {
  const { cx, cy } = await canvasCenter(page);
  await calibrateScale(page, cx, cy);

  const before = await page.locator('#scale-display').textContent();

  await page.locator('#btn-edit').click();
  // Drag the right endpoint 50px further right → more px per unit
  await page.mouse.move(cx + 100, cy);
  await page.mouse.down();
  await page.mouse.move(cx + 150, cy, { steps: 5 });
  await page.mouse.up();

  await expect(page.locator('#status-text')).toContainText('Scale line adjusted');
  const after = await page.locator('#scale-display').textContent();
  expect(after).not.toBe(before);
});

test('double-clicking the scale line re-opens calibration with the value prefilled', async ({ page }) => {
  const { cx, cy } = await canvasCenter(page);
  await calibrateScale(page, cx, cy);
  await page.keyboard.press('Escape');

  await page.mouse.dblclick(cx, cy);
  await expect(page.locator('#scale-popup')).toBeVisible();
  await expect(page.locator('#scale-value')).toHaveValue('10');
});

test('freehand trace creates a closed shape with an area', async ({ page }) => {
  await page.locator('#btn-freehand').click();
  const { cx, cy } = await canvasCenter(page);

  await page.mouse.move(cx - 60, cy - 40);
  await page.mouse.down();
  const pts = [
    [cx + 60, cy - 40], [cx + 70, cy], [cx + 60, cy + 40],
    [cx - 60, cy + 40], [cx - 70, cy]
  ];
  for (const [x, y] of pts) await page.mouse.move(x, y, { steps: 8 });
  await page.mouse.up();

  await expect(page.locator('#shapes-list .shape-item')).toHaveCount(1);
  await expect(page.locator('#shapes-list .area')).not.toContainText('...', { timeout: 5000 });
  // Sticky: freehand stays active
  await expect(page.locator('#btn-freehand')).toHaveClass(/active/);
});
