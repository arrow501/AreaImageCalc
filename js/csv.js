// Measurements CSV builder — pure string functions, zero deps,
// Node-importable, fully unit-testable.

export function csvEscape(v) {
  const s = String(v == null ? '' : v);
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

export function csvNum(v) {
  if (v == null || typeof v !== 'number' || !isFinite(v)) return '';
  return String(Math.round(v * 10000) / 10000);
}

const HEADER = ['document', 'name', 'type', 'area', 'area_unit',
                'length', 'length_unit', 'area_px2', 'length_px', 'text'];

// tabs: [{ label, scalePPU, scaleUnit, shapes: [...] }]
// Length column holds perimeter for closed shapes and path length for
// segments. Rows use CRLF per RFC 4180.
export function buildMeasurementsCsv(tabs) {
  const rows = [HEADER.join(',')];

  for (let t = 0; t < tabs.length; t++) {
    const tab = tabs[t];
    const ppu = tab.scalePPU > 0 ? tab.scalePPU : 0;
    const unit = tab.scaleUnit || '';
    const shapes = tab.shapes || [];

    for (let i = 0; i < shapes.length; i++) {
      const s = shapes[i];
      let areaPx = null, lenPx = null;

      if (s.type === 'segment') {
        lenPx = s.length;
      } else if (s.type !== 'note') {
        areaPx = s.area;
        lenPx = s.perimeter;
      }

      rows.push([
        csvEscape(tab.label || ''),
        csvEscape(s.name || ''),
        csvEscape(s.type || ''),
        ppu && areaPx != null ? csvNum(areaPx / (ppu * ppu)) : '',
        ppu && areaPx != null ? csvEscape(unit + '²') : '',
        ppu && lenPx != null ? csvNum(lenPx / ppu) : '',
        ppu && lenPx != null ? csvEscape(unit) : '',
        csvNum(areaPx),
        csvNum(lenPx),
        csvEscape(s.type === 'note' ? (s.text || '') : '')
      ].join(','));
    }
  }

  return rows.join('\r\n') + '\r\n';
}
