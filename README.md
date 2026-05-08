# The Massachusetts Affordability Crisis

A data investigation arguing that Massachusetts faces an *affordability* crisis, not a *housing* crisis — and that government spending has shifted decisively toward subsidizing demand for existing units rather than building new ones, while the higher-earning residents bleed out to other states.

### **→ Live site: [duncanburns2013-dot.github.io/Housing-Affordability-Crisis](https://duncanburns2013-dot.github.io/Housing-Affordability-Crisis/)**

## Argument structure (six Socratic sections)

1. **Is this a shortage, or something else?** — vacancy, inventory, rate-lock dynamics, the 22-day median DOM punchline
2. **1.5. The map** — 2D choropleth of all 351 MA municipalities, hover for stats, four metric toggles, vivid MA palette
3. **If supply is intact, why have prices climbed?** — price-to-income divergence indexed to 2000 with QE/COVID era bands, $130K gap reveal
4. **Is this just rates and COVID, or local policy?** — MA vs NH vs US ratio comparison; shows MA structural premium has been +1.2× to +2.3× over NH the entire 25-year window despite incomes being tied or NH-higher for most of it
5. **Is public spending relieving or inflating prices?** — CTHRU checkbook export; demand-side spending grew 46× FY22→FY24 while supply spending stayed flat; reader-controlled cost-per-beneficiary slider derives implied caseload
6. **What are residents doing about it?** — IRS SOI migration; net 28K residents and $4B AGI walking out per year, leavers earn $140K avg vs $114K MA median
7. **So what changes the trajectory?** — verdict, six-card tally, anticipated objections + data against them

## Stack

- Static HTML / vanilla JS / CSS — deployed via GitHub Pages
- [ECharts 5](https://echarts.apache.org/) for time-series and stacked-area charts
- [Deck.gl 9](https://deck.gl/) for the 351-town 2D choropleth map
- [GSAP + ScrollTrigger](https://gsap.com/scroll/) for scroll choreography
- IntersectionObserver for step-by-step chart annotation
- Node-only ETL pipelines (no Python, no virtualenvs)

## Data sources

| Source | What it gives us | Section |
|---|---|---|
| Zillow Research (state CSVs) | ZHVI, for-sale inventory | 1, 2, 3 |
| MLSPIN | 61,058 closed sales last 12mo, town-level aggregates | 1, 1.5 |
| MLSPIN 5-year sub-reports (PDF) | Backfill for 3 Berkshire towns missing from 12mo window | 1.5 |
| MassDOT Boundaries/Towns ArcGIS | 351 municipal polygons + median household income | 1.5 |
| FRED `MEHOINUS{MA,NH,US}A646N` | State-level median household income, annual | 2, 3 |
| CTHRU checkbook (Comptroller of the Commonwealth) | 52,881 transaction records, $2.68B in housing payments | 4 |
| IRS SOI state-to-state migration | Net domestic migration + AGI flows by state pair | 5 |

## Repo layout

```
.
├── index.html                          single-page app, six scroll sections
├── css/
│   ├── main.css                        theme, hero, nav, chart frame, MA palette
│   ├── sections.css                    sticky-chart scrollytelling layout
│   ├── map.css                         Section 1.5 map + legend + leaderboard
│   ├── section4.css                    Section 4 spending chart + slider panel
│   └── section6.css                    Section 6 tally cards + objections + verdict
├── js/
│   ├── main.js                         progress bar, scroll observers, ECharts theme
│   └── sections/
│       ├── 01-shortage.js              inventory chart with stepwise reveal
│       ├── 01b-map.js                  Deck.gl town choropleth
│       ├── 02-divergence.js            indexed price/income lines + cranberry wedge
│       ├── 03-macro.js                 MA vs NH vs US ratios with QE/COVID bands
│       ├── 04-spending.js              CTHRU stacked area + cost-per-beneficiary slider
│       └── 05-migration.js             net migration time-series + destination bars
├── data/
│   ├── raw/                            raw downloads (Zillow CSVs, FRED, IRS, CTHRU exports)
│   └── processed/                      dashboard-ready JSON (ships with repo)
├── pipelines/
│   ├── fetch_zillow.sh + process_zillow.js
│   ├── fetch_mlspin.js + probe_mlspin.js
│   ├── fetch_towns.js + parse_mlspin_pdfs.js
│   ├── fetch_fred.js
│   ├── fetch_cthru.js (legacy Socrata pull)
│   ├── process_cthru_checkbook.js (current — uses local CSV exports)
│   └── process_irs_migration.js
└── README.md
```

## Refreshing data

```bash
# Zillow (state ZHVI + inventory) — keep current
bash pipelines/fetch_zillow.sh
node pipelines/process_zillow.js

# FRED income series for MA, NH, US
node pipelines/fetch_fred.js

# IRS migration (annual; new file released ~2 years after tax year)
# manually pull stateoutflow{YY}{YY+1}.csv + stateinflow{YY}{YY+1}.csv from
# https://www.irs.gov/statistics/soi-tax-stats-migration-data
# drop into data/raw/irs_migration/, then:
node pipelines/process_irs_migration.js

# MLSPIN listings (requires .env with API token)
node pipelines/fetch_mlspin.js
node pipelines/fetch_towns.js
node pipelines/parse_mlspin_pdfs.js  # if new MLSPIN sub-report PDFs added

# CTHRU spending — manually export checkbook CSVs from the public portal
# (cthru.macomptroller.org) and drop into data/raw/cthru_checkbook/, then:
node pipelines/process_cthru_checkbook.js
```

## Local preview

```bash
npx serve .
# open http://localhost:3000
```

## Methodological commitments

- **Every chart links its source.** No "trust me" numbers.
- **The cost-per-beneficiary slider in Section 4** makes the spending the unmovable input and the implied caseload a reader-derived output. Argue your assumption publicly.
- **Counter-arguments are pre-empted.** Section 6 lists the five most common objections and shows the data against each.
- **CTHRU paid amounts are conservative.** Enacted budgets, federal pass-throughs, and operator subgrants flow through other channels and run higher. The growth shape and program-mix shift are reliable.
