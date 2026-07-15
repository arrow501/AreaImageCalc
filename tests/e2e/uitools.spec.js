/**
 * E2E tests for the UI/tools improvements:
 *   - toolbar Undo button (Clear moved into the Shapes pane header)
 *   - Scale pane: reference display, value/unit editing, drag keeps value
 *   - Scale tool Known Area mode
 *   - interactive rotate popup
 *   - perspective rotation control
 *   - document reordering in the sidebar
 */

import { test, expect } from '@playwright/test';
import { interceptCdn, loadTestImage, canvasCenter, drawTriangle } from './helpers.js';

test.beforeEach(async ({ page }) => {
  await interceptCdn(page);
  await page.goto('/');
  await loadTestImage(page);
});

async function calibrateScale(page, cx, cy) {
  await page.locator('#btn-scale').click();
  await page.mouse.click(cx - 100, cy);
  await page.mouse.click(cx + 100, cy);
  await page.locator('#scale-value').fill('10');
  await page.locator('#scale-confirm').click();
  await expect(page.locator('#scale-display')).not.toContainText('No scale');
}

test('greeting no longer mentions the browser/upload line', async ({ page }) => {
  await expect(page.locator('.dz-content .tagline')).not.toContainText('nothing is uploaded');
});

test('toolbar Undo button undoes adding a shape', async ({ page }) => {
  await page.locator('#btn-polygon').click();
  const { cx, cy } = await canvasCenter(page);
  await drawTriangle(page, cx, cy);
  await expect(page.locator('#shapes-list .shape-item')).toHaveCount(1);

  await page.locator('#btn-undo').click();
  await expect(page.locator('#shapes-list .shape-item')).toHaveCount(0);
});

test('Clear lives in the Shapes pane header and does not collapse the pane', async ({ page }) => {
  await page.locator('#btn-polygon').click();
  const { cx, cy } = await canvasCenter(page);
  await drawTriangle(page, cx, cy);
  await expect(page.locator('#shapes-list .shape-item')).toHaveCount(1);

  await expect(page.locator('#pane-shapes #btn-clear')).toBeVisible();
  await page.locator('#btn-clear').click();
  await page.locator('.storage-modal .btn-primary').click();
  await expect(page.locator('#shapes-list .shape-item')).toHaveCount(0);
  await expect(page.locator('#pane-shapes')).not.toHaveClass(/collapsed/);
});

test('scale pane shows the entered distance and edits re-derive the scale', async ({ page }) => {
  const { cx, cy } = await canvasCenter(page);
  await calibrateScale(page, cx, cy);

  await expect(page.locator('#scale-ref-row')).toContainText('Reference distance');
  await expect(page.locator('#scale-pane-value')).toHaveValue('10');

  const before = await page.locator('#scale-display').textContent();
  await page.locator('#scale-pane-value').fill('20');
  await page.locator('#scale-pane-value').press('Enter');

  const after = await page.locator('#scale-display').textContent();
  expect(after).not.toBe(before);
  await expect(page.locator('#scale-pane-value')).toHaveValue('20');
});

test('changing the unit in the scale pane relabels measurements', async ({ page }) => {
  const { cx, cy } = await canvasCenter(page);
  await calibrateScale(page, cx, cy);
  await expect(page.locator('#scale-display')).toContainText('cm');

  await page.locator('#scale-pane-unit').selectOption('m');
  await expect(page.locator('#scale-display')).toContainText('m');
  await expect(page.locator('#scale-pane-value')).toHaveValue('10');
});

test('dragging a scale endpoint never rewrites the entered distance', async ({ page }) => {
  const { cx, cy } = await canvasCenter(page);
  await calibrateScale(page, cx, cy);

  await page.locator('#btn-edit').click();
  await page.mouse.move(cx - 100, cy);
  await page.mouse.down();
  await page.mouse.move(cx - 160, cy, { steps: 5 });
  await page.mouse.up();

  await expect(page.locator('#scale-pane-value')).toHaveValue('10');
  // 200px meant 10 units; 260px still means 10 units, so 1px shrank
  await expect(page.locator('#scale-display')).not.toContainText('No scale');
});

test('scale tool offers a Known Area mode that calibrates from a shape', async ({ page }) => {
  await page.locator('#btn-polygon').click();
  const { cx, cy } = await canvasCenter(page);
  await drawTriangle(page, cx, cy);
  await expect(page.locator('#shapes-list .shape-item .area')).not.toContainText('...');

  await page.locator('#btn-scale').click();
  await expect(page.locator('#scale-bar')).toBeVisible();
  await page.locator('#scale-bar .persp-tab[data-scale-mode="area"]').click();
  await expect(page.locator('#scale-area-content')).toBeVisible();

  await page.mouse.click(cx, cy + 10); // inside the triangle
  await expect(page.locator('#scale-bar-apply')).not.toHaveClass(/disabled/);

  await page.locator('#scale-bar-value').fill('50');
  await page.locator('#scale-bar-apply').click();

  await expect(page.locator('#scale-display')).not.toContainText('No scale');
  await expect(page.locator('#scale-ref-row')).toContainText('Reference area');
});

test('editing the area reference value re-derives the scale', async ({ page }) => {
  await page.locator('#btn-polygon').click();
  const { cx, cy } = await canvasCenter(page);
  await drawTriangle(page, cx, cy);
  await expect(page.locator('#shapes-list .shape-item .area')).not.toContainText('...');

  await page.locator('#btn-scale').click();
  await page.locator('#scale-bar .persp-tab[data-scale-mode="area"]').click();
  await page.mouse.click(cx, cy + 10);
  await page.locator('#scale-bar-value').fill('50');
  await page.locator('#scale-bar-apply').click();
  await expect(page.locator('#scale-pane-value')).toHaveValue('50');

  const before = await page.locator('#scale-display').textContent();
  await page.locator('#scale-pane-value').fill('200');
  await page.locator('#scale-pane-value').press('Enter');
  const after = await page.locator('#scale-display').textContent();
  expect(after).not.toBe(before);
});

test('interactive rotate: typed angle previews and Apply commits', async ({ page }) => {
  await page.locator('#btn-rotate-custom').click();
  await expect(page.locator('#rotate-popup')).toBeVisible();

  await page.locator('#rotate-angle-input').fill('45');
  await page.locator('#rotate-apply').click();

  await expect(page.locator('#status-text')).toContainText('Rotated 45', { timeout: 10000 });
  await expect(page.locator('#rotate-popup')).toBeHidden();
});

test('interactive rotate: Escape cancels without rotating', async ({ page }) => {
  await page.locator('#btn-rotate-custom').click();
  await page.locator('#rotate-angle-input').fill('30');
  await page.keyboard.press('Escape');

  await expect(page.locator('#rotate-popup')).toBeHidden();
  await expect(page.locator('#status-text')).toContainText('Rotation cancelled');
});

test('perspective rotation control rotates corners and applies', async ({ page }) => {
  await page.locator('#btn-persp').click();
  await expect(page.locator('#persp-bar')).toBeVisible();

  await page.locator('#persp-rot-input').fill('10');
  await page.locator('#persp-apply').click();

  await expect(page.locator('#status-text')).toContainText('Perspective correction applied', { timeout: 20000 });
});

test('documents can be reordered by drag and drop', async ({ page }) => {
  // Load a second, differently named image into a new tab
  const pngBytes = await page.evaluate(() =>
    new Promise(resolve => {
      const c = Object.assign(document.createElement('canvas'), { width: 200, height: 150 });
      const ctx = c.getContext('2d');
      ctx.fillStyle = '#884422';
      ctx.fillRect(0, 0, 200, 150);
      c.toBlob(blob => blob.arrayBuffer().then(ab => resolve([...new Uint8Array(ab)])), 'image/png');
    })
  );
  await page.locator('#file-input').setInputFiles({
    name: 'second.png',
    mimeType: 'image/png',
    buffer: Buffer.from(pngBytes),
  });
  await expect(page.locator('#doc-list .doc-row')).toHaveCount(2);
  await expect(page.locator('#doc-list .doc-label').first()).toHaveText('test.png');

  await page.evaluate(() => {
    const rows = document.querySelectorAll('#doc-list .doc-row');
    const src = rows[1], dst = rows[0];
    const dt = new DataTransfer();
    const r = dst.getBoundingClientRect();
    src.dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: dt }));
    dst.dispatchEvent(new DragEvent('dragover', { bubbles: true, dataTransfer: dt, clientY: r.top + 2 }));
    dst.dispatchEvent(new DragEvent('drop', { bubbles: true, dataTransfer: dt }));
    src.dispatchEvent(new DragEvent('dragend', { bubbles: true, dataTransfer: dt }));
  });

  await expect(page.locator('#doc-list .doc-label').first()).toHaveText('second.png');
  await expect(page.locator('#doc-list .doc-label').nth(1)).toHaveText('test.png');
});
