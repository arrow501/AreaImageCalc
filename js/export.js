/**
 * Project save/load and measurements export.
 *
 * ── Project file (.arcalc) ──────────────────────────────────────────────────
 * Since v2 an .arcalc file is an HTML polyglot (see arcalcFormat.js): opening
 * it in a browser shows a short explanation plus a link to the app, while the
 * project JSON lives in <script type="application/json" id="arcalc-data">.
 * Legacy plain-JSON .arcalc files are still importable.
 *
 * Embedded project JSON structure:
 *
 * {
 *   "v": 4,                         // save-format version (integer)
 *   "ts": 1234567890123,            // Unix timestamp (ms) of export
 *   "currentTabIdx": 0,             // index of the tab that was active
 *   "tabs": [ <Tab>, ... ]          // one entry per tab
 * }
 *
 * Tab object:
 * {
 *   "label": "Page 1",              // display name shown in the sidebar
 *   "docId": 0,                     // multi-page document group (null = standalone)
 *   "docLabel": "plans",            // document display name for grouped pages
 *   "pageNum": 1,                   // page number within the document
 *   "imgDataUrl": "data:image/...", // base-64 encoded image (may be null)
 *   "view": { "ox", "oy", "zoom", "fit", "iw", "ih" },
 *   "shapes": [ <Shape>, ... ],
 *   "colorIdx": 3,
 *   "shapeN": 3,
 *   "scalePPU": 12.5,               // pixels per unit (0 = no scale set)
 *   "scaleUnit": "cm",
 *   "scaleLine": { "p1": {x,y}, "p2": {x,y} } | null,
 *   "brightness": 0,
 *   "contrast": 0
 * }
 *
 * Shape object:
 * {
 *   "id": "s1",
 *   "type": "polygon"|"freehand"|"segment"|"note",
 *   "points": [{"x":0,"y":0}, ...], // image-space coordinates
 *   "closed": true,
 *   "color": "#FF6B35",
 *   "area": 1234.5,                 // pixels² (closed shapes)
 *   "perimeter": 150.0,             // pixels  (closed shapes)
 *   "length": 88.1,                 // pixels  (segments)
 *   "name": "Area 1",
 *   "hidden": false,
 *   "text": "..."                   // notes only
 * }
 */

import { S, SAVE_VER } from './state.js';
import { serializeTab, snapshotCurrentTab, createTab, switchToTab, hydrateTabFields } from './tabs.js';
import { encodeArcalc, decodeArcalc } from './arcalcFormat.js';
import { buildMeasurementsCsv } from './csv.js';
import { status } from './ui.js';

function triggerDownload(content, filename, mime) {
  const blob = new Blob([content], { type: mime || 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(function() { URL.revokeObjectURL(url); }, 1000);
}

function projectName() {
  for (let i = 0; i < S.tabs.length; i++) {
    const t = S.tabs[i];
    if (t.imgDataUrl || t.img) {
      const base = (t.docLabel || t.label || '').replace(/\.[^.]+$/, '').trim();
      if (base) return base.replace(/[^\w\- ]+/g, '').replace(/\s+/g, '-') || 'project';
    }
  }
  return 'project';
}

export function exportProject() {
  snapshotCurrentTab();

  const project = {
    v: SAVE_VER,
    ts: Date.now(),
    currentTabIdx: S.currentTabIdx,
    tabs: S.tabs.map(serializeTab)
  };

  triggerDownload(encodeArcalc(project), projectName() + '.arcalc', 'text/html');
  status('Project saved as .arcalc file.');
}

export function importProject(file) {
  const reader = new FileReader();
  reader.onload = function(e) {
    try {
      const data = decodeArcalc(e.target.result);
      if (!data || !data.tabs || !data.tabs.length) {
        alert('Invalid or empty project file.');
        return;
      }

      S.tabs = [];
      S.currentTabIdx = -1;

      for (let i = 0; i < data.tabs.length; i++) {
        const td = data.tabs[i];
        const idx = createTab(td.label || 'Tab ' + (i + 1), td.imgDataUrl || null, null);
        hydrateTabFields(S.tabs[idx], td);
        if (td.docId != null && td.docId >= S.docN) S.docN = td.docId + 1;
      }

      const targetIdx = (data.currentTabIdx >= 0 && data.currentTabIdx < S.tabs.length) ? data.currentTabIdx : 0;
      switchToTab(targetIdx);
      status('Project loaded: ' + data.tabs.length + ' tab(s).');
    } catch (ex) {
      console.error('Import failed:', ex);
      alert('Failed to load project file.');
    }
  };
  reader.readAsText(file);
}

function tabsWithShapes() {
  snapshotCurrentTab();
  return S.tabs.filter(function(t) { return t.shapes.length > 0; });
}

/**
 * Export all measurements as a JSON file.
 *
 * Top-level structure:
 * {
 *   "version": "1.0",
 *   "source": "AreaImageCalc",
 *   "exported": "<ISO-8601 timestamp>",
 *   "tabs": [ <TabMeasurements>, ... ]   // only tabs that contain shapes
 * }
 *
 * TabMeasurements:
 * {
 *   "label": "Page 1",
 *   "scale": { "ppu": 12.5, "unit": "cm" } | null,
 *   "measurements": [ <Measurement>, ... ]
 * }
 *
 * Measurement:
 * {
 *   "id": "s1",
 *   "type": "polygon"|"freehand"|"segment"|"note",
 *   "name": "Area 1",
 *   "area_px2": 4500.0,           // area in pixels² (closed shapes)
 *   "area": 28.8,                 // area in scale units² (omitted if no scale)
 *   "unit2": "cm²",               // area unit label     (omitted if no scale)
 *   "perimeter_px": 280.0,        // perimeter/length in pixels
 *   "perimeter": 22.4,            // in scale units (omitted if no scale)
 *   "unit": "cm",                 // length unit label   (omitted if no scale)
 *   "length_px": 120.0,           // segments only
 *   "length": 9.6,                // segments only, scaled
 *   "text": "...",                // notes only
 *   "points": [{"x":0,"y":0}, ...]  // image-space coordinates
 * }
 */
export function exportMeasurements() {
  const result = {
    version: '1.0',
    source: 'AreaImageCalc',
    exported: new Date().toISOString(),
    tabs: tabsWithShapes().map(function(tab) {
      const hasScale = tab.scalePPU > 0;
      return {
        label: tab.label,
        scale: hasScale ? { ppu: tab.scalePPU, unit: tab.scaleUnit } : null,
        measurements: tab.shapes.map(function(s) {
          const obj = {
            id: s.id,
            type: s.type,
            name: s.name,
            points: s.points
          };
          if (s.type === 'note') {
            obj.text = s.text || '';
            return obj;
          }
          if (s.type === 'segment') {
            obj.length_px = s.length || 0;
            if (hasScale) {
              obj.length = obj.length_px / tab.scalePPU;
              obj.unit = tab.scaleUnit;
            }
            return obj;
          }
          obj.area_px2 = s.area || 0;
          obj.perimeter_px = s.perimeter || 0;
          if (hasScale) {
            obj.area = obj.area_px2 / (tab.scalePPU * tab.scalePPU);
            obj.unit2 = tab.scaleUnit + '²';
            obj.perimeter = obj.perimeter_px / tab.scalePPU;
            obj.unit = tab.scaleUnit;
          }
          return obj;
        })
      };
    })
  };

  triggerDownload(JSON.stringify(result, null, 2), projectName() + '-measurements.json', 'application/json');
  status('Measurements exported as JSON.');
}

export function exportMeasurementsCsv() {
  const csv = buildMeasurementsCsv(tabsWithShapes());
  // BOM so spreadsheet apps decode UTF-8 (units contain ² symbols)
  triggerDownload('﻿' + csv, projectName() + '-measurements.csv', 'text/csv');
  status('Measurements exported as CSV.');
}
