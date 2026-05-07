// process_zillow.js — read raw Zillow state CSVs, filter to Massachusetts,
// emit clean monthly time-series JSON for the dashboard to consume.
//
// Usage: node pipelines/process_zillow.js
//
// Inputs (data/raw/):
//   State_zhvi.csv         — Zillow Home Value Index, all states
//   State_invt_fs.csv      — For-sale inventory, all states
//
// Outputs (data/processed/):
//   ma-zhvi.json           — { series: [{date, value}], meta: {...} }
//   ma-inventory.json      — { series: [{date, value}], meta: {...} }
//   us-zhvi.json           — same shape, US average for comparison

const fs = require('fs');
const path = require('path');

const RAW = path.join(__dirname, '..', 'data', 'raw');
const OUT = path.join(__dirname, '..', 'data', 'processed');
fs.mkdirSync(OUT, { recursive: true });

function parseCsvLine(line) {
  const out = [];
  let cur = '';
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') { inQ = !inQ; continue; }
    if (c === ',' && !inQ) { out.push(cur); cur = ''; continue; }
    cur += c;
  }
  out.push(cur);
  return out;
}

function loadStateCsv(file) {
  const text = fs.readFileSync(path.join(RAW, file), 'utf8');
  const lines = text.split(/\r?\n/).filter(Boolean);
  const header = parseCsvLine(lines[0]);
  const dateCols = header.slice(5);
  const rows = lines.slice(1).map(parseCsvLine);
  return { header, dateCols, rows };
}

function pickSeries({ header, dateCols, rows }, regionName) {
  const row = rows.find(r => r[2] === regionName);
  if (!row) throw new Error(`Region not found: ${regionName}`);
  const series = dateCols.map((d, i) => {
    const v = row[5 + i];
    return { date: d, value: v === '' || v == null ? null : Number(v) };
  }).filter(p => p.value != null && !Number.isNaN(p.value));
  return { region: regionName, series };
}

function avgSeries({ header, dateCols, rows }) {
  // simple unweighted average across states present in the row, per month
  const series = dateCols.map((d, i) => {
    let sum = 0, n = 0;
    for (const r of rows) {
      const v = r[5 + i];
      if (v !== '' && v != null && !Number.isNaN(Number(v))) { sum += Number(v); n++; }
    }
    return { date: d, value: n ? sum / n : null };
  }).filter(p => p.value != null);
  return { region: 'US (state avg)', series };
}

function write(name, payload, sourceUrl) {
  const out = {
    meta: {
      generated: new Date().toISOString(),
      source: sourceUrl,
      points: payload.series.length,
      first: payload.series[0]?.date,
      last: payload.series[payload.series.length - 1]?.date,
      region: payload.region
    },
    series: payload.series
  };
  fs.writeFileSync(path.join(OUT, name), JSON.stringify(out, null, 2));
  console.log(`wrote ${name} | ${out.meta.points} pts | ${out.meta.first} -> ${out.meta.last}`);
}

const zhvi = loadStateCsv('State_zhvi.csv');
const invt = loadStateCsv('State_invt_fs.csv');

write('ma-zhvi.json', pickSeries(zhvi, 'Massachusetts'),
  'https://files.zillowstatic.com/research/public_csvs/zhvi/State_zhvi_uc_sfrcondo_tier_0.33_0.67_sm_sa_month.csv');
write('us-zhvi.json', avgSeries(zhvi),
  'https://files.zillowstatic.com/research/public_csvs/zhvi/State_zhvi_uc_sfrcondo_tier_0.33_0.67_sm_sa_month.csv');
write('ma-inventory.json', pickSeries(invt, 'Massachusetts'),
  'https://files.zillowstatic.com/research/public_csvs/invt_fs/State_invt_fs_uc_sfrcondo_sm_month.csv');
write('us-inventory.json', avgSeries(invt),
  'https://files.zillowstatic.com/research/public_csvs/invt_fs/State_invt_fs_uc_sfrcondo_sm_month.csv');
