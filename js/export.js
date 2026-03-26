import { S, fn, SAVE_VER } from './state.js';

function serializeTab(tab) {
  return {
    label: tab.label,
    imgDataUrl: tab.imgDataUrl,
    view: { ox: tab.view.ox, oy: tab.view.oy, zoom: tab.view.zoom, fit: tab.view.fit, iw: tab.view.iw, ih: tab.view.ih },
    shapes: tab.shapes.map(function(s) {
      return { id: s.id, type: s.type, points: s.points, closed: s.closed, color: s.color, area: s.area, perimeter: s.perimeter };
    }),
    colorIdx: tab.colorIdx,
    shapeN: tab.shapeN,
    scalePPU: tab.scalePPU,
    scaleUnit: tab.scaleUnit,
    scaleLine: tab.scaleLine,
    brightness: tab.brightness,
    contrast: tab.contrast
  };
}

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
  if (fn.snapshotCurrentTab) fn.snapshotCurrentTab();

  var project = {
    v: SAVE_VER,
    ts: Date.now(),
    currentTabIdx: S.currentTabIdx,
    tabs: S.tabs.map(serializeTab)
  };

  triggerDownload(JSON.stringify(project), 'project.arcalc', 'application/json');
  if (fn.status) fn.status('Project exported.');
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
        var idx = fn.createTab(td.label || 'Tab ' + (i + 1), td.imgDataUrl || null, null);
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
      if (fn.switchToTab) fn.switchToTab(targetIdx);
      if (fn.status) fn.status('Project loaded: ' + data.tabs.length + ' tab(s).');
    } catch (ex) {
      console.error('Import failed:', ex);
      alert('Failed to load project file.');
    }
  };
  reader.readAsText(file);
}

export function exportMeasurements() {
  if (fn.snapshotCurrentTab) fn.snapshotCurrentTab();

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
  if (fn.status) fn.status('Measurements exported.');
}
