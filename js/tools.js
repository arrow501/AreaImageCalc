import { S, worker, imgWorker } from './state.js';
import { findShape, nextColor, s2i, i2s, fmtArea, fmtPerim, distSeg, pip } from './geometry.js';
import { scheduleSave } from './storage.js';
import { createTab, switchToTab, renderTabBar } from './tabs.js';
import { cancelPerspective } from './perspective.js';
import { cancelSqCalib } from './squareCalib.js';
import { cancelTool, setTool, status, enableTools, fitView, updateZoomDisp, updateScaleDisp, updatePanel, updateFilters } from './ui.js';

// Worker message handler
worker.onmessage = function(e) {
  var d = e.data, shape;

  if (d.type === 'areaResult') {
    if (d.tabIdx !== undefined && d.tabIdx !== S.currentTabIdx) {
      // Result for a background tab — store directly
      var tab = S.tabs[d.tabIdx];
      if (tab) {
        var bgShape = tab.shapes.find(function(s) { return s.id === d.id; });
        if (bgShape) { bgShape.area = d.area; bgShape.perimeter = d.perimeter; }
      }
      return;
    }
    shape = findShape(d.id);
    if (shape) {
      shape.area = d.area;
      shape.perimeter = d.perimeter;
      S.overlayDirty = true;
      updatePanel();
    }
  }
  else if (d.type === 'simplifyResult') {
    if (d.tabIdx !== undefined && d.tabIdx !== S.currentTabIdx) {
      var tab2 = S.tabs[d.tabIdx];
      if (tab2) {
        var bgShape2 = tab2.shapes.find(function(s) { return s.id === d.id; });
        if (bgShape2) {
          bgShape2.points = d.points;
          worker.postMessage({ type: 'calcArea', id: bgShape2.id, points: bgShape2.points, tabIdx: d.tabIdx });
        }
      }
      return;
    }
    shape = findShape(d.id);
    if (shape) {
      shape.points = d.points;
      worker.postMessage({ type: 'calcArea', id: shape.id, points: shape.points, tabIdx: S.currentTabIdx });
      S.overlayDirty = true;
    }
  }
};

// ---- Image Worker (WebP encoding) ----

function tabForId(id) {
  return S.tabs.find(function(t) { return t.tabId === id; });
}

function bufferToDataUrl(buffer, mime) {
  var bytes = new Uint8Array(buffer);
  var chunks = [];
  var CHUNK = 0x8000;
  for (var i = 0; i < bytes.length; i += CHUNK) {
    chunks.push(String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK)));
  }
  return 'data:' + mime + ';base64,' + btoa(chunks.join(''));
}

imgWorker.onmessage = function(e) {
  var d = e.data;
  var tab = tabForId(d.id);

  if (d.type === 'webpResult') {
    if (!tab) return;
    tab.imgWebpUrl = bufferToDataUrl(d.buffer, 'image/webp');
    tab.webpPending = false;
    scheduleSave();

  } else if (d.type === 'webpError') {
    if (!tab) return;
    tab.webpPending = false;
    // OffscreenCanvas not supported — fall back to main-thread canvas encode, only on this signal
    if (d.fallback && tab.img) {
      var fbCvs = document.createElement('canvas');
      fbCvs.width = tab.img.naturalWidth;
      fbCvs.height = tab.img.naturalHeight;
      fbCvs.getContext('2d').drawImage(tab.img, 0, 0);
      var webpUrl = fbCvs.toDataURL('image/webp', 0.35);
      // Only store if the browser actually produced WebP (not a PNG fallback)
      if (webpUrl.startsWith('data:image/webp')) {
        tab.imgWebpUrl = webpUrl;
        scheduleSave();
      }
    }
  }
};

// ---- Image Loading ----

export function loadImg(file, skipConfirm) {
  if (!file || file.type.indexOf('image/') !== 0) return;

  // Track B: start decoding the bitmap immediately (runs in parallel with FileReader)
  var bitmapPromise = (typeof createImageBitmap === 'function')
    ? createImageBitmap(file).catch(function() { return null; })
    : Promise.resolve(null);

  // Track A: load as data URL for immediate canvas display
  var reader = new FileReader();
  reader.onload = function(e) {
    var dataUrl = e.target.result;
    var ni = new Image();

    ni.onload = function() {
      var tab;
      if (S.img) {
        // Current tab has an image — open in a new tab
        var idx = createTab(file.name || 'Image', dataUrl, ni);
        switchToTab(idx);
        tab = S.tabs[idx];
      } else {
        // Load into current (blank) tab
        _loadIntoCurrentTab(ni, dataUrl, file.name);
        tab = S.tabs[S.currentTabIdx];
      }

      // Kick off background WebP encode once we know which tab this image belongs to
      if (tab) {
        tab.webpPending = true;
        bitmapPromise.then(function(bitmap) {
          if (!bitmap) { tab.webpPending = false; return; }
          imgWorker.postMessage({ type: 'encodeWebP', id: tab.tabId, bitmap: bitmap }, [bitmap]);
        });
      }
    };

    ni.src = dataUrl;
  };

  reader.readAsDataURL(file);
}

function _loadIntoCurrentTab(ni, dataUrl, filename) {
  if (S.perspActive) cancelPerspective();
  if (S.tool === 'squarecal') cancelSqCalib();

  S.img = ni;
  S.view.iw = ni.naturalWidth;
  S.view.ih = ni.naturalHeight;
  S.FH_MIN_DIST = Math.max(1, Math.log2(S.view.iw + S.view.ih) - 8.5);
  S.imgDataUrl = dataUrl;

  // Update current tab metadata
  if (S.currentTabIdx >= 0 && S.tabs[S.currentTabIdx]) {
    S.tabs[S.currentTabIdx].label = filename || 'Image';
    S.tabs[S.currentTabIdx].img = ni;
    S.tabs[S.currentTabIdx].imgDataUrl = dataUrl;
  }

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
  renderTabBar();
  scheduleSave();
}

// ---- View Control ----

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
  if (S.perspActive) $(document).trigger('view:change');
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
      worker.postMessage({ type: 'calcArea', id: S.shapes[i].id, points: S.shapes[i].points, tabIdx: S.currentTabIdx });
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

  worker.postMessage({ type: 'calcArea', id: id, points: S.shapes[S.shapes.length - 1].points, tabIdx: S.currentTabIdx });
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
  worker.postMessage({ type: 'simplify', id: id, points: pts, epsilon: eps, tabIdx: S.currentTabIdx });

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

// ---- Image Rotation ----

export function rotateImage(angleDeg) {
  if (!S.img || angleDeg === 0) return;

  var rad = angleDeg * Math.PI / 180;
  var cos_t = Math.cos(rad);
  var sin_t = Math.sin(rad);
  var abs_cos = Math.abs(cos_t);
  var abs_sin = Math.abs(sin_t);

  var old_w = S.view.iw;
  var old_h = S.view.ih;
  var new_w = Math.round(old_w * abs_cos + old_h * abs_sin);
  var new_h = Math.round(old_w * abs_sin + old_h * abs_cos);

  // Draw the rotated image onto a new canvas
  var cvs = document.createElement('canvas');
  cvs.width = new_w;
  cvs.height = new_h;
  var ctx = cvs.getContext('2d');
  ctx.translate(new_w / 2, new_h / 2);
  ctx.rotate(rad);
  ctx.drawImage(S.img, -old_w / 2, -old_h / 2);

  // Forward transform: old image coords → new image coords (matches canvas rendering)
  function transformPt(p) {
    var dx = p.x - old_w / 2;
    var dy = p.y - old_h / 2;
    return {
      x: dx * cos_t - dy * sin_t + new_w / 2,
      y: dx * sin_t + dy * cos_t + new_h / 2
    };
  }

  // Transform all shape points
  for (var si = 0; si < S.shapes.length; si++) {
    var shape = S.shapes[si];
    shape.points = shape.points.map(transformPt);
    if (shape.closed) {
      worker.postMessage({ type: 'calcArea', id: shape.id, points: shape.points, tabIdx: S.currentTabIdx });
    }
  }

  // Transform scale line (rotation preserves distances, so scalePPU stays the same)
  if (S.scaleLine) {
    S.scaleLine.p1 = transformPt(S.scaleLine.p1);
    S.scaleLine.p2 = transformPt(S.scaleLine.p2);
  }

  // Load updated image
  var dataUrl = cvs.toDataURL('image/png');
  var newImg = new Image();
  newImg.onload = function() {
    S.img = newImg;
    S.view.iw = new_w;
    S.view.ih = new_h;
    S.imgDataUrl = dataUrl;
    S.FH_MIN_DIST = Math.max(1, Math.log2(new_w + new_h) - 8.5);

    S.imageDirty = S.overlayDirty = true;
    fitView();
    updatePanel();

    // Clear stale pre-rotation WebP and re-encode the rotated image.
    // Without this, serializeTab() would save the old WebP while shapes
    // are already in post-rotation coordinates, corrupting reloaded state.
    var tab = S.tabs[S.currentTabIdx];
    if (tab) {
      tab.imgWebpUrl = null;
      tab.webpPending = true;
      if (typeof createImageBitmap === 'function') {
        createImageBitmap(cvs).then(function(bitmap) {
          imgWorker.postMessage({ type: 'encodeWebP', id: tab.tabId, bitmap: bitmap }, [bitmap]);
        }).catch(function() { tab.webpPending = false; });
      } else {
        tab.webpPending = false;
      }
    }

    scheduleSave();

    var absDeg = Math.abs(angleDeg % 360);
    var dir = angleDeg > 0 ? 'CW' : 'CCW';
    status('Rotated ' + absDeg + '\u00b0 ' + dir + ' (' + new_w + '\u00d7' + new_h + ')');
  };
  newImg.src = dataUrl;
}
