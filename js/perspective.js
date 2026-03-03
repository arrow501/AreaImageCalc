import { S, fn, worker, iCvs, oCvs } from './state.js';
import { i2s, centroid } from './geometry.js';

// Register into fn so tools.js can call cancelPerspective without importing us
fn.cancelPerspective = cancelPerspective;
fn.enterPerspective = enterPerspective;
fn.applyPerspective = applyPerspective;
fn.resetPerspective = resetPerspective;
fn.updatePerspPreview = updatePerspPreview;
fn.findPerspHandle = findPerspHandle;

function solveLinear8(A) {
  var n = 8;
  for (var col = 0; col < n; col++) {
    var maxVal = Math.abs(A[col][col]), maxRow = col;
    for (var row = col + 1; row < n; row++) {
      if (Math.abs(A[row][col]) > maxVal) { maxVal = Math.abs(A[row][col]); maxRow = row; }
    }
    var tmp = A[col]; A[col] = A[maxRow]; A[maxRow] = tmp;
    var pivot = A[col][col];
    if (Math.abs(pivot) < 1e-12) return null;
    for (var j = col; j <= n; j++) A[col][j] /= pivot;
    for (var row = 0; row < n; row++) {
      if (row === col) continue;
      var f = A[row][col];
      for (var j = col; j <= n; j++) A[row][j] -= f * A[col][j];
    }
  }
  var x = [];
  for (var i = 0; i < n; i++) x.push(A[i][n]);
  return x;
}

export function computeHomography(src, dst) {
  var A = [];
  for (var i = 0; i < 4; i++) {
    var sx = src[i].x, sy = src[i].y, dx = dst[i].x, dy = dst[i].y;
    A.push([sx, sy, 1, 0, 0, 0, -dx * sx, -dx * sy, dx]);
    A.push([0, 0, 0, sx, sy, 1, -dy * sx, -dy * sy, dy]);
  }
  var h = solveLinear8(A);
  if (!h) return null;
  h.push(1);
  return h;
}

export function applyHomography(H, x, y) {
  var w = H[6] * x + H[7] * y + H[8];
  return { x: (H[0] * x + H[1] * y + H[2]) / w, y: (H[3] * x + H[4] * y + H[5]) / w };
}

export function invertH(H) {
  var a=H[0],b=H[1],c=H[2],d=H[3],e=H[4],f=H[5],g=H[6],h=H[7],k=H[8];
  var det = a*(e*k-f*h) - b*(d*k-f*g) + c*(d*h-e*g);
  if (Math.abs(det) < 1e-12) return null;
  var inv = 1/det;
  return [
    (e*k-f*h)*inv, (c*h-b*k)*inv, (b*f-c*e)*inv,
    (f*g-d*k)*inv, (a*k-c*g)*inv, (c*d-a*f)*inv,
    (d*h-e*g)*inv, (b*g-a*h)*inv, (a*e-b*d)*inv
  ];
}

function computeCSS3dMatrix(w, h, dst) {
  var src = [{x:0,y:0},{x:w,y:0},{x:w,y:h},{x:0,y:h}];
  var H = computeHomography(src, dst);
  if (!H) return null;
  return 'matrix3d(' +
    H[0]+','+H[3]+',0,'+H[6]+','+
    H[1]+','+H[4]+',0,'+H[7]+','+
    '0,0,1,0,'+
    H[2]+','+H[5]+',0,'+H[8]+')';
}

export function enterPerspective() {
  if (!S.img || S.perspActive) return;
  fn.setTool('idle');
  S.perspActive = true;
  var iw = S.view.iw, ih = S.view.ih;
  S.perspSrcCorners = [{x:0,y:0},{x:iw,y:0},{x:iw,y:ih},{x:0,y:ih}];
  S.perspCorners = [{x:0,y:0},{x:iw,y:0},{x:iw,y:ih},{x:0,y:ih}];
  S.perspDragIdx = -1;
  fn.enableTools(false);
  $('#btn-persp').addClass('active').removeClass('disabled');
  $('#persp-bar').addClass('visible');
  iCvs.style.opacity = '0.6';
  iCvs.style.transformOrigin = '0 0';
  S.overlayDirty = true;
  fn.status('Drag corner handles to correct perspective. Apply when done.');
}

export function cancelPerspective() {
  if (!S.perspActive) return;
  S.perspActive = false;
  S.perspCorners = null; S.perspSrcCorners = null; S.perspDragIdx = -1;
  iCvs.style.opacity = '';
  iCvs.style.transform = '';
  iCvs.style.transformOrigin = '';
  oCvs.style.cursor = '';
  fn.enableTools(true);
  $('#btn-persp').removeClass('active');
  $('#persp-bar').removeClass('visible');
  S.overlayDirty = true; S.imageDirty = true;
  fn.status('Perspective correction cancelled.');
}

export function resetPerspective() {
  if (!S.perspActive) return;
  var iw = S.view.iw, ih = S.view.ih;
  S.perspCorners = [{x:0,y:0},{x:iw,y:0},{x:iw,y:ih},{x:0,y:ih}];
  iCvs.style.transform = '';
  S.overlayDirty = true;
  fn.status('Corners reset. Drag to adjust.');
}

export function updatePerspPreview() {
  if (!S.perspActive || !S.perspCorners) return;
  var moved = false;
  for (var i = 0; i < 4; i++) {
    if (Math.abs(S.perspCorners[i].x - S.perspSrcCorners[i].x) > 0.5 ||
        Math.abs(S.perspCorners[i].y - S.perspSrcCorners[i].y) > 0.5) { moved = true; break; }
  }
  if (!moved) { iCvs.style.transform = ''; return; }
  var srcS = [], dstS = [];
  for (var i = 0; i < 4; i++) {
    srcS.push(i2s(S.perspSrcCorners[i].x, S.perspSrcCorners[i].y));
    dstS.push(i2s(S.perspCorners[i].x, S.perspCorners[i].y));
  }
  var H = computeHomography(srcS, dstS);
  if (!H) return;
  var c0 = applyHomography(H,0,0), c1 = applyHomography(H,S.cw,0);
  var c2 = applyHomography(H,S.cw,S.ch), c3 = applyHomography(H,0,S.ch);
  var css = computeCSS3dMatrix(S.cw, S.ch, [c0, c1, c2, c3]);
  if (css) iCvs.style.transform = css;
}

export function applyPerspective() {
  if (!S.perspActive || !S.perspCorners) return;
  var moved = false;
  for (var i = 0; i < 4; i++) {
    if (Math.abs(S.perspCorners[i].x - S.perspSrcCorners[i].x) > 0.5 ||
        Math.abs(S.perspCorners[i].y - S.perspSrcCorners[i].y) > 0.5) { moved = true; break; }
  }
  if (!moved) { cancelPerspective(); return; }
  fn.status('Applying perspective correction...');

  var outW = S.view.iw, outH = S.view.ih;
  var Hfwd = computeHomography(S.perspSrcCorners, S.perspCorners);
  if (!Hfwd) { fn.status('Failed to compute perspective transform.'); return; }
  var Hinv = invertH(Hfwd);
  if (!Hinv) { fn.status('Failed to invert perspective transform.'); return; }

  var srcCvs = document.createElement('canvas');
  srcCvs.width = outW; srcCvs.height = outH;
  var srcCtx = srcCvs.getContext('2d');
  srcCtx.drawImage(S.img, 0, 0);
  var srcData = srcCtx.getImageData(0, 0, outW, outH);
  var srcPx = srcData.data;

  var tmpCvs = document.createElement('canvas');
  tmpCvs.width = outW; tmpCvs.height = outH;
  var tmpCtx = tmpCvs.getContext('2d');
  var outData = tmpCtx.createImageData(outW, outH);
  var outPx = outData.data;
  var sw = outW, sh = outH;

  for (var oy = 0; oy < outH; oy++) {
    for (var ox = 0; ox < outW; ox++) {
      var sp = applyHomography(Hinv, ox, oy);
      var ssx = sp.x, ssy = sp.y;
      var outIdx = (oy * outW + ox) * 4;
      if (ssx < 0 || ssx >= sw - 1 || ssy < 0 || ssy >= sh - 1) {
        outPx[outIdx] = outPx[outIdx+1] = outPx[outIdx+2] = outPx[outIdx+3] = 0;
        continue;
      }
      var x0 = Math.floor(ssx), y0 = Math.floor(ssy);
      var fx = ssx - x0, fy = ssy - y0;
      var x1 = Math.min(x0+1, sw-1), y1 = Math.min(y0+1, sh-1);
      var i00 = (y0*sw+x0)*4, i10 = (y0*sw+x1)*4, i01 = (y1*sw+x0)*4, i11 = (y1*sw+x1)*4;
      for (var c = 0; c < 4; c++) {
        outPx[outIdx+c] = Math.round(
          srcPx[i00+c]*(1-fx)*(1-fy) + srcPx[i10+c]*fx*(1-fy) +
          srcPx[i01+c]*(1-fx)*fy + srcPx[i11+c]*fx*fy);
      }
    }
  }
  tmpCtx.putImageData(outData, 0, 0);

  var oldScalePxLen = 0;
  if (S.scaleLine && S.scalePPU > 0) {
    oldScalePxLen = Math.hypot(S.scaleLine.p2.x - S.scaleLine.p1.x, S.scaleLine.p2.y - S.scaleLine.p1.y);
  }

  for (var si = 0; si < S.shapes.length; si++) {
    var shape = S.shapes[si];
    for (var pi = 0; pi < shape.points.length; pi++) {
      var pt = shape.points[pi];
      var np = applyHomography(Hfwd, pt.x, pt.y);
      shape.points[pi] = { x: np.x, y: np.y };
    }
    if (shape.closed) worker.postMessage({ type: 'calcArea', id: shape.id, points: shape.points });
  }
  if (S.scaleLine) {
    var np1 = applyHomography(Hfwd, S.scaleLine.p1.x, S.scaleLine.p1.y);
    var np2 = applyHomography(Hfwd, S.scaleLine.p2.x, S.scaleLine.p2.y);
    S.scaleLine.p1 = np1; S.scaleLine.p2 = np2;
    if (S.scalePPU > 0 && oldScalePxLen > 0) {
      var realDist = oldScalePxLen / S.scalePPU;
      S.scalePPU = Math.hypot(np2.x - np1.x, np2.y - np1.y) / realDist;
      fn.updateScaleDisp();
    }
  }

  var dataUrl = tmpCvs.toDataURL('image/png');
  var newImg = new Image();
  newImg.onload = function() {
    S.img = newImg;
    S.imgDataUrl = dataUrl;
    S.perspActive = false; S.perspCorners = null; S.perspSrcCorners = null; S.perspDragIdx = -1;
    iCvs.style.opacity = ''; iCvs.style.transform = ''; iCvs.style.transformOrigin = '';
    oCvs.style.cursor = '';
    fn.enableTools(true);
    $('#btn-persp').removeClass('active');
    $('#persp-bar').removeClass('visible');
    S.imageDirty = S.overlayDirty = true;
    fn.updatePanel();
    fn.status('Perspective correction applied.');
    fn.scheduleSave();
  };
  newImg.src = dataUrl;
}

export function drawPerspOverlay(ctx) {
  if (!S.perspActive || !S.perspCorners) return;
  ctx.save();

  var GL = 8;
  var tl = i2s(0,0), tr = i2s(S.view.iw,0), bl = i2s(0,S.view.ih), br = i2s(S.view.iw,S.view.ih);

  ctx.strokeStyle = 'rgba(74,158,255,0.25)';
  ctx.lineWidth = 1;
  ctx.setLineDash([4,4]);
  for (var i = 1; i < GL; i++) {
    var t = i/GL;
    ctx.beginPath();
    ctx.moveTo(tl.x+(bl.x-tl.x)*t, tl.y+(bl.y-tl.y)*t);
    ctx.lineTo(tr.x+(br.x-tr.x)*t, tr.y+(br.y-tr.y)*t);
    ctx.stroke();
  }
  for (var i = 1; i < GL; i++) {
    var t = i/GL;
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

  var cs = [];
  for (var i = 0; i < 4; i++) cs.push(i2s(S.perspCorners[i].x, S.perspCorners[i].y));
  ctx.strokeStyle = '#FF6B35'; ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(cs[0].x,cs[0].y);
  for (var i = 1; i < 4; i++) ctx.lineTo(cs[i].x,cs[i].y);
  ctx.closePath(); ctx.stroke();

  var HR = 8;
  var labels = ['TL','TR','BR','BL'];
  ctx.font = '600 9px "JetBrains Mono", monospace';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (var i = 0; i < 4; i++) {
    var cp = cs[i], active = (i === S.perspDragIdx);
    ctx.beginPath(); ctx.arc(cp.x,cp.y,HR,0,Math.PI*2);
    ctx.fillStyle = active ? '#FF6B35' : 'rgba(255,107,53,0.8)';
    ctx.fill();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.fillText(labels[i], cp.x, cp.y);
  }
  ctx.restore();
}

export function findPerspHandle(sx, sy) {
  for (var i = 0; i < 4; i++) {
    var sp = i2s(S.perspCorners[i].x, S.perspCorners[i].y);
    if (Math.hypot(sx - sp.x, sy - sp.y) <= 12) return i;
  }
  return -1;
}
