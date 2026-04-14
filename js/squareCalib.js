// squareCalib.js — Self-contained square-based perspective calibration.
//
// Works as a proper tool ('squarecal') that reuses the same polyPts / polygon
// infrastructure as the polygon tool.  The user clicks 4 corners of an object
// known to be a real-world square; we compute the unique homography that maps
// that quadrilateral → an axis-aligned square, correcting the perspective and
// simultaneously calibrating the scale.
//
// Dependencies:
//   state.js      – S, fn
//   geometry.js   – i2s  (only needed for nothing here; kept for parity)
//   perspective.js – computeHomography, applyHomography, invertH,
//                    applyHomographyToImage

import { S, fn } from './state.js';
import {
  computeHomography,
  applyHomography,
  invertH,
  applyHomographyToImage
} from './perspective.js';

// ── Register on fn ───────────────────────────────────────────────────────────
fn.enterSqCalib   = enterSqCalib;
fn.cancelSqCalib  = cancelSqCalib;
fn.applySqCalib   = applySqCalib;
fn.onSqCalibPoint = onSqCalibPoint;   // called by input.js after each corner

// Override the mode-switch registered (stub) in perspective.js
fn.switchPerspMode = function(mode) {
  if (mode === 'auto') {
    if (S.perspActive) fn.cancelPerspective();
    enterSqCalib();
  } else {
    if (S.tool === 'squarecal') cancelSqCalib();
    fn.enterPerspective();
  }
};

// ── Enter / Cancel ────────────────────────────────────────────────────────────

function enterSqCalib() {
  if (!S.img) return;
  fn.setTool('squarecal');   // clears polyPts, sets cursor, updates status

  fn.enableTools(false);
  $('#btn-persp').addClass('active').removeClass('disabled');
  $('#persp-bar').addClass('visible');
  $('.persp-tab').removeClass('active');
  $('.persp-tab[data-persp-mode="auto"]').addClass('active');
  $('#persp-manual-content').addClass('hidden');
  $('#persp-auto-content').removeClass('hidden');
  updateHint();
}

function cancelSqCalib() {
  fn.setTool('idle');
  fn.enableTools(true);
  $('#btn-persp').removeClass('active');
  $('#persp-bar').removeClass('visible');
  fn.status('Square calibration cancelled.');
}

// ── Called by input.js after each corner click ────────────────────────────────

function onSqCalibPoint() {
  updateHint();
  if (S.polyPts.length === 4) {
    $('#sq-side-value').focus();
    fn.status('4 corners placed — enter side length and click Apply.');
  }
}

function updateHint() {
  var n = S.polyPts.length;
  var msg = n === 0 ? 'Click 4 corners of a real-world square (any order).' :
            n <  4 ? n + '/4 corners placed.' :
                     '4 corners placed. Enter side length and Apply.';
  $('#sq-hint').text(msg);
  $('#sq-calib-apply').toggleClass('disabled', n < 4);
}

// ── Apply ─────────────────────────────────────────────────────────────────────

function applySqCalib() {
  if (S.tool !== 'squarecal' || S.polyPts.length !== 4) return;

  var sideLen = parseFloat($('#sq-side-value').val());
  var unit    = $('#sq-side-unit').val();
  if (!sideLen || sideLen <= 0) {
    fn.status('Enter a valid side length > 0.');
    return;
  }

  // Order the 4 clicked points into [TL, TR, BR, BL] by image-axis position:
  //   TL = min(x+y),  BR = max(x+y),  TR = min(y-x),  BL = max(y-x)
  var pts = S.polyPts.slice();
  pts.sort(function(a, b) { return (a.x + a.y) - (b.x + b.y); });
  var tl = pts[0], br = pts[3];
  var mid = [pts[1], pts[2]];
  mid.sort(function(a, b) { return (a.y - a.x) - (b.y - b.x); });
  var tr = mid[0], bl = mid[1];

  // Target pixel side = average of the 4 sides
  var d = (Math.hypot(tr.x - tl.x, tr.y - tl.y) +
           Math.hypot(br.x - tr.x, br.y - tr.y) +
           Math.hypot(bl.x - br.x, bl.y - br.y) +
           Math.hypot(tl.x - bl.x, tl.y - bl.y)) / 4;
  if (d < 4) { fn.status('Square too small — click further apart.'); return; }

  // Output square centred at the centroid of the input quad
  var cx = (tl.x + tr.x + br.x + bl.x) / 4;
  var cy = (tl.y + tr.y + br.y + bl.y) / 4;
  var src = [tl, tr, br, bl];
  var dst = [
    { x: cx - d / 2, y: cy - d / 2 },   // TL
    { x: cx + d / 2, y: cy - d / 2 },   // TR
    { x: cx + d / 2, y: cy + d / 2 },   // BR
    { x: cx - d / 2, y: cy + d / 2 }    // BL
  ];

  var H    = computeHomography(src, dst);
  if (!H)    { fn.status('Could not compute perspective transform.'); return; }
  var Hinv = invertH(H);
  if (!Hinv) { fn.status('Could not invert transform.'); return; }

  // Pre-compute bounding-box offset (mirrors applyHomographyToImage internals)
  // so we can place the scale line in the new image coordinate space.
  var iw = S.view.iw, ih = S.view.ih;
  var imgCors = [
    applyHomography(H, 0,  0 ), applyHomography(H, iw, 0 ),
    applyHomography(H, iw, ih), applyHomography(H, 0,  ih)
  ];
  var minX = Infinity, minY = Infinity;
  for (var i = 0; i < 4; i++) {
    if (imgCors[i].x < minX) minX = imgCors[i].x;
    if (imgCors[i].y < minY) minY = imgCors[i].y;
  }
  minX = Math.max(minX, -Math.max(iw, ih) * 4);
  minY = Math.max(minY, -Math.max(iw, ih) * 4);
  var offX = Math.floor(minX), offY = Math.floor(minY);

  fn.status('Applying square calibration…');
  fn.setTool('idle');   // clears polyPts before the async image op

  applyHomographyToImage(H, Hinv, function() {
    // Scale: pixel side d corresponds to sideLen real-world units
    S.scalePPU  = d / sideLen;
    S.scaleUnit = unit;
    // Attach scale line to the top edge of the corrected square
    S.scaleLine = {
      p1: { x: dst[0].x - offX, y: dst[0].y - offY },
      p2: { x: dst[1].x - offX, y: dst[1].y - offY }
    };
    fn.updateScaleDisp();

    fn.enableTools(true);
    $('#btn-persp').removeClass('active');
    $('#persp-bar').removeClass('visible');
    S.overlayDirty = true;
    fn.status('Perspective corrected. Scale: 1 px = ' +
              (1 / S.scalePPU).toFixed(3) + ' ' + unit + '.');
    fn.scheduleSave();
  });
}

// ── jQuery event bindings ─────────────────────────────────────────────────────

$('#sq-calib-cancel').on('click', cancelSqCalib);
$('#sq-calib-apply').on('click', applySqCalib);
$('#sq-side-value').on('keydown', function(e) {
  if (e.key === 'Enter') applySqCalib();
});
