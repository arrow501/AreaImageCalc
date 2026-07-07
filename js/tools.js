import { S, worker, imgWorker } from './state.js';
import { findShape, nextColor, s2i, i2s, fmtArea, fmtPerim, fmtLen, distSeg, pip, segmentLength } from './geometry.js';
import { encodeCanvas } from './canvasUtil.js';
import { scheduleSave } from './storage.js';
import { createTab, switchToTab, renderSidebar, getActiveTab } from './tabs.js';
import { cancelPerspective } from './perspective.js';
import { cancelSqCalib } from './squareCalib.js';
import { cancelTool, setTool, status, enableTools, fitView, updateZoomDisp, updateScaleDisp, updatePanel, updateFilters } from './ui.js';
import { recordHistory, clearHistory } from './history.js';
import { EVT, emit } from './events.js';

// Routes a worker shape result to either the active tab (shown) or a background
// tab (silent update). `apply(shape, isBg)` performs the actual mutation.
function routeShapeResult(d, apply) {
  const isBg = d.tabIdx !== undefined && d.tabIdx !== S.currentTabIdx;
  const tab = isBg ? S.tabs[d.tabIdx] : null;
  const shape = isBg
    ? (tab ? tab.shapes.find(function(s) { return s.id === d.id; }) : null)
    : findShape(d.id);
  if (shape) apply(shape, isBg);
}

worker.onmessage = function(e) {
  const d = e.data;

  if (d.type === 'areaResult') {
    routeShapeResult(d, function(shape, isBg) {
      shape.area = d.area;
      shape.perimeter = d.perimeter;
      if (!isBg) {
        S.overlayDirty = true;
        updatePanel();
      }
    });
  }
  else if (d.type === 'simplifyResult') {
    routeShapeResult(d, function(shape, isBg) {
      shape.points = d.points;
      shape._centroid = null;
      worker.postMessage({ type: 'calcArea', id: shape.id, points: shape.points, tabIdx: d.tabIdx });
      if (!isBg) S.overlayDirty = true;
    });
  }
};

// ---- Image Worker (WebP encoding) ----

function tabForId(id) {
  return S.tabs.find(function(t) { return t.tabId === id; });
}

function bufferToDataUrl(buffer, mime) {
  const bytes = new Uint8Array(buffer);
  const chunks = [];
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    chunks.push(String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK)));
  }
  return 'data:' + mime + ';base64,' + btoa(chunks.join(''));
}

imgWorker.onmessage = function(e) {
  const d = e.data;
  const tab = tabForId(d.id);

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
      const fbCvs = document.createElement('canvas');
      fbCvs.width = tab.img.naturalWidth;
      fbCvs.height = tab.img.naturalHeight;
      fbCvs.getContext('2d').drawImage(tab.img, 0, 0);
      const webpUrl = fbCvs.toDataURL('image/webp', 0.35);
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
  const bitmapPromise = (typeof createImageBitmap === 'function')
    ? createImageBitmap(file).catch(function() { return null; })
    : Promise.resolve(null);

  // Track A: load as data URL for immediate canvas display
  const reader = new FileReader();
  reader.onload = function(e) {
    const dataUrl = e.target.result;
    const ni = new Image();

    ni.onload = function() {
      let tab;
      if (S.img) {
        // Current tab has an image — open in a new tab
        const idx = createTab(file.name || 'Image', dataUrl, ni);
        switchToTab(idx);
        tab = S.tabs[idx];
      } else {
        // Load into current (blank) tab
        _loadIntoCurrentTab(ni, dataUrl, file.name);
        tab = getActiveTab();
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
  S.imgDataUrl = dataUrl;

  // Update current tab metadata
  const curTab = getActiveTab();
  if (curTab) {
    curTab.label = filename || 'Image';
    curTab.img = ni;
    curTab.imgDataUrl = dataUrl;
    curTab.baseImg = ni;
    curTab.baseRotation = 0;
  }

  fitView();

  S.shapes = [];
  S.selId = null;
  S.colorIdx = 0;
  S.shapeN = 0;
  S.scaleLine = null;
  S.scalePPU = 0;
  clearHistory(curTab);

  updateScaleDisp();
  setTool('idle');
  updatePanel();

  $('#dropzone').css('pointer-events', 'none').find('.dz-content').hide();
  enableTools(true);
  status('Image loaded (' + S.view.iw + '\u00d7' + S.view.ih + '). Pick a tool to begin.');
  renderSidebar();
  scheduleSave();
}

// ---- View Control ----

export function zoomAt(factor, sx, sy) {
  const ip = s2i(sx, sy);
  const oz = S.view.zoom;

  S.view.zoom = Math.max(0.05, Math.min(50, S.view.zoom * factor));
  if (S.view.zoom === oz) return;

  const ns = i2s(ip.x, ip.y);
  S.view.ox += sx - ns.x;
  S.view.oy += sy - ns.y;

  S.imageDirty = S.overlayDirty = true;
  updateZoomDisp();
  if (S.perspActive) emit(EVT.VIEW_CHANGE);
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

export function showScalePopup(prefillVal) {
  const mp = i2s((S.scaleP1.x + S.scaleP2.x) / 2, (S.scaleP1.y + S.scaleP2.y) / 2);
  const l = Math.min(Math.max(mp.x + 12, 10), S.cw - 250);
  const t = Math.min(Math.max(mp.y - 30, 10), S.ch - 60);

  $('#scale-popup').css({ left: l, top: t }).show();
  $('#scale-value').val(prefillVal != null ? prefillVal : '').focus().select();
  status('Enter real-world distance — drag the endpoints to fine-tune');
}

// Re-open the calibration popup on an already committed scale line so both
// the value and the endpoints can be corrected.
export function reopenScalePopup() {
  if (!S.scaleLine) return;
  setTool('scale');
  S.scaleP1 = { x: S.scaleLine.p1.x, y: S.scaleLine.p1.y };
  S.scaleP2 = { x: S.scaleLine.p2.x, y: S.scaleLine.p2.y };
  S.scaleState = 2;
  const px = Math.hypot(S.scaleP2.x - S.scaleP1.x, S.scaleP2.y - S.scaleP1.y);
  const val = S.scalePPU > 0 ? Math.round(px / S.scalePPU * 10000) / 10000 : null;
  $('#scale-unit').val(S.scaleUnit);
  showScalePopup(val);
  S.overlayDirty = true;
}

export function confirmScale() {
  const val = parseFloat($('#scale-value').val());
  const unit = $('#scale-unit').val();

  if (!val || val <= 0) {
    status('Enter a valid distance > 0');
    return;
  }

  const dx = S.scaleP2.x - S.scaleP1.x;
  const dy = S.scaleP2.y - S.scaleP1.y;
  const px = Math.sqrt(dx * dx + dy * dy);

  if (px < 1) {
    status('Points too close');
    cancelTool();
    setTool('idle');
    return;
  }

  recordHistory();
  S.scalePPU = px / val;
  S.scaleUnit = unit;
  S.scaleLine = {
    p1: { x: S.scaleP1.x, y: S.scaleP1.y },
    p2: { x: S.scaleP2.x, y: S.scaleP2.y }
  };

  cancelTool();
  setTool('idle');
  updateScaleDisp();

  for (let i = 0; i < S.shapes.length; i++) {
    if (S.shapes[i].type !== 'segment' && S.shapes[i].closed) {
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

  recordHistory();
  const id = 's' + (++S.shapeN);
  S.shapes.push({
    id: id,
    type: 'polygon',
    points: S.polyPts.slice(),
    closed: true,
    area: null,
    perimeter: null,
    color: nextColor(),
    name: 'Area ' + S.shapeN
  });

  S.selId = id;
  S.polyPts = [];

  worker.postMessage({ type: 'calcArea', id: id, points: S.shapes[S.shapes.length - 1].points, tabIdx: S.currentTabIdx });
  S.overlayDirty = true;
  updatePanel();
  status('Area added — keep clicking to draw another, or press Esc to finish.');
  scheduleSave();
}

export function finishFH() {
  recordHistory();
  const id = 's' + (++S.shapeN);
  const pts = S.fhPts.slice();
  S.fhPts = [];

  S.shapes.push({
    id: id,
    type: 'freehand',
    points: pts,
    closed: true,
    area: null,
    perimeter: null,
    color: nextColor(),
    name: 'Area ' + S.shapeN
  });

  S.selId = id;

  const eps = 2 / (S.view.zoom * S.view.fit);
  worker.postMessage({ type: 'simplify', id: id, points: pts, epsilon: eps, tabIdx: S.currentTabIdx });

  S.overlayDirty = true;
  updatePanel();
  status('Region added — drag to trace another, or press Esc to finish.');
  scheduleSave();
}

export function closeSegment() {
  if (S.polyPts.length < 2) return;

  recordHistory();
  const id = 's' + (++S.shapeN);
  const pts = S.polyPts.slice();

  S.shapes.push({
    id: id,
    type: 'segment',
    points: pts,
    closed: false,
    length: segmentLength(pts),
    area: null,
    perimeter: null,
    color: nextColor(),
    name: 'Distance ' + S.shapeN
  });

  S.selId = id;
  S.polyPts = [];
  S.overlayDirty = true;
  updatePanel();
  status('Distance added — keep clicking to measure another, or press Esc to finish.');
  scheduleSave();
}

export function renameShape(id, newName) {
  const sh = findShape(id);
  if (!sh) return;
  const name = newName.trim();
  if (!name || name === sh.name) return;
  recordHistory();
  sh.name = name;
  S.overlayDirty = true;
  updatePanel();
  scheduleSave();
}

export function hideShape(id) {
  const sh = findShape(id);
  if (!sh) return;
  sh.hidden = !sh.hidden;
  if (sh.hidden && S.selId === id) S.selId = null;
  S.overlayDirty = true;
  updatePanel();
  scheduleSave();
}

export function showAllShapes() {
  for (let i = 0; i < S.shapes.length; i++) {
    S.shapes[i].hidden = false;
  }
  S.overlayDirty = true;
  updatePanel();
  status('All shapes visible');
  scheduleSave();
}

function positionLabelPopup(sp) {
  const l = Math.min(Math.max(sp.x - 80, 10), S.cw - 260);
  const t = Math.min(Math.max(sp.y - 20, 10), S.ch - 60);
  $('#label-popup').css({ left: l, top: t }).show();
}

export function showLabelPopup(shapeId) {
  const sh = findShape(shapeId);
  if (!sh) return;
  S.labelShapeId = shapeId;
  S.pendingNotePt = null;
  const isNote = sh.type === 'note';
  const sp = i2s(
    sh.points.reduce(function(s, p) { return s + p.x; }, 0) / sh.points.length,
    sh.points.reduce(function(s, p) { return s + p.y; }, 0) / sh.points.length
  );
  positionLabelPopup(sp);
  $('#label-popup label').text(isNote ? 'Note text:' : 'Shape name:');
  $('#label-value').val(isNote ? (sh.text || '') : (sh.name || '')).focus().select();
}

// Note tool: the note is only created once its text is confirmed, so
// cancelling leaves no empty shape behind.
export function beginNoteAt(ip) {
  S.pendingNotePt = ip;
  S.labelShapeId = null;
  positionLabelPopup(i2s(ip.x, ip.y));
  $('#label-popup label').text('Note text:');
  $('#label-value').val('').focus();
  status('Type the note text and press Enter.');
}

export function confirmLabel() {
  const val = $('#label-value').val().trim();

  if (S.pendingNotePt) {
    if (val) {
      recordHistory();
      const id = 's' + (++S.shapeN);
      S.shapes.push({
        id: id,
        type: 'note',
        points: [S.pendingNotePt],
        closed: false,
        color: '#FFD740',
        name: 'Note ' + S.shapeN,
        text: val
      });
      S.selId = id;
      S.overlayDirty = true;
      updatePanel();
      status('Note added — click to pin another, or press Esc to finish.');
      scheduleSave();
    }
    S.pendingNotePt = null;
    $('#label-popup').hide();
    $('#label-value').blur();
    return;
  }

  if (S.labelShapeId && val) {
    const sh = findShape(S.labelShapeId);
    if (sh && sh.type === 'note') {
      if (val !== sh.text) {
        recordHistory();
        sh.text = val;
        S.overlayDirty = true;
        updatePanel();
        scheduleSave();
      }
    } else {
      renameShape(S.labelShapeId, val);
    }
  }
  S.labelShapeId = null;
  $('#label-popup').hide();
  $('#label-value').blur();
}

export function delShape(id) {
  if (!findShape(id)) return;
  recordHistory();
  S.shapes = S.shapes.filter(function(s) { return s.id !== id; });
  if (S.selId === id) S.selId = null;

  S.overlayDirty = true;
  updatePanel();
  status('Shape deleted — Ctrl+Z to undo');
  scheduleSave();
}

export function selectAt(ip) {
  let found = null;

  for (let i = S.shapes.length - 1; i >= 0; i--) {
    const sh = S.shapes[i];
    if (sh.hidden) continue;
    if (sh.closed && pip(ip, sh.points)) {
      found = sh.id;
      break;
    }
  }

  if (!found) {
    let best = Infinity;
    const thr = 15 / (S.view.zoom * S.view.fit);

    for (let i = 0; i < S.shapes.length; i++) {
      const sh = S.shapes[i];
      if (sh.hidden) continue;

      if (sh.type === 'note') {
        const d = Math.hypot(ip.x - sh.points[0].x, ip.y - sh.points[0].y);
        if (d < best) {
          best = d;
          found = sh.id;
        }
        continue;
      }

      const pts = sh.points;
      const edgeCount = sh.closed ? pts.length : pts.length - 1;

      for (let j = 0; j < edgeCount; j++) {
        const k = sh.closed ? (j + 1) % pts.length : j + 1;
        const d = distSeg(ip, pts[j], pts[k]);
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
    const sh = findShape(found);
    if (sh) {
      if (sh.type === 'segment') {
        status('Length: ' + fmtLen(sh.length));
      } else if (sh.type === 'note') {
        status('Note: ' + (sh.text || ''));
      } else if (sh.area != null) {
        status('Area: ' + fmtArea(sh.area) + ' | Perimeter: ' + fmtPerim(sh.perimeter));
      }
    }
  } else {
    status('Select a tool or click a shape');
  }
}

// ---- Image Rotation ----

// Rotation always recomposes from the tab's base image at the cumulative
// angle: repeated rotations neither accumulate resampling blur nor grow the
// canvas beyond the true rotated bounding box of the original.
export function rotateImage(angleDeg) {
  if (!S.img || angleDeg === 0) return;

  const tab = getActiveTab();
  if (tab && !tab.baseImg) {
    tab.baseImg = S.img;
    tab.baseRotation = 0;
  }
  const base = tab ? tab.baseImg : S.img;
  const oldRot = tab ? (tab.baseRotation || 0) : 0;
  const newRot = (oldRot + angleDeg) % 360;

  const bw = base.naturalWidth || base.width;
  const bh = base.naturalHeight || base.height;
  const newRad = newRot * Math.PI / 180;
  const new_w = Math.round(bw * Math.abs(Math.cos(newRad)) + bh * Math.abs(Math.sin(newRad)));
  const new_h = Math.round(bw * Math.abs(Math.sin(newRad)) + bh * Math.abs(Math.cos(newRad)));

  const old_w = S.view.iw;
  const old_h = S.view.ih;

  const cvs = document.createElement('canvas');
  cvs.width = new_w;
  cvs.height = new_h;
  const ctx = cvs.getContext('2d');
  ctx.translate(new_w / 2, new_h / 2);
  ctx.rotate(newRad);
  ctx.drawImage(base, -bw / 2, -bh / 2);

  // Geometry moves by the delta step: rotate about the old canvas centre,
  // then re-centre on the new canvas
  const rad = angleDeg * Math.PI / 180;
  const cos_t = Math.cos(rad);
  const sin_t = Math.sin(rad);

  function transformPt(p) {
    const dx = p.x - old_w / 2;
    const dy = p.y - old_h / 2;
    return {
      x: dx * cos_t - dy * sin_t + new_w / 2,
      y: dx * sin_t + dy * cos_t + new_h / 2
    };
  }

  // Transform all shape points
  for (let si = 0; si < S.shapes.length; si++) {
    const shape = S.shapes[si];
    shape.points = shape.points.map(transformPt);
    shape._centroid = null;
    if (shape.type === 'segment') {
      shape.length = segmentLength(shape.points);
    } else if (shape.closed) {
      worker.postMessage({ type: 'calcArea', id: shape.id, points: shape.points, tabIdx: S.currentTabIdx });
    }
  }

  // Transform scale line (rotation preserves distances, so scalePPU stays the same)
  if (S.scaleLine) {
    S.scaleLine.p1 = transformPt(S.scaleLine.p1);
    S.scaleLine.p2 = transformPt(S.scaleLine.p2);
  }

  // Load updated image
  const dataUrl = encodeCanvas(cvs);
  const newImg = new Image();
  newImg.onload = function() {
    S.img = newImg;
    S.view.iw = new_w;
    S.view.ih = new_h;
    S.imgDataUrl = dataUrl;
    if (tab) {
      tab.baseRotation = newRot;
      clearHistory(tab);
    }

    S.imageDirty = S.overlayDirty = true;
    fitView();
    updatePanel();

    // Clear stale pre-rotation WebP and re-encode the rotated image.
    // Without this, serializeTab() would save the old WebP while shapes
    // are already in post-rotation coordinates, corrupting reloaded state.
    const tab = getActiveTab();
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

    const absDeg = Math.abs(angleDeg % 360);
    const dir = angleDeg > 0 ? 'CW' : 'CCW';
    status('Rotated ' + absDeg + '\u00b0 ' + dir + ' (' + new_w + '\u00d7' + new_h + ')');
  };
  newImg.src = dataUrl;
}
