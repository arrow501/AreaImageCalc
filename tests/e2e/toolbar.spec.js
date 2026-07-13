/**
 * Toolbar adaptive reflow tests.
 *
 * Stage 0: full labels, sliders inline.
 * Stage 1: full labels, sliders collapsed into a popover button.
 * Stage 2: short labels, sliders collapsed.
 *
 * Spec: fewest rows with elements maximally expanded. A stage only
 * degrades when that saves a row; when even the compact stage wraps,
 * fuller elements unfold into the extra row space instead of staying
 * shortened.
 */

import { test, expect } from '@playwright/test';
import { interceptCdn } from './helpers.js';

test.beforeEach(async ({ page }) => {
  await interceptCdn(page);
  await page.goto('/');
  await expect(page.locator('#toolbar')).toBeVisible();
});

// Children on one flex row share a vertical center (align-items: center),
// so count distinct centers in DOM order.
const countRowsFn = `tb => {
  let rows = 0, prev = null;
  for (const el of tb.children) {
    const r = el.getBoundingClientRect();
    if (!r.width) continue;
    const c = r.top + r.height / 2;
    if (prev === null || c - prev > 2) { rows++; prev = c; }
  }
  return rows;
}`;

// The stage the app settled on, plus the real row count each stage would
// produce at the current width (measured by trial layout, then restored).
async function probe(page, width) {
  await page.setViewportSize({ width, height: 700 });
  await page.waitForTimeout(150);
  return page.evaluate(([rowsSrc]) => {
    const countRows = eval(rowsSrc);
    const tb = document.getElementById('toolbar');
    const appStage = tb.dataset.stage;
    const rows = [];
    for (let s = 0; s <= 2; s++) {
      tb.dataset.stage = String(s);
      rows[s] = countRows(tb);
    }
    tb.dataset.stage = appStage;
    return { appStage, rows, appRows: rows[Number(appStage)] };
  }, [countRowsFn]);
}

test('always picks the fullest stage that achieves the fewest rows', async ({ page }) => {
  for (const width of [2000, 1500, 1300, 1150, 1000, 850, 700, 550]) {
    const { appStage, rows } = await probe(page, width);
    const best = rows.indexOf(Math.min(...rows));
    expect(appStage, `width ${width}px, per-stage rows [${rows}]`).toBe(String(best));
  }
});

test('stays fully expanded on a single row when everything fits', async ({ page }) => {
  const { appStage, appRows } = await probe(page, 2000);
  expect(appStage).toBe('0');
  expect(appRows).toBe(1);
  await expect(page.locator('#tb-sliders')).toBeVisible();
  await expect(page.locator('#btn-sliders-toggle')).toBeHidden();
});

test('degrades to keep a single row while that still works', async ({ page }) => {
  // Sweep down until the app first leaves stage 0: at that width the
  // degraded stage must still hold a single row (degrading for any other
  // reason would violate the spec).
  for (let width = 2000; width >= 600; width -= 50) {
    const { appStage, appRows } = await probe(page, width);
    if (appStage !== '0') {
      expect(appRows).toBe(1);
      await expect(page.locator('#btn-sliders-toggle')).toBeVisible();
      return;
    }
    expect(appRows).toBe(1);
  }
  throw new Error('toolbar never left stage 0');
});

test('unfolds elements when the toolbar has to wrap anyway', async ({ page }) => {
  // Find a width where even the compact stage wraps.
  for (let width = 1400; width >= 400; width -= 50) {
    const { appStage, rows } = await probe(page, width);
    if (rows[2] > 1) {
      expect(appStage).not.toBe('2');
      await expect(page.locator('#btn-polygon .lbl-full')).toBeVisible();
      return;
    }
  }
  throw new Error('compact stage never wrapped');
});

test('recovers the full single-row toolbar when width returns', async ({ page }) => {
  const narrow = await probe(page, 1150);
  expect(narrow.appStage).not.toBe('0');

  const wide = await probe(page, 2000);
  expect(wide.appStage).toBe('0');
  expect(wide.appRows).toBe(1);
  await expect(page.locator('#tb-sliders')).toBeVisible();
});

test('collapsed sliders open as a popover and close on outside click', async ({ page }) => {
  const { appStage } = await probe(page, 1150);
  expect(appStage).not.toBe('0');

  await page.locator('#btn-sliders-toggle').click();
  await expect(page.locator('#tb-sliders')).toBeVisible();

  await page.mouse.click(400, 400);
  await expect(page.locator('#tb-sliders')).toBeHidden();
});
