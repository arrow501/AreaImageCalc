import { describe, test, expect } from 'vitest';
import { csvEscape, csvNum, buildMeasurementsCsv } from '../../js/csv.js';

describe('csvEscape', () => {
  test('plain strings pass through', () => {
    expect(csvEscape('Area 1')).toBe('Area 1');
  });

  test('commas force quoting', () => {
    expect(csvEscape('a,b')).toBe('"a,b"');
  });

  test('quotes are doubled', () => {
    expect(csvEscape('say "hi"')).toBe('"say ""hi"""');
  });

  test('newlines force quoting', () => {
    expect(csvEscape('a\nb')).toBe('"a\nb"');
  });

  test('null and undefined become empty', () => {
    expect(csvEscape(null)).toBe('');
    expect(csvEscape(undefined)).toBe('');
  });
});

describe('csvNum', () => {
  test('rounds to 4 decimals', () => {
    expect(csvNum(1.234567)).toBe('1.2346');
  });

  test('integers stay clean', () => {
    expect(csvNum(42)).toBe('42');
  });

  test('null, NaN, Infinity become empty', () => {
    expect(csvNum(null)).toBe('');
    expect(csvNum(NaN)).toBe('');
    expect(csvNum(Infinity)).toBe('');
  });
});

describe('buildMeasurementsCsv', () => {
  const tabs = [{
    label: 'Plan, v2',
    scalePPU: 10,
    scaleUnit: 'cm',
    shapes: [
      { id: 's1', name: 'Room', type: 'polygon', area: 40000, perimeter: 800 },
      { id: 's2', name: 'Wall', type: 'segment', length: 500 },
      { id: 's3', name: 'Note 1', type: 'note', text: 'check this, later' }
    ]
  }];

  test('starts with the header row', () => {
    const csv = buildMeasurementsCsv(tabs);
    expect(csv.split('\r\n')[0])
      .toBe('document,name,type,area,area_unit,length,length_unit,area_px2,length_px,text');
  });

  test('converts px measurements using the tab scale', () => {
    const lines = buildMeasurementsCsv(tabs).split('\r\n');
    // 40000 px² at 10 px/cm → 400 cm²; 800 px perimeter → 80 cm
    expect(lines[1]).toBe('"Plan, v2",Room,polygon,400,cm²,80,cm,40000,800,');
  });

  test('segments report length but no area', () => {
    const lines = buildMeasurementsCsv(tabs).split('\r\n');
    expect(lines[2]).toBe('"Plan, v2",Wall,segment,,,50,cm,,500,');
  });

  test('notes carry their text and no measurements', () => {
    const lines = buildMeasurementsCsv(tabs).split('\r\n');
    expect(lines[3]).toBe('"Plan, v2",Note 1,note,,,,,,,"check this, later"');
  });

  test('unscaled tabs leave unit columns empty', () => {
    const csv = buildMeasurementsCsv([{
      label: 'raw', scalePPU: 0, scaleUnit: 'cm',
      shapes: [{ id: 's1', name: 'A', type: 'polygon', area: 100, perimeter: 40 }]
    }]);
    expect(csv.split('\r\n')[1]).toBe('raw,A,polygon,,,,,100,40,');
  });

  test('ends with a trailing CRLF', () => {
    expect(buildMeasurementsCsv(tabs).endsWith('\r\n')).toBe(true);
  });
});
