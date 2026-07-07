// Pure handle-layout math for control-point grab indicators — zero deps,
// Node-importable, fully unit-testable.
//
// Every interaction point (shape vertex, scale endpoint, perspective corner)
// gets a grab ring with a guaranteed minimum screen size. When two rings
// would overlap they push each other aside, but a ring may never drift so
// far that its control point exits the circle.

export const HANDLE_RING_R = 14;  // grab ring radius, screen px
export const HANDLE_PT_R = 3.5;   // control point dot radius, screen px

export function maxRingOffset(ringR, ptR) {
  return Math.max(0, ringR - (ptR === undefined ? HANDLE_PT_R : ptR) - 1);
}

// handles: [{ id, x, y, ... }] in screen coords.
// Returns [{ id, x, y, rx, ry }] where (rx, ry) is the ring centre after
// collision resolution. Extra properties on input handles are preserved.
export function layoutHandles(handles, ringR) {
  ringR = ringR || HANDLE_RING_R;
  const maxOff = maxRingOffset(ringR);
  const out = handles.map(function(h) {
    const c = Object.assign({}, h);
    c.rx = h.x;
    c.ry = h.y;
    return c;
  });
  if (out.length < 2 || maxOff === 0) return out;

  const target = ringR * 2;
  for (let iter = 0; iter < 5; iter++) {
    let moved = false;
    for (let i = 0; i < out.length; i++) {
      for (let j = i + 1; j < out.length; j++) {
        const a = out[i], b = out[j];
        let dx = b.rx - a.rx, dy = b.ry - a.ry;
        let d = Math.hypot(dx, dy);
        if (d >= target) continue;

        if (d < 1e-6) {
          // Coincident: deterministic spread direction from index pair
          const ang = (i * 2.399963 + j * 0.71) % (Math.PI * 2);
          dx = Math.cos(ang);
          dy = Math.sin(ang);
          d = 1;
        }
        const push = (target - d) / 2;
        const ux = dx / d, uy = dy / d;
        shiftClamped(a, -ux * push, -uy * push, maxOff);
        shiftClamped(b, ux * push, uy * push, maxOff);
        moved = true;
      }
    }
    if (!moved) break;
  }
  return out;
}

function shiftClamped(h, dx, dy, maxOff) {
  let ox = h.rx - h.x + dx;
  let oy = h.ry - h.y + dy;
  const off = Math.hypot(ox, oy);
  if (off > maxOff) {
    ox = ox / off * maxOff;
    oy = oy / off * maxOff;
  }
  h.rx = h.x + ox;
  h.ry = h.y + oy;
}

// Returns the laid-out handle whose ring contains (x, y), preferring the
// nearest ring centre. null when nothing is within reach.
export function hitTestHandles(layout, x, y, ringR) {
  ringR = ringR || HANDLE_RING_R;
  let best = null, bd = Infinity;
  for (let i = 0; i < layout.length; i++) {
    const h = layout[i];
    const d = Math.hypot(x - h.rx, y - h.ry);
    if (d <= ringR && d < bd) {
      bd = d;
      best = h;
    }
  }
  return best;
}
