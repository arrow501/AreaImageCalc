import { S, COLORS, $wrap, iCvs, oCvs, iCtx, oCtx } from './state.js';
import { s2i, i2s, centroid, fmtArea, fmtLen, segmentLength, findNearestPt, dot, roundRect } from './geometry.js';
import { drawPerspOverlay } from './perspective.js';
import './squareCalib.js';   // ensures squarecal event listeners are registered

export function resize() {
  const w = $wrap.width(), h = $wrap.height();
  if (w === S.cw && h === S.ch) return;

  S.cw = w;
  S.ch = h;
  S.dpr = window.devicePixelRatio || 1;

  iCvs.style.width = oCvs.style.width = w + 'px';
  iCvs.style.height = oCvs.style.height = h + 'px';

  iCvs.width = oCvs.width = w * S.dpr;
  iCvs.height = oCvs.height = h * S.dpr;

  S.imageDirty = S.overlayDirty = true;
}

function drawImage() {
  S.imageDirty = false;

  const ctx = iCtx;
  const w = S.cw * S.dpr, h = S.ch * S.dpr;

  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = '#2a2a2a';
  ctx.fillRect(0, 0, w, h);

  if (!S.img) return;

  ctx.save();
  ctx.scale(S.dpr, S.dpr);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = S.interacting ? 'low' : 'high';

  const s = S.view.zoom * S.view.fit;
  ctx.translate(S.view.ox, S.view.oy);
  ctx.scale(s, s);
  ctx.drawImage(S.img, 0, 0);

  ctx.restore();
}

function _drawSegment(ctx, sh, sel, inv) {
  const pts = sh.points;
  if (pts.length < 2) return;
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let pi = 1; pi < pts.length; pi++) ctx.lineTo(pts[pi].x, pts[pi].y);
  ctx.strokeStyle = sh.color;
  ctx.lineWidth = (sel ? 2.5 : 1.5) * inv;
  ctx.stroke();
  const hr = (sel ? 4 : 2.5) * inv;
  for (let pi = 0; pi < pts.length; pi++) dot(ctx, pts[pi].x, pts[pi].y, hr, sh.color);
}

function _drawClosedShape(ctx, sh, sel, inv) {
  const pts = sh.points;
  if (!sh.closed || pts.length < 3) return;
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let pi = 1; pi < pts.length; pi++) ctx.lineTo(pts[pi].x, pts[pi].y);
  ctx.closePath();
  ctx.fillStyle = sh.color + '20';
  ctx.fill();
  ctx.strokeStyle = sh.color;
  ctx.lineWidth = (sel ? 2.5 : 1.5) * inv;
  ctx.stroke();
  if (pts.length <= 80 || sel) {
    const hr = (sel ? 4 : 2.5) * inv;
    for (let pi = 0; pi < pts.length; pi++) dot(ctx, pts[pi].x, pts[pi].y, hr, sh.color);
  }
}

function drawOverlay() {
  S.overlayDirty = false;

  const ctx = oCtx;
  const w = S.cw * S.dpr, h = S.ch * S.dpr;

  ctx.clearRect(0, 0, w, h);
  if (!S.img) return;

  const s = S.view.zoom * S.view.fit;
  const inv = 1 / s;

  ctx.save();
  ctx.scale(S.dpr, S.dpr);

  // ========== IMAGE-SPACE DRAWING ==========
  ctx.save();
  ctx.translate(S.view.ox, S.view.oy);
  ctx.scale(s, s);

  // Scale reference line
  if (S.scaleLine) {
    ctx.beginPath();
    ctx.setLineDash([6 * inv, 4 * inv]);
    ctx.strokeStyle = '#4A9EFF';
    ctx.lineWidth = 1.5 * inv;
    ctx.moveTo(S.scaleLine.p1.x, S.scaleLine.p1.y);
    ctx.lineTo(S.scaleLine.p2.x, S.scaleLine.p2.y);
    ctx.stroke();
    ctx.setLineDash([]);
    dot(ctx, S.scaleLine.p1.x, S.scaleLine.p1.y, 3.5 * inv, '#4A9EFF');
    dot(ctx, S.scaleLine.p2.x, S.scaleLine.p2.y, 3.5 * inv, '#4A9EFF');
  }

  // Scale tool in-progress
  if (S.tool === 'scale' && S.scaleP1) {
    ctx.beginPath();
    ctx.setLineDash([6 * inv, 4 * inv]);
    ctx.strokeStyle = '#4A9EFF';
    ctx.lineWidth = 1.5 * inv;
    ctx.moveTo(S.scaleP1.x, S.scaleP1.y);
    ctx.lineTo(S.scaleState === 2 ? S.scaleP2.x : S.mix, S.scaleState === 2 ? S.scaleP2.y : S.miy);
    ctx.stroke();
    ctx.setLineDash([]);
    dot(ctx, S.scaleP1.x, S.scaleP1.y, 4 * inv, '#4A9EFF');
    if (S.scaleP2) dot(ctx, S.scaleP2.x, S.scaleP2.y, 4 * inv, '#4A9EFF');
  }

  // Shapes (closed polygons + open segments)
  for (let si = 0; si < S.shapes.length; si++) {
    const sh = S.shapes[si];
    if (sh.hidden) continue;
    const sel = sh.id === S.selId;
    if (sh.type === 'segment') {
      _drawSegment(ctx, sh, sel, inv);
    } else {
      _drawClosedShape(ctx, sh, sel, inv);
    }
  }

  // Active polygon drawing (also used by squarecal tool)
  if ((S.tool === 'polygon' || S.tool === 'squarecal') && S.polyPts.length > 0) {
    const isSqCal = S.tool === 'squarecal';
    const c = isSqCal ? '#22D88E' : COLORS[S.colorIdx % COLORS.length];
    const pts = S.polyPts;
    const done = isSqCal && pts.length === 4;  // quad complete — draw closed

    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    if (done) {
      ctx.closePath();
    } else {
      ctx.lineTo(S.mix, S.miy);
    }
    ctx.strokeStyle = c;
    ctx.lineWidth = 1.5 * inv;
    ctx.setLineDash(isSqCal ? [6 * inv, 4 * inv] : []);
    ctx.stroke();
    ctx.setLineDash([]);

    // Corner dots — numbered for squarecal, plain for polygon
    const dotR = isSqCal ? 6 * inv : 4 * inv;
    for (let i = 0; i < pts.length; i++) {
      ctx.beginPath();
      ctx.arc(pts[i].x, pts[i].y, dotR, 0, Math.PI * 2);
      ctx.fillStyle = c;
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1.5 * inv;
      ctx.stroke();
      if (isSqCal) {
        ctx.font = '600 ' + (9 * inv) + 'px "JetBrains Mono", monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#1a1a1a';
        ctx.fillText(i + 1, pts[i].x, pts[i].y);
      }
    }

    // Polygon: show close-hint when hovering near first point
    if (!isSqCal && pts.length >= 3) {
      const fp = i2s(pts[0].x, pts[0].y);
      const d = Math.hypot(S.mx - fp.x, S.my - fp.y);
      if (d < 15) {
        dot(ctx, pts[0].x, pts[0].y, 7 * inv, c);
        ctx.beginPath();
        ctx.setLineDash([4 * inv, 3 * inv]);
        ctx.strokeStyle = c + '80';
        ctx.lineWidth = inv;
        ctx.moveTo(pts[pts.length - 1].x, pts[pts.length - 1].y);
        ctx.lineTo(pts[0].x, pts[0].y);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }
  }

  // Active segment drawing
  if (S.tool === 'segment' && S.polyPts.length > 0) {
    const c = COLORS[S.colorIdx % COLORS.length];
    const pts = S.polyPts;
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.lineTo(S.mix, S.miy);
    ctx.strokeStyle = c;
    ctx.lineWidth = 1.5 * inv;
    ctx.stroke();
    for (let i = 0; i < pts.length; i++) dot(ctx, pts[i].x, pts[i].y, 4 * inv, c);
  }

  // Edit mode: highlight hovered point
  if (S.tool === 'edit' && !S.dragPt) {
    const thr = 10 * inv;
    const hp = findNearestPt({ x: S.mix, y: S.miy }, thr);
    if (hp) {
      ctx.beginPath();
      ctx.arc(hp.shape.points[hp.idx].x, hp.shape.points[hp.idx].y, 6 * inv, 0, Math.PI * 2);
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2 * inv;
      ctx.stroke();
    }
  }

  // Edit mode: highlight dragging point
  if (S.dragPt && S.dragShape) {
    dot(ctx, S.dragPt.x, S.dragPt.y, 6 * inv, '#fff');
  }

  // Active freehand drawing
  if (S.tool === 'freehand' && S.fhPts.length > 1) {
    ctx.beginPath();
    ctx.moveTo(S.fhPts[0].x, S.fhPts[0].y);
    for (let i = 1; i < S.fhPts.length; i++) {
      ctx.lineTo(S.fhPts[i].x, S.fhPts[i].y);
    }
    ctx.strokeStyle = COLORS[S.colorIdx % COLORS.length];
    ctx.lineWidth = 1.5 * inv;
    ctx.stroke();
  }

  ctx.restore(); // Back to screen space

  // ========== SCREEN-SPACE DRAWING ==========

  // Running segment length at cursor
  if (S.tool === 'segment' && S.polyPts.length > 0) {
    const runLen = segmentLength(S.polyPts) + Math.hypot(S.mix - S.polyPts[S.polyPts.length - 1].x, S.miy - S.polyPts[S.polyPts.length - 1].y);
    const txt = fmtLen(runLen);
    ctx.font = '600 11px "JetBrains Mono", monospace';
    const tw = ctx.measureText(txt).width + 8;
    ctx.fillStyle = 'rgba(0,0,0,0.8)';
    roundRect(ctx, S.mx + 12, S.my - 16, tw, 16, 2);
    ctx.fill();
    ctx.fillStyle = COLORS[S.colorIdx % COLORS.length];
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(txt, S.mx + 16, S.my - 8);
  }

  // ---- Label collision detection with nudging ----
  const LABEL_PAD = 3;
  const labelBoxes = [];

  function rectsOverlap(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x &&
           a.y < b.y + b.h && a.y + a.h > b.y;
  }

  function canPlace(box) {
    const padded = { x: box.x - LABEL_PAD, y: box.y - LABEL_PAD,
                     w: box.w + LABEL_PAD * 2, h: box.h + LABEL_PAD * 2 };
    for (let i = 0; i < labelBoxes.length; i++) {
      if (rectsOverlap(padded, labelBoxes[i])) return false;
    }
    return true;
  }

  function tryPlace(box, maxNudge) {
    if (canPlace(box)) { labelBoxes.push(box); return box; }
    const dirs = [{x:0,y:-1},{x:0,y:1},{x:-1,y:0},{x:1,y:0},
                  {x:-0.7,y:-0.7},{x:0.7,y:-0.7},{x:-0.7,y:0.7},{x:0.7,y:0.7}];
    for (let step = LABEL_PAD + 2; step <= maxNudge; step += LABEL_PAD + 2) {
      for (let d = 0; d < dirs.length; d++) {
        const nb = { x: box.x + dirs[d].x * step, y: box.y + dirs[d].y * step,
                     w: box.w, h: box.h };
        if (canPlace(nb)) { labelBoxes.push(nb); return nb; }
      }
    }
    return null;
  }

  // Side length labels for active polygon (no collision)
  if (S.tool === 'polygon' && S.polyPts.length > 0) {
    const pts = S.polyPts;
    const c = COLORS[S.colorIdx % COLORS.length];
    const tempPts = pts.concat([{ x: S.mix, y: S.miy }]);
    const cp = centroid(tempPts);
    const off = 12 / (S.view.zoom * S.view.fit);

    ctx.font = '600 10px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    for (let i = 0; i < pts.length - 1; i++) {
      const p1 = pts[i], p2 = pts[i + 1];
      const len = Math.hypot(p2.x - p1.x, p2.y - p1.y);
      let midX = (p1.x + p2.x) / 2, midY = (p1.y + p2.y) / 2;
      const toCx = cp.x - midX, toCy = cp.y - midY;
      const dist = Math.hypot(toCx, toCy);
      if (dist > 0) { midX += toCx / dist * off; midY += toCy / dist * off; }

      const mid = i2s(midX, midY);
      const txt = fmtLen(len);
      const tw = ctx.measureText(txt).width + 6;

      ctx.fillStyle = 'rgba(0,0,0,0.8)';
      roundRect(ctx, mid.x - tw / 2, mid.y - 8, tw, 14, 2);
      ctx.fill();
      ctx.fillStyle = c;
      ctx.fillText(txt, mid.x, mid.y);
    }

    const last = pts[pts.length - 1];
    const len2 = Math.hypot(S.mix - last.x, S.miy - last.y);
    let midX2 = (last.x + S.mix) / 2, midY2 = (last.y + S.miy) / 2;
    const toCx2 = cp.x - midX2, toCy2 = cp.y - midY2;
    const dist2 = Math.hypot(toCx2, toCy2);
    if (dist2 > 0) { midX2 += toCx2 / dist2 * off; midY2 += toCy2 / dist2 * off; }

    const mid2 = i2s(midX2, midY2);
    const txt2 = fmtLen(len2);
    const tw2 = ctx.measureText(txt2).width + 6;

    ctx.fillStyle = 'rgba(0,0,0,0.8)';
    roundRect(ctx, mid2.x - tw2 / 2, mid2.y - 8, tw2, 14, 2);
    ctx.fill();
    ctx.fillStyle = c;
    ctx.fillText(txt2, mid2.x, mid2.y);
  }

  // ---- Pass 1: Area / length labels (highest priority) ----
  for (let si = 0; si < S.shapes.length; si++) {
    const sh = S.shapes[si];
    if (sh.hidden) continue;

    if (sh.type === 'segment') {
      if (sh.points.length < 2 || sh.length == null) continue;
      const midIdx = Math.floor(sh.points.length / 2);
      const mp = i2s(
        (sh.points[midIdx - 1].x + sh.points[midIdx].x) / 2,
        (sh.points[midIdx - 1].y + sh.points[midIdx].y) / 2
      );
      const txt = fmtLen(sh.length);
      const fs = Math.min(Math.max(11, 13 * S.view.zoom), 22);
      ctx.font = '600 ' + fs + 'px "JetBrains Mono", monospace';
      const tw = ctx.measureText(txt).width + 10;
      const th = fs + 6;
      const box = { x: mp.x - tw / 2, y: mp.y - th / 2, w: tw, h: th };
      const placed = tryPlace(box, 40);
      if (placed) {
        ctx.fillStyle = 'rgba(0,0,0,0.75)';
        roundRect(ctx, placed.x, placed.y, tw, th, 3);
        ctx.fill();
        ctx.fillStyle = sh.color;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(txt, placed.x + tw / 2, placed.y + th / 2);
      }
      continue;
    }

    if (!sh.closed || sh.area == null) continue;

    const cp = centroid(sh.points);
    const sp = i2s(cp.x, cp.y);
    const txt = fmtArea(sh.area);
    const fs = Math.min(Math.max(11, 13 * S.view.zoom), 22);

    ctx.font = '600 ' + fs + 'px "JetBrains Mono", monospace';
    const tw = ctx.measureText(txt).width + 10;
    const th = fs + 6;

    const box = { x: sp.x - tw / 2, y: sp.y - th / 2, w: tw, h: th };
    const placed = tryPlace(box, 40);
    if (!placed) continue;

    ctx.fillStyle = 'rgba(0,0,0,0.75)';
    roundRect(ctx, placed.x, placed.y, tw, th, 3);
    ctx.fill();
    ctx.fillStyle = sh.color;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(txt, placed.x + tw / 2, placed.y + th / 2);
  }

  // ---- Pass 2: Side length labels (sorted by edge length) ----
  const sideLabelCandidates = [];
  const fs2 = Math.min(Math.max(9, 10 * S.view.zoom), 14);
  ctx.font = '600 ' + fs2 + 'px "JetBrains Mono", monospace';

  for (let si = 0; si < S.shapes.length; si++) {
    const sh = S.shapes[si];
    if (sh.hidden) continue;
    if (!sh.closed || sh.points.length < 3) continue;

    const pts = sh.points;
    const cp = centroid(pts);
    const off = 12 / (S.view.zoom * S.view.fit);

    for (let i = 0; i < pts.length; i++) {
      const p1 = pts[i], p2 = pts[(i + 1) % pts.length];
      const len = Math.hypot(p2.x - p1.x, p2.y - p1.y);
      if (len * S.view.zoom * S.view.fit < 30) continue;
      let midX = (p1.x + p2.x) / 2, midY = (p1.y + p2.y) / 2;

      const toCx = cp.x - midX, toCy = cp.y - midY;
      const dist = Math.hypot(toCx, toCy);
      if (dist > 0) { midX += toCx / dist * off; midY += toCy / dist * off; }

      const sp = i2s(midX, midY);
      const txt = fmtLen(len);
      const tw = ctx.measureText(txt).width + 4;
      const th2 = 12;

      sideLabelCandidates.push({
        x: sp.x, y: sp.y, tw: tw, th: th2, txt: txt,
        color: sh.color, len: len,
        boxY: sp.y - 7
      });
    }
  }

  sideLabelCandidates.sort(function(a, b) { return b.len - a.len; });

  ctx.font = '600 ' + fs2 + 'px "JetBrains Mono", monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  for (let i = 0; i < sideLabelCandidates.length; i++) {
    const sl = sideLabelCandidates[i];
    const box = { x: sl.x - sl.tw / 2, y: sl.boxY, w: sl.tw, h: sl.th };
    const placed = tryPlace(box, 24);
    if (!placed) continue;

    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    roundRect(ctx, placed.x, placed.y, sl.tw, sl.th, 2);
    ctx.fill();
    ctx.fillStyle = sl.color;
    ctx.fillText(sl.txt, placed.x + sl.tw / 2, placed.y + sl.th / 2);
  }

  // Perspective mode overlay
  drawPerspOverlay(ctx);

  // (squarecal corners rendered by the polygon drawing block above)

  ctx.restore();
}

export function startRenderLoop() {
  (function loop() {
    if (S.imageDirty) drawImage();
    if (S.overlayDirty) drawOverlay();
    requestAnimationFrame(loop);
  })();
}
