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
  else if (type === 'warp') {
    var src = new Uint8ClampedArray(d.buf);
    var iw = d.iw, ih = d.ih;
    var outW = d.outW, outH = d.outH, offX = d.offX, offY = d.offY;
    var H = d.Hinv;
    var out = new Uint8ClampedArray(outW * outH * 4);

    for (var oy = 0; oy < outH; oy++) {
      var py = oy + offY;
      for (var ox = 0; ox < outW; ox++) {
        var px = ox + offX;
        var w = H[6] * px + H[7] * py + H[8];
        var sx = (H[0] * px + H[1] * py + H[2]) / w;
        var sy = (H[3] * px + H[4] * py + H[5]) / w;
        if (sx < 0 || sx >= iw - 1 || sy < 0 || sy >= ih - 1) continue;

        var x0 = Math.floor(sx), y0 = Math.floor(sy);
        var fx = sx - x0, fy = sy - y0;
        var x1 = x0 + 1 < iw ? x0 + 1 : iw - 1;
        var y1 = y0 + 1 < ih ? y0 + 1 : ih - 1;
        var i00 = (y0 * iw + x0) * 4, i10 = (y0 * iw + x1) * 4;
        var i01 = (y1 * iw + x0) * 4, i11 = (y1 * iw + x1) * 4;
        var outIdx = (oy * outW + ox) * 4;

        for (var c = 0; c < 4; c++) {
          out[outIdx + c] =
            src[i00 + c] * (1 - fx) * (1 - fy) + src[i10 + c] * fx * (1 - fy) +
            src[i01 + c] * (1 - fx) * fy + src[i11 + c] * fx * fy;
        }
      }
    }

    self.postMessage(
      { type: 'warpResult', reqId: d.reqId, buf: out.buffer, outW: outW, outH: outH },
      [out.buffer]
    );
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
