// Image encoding worker — converts ImageBitmap to WebP via OffscreenCanvas.
// Runs off the main thread so image transcoding never blocks the UI.

self.onmessage = async function(e) {
  var d = e.data;
  if (d.type !== 'encodeWebP') return;

  try {
    var cvs = new OffscreenCanvas(d.bitmap.width, d.bitmap.height);
    cvs.getContext('2d').drawImage(d.bitmap, 0, 0);
    d.bitmap.close();
    var blob = await cvs.convertToBlob({ type: 'image/webp', quality: 0.35 });
    var buffer = await blob.arrayBuffer();
    self.postMessage({ type: 'webpResult', id: d.id, buffer: buffer }, [buffer]);
  } catch (err) {
    // OffscreenCanvas or convertToBlob not supported — signal fallback to main thread
    self.postMessage({ type: 'webpError', id: d.id, error: err.message, fallback: true });
  }
};
