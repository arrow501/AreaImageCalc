import { S, worker, imgWorker, iCvs, oCvs } from './state.js';
import { i2s, centroid } from './geometry.js';
import { setTool, enableTools, status, updateScaleDisp, fitView, updatePanel } from './ui.js';
import { scheduleSave } from './storage.js';

// View-change event: fired by fitView/zoomAt to update live CSS preview
$(document).on('view:change', updatePerspPreview);

// Tab-switch event: cancel perspective when user switches away from this tab
$(document).on('tab:switch', function() {
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
  if (S.tool === 'squarecal') $(document).trigger('squarecal:cancel');
  setTool('idle');
  S.perspActive = true;
  const iw = S.view.iw, ih = S.view.ih;
  S.perspSrcCorners = [{x:0,y:0},{x:iw,y:0},{x:iw,y:ih},{x:0,y:ih}];
  S.perspCorners = [{x:0,y:0},{x:iw,y:0},{x:iw,y:ih},{x:0,y:ih}];
  S.perspDragIdx = -1;
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
  iCvs.style.transform = '';
  S.overlayDirty = true;
  status('Corners reset. Drag to adjust.');
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

  const HR = 8;
  const labels = ['TL','TR','BR','BL'];
  ctx.font = '600 9px "JetBrains Mono", monospace';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (let i = 0; i < 4; i++) {
    const cp = cs[i], active = (i === S.perspDragIdx);
    ctx.beginPath(); ctx.arc(cp.x,cp.y,HR,0,Math.PI*2);
    ctx.fillStyle = active ? '#FF6B35' : 'rgba(255,107,53,0.8)';
    ctx.fill();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.fillText(labels[i], cp.x, cp.y);
  }
  ctx.restore();
}

export function findPerspHandle(sx, sy) {
  for (let i = 0; i < 4; i++) {
    const sp = i2s(S.perspCorners[i].x, S.perspCorners[i].y);
    if (Math.hypot(sx - sp.x, sy - sp.y) <= 12) return i;
  }
  return -1;
}

// ========== SHARED PIXEL TRANSFORM ==========

export function applyHomographyToImage(Hfwd, Hinv, onComplete) {
  const iw = S.view.iw, ih = S.view.ih;

  // Compute output bounding box by transforming all 4 corners through Hfwd
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

  // Clamp to reasonable bounds (max 4x original size to prevent OOM)
  const maxDim = Math.max(iw, ih) * 4;
  minX = Math.max(minX, -maxDim);
  minY = Math.max(minY, -maxDim);
  maxX = Math.min(maxX, maxDim);
  maxY = Math.min(maxY, maxDim);

  const offX = Math.floor(minX);
  const offY = Math.floor(minY);
  const outW = Math.ceil(maxX) - offX;
  const outH = Math.ceil(maxY) - offY;

  // Get source pixels
  const srcCvs = document.createElement('canvas');
  srcCvs.width = iw; srcCvs.height = ih;
  const srcCtx = srcCvs.getContext('2d');
  srcCtx.drawImage(S.img, 0, 0);
  const srcData = srcCtx.getImageData(0, 0, iw, ih);
  const srcPx = srcData.data;

  // Create output
  const tmpCvs = document.createElement('canvas');
  tmpCvs.width = outW; tmpCvs.height = outH;
  const tmpCtx = tmpCvs.getContext('2d');
  const outData = tmpCtx.createImageData(outW, outH);
  const outPx = outData.data;

  // Render: for each output pixel, find source via inverse transform
  for (let oy = 0; oy < outH; oy++) {
    for (let ox = 0; ox < outW; ox++) {
      const sp = applyHomography(Hinv, ox + offX, oy + offY);
      const ssx = sp.x, ssy = sp.y;
      const outIdx = (oy * outW + ox) * 4;

      if (ssx < 0 || ssx >= iw - 1 || ssy < 0 || ssy >= ih - 1) {
        outPx[outIdx] = outPx[outIdx + 1] = outPx[outIdx + 2] = outPx[outIdx + 3] = 0;
        continue;
      }

      // Bilinear interpolation
      const x0 = Math.floor(ssx), y0 = Math.floor(ssy);
      const fx = ssx - x0, fy = ssy - y0;
      const x1 = Math.min(x0 + 1, iw - 1), y1 = Math.min(y0 + 1, ih - 1);
      const i00 = (y0 * iw + x0) * 4, i10 = (y0 * iw + x1) * 4;
      const i01 = (y1 * iw + x0) * 4, i11 = (y1 * iw + x1) * 4;

      for (let c = 0; c < 4; c++) {
        outPx[outIdx + c] = Math.round(
          srcPx[i00 + c] * (1 - fx) * (1 - fy) + srcPx[i10 + c] * fx * (1 - fy) +
          srcPx[i01 + c] * (1 - fx) * fy + srcPx[i11 + c] * fx * fy);
      }
    }
  }
  tmpCtx.putImageData(outData, 0, 0);

  // Transform shape points: new_pt = H(old_pt) - offset
  let oldScalePxLen = 0;
  if (S.scaleLine && S.scalePPU > 0) {
    oldScalePxLen = Math.hypot(S.scaleLine.p2.x - S.scaleLine.p1.x, S.scaleLine.p2.y - S.scaleLine.p1.y);
  }

  for (let si = 0; si < S.shapes.length; si++) {
    const shape = S.shapes[si];
    for (let pi = 0; pi < shape.points.length; pi++) {
      const pt = shape.points[pi];
      const np = applyHomography(Hfwd, pt.x, pt.y);
      shape.points[pi] = { x: np.x - offX, y: np.y - offY };
    }
    if (shape.closed) worker.postMessage({ type: 'calcArea', id: shape.id, points: shape.points });
  }

  if (S.scaleLine) {
    const np1 = applyHomography(Hfwd, S.scaleLine.p1.x, S.scaleLine.p1.y);
    const np2 = applyHomography(Hfwd, S.scaleLine.p2.x, S.scaleLine.p2.y);
    S.scaleLine.p1 = { x: np1.x - offX, y: np1.y - offY };
    S.scaleLine.p2 = { x: np2.x - offX, y: np2.y - offY };
    if (S.scalePPU > 0 && oldScalePxLen > 0) {
      const realDist = oldScalePxLen / S.scalePPU;
      S.scalePPU = Math.hypot(np2.x - np1.x, np2.y - np1.y) / realDist;
      updateScaleDisp();
    }
  }

  // Load new image
  const dataUrl = tmpCvs.toDataURL('image/png');
  const newImg = new Image();
  newImg.onload = function() {
    S.img = newImg;
    S.view.iw = outW;
    S.view.ih = outH;
    S.imgDataUrl = dataUrl;

    S.imageDirty = S.overlayDirty = true;
    fitView();
    updatePanel();

    // Clear stale pre-transform WebP and re-encode the corrected image.
    // Without this, serializeTab() would save the old WebP while shapes
    // are already in post-transform coordinates, corrupting reloaded state.
    const tab = S.tabs[S.currentTabIdx];
    if (tab) {
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
}
