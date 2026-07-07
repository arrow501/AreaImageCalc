import { describe, test, expect } from 'vitest';
import {
  layoutHandles, hitTestHandles, maxRingOffset,
  HANDLE_RING_R, HANDLE_PT_R
} from '../../js/handles.js';

const R = HANDLE_RING_R;

describe('maxRingOffset', () => {
  test('leaves room for the point dot plus a margin', () => {
    expect(maxRingOffset(R)).toBeCloseTo(R - HANDLE_PT_R - 1);
  });

  test('never negative', () => {
    expect(maxRingOffset(2, 5)).toBe(0);
  });
});

describe('layoutHandles', () => {
  test('single handle keeps its ring centred on the point', () => {
    const out = layoutHandles([{ id: 'a', x: 10, y: 20 }]);
    expect(out[0].rx).toBe(10);
    expect(out[0].ry).toBe(20);
  });

  test('far-apart handles are not displaced', () => {
    const out = layoutHandles([
      { id: 'a', x: 0, y: 0 },
      { id: 'b', x: 200, y: 0 }
    ]);
    expect(out[0].rx).toBe(0);
    expect(out[1].rx).toBe(200);
  });

  test('close handles push their rings apart', () => {
    const out = layoutHandles([
      { id: 'a', x: 0, y: 0 },
      { id: 'b', x: 6, y: 0 }
    ]);
    const sep = Math.hypot(out[1].rx - out[0].rx, out[1].ry - out[0].ry);
    expect(sep).toBeGreaterThan(6);
    expect(out[0].rx).toBeLessThan(0);
    expect(out[1].rx).toBeGreaterThan(6);
  });

  test('control point never exits its ring', () => {
    const pts = [
      { id: 'a', x: 0, y: 0 },
      { id: 'b', x: 2, y: 0 },
      { id: 'c', x: 0, y: 2 },
      { id: 'd', x: 2, y: 2 }
    ];
    const out = layoutHandles(pts);
    for (const h of out) {
      const off = Math.hypot(h.rx - h.x, h.ry - h.y);
      expect(off).toBeLessThanOrEqual(R - HANDLE_PT_R);
    }
  });

  test('coincident handles separate deterministically', () => {
    const a = layoutHandles([
      { id: 'a', x: 5, y: 5 },
      { id: 'b', x: 5, y: 5 }
    ]);
    const b = layoutHandles([
      { id: 'a', x: 5, y: 5 },
      { id: 'b', x: 5, y: 5 }
    ]);
    const sepA = Math.hypot(a[1].rx - a[0].rx, a[1].ry - a[0].ry);
    expect(sepA).toBeGreaterThan(0);
    expect(a[0].rx).toBeCloseTo(b[0].rx);
    expect(a[1].ry).toBeCloseTo(b[1].ry);
  });

  test('preserves extra properties on handles', () => {
    const out = layoutHandles([{ id: 'a', x: 0, y: 0, shapeId: 's1', idx: 3 }]);
    expect(out[0].shapeId).toBe('s1');
    expect(out[0].idx).toBe(3);
  });
});

describe('hitTestHandles', () => {
  test('hit inside ring returns the handle', () => {
    const layout = layoutHandles([{ id: 'a', x: 100, y: 100 }]);
    expect(hitTestHandles(layout, 105, 100).id).toBe('a');
  });

  test('miss outside ring returns null', () => {
    const layout = layoutHandles([{ id: 'a', x: 100, y: 100 }]);
    expect(hitTestHandles(layout, 100 + R + 1, 100)).toBeNull();
  });

  test('prefers the nearest ring centre when rings overlap', () => {
    const layout = layoutHandles([
      { id: 'a', x: 0, y: 0 },
      { id: 'b', x: 10, y: 0 }
    ]);
    const hitB = hitTestHandles(layout, layout[1].rx, layout[1].ry);
    expect(hitB.id).toBe('b');
    const hitA = hitTestHandles(layout, layout[0].rx, layout[0].ry);
    expect(hitA.id).toBe('a');
  });

  test('uses displaced ring centres, not raw points', () => {
    const layout = layoutHandles([
      { id: 'a', x: 0, y: 0 },
      { id: 'b', x: 4, y: 0 }
    ]);
    // Probe far to the right of b's ring centre — still inside its ring,
    // but outside where the undisplaced ring would have been
    const probe = layout[1].rx + R - 1;
    expect(hitTestHandles(layout, probe, 0).id).toBe('b');
  });
});
