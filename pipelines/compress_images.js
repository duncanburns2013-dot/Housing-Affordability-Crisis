// compress_images.js — resize & compress assets/*.jpg|png to web sizes.
// Outputs alongside originals as <name>-web.jpg (and skips if already done).

const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const SRC = path.join(__dirname, '..', 'assets');
const TARGETS = [
  // file → output basename → max-width
  { in: 'boston-massachusetts-skyline-2026-03-24-11-47-14-utc.jpg', out: 'hero-boston-skyline-web.jpg', w: 2200 },
  { in: 'boston-massachusetts-usa-2026-01-09-06-34-48-utc.jpg',     out: 'beacon-hill-web.jpg',         w: 1800 },
  { in: 'massachusetts-state-house-boston-massachusetts-2026-03-24-23-55-08-utc.jpg', out: 'state-house-web.jpg', w: 1800 },
  { in: 'covered-bridge-in-jackson-nh-2026-03-24-06-09-38-utc.jpg', out: 'covered-bridge-nh-web.jpg',   w: 1800 },
  { in: 'springfield-massachusetts-usa-2026-01-09-06-39-32-utc.jpg', out: 'springfield-web.jpg',        w: 1800 },
  { in: 'Uhaul.jpg',     out: 'uhaul-web.jpg',     w: 1600 },
  { in: 'EA Shelter.PNG', out: 'ea-shelter-web.jpg', w: 1600 }
];

(async () => {
  for (const t of TARGETS) {
    const inPath = path.join(SRC, t.in);
    const outPath = path.join(SRC, t.out);
    if (!fs.existsSync(inPath)) {
      console.log(`  SKIP (missing input): ${t.in}`);
      continue;
    }
    const inSize = fs.statSync(inPath).size;
    await sharp(inPath)
      .resize({ width: t.w, withoutEnlargement: true })
      .jpeg({ quality: 76, mozjpeg: true, progressive: true })
      .toFile(outPath);
    const outSize = fs.statSync(outPath).size;
    console.log(`  ${t.out.padEnd(28)} ${(inSize / 1024 / 1024).toFixed(1).padStart(5)}MB → ${(outSize / 1024).toFixed(0).padStart(4)}KB`);
  }
  console.log('\nDone.');
})().catch(e => { console.error('FAILED:', e.message); process.exit(1); });
