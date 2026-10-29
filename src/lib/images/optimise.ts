// Squeezing the rendered PNG.
//
// Satori hands back a 32-bit RGBA PNG. These cards are flat colour — turf,
// chalk, two shirt colours, white text — so a palette of a few dozen entries
// is visually identical and a fraction of the size. Telegram re-encodes
// anything it receives anyway; sending it less costs nothing and uploads
// faster on a phone.
//
// sharp is a native module and not available on the edge runtime, so a route
// using this must declare `export const runtime = 'nodejs'`.

export async function optimisePng(png: Buffer): Promise<Buffer> {
  try {
    const sharp = (await import('sharp')).default;
    const out = await sharp(png)
      .png({ palette: true, colours: 64, effort: 10, compressionLevel: 9 })
      .toBuffer();
    // Never hand back something larger than what came in.
    return out.byteLength > 0 && out.byteLength < png.byteLength ? out : png;
  } catch {
    // sharp missing or unhappy: the unoptimised image is still a valid image.
    return png;
  }
}
