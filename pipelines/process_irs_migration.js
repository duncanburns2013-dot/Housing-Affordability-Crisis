// process_irs_migration.js
// Reads IRS SOI state-to-state migration files (downloaded from
// www.irs.gov/statistics/soi-tax-stats-migration-data) and computes
// MA net domestic migration + AGI flow + top destinations per year.
//
// Inputs : data/raw/irs_migration/state{outflow,inflow}{YYYY}.csv
// Output : data/processed/ma-migration.json

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SRC  = path.join(ROOT, 'data', 'raw', 'irs_migration');
const OUT  = path.join(ROOT, 'data', 'processed', 'ma-migration.json');

const MA_FIPS = '25';

// pairs we have (e.g., "1718" = tax year 2017 vs 2018)
const PAIRS = ['1718', '1819', '1920', '2021', '2122', '2223'];

function readCsv(file) {
  const text = fs.readFileSync(file, 'utf8');
  const lines = text.split(/\r?\n/);
  const out = [];
  for (let i = 1; i < lines.length; i++) {
    const ln = lines[i].trim();
    if (!ln) continue;
    const cells = ln.split(',');
    out.push(cells);
  }
  return out;
}

const yearsPair = PAIRS.map(p => ({
  pair: p,
  // The y1 → y2 pair: tax year y1 vs y2. We label the chart year as y2 (the year
  // people moved INTO their new state).
  label: '20' + p.slice(2),
  fileOut: path.join(SRC, `stateoutflow${p}.csv`),
  fileIn:  path.join(SRC, `stateinflow${p}.csv`)
}));

const result = {
  meta: {
    generated: new Date().toISOString(),
    source: 'IRS SOI state-to-state migration data (https://www.irs.gov/statistics/soi-tax-stats-migration-data)',
    note: 'n1 = number of returns (households), n2 = exemptions (~people), AGI in $1000s. Domestic-only (excludes foreign migration).',
    pairs: PAIRS
  },
  years: yearsPair.map(p => p.label),
  ma_outflow_returns: [],
  ma_outflow_people: [],
  ma_outflow_agi:    [],
  ma_inflow_returns: [],
  ma_inflow_people:  [],
  ma_inflow_agi:     [],
  ma_net_returns:    [],
  ma_net_people:     [],
  ma_net_agi:        [],
  top_destinations:  {}, // by year — list of {state, returns, people, agi, net_returns, net_people, net_agi}
  by_state_latest: []    // every state, net direction, for the latest year
};

for (const y of yearsPair) {
  if (!fs.existsSync(y.fileOut) || !fs.existsSync(y.fileIn)) {
    console.warn(`  missing files for ${y.pair}, skipping`);
    continue;
  }
  const outflowRows = readCsv(y.fileOut);
  const inflowRows  = readCsv(y.fileIn);

  // OUTFLOW: rows where y1_statefips = MA → destination y2
  // pull MA Total Migration-US row (y2 = 97)
  const maOutTotalUS = outflowRows.find(r => r[0] === MA_FIPS && r[1] === '97');
  // INFLOW file structure: y2,y1,y1_state,name,n1,n2,AGI
  // pull row where y2=MA and y1=97 (US total inflow)
  const maInTotalUS = inflowRows.find(r => r[0] === MA_FIPS && r[1] === '97');

  if (!maOutTotalUS || !maInTotalUS) {
    console.warn(`  ${y.pair}: missing MA totals row`);
    continue;
  }

  const outR = +maOutTotalUS[4], outP = +maOutTotalUS[5], outA = +maOutTotalUS[6];
  const inR  = +maInTotalUS[4],  inP  = +maInTotalUS[5],  inA  = +maInTotalUS[6];

  const i = result.years.indexOf(y.label);
  result.ma_outflow_returns[i] = outR;
  result.ma_outflow_people[i]  = outP;
  result.ma_outflow_agi[i]     = outA;
  result.ma_inflow_returns[i]  = inR;
  result.ma_inflow_people[i]   = inP;
  result.ma_inflow_agi[i]      = inA;
  result.ma_net_returns[i]     = inR - outR;
  result.ma_net_people[i]      = inP - outP;
  result.ma_net_agi[i]         = inA - outA;

  // Per-state flows: build a map for this year of every state Net to MA
  const stateFlows = new Map(); // dest_abbr -> { out:{r,p,a}, in:{r,p,a} }
  // outflow rows: y1=25 → y2 (other states)
  for (const r of outflowRows) {
    if (r[0] !== MA_FIPS) continue;
    const dest = r[2];
    if (!dest || dest === 'MA' || /Total|Non/i.test(r[3] || '')) continue;
    const cur = stateFlows.get(dest) || { name: r[3], out: {r:0,p:0,a:0}, in: {r:0,p:0,a:0} };
    cur.out.r += +r[4]; cur.out.p += +r[5]; cur.out.a += +r[6];
    stateFlows.set(dest, cur);
  }
  // inflow rows: y2=25 ← y1 (other states); columns same shape but y2,y1 swapped in header
  for (const r of inflowRows) {
    if (r[0] !== MA_FIPS) continue;
    const orig = r[2];
    if (!orig || orig === 'MA' || /Total|Non/i.test(r[3] || '')) continue;
    const cur = stateFlows.get(orig) || { name: r[3], out: {r:0,p:0,a:0}, in: {r:0,p:0,a:0} };
    cur.in.r += +r[4]; cur.in.p += +r[5]; cur.in.a += +r[6];
    stateFlows.set(orig, cur);
  }

  // collect, compute net
  const flows = [];
  for (const [abbr, v] of stateFlows) {
    flows.push({
      state: abbr,
      name: v.name,
      out_returns: v.out.r, out_people: v.out.p, out_agi: v.out.a,
      in_returns:  v.in.r,  in_people:  v.in.p,  in_agi:  v.in.a,
      net_returns: v.in.r - v.out.r,
      net_people:  v.in.p - v.out.p,
      net_agi:     v.in.a - v.out.a
    });
  }

  // top 8 net OUTFLOW destinations (most-negative net for MA)
  const sorted = flows.slice().sort((a, b) => a.net_people - b.net_people);
  result.top_destinations[y.label] = sorted.slice(0, 8);

  // store full flows for the latest year for the bar chart
  if (y.pair === PAIRS[PAIRS.length - 1]) {
    result.by_state_latest = sorted;
  }
}

fs.writeFileSync(OUT, JSON.stringify(result, null, 2));

// summary print
console.log('\nMA domestic net migration summary (negative = net OUT):');
console.log('Year    Net returns   Net people    Net AGI ($M)');
for (let i = 0; i < result.years.length; i++) {
  const y = result.years[i];
  const r = result.ma_net_returns[i];
  const p = result.ma_net_people[i];
  const a = result.ma_net_agi[i];
  if (r == null) continue;
  console.log(`${y}    ${r.toLocaleString().padStart(11)}   ${p.toLocaleString().padStart(11)}   ${(a / 1000).toFixed(0).padStart(11)}`);
}
console.log(`\nTop 5 states by net OUTFLOW for ${result.years[result.years.length - 1]}:`);
for (const f of result.top_destinations[result.years[result.years.length - 1]].slice(0, 5)) {
  console.log(`  ${f.name.padEnd(18)}  -${(-f.net_people).toLocaleString()} people  -$${(-f.net_agi / 1000).toFixed(0)}M AGI`);
}

console.log(`\nWrote ${OUT}`);
