import { describe, test, expect } from 'vitest';
import { encodeArcalc, decodeArcalc, APP_URL } from '../../js/arcalcFormat.js';

const sampleProject = {
  v: 4,
  ts: 1234567890,
  currentTabIdx: 0,
  tabs: [{
    label: 'Floor plan',
    imgDataUrl: 'data:image/png;base64,AAAA',
    shapes: [{ id: 's1', type: 'polygon', points: [{ x: 0, y: 0 }], name: 'Area 1' }]
  }]
};

describe('encodeArcalc', () => {
  test('produces a standalone HTML document', () => {
    const html = encodeArcalc(sampleProject);
    expect(html.startsWith('<!DOCTYPE html>')).toBe(true);
    expect(html).toContain('<title>');
    expect(html).toContain(APP_URL);
    expect(html).toContain('id="arcalc-data"');
  });

  test('escapes < so payload cannot break out of the script tag', () => {
    const project = { v: 4, tabs: [{ label: '</script><b>x', shapes: [] }] };
    const html = encodeArcalc(project);
    const body = html.slice(html.indexOf('id="arcalc-data"'));
    expect(body.indexOf('</script><b>')).toBe(-1);
  });

  test('makes no external requests other than the app link', () => {
    const html = encodeArcalc(sampleProject);
    expect(html).not.toMatch(/src\s*=\s*["']http/);
    expect(html).not.toMatch(/<link/);
  });
});

describe('decodeArcalc', () => {
  test('round-trips a project through encode/decode', () => {
    expect(decodeArcalc(encodeArcalc(sampleProject))).toEqual(sampleProject);
  });

  test('round-trips hostile strings intact', () => {
    const project = { v: 4, tabs: [{ label: '</script><script>alert(1)</script>', shapes: [] }] };
    expect(decodeArcalc(encodeArcalc(project))).toEqual(project);
  });

  test('accepts legacy plain-JSON .arcalc files', () => {
    expect(decodeArcalc(JSON.stringify(sampleProject))).toEqual(sampleProject);
  });

  test('accepts legacy JSON with a BOM and leading whitespace', () => {
    expect(decodeArcalc('﻿  ' + JSON.stringify(sampleProject))).toEqual(sampleProject);
  });

  test('rejects unrelated HTML', () => {
    expect(() => decodeArcalc('<!DOCTYPE html><html><body>hi</body></html>')).toThrow();
  });

  test('rejects truncated files', () => {
    const html = encodeArcalc(sampleProject);
    const cut = html.slice(0, html.indexOf('</script>'));
    expect(() => decodeArcalc(cut)).toThrow();
  });
});
