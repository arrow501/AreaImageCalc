/**
 * Accessibility behavior tests: statusbar tool indicator, keyboard menu
 * navigation, keyboard sidebar navigation, slider keyboard control, and
 * the persisted high-contrast mode.
 */

import { test, expect } from '@playwright/test';
import { interceptCdn, loadTestImage, canvasCenter, drawTriangle } from './helpers.js';

test.beforeEach(async ({ page }) => {
  await interceptCdn(page);
  await page.goto('/');
});

test('statusbar shows the current tool', async ({ page }) => {
  await expect(page.locator('#tool-display')).toHaveText('No tool');

  await loadTestImage(page);
  await page.keyboard.press('p');
  await expect(page.locator('#tool-display')).toHaveText('Polygon');

  await page.keyboard.press('Escape');
  await expect(page.locator('#tool-display')).toHaveText('No tool');
});

test('file menu is fully keyboard operable', async ({ page }) => {
  await page.locator('#btn-file-menu').click();
  await expect(page.locator('#file-menu')).toBeVisible();
  await expect(page.locator('#btn-file-menu')).toHaveAttribute('aria-expanded', 'true');

  // Focus lands in the menu and arrows cycle through items
  await expect(page.locator('#btn-new')).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(page.locator('#btn-open')).toBeFocused();
  await page.keyboard.press('End');
  await expect(page.locator('#btn-hc')).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(page.locator('#btn-new')).toBeFocused();

  // Escape closes and returns focus to the opener
  await page.keyboard.press('Escape');
  await expect(page.locator('#file-menu')).toBeHidden();
  await expect(page.locator('#btn-file-menu')).toHaveAttribute('aria-expanded', 'false');
  await expect(page.locator('#btn-file-menu')).toBeFocused();
});

test('shape rows are focusable and Enter selects', async ({ page }) => {
  await loadTestImage(page);
  const { cx, cy } = await canvasCenter(page);
  await page.locator('#btn-polygon').click();
  await drawTriangle(page, cx, cy);
  await page.keyboard.press('Escape');
  await expect(page.locator('#shapes-list .shape-item')).toHaveCount(1);

  const row = page.locator('#shapes-list .shape-item').first();
  await expect(row).toHaveAttribute('role', 'option');
  await expect(row).toHaveAttribute('aria-label', /area/i);

  await row.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#shapes-list .shape-item').first())
    .toHaveAttribute('aria-selected', 'true');
});

test('brightness slider responds to keyboard', async ({ page }) => {
  // Wide enough that the sliders stay inline in the toolbar
  await page.setViewportSize({ width: 1800, height: 720 });
  await loadTestImage(page);
  const track = page.locator('.sl-track[data-slider="bright"]');
  await track.focus();
  await page.keyboard.press('ArrowRight');
  await expect(track).toHaveAttribute('aria-valuenow', '5');
  await page.keyboard.press('PageUp');
  await expect(track).toHaveAttribute('aria-valuenow', '30');
  await page.keyboard.press('0');
  await expect(track).toHaveAttribute('aria-valuenow', '0');
});

test('high contrast mode toggles and persists across reload', async ({ page }) => {
  await page.locator('#btn-file-menu').click();
  await page.locator('#btn-hc').click();
  await expect(page.locator('html')).toHaveClass(/hc/);

  await page.reload();
  await expect(page.locator('html')).toHaveClass(/hc/);

  await page.locator('#btn-file-menu').click();
  await expect(page.locator('#btn-hc')).toHaveText('High Contrast: On');
  await page.locator('#btn-hc').click();
  await expect(page.locator('html')).not.toHaveClass(/hc/);
});

test('document rows expose state and respond to Enter', async ({ page }) => {
  await loadTestImage(page);
  const row = page.locator('#doc-list .doc-row').first();
  await expect(row).toHaveAttribute('role', 'button');
  await expect(row).toHaveAttribute('aria-current', 'true');
  await row.focus();
  await page.keyboard.press('Enter');
  await expect(row).toHaveAttribute('aria-current', 'true');
});
