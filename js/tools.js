import { S, COLORS, SAVE_KEY, SAVE_VER, fn, worker, iCvs, oCvs, $wrap } from './state.js';
import { findShape, nextColor, s2i, i2s, fmtArea, fmtPerim, fmtLen, findNearestPt, distSeg, pip, hasWork } from './geometry.js';

// Register cross-module functions into fn so perspective.js can call them
fn.setTool = setTool;
fn.enableTools = enableTools;
fn.status = status;
fn.updatePanel = updatePanel;
fn.scheduleSave = scheduleSave;
fn.updateScaleDisp = updateScaleDisp;

// Worker message handler
worker.onmessage = function(e) {
  var d = e.data, shape;

  if (d.type === 'areaResult') {
    shape = findShape(d.id);
    if (shape) {
      shape.area = d.area;
      shape.perimeter = d.perimeter;
      S.overlayDirty = true;
      updatePanel();
    }
  }
  else if (d.type === 'simplifyResult') {
    shape = findShape(d.id);
    if (shape) {
      shape.points = d.points;
      worker.postMessage({ type: 'calcArea', id: shape.id, points: shape.points });
      S.overlayDirty = true;
    }
  }
};

// ---- Persistence ----

export function scheduleSave() {
  if (S.saveTimer) clearTimeout(S.saveTimer);
  S.pendingSave = true;
  S.saveTimer = setTimeout(doSave, 2000);
}

export function doSave() {
  S.pendingSave = false;
  if (!S.img || !S.imgDataUrl) return;

  try {
    var state = {
      v: SAVE_VER,
      ts: Date.now(),
      img: S.imgDataUrl,
      iw: S.view.iw,
      ih: S.view.ih,
      shapes: S.shapes.map(function(s) {
        return {
          id: s.id,
          type: s.type,
          points: s.points,
          closed: s.closed,
          color: s.color,
          area: s.area,
          perimeter: s.perimeter
        };
      }),
      colorIdx: S.colorIdx,
      shapeN: S.shapeN,
      scalePPU: S.scalePPU,
      scaleUnit: S.scaleUnit,
      scaleLine: S.scaleLine
    };
    localStorage.setItem(SAVE_KEY, JSON.stringify(state));
  } catch (e) {
    console.warn('Save failed:', e);
  }
}

export function restoreState() {
  try {
    var raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return false;

    var state = JSON.parse(raw);
    if (!state || state.v !== SAVE_VER || !state.img) return false;

    var ni = new Image();
    ni.onload = function() {
      S.img = ni;
      S.view.iw = state.iw;
      S.view.ih = state.ih;
      S.FH_MIN_DIST = Math.max(1, Math.log2(S.view.iw + S.view.ih) - 8.5);
      S.imgDataUrl = state.img;
      S.shapes = state.shapes || [];
      S.colorIdx = state.colorIdx || 0;
      S.shapeN = state.shapeN || 0;
      S.scalePPU = state.scalePPU || 0;
      S.scaleUnit = state.scaleUnit || 'cm';
      S.scaleLine = state.scaleLine || null;
      S.selId = null;

      fitView();
      updateScaleDisp();
      updatePanel();
      $('#dropzone').css('pointer-events', 'none').find('.dz-content').hide();
      enableTools(true);
      status('Session restored. ' + S.shapes.length + ' shape(s).');
    };
    ni.onerror = function() {
      localStorage.removeItem(SAVE_KEY);
    };
    ni.src = state.img;
    return true;
  } catch (e) {
    console.warn('Restore failed:', e);
    localStorage.removeItem(SAVE_KEY);
    return false;
  }
}

// ---- Image Loading ----

export function loadImg(file, skipConfirm) {
  if (!file || file.type.indexOf('image/') !== 0) return;

  if (!skipConfirm && hasWork()) {
    if (!confirm('Opening a new image will discard your current work.\n\nContinue?')) return;
  }

  if (S.perspActive) fn.cancelPerspective();

  var reader = new FileReader();
  reader.onload = function(e) {
    var dataUrl = e.target.result;
    var ni = new Image();

    ni.onload = function() {
      S.img = ni;
      S.view.iw = ni.naturalWidth;
      S.view.ih = ni.naturalHeight;
      S.FH_MIN_DIST = Math.max(1, Math.log2(S.view.iw + S.view.ih) - 8.5);
      S.imgDataUrl = dataUrl;

      fitView();

      S.shapes = [];
      S.selId = null;
      S.colorIdx = 0;
      S.shapeN = 0;
      S.scaleLine = null;
      S.scalePPU = 0;

      updateScaleDisp();
      setTool('idle');
      updatePanel();

      $('#dropzone').css('pointer-events', 'none').find('.dz-content').hide();
      enableTools(true);
      status('Image loaded (' + S.view.iw + '\u00d7' + S.view.ih + '). Pick a tool to begin.');
      scheduleSave();
    };

    ni.src = dataUrl;
  };

  reader.readAsDataURL(file);
}

// ---- View Control ----

export function fitView() {
  if (!S.img) return;

  S.view.fit = Math.min(S.cw / S.view.iw, S.ch / S.view.ih, 1);
  S.view.zoom = 1;

  var dw = S.view.iw * S.view.fit;
  var dh = S.view.ih * S.view.fit;
  S.view.ox = (S.cw - dw) / 2;
  S.view.oy = (S.ch - dh) / 2;

  S.imageDirty = S.overlayDirty = true;
  updateZoomDisp();
  if (S.perspActive) fn.updatePerspPreview();
}

export function zoomAt(factor, sx, sy) {
  var ip = s2i(sx, sy);
  var oz = S.view.zoom;

  S.view.zoom = Math.max(0.05, Math.min(50, S.view.zoom * factor));
  if (S.view.zoom === oz) return;

  var ns = i2s(ip.x, ip.y);
  S.view.ox += sx - ns.x;
  S.view.oy += sy - ns.y;

  S.imageDirty = S.overlayDirty = true;
  updateZoomDisp();
  if (S.perspActive) fn.updatePerspPreview();
  setInteract();
}

export function setInteract() {
  S.interacting = true;
  clearTimeout(S.qualTimer);
  S.qualTimer = setTimeout(function() {
    S.interacting = false;
    S.imageDirty = true;
  }, 150);
}

export function enableTools(on) {
  var btns = $('#btn-scale, #btn-polygon, #btn-freehand, #btn-edit, #btn-delete, #btn-clear, #btn-fit, #btn-persp');
  on ? btns.removeClass('disabled') : btns.addClass('disabled');
}

export function updateZoomDisp() {
  $('#zoom-display').text(Math.round(S.view.zoom * 100) + '%');
}

export function updateScaleDisp() {
  if (S.scalePPU > 0) {
    $('#scale-display').text('1px=' + (1 / S.scalePPU).toFixed(3) + S.scaleUnit);
  } else {
    $('#scale-display').text('No scale');
  }
}

export function status(t) {
  $('#status-text').text(t);
}

export function updateFilters() {
  var b = 1 + S.brightness / 100;
  var c = 1 + S.contrast / 100;
  iCvs.style.filter = 'brightness(' + b + ') contrast(' + c + ')';
}

// ---- Tool Management ----

export function setTool(t) {
  cancelTool();
  S.tool = t;

  $('.tb-btn[data-tool]').removeClass('active');
  if (t !== 'idle') {
    $('.tb-btn[data-tool="' + t + '"]').addClass('active');
  }

  $('body').removeClass('cursor-crosshair cursor-grab cursor-grabbing cursor-move');

  if (t === 'scale' || t === 'polygon' || t === 'freehand') {
    $('body').addClass('cursor-crosshair');
  }
  if (t === 'edit') {
    $('body').addClass('cursor-move');
  }

  switch (t) {
    case 'idle':
      status(S.img ? 'Select a tool or click a shape' : 'Drop an image or click Open');
      break;
    case 'scale':
      status('Click first point of known distance');
      break;
    case 'polygon':
      status('Click to place vertices. Click first point or double-click to close. ESC cancels.');
      break;
    case 'freehand':
      status('Click and drag to trace. Release to finish. ESC cancels.');
      break;
    case 'edit':
      status('Drag control points to edit shapes. ESC to exit.');
      break;
  }

  S.overlayDirty = true;
}

export function cancelTool() {
  S.polyPts = [];
  S.fhPts = [];
  S.isFH = false;
  S.scaleP1 = S.scaleP2 = null;
  S.scaleState = 0;
  S.dragPt = null;
  S.dragShape = null;
  S.dragIdx = -1;
  S.touchId = null;
  S.touchIsPan = false;
  $('#scale-popup').hide();
  S.overlayDirty = true;
}

// ---- Scale Popup ----

export function showScalePopup() {
  var mp = i2s((S.scaleP1.x + S.scaleP2.x) / 2, (S.scaleP1.y + S.scaleP2.y) / 2);
  var l = Math.min(Math.max(mp.x + 12, 10), S.cw - 250);
  var t = Math.min(Math.max(mp.y - 30, 10), S.ch - 60);

  $('#scale-popup').css({ left: l, top: t }).show();
  $('#scale-value').val('').focus();
  status('Enter real-world distance');
}

export function confirmScale() {
  var val = parseFloat($('#scale-value').val());
  var unit = $('#scale-unit').val();

  if (!val || val <= 0) {
    status('Enter a valid distance > 0');
    return;
  }

  var dx = S.scaleP2.x - S.scaleP1.x;
  var dy = S.scaleP2.y - S.scaleP1.y;
  var px = Math.sqrt(dx * dx + dy * dy);

  if (px < 1) {
    status('Points too close');
    cancelTool();
    setTool('idle');
    return;
  }

  S.scalePPU = px / val;
  S.scaleUnit = unit;
  S.scaleLine = {
    p1: { x: S.scaleP1.x, y: S.scaleP1.y },
    p2: { x: S.scaleP2.x, y: S.scaleP2.y }
  };

  cancelTool();
  setTool('idle');
  updateScaleDisp();

  for (var i = 0; i < S.shapes.length; i++) {
    if (S.shapes[i].closed) {
      worker.postMessage({ type: 'calcArea', id: S.shapes[i].id, points: S.shapes[i].points });
    }
  }

  S.overlayDirty = true;
  updatePanel();
  status('Scale set: ' + val + ' ' + unit + ' = ' + Math.round(px) + 'px');
  scheduleSave();
}

// ---- Shape Operations ----

export function closePoly() {
  if (S.polyPts.length < 3) return;

  var id = 's' + (++S.shapeN);
  S.shapes.push({
    id: id,
    type: 'polygon',
    points: S.polyPts.slice(),
    closed: true,
    area: null,
    perimeter: null,
    color: nextColor()
  });

  S.selId = id;
  S.polyPts = [];

  worker.postMessage({ type: 'calcArea', id: id, points: S.shapes[S.shapes.length - 1].points });
  S.overlayDirty = true;
  updatePanel();
  setTool('idle');
  scheduleSave();
}

export function finishFH() {
  var id = 's' + (++S.shapeN);
  var pts = S.fhPts.slice();
  S.fhPts = [];

  S.shapes.push({
    id: id,
    type: 'freehand',
    points: pts,
    closed: true,
    area: null,
    perimeter: null,
    color: nextColor()
  });

  S.selId = id;

  var eps = 2 / (S.view.zoom * S.view.fit);
  worker.postMessage({ type: 'simplify', id: id, points: pts, epsilon: eps });

  S.overlayDirty = true;
  updatePanel();
  setTool('idle');
  scheduleSave();
}

export function delShape(id) {
  S.shapes = S.shapes.filter(function(s) { return s.id !== id; });
  if (S.selId === id) S.selId = null;

  S.overlayDirty = true;
  updatePanel();
  status('Shape deleted');
  scheduleSave();
}

export function selectAt(ip) {
  var found = null;

  for (var i = S.shapes.length - 1; i >= 0; i--) {
    if (S.shapes[i].closed && pip(ip, S.shapes[i].points)) {
      found = S.shapes[i].id;
      break;
    }
  }

  if (!found) {
    var best = Infinity;
    var thr = 15 / (S.view.zoom * S.view.fit);

    for (var i = 0; i < S.shapes.length; i++) {
      var sh = S.shapes[i];
      if (!sh.closed) continue;

      for (var j = 0; j < sh.points.length; j++) {
        var k = (j + 1) % sh.points.length;
        var d = distSeg(ip, sh.points[j], sh.points[k]);
        if (d < best) {
          best = d;
          found = sh.id;
        }
      }
    }

    if (best > thr) found = null;
  }

  S.selId = found;
  S.overlayDirty = true;
  updatePanel();

  if (found) {
    var sh = findShape(found);
    if (sh && sh.area != null) {
      status('Area: ' + fmtArea(sh.area) + ' | Perimeter: ' + fmtPerim(sh.perimeter));
    }
  } else {
    status('Select a tool or click a shape');
  }
}

// ---- Shapes Panel ----

export function updatePanel() {
  var $l = $('#shapes-list');
  $l.empty();

  var total = 0;

  for (var i = 0; i < S.shapes.length; i++) {
    var s = S.shapes[i];
    var aStr = s.area != null ? fmtArea(s.area) : '...';
    var pStr = s.perimeter != null ? fmtPerim(s.perimeter) : '';

    if (s.area != null) total += s.area;

    $l.append(
      '<div class="shape-item' + (s.id === S.selId ? ' selected' : '') + '" data-id="' + s.id + '">' +
        '<div class="shape-swatch" style="background:' + s.color + '"></div>' +
        '<div class="shape-info">' +
          '<div class="area">' + aStr + '</div>' +
          (pStr ? '<div class="perim">P: ' + pStr + '</div>' : '') +
        '</div>' +
        '<button class="shape-del" data-id="' + s.id + '">&times;</button>' +
      '</div>'
    );
  }

  var tStr = S.shapes.length
    ? 'Total: ' + fmtArea(total) + ' (' + S.shapes.length + ')'
    : 'No shapes yet';
  $('#shapes-total').text(tStr);
}
