/**
 * E2E tests for text note annotations.
 */

import { test, expect } from '@playwright/test';
import { interceptCdn, loadTestImage, canvasCenter } from './helpers.js';

test.beforeEach(async ({ page }) => {
  await interceptCdn(page);
  await page.goto('/');
  await loadTestImage(page);
});

test('note tool pins a text note and lists it in the panel', async ({ page }) => {
  await page.keyboard.press('n');
  await expect(page.locator('#btn-note')).toHaveClass(/active/);

  const { cx, cy } = await canvasCenter(page);
  await page.mouse.click(cx, cy);

  await expect(page.locator('#label-popup')).toBeVisible();
  await page.locator('#label-value').fill('check drainage here');
  await page.keyboard.press('Enter');

  await expect(page.locator('#shapes-list .shape-item')).toHaveCount(1);
  await expect(page.locator('#shapes-list .shape-item')).toContainText('check drainage here');
  // Sticky: note tool stays active
  await expect(page.locator('#btn-note')).toHaveClass(/active/);
});

test('cancelling the note popup leaves no shape behind', async ({ page }) => {
  await page.keyboard.press('n');
  const { cx, cy } = await canvasCenter(page);
  await page.mouse.click(cx, cy);

  await expect(page.locator('#label-popup')).toBeVisible();
  await page.locator('#label-value').press('Escape');

  await expect(page.locator('#label-popup')).toBeHidden();
  await expect(page.locator('#shapes-list .shape-item')).toHaveCount(0);
});

test('double-clicking a note pin edits its text', async ({ page }) => {
  await page.keyboard.press('n');
  const { cx, cy } = await canvasCenter(page);
  await page.mouse.click(cx, cy);
  await page.locator('#label-value').fill('first version');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Escape');

  await page.mouse.dblclick(cx, cy);
  await expect(page.locator('#label-popup')).toBeVisible();
  await expect(page.locator('#label-value')).toHaveValue('first version');

  await page.locator('#label-value').fill('second version');
  await page.keyboard.press('Enter');
  await expect(page.locator('#shapes-list .shape-item')).toContainText('second version');
});

test('adding a note is undoable', async ({ page }) => {
  await page.keyboard.press('n');
  const { cx, cy } = await canvasCenter(page);
  await page.mouse.click(cx, cy);
  await page.locator('#label-value').fill('temp note');
  await page.keyboard.press('Enter');
  await expect(page.locator('#shapes-list .shape-item')).toHaveCount(1);

  await page.keyboard.press('Escape');
  await page.keyboard.press('Control+z');
  await expect(page.locator('#shapes-list .shape-item')).toHaveCount(0);
});
