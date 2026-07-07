import { describe, test, expect } from 'vitest';
import { parseColor } from '../../js/color.js';

describe('parseColor', () => {
  test('6-digit hex normalises to uppercase', () => {
    expect(parseColor('#ff6b35')).toBe('#FF6B35');
    expect(parseColor('  #FF6B35  ')).toBe('#FF6B35');
  });

  test('3-digit hex expands', () => {
    expect(parseColor('#f80')).toBe('#FF8800');
  });

  test('rgb() with commas or spaces', () => {
    expect(parseColor('rgb(255, 107, 53)')).toBe('#FF6B35');
    expect(parseColor('rgb(255 107 53)')).toBe('#FF6B35');
  });

  test('rgba() ignores alpha', () => {
    expect(parseColor('rgba(0, 128, 255, 0.5)')).toBe('#0080FF');
    expect(parseColor('rgb(0 128 255 / 50%)')).toBe('#0080FF');
  });

  test('channel overflow is rejected', () => {
    expect(parseColor('rgb(300, 0, 0)')).toBeNull();
  });

  test('common names resolve case-insensitively', () => {
    expect(parseColor('Tomato')).toBe('#FF6347');
    expect(parseColor('SKYBLUE')).toBe('#87CEEB');
    expect(parseColor('grey')).toBe('#808080');
  });

  test('garbage returns null', () => {
    expect(parseColor('')).toBeNull();
    expect(parseColor('#12')).toBeNull();
    expect(parseColor('#GGGGGG')).toBeNull();
    expect(parseColor('not-a-color')).toBeNull();
    expect(parseColor(null)).toBeNull();
    expect(parseColor(42)).toBeNull();
  });
});
