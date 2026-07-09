/**
 * E2E test for the .arcalc polyglot page handoff: opening the saved HTML
 * file in a browser and clicking "Open AreaImageCalc" opens the app and
 * loads the embedded project via postMessage.
 */

import { test, expect } from '@playwright/test';
import { encodeArcalc } from '../../js/arcalcFormat.js';
import { interceptCdn } from './helpers.js';

const APP = 'http://localhost:3000/';

const project = {
  v: 4,
  ts: Date.now(),
  currentTabIdx: 0,
  tabs: [{
    label: 'handoff-project',
    imgDataUrl: null,
    view: { ox: 0, oy: 0, zoom: 1, fit: 1, iw: 100, ih: 100 },
    shapes: [
      { id: 's1', type: 'polygon', points: [{ x: 0, y: 0 }, { x: 50, y: 0 }, { x: 25, y: 40 }],
        closed: true, color: '#FF6B35', area: 1000, perimeter: 130, name: 'Area 1' }
    ],
    colorIdx: 1, shapeN: 1, scalePPU: 0, scaleUnit: 'cm', scaleLine: null
  }]
};

test('polyglot page hands the project to the app in a new tab', async ({ page, context }) => {
  await interceptCdn(context);

  const html = encodeArcalc(project, APP);
  await page.route('**/saved-project.html', route =>
    route.fulfill({ status: 200, contentType: 'text/html', body: html }));
  await page.goto('/saved-project.html');

  await expect(page.locator('#arcalc-open')).toHaveAttribute('href', APP + '#arcalc-handoff');

  const popupPromise = page.waitForEvent('popup');
  await page.locator('#arcalc-open').click();
  const app = await popupPromise;

  await expect(app.locator('#status-text')).toContainText('Project loaded');
  await expect(app.locator('#shapes-list .shape-item')).toHaveCount(1);
  await expect(app.locator('#shapes-list .shape-item')).toContainText('Area 1');
  await expect(app).toHaveURL(APP);

  await expect(page.locator('#arcalc-note')).toContainText('Project opened in the AreaImageCalc tab');
});
