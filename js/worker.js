self.onmessage = function(e) {
  var d = e.data, type = d.type;

  if (type === 'calcArea') {
    var pts = d.points, n = pts.length;
    var area = 0, perimeter = 0;

    for (var i = 0; i < n; i++) {
      var j = (i + 1) % n;
      area += pts[i].x * pts[j].y - pts[j].x * pts[i].y;
      var dx = pts[j].x - pts[i].x;
      var dy = pts[j].y - pts[i].y;
      perimeter += Math.sqrt(dx * dx + dy * dy);
    }

    self.postMessage({
      type: 'areaResult',
      id: d.id,
      area: Math.abs(area / 2),
      perimeter: perimeter
    });
  }
  else if (type === 'simplify') {
    self.postMessage({
      type: 'simplifyResult',
      id: d.id,
      points: rdp(d.points, d.epsilon)
    });
  }
};

function rdp(pts, eps) {
  if (pts.length <= 2) return pts.slice();

  var first = pts[0], last = pts[pts.length - 1];
  var maxDist = 0, maxIdx = 0;

  for (var i = 1; i < pts.length - 1; i++) {
    var d = pointToLineDist(pts[i], first, last);
    if (d > maxDist) { maxDist = d; maxIdx = i; }
  }

  if (maxDist > eps) {
    var left = rdp(pts.slice(0, maxIdx + 1), eps);
    var right = rdp(pts.slice(maxIdx), eps);
    return left.slice(0, -1).concat(right);
  }
  return [first, last];
}

function pointToLineDist(p, a, b) {
  var dx = b.x - a.x, dy = b.y - a.y;
  var len = Math.sqrt(dx * dx + dy * dy);
  if (len === 0) return Math.sqrt((p.x - a.x) ** 2 + (p.y - a.y) ** 2);
  return Math.abs(dy * p.x - dx * p.y + b.x * a.y - b.y * a.x) / len;
}
