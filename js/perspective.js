import { S, worker, imgWorker, iCvs, oCvs } from './state.js';
import { i2s, centroid, drawGrabRing } from './geometry.js';
import { HANDLE_RING_R } from './handles.js';
import { fitScale, segmentLength, bilinearPoint, rotateAround } from './math.js';
import { encodeCanvas } from './canvasUtil.js';
import { setTool, enableTools, status, updateScaleDisp, fitView, updatePanel } from './ui.js';
import { scheduleSave } from './storage.js';
import { recordTransformHistory } from './history.js';
import { getActiveTab } from './tabs.js';
import { EVT, emit, on } from './events.js';

// View-change event: fired by fitView/zoomAt to update live CSS preview
on(EVT.VIEW_CHANGE, updatePerspPreview);

// Tab-switch event: cancel perspective when user switches away from this tab
on(EVT.TAB_SWITCH, function() {
  if (S.perspActive) cancelPerspective();
});

function solveLinear8(A) {
  const n = 8;
  for (let col = 0; col < n; col++) {
    let maxVal = Math.abs(A[col][col]), maxRow = col;
    for (let row = col + 1; row < n; row++) {
      if (Math.abs(A[row][col]) > maxVal) { maxVal = Math.abs(A[row][col]); maxRow = row; }
    }
    const tmp = A[col]; A[col] = A[maxRow]; A[maxRow] = tmp;
    const pivot = A[col][col];
    if (Math.abs(pivot) < 1e-12) return null;
    for (let j = col; j <= n; j++) A[col][j] /= pivot;
    for (let row = 0; row < n; row++) {
      if (row === col) continue;
      const f = A[row][col];
      for (let j = col; j <= n; j++) A[row][j] -= f * A[col][j];
    }
  }
  const x = [];
  for (let i = 0; i < n; i++) x.push(A[i][n]);
  return x;
}

export function computeHomography(src, dst) {
  const A = [];
  for (let i = 0; i < 4; i++) {
    const sx = src[i].x, sy = src[i].y, dx = dst[i].x, dy = dst[i].y;
    A.push([sx, sy, 1, 0, 0, 0, -dx * sx, -dx * sy, dx]);
    A.push([0, 0, 0, sx, sy, 1, -dy * sx, -dy * sy, dy]);
  }
  const h = solveLinear8(A);
  if (!h) return null;
  h.push(1);
  return h;
}

export function applyHomography(H, x, y) {
  const w = H[6] * x + H[7] * y + H[8];
  return { x: (H[0] * x + H[1] * y + H[2]) / w, y: (H[3] * x + H[4] * y + H[5]) / w };
}

export function invertH(H) {
  const a=H[0],b=H[1],c=H[2],d=H[3],e=H[4],f=H[5],g=H[6],h=H[7],k=H[8];
  const det = a*(e*k-f*h) - b*(d*k-f*g) + c*(d*h-e*g);
  if (Math.abs(det) < 1e-12) return null;
  const inv = 1/det;
  return [
    (e*k-f*h)*inv, (c*h-b*k)*inv, (b*f-c*e)*inv,
    (f*g-d*k)*inv, (a*k-c*g)*inv, (c*d-a*f)*inv,
    (d*h-e*g)*inv, (b*g-a*h)*inv, (a*e-b*d)*inv
  ];
}

function computeCSS3dMatrix(w, h, dst) {
  const src = [{x:0,y:0},{x:w,y:0},{x:w,y:h},{x:0,y:h}];
  const H = computeHomography(src, dst);
  if (!H) return null;
  return 'matrix3d(' +
    H[0]+','+H[3]+',0,'+H[6]+','+
    H[1]+','+H[4]+',0,'+H[7]+','+
    '0,0,1,0,'+
    H[2]+','+H[5]+',0,'+H[8]+')';
}

export function enterPerspective() {
  if (!S.img || S.perspActive) return;
  if (S.tool === 'squarecal') emit(EVT.SQCAL_CANCEL);
  setTool('idle');
  S.perspActive = true;
  const iw = S.view.iw, ih = S.view.ih;
  S.perspSrcCorners = [{x:0,y:0},{x:iw,y:0},{x:iw,y:ih},{x:0,y:ih}];
  S.perspCorners = [{x:0,y:0},{x:iw,y:0},{x:iw,y:ih},{x:0,y:ih}];
  S.perspDragIdx = -1;
  _perspRotDeg = 0;
  $('#persp-rot-input').val(0);
  enableTools(false);
  $('#btn-persp').addClass('active').removeClass('disabled');
  $('#persp-bar').addClass('visible');
  $('.persp-tab').removeClass('active');
  $('.persp-tab[data-persp-mode="manual"]').addClass('active');
  $('#persp-manual-content').removeClass('hidden');
  $('#persp-auto-content').addClass('hidden');
  iCvs.style.opacity = '0.6';
  iCvs.style.transformOrigin = '0 0';
  S.overlayDirty = true;
  status('Drag corner handles to correct perspective. Apply when done.');
}

export function cancelPerspective() {
  if (!S.perspActive) return;
  S.perspActive = false;
  S.perspCorners = null; S.perspSrcCorners = null; S.perspDragIdx = -1;
  iCvs.style.opacity = '';
  iCvs.style.transform = '';
  iCvs.style.transformOrigin = '';
  oCvs.style.cursor = '';
  enableTools(true);
  $('#btn-persp').removeClass('active');
  $('#persp-bar').removeClass('visible');
  S.overlayDirty = true; S.imageDirty = true;
  status('Perspective correction cancelled.');
}

export function resetPerspective() {
  if (!S.perspActive) return;
  const iw = S.view.iw, ih = S.view.ih;
  S.perspCorners = [{x:0,y:0},{x:iw,y:0},{x:iw,y:ih},{x:0,y:ih}];
  _perspRotDeg = 0;
  $('#persp-rot-input').val(0);
  iCvs.style.transform = '';
  S.overlayDirty = true;
  status('Corners reset. Drag to adjust.');
}

// ---- Rotation (part of perspective): spins the destination corners around
// their centroid so small tilt fixes don't require juggling all 4 corners ----

let _perspRotDeg = 0;

export function setPerspRotation(deg) {
  if (!S.perspActive || !S.perspCorners) return;
  const delta = deg - _perspRotDeg;
  if (!delta) return;
  _perspRotDeg = deg;
  let cx = 0, cy = 0;
  for (let i = 0; i < 4; i++) { cx += S.perspCorners[i].x; cy += S.perspCorners[i].y; }
  cx /= 4; cy /= 4;
  const rad = delta * Math.PI / 180;
  for (let i = 0; i < 4; i++) {
    S.perspCorners[i] = rotateAround(S.perspCorners[i], cx, cy, rad);
  }
  updatePerspPreview();
  S.overlayDirty = true;
}

// ---- Inner control points: rule-of-thirds intersections that mirror the
// outer corners. Dragging one moves its corner by 1/weight so the inner
// point tracks the pointer exactly — perspective control while zoomed in ----

const INNER_UV = [[1/3, 1/3], [2/3, 1/3], [2/3, 2/3], [1/3, 2/3]];
const INNER_AMP = 1 / ((2/3) * (2/3)); // bilinear weight of a corner at its own thirds point

export function innerPerspPoint(i) {
  return bilinearPoint(S.perspCorners, INNER_UV[i][0], INNER_UV[i][1]);
}

// Grab a handle (0-3 outer corner, 4-7 inner point): records the pointer
// offset so the handle doesn't jump on the first move.
export function grabPerspHandle(idx, mix, miy) {
  const p = idx < 4 ? S.perspCorners[idx] : innerPerspPoint(idx - 4);
  S.perspDragIdx = idx;
  S.perspDragOffset = { x: p.x - mix, y: p.y - miy };
}

export function dragPerspHandle(mix, miy) {
  const idx = S.perspDragIdx;
  if (idx < 0) return;
  const tx = mix + S.perspDragOffset.x;
  const ty = miy + S.perspDragOffset.y;
  if (idx < 4) {
    S.perspCorners[idx] = { x: tx, y: ty };
  } else {
    const i = idx - 4;
    const cur = innerPerspPoint(i);
    S.perspCorners[i] = {
      x: S.perspCorners[i].x + (tx - cur.x) * INNER_AMP,
      y: S.perspCorners[i].y + (ty - cur.y) * INNER_AMP
    };
  }
}

export function updatePerspPreview() {
  if (!S.perspActive || !S.perspCorners) return;
  let moved = false;
  for (let i = 0; i < 4; i++) {
    if (Math.abs(S.perspCorners[i].x - S.perspSrcCorners[i].x) > 0.5 ||
        Math.abs(S.perspCorners[i].y - S.perspSrcCorners[i].y) > 0.5) { moved = true; break; }
  }
  if (!moved) { iCvs.style.transform = ''; return; }
  const srcS = [], dstS = [];
  for (let i = 0; i < 4; i++) {
    srcS.push(i2s(S.perspSrcCorners[i].x, S.perspSrcCorners[i].y));
    dstS.push(i2s(S.perspCorners[i].x, S.perspCorners[i].y));
  }
  const H = computeHomography(srcS, dstS);
  if (!H) return;
  const c0 = applyHomography(H,0,0), c1 = applyHomography(H,S.cw,0);
  const c2 = applyHomography(H,S.cw,S.ch), c3 = applyHomography(H,0,S.ch);
  const css = computeCSS3dMatrix(S.cw, S.ch, [c0, c1, c2, c3]);
  if (css) iCvs.style.transform = css;
}

export function applyPerspective() {
  if (!S.perspActive || !S.perspCorners) return;
  let moved = false;
  for (let i = 0; i < 4; i++) {
    if (Math.abs(S.perspCorners[i].x - S.perspSrcCorners[i].x) > 0.5 ||
        Math.abs(S.perspCorners[i].y - S.perspSrcCorners[i].y) > 0.5) { moved = true; break; }
  }
  if (!moved) { cancelPerspective(); return; }
  status('Applying perspective correction...');

  const Hfwd = computeHomography(S.perspSrcCorners, S.perspCorners);
  if (!Hfwd) { status('Failed to compute perspective transform.'); return; }
  const Hinv = invertH(Hfwd);
  if (!Hinv) { status('Failed to invert perspective transform.'); return; }

  applyHomographyToImage(Hfwd, Hinv, function() {
    S.perspActive = false; S.perspCorners = null; S.perspSrcCorners = null; S.perspDragIdx = -1;
    iCvs.style.opacity = ''; iCvs.style.transform = ''; iCvs.style.transformOrigin = '';
    oCvs.style.cursor = '';
    enableTools(true);
    $('#btn-persp').removeClass('active');
    $('#persp-bar').removeClass('visible');
    status('Perspective correction applied.');
  });
}

export function drawPerspOverlay(ctx) {
  if (!S.perspActive || !S.perspCorners) return;
  ctx.save();

  const GL = 8;
  const tl = i2s(0,0), tr = i2s(S.view.iw,0), bl = i2s(0,S.view.ih), br = i2s(S.view.iw,S.view.ih);

  ctx.strokeStyle = 'rgba(74,158,255,0.25)';
  ctx.lineWidth = 1;
  ctx.setLineDash([4,4]);
  for (let i = 1; i < GL; i++) {
    const t = i/GL;
    ctx.beginPath();
    ctx.moveTo(tl.x+(bl.x-tl.x)*t, tl.y+(bl.y-tl.y)*t);
    ctx.lineTo(tr.x+(br.x-tr.x)*t, tr.y+(br.y-tr.y)*t);
    ctx.stroke();
  }
  for (let i = 1; i < GL; i++) {
    const t = i/GL;
    ctx.beginPath();
    ctx.moveTo(tl.x+(tr.x-tl.x)*t, tl.y+(tr.y-tl.y)*t);
    ctx.lineTo(bl.x+(br.x-bl.x)*t, bl.y+(br.y-bl.y)*t);
    ctx.stroke();
  }
  ctx.setLineDash([]);

  ctx.strokeStyle = 'rgba(74,158,255,0.5)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(tl.x,tl.y); ctx.lineTo(tr.x,tr.y); ctx.lineTo(br.x,br.y); ctx.lineTo(bl.x,bl.y);
  ctx.closePath(); ctx.stroke();

  const cs = [];
  for (let i = 0; i < 4; i++) cs.push(i2s(S.perspCorners[i].x, S.perspCorners[i].y));
  ctx.strokeStyle = '#FF6B35'; ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(cs[0].x,cs[0].y);
  for (let i = 1; i < 4; i++) ctx.lineTo(cs[i].x,cs[i].y);
  ctx.closePath(); ctx.stroke();

  // Rule-of-thirds grid across the destination quad
  ctx.strokeStyle = 'rgba(255,107,53,0.45)';
  ctx.lineWidth = 1;
  for (let t = 1; t <= 2; t++) {
    const u = t / 3;
    const pa = bilinearPoint(S.perspCorners, u, 0), pb = bilinearPoint(S.perspCorners, u, 1);
    const pc = bilinearPoint(S.perspCorners, 0, u), pd = bilinearPoint(S.perspCorners, 1, u);
    const a = i2s(pa.x, pa.y), b = i2s(pb.x, pb.y), c = i2s(pc.x, pc.y), d = i2s(pd.x, pd.y);
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(c.x, c.y); ctx.lineTo(d.x, d.y); ctx.stroke();
  }

  const HR = 8;
  const IR = 6;
  const labels = ['TL','TR','BR','BL'];
  ctx.font = '600 9px "JetBrains Mono", monospace';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const hov = S.perspDragIdx >= 0 ? S.perspDragIdx : findPerspHandle(S.mx, S.my);

  // Inner thirds handles: mirror their corner (amplified) with an arrow
  // pointing at it, so perspective stays adjustable while zoomed in
  for (let i = 0; i < 4; i++) {
    const p = innerPerspPoint(i);
    const sp = i2s(p.x, p.y);
    const active = (i + 4 === S.perspDragIdx);

    const dx = cs[i].x - sp.x, dy = cs[i].y - sp.y;
    const dd = Math.hypot(dx, dy);
    if (dd > 1) {
      const ux = dx / dd, uy = dy / dd;
      const ax = sp.x + ux * (IR + 3), ay = sp.y + uy * (IR + 3);
      const tipX = sp.x + ux * (IR + 13), tipY = sp.y + uy * (IR + 13);
      ctx.strokeStyle = active ? '#FF6B35' : 'rgba(255,107,53,0.7)';
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(tipX, tipY); ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(tipX + ux * 5, tipY + uy * 5);
      ctx.lineTo(tipX - uy * 3.5, tipY + ux * 3.5);
      ctx.lineTo(tipX + uy * 3.5, tipY - ux * 3.5);
      ctx.closePath();
      ctx.fillStyle = active ? '#FF6B35' : 'rgba(255,107,53,0.7)';
      ctx.fill();
    }

    ctx.beginPath(); ctx.arc(sp.x, sp.y, IR, 0, Math.PI*2);
    ctx.fillStyle = active ? '#FF6B35' : 'rgba(255,107,53,0.55)';
    ctx.fill();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.stroke();
    if (i + 4 === hov) {
      drawGrabRing(ctx, { x: sp.x, y: sp.y, rx: sp.x, ry: sp.y }, active, HANDLE_RING_R);
    }
  }

  for (let i = 0; i < 4; i++) {
    const cp = cs[i], active = (i === S.perspDragIdx);
    ctx.beginPath(); ctx.arc(cp.x,cp.y,HR,0,Math.PI*2);
    ctx.fillStyle = active ? '#FF6B35' : 'rgba(255,107,53,0.8)';
    ctx.fill();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.fillText(labels[i], cp.x, cp.y);
    if (i === hov) {
      drawGrabRing(ctx, { x: cp.x, y: cp.y, rx: cp.x, ry: cp.y }, active, HANDLE_RING_R);
    }
  }
  ctx.restore();
}

// 0-3: outer corners, 4-7: inner thirds handles, -1: none
export function findPerspHandle(sx, sy) {
  for (let i = 0; i < 4; i++) {
    const sp = i2s(S.perspCorners[i].x, S.perspCorners[i].y);
    if (Math.hypot(sx - sp.x, sy - sp.y) <= HANDLE_RING_R) return i;
  }
  for (let i = 0; i < 4; i++) {
    const p = innerPerspPoint(i);
    const sp = i2s(p.x, p.y);
    if (Math.hypot(sx - sp.x, sy - sp.y) <= HANDLE_RING_R) return i + 4;
  }
  return -1;
}

// ========== SHARED PIXEL TRANSFORM ==========

// Pixel warp runs in the shared worker so the UI stays responsive.
let _warpReqN = 0;
const _warpCbs = {};
worker.addEventListener('message', function(e) {
  const d = e.data;
  if (d.type !== 'warpResult' || !_warpCbs[d.reqId]) return;
  const cb = _warpCbs[d.reqId];
  delete _warpCbs[d.reqId];
  cb(d);
});

// Total-pixel and side-length budgets for warped output. Strong perspective
// corrections can stretch the bounding box arbitrarily; instead of cropping
// (data loss) or ballooning (OOM on slow machines), a uniform downscale is
// folded into the homography so all geometry stays consistent.
const WARP_MAX_SIDE = 8192;
function warpPixelBudget(iw, ih) {
  return Math.min(Math.max(iw * ih * 1.6, 8e6), 3.2e7);
}

export function applyHomographyToImage(Hfwd, Hinv, onComplete) {
  const iw = S.view.iw, ih = S.view.ih;
  const startTabIdx = S.currentTabIdx;

  const corners = [
    applyHomography(Hfwd, 0, 0),
    applyHomography(Hfwd, iw, 0),
    applyHomography(Hfwd, iw, ih),
    applyHomography(Hfwd, 0, ih)
  ];

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (let i = 0; i < 4; i++) {
    if (corners[i].x < minX) minX = corners[i].x;
    if (corners[i].y < minY) minY = corners[i].y;
    if (corners[i].x > maxX) maxX = corners[i].x;
    if (corners[i].y > maxY) maxY = corners[i].y;
  }

  const k = fitScale(maxX - minX, maxY - minY, warpPixelBudget(iw, ih), WARP_MAX_SIDE);
  let H = Hfwd;
  if (k < 1) {
    H = [Hfwd[0] * k, Hfwd[1] * k, Hfwd[2] * k,
         Hfwd[3] * k, Hfwd[4] * k, Hfwd[5] * k,
         Hfwd[6], Hfwd[7], Hfwd[8]];
    Hinv = invertH(H);
    if (!Hinv) { status('Failed to invert perspective transform.'); return; }
    minX *= k; minY *= k; maxX *= k; maxY *= k;
  }

  const offX = Math.floor(minX);
  const offY = Math.floor(minY);
  const outW = Math.ceil(maxX) - offX;
  const outH = Math.ceil(maxY) - offY;

  const srcCvs = document.createElement('canvas');
  srcCvs.width = iw; srcCvs.height = ih;
  const srcCtx = srcCvs.getContext('2d');
  srcCtx.drawImage(S.img, 0, 0);
  const srcData = srcCtx.getImageData(0, 0, iw, ih);

  const reqId = ++_warpReqN;
  _warpCbs[reqId] = function(d) {
    // Bail if the user switched tabs while the warp was computing
    if (S.currentTabIdx !== startTabIdx) return;

    const tmpCvs = document.createElement('canvas');
    tmpCvs.width = d.outW; tmpCvs.height = d.outH;
    tmpCvs.getContext('2d').putImageData(
      new ImageData(new Uint8ClampedArray(d.buf), d.outW, d.outH), 0, 0);

    let oldScalePxLen = 0;
    if (S.scaleLine && S.scalePPU > 0) {
      oldScalePxLen = Math.hypot(S.scaleLine.p2.x - S.scaleLine.p1.x, S.scaleLine.p2.y - S.scaleLine.p1.y);
    }

    for (let si = 0; si < S.shapes.length; si++) {
      const shape = S.shapes[si];
      for (let pi = 0; pi < shape.points.length; pi++) {
        const pt = shape.points[pi];
        const np = applyHomography(H, pt.x, pt.y);
        shape.points[pi] = { x: np.x - offX, y: np.y - offY };
      }
      shape._centroid = null;
      if (shape.type === 'segment') {
        shape.length = segmentLength(shape.points);
      } else if (shape.closed) {
        worker.postMessage({ type: 'calcArea', id: shape.id, points: shape.points, tabIdx: S.currentTabIdx });
      }
    }

    if (S.scaleLine) {
      const np1 = applyHomography(H, S.scaleLine.p1.x, S.scaleLine.p1.y);
      const np2 = applyHomography(H, S.scaleLine.p2.x, S.scaleLine.p2.y);
      S.scaleLine.p1 = { x: np1.x - offX, y: np1.y - offY };
      S.scaleLine.p2 = { x: np2.x - offX, y: np2.y - offY };
      if (S.scalePPU > 0 && oldScalePxLen > 0) {
        const realDist = oldScalePxLen / S.scalePPU;
        S.scalePPU = Math.hypot(np2.x - np1.x, np2.y - np1.y) / realDist;
        updateScaleDisp();
      }
    }

    const dataUrl = encodeCanvas(tmpCvs);
    const newImg = new Image();
    newImg.onload = function() {
      S.img = newImg;
      S.view.iw = d.outW;
      S.view.ih = d.outH;
      S.imgDataUrl = dataUrl;

      S.imageDirty = S.overlayDirty = true;
      fitView();
      updatePanel();

      // Clear stale pre-transform WebP and re-encode the corrected image.
      // Without this, serializeTab() would save the old WebP while shapes
      // are already in post-transform coordinates, corrupting reloaded state.
      const tab = getActiveTab();
      if (tab) {
        tab.baseImg = newImg;
        tab.baseRotation = 0;
        tab.imgWebpUrl = null;
        tab.webpPending = true;
        if (typeof createImageBitmap === 'function') {
          createImageBitmap(tmpCvs).then(function(bitmap) {
            imgWorker.postMessage({ type: 'encodeWebP', id: tab.tabId, bitmap: bitmap }, [bitmap]);
          }).catch(function() { tab.webpPending = false; });
        } else {
          tab.webpPending = false;
        }
      }

      scheduleSave();

      if (onComplete) onComplete();
    };
    newImg.src = dataUrl;
  };

  recordTransformHistory();
  worker.postMessage({
    type: 'warp', reqId: reqId, buf: srcData.data.buffer,
    iw: iw, ih: ih, outW: outW, outH: outH, offX: offX, offY: offY, Hinv: Hinv
  }, [srcData.data.buffer]);
}
