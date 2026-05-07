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
  const usInc = fetchSeries('MEHOINUSA646N');
  console.log(`  MA income: ${maInc.size} years`);
  console.log(`  US income: ${usInc.size} years`);

  console.log('\nLoading + annualizing ZHVI...');
  const zhvi = JSON.parse(fs.readFileSync(path.join(OUT, 'ma-zhvi.json'), 'utf8'));
  const usZhvi = JSON.parse(fs.readFileSync(path.join(OUT, 'us-zhvi.json'), 'utf8'));
  const maHome = annualMeanFromMonthly(zhvi.series);
  const usHome = annualMeanFromMonthly(usZhvi.series);
  console.log(`  MA ZHVI: ${maHome.size} years (${[...maHome.keys()][0]}–${[...maHome.keys()].pop()})`);

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

  const maHome0 = maHome.get(startYear);
  const maInc0 = maInc.get(startYear);
  const usInc0 = usInc.get(startYear);

  const out = {
    meta: {
      generated: new Date().toISOString(),
      sources: {
        ma_home_price: 'Zillow ZHVI (annual mean of monthly), Massachusetts',
        ma_income: 'FRED MEHOINUSMAA646N — Massachusetts median household income, nominal',
        us_income: 'FRED MEHOINUSA646N — US median household income, nominal'
      },
      years: { first: startYear, last: endYear },
      base_year: startYear,
      base_values: { ma_home: maHome0, ma_income: maInc0, us_income: usInc0 }
    },
    years,
    series: {
      ma_home_price: years.map(y => maHome.get(y) ?? null),
      ma_income: years.map(y => maInc.get(y) ?? null),
      us_income: years.map(y => usInc.get(y) ?? null),
      ma_home_index: years.map(y => idx(maHome, y, maHome0)),
      ma_income_index: years.map(y => idx(maInc, y, maInc0)),
      us_income_index: years.map(y => idx(usInc, y, usInc0)),
      price_to_income: years.map(y => {
        const h = maHome.get(y), i = maInc.get(y);
        return h && i ? +(h / i).toFixed(2) : null;
      })
    }
  };

  fs.writeFileSync(path.join(OUT, 'income-divergence.json'), JSON.stringify(out, null, 2));
  console.log(`\nWrote income-divergence.json (${years.length} years)`);

  // summary
  console.log('\nKey values:');
  for (const y of [2000, 2007, 2012, 2020, endYear]) {
    const h = maHome.get(y), i = maInc.get(y);
    if (h && i) console.log(`  ${y}: home $${(h/1000).toFixed(0)}K, income $${(i/1000).toFixed(0)}K, ratio ${(h/i).toFixed(2)}×`);
  }
})().catch(e => { console.error('FAILED:', e.message); process.exit(1); });
