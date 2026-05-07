// fetch_towns.js — pull MA municipal boundaries (351 towns) as GeoJSON
// from the MassDOT Boundaries/Towns ArcGIS REST endpoint, then merge with
// the MLSPIN by-city aggregates and write a single map-ready JSON.
//
// Output: data/processed/ma-towns.geojson  (with merged stats per feature)
//
// The MassDOT endpoint returns Median_Household_Income directly, so we get
// town-level price-to-income for free.

const fs = require('fs');
const path = require('path');
const https = require('https');
const { URL } = require('url');

const ROOT = path.join(__dirname, '..');
const RAW = path.join(ROOT, 'data', 'raw');
const OUT = path.join(ROOT, 'data', 'processed');
fs.mkdirSync(RAW, { recursive: true });

const ENDPOINT = 'https://gis.massdot.state.ma.us/arcgis/rest/services/Boundaries/Towns/MapServer/0/query';

function getJson(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let body = '';
      res.on('data', c => body += c);
      res.on('end', () => {
        if (res.statusCode >= 400) return reject(new Error(`HTTP ${res.statusCode}: ${body.slice(0, 300)}`));
        try { resolve(JSON.parse(body)); } catch (e) { reject(e); }
      });
    }).on('error', reject);
  });
}

// ArcGIS REST returns features in chunks of maxRecordCount (typically 1000).
// 351 fits in a single page but we paginate by OBJECTID for safety.
async function fetchAllTowns() {
  // 1) get total count
  const countUrl = `${ENDPOINT}?where=1%3D1&returnCountOnly=true&f=json`;
  const countRes = await getJson(countUrl);
  const total = countRes.count;
  console.log(`Total towns to fetch: ${total}`);

  // 2) get IDs (lightweight)
  const idsUrl = `${ENDPOINT}?where=1%3D1&returnIdsOnly=true&f=json`;
  const idsRes = await getJson(idsUrl);
  const ids = idsRes.objectIds.slice().sort((a, b) => a - b);
  console.log(`OBJECTIDs: ${ids[0]}..${ids[ids.length - 1]}`);

  // 3) fetch in batches of 100 with full geometry
  const batchSize = 100;
  const features = [];
  for (let i = 0; i < ids.length; i += batchSize) {
    const batch = ids.slice(i, i + batchSize);
    const u = new URL(ENDPOINT);
    u.searchParams.set('objectIds', batch.join(','));
    u.searchParams.set('outFields', 'TOWN,TOWN_ID,SQUARE_MILES,Median_Household_Income,Below_Statewide_Average,Coastal,RTA');
    u.searchParams.set('f', 'geojson');
    u.searchParams.set('outSR', '4326'); // WGS84 lon/lat
    u.searchParams.set('returnGeometry', 'true');
    u.searchParams.set('geometryPrecision', '6');
    const res = await getJson(u.toString());
    if (res.features) features.push(...res.features);
    process.stdout.write(`  fetched ${features.length}/${total}\r`);
  }
  process.stdout.write('\n');
  return { type: 'FeatureCollection', features };
}

// ---- centroid (rough; weighted by ring vertex count, fine for label/column placement) ----
function ringCentroid(coords) {
  let x = 0, y = 0;
  for (const [lng, lat] of coords) { x += lng; y += lat; }
  return [x / coords.length, y / coords.length];
}
function polygonCentroid(geom) {
  if (geom.type === 'Polygon') return ringCentroid(geom.coordinates[0]);
  if (geom.type === 'MultiPolygon') {
    // weight each ring by its vertex count; simple but adequate at this zoom
    let sx = 0, sy = 0, sw = 0;
    for (const poly of geom.coordinates) {
      const w = poly[0].length;
      const c = ringCentroid(poly[0]);
      sx += c[0] * w; sy += c[1] * w; sw += w;
    }
    return sw ? [sx / sw, sy / sw] : null;
  }
  return null;
}

// ---- name normalization for joining ----
const norm = (s) => (s || '').toString().trim().toUpperCase()
  .replace(/[\.\,]/g, '')
  .replace(/\s+/g, ' ');

// MassDOT publishes towns under their official long-form names; MLSPIN listings
// almost always use the short colloquial form. Map official → MLSPIN.
const TOWN_ALIASES = {
  'FOXBOROUGH':           'FOXBORO',
  'MIDDLEBOROUGH':        'MIDDLEBORO',
  'NORTH ATTLEBOROUGH':   'NORTH ATTLEBORO',
  'MANCHESTER BY THE SEA':'MANCHESTER',
  'NEW MARLBOROUGH':      'NEW MARLBORO'
};

// ---- main ----
(async () => {
  let geojson;
  const cachePath = path.join(RAW, 'ma-towns-raw.geojson');
  if (fs.existsSync(cachePath) && process.argv.indexOf('--refresh') === -1) {
    console.log('Using cached raw GeoJSON (pass --refresh to redownload)');
    geojson = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
  } else {
    geojson = await fetchAllTowns();
    fs.writeFileSync(cachePath, JSON.stringify(geojson));
    console.log(`Cached ${geojson.features.length} features to ${cachePath}`);
  }

  // load MLSPIN by-city aggregates
  const closed = JSON.parse(fs.readFileSync(path.join(OUT, 'ma-closed-by-city.json'), 'utf8'));
  const active = JSON.parse(fs.readFileSync(path.join(OUT, 'ma-active-by-city.json'), 'utf8'));
  const closedByName = new Map(closed.rows.map(r => [norm(r.City), r]));
  const activeByName = new Map(active.rows.map(r => [norm(r.City), r]));

  // 5-year MLSPIN fallback for towns whose 12-month API pull returned no
  // closed sales (parsed from Duncan's manual MLSPIN sub-report PDFs).
  let fiveYrFallback = new Map();
  const fbPath = path.join(OUT, 'ma-towns-5yr-fallback.json');
  if (fs.existsSync(fbPath)) {
    const fb = JSON.parse(fs.readFileSync(fbPath, 'utf8'));
    for (const t of fb.towns) {
      if (t.fiveYearTotalCount > 0) {
        fiveYrFallback.set(norm(t.town), t);
      }
    }
    console.log(`Loaded 5-yr fallback for ${fiveYrFallback.size} towns from ${path.basename(fbPath)}`);
  }

  let matched = 0, missing = 0;
  const missingNames = [];

  for (const f of geojson.features) {
    const town = f.properties.TOWN;
    const key = norm(town);
    const lookupKey = TOWN_ALIASES[key] || key;
    const c = closedByName.get(lookupKey);
    const a = activeByName.get(lookupKey);

    f.properties.centroid = polygonCentroid(f.geometry);

    if (c) {
      f.properties.median_sold = Math.round(c.median_ClosePrice);
      f.properties.sold_count = c.count;
      f.properties.median_dom = c.median_MLSPIN_MARKET_TIME;
      f.properties.sold_psf = c.median_MLSPIN_SOLD_PRICE_PER_SQFT;
      f.properties.median_orig_list = Math.round(c.median_OriginalListPrice || 0);
      matched++;
    } else if (fiveYrFallback.has(key)) {
      // Use 5-yr MLSPIN sub-report as fallback for tiny towns
      const fb = fiveYrFallback.get(key);
      f.properties.median_sold = fb.fiveYearAvgSalePrice;
      f.properties.sold_count = fb.fiveYearTotalCount;
      f.properties.median_dom = fb.fiveYearAvgDom;
      f.properties.sold_psf = null;
      f.properties.median_orig_list = null;
      f.properties.is_5yr_fallback = true;
      f.properties.fallback_window = fb.fiveYearWindow;
      matched++;
    } else {
      missing++;
      missingNames.push(town);
    }
    if (a) {
      f.properties.active_count = a.count;
      f.properties.median_list = Math.round(a.median_ListPrice);
      f.properties.list_psf = a.median_MLSPIN_LIST_PRICE_PER_SQFT;
    }

    // price-to-income ratio (closed) where both available
    if (f.properties.median_sold && f.properties.Median_Household_Income) {
      f.properties.price_to_income = +(f.properties.median_sold / f.properties.Median_Household_Income).toFixed(2);
    }
  }

  console.log(`\nJoin: matched=${matched}, missing=${missing}`);
  if (missingNames.length) {
    console.log('Towns without closed-sale data:', missingNames.slice(0, 20).join(', '),
      missingNames.length > 20 ? `... +${missingNames.length - 20} more` : '');
  }

  // write merged geojson — with full geometry (for the map)
  const outFile = path.join(OUT, 'ma-towns.geojson');
  fs.writeFileSync(outFile, JSON.stringify(geojson));
  console.log(`Wrote ${outFile} (${(fs.statSync(outFile).size / 1024).toFixed(0)} KB, ${geojson.features.length} features)`);

  // also write a slim geometry-free CSV-ish JSON for quick reads
  const slim = geojson.features.map(f => ({
    town: f.properties.TOWN,
    centroid: f.properties.centroid,
    median_sold: f.properties.median_sold,
    sold_count: f.properties.sold_count,
    median_dom: f.properties.median_dom,
    sold_psf: f.properties.sold_psf,
    median_household_income: f.properties.Median_Household_Income,
    price_to_income: f.properties.price_to_income,
    coastal: f.properties.Coastal === 1,
    sq_mi: f.properties.SQUARE_MILES,
    is_5yr_fallback: f.properties.is_5yr_fallback === true
  }));
  fs.writeFileSync(path.join(OUT, 'ma-towns-stats.json'), JSON.stringify({
    meta: { generated: new Date().toISOString(), towns: slim.length, matched, missing },
    rows: slim
  }, null, 2));

  // top/bottom summary
  const ranked = slim
    .filter(r => r.sold_count >= 20 && r.price_to_income)
    .sort((a, b) => b.price_to_income - a.price_to_income);
  console.log(`\nTop 5 by price-to-income (n>=20):`);
  ranked.slice(0, 5).forEach(r => console.log(`  ${r.town.padEnd(20)} | sold $${(r.median_sold/1000).toFixed(0)}K | inc $${(r.median_household_income/1000).toFixed(0)}K | ratio ${r.price_to_income}x`));
  console.log(`\nBottom 5 (most affordable, n>=20):`);
  ranked.slice(-5).reverse().forEach(r => console.log(`  ${r.town.padEnd(20)} | sold $${(r.median_sold/1000).toFixed(0)}K | inc $${(r.median_household_income/1000).toFixed(0)}K | ratio ${r.price_to_income}x`));
})().catch(e => { console.error('FAILED:', e.message); process.exit(1); });
