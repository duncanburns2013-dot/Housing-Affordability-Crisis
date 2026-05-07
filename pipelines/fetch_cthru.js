// fetch_cthru.js
// Pull demand-side spending categories from CTHRU (MA Comptroller payments
// dataset, Socrata pegc-naaa) by fiscal year. Aggregates across multiple
// related appropriation codes per category.
//
// Usage:  node pipelines/fetch_cthru.js
//
// Output: data/processed/cthru-spending.json
//
// Note on completeness:
//   pegc-naaa captures direct payments under each appropriation code. State
//   enacted budgets and supplemental authorizations for these programs run
//   HIGHER than CTHRU paid totals because:
//   - Federal pass-throughs aren't always shown
//   - Contracted-but-not-yet-paid amounts don't appear
//   - Some EA spending flows through subgrants under different codes
//   We use CTHRU because it's the unimpeachable "actually-paid" record.
//   Growth rates and program-mix shifts visible in CTHRU are real.

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const RAW = path.join(ROOT, 'data', 'raw');
const OUT = path.join(ROOT, 'data', 'processed');
fs.mkdirSync(RAW, { recursive: true });

const ENDPOINT = 'https://cthru.data.socrata.com/resource/pegc-naaa.json';

// Categories — each is a list of appropriation codes whose payments we sum.
// Codes verified by querying upper(appropriation_name) like '%KEYWORD%' first.
const CATEGORIES = {
  ea_shelter: {
    label: 'EA family shelter + emergency reserves',
    color: '#ff1744',
    description: 'Emergency Assistance family shelter, hotel/motel overflow, shelter workforce, plus 1599-prefix supplemental "Family Shelter and Services Reserve" accounts and immigrant/refugee housing reserves.',
    codes: [
      '70040101', // EA - FAMILY SHELTERS AND SERVICES
      '70040103', // HOMELESS FAMILY EA SHELTER OVERFLOW - HOTELS
      '70040109', // SHELTER WORKFORCE ASSISTANCE
      '15990514', // FAMILY SHELTER AND SERVICES RESERVE (FY19)
      '15991213', // FAMILY SHELTER AND SERVICES RESERVE (FY21)
      '15992625', // FAMILY SHELTER AND SERVICES RESERVE (FY25)
      '15990122', // IMMIGRANTS AND REFUGEES HOUSING RESERVE
      '15990925'  // IMMIGRANTS AND REFUGEES SUPPORTS RESERVE
    ]
  },
  rental_subsidy: {
    label: 'State rental vouchers (MRVP + program reserves)',
    color: '#ffd600',
    description: 'Massachusetts Rental Voucher Program (MRVP), housing stabilization, transitional rental assistance.',
    codes: [
      '70049024', // RENTAL VOUCHERS (MRVP)
      '70040062', // HOUSING STABILIZATION
      '70049030'  // TRANSITIONAL RENTAL ASSISTANCE PROGRAM
    ]
  },
  health_safety_net: {
    label: 'Health Safety Net (HSN)',
    color: '#00b8ff',
    description: 'HSN reimburses hospitals and community health centers for care provided to uninsured and underinsured residents — including non-citizens. Funded by hospital/insurer assessments and state appropriation.',
    codes: [
      '40000091', // HSN PAYMENTS - HOSPITAL
      '40000090', // HSN PAYMENTS - NON HOSPITAL
      '40000092', // HSN CLAIMS OPERATIONS
      '40000093', // HSN ARPA FUNDS
      '40001333', // SAFETY NET PROVIDER TRUST FUND
      '41000091', // HSN PAYMENTS - HOSPITAL (federal)
      '41000090', // HSN PAYMENTS - NON HOSPITAL (federal)
      '41000092'  // HSN OPERATIONS (federal)
    ]
  },
  refugee_immigrant: {
    label: 'Office of Refugees & Immigrants',
    color: '#00e676',
    description: 'Office of Refugees and Immigrants administration and trust fund.',
    codes: [
      '40030111', // ORI ADMINISTRATION
      '40030091'  // ORI TRUST FUND
    ]
  }
};

function fetchByCategory(codes) {
  const codeList = codes.map(c => `'${c}'`).join(',');
  // URL-encode the SoQL query
  const select = '$select=budget_fiscal_year,sum(amount)';
  const where = `$where=appropriation_code in (${codeList})`;
  const group = '$group=budget_fiscal_year';
  const order = '$order=budget_fiscal_year';
  const url = `${ENDPOINT}?${select}&${where}&${group}&${order}`;
  const encoded = url.replace(/ /g, '%20').replace(/'/g, '%27');
  const out = execFileSync('curl', ['-sS', '--max-time', '30', encoded], { encoding: 'utf8' });
  return JSON.parse(out);
}

const result = {
  meta: {
    generated: new Date().toISOString(),
    source: 'CTHRU pegc-naaa (MA Comptroller direct payments)',
    note: 'CTHRU shows actually-paid amounts. Enacted-budget figures for these programs are higher because they include federal pass-throughs, contracted-but-not-yet-paid amounts, and subgrants flowing through other codes. Growth shape and category mix are reliable; absolute totals are conservative lower bounds.'
  },
  years: [],
  categories: {}
};

const yearSet = new Set();
const byCategoryByYear = {};

for (const [key, cfg] of Object.entries(CATEGORIES)) {
  console.log(`Fetching ${key}…`);
  const rows = fetchByCategory(cfg.codes);
  byCategoryByYear[key] = {};
  for (const r of rows) {
    const y = Number(r.budget_fiscal_year);
    const v = Number(r.sum_amount);
    if (Number.isFinite(y) && Number.isFinite(v)) {
      byCategoryByYear[key][y] = Math.round(v);
      yearSet.add(y);
    }
  }
  console.log(`  ${key}: ${rows.length} years`);
}

const years = [...yearSet].sort((a, b) => a - b).filter(y => y >= 2014 && y <= 2025); // useful range
result.years = years;

for (const [key, cfg] of Object.entries(CATEGORIES)) {
  result.categories[key] = {
    label: cfg.label,
    color: cfg.color,
    description: cfg.description,
    codes: cfg.codes,
    by_year: years.map(y => byCategoryByYear[key][y] ?? 0)
  };
}

result.total_by_year = years.map((y, i) => {
  let sum = 0;
  for (const k in result.categories) sum += result.categories[k].by_year[i];
  return sum;
});

fs.writeFileSync(path.join(OUT, 'cthru-spending.json'), JSON.stringify(result, null, 2));

console.log('\nSummary by FY (millions):');
console.log('FY    EA Shelter  Rental    HSN       Refugee   TOTAL');
for (let i = 0; i < years.length; i++) {
  const y = years[i];
  const c = result.categories;
  const fmt = (v) => '$' + (v / 1e6).toFixed(0) + 'M';
  console.log(
    `${y}  ${fmt(c.ea_shelter.by_year[i]).padStart(10)}  ${fmt(c.rental_subsidy.by_year[i]).padStart(7)}  ${fmt(c.health_safety_net.by_year[i]).padStart(8)}  ${fmt(c.refugee_immigrant.by_year[i]).padStart(7)}  ${fmt(result.total_by_year[i]).padStart(8)}`
  );
}
