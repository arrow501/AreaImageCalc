// Pure math utilities — zero dependencies, fully unit-testable in Node

export function centroid(pts) {
  var cx = 0, cy = 0;
  for (var i = 0; i < pts.length; i++) {
    cx += pts[i].x;
    cy += pts[i].y;
  }
  return { x: cx / pts.length, y: cy / pts.length };
}

// Minimum distance from point p to line segment a→b
export function distSeg(p, a, b) {
  var dx = b.x - a.x, dy = b.y - a.y;
  var l2 = dx * dx + dy * dy;
  if (l2 === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  var t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

// Point-in-polygon via ray casting
export function pip(p, pts) {
  var inside = false;
  for (var i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    if ((pts[i].y > p.y) !== (pts[j].y > p.y) &&
        p.x < (pts[j].x - pts[i].x) * (p.y - pts[i].y) / (pts[j].y - pts[i].y) + pts[i].x) {
      inside = !inside;
    }
  }
  return inside;
}
