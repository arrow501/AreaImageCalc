// Pure color parsing — zero deps, Node-importable, fully unit-testable.
// Normalises #rgb, #rrggbb, rgb()/rgba(), and common names to '#RRGGBB'.
// Anything else returns null (the app layer may fall back to canvas parsing).

const NAMED = {
  black: '#000000', white: '#FFFFFF', red: '#FF0000', green: '#008000',
  blue: '#0000FF', yellow: '#FFFF00', orange: '#FFA500', purple: '#800080',
  pink: '#FFC0CB', cyan: '#00FFFF', magenta: '#FF00FF', teal: '#008080',
  lime: '#00FF00', brown: '#A52A2A', gray: '#808080', grey: '#808080',
  navy: '#000080', olive: '#808000', maroon: '#800000', gold: '#FFD700',
  silver: '#C0C0C0', coral: '#FF7F50', salmon: '#FA8072', violet: '#EE82EE',
  indigo: '#4B0082', turquoise: '#40E0D0', tan: '#D2B48C', beige: '#F5F5DC',
  crimson: '#DC143C', khaki: '#F0E68C', orchid: '#DA70D6', plum: '#DDA0DD',
  skyblue: '#87CEEB', tomato: '#FF6347', chocolate: '#D2691E'
};

export function parseColor(str) {
  if (typeof str !== 'string') return null;
  const s = str.trim().toLowerCase();
  if (!s) return null;

  let m = /^#([0-9a-f]{3})$/.exec(s);
  if (m) {
    const h = m[1];
    return ('#' + h[0] + h[0] + h[1] + h[1] + h[2] + h[2]).toUpperCase();
  }

  m = /^#([0-9a-f]{6})$/.exec(s);
  if (m) return ('#' + m[1]).toUpperCase();

  m = /^rgba?\(\s*(\d{1,3})\s*[, ]\s*(\d{1,3})\s*[, ]\s*(\d{1,3})\s*(?:[,/][^)]*)?\)$/.exec(s);
  if (m) {
    const r = +m[1], g = +m[2], b = +m[3];
    if (r > 255 || g > 255 || b > 255) return null;
    return '#' + [r, g, b].map(function(v) {
      return v.toString(16).padStart(2, '0');
    }).join('').toUpperCase();
  }

  return NAMED[s] || null;
}
