import { S, fn, worker, iCvs, oCvs } from './state.js';
import { i2s, centroid } from './geometry.js';

// Register into fn so tools.js can call cancelPerspective without importing us
fn.cancelPerspective = cancelPerspective;
fn.enterPerspective = enterPerspective;
fn.applyPerspective = applyPerspective;
fn.resetPerspective = resetPerspective;
fn.updatePerspPreview = updatePerspPreview;
fn.findPerspHandle = findPerspHandle;
fn.enterAutoPerspective = enterAutoPerspective;
fn.cancelAutoPerspective = cancelAutoPerspective;
fn.addAutoPerspSample = addAutoPerspSample;
fn.removeAutoPerspSample = removeAutoPerspSample;
fn.applyAutoPerspective = applyAutoPerspective;
fn.computeAutoPersp = computeAutoPersp;
fn.drawAutoPerspOverlay = drawAutoPerspOverlay;
fn.switchPerspMode = switchPerspMode;
// updateAutoPerspPreview removed — no CSS live preview for measure mode

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
  if (S.autoPerspActive) cancelAutoPerspective();
  fn.setTool('idle');
  S.perspActive = true;
  var iw = S.view.iw, ih = S.view.ih;
  S.perspSrcCorners = [{x:0,y:0},{x:iw,y:0},{x:iw,y:ih},{x:0,y:ih}];
  S.perspCorners = [{x:0,y:0},{x:iw,y:0},{x:iw,y:ih},{x:0,y:ih}];
  S.perspDragIdx = -1;
  fn.enableTools(false);
  $('#btn-persp').addClass('active').removeClass('disabled');
  $('#persp-bar').addClass('visible');
  $('.persp-tab').removeClass('active');
  $('.persp-tab[data-persp-mode="manual"]').addClass('active');
  $('#persp-manual-content').removeClass('hidden');
  $('#persp-auto-content').addClass('hidden');
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

  var Hfwd = computeHomography(S.perspSrcCorners, S.perspCorners);
  if (!Hfwd) { fn.status('Failed to compute perspective transform.'); return; }
  var Hinv = invertH(Hfwd);
  if (!Hinv) { fn.status('Failed to invert perspective transform.'); return; }

  applyHomographyToImage(Hfwd, Hinv, function() {
    S.perspActive = false; S.perspCorners = null; S.perspSrcCorners = null; S.perspDragIdx = -1;
    iCvs.style.opacity = ''; iCvs.style.transform = ''; iCvs.style.transformOrigin = '';
    oCvs.style.cursor = '';
    fn.enableTools(true);
    $('#btn-persp').removeClass('active');
    $('#persp-bar').removeClass('visible');
    fn.status('Perspective correction applied.');
  });
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

// ========== GENERALIZED HOMOGRAPHY (N >= 4 point correspondences) ==========

// Solve homography from N point correspondences using DLT + eigendecomposition
// For N=4, equivalent to solveLinear8. For N>4, least-squares solution.
function solveHomographyN(src, dst) {
  var n = src.length;
  if (n < 4) return null;
  if (n === 4) return computeHomography(src, dst);

  // Build 2N x 9 matrix A
  var A = [];
  for (var i = 0; i < n; i++) {
    var sx = src[i].x, sy = src[i].y, dx = dst[i].x, dy = dst[i].y;
    A.push([sx, sy, 1, 0, 0, 0, -dx * sx, -dx * sy, -dx]);
    A.push([0, 0, 0, sx, sy, 1, -dy * sx, -dy * sy, -dy]);
  }

  // Compute A^T * A (9x9 symmetric)
  var M = [];
  for (var i = 0; i < 9; i++) {
    M[i] = [];
    for (var j = 0; j < 9; j++) {
      var s = 0;
      for (var k = 0; k < 2 * n; k++) s += A[k][i] * A[k][j];
      M[i][j] = s;
    }
  }

  // Find eigenvector of smallest eigenvalue via inverse iteration
  var h = smallestEigenvector(M, 9);
  if (!h) return null;

  // Normalize so h[8] = 1
  if (Math.abs(h[8]) < 1e-12) return null;
  for (var i = 0; i < 9; i++) h[i] /= h[8];
  return h;
}

// Inverse iteration to find eigenvector of smallest eigenvalue of symmetric matrix
function smallestEigenvector(M, n) {
  // Shift to make smallest eigenvalue dominant: solve (M - sigma*I) * x = b
  // Use power iteration on M^{-1} (inverse iteration with shift 0)

  // Start with random vector
  var x = [];
  for (var i = 0; i < n; i++) x[i] = (i === n - 1) ? 1 : 0.1 * (i + 1);

  // Copy M and do LU decomposition for solving
  var LU = [];
  for (var i = 0; i < n; i++) {
    LU[i] = [];
    for (var j = 0; j < n; j++) LU[i][j] = M[i][j];
  }

  // Regularize slightly to avoid singularity
  for (var i = 0; i < n; i++) LU[i][i] += 1e-10;

  // LU factorization with partial pivoting
  var piv = [];
  for (var i = 0; i < n; i++) piv[i] = i;

  for (var col = 0; col < n; col++) {
    var maxVal = Math.abs(LU[col][col]), maxRow = col;
    for (var row = col + 1; row < n; row++) {
      if (Math.abs(LU[row][col]) > maxVal) { maxVal = Math.abs(LU[row][col]); maxRow = row; }
    }
    if (maxRow !== col) {
      var tmp = LU[col]; LU[col] = LU[maxRow]; LU[maxRow] = tmp;
      var pt = piv[col]; piv[col] = piv[maxRow]; piv[maxRow] = pt;
    }
    if (Math.abs(LU[col][col]) < 1e-14) return null;
    for (var row = col + 1; row < n; row++) {
      LU[row][col] /= LU[col][col];
      for (var j = col + 1; j < n; j++) LU[row][j] -= LU[row][col] * LU[col][j];
    }
  }

  function solveLU(b) {
    var y = [];
    for (var i = 0; i < n; i++) y[i] = b[piv[i]];
    // Forward substitution
    for (var i = 1; i < n; i++) {
      for (var j = 0; j < i; j++) y[i] -= LU[i][j] * y[j];
    }
    // Back substitution
    for (var i = n - 1; i >= 0; i--) {
      for (var j = i + 1; j < n; j++) y[i] -= LU[i][j] * y[j];
      y[i] /= LU[i][i];
    }
    return y;
  }

  // Inverse iteration: 20 iterations
  for (var iter = 0; iter < 20; iter++) {
    var y = solveLU(x);
    // Normalize
    var norm = 0;
    for (var i = 0; i < n; i++) norm += y[i] * y[i];
    norm = Math.sqrt(norm);
    if (norm < 1e-15) return null;
    for (var i = 0; i < n; i++) x[i] = y[i] / norm;
  }

  return x;
}

// ========== AUTO PERSPECTIVE CORRECTION ==========

function switchPerspMode(mode) {
  if (mode === 'auto') {
    // Switch from manual to auto
    if (S.perspActive) cancelPerspective();
    enterAutoPerspective();
  } else {
    // Switch from auto to manual
    if (S.autoPerspActive) cancelAutoPerspective();
    enterPerspective();
  }
}

function enterAutoPerspective() {
  if (!S.img || S.autoPerspActive) return;
  fn.setTool('idle');
  S.autoPerspActive = true;
  S.autoPerspSamples = [];
  S.autoPerspState = 0;
  S.autoPerspP1 = null;
  S.autoPerspP2 = null;
  S.autoPerspPreviewH = null;
  S.autoPerspPreviewInv = null;

  fn.enableTools(false);
  $('#btn-persp').addClass('active').removeClass('disabled');
  $('#persp-bar').addClass('visible');
  $('.persp-tab').removeClass('active');
  $('.persp-tab[data-persp-mode="auto"]').addClass('active');
  $('#persp-manual-content').addClass('hidden');
  $('#persp-auto-content').removeClass('hidden');
  updateAutoSamplesList();
  $('body').addClass('cursor-crosshair');
  S.overlayDirty = true;
  fn.status('Click first point of a known measurement.');
}

function cancelAutoPerspective() {
  if (!S.autoPerspActive) return;
  S.autoPerspActive = false;
  S.autoPerspSamples = [];
  S.autoPerspState = 0;
  S.autoPerspP1 = null;
  S.autoPerspP2 = null;
  S.autoPerspPreviewH = null;
  S.autoPerspPreviewInv = null;

  oCvs.style.cursor = '';
  $('body').removeClass('cursor-crosshair');
  fn.enableTools(true);
  $('#btn-persp').removeClass('active');
  $('#persp-bar').removeClass('visible');
  $('#auto-persp-popup').hide();
  S.overlayDirty = true;
  S.imageDirty = true;
  fn.status('Auto perspective mode exited.');
}

function addAutoPerspSample(dist, unit) {
  if (!S.autoPerspP1 || !S.autoPerspP2 || !dist || dist <= 0) return;

  S.autoPerspSamples.push({
    p1: { x: S.autoPerspP1.x, y: S.autoPerspP1.y },
    p2: { x: S.autoPerspP2.x, y: S.autoPerspP2.y },
    dist: dist,
    unit: unit
  });

  S.autoPerspP1 = null;
  S.autoPerspP2 = null;
  S.autoPerspState = 0;
  $('#auto-persp-popup').hide();

  updateAutoSamplesList();

  S.overlayDirty = true;
  fn.status('Sample added (' + S.autoPerspSamples.length + ' total). ' +
    (S.autoPerspSamples.length < 2 ? 'Add at least one more.' : 'Click Apply or add more samples.'));
}

function removeAutoPerspSample(idx) {
  S.autoPerspSamples.splice(idx, 1);
  updateAutoSamplesList();
  S.overlayDirty = true;
}

function updateAutoSamplesList() {
  var $list = $('#ap-samples');
  $list.empty();

  for (var i = 0; i < S.autoPerspSamples.length; i++) {
    var s = S.autoPerspSamples[i];
    var pxLen = Math.hypot(s.p2.x - s.p1.x, s.p2.y - s.p1.y);
    $list.append(
      '<div class="ap-sample" data-idx="' + i + '">' +
        '<span class="ap-idx">' + (i + 1) + '</span>' +
        '<span class="ap-info">' + s.dist + ' ' + s.unit + ' (' + Math.round(pxLen) + 'px)</span>' +
        '<button class="ap-del" data-idx="' + i + '">&times;</button>' +
      '</div>'
    );
  }

  var hasEnough = S.autoPerspSamples.length >= 2;
  if (hasEnough) {
    $('#auto-persp-apply').removeClass('disabled');
  } else {
    $('#auto-persp-apply').addClass('disabled');
  }

  // Update hint
  if (S.autoPerspSamples.length === 0) {
    $('#ap-hint').text('Click two points to define a known measurement. Add 2+ samples, then apply.');
  } else if (S.autoPerspSamples.length === 1) {
    $('#ap-hint').text('1 sample added. Add at least 1 more at a different position.');
  } else {
    $('#ap-hint').text(S.autoPerspSamples.length + ' samples. Click Apply to correct, or add more.');
  }
}

// Normalize all sample distances to a common unit for comparison
function normalizeToMeters(dist, unit) {
  switch (unit) {
    case 'mm': return dist / 1000;
    case 'cm': return dist / 100;
    case 'm':  return dist;
    case 'in': return dist * 0.0254;
    case 'ft': return dist * 0.3048;
    case 'yd': return dist * 0.9144;
    default:   return dist;
  }
}

// Multiply two 3x3 homography matrices (as 9-element arrays)
function multiplyH(A, B) {
  // A and B are [a0..a8] representing row-major 3x3
  return [
    A[0]*B[0] + A[1]*B[3] + A[2]*B[6],  A[0]*B[1] + A[1]*B[4] + A[2]*B[7],  A[0]*B[2] + A[1]*B[5] + A[2]*B[8],
    A[3]*B[0] + A[4]*B[3] + A[5]*B[6],  A[3]*B[1] + A[4]*B[4] + A[5]*B[7],  A[3]*B[2] + A[4]*B[5] + A[5]*B[8],
    A[6]*B[0] + A[7]*B[3] + A[8]*B[6],  A[6]*B[1] + A[7]*B[4] + A[8]*B[7],  A[6]*B[2] + A[7]*B[5] + A[8]*B[8]
  ];
}

// Compute a single-step homography correction from a set of samples
// (all samples must be in the same coordinate space)
function computeStepHomography(pts) {
  // Compute PPU for each sample
  var ppus = [];
  for (var i = 0; i < pts.length; i++) {
    var pxLen = Math.hypot(pts[i].p2.x - pts[i].p1.x, pts[i].p2.y - pts[i].p1.y);
    var realM = normalizeToMeters(pts[i].dist, pts[i].unit);
    if (realM > 0 && pxLen > 0) ppus.push({ idx: i, ppu: pxLen / realM });
  }
  if (ppus.length < 2) return null;

  // Target PPU: median
  ppus.sort(function(a, b) { return a.ppu - b.ppu; });
  var targetPPU = ppus[Math.floor(ppus.length / 2)].ppu;

  // Check if correction is negligible (all PPUs within 0.1% of target)
  var maxDev = 0;
  for (var i = 0; i < ppus.length; i++) {
    var dev = Math.abs(ppus[i].ppu - targetPPU) / targetPPU;
    if (dev > maxDev) maxDev = dev;
  }
  if (maxDev < 0.001) return null; // already corrected enough

  // Build src → dst point pairs
  var srcPts = [];
  var dstPts = [];
  for (var i = 0; i < pts.length; i++) {
    var s = pts[i];
    var realM = normalizeToMeters(s.dist, s.unit);
    var targetPxLen = realM * targetPPU;
    var midX = (s.p1.x + s.p2.x) / 2;
    var midY = (s.p1.y + s.p2.y) / 2;
    var dx = s.p2.x - s.p1.x;
    var dy = s.p2.y - s.p1.y;
    var curLen = Math.hypot(dx, dy);
    if (curLen < 1) continue;

    var dirX = dx / curLen;
    var dirY = dy / curLen;

    srcPts.push(s.p1);
    srcPts.push(s.p2);
    dstPts.push({ x: midX - dirX * targetPxLen / 2, y: midY - dirY * targetPxLen / 2 });
    dstPts.push({ x: midX + dirX * targetPxLen / 2, y: midY + dirY * targetPxLen / 2 });
  }
  if (srcPts.length < 4) return null;

  return solveHomographyN(srcPts, dstPts);
}

function computeAutoPersp() {
  var samples = S.autoPerspSamples;
  if (samples.length < 2) return null;

  // Work on copies of all sample points (in original image space)
  var pts = samples.map(function(s) {
    return {
      p1: { x: s.p1.x, y: s.p1.y },
      p2: { x: s.p2.x, y: s.p2.y },
      dist: s.dist,
      unit: s.unit
    };
  });

  // Iteratively compose transforms:
  // Step 1: compute H from first 2 samples, transform all points
  // Step 2: compute refinement H' from first 3 (now in corrected space), compose
  // Step N: each new sample refines from already-corrected space
  var Hacc = null;

  for (var n = 2; n <= pts.length; n++) {
    var stepH = computeStepHomography(pts.slice(0, n));
    if (!stepH) continue;

    // Compose: Hacc maps original → current corrected space
    Hacc = Hacc ? multiplyH(stepH, Hacc) : stepH;

    // Transform ALL sample points through this step (glue to corrected pixels)
    for (var i = 0; i < pts.length; i++) {
      var np1 = applyHomography(stepH, pts[i].p1.x, pts[i].p1.y);
      var np2 = applyHomography(stepH, pts[i].p2.x, pts[i].p2.y);
      pts[i].p1 = np1;
      pts[i].p2 = np2;
      // real-world distance stays the same
    }
  }

  if (!Hacc) { fn.status('Samples are already consistent — no correction needed.'); return null; }

  // Normalize so H[8] = 1
  if (Math.abs(Hacc[8]) > 1e-12) {
    for (var i = 0; i < 9; i++) Hacc[i] /= Hacc[8];
  }

  var Hinv = invertH(Hacc);
  if (!Hinv) { fn.status('Could not invert transform.'); return null; }

  return { H: Hacc, Hinv: Hinv };
}

// CSS live preview removed — auto-persp now applies directly

function applyAutoPerspective() {
  if (!S.autoPerspActive || S.autoPerspSamples.length < 2) return;

  // Compute homography from current samples
  var result = computeAutoPersp();
  if (!result) return; // already consistent or error

  var H = result.H;
  var Hinv = result.Hinv;

  fn.status('Applying auto perspective correction...');

  // Compute bounding box offset so we can adjust sample points after render
  var iw = S.view.iw, ih = S.view.ih;
  var corners = [
    applyHomography(H, 0, 0), applyHomography(H, iw, 0),
    applyHomography(H, iw, ih), applyHomography(H, 0, ih)
  ];
  var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (var i = 0; i < 4; i++) {
    if (corners[i].x < minX) minX = corners[i].x;
    if (corners[i].y < minY) minY = corners[i].y;
    if (corners[i].x > maxX) maxX = corners[i].x;
    if (corners[i].y > maxY) maxY = corners[i].y;
  }
  var maxDim = Math.max(iw, ih) * 4;
  minX = Math.max(minX, -maxDim); minY = Math.max(minY, -maxDim);
  maxX = Math.min(maxX, maxDim); maxY = Math.min(maxY, maxDim);
  var offX = Math.floor(minX);
  var offY = Math.floor(minY);

  applyHomographyToImage(H, Hinv, function() {
    // Transform all sample points to new image space (same as shapes/scale)
    for (var i = 0; i < S.autoPerspSamples.length; i++) {
      var s = S.autoPerspSamples[i];
      var np1 = applyHomography(H, s.p1.x, s.p1.y);
      var np2 = applyHomography(H, s.p2.x, s.p2.y);
      s.p1 = { x: np1.x - offX, y: np1.y - offY };
      s.p2 = { x: np2.x - offX, y: np2.y - offY };
      // dist and unit stay the same — user's measured values are preserved
    }

    // Clear preview state but stay in auto-persp mode
    S.autoPerspPreviewH = null;
    S.autoPerspPreviewInv = null;
    S.autoPerspState = 0;
    S.autoPerspP1 = null;
    S.autoPerspP2 = null;
    $('#auto-persp-popup').hide();

    // Update UI to show transformed samples
    updateAutoSamplesList();
    S.overlayDirty = true;

    fn.status('Correction applied. Add more samples or click Done.');
  });
}

// ========== INFINITE CANVAS: Shared perspective application ==========
// Used by both manual and auto perspective correction

function applyHomographyToImage(Hfwd, Hinv, onComplete) {
  var iw = S.view.iw, ih = S.view.ih;

  // Compute output bounding box by transforming all 4 corners through Hfwd
  var corners = [
    applyHomography(Hfwd, 0, 0),
    applyHomography(Hfwd, iw, 0),
    applyHomography(Hfwd, iw, ih),
    applyHomography(Hfwd, 0, ih)
  ];

  var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (var i = 0; i < 4; i++) {
    if (corners[i].x < minX) minX = corners[i].x;
    if (corners[i].y < minY) minY = corners[i].y;
    if (corners[i].x > maxX) maxX = corners[i].x;
    if (corners[i].y > maxY) maxY = corners[i].y;
  }

  // Clamp to reasonable bounds (max 4x original size to prevent OOM)
  var maxDim = Math.max(iw, ih) * 4;
  minX = Math.max(minX, -maxDim);
  minY = Math.max(minY, -maxDim);
  maxX = Math.min(maxX, maxDim);
  maxY = Math.min(maxY, maxDim);

  var offX = Math.floor(minX);
  var offY = Math.floor(minY);
  var outW = Math.ceil(maxX) - offX;
  var outH = Math.ceil(maxY) - offY;

  // Get source pixels
  var srcCvs = document.createElement('canvas');
  srcCvs.width = iw; srcCvs.height = ih;
  var srcCtx = srcCvs.getContext('2d');
  srcCtx.drawImage(S.img, 0, 0);
  var srcData = srcCtx.getImageData(0, 0, iw, ih);
  var srcPx = srcData.data;

  // Create output
  var tmpCvs = document.createElement('canvas');
  tmpCvs.width = outW; tmpCvs.height = outH;
  var tmpCtx = tmpCvs.getContext('2d');
  var outData = tmpCtx.createImageData(outW, outH);
  var outPx = outData.data;

  // Render: for each output pixel, find source via inverse transform
  for (var oy = 0; oy < outH; oy++) {
    for (var ox = 0; ox < outW; ox++) {
      var sp = applyHomography(Hinv, ox + offX, oy + offY);
      var ssx = sp.x, ssy = sp.y;
      var outIdx = (oy * outW + ox) * 4;

      if (ssx < 0 || ssx >= iw - 1 || ssy < 0 || ssy >= ih - 1) {
        outPx[outIdx] = outPx[outIdx + 1] = outPx[outIdx + 2] = outPx[outIdx + 3] = 0;
        continue;
      }

      // Bilinear interpolation
      var x0 = Math.floor(ssx), y0 = Math.floor(ssy);
      var fx = ssx - x0, fy = ssy - y0;
      var x1 = Math.min(x0 + 1, iw - 1), y1 = Math.min(y0 + 1, ih - 1);
      var i00 = (y0 * iw + x0) * 4, i10 = (y0 * iw + x1) * 4;
      var i01 = (y1 * iw + x0) * 4, i11 = (y1 * iw + x1) * 4;

      for (var c = 0; c < 4; c++) {
        outPx[outIdx + c] = Math.round(
          srcPx[i00 + c] * (1 - fx) * (1 - fy) + srcPx[i10 + c] * fx * (1 - fy) +
          srcPx[i01 + c] * (1 - fx) * fy + srcPx[i11 + c] * fx * fy);
      }
    }
  }
  tmpCtx.putImageData(outData, 0, 0);

  // Transform shape points: new_pt = H(old_pt) - offset
  var oldScalePxLen = 0;
  if (S.scaleLine && S.scalePPU > 0) {
    oldScalePxLen = Math.hypot(S.scaleLine.p2.x - S.scaleLine.p1.x, S.scaleLine.p2.y - S.scaleLine.p1.y);
  }

  for (var si = 0; si < S.shapes.length; si++) {
    var shape = S.shapes[si];
    for (var pi = 0; pi < shape.points.length; pi++) {
      var pt = shape.points[pi];
      var np = applyHomography(Hfwd, pt.x, pt.y);
      shape.points[pi] = { x: np.x - offX, y: np.y - offY };
    }
    if (shape.closed) worker.postMessage({ type: 'calcArea', id: shape.id, points: shape.points });
  }

  if (S.scaleLine) {
    var np1 = applyHomography(Hfwd, S.scaleLine.p1.x, S.scaleLine.p1.y);
    var np2 = applyHomography(Hfwd, S.scaleLine.p2.x, S.scaleLine.p2.y);
    S.scaleLine.p1 = { x: np1.x - offX, y: np1.y - offY };
    S.scaleLine.p2 = { x: np2.x - offX, y: np2.y - offY };
    if (S.scalePPU > 0 && oldScalePxLen > 0) {
      var realDist = oldScalePxLen / S.scalePPU;
      S.scalePPU = Math.hypot(np2.x - np1.x, np2.y - np1.y) / realDist;
      fn.updateScaleDisp();
    }
  }

  // Load new image
  var dataUrl = tmpCvs.toDataURL('image/png');
  var newImg = new Image();
  newImg.onload = function() {
    S.img = newImg;
    S.view.iw = outW;
    S.view.ih = outH;
    S.imgDataUrl = dataUrl;

    S.imageDirty = S.overlayDirty = true;
    fn.fitView();
    fn.updatePanel();
    fn.scheduleSave();

    if (onComplete) onComplete();
  };
  newImg.src = dataUrl;
}

// ========== AUTO PERSPECTIVE OVERLAY ==========

export function drawAutoPerspOverlay(ctx) {
  if (!S.autoPerspActive) return;
  ctx.save();

  var s = S.view.zoom * S.view.fit;
  var inv = 1 / s;
  var sampleColor = '#22D88E';

  // Draw completed samples
  for (var i = 0; i < S.autoPerspSamples.length; i++) {
    var samp = S.autoPerspSamples[i];
    var sp1 = i2s(samp.p1.x, samp.p1.y);
    var sp2 = i2s(samp.p2.x, samp.p2.y);

    // Line
    ctx.beginPath();
    ctx.setLineDash([6, 4]);
    ctx.strokeStyle = sampleColor;
    ctx.lineWidth = 2;
    ctx.moveTo(sp1.x, sp1.y);
    ctx.lineTo(sp2.x, sp2.y);
    ctx.stroke();
    ctx.setLineDash([]);

    // Endpoints
    ctx.beginPath(); ctx.arc(sp1.x, sp1.y, 5, 0, Math.PI * 2);
    ctx.fillStyle = sampleColor; ctx.fill();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.stroke();

    ctx.beginPath(); ctx.arc(sp2.x, sp2.y, 5, 0, Math.PI * 2);
    ctx.fillStyle = sampleColor; ctx.fill();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.stroke();

    // Label
    var midX = (sp1.x + sp2.x) / 2;
    var midY = (sp1.y + sp2.y) / 2;
    var label = (i + 1) + ': ' + samp.dist + samp.unit;
    ctx.font = '600 10px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    var tw = ctx.measureText(label).width + 8;

    ctx.fillStyle = 'rgba(0,0,0,0.8)';
    ctx.beginPath();
    ctx.roundRect ? ctx.roundRect(midX - tw / 2, midY - 9, tw, 18, 3) :
      (function() {
        var x = midX - tw / 2, y = midY - 9, w = tw, h = 18, r = 3;
        ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.arcTo(x + w, y, x + w, y + r, r);
        ctx.lineTo(x + w, y + h - r); ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
        ctx.lineTo(x + r, y + h); ctx.arcTo(x, y + h, x, y + h - r, r);
        ctx.lineTo(x, y + r); ctx.arcTo(x, y, x + r, y, r); ctx.closePath();
      })();
    ctx.fill();
    ctx.fillStyle = sampleColor;
    ctx.fillText(label, midX, midY);
  }

  // Draw current in-progress sample
  if (S.autoPerspP1) {
    var sp1 = i2s(S.autoPerspP1.x, S.autoPerspP1.y);
    var activeColor = '#FFD740';

    // Dot at p1
    ctx.beginPath(); ctx.arc(sp1.x, sp1.y, 5, 0, Math.PI * 2);
    ctx.fillStyle = activeColor; ctx.fill();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.stroke();

    // Line to mouse/p2
    var endPt;
    if (S.autoPerspP2) {
      endPt = i2s(S.autoPerspP2.x, S.autoPerspP2.y);
    } else {
      endPt = { x: S.mx, y: S.my };
    }

    ctx.beginPath();
    ctx.setLineDash([6, 4]);
    ctx.strokeStyle = activeColor;
    ctx.lineWidth = 2;
    ctx.moveTo(sp1.x, sp1.y);
    ctx.lineTo(endPt.x, endPt.y);
    ctx.stroke();
    ctx.setLineDash([]);

    if (S.autoPerspP2) {
      ctx.beginPath(); ctx.arc(endPt.x, endPt.y, 5, 0, Math.PI * 2);
      ctx.fillStyle = activeColor; ctx.fill();
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.stroke();
    }
  }

  ctx.restore();
}
