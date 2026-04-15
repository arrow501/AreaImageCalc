import { describe, test, expect } from 'vitest';
import {
  COLORS,
  SAVE_KEY,
  SAVE_VER,
  SAVE_VER_LEGACY,
  STORAGE_SOFT_LIMIT,
  STORAGE_HARD_LIMIT,
} from '../../js/constants.js';

describe('COLORS', () => {
  test('is an array', () => {
    expect(Array.isArray(COLORS)).toBe(true);
  });

  test('has at least 2 entries (enough for multi-shape distinction)', () => {
    expect(COLORS.length).toBeGreaterThanOrEqual(2);
  });

  test('every entry is a CSS hex colour string', () => {
    for (const c of COLORS) {
      expect(c).toMatch(/^#[0-9A-Fa-f]{6}$/);
    }
  });

  test('all entries are unique', () => {
    expect(new Set(COLORS).size).toBe(COLORS.length);
  });
});

describe('save-format version constants', () => {
  test('SAVE_KEY is a non-empty string', () => {
    expect(typeof SAVE_KEY).toBe('string');
    expect(SAVE_KEY.length).toBeGreaterThan(0);
  });

  test('SAVE_VER is a positive integer', () => {
    expect(Number.isInteger(SAVE_VER)).toBe(true);
    expect(SAVE_VER).toBeGreaterThan(0);
  });

  test('SAVE_VER_LEGACY is a positive integer', () => {
    expect(Number.isInteger(SAVE_VER_LEGACY)).toBe(true);
    expect(SAVE_VER_LEGACY).toBeGreaterThan(0);
  });

  test('SAVE_VER_LEGACY is strictly older than SAVE_VER', () => {
    expect(SAVE_VER_LEGACY).toBeLessThan(SAVE_VER);
  });
});

describe('storage limit constants', () => {
  test('STORAGE_SOFT_LIMIT is a positive number', () => {
    expect(typeof STORAGE_SOFT_LIMIT).toBe('number');
    expect(STORAGE_SOFT_LIMIT).toBeGreaterThan(0);
  });

  test('STORAGE_HARD_LIMIT is a positive number', () => {
    expect(typeof STORAGE_HARD_LIMIT).toBe('number');
    expect(STORAGE_HARD_LIMIT).toBeGreaterThan(0);
  });

  test('soft limit is strictly below hard limit', () => {
    expect(STORAGE_SOFT_LIMIT).toBeLessThan(STORAGE_HARD_LIMIT);
  });

  test('soft limit is at least 1 MB', () => {
    expect(STORAGE_SOFT_LIMIT).toBeGreaterThanOrEqual(1024 * 1024);
  });

  test('hard limit is at most 50 MB (sanity cap for localStorage)', () => {
    expect(STORAGE_HARD_LIMIT).toBeLessThanOrEqual(50 * 1024 * 1024);
  });
});
