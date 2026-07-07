// Canvas encoding helper — no module imports (DOM only).

// WebP keeps alpha and is far smaller than PNG; browsers that cannot encode
// WebP (Safari) silently return PNG from toDataURL, which we detect and keep.
export function encodeCanvas(cvs, quality) {
  const webp = cvs.toDataURL('image/webp', quality || 0.92);
  if (webp.indexOf('data:image/webp') === 0) return webp;
  return cvs.toDataURL('image/png');
}
