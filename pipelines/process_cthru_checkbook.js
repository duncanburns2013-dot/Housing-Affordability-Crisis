// process_cthru_checkbook.js
// Reads the CTHRU checkbook CSVs Duncan exported from cthru.macomptroller.org
// and aggregates by Appropriation × Budget_Fiscal_Year. Replaces the older
// pegc-naaa Socrata pulls (which were missing federal-pass-through and
// some operator-grant payments).
//
// Inputs: data/raw/cthru_checkbook/checkbook_data_*.csv
// Output: data/processed/cthru-spending.json (overwrites)

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'data', 'raw', 'cthru_checkbook');
const OUT = path.join(ROOT, 'data', 'processed', 'cthru-spending.json');

// streaming-friendly CSV line splitter (handles quoted fields w/ commas)
function splitCsv(line) {
  const out = [];
  let cur = '', inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') { inQ = !inQ; continue; }
    if (c === ',' && !inQ) { out.push(cur); cur = ''; continue; }
    cur += c;
  }
  out.push(cur);
  return out;
}

// Aggregation buckets: appropriation_code -> fiscal_year -> total
const byCodeYear = new Map();
const codeNames  = new Map(); // appropriation_code -> nicer display name

let totalRows = 0, totalAmount = 0, dedupePayments = 0;
const seenPaymentIds = new Set();

const files = fs.readdirSync(SRC).filter(f => f.startsWith('checkbook_data_') && f.endsWith('.csv'));
console.log(`Reading ${files.length} checkbook CSVs from ${SRC}`);

for (const f of files) {
  const text = fs.readFileSync(path.join(SRC, f), 'utf8');
  const lines = text.split(/\r?\n/);
  if (lines.length < 2) continue;
  const header = splitCsv(lines[0].trim());
  const idx = (name) => header.findIndex(h => h.trim().toLowerCase().replace(/[ _]/g, '') === name.toLowerCase().replace(/[ _]/g, ''));
  const iAmount  = idx('Amount');
  const iFY      = idx('Budget_Fiscal_Year');
  const iCode    = idx('Appropriation_Code');
  const iApprop  = idx('Appropriation');
  const iPay     = idx('Payment ID');
  if (iAmount < 0 || iFY < 0 || iCode < 0) {
    console.warn(`  ${f}: missing columns, skipping`);
    continue;
  }

  let n = 0;
  for (let i = 1; i < lines.length; i++) {
    const ln = lines[i];
    if (!ln.trim()) continue;
    const cells = splitCsv(ln);
    const amt = Number(cells[iAmount]);
    if (!Number.isFinite(amt) || amt === 0) continue;
    const fy = Number(cells[iFY]);
    if (!Number.isFinite(fy)) continue;
    const code = (cells[iCode] || '').trim();
    if (!code || code === 'UNASSIGNED') continue;
    const apprName = (cells[iApprop] || '').trim();
    const pid = (iPay >= 0 ? cells[iPay] : '') + '|' + cells[0];

    // dedupe across files: the same payment may appear in multiple exports
    if (seenPaymentIds.has(pid)) { dedupePayments++; continue; }
    seenPaymentIds.add(pid);

    if (!byCodeYear.has(code)) byCodeYear.set(code, new Map());
    const yearMap = byCodeYear.get(code);
    yearMap.set(fy, (yearMap.get(fy) || 0) + amt);
    if (apprName && !codeNames.has(code)) codeNames.set(code, apprName);
    n++;
    totalRows++;
    totalAmount += amt;
  }
  console.log(`  ${f}: ${n.toLocaleString().padStart(8)} rows kept`);
}
console.log(`\nTotal: ${totalRows.toLocaleString()} rows, ${dedupePayments.toLocaleString()} duplicate payments dropped`);
console.log(`Sum across all kept rows: $${(totalAmount / 1e6).toFixed(0)}M`);

// ---- categorize ----
// Demand-side = $ flows to households or operators that house households.
//               Competes with unsubsidized renters in the same rental pool.
//               Inflates clearing prices in a constrained market.
// Supply-side  = $ flows to building/maintaining units. Adds inventory,
//               doesn't bid up rents on existing stock.
const CATEGORIES = {
  ea_shelter: {
    label: 'EA family shelter + emergency reserves',
    color: '#ff1744',
    side: 'demand',
    codeMatch: (code, name) =>
      code === '70040101' ||                                            // EA Family Shelters & Services
      code === '70040103' ||                                            // EA Hotel/Motel Overflow
      code === '70040109' ||                                            // Shelter Workforce Assistance
      code === '70040108' ||                                            // MA Short-term Housing Trans. Prog.
      /FAMILY SHELTER AND SERVICES RESERVE/i.test(name) ||              // 1599xxxx supplementals
      /IMMIGRANTS AND REFUGEES HOUSING RESERVE/i.test(name) ||
      /IMMIGRANTS AND REFUGEES SUPPORTS RESERVE/i.test(name) ||
      /HOMELESS FAMILY/i.test(name) ||
      /SHELTER WORKFORCE/i.test(name) ||
      /SHORTTERM HOUSING TRANS/i.test(name) ||
      /OPERATION OF HOMELESS/i.test(name) ||                            // 70040100
      /CONTINUUM OF CARE/i.test(name)                                    // 44000707, 50469100
  },
  rental_subsidy: {
    label: 'Rental vouchers, RAFT, tenancy supports',
    color: '#ffd600',
    side: 'demand',
    codeMatch: (code, name) =>
      code === '70049024' ||                                            // MRVP / Rental Vouchers
      code === '70049030' ||                                            // Transitional Rental Assistance
      code === '70040062' ||                                            // Housing Stabilization
      /RENTAL VOUCHER/i.test(name) ||
      /HOMEBASE/i.test(name) ||
      /RAFT/i.test(name) ||
      /RESIDENTIAL ASSIST/i.test(name) ||
      /TENANCY PRESERV/i.test(name) ||
      /SERVICE COORDINATOR/i.test(name) ||                              // 70044314
      /HOUSING CONSUMER/i.test(name) ||
      /HOUSING SERVICES PROGRAM/i.test(name)
  },
  public_housing_supply: {
    label: 'Public housing operations + capital',
    color: '#00b8ff',
    side: 'supply',
    codeMatch: (code, name) =>
      /PUBLIC HOUSING/i.test(name) ||
      /HOUSING AUTHORIT/i.test(name) ||                                  // 70049005
      /SENIOR AND VETERAN HOUSING/i.test(name) ||                        // 15992023
      /SUPPORTIVE HOUSING/i.test(name) ||
      /HOUSING PRESERVATION/i.test(name)                                 // 70044778
  },
  housing_production: {
    label: 'Affordable housing production',
    color: '#00e676',
    side: 'supply',
    codeMatch: (code, name) =>
      /AFFORDABLE HOUSING TRUST/i.test(name) ||                          // 70040052, 70049304
      /HOUSING PRODUCTION/i.test(name) ||                                // 15996084
      /COMMONWEALTH BUILDER/i.test(name) ||                              // 15992021
      /EQUITABLE DEVELOPER/i.test(name) ||                               // 15996085
      /LOW INCOME HOUSING TAX CREDIT/i.test(name) ||                     // 70049315
      /HSF & CIPF/i.test(name) ||                                        // 70040073
      /SMALL CITIES COMMUNITY DEVELOPMENT/i.test(name) ||                // 70043037
      /COMMUNITY SERVICE BLOCK GRANT/i.test(name) ||                     // 70042034
      /HOMEOWNERSHIP/i.test(name)
  }
};

// classify each code → category (first match wins)
const codeToCategory = new Map();
for (const [code, yearMap] of byCodeYear) {
  const name = codeNames.get(code) || '';
  for (const [k, cfg] of Object.entries(CATEGORIES)) {
    if (cfg.codeMatch(code, name)) {
      codeToCategory.set(code, k);
      break;
    }
  }
}

// aggregate per category per year
const yearSet = new Set();
const catYear = {};
for (const k of Object.keys(CATEGORIES)) catYear[k] = {};
for (const [code, yearMap] of byCodeYear) {
  const cat = codeToCategory.get(code);
  if (!cat) continue;
  for (const [yr, amt] of yearMap) {
    yearSet.add(yr);
    catYear[cat][yr] = (catYear[cat][yr] || 0) + amt;
  }
}

// reasonable display window
const years = [...yearSet].sort((a, b) => a - b).filter(y => y >= 2014 && y <= 2026);

const result = {
  meta: {
    generated: new Date().toISOString(),
    source: 'CTHRU checkbook export (cthru.macomptroller.org), processed locally',
    note: 'Aggregated from individual payment-level transactions exported from CTHRU. Matches what the public CTHRU portal displays for these appropriations. Excludes federal pass-throughs that route outside MMARS accounting.',
    files_processed: files.length,
    rows_processed: totalRows
  },
  years,
  categories: {},
  total_by_year: []
};

for (const [k, cfg] of Object.entries(CATEGORIES)) {
  result.categories[k] = {
    label: cfg.label,
    color: cfg.color,
    by_year: years.map(y => Math.round(catYear[k][y] || 0))
  };
}
result.total_by_year = years.map((y, i) => {
  let s = 0;
  for (const k in result.categories) s += result.categories[k].by_year[i];
  return s;
});

fs.writeFileSync(OUT, JSON.stringify(result, null, 2));

// also dump unmatched codes summary so we can audit
const unmatched = [];
for (const [code, yearMap] of byCodeYear) {
  if (!codeToCategory.has(code)) {
    let total = 0;
    for (const v of yearMap.values()) total += v;
    if (total > 100_000) unmatched.push({ code, name: codeNames.get(code) || '', total });
  }
}
unmatched.sort((a, b) => b.total - a.total);
console.log(`\nUNMATCHED appropriations >$100K (top 15 by total):`);
for (const u of unmatched.slice(0, 15)) {
  console.log(`  ${u.code}  $${(u.total / 1e6).toFixed(1)}M  ${u.name}`);
}

console.log('\n=== CTHRU Summary by FY (millions) — categorized ===');
const catKeys = Object.keys(result.categories);
console.log('FY    ' + catKeys.map(k => k.padEnd(10)).join('  ') + '  TOTAL');
for (let i = 0; i < years.length; i++) {
  const y = years[i];
  const fmt = (v) => '$' + (v / 1e6).toFixed(0) + 'M';
  const row = catKeys.map(k => fmt(result.categories[k].by_year[i]).padStart(10)).join('  ');
  console.log(`${y}  ${row}  ${fmt(result.total_by_year[i]).padStart(8)}`);
}
console.log('\nDemand-side total by FY (the inflation channel):');
const demandKeys = Object.entries(CATEGORIES).filter(([k,v]) => v.side === 'demand').map(([k]) => k);
const supplyKeys = Object.entries(CATEGORIES).filter(([k,v]) => v.side === 'supply').map(([k]) => k);
for (let i = 0; i < years.length; i++) {
  const y = years[i];
  const dem = demandKeys.reduce((s, k) => s + result.categories[k].by_year[i], 0);
  const sup = supplyKeys.reduce((s, k) => s + result.categories[k].by_year[i], 0);
  console.log(`  FY${y}  demand $${(dem/1e6).toFixed(0)}M   supply $${(sup/1e6).toFixed(0)}M   total $${(result.total_by_year[i]/1e6).toFixed(0)}M`);
}
// embed demand/supply roll-up in the JSON for the chart
result.meta.demand_keys = demandKeys;
result.meta.supply_keys = supplyKeys;
result.demand_total_by_year = years.map((_, i) => demandKeys.reduce((s, k) => s + result.categories[k].by_year[i], 0));
result.supply_total_by_year = years.map((_, i) => supplyKeys.reduce((s, k) => s + result.categories[k].by_year[i], 0));
fs.writeFileSync(OUT, JSON.stringify(result, null, 2));
console.log(`\nWrote ${OUT}`);
