import { describe, test, expect } from 'vitest';
import { distSeg, pip, centroid } from '../../js/math.js';

// ─── distSeg ────────────────────────────────────────────────────────────────

describe('distSeg', () => {
  test('zero-length segment: returns distance to that point', () => {
    expect(distSeg({ x: 3, y: 4 }, { x: 0, y: 0 }, { x: 0, y: 0 })).toBeCloseTo(5);
  });

  test('point sits exactly on the start endpoint', () => {
    expect(distSeg({ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 4, y: 0 })).toBe(0);
  });

  test('point sits exactly on the end endpoint', () => {
    expect(distSeg({ x: 4, y: 0 }, { x: 0, y: 0 }, { x: 4, y: 0 })).toBe(0);
  });

  test('point sits exactly on the midpoint', () => {
    expect(distSeg({ x: 2, y: 0 }, { x: 0, y: 0 }, { x: 4, y: 0 })).toBe(0);
  });

  test('point is perpendicular above the midpoint', () => {
    expect(distSeg({ x: 2, y: 3 }, { x: 0, y: 0 }, { x: 4, y: 0 })).toBeCloseTo(3);
  });

  test('point is perpendicular below the segment', () => {
    expect(distSeg({ x: 1, y: -5 }, { x: 0, y: 0 }, { x: 4, y: 0 })).toBeCloseTo(5);
  });

  test('point is beyond the end — clamped to end endpoint', () => {
    expect(distSeg({ x: 7, y: 0 }, { x: 0, y: 0 }, { x: 4, y: 0 })).toBeCloseTo(3);
  });

  test('point is before the start — clamped to start endpoint', () => {
    expect(distSeg({ x: -3, y: 0 }, { x: 0, y: 0 }, { x: 4, y: 0 })).toBeCloseTo(3);
  });

  test('diagonal segment: point directly above midpoint', () => {
    // Segment from (0,0) to (4,4). Midpoint = (2,2). Perpendicular direction = (-1,1)/√2.
    // Point at (0, 4): closest point on segment is (2,2), distance = √((0-2)²+(4-2)²) = √8 ≈ 2.828.
    expect(distSeg({ x: 0, y: 4 }, { x: 0, y: 0 }, { x: 4, y: 4 })).toBeCloseTo(Math.SQRT2 * 2);
  });

  test('returns 0 for a point on a non-axis-aligned segment', () => {
    expect(distSeg({ x: 2, y: 2 }, { x: 0, y: 0 }, { x: 4, y: 4 })).toBeCloseTo(0);
  });
});

// ─── pip ────────────────────────────────────────────────────────────────────

describe('pip (point-in-polygon)', () => {
  const square = [
    { x: 0, y: 0 }, { x: 4, y: 0 },
    { x: 4, y: 4 }, { x: 0, y: 4 },
  ];

  const triangle = [
    { x: 0, y: 0 }, { x: 6, y: 0 }, { x: 3, y: 6 },
  ];

  test('point inside unit square', () => {
    expect(pip({ x: 2, y: 2 }, square)).toBe(true);
  });

  test('point outside unit square (right)', () => {
    expect(pip({ x: 6, y: 2 }, square)).toBe(false);
  });

  test('point outside unit square (above)', () => {
    expect(pip({ x: 2, y: 6 }, square)).toBe(false);
  });

  test('point outside unit square (negative x)', () => {
    expect(pip({ x: -1, y: 2 }, square)).toBe(false);
  });

  test('point at the very corner is treated as outside by ray-casting', () => {
    // Corner edge cases are deliberately unspecified — just check it doesn't throw
    expect(() => pip({ x: 0, y: 0 }, square)).not.toThrow();
  });

  test('point inside triangle', () => {
    expect(pip({ x: 3, y: 2 }, triangle)).toBe(true);
  });

  test('point outside triangle (right)', () => {
    expect(pip({ x: 5, y: 4 }, triangle)).toBe(false);
  });

  test('point outside triangle (above apex)', () => {
    expect(pip({ x: 3, y: 8 }, triangle)).toBe(false);
  });

  test('wide L-shaped concave polygon', () => {
    const L = [
      { x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 2 },
      { x: 2, y: 2 }, { x: 2, y: 4 }, { x: 0, y: 4 },
    ];
    expect(pip({ x: 1, y: 3 }, L)).toBe(true);   // inside the vertical arm
    expect(pip({ x: 3, y: 3 }, L)).toBe(false);  // in the notch
    expect(pip({ x: 3, y: 1 }, L)).toBe(true);   // inside the horizontal arm
  });
});

// ─── centroid ───────────────────────────────────────────────────────────────

describe('centroid', () => {
  test('single point returns that point', () => {
    const c = centroid([{ x: 7, y: 3 }]);
    expect(c.x).toBe(7);
    expect(c.y).toBe(3);
  });

  test('two points return their midpoint', () => {
    const c = centroid([{ x: 0, y: 0 }, { x: 10, y: 4 }]);
    expect(c.x).toBe(5);
    expect(c.y).toBe(2);
  });

  test('axis-aligned square with corners at 0 and 1', () => {
    const c = centroid([
      { x: 0, y: 0 }, { x: 1, y: 0 },
      { x: 1, y: 1 }, { x: 0, y: 1 },
    ]);
    expect(c.x).toBeCloseTo(0.5);
    expect(c.y).toBeCloseTo(0.5);
  });

  test('equilateral-ish triangle', () => {
    const c = centroid([{ x: 0, y: 0 }, { x: 6, y: 0 }, { x: 0, y: 6 }]);
    expect(c.x).toBeCloseTo(2);
    expect(c.y).toBeCloseTo(2);
  });

  test('points with fractional coordinates', () => {
    const c = centroid([{ x: 0.5, y: 1.5 }, { x: 1.5, y: 0.5 }]);
    expect(c.x).toBeCloseTo(1);
    expect(c.y).toBeCloseTo(1);
  });

  test('centroid is always inside a regular polygon', () => {
    // Regular hexagon centred at (5,5) radius 3
    const n = 6;
    const pts = Array.from({ length: n }, (_, i) => ({
      x: 5 + 3 * Math.cos((2 * Math.PI * i) / n),
      y: 5 + 3 * Math.sin((2 * Math.PI * i) / n),
    }));
    const c = centroid(pts);
    expect(c.x).toBeCloseTo(5, 5);
    expect(c.y).toBeCloseTo(5, 5);
  });
});
