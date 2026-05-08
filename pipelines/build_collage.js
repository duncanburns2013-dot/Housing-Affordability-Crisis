// build_collage.js — generate a 1200×675 montage for the X opening post.
// Healey photo as a clearly-visible base layer, with dashboard photos arranged
// as semi-transparent "polaroid" panels around the edges so they frame her
// without smothering her. No text — pure visual.

const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const ROOT = path.join(__dirname, '..');
const A = (n) => path.join(ROOT, 'assets', n);
const OUT = A('share-collage.png');

const W = 1200, H = 675;

(async () => {
  // ---------- BASE: Healey, kept clearly visible ----------
  // Cool desaturated tone, modest darkening — she should still read as
  // recognizable through the overlays.
  const base = await sharp(A('healey-source.PNG'))
    .resize(W, H, { fit: 'cover', position: 'center' })
    .modulate({ saturation: 0.45, brightness: 0.78 })
    .tint({ r: 215, g: 225, b: 245 })           // cool blue cast
    .toBuffer();

  // Make a strongly-darkened "frame" version of Healey that we'll bring back
  // around the edges (creates a vignette effect through the overlays)
  const frameMask = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <radialGradient id="v" cx="50%" cy="48%" r="42%" fx="50%" fy="48%">
        <stop offset="0%"  stop-color="rgba(0,0,0,0)"/>
        <stop offset="65%" stop-color="rgba(8,14,22,0.30)"/>
        <stop offset="100%" stop-color="rgba(8,14,22,0.85)"/>
      </radialGradient>
    </defs>
    <rect width="${W}" height="${H}" fill="url(#v)"/>
  </svg>`;

  // ---------- prep each overlay panel ----------
  async function prep(name, w, h, brightness = 0.92) {
    return sharp(A(name))
      .resize(w, h, { fit: 'cover', position: 'center' })
      .modulate({ saturation: 0.85, brightness })
      .toBuffer();
  }

  // top edge: skyline strip (panoramic) — sets the city-night mood without
  // covering her face
  const skyline   = await prep('hero-boston-skyline-web.jpg',  W, 180, 0.95);

  // four corner panels — small enough to leave a clear center window for
  // Healey's face. Each ~280x180.
  const beacon    = await prep('beacon-hill-web.jpg',          280, 180, 0.95);
  const stateHouse= await prep('state-house-web.jpg',          280, 180, 1.00);
  const nhBridge  = await prep('covered-bridge-nh-web.jpg',    280, 180, 1.00);
  const uhaul     = await prep('uhaul-web.jpg',                280, 180, 1.00);

  // ---------- composite ----------
  // Order matters: skyline at top across whole width, then four corners.
  const composed = await sharp(base)
    .composite([
      // panoramic strip at top — over blended so it reads as part of the frame
      { input: skyline,    top: 0,   left: 0,    blend: 'over' },

      // four corner "stamps" — under the bottom band, around her shoulders
      { input: stateHouse, top: 0,   left: W-280, blend: 'over' },     // top-right (above skyline edge)
      { input: beacon,     top: H-180, left: 0,   blend: 'over' },     // bottom-left
      { input: uhaul,      top: H-180, left: 280, blend: 'over' },     // bottom-mid-left
      { input: nhBridge,   top: H-180, left: W-280, blend: 'over' },   // bottom-right

      // radial vignette unifies the whole composition and re-darkens the edges
      { input: Buffer.from(frameMask), top: 0, left: 0, blend: 'over' }
    ])
    .toBuffer();

  // ---------- final tone unification ----------
  // Subtle cool-color cast + light grain via a noise SVG, locks the whole
  // image into a single editorial mood.
  const finalOverlay = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="cool" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%"  stop-color="rgba(8,18,30,0.20)"/>
        <stop offset="55%" stop-color="rgba(8,14,22,0.05)"/>
        <stop offset="100%" stop-color="rgba(8,14,22,0.40)"/>
      </linearGradient>
    </defs>
    <rect width="${W}" height="${H}" fill="url(#cool)"/>
  </svg>`;

  await sharp(composed)
    .composite([{ input: Buffer.from(finalOverlay), top: 0, left: 0 }])
    .modulate({ saturation: 0.95, brightness: 1.02 })
    .png({ compressionLevel: 9 })
    .toFile(OUT);

  const size = fs.statSync(OUT).size;
  console.log(`wrote ${path.basename(OUT)} — ${(size / 1024).toFixed(0)} KB, ${W}×${H}`);
})().catch(e => { console.error('FAILED:', e.message); process.exit(1); });
