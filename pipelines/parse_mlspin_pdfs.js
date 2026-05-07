// parse_mlspin_pdfs.js
// Parse MLSPIN 5-year sub-reports (PDF→text via pdftotext) for the 10 towns
// that had no closed-sale activity in the 12-month window.
//
// For each town we compute the 5-year MLSPIN totals across SF + Condo + MF:
//   - total closed units
//   - unit-weighted average sale price
//   - unit-weighted average days on market
// Output: data/processed/ma-towns-5yr-fallback.json
//
// Usage: node pipelines/parse_mlspin_pdfs.js

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const TXT_DIR = path.join(ROOT, 'data', 'raw', 'mlspin_5yr');
const OUT = path.join(ROOT, 'data', 'processed', 'ma-towns-5yr-fallback.json');

// Sold YTD lines look like:
//   2025 2 117 107 $240,000.00 $120.39 $274,900.00 $136.05 $289,900.00 $141.64 84.32% 78.58% 0 1
//   YEAR COUNT DOM TTO  SALE_PRICE   SALE_PSF  LIST_PRICE   LIST_PSF  ORIG_LIST    ORIG_PSF
// 14 fields total. We only need year, count, dom, sale_price.
const SOLD_LINE_RE = /^(20\d\d)\s+(\d+)\s+(\d+)\s+(\d+)\s+\$([\d,]+\.?\d*)\s+\$/;

function parsePdfText(text) {
  const townMatch = text.match(/^([A-Z][A-Za-z .'-]+),\s*MA Area Market Review/m);
  const town = townMatch ? townMatch[1].trim() : 'UNKNOWN';

  // identify section boundaries by the property-type header lines
  // (these appear on their own after the cover sheet and again on later pages)
  const sectionHeaders = ['Single Family', 'Condominium', 'Multi Family'];
  const lines = text.split(/\r?\n/).map(l => l.trim());

  // Track which section we're in based on most-recent header.
  // Some pages repeat section names — that's fine, we just maintain "current".
  let current = null;
  // For each (section, year) we want to capture the Sold YTD row only ONCE.
  const seen = new Set();
  const records = [];   // { section, year, count, dom, salePrice }

  for (const ln of lines) {
    for (const h of sectionHeaders) {
      // header lines like "Single Family", "Condominium", "Multi Family"
      // appear alone or near the top of a section
      if (ln === h || ln === h + ' ') current = h;
    }
    const m = ln.match(SOLD_LINE_RE);
    if (m && current) {
      const year = Number(m[1]);
      const count = Number(m[2]);
      const dom = Number(m[3]);
      const salePrice = Number(m[5].replace(/,/g, ''));
      const key = `${current}|${year}`;
      if (seen.has(key)) continue;        // dedupe across page repeats
      seen.add(key);
      records.push({ section: current, year, count, dom, salePrice });
    }
  }

  // 5-year aggregate (SF + Condo + MF combined, unit-weighted)
  let totalCount = 0, totalSaleWeighted = 0, totalDomWeighted = 0;
  const byType = {};
  for (const r of records) {
    if (!byType[r.section]) byType[r.section] = { count: 0, salePrice: 0, dom: 0 };
    if (r.count > 0) {
      byType[r.section].count += r.count;
      byType[r.section].salePrice += r.count * r.salePrice;
      byType[r.section].dom += r.count * r.dom;
      totalCount += r.count;
      totalSaleWeighted += r.count * r.salePrice;
      totalDomWeighted += r.count * r.dom;
    }
  }
  for (const k in byType) {
    if (byType[k].count > 0) {
      byType[k].avgSalePrice = Math.round(byType[k].salePrice / byType[k].count);
      byType[k].avgDom = Math.round(byType[k].dom / byType[k].count);
    } else {
      byType[k].avgSalePrice = null;
      byType[k].avgDom = null;
    }
    delete byType[k].salePrice; // keep the result clean
    delete byType[k].dom;
  }

  return {
    town,
    fiveYearWindow: '2022 YTD – 2026 YTD (May 7)',
    fiveYearTotalCount: totalCount,
    fiveYearAvgSalePrice: totalCount ? Math.round(totalSaleWeighted / totalCount) : null,
    fiveYearAvgDom: totalCount ? Math.round(totalDomWeighted / totalCount) : null,
    byType,
    yearRecords: records
  };
}

const files = fs.readdirSync(TXT_DIR).filter(f => f.endsWith('.plain.txt'));
const byTown = new Map();

for (const f of files) {
  const text = fs.readFileSync(path.join(TXT_DIR, f), 'utf8');
  const parsed = parsePdfText(text);
  // de-dupe by town (we have 11 PDFs, 10 unique towns — New Ashford appears twice)
  if (!byTown.has(parsed.town)) byTown.set(parsed.town, parsed);
}

const towns = [...byTown.values()].sort((a, b) => a.town.localeCompare(b.town));
const out = {
  meta: {
    generated: new Date().toISOString(),
    source: 'MLSPIN 5-year sub-reports (manually exported by Duncan Burns)',
    note: 'For the 10 towns whose API pull returned 0 closed sales in trailing 12 months, this provides a 5-year MLSPIN total + unit-weighted averages across SF + Condo + Multi-Family.',
    towns: towns.length
  },
  towns
};

fs.writeFileSync(OUT, JSON.stringify(out, null, 2));
console.log(`Wrote ${OUT} — ${towns.length} towns`);
console.log('');
console.log('Town'.padEnd(22) + '5yr n  avg sale   avg DOM');
console.log('-'.repeat(54));
for (const t of towns) {
  console.log(
    t.town.padEnd(22) +
    String(t.fiveYearTotalCount).padStart(5) + '  ' +
    (t.fiveYearAvgSalePrice ? '$' + t.fiveYearAvgSalePrice.toLocaleString() : '—').padStart(10) + '  ' +
    String(t.fiveYearAvgDom ?? '—').padStart(7)
  );
}
