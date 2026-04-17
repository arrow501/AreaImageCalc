import { S, COLORS } from './state.js';
import { nearestPoint, segmentLength } from './math.js';
export { centroid, distSeg, pip, segmentLength } from './math.js';

export function findShape(id) {
  for (let i = 0; i < S.shapes.length; i++) {
    if (S.shapes[i].id === id) return S.shapes[i];
  }
  return null;
}

export function nextColor() {
  return COLORS[S.colorIdx++ % COLORS.length];
}

export function s2i(sx, sy) {
  const s = S.view.zoom * S.view.fit;
  return { x: (sx - S.view.ox) / s, y: (sy - S.view.oy) / s };
}

export function i2s(ix, iy) {
  const s = S.view.zoom * S.view.fit;
  return { x: ix * s + S.view.ox, y: iy * s + S.view.oy };
}

export function fmtArea(a) {
  if (S.scalePPU > 0) {
    const u = a / (S.scalePPU * S.scalePPU);
    if (u >= 1e6) return (u / 1e6).toFixed(2) + ' ' + S.scaleUnit + '\u00b2(M)';
    if (u >= 1e3) return u.toFixed(1) + ' ' + S.scaleUnit + '\u00b2';
    if (u >= 1)   return u.toFixed(2) + ' ' + S.scaleUnit + '\u00b2';
    return u.toFixed(4) + ' ' + S.scaleUnit + '\u00b2';
  }
  return a.toFixed(0) + ' px\u00b2';
}

export function fmtPerim(p) {
  if (S.scalePPU > 0) {
    const u = p / S.scalePPU;
    if (u >= 1e3) return u.toFixed(1) + ' ' + S.scaleUnit;
    if (u >= 1)   return u.toFixed(2) + ' ' + S.scaleUnit;
    return u.toFixed(4) + ' ' + S.scaleUnit;
  }
  return p.toFixed(0) + ' px';
}

export function fmtLen(px) {
  if (S.scalePPU > 0) {
    const u = px / S.scalePPU;
    if (u >= 100) return u.toFixed(1) + S.scaleUnit;
    if (u >= 1)   return u.toFixed(2) + S.scaleUnit;
    return u.toFixed(3) + S.scaleUnit;
  }
  return Math.round(px) + 'px';
}

export function findNearestPt(ip, thr) {
  return nearestPoint(ip, S.shapes, thr);
}

export function hasWork() {
  if (S.img && (S.shapes.length > 0 || S.scaleLine)) return true;
  return S.tabs.some(function(t) { return t.imgDataUrl && (t.shapes.length > 0 || t.scaleLine); });
}

export function dot(ctx, x, y, r, c) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = c;
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.5)';
  ctx.lineWidth = r * 0.3;
  ctx.stroke();
}

export function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}
