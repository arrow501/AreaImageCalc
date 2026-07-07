import { S, COLORS, worker, oCvs } from './state.js';
import { s2i, i2s, findShape, fmtArea, fmtPerim, fmtLen, segmentLength, distSeg, pip, hitHandle } from './geometry.js';
import { resize, refreshCanvasRect } from './render.js';
import {
  closePoly, closeSegment, finishFH, delShape, selectAt, hitsAt, translateShape,
  loadImg, zoomAt, setInteract, showScalePopup, confirmScale, reopenScalePopup,
  rotateImage, renameShape, hideShape, showAllShapes,
  showLabelPopup, confirmLabel, beginNoteAt,
  setShapeColor, setShapeGroup, existingGroups, reorderShape, setScaleFromArea
} from './tools.js';
import {
  setTool, cancelTool, fitView, updatePanel, updatePanelSelection, status, updateFilters, updateScaleDisp,
  setSlider, syncToolbarLabels, toggleGroupCollapsed
} from './ui.js';
import { recordHistory, undo, redo } from './history.js';
import { scheduleSave } from './storage.js';
import { enterPerspective, cancelPerspective, applyPerspective, resetPerspective, findPerspHandle } from './perspective.js';
import { enterSqCalib, cancelSqCalib, applySqCalib, onSqCalibPoint, switchPerspMode } from './squareCalib.js';
import { createTab, switchToTab, closeTab, closeDoc, toggleDocCollapsed, navPage } from './tabs.js';
import { loadPdf } from './pdf.js';
import { exportProject, importProject, exportMeasurements, exportMeasurementsCsv } from './export.js';
import { EVT, emit, on } from './events.js';

// Sidebar reveal/collapse animates width; re-fit once the transition settles
on(EVT.LAYOUT_CHANGE, function() {
  setTimeout(function() {
    resize();
    if (S.img) fitView();
  }, 170);
});

// ---- Coordinate Helpers ----

function canvasXY(e) {
  S.mx = e.clientX - S.canvasRect.left;
  S.my = e.clientY - S.canvasRect.top;
  const ip = s2i(S.mx, S.my);
  S.mix = ip.x;
  S.miy = ip.y;
}

function touchXY(touch) {
  S.mx = touch.clientX - S.canvasRect.left;
  S.my = touch.clientY - S.canvasRect.top;
  const ip = s2i(S.mx, S.my);
  S.mix = ip.x;
  S.miy = ip.y;
}

function findTouch(touches, id) {
  for (let i = 0; i < touches.length; i++) {
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
    const hi = findPerspHandle(S.mx, S.my);
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

  const ip = { x: S.mix, y: S.miy };

  switch (S.tool) {
    case 'squarecal':
      if (S.polyPts.length === 4) {
        // Click a corner's grab ring → start dragging it
        const h = hitHandle(S.mx, S.my);
        S.dragIdx = h && h.kind === 'sqcal' ? h.idx : -1;
      } else {
        S.polyPts.push(ip);
        S.overlayDirty = true;
        onSqCalibPoint();
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
      } else if (S.scaleState === 2) {
        const h = hitHandle(S.mx, S.my);
        if (h && h.kind === 'scalePt') {
          S.dragScaleIdx = h.idx;
          oCvs.style.cursor = 'grabbing';
        }
      }
      S.overlayDirty = true;
      break;

    case 'polygon':
      if (S.polyPts.length >= 3) {
        const fp = i2s(S.polyPts[0].x, S.polyPts[0].y);
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
      S.overlayDirty = true;
      break;

    case 'segment':
      S.polyPts.push(ip);
      S.overlayDirty = true;
      break;

    case 'edit': {
      const h = hitHandle(S.mx, S.my);
      if (h && h.kind === 'shape') {
        const shp = findShape(h.shapeId);
        if (!shp) break;
        recordHistory();
        S.dragShape = shp;
        S.dragIdx = h.idx;
        S.dragPt = { x: shp.points[h.idx].x, y: shp.points[h.idx].y };
        S.selId = shp.id;
        oCvs.style.cursor = 'grabbing';
        S.overlayDirty = true;
        updatePanel();
        status('Drag to move point');
      } else if (h && h.kind === 'scale') {
        recordHistory();
        S.dragScaleIdx = h.idx;
        S.dragScaleReal = S.scalePPU > 0
          ? Math.hypot(S.scaleLine.p2.x - S.scaleLine.p1.x, S.scaleLine.p2.y - S.scaleLine.p1.y) / S.scalePPU
          : 0;
        oCvs.style.cursor = 'grabbing';
        S.overlayDirty = true;
        status('Drag to adjust the scale line — the entered distance is kept');
      }
      break;
    }

    case 'move':
      startMoveDrag(ip);
      break;

    case 'note':
      beginNoteAt(ip);
      break;

    case 'label': {
      let clickedId = null;
      for (let li = S.shapes.length - 1; li >= 0; li--) {
        const lsh = S.shapes[li];
        if (!lsh.hidden && lsh.closed && pip(ip, lsh.points)) { clickedId = lsh.id; break; }
      }
      if (!clickedId) {
        const lthr = 15 / (S.view.zoom * S.view.fit);
        let lbest = Infinity;
        for (let li = 0; li < S.shapes.length; li++) {
          const lsh = S.shapes[li];
          if (lsh.hidden) continue;
          if (lsh.type === 'note') {
            const ld = Math.hypot(ip.x - lsh.points[0].x, ip.y - lsh.points[0].y);
            if (ld < lbest) { lbest = ld; clickedId = lsh.id; }
            continue;
          }
          const lpts = lsh.points;
          const ledge = lsh.closed ? lpts.length : lpts.length - 1;
          for (let lj = 0; lj < ledge; lj++) {
            const lk = lsh.closed ? (lj + 1) % lpts.length : lj + 1;
            const ld = distSeg(ip, lpts[lj], lpts[lk]);
            if (ld < lbest) { lbest = ld; clickedId = lsh.id; }
          }
        }
        if (lbest > lthr) clickedId = null;
      }
      if (clickedId) showLabelPopup(clickedId);
      break;
    }

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
    if (S.perspActive) emit(EVT.VIEW_CHANGE);
    setInteract();
    return;
  }

  if (S.perspActive && S.perspDragIdx >= 0) {
    S.perspCorners[S.perspDragIdx] = { x: S.mix + S.perspDragOffset.x, y: S.miy + S.perspDragOffset.y };
    emit(EVT.VIEW_CHANGE);
    S.overlayDirty = true;
    return;
  }

  if (S.perspActive) {
    const hi = findPerspHandle(S.mx, S.my);
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
      oCvs.style.cursor = hitHandle(S.mx, S.my) ? 'grab' : '';
    }
    S.overlayDirty = true;
    return;
  }

  if (S.isFH) {
    sampleFreehand();
    return;
  }

  if (S.dragScaleIdx >= 0) {
    moveScaleHandle();
    return;
  }

  if (S.moveShape) {
    dragMoveShape();
    return;
  }

  if (S.dragPt && S.dragShape) {
    S.dragPt.x = S.mix;
    S.dragPt.y = S.miy;
    S.dragShape.points[S.dragIdx] = { x: S.mix, y: S.miy };
    S.overlayDirty = true;
    return;
  }

  if (S.tool === 'edit') {
    oCvs.style.cursor = hitHandle(S.mx, S.my) ? 'grab' : '';
    S.overlayDirty = true;
  }
  if (S.tool === 'move') {
    oCvs.style.cursor = hitsAt({ x: S.mix, y: S.miy }).length ? 'grab' : '';
  }
  if (S.tool === 'scale' && S.scaleState === 2) {
    oCvs.style.cursor = hitHandle(S.mx, S.my) ? 'grab' : '';
    S.overlayDirty = true;
  }

  if (S.tool === 'polygon' && S.polyPts.length > 0) S.overlayDirty = true;
  if (S.tool === 'segment' && S.polyPts.length > 0) S.overlayDirty = true;
  if (S.tool === 'scale' && S.scaleState === 1) S.overlayDirty = true;
});

function startMoveDrag(ip) {
  const hits = hitsAt(ip);
  if (!hits.length) {
    S.selId = null;
    updatePanel();
    S.overlayDirty = true;
    return;
  }
  const id = hits.indexOf(S.selId) >= 0 ? S.selId : hits[0];
  const sh = findShape(id);
  if (!sh) return;
  recordHistory();
  S.selId = id;
  S.moveShape = sh;
  S.moveLast = { x: ip.x, y: ip.y };
  oCvs.style.cursor = 'grabbing';
  updatePanelSelection();
  S.overlayDirty = true;
}

function dragMoveShape() {
  const dx = S.mix - S.moveLast.x;
  const dy = S.miy - S.moveLast.y;
  if (dx || dy) {
    translateShape(S.moveShape, dx, dy);
    S.moveLast = { x: S.mix, y: S.miy };
    S.overlayDirty = true;
  }
}

function endMoveDrag() {
  S.moveShape = null;
  S.moveLast = null;
  oCvs.style.cursor = '';
  S.overlayDirty = true;
  status('Shape moved — Ctrl+Z to undo.');
  scheduleSave();
}

// Arrow-key nudging records one history entry per burst, not per keypress
let _lastNudgeTs = 0;

function nudgeSelected(key, big) {
  const sh = findShape(S.selId);
  if (!sh) return;
  const step = (big ? 10 : 1) / (S.view.zoom * S.view.fit);
  const dx = key === 'ArrowLeft' ? -step : key === 'ArrowRight' ? step : 0;
  const dy = key === 'ArrowUp' ? -step : key === 'ArrowDown' ? step : 0;
  const now = Date.now();
  if (now - _lastNudgeTs > 1000) recordHistory();
  _lastNudgeTs = now;
  translateShape(sh, dx, dy);
  S.overlayDirty = true;
  scheduleSave();
}

// Freehand sampling: fixed screen-space step, so trace detail follows what
// the user actually sees regardless of zoom or pointer speed.
function sampleFreehand() {
  const last = S.fhPts[S.fhPts.length - 1];
  const scale = S.view.zoom * S.view.fit;
  if (Math.hypot(S.mix - last.x, S.miy - last.y) * scale >= 2) {
    S.fhPts.push({ x: S.mix, y: S.miy });
    S.overlayDirty = true;
  }
}

function moveScaleHandle() {
  const p = { x: S.mix, y: S.miy };
  if (S.tool === 'scale') {
    if (S.dragScaleIdx === 0) S.scaleP1 = p;
    else S.scaleP2 = p;
  } else if (S.scaleLine) {
    if (S.dragScaleIdx === 0) S.scaleLine.p1 = p;
    else S.scaleLine.p2 = p;
    if (S.dragScaleReal > 0) {
      const px = Math.hypot(S.scaleLine.p2.x - S.scaleLine.p1.x, S.scaleLine.p2.y - S.scaleLine.p1.y);
      if (px > 1e-6) {
        S.scalePPU = px / S.dragScaleReal;
        updateScaleDisp();
      }
    }
  }
  S.overlayDirty = true;
}

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

  if (S.dragScaleIdx >= 0) {
    const committed = S.tool === 'edit';
    S.dragScaleIdx = -1;
    S.dragScaleReal = 0;
    oCvs.style.cursor = '';
    S.overlayDirty = true;
    if (committed) {
      updatePanel();
      status('Scale line adjusted.');
      scheduleSave();
    }
    return;
  }

  if (S.moveShape) {
    endMoveDrag();
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
    if (S.dragShape.type === 'segment') {
      S.dragShape.length = segmentLength(S.dragShape.points);
    } else if (S.dragShape.type !== 'note') {
      S.dragShape._centroid = null;
      worker.postMessage({ type: 'calcArea', id: S.dragShape.id, points: S.dragShape.points, tabIdx: S.currentTabIdx });
    }
    S.dragPt = null;
    S.dragShape = null;
    S.dragIdx = -1;
    oCvs.style.cursor = '';
    S.overlayDirty = true;
    updatePanel();
    status('Point moved \u2014 Ctrl+Z to undo.');
    scheduleSave();
  }
});

$(oCvs).on('dblclick', function(e) {
  canvasXY(e);
  if (S.tool === 'polygon' && S.polyPts.length >= 3) {
    S.polyPts.pop();
    closePoly();
    return;
  }
  if (S.tool === 'segment' && S.polyPts.length >= 2) {
    S.polyPts.pop();
    closeSegment();
    return;
  }
  if (S.tool === 'idle' || S.tool === 'edit') {
    const thr = 12 / (S.view.zoom * S.view.fit);

    // Double-click a note pin to edit its text
    for (let i = S.shapes.length - 1; i >= 0; i--) {
      const sh = S.shapes[i];
      if (sh.hidden || sh.type !== 'note') continue;
      if (Math.hypot(S.mix - sh.points[0].x, S.miy - sh.points[0].y) <= thr) {
        showLabelPopup(sh.id);
        return;
      }
    }

    // Double-click the committed scale line to re-calibrate it
    if (S.scaleLine && S.scalePPU > 0 &&
        distSeg({ x: S.mix, y: S.miy }, S.scaleLine.p1, S.scaleLine.p2) <= thr) {
      reopenScalePopup();
    }
  }
});

oCvs.addEventListener('wheel', function(e) {
  e.preventDefault();
  if (!S.img) return;

  const r = oCvs.getBoundingClientRect();
  const sx = e.clientX - r.left;
  const sy = e.clientY - r.top;
  const d = e.ctrlKey ? -e.deltaY * 3 : -e.deltaY;

  zoomAt(d > 0 ? 1.1 : 1 / 1.1, sx, sy);
}, { passive: false });

$(oCvs).on('contextmenu', function(e) {
  e.preventDefault();
  // Right-click finishes an in-progress path; otherwise clears it
  if (S.tool === 'polygon' && S.polyPts.length >= 3) { closePoly(); return; }
  if (S.tool === 'segment' && S.polyPts.length >= 2) { closeSegment(); return; }
  if (S.tool !== 'idle') {
    cancelTool();
    setTool(S.tool);
  }
});

// ---- Touch Handling ----

oCvs.addEventListener('touchstart', function(e) {
  e.preventDefault();

  const touches = e.touches;

  if (touches.length >= 2) {
    if (S.isFH) { S.isFH = false; S.fhPts = []; S.overlayDirty = true; }
    if (S.dragPt && S.dragShape) {
      S.dragPt = null; S.dragShape = null; S.dragIdx = -1;
      S.overlayDirty = true;
    }
    if (S.dragScaleIdx >= 0) {
      S.dragScaleIdx = -1;
      S.dragScaleReal = 0;
      S.overlayDirty = true;
    }
    if (S.moveShape) {
      S.moveShape = null;
      S.moveLast = null;
      S.overlayDirty = true;
    }
    S.touchId = null;
    S.touchIsPan = true;

    const t0 = touches[0], t1 = touches[1];
    const r = oCvs.getBoundingClientRect();
    const mx0 = t0.clientX - r.left, my0 = t0.clientY - r.top;
    const mx1 = t1.clientX - r.left, my1 = t1.clientY - r.top;

    S.touchPinchDist = Math.hypot(mx1 - mx0, my1 - my0);
    S.touchPinchMid = { x: (mx0 + mx1) / 2, y: (my0 + my1) / 2 };
    S.touchPanSt = { x: S.touchPinchMid.x, y: S.touchPinchMid.y, ox: S.view.ox, oy: S.view.oy };
    return;
  }

  if (S.touchId !== null) return;

  const touch = touches[0];
  S.touchId = touch.identifier;
  touchXY(touch);

  if (!S.img) return;

  if (S.perspActive) {
    const hi = findPerspHandle(S.mx, S.my);
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

  const ip = { x: S.mix, y: S.miy };

  switch (S.tool) {
    case 'squarecal':
      if (S.polyPts.length === 4) {
        const h = hitHandle(S.mx, S.my, 20);
        S.dragIdx = h && h.kind === 'sqcal' ? h.idx : -1;
      } else {
        S.polyPts.push(ip);
        S.overlayDirty = true;
        onSqCalibPoint();
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
      } else if (S.scaleState === 2) {
        const ht = hitHandle(S.mx, S.my, 20);
        if (ht && ht.kind === 'scalePt') S.dragScaleIdx = ht.idx;
      }
      S.overlayDirty = true;
      break;

    case 'polygon':
      if (S.polyPts.length >= 3) {
        const fp = i2s(S.polyPts[0].x, S.polyPts[0].y);
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
      S.overlayDirty = true;
      break;

    case 'segment':
      S.polyPts.push(ip);
      S.overlayDirty = true;
      break;

    case 'edit': {
      const h = hitHandle(S.mx, S.my, 20);
      if (h && h.kind === 'shape') {
        const shp = findShape(h.shapeId);
        if (!shp) break;
        recordHistory();
        S.dragShape = shp;
        S.dragIdx = h.idx;
        S.dragPt = { x: shp.points[h.idx].x, y: shp.points[h.idx].y };
        S.selId = shp.id;
        S.overlayDirty = true;
        updatePanel();
        status('Drag to move point');
      } else if (h && h.kind === 'scale') {
        recordHistory();
        S.dragScaleIdx = h.idx;
        S.dragScaleReal = S.scalePPU > 0
          ? Math.hypot(S.scaleLine.p2.x - S.scaleLine.p1.x, S.scaleLine.p2.y - S.scaleLine.p1.y) / S.scalePPU
          : 0;
        S.overlayDirty = true;
        status('Drag to adjust the scale line');
      }
      break;
    }

    case 'move':
      startMoveDrag(ip);
      break;

    case 'note':
      beginNoteAt(ip);
      break;

    case 'idle':
      selectAt(ip);
      break;
  }
}, { passive: false });

oCvs.addEventListener('touchmove', function(e) {
  e.preventDefault();

  const touches = e.touches;

  if (S.touchIsPan && touches.length >= 2) {
    const t0 = touches[0], t1 = touches[1];
    const r = oCvs.getBoundingClientRect();
    const mx0 = t0.clientX - r.left, my0 = t0.clientY - r.top;
    const mx1 = t1.clientX - r.left, my1 = t1.clientY - r.top;

    const newDist = Math.hypot(mx1 - mx0, my1 - my0);
    const newMid = { x: (mx0 + mx1) / 2, y: (my0 + my1) / 2 };

    if (S.touchPinchDist > 0) {
      const factor = newDist / S.touchPinchDist;
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
    if (S.perspActive) emit(EVT.VIEW_CHANGE);
    setInteract();
    return;
  }

  if (S.touchId === null) return;
  const touch = findTouch(touches, S.touchId);
  if (!touch) return;

  touchXY(touch);

  if (S.perspActive && S.perspDragIdx >= 0) {
    S.perspCorners[S.perspDragIdx] = { x: S.mix + S.perspDragOffset.x, y: S.miy + S.perspDragOffset.y };
    emit(EVT.VIEW_CHANGE);
    S.overlayDirty = true;
    return;
  }

  if (S.isFH) {
    sampleFreehand();
    return;
  }

  if (S.dragScaleIdx >= 0) {
    moveScaleHandle();
    return;
  }

  if (S.moveShape) {
    dragMoveShape();
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
  if (S.tool === 'segment' && S.polyPts.length > 0) S.overlayDirty = true;
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
  const found = findTouch(e.touches, S.touchId);
  if (found) return;

  S.touchId = null;

  if (S.perspActive && S.perspDragIdx >= 0) {
    S.perspDragIdx = -1;
    S.perspDragOffset = null;
    S.overlayDirty = true;
    return;
  }

  if (S.dragScaleIdx >= 0) {
    const committed = S.tool === 'edit';
    S.dragScaleIdx = -1;
    S.dragScaleReal = 0;
    S.overlayDirty = true;
    if (committed) {
      updatePanel();
      status('Scale line adjusted.');
      scheduleSave();
    }
    return;
  }

  if (S.moveShape) {
    endMoveDrag();
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
    if (S.dragShape.type === 'segment') {
      S.dragShape.length = segmentLength(S.dragShape.points);
    } else if (S.dragShape.type !== 'note') {
      S.dragShape._centroid = null;
      worker.postMessage({ type: 'calcArea', id: S.dragShape.id, points: S.dragShape.points, tabIdx: S.currentTabIdx });
    }
    S.dragPt = null;
    S.dragShape = null;
    S.dragIdx = -1;
    S.overlayDirty = true;
    updatePanel();
    status('Point moved \u2014 Ctrl+Z to undo.');
    scheduleSave();
  }
}

oCvs.addEventListener('touchend', touchEnd, { passive: false });
oCvs.addEventListener('touchcancel', touchEnd, { passive: false });

// ---- Keyboard ----

$(document).on('keydown', function(e) {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;

  // Ctrl/Cmd shortcuts — never let plain letters below double as tool toggles
  if (e.ctrlKey || e.metaKey) {
    const k = e.key.toLowerCase();
    if (k === 'z' && !e.shiftKey) {
      e.preventDefault();
      if ((S.tool === 'polygon' || S.tool === 'segment') && S.polyPts.length > 0) {
        S.polyPts.pop();
        S.overlayDirty = true;
      } else if (!S.perspActive && S.tool !== 'squarecal') {
        undo();
      }
    } else if (k === 'y' || (k === 'z' && e.shiftKey)) {
      e.preventDefault();
      if (!S.perspActive && S.tool !== 'squarecal') redo();
    } else if (k === '0' && S.img) {
      e.preventDefault();
      fitView();
    }
    return;
  }

  switch (e.key) {
    case ' ':
      if (!S.spaceHeld) {
        S.spaceHeld = true;
        $('body').addClass('cursor-grab');
      }
      e.preventDefault();
      break;

    case 'Escape': {
      const $open = $('#file-menu, #shape-menu, #color-popover, #group-popover, #areascale-popover').filter(':visible');
      if ($open.length) {
        $open.hide();
      } else if (S.tool === 'squarecal') {
        cancelSqCalib();
      } else if (S.perspActive) {
        cancelPerspective();
      } else if (S.tool !== 'idle') {
        setTool('idle');
      } else {
        S.selId = null;
        S.overlayDirty = true;
        updatePanelSelection();
      }
      break;
    }

    case 'Enter':
      if (S.tool === 'squarecal' && S.polyPts.length === 4) {
        applySqCalib();
        e.preventDefault();
      } else if (S.perspActive) {
        applyPerspective();
        e.preventDefault();
      } else if (S.tool === 'segment' && S.polyPts.length >= 2) {
        closeSegment();
        e.preventDefault();
      }
      break;

    case 'Delete':
    case 'Backspace':
      if ((S.tool === 'polygon' || S.tool === 'segment' || S.tool === 'squarecal') && S.polyPts.length > 0) {
        S.polyPts.pop();
        S.overlayDirty = true;
        if (S.tool === 'squarecal') onSqCalibPoint();
      } else if (!S.perspActive && S.tool !== 'squarecal' && S.selId) {
        delShape(S.selId);
      }
      e.preventDefault();
      break;

    case 's':
    case 'S':
      if (S.img && !S.perspActive && S.tool !== 'squarecal') setTool(S.tool === 'scale' ? 'idle' : 'scale');
      break;
    case 'p':
    case 'P':
      if (S.img && !S.perspActive && S.tool !== 'squarecal') setTool(S.tool === 'polygon' ? 'idle' : 'polygon');
      break;
    case 'f':
    case 'F':
      if (S.img && !S.perspActive && S.tool !== 'squarecal') setTool(S.tool === 'freehand' ? 'idle' : 'freehand');
      break;
    case 'd':
    case 'D':
      if (S.img && !S.perspActive && S.tool !== 'squarecal') setTool(S.tool === 'segment' ? 'idle' : 'segment');
      break;
    case 'e':
    case 'E':
      if (S.img && !S.perspActive && S.tool !== 'squarecal') setTool(S.tool === 'edit' ? 'idle' : 'edit');
      break;
    case 'l':
    case 'L':
      if (S.img && !S.perspActive && S.tool !== 'squarecal') setTool(S.tool === 'label' ? 'idle' : 'label');
      break;
    case 'n':
    case 'N':
      if (S.img && !S.perspActive && S.tool !== 'squarecal') setTool(S.tool === 'note' ? 'idle' : 'note');
      break;
    case 'm':
    case 'M':
      if (S.img && !S.perspActive && S.tool !== 'squarecal') setTool(S.tool === 'move' ? 'idle' : 'move');
      break;

    case 'ArrowLeft':
    case 'ArrowRight':
    case 'ArrowUp':
    case 'ArrowDown':
      if (S.tool === 'move' && S.selId) {
        nudgeSelected(e.key, e.shiftKey);
        e.preventDefault();
      }
      break;
    case 'h':
    case 'H':
      if (S.img && !S.perspActive && S.tool !== 'squarecal' && S.selId) hideShape(S.selId);
      break;
    case 'w':
    case 'W':
      if (S.img && !S.perspActive && S.tool !== 'squarecal') enterPerspective();
      break;
    case '1': if (S.img && !S.perspActive && S.tool !== 'squarecal') setTool(S.tool === 'scale' ? 'idle' : 'scale'); break;
    case '2': if (S.img && !S.perspActive && S.tool !== 'squarecal') setTool(S.tool === 'polygon' ? 'idle' : 'polygon'); break;
    case '3': if (S.img && !S.perspActive && S.tool !== 'squarecal') setTool(S.tool === 'freehand' ? 'idle' : 'freehand'); break;
    case '4': if (S.img && !S.perspActive && S.tool !== 'squarecal') setTool(S.tool === 'segment' ? 'idle' : 'segment'); break;
    case '5': if (S.img && !S.perspActive && S.tool !== 'squarecal') setTool(S.tool === 'edit' ? 'idle' : 'edit'); break;
    case '6':
      if (S.img && !S.perspActive && S.tool !== 'squarecal') enterPerspective();
      break;

    case '=':
    case '+':
      if (S.img) zoomAt(1.2, S.cw / 2, S.ch / 2);
      break;

    case '-':
      if (S.img) zoomAt(1 / 1.2, S.cw / 2, S.ch / 2);
      break;

    case 'PageUp':
      if (!S.perspActive && S.tool !== 'squarecal') {
        navPage(-1);
        e.preventDefault();
      }
      break;

    case 'PageDown':
      if (!S.perspActive && S.tool !== 'squarecal') {
        navPage(1);
        e.preventDefault();
      }
      break;

    case '?':
      if (!S.perspActive && S.tool !== 'squarecal') {
        toggleShortcutsModal();
        e.preventDefault();
      }
      break;
  }
});

let _releaseShortcutsFocus = null;
function toggleShortcutsModal() {
  const $m = $('#shortcuts-modal');
  if ($m.hasClass('open')) closeShortcutsModal();
  else openShortcutsModal();
}
function openShortcutsModal() {
  const $m = $('#shortcuts-modal').addClass('open');
  _releaseShortcutsFocus = trapFocus($m);
}
function closeShortcutsModal() {
  $('#shortcuts-modal').removeClass('open');
  if (_releaseShortcutsFocus) { _releaseShortcutsFocus(); _releaseShortcutsFocus = null; }
}

$('#btn-shortcuts').on('click', openShortcutsModal);
$('#shortcuts-modal').on('click', function(e) {
  if (e.target === this || $(e.target).hasClass('sc-close')) closeShortcutsModal();
});
$(document).on('keydown', function(e) {
  if (e.key === 'Escape' && $('#shortcuts-modal').hasClass('open')) closeShortcutsModal();
});

$(document).on('keyup', function(e) {
  if (e.key === ' ') {
    S.spaceHeld = false;
    $('body').removeClass('cursor-grab cursor-grabbing');
    if (S.tool === 'scale' || S.tool === 'polygon' || S.tool === 'freehand' || S.tool === 'segment') {
      $('body').addClass('cursor-crosshair');
    }
    if (S.tool === 'edit') {
      $('body').addClass('cursor-move');
    }
  }
});

// ---- Serial File Queue ----
// PDFs need user interaction (page selector modal) before the next file
// can safely be loaded. Images are dispatched immediately and load async.

const _fileQueue = [];
let _fileQueueBusy = false;

function queueFile(file) {
  if (!file) return;
  _fileQueue.push(file);
  _drainFileQueue();
}

function _drainFileQueue() {
  if (_fileQueueBusy || _fileQueue.length === 0) return;
  _fileQueueBusy = true;
  const file = _fileQueue.shift();
  const name = file.name || '';
  const ext = name.split('.').pop().toLowerCase();

  if (ext === 'pdf' || file.type === 'application/pdf') {
    // PDF: pause the queue until the page-selector modal is dismissed
    loadPdf(file, function() {
      _fileQueueBusy = false;
      _drainFileQueue();
    });
  } else if (ext === 'arcalc') {
    importProject(file);
    _fileQueueBusy = false;
    _drainFileQueue();
  } else if (file.type.indexOf('image/') === 0) {
    // Images load async without blocking; advance the queue immediately
    loadImg(file);
    _fileQueueBusy = false;
    _drainFileQueue();
  } else {
    status('Unsupported file: ' + (name || file.type || 'unknown'));
    _fileQueueBusy = false;
    _drainFileQueue();
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
      const files = e.originalEvent.dataTransfer.files;
      for (let i = 0; i < files.length; i++) queueFile(files[i]);
    }
  });

$(document).on('paste', function(e) {
  const items = e.originalEvent.clipboardData.items;
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    if (it.kind !== 'file') continue;
    if (it.type.indexOf('image/') === 0 || it.type === 'application/pdf') {
      const f = it.getAsFile();
      if (f) queueFile(f);
      return;
    }
  }
});

// ---- Label Popup ----

$('#label-confirm').on('click', confirmLabel);

$('#label-value').on('keydown', function(e) {
  if (e.key === 'Enter') confirmLabel();
  if (e.key === 'Escape') {
    S.labelShapeId = null;
    S.pendingNotePt = null;
    $('#label-popup').hide();
    this.blur();
  }
  e.stopPropagation();
});

// ---- Focus trap: cycle Tab within a modal, restore focus on close ----

const FOCUSABLE_SEL = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

function trapFocus($modal) {
  const prev = document.activeElement;
  const $focusable = $modal.find(FOCUSABLE_SEL).filter(':visible');
  if ($focusable.length) $focusable.first().focus();

  function onKey(e) {
    if (e.key !== 'Tab') return;
    const items = $modal.find(FOCUSABLE_SEL).filter(':visible').toArray();
    if (!items.length) return;
    const first = items[0], last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) { last.focus(); e.preventDefault(); }
    else if (!e.shiftKey && document.activeElement === last) { first.focus(); e.preventDefault(); }
  }
  $modal.on('keydown.trap', onKey);

  return function release() {
    $modal.off('keydown.trap');
    if (prev && typeof prev.focus === 'function') prev.focus();
  };
}

// ---- Shared confirm modal (same style as storage-modal) ----

// message: string (treated as text) or jQuery node (appended as-is).
function showConfirmModal(message, confirmLabel, onConfirm) {
  const $p = $('<p>');
  if (typeof message === 'string') $p.text(message);
  else $p.append(message);

  const $overlay = $('<div class="storage-modal-overlay" role="dialog" aria-modal="true">')
    .append(
      $('<div class="storage-modal">')
        .append($p)
        .append(
          $('<button class="btn-primary">').text(confirmLabel).on('click', function() {
            release();
            $overlay.remove();
            onConfirm();
          })
        )
        .append(
          $('<button>').text('Cancel').on('click', function() {
            release();
            $overlay.remove();
          })
        )
    )
    .appendTo('body');
  const release = trapFocus($overlay);
}

// ---- New button (new project — clears all tabs) ----

function doNewProject() {
  if (S.perspActive) cancelPerspective();
  if (S.tool === 'squarecal') cancelSqCalib();
  cancelTool();

  S.tabs.length = 0;
  S.currentTabIdx = -1;
  switchToTab(createTab('Untitled', null, null));
  scheduleSave();
}

$('#btn-new').on('click', function() {
  // Check live current-tab state plus every other tab's persisted data
  let hasContent = !!(S.img || S.shapes.length);
  if (!hasContent) {
    for (let i = 0; i < S.tabs.length; i++) {
      if (i === S.currentTabIdx) continue;
      const t = S.tabs[i];
      if (t.img || t.imgDataUrl || (t.shapes && t.shapes.length)) { hasContent = true; break; }
    }
  }

  if (hasContent) {
    showConfirmModal(
      $('<span>').append($('<strong>').text('Start a new project?'))
        .append('<br>')
        .append(document.createTextNode('All tabs, images, and shapes will be cleared.')),
      'New Project',
      doNewProject
    );
  } else {
    doNewProject();
  }
});

$('#btn-open').on('click', function() {
  $('#file-input').click();
});

$('#file-input').on('change', function() {
  const files = this.files;
  for (let i = 0; i < files.length; i++) queueFile(files[i]);
  this.value = '';
});

$(document).on('dragover drop', function(e) {
  e.preventDefault();
});

// ---- Toolbar Buttons ----

$('.tb-btn[data-tool]').on('click', function() {
  if (!S.img) return;
  const t = $(this).data('tool');
  setTool(S.tool === t ? 'idle' : t);
});

$('#btn-delete').on('click', function() {
  if (S.selId) delShape(S.selId);
});

$('#btn-clear').on('click', function() {
  if (!S.shapes.length) return;
  recordHistory();
  const n = S.shapes.length;
  S.shapes = [];
  S.selId = null;
  S.colorIdx = 0;
  S.shapeN = 0;
  S.overlayDirty = true;
  updatePanel();
  status('Cleared ' + n + ' shape' + (n !== 1 ? 's' : '') + ' — Ctrl+Z to undo');
  scheduleSave();
});

$('#btn-fit').on('click', function() {
  if (S.img) fitView();
});

// ---- Sidebar toggle + pane collapse ----

$('#btn-toggle-sidebar').on('click', function() {
  const $p = $('#sidebar');
  $p.toggleClass('collapsed');
  $(this).toggleClass('active', !$p.hasClass('collapsed'));
  setTimeout(function() { resize(); if (S.img) fitView(); }, 170);
});

$('.pane-header').on('click', function(e) {
  if ($(e.target).closest('#btn-new-doc').length) return;
  const $pane = $(this).closest('.pane');
  $pane.toggleClass('collapsed');
  // A splitter-dragged inline height would defeat the collapse — park it
  if ($pane.hasClass('collapsed')) {
    $pane.data('splitH', $pane[0].style.height);
    $pane.css('height', '');
  } else if ($pane.data('splitH')) {
    $pane.css('height', $pane.data('splitH'));
  }
  $(this).find('.pane-caret').html($pane.hasClass('collapsed') ? '&#9656;' : '&#9662;');
});

// ---- Pane splitter: drag to resize Documents vs Shapes ----

(function initPaneSplitter() {
  const $splitter = $('#pane-splitter');
  let dragging = false;
  let startY = 0;
  let startH = 0;

  function startDrag(clientY) {
    dragging = true;
    startY = clientY;
    startH = $('#pane-docs').outerHeight();
    $splitter.addClass('dragging');
    $('body').css('cursor', 'ns-resize');
  }

  function moveDrag(clientY) {
    if (!dragging) return;
    const max = $('#sidebar').height() - 120;
    const h = Math.max(36, Math.min(max, startH + (clientY - startY)));
    $('#pane-docs').css({ height: h + 'px', maxHeight: 'none', flex: '0 0 auto' });
  }

  function endDrag() {
    if (!dragging) return;
    dragging = false;
    $splitter.removeClass('dragging');
    $('body').css('cursor', '');
  }

  $splitter.on('mousedown', function(e) {
    e.preventDefault();
    startDrag(e.clientY);
  });
  $(document).on('mousemove', function(e) { moveDrag(e.clientY); });
  $(document).on('mouseup', endDrag);

  $splitter.on('touchstart', function(e) {
    e.preventDefault();
    startDrag(e.originalEvent.touches[0].clientY);
  });
  $(document).on('touchmove', function(e) {
    if (dragging) moveDrag(e.originalEvent.touches[0].clientY);
  });
  $(document).on('touchend touchcancel', endDrag);
})();

// ---- Panel side (left/right dock), persisted ----

const PANEL_SIDE_KEY = 'areaCalcPanelSide';

function applyPanelSide(side) {
  $('#main').toggleClass('sidebar-right', side === 'right');
  $('#btn-dock-side').text(side === 'right' ? 'Move Panel to Left' : 'Move Panel to Right');
}

applyPanelSide(localStorage.getItem(PANEL_SIDE_KEY) === 'right' ? 'right' : 'left');

$('#btn-dock-side').on('click', function() {
  const side = $('#main').hasClass('sidebar-right') ? 'left' : 'right';
  try { localStorage.setItem(PANEL_SIDE_KEY, side); } catch (e) { /* preference only */ }
  applyPanelSide(side);
  resize();
  if (S.img) fitView();
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
  if (S.perspActive)          { cancelPerspective(); return; }
  if (S.tool === 'squarecal') { cancelSqCalib();    return; }
  enterPerspective();
});
$('#persp-apply').on('click', function() { applyPerspective(); });
$('#persp-cancel').on('click', function() { cancelPerspective(); });
$('#persp-reset').on('click', function() { resetPerspective(); });

// ---- Perspective Mode Tabs ----

$('.persp-tab').on('click', function() {
  switchPerspMode($(this).data('persp-mode'));
});

// ---- Shapes Panel Events ----

$('#shapes-list').on('click', '.shape-item', function(e) {
  if ($(e.target).closest('.shape-del, .shape-eye, .shape-swatch, .shape-menu, input').length) return;

  S.selId = $(this).data('id');
  S.overlayDirty = true;
  updatePanelSelection();

  const sh = findShape(S.selId);
  if (sh) {
    if (sh.type === 'segment') {
      status('Length: ' + fmtLen(sh.length));
    } else if (sh.type === 'note') {
      status('Note: ' + (sh.text || ''));
    } else if (sh.area != null) {
      status('Area: ' + fmtArea(sh.area) + ' | Perimeter: ' + fmtPerim(sh.perimeter));
    }
  }
});

$('#shapes-list').on('click', '.shape-del', function(e) {
  e.stopPropagation();
  delShape($(this).data('id'));
});

$('#shapes-list').on('click', '.group-header', function() {
  toggleGroupCollapsed($(this).data('group'));
});

// ---- Shapes panel: inline rename ----

function startInlineRename(id) {
  const $name = $('#shapes-list .shape-item[data-id="' + id + '"] .shape-name');
  if (!$name.length || $name.find('input').length) return;
  const sh = findShape(id);
  const old = sh ? (sh.name || '') : '';
  const $inp = $('<input type="text" class="name-edit">').val(old);
  $name.empty().append($inp);
  $inp.focus().select();
  let done = false;
  function commit() {
    if (done) return;
    done = true;
    const v = $inp.val();
    if (v.trim() && v !== old) renameShape(id, v);
    else updatePanel();
  }
  $inp.on('keydown', function(e) {
    if (e.key === 'Enter') commit();
    if (e.key === 'Escape') { done = true; updatePanel(); }
    e.stopPropagation();
  });
  $inp.on('blur', commit);
  $inp.on('click dblclick', function(e) { e.stopPropagation(); });
}

$('#shapes-list').on('dblclick', '.shape-name', function(e) {
  e.stopPropagation();
  startInlineRename($(this).closest('.shape-item').data('id'));
});

// ---- Shapes panel: color popover ----

let _colorShapeId = null;

(function buildPalette() {
  const $c = $('#color-swatches');
  for (let i = 0; i < COLORS.length; i++) {
    $c.append($('<button>').attr('title', COLORS[i]).attr('data-color', COLORS[i]).css('background', COLORS[i]));
  }
})();

function positionPopover($m, el) {
  const r = el.getBoundingClientRect();
  // Show first so the real width is measurable, then clamp into the viewport
  $m.css({ left: 0, top: 0 }).show();
  const w = $m.outerWidth();
  $m.css({
    left: Math.max(4, Math.min(r.left, window.innerWidth - w - 8)) + 'px',
    top: (r.bottom + 4) + 'px'
  });
}

function closePopovers() {
  $('#shape-menu, #color-popover, #group-popover, #areascale-popover').hide();
}

function openColorPopover(id, anchor) {
  closePopovers();
  _colorShapeId = id;
  const sh = findShape(id);
  $('#color-input').val(sh ? sh.color : '');
  positionPopover($('#color-popover'), anchor);
  $('#color-input').focus().select();
}

$('#shapes-list').on('click', '.shape-swatch', function(e) {
  e.stopPropagation();
  openColorPopover($(this).data('id'), this);
});

$('#color-swatches').on('click', 'button', function(e) {
  e.stopPropagation();
  if (_colorShapeId) setShapeColor(_colorShapeId, $(this).data('color'));
  $('#color-popover').hide();
});

function applyColorInput() {
  if (_colorShapeId && setShapeColor(_colorShapeId, $('#color-input').val())) {
    $('#color-popover').hide();
  }
}

$('#color-apply').on('click', function(e) {
  e.stopPropagation();
  applyColorInput();
});

$('#color-input').on('keydown', function(e) {
  if (e.key === 'Enter') applyColorInput();
  if (e.key === 'Escape') $('#color-popover').hide();
  e.stopPropagation();
});

// ---- Shapes panel: group popover ----

let _groupShapeId = null;

function openGroupPopover(id, anchor) {
  closePopovers();
  _groupShapeId = id;
  $('#group-input').val('');
  positionPopover($('#group-popover'), anchor);
  $('#group-input').focus();
}

function applyGroupInput() {
  const v = $('#group-input').val();
  if (_groupShapeId && v.trim()) setShapeGroup(_groupShapeId, v);
  $('#group-popover').hide();
  _groupShapeId = null;
}

$('#group-apply').on('click', function(e) {
  e.stopPropagation();
  applyGroupInput();
});

$('#group-input').on('keydown', function(e) {
  if (e.key === 'Enter') applyGroupInput();
  if (e.key === 'Escape') { $('#group-popover').hide(); _groupShapeId = null; }
  e.stopPropagation();
});

// ---- Shapes panel: scale-from-area popover ----

let _areaScaleShapeId = null;

function openAreaScalePopover(id, anchor) {
  closePopovers();
  _areaScaleShapeId = id;
  $('#areascale-input').val('');
  $('#areascale-unit').val(S.scaleUnit || 'cm');
  positionPopover($('#areascale-popover'), anchor);
  $('#areascale-input').focus();
}

function applyAreaScale() {
  const val = parseFloat($('#areascale-input').val());
  if (_areaScaleShapeId && val > 0) {
    if (setScaleFromArea(_areaScaleShapeId, val, $('#areascale-unit').val())) {
      $('#areascale-popover').hide();
      _areaScaleShapeId = null;
    }
  } else {
    status('Enter a valid area > 0');
  }
}

$('#areascale-apply').on('click', function(e) {
  e.stopPropagation();
  applyAreaScale();
});

$('#areascale-input').on('keydown', function(e) {
  if (e.key === 'Enter') applyAreaScale();
  if (e.key === 'Escape') { $('#areascale-popover').hide(); _areaScaleShapeId = null; }
  e.stopPropagation();
});

// ---- Shapes panel: per-shape menu ----

let _menuShapeId = null;

$('#shapes-list').on('click', '.shape-menu', function(e) {
  e.stopPropagation();
  closePopovers();
  _menuShapeId = $(this).data('id');
  const sh = findShape(_menuShapeId);
  if (!sh) return;

  const $m = $('#shape-menu').empty();
  $m.append($('<button data-act="rename">').text('Rename'));
  $m.append($('<button data-act="color">').text('Change color…'));
  if (sh.closed && sh.area != null) {
    $m.append($('<button data-act="areascale">').text('Set scale from area…'));
  }
  $m.append($('<div class="menu-sep">'));
  const groups = existingGroups();
  for (let i = 0; i < groups.length; i++) {
    if (groups[i] !== sh.group) {
      $m.append($('<button data-act="group">').attr('data-group', groups[i]).text('Move to "' + groups[i] + '"'));
    }
  }
  $m.append($('<button data-act="newgroup">').text('New group…'));
  if (sh.group) $m.append($('<button data-act="ungroup">').text('Remove from group'));
  $m.append($('<div class="menu-sep">'));
  $m.append($('<button data-act="delete">').text('Delete'));
  positionPopover($m, this);
});

$('#shape-menu').on('click', 'button', function(e) {
  e.stopPropagation();
  const act = $(this).data('act');
  const id = _menuShapeId;
  $('#shape-menu').hide();
  if (!id) return;
  const rowAnchor = $('#shapes-list .shape-item[data-id="' + id + '"]')[0];

  if (act === 'rename') startInlineRename(id);
  else if (act === 'color') openColorPopover(id, rowAnchor || this);
  else if (act === 'areascale') openAreaScalePopover(id, rowAnchor || this);
  else if (act === 'group') setShapeGroup(id, $(this).data('group'));
  else if (act === 'newgroup') openGroupPopover(id, rowAnchor || this);
  else if (act === 'ungroup') setShapeGroup(id, null);
  else if (act === 'delete') delShape(id);
});

// ---- Shapes panel: drag to reorder / regroup ----

let _dragShapeId = null;

$('#shapes-list').on('dragstart', '.shape-item', function(e) {
  _dragShapeId = $(this).data('id');
  e.originalEvent.dataTransfer.effectAllowed = 'move';
  e.originalEvent.dataTransfer.setData('text/plain', String(_dragShapeId));
});

$('#shapes-list').on('dragover', '.shape-item', function(e) {
  if (_dragShapeId == null) return;
  e.preventDefault();
  const r = this.getBoundingClientRect();
  const before = (e.originalEvent.clientY - r.top) < r.height / 2;
  $(this).toggleClass('drop-before', before).toggleClass('drop-after', !before);
});

$('#shapes-list').on('dragleave', '.shape-item', function() {
  $(this).removeClass('drop-before drop-after');
});

$('#shapes-list').on('drop', '.shape-item', function(e) {
  e.preventDefault();
  const before = $(this).hasClass('drop-before');
  $(this).removeClass('drop-before drop-after');
  if (_dragShapeId != null) reorderShape(_dragShapeId, $(this).data('id'), before);
  _dragShapeId = null;
});

$('#shapes-list').on('dragover', '.group-header', function(e) {
  if (_dragShapeId == null) return;
  e.preventDefault();
  $(this).addClass('drop-into');
});

$('#shapes-list').on('dragleave', '.group-header', function() {
  $(this).removeClass('drop-into');
});

$('#shapes-list').on('drop', '.group-header', function(e) {
  e.preventDefault();
  $(this).removeClass('drop-into');
  if (_dragShapeId != null) setShapeGroup(_dragShapeId, $(this).data('group'));
  _dragShapeId = null;
});

$('#shapes-list').on('dragend', '.shape-item', function() {
  _dragShapeId = null;
  $('#shapes-list .drop-before, #shapes-list .drop-after').removeClass('drop-before drop-after');
  $('#shapes-list .drop-into').removeClass('drop-into');
});

// ---- Window Resize ----

$(window).on('resize', function() {
  resize();
  S.imageDirty = S.overlayDirty = true;
  if (S.perspActive) emit(EVT.VIEW_CHANGE);
});

// ---- Brightness / Contrast Sliders ----

$('.sl-track').each(function() {
  const $track = $(this);
  const name = $track.data('slider');
  let dragging = false;

  function update(e) {
    const r = $track[0].getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
    let val = Math.round(pct * 200 - 100);

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
  const $inp = $(this);
  const name = $inp.data('slider');
  let startY = 0, startVal = 0, dragging = false, hasMoved = false;

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

    const dy = startY - e.clientY;

    if (!hasMoved && Math.abs(dy) > 4) {
      hasMoved = true;
      $inp.blur();
    }

    if (hasMoved) {
      const delta = Math.round(dy / 2);
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

// ---- Sidebar (documents) Events ----

$(document).on('click', '#doc-list .doc-row', function(e) {
  if ($(e.target).closest('.doc-close').length) return;
  if ($(e.target).hasClass('doc-caret') && $(e.target).data('doc') !== undefined) {
    toggleDocCollapsed($(e.target).data('doc'));
    return;
  }
  const idx = parseInt($(this).attr('data-idx'), 10);
  if (!isNaN(idx) && idx !== S.currentTabIdx) switchToTab(idx);
});

$(document).on('click', '#doc-list .doc-page', function(e) {
  if ($(e.target).closest('.doc-close').length) return;
  const idx = parseInt($(this).attr('data-idx'), 10);
  if (!isNaN(idx) && idx !== S.currentTabIdx) switchToTab(idx);
});

$(document).on('click', '#doc-list .doc-close', function(e) {
  e.stopPropagation();
  const docAttr = $(this).attr('data-doc');
  const idxAttr = $(this).attr('data-idx');
  if (docAttr !== undefined && docAttr !== '') {
    closeDoc(parseInt(docAttr, 10));
  } else if (idxAttr !== undefined && idxAttr !== '') {
    closeTab(parseInt(idxAttr, 10));
  }
});

$(document).on('click', '#btn-new-doc', function() {
  const idx = createTab('Untitled', null, null);
  switchToTab(idx);
});

$('#page-prev').on('click', function() { navPage(-1); });
$('#page-next').on('click', function() { navPage(1); });

// ---- Export Buttons ----

// ---- File menu ----

$('#btn-file-menu').on('click', function(e) {
  e.stopPropagation();
  const $m = $('#file-menu');
  if ($m.is(':visible')) { $m.hide(); return; }
  const r = this.getBoundingClientRect();
  $m.css({ left: r.left + 'px', top: (r.bottom + 4) + 'px' }).show();
});

$('#file-menu').on('click', 'button', function() {
  $('#file-menu').hide();
});

$(document).on('click', function(e) {
  const $t = $(e.target);
  if (!$t.closest('#file-menu, #btn-file-menu').length) $('#file-menu').hide();
  if (!$t.closest('#shape-menu, .shape-menu').length) $('#shape-menu').hide();
  if (!$t.closest('#color-popover, .shape-swatch').length) $('#color-popover').hide();
  if (!$t.closest('#group-popover').length) $('#group-popover').hide();
  if (!$t.closest('#areascale-popover').length) $('#areascale-popover').hide();
});

$('#btn-export-project').on('click', function() {
  exportProject();
});

$('#btn-export-csv').on('click', function() {
  exportMeasurementsCsv();
});

$('#btn-export-json').on('click', function() {
  exportMeasurements();
});

// ---- Rotate Buttons ----

$('#btn-rotate-ccw').on('click', function() {
  if (!S.img) return;
  rotateImage(-90);
});

$('#btn-rotate-cw').on('click', function() {
  if (!S.img) return;
  rotateImage(90);
});

$('#btn-rotate-custom').on('click', function() {
  if (!S.img) return;
  $('#rotate-angle-input').val('');
  $('#rotate-popup').show();
  $('#rotate-angle-input').focus();
  status('Enter rotation angle and press Apply');
});

function applyCustomRotate() {
  const val = parseFloat($('#rotate-angle-input').val());
  if (isNaN(val)) { status('Enter a valid angle'); return; }
  if (val === 0) { $('#rotate-popup').hide(); return; }
  $('#rotate-popup').hide();
  rotateImage(val);
}

$('#rotate-apply').on('click', applyCustomRotate);

$('#rotate-angle-input').on('keydown', function(e) {
  if (e.key === 'Enter') applyCustomRotate();
  if (e.key === 'Escape') { $('#rotate-popup').hide(); status('Rotation cancelled'); }
});

$('#rotate-cancel-btn').on('click', function() {
  $('#rotate-popup').hide();
  status('Rotation cancelled');
});

// Quick 90° buttons inside the popup
$('#rotate-ccw-small').on('click', function() {
  $('#rotate-popup').hide();
  rotateImage(-90);
});

$('#rotate-cw-small').on('click', function() {
  $('#rotate-popup').hide();
  rotateImage(90);
});

// ---- Show All Hidden Shapes ----

$('#btn-showall').on('click', function() {
  showAllShapes();
});

/// ---- Panel: hide-toggle per shape ----

$('#shapes-list').on('click', '.shape-eye', function(e) {
  e.stopPropagation();
  hideShape($(this).data('id'));
});

// ---- Refresh protection ----

window.addEventListener('beforeunload', function(e) {
  if (S.storageFull || S.saveErrored) {
    e.preventDefault();
    e.returnValue = '';
  }
});

// ---- Dynamic toolbar label shortening ----

if (typeof ResizeObserver !== 'undefined') {
  new ResizeObserver(syncToolbarLabels).observe(document.getElementById('toolbar'));
}

// Initialize sliders
setSlider('bright', 0);
setSlider('contrast', 0);
