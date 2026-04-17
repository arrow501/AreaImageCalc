import { S, worker, oCvs } from './state.js';
import { s2i, i2s, findNearestPt, findShape, fmtArea, fmtPerim, fmtLen, segmentLength, distSeg, pip } from './geometry.js';
import { resize, refreshCanvasRect } from './render.js';
import {
  closePoly, closeSegment, finishFH, delShape, selectAt,
  loadImg, zoomAt, setInteract, showScalePopup, confirmScale,
  rotateImage, renameShape, hideShape, showAllShapes,
  showLabelPopup, confirmLabel
} from './tools.js';
import {
  setTool, cancelTool, fitView, updatePanel, status, updateFilters,
  setSlider, syncToolbarLabels
} from './ui.js';
import { scheduleSave } from './storage.js';
import { enterPerspective, cancelPerspective, applyPerspective, resetPerspective, findPerspHandle } from './perspective.js';
import { enterSqCalib, cancelSqCalib, applySqCalib, onSqCalibPoint, switchPerspMode } from './squareCalib.js';
import { createTab, switchToTab, closeTab } from './tabs.js';
import { loadPdf } from './pdf.js';
import { exportProject, importProject, exportMeasurements } from './export.js';
import { EVT, emit } from './events.js';

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
        // Click near an existing corner → start dragging it
        const grabR = 12 / (S.view.zoom * S.view.fit);
        S.dragIdx = -1;
        for (let ci = 0; ci < 4; ci++) {
          if (Math.hypot(S.mix - S.polyPts[ci].x, S.miy - S.polyPts[ci].y) <= grabR) {
            S.dragIdx = ci; break;
          }
        }
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
      S.fhLastTime = Date.now();
      S.overlayDirty = true;
      break;

    case 'segment':
      S.polyPts.push(ip);
      S.overlayDirty = true;
      break;

    case 'edit': {
      const thr = 10 / (S.view.zoom * S.view.fit);
      const hp = findNearestPt(ip, thr);
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
    }

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
      // Show grab cursor when hovering near a corner
      const grabR2 = 12 / (S.view.zoom * S.view.fit);
      const nearCorner = S.polyPts.some(function(p) {
        return Math.hypot(S.mix - p.x, S.miy - p.y) <= grabR2;
      });
      oCvs.style.cursor = nearCorner ? 'grab' : '';
    }
    S.overlayDirty = true;
    return;
  }

  if (S.isFH) {
    const last = S.fhPts[S.fhPts.length - 1];
    const dx = S.mix - last.x, dy = S.miy - last.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    const now = Date.now();
    const dt = (now - S.fhLastTime) / 1000;
    const speed = dt > 0 ? dist / dt : 0;

    const t = Math.min(speed / 2000, 1);
    const threshold = S.FH_MIN_DIST + t * (S.FH_MAX_DIST - S.FH_MIN_DIST);

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
  if (S.tool === 'segment' && S.polyPts.length > 0) S.overlayDirty = true;
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
    if (S.dragShape.type === 'segment') {
      S.dragShape.length = segmentLength(S.dragShape.points);
    } else {
      S.dragShape._centroid = null;
      worker.postMessage({ type: 'calcArea', id: S.dragShape.id, points: S.dragShape.points, tabIdx: S.currentTabIdx });
    }
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
  if (S.tool === 'segment' && S.polyPts.length >= 2) {
    S.polyPts.pop();
    closeSegment();
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
        const grabRT = 18 / (S.view.zoom * S.view.fit);
        S.dragIdx = -1;
        for (let cit = 0; cit < 4; cit++) {
          if (Math.hypot(S.mix - S.polyPts[cit].x, S.miy - S.polyPts[cit].y) <= grabRT) {
            S.dragIdx = cit; break;
          }
        }
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
      S.fhLastTime = Date.now();
      S.overlayDirty = true;
      break;

    case 'segment':
      S.polyPts.push(ip);
      S.overlayDirty = true;
      break;

    case 'edit': {
      const thrScreen = 20 / (S.view.zoom * S.view.fit);
      const hp = findNearestPt(ip, thrScreen);
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
    }

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
    const last = S.fhPts[S.fhPts.length - 1];
    const dx = S.mix - last.x, dy = S.miy - last.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    const now = Date.now();
    const dt = (now - S.fhLastTime) / 1000;
    const speed = dt > 0 ? dist / dt : 0;

    const t = Math.min(speed / 2000, 1);
    const threshold = S.FH_MIN_DIST + t * (S.FH_MAX_DIST - S.FH_MIN_DIST);

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
    } else {
      S.dragShape._centroid = null;
      worker.postMessage({ type: 'calcArea', id: S.dragShape.id, points: S.dragShape.points, tabIdx: S.currentTabIdx });
    }
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
        cancelSqCalib();
      } else if (S.perspActive) {
        cancelPerspective();
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
      if (!S.perspActive && S.tool !== 'squarecal' && S.selId) delShape(S.selId);
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

    case '0':
      if ((e.ctrlKey || e.metaKey) && S.img) {
        e.preventDefault();
        fitView();
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
    if (items[i].type.indexOf('image/') === 0) {
      queueFile(items[i].getAsFile());
      return;
    }
  }
});

// ---- Label Popup ----

$('#label-confirm').on('click', confirmLabel);

$('#label-value').on('keydown', function(e) {
  if (e.key === 'Enter') confirmLabel();
  if (e.key === 'Escape') { S.labelShapeId = null; $('#label-popup').hide(); }
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

function showConfirmModal(htmlMessage, confirmLabel, onConfirm) {
  const $overlay = $('<div class="storage-modal-overlay" role="dialog" aria-modal="true">')
    .append(
      $('<div class="storage-modal">')
        .append($('<p>').html(htmlMessage))
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
  $('#tab-bar').addClass('collapsed');
  $('#btn-toggle-tabs').html('&#9656; Tabs');
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
      '<strong>Start a new project?</strong><br>All tabs, images, and shapes will be cleared.',
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

function toggleShapesPanel() {
  const $p = $('#shapes-panel');
  $p.toggleClass('collapsed');
  const col = $p.hasClass('collapsed');
  $('#panel-reveal').css('width', col ? '14px' : '0');
  $('#btn-toggle-panel').html(col ? '&#187;' : '&#171;');
  setTimeout(function() { resize(); if (S.img) fitView(); }, 170);
}

$('#btn-toggle-panel').on('click', toggleShapesPanel);
$('#panel-reveal').on('click', toggleShapesPanel);

$('#btn-toggle-tabs').on('click', function() {
  const $p = $('#tab-bar');
  $p.toggleClass('collapsed');
  $(this).html($p.hasClass('collapsed') ? '&#9656; Tabs' : '&#9662; Tabs');
  setTimeout(function() { resize(); if (S.img) fitView(); }, 170);
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
  if ($(e.target).closest('.shape-del').length) return;
  if ($(e.target).closest('.shape-eye').length) return;

  S.selId = $(this).data('id');
  S.overlayDirty = true;
  updatePanel();

  const sh = findShape(S.selId);
  if (sh) {
    if (sh.type === 'segment') {
      status('Length: ' + fmtLen(sh.length));
    } else if (sh.area != null) {
      status('Area: ' + fmtArea(sh.area) + ' | Perimeter: ' + fmtPerim(sh.perimeter));
    }
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

// ---- Tab Bar Events ----

$(document).on('click', '.tab-item', function(e) {
  if ($(e.target).hasClass('tab-close') || $(e.target).closest('.tab-close').length) return;
  const idx = parseInt($(this).data('idx'), 10);
  if (idx !== S.currentTabIdx) switchToTab(idx);
});

$(document).on('click', '.tab-close', function(e) {
  e.stopPropagation();
  const idx = parseInt($(this).data('idx'), 10);
  closeTab(idx);
});

$(document).on('click', '#btn-new-tab', function() {
  const idx = createTab('Untitled', null, null);
  switchToTab(idx);
});

// ---- Export Buttons ----

$('#btn-export-project').on('click', function() {
  exportProject();
});

$('#btn-export-measurements').on('click', function() {
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
  if (S.storageFull) {
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
