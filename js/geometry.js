import { S, COLORS } from './state.js';
import { layoutHandles, hitTestHandles } from './handles.js';
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

// Interaction handles near a screen point, laid out with grab-ring collision
// avoidance. Content is tool-aware:
//  - scale tool while the popup is open: the two pending calibration points
//  - otherwise: visible shape vertices plus committed scale-line endpoints
const HANDLE_RANGE = 56;

export function handlesNear(sx, sy) {
  const hs = [];

  function push(kind, idx, shapeId, ipt) {
    const sp = i2s(ipt.x, ipt.y);
    if (Math.abs(sp.x - sx) > HANDLE_RANGE || Math.abs(sp.y - sy) > HANDLE_RANGE) return;
    hs.push({ kind: kind, idx: idx, shapeId: shapeId, x: sp.x, y: sp.y });
  }

  if (S.tool === 'scale') {
    if (S.scaleState === 2 && S.scaleP1 && S.scaleP2) {
      push('scalePt', 0, null, S.scaleP1);
      push('scalePt', 1, null, S.scaleP2);
    }
    return layoutHandles(hs);
  }

  if (S.tool === 'squarecal') {
    if (S.polyPts.length === 4) {
      for (let j = 0; j < 4; j++) push('sqcal', j, null, S.polyPts[j]);
    }
    return layoutHandles(hs);
  }

  for (let i = 0; i < S.shapes.length; i++) {
    const sh = S.shapes[i];
    if (sh.hidden) continue;
    for (let j = 0; j < sh.points.length; j++) {
      push('shape', j, sh.id, sh.points[j]);
    }
  }
  if (S.scaleLine) {
    push('scale', 0, null, S.scaleLine.p1);
    push('scale', 1, null, S.scaleLine.p2);
  }
  return layoutHandles(hs);
}

export function hitHandle(sx, sy, hitR) {
  return hitTestHandles(handlesNear(sx, sy), sx, sy, hitR);
}

// Grab indicator: a weighted ring (dark under-stroke + light stroke). When
// the ring centre was displaced by collision, a faint leader ties it back to
// its control point. The active ring also highlights its control point so
// it is unambiguous which point the ring grabs.
export function drawGrabRing(ctx, h, active, ringR) {
  if (Math.hypot(h.rx - h.x, h.ry - h.y) > 0.5) {
    ctx.beginPath();
    ctx.moveTo(h.rx, h.ry);
    ctx.lineTo(h.x, h.y);
    ctx.strokeStyle = active ? 'rgba(255,255,255,0.6)' : 'rgba(255,255,255,0.25)';
    ctx.lineWidth = 1;
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.arc(h.rx, h.ry, ringR, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(0,0,0,0.45)';
  ctx.lineWidth = active ? 3.5 : 3;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(h.rx, h.ry, ringR, 0, Math.PI * 2);
  ctx.strokeStyle = active ? '#fff' : 'rgba(255,255,255,0.55)';
  ctx.lineWidth = active ? 1.8 : 1.2;
  ctx.stroke();
  if (active) {
    ctx.beginPath();
    ctx.arc(h.x, h.y, 5, 0, Math.PI * 2);
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1.8;
    ctx.stroke();
  }
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
