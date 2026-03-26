import { S, fn, worker, oCvs } from './state.js';
import { s2i, i2s, findNearestPt, findShape, fmtArea, fmtPerim } from './geometry.js';
import { resize } from './render.js';
import {
  setTool, cancelTool, closePoly, finishFH, delShape, selectAt,
  loadImg, fitView, zoomAt, setInteract, showScalePopup, confirmScale,
  updatePanel, scheduleSave, status, updateFilters
} from './tools.js';

// Expose slider sync for tabs.js to call on tab switch
fn.syncSliders = function() {
  setSlider('bright', S.brightness);
  setSlider('contrast', S.contrast);
};

// ---- Coordinate Helpers ----

function canvasXY(e) {
  var r = oCvs.getBoundingClientRect();
  S.mx = e.clientX - r.left;
  S.my = e.clientY - r.top;
  var ip = s2i(S.mx, S.my);
  S.mix = ip.x;
  S.miy = ip.y;
}

function touchXY(touch) {
  var r = oCvs.getBoundingClientRect();
  S.mx = touch.clientX - r.left;
  S.my = touch.clientY - r.top;
  var ip = s2i(S.mx, S.my);
  S.mix = ip.x;
  S.miy = ip.y;
}

function findTouch(touches, id) {
  for (var i = 0; i < touches.length; i++) {
    if (touches[i].identifier === id) return touches[i];
  }
  return null;
}

// ---- Mouse Handling ----

$(oCvs).on('mousedown', function(e) {
  e.preventDefault();
  canvasXY(e);

  if (e.button === 1 || (e.button === 0 && S.spaceHeld)) {
    S.isPan = true;
    S.panSt = { x: e.clientX, y: e.clientY, ox: S.view.ox, oy: S.view.oy };
    $('body').removeClass('cursor-grab').addClass('cursor-grabbing');
    return;
  }

  if (e.button !== 0 || !S.img) return;

  if (S.perspActive) {
    var hi = fn.findPerspHandle(S.mx, S.my);
    if (hi >= 0) {
      S.perspDragIdx = hi;
      S.perspDragOffset = {
        x: S.perspCorners[hi].x - S.mix,
        y: S.perspCorners[hi].y - S.miy
      };
      S.overlayDirty = true;
    }
    return;
  }

  var ip = { x: S.mix, y: S.miy };

  switch (S.tool) {
    case 'squarecal':
      if (S.polyPts.length === 4) {
        // Click near an existing corner → start dragging it
        var grabR = 12 / (S.view.zoom * S.view.fit);
        S.dragIdx = -1;
        for (var ci = 0; ci < 4; ci++) {
          if (Math.hypot(S.mix - S.polyPts[ci].x, S.miy - S.polyPts[ci].y) <= grabR) {
            S.dragIdx = ci; break;
          }
        }
      } else {
        S.polyPts.push(ip);
        S.overlayDirty = true;
        fn.onSqCalibPoint();
      }
      break;

    case 'scale':
      if (S.scaleState === 0) {
        S.scaleP1 = ip;
        S.scaleState = 1;
        status('Click second point');
      } else if (S.scaleState === 1) {
        S.scaleP2 = ip;
        S.scaleState = 2;
        showScalePopup();
      }
      S.overlayDirty = true;
      break;

    case 'polygon':
      if (S.polyPts.length >= 3) {
        var fp = i2s(S.polyPts[0].x, S.polyPts[0].y);
        if (Math.hypot(S.mx - fp.x, S.my - fp.y) < 15) {
          closePoly();
          return;
        }
      }
      S.polyPts.push(ip);
      S.overlayDirty = true;
      break;

    case 'freehand':
      S.isFH = true;
      S.fhPts = [ip];
      S.fhLastTime = Date.now();
      S.overlayDirty = true;
      break;

    case 'edit':
      var thr = 10 / (S.view.zoom * S.view.fit);
      var hp = findNearestPt(ip, thr);
      if (hp) {
        S.dragShape = hp.shape;
        S.dragIdx = hp.idx;
        S.dragPt = { x: hp.shape.points[hp.idx].x, y: hp.shape.points[hp.idx].y };
        S.selId = hp.shape.id;
        S.overlayDirty = true;
        updatePanel();
        status('Drag to move point');
      }
      break;

    case 'idle':
      selectAt(ip);
      break;
  }
});

$(document).on('mousemove', function(e) {
  canvasXY(e);

  if (S.isPan) {
    S.view.ox = S.panSt.ox + (e.clientX - S.panSt.x);
    S.view.oy = S.panSt.oy + (e.clientY - S.panSt.y);
    S.imageDirty = S.overlayDirty = true;
    if (S.perspActive) fn.updatePerspPreview();
    setInteract();
    return;
  }

  if (S.perspActive && S.perspDragIdx >= 0) {
    S.perspCorners[S.perspDragIdx] = { x: S.mix + S.perspDragOffset.x, y: S.miy + S.perspDragOffset.y };
    fn.updatePerspPreview();
    S.overlayDirty = true;
    return;
  }

  if (S.perspActive) {
    var hi = fn.findPerspHandle(S.mx, S.my);
    $('body').removeClass('cursor-move cursor-crosshair cursor-grab');
    if (hi >= 0) {
      oCvs.style.cursor = 'grab';
    } else {
      oCvs.style.cursor = 'default';
    }
    S.overlayDirty = true;
    return;
  }

  if (S.tool === 'squarecal') {
    if (S.dragIdx >= 0 && S.dragIdx < S.polyPts.length) {
      // Drag placed corner to fine-tune position
      S.polyPts[S.dragIdx] = { x: S.mix, y: S.miy };
    } else if (S.polyPts.length === 4) {
      // Show grab cursor when hovering near a corner
      var grabR2 = 12 / (S.view.zoom * S.view.fit);
      var nearCorner = S.polyPts.some(function(p) {
        return Math.hypot(S.mix - p.x, S.miy - p.y) <= grabR2;
      });
      oCvs.style.cursor = nearCorner ? 'grab' : '';
    }
    S.overlayDirty = true;
    return;
  }

  if (S.isFH) {
    var last = S.fhPts[S.fhPts.length - 1];
    var dx = S.mix - last.x, dy = S.miy - last.y;
    var dist = Math.sqrt(dx * dx + dy * dy);

    var now = Date.now();
    var dt = (now - S.fhLastTime) / 1000;
    var speed = dt > 0 ? dist / dt : 0;

    var t = Math.min(speed / 2000, 1);
    var threshold = S.FH_MIN_DIST + t * (S.FH_MAX_DIST - S.FH_MIN_DIST);

    if (dist >= threshold) {
      S.fhPts.push({ x: S.mix, y: S.miy });
      S.fhLastTime = now;
      S.overlayDirty = true;
    }
    return;
  }

  if (S.dragPt && S.dragShape) {
    S.dragPt.x = S.mix;
    S.dragPt.y = S.miy;
    S.dragShape.points[S.dragIdx] = { x: S.mix, y: S.miy };
    S.overlayDirty = true;
    return;
  }

  if (S.tool === 'polygon' && S.polyPts.length > 0) S.overlayDirty = true;
  if (S.tool === 'scale' && S.scaleState === 1) S.overlayDirty = true;
  if (S.tool === 'edit') S.overlayDirty = true;
});

$(document).on('mouseup', function(e) {
  if (S.isPan) {
    S.isPan = false;
    $('body').removeClass('cursor-grabbing');
    if (S.spaceHeld) $('body').addClass('cursor-grab');
    return;
  }

  if (S.perspActive && S.perspDragIdx >= 0) {
    S.perspDragIdx = -1;
    S.perspDragOffset = null;
    S.overlayDirty = true;
    return;
  }

  if (S.tool === 'squarecal' && S.dragIdx >= 0) {
    S.dragIdx = -1;
    S.overlayDirty = true;
    return;
  }

  if (S.isFH) {
    S.isFH = false;
    if (S.fhPts.length > 5) {
      finishFH();
    } else {
      S.fhPts = [];
      status('Too short \u2014 drag further.');
      S.overlayDirty = true;
    }
  }

  if (S.dragPt && S.dragShape) {
    worker.postMessage({ type: 'calcArea', id: S.dragShape.id, points: S.dragShape.points, tabIdx: S.currentTabIdx });
    S.dragPt = null;
    S.dragShape = null;
    S.dragIdx = -1;
    S.overlayDirty = true;
    updatePanel();
    status('Point moved. Drag control points to edit shapes.');
    scheduleSave();
  }
});

$(oCvs).on('dblclick', function(e) {
  if (S.tool === 'polygon' && S.polyPts.length >= 3) {
    S.polyPts.pop();
    closePoly();
  }
});

oCvs.addEventListener('wheel', function(e) {
  e.preventDefault();
  if (!S.img) return;

  var r = oCvs.getBoundingClientRect();
  var sx = e.clientX - r.left;
  var sy = e.clientY - r.top;
  var d = e.ctrlKey ? -e.deltaY * 3 : -e.deltaY;

  zoomAt(d > 0 ? 1.1 : 1 / 1.1, sx, sy);
}, { passive: false });

$(oCvs).on('contextmenu', function(e) {
  e.preventDefault();
  if (S.tool !== 'idle') {
    cancelTool();
    setTool(S.tool);
  }
});

// ---- Touch Handling ----

oCvs.addEventListener('touchstart', function(e) {
  e.preventDefault();

  var touches = e.touches;

  if (touches.length >= 2) {
    if (S.isFH) { S.isFH = false; S.fhPts = []; S.overlayDirty = true; }
    if (S.dragPt && S.dragShape) {
      S.dragPt = null; S.dragShape = null; S.dragIdx = -1;
      S.overlayDirty = true;
    }
    S.touchId = null;
    S.touchIsPan = true;

    var t0 = touches[0], t1 = touches[1];
    var r = oCvs.getBoundingClientRect();
    var mx0 = t0.clientX - r.left, my0 = t0.clientY - r.top;
    var mx1 = t1.clientX - r.left, my1 = t1.clientY - r.top;

    S.touchPinchDist = Math.hypot(mx1 - mx0, my1 - my0);
    S.touchPinchMid = { x: (mx0 + mx1) / 2, y: (my0 + my1) / 2 };
    S.touchPanSt = { x: S.touchPinchMid.x, y: S.touchPinchMid.y, ox: S.view.ox, oy: S.view.oy };
    return;
  }

  if (S.touchId !== null) return;

  var touch = touches[0];
  S.touchId = touch.identifier;
  touchXY(touch);

  if (!S.img) return;

  if (S.perspActive) {
    var hi = fn.findPerspHandle(S.mx, S.my);
    if (hi >= 0) {
      S.perspDragIdx = hi;
      S.perspDragOffset = {
        x: S.perspCorners[hi].x - S.mix,
        y: S.perspCorners[hi].y - S.miy
      };
      S.overlayDirty = true;
    }
    return;
  }

  var ip = { x: S.mix, y: S.miy };

  switch (S.tool) {
    case 'squarecal':
      if (S.polyPts.length === 4) {
        var grabRT = 18 / (S.view.zoom * S.view.fit);
        S.dragIdx = -1;
        for (var cit = 0; cit < 4; cit++) {
          if (Math.hypot(S.mix - S.polyPts[cit].x, S.miy - S.polyPts[cit].y) <= grabRT) {
            S.dragIdx = cit; break;
          }
        }
      } else {
        S.polyPts.push(ip);
        S.overlayDirty = true;
        fn.onSqCalibPoint();
      }
      break;

    case 'scale':
      if (S.scaleState === 0) {
        S.scaleP1 = ip;
        S.scaleState = 1;
        status('Tap second point');
      } else if (S.scaleState === 1) {
        S.scaleP2 = ip;
        S.scaleState = 2;
        showScalePopup();
      }
      S.overlayDirty = true;
      break;

    case 'polygon':
      if (S.polyPts.length >= 3) {
        var fp = i2s(S.polyPts[0].x, S.polyPts[0].y);
        if (Math.hypot(S.mx - fp.x, S.my - fp.y) < 25) {
          closePoly();
          return;
        }
      }
      S.polyPts.push(ip);
      S.overlayDirty = true;
      break;

    case 'freehand':
      S.isFH = true;
      S.fhPts = [ip];
      S.fhLastTime = Date.now();
      S.overlayDirty = true;
      break;

    case 'edit':
      var thrScreen = 20 / (S.view.zoom * S.view.fit);
      var hp = findNearestPt(ip, thrScreen);
      if (hp) {
        S.dragShape = hp.shape;
        S.dragIdx = hp.idx;
        S.dragPt = { x: hp.shape.points[hp.idx].x, y: hp.shape.points[hp.idx].y };
        S.selId = hp.shape.id;
        S.overlayDirty = true;
        updatePanel();
        status('Drag to move point');
      }
      break;

    case 'idle':
      selectAt(ip);
      break;
  }
}, { passive: false });

oCvs.addEventListener('touchmove', function(e) {
  e.preventDefault();

  var touches = e.touches;

  if (S.touchIsPan && touches.length >= 2) {
    var t0 = touches[0], t1 = touches[1];
    var r = oCvs.getBoundingClientRect();
    var mx0 = t0.clientX - r.left, my0 = t0.clientY - r.top;
    var mx1 = t1.clientX - r.left, my1 = t1.clientY - r.top;

    var newDist = Math.hypot(mx1 - mx0, my1 - my0);
    var newMid = { x: (mx0 + mx1) / 2, y: (my0 + my1) / 2 };

    if (S.touchPinchDist > 0) {
      var factor = newDist / S.touchPinchDist;
      zoomAt(factor, S.touchPinchMid.x, S.touchPinchMid.y);
      S.touchPinchDist = newDist;
      S.touchPinchMid = newMid;
    }

    S.view.ox = S.touchPanSt.ox + (newMid.x - S.touchPanSt.x);
    S.view.oy = S.touchPanSt.oy + (newMid.y - S.touchPanSt.y);
    S.touchPanSt.x = newMid.x;
    S.touchPanSt.y = newMid.y;
    S.touchPanSt.ox = S.view.ox;
    S.touchPanSt.oy = S.view.oy;

    S.imageDirty = S.overlayDirty = true;
    if (S.perspActive) fn.updatePerspPreview();
    setInteract();
    return;
  }

  if (S.touchId === null) return;
  var touch = findTouch(touches, S.touchId);
  if (!touch) return;

  touchXY(touch);

  if (S.perspActive && S.perspDragIdx >= 0) {
    S.perspCorners[S.perspDragIdx] = { x: S.mix + S.perspDragOffset.x, y: S.miy + S.perspDragOffset.y };
    fn.updatePerspPreview();
    S.overlayDirty = true;
    return;
  }

  if (S.isFH) {
    var last = S.fhPts[S.fhPts.length - 1];
    var dx = S.mix - last.x, dy = S.miy - last.y;
    var dist = Math.sqrt(dx * dx + dy * dy);

    var now = Date.now();
    var dt = (now - S.fhLastTime) / 1000;
    var speed = dt > 0 ? dist / dt : 0;

    var t = Math.min(speed / 2000, 1);
    var threshold = S.FH_MIN_DIST + t * (S.FH_MAX_DIST - S.FH_MIN_DIST);

    if (dist >= threshold) {
      S.fhPts.push({ x: S.mix, y: S.miy });
      S.fhLastTime = now;
      S.overlayDirty = true;
    }
    return;
  }

  if (S.dragPt && S.dragShape) {
    S.dragPt.x = S.mix;
    S.dragPt.y = S.miy;
    S.dragShape.points[S.dragIdx] = { x: S.mix, y: S.miy };
    S.overlayDirty = true;
    return;
  }

  if (S.tool === 'polygon' && S.polyPts.length > 0) S.overlayDirty = true;
  if (S.tool === 'scale' && S.scaleState === 1) S.overlayDirty = true;
  if (S.tool === 'edit') S.overlayDirty = true;
}, { passive: false });

function touchEnd(e) {
  e.preventDefault();

  if (S.touchIsPan) {
    if (e.touches.length < 2) {
      S.touchIsPan = false;
      S.touchId = null;
    }
    return;
  }

  if (S.touchId === null) return;
  var found = findTouch(e.touches, S.touchId);
  if (found) return;

  S.touchId = null;

  if (S.perspActive && S.perspDragIdx >= 0) {
    S.perspDragIdx = -1;
    S.perspDragOffset = null;
    S.overlayDirty = true;
    return;
  }

  if (S.isFH) {
    S.isFH = false;
    if (S.fhPts.length > 5) {
      finishFH();
    } else {
      S.fhPts = [];
      status('Too short \u2014 drag further.');
      S.overlayDirty = true;
    }
  }

  if (S.dragPt && S.dragShape) {
    worker.postMessage({ type: 'calcArea', id: S.dragShape.id, points: S.dragShape.points, tabIdx: S.currentTabIdx });
    S.dragPt = null;
    S.dragShape = null;
    S.dragIdx = -1;
    S.overlayDirty = true;
    updatePanel();
    status('Point moved. Drag control points to edit shapes.');
    scheduleSave();
  }
}

oCvs.addEventListener('touchend', touchEnd, { passive: false });
oCvs.addEventListener('touchcancel', touchEnd, { passive: false });

// ---- Keyboard ----

$(document).on('keydown', function(e) {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;

  switch (e.key) {
    case ' ':
      if (!S.spaceHeld) {
        S.spaceHeld = true;
        $('body').addClass('cursor-grab');
      }
      e.preventDefault();
      break;

    case 'Escape':
      if (S.tool === 'squarecal') {
        fn.cancelSqCalib();
      } else if (S.perspActive) {
        fn.cancelPerspective();
      } else if (S.tool !== 'idle') {
        setTool('idle');
      } else {
        S.selId = null;
        S.overlayDirty = true;
        updatePanel();
      }
      break;

    case 'Enter':
      if (S.tool === 'squarecal' && S.polyPts.length === 4) {
        fn.applySqCalib();
        e.preventDefault();
      } else if (S.perspActive) {
        fn.applyPerspective();
        e.preventDefault();
      }
      break;

    case 'Delete':
    case 'Backspace':
      if (!S.perspActive && S.tool !== 'squarecal' && S.selId) delShape(S.selId);
      e.preventDefault();
      break;

    case '1': if (S.img && !S.perspActive && S.tool !== 'squarecal') setTool(S.tool === 'scale' ? 'idle' : 'scale'); break;
    case '2': if (S.img && !S.perspActive && S.tool !== 'squarecal') setTool(S.tool === 'polygon' ? 'idle' : 'polygon'); break;
    case '3': if (S.img && !S.perspActive && S.tool !== 'squarecal') setTool(S.tool === 'freehand' ? 'idle' : 'freehand'); break;
    case '4': if (S.img && !S.perspActive && S.tool !== 'squarecal') setTool(S.tool === 'edit' ? 'idle' : 'edit'); break;
    case '5':
      if (S.img && !S.perspActive && S.tool !== 'squarecal') fn.enterPerspective();
      break;

    case '=':
    case '+':
      if (S.img) zoomAt(1.2, S.cw / 2, S.ch / 2);
      break;

    case '-':
      if (S.img) zoomAt(1 / 1.2, S.cw / 2, S.ch / 2);
      break;

    case '0':
      if ((e.ctrlKey || e.metaKey) && S.img) {
        e.preventDefault();
        fitView();
      }
      break;
  }
});

$(document).on('keyup', function(e) {
  if (e.key === ' ') {
    S.spaceHeld = false;
    $('body').removeClass('cursor-grab cursor-grabbing');
    if (S.tool === 'scale' || S.tool === 'polygon' || S.tool === 'freehand') {
      $('body').addClass('cursor-crosshair');
    }
    if (S.tool === 'edit') {
      $('body').addClass('cursor-move');
    }
  }
});

// ---- File Dispatch ----

function dispatchFile(file) {
  if (!file) return;
  var name = file.name || '';
  var ext = name.split('.').pop().toLowerCase();
  if (ext === 'pdf' || file.type === 'application/pdf') {
    if (fn.loadPdf) fn.loadPdf(file);
  } else if (ext === 'arcalc') {
    if (fn.importProject) fn.importProject(file);
  } else if (file.type.indexOf('image/') === 0) {
    loadImg(file);
  }
}

// ---- File Input / Drag & Drop / Paste ----

$('#canvas-wrap')
  .on('dragover', function(e) {
    e.preventDefault();
    $('#dropzone').addClass('drag-over');
  })
  .on('dragleave drop', function(e) {
    e.preventDefault();
    $('#dropzone').removeClass('drag-over');
    if (e.type === 'drop') {
      var f = e.originalEvent.dataTransfer.files;
      if (f.length) dispatchFile(f[0]);
    }
  });

$(document).on('paste', function(e) {
  var items = e.originalEvent.clipboardData.items;
  for (var i = 0; i < items.length; i++) {
    if (items[i].type.indexOf('image/') === 0) {
      loadImg(items[i].getAsFile());
      return;
    }
  }
});

$('#btn-open').on('click', function() {
  $('#file-input').click();
});

$('#file-input').on('change', function() {
  if (this.files.length) dispatchFile(this.files[0]);
  this.value = '';
});

$(document).on('dragover drop', function(e) {
  e.preventDefault();
});

// ---- Toolbar Buttons ----

$('.tb-btn[data-tool]').on('click', function() {
  if (!S.img) return;
  var t = $(this).data('tool');
  setTool(S.tool === t ? 'idle' : t);
});

$('#btn-delete').on('click', function() {
  if (S.selId) delShape(S.selId);
});

$('#btn-clear').on('click', function() {
  if (!S.shapes.length) return;
  if (!confirm('Delete all ' + S.shapes.length + ' shape(s)?')) return;

  S.shapes = [];
  S.selId = null;
  S.colorIdx = 0;
  S.shapeN = 0;
  S.overlayDirty = true;
  updatePanel();
  status('Cleared all shapes');
  scheduleSave();
});

$('#btn-fit').on('click', function() {
  if (S.img) fitView();
});

// ---- Panel Toggles (shared logic) ----

function togglePanel(panelSel, $btn, collapseHtml, expandHtml) {
  var $p = $(panelSel);
  $p.toggleClass('collapsed');
  $btn.html($p.hasClass('collapsed') ? expandHtml : collapseHtml);
  setTimeout(function() { resize(); if (S.img) fitView(); }, 170);
}

$('#btn-toggle-panel').on('click', function() {
  togglePanel('#shapes-panel', $(this), '&raquo;', '&laquo;');
});

$('#btn-toggle-tabs').on('click', function() {
  togglePanel('#tab-bar', $(this), '&#9662; Tabs', '&#9656; Tabs');
});

// ---- Scale Popup ----

$('#scale-confirm').on('click', confirmScale);

$('#scale-value').on('keydown', function(e) {
  if (e.key === 'Enter') confirmScale();
  if (e.key === 'Escape') {
    cancelTool();
    setTool('idle');
  }
});

// ---- Perspective Buttons ----

$('#btn-persp').on('click', function() {
  if (!S.img) return;
  if (S.perspActive)          { fn.cancelPerspective(); return; }
  if (S.tool === 'squarecal') { fn.cancelSqCalib();    return; }
  fn.enterPerspective();
});
$('#persp-apply').on('click', function() { fn.applyPerspective(); });
$('#persp-cancel').on('click', function() { fn.cancelPerspective(); });
$('#persp-reset').on('click', function() { fn.resetPerspective(); });

// ---- Perspective Mode Tabs ----

$('.persp-tab').on('click', function() {
  fn.switchPerspMode($(this).data('persp-mode'));
});

// ---- Shapes Panel Events ----

$('#shapes-list').on('click', '.shape-item', function(e) {
  if ($(e.target).closest('.shape-del').length) return;

  S.selId = $(this).data('id');
  S.overlayDirty = true;
  updatePanel();

  var sh = findShape(S.selId);
  if (sh && sh.area != null) {
    status('Area: ' + fmtArea(sh.area) + ' | Perimeter: ' + fmtPerim(sh.perimeter));
  }
});

$('#shapes-list').on('click', '.shape-del', function(e) {
  e.stopPropagation();
  delShape($(this).data('id'));
});

// ---- Window Resize ----

$(window).on('resize', function() {
  resize();
  S.imageDirty = S.overlayDirty = true;
  if (S.perspActive) fn.updatePerspPreview();
});

// ---- Brightness / Contrast Sliders ----

function setSlider(name, val) {
  val = Math.max(-100, Math.min(100, Math.round(val)));

  if (name === 'bright') {
    S.brightness = val;
  } else {
    S.contrast = val;
  }

  var $grp = $('.sl-group [data-slider="' + name + '"]').closest('.sl-group');
  var pct = (val + 100) / 200;

  $grp.find('.sl-thumb').css('left', (pct * 100) + '%');

  var $fill = $grp.find('.sl-fill');
  if (val >= 0) {
    $fill.css({ left: '50%', width: (pct * 100 - 50) + '%' });
  } else {
    $fill.css({ left: (pct * 100) + '%', width: (50 - pct * 100) + '%' });
  }

  $grp.find('.sl-val').val(val);

  updateFilters();
}

$('.sl-track').each(function() {
  var $track = $(this);
  var name = $track.data('slider');
  var dragging = false;

  function update(e) {
    var r = $track[0].getBoundingClientRect();
    var pct = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
    var val = Math.round(pct * 200 - 100);

    if (Math.abs(val) < 6) val = 0;

    setSlider(name, val);
  }

  $track.on('mousedown', function(e) {
    dragging = true;
    update(e);
    e.preventDefault();
  });

  $(document).on('mousemove', function(e) {
    if (dragging) update(e);
  });

  $(document).on('mouseup', function() {
    dragging = false;
  });

  $track.on('dblclick', function() {
    setSlider(name, 0);
  });
});

$('.sl-val').each(function() {
  var $inp = $(this);
  var name = $inp.data('slider');
  var startY = 0, startVal = 0, dragging = false, hasMoved = false;

  $inp.on('change', function() {
    setSlider(name, +this.value);
  });

  $inp.on('mousedown', function(e) {
    if (document.activeElement === this) return;

    startY = e.clientY;
    startVal = +this.value;
    dragging = true;
    hasMoved = false;
    $('body').css('cursor', 'ns-resize');
  });

  $(document).on('mousemove', function(e) {
    if (!dragging) return;

    var dy = startY - e.clientY;

    if (!hasMoved && Math.abs(dy) > 4) {
      hasMoved = true;
      $inp.blur();
    }

    if (hasMoved) {
      var delta = Math.round(dy / 2);
      setSlider(name, startVal + delta);
    }
  });

  $(document).on('mouseup', function(e) {
    if (!dragging) return;

    if (!hasMoved) {
      $inp[0].focus();
      $inp[0].select();
    }

    dragging = false;
    hasMoved = false;
    $('body').css('cursor', '');
  });

  $inp.on('dblclick', function() {
    setSlider(name, 0);
  });
});

// ---- Tab Bar Events ----

$(document).on('click', '.tab-item', function(e) {
  if ($(e.target).hasClass('tab-close') || $(e.target).closest('.tab-close').length) return;
  var idx = parseInt($(this).data('idx'), 10);
  if (idx !== S.currentTabIdx && fn.switchToTab) fn.switchToTab(idx);
});

$(document).on('click', '.tab-close', function(e) {
  e.stopPropagation();
  var idx = parseInt($(this).data('idx'), 10);
  if (fn.closeTab) fn.closeTab(idx);
});

$(document).on('click', '#btn-new-tab', function() {
  if (fn.createTab && fn.switchToTab) {
    var idx = fn.createTab('Untitled', null, null);
    fn.switchToTab(idx);
  }
});

// ---- Export Buttons ----

$('#btn-export-project').on('click', function() {
  if (fn.exportProject) fn.exportProject();
});

$('#btn-export-measurements').on('click', function() {
  if (fn.exportMeasurements) fn.exportMeasurements();
});

// Initialize sliders
setSlider('bright', 0);
setSlider('contrast', 0);
