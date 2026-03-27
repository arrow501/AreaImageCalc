/**
 * CF Pages Function — POST raw image bytes, returns WebP.
 *
 * Requires the Cloudflare Images binding:
 *   wrangler.jsonc:  { "images": { "binding": "IMAGES" } }
 *   or via Pages dashboard: Settings → Functions → Images bindings → IMAGES
 *
 * Called by the client only as a fallback when OffscreenCanvas is
 * unavailable in the imageWorker (older browsers / non-Chromium).
 */
export async function onRequestPost(context) {
  if (!context.env.IMAGES) {
    return new Response('IMAGES binding not configured', { status: 503 });
  }

  try {
    var imageData = await context.request.arrayBuffer();
    if (!imageData.byteLength) return new Response('No data', { status: 400 });

    // .output() returns a Response directly — return it as-is
    return await context.env.IMAGES
      .input(imageData)
      .output({ format: 'webp', quality: 35 });

  } catch (err) {
    return new Response('Transform failed: ' + err.message, { status: 500 });
  }
}
