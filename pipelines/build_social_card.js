// build_social_card.js — generate a 1200×630 Open Graph / Twitter Card image
// for X, Facebook, LinkedIn, iMessage previews. Composites the Boston skyline
// hero photo + a dark gradient + the editorial title overlay.
//
// Output: assets/og-image.jpg

const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const ROOT = path.join(__dirname, '..');
const HERO = path.join(ROOT, 'assets', 'hero-boston-skyline-web.jpg');
const OUT  = path.join(ROOT, 'assets', 'og-image.jpg');

// SVG overlay — drawn on top of the cropped hero photo
const overlay = `<?xml version="1.0" encoding="UTF-8"?>
<svg width="1200" height="630" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="darken" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%"  stop-color="rgb(10,18,24)" stop-opacity="0.55"/>
      <stop offset="55%" stop-color="rgb(10,18,24)" stop-opacity="0.75"/>
      <stop offset="100%" stop-color="rgb(10,18,24)" stop-opacity="0.92"/>
    </linearGradient>
  </defs>

  <!-- darken gradient over the photo -->
  <rect width="1200" height="630" fill="url(#darken)"/>

  <!-- top accent rule + kicker -->
  <line x1="500" y1="68"  x2="700" y2="68"  stroke="rgba(243,238,222,0.30)" stroke-width="1"/>
  <text x="600" y="92"
        font-family="Inter, Helvetica, Arial, sans-serif"
        font-size="13" font-weight="600"
        letter-spacing="6"
        text-anchor="middle"
        fill="rgb(232,184,51)">A DATA INVESTIGATION  ·  MASSACHUSETTS  ·  2026</text>
  <line x1="500" y1="108" x2="700" y2="108" stroke="rgba(243,238,222,0.30)" stroke-width="1"/>

  <!-- title block - line 1 -->
  <text x="600" y="270"
        font-family="Cormorant Garamond, Georgia, 'Times New Roman', serif"
        font-size="78" font-weight="500"
        text-anchor="middle"
        fill="rgb(243,238,222)">It is not a <tspan fill="rgba(243,238,222,0.4)">housing</tspan> crisis.</text>
  <!-- strikethrough on "housing" — measured to fit ~Cormorant 78px text width -->
  <line x1="528" y1="248" x2="711" y2="252" stroke="rgb(232,66,90)" stroke-width="3" transform="rotate(-2 600 250)"/>

  <!-- title block - line 2 -->
  <text x="600" y="370"
        font-family="Cormorant Garamond, Georgia, 'Times New Roman', serif"
        font-size="78" font-weight="600" font-style="italic"
        text-anchor="middle"
        fill="rgb(243,238,222)">It is an <tspan fill="rgb(232,184,51)">affordability</tspan> crisis.</text>

  <!-- byline -->
  <text x="600" y="510"
        font-family="Cormorant Garamond, Georgia, 'Times New Roman', serif"
        font-size="26" font-style="italic"
        text-anchor="middle"
        fill="rgba(243,238,222,0.85)">A Socratic walk through public data.</text>
  <text x="600" y="548"
        font-family="Cormorant Garamond, Georgia, 'Times New Roman', serif"
        font-size="26" font-style="italic"
        text-anchor="middle"
        fill="rgba(243,238,222,0.85)">Six questions. One conclusion.</text>

  <!-- footer -->
  <text x="600" y="600"
        font-family="Inter, Helvetica, Arial, sans-serif"
        font-size="12" font-weight="500"
        letter-spacing="3"
        text-anchor="middle"
        fill="rgba(232,184,51,0.85)">DUNCANBURNS2013-DOT.GITHUB.IO  /  HOUSING-AFFORDABILITY-CRISIS</text>
</svg>`;

(async () => {
  if (!fs.existsSync(HERO)) {
    console.error('hero photo missing:', HERO);
    process.exit(1);
  }

  await sharp(HERO)
    .resize(1200, 630, { fit: 'cover', position: 'center' })
    .composite([{ input: Buffer.from(overlay), top: 0, left: 0 }])
    .jpeg({ quality: 88, mozjpeg: true, progressive: true })
    .toFile(OUT);

  const size = fs.statSync(OUT).size;
  console.log(`wrote ${path.basename(OUT)} — ${(size / 1024).toFixed(0)} KB, 1200×630`);
})().catch(e => { console.error('FAILED:', e.message); process.exit(1); });
