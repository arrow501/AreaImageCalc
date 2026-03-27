/**
 * CF Pages Function — POST raw image bytes, returns WebP.
 *
 * Requires the Cloudflare Images binding configured in Pages settings:
 *   Variable name: IMAGES   (Settings → Functions → Images bindings)
 *
 * Called by the client only as a fallback when OffscreenCanvas is
 * unavailable in the imageWorker (older browsers / non-Chromium).
 */
export async function onRequestPost(context) {
  try {
    var imageData = await context.request.arrayBuffer();
    if (!imageData.byteLength) return new Response('No data', { status: 400 });

    var webp = await context.env.IMAGES
      .input(imageData)
      .output({ format: 'webp', quality: 35 });

    return new Response(webp, {
      headers: { 'content-type': 'image/webp' }
    });
  } catch (err) {
    return new Response('Transform failed: ' + err.message, { status: 500 });
  }
}
