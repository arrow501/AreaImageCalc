// Pure math utilities — zero dependencies, fully unit-testable in Node

export function centroid(pts) {
  let cx = 0, cy = 0;
  for (let i = 0; i < pts.length; i++) {
    cx += pts[i].x;
    cy += pts[i].y;
  }
  return { x: cx / pts.length, y: cy / pts.length };
}

// Minimum distance from point p to line segment a→b
export function distSeg(p, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const l2 = dx * dx + dy * dy;
  if (l2 === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

// Point-in-polygon via ray casting
export function pip(p, pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    if ((pts[i].y > p.y) !== (pts[j].y > p.y) &&
        p.x < (pts[j].x - pts[i].x) * (p.y - pts[i].y) / (pts[j].y - pts[i].y) + pts[i].x) {
      inside = !inside;
    }
  }
  return inside;
}

// Total length of a polyline (sum of segment lengths)
export function segmentLength(pts) {
  let len = 0;
  for (let i = 1; i < pts.length; i++) {
    len += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
  }
  return len;
}

// Uniform scale k <= 1 that fits a w×h raster into a total pixel budget and
// a max side length. Returns 1 when it already fits.
export function fitScale(w, h, maxPixels, maxSide) {
  let k = 1;
  if (w * h > maxPixels) k = Math.sqrt(maxPixels / (w * h));
  if (w * k > maxSide) k = maxSide / w;
  if (h * k > maxSide) k = maxSide / h;
  return Math.min(1, k);
}

// Bilinear interpolation inside a quad. corners = [TL, TR, BR, BL];
// u runs left→right, v runs top→bottom, both in [0,1].
export function bilinearPoint(corners, u, v) {
  const w0 = (1 - u) * (1 - v), w1 = u * (1 - v), w2 = u * v, w3 = (1 - u) * v;
  return {
    x: corners[0].x * w0 + corners[1].x * w1 + corners[2].x * w2 + corners[3].x * w3,
    y: corners[0].y * w0 + corners[1].y * w1 + corners[2].y * w2 + corners[3].y * w3
  };
}

// Rotate point p around centre (cx, cy) by rad (positive = CW in screen coords)
export function rotateAround(p, cx, cy, rad) {
  const c = Math.cos(rad), s = Math.sin(rad);
  const dx = p.x - cx, dy = p.y - cy;
  return { x: cx + dx * c - dy * s, y: cy + dx * s + dy * c };
}

// Nearest hit-testable point across a set of shapes. Returns { shape, idx, dist }
// or null if none within `thr`. A shape is hit-testable if it is closed or a
// segment; hidden shapes are skipped.
export function nearestPoint(ip, shapes, thr) {
  let best = Infinity, hitShape = null, hitIdx = -1;
  for (let i = 0; i < shapes.length; i++) {
    const s = shapes[i];
    if (!s.closed && s.type !== 'segment') continue;
    if (s.hidden) continue;
    const pts = s.points;
    for (let j = 0; j < pts.length; j++) {
      const p = pts[j];
      const d = Math.hypot(p.x - ip.x, p.y - ip.y);
      if (d < best) { best = d; hitShape = s; hitIdx = j; }
    }
  }
  if (best <= thr) return { shape: hitShape, idx: hitIdx, dist: best };
  return null;
}
