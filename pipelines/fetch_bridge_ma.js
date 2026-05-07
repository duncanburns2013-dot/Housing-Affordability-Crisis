// fetch_bridge_ma.js
// Pulls Massachusetts active listings + last-12-months sold from Bridge Data Output
// (RESO Web API), aggregates by City (town), and writes JSON for the dashboard.
//
// Usage:
//   1. Save your token to .env (see .env.example)
//   2. node pipelines/fetch_bridge_ma.js
//
// Bridge API docs: https://bridgedataoutput.com/docs/platform/
// RESO endpoints: GET /v2/OData/{dataset}/Property?access_token=...&$filter=...&$select=...&$top=200&$skip=0
//
// We page through with $skip / $top up to a hard cap to avoid runaway pulls.
// All raw responses are cached to data/raw/ for reproducibility.

const fs = require('fs');
const path = require('path');
const https = require('https');
const { URL } = require('url');

const ROOT = path.join(__dirname, '..');
const RAW = path.join(ROOT, 'data', 'raw');
const OUT = path.join(ROOT, 'data', 'processed');
fs.mkdirSync(RAW, { recursive: true });
fs.mkdirSync(OUT, { recursive: true });

// --------- env loader (no dotenv dep) ---------
function loadEnv() {
  const file = path.join(ROOT, '.env');
  if (!fs.existsSync(file)) {
    console.error('Missing .env — copy .env.example to .env and add your BRIDGE_TOKEN.');
    process.exit(1);
  }
  const env = {};
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return env;
}

// --------- HTTP with retry ---------
function get(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let body = '';
      res.on('data', (c) => body += c);
      res.on('end', () => {
        if (res.statusCode >= 400) {
          return reject(new Error(`HTTP ${res.statusCode}: ${body.slice(0, 400)}`));
        }
        try { resolve(JSON.parse(body)); } catch (e) { reject(e); }
      });
    }).on('error', reject);
  });
}

async function getWithRetry(url, attempts = 4) {
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    try { return await get(url); }
    catch (e) {
      lastErr = e;
      const wait = 1000 * Math.pow(2, i);
      console.warn(`  retry ${i + 1}/${attempts} after ${wait}ms: ${e.message}`);
      await new Promise(r => setTimeout(r, wait));
    }
  }
  throw lastErr;
}

// --------- pager ---------
// Bridge caps $skip at 10000, so we use keyset pagination on ListingKey.
// We pull pages sorted by ListingKey asc, advancing the filter past the
// last key we saw on each page. This is O(N) requests with no cap.
async function pageAll({ token, dataset, filter, select, top = 200, cap = 200000, label }) {
  const all = [];
  let lastKey = null;
  let pages = 0;
  // ensure ListingKey is in the select list (we need it as the cursor)
  if (!select.split(',').map(s => s.trim()).includes('ListingKey')) {
    select = 'ListingKey,' + select;
  }
  while (all.length < cap) {
    const f = lastKey
      ? `${filter} and ListingKey gt '${lastKey}'`
      : filter;
    const u = new URL(`https://api.bridgedataoutput.com/api/v2/OData/${dataset}/Property`);
    u.searchParams.set('access_token', token);
    u.searchParams.set('$filter', f);
    u.searchParams.set('$select', select);
    u.searchParams.set('$orderby', 'ListingKey asc');
    u.searchParams.set('$top', String(top));
    const json = await getWithRetry(u.toString());
    const batch = json.value || json.bundle || [];
    if (!batch.length) break;
    all.push(...batch);
    pages++;
    process.stdout.write(`  ${label}: page ${pages}, total ${all.length}\r`);
    if (batch.length < top) break;
    lastKey = batch[batch.length - 1].ListingKey;
  }
  process.stdout.write('\n');
  return all;
}

// --------- aggregator ---------
function median(arr) {
  if (!arr.length) return null;
  const a = arr.slice().sort((x, y) => x - y);
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
}

function aggregateByCity(records, fields) {
  const buckets = new Map();
  for (const r of records) {
    const city = (r.City || '').trim();
    if (!city) continue;
    if (!buckets.has(city)) buckets.set(city, []);
    buckets.get(city).push(r);
  }
  const out = [];
  for (const [city, recs] of buckets) {
    const row = { City: city, count: recs.length };
    for (const f of fields) {
      const vals = recs.map(r => r[f]).filter(v => v != null && !Number.isNaN(Number(v))).map(Number);
      row[`median_${f}`] = median(vals);
      row[`mean_${f}`] = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
    }
    out.push(row);
  }
  out.sort((a, b) => b.count - a.count);
  return out;
}

// --------- main ---------
(async () => {
  const env = loadEnv();
  const token = env.BRIDGE_TOKEN;
  const dataset = env.BRIDGE_DATASET || 'mlspin';
  if (!token || token === 'your_server_access_token_here') {
    console.error('BRIDGE_TOKEN missing in .env');
    process.exit(1);
  }

  // Field notes for MLS PIN:
  //   DaysOnMarket equivalent is MLSPIN_MARKET_TIME
  //   Sold $/sqft  is MLSPIN_SOLD_PRICE_PER_SQFT
  //   List $/sqft  is MLSPIN_LIST_PRICE_PER_SQFT
  //   Restrict to PropertyType = Residential (excludes commercial/land/business).

  const commonFields = [
    'ListingKey', 'ListingId', 'City', 'PostalCode',
    'PropertyType', 'PropertySubType',
    'ListPrice', 'OriginalListPrice',
    'LivingArea', 'BedroomsTotal', 'BathroomsTotalInteger',
    'YearBuilt', 'Latitude', 'Longitude',
    'TaxAnnualAmount', 'TaxAssessedValue',
    'MLSPIN_MARKET_TIME', 'MLSPIN_LIST_PRICE_PER_SQFT',
    'StandardStatus', 'ListingContractDate'
  ];

  // 1) ACTIVE listings in MA
  console.log(`\n[1/2] Active MA listings — dataset=${dataset}`);
  const activeFilter = "StandardStatus eq 'Active' and StateOrProvince eq 'MA' and PropertyType eq 'Residential'";
  const selectActive = commonFields.join(',');
  const active = await pageAll({
    token, dataset, filter: activeFilter, select: selectActive, label: 'active'
  });
  fs.writeFileSync(path.join(RAW, 'bridge_ma_active.json'), JSON.stringify(active));
  console.log(`  saved ${active.length} active records`);

  // 2) CLOSED in last 365 days in MA
  console.log(`\n[2/2] Closed MA sales (last 365 days) — dataset=${dataset}`);
  const since = new Date(Date.now() - 365 * 86400e3).toISOString().slice(0, 10);
  const closedFilter = `StandardStatus eq 'Closed' and StateOrProvince eq 'MA' and PropertyType eq 'Residential' and CloseDate ge ${since}`;
  const selectClosed = commonFields.concat(['ClosePrice', 'CloseDate', 'MLSPIN_SOLD_PRICE_PER_SQFT']).join(',');
  const closed = await pageAll({
    token, dataset, filter: closedFilter, select: selectClosed, label: 'closed'
  });
  fs.writeFileSync(path.join(RAW, 'bridge_ma_closed.json'), JSON.stringify(closed));
  console.log(`  saved ${closed.length} closed records`);

  // ---- aggregate ----
  console.log('\nAggregating by City...');
  const activeByCity = aggregateByCity(active, ['ListPrice', 'LivingArea', 'MLSPIN_MARKET_TIME', 'MLSPIN_LIST_PRICE_PER_SQFT', 'TaxAnnualAmount']);
  const closedByCity = aggregateByCity(closed, ['ClosePrice', 'ListPrice', 'OriginalListPrice', 'LivingArea', 'MLSPIN_MARKET_TIME', 'MLSPIN_SOLD_PRICE_PER_SQFT', 'TaxAnnualAmount']);

  fs.writeFileSync(path.join(OUT, 'ma-active-by-city.json'), JSON.stringify({
    meta: { generated: new Date().toISOString(), source: 'Bridge / ' + dataset, totalRecords: active.length, cities: activeByCity.length },
    rows: activeByCity
  }, null, 2));
  fs.writeFileSync(path.join(OUT, 'ma-closed-by-city.json'), JSON.stringify({
    meta: { generated: new Date().toISOString(), source: 'Bridge / ' + dataset, totalRecords: closed.length, cities: closedByCity.length, since },
    rows: closedByCity
  }, null, 2));

  console.log(`\nDone. Wrote ${activeByCity.length} active cities, ${closedByCity.length} closed cities.`);
})().catch(e => {
  console.error('\nFAILED:', e.message);
  process.exit(1);
});
