/**
 * Project save/load and measurements export.
 *
 * ── Project file (.arcalc) ──────────────────────────────────────────────────
 * Plain JSON, MIME type application/json. Top-level structure:
 *
 * {
 *   "v": 3,                         // format version (integer)
 *   "ts": 1234567890123,            // Unix timestamp (ms) of export
 *   "currentTabIdx": 0,             // index of the tab that was active
 *   "tabs": [ <Tab>, ... ]          // one entry per tab
 * }
 *
 * Tab object:
 * {
 *   "label": "Page 1",              // display name shown in the tab bar
 *   "imgDataUrl": "data:image/...", // base-64 encoded image (may be null for blank tabs)
 *   "view": {                       // viewport state at time of save
 *     "ox": 0, "oy": 0,            //   pan offset in screen pixels
 *     "zoom": 1, "fit": 0.5,       //   zoom multiplier and fit factor
 *     "iw": 1920, "ih": 1080       //   image natural dimensions
 *   },
 *   "shapes": [ <Shape>, ... ],     // all drawn shapes
 *   "colorIdx": 3,                  // next colour palette index
 *   "shapeN": 3,                    // highest shape serial used (for unique IDs)
 *   "scalePPU": 12.5,               // pixels per unit (0 = no scale set)
 *   "scaleUnit": "cm",              // unit label
 *   "scaleLine": {                  // the calibration segment (null if not set)
 *     "p1": {"x": 100, "y": 200},
 *     "p2": {"x": 300, "y": 200}
 *   },
 *   "brightness": 0,                // brightness adjustment (−100 … +100)
 *   "contrast": 0                   // contrast adjustment  (−100 … +100)
 * }
 *
 * Shape object:
 * {
 *   "id": "s1",                     // unique ID within the tab
 *   "type": "polygon"|"freehand",
 *   "points": [{"x":0,"y":0}, ...], // image-space coordinates
 *   "closed": true,
 *   "color": "#FF6B35",
 *   "area": 1234.5,                 // pixels² (null while calculating)
 *   "perimeter": 150.0              // pixels  (null while calculating)
 * }
 *
 * ── Measurements file (.json) ───────────────────────────────────────────────
 * See exportMeasurements() below for its schema documentation.
 */

import { S, SAVE_VER } from './state.js';
import { serializeTab, snapshotCurrentTab, createTab, switchToTab } from './tabs.js';
import { status } from './ui.js';

function triggerDownload(content, filename, mime) {
  var blob = new Blob([content], { type: mime || 'application/json' });
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(function() { URL.revokeObjectURL(url); }, 1000);
}

export function exportProject() {
  snapshotCurrentTab();

  var project = {
    v: SAVE_VER,
    ts: Date.now(),
    currentTabIdx: S.currentTabIdx,
    tabs: S.tabs.map(serializeTab)
  };

  triggerDownload(JSON.stringify(project), 'project.arcalc', 'application/json');
  status('Project exported.');
}

export function importProject(file) {
  var reader = new FileReader();
  reader.onload = function(e) {
    try {
      var data = JSON.parse(e.target.result);
      if (!data || !data.tabs || !data.tabs.length) {
        alert('Invalid or empty project file.');
        return;
      }

      S.tabs = [];
      S.currentTabIdx = -1;

      for (var i = 0; i < data.tabs.length; i++) {
        var td = data.tabs[i];
        var idx = createTab(td.label || 'Tab ' + (i + 1), td.imgDataUrl || null, null);
        var tab = S.tabs[idx];
        if (td.view) tab.view = td.view;
        tab.shapes = td.shapes || [];
        tab.colorIdx = td.colorIdx || 0;
        tab.shapeN = td.shapeN || 0;
        tab.scalePPU = td.scalePPU || 0;
        tab.scaleUnit = td.scaleUnit || 'cm';
        tab.scaleLine = td.scaleLine || null;
        tab.brightness = td.brightness || 0;
        tab.contrast = td.contrast || 0;
      }

      var targetIdx = (data.currentTabIdx >= 0 && data.currentTabIdx < S.tabs.length) ? data.currentTabIdx : 0;
      switchToTab(targetIdx);
      status('Project loaded: ' + data.tabs.length + ' tab(s).');
    } catch (ex) {
      console.error('Import failed:', ex);
      alert('Failed to load project file.');
    }
  };
  reader.readAsText(file);
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
 *   "type": "polygon"|"freehand",
 *   "area_px2": 4500.0,           // area in pixels²
 *   "area": 28.8,                 // area in scale units² (omitted if no scale)
 *   "unit2": "cm²",               // area unit label     (omitted if no scale)
 *   "perimeter_px": 280.0,        // perimeter in pixels
 *   "perimeter": 22.4,            // perimeter in scale units (omitted if no scale)
 *   "unit": "cm",                 // length unit label   (omitted if no scale)
 *   "points": [{"x":0,"y":0}, ...]  // image-space coordinates
 * }
 */
export function exportMeasurements() {
  snapshotCurrentTab();

  var result = {
    version: '1.0',
    source: 'AreaImageCalc',
    exported: new Date().toISOString(),
    tabs: S.tabs.filter(function(t) { return t.shapes.length > 0; }).map(function(tab) {
      var hasScale = tab.scalePPU > 0;
      return {
        label: tab.label,
        scale: hasScale ? { ppu: tab.scalePPU, unit: tab.scaleUnit } : null,
        measurements: tab.shapes.map(function(s) {
          var area_px2 = s.area || 0;
          var perim_px = s.perimeter || 0;
          var obj = {
            id: s.id,
            type: s.type,
            area_px2: area_px2,
            perimeter_px: perim_px,
            points: s.points
          };
          if (hasScale) {
            obj.area = area_px2 / (tab.scalePPU * tab.scalePPU);
            obj.unit2 = tab.scaleUnit + '\u00b2';
            obj.perimeter = perim_px / tab.scalePPU;
            obj.unit = tab.scaleUnit;
          }
          return obj;
        })
      };
    })
  };

  triggerDownload(JSON.stringify(result, null, 2), 'measurements.json', 'application/json');
  status('Measurements exported.');
}
