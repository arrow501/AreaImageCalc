/**
 * E2E tests for project save/load (.arcalc HTML polyglot) and measurement
 * exports (CSV / JSON menu).
 */

import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { interceptCdn, loadTestImage, canvasCenter, drawTriangle } from './helpers.js';

test.beforeEach(async ({ page }) => {
  await interceptCdn(page);
  await page.goto('/');
  await loadTestImage(page);

  await page.locator('#btn-polygon').click();
  const { cx, cy } = await canvasCenter(page);
  await drawTriangle(page, cx, cy);
  await expect(page.locator('#shapes-list .area')).not.toContainText('...', { timeout: 5000 });
});

async function downloadText(page, trigger) {
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    trigger()
  ]);
  const path = await download.path();
  return { name: download.suggestedFilename(), text: readFileSync(path, 'utf-8') };
}

async function fileMenuDownload(page, itemId) {
  await page.locator('#btn-file-menu').click();
  await expect(page.locator('#file-menu')).toBeVisible();
  return downloadText(page, () => page.locator(itemId).click());
}

test('saved .arcalc is a self-describing HTML file', async ({ page }) => {
  const { name, text } = await fileMenuDownload(page, '#btn-export-project');

  expect(name).toMatch(/\.arcalc$/);
  expect(text.startsWith('<!DOCTYPE html>')).toBe(true);
  expect(text).toContain('areaimagecalc.pages.dev');
  expect(text).toContain('id="arcalc-data"');
});

test('.arcalc round-trip restores shapes', async ({ page }) => {
  const { text } = await fileMenuDownload(page, '#btn-export-project');

  // Fresh session: beforeunload flushes a save, so clear storage from an
  // init script that runs before the app boots on the reloaded page
  await page.addInitScript(() => localStorage.clear());
  await page.reload();
  await expect(page.locator('#shapes-list .shape-item')).toHaveCount(0);

  await page.locator('#file-input').setInputFiles({
    name: 'project.arcalc',
    mimeType: 'text/html',
    buffer: Buffer.from(text),
  });

  await expect(page.locator('#status-text')).toContainText('Project loaded');
  await expect(page.locator('#shapes-list .shape-item')).toHaveCount(1);
});

test('legacy plain-JSON .arcalc still imports', async ({ page }) => {
  const legacy = JSON.stringify({
    v: 3,
    ts: Date.now(),
    currentTabIdx: 0,
    tabs: [{
      label: 'old-project',
      imgDataUrl: null,
      view: { ox: 0, oy: 0, zoom: 1, fit: 1, iw: 100, ih: 100 },
      shapes: [
        { id: 's1', type: 'polygon', points: [{ x: 0, y: 0 }, { x: 50, y: 0 }, { x: 25, y: 40 }],
          closed: true, color: '#FF6B35', area: 1000, perimeter: 130, name: 'Area 1' }
      ],
      colorIdx: 1, shapeN: 1, scalePPU: 0, scaleUnit: 'cm', scaleLine: null
    }]
  });

  await page.locator('#file-input').setInputFiles({
    name: 'legacy.arcalc',
    mimeType: 'application/json',
    buffer: Buffer.from(legacy),
  });

  await expect(page.locator('#status-text')).toContainText('Project loaded');
  await expect(page.locator('#shapes-list .shape-item')).toHaveCount(1);
});

test('File menu offers CSV with header and data rows', async ({ page }) => {
  const { name, text } = await fileMenuDownload(page, '#btn-export-csv');

  expect(name).toMatch(/\.csv$/);
  const lines = text.replace(/^﻿/, '').trim().split('\r\n');
  expect(lines[0]).toBe('document,name,type,area,area_unit,length,length_unit,area_px2,length_px,text');
  expect(lines.length).toBeGreaterThanOrEqual(2);
  expect(lines[1]).toContain('polygon');
});

test('File menu JSON contains named measurements', async ({ page }) => {
  const { text } = await fileMenuDownload(page, '#btn-export-json');

  const data = JSON.parse(text);
  expect(data.source).toBe('AreaImageCalc');
  expect(data.tabs[0].measurements[0].name).toBe('Area 1');
  expect(data.tabs[0].measurements[0].area_px2).toBeGreaterThan(0);
});
