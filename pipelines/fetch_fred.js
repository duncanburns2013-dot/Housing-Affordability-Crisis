// fetch_fred.js — pull median household income for MA + US from FRED,
// align with annual ZHVI, index everything to 2000=100, write JSON.
//
// FRED series (annual, nominal):
//   MEHOINUSMAA646N — Massachusetts median household income
//   MEHOINUSA646N    — United States median household income
//
// Output: data/processed/income-divergence.json
//   {
//     meta: { ... },
//     years: [2000, 2001, ...],
//     series: {
//       ma_home_index:    [100, 105, ...],
//       ma_income_index:  [100, 103, ...],
//       us_income_index:  [100, 102, ...],
//       ma_home_price:    [197542, 207000, ...],   // raw $
//       ma_income:        [51028, 52000, ...],
//       us_income:        [...],
//       price_to_income:  [3.87, 3.98, ...]        // raw ratio
//     }
//   }

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'data', 'processed');
const RAW = path.join(ROOT, 'data', 'raw');
fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(RAW, { recursive: true });

// Node's https has TLS handshake trouble with FRED on this box; curl works.
function fetchSeries(id) {
  const url = `https://fred.stlouisfed.org/graph/fredgraph.csv?id=${id}`;
  const file = path.join(RAW, `fred_${id}.csv`);
  execFileSync('curl', ['-sS', '--max-time', '30', '-o', file, url], { stdio: 'inherit' });
  const csv = fs.readFileSync(file, 'utf8');
  const out = new Map();
  const lines = csv.trim().split(/\r?\n/);
  for (let i = 1; i < lines.length; i++) {
    const [date, val] = lines[i].split(',');
    if (val && val !== '.') {
      const year = Number(date.slice(0, 4));
      out.set(year, Number(val));
    }
  }
  return out;
}

function annualMeanFromMonthly(monthlySeries) {
  // monthlySeries: [{date:"YYYY-MM-DD", value:n}, ...]
  const byYear = new Map();
  for (const p of monthlySeries) {
    const y = Number(p.date.slice(0, 4));
    if (!byYear.has(y)) byYear.set(y, []);
    byYear.get(y).push(p.value);
  }
  const out = new Map();
  for (const [y, vals] of byYear) {
    out.set(y, vals.reduce((a, b) => a + b, 0) / vals.length);
  }
  return out;
}

(async () => {
  console.log('Fetching FRED income series...');
  const maInc = fetchSeries('MEHOINUSMAA646N');
  const nhInc = fetchSeries('MEHOINUSNHA646N');
  const usInc = fetchSeries('MEHOINUSA646N');
  console.log(`  MA income: ${maInc.size} years`);
  console.log(`  NH income: ${nhInc.size} years`);
  console.log(`  US income: ${usInc.size} years`);

  console.log('\nLoading + annualizing ZHVI...');
  const zhvi = JSON.parse(fs.readFileSync(path.join(OUT, 'ma-zhvi.json'), 'utf8'));
  const usZhvi = JSON.parse(fs.readFileSync(path.join(OUT, 'us-zhvi.json'), 'utf8'));
  // pull NH ZHVI directly from the State_zhvi.csv we already cached
  const stateCsv = fs.readFileSync(path.join(RAW, 'State_zhvi.csv'), 'utf8').split(/\r?\n/);
  const header = stateCsv[0].split(',');
  const dateCols = header.slice(5);
  const nhRow = stateCsv.slice(1).find(l => {
    const cells = l.split(',');
    return cells[2] === 'New Hampshire';
  });
  const nhMonthly = nhRow ? dateCols.map((d, i) => ({
    date: d,
    value: Number(nhRow.split(',')[5 + i])
  })).filter(p => !Number.isNaN(p.value)) : [];

  const maHome = annualMeanFromMonthly(zhvi.series);
  const usHome = annualMeanFromMonthly(usZhvi.series);
  const nhHome = annualMeanFromMonthly(nhMonthly);
  console.log(`  MA ZHVI: ${maHome.size} years (${[...maHome.keys()][0]}–${[...maHome.keys()].pop()})`);
  console.log(`  NH ZHVI: ${nhHome.size} years`);

  // align on 2000-2024
  const startYear = 2000;
  const endYear = Math.min(
    [...maInc.keys()].pop() ?? 2024,
    [...maHome.keys()].pop() ?? 2024
  );
  const years = [];
  for (let y = startYear; y <= endYear; y++) years.push(y);

  function idx(map, year, base) {
    const v = map.get(year);
    return v == null ? null : (v / base) * 100;
  }
  function ratio(homeMap, incMap, y) {
    const h = homeMap.get(y), i = incMap.get(y);
    return h && i ? +(h / i).toFixed(2) : null;
  }

  const maHome0 = maHome.get(startYear);
  const maInc0 = maInc.get(startYear);
  const usInc0 = usInc.get(startYear);

  const out = {
    meta: {
      generated: new Date().toISOString(),
      sources: {
        ma_home_price: 'Zillow ZHVI (annual mean of monthly), Massachusetts',
        nh_home_price: 'Zillow ZHVI (annual mean of monthly), New Hampshire',
        us_home_price: 'Zillow ZHVI (annual mean of monthly), US 50-state mean',
        ma_income: 'FRED MEHOINUSMAA646N — Massachusetts median household income, nominal',
        nh_income: 'FRED MEHOINUSNHA646N — New Hampshire median household income, nominal',
        us_income: 'FRED MEHOINUSA646N — US median household income, nominal'
      },
      years: { first: startYear, last: endYear },
      base_year: startYear,
      base_values: { ma_home: maHome0, ma_income: maInc0, us_income: usInc0 }
    },
    years,
    series: {
      // raw ($)
      ma_home_price: years.map(y => maHome.get(y) ?? null),
      nh_home_price: years.map(y => nhHome.get(y) ?? null),
      us_home_price: years.map(y => usHome.get(y) ?? null),
      ma_income: years.map(y => maInc.get(y) ?? null),
      nh_income: years.map(y => nhInc.get(y) ?? null),
      us_income: years.map(y => usInc.get(y) ?? null),
      // indexed (2000 = 100) — used by Section 2
      ma_home_index: years.map(y => idx(maHome, y, maHome0)),
      ma_income_index: years.map(y => idx(maInc, y, maInc0)),
      us_income_index: years.map(y => idx(usInc, y, usInc0)),
      // ratios — used by Section 3
      ma_price_to_income: years.map(y => ratio(maHome, maInc, y)),
      nh_price_to_income: years.map(y => ratio(nhHome, nhInc, y)),
      us_price_to_income: years.map(y => ratio(usHome, usInc, y)),
      // Section 2 backwards-compat (used to be "price_to_income")
      price_to_income: years.map(y => ratio(maHome, maInc, y))
    }
  };

  fs.writeFileSync(path.join(OUT, 'income-divergence.json'), JSON.stringify(out, null, 2));
  console.log(`\nWrote income-divergence.json (${years.length} years)`);

  // summary
  console.log('\nKey ratios (price-to-income):');
  console.log('  Year    MA       NH       US      MA-NH gap');
  for (const y of [2000, 2007, 2012, 2020, endYear]) {
    const ma = ratio(maHome, maInc, y);
    const nh = ratio(nhHome, nhInc, y);
    const us = ratio(usHome, usInc, y);
    const gap = (ma != null && nh != null) ? (ma - nh).toFixed(2) : '—';
    console.log(`  ${y}   ${(ma||'—').toFixed?.(2) ?? ma}×    ${(nh||'—').toFixed?.(2) ?? nh}×    ${(us||'—').toFixed?.(2) ?? us}×    ${gap}×`);
  }
})().catch(e => { console.error('FAILED:', e.message); process.exit(1); });
