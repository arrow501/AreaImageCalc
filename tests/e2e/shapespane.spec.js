/**
 * E2E tests for shapes pane management: inline rename, color editor,
 * grouping with subtotals, drag reorder, and the move tool.
 */

import { test, expect } from '@playwright/test';
import { interceptCdn, loadTestImage, canvasCenter, drawTriangle } from './helpers.js';

test.beforeEach(async ({ page }) => {
  await interceptCdn(page);
  await page.goto('/');
  await loadTestImage(page);

  await page.locator('#btn-polygon').click();
  const { cx, cy } = await canvasCenter(page);
  await drawTriangle(page, cx, cy);
  await drawTriangle(page, cx, cy, 130);
  await page.keyboard.press('Escape');
  await expect(page.locator('#shapes-list .shape-item')).toHaveCount(2);
});

test('double-clicking a shape name renames it inline', async ({ page }) => {
  const first = page.locator('#shapes-list .shape-item').first();
  await first.locator('.shape-name').dblclick();
  const input = first.locator('input.name-edit');
  await expect(input).toBeVisible();
  await input.fill('Kitchen');
  await input.press('Enter');
  await expect(page.locator('#shapes-list .shape-item').first()).toContainText('Kitchen');
});

test('swatch opens the color popover; text input accepts rgb()', async ({ page }) => {
  const first = page.locator('#shapes-list .shape-item').first();
  await first.hover();
  await first.locator('.shape-swatch').click();
  await expect(page.locator('#color-popover')).toBeVisible();

  await page.locator('#color-input').fill('rgb(18, 52, 86)');
  await page.locator('#color-apply').click();
  await expect(page.locator('#color-popover')).toBeHidden();

  const bg = await page.locator('#shapes-list .shape-item').first()
    .locator('.shape-swatch').evaluate(el => el.style.background);
  expect(bg).toContain('rgb(18, 52, 86)');
});

test('palette swatch applies instantly', async ({ page }) => {
  const first = page.locator('#shapes-list .shape-item').first();
  await first.hover();
  await first.locator('.shape-swatch').click();
  await page.locator('#color-swatches button').nth(2).click();
  await expect(page.locator('#color-popover')).toBeHidden();
});

test('shape menu creates a group with a subtotal header', async ({ page }) => {
  const first = page.locator('#shapes-list .shape-item').first();
  await first.hover();
  await first.locator('.shape-menu').click();
  await expect(page.locator('#shape-menu')).toBeVisible();
  await page.locator('#shape-menu button[data-act="newgroup"]').click();

  await page.locator('#group-input').fill('Roof');
  await page.locator('#group-apply').click();

  await expect(page.locator('.group-header')).toHaveCount(1);
  await expect(page.locator('.group-header .group-name')).toHaveText('Roof');
  await expect(page.locator('.group-header .group-sub')).toContainText('px²');

  // Second shape joins via the menu's move-to entry
  const second = page.locator('#shapes-list .shape-item').last();
  await second.hover();
  await second.locator('.shape-menu').click();
  await page.locator('#shape-menu button[data-act="group"][data-group="Roof"]').click();
  await expect(page.locator('#shapes-list .shape-item.grouped')).toHaveCount(2);

  // Collapse hides rows, keeps header
  await page.locator('.group-header').click();
  await expect(page.locator('#shapes-list .shape-item')).toHaveCount(0);
  await page.locator('.group-header').click();
  await expect(page.locator('#shapes-list .shape-item')).toHaveCount(2);
});

test('dragging a shape row reorders the list', async ({ page }) => {
  const items = page.locator('#shapes-list .shape-item');
  const firstName = await items.first().locator('.shape-name').textContent();

  await items.first().dragTo(items.last());
  const newLast = await page.locator('#shapes-list .shape-item').last()
    .locator('.shape-name').textContent();
  expect(newLast).toBe(firstName);
});

test('move tool drags a whole shape without changing its area', async ({ page }) => {
  const areaBefore = await page.locator('#shapes-list .shape-item').first()
    .locator('.area').textContent();

  await page.keyboard.press('m');
  await expect(page.locator('#btn-move')).toHaveClass(/active/);

  const { cx, cy } = await canvasCenter(page);
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx + 80, cy + 60, { steps: 5 });
  await page.mouse.up();
  await expect(page.locator('#status-text')).toContainText('Shape moved');

  const areaAfter = await page.locator('#shapes-list .shape-item').first()
    .locator('.area').textContent();
  expect(areaAfter).toBe(areaBefore);

  await page.keyboard.press('Control+z');
  await expect(page.locator('#shapes-list .shape-item')).toHaveCount(2);
});

test('pane splitter drag resizes the Documents pane', async ({ page }) => {
  const before = await page.locator('#pane-docs').boundingBox();
  const splitter = await page.locator('#pane-splitter').boundingBox();

  await page.mouse.move(splitter.x + splitter.width / 2, splitter.y + 2);
  await page.mouse.down();
  await page.mouse.move(splitter.x + splitter.width / 2, splitter.y + 82, { steps: 4 });
  await page.mouse.up();

  const after = await page.locator('#pane-docs').boundingBox();
  expect(after.height).toBeGreaterThan(before.height + 40);
});

test('File menu docks the panel to the right and persists', async ({ page }) => {
  await page.locator('#btn-file-menu').click();
  await page.locator('#btn-dock-side').click();
  await expect(page.locator('#main')).toHaveClass(/sidebar-right/);

  const sidebar = await page.locator('#sidebar').boundingBox();
  const canvas = await page.locator('#canvas-wrap').boundingBox();
  expect(sidebar.x).toBeGreaterThan(canvas.x);

  await page.reload();
  await expect(page.locator('#main')).toHaveClass(/sidebar-right/);

  // Toggle back to the left
  await page.locator('#btn-file-menu').click();
  await page.locator('#btn-dock-side').click();
  await expect(page.locator('#main')).not.toHaveClass(/sidebar-right/);
});

test('scale can be calibrated from a shape of known area', async ({ page }) => {
  await expect(page.locator('#scale-display')).toContainText('No scale');

  const first = page.locator('#shapes-list .shape-item').first();
  await first.hover();
  await first.locator('.shape-menu').click();
  await page.locator('#shape-menu button[data-act="areascale"]').click();

  await expect(page.locator('#areascale-popover')).toBeVisible();
  await page.locator('#areascale-input').fill('50');
  await page.locator('#areascale-unit').selectOption('m');
  await page.locator('#areascale-apply').click();

  await expect(page.locator('#scale-display')).not.toContainText('No scale');
  // The calibrating shape must now read exactly its known area
  await expect(first.locator('.area')).toContainText('50.00 m²');

  // Undoable
  await page.keyboard.press('Control+z');
  await expect(page.locator('#scale-display')).toContainText('No scale');
});

test('clicking overlapping shapes cycles the selection', async ({ page }) => {
  // Draw a third triangle overlapping the first
  await page.keyboard.press('p');
  const { cx, cy } = await canvasCenter(page);
  await drawTriangle(page, cx + 10, cy + 5);
  await page.keyboard.press('Escape');
  await expect(page.locator('#shapes-list .shape-item')).toHaveCount(3);

  // Click inside the overlap region repeatedly
  await page.mouse.click(cx, cy);
  await expect(page.locator('#status-text')).toContainText('click again to cycle');
  const sel1 = await page.locator('#shapes-list .shape-item.selected').getAttribute('data-id');
  await page.mouse.click(cx, cy);
  const sel2 = await page.locator('#shapes-list .shape-item.selected').getAttribute('data-id');
  expect(sel2).not.toBe(sel1);
});
