// Pure collision-layout math — zero deps, Node-importable, fully
// unit-testable. Home of both collision systems in the project:
//
// 1. Grab rings (circles): every interaction point (shape vertex, scale
//    endpoint, perspective corner) gets a ring with a guaranteed minimum
//    screen size. Overlapping rings push each other aside mutually, but a
//    ring may never drift so far that its control point exits the circle.
//
// 2. Label boxes (rects): first-come greedy placement. Earlier boxes never
//    move to make room for later ones — mutual push (as the rings do) would
//    reshuffle every neighbouring label whenever one is added or removed,
//    which reads as jumping. Order of placement calls must therefore be
//    stable across frames.

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
        const rd = Math.hypot(b.rx - a.rx, b.ry - a.ry);
        if (rd >= target) continue;

        // Push along the axis between the CONTROL POINTS, not the ring
        // centres: each ring bulges away from its neighbour on its own
        // point's side, so spatial ordering is never inverted.
        let ax = b.x - a.x, ay = b.y - a.y;
        let ad = Math.hypot(ax, ay);
        if (ad < 1e-6) {
          // Coincident points: deterministic spread direction from index pair
          const ang = (i * 2.399963 + j * 0.71) % (Math.PI * 2);
          ax = Math.cos(ang);
          ay = Math.sin(ang);
          ad = 1;
        }
        const push = (target - rd) / 2;
        const ux = ax / ad, uy = ay / ad;
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

export const LABEL_PAD = 3;

export function rectsOverlap(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x &&
         a.y < b.y + b.h && a.y + a.h > b.y;
}

function canPlace(boxes, box) {
  const padded = { x: box.x - LABEL_PAD, y: box.y - LABEL_PAD,
                   w: box.w + LABEL_PAD * 2, h: box.h + LABEL_PAD * 2 };
  for (let i = 0; i < boxes.length; i++) {
    if (rectsOverlap(padded, boxes[i])) return false;
  }
  return true;
}

const NUDGE_DIRS = [
  {x:0,y:-1},{x:0,y:1},{x:-1,y:0},{x:1,y:0},
  {x:-0.7,y:-0.7},{x:0.7,y:-0.7},{x:-0.7,y:0.7},{x:0.7,y:0.7}
];

// Places box against the already-claimed boxes, nudging it outward up to
// maxNudge px. Returns the placed box (pushed onto boxes) or null when no
// free spot exists within reach.
export function placeLabel(boxes, box, maxNudge) {
  if (canPlace(boxes, box)) { boxes.push(box); return box; }
  for (let step = LABEL_PAD + 2; step <= maxNudge; step += LABEL_PAD + 2) {
    for (let d = 0; d < NUDGE_DIRS.length; d++) {
      const nb = { x: box.x + NUDGE_DIRS[d].x * step, y: box.y + NUDGE_DIRS[d].y * step,
                   w: box.w, h: box.h };
      if (canPlace(boxes, nb)) { boxes.push(nb); return nb; }
    }
  }
  return null;
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
