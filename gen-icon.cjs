// Generates icon-192.png and icon-512.png from the icon design.
// Run once: node gen-icon.js
// Requires only Node built-ins (zlib, fs).

const zlib = require('zlib');
const fs = require('fs');

function generateIcon(size) {
  const W = size, H = size;
  const S = size / 512; // scale factor from SVG 512x512 viewBox
  const pixels = new Uint8Array(W * H * 4);

  // Fill background #1a1a1a opaque
  for (let i = 0; i < W * H; i++) {
    pixels[i*4]   = 0x1a;
    pixels[i*4+1] = 0x1a;
    pixels[i*4+2] = 0x1a;
    pixels[i*4+3] = 0xff;
  }

  function blendAt(idx, r, g, b, a) {
    const t = a / 255;
    pixels[idx]   = Math.round(pixels[idx]   * (1 - t) + r * t);
    pixels[idx+1] = Math.round(pixels[idx+1] * (1 - t) + g * t);
    pixels[idx+2] = Math.round(pixels[idx+2] * (1 - t) + b * t);
    pixels[idx+3] = 255;
  }

  function setPixel(x, y, r, g, b, a = 255) {
    x = Math.round(x); y = Math.round(y);
    if (x < 0 || x >= W || y < 0 || y >= H) return;
    blendAt((y * W + x) * 4, r, g, b, a);
  }

  function fillPolygon(verts, r, g, b, a = 255) {
    const ys = verts.map(v => v[1]);
    const minY = Math.floor(Math.min(...ys));
    const maxY = Math.ceil(Math.max(...ys));
    const n = verts.length;
    for (let y = minY; y <= maxY; y++) {
      const xs = [];
      for (let i = 0; i < n; i++) {
        const [x0, y0] = verts[i], [x1, y1] = verts[(i + 1) % n];
        if ((y0 <= y && y1 > y) || (y1 <= y && y0 > y))
          xs.push(x0 + (y - y0) / (y1 - y0) * (x1 - x0));
      }
      xs.sort((a, b) => a - b);
      for (let j = 0; j < xs.length - 1; j += 2)
        for (let x = Math.ceil(xs[j]); x <= Math.floor(xs[j+1]); x++)
          setPixel(x, y, r, g, b, a);
    }
  }

  function drawLine(x0, y0, x1, y1, r, g, b, hw = 1) {
    x0 = Math.round(x0); y0 = Math.round(y0);
    x1 = Math.round(x1); y1 = Math.round(y1);
    const dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx - dy, x = x0, y = y0;
    while (true) {
      for (let ty = -hw; ty <= hw; ty++)
        for (let tx = -hw; tx <= hw; tx++)
          setPixel(x + tx, y + ty, r, g, b);
      if (x === x1 && y === y1) break;
      const e2 = 2 * err;
      if (e2 > -dy) { err -= dy; x += sx; }
      if (e2 <  dx) { err += dx; y += sy; }
    }
  }

  function drawDisk(cx, cy, rad, r, g, b) {
    for (let dy = -rad; dy <= rad; dy++)
      for (let dx = -rad; dx <= rad; dx++)
        if (dx*dx + dy*dy <= rad*rad)
          setPixel(cx + dx, cy + dy, r, g, b);
  }

  // SVG polygon vertices scaled to target size
  const raw = [[256,80],[440,340],[180,420],[72,240]];
  const verts = raw.map(([x, y]) => [x * S, y * S]);

  // Filled polygon (navy, 85% opacity)
  fillPolygon(verts, 0x2a, 0x64, 0x96, Math.round(0.85 * 255));

  // Polygon outline
  const hw = Math.max(1, Math.round(5 * S));
  for (let i = 0; i < verts.length; i++) {
    const [x0, y0] = verts[i], [x1, y1] = verts[(i + 1) % verts.length];
    drawLine(x0, y0, x1, y1, 0x4f, 0xc3, 0xf7, hw);
  }

  // Vertex dots
  const dotR = Math.max(2, Math.round(9 * S));
  for (const [cx, cy] of verts) drawDisk(cx, cy, dotR, 0x4f, 0xc3, 0xf7);

  // Scale bar (bottom-right, matches SVG positions)
  const bx1 = 340 * S, bx2 = 460 * S, by = 460 * S;
  const tick = Math.max(1, Math.round(8 * S));
  drawLine(bx1, by, bx2, by,        0xe0, 0xe0, 0xe0, Math.max(1, Math.round(3 * S)));
  drawLine(bx1, by - tick, bx1, by + tick, 0xe0, 0xe0, 0xe0, Math.max(1, Math.round(2 * S)));
  drawLine(bx2, by - tick, bx2, by + tick, 0xe0, 0xe0, 0xe0, Math.max(1, Math.round(2 * S)));

  // PNG encode
  function crc32(buf) {
    let c = 0xffffffff;
    for (const b of buf) { c ^= b; for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1); }
    return (c ^ 0xffffffff) >>> 0;
  }

  function chunk(type, data) {
    const t = Buffer.from(type, 'ascii');
    const l = Buffer.alloc(4); l.writeUInt32BE(data.length);
    const crcBuf = Buffer.alloc(4); crcBuf.writeUInt32BE(crc32(Buffer.concat([t, data])));
    return Buffer.concat([l, t, data, crcBuf]);
  }

  const raw2 = [];
  for (let y = 0; y < H; y++) {
    raw2.push(0); // filter: None
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      raw2.push(pixels[i], pixels[i+1], pixels[i+2], pixels[i+3]);
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8; ihdr[9] = 6; // 8-bit RGBA

  return Buffer.concat([
    Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(Buffer.from(raw2))),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

fs.writeFileSync('icon-192.png', generateIcon(192));
fs.writeFileSync('icon-512.png', generateIcon(512));
console.log('icon-192.png and icon-512.png written');
