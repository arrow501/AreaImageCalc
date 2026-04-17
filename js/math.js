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
